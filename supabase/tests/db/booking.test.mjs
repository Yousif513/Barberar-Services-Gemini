import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys,
} from "./harness.mjs";

let db;
let svc;
let date;
const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);

const book = (user, slot, extra = {}) => as(db, user,
  `select * from create_booking(
     target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
     request_source => $4, request_coupon_code => $5, request_gift_card_code => $6,
     request_loyalty_points => $7)`,
  [extra.employee === undefined ? SEED.employee1 : extra.employee, extra.service ?? svc.id, slot,
   extra.source ?? "marketplace", extra.coupon ?? null, extra.gift ?? null, extra.points ?? 0]).then((r) => r[0]);

const confirmPayment = async (booking) => {
  const r = await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3) r`,
    [booking.id, `chg_${booking.id}`, booking.deposit_required]);
  return r[0].r;
};

// Inserts a confirmed booking that already started (for completion / no-show tests).
// Each one starts a different number of days back, so two of them never overlap.
let pastDays = 0;
const pastBooking = async (customerId = SEED.customer) => {
  pastDays += 7;
  const r = await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                           subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours' - make_interval(days => $7::int), $5, $6, $6, round($6 * 0.15, 2), 0, 0, 'link')
     returning *`, [customerId, SEED.branch1, SEED.employee1, svc.id, svc.duration, svc.price, pastDays]);
  return r[0];
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
});

describe("booking engine", () => {
  it("has exactly one version of each booking entry point", async () => {
    const rows = await sys(db, `select proname, count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('create_booking','cancel_booking','get_available_slots','create_multi_service_booking') group by 1`);
    for (const r of rows) assert.equal(r.n, 1, `${r.proname} has ${r.n} overloads`);
    assert.equal(rows.length, 4);
  });

  it("prices a marketplace first visit with fee rules, VAT and the provider deposit", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot);
    const provider = (await sys(db, `select deposit_percentage from providers where id = $1`, [SEED.provider1]))[0];
    assert.equal(b.status, "pending_payment");
    assert.equal(b.source, "marketplace");
    assert.equal(b.is_first_visit, true);
    assert.equal(Number(b.subtotal_price), Number(svc.price));
    assert.equal(Number(b.tax_amount), Math.round(Number(svc.price) * 15) / 100);
    const expectedFee = Math.min(Math.max(Math.round(Number(svc.price) * 20) / 100, 10), 40);
    assert.equal(Number(b.platform_commission), expectedFee);
    assert.equal(Number(b.deposit_required), Math.round(Number(svc.price) * Number(provider.deposit_percentage)) / 100);
    const items = await sys(db, `select count(*)::int n from booking_services where booking_id = $1`, [b.id]);
    assert.equal(items[0].n, 1);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("charges no platform fee on provider-sourced bookings made through the provider's own share token", async () => {
    // The channel is derived on the server (D-02): claiming source 'link' proves nothing, the provider's token does.
    const token = (await as(db, owner1, `select create_provider_share_token($1, 'link', 'test link') t`, [SEED.provider1]))[0].t.token;
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await as(db, customer,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source_token => $4)`,
      [SEED.employee1, svc.id, slot, token]).then((r) => r[0]);
    assert.equal(b.source, "link");
    assert.equal(Number(b.platform_commission), 0);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("charges the marketplace fee when the caller only claims a provider-sourced channel", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot, { source: "link" });
    assert.equal(b.source, "marketplace");
    assert.ok(Number(b.platform_commission) > 0);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("assigns a professional when 'any available' is requested", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot, { employee: null });
    assert.ok(b.employee_id);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("refuses bookings with unverified providers", async () => {
    await sys(db, `update providers set status = 'pending' where id = $1`, [SEED.provider1]);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    await expectError(book(customer, slot), /not accepting bookings/);
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider1]);
  });

  it("confirms on verified payment, records the ledger and queues messages", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot);
    const result = await confirmPayment(b);
    assert.equal(result.status, "confirmed");
    const ledger = await sys(db, `select * from transactional_ledger where booking_id = $1`, [b.id]);
    assert.equal(ledger.length, 1);
    assert.equal(Number(ledger[0].total_captured), Number(b.deposit_required));
    assert.equal(ledger[0].provider_id, SEED.provider1);
    const queued = await sys(db, `select template_name from message_queue where booking_id = $1 order by 1`, [b.id]);
    assert.ok(queued.some((q) => q.template_name === "owner_new_booking"));
    assert.ok(queued.some((q) => q.template_name === "reminder_24h"));
    await as(db, customer, `select cancel_booking($1, 'cleanup')`, [b.id]);
  });

  it("customer cancellation inside the free window refunds the full deposit through a refund request", async () => {
    await sys(db, `update providers set free_cancellation_hours = 1, late_cancellation_fee_percent = 50 where id = $1`, [SEED.provider1]);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot);
    await confirmPayment(b);
    const c = (await as(db, customer, `select * from cancel_booking($1, 'changed plans')`, [b.id]))[0];
    assert.equal(c.status, "cancelled");
    assert.equal(c.cancelled_by, "customer");
    assert.equal(Number(c.cancellation_fee), 0);
    assert.equal(Number(c.refund_amount), Number(b.deposit_required));
    const refunds = await sys(db, `select amount, status, source from refund_requests where booking_id = $1`, [b.id]);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].status, "pending");
    assert.equal(refunds[0].source, "customer_cancellation");
    const queue = await sys(db, `select count(*)::int n from message_queue where booking_id = $1 and status = 'pending'`, [b.id]);
    assert.equal(queue[0].n, 0, "pending reminders are cancelled");
  });

  it("customer late cancellation keeps the provider's fee; provider cancellation refunds everything", async () => {
    await sys(db, `update providers set free_cancellation_hours = 720 where id = $1`, [SEED.provider1]);
    let slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    let b = await book(customer, slot);
    await confirmPayment(b);
    const late = (await as(db, customer, `select * from cancel_booking($1, 'late')`, [b.id]))[0];
    assert.equal(Number(late.cancellation_fee), Math.round(Number(b.deposit_required) * 50) / 100);
    const ledger = (await sys(db, `select platform_share, provider_share from transactional_ledger where booking_id = $1`, [b.id]))[0];
    assert.equal(Number(ledger.platform_share), 0, "no platform commission on a visit that did not happen");
    assert.equal(Number(ledger.provider_share), Number(late.cancellation_fee));

    slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    b = await book(customer, slot);
    await confirmPayment(b);
    const byProvider = (await as(db, owner1, `select * from cancel_booking($1, 'staff sick')`, [b.id]))[0];
    assert.equal(byProvider.cancelled_by, "provider");
    assert.equal(Number(byProvider.cancellation_fee), 0);
    assert.equal(Number(byProvider.refund_amount), Number(b.deposit_required));
    await sys(db, `update providers set free_cancellation_hours = 24 where id = $1`, [SEED.provider1]);
  });

  it("enforces the reschedule notice rule for customers and lets the provider move the booking", async () => {
    const slots = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1`,
      [SEED.employee1, date, svc.duration]);
    const b = await book(customer, slots[0].slot_start, { source: "link" });
    await confirmPayment(b);
    await sys(db, `update providers set free_cancellation_hours = 720 where id = $1`, [SEED.provider1]);
    const target = slots[slots.length - 1].slot_start;
    await expectError(as(db, customer, `select reschedule_booking($1, $2)`, [b.id, target]), /Rescheduling closes/);
    const moved = (await as(db, owner1, `select reschedule_booking($1, $2) r`, [b.id, target]))[0].r;
    assert.equal(new Date(moved.new_scheduled_at).getTime(), new Date(target).getTime());
    await sys(db, `update providers set free_cancellation_hours = 24 where id = $1`, [SEED.provider1]);
    await as(db, customer, `update bookings set scheduled_at = now() + interval '9 days' where id = $1`, [b.id]).catch(() => {});
    const still = (await sys(db, `select scheduled_at from bookings where id = $1`, [b.id]))[0];
    assert.equal(new Date(still.scheduled_at).getTime(), new Date(target).getTime(), "direct updates cannot move a booking");
    await as(db, owner1, `select cancel_booking($1, 'cleanup')`, [b.id]);
  });

  it("staff check-in, completion and no-show follow the visit time", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const future = await book(customer, slot, { source: "link" });
    await confirmPayment(future);
    await expectError(as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [future.id]), /before its start time/);
    await expectError(as(db, owner1, `select mark_booking_no_show($1)`, [future.id]), /before its start time/);
    const checkedIn = (await as(db, owner1, `select employee_update_booking_status($1, 'in_service') r`, [future.id]))[0].r;
    assert.equal(checkedIn.status, "confirmed");
    assert.ok(checkedIn.checked_in_at);
    await expectError(as(db, customer, `select employee_update_booking_status($1, 'in_service')`, [future.id]), /Booking not found/);

    const past = await pastBooking();
    const done = (await as(db, owner1, `select employee_update_booking_status($1, 'completed') r`, [past.id]))[0].r;
    assert.equal(done.status, "completed");
    const past2 = await pastBooking();
    const ns = (await as(db, owner1, `select * from mark_booking_no_show($1)`, [past2.id]))[0];
    assert.equal(ns.status, "no_show");
    await as(db, owner1, `select cancel_booking($1, 'cleanup')`, [future.id]);
  });

  it("expires unpaid holds only for the scheduler or an admin", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot);
    await sys(db, `update bookings set created_at = now() - interval '1 hour' where id = $1`, [b.id]);
    await expectError(as(db, ROLES.anon, `select expire_stale_booking_holds(15)`), /permission denied/);
    await expectError(as(db, customer, `select expire_stale_booking_holds(15)`), /scheduler or an administrator/);
    const n = (await as(db, ROLES.service, `select expire_stale_booking_holds() n`))[0].n;
    assert.ok(n >= 1);
    const after = (await sys(db, `select status, cancelled_by from bookings where id = $1`, [b.id]))[0];
    assert.equal(after.status, "cancelled");
    assert.equal(after.cancelled_by, "system");
  });

  it("confirms a late payment when the released slot is still free, otherwise requests a refund", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot);
    await sys(db, `update bookings set created_at = now() - interval '1 hour' where id = $1`, [b.id]);
    await as(db, ROLES.service, `select expire_stale_booking_holds()`);
    const ok = await confirmPayment(b);
    assert.equal(ok.status, "confirmed");
    await as(db, customer, `select cancel_booking($1, 'cleanup')`, [b.id]);

    const slot2 = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b2 = await book(customer, slot2);
    await sys(db, `update bookings set created_at = now() - interval '1 hour' where id = $1`, [b2.id]);
    await as(db, ROLES.service, `select expire_stale_booking_holds()`);
    const other = await createUser(db);
    const taken = await book(ROLES.user(other), slot2, { source: "link" });
    const conflict = await confirmPayment(b2);
    assert.equal(conflict.status, "refund_required");
    const refund = await sys(db, `select source, amount from refund_requests where booking_id = $1`, [b2.id]);
    assert.equal(refund[0].source, "late_payment_conflict");
    await as(db, ROLES.user(other), `select cancel_booking($1, 'cleanup')`, [taken.id]);
  });

  it("applies coupons and gift cards server-side and returns them when the booking is cancelled", async () => {
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value, is_active, funding_source, max_redemptions)
                   values ('SAVE10', 'percentage', 10, true, 'platform', 5)`);
    await sys(db, `insert into gift_cards (code, purchaser_id, recipient_name, recipient_phone, original_amount, remaining_balance, status)
                   values ('PRM-TEST-GIFT', $1, 'Test', '+966500000001', 30, 30, 'active')`, [SEED.customer]);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = await book(customer, slot, { coupon: "save10", gift: "PRM-TEST-GIFT" });
    const discount = Math.round(Number(svc.price) * 10) / 100;
    assert.equal(Number(b.discount_amount), discount);
    assert.equal(Number(b.total_price), Number(svc.price) - discount);
    assert.equal(Number(b.gift_card_amount), 30);
    const card = (await sys(db, `select remaining_balance from gift_cards where code = 'PRM-TEST-GIFT'`))[0];
    assert.equal(Number(card.remaining_balance), 0);
    const coupon = (await sys(db, `select redeemed_count from promotional_codes where code = 'SAVE10'`))[0];
    assert.equal(coupon.redeemed_count, 1);

    await as(db, customer, `select cancel_booking($1, 'release')`, [b.id]);
    assert.equal(Number((await sys(db, `select remaining_balance from gift_cards where code = 'PRM-TEST-GIFT'`))[0].remaining_balance), 30);
    assert.equal((await sys(db, `select redeemed_count from promotional_codes where code = 'SAVE10'`))[0].redeemed_count, 0);
  });

  it("rejects loyalty redemption while the programme is disabled and invalid promo codes", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    await expectError(book(customer, slot, { points: 100 }), /Loyalty redemption is not available/);
    await expectError(book(customer, slot, { coupon: "NOPE" }), /not valid/);
  });

  it("books several services in one visit", async () => {
    const second = await serviceFor(db, SEED.employee1, 1);
    const slot = (await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`,
      [SEED.employee1, date, svc.duration + second.duration]))[0].slot_start;
    const r = (await as(db, customer, `select create_multi_service_booking($1, $2, $3, $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, slot, JSON.stringify([{ service_id: svc.id }, { service_id: second.id }])]))[0].r;
    assert.equal(r.total_duration_minutes, svc.duration + second.duration);
    assert.equal(Number(r.subtotal_sar), Number(svc.price) + Number(second.price));
    const items = await sys(db, `select count(*)::int n from booking_services where booking_id = $1`, [r.booking_id]);
    assert.equal(items[0].n, 2);
    await as(db, customer, `select cancel_booking($1, 'cleanup')`, [r.booking_id]);
  });

  it("lets staff record walk-ins with no platform fee and no fabricated customer", async () => {
    await sys(db, `update bookings set status = 'cancelled', cancelled_by = 'admin' where employee_id = $1 and status in ('pending_payment','confirmed') and booking_window && tstzrange(now() - interval '6 hours', now() + interval '6 hours')`, [SEED.employee2]);
    const svc2 = await serviceFor(db, SEED.employee2);
    const w = (await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'Walk-in Ali', '+966 50 000 7777') r`,
      [SEED.branch1, SEED.employee2, svc2.id]))[0].r;
    const row = (await sys(db, `select customer_id, walk_in_name, walk_in_phone, platform_commission, status, checked_in_at from bookings where id = $1`, [w.booking_id]))[0];
    assert.equal(row.customer_id, null);
    assert.equal(row.walk_in_name, "Walk-in Ali");
    assert.equal(row.walk_in_phone, "+966500007777");
    assert.equal(Number(row.platform_commission), 0);
    assert.equal(row.status, "confirmed");
    assert.ok(row.checked_in_at);
    await expectError(as(db, customer, `select create_walk_in_booking($1, $2, $3, 'x')`, [SEED.branch1, SEED.employee2, svc2.id]), /Not authorized/);
  });

  it("keeps block reasons and other customers' eligibility private", async () => {
    const blocked = await createUser(db);
    await as(db, owner1, `select toggle_customer_block($1, $2, 'abusive messages', true)`, [SEED.provider1, blocked]);
    const self = (await as(db, ROLES.user(blocked), `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, blocked]))[0].r;
    assert.equal(self.is_blocked, true);
    assert.equal(self.block_reason, null, "customers never see the reason");
    const staff = (await as(db, owner1, `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, blocked]))[0].r;
    assert.equal(staff.block_reason, "abusive messages");
    await expectError(as(db, customer, `select check_customer_booking_eligibility($1, $2)`, [SEED.provider1, blocked]), /Not authorized/);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    await expectError(book(ROLES.user(blocked), slot), /cannot book with this provider/);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'provider.customer_blocked' and target_id = $1`, [blocked]);
    assert.equal(audit[0].n, 1);
  });

  it("stops owners from approving or verifying their own business", async () => {
    await sys(db, `update providers set status = 'pending' where id = $1`, [SEED.provider2]);
    await as(db, ROLES.user(SEED.owner2), `update providers set status = 'active', cr_verification_status = 'verified', commission_percentage = 0 where id = $1`, [SEED.provider2]);
    const p = (await sys(db, `select status, is_verified, cr_verification_status, commission_percentage from providers where id = $1`, [SEED.provider2]))[0];
    assert.equal(p.status, "pending");
    assert.equal(p.is_verified, false);
    assert.notEqual(p.cr_verification_status, "verified");
    assert.equal(Number(p.commission_percentage), 15);
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider2]);
  });

  it("does not let audit rows be written from a client", async () => {
    const admin = await createUser(db, { role: "admin" });
    await expectError(as(db, ROLES.user(admin), `insert into admin_audit_logs (actor_id, action, target_type) values ($1, 'forged', 'x')`, [admin]),
      /row-level security|permission denied/);
  });
});
