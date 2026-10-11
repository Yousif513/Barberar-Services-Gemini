import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// C-D11: a no-show strike can be contested by the customer (pausing it) and cleared or upheld by an administrator.

let db;
let admin;
let customer;
let other;
let svc;
const owner = ROLES.user(SEED.owner1);
let day = 0;

const noShow = async (who = customer) => {
  day += 1;
  const [row] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
    values ($1, $2, $3, $4, 'confirmed', now() - make_interval(days => $5::int) - interval '3 hours', 30, 100, 100, 0, 0) returning id`,
    [who.sub, SEED.branch1, SEED.employee1, svc.id, day]);
  await as(db, owner, `select mark_booking_no_show($1, 'Customer did not arrive')`, [row.id]);
  return row.id;
};
const eligibility = async () => (await as(db, customer, `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, customer.sub]))[0].r;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  other = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
});

describe("no-show appeal", () => {
  it("pauses the strike while a contest is open, restores it when upheld, and removes it when cleared", async () => {
    const bookings = [await noShow(), await noShow(), await noShow()];
    let e = await eligibility();
    assert.deepEqual([e.no_show_strikes, e.requires_full_prepayment], [3, true]);

    const filed = (await as(db, customer, `select contest_no_show($1, 'I cancelled by phone and the salon never recorded it') r`, [bookings[0]]))[0].r;
    assert.equal(filed.status, "open");
    assert.equal((await as(db, customer, `select contest_no_show($1, 'Filing the same contest again') r`, [bookings[0]]))[0].r.already_filed, true);
    e = await eligibility();
    assert.deepEqual([e.no_show_strikes, e.requires_full_prepayment], [2, false], "the contested strike is paused");

    const upheld = (await as(db, admin, `select admin_uphold_no_show_contest($1, 'The salon logs show no call') r`, [bookings[0]]))[0].r;
    assert.equal(upheld.status, "upheld");
    assert.equal((await eligibility()).no_show_strikes, 3, "an upheld contest counts again");

    const cleared = (await as(db, admin, `select admin_clear_no_show($1, 'Customer showed the cancellation message') r`, [bookings[1]]))[0].r;
    assert.equal(cleared.cleared, true);
    assert.equal((await as(db, admin, `select admin_clear_no_show($1, 'Repeated clearing request') r`, [bookings[1]]))[0].r.already_cleared, true);
    assert.equal((await eligibility()).no_show_strikes, 2);
    const [log] = await sys(db, `select details from admin_audit_logs where action = 'booking.no_show_cleared' and target_id = $1`, [bookings[1]]);
    assert.equal(log.details.reason, "Customer showed the cancellation message");
    assert.equal((await sys(db, `select status from bookings where id = $1`, [bookings[1]]))[0].status, "no_show", "the booking status is untouched");
  });

  it("refuses a contest for another person's booking, a booking that was not a no-show, and a missing reason", async () => {
    const booking = await noShow();
    await expectError(as(db, other, `select contest_no_show($1, 'This is not my booking at all')`, [booking]), /not found/i);
    await expectError(as(db, ROLES.anon, `select contest_no_show($1, 'Anonymous attempt')`, [booking]), /permission denied/i);
    await expectError(as(db, owner, `select contest_no_show($1, 'The provider cannot contest')`, [booking]), /not found/i);
    await expectError(as(db, customer, `select contest_no_show($1, 'x')`, [booking]), /reason/);
    const [done] = await sys(db, `select id from bookings where customer_id = $1 and status <> 'no_show' limit 1`, [customer.sub]);
    if (done) await expectError(as(db, customer, `select contest_no_show($1, 'Not a no-show booking')`, [done.id]), /Only a booking marked/);
  });

  it("lets only an administrator clear or uphold, with a reason", async () => {
    const booking = await noShow();
    await as(db, customer, `select contest_no_show($1, 'Contest for the role checks')`, [booking]);
    for (const fn of ["admin_clear_no_show", "admin_uphold_no_show_contest"]) {
      for (const actor of [ROLES.anon, customer, owner, other]) {
        await expectError(as(db, actor, `select ${fn}($1, 'Not an administrator')`, [booking]), /permission denied|Administrator access/i);
      }
      await expectError(as(db, admin, `select ${fn}($1, 'x')`, [booking]), /reason/);
    }
    await expectError(as(db, admin, `select admin_clear_no_show($1, 'Unknown booking')`, [SEED.provider1]), /not found/i);
  });

  it("shows a contest to its customer and an administrator only, and accepts no direct writes", async () => {
    const mine = await as(db, customer, `select id from no_show_contests`);
    assert.ok(mine.length >= 1);
    assert.equal((await as(db, other, `select id from no_show_contests`)).length, 0);
    assert.equal((await as(db, owner, `select id from no_show_contests`)).length, 0);
    await expectError(as(db, customer, `update no_show_contests set status = 'cleared'`), /permission denied|row-level/i);
    await expectError(as(db, customer, `insert into no_show_contests (booking_id, customer_id, reason) select id, customer_id, 'direct' from bookings limit 1`), /permission denied|row-level/i);
    await expectError(as(db, ROLES.anon, `select id from no_show_contests`), /permission denied/i);
  });
});
