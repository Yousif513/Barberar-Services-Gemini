import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// PRIV package (Q1, Q2, Q2.6, X1, X3(6) "Final decision text", docs/legal/2026-10-10-privacy-decision-memo.md): privacy requests,
// identity by one-time code, deadlines, extension, escalation, refusal, correction with restriction, consent withdrawal, the copy,
// the deletion engine, legal holds, the deletion ledger, health-intake retention and gate, the incident register. Every rule has
// a refusal test next to the permitted case.
let db;
let svc;
let owner;
let owner2;
let operations;
let finance;
let analyst;
let seq = 0;

const nowS = () => Math.floor(Date.now() / 1000);
// A customer session after signing in with a one-time code (Supabase Auth writes amr "otp").
const otp = (id, age = 10) => ROLES.user(id, { aal: "aal1", amr: [{ method: "otp", timestamp: nowS() - age }] });
const pwd = (id) => ROLES.user(id, { aal: "aal1", amr: [{ method: "password", timestamp: nowS() }] });
const stale = (id) => ROLES.user(id, { amr: [{ method: "totp", timestamp: nowS() - 900 }, { method: "password", timestamp: nowS() - 900 }] });
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const count = async (table, where = "true", params = []) => (await one(`select count(*)::int n from ${table} where ${where}`, params)).n;

async function customer() {
  const id = await createUser(db);
  await sys(db, `update profiles set first_name = 'Sara', last_name = 'Ahmed', email = $2 where id = $1`, [id, `c${id.slice(-4)}@test.local`]);
  return id;
}
async function booking(customerId, status = "completed", daysAgo = 10) {
  seq += 1;
  return (await one(
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit, home_address_text)
     values ($1, $2, $3, $4, $5::booking_status, now() - make_interval(days => $6::int, mins => $7::int), 30, 100, 100, 15, 0, 0, 'marketplace', false, 'Street 1')
     returning id`, [customerId, SEED.branch1, SEED.employee1, svc.id, status, daysAgo, seq * 40])).id;
}
// The phone added above counts as a contact change; move it out of the 30-day cooling-off window (review M2).
const settle = (id) => sys(db, `update account_contact_changes set changed_at = now() - interval '40 days' where user_id = $1`, [id]);
const submit = (user, type, options = {}, details = "Please act on my data") =>
  call(user, `select privacy_submit_request($1, $2, $3::jsonb) r`, [type, details, JSON.stringify(options)]);
const propose = (user, id) => call(user, `select admin_privacy_propose_execution($1, 'Identity verified in app; scope checked') r`, [id]);
const decide = (user, approval, decision = "approve") => call(user, `select admin_decide_approval($1, $2, 'Second person checked it') r`, [approval, decision]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("Q1.1-2: requests and identity", () => {
  it("needs a one-time-code sign-in in the last 10 minutes; a password session or an old code is refused", async () => {
    const id = await customer();
    await expectError(submit(pwd(id), "access"), /one-time code/);
    await expectError(submit(otp(id, 11 * 60), "access"), /one-time code/);
    await expectError(submit(ROLES.anon, "access"), /Sign in|permission denied/);
    const r = await submit(otp(id), "access");
    assert.equal(r.status, "open");
    assert.equal(r.verification_method, "in_app_otp_at_submission");
    assert.equal(r.channel, "in_app");
    const days = (new Date(r.due_at) - new Date(r.received_at)) / 86400000;
    assert.equal(Math.round(days), 30);
    const again = await submit(otp(id), "access");
    assert.equal(again.created, false);
    assert.equal(again.id, r.id);
    assert.equal(await count("privacy_request_events", "request_id = $1 and event = 'identity_verified'", [r.id]), 1);
  });

  it("refuses an account with no verified contact, an unknown type and a console session", async () => {
    const id = await customer();
    await sys(db, `update auth.users set email_confirmed_at = null where id = $1`, [id]);
    await expectError(submit(otp(id), "access"), /no verified e-mail or phone/);
    await expectError(submit(otp(await customer()), "delete_everything"), /Unknown request type/);
    await expectError(call(owner, `select privacy_submit_request('access', 'x', '{}'::jsonb) r`), /console session/);
  });

  it("keeps the table closed to clients: no direct read or write", async () => {
    const id = await customer();
    await expectError(as(db, otp(id), `select * from privacy_requests`), /permission denied/);
    await expectError(as(db, owner, `select * from privacy_requests`), /permission denied/);
    await expectError(as(db, otp(id), `insert into privacy_requests (subject_id, request_type, due_at) values ($1, 'access', now())`, [id]), /permission denied/);
  });

  it("logs a phone request for staff (privacy.manage only); nothing runs until the customer confirms with a code", async () => {
    const id = await customer();
    const args = [id, "copy", "phone", new Date().toISOString(), "Customer called asking for a copy of their data"];
    const sql = `select admin_privacy_log_request($1, $2, $3, $4::timestamptz, $5, '{}'::jsonb) r`;
    for (const who of [finance, analyst]) await expectError(call(who, sql, args), /privacy.manage/);
    await expectError(call(operations, sql, [id, "copy", "in_app", args[3], args[4]]), /channel/);
    await expectError(call(operations, sql, [id, "copy", "phone", new Date(Date.now() - 40 * 86400000).toISOString(), args[4]]), /last 30 days/);
    const logged = await call(operations, sql, args);
    assert.equal(logged.status, "awaiting_verification");
    assert.ok(await count("notifications", "user_id = $1 and type = 'privacy_request'", [id]) >= 1);
    await expectError(propose(owner, logged.id), /not confirmed their identity/);
    await expectError(call(otp(await customer()), `select privacy_confirm_request($1) r`, [logged.id]), /not found/);
    await expectError(call(pwd(id), `select privacy_confirm_request($1) r`, [logged.id]), /one-time code/);
    const confirmed = await call(otp(id), `select privacy_confirm_request($1) r`, [logged.id]);
    assert.equal(confirmed.status, "open");
    assert.equal(confirmed.verification_method, "in_app_otp_confirmation");
  });
});

describe("Q1.3-4: deadline, extension, escalation, refusal", () => {
  it("extends once, by 30 days, before day 30, for the two allowed reasons only, and tells the customer", async () => {
    const id = await customer();
    const r = await submit(otp(id), "copy");
    const sql = `select admin_privacy_extend_request($1, $2, $3) r`;
    const reason = "Ten years of bookings across several businesses to collect";
    await expectError(call(analyst, sql, [r.id, "disproportionate_effort", reason]), /privacy.manage/);
    await expectError(call(operations, sql, [r.id, "busy", reason]), /disproportionate effort or multiple requests/);
    await expectError(call(operations, sql, [r.id, "disproportionate_effort", "too short"]), /20 characters/);
    await expectError(call(operations, sql, [r.id, "multiple_requests", reason]), /no other request/);
    const ext = await call(operations, sql, [r.id, "disproportionate_effort", reason]);
    assert.equal(Math.round((new Date(ext.extended_due_at) - new Date(ext.due_at)) / 86400000), 30);
    await expectError(call(operations, sql, [r.id, "disproportionate_effort", reason]), /already extended once/);
    assert.equal(await count("governance_notifications", "recipient_user_id = $1 and template_key = 'privacy_request_extended'", [id]), 1);
    const late = await submit(otp(await customer()), "copy");
    await sys(db, `update privacy_requests set received_at = now() - interval '31 days', due_at = now() - interval '1 day' where id = $1`, [late.id]);
    await expectError(call(operations, sql, [late.id, "disproportionate_effort", reason]), /before day 30/);
  });

  it("escalates at day 20 and day 28, once each, with an alert and owner notices", async () => {
    const r = await submit(otp(await customer()), "access");
    await sys(db, `update privacy_requests set received_at = now() - interval '21 days', due_at = now() + interval '9 days' where id = $1`, [r.id]);
    await expectError(call(analyst, `select privacy_escalate_requests() r`), /privacy.manage/);
    const first = await call(ROLES.service, `select privacy_escalate_requests() r`);
    assert.ok(first.day_20 >= 1);
    const second = await call(ROLES.service, `select privacy_escalate_requests() r`);
    assert.equal(second.day_20, 0);
    assert.equal(await count("security_alerts", `kind = 'privacy_request_escalated' and details->>'request_id' = $1`, [r.id]), 1);
    await sys(db, `update privacy_requests set received_at = now() - interval '29 days' where id = $1`, [r.id]);
    assert.ok((await call(ROLES.service, `select privacy_escalate_requests() r`)).day_28 >= 1);
    const listed = await call(owner, `select admin_privacy_list_requests('open', 200, 0, 'privacy_request') r`);
    assert.equal(listed.rows.find((x) => x.id === r.id).escalation, "day_28");
  });

  it("refuses only as repetitive, manifestly unfounded or disproportionate, after step-up, with the SDAIA complaint right", async () => {
    const id = await customer();
    const r = await submit(otp(id), "access");
    const sql = `select admin_privacy_refuse_request($1, $2, $3) r`;
    const why = "The same access request was answered last week with the full data";
    await expectError(call(operations, sql, [r.id, "too_busy", why]), /repetitive, manifestly unfounded or disproportionate/);
    await expectError(call(stale(operations.sub), sql, [r.id, "repetitive", why]), /step-up required/);
    await expectError(call(finance, sql, [r.id, "repetitive", why]), /privacy.manage/);
    await expectError(call(operations, sql, [r.id, "repetitive", why]), /no earlier completed access request/, "L1: repetitive needs an earlier answered request");
    const refused = await call(operations, sql, [r.id, "manifestly_unfounded", why]);
    assert.equal(refused.status, "refused");
    const note = await one(`select body_en, body_ar from notifications where user_id = $1 and title_en like '%refused%'`, [id]);
    assert.match(note.body_en, /SDAIA/);
    assert.match(note.body_ar, /سدايا/);
    await expectError(call(operations, sql, [r.id, "manifestly_unfounded", why]), /can no longer be refused/);
  });

  it("lets the customer withdraw an open request but not one already approved", async () => {
    const id = await customer();
    const r = await submit(otp(id), "copy");
    const w = await call(otp(id), `select privacy_withdraw_request($1) r`, [r.id]);
    assert.equal(w.status, "withdrawn");
    const r2 = await submit(otp(id), "copy");
    await propose(owner, r2.id);
    await expectError(call(otp(id), `select privacy_withdraw_request($1) r`, [r2.id]), /can no longer be withdrawn/);
  });
});

describe("Q1.6: correction with restriction; consent withdrawal", () => {
  it("restricts the contested field until decided, notifies the businesses that received it, and tells the customer", async () => {
    const id = await customer();
    await booking(id);
    await expectError(submit(otp(id), "correction", { correction_field: "email", correction_value: "x" }), /first name, last name or gender/);
    const r = await submit(otp(id), "correction", { correction_field: "last_name", correction_value: "Al-Harbi" });
    assert.equal((await one(`select last_name from profiles where id = $1`, [id])).last_name, null, "out of processing while contested");
    await expectError(as(db, otp(id), `update profiles set last_name = 'Other' where id = $1`, [id]), /under a correction request/);
    assert.equal((await submit(otp(id), "correction", { correction_field: "last_name", correction_value: "Again" })).created, false, "one open correction at a time");
    await expectError(call(operations, `select admin_privacy_complete_correction($1, 'ok') r`, [r.id]), /10 characters/);
    const done = await call(operations, `select admin_privacy_complete_correction($1, 'Checked against the national ID shown in person') r`, [r.id]);
    assert.equal(done.status, "completed");
    assert.equal((await one(`select last_name from profiles where id = $1`, [id])).last_name, "Al-Harbi");
    assert.equal(await count("privacy_field_restrictions", "subject_id = $1", [id]), 0);
    assert.equal(await count("privacy_recipient_notices", "request_id = $1 and provider_id = $2", [r.id, SEED.provider1]), 1);
    assert.ok(await count("notifications", "user_id = $1 and type = 'privacy_correction'", [SEED.owner1]) >= 1);
    assert.equal((await one(`select correction_value from privacy_requests where id = $1`, [r.id])).correction_value, null);
  });

  it("puts the contested value back when the correction is refused", async () => {
    const id = await customer();
    const r = await submit(otp(id), "correction", { correction_field: "first_name", correction_value: "Nora" });
    await call(operations, `select admin_privacy_refuse_request($1, 'manifestly_unfounded', 'The name on record matches the ID document provided') r`, [r.id]);
    assert.equal((await one(`select first_name from profiles where id = $1`, [id])).first_name, "Sara");
  });

  it("carries out a consent withdrawal at once", async () => {
    const id = await customer();
    await as(db, otp(id), `select record_consent('marketing', 'granted', 'v1.0', 'web_form')`);
    const r = await submit(otp(id), "consent_withdrawal", { consent_purposes: ["marketing", "whatsapp"] });
    assert.equal(r.status, "completed");
    assert.equal((await one(`select status from consents where user_id = $1 and purpose = 'marketing' order by created_at desc limit 1`, [id])).status, "withdrawn");
    assert.deepEqual(r.completion_summary.not_active, ["whatsapp"]);
    await expectError(submit(otp(id), "consent_withdrawal", { consent_purposes: ["terms_privacy"] }), /from the list/);
  });
});

describe("Q1.5, Q1.7: the copy", () => {
  let id;
  let request;
  it("is released only by a different privacy.approve holder after step-up; never by break-glass", async () => {
    id = await customer();
    const b = await booking(id);
    const conv = (await one(`insert into conversations (customer_id, provider_id) values ($1, $2) returning id`, [id, SEED.provider1])).id;
    await sys(db, `insert into messages (conversation_id, sender_id, sender_role, body) values ($1, $2, 'customer', 'Is 5pm free? my mail sara@x.sa'),
                   ($1, $3, 'provider', 'Yes. Call Huda on +966 55 123 4567 or huda@salon.sa')`, [conv, id, SEED.owner1]);
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                   values ($1, $2, 'booking_payment', 'chg_priv_copy_1234', 115, 15, 100)`, [b, SEED.provider1]);
    request = await submit(otp(id), "copy");
    await expectError(call(stale(owner.sub), `select admin_privacy_propose_execution($1, 'Checked the request scope') r`, [request.id]), /step-up required/);
    await expectError(call(analyst, `select admin_privacy_propose_execution($1, 'Checked the request scope') r`, [request.id]), /privacy.manage/);
    const proposed = await propose(operations, request.id);
    assert.equal(proposed.status, "pending_approval");
    await expectError(decide(operations, proposed.approval_id), /own request|cannot decide/);
    await expectError(decide(finance, proposed.approval_id), /cannot decide privacy_export/);
    await expectError(call(owner, `select admin_break_glass_execute($1, 'Owner alone with an urgent copy request') r`, [proposed.approval_id]),
      /never available|second administrator/);
    const approved = await decide(owner, proposed.approval_id);
    assert.equal(approved.status, "approved");
    const after = await one(`select status, execution_state from privacy_requests where id = $1`, [request.id]);
    assert.deepEqual([after.status, after.execution_state], ["executing", "awaiting_build"]);
  });

  it("is built only by the service key, with the other party's contact details redacted", async () => {
    await expectError(call(otp(id), `select privacy_export_payload($1) r`, [request.id]), /permission denied|Only the export builder/);
    await expectError(call(owner, `select privacy_export_payload($1) r`, [request.id]), /permission denied|Only the export builder/);
    const p = await call(ROLES.service, `select privacy_export_payload($1) r`, [request.id]);
    for (const k of ["profile", "addresses", "bookings", "payments", "invoices", "messages", "reviews", "consents", "health_intake"]) assert.ok(k in p, k);
    const texts = p.messages[0].messages.map((m) => m.text).join(" ");
    assert.match(texts, /sara@x\.sa/, "what the customer wrote stays");
    assert.doesNotMatch(texts, /huda@salon\.sa|123 4567/, "the other party's contact details are removed");
    assert.equal(p.payments.charges[0].payment_reference, "****1234");
    assert.ok(!JSON.stringify(p).includes(SEED.owner1), "no identifier of the other party");
  });

  it("is downloaded only by the customer, audited, for 7 days", async () => {
    const sha = "a".repeat(64);
    await expectError(call(ROLES.service, `select privacy_export_record_built($1, 'x/y.json', 'x/y.pdf', $2, $2, '{}'::jsonb) r`, [request.id, sha]), /Unexpected storage path/);
    const base = `${id}/${request.id}`;
    const built = await call(ROLES.service, `select privacy_export_record_built($1, $2, $3, $4, $4, '{}'::jsonb) r`, [request.id, `${base}/personal-data.json`, `${base}/personal-data.pdf`, sha]);
    assert.equal(Math.round((new Date(built.expires_at) - Date.now()) / 86400000), 7);
    assert.equal((await one(`select status from privacy_requests where id = $1`, [request.id])).status, "completed");
    const ok = await call(otp(id), `select privacy_export_authorize_download($1, 'pdf') r`, [request.id]);
    assert.equal(ok.path, `${base}/personal-data.pdf`);
    await expectError(call(otp(await customer()), `select privacy_export_authorize_download($1, 'pdf') r`, [request.id]), /not found/);
    await expectError(call(owner, `select privacy_export_authorize_download($1, 'pdf') r`, [request.id]), /not found/);
    assert.equal(await count("admin_audit_logs", `action = 'privacy.export_downloaded' and target_id = $1`, [request.id]), 1);
    await sys(db, `update privacy_exports set built_at = now() - interval '8 days', expires_at = now() - interval '1 day' where request_id = $1`, [request.id]);
    await expectError(call(otp(id), `select privacy_export_authorize_download($1, 'json') r`, [request.id]), /expired/);
    const expired = await call(ROLES.service, `select privacy_expire_exports() r`);
    assert.ok(expired.some((e) => e.request_id === request.id));
  });
});

describe("Q2: the deletion engine", () => {
  let id;
  let linked;
  let unlinked;
  let request;
  let approval;
  it("prepares a customer with bookings, payments, an invoice, messages, a review, health answers and consents", async () => {
    id = await customer();
    await sys(db, `update auth.users set phone = '+966500000111', phone_confirmed_at = now() where id = $1`, [id]);
    await settle(id);
    linked = await booking(id);
    unlinked = await booking(id, "cancelled", 3);
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                   values ($1, $2, 'booking_payment', 'chg_priv_del_1', 115, 15, 100)`, [linked, SEED.provider1]);
    const inv = await call(otp(id), `select generate_zatca_tax_invoice($1) r`, [linked]);
    assert.equal(inv.buyer_name, null, "Q2.4: a B2C simplified invoice names no buyer");
    assert.equal(await count("booking_home_addresses", "booking_id = $1", [linked]), 1, "the address sits in the vault table");
    const conv = (await one(`insert into conversations (customer_id, provider_id) values ($1, $2) returning id`, [id, SEED.provider1])).id;
    await sys(db, `insert into messages (conversation_id, sender_id, sender_role, body) values ($1, $2, 'customer', 'Thanks!')`, [conv, id]);
    await sys(db, `insert into reviews (booking_id, customer_id, provider_id, rating, comment, moderation_status) values ($1, $2, $3, 5, 'Great', 'published')`,
      [linked, id, SEED.provider1]);
    await sys(db, `insert into customer_favorites (customer_id, provider_id) values ($1, $2)`, [id, SEED.provider1]);
    await sys(db, `insert into expo_push_tokens (user_id, token) values ($1, 'ExponentPushToken[priv]')`, [id]);
    await as(db, otp(id), `select record_consent('marketing', 'granted', 'v1.0', 'web_form')`);
    const tpl = (await one(`insert into intake_form_templates (provider_id, name_en, name_ar) values ($1, 'Skin', 'البشرة') returning id`, [SEED.provider1])).id;
    const ver = (await one(`insert into intake_form_template_versions (template_id, provider_id, version, fields) values ($1, $2, 1, '[]'::jsonb) returning id`, [tpl, SEED.provider1])).id;
    const sub = (await one(`insert into intake_submissions (booking_id, provider_id, customer_id, template_id, template_version_id, template_version)
                            values ($1, $2, $3, $4, $5, 1) returning id`, [linked, SEED.provider1, id, tpl, ver])).id;
    await sys(db, `insert into intake_answers (submission_id, customer_id, answers) values ($1, $2, '{"allergy":"latex"}')`, [sub, id]);
    const preview = await call(otp(id), `select privacy_deletion_preview() r`);
    assert.equal(Number(preview.bookings_to_pseudonymise), 1);
    assert.equal(Number(preview.bookings_to_delete), 1);
    assert.equal(Number(preview.health_answers), 1);
  });

  it("needs the customer's review choice and a different approver; break-glass is refused", async () => {
    await expectError(submit(otp(id), "deletion"), /reviews/);
    request = await submit(otp(id), "deletion", { review_choice: "deleted_user" });
    approval = (await propose(owner, request.id)).approval_id;
    await expectError(decide(owner, approval), /own request/);
    await expectError(decide(operations, approval), /cannot decide privacy_deletion/);
    await expectError(call(owner, `select admin_break_glass_execute($1, 'Owner alone with an urgent deletion request') r`, [approval]), /never available/);
    await expectError(call(otp(id), `select privacy_erase_subject_internal($1, null, 'delete_text', 'request') r`, [id]), /permission denied/);
    await expectError(sys(db, `update bookings set customer_id = null where id = $1`, [linked]), /immutable/);
  });

  it("deletes, destroys and pseudonymises exactly as Q2 says, and keeps invoices unaltered", async () => {
    const invoiceBefore = await one(`select invoice_hash, buyer_name, total_amount_sar from invoices where booking_id = $1`, [linked]);
    const r = await decide(owner2, approval);
    assert.equal(r.result.next, "delete_auth_account");
    assert.equal(await count("profiles", "id = $1", [id]), 0);
    assert.equal(await count("intake_answers", "customer_id = $1", [id]), 0);
    assert.equal(await count("consents", "user_id = $1", [id]), 0);
    assert.equal(await count("customer_favorites", "customer_id = $1", [id]), 0);
    assert.equal(await count("expo_push_tokens", "user_id = $1", [id]), 0);
    assert.equal(await count("bookings", "id = $1", [unlinked]), 0, "a booking with no retained record is deleted");
    const b = await one(`select customer_id, pseudonym_token, retention_basis, retention_until, home_address_text, total_price from bookings where id = $1`, [linked]);
    assert.equal(b.customer_id, null);
    assert.match(b.pseudonym_token, /^[0-9a-f]{32}$/);
    assert.match(b.retention_basis, /Commercial Books Law Art\. 8/);
    assert.equal(b.home_address_text, null);
    assert.equal(Number(b.total_price), 100);
    assert.equal(new Date(b.retention_until).getUTCFullYear(), new Date().getUTCFullYear() + 10);
    assert.equal(await count("booking_home_addresses", "booking_id = $1", [linked]), 0);
    const conv = await one(`select customer_id, customer_deleted_at from conversations where provider_id = $1 and customer_deleted_at is not null order by customer_deleted_at desc limit 1`, [SEED.provider1]);
    assert.equal(conv.customer_id, null);
    assert.equal(await count("messages m join conversations c on c.id = m.conversation_id", "c.customer_deleted_at is not null and c.provider_id = $1", [SEED.provider1]), 0);
    assert.ok(await count("notifications", "user_id = $1 and type = 'privacy_deletion'", [SEED.owner1]) >= 1, "the provider is told (IR 8(2)(a))");
    const review = await one(`select customer_id, comment, author_deleted_at from reviews where booking_id = $1`, [linked]);
    assert.deepEqual([review.customer_id, review.comment, review.author_deleted_at !== null], [null, "Great", true], "kept as Deleted user");
    const invoiceAfter = await one(`select invoice_hash, buyer_name, total_amount_sar, customer_id from invoices where booking_id = $1`, [linked]);
    assert.equal(invoiceAfter.invoice_hash, invoiceBefore.invoice_hash);
    assert.equal(invoiceAfter.customer_id, null);
    assert.equal(await count("transactional_ledger", "booking_id = $1", [linked]), 1);
    const req = await one(`select status, execution_state, notice_contacts, completion_summary from privacy_requests where id = $1`, [request.id]);
    assert.deepEqual([req.status, req.execution_state], ["executing", "erased_awaiting_auth"]);
    assert.equal(req.notice_contacts.sms, "+966500000111");
    assert.equal(await count("deletion_ledger", "subject_id = $1", [id]), 1);
  });

  it("completes only after the auth account is gone, with the completion notice to the verified contacts", async () => {
    await expectError(call(owner, `select privacy_record_auth_erasure($1, $2) r`, [request.id, id]), /permission denied|erasure worker/);
    await expectError(call(ROLES.service, `select privacy_record_auth_erasure($1, $2) r`, [request.id, id]), /still exists/);
    const due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    assert.ok(due.requests.some((x) => x.request_id === request.id));
    await sys(db, `delete from auth.users where id = $1`, [id]);
    const done = await call(ROLES.service, `select privacy_record_auth_erasure($1, $2) r`, [request.id, id]);
    assert.equal(done.status, "completed");
    const notices = await sys(db, `select channel, destination, payload from governance_notifications where recipient_user_id = $1 and template_key = 'privacy_deletion_completed'`, [id]);
    assert.deepEqual(notices.map((n) => n.channel).sort(), ["email", "sms"]);
    assert.ok(notices[0].payload.retained.length >= 2 && notices[0].payload.complaint_right.en.includes("90 days"));
    assert.equal((await one(`select notice_contacts from privacy_requests where id = $1`, [request.id])).notice_contacts, null);
  });

  it("re-applies the ledger after a restore brought the data back", async () => {
    await sys(db, `insert into auth.users (id, email, email_confirmed_at) values ($1, 'restored@test.local', now())`, [id]);
    await sys(db, `insert into profiles (id, first_name, email) values ($1, 'Restored', 'restored@test.local') on conflict (id) do update set first_name = 'Restored'`, [id]);
    await expectError(call(analyst, `select privacy_reapply_deletion_ledger() r`), /privacy.approve/);
    const r = await call(ROLES.service, `select privacy_reapply_deletion_ledger() r`);
    assert.ok(r.reapplied >= 1);
    assert.equal(await count("profiles", "id = $1", [id]), 0);
    assert.ok(r.auth_accounts_to_delete.includes(id));
    const due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    assert.ok(due.restored.some((x) => x.subject_id === id));
    await sys(db, `delete from auth.users where id = $1`, [id]);
    await call(ROLES.service, `select privacy_record_auth_erasure(null, $1) r`, [id]);
  });

  it("C1: an owner cannot erase an account through the ledger; archive entries need the service key, the digest and a completed request", async () => {
    // The review's reproduction: the console RPC no longer takes entries.
    const victimCustomer = await customer();
    await expectError(call(owner, `select privacy_reapply_deletion_ledger($1::jsonb) r`,
      [JSON.stringify([{ subject_id: victimCustomer }, { subject_id: finance.sub }])]), /does not exist|function/);
    await expectError(call(owner, `select privacy_import_deletion_archive('[]'::jsonb, $1) r`, ["0".repeat(64)]), /permission denied|service key/);
    assert.equal(await count("profiles", "id = any($1::uuid[])", [[victimCustomer, finance.sub]]), 2);
    const exported = await call(owner, `select admin_privacy_export_deletion_ledger() r`);
    assert.match(exported.sha256, /^[0-9a-f]{64}$/);
    assert.ok(exported.entries.some((e) => e.subject_id === id && e.request_id === request.id));
    // A restore rolled the ledger back: the archive brings the entry back, unconfirmed by auth until the worker deletes it again.
    await sys(db, `delete from deletion_ledger where subject_id = $1`, [id]);
    const archive = JSON.stringify(exported.entries);
    await expectError(call(ROLES.service, `select privacy_import_deletion_archive($1::jsonb, $2) r`, [archive, "f".repeat(64)]), /SHA-256/);
    const imported = await call(ROLES.service, `select privacy_import_deletion_archive($1::jsonb, $2) r`, [archive, exported.sha256]);
    assert.equal(imported.added_from_archive, 1);
    assert.equal((await one(`select auth_deleted_at from deletion_ledger where subject_id = $1`, [id])).auth_deleted_at, null);
    // An entry with no completed deletion request (a staff member, another customer) is skipped, never erased.
    const forged = [{ subject_id: victimCustomer, request_id: request.id }, { subject_id: finance.sub }];
    const sha = (await one(`select encode(extensions.digest($1::jsonb::text, 'sha256'), 'hex') h`, [JSON.stringify(forged)])).h;
    const out = await call(ROLES.service, `select privacy_import_deletion_archive($1::jsonb, $2) r`, [JSON.stringify(forged), sha]);
    assert.equal(out.added_from_archive, 0);
    assert.equal(out.skipped_without_completed_request, 2);
    assert.equal(await count("profiles", "id = any($1::uuid[])", [[victimCustomer, finance.sub]]), 2);
    await expectError(call(operations, `select admin_privacy_export_deletion_ledger() r`), /privacy.approve/);
  });

  it("C1.3 / L3: the engine refuses any account that is not a customer", async () => {
    await expectError(sys(db, `select privacy_erase_subject_internal($1, null, 'delete_text', 'request')`, [finance.sub]), /Only a customer account/);
    await expectError(sys(db, `select privacy_erase_subject_internal($1, null, 'delete_text', 'request')`, [SEED.owner1]), /Only a customer account/);
    assert.equal(await count("profiles", "id = $1", [finance.sub]), 1);
    // A customer who became staff between proposal and approval is not deleted by the approval.
    const c = await customer();
    const r = await submit(otp(c), "deletion", { review_choice: "delete_text" });
    const appr = (await propose(operations, r.id)).approval_id;
    const prev = (await one(`select profile_id from employees where id = $1`, [SEED.employee2])).profile_id;
    await sys(db, `update employees set profile_id = $1 where id = $2`, [c, SEED.employee2]);
    await expectError(decide(owner2, appr), /Only a customer account/);
    await sys(db, `update employees set profile_id = $1 where id = $2`, [prev, SEED.employee2]);
    assert.equal(await count("profiles", "id = $1", [c]), 1);
  });
});

describe("Q2.5: legal holds", () => {
  it("H2: a court hold keeps only the categories it names; the profile goes; health data is never held; needs a second person", async () => {
    const id = await customer();
    const b = await booking(id);
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                   values ($1, $2, 'booking_payment', 'chg_priv_hold_1', 115, 15, 100)`, [b, SEED.provider1]);
    const tpl = (await one(`insert into intake_form_templates (provider_id, name_en, name_ar) values ($1, 'Hold', 'حجز') returning id`, [SEED.provider1])).id;
    const ver = (await one(`insert into intake_form_template_versions (template_id, provider_id, version, fields) values ($1, $2, 1, '[]'::jsonb) returning id`, [tpl, SEED.provider1])).id;
    const sub = (await one(`insert into intake_submissions (booking_id, provider_id, customer_id, template_id, template_version_id, template_version)
                            values ($1, $2, $3, $4, $5, 1) returning id`, [b, SEED.provider1, id, tpl, ver])).id;
    await sys(db, `insert into intake_answers (submission_id, customer_id, answers) values ($1, $2, '{"a":"b"}')`, [sub, id]);
    const sql = `select admin_privacy_propose_legal_hold($1, $2, $3, $4::text[], null, $5) r`;
    const reason = "Riyadh commercial court case 1447/123 names this customer";
    await expectError(call(operations, sql, [id, "court_case", "CASE-1447-123", ["health"], reason]), /never held/);
    await expectError(call(operations, sql, [id, "chargeback_rumour", "X-1", ["bookings"], reason]), /court case/);
    const hold = await call(operations, sql, [id, "court_case", "CASE-1447-123", ["bookings"], reason]);
    await expectError(decide(operations, hold.approval_id), /own request|cannot decide/);
    await decide(owner, hold.approval_id);
    assert.equal((await one(`select status from privacy_legal_holds where id = $1`, [hold.hold_id])).status, "active");
    const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    const appr = (await propose(operations, r.id)).approval_id;
    const out = await decide(owner2, appr);
    assert.equal(out.result.next, "delete_auth_account", "the account is not held by a bookings-only hold");
    assert.equal(await count("profiles", "id = $1", [id]), 0, "the review's reproduction: a reviews/bookings hold no longer keeps the profile");
    const h = await one(`select pseudonym_token from privacy_legal_holds where id = $1`, [hold.hold_id]);
    const kept = await one(`select customer_id, pseudonym_token from bookings where id = $1`, [b]);
    assert.deepEqual([kept.customer_id, kept.pseudonym_token], [null, h.pseudonym_token], "hold-scoped pseudonym");
    assert.equal(await count("booking_home_addresses", "booking_id = $1", [b]), 1, "the held booking keeps its content");
    assert.equal(await count("intake_answers", "customer_id = $1", [id]), 0, "health answers are destroyed whatever is held");

    // Renewal: a new approver each time, with a reason.
    const keep = (who) => call(who, `select admin_privacy_review_legal_hold($1, true, 'Still pending before the court in Riyadh') r`, [hold.hold_id]);
    await expectError(keep(operations), /privacy.approve/);
    await expectError(keep(owner), /new approver/, "the approver cannot renew their own hold");
    const renewed = await keep(owner2);
    assert.equal(Math.round((new Date(renewed.review_due_at) - Date.now()) / 86400000), 90);
    await expectError(keep(owner2), /new approver/, "nor renew it twice in a row");
    await expectError(call(owner, `select admin_privacy_review_legal_hold($1, true, 'too short') r`, [hold.hold_id]), /20 characters/);

    // Release: the held booking is finished like any retained booking, with a fresh pseudonym; the hold forgets token and subject.
    await call(owner, `select admin_privacy_review_legal_hold($1, false, 'The court case was closed by final judgment') r`, [hold.hold_id]);
    const after = await one(`select pseudonym_token, home_address_text, retention_basis from bookings where id = $1`, [b]);
    assert.notEqual(after.pseudonym_token, h.pseudonym_token);
    assert.equal(await count("booking_home_addresses", "booking_id = $1", [b]), 0);
    assert.match(after.retention_basis, /Commercial Books Law/);
    const released = await one(`select subject_id, pseudonym_token from privacy_legal_holds where id = $1`, [hold.hold_id]);
    assert.deepEqual([released.subject_id, released.pseudonym_token], [null, null], "M5: no token beside a person after release");
  });

  it("H1: an account kept for a court case is deleted, login included, after the hold is released, with a final notice", async () => {
    const id = await customer();
    await sys(db, `update auth.users set phone = '+966500000333', phone_confirmed_at = now() where id = $1`, [id]);
    await settle(id);
    await booking(id);
    const sql = `select admin_privacy_propose_legal_hold($1, 'court_case', 'CASE-1447-900', $2::text[], null, $3, $4) r`;
    const reason = "Riyadh court case 1447/900 names this customer as a party";
    await expectError(call(operations, sql, [id, ["account", "reviews"], reason, null]), /account itself/);
    const hold = await call(operations, sql, [id, ["account", "reviews"], reason, "The court asked for the account history of this customer"]);
    await decide(owner, hold.approval_id);
    const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    assert.equal((await decide(owner2, (await propose(operations, r.id)).approval_id)).result.next, "done");
    assert.equal(await count("profiles", "id = $1", [id]), 1, "the account named by the hold is kept");
    let due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    assert.ok(!due.held_released.some((x) => x.subject_id === id));
    await call(owner2, `select admin_privacy_review_legal_hold($1, false, 'Proceedings ended; the court released the records') r`, [hold.hold_id]);
    assert.equal(await count("profiles", "id = $1", [id]), 0);
    due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    const task = due.held_released.find((x) => x.subject_id === id);
    assert.ok(task, "the review's reproduction: the login is now due for deletion");
    assert.ok(task.phones.includes("+966500000333"));
    await sys(db, `delete from auth.users where id = $1`, [id]);
    const done = await call(ROLES.service, `select privacy_record_auth_erasure(null, $1) r`, [id]);
    assert.ok(done.completion_notices >= 1);
    const notice = await one(`select payload from governance_notifications where recipient_user_id = $1 and template_key = 'privacy_deletion_completed'
                              and payload->>'final' = 'true'`, [id]);
    assert.equal(notice.payload.deleted.auth_account, true);
    assert.equal(await count("privacy_erasure_pending", "subject_id = $1", [id]), 0);
  });

  it("H3, M3, M5, M7: no contact detail survives erasure; money records stay pseudonymised; one pseudonym per row", async () => {
    const id = await customer();
    const email = (await one(`select email from auth.users where id = $1`, [id])).email;
    await sys(db, `update auth.users set phone = '+966512340222', phone_confirmed_at = now() where id = $1`, [id]);
    await sys(db, `update auth.users set phone = '+966512340444', phone_confirmed_at = now() where id = $1`, [id]);
    await settle(id);
    await sys(db, `update profiles set phone_number = '+966512340444' where id = $1`, [id]);
    const b1 = await booking(id);
    const b2 = await booking(id);
    for (const [bk, ch] of [[b1, "chg_priv_h3_1"], [b2, "chg_priv_h3_2"]]) {
      await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                     values ($1, $2, 'booking_payment', $3, 115, 15, 100)`, [bk, SEED.provider1, ch]);
    }
    await sys(db, `insert into message_queue (booking_id, recipient_phone, recipient_id, channel, template_name, variables, status)
                   values ($1, '+966512340444', $2, 'sms', 'reminder', '{"name":"Sara"}', 'sent'), ($1, '+966512340444', $2, 'sms', 'reminder', '{}', 'pending')`, [b1, id]);
    await sys(db, `insert into message_log (booking_id, recipient_phone, recipient_id, channel, template_name, message_body, status)
                   values ($1, '+966512340222', null, 'sms', 'reminder', 'Hi Sara, see you at 5', 'sent')`, [b1]);
    await sys(db, `insert into governance_notifications (recipient_user_id, channel, template_key, payload, destination, status, sent_at, provider_message_id)
                   values ($1, 'email', 'privacy_request_received', '{"x":1}', $2, 'sent', now(), 'm1')`, [id, email]);
    await sys(db, `insert into booking_tips (booking_id, customer_id, employee_id, provider_id, amount) values ($1, $2, $3, $4, 20)`, [b1, id, SEED.employee1, SEED.provider1]);
    await sys(db, `insert into wallet_credits (customer_id, amount, reason, source) values ($1, 50, 'Goodwill', 'compensation')`, [id]);
    const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    await decide(owner2, (await propose(operations, r.id)).approval_id);
    const due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    const task = due.requests.find((x) => x.request_id === r.id);
    assert.ok(task.phones.includes("+966512340222") && task.phones.includes("+966512340444"), "M7: every phone the account held");
    // M3: money records kept, pseudonymised, each with its own token.
    const tip = await one(`select customer_id, pseudonym_token, amount from booking_tips where booking_id = $1`, [b1]);
    assert.deepEqual([tip.customer_id, Number(tip.amount)], [null, 20]);
    assert.match(tip.pseudonym_token, /^[0-9a-f]{32}$/);
    assert.equal(await count("wallet_credits", "customer_id is null and pseudonym_token is not null and reason = 'Goodwill'"), 1);
    const tokens = await sys(db, `select pseudonym_token from bookings where id = any($1::uuid[])`, [[b1, b2]]);
    assert.equal(new Set(tokens.map((t) => t.pseudonym_token)).size, 2, "M5: one pseudonym per retained row");
    // The worker finishes, the completion notice is sent, then nothing personal is left anywhere in public.
    await sys(db, `delete from auth.users where id = $1`, [id]);
    await call(ROLES.service, `select privacy_record_auth_erasure($1, $2) r`, [r.id, id]);
    await sys(db, `update governance_notifications set status = 'sent', sent_at = now(), provider_message_id = 'done'
                   where recipient_user_id = $1 and template_key = 'privacy_deletion_completed'`, [id]);
    const tables = await sys(db, `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    const needles = [email, "+966512340222", "+966512340444", "966512340222", "966512340444"];
    const hits = [];
    for (const { table_name: t } of tables) {
      const n = (await one(`select count(*)::int n from public."${t}" x where x::text ilike any($1::text[])`, [needles.map((v) => `%${v}%`)])).n;
      if (n) hits.push(t);
    }
    assert.deepEqual(hits, [], "H3: the e-mail and every phone are gone from every public table");
    // The person's id stays only on the request records and logs that document the request itself.
    const idHits = [];
    for (const { table_name: t } of tables) {
      const n = (await one(`select count(*)::int n from public."${t}" x where x::text ilike $1`, [`%${id}%`])).n;
      if (n) idHits.push(t);
    }
    const allowed = ["privacy_requests", "privacy_request_events", "admin_approval_requests", "deletion_ledger", "privacy_erasure_runs", "admin_audit_logs", "governance_notifications"];
    assert.deepEqual(idHits.filter((t) => !allowed.includes(t)), []);
  });

  it("holds a disputed booking and its thread until 30 days after the dispute closes, then finishes the deletion", async () => {
    const id = await customer();
    const b = await booking(id);
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                   values ($1, $2, 'booking_payment', 'chg_priv_disp_1', 115, 15, 100)`, [b, SEED.provider1]);
    const dispute = (await one(`insert into payment_disputes (booking_id, customer_id, provider_id, charge_id, disputed_amount_sar, reason, status)
                                values ($1, $2, $3, 'chg_priv_disp_1', 115, 'Not as described', 'opened') returning id`, [b, id, SEED.provider1])).id;
    const conv = (await one(`insert into conversations (customer_id, provider_id) values ($1, $2) returning id`, [id, SEED.provider1])).id;
    await sys(db, `insert into messages (conversation_id, sender_id, sender_role, body) values ($1, $2, 'customer', 'The colour was wrong')`, [conv, id]);
    const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    await decide(owner2, (await propose(owner, r.id)).approval_id);
    const hold = await one(`select * from privacy_legal_holds where dispute_id = $1`, [dispute]);
    assert.equal(hold.status, "active");
    assert.deepEqual(hold.categories, ["bookings", "messages"]);
    assert.equal(await count("profiles", "id = $1", [id]), 0, "the account itself is not held for a dispute");
    assert.equal(await count("messages", "conversation_id = $1", [conv]), 1, "the thread about the disputed booking is held");
    await sys(db, `update payment_disputes set status = 'closed', resolved_at = now() - interval '31 days' where id = $1`, [dispute]);
    await expectError(call(operations, `select privacy_release_due_holds() r`), /privacy.approve/);
    const rel = await call(ROLES.service, `select privacy_release_due_holds() r`);
    assert.ok(rel.released >= 1);
    assert.equal((await one(`select status from privacy_legal_holds where id = $1`, [hold.id])).status, "released");
    assert.equal(await count("messages", "conversation_id = $1", [conv]), 0);
  });
});

describe("Q2.6 and X3(6): health intake", () => {
  let id;
  let b;
  let tpl;
  let employeeUser;
  it("collects nothing until the owner records the transfer risk assessment; a required form does not block a visit meanwhile", async () => {
    id = await customer();
    employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `update employees set profile_id = $1 where id = $2`, [employeeUser.sub, SEED.employee1]);
    tpl = (await one(`insert into intake_form_templates (provider_id, name_en, name_ar) values ($1, 'Gate', 'بوابة') returning id`, [SEED.provider1])).id;
    await sys(db, `insert into intake_form_template_versions (template_id, provider_id, version, fields)
                   values ($1, $2, 1, '[{"key":"allergy","type":"short_text","label_en":"Allergy","label_ar":"حساسية"}]'::jsonb)`, [tpl, SEED.provider1]);
    await sys(db, `insert into intake_service_requirements (service_id, provider_id, template_id, form_required) values ($1, $3, $2, true)
                   on conflict (service_id) do update set template_id = excluded.template_id, form_required = true`, [svc.id, tpl, SEED.provider1]);
    b = await booking(id, "confirmed", -3);
    await as(db, otp(id), `select record_consent('health_data', 'granted', 'v1.0', 'web_form')`);
    const status = await call(employeeUser, `select health_intake_collection_status() r`);
    assert.equal(status.enabled, false);
    assert.match(status.notice_en, /transfer risk assessment/);
    assert.match(status.notice_ar, /تقييم مخاطر النقل/);
    await expectError(call(otp(id), `select submit_booking_intake($1, '{"allergy":"latex"}'::jsonb) r`, [b]), /not collected yet/);
    const st = await one(`select * from intake_state_internal($1)`, [b]);
    assert.deepEqual([st.form_status, st.met], ["collection_paused", true]);
    const sql = `select admin_privacy_record_transfer_assessment('TRA-2026-01 signed PDF', current_date, 'Owner name as signed', null) r`;
    await expectError(call(operations, sql), /Only an owner/);
    await expectError(call(stale(owner.sub), sql), /step-up required/);
    assert.equal((await call(owner, sql)).enabled, true);
    const saved = await call(otp(id), `select submit_booking_intake($1, '{"allergy":"latex"}'::jsonb) r`, [b]);
    assert.equal(saved.status, "submitted");
  });

  it("lets only the assigned provider read the answers", async () => {
    assert.equal((await call(employeeUser, `select read_booking_intake_answers($1) r`, [b])).answers.allergy, "latex");
    await expectError(call(ROLES.user(SEED.owner1), `select read_booking_intake_answers($1) r`, [b]), /not found/, "the owner is not the assigned professional");
    await expectError(call(owner, `select read_booking_intake_answers($1) r`, [b]), /not found/);
  });

  it("destroys answers 30 days after the appointment; the reuse consent keeps only the latest, for 12 months", async () => {
    await sys(db, `alter table bookings disable trigger protect_booking_immutable_fields_before_update`);
    await sys(db, `update bookings set status = 'completed', scheduled_at = now() - interval '29 days' where id = $1`, [b]);
    await sys(db, `alter table bookings enable trigger protect_booking_immutable_fields_before_update`);
    assert.equal((await call(ROLES.service, `select purge_expired_intake(true) r`)).eligible >= 0, true);
    assert.equal(await count("intake_answers i join intake_submissions s on s.id = i.submission_id", "s.booking_id = $1", [b]), 1, "day 29: kept");
    await as(db, otp(id), `select record_consent('health_data_reuse', 'granted', 'v1.0', 'web_form')`);
    await sys(db, `alter table bookings disable trigger protect_booking_immutable_fields_before_update`);
    await sys(db, `update bookings set scheduled_at = now() - interval '40 days' where id = $1`, [b]);
    await sys(db, `alter table bookings enable trigger protect_booking_immutable_fields_before_update`);
    await call(ROLES.service, `select purge_expired_intake(false) r`);
    assert.equal(await count("intake_submissions", "booking_id = $1 and status = 'submitted'", [b]), 1, "kept for reuse under the consent");
    const next = await booking(id, "confirmed", -5);
    const reuse = await call(otp(id), `select get_reusable_intake_answers($1) r`, [next]);
    assert.equal(reuse.answers.allergy, "latex");
    await sys(db, `update consents set created_at = now() - interval '13 months' where user_id = $1 and purpose = 'health_data_reuse'`, [id]);
    assert.equal((await call(otp(id), `select get_reusable_intake_answers($1) r`, [next])).available, false);
    await call(ROLES.service, `select purge_expired_intake(false) r`);
    assert.equal(await count("intake_submissions", "booking_id = $1 and status = 'purged' and removal_reason = 'retention'", [b]), 1);
    assert.equal(await count("intake_answers i join intake_submissions s on s.id = i.submission_id", "s.booking_id = $1", [b]), 0);
    await call(owner, `select admin_privacy_revoke_transfer_assessment('Closed again for the test suite') r`);
  });
});

describe("X1: incident register", () => {
  it("is for incident.manage only and counts 72 hours from awareness", async () => {
    const sql = `select admin_incident_create('Leaked export link', 'A copy link was posted in a public chat group by mistake', now() - interval '2 hours', now() - interval '1 hour') r`;
    for (const who of [operations, finance, analyst]) await expectError(call(who, sql), /incident.manage/);
    const i = await call(owner, sql);
    assert.match(i.reference, /^INC-\d{4}-\d{4}$/);
    assert.ok(i.hours_left > 70 && i.hours_left <= 71.1);
    await expectError(call(owner, `select admin_incident_record_sdaia($1, 'not_required_no_harm', 'short', null, null, null) r`, [i.id]), /no-harm conclusion/);
    await expectError(call(owner, `select admin_incident_close($1, 'All done and dusted, nothing more') r`, [i.id]), /risk assessment/);
    await call(owner, `select admin_incident_update($1, $2::jsonb) r`, [i.id, JSON.stringify({ risk_level: "medium", risk_assessment: "Contact details of 12 customers", containment_actions: "Link revoked", preventive_actions: "Links expire after 7 days", approx_subjects: 12, data_types: ["contact"] })]);
    await expectError(call(owner, `select admin_incident_update($1, '{"sdaia_reference":"x"}'::jsonb) r`, [i.id]), /cannot be changed here/);
    await expectError(call(owner, `select admin_incident_record_sdaia($1, 'notify', null, null, now(), null) r`, [i.id]), /SDAIA reference/);
    await expectError(call(stale(owner.sub), `select admin_incident_record_sdaia($1, 'notify', null, 'NDGP-1', now(), null) r`, [i.id]), /step-up required/);
    await call(owner, `select admin_incident_record_sdaia($1, 'notify', null, 'NDGP-1', now(), null) r`, [i.id]);
    await expectError(call(owner, `select admin_incident_close($1, 'All done and dusted, nothing more') r`, [i.id]), /both decisions/);
    await call(owner, `select admin_incident_record_subjects($1, 'notify', null, now(), array['sms','email']) r`, [i.id]);
    const closed = await call(owner, `select admin_incident_close($1, 'Customers informed and link revoked within a day') r`, [i.id]);
    assert.equal(closed.status, "closed");
    assert.equal(new Date(closed.retain_until).getUTCFullYear(), new Date().getUTCFullYear() + 5);
    await expectError(call(owner, `select admin_incident_update($1, '{"title":"Renamed incident"}'::jsonb) r`, [i.id]), /kept as recorded/);
  });

  it("needs a reason for a late filing and alerts the owners 48 hours after awareness", async () => {
    const i = await call(owner, `select admin_incident_create('Lost laptop', 'A staff laptop with exported CSVs was lost on a trip', now() - interval '80 hours', now() - interval '79 hours') r`);
    await expectError(call(owner, `select admin_incident_record_sdaia($1, 'notify', null, 'NDGP-2', now(), null) r`, [i.id]), /after 72 hours/);
    const m = await call(ROLES.service, `select privacy_incident_maintenance() r`);
    assert.ok(m.alerted >= 1);
    assert.equal(await count("security_alerts", `kind = 'privacy_incident_deadline' and details->>'incident_id' = $1`, [i.id]), 1);
    await call(owner, `select admin_incident_record_sdaia($1, 'notify', null, 'NDGP-2', now(), 'Awareness was on a weekend; the register was only opened on Sunday') r`, [i.id]);
  });
});

describe("PRIVFIX: identity, the copy and redaction (review M1, M2, L1, L2, L5)", () => {
  const buildCopy = async (id) => {
    const r = await submit(otp(id), "copy");
    await decide(owner, (await propose(operations, r.id)).approval_id);
    const base = `${id}/${r.id}`;
    await call(ROLES.service, `select privacy_export_record_built($1, $2, $3, $4, $4, '{}'::jsonb) r`,
      [r.id, `${base}/personal-data.json`, `${base}/personal-data.pdf`, "b".repeat(64)]);
    return r;
  };

  it("M1: the download needs a fresh one-time code and stops after 5 downloads of a file", async () => {
    const id = await customer();
    const r = await buildCopy(id);
    const dl = (user, file = "pdf") => call(user, `select privacy_export_authorize_download($1, $2) r`, [r.id, file]);
    await expectError(dl(pwd(id)), /one-time code/, "the review's reproduction: a session alone no longer releases the data");
    await expectError(dl(otp(id, 11 * 60)), /one-time code/);
    for (let i = 0; i < 5; i += 1) await dl(otp(id));
    await expectError(dl(otp(id)), /downloaded 5 times/);
    assert.ok((await dl(otp(id), "json")).path.endsWith("personal-data.json"), "the limit is per file");
  });

  it("M2: a phone swap cannot pass the identity check, and a change within 30 days blocks the release", async () => {
    // The review's reproduction: change the phone, sign in by code to the new number, ask for a copy.
    const id = await customer();
    await sys(db, `update auth.users set phone = '+966512349001', phone_confirmed_at = now() where id = $1`, [id]);
    await expectError(submit(otp(id), "copy"), /changed in the last 30 days/);
    await expectError(submit(otp(id), "deletion", { review_choice: "delete_text" }), /changed in the last 30 days/);
    // A request made before the change cannot be released after it.
    const v = await customer();
    const r = await submit(otp(v), "copy");
    await sys(db, `update auth.users set email = $2 where id = $1`, [v, `swap${v.slice(-4)}@test.local`]);
    await expectError(propose(operations, r.id), /cooling-off/);
    const v2 = await customer();
    const r2 = await submit(otp(v2), "deletion", { review_choice: "delete_text" });
    const appr = (await propose(operations, r2.id)).approval_id;
    await sys(db, `update auth.users set phone = '+966512349002', phone_confirmed_at = now() where id = $1`, [v2]);
    await expectError(decide(owner2, appr), /cooling-off/);
    assert.equal(await count("profiles", "id = $1", [v2]), 1, "nothing is deleted");
    // After 30 days the customer can ask again.
    await settle(v);
    assert.equal((await propose(operations, r.id)).status, "pending_approval");
  });

  it("L1: a multiple-requests extension counts only requests the customer made or confirmed, and needs step-up", async () => {
    const id = await customer();
    const sql = `select admin_privacy_log_request($1, 'access', 'phone', now(), 'Caller asked what data we hold', '{}'::jsonb) r`;
    const logged = await call(operations, sql, [id]);
    const r = await submit(otp(id), "copy");
    const ext = `select admin_privacy_extend_request($1, 'multiple_requests', 'Several requests from this customer this year') r`;
    await expectError(call(operations, ext, [r.id]), /made or confirmed no other request/, "a staff-logged, unconfirmed request does not count");
    await expectError(call(stale(operations.sub), `select admin_privacy_extend_request($1, 'disproportionate_effort', 'Ten years of bookings to collect by hand') r`, [r.id]), /step-up required/);
    await call(otp(id), `select privacy_confirm_request($1) r`, [logged.id]);
    assert.ok((await call(operations, ext, [r.id])).extended_due_at);
  });

  it("L2: the other party's Arabic-Indic numbers and staff names are redacted from the copy", async () => {
    const id = await customer();
    const name = (await one(`select e.name_en from employees e where e.id = $1`, [SEED.employee1])).name_en;
    const conv = (await one(`insert into conversations (customer_id, provider_id) values ($1, $2) returning id`, [id, SEED.provider1])).id;
    await sys(db, `insert into messages (conversation_id, sender_id, sender_role, body) values ($1, $2, 'provider', $3)`,
      [conv, SEED.owner1, `Ask ${name} or call ٠٥٥١٢٣٤٥٦٧`]);
    const r = await submit(otp(id), "copy");
    await decide(owner, (await propose(operations, r.id)).approval_id);
    const p = await call(ROLES.service, `select privacy_export_payload($1) r`, [r.id]);
    const text = p.messages.find((c) => c.conversation_id === conv).messages[0].text;
    assert.doesNotMatch(text, /٠٥٥١٢٣٤٥٦٧/);
    assert.ok(!text.includes(name) && !text.includes(name.split(" ")[0]), text);
    assert.match(text, /\[redacted name\]/);
  });

  it("L5: withdrawing a request and changing the review choice need a fresh code", async () => {
    const id = await customer();
    const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    await expectError(call(pwd(id), `select privacy_withdraw_request($1) r`, [r.id]), /one-time code/);
    await expectError(call(pwd(id), `select privacy_set_review_choice($1, 'deleted_user') r`, [r.id]), /one-time code/);
    assert.equal((await call(otp(id), `select privacy_withdraw_request($1) r`, [r.id])).status, "withdrawn");
  });
});
