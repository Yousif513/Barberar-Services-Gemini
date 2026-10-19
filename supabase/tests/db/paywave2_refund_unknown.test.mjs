// PAY-WAVE2, QA release gate item 4 (docs/reviews/2026-10-17-qa-release-gate.md): a refund whose outcome at Tap is unknown is never
// sent again automatically; only Check with Tap (apply_tap_refund_lookup) or an approved decision (refund_outcome) settles it.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let finance;
let finance2;
let operations;
let analyst;
let owner;
const customer = ROLES.user(SEED.customer);
const providerOwner = ROLES.user(SEED.owner1);
let seq = 0;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
});

// A cancelled paid booking with its captured deposit in the ledger and one refund request in the given state.
async function refundRow({ status = "processing", amount = 40, gateway = null } = {}) {
  seq += 1;
  const cust = await createUser(db);
  const b = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit)
     values ($1, $2, $3, $4, 'cancelled', now() + make_interval(days => 5, mins => $5::int), 30, 100, 100, 15, $6::numeric, 10, 'marketplace', true) returning id`,
    [cust, SEED.branch1, SEED.employee1, svc.id, seq * 35, amount]))[0];
  const charge = `chg_pw2_unknown_${seq}`;
  const ledger = (await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                                 values ($1, $2, 'booking_payment', $3, $4::numeric, 10, $4::numeric - 10, 'refund_pending') returning id`, [b.id, SEED.provider1, charge, amount]))[0].id;
  const id = (await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key, claimed_at, gateway_refund_id)
                             values ($1, $2, $3, $4, 'Customer cancelled', 'customer_cancellation', 'pending', 0, $5, null, $6) returning id`,
    [b.id, ledger, charge, amount, `pw2-unknown-${seq}`, gateway]))[0].id;
  if (status !== "pending") {
    await as(db, ROLES.service, `select claim_refund_request($1)`, [id]);
    if (status === "unknown") await as(db, ROLES.service, `select record_refund_outcome_unknown($1, 'Tap did not answer in time', $2)`, [id, gateway]);
  }
  return { id, bookingId: b.id, charge, ledger };
}
const statusOf = async (id) => (await sys(db, `select status from refund_requests where id = $1`, [id]))[0].status;
const lookup = (id, actor, found, tapId, tapStatus, amount, chargeId) =>
  as(db, ROLES.service, `select apply_tap_refund_lookup($1, $2, $3, $4, $5, $6, $7) r`, [id, actor, found, tapId, tapStatus, amount, chargeId]).then((r) => r[0].r);
const auditFor = async (action, id) => sys(db, `select actor_id, details from admin_audit_logs where action = $1 and target_id = $2 order by created_at`, [action, id]);

describe("recording an unknown outcome", () => {
  it("is a service-role step from 'processing' only; no person can mark or unmark it", async () => {
    const r = await refundRow({ status: "processing" });
    for (const user of [customer, providerOwner, finance, owner]) {
      await expectError(as(db, user, `select record_refund_outcome_unknown($1, 'x')`, [r.id]), /permission denied|Service role required/);
    }
    await expectError(as(db, ROLES.anon, `select record_refund_outcome_unknown($1, 'x')`, [r.id]), /permission denied/);
    const first = (await as(db, ROLES.service, `select record_refund_outcome_unknown($1, 'Timed out after 20 s', 're_seen_1', 'SOMETHING_NEW') r`, [r.id]))[0].r;
    assert.deepEqual([first.status, first.replayed], ["unknown", false]);
    const again = (await as(db, ROLES.service, `select record_refund_outcome_unknown($1, 'again') r`, [r.id]))[0].r;
    assert.equal(again.replayed, true);
    const row = (await sys(db, `select * from refund_requests where id = $1`, [r.id]))[0];
    assert.equal(row.status, "unknown");
    assert.ok(row.outcome_unknown_at);
    assert.equal(row.gateway_refund_id, "re_seen_1");
    assert.equal(row.gateway_status_raw, "SOMETHING_NEW");
    assert.equal((await auditFor("refund.outcome_unknown", r.id)).length, 1);
    const pending = await refundRow({ status: "pending" });
    await expectError(as(db, ROLES.service, `select record_refund_outcome_unknown($1, 'x')`, [pending.id]), /Only a refund being processed/);
  });

  it("is never claimed again, never retried by an operator, and the scheduler queue does not contain it", async () => {
    const r = await refundRow({ status: "unknown" });
    const claim = (await as(db, ROLES.service, `select claim_refund_request($1) r`, [r.id]))[0].r;
    assert.equal(claim.claimed, false);
    await expectError(as(db, finance, `select admin_retry_refund_request($1, 'Customer is waiting')`, [r.id]), /never sent again/);
    await expectError(as(db, owner, `select admin_retry_refund_request($1, 'Customer is waiting')`, [r.id]), /never sent again/);
    const queue = await sys(db, `select id from refund_requests where status in ('pending', 'failed') and attempts < 5 and id = $1`, [r.id]);
    assert.equal(queue.length, 0);
    assert.equal(await statusOf(r.id), "unknown");
    await expectError(sys(db, `update refund_requests set status = 'unknown', outcome_unknown_at = null where id = $1`, [r.id]), /refund_requests_unknown_has_time/);
  });

  it("counts as open money: no second refund can be created for the same booking while it is unknown", async () => {
    const r = await refundRow({ status: "unknown", amount: 40 });
    const second = (await as(db, ROLES.service, `select create_refund_request_internal($1::uuid, 40, 'admin', 'second try', $2) id`, [r.bookingId, `pw2-second-${r.id}`]))[0].id;
    assert.equal(second, null, "the whole captured amount is already owed by the unknown refund");
    const failed = await refundRow({ status: "processing", amount: 40 });
    await as(db, ROLES.service, `select complete_refund_request($1, false, null, 'Tap refused')`, [failed.id]);
    const afterFailed = (await as(db, ROLES.service, `select create_refund_request_internal($1::uuid, 40, 'admin', 'second try', $2) id`, [failed.bookingId, `pw2-second-f-${failed.id}`]))[0].id;
    assert.equal(afterFailed, null, "a failed refund is still owed and is retried, so it is not created twice");
  });

  it("is listed under Needs attention and on its own filter, with what is needed to settle it", async () => {
    const r = await refundRow({ status: "unknown" });
    const unknown = (await as(db, finance, `select admin_list_refund_requests('unknown', 200, 0, 'finance_operations') r`))[0].r;
    const row = unknown.rows.find((x) => x.id === r.id);
    assert.ok(row);
    assert.equal(row.status, "unknown");
    assert.equal(row.tap_check_due, true, "Check with Tap opens at once for an unknown refund");
    assert.ok(row.outcome_unknown_at);
    assert.equal(row.pending_decision_id, null);
    const attention = (await as(db, finance, `select admin_list_refund_requests('attention', 200, 0, 'finance_operations') r`))[0].r;
    assert.ok(attention.rows.some((x) => x.id === r.id));
    const overview = (await as(db, owner, `select admin_dashboard_overview() o`))[0].o;
    const queue = overview.queues.find((q) => q.key === "refund_requests");
    assert.ok(Number(queue.unknown) >= 1);
    await expectError(as(db, operations, `select admin_list_refund_requests('unknown', 25, 0, 'finance_operations')`), /42501|not|permission|cannot/i);
  });
});

describe("Check with Tap for an unknown refund", () => {
  it("opens at once, for finance and owner only, and answers what the function needs to search Tap", async () => {
    const r = await refundRow({ status: "unknown" });
    const begun = (await as(db, finance, `select admin_begin_tap_refund_check($1) r`, [r.id]))[0].r;
    assert.equal(begun.status, "unknown");
    assert.equal(begun.charge_id, r.charge);
    assert.equal(begun.gateway_refund_id, null);
    assert.ok(begun.search_from);
    for (const user of [operations, analyst, customer, providerOwner]) {
      await expectError(as(db, user, `select admin_begin_tap_refund_check($1)`, [r.id]), /cannot check refunds|Administrator|permission/);
    }
    await expectError(as(db, ROLES.user(finance.sub, { amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }], aal: "aal1" }),
      `select admin_begin_tap_refund_check($1)`, [r.id]), /step-up|authenticator/);
  });

  it("not found at Tap changes nothing but the count; only the service role applies an answer, for an actor holding money.refund", async () => {
    const r = await refundRow({ status: "unknown" });
    await expectError(as(db, finance, `select apply_tap_refund_lookup($1, $2, false, null, null, null, null)`, [r.id, finance.sub]), /permission denied|Service role required/);
    await expectError(lookup(r.id, operations.sub, false, null, null, null, null), /cannot check refunds/);
    const answer = await lookup(r.id, finance.sub, false, null, null, null, null);
    assert.deepEqual([answer.found, answer.status], [false, "unknown"]);
    const row = (await sys(db, `select status, tap_checks, last_tap_check_at from refund_requests where id = $1`, [r.id]))[0];
    assert.deepEqual([row.status, row.tap_checks], ["unknown", 1]);
    assert.ok(row.last_tap_check_at);
    assert.equal((await auditFor("refund.checked_with_tap", r.id)).at(-1).details.result, "not_found");
  });

  it("a refund Tap issued completes as a success with its ledger effect; a different amount opens a reconciliation break", async () => {
    const r = await refundRow({ status: "unknown", amount: 40 });
    await expectError(lookup(r.id, finance.sub, true, "re_pw2_issued", "REFUNDED", 40, "chg_someone_else"), /different charge/);
    await expectError(lookup(r.id, finance.sub, true, "../bad", "REFUNDED", 40, r.charge), /did not name the refund/);
    const answer = await lookup(r.id, finance.sub, true, `re_pw2_issued_${r.id.slice(0, 8)}`, "REFUNDED", 39.5, r.charge);
    assert.deepEqual([answer.found, answer.status], [true, "succeeded"]);
    const row = (await sys(db, `select status, gateway_refund_id, gateway_status, outcome_resolved_via, processed_at from refund_requests where id = $1`, [r.id]))[0];
    assert.deepEqual([row.status, row.gateway_status, row.outcome_resolved_via], ["succeeded", "succeeded", "check_with_tap"]);
    assert.ok(row.processed_at);
    const ledger = (await sys(db, `select refunded_amount from transactional_ledger where id = $1`, [r.ledger]))[0];
    assert.equal(Number(ledger.refunded_amount), 40);
    const breaks = await sys(db, `select kind from reconciliation_breaks where refund_request_id = $1`, [r.id]);
    assert.ok(breaks.some((b) => b.kind === "refund_amount_mismatch"));
    await expectError(lookup(r.id, finance.sub, true, `re_pw2_issued_${r.id.slice(0, 8)}`, "REFUNDED", 40, r.charge), /no longer of unknown outcome/);
  });

  it("a refund Tap failed becomes retryable; a Tap refund already recorded for another request is refused", async () => {
    const r = await refundRow({ status: "unknown" });
    const answer = await lookup(r.id, finance.sub, true, "re_pw2_failed", "DECLINED", 40, r.charge);
    assert.equal(answer.status, "failed");
    assert.equal(await statusOf(r.id), "failed");
    await as(db, finance, `select admin_retry_refund_request($1, 'Tap says it failed, send again')`, [r.id]);
    const other = await refundRow({ status: "unknown" });
    await expectError(lookup(other.id, finance.sub, true, "re_pw2_failed", "REFUNDED", 40, other.charge), /already recorded for another refund request/);
    assert.equal(await statusOf(other.id), "unknown");
  });
});

describe("an approved decision on an unknown refund", () => {
  const ask = (user, id, outcome, tapId, reason = "The Tap dashboard shows this refund on the charge") =>
    as(db, user, `select admin_request_refund_outcome_decision($1, $2, $3, $4) r`, [id, outcome, tapId, reason]).then((x) => x[0].r);
  const decide = (user, approvalId, decision = "approve") =>
    as(db, user, `select admin_decide_approval($1, $2, 'Checked the Tap dashboard myself') r`, [approvalId, decision]).then((x) => x[0].r);

  it("is asked only by a money.refund holder after step-up, with a reason, for an unknown refund, citing the Tap refund id when one exists", async () => {
    const r = await refundRow({ status: "unknown" });
    for (const user of [operations, analyst, customer, providerOwner]) {
      await expectError(ask(user, r.id, "refunded_at_tap", "re_x_1"), /cannot decide refunds|permission|Administrator/);
    }
    await expectError(ask(ROLES.anon, r.id, "refunded_at_tap", "re_x_1"), /permission denied/);
    await expectError(ask(finance, r.id, "refunded_at_tap", "re_x_1", "short"), /at least 10 characters/);
    await expectError(ask(finance, r.id, "maybe", null), /Say whether Tap shows/);
    await expectError(ask(finance, r.id, "refunded_at_tap", null), /Give the Tap refund id/);
    await expectError(ask(finance, r.id, "not_refunded_at_tap", "re_x_1", "Tap shows nothing for this charge"), /A Tap refund id means a refund exists/);
    const processing = await refundRow({ status: "processing" });
    await expectError(ask(finance, processing.id, "refunded_at_tap", "re_x_2"), /Only a refund whose outcome is unknown/);
    await expectError(as(db, ROLES.user(finance.sub, { aal: "aal1", amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] }),
      `select admin_request_refund_outcome_decision($1, 'refunded_at_tap', 're_x_3', 'The Tap dashboard shows it')`, [r.id]), /step-up|authenticator/);
    assert.equal(await statusOf(r.id), "unknown");
  });

  it("changes nothing until a different money.refund holder approves; then a paid refund completes with its ledger effect", async () => {
    const r = await refundRow({ status: "unknown", amount: 40 });
    const tapId = `re_pw2_manual_${r.id.slice(0, 8)}`;
    const asked = await ask(finance, r.id, "refunded_at_tap", tapId);
    assert.equal(asked.status, "pending_approval");
    assert.equal(await statusOf(r.id), "unknown", "asking moves nothing");
    const listed = (await as(db, finance, `select admin_list_refund_requests('unknown', 200, 0, 'finance_operations') r`))[0].r.rows.find((x) => x.id === r.id);
    assert.equal(listed.pending_decision_id, asked.approval_id);
    await expectError(decide(finance, asked.approval_id), /cannot approve or reject your own request/);
    await expectError(decide(operations, asked.approval_id), /cannot decide refund_outcome requests/);
    await expectError(decide(analyst, asked.approval_id), /cannot decide refund_outcome requests/);
    await expectError(as(db, finance, `select admin_break_glass_execute($1, 'Only one admin is on duty for this request')`, [asked.approval_id]), /never available|Break-glass|permission/i);
    // The approver's session cannot complete a refund outside the approved execution.
    await expectError(as(db, finance2, `select complete_refund_request($1, true, 're_direct', null)`, [r.id]), /permission denied|Service role required/);
    const done = await decide(finance2, asked.approval_id);
    assert.equal(done.status, "approved");
    assert.equal(done.result.status, "succeeded");
    const row = (await sys(db, `select status, gateway_refund_id, outcome_resolved_via from refund_requests where id = $1`, [r.id]))[0];
    assert.deepEqual([row.status, row.gateway_refund_id, row.outcome_resolved_via], ["succeeded", tapId, "approved_decision"]);
    assert.equal(Number((await sys(db, `select refunded_amount from transactional_ledger where id = $1`, [r.ledger]))[0].refunded_amount), 40);
    const audit = (await auditFor("refund.outcome_decided", r.id))[0];
    assert.equal(audit.details.requested_by, finance.sub);
    assert.equal(audit.details.approved_by, finance2.sub);
  });

  it("'no refund at Tap' makes it retryable only after approval; a decision that no longer fits is refused at approval", async () => {
    const r = await refundRow({ status: "unknown" });
    const asked = await ask(finance, r.id, "not_refunded_at_tap", null, "Tap shows no refund at all on this charge");
    await decide(owner, asked.approval_id);
    assert.equal(await statusOf(r.id), "failed");
    await as(db, finance, `select admin_retry_refund_request($1, 'Two people confirmed nothing was paid')`, [r.id]);

    const stale = await refundRow({ status: "unknown" });
    const pending = await ask(finance, stale.id, "not_refunded_at_tap", null, "Tap shows no refund at all on this charge");
    await lookup(stale.id, owner.sub, true, `re_pw2_stale_${stale.id.slice(0, 8)}`, "REFUNDED", 40, stale.charge);
    await expectError(decide(finance2, pending.approval_id), /no longer of unknown outcome/);
    assert.equal(await statusOf(stale.id), "succeeded");
  });
});
