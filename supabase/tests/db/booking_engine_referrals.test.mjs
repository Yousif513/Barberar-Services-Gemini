// FIX-BOOKING item 7e-2 (D4 / D4b) and MONEY part 3 (D-Q7): referral rewards come only from an approved programme (all values
// set, a different owner approving), vest on the referee's first completed, paid, unrefunded booking within the caps and the
// budget, are platform-funded wallet credits that expire, and a refund of that booking reverses what is still unspent.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { acceptTerms, disableProgramme, enableProgramme } from "./reward_fixtures.mjs";

let db;
let svc;
let a; let b; let c; let d; let e; // users
const owner1 = ROLES.user(SEED.owner1);
const money = (n) => Math.round(Number(n) * 100) / 100;
let back = 0;

const codeOf = (user) => as(db, user, `select get_or_create_referral_code() r`).then((r) => r[0].r);
const apply = (user, code) => as(db, user, `select apply_referral_code($1) r`, [code]).then((r) => r[0].r);
const referral = async (referee) => (await sys(db, `select * from customer_referrals where referee_id = $1`, [referee.sub]))[0];
const credits = (user) => sys(db, `select id, amount, remaining_amount, source, expires_at from wallet_credits where customer_id = $1 and source = 'referral' order by created_at`, [user.sub]);

// A confirmed booking in the past, completed through the provider's own command (the path that fires the reward trigger).
// paid: Tap captured the total (a booking_payment ledger row), as confirm_booking_payment records it.
const complete = async (user, { total = 85, source = "marketplace", paid = true } = {}) => {
  back += 1;
  const row = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount,
                           deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours' - make_interval(days => $6::int), 30, $5, $5, 0, 0, 0, $7) returning id`,
    [user.sub, SEED.branch1, SEED.employee1, svc.id, total, back, source]))[0];
  if (paid) {
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, $2, 'booking_payment', $3, $4, 0, $4, 'pending')`, [row.id, SEED.provider1, `chg_ref_${back}_${row.id.slice(0, 8)}`, total]);
  }
  await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [row.id]);
  return row.id;
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(async () => ROLES.user(await createUser(db))));
});

describe("referral rules (D4 / D4b, D-Q7)", () => {
  it("ships disabled with every value unset, and pays nothing", async () => {
    const seeded = (await sys(db, `select value from platform_settings where key = 'referral_program'`))[0].value;
    assert.deepEqual(seeded, { enabled: false }, "no invented amount, cap or budget");
    const [programme] = await sys(db, `select * from reward_programs where program = 'referral'`);
    assert.deepEqual([programme.enabled, programme.reward_value_sar, programme.customer_monthly_cap_sar, programme.monthly_budget_sar,
      programme.credit_expiry_days, programme.terms_version], [false, null, null, null, null, null]);
    const mine = await codeOf(a);
    assert.equal(mine.programme_active, false);
    await expectError(apply(b, mine.referral_code), /referral programme is not active/);
    await expectError(sys(db, `update platform_settings set value = '{"enabled": true, "reward_sar": 25}'::jsonb where key = 'referral_program'`), /approved programme change/);
  });

  it("generates 8-character random codes, stable per user and distinct between users", async () => {
    const codes = new Set();
    for (const user of [a, b, c, d, e]) {
      const one = await codeOf(user);
      assert.match(one.referral_code, /^REF-[0-9A-F]{8}$/);
      assert.equal((await codeOf(user)).referral_code, one.referral_code);
      codes.add(one.referral_code);
    }
    assert.equal(codes.size, 5);
  });

  it("needs the terms accepted at enrolment, and refuses abuse", async () => {
    await enableProgramme(db, "referral", { reward: 10, cap: 15, budget: 1000, expiry: 60, minQualifying: 50 });
    const info = await codeOf(a);
    assert.equal(info.programme_active, true);
    await expectError(apply(b, info.referral_code), /accept the referral programme terms/);
    for (const user of [a, b, c, d, e]) await acceptTerms(db, user, "referral");

    await expectError(apply(a, info.referral_code), /cannot refer yourself/);
    await expectError(apply(b, "REF-NOPE0000"), /Invalid referral code/);
    await expectError(as(db, ROLES.anon, `select apply_referral_code('x')`), /permission denied/);
    const ok = await apply(b, info.referral_code);
    assert.deepEqual([ok.success, money(ok.reward_amount_sar)], [true, 10]);
    await expectError(apply(b, info.referral_code), /already been applied/);
    await complete(c);
    await expectError(apply(c, info.referral_code), /new customers only/);
  });

  it("vests nothing for a walk-in, an unpaid visit or a visit below the minimum", async () => {
    await complete(b, { total: 100, source: "walk_in" });
    await complete(b, { total: 100, paid: false });
    await complete(b, { total: 30 });
    assert.equal((await referral(b)).status, "pending");
    assert.deepEqual(await credits(a), []);
    assert.deepEqual(await credits(b), []);
  });

  it("pays both sides once on the first completed, paid, unrefunded visit, with the published expiry, funded by the platform", async () => {
    await complete(b, { total: 85 });
    const r = await referral(b);
    assert.equal(r.status, "rewarded");
    assert.deepEqual([money((await credits(a))[0].amount), money((await credits(b))[0].amount)], [10, 10]);
    const days = (new Date((await credits(b))[0].expires_at) - Date.now()) / 86400000;
    assert.ok(days > 59 && days <= 60, "expires after the published 60 days");
    await complete(b, { total: 120 });
    assert.equal((await credits(a)).length, 1, "a second booking pays nothing more");
  });

  it("holds the per-customer monthly cap: the referrer is not credited past it, the referee still is", async () => {
    const info = await codeOf(a);
    await apply(d, info.referral_code);
    await complete(d, { total: 85 });
    const r = await referral(d);
    assert.equal(r.status, "rewarded");
    assert.equal(r.vest_notes.referrer, "monthly_cap_or_budget_reached", "SAR 10 + 10 would pass the SAR 15 cap");
    assert.equal((await credits(a)).length, 1);
    assert.equal((await credits(d)).length, 1);
  });

  it("reverses what is unspent when the qualifying visit is refunded", async () => {
    const info = await codeOf(c);
    await apply(e, info.referral_code);
    const booking = await complete(e, { total: 85 });
    const [credit] = await credits(e);
    const [refund] = await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key, status)
      select $1, id, payment_intent_id, 85, 'Customer refund', 'admin', 'ref-rev-1', 'processing' from transactional_ledger where booking_id = $1 and entry_type = 'booking_payment'
      returning id`, [booking]);
    await sys(db, `update refund_requests set status = 'succeeded' where id = $1`, [refund.id]);
    const [reversal] = await sys(db, `select reversed_amount, already_spent_amount from reward_reversals where wallet_credit_id = $1`, [credit.id]);
    assert.deepEqual([money(reversal.reversed_amount), money(reversal.already_spent_amount)], [10, 0]);
    assert.equal(money((await credits(e))[0].remaining_amount), 0);
    assert.ok((await referral(e)).reversed_at);
  });

  it("a programme switched off pays nothing even for pending referrals", async () => {
    const f = ROLES.user(await createUser(db));
    await acceptTerms(db, f, "referral");
    await apply(f, (await codeOf(c)).referral_code);
    await disableProgramme(db, "referral");
    await complete(f, { total: 85 });
    assert.equal((await referral(f)).status, "pending");
    assert.deepEqual(await credits(f), []);
  });

  it("keeps one version of each function and the client privileges", async () => {
    const rows = await sys(db, `select proname, count(*)::int n, bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth
      from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_or_create_referral_code','apply_referral_code') group by 1`);
    for (const r of rows) { assert.equal(r.n, 1, r.proname); assert.equal(r.auth, true); assert.equal(r.anon, false); }
  });
});
