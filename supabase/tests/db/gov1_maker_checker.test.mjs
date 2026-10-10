import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// GOV-1 (D-Q5): a different administrator approves every payout, refunds >= SAR 1,000 and refunds past SAR 5,000 per
// administrator per Riyadh day; nobody approves their own request; owner break-glass only without a second eligible admin.
let db;
let owner;
let finance;
let finance2;
let operations;
let analyst;
const now = () => Math.floor(Date.now() / 1000);
const stale = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const denied = /permission denied|access required|role required|cannot|Only an owner|Only administrators/i;

const decide = (user, id, decision = "approve", reason = "Checked against the bank statement") =>
  as(db, user, `select admin_decide_approval($1, $2, $3) r`, [id, decision, reason]).then((rows) => rows[0].r);
const release = (user, payoutId, key = `key-${payoutId}`) =>
  as(db, user, `select admin_release_payout($1, $2, 'Weekly payout run', null) r`, [payoutId, key]).then((rows) => rows[0].r);
const refund = (user, bookingId, amount, key = null) =>
  as(db, user, `select admin_request_refund($1, $2, 'Customer complaint upheld', $3) r`, [bookingId, amount, key]).then((rows) => rows[0].r);

async function payoutFor(dbx, amount = 50) {
  await payableLedger(dbx, SEED.provider1, amount);
  return (await sys(dbx, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
    values ($1, $2, $3, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1, amount]))[0].id;
}

let bookingSeq = 0;
async function paidBooking(dbx, total) {
  bookingSeq += 1;
  const svc = await serviceFor(dbx, SEED.employee1);
  const customer = await createUser(dbx);
  const [b] = await sys(dbx, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
    values ($1, $2, $3, $4, 'confirmed', now() + make_interval(days => 40, mins => $5::int), 30, $6::numeric, $6::numeric, 0, $6::numeric, 0, 'marketplace', true)
    returning id`, [customer, SEED.branch1, SEED.employee1, svc.id, bookingSeq * 45, total]);
  await sys(dbx, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
    values ($1, $2, 'booking_payment', $3, $4::numeric, 0, $4::numeric, 'pending')`, [b.id, SEED.provider1, `chg_gov_${bookingSeq}_${b.id.slice(0, 8)}`, total]);
  return b.id;
}

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  await approvedDestination(db, SEED.provider1, "SA0380000000608010167519");
});

describe("payout release needs a second administrator", () => {
  it("records a pending request instead of paying, and pays once a different finance user approves", async () => {
    const id = await payoutFor(db);
    const asked = await release(finance, id);
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select status from payout_requests where id = $1`, [id]))[0].status, "requested");
    const again = await release(finance, id, "another-key");
    assert.deepEqual([again.approval_id, again.existing], [asked.approval_id, true], "one pending request per payout");

    await expectError(decide(finance, asked.approval_id), /your own request/);
    await expectError(decide(operations, asked.approval_id), denied);
    await expectError(decide(analyst, asked.approval_id), denied);
    await expectError(decide(stale(finance2), asked.approval_id), /step-up required/);

    const done = await decide(finance2, asked.approval_id);
    assert.equal(done.status, "approved");
    assert.equal(done.result.status, "success");
    const [row] = await sys(db, `select status, processed_by from payout_requests where id = $1`, [id]);
    assert.deepEqual([row.status, row.processed_by], ["paid", finance2.sub]);
    const [audit] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'payout.released' and target_id = $1`, [id]);
    assert.equal(audit.actor_id, finance2.sub);
    assert.equal(audit.details.approval_request_id, asked.approval_id);
    assert.equal((await decide(finance2, asked.approval_id)).unchanged, true, "a decided request stays decided");
  });

  it("refuses self-approval for the owner too, and lets the requester withdraw", async () => {
    const id = await payoutFor(db);
    const asked = await release(owner, id);
    await expectError(decide(owner, asked.approval_id), /your own request/);
    await expectError(as(db, finance, `select admin_cancel_approval($1, 'Not mine to withdraw')`, [asked.approval_id]), /Only the administrator who made the request/);
    const cancelled = (await as(db, owner, `select admin_cancel_approval($1, 'Raised by mistake') r`, [asked.approval_id]))[0].r;
    assert.equal(cancelled.status, "cancelled");
    await decide(finance, (await release(owner, id, "second-try")).approval_id, "reject", "Amount does not match the statement");
    assert.equal((await sys(db, `select status from payout_requests where id = $1`, [id]))[0].status, "requested", "a rejected release pays nothing");
  });

  it("refuses marking a payout paid by a direct table write", async () => {
    const id = await payoutFor(db);
    // GOV-2: a console session cannot even see the row, so the write changes nothing (or is refused outright).
    const changed = await as(db, finance, `update payout_requests set status = 'paid' where id = $1 returning id`, [id])
      .catch((error) => (/approved release|permission denied/.test(error.message) ? [] : Promise.reject(error)));
    assert.equal(changed.length, 0);
    assert.notEqual((await sys(db, `select status from payout_requests where id = $1`, [id]))[0].status, "paid");
  });
});

describe("refund thresholds", () => {
  it("runs a small refund at once and asks a second person from SAR 1,000", async () => {
    const small = await refund(finance, await paidBooking(db, 300), 200);
    assert.equal(small.status, "executed");
    assert.ok(small.refund_request_id);

    const big = await paidBooking(db, 1500);
    const asked = await refund(finance, big, 1000);
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [big]))[0].n, 0);
    await expectError(as(db, finance, `select admin_create_refund_request($1, 1000, 'Customer complaint upheld')`, [big]), /second administrator/);
    const done = await decide(finance2, asked.approval_id);
    assert.ok(done.result.refund_request_id);
    const [rr] = await sys(db, `select amount, requested_by from refund_requests where id = $1`, [done.result.refund_request_id]);
    assert.deepEqual([Number(rr.amount), rr.requested_by], [1000, finance2.sub]);
  });

  it("asks a second person once one administrator passes SAR 5,000 in a Riyadh day", async () => {
    const fresh = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
    for (let i = 0; i < 5; i += 1) assert.equal((await refund(fresh, await paidBooking(db, 990), 990)).status, "executed");
    assert.equal((await refund(fresh, await paidBooking(db, 100), 50)).status, "executed", "SAR 4,950 + 50 is not past 5,000");
    assert.equal((await refund(fresh, await paidBooking(db, 100), 1)).status, "pending_approval", "SAR 5,001 is past 5,000");
    assert.equal((await refund(finance2, await paidBooking(db, 100), 1)).status, "executed", "the total is per administrator");
  });

  it("routes a dispute refund above the threshold through approval, leaving the dispute open until then", async () => {
    const booking = await paidBooking(db, 2000);
    const [dispute] = await sys(db, `insert into payment_disputes (booking_id, customer_id, provider_id, reason, disputed_amount_sar, status)
      select b.id, b.customer_id, $2, 'Service not delivered', 1200, 'opened' from bookings b where b.id = $1 returning id`, [booking, SEED.provider1]);
    const asked = (await as(db, finance, `select resolve_booking_dispute($1, 'resolved_refund', 'Refund agreed with customer', null) r`, [dispute.id]))[0].r;
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select status from payment_disputes where id = $1`, [dispute.id]))[0].status, "opened");
    const done = await decide(owner, asked.approval_id);
    assert.equal(done.result.status, "resolved_refund");
    assert.equal((await sys(db, `select status from payment_disputes where id = $1`, [dispute.id]))[0].status, "resolved_refund");
  });

  it("refuses refunds from operations and analyst", async () => {
    const booking = await paidBooking(db, 100);
    await expectError(refund(operations, booking, 10), denied);
    await expectError(refund(analyst, booking, 10), denied);
  });
});

describe("governance thresholds change only through a second person", () => {
  it("lets an owner propose, a different money approver approve, and the new value apply", async () => {
    await expectError(as(db, finance, `select admin_request_setting_change('refund_single_approval_sar', 1500, 'Raise the threshold for the season')`), denied);
    await expectError(as(db, owner, `select admin_request_setting_change('refund_single_approval_sar', 1500, 'short')`), /at least 10/);
    await expectError(as(db, owner, `select admin_request_setting_change('no_such_key', 1500, 'Raise the threshold for the season')`), /Unknown governance setting/);
    const asked = (await as(db, owner, `select admin_request_setting_change('refund_single_approval_sar', 1500, 'Raise the threshold for the season') r`))[0].r;
    assert.equal(Number((await sys(db, `select value from governance_settings where key = 'refund_single_approval_sar'`))[0].value), 1000);
    await expectError(decide(owner, asked.approval_id), /your own request/);
    await expectError(as(db, owner, `select admin_break_glass_execute($1, 'Only owner around this weekend to approve')`, [asked.approval_id]), /never available/);
    await decide(finance, asked.approval_id);
    assert.equal(Number((await sys(db, `select value from governance_settings where key = 'refund_single_approval_sar'`))[0].value), 1500);
    await expectError(as(db, owner, `update governance_settings set value = 1 where key = 'break_glass_daily_cap_sar'`), /permission denied/);
  });
});

describe("owner break-glass", () => {
  let solo;
  let dbs;
  before(async () => {
    dbs = await createMigratedDb();
    solo = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "owner" }));
    await approvedDestination(dbs, SEED.provider1, "SA0380000000608010167519");
  });

  it("executes alone only with step-up, a 20-character justification, under the daily cap, with notice, alert and a review", async () => {
    const id = await payoutFor(dbs, 4000);
    const asked = (await as(dbs, solo, `select admin_release_payout($1, 'bg-1', 'Weekly payout run', null) r`, [id]))[0].r;
    const bg = (user, text = "Only administrator; provider waiting on rent payment") =>
      as(dbs, user, `select admin_break_glass_execute($1, $2) r`, [asked.approval_id, text]).then((rows) => rows[0].r);
    await expectError(bg(solo, "too short"), /at least 20/);
    await expectError(bg(stale(solo)), /step-up required/);
    const done = await bg(solo);
    assert.deepEqual([done.status, done.break_glass], ["approved", true]);
    assert.equal((await sys(dbs, `select status from payout_requests where id = $1`, [id]))[0].status, "paid");
    assert.equal((await sys(dbs, `select count(*)::int n from break_glass_reviews where approval_request_id = $1 and signed_off_at is null and due_at > now() + interval '6 days'`, [asked.approval_id]))[0].n, 1);
    assert.equal((await sys(dbs, `select count(*)::int n from security_alerts where kind = 'break_glass_used'`))[0].n, 1);
    assert.ok((await sys(dbs, `select count(*)::int n from governance_notifications where template_key = 'break_glass_used' and recipient_user_id = $1`, [solo.sub]))[0].n >= 1);

    const second = await payoutFor(dbs, 7000);
    const asked2 = (await as(dbs, solo, `select admin_release_payout($1, 'bg-2', 'Weekly payout run', null) r`, [second]))[0].r;
    await expectError(as(dbs, solo, `select admin_break_glass_execute($1, 'Only administrator; provider waiting on rent payment')`, [asked2.approval_id]), /daily cap/);
  });

  it("is refused once a second eligible administrator exists, and for anyone but an owner", async () => {
    const id = await payoutFor(dbs, 10);
    const asked = (await as(dbs, solo, `select admin_release_payout($1, 'bg-3', 'Weekly payout run', null) r`, [id]))[0].r;
    const helper = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "finance" }));
    await expectError(as(dbs, solo, `select admin_break_glass_execute($1, 'Only administrator; provider waiting on rent payment')`, [asked.approval_id]), /Another eligible administrator/);
    await expectError(as(dbs, helper, `select admin_break_glass_execute($1, 'Only administrator; provider waiting on rent payment')`, [asked.approval_id]), denied);
  });

  it("is signed off by a named independent reviewer with a document reference, never by the owner who used it (GOV-FIX M-4)", async () => {
    const [review] = await sys(dbs, `select id from break_glass_reviews limit 1`);
    // The finance administrator added in the previous test records the review; the owner who used break-glass cannot.
    const [helperRow] = await sys(dbs, `select user_id from admin_role_assignments where admin_role = 'finance' limit 1`);
    const reviewer = ROLES.user(helperRow.user_id);
    await expectError(as(dbs, solo, `select admin_sign_off_break_glass($1, 'Noura Al-Qahtani (external accountant)', 'AUD-2026-118')`, [review.id]), /another administrator records/);
    await expectError(as(dbs, reviewer, `select admin_sign_off_break_glass($1, 'Al', 'REF-1')`, [review.id]), /reviewer/);
    await expectError(as(dbs, reviewer, `select admin_sign_off_break_glass($1, 'External accountant', '')`, [review.id]), /document reference/);
    const signed = (await as(dbs, reviewer, `select admin_sign_off_break_glass($1, 'Noura Al-Qahtani (external accountant)', 'AUD-2026-118') r`, [review.id]))[0].r;
    assert.equal(signed.signed_off, true);
    const [audit] = await sys(dbs, `select details from admin_audit_logs where action = 'break_glass.reviewed'`);
    assert.equal(audit.details.document_reference, "AUD-2026-118");
  });
});

describe("approvals inbox", () => {
  it("lists requests with what the reader may do, for every console role, and nobody else", async () => {
    const id = await payoutFor(db);
    const asked = await release(finance, id);
    const inbox = (user) => as(db, user, `select admin_approval_inbox('pending', 50, 0) r`).then((rows) => rows[0].r);
    const mine = (await inbox(finance)).rows.find((r) => r.id === asked.approval_id);
    assert.deepEqual([mine.can_decide, mine.can_cancel], [false, true]);
    const theirs = (await inbox(finance2)).rows.find((r) => r.id === asked.approval_id);
    assert.deepEqual([theirs.can_decide, theirs.can_cancel], [true, false]);
    assert.equal((await inbox(analyst)).rows.find((r) => r.id === asked.approval_id).can_decide, false);
    assert.ok((await inbox(owner)).settings.length === 3);
    for (const user of [ROLES.user(SEED.customer), ROLES.user(SEED.owner1), ROLES.anon]) await expectError(inbox(user), denied);
    await expectError(as(db, finance, `select execution_token from admin_approval_requests limit 1`), /permission denied/);
  });
});
