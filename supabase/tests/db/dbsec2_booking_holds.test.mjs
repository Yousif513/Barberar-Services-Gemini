import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// RT-M1 (red team 2026-10-17): unpaid booking holds are limited per customer (2 per business, 3 overall; a group or a series
// is one hold), lapsed holds are released before counting, and a promo-code redemption is consumed only once the booking is
// paid. Limits come from platform_settings('booking_hold_limits').
let db;
const E1 = SEED.employee1; // provider 1
const E4 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4"; // provider 2
const E6 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd6"; // provider 3
const S1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const S2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const S3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const E2 = SEED.employee2;
const E3 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const newCustomer = async () => ROLES.user(await createUser(db));

// Distinct free slots, each on its own working day, so no two holds of one test ever compete for a slot.
const usedDays = new Map();
async function slotFor(user, employee) {
  const svc = await serviceFor(db, employee);
  const offset = (usedDays.get(employee) ?? 2) + 1;
  usedDays.set(employee, offset);
  const date = await nextWorkingDate(db, employee, offset * 3);
  const rows = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [employee, date, svc.duration]);
  assert.ok(rows[0], `a free slot for ${employee} on ${date}`);
  return { svc, slot: rows[0].slot_start };
}
async function hold(user, employee, coupon = null) {
  const { svc, slot } = await slotFor(user, employee);
  return (await as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
    request_coupon_code => $4)`, [employee, svc.id, slot, coupon]))[0];
}
const lapse = (ids) => sys(db, `update bookings set created_at = now() - interval '20 minutes' where id = any($1::uuid[])`, [ids]);
const pay = (b) => as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3) r`, [b.id, `chg_${b.id}`, b.deposit_required]);

before(async () => {
  db = await createMigratedDb({ holdLimits: null });
});

describe("RT-M1 unpaid hold limits", () => {
  it("refuses a third open hold with one business and a fourth across the marketplace", async () => {
    const c = await newCustomer();
    const a = await hold(c, E1);
    const b = await hold(c, E1);
    assert.deepEqual([a.status, b.status], ["pending_payment", "pending_payment"]);
    await expectError(hold(c, E1), /already have 2 unpaid bookings with this business/);
    await hold(c, E4);
    await expectError(hold(c, E6), /already have 3 unpaid bookings\./);
    assert.equal((await one(`select count(*)::int n from bookings where customer_id = $1`, [c.sub])).n, 3, "a refused hold leaves no booking");
  });

  it("releases lapsed holds before counting, and a paid booking no longer counts", async () => {
    const c = await newCustomer();
    const a = await hold(c, E1);
    const b = await hold(c, E1);
    await lapse([a.id]);
    const d = await hold(c, E1);
    const released = await one(`select status, cancelled_by, cancellation_reason from bookings where id = $1`, [a.id]);
    assert.deepEqual([released.status, released.cancelled_by, released.cancellation_reason], ["cancelled", "system", "Payment hold expired"]);
    await expectError(hold(c, E1), /2 unpaid bookings with this business/);
    await pay(b);
    assert.equal((await one(`select status from bookings where id = $1`, [b.id])).status, "confirmed");
    await hold(c, E1);
    assert.ok(d.id);
  });

  it("is per customer: another customer still books the same business", async () => {
    const c1 = await newCustomer();
    const c2 = await newCustomer();
    await hold(c1, E1);
    await hold(c1, E1);
    await expectError(hold(c1, E1), /2 unpaid bookings/);
    assert.equal((await hold(c2, E1)).status, "pending_payment");
  });

  it("follows the owner's setting", async () => {
    await sys(db, `update platform_settings set value = '{"per_provider": 1, "overall": 1}' where key = 'booking_hold_limits'`);
    const c = await newCustomer();
    await hold(c, E1);
    await expectError(hold(c, E4), /already have 1 unpaid bookings\./);
    await sys(db, `update platform_settings set value = '{"per_provider": 2, "overall": 3}' where key = 'booking_hold_limits'`);
  });

  it("counts a group booking as one hold, however many guests it has", async () => {
    await as(db, ROLES.user(SEED.owner1), `select set_provider_group_settings($1, true, 6, null) r`, [SEED.provider1]);
    const host = await newCustomer();
    const date = await nextWorkingDate(db, E1, 40);
    const guests = [
      { label: "Bride", services: [{ service_id: S1 }], employee_id: E1 },
      { label: "Mother", services: [{ service_id: S2 }], employee_id: E2 },
      { label: "Aunt", services: [{ service_id: S3 }], employee_id: E3 },
    ];
    const p = (await as(db, host, `select preview_group_booking($1, $2::date, $3::jsonb) r`, [SEED.branch1, date, JSON.stringify(guests)]))[0].r;
    assert.equal(p.can_create, true);
    const plan = p.guests.map((x, i) => ({ ...guests[i], employee_id: x.employee_id, scheduled_at: x.scheduled_at }));
    const g = (await as(db, host, `select create_group_booking($1, $2::date, 'wedding'::group_occasion, 'Henna', $3::jsonb, $4) r`,
      [SEED.branch1, date, JSON.stringify(plan), crypto.randomUUID()]))[0].r;
    assert.equal(g.members.length, 3);
    assert.equal((await one(`select customer_open_hold_count($1, $2) n`, [host.sub, SEED.provider1])).n, 1);
    await hold(host, E1);
    await expectError(hold(host, E1), /2 unpaid bookings with this business/);
  });

  it("cannot be bypassed by calling the internal helpers", async () => {
    const c = await newCustomer();
    for (const sql of [`select customer_open_hold_count($1)`, `select release_customer_expired_holds($1)`,
      `select assert_booking_hold_capacity($1, null, true)`, `select coupon_live_reservations($1)`]) {
      await expectError(as(db, c, sql, [c.sub]), /permission denied/);
    }
  });
});

describe("RT-M1 promo redemptions are consumed at payment", () => {
  let code;
  before(async () => {
    code = (await one(`insert into promotional_codes (code, discount_type, discount_value, max_redemptions, is_active, funding_source, starts_at)
      values ('ONEONLY', 'percentage', 10, 1, true, 'platform', now() - interval '1 day') returning id`)).id;
  });
  const redeemed = async () => (await one(`select redeemed_count from promotional_codes where id = $1`, [code])).redeemed_count;

  it("reserves the only redemption for a live hold without consuming it", async () => {
    const a = await newCustomer();
    const b = await newCustomer();
    const h = await hold(a, E1, "ONEONLY");
    assert.ok(Number(h.discount_amount) > 0);
    assert.equal(await redeemed(), 0, "an unpaid hold does not consume the code");
    const r = await one(`select counted_at, reversed_at from coupon_redemptions where booking_id = $1`, [h.id]);
    assert.deepEqual([r.counted_at, r.reversed_at], [null, null]);
    await expectError(hold(b, E1, "ONEONLY"), /promo code is not valid/);
    const preview = (await as(db, b, `select validate_and_apply_coupon('ONEONLY', $1, 200) r`, [SEED.provider1]))[0].r;
    assert.equal(preview.valid, false, "the preview agrees while the reservation is live");

    // The hold lapses: its reservation stops counting, so another customer can use the code and pay.
    await lapse([h.id]);
    const h2 = await hold(b, E1, "ONEONLY");
    assert.equal(await redeemed(), 0);
    await pay(h2);
    assert.equal(await redeemed(), 1, "consumed at payment");
    assert.ok((await one(`select counted_at from coupon_redemptions where booking_id = $1`, [h2.id])).counted_at !== null);

    // The sweeper releases the lapsed hold: the count is not decremented for a redemption that was never consumed.
    await as(db, ROLES.service, `select expire_stale_booking_holds()`);
    assert.equal((await one(`select status from bookings where id = $1`, [h.id])).status, "cancelled");
    assert.equal(await redeemed(), 1);
    await expectError(hold(await newCustomer(), E1, "ONEONLY"), /promo code is not valid/);
  });

  it("consumes at once for a booking that is already confirmed (nothing due online)", async () => {
    const multi = (await one(`insert into promotional_codes (code, discount_type, discount_value, max_redemptions, is_active, funding_source, starts_at)
      values ('NODEPOSIT', 'percentage', 10, 5, true, 'platform', now() - interval '1 day') returning id`)).id;
    const c = await newCustomer();
    const svc = await serviceFor(db, E1);
    const booking = (await one(`insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
        subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
      values ($1, $2, $3, $4, 'confirmed', now() + interval '61 days', $5, 100, 90, 13.5, 0, 0, 'marketplace') returning id`,
      [c.sub, SEED.branch1, E1, svc.id, svc.duration])).id;
    await sys(db, `insert into coupon_redemptions (coupon_id, customer_id, booking_id, discount_amount, funding_source) values ($1, $2, $3, 10, 'platform')`,
      [multi, c.sub, booking]);
    assert.equal((await one(`select redeemed_count from promotional_codes where id = $1`, [multi])).redeemed_count, 1);
    assert.ok((await one(`select counted_at from coupon_redemptions where booking_id = $1`, [booking])).counted_at !== null);
  });
});
