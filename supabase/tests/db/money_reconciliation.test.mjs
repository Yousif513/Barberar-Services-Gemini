import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// MONEY part 4 (D-Q9): itemised daily reconciliation against Tap, breaks resolved only by an approved correction citing the Tap
// object, escalation after 3 business days, "Check with Tap" after 2 business days, refund timelines.
let db;
let owner;
let finance;
let finance2;
let operations;
let analyst;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const now = () => Math.floor(Date.now() / 1000);
const stale = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const DAY = "2026-09-20"; // a Sunday, in the past
const ev = (object_type, tap_object_id, amount, extra = {}) => ({ object_type, tap_object_id, amount: String(amount), currency: "SAR", status: "CAPTURED", ...extra });
const importTap = (day, events) => as(db, ROLES.service, `select record_tap_reconciliation_import($1::date, $2::jsonb) r`, [day, JSON.stringify(events)]).then((r) => r[0].r);
const run = (user, day) => as(db, user, `select run_tap_reconciliation($1::date) r`, [day]).then((r) => r[0].r);
const breaks = (day) => sys(db, `select * from reconciliation_breaks where business_day = $1 order by kind, subject`, [day]);

let bookingSeq = 0;
async function capturedBooking(day, intent, amount) {
  bookingSeq += 1;
  const svc = await serviceFor(db, SEED.employee1);
  const [b] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price,
      total_price, tax_amount, deposit_required, platform_commission, source)
    values ($1, $2, $3, $4, 'confirmed', now() + make_interval(days => 30, mins => $5::int), 30, $6, $6, 0, $6, 0, 'marketplace') returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, svc.id, bookingSeq * 40, amount]);
  const [l] = await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status, created_at)
    values ($1, $2, 'booking_payment', $3, $4, 0, $4, 'pending', ($5::date + time '12:00') at time zone 'Asia/Riyadh') returning id`, [b.id, SEED.provider1, intent, amount, day]);
  return { bookingId: b.id, ledgerId: l.id };
}

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("Saudi business days", () => {
  it("skip Friday and Saturday in Riyadh", async () => {
    const [r] = await sys(db, `select saudi_add_business_days('2026-10-08 10:00+03', 1) a, saudi_add_business_days('2026-10-08 10:00+03', 3) b,
      saudi_business_days_between('2026-10-08 10:00+03', '2026-10-11 10:00+03') c`);
    assert.equal(new Date(r.a).toISOString(), "2026-10-11T07:00:00.000Z", "Thursday + 1 business day is Sunday");
    assert.equal(new Date(r.b).toISOString(), "2026-10-13T07:00:00.000Z");
    assert.equal(r.c, 1);
  });
});

describe("the daily reconciliation", () => {
  let matched;
  let missingAtTap;
  it("records nothing as matched without Tap data", async () => {
    const r = await run(finance, "2026-09-10");
    assert.equal(r.status, "no_tap_data");
  });

  it("opens a break for every unmatched or different Tap charge, refund and ledger payment, once", async () => {
    matched = await capturedBooking(DAY, "chg_rec_ok", 100);
    await capturedBooking(DAY, "chg_rec_diff", 80);
    missingAtTap = await capturedBooking(DAY, "chg_rec_late", 60);
    await importTap(DAY, [ev("charge", "chg_rec_ok", 100), ev("charge", "chg_rec_diff", 85), ev("charge", "chg_rec_unknown", 40),
      ev("refund", "re_rec_unknown", 15, { status: "REFUNDED" })]);
    const r = await run(finance, DAY);
    assert.equal(r.status, "breaks");
    const kinds = (await breaks(DAY)).map((b) => `${b.kind}:${b.subject}`);
    assert.deepEqual(kinds, ["charge_amount_mismatch:chg_rec_diff", "charge_missing_in_ledger:chg_rec_unknown", "ledger_missing_at_tap:chg_rec_late",
      "refund_missing_in_ledger:re_rec_unknown"]);
    const [diff] = (await breaks(DAY)).filter((b) => b.kind === "charge_amount_mismatch");
    assert.deepEqual([Number(diff.tap_amount), Number(diff.ledger_amount), Number(diff.difference)], [85, 80, 5]);
    assert.ok(new Date(diff.escalate_after) > new Date(), "escalates after 3 business days");
    await run(finance, DAY);
    assert.equal((await breaks(DAY)).length, 4, "a rerun opens nothing twice");
  });

  it("closes a timing difference as auto-matched when Tap's own data later shows the charge", async () => {
    await importTap(DAY, [ev("charge", "chg_rec_late", 60)]);
    await run(finance, DAY);
    const [late] = (await breaks(DAY)).filter((b) => b.subject === "chg_rec_late");
    assert.equal(late.status, "auto_matched");
    assert.equal(late.ledger_id, missingAtTap.ledgerId);
  });

  it("matches each Tap settlement to a bank-statement credit and never auto-closes a settlement break", async () => {
    const day = "2026-09-21";
    // SECFIX-2 R2-H3: a console file import is staged and applied only when a second money.ledger holder approves it.
    const approve = async (staged) => as(db, finance2, `select admin_decide_approval($1, 'approve', 'File checked against the portal')`, [staged[0].r.approval_id]);
    await approve(await as(db, finance, `select admin_import_reconciliation_file('tap_settlement_file', $1::date, $2::jsonb, 'Tap settlement report for the day') r`,
      [day, JSON.stringify([{ object_type: "settlement", tap_object_id: "stl_rec_1", amount: "500.00", currency: "SAR" }])]));
    await run(finance, day);
    assert.deepEqual((await breaks(day)).map((b) => b.kind), ["settlement_missing_in_bank"]);
    await approve(await as(db, finance, `select admin_import_reconciliation_file('bank_statement', $1::date, $2::jsonb, 'Bank statement for the settlement day') r`,
      [day, JSON.stringify([{ object_type: "bank_credit", tap_object_id: "bank-line-1", reference: "stl_rec_1", amount: "495.00", currency: "SAR" }])]));
    await run(finance, day);
    const rows = await breaks(day);
    assert.deepEqual(rows.map((b) => [b.kind, b.status]), [["settlement_amount_mismatch", "open"], ["settlement_missing_in_bank", "open"]]);
  });

  it("validates input, needs money.ledger and a fresh step-up, and refuses today", async () => {
    await expectError(run(finance, new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10)), /has ended/);
    await expectError(run(stale(finance), DAY), /step-up required/);
    for (const user of [operations, analyst, customer, owner1, ROLES.anon]) assert.equal(await outcome(run(user, DAY)), "42501");
    for (const user of [finance, owner, customer]) assert.equal(await outcome(importTap(DAY, []).then(() => as(db, user, `select record_tap_reconciliation_import('2026-09-20', '[]'::jsonb)`))), "42501");
    const file = (user, rows, source = "bank_statement") => as(db, user, `select admin_import_reconciliation_file($1, '2026-09-22', $2::jsonb, 'Bank statement for the day')`, [source, JSON.stringify(rows)]);
    await expectError(file(finance, [{ object_type: "bank_credit", tap_object_id: "x-1", amount: "10", currency: "USD" }]), /currency SAR/);
    await expectError(file(finance, [{ object_type: "charge", tap_object_id: "chg_forged", amount: "10", currency: "SAR" }]), /charges and refunds come only from the Tap API/);
    await expectError(file(finance, [], "tap_api"), /Tap settlement file or the bank statement/);
    for (const user of [operations, analyst, customer]) assert.equal(await outcome(file(user, [])), "42501");
  });

  it("keeps evidence and breaks out of every client's reach", async () => {
    for (const user of [owner, finance, customer]) {
      for (const sql of [`update reconciliation_breaks set status = 'resolved'`, `delete from tap_reconciliation_events`, `insert into tap_reconciliation_runs (business_day, status) values ('2026-01-01', 'matched')`]) {
        assert.equal(await outcome(as(db, user, sql)), "42501", sql);
      }
    }
    await expectError(sys(db, `update tap_reconciliation_events set amount = 1`), /never change/);
    await expectError(sys(db, `update reconciliation_breaks set status = 'resolved' where status = 'open'`), /resolved only by an approved correction|reconciliation_breaks_check/);
    assert.equal((await as(db, operations, `select count(*)::int n from reconciliation_breaks`))[0].n, 0, "operations reads no reconciliation");
  });
});

describe("resolving a break", () => {
  it("needs an approved correction by a different administrator that cites the Tap object", async () => {
    const [diff] = (await breaks(DAY)).filter((b) => b.kind === "charge_amount_mismatch");
    const asked = (await as(db, finance, `select admin_propose_break_resolution($1, 5, 0, 'Tap captured 85.00, the ledger recorded 80.00', 'break-key-1') r`, [diff.id]))[0].r;
    assert.equal(asked.status, "pending_approval");
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Mine to approve')`, [asked.approval_id]), /your own request/);
    for (const user of [operations, analyst, customer]) {
      assert.equal(await outcome(as(db, user, `select admin_propose_break_resolution($1, 5, 0, 'Tap captured 85.00, ledger 80.00', 'k2')`, [diff.id])), "42501");
    }
    const done = (await as(db, finance2, `select admin_decide_approval($1, 'approve', 'Checked in the Tap dashboard') r`, [asked.approval_id]))[0].r;
    const [b] = await sys(db, `select status, resolution_entry_id, approval_request_id, resolved_by from reconciliation_breaks where id = $1`, [diff.id]);
    assert.deepEqual([b.status, b.resolution_entry_id, b.approval_request_id, b.resolved_by], ["resolved", done.result.entry_id, asked.approval_id, finance2.sub]);
    const [entry] = await sys(db, `select tap_object_id, reason_code, adjusts_entry_id from transactional_ledger where id = $1`, [done.result.entry_id]);
    assert.deepEqual([entry.tap_object_id, entry.reason_code], ["chg_rec_diff", "reconciliation_break"]);
    await expectError(as(db, finance, `select admin_propose_break_resolution($1, 5, 0, 'Second attempt on a closed break', 'break-key-3')`, [diff.id]), /already resolved/);
  });
});

describe("escalation", () => {
  it("escalates a break open more than 3 business days to every owner, once", async () => {
    const [b] = await sys(db, `insert into reconciliation_breaks (business_day, kind, subject, tap_object_id, tap_amount, difference, escalate_after, opened_at)
      values ('2026-09-01', 'charge_missing_in_ledger', 'chg_rec_old', 'chg_rec_old', 30, 30, now() - interval '1 hour', now() - interval '6 days') returning id`);
    const before = (await sys(db, `select count(*)::int n from governance_notifications where template_key = 'reconciliation_break_escalated'`))[0].n;
    assert.ok((await as(db, finance, `select escalate_reconciliation_breaks() n`))[0].n >= 1);
    const [row] = await sys(db, `select status, escalated_at from reconciliation_breaks where id = $1`, [b.id]);
    assert.equal(row.status, "escalated");
    assert.ok((await sys(db, `select count(*)::int n from governance_notifications where template_key = 'reconciliation_break_escalated'`))[0].n > before);
    assert.equal((await as(db, finance, `select escalate_reconciliation_breaks() n`))[0].n, 0, "escalated once");
    assert.equal(await outcome(as(db, operations, `select escalate_reconciliation_breaks()`)), "42501");
  });
});

describe("refund timelines and Check with Tap", () => {
  let refundId;
  before(async () => {
    const paid = await capturedBooking("2026-09-25", "chg_rec_refund", 200);
    refundId = (await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key, status, gateway_refund_id,
        processed_at, entitled_at, gateway_status)
      values ($1, $2, 'chg_rec_refund', 50, 'Customer cancelled', 'admin', 'rec-refund-1', 'succeeded', 're_rec_slow', now() - interval '6 days', now() - interval '7 days', 'processing')
      returning id`, [paid.bookingId, paid.ledgerId]))[0].id;
  });

  it("opens only for a refund still processing at Tap after 2 business days, for money.refund roles with step-up", async () => {
    const begun = (await as(db, finance, `select admin_begin_tap_refund_check($1) r`, [refundId]))[0].r;
    assert.equal(begun.gateway_refund_id, "re_rec_slow");
    for (const user of [operations, analyst, customer, owner1]) assert.equal(await outcome(as(db, user, `select admin_begin_tap_refund_check($1)`, [refundId])), "42501");
    await expectError(as(db, stale(finance), `select admin_begin_tap_refund_check($1)`, [refundId]), /step-up required/);
    const fresh = (await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key, status, gateway_refund_id, processed_at, gateway_status)
      select booking_id, ledger_id, payment_intent_id, 10, 'x', 'admin', 'rec-refund-2', 'succeeded', 're_rec_new', now(), 'processing' from refund_requests where id = $1 returning id`, [refundId]))[0].id;
    await expectError(as(db, finance, `select admin_begin_tap_refund_check($1)`, [fresh]), /after 2 business days/);
  });

  it("records Tap's answer through the server only, logged with the administrator who asked", async () => {
    const apply = (user, status, tapId = "re_rec_slow", actor = finance.sub, amount = 50) =>
      as(db, user, `select apply_tap_refund_status($1, $2, $3, $4, $5) r`, [refundId, actor, tapId, status, amount]).then((r) => r[0].r);
    for (const user of [finance, owner, customer, ROLES.anon]) assert.equal(await outcome(apply(user, "REFUNDED")), "42501");
    await expectError(apply(ROLES.service, "REFUNDED", "re_other"), /different refund/);
    await expectError(apply(ROLES.service, "REFUNDED", "re_rec_slow", operations.sub), /cannot check refunds/);
    const r = await apply(ROLES.service, "REFUNDED");
    assert.deepEqual([r.state, r.state_before], ["succeeded", "processing"]);
    const [row] = await sys(db, `select gateway_status, gateway_succeeded_at, tap_checks from refund_requests where id = $1`, [refundId]);
    assert.equal(row.gateway_status, "succeeded");
    assert.ok(row.gateway_succeeded_at);
    assert.equal(row.tap_checks, 1);
    const [audit] = await sys(db, `select details from admin_audit_logs where action = 'refund.checked_with_tap' and target_id = $1`, [refundId]);
    assert.equal(audit.details.actor_id, finance.sub);
    assert.equal(audit.details.tap_status, "REFUNDED");
  });

  it("opens a break when Tap reports a booked refund failed, and lets only the server record the create status", async () => {
    await as(db, ROLES.service, `select record_refund_gateway_status($1, 'FAILED', null)`, [refundId]);
    assert.equal((await sys(db, `select count(*)::int n from reconciliation_breaks where kind = 'refund_failed_at_tap' and refund_request_id = $1`, [refundId]))[0].n, 1);
    for (const user of [finance, customer]) assert.equal(await outcome(as(db, user, `select record_refund_gateway_status($1, 'REFUNDED', null)`, [refundId])), "42501");
  });

  it("shows the timelines in the console overview to money.ledger roles only", async () => {
    const view = (await as(db, finance, `select admin_reconciliation_overview('open', 25, 0) v`))[0].v;
    const refund = view.refunds.find((r) => r.id === refundId);
    assert.ok(refund.initiate_by && refund.succeed_by);
    assert.equal(typeof refund.completion_late, "boolean");
    assert.ok(view.breaks.length >= 1);
    for (const user of [operations, analyst, customer, ROLES.anon]) assert.equal(await outcome(as(db, user, `select admin_reconciliation_overview('open', 25, 0)`)), "42501");
  });
});
