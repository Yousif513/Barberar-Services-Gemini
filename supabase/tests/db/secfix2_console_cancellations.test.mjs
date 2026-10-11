import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// SECFIX-2 R2-H2: an operations session (no money permission) cancelled any confirmed booking through cancel_booking and
// queued a full refund with no step-up, no threshold, no daily cap and no second person. The reproduction must now fail.
let db;
let owner;
let finance;
let operations;
let operations2;
let analyst;
let customer;
let svc;
let seq = 0;
const stale = (user) => ({ ...user, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 3600 }] });

// A confirmed booking with the given amount captured at Tap (booking_payment ledger row).
async function capturedBooking(amount, { daysAhead = 40, status = "confirmed" } = {}) {
  seq += 1;
  const [{ id }] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
    values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval + ($7 || ' minutes')::interval, 30, $8, $8, 0, $8, 0, 'marketplace', false) returning id`,
    [customer, SEED.branch1, SEED.employee1, svc.id, status, String(daysAhead), String(seq * 45), amount]);
  if (amount > 0) {
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, $2, 'booking_payment', $3, $4, 0, $4, 'pending')`, [id, SEED.provider1, `chg_secfix2_cancel_${seq}`, amount]);
  }
  return id;
}
const refunds = (bookingId) => sys(db, `select amount::float8 amount, source, requested_by from refund_requests where booking_id = $1`, [bookingId]);
const statusOf = async (bookingId) => (await sys(db, `select status from bookings where id = $1`, [bookingId]))[0].status;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  operations2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = await createUser(db);
  svc = await serviceFor(db, SEED.employee1);
  // Approvers granted long ago (GOV-FIX H-2 cooling-off does not apply to these fixtures).
  await sys(db, `update admin_role_assignments set decisions_allowed_from = now() - interval '1 day'`).catch(() => {});
});

describe("R2-H2: the report's reproduction now fails", () => {
  it("operations with a stale session cannot cancel a captured SAR 4,500 booking through cancel_booking, and no refund is queued", async () => {
    const booking = await capturedBooking(4500);
    assert.equal((await as(db, stale(operations), `select admin_can('money.refund') r`))[0].r, false);
    const error = await expectError(as(db, stale(operations), `select (cancel_booking($1, 'ops')).status`, [booking]), /admin_cancel_booking/);
    assert.equal(error.code, "42501");
    assert.equal(await statusOf(booking), "confirmed");
    assert.deepEqual(await refunds(booking), []);
  });

  it("nor through employee_update_booking_status or mark_booking_no_show", async () => {
    const booking = await capturedBooking(300);
    await expectError(as(db, operations, `select employee_update_booking_status($1, 'cancelled', 'Customer asked by phone')`, [booking]), /admin_cancel_booking/);
    const past = await capturedBooking(300, { daysAhead: -2 });
    await expectError(as(db, operations, `select mark_booking_no_show($1, 'Customer never arrived')`, [past]), /admin_mark_booking_no_show/);
    assert.deepEqual(await refunds(booking), []);
    assert.deepEqual(await refunds(past), []);
  });
});

describe("R2-H2: admin_cancel_booking", () => {
  it("needs a step-up, operations.write and a reason of at least 10 characters", async () => {
    const booking = await capturedBooking(0);
    await expectError(as(db, stale(operations), `select admin_cancel_booking($1, 'Shop closed for a family emergency')`, [booking]), /step|MFA|verification/i);
    await expectError(as(db, analyst, `select admin_cancel_booking($1, 'Shop closed for a family emergency')`, [booking]), /cannot change bookings/);
    await expectError(as(db, finance, `select admin_cancel_booking($1, 'Shop closed for a family emergency')`, [booking]), /cannot change bookings/);
    await expectError(as(db, operations, `select admin_cancel_booking($1, 'ops')`, [booking]), /at least 10 characters/);
    await expectError(as(db, ROLES.user(customer), `select admin_cancel_booking($1, 'Shop closed for a family emergency')`, [booking]), /cannot change bookings|Administrator/);
  });

  it("cancels a booking with no captured money at once", async () => {
    const booking = await capturedBooking(0);
    const out = (await as(db, operations, `select admin_cancel_booking($1, 'Shop closed for a family emergency') r`, [booking]))[0].r;
    assert.equal(out.status, "cancelled");
    assert.equal(await statusOf(booking), "cancelled");
  });

  it("from operations, a captured booking becomes a request a different money.refund holder approves; the refund is labelled as a console cancellation", async () => {
    const booking = await capturedBooking(4500);
    const asked = (await as(db, operations, `select admin_cancel_booking($1, 'Provider double-booked the chair') r`, [booking]))[0].r;
    assert.equal(asked.status, "pending_approval");
    assert.equal(Number(asked.refund_amount), 4500);
    assert.equal(await statusOf(booking), "confirmed");
    assert.deepEqual(await refunds(booking), []);
    await expectError(as(db, operations2, `select admin_decide_approval($1, 'approve', 'Looks right to me')`, [asked.approval_id]), /cannot decide/);
    await expectError(as(db, operations, `select admin_decide_approval($1, 'approve', 'Approving my own')`, [asked.approval_id]), /own request/);
    const done = (await as(db, finance, `select admin_decide_approval($1, 'approve', 'Checked with the provider') r`, [asked.approval_id]))[0].r;
    assert.equal(done.status, "approved");
    assert.equal(await statusOf(booking), "cancelled");
    const [refund] = await refunds(booking);
    assert.deepEqual(refund, { amount: 4500, source: "admin_cancellation", requested_by: finance.sub });
    const [audit] = await sys(db, `select details from admin_audit_logs where action = 'booking.console_cancelled' and target_id = $1`, [booking]);
    assert.equal(audit.details.approval_request_id, asked.approval_id);
  });

  it("a money.refund holder cancels a small refund directly, but SAR 1,000 or more needs a different person", async () => {
    const small = await capturedBooking(200);
    assert.equal((await as(db, owner, `select admin_cancel_booking($1, 'Customer moved abroad, refund in full') r`, [small]))[0].r.status, "cancelled");
    assert.equal((await refunds(small))[0].source, "admin_cancellation");
    const large = await capturedBooking(1000);
    assert.equal((await as(db, owner, `select admin_cancel_booking($1, 'Customer moved abroad, refund in full') r`, [large]))[0].r.status, "pending_approval");
    assert.equal(await statusOf(large), "confirmed");
  });

  it("the SAR 5,000 daily cumulative cap counts console cancellations", async () => {
    const owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
    for (let i = 0; i < 5; i += 1) {
      const b = await capturedBooking(990);
      assert.equal((await as(db, owner2, `select admin_cancel_booking($1, 'Salon closed for renovation works') r`, [b]))[0].r.status, "cancelled");
    }
    const sixth = await capturedBooking(990);
    assert.equal((await as(db, owner2, `select admin_cancel_booking($1, 'Salon closed for renovation works') r`, [sixth]))[0].r.status, "pending_approval");
    assert.deepEqual(await refunds(sixth), []);
  });

  it("refuses to run an approval whose refund grew after it was approved", async () => {
    const booking = await capturedBooking(1200);
    const asked = (await as(db, operations, `select admin_cancel_booking($1, 'Provider double-booked the chair') r`, [booking]))[0].r;
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, $2, 'booking_payment', 'chg_secfix2_grew', 300, 0, 300, 'pending')`, [booking, SEED.provider1]);
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Checked with the provider')`, [asked.approval_id]), /grew/);
    assert.equal(await statusOf(booking), "confirmed");
  });
});

describe("R2-H2: admin_mark_booking_no_show", () => {
  it("routes the remainder refund through the same approval rules", async () => {
    // A provider whose no-show fee keeps nothing back, so the remainder is the whole SAR 2,000.
    await sys(db, `update providers set no_show_fee_percent = 0 where id = $1`, [SEED.provider1]);
    const booking = await capturedBooking(2000, { daysAhead: -1 });
    const asked = (await as(db, operations, `select admin_mark_booking_no_show($1, 'Customer did not arrive or call') r`, [booking]))[0].r;
    assert.equal(asked.status, "pending_approval");
    assert.equal(await statusOf(booking), "confirmed");
    await as(db, finance, `select admin_decide_approval($1, 'approve', 'Door camera confirms no visit')`, [asked.approval_id]);
    assert.equal(await statusOf(booking), "no_show");
    assert.deepEqual((await refunds(booking)).map((r) => [r.amount, r.source]), [[2000, "admin_no_show"]]);
    await sys(db, `update providers set no_show_fee_percent = 100 where id = $1`, [SEED.provider1]);
  });
});

describe("R2-H2: self-service keeps its policy-based refund", () => {
  it("the customer cancels their own booking as before", async () => {
    const booking = await capturedBooking(150, { daysAhead: 10 });
    assert.equal((await as(db, ROLES.user(customer), `select (cancel_booking($1)).status s`, [booking]))[0].s, "cancelled");
    assert.equal((await refunds(booking))[0].source, "customer_cancellation");
  });

  it("the provider's owner cancels as before, refunding the customer in full", async () => {
    const booking = await capturedBooking(150, { daysAhead: 10 });
    assert.equal((await as(db, ROLES.user(SEED.owner1), `select (cancel_booking($1, 'Stylist is ill today')).status s`, [booking]))[0].s, "cancelled");
    assert.deepEqual((await refunds(booking)).map((r) => [r.amount, r.source]), [[150, "provider_cancellation"]]);
  });
});
