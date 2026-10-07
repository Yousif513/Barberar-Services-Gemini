// FIX-BOOKING item 7b (D19 / C-D19): a package session pays for a booking: reserved with it, released with it, matched to its service.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svcA;
let svcB;
let date;
let other;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const money = (n) => Math.round(Number(n) * 100) / 100;

const makePackage = async ({ service = null, provider = SEED.provider1, sessions = 5, status = "active", expires = "30 days", owner = SEED.customer } = {}) => {
  const pkg = (await sys(db, `insert into packages (provider_id, name_en, name_ar, price, session_count, service_id) values ($1, 'Pack', 'باقة', 400, $2, $3) returning id`,
    [provider, sessions, service]))[0];
  const up = (await sys(db, `insert into user_packages (customer_id, package_id, remaining_sessions, expires_at, status, amount_paid)
                             values ($1, $2, $3, now() + $4::interval, $5, 400) returning id`, [owner, pkg.id, sessions, expires, status]))[0];
  return up.id;
};
const remaining = async (id) => (await sys(db, `select remaining_sessions n from user_packages where id = $1`, [id]))[0].n;
const book = (hhmm, { services = [svcA.id], pack = null, user = customer, coupon = null } = {}) => as(db, user,
  `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb,
     request_coupon_code => $5, request_user_package_id => $6) r`,
  [SEED.branch1, SEED.employee1, riyadh(hhmm), JSON.stringify(services.map((id) => ({ service_id: id }))), coupon, pack]).then((r) => r[0].r);
const row = async (id) => (await sys(db, `select * from bookings where id = $1`, [id]))[0];

before(async () => {
  db = await createMigratedDb();
  svcA = await serviceFor(db, SEED.employee1, 0);
  svcB = await serviceFor(db, SEED.employee1, 1);
  date = await nextWorkingDate(db, SEED.employee1);
  for (const s of [svcA, svcB]) await sys(db, `update services set base_duration_minutes = 30 where id = $1`, [s.id]);
  await sys(db, `update employee_services set custom_duration_minutes = null where service_id in ($1, $2)`, [svcA.id, svcB.id]);
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  other = ROLES.user(await createUser(db));
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
});

describe("packages linked to bookings (D19 / C-D19)", () => {
  it("a package session pays for the service: nothing to collect, session reserved (reproduced: the customer still paid a deposit)", async () => {
    const up = await makePackage();
    const r = await book("10:00", { pack: up });
    const b = await row(r.booking_id);
    assert.equal(money(b.package_covered_amount), money(svcA.price));
    assert.equal(money(b.discount_amount), money(svcA.price));
    assert.equal(money(b.total_price), 0);
    assert.equal(money(b.tax_amount), 0);
    assert.equal(money(b.deposit_required), 0);
    assert.equal(b.status, "confirmed", "nothing to collect online");
    assert.equal(b.user_package_id, up);
    assert.equal(await remaining(up), 4);
    const red = await sys(db, `select booking_id, reversed_at from package_redemptions where user_package_id = $1`, [up]);
    assert.deepEqual(red.map((x) => [x.booking_id, x.reversed_at]), [[b.id, null]]);
  });

  it("covers only the package's service and leaves the rest payable (VAT only on the remainder)", async () => {
    const up = await makePackage({ service: svcA.id });
    const r = await book("10:00", { services: [svcB.id, svcA.id], pack: up });
    const b = await row(r.booking_id);
    assert.equal(money(b.subtotal_price), money(Number(svcA.price) + Number(svcB.price)));
    assert.equal(money(b.package_covered_amount), money(svcA.price));
    assert.equal(money(b.total_price), money(svcB.price));
    assert.equal(money(b.tax_amount), money(Number(svcB.price) * 0.15));
    const deposit = (await sys(db, `select deposit_percentage from providers where id = $1`, [SEED.provider1]))[0].deposit_percentage;
    assert.equal(money(b.deposit_required), money(Number(svcB.price) * Number(deposit) / 100));
    assert.equal(b.status, "pending_payment");
  });

  it("refuses a package that does not cover the visit", async () => {
    const up = await makePackage({ service: svcA.id });
    await expectError(book("10:00", { services: [svcB.id], pack: up }), /does not cover the selected service/);
    assert.equal(await remaining(up), 5, "a refused booking keeps the session");
  });

  it("refuses spent, expired, inactive, foreign and other people's packages", async () => {
    await expectError(book("10:00", { pack: await makePackage({ sessions: 0 }) }), /no session left/);
    await expectError(book("10:00", { pack: await makePackage({ expires: "-1 day" }) }), /expires before the appointment/);
    await expectError(book("10:00", { pack: await makePackage({ expires: "1 day" }) }), /expires before the appointment/);
    await expectError(book("10:00", { pack: await makePackage({ status: "pending_payment" }) }), /no session left/);
    await expectError(book("10:00", { pack: await makePackage({ provider: SEED.provider2 }) }), /another provider/);
    const theirs = await makePackage({ owner: other.sub });
    await expectError(book("10:00", { pack: theirs }), /Package not found/);
    assert.equal(await remaining(theirs), 5);
  });

  it("the last session cannot be used twice", async () => {
    const up = await makePackage({ sessions: 1 });
    await book("10:00", { pack: up });
    assert.equal(await remaining(up), 0);
    await expectError(book("11:00", { pack: up }), /no session left/);
  });

  it("coupons apply only to what the package leaves payable", async () => {
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value, funding_source) values ('PKG10', 'percentage', 10, 'platform')`);
    const up = await makePackage({ service: svcA.id });
    const r = await book("10:00", { services: [svcA.id, svcB.id], pack: up, coupon: "PKG10" });
    const b = await row(r.booking_id);
    const expectedCoupon = money(Number(svcB.price) * 0.10);
    assert.equal(money(b.discount_amount), money(Number(svcA.price) + expectedCoupon));
    assert.equal(money(b.total_price), money(Number(svcB.price) - expectedCoupon));
  });

  it("cancelling gives the session back, once", async () => {
    const up = await makePackage();
    const r = await book("10:00", { pack: up });
    assert.equal(await remaining(up), 4);
    await as(db, customer, `select cancel_booking($1, 'changed my mind')`, [r.booking_id]);
    assert.equal(await remaining(up), 5);
    const red = await sys(db, `select reversed_at from package_redemptions where booking_id = $1`, [r.booking_id]);
    assert.ok(red[0].reversed_at);
    await sys(db, `select booking_release_discounts($1)`, [r.booking_id]);
    assert.equal(await remaining(up), 5, "releasing again changes nothing");
  });

  it("a provider recording a session must pick a booking that contains the package's service", async () => {
    const up = await makePackage({ service: svcA.id });
    const wrong = await book("10:00", { services: [svcB.id] });
    await expectError(as(db, owner1, `select redeem_package_session($1, $2)`, [up, wrong.booking_id]), /does not cover the services/);
    const right = await book("11:00", { services: [svcA.id] });
    const ok = (await as(db, owner1, `select redeem_package_session($1, $2) r`, [up, right.booking_id]))[0].r;
    assert.equal(ok.remaining_sessions, 4);
    await expectError(as(db, owner1, `select redeem_package_session($1, $2)`, [up, right.booking_id]), /already recorded/);
    // a booking that already reserved its session cannot be redeemed a second time
    const paid = await book("12:00", { services: [svcA.id], pack: up });
    await expectError(as(db, owner1, `select redeem_package_session($1, $2)`, [up, paid.booking_id]), /already recorded/);
  });

  it("the same works through create_booking", async () => {
    const up = await makePackage();
    const b = (await as(db, customer,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_user_package_id => $4)`,
      [SEED.employee1, svcA.id, riyadh("14:00"), up]))[0];
    assert.equal(b.user_package_id, up);
    assert.equal(await remaining(up), 4);
  });

  it("keeps one version of each function and its privileges", async () => {
    const rows = await sys(db, `select proname, count(*)::int n, bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('create_booking','create_multi_service_booking','booking_create_internal','booking_release_discounts','redeem_package_session') group by 1`);
    const by = Object.fromEntries(rows.map((r) => [r.proname, r]));
    for (const r of rows) assert.equal(r.n, 1, r.proname);
    for (const name of ["create_booking", "create_multi_service_booking", "redeem_package_session"]) { assert.equal(by[name].auth, true, name); assert.equal(by[name].anon, false, name); }
    for (const name of ["booking_create_internal", "booking_release_discounts"]) { assert.equal(by[name].auth, false, name); assert.equal(by[name].anon, false, name); }
  });
});
