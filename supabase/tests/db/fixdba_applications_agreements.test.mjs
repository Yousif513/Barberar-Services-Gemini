import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// D-07 (no default branch location), D-25 (one open application, https only), D-12 (no submission or approval without a
// published and accepted provider agreement), D-24 (agreement evidence cannot be forged or rewritten).

let db;
let admin;
let customer;
let applicantId;
let applicant;
let agreementId;
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const message = (promise) => promise.then(() => "ok", (error) => error.message);

const application = (overrides = {}) => {
  const f = { business_name_en: "Jeddah Studio", business_name_ar: "استوديو جدة", contact_email: "owner@jeddah.test", contact_phone: "+966501234567",
    city: "Jeddah", district: "Al Rawdah", address_text: "Prince Sultan Rd", ...overrides };
  return `insert into provider_applications (user_id, ${Object.keys(f).join(", ")}) values ($1, ${Object.keys(f).map((_, i) => `$${i + 2}`).join(", ")}) returning *`;
};
const applicationArgs = (overrides = {}, userId = applicantId) => [userId, ...Object.values({ business_name_en: "Jeddah Studio", business_name_ar: "استوديو جدة",
  contact_email: "owner@jeddah.test", contact_phone: "+966501234567", city: "Jeddah", district: "Al Rawdah", address_text: "Prince Sultan Rd", ...overrides })];
const submit = (user, overrides = {}, userId = applicantId) => as(db, user, application(overrides), applicationArgs(overrides, userId)).then((rows) => rows[0]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(SEED.customer);
  applicantId = await createUser(db, { role: "customer" });
  applicant = ROLES.user(applicantId);
  agreementId = (await sys(db, `select id from legal_agreements where agreement_key = 'provider_agreement' order by created_at limit 1`))[0].id;
});

describe("D-12: nothing is submitted or approved while the provider agreement is unpublished", () => {
  it("is still a draft in the migrated state, so an applicant cannot submit", async () => {
    assert.equal((await sys(db, `select status from legal_agreements where id = $1`, [agreementId]))[0].status, "draft");
    assert.equal(await code(submit(applicant)), "22023");
  });
  it("refuses to approve an application while no provider agreement is published", async () => {
    const other = await createUser(db, { role: "customer" });
    const id = (await sys(db, application({ latitude: 21.5433, longitude: 39.1728 }), applicationArgs({ latitude: 21.5433, longitude: 39.1728 }, other)))[0].id;
    assert.match(await message(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [id])), /No provider agreement is published/);
    assert.equal((await sys(db, `select status from provider_applications where id = $1`, [id]))[0].status, "pending");
  });
});

describe("D-25 / D-07 / D-12: the application itself", () => {
  before(async () => {
    await as(db, admin, `select admin_publish_agreement($1, 'Reviewed by counsel')`, [agreementId]);
  });
  it("stamps the agreement version it was submitted under and ignores review fields supplied by the applicant", async () => {
    const row = await submit(applicant, { admin_notes: "pre-approved", rejection_reason: "x", reviewed_at: "2020-01-01T00:00:00Z", agreed_at: "2020-01-01T00:00:00Z" });
    assert.equal(row.status, "pending");
    assert.equal(row.agreement_id, agreementId);
    assert.ok(row.agreement_version);
    assert.equal(row.admin_notes, null);
    assert.equal(row.rejection_reason, null);
    assert.equal(row.reviewed_at, null);
    assert.equal(row.agreed_at, null, "nothing accepted yet, and the applicant cannot claim it");
  });
  it("keeps the branch location empty unless one is supplied (no default Riyadh centre)", async () => {
    const row = (await sys(db, `select latitude, longitude from provider_applications where user_id = $1`, [applicantId]))[0];
    assert.equal(row.latitude, null);
    assert.equal(row.longitude, null);
    const city = (await sys(db, `select column_default from information_schema.columns where table_name = 'provider_applications' and column_name in ('city', 'latitude', 'longitude') and column_default is not null`));
    assert.equal(city.length, 0, "no column default is left to invent a place");
  });
  it("accepts only one open application per applicant", async () => {
    assert.equal(await code(submit(applicant, { business_name_en: "Second Studio" })), "23505");
    assert.equal((await sys(db, `select count(*)::int c from provider_applications where user_id = $1`, [applicantId]))[0].c, 1);
  });
  it("accepts a trade licence link only as https", async () => {
    const other = await createUser(db, { role: "customer" });
    for (const bad of ["javascript:alert(1)", "http://plain.example/licence.pdf", "data:text/html,x", "https://exa mple.com/x", "ftp://host/x", "https://"]) {
      assert.equal(await code(submit(ROLES.user(other), { trade_license_url: bad }, other)), "23514", bad);
    }
    assert.equal((await submit(ROLES.user(other), { trade_license_url: "https://files.example.com/licence.pdf" }, other)).trade_license_url, "https://files.example.com/licence.pdf");
  });
  it("refuses impossible or half-given coordinates", async () => {
    const other = await createUser(db, { role: "customer" });
    for (const bad of [{ latitude: 91, longitude: 39 }, { latitude: 21, longitude: 181 }, { latitude: 21 }, { longitude: 39 }]) {
      assert.equal(await code(submit(ROLES.user(other), bad, other)), "23514", JSON.stringify(bad));
    }
  });
  it("cannot be inserted for someone else or already approved", async () => {
    const other = await createUser(db, { role: "customer" });
    assert.equal(await code(submit(applicant, {}, other)), "42501");
    assert.equal(await code(as(db, ROLES.anon, application(), applicationArgs())), "42501");
  });
});

describe("D-12 + D-07: approval needs the acceptance and a real location", () => {
  let appId;
  before(async () => {
    appId = (await sys(db, `select id from provider_applications where user_id = $1`, [applicantId]))[0].id;
  });
  it("refuses while the applicant has not accepted the published agreement", async () => {
    assert.match(await message(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [appId])), /has not accepted the current provider agreement/);
  });
  it("records the acceptance (idempotently) and stamps it on the open application", async () => {
    const version = (await sys(db, `select version from legal_agreements where id = $1`, [agreementId]))[0].version;
    const first = (await as(db, applicant, `select record_agreement_acceptance('provider_agreement', $1, 'become_provider_form') id`, [version]))[0].id;
    const again = (await as(db, applicant, `select record_agreement_acceptance('provider_agreement', $1, 'become_provider_form') id`, [version]))[0].id;
    assert.equal(first, again);
    assert.equal((await sys(db, `select count(*)::int c from agreement_acceptances where user_id = $1`, [applicantId]))[0].c, 1);
    assert.ok((await sys(db, `select agreed_at from provider_applications where id = $1`, [appId]))[0].agreed_at);
  });
  it("refuses without a branch location, then approves with the location the applicant gave", async () => {
    assert.match(await message(as(db, admin, `select approve_provider_application($1, 'Documents checked')`, [appId])), /location/);
    await as(db, admin, `update provider_applications set latitude = 21.5433, longitude = 39.1728 where id = $1`, [appId]);
    const r = (await as(db, admin, `select approve_provider_application($1, 'Documents checked') r`, [appId]))[0].r;
    assert.equal(r.status, "approved");
    const branch = (await sys(db, `select latitude::float8 lat, longitude::float8 lng, city from branches where id = $1`, [r.branch_id]))[0];
    assert.deepEqual(branch, { lat: 21.5433, lng: 39.1728, city: "Jeddah" }, "the branch is where the applicant said, not at the Riyadh centre");
  });
  it("is refused for every non-administrator", async () => {
    for (const role of [ROLES.anon, customer, applicant, ROLES.user(SEED.owner1), ROLES.service]) {
      assert.notEqual(await code(as(db, role, `select approve_provider_application($1, 'Documents checked')`, [appId])), "ok");
    }
  });
  it("closes the application after approval so a new one may be opened", async () => {
    assert.equal((await submit(applicant, { business_name_en: "Second branch company" })).status, "pending");
  });
});

describe("D-24: agreement evidence", () => {
  it("cannot be written directly: not an insert, not an update, not with a back-dated time", async () => {
    for (const user of [customer, applicant, admin]) {
      assert.equal(await code(as(db, user, `insert into agreement_acceptances (user_id, agreement_id, agreement_key, version, accepted_at)
        select $1, id, agreement_key, version, now() - interval '400 days' from legal_agreements where id = $2`, [user.sub, agreementId])), "42501");
    }
    assert.equal(await code(as(db, applicant, `update agreement_acceptances set accepted_at = now() - interval '1 year'`)), "42501");
    assert.equal(await code(sys(db, `update agreement_acceptances set accepted_at = now() - interval '1 year'`)), "22023", "even the service role cannot rewrite evidence");
  });
  it("cannot be recorded for an unpublished version, with an odd method, or anonymously", async () => {
    const draft = (await sys(db, `select agreement_key, version from legal_agreements where status = 'draft' limit 1`))[0];
    assert.equal(await code(as(db, customer, `select record_agreement_acceptance($1, $2)`, [draft.agreement_key, draft.version])), "22023");
    const version = (await sys(db, `select version from legal_agreements where id = $1`, [agreementId]))[0].version;
    assert.equal(await code(as(db, customer, `select record_agreement_acceptance('provider_agreement', $1, 'x y; drop')`, [version])), "22023");
    assert.equal(await code(as(db, ROLES.anon, `select record_agreement_acceptance('provider_agreement', $1)`, [version])), "42501");
  });
  it("is readable by its owner and by administrators only", async () => {
    const version = (await sys(db, `select version from legal_agreements where id = $1`, [agreementId]))[0].version;
    await as(db, customer, `select record_agreement_acceptance('provider_agreement', $1)`, [version]);
    const count = async (user) => (await as(db, user, `select count(*)::int c from agreement_acceptances`))[0].c;
    assert.equal(await count(customer), 1);
    assert.ok((await count(admin)) >= 2);
    assert.equal(await count(ROLES.user(SEED.owner2)), 0);
  });
  it("lets nobody rewrite or delete a published version, while publishing a new one still archives the old", async () => {
    assert.equal(await code(as(db, admin, `update legal_agreements set content_en = 'rewritten' where id = $1`, [agreementId])), "22023");
    assert.equal(await code(as(db, admin, `update legal_agreements set version = 'v9' where id = $1`, [agreementId])), "22023");
    assert.equal(await code(as(db, admin, `update legal_agreements set status = 'draft' where id = $1`, [agreementId])), "22023");
    assert.equal(await code(as(db, admin, `delete from legal_agreements where id = $1`, [agreementId])), "22023");
    assert.equal((await as(db, customer, `with u as (update legal_agreements set content_en = 'x' where id = $1 returning 1) select count(*)::int c from u`, [agreementId]))[0].c, 0, "a customer's update touches no row");
    const draftId = (await as(db, admin, `insert into legal_agreements (agreement_key, title_en, title_ar, version, content_en, content_ar)
      values ('provider_agreement', 'Provider agreement', 'اتفاقية', 'v2.0', 'second text', 'نص ثان') returning id`))[0].id;
    await as(db, admin, `update legal_agreements set content_en = 'second text, edited while draft' where id = $1`, [draftId]);
    await as(db, admin, `select admin_publish_agreement($1, 'Reviewed again')`, [draftId]);
    assert.equal((await sys(db, `select status from legal_agreements where id = $1`, [agreementId]))[0].status, "archived");
    assert.equal(await code(as(db, admin, `update legal_agreements set content_ar = 'x' where id = $1`, [agreementId])), "22023", "an archived version stays fixed too");
  });
});
