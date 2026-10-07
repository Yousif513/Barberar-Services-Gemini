// FIX-BOOKING item 7c (D5 / C-D5): per-customer coupon limit and first-booking-only codes.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let fresh;
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const money = (n) => Math.round(Number(n) * 100) / 100;
let slot = 0;

const coupon = async (code, fields = {}) => {
  const f = { discount_type: "percentage", discount_value: 50, funding_source: "platform", ...fields };
  await sys(db, `insert into promotional_codes (code, discount_type, discount_value, funding_source, per_customer_limit, first_booking_only, provider_id)
                 values ($1, $2, $3, $4, $5, $6, $7)`,
    [code, f.discount_type, f.discount_value, f.funding_source, "per_customer_limit" in f ? f.per_customer_limit : 1, f.first_booking_only ?? false, f.provider_id ?? null]);
};
// every booking takes the next half hour of the 08:00-18:00 shift, so no two collide
const book = (user, code) => {
  slot += 1;
  const minutes = 8 * 60 + (slot % 18) * 30;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_coupon_code => $4)`,
    [SEED.employee1, svc.id, riyadh(hhmm), code]).then((r) => r[0]);
};
const uses = async (code) => (await sys(db, `select redeemed_count n from promotional_codes where code = $1`, [code]))[0].n;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  await sys(db, `update services set base_duration_minutes = 30 where id = $1`, [svc.id]);
  await sys(db, `update employee_services set custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update employee_availability set start_time = '08:00', end_time = '18:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  fresh = ROLES.user(await createUser(db));
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
});

describe("coupon per-customer limit (D5 / C-D5)", () => {
  it("defaults to one use per customer (reproduced: the same 50% code was usable on every booking)", async () => {
    await coupon("HALF");
    const first = await book(customer, "HALF");
    assert.equal(money(first.discount_amount), money(Number(svc.price) * 0.5));
    await expectError(book(customer, "HALF"), /already used this promo code/);
    assert.equal(await uses("HALF"), 1);
    const other = await book(fresh, "HALF");
    assert.equal(money(other.discount_amount), money(Number(svc.price) * 0.5), "another customer is not affected");
    assert.equal(await uses("HALF"), 2);
  });

  it("honours a higher limit and NULL as unlimited", async () => {
    await coupon("TWICE", { per_customer_limit: 2 });
    await book(customer, "TWICE");
    await book(customer, "TWICE");
    await expectError(book(customer, "TWICE"), /already used this promo code/);
    await coupon("MANY", { per_customer_limit: null });
    for (let i = 0; i < 3; i += 1) await book(customer, "MANY");
  });

  it("a cancelled booking frees the use", async () => {
    await coupon("ONCE");
    const b = await book(customer, "ONCE");
    await expectError(book(customer, "ONCE"), /already used/);
    await as(db, customer, `select cancel_booking($1, 'changed my mind')`, [b.id]);
    const again = await book(customer, "ONCE");
    assert.ok(again.id);
    assert.equal(await uses("ONCE"), 1);
  });

  it("first-booking-only codes refuse customers who already have a confirmed or completed booking", async () => {
    await coupon("WELCOME", { first_booking_only: true, per_customer_limit: null });
    const ok = await book(fresh, "WELCOME");
    assert.equal(ok.status, "pending_payment", "a pending booking does not make the next one 'not first'");
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
                                         tax_amount, deposit_required, platform_commission, source)
                   values ($1, $2, $3, $4, 'confirmed', now() - interval '40 days', 30, 50, 50, 7.5, 0, 0, 'link')`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]);
    await expectError(book(customer, "WELCOME"), /first booking only/);
  });

  it("a code that belongs to another provider is not valid here", async () => {
    await coupon("P2ONLY", { first_booking_only: true, per_customer_limit: null, provider_id: SEED.provider2, funding_source: "provider" });
    await expectError(book(customer, "P2ONLY"), /not valid for this booking/);
  });

  it("the per-customer count ignores redemptions of other codes", async () => {
    await coupon("A1");
    await coupon("B1");
    await book(customer, "A1");
    const b = await book(customer, "B1");
    assert.ok(b.id);
  });

  it("customers cannot change coupon rows, visitors cannot read them", async () => {
    await coupon("ADM", { per_customer_limit: 3 });
    await expectError(as(db, ROLES.anon, `select 1 from promotional_codes`), /permission denied/);
    await as(db, customer, `update promotional_codes set per_customer_limit = null`);
    assert.equal((await sys(db, `select count(*)::int n from promotional_codes where per_customer_limit is null and code = 'ADM'`))[0].n, 0);
  });
});
