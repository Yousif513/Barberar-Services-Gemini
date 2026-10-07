import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// R32 (SQL part): the registered name is compared with the business name; a mismatch needs an administrator; approval needs a verified or
// manually reviewed CR when the application states one.

let db;
let admin;
let stranger;
let agreement;
const owner = ROLES.user(SEED.owner1);
const service = ROLES.service;

const match = async (registered, ar, en) => (await sys(db, `select cr_names_match($1, $2, $3) m`, [registered, ar, en]))[0].m;
const newApplication = async ({ cr = "1010202020", en = "Malqa Cuts", ar = "قصات الملقا" } = {}) => {
  const applicant = await createUser(db);
  await as(db, ROLES.user(applicant), `select record_agreement_acceptance('provider_agreement', $1)`, [agreement.version]);
  const [row] = await as(db, ROLES.user(applicant),
    `insert into provider_applications (user_id, business_name_en, business_name_ar, contact_email, contact_phone, city, district, address_text, latitude, longitude, cr_number, tax_number)
     values ($1, $2, $3, 'a@b.sa', '+966500001234', 'Riyadh', 'Al Malqa', 'King Fahd Rd', 24.8, 46.6, $4, null) returning id`, [applicant, en, ar, cr]);
  return { id: row.id, applicant: ROLES.user(applicant) };
};
const check = (id, payload, active = true, cr = "1010202020") =>
  as(db, service, `select record_wathq_application_check($1, $2, $3, $4::jsonb) r`, [id, cr, active, JSON.stringify(payload)]).then((r) => r[0].r);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db));
  agreement = (await sys(db, `select id, version, status from legal_agreements where agreement_key = 'provider_agreement' order by created_at limit 1`))[0];
  if (agreement.status === "draft") await as(db, admin, `select admin_publish_agreement($1, 'Reviewed by counsel for the Wathq tests')`, [agreement.id]);
});

describe("name comparison", () => {
  it("matches the registered name with the business name across spelling and legal-form differences", async () => {
    assert.equal(await match("Rose Salon Trading Est.", "صالون الورد", "Rose Salon"), true);
    assert.equal(await match("مؤسسة الورد للتجميل", "الورد", null), true);
    assert.equal(await match("احمد للحلاقة", "أحمد للحلاقة", null), true, "alef forms are one letter");
    assert.equal(await match("Rose Salon", "صالون الورد", "ROSE  SALON"), true);
    assert.equal(await match("Blue Cut Company", "صالون الورد", "Rose Salon"), false);
    assert.equal(await match("Ab", "صالون الورد", "Rose Salon"), false, "a very short registered name cannot match by containment");
    assert.equal(await match(null, "صالون الورد", "Rose Salon"), false);
    assert.equal(await match("", null, null), false);
  });
});

describe("provider CR check", () => {
  const record = (name) => as(db, service, `select record_wathq_cr_verification($1, '1010202020', true, $2::jsonb) r`, [SEED.provider1, JSON.stringify(name === undefined ? {} : { crName: name })]).then((r) => r[0].r);
  it("verifies only when the registered name is the business, stores the comparison, and flags a mismatch", async () => {
    const [{ business_name_en: en }] = await sys(db, `select business_name_en from providers where id = $1`, [SEED.provider1]);
    const ok = await record(`${en} Trading Est.`);
    assert.deepEqual([ok.status, ok.name_match], ["verified", true]);
    const mismatch = await record("Completely Different Holding Company");
    assert.deepEqual([mismatch.status, mismatch.name_match], ["name_mismatch", false]);
    const [row] = await sys(db, `select cr_verification_status s, cr_verified_at, cr_wathq_data d from providers where id = $1`, [SEED.provider1]);
    assert.equal(row.s, "name_mismatch");
    assert.equal(row.cr_verified_at, null);
    assert.equal(row.d.name_match, false);
    assert.equal(row.d.registered_name, "Completely Different Holding Company");
    assert.equal((await record(undefined)).status, "name_mismatch", "a response without a registered name cannot verify");
    const inactive = await as(db, service, `select record_wathq_cr_verification($1, '1010202020', false, '{}'::jsonb) r`, [SEED.provider1]);
    assert.equal(inactive[0].r.status, "rejected");
  });

  it("is writable by the service role only", async () => {
    for (const actor of [ROLES.anon, stranger, owner, admin]) {
      await expectError(as(db, actor, `select record_wathq_cr_verification($1, '1010202020', true, '{}'::jsonb)`, [SEED.provider1]), /permission denied|Service role required/i);
    }
  });
});

describe("application CR check and approval", () => {
  it("refuses approval until the CR is verified or manually reviewed, then approves and hands the result to the provider", async () => {
    const { id } = await newApplication();
    await expectError(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [id]), /must be verified.*unchecked/);
    const mismatch = await check(id, { crName: "Somebody Else Trading" });
    assert.deepEqual([mismatch.status, mismatch.name_match], ["name_mismatch", false]);
    await expectError(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [id]), /name_mismatch/);
    await as(db, admin, `select admin_confirm_application_cr($1, 'Registration certificate reviewed; trade name differs but the owner matches')`, [id]);
    const approved = (await as(db, admin, `select approve_provider_application($1, 'Documents checked') r`, [id]))[0].r;
    const [provider] = await sys(db, `select cr_verification_status s, cr_verified_at is not null as stamped, cr_wathq_data d from providers where id = $1`, [approved.provider_id]);
    assert.deepEqual([provider.s, provider.stamped, provider.d.source], ["manually_reviewed", true, "manual_admin_review"]);
  });

  it("approves a verified application and does not gate an application without a CR number", async () => {
    const verified = await newApplication({ en: "Najd Barber", ar: "حلاق نجد" });
    assert.equal((await check(verified.id, { crName: "Najd Barber Establishment" })).status, "verified");
    const approved = (await as(db, admin, `select approve_provider_application($1, 'Documents checked') r`, [verified.id]))[0].r;
    assert.equal((await sys(db, `select cr_verification_status s from providers where id = $1`, [approved.provider_id]))[0].s, "verified");
    const freelancer = await newApplication({ cr: null, en: "Solo Stylist", ar: "مصففة" });
    await as(db, admin, `select approve_provider_application($1, 'Freelancer without a CR')`, [freelancer.id]);
  });

  it("does not let the applicant write the status, and resets it when the CR number or name changes", async () => {
    const { id, applicant } = await newApplication({ en: "Edit Cuts", ar: "قصات التعديل" });
    await as(db, applicant, `update provider_applications set cr_verification_status = 'verified' where id = $1`, [id]);
    assert.equal((await sys(db, `select cr_verification_status s from provider_applications where id = $1`, [id]))[0].s, "unchecked");
    await check(id, { crName: "Edit Cuts" });
    await sys(db, `update provider_applications set cr_number = '1010303030' where id = $1`, [id]);
    assert.equal((await sys(db, `select cr_verification_status s from provider_applications where id = $1`, [id]))[0].s, "unchecked");
  });

  it("restricts the check to the service role and the confirmation to administrators, and validates input", async () => {
    const { id } = await newApplication({ en: "Guard Cuts", ar: "قصات الحارس" });
    for (const actor of [ROLES.anon, stranger, owner, admin]) {
      await expectError(as(db, actor, `select record_wathq_application_check($1, '1010202020', true, '{}'::jsonb)`, [id]), /permission denied|Service role required/i);
    }
    for (const actor of [ROLES.anon, stranger, owner]) {
      await expectError(as(db, actor, `select admin_confirm_application_cr($1, 'Not an administrator')`, [id]), /permission denied|Administrator role/i);
    }
    await expectError(check(id, { crName: "Guard Cuts" }, true, "1010999999"), /not the number on the application/);
    await expectError(as(db, admin, `select admin_confirm_application_cr($1, 'x')`, [id]), /Record what was checked/);
    await expectError(as(db, admin, `select admin_confirm_application_cr($1, 'Unknown application')`, [SEED.provider1]), /not found/i);
  });
});
