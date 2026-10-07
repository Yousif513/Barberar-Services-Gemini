// FIX-BOOKING item 7e-2 (D4 / D4b): referral amounts come from platform_settings (unset = no payout), abuse rules, collision-free codes.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let a; let b; let c; let d; let e; // users
const owner1 = ROLES.user(SEED.owner1);
const money = (n) => Math.round(Number(n) * 100) / 100;
let back = 0;

const setProgramme = (value) => sys(db, `update platform_settings set value = $1::jsonb where key = 'referral_program'`, [JSON.stringify(value)]);
const codeOf = (user) => as(db, user, `select get_or_create_referral_code() r`).then((r) => r[0].r);
const apply = (user, code) => as(db, user, `select apply_referral_code($1) r`, [code]).then((r) => r[0].r);
const referral = async (referee) => (await sys(db, `select * from customer_referrals where referee_id = $1`, [referee.sub]))[0];
const credits = (user) => sys(db, `select amount, source from wallet_credits where customer_id = $1 and source = 'referral'`, [user.sub]);

// A confirmed booking in the past, completed through the provider's own command (the path that fires the reward trigger).
const complete = async (user, { total = 85, source = "marketplace" } = {}) => {
  back += 1;
  const row = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount,
                           deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, 'confirmed', now() - interval '3 hours' - make_interval(days => $6::int), 30, $5, $5, 0, 0, 0, $7) returning id`,
    [user.sub, SEED.branch1, SEED.employee1, svc.id, total, back, source]))[0];
  await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [row.id]);
  return row.id;
};

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(async () => ROLES.user(await createUser(db))));
});

describe("referral rules (D4 / D4b)", () => {
  it("is switched off and pays nothing until the owner sets an amount (reproduced: SAR 25 was hard-coded)", async () => {
    const seeded = (await sys(db, `select value from platform_settings where key = 'referral_program'`))[0].value;
    assert.equal(seeded.reward_sar, undefined, "the invented amount is gone from the seed");
    const mine = await codeOf(a);
    assert.equal(mine.programme_active, false);
    assert.equal(mine.reward_per_friend_sar, null);
    await expectError(apply(b, mine.referral_code), /referral programme is not active/);
    // enabled but no amount: still no payout, codes cannot be applied
    await setProgramme({ enabled: true });
    await expectError(apply(b, mine.referral_code), /referral programme is not active/);
    assert.equal((await codeOf(a)).programme_active, false);
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
    const many = [];
    for (let i = 0; i < 25; i += 1) many.push(await createUser(db).then((id) => codeOf(ROLES.user(id))).then((r) => r.referral_code));
    assert.equal(new Set(many).size, 25);
  });

  it("applies with the amount from the setting and refuses abuse", async () => {
    await setProgramme({ enabled: true, reward_sar: 10, min_qualifying_sar: 50, max_rewards_per_referrer_30d: 1 });
    const info = await codeOf(a);
    assert.deepEqual([info.programme_active, money(info.reward_per_friend_sar), money(info.min_qualifying_sar)], [true, 10, 50]);

    await expectError(apply(a, info.referral_code), /cannot refer yourself/);
    await expectError(apply(b, "REF-NOPE0000"), /Invalid referral code/);
    await expectError(apply(b, "   "), /code is required/);
    await expectError(as(db, ROLES.anon, `select apply_referral_code('x')`), /permission denied/);

    const ok = await apply(b, info.referral_code);
    assert.deepEqual([ok.success, money(ok.reward_amount_sar)], [true, 10]);
    assert.match(ok.message, /10 SAR/);
    assert.equal(money((await referral(b)).reward_amount), 10);
    await expectError(apply(b, info.referral_code), /already been applied/);

    // mutual referral: b used a's code, so a cannot use b's
    const bInfo = await codeOf(b);
    await expectError(apply(a, bInfo.referral_code), /already used your referral code/);

    // customers with history are not new
    await complete(c);
    await expectError(apply(c, info.referral_code), /new customers only/);
  });

  it("pays nothing for a walk-in booking or a booking below the minimum", async () => {
    await complete(b, { total: 100, source: "walk_in" });
    assert.equal((await referral(b)).status, "pending");
    await complete(b, { total: 30 });
    assert.equal((await referral(b)).status, "pending");
    assert.deepEqual(await credits(a), []);
    assert.deepEqual(await credits(b), []);
  });

  it("pays both sides once, from the setting, on the first qualifying completed booking", async () => {
    await complete(b, { total: 85 });
    const r = await referral(b);
    assert.equal(r.status, "rewarded");
    assert.ok(r.qualifying_booking_id && r.rewarded_at);
    assert.deepEqual((await credits(a)).map((x) => money(x.amount)), [10]);
    assert.deepEqual((await credits(b)).map((x) => money(x.amount)), [10]);
    await complete(b, { total: 120 });
    assert.equal((await credits(a)).length, 1, "a second booking pays nothing more");
    assert.equal((await credits(b)).length, 1);
  });

  it("closes a referral over the per-referrer cap without paying anyone", async () => {
    const info = await codeOf(a);
    await apply(d, info.referral_code);
    await complete(d, { total: 85 });
    const r = await referral(d);
    assert.equal(r.status, "disqualified");
    assert.deepEqual(await credits(d), []);
    assert.equal((await credits(a)).length, 1, "the referrer's earlier reward is the only one");
  });

  it("without a cap setting the cap is not applied, and the amount is read when the reward is paid", async () => {
    await setProgramme({ enabled: true, reward_sar: 12 });
    const info = await codeOf(a);
    await apply(e, info.referral_code);
    await complete(e, { total: 20 });
    assert.deepEqual((await credits(e)).map((x) => money(x.amount)), [12]);
    assert.deepEqual((await credits(a)).map((x) => money(x.amount)).sort(), [10, 12]);
  });

  it("a programme switched off pays nothing even for pending referrals", async () => {
    await setProgramme({ enabled: true, reward_sar: 10 });
    const f = ROLES.user(await createUser(db));
    const info = await codeOf(a);
    await apply(f, info.referral_code);
    await setProgramme({ enabled: false, reward_sar: 10 });
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
