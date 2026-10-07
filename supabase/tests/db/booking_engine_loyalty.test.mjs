// FIX-BOOKING item 7d (D12 / C-D12): a booking spends only the loyalty points that pay for its (capped) discount.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let loyaltyId;
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const money = (n) => Math.round(Number(n) * 100) / 100;
const PRICE = 85;
let slot = 0;

const programme = (value) => sys(db, `insert into platform_settings (key, value) values ('loyalty_program', $1::jsonb)
                                      on conflict (key) do update set value = excluded.value`, [JSON.stringify(value)]);
const balance = async () => (await sys(db, `select points_balance n from customer_loyalty where id = $1`, [loyaltyId]))[0].n;
const setBalance = (n) => sys(db, `update customer_loyalty set points_balance = $2 where id = $1`, [loyaltyId, n]);
const book = (points, coupon = null) => {
  slot += 1;
  const minutes = 9 * 60 + (slot % 14) * 30;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
       request_loyalty_points => $4, request_coupon_code => $5)`, [SEED.employee1, svc.id, riyadh(hhmm), points, coupon]).then((r) => r[0]);
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  await sys(db, `update services set base_price = $2, base_duration_minutes = 30 where id = $1`, [svc.id, PRICE]);
  await sys(db, `update employee_services set custom_price = null, custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  await programme({ enabled: true, min_redeem_points: 100, sar_per_point: 0.5 });
  loyaltyId = (await sys(db, `insert into customer_loyalty (customer_id, provider_id, points_balance) values ($1, $2, 1000) returning id`, [SEED.customer, SEED.provider1]))[0].id;
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  await programme({ enabled: true, min_redeem_points: 100, sar_per_point: 0.5 });
  await setBalance(1000);
});

describe("loyalty spend equals the discount (D12 / C-D12)", () => {
  it("burns only the points that pay for the capped discount (reproduced: 1,000 points burned for an 85.00 discount)", async () => {
    const b = await book(1000);
    assert.equal(money(b.discount_amount), PRICE);
    assert.equal(b.loyalty_points_redeemed, 170, "85.00 / 0.5 = 170 points");
    assert.equal(await balance(), 830);
    const ledger = await sys(db, `select points_change, description from loyalty_points_ledger where booking_id = $1 and event_type = 'redemption'`, [b.id]);
    assert.deepEqual(ledger.map((l) => l.points_change), [-170]);
    assert.match(ledger[0].description, /170 points for 85\.?0*\s*SAR/);
  });

  it("spends exactly the requested points when the discount is below the cap", async () => {
    const b = await book(100);
    assert.equal(money(b.discount_amount), 50);
    assert.equal(b.loyalty_points_redeemed, 100);
    assert.equal(await balance(), 900);
  });

  it("caps the discount at what the coupon leaves payable and spends points accordingly", async () => {
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value, funding_source, per_customer_limit) values ('LOY50', 'percentage', 50, 'platform', null)`);
    const b = await book(1000, "LOY50");
    assert.equal(money(b.discount_amount), PRICE, "coupon 42.50 + loyalty 42.50");
    assert.equal(b.loyalty_points_redeemed, 85, "42.50 / 0.5 = 85 points");
    assert.equal(await balance(), 915);
    assert.equal(money(b.total_price), 0);
  });

  it("rounds a fractional rate up so the discount is always covered, never above the request", async () => {
    await programme({ enabled: true, min_redeem_points: 10, sar_per_point: 0.0333 });
    const b = await book(10);
    assert.equal(b.loyalty_points_redeemed, 10);
    assert.equal(money(b.discount_amount), 0.33);
    await setBalance(5000);
    const c = await book(5000);
    assert.equal(money(c.discount_amount), PRICE);
    assert.equal(c.loyalty_points_redeemed, Math.ceil(PRICE / 0.0333));
    assert.ok(c.loyalty_points_redeemed < 5000);
  });

  it("cancelling returns exactly the points that were spent", async () => {
    const b = await book(1000);
    assert.equal(await balance(), 830);
    await as(db, customer, `select cancel_booking($1, 'changed my mind')`, [b.id]);
    assert.equal(await balance(), 1000);
  });

  it("refuses redemption when the programme has no positive point value or is switched off", async () => {
    await programme({ enabled: true, min_redeem_points: 100, sar_per_point: 0 });
    await expectError(book(100), /Loyalty redemption is not available/);
    await programme({ enabled: true, min_redeem_points: 100 });
    await expectError(book(100), /Loyalty redemption is not available/);
    await programme({ enabled: false, min_redeem_points: 100, sar_per_point: 0.5 });
    await expectError(book(100), /Loyalty redemption is not available/);
    assert.equal(await balance(), 1000);
  });

  it("still enforces the minimum and the balance", async () => {
    await expectError(book(50), /Minimum redemption is 100 points/);
    await setBalance(80);
    await expectError(book(100), /Insufficient loyalty points/);
  });

  it("a booking without points leaves the balance alone", async () => {
    const b = await book(0);
    assert.equal(b.loyalty_points_redeemed, 0);
    assert.equal(await balance(), 1000);
  });
});
