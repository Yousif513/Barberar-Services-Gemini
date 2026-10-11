import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// D-15: consent and data-request evidence is written only by commands, with server-set time, due date and version.

let db;
let admin;
let alice;
let bob;
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  alice = ROLES.user(await createUser(db, { role: "customer", phone: "+966500010001", verified: true }));
  bob = ROLES.user(await createUser(db, { role: "customer" }));
});

describe("D-15: consents", () => {
  it("cannot be inserted from the client with a future date, a made-up method or a made-up version", async () => {
    for (const user of [alice, admin]) {
      assert.equal(await code(as(db, user, `insert into consents (user_id, purpose, status, created_at) values ($1, 'whatsapp', 'granted', now() + interval '5 years')`, [user.sub])), "42501");
    }
    assert.equal(await code(as(db, ROLES.anon, `insert into consents (user_id, purpose) values ($1, 'whatsapp')`, [alice.sub])), "42501");
    assert.equal(await code(as(db, alice, `update consents set status = 'granted'`)), "42501");
    assert.equal(await code(as(db, alice, `delete from consents`)), "42501");
  });
  it("is recorded by record_consent with the server's clock, and a later withdrawal wins", async () => {
    await as(db, alice, `select record_consent('whatsapp', 'granted', 'v1.0', 'web_form')`);
    await as(db, alice, `select record_consent('whatsapp', 'withdrawn', 'v1.0', 'settings_toggle')`);
    const rows = await sys(db, `select status, method, created_at <= now() as not_future from consents where user_id = $1 and purpose = 'whatsapp' order by created_at, id`, [alice.sub]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.not_future));
    assert.equal((await sys(db, `select has_active_consent($1, 'whatsapp') ok`, [alice.sub]))[0].ok, false);
  });
  it("rejects a bad purpose, status, method or version, and an anonymous caller", async () => {
    assert.equal(await code(as(db, alice, `select record_consent('selling_data')`)), "22023");
    assert.equal(await code(as(db, alice, `select record_consent('whatsapp', 'maybe')`)), "22023");
    assert.equal(await code(as(db, alice, `select record_consent('whatsapp', 'granted', 'v1.0', 'Robert''); drop')`)), "22023");
    assert.equal(await code(as(db, alice, `select record_consent('whatsapp', 'granted', 'not a version at all, far too long')`)), "22023");
    assert.equal(await code(as(db, ROLES.anon, `select record_consent('whatsapp')`)), "42501");
    assert.equal(await code(as(db, ROLES.service, `select record_consent('whatsapp')`)), "42501");
  });
  it("records the published terms version instead of the one the client claims", async () => {
    const terms = (await sys(db, `select id, version from legal_agreements where agreement_key = 'customer_terms' order by created_at limit 1`))[0];
    await as(db, admin, `select admin_publish_agreement($1, 'Reviewed by counsel')`, [terms.id]);
    await as(db, bob, `select record_consent('terms_privacy', 'granted', 'v0.1', 'web_auth_form')`);
    assert.equal((await sys(db, `select document_version v from consents where user_id = $1 and purpose = 'terms_privacy'`, [bob.sub]))[0].v, terms.version);
  });
  it("records several purposes at once and nothing when one is invalid", async () => {
    const ids = (await as(db, bob, `select record_consents(array['marketing', 'whatsapp'], 'granted', 'v1.0', 'web_auth_form') ids`))[0].ids;
    assert.equal(ids.length, 2);
    const before = (await sys(db, `select count(*)::int c from consents where user_id = $1`, [bob.sub]))[0].c;
    assert.equal(await code(as(db, bob, `select record_consents(array['marketing', 'nonsense'])`)), "22023");
    assert.equal((await sys(db, `select count(*)::int c from consents where user_id = $1`, [bob.sub]))[0].c, before);
    assert.equal(await code(as(db, bob, `select record_consents(array[]::text[])`)), "22023");
    assert.equal(await code(as(db, ROLES.anon, `select record_consents(array['marketing'])`)), "42501");
  });
  it("is readable by its owner and, through the audited admin_list_consents, by administrators; not by another user", async () => {
    const count = async (user) => (await as(db, user, `select count(*)::int c from consents`))[0].c;
    assert.ok((await count(alice)) >= 2);
    // GOV-2 (Q4): no direct table read for a console session; the audited function serves it.
    assert.equal(await count(admin), 0);
    assert.ok((await as(db, admin, `select admin_list_consents(null, 200, 0, null) r`))[0].r.total > (await count(alice)));
    assert.equal(await count(ROLES.user(SEED.owner2)), 0);
  });
});

describe("D-15: data-subject requests (now privacy_requests, PRIV Q1)", () => {
  // PRIV-1: in-app requests need a sign-in by one-time code; the harness session of alice is password + TOTP.
  const fresh = (user) => ({ ...user, aal: "aal1", amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }] });
  it("cannot be inserted from the client, so no ten-year deadline and no self-approved note", async () => {
    assert.equal(await code(as(db, alice, `insert into privacy_requests (subject_id, request_type, due_at, staff_notes, decided_by) values ($1, 'access', now() + interval '3650 days', 'approved', $1)`, [alice.sub])), "42501");
    assert.equal(await code(as(db, alice, `update privacy_requests set due_at = now() + interval '3650 days'`)), "42501");
  });
  it("is opened by privacy_submit_request with the server's status and a deadline 30 days after receipt", async () => {
    assert.equal(await code(as(db, alice, `select privacy_submit_request('access', 'Please send my data', '{}'::jsonb)`)), "42501", "a password session is not enough");
    const r = (await as(db, fresh(alice), `select privacy_submit_request('access', '  Please send my data  ', '{}'::jsonb) r`))[0].r;
    assert.equal(r.created, true);
    assert.equal(r.status, "open");
    const row = (await sys(db, `select subject_id, details, staff_notes, decided_by, extract(epoch from due_at - received_at) / 86400 as days from privacy_requests where id = $1`, [r.id]))[0];
    assert.equal(row.subject_id, alice.sub);
    assert.equal(row.details, "Please send my data");
    assert.equal(row.staff_notes, null);
    assert.equal(row.decided_by, null);
    assert.equal(Math.round(Number(row.days)), 30);
    const audit = await sys(db, `select details from admin_audit_logs where action = 'privacy.request_submitted' and target_id = $1`, [r.id]);
    assert.equal(audit.length, 1);
    assert.ok(!JSON.stringify(audit[0].details).includes("Please send"), "personal text is not copied into the audit log");
  });
  it("returns the open request when the same kind is submitted again", async () => {
    const first = (await as(db, fresh(alice), `select privacy_submit_request('copy', null, '{}'::jsonb) r`))[0].r;
    const again = (await as(db, fresh(alice), `select privacy_submit_request('copy', 'second try', '{}'::jsonb) r`))[0].r;
    assert.equal(again.created, false);
    assert.equal(again.id, first.id);
    assert.equal((await sys(db, `select count(*)::int c from privacy_requests where subject_id = $1 and request_type = 'copy'`, [alice.sub]))[0].c, 1);
  });
  it("rejects an unknown type, over-long details and unauthenticated callers", async () => {
    assert.equal(await code(as(db, fresh(alice), `select privacy_submit_request('delete_everything', null, '{}'::jsonb)`)), "22023");
    assert.equal(await code(as(db, fresh(alice), `select privacy_submit_request('copy', $1, '{}'::jsonb)`, ["x".repeat(2001)])), "22023");
    assert.equal(await code(as(db, ROLES.anon, `select privacy_submit_request('copy', null, '{}'::jsonb)`)), "42501");
    assert.equal(await code(as(db, ROLES.service, `select privacy_submit_request('copy', null, '{}'::jsonb)`)), "28000", "the service role has no acting user");
  });
  it("is visible to its owner through privacy_my_requests, and to administrators only through the audited function", async () => {
    assert.equal((await as(db, fresh(alice), `select privacy_my_requests() r`))[0].r.length, 2);
    assert.equal((await as(db, bob, `select privacy_my_requests() r`))[0].r.length, 0);
    assert.equal(await code(as(db, admin, `select count(*) from privacy_requests`)), "42501");
    assert.ok((await as(db, admin, `select admin_privacy_list_requests('open', 200, 0, null) r`))[0].r.total >= 2);
  });
  it("still lets an administrator work the request", async () => {
    const id = (await sys(db, `select id from privacy_requests where subject_id = $1 and request_type = 'access'`, [alice.sub]))[0].id;
    await as(db, admin, `select admin_privacy_add_note($1, 'Collecting data')`, [id]);
    assert.match((await sys(db, `select staff_notes from privacy_requests where id = $1`, [id]))[0].staff_notes, /Collecting data/);
  });
});

