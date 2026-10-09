// FIX-MONEY: M-06 of docs/reviews/2026-10-08-security-money.md. One server-side price quote, used by the charge and by the screen.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { as, createMigratedDb, expectError, ROLES, SEED, sys } from "./harness.mjs";

const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);
let db;

before(async () => {
  db = await createMigratedDb();
});

describe("M-06: subscription price quote", () => {
  it("a yearly plan is charged 12 x the annual per-month rate, and the quote says so", async () => {
    const q = (await as(db, owner1, `select quote_provider_plan('growth', 'yearly') q`))[0].q;
    assert.equal(Number(q.total_sar), 12 * 239);
    assert.equal(Number(q.monthly_rate_sar), 239);
    assert.equal(q.months, 12);
    const r = (await as(db, owner1, `select subscribe_provider_plan($1, 'growth', 'yearly') r`, [SEED.provider1]))[0].r;
    assert.equal(Number(r.amount_sar), Number(q.total_sar), "the charge is the quote");
    const stored = (await sys(db, `select amount::float8 a from subscription_payments where id = $1`, [r.purchase_id]))[0].a;
    assert.equal(stored, 2868);
    // the webhook amount check is against the quoted total, so the old one-month charge no longer activates a year
    await assert.rejects(as(db, ROLES.service, `select confirm_purchase_payment('subscription', $1, 'chg_fm_q_short', 239)`, [r.purchase_id]), /does not match/);
    const ok = (await as(db, ROLES.service, `select confirm_purchase_payment('subscription', $1, 'chg_fm_q_ok', 2868) r`, [r.purchase_id]))[0].r;
    assert.equal(ok.status, "activated");
  });

  it("monthly, elite and free plans quote their own prices", async () => {
    assert.equal(Number((await as(db, owner1, `select quote_provider_plan('growth', 'monthly') q`))[0].q.total_sar), 299);
    assert.equal(Number((await as(db, owner1, `select quote_provider_plan('elite', 'yearly') q`))[0].q.total_sar), 12 * 639);
    assert.equal(Number((await as(db, owner1, `select quote_provider_plan('starter', 'yearly') q`))[0].q.total_sar), 0);
  });

  it("refuses an unknown plan or interval, and anonymous callers", async () => {
    await expectError(as(db, owner1, `select quote_provider_plan('nope', 'monthly')`), /Plan not found/);
    await expectError(as(db, owner1, `select quote_provider_plan('growth', 'weekly')`), /monthly or yearly/);
    await expectError(as(db, ROLES.anon, `select quote_provider_plan('growth', 'monthly')`), /permission denied/);
    // a customer may quote (it is the public price list) but cannot subscribe a provider
    assert.equal(Number((await as(db, customer, `select quote_provider_plan('growth', 'monthly') q`))[0].q.total_sar), 299);
    await expectError(as(db, customer, `select subscribe_provider_plan($1, 'growth', 'yearly')`, [SEED.provider1]), /provider owner/);
  });

  it("the provider pricing screen shows the server quote, not numbers of its own", () => {
    const page = readFileSync(new URL("../../../web_platform/src/app/provider/pricing/page.tsx", import.meta.url), "utf8");
    assert.match(page, /rpc\("quote_provider_plan"/);
    assert.doesNotMatch(page, /basePricePerMonth/);
    assert.doesNotMatch(page, /\*\s*12\b/);
  });
});
