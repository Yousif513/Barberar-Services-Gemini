import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED } from "./harness.mjs";

// ADM1 item 1: the administrator's application list carries the CR check state that approve_provider_application gates on.

let db;
let admin;
let stranger;
let applicationId;
const service = ROLES.service;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db));
  const applicant = await createUser(db);
  const agreement = (await as(db, ROLES.service, `select id, version, status from legal_agreements where agreement_key = 'provider_agreement' order by created_at limit 1`))[0];
  if (agreement.status === "draft") await as(db, admin, `select admin_publish_agreement($1, 'Reviewed by counsel for the view tests')`, [agreement.id]);
  await as(db, ROLES.user(applicant), `select record_agreement_acceptance('provider_agreement', $1)`, [agreement.version]);
  const [row] = await as(db, ROLES.user(applicant),
    `insert into provider_applications (user_id, business_name_en, business_name_ar, contact_email, contact_phone, city, district, address_text, latitude, longitude, cr_number, tax_number)
     values ($1, 'Dune Cuts', 'قصات الكثبان', 'a@b.sa', '+966500001234', 'Riyadh', 'Al Malqa', 'King Fahd Rd', 24.8, 46.6, '1010202020', null) returning id`, [applicant]);
  applicationId = row.id;
});

describe("admin_provider_applications_view carries the CR check", () => {
  // GOV-2 (Q4): a console session reads applications through the audited admin_list_provider_applications, not the view.
  const read = (actor) => (actor === admin
    ? as(db, actor, `select admin_list_provider_applications(null, 500, 0, null) r`).then((rows) =>
        rows[0].r.rows.filter((row) => row.id === applicationId).map((row) => ({ s: row.cr_verification_status, d: row.cr_check_data })))
    : as(db, actor, `select cr_verification_status s, cr_check_data d from admin_provider_applications_view where id = $1`, [applicationId]));

  it("starts unchecked and follows the recorded Wathq outcome, including the registered name", async () => {
    assert.equal((await read(admin))[0].s, "unchecked");
    await as(db, service, `select record_wathq_application_check($1, '1010202020', true, $2::jsonb)`, [applicationId, JSON.stringify({ crName: "Another Company" })]);
    const [row] = await read(admin);
    assert.equal(row.s, "name_mismatch");
    assert.equal(row.d.registered_name, "Another Company");
    assert.equal(row.d.name_match, false);
  });

  it("shows another person's application to nobody but the administrator", async () => {
    assert.deepEqual(await read(stranger), []);
    assert.deepEqual(await read(ROLES.anon).catch(() => []), []);
  });
});
