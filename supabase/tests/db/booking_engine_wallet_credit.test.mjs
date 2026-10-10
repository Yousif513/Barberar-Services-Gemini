// FIX-BOOKING item 7e-1 (D4 / C-D4 part b): wallet credit can be spent at checkout, oldest first, restored on cancellation, settled with the provider.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let stranger;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const money = (n) => Math.round(Number(n) * 100) / 100;
const PRICE = 85;
const DUE = 97.75; // 85.00 + 15% VAT
let slot = 0;

const credit = (owner, amount, { daysOld = 0, expires = "90 days", spent = false } = {}) => sys(db,
  `insert into wallet_credits (customer_id, amount, reason, source, is_spent, expires_at, created_at)
   values ($1, $2, 'Referral reward', 'referral', $3, now() + $4::interval, now() - make_interval(days => $5::int)) returning id`,
  [owner, amount, spent, expires, daysOld]).then((r) => r[0].id);
const rows = (owner = SEED.customer) => sys(db, `select id, amount, remaining_amount, is_spent from wallet_credits where customer_id = $1 order by created_at, id`, [owner]);
// Fixture reset as the table owner: D-Q8 makes wallet credits append-only (no DELETE statement), so the reset lifts the trigger
// for its own transaction only.
const clear = async () => {
  await sys(db, `alter table wallet_credits disable trigger trg_money_append_only`);
  await sys(db, `delete from wallet_credits where customer_id in ($1, $2)`, [SEED.customer, stranger.sub]);
  await sys(db, `alter table wallet_credits enable trigger trg_money_append_only`);
};
const book = (amount, { user = customer } = {}) => {
  slot += 1;
  const minutes = 9 * 60 + (slot % 14) * 30;
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_wallet_credit_amount => $4)`,
    [SEED.employee1, svc.id, riyadh(hhmm), amount]).then((r) => r[0]);
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  await sys(db, `update services set base_price = $2, base_duration_minutes = 30 where id = $1`, [svc.id, PRICE]);
  await sys(db, `update employee_services set custom_price = null, custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  stranger = ROLES.user(await createUser(db));
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  await clear();
});

describe("wallet credit spend (D4 / C-D4)", () => {
  it("spends credit oldest first with partial use, and reduces what is due (reproduced: credit could never be spent)", async () => {
    const old = await credit(SEED.customer, 20, { daysOld: 10 });
    const mid = await credit(SEED.customer, 30, { daysOld: 5 });
    const fresh = await credit(SEED.customer, 40, { daysOld: 1 });
    const b = await book(35);
    assert.equal(money(b.wallet_credit_amount), 35);
    const after = Object.fromEntries((await rows()).map((r) => [r.id, r]));
    assert.equal(money(after[old].remaining_amount), 0);
    assert.equal(after[old].is_spent, true);
    assert.equal(money(after[mid].remaining_amount), 15, "30 - the 15 still needed");
    assert.equal(after[mid].is_spent, false);
    assert.equal(money(after[fresh].remaining_amount), 40);
    const red = await sys(db, `select wallet_credit_id, amount from wallet_credit_redemptions where booking_id = $1 order by amount desc`, [b.id]);
    assert.deepEqual(red.map((r) => [r.wallet_credit_id, money(r.amount)]), [[old, 20], [mid, 15]]);
  });

  it("a visit fully covered by credit is confirmed with nothing to collect, never above what is due", async () => {
    await credit(SEED.customer, 60, { daysOld: 3 });
    await credit(SEED.customer, 60, { daysOld: 1 });
    const b = await book(120);
    assert.equal(money(b.wallet_credit_amount), DUE);
    assert.equal(money(b.deposit_required), 0);
    assert.equal(b.status, "confirmed");
    const left = (await rows()).map((r) => money(r.remaining_amount));
    assert.deepEqual(left, [0, money(120 - DUE)]);
  });

  it("a partial use lowers the deposit only when what is due falls below it", async () => {
    await credit(SEED.customer, 100);
    const plain = await book(0);
    assert.equal(money(plain.wallet_credit_amount), 0);
    const base = money(plain.deposit_required);
    const small = await book(10);
    assert.equal(money(small.deposit_required), base, "deposit 20% of 85 is below what stays due");
    const big = await book(90);
    assert.equal(money(big.wallet_credit_amount), 90);
    assert.equal(money(big.deposit_required), money(Math.min(base, DUE - 90)));
  });

  it("refuses more than the usable credit; spent, expired and other people's credit never count", async () => {
    await credit(SEED.customer, 25, { spent: true });
    await credit(SEED.customer, 25, { expires: "-1 day" });
    await credit(stranger.sub, 50);
    await credit(SEED.customer, 10);
    await expectError(book(10.01), /Not enough wallet credit/);
    await expectError(book(-5), /not valid/);
    await expectError(book(1.005), /not valid/);
    const ok = await book(10);
    assert.equal(money(ok.wallet_credit_amount), 10);
    assert.equal((await rows(stranger.sub)).map((r) => money(r.remaining_amount))[0], 50, "the stranger's credit is untouched");
  });

  it("cancelling puts the credit back, once", async () => {
    const a = await credit(SEED.customer, 20, { daysOld: 2 });
    const c = await credit(SEED.customer, 40, { daysOld: 1 });
    const b = await book(50);
    assert.deepEqual((await rows()).map((r) => [money(r.remaining_amount), r.is_spent]), [[0, true], [10, false]]);
    await as(db, customer, `select cancel_booking($1, 'changed my mind')`, [b.id]);
    assert.deepEqual((await rows()).map((r) => [money(r.remaining_amount), r.is_spent]), [[20, false], [40, false]]);
    await sys(db, `select booking_release_discounts($1)`, [b.id]);
    assert.deepEqual((await rows()).map((r) => money(r.remaining_amount)), [20, 40], "releasing twice adds nothing");
    assert.ok(a && c);
  });

  it("a payment that arrives after the hold was released is a conflict, so restored wallet credit cannot be used twice (M-03)", async () => {
    await credit(SEED.customer, 30, { daysOld: 1 });
    const b = await book(30);
    assert.ok(Number(b.deposit_required) > 0, "a deposit is still due after the credit");
    // the sweeper cancels the unpaid hold and gives the discounts back
    await sys(db, `update bookings set status = 'cancelled', cancelled_by = 'system', cancelled_at = now() where id = $1`, [b.id]);
    await sys(db, `select booking_release_discounts($1)`, [b.id]);
    assert.deepEqual((await rows()).map((r) => [money(r.remaining_amount), r.is_spent]), [[30, false]], "the credit is spendable again");
    const late = (await as(db, ROLES.service, `select confirm_booking_payment($1, 'chg_late_wallet', $2) r`, [b.id, b.deposit_required]))[0].r;
    assert.equal(late.conflict, true, "the late payment is refunded, the booking is not resurrected");
    assert.equal((await sys(db, `select status from bookings where id = $1`, [b.id]))[0].status, "cancelled");
    assert.deepEqual((await rows()).map((r) => [money(r.remaining_amount), r.is_spent]), [[30, false]], "the credit was not consumed twice");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where idempotency_key = 'late:chg_late_wallet'`))[0].n, 1);
  });

  it("the platform settles the credit with the provider when the visit is completed", async () => {
    const creditId = await credit(SEED.customer, 30);
    const past = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount,
                             deposit_required, platform_commission, source, wallet_credit_amount)
       values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours', 30, 85, 55, 8.25, 0, 0, 'link', 30) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0];
    // GOV-1 review C-2: the settlement follows the redemption rows, not the number on the booking.
    await sys(db, `insert into wallet_credit_redemptions (wallet_credit_id, booking_id, customer_id, amount) values ($1, $2, $3, 30)`, [creditId, past.id, SEED.customer]);
    await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [past.id]);
    const entry = await sys(db, `select entry_type, provider_id, total_captured, platform_share, provider_share, payout_status
                                 from transactional_ledger where booking_id = $1 and entry_type = 'wallet_credit_settlement'`, [past.id]);
    assert.equal(entry.length, 1);
    assert.deepEqual([entry[0].provider_id, money(entry[0].total_captured), money(entry[0].platform_share), money(entry[0].provider_share), entry[0].payout_status],
      [SEED.provider1, 0, 0, 30, "pending"]);
    assert.equal((await sys(db, `select funded_by from transactional_ledger where booking_id = $1 and entry_type = 'wallet_credit_settlement'`, [past.id]))[0].funded_by, "platform");

    // A booking that names a wallet credit nobody redeemed settles nothing (the forged-column route of review C-2).
    const forged = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount,
                             deposit_required, platform_commission, source, wallet_credit_amount)
       values ($1, $2, $3, $4, 'confirmed', now() - interval '5 hours', 30, 85, 55, 8.25, 0, 0, 'link', 25000) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0];
    await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [forged.id]);
    assert.equal((await sys(db, `select count(*)::int n from transactional_ledger where booking_id = $1 and entry_type = 'wallet_credit_settlement'`, [forged.id]))[0].n, 0);
  });

  it("customers read their own redemptions, nobody writes them", async () => {
    await credit(SEED.customer, 30);
    await book(30);
    assert.equal((await as(db, customer, `select count(*)::int n from wallet_credit_redemptions`))[0].n, 1);
    assert.equal((await as(db, stranger, `select count(*)::int n from wallet_credit_redemptions`))[0].n, 0);
    await expectError(as(db, ROLES.anon, `select count(*) from wallet_credit_redemptions`), /permission denied/);
    await expectError(as(db, customer, `insert into wallet_credit_redemptions (wallet_credit_id, booking_id, customer_id, amount) select id, (select id from bookings limit 1), $1, 1 from wallet_credits limit 1`, [SEED.customer]), /permission denied|row-level/);
    await as(db, customer, `update wallet_credits set remaining_amount = 0, amount = 999 where customer_id = $1`, [SEED.customer]).catch(() => {});
    assert.equal((await sys(db, `select count(*)::int n from wallet_credits where amount = 999`))[0].n, 0, "a customer cannot rewrite their own credit");
  });

  it("works through create_multi_service_booking and keeps one version of each function", async () => {
    await credit(SEED.customer, 20);
    const r = (await as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb,
         request_wallet_credit_amount => 20) r`,
      [SEED.branch1, SEED.employee1, riyadh("16:00"), JSON.stringify([{ service_id: svc.id }])]))[0].r;
    assert.equal(r.success, true);
    assert.equal(money((await sys(db, `select wallet_credit_amount w from bookings where id = $1`, [r.booking_id]))[0].w), 20);
    const fn = await sys(db, `select proname, count(*)::int n, bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth
      from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_booking','create_multi_service_booking','booking_create_internal') group by 1`);
    for (const f of fn) assert.equal(f.n, 1, f.proname);
    assert.equal(fn.find((f) => f.proname === "booking_create_internal").auth, false);
  });
});
