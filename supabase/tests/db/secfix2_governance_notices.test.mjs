import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// SECFIX-2 R2-H4: governance notices were queued and never sent. The worker's database side: claim, inert while no sender is
// configured (visibly), sent only with the provider's message id, retry with backoff, and a changed bank account is not paid
// until its change notice was delivered or a second person waived it.
let db;
let owner;
let owner2;
let finance;
let analyst;
const claim = (channels, limit = 25) => as(db, ROLES.service, `select governance_notices_claim($1::text[], $2) r`, [channels, limit]).then((r) => r[0].r);
const record = (id, outcome, error = null, messageId = null) =>
  as(db, ROLES.service, `select governance_notice_record_result($1, $2, $3, $4) r`, [id, outcome, error, messageId]).then((r) => r[0].r);
const notice = async (template, payload, channel = "email") => (await sys(db, `insert into governance_notifications (recipient_user_id, channel, template_key, payload, destination, contact_source)
    values ($1, $2, $3, $4::jsonb, $5, 'current_verified') returning id`,
  [SEED.owner1, channel, template, JSON.stringify(payload), channel === "email" ? "owner1@example.test" : "+966500000111"]))[0].id;
const statusOf = async (id) => (await sys(db, `select status, error_message, attempts, next_attempt_at, sent_at, provider_message_id from governance_notifications where id = $1`, [id]))[0];

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  await sys(db, `update governance_notifications set status = 'skipped' where status = 'pending'`);
});

describe("R2-H4: the delivery worker's database side", () => {
  it("is inert while no sender is configured, and says so on the row and in the console", async () => {
    const id = await notice("break_glass_used", { kind: "refund", amount: 1500 });
    const out = await claim([]);
    assert.deepEqual(out.claimed, []);
    assert.ok(out.marked_undeliverable >= 1);
    const row = await statusOf(id);
    assert.deepEqual([row.status, row.error_message, row.sent_at], ["undeliverable", "undeliverable: no sender configured", null]);
    const view = (await as(db, analyst, `select admin_list_governance_notices(null, 10, 0) r`))[0].r;
    assert.equal(view.no_sender, true);
    assert.ok(view.rows.some((r) => r.id === id && r.status === "undeliverable"));
    assert.ok(!JSON.stringify(view).includes("owner1@example.test"), "the console never sees the address");
  });

  it("picks the notice up once its channel is configured, and records sent only with the provider's message id", async () => {
    const id = (await sys(db, `select id from governance_notifications where template_key = 'break_glass_used' order by created_at desc limit 1`))[0].id;
    const out = await claim(["email"]);
    const mine = out.claimed.find((n) => n.id === id);
    assert.ok(mine);
    assert.equal(mine.destination, "owner1@example.test", "the worker gets the snapshotted verified address");
    assert.equal((await statusOf(id)).status, "sending");
    await expectError(record(id, "sent"), /message id/);
    await record(id, "sent", null, "re_test_123");
    const row = await statusOf(id);
    assert.deepEqual([row.status, row.provider_message_id, row.attempts], ["sent", "re_test_123", 1]);
    assert.ok(row.sent_at);
    await expectError(record(id, "sent", null, "re_again"), /not being sent/);
  });

  it("backs off on a retry and fails after 8 attempts", async () => {
    const id = await notice("mfa_reset", {});
    await claim(["email"]);
    await record(id, "retry", "Provider unavailable (503)");
    const first = await statusOf(id);
    assert.equal(first.status, "pending");
    assert.ok(new Date(first.next_attempt_at) > new Date(Date.now() + 60 * 1000), "waits about 2 minutes");
    assert.equal((await claim(["email"])).claimed.filter((n) => n.id === id).length, 0, "not due yet");
    await sys(db, `update governance_notifications set attempts = 7, next_attempt_at = now() - interval '1 second' where id = $1`, [id]);
    await claim(["email"]);
    await record(id, "retry", "Provider unavailable (503)");
    assert.equal((await statusOf(id)).status, "failed");
  });

  it("only the service role claims or records", async () => {
    for (const user of [owner, finance, analyst, ROLES.user(SEED.owner1), ROLES.anon]) {
      await expectError(as(db, user, `select governance_notices_claim(array['email'], 5)`), /Service role required|permission denied/);
      await expectError(as(db, user, `select governance_notice_record_result(gen_random_uuid(), 'sent', null, 'x')`), /Service role required|permission denied/);
    }
  });
});

describe("R2-H4: a changed bank account is paid only after the provider was told", () => {
  let destination;
  let payoutId;
  const IBAN = "SA4420000001234567891234";
  before(async () => {
    destination = await approvedDestination(db, SEED.provider1, IBAN);
    await sys(db, `update provider_payout_destinations set approved_by = $2 where id = $1`, [destination, finance.sub]);
    await notice("payout_account_change_requested", { provider_id: SEED.provider1, iban_masked: "SA44 **** 1234", bank_name: "Test Bank", destination_id: destination });
    await claim([]);
    await payableLedger(db, SEED.provider1, 300);
    payoutId = (await as(db, ROLES.user(SEED.owner1), `select (request_provider_payout($1, 50, null, null)).id`, [SEED.provider1]))[0].id;
  });

  it("refuses the release while the change notice is undelivered (queued only)", async () => {
    await expectError(as(db, finance, `select admin_release_payout($1, 'pay-sec2-h4-1', 'Weekly payout', null)`, [payoutId]), /not yet been told/);
    const ledger = await payableLedger(db, SEED.provider1, 40);
    await expectError(as(db, finance, `select admin_release_ledger_item($1, 'Paid by hand', 'TRX-998877')`, [ledger]), /not yet been told/);
  });

  it("a waiver needs iban.approve, step-up, a 20-character reason and a person other than the requester or approver", async () => {
    await expectError(as(db, analyst, `select admin_waive_payout_account_notice($1, 'Provider confirmed by phone call today')`, [destination]), /cannot waive/);
    await expectError(as(db, finance, `select admin_waive_payout_account_notice($1, 'Provider confirmed by phone call today')`, [destination]), /second person/);
    await expectError(as(db, owner, `select admin_waive_payout_account_notice($1, 'phoned')`, [destination]), /20 characters/);
    const out = (await as(db, owner, `select admin_waive_payout_account_notice($1, 'Provider confirmed the change by a recorded call') r`, [destination]))[0].r;
    assert.equal(out.notices_waived, 1);
    const [n] = await sys(db, `select status, waived_by from governance_notifications where payload->>'destination_id' = $1`, [destination]);
    assert.deepEqual([n.status, n.waived_by], ["waived", owner.sub]);
    const asked = (await as(db, finance, `select admin_release_payout($1, 'pay-sec2-h4-1', 'Weekly payout', null) r`, [payoutId]))[0].r;
    assert.equal(asked.status, "pending_approval", "the release goes on to the usual second approver");
  });

  it("a delivered notice clears the account without a waiver", async () => {
    const other = await approvedDestination(db, SEED.provider2, "SA0380000000608010167519");
    const id = await notice("payout_account_change_requested", { provider_id: SEED.provider2, iban_masked: "SA03 **** 7519", destination_id: other });
    assert.equal((await sys(db, `select payout_destination_notice_state($1) s`, [other]))[0].s, "undelivered");
    await claim(["email"]);
    await record(id, "sent", null, "re_test_456");
    assert.equal((await sys(db, `select payout_destination_notice_state($1) s`, [other]))[0].s, "delivered");
  });
});
