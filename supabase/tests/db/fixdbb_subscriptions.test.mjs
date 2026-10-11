import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// R20: a paid period lasts until it ends, an expiry job applies the end, and plan limits (max_branches, max_employees) are enforced.
// A NULL limit is unset and means no limit. No price is invented: the plans below are test rows.

let db;
let admin;
let customer;
const owner = ROLES.user(SEED.owner1);

const setPlan = (id, { branches = null, employees = null, monthly = 10, yearly = 100 } = {}) =>
  sys(db, `insert into subscription_plans (id, name_en, name_ar, price_monthly_sar, price_yearly_sar, max_branches, max_employees)
    values ($1, $1, $1, $2, $3, $4, $5)
    on conflict (id) do update set max_branches = $4, max_employees = $5, price_monthly_sar = $2, price_yearly_sar = $3`,
  [id, monthly, yearly, branches, employees]);
const subscribeRow = (plan, endsSql, status = "active") =>
  sys(db, `insert into provider_subscriptions (provider_id, plan_id, billing_interval, status, current_period_start, current_period_end)
    values ($1, $2, 'monthly', $3, now() - interval '5 days', ${endsSql})
    on conflict (provider_id) do update set plan_id = $2, status = $3, current_period_end = ${endsSql}, next_plan_id = null, next_billing_interval = null, cancel_at_period_end = false`,
  [SEED.provider1, plan, status]);
const counts = async () => (await sys(db, `select (select count(*)::int from branches where provider_id = $1) b,
  (select count(*)::int from employees e join branches br on br.id = e.branch_id where br.provider_id = $1 and e.is_active) e`, [SEED.provider1]))[0];
let n = 0;
const addBranch = (actor) => as(db, actor, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
  values ($1, $2, 'فرع', 'Riyadh', 'الرياض', 24.7, 46.7) returning id`, [SEED.provider1, `Plan Branch ${(n += 1)}`]);
const addEmployee = (actor) => as(db, actor, `insert into employees (branch_id, name_en, name_ar) values ($1, $2, 'موظف') returning id`, [SEED.branch1, `Plan Employee ${(n += 1)}`]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
});

describe("plan limits", () => {
  it("applies no limit to a provider without a subscription or to a plan whose limits are unset", async () => {
    await addBranch(owner);
    await addEmployee(owner);
    await setPlan("fx_unset");
    await subscribeRow("fx_unset", `now() + interval '10 days'`);
    await addBranch(owner);
    await addEmployee(owner);
  });

  it("refuses a branch or an active employee beyond the plan, for the owner and an administrator, but not the service role", async () => {
    const c = await counts();
    await setPlan("fx_capped", { branches: c.b, employees: c.e });
    await subscribeRow("fx_capped", `now() + interval '10 days'`);
    await expectError(addBranch(owner), /Plan limit reached/);
    await expectError(addEmployee(owner), /Plan limit reached/);
    await expectError(addBranch(admin), /Plan limit reached/);
    const [extra] = await sys(db, `insert into employees (branch_id, name_en, name_ar) values ($1, 'Service Added', 'مضاف') returning id`, [SEED.branch1]);
    // a deactivated employee cannot be switched back on beyond the limit either
    await sys(db, `update employees set is_active = false where id = $1`, [extra.id]);
    await expectError(as(db, owner, `update employees set is_active = true where id = $1`, [extra.id]), /Plan limit reached/);
    await setPlan("fx_capped", { branches: c.b + 1, employees: c.e + 1 });
    await addBranch(owner);
    await as(db, owner, `update employees set is_active = true where id = $1`, [extra.id]);
  });

  it("keeps an unrelated provider, a customer and an anonymous caller from adding anything", async () => {
    await subscribeRow("fx_unset", `now() + interval '10 days'`);
    await expectError(as(db, customer, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
      values ($1, 'x', 'x', 'x', 'x', 1, 1)`, [SEED.provider1]), /row-level security|permission denied/i);
    await expectError(as(db, ROLES.anon, `insert into employees (branch_id, name_en, name_ar) values ($1, 'x', 'x')`, [SEED.branch1]), /permission denied/i);
  });
});

describe("paid periods and expiry", () => {
  it("schedules a free plan for the end of a running paid period instead of replacing it", async () => {
    await setPlan("fx_paid");
    await subscribeRow("fx_paid", `now() + interval '10 days'`);
    const [{ r }] = await as(db, owner, `select subscribe_provider_plan($1, 'starter', 'monthly') r`, [SEED.provider1]);
    assert.equal(r.status, "scheduled");
    const [sub] = await sys(db, `select plan_id, status, next_plan_id, cancel_at_period_end from provider_subscriptions where provider_id = $1`, [SEED.provider1]);
    assert.deepEqual(sub, { plan_id: "fx_paid", status: "active", next_plan_id: "starter", cancel_at_period_end: true });
    assert.deepEqual(await as(db, ROLES.service, `select expire_provider_subscriptions() r`).then((x) => x[0].r), { switched: 0, expired: 0 });
    await sys(db, `update provider_subscriptions set current_period_end = now() - interval '1 minute' where provider_id = $1`, [SEED.provider1]);
    assert.deepEqual(await as(db, admin, `select expire_provider_subscriptions() r`).then((x) => x[0].r), { switched: 1, expired: 0 });
    const [after] = await sys(db, `select plan_id, status, next_plan_id, current_period_end > now() as running from provider_subscriptions where provider_id = $1`, [SEED.provider1]);
    assert.deepEqual(after, { plan_id: "starter", status: "active", next_plan_id: null, running: true });
  });

  it("marks an unpaid, unrenewed subscription expired and falls back to the single free plan's limits", async () => {
    await setPlan("fx_lapsing");
    await subscribeRow("fx_lapsing", `now() - interval '1 minute'`);
    assert.deepEqual(await as(db, ROLES.service, `select expire_provider_subscriptions() r`).then((x) => x[0].r), { switched: 0, expired: 1 });
    assert.equal((await sys(db, `select status from provider_subscriptions where provider_id = $1`, [SEED.provider1]))[0].status, "expired");
    const [limits] = await as(db, ROLES.service, `select * from provider_plan_limits($1)`, [SEED.provider1]);
    assert.equal(limits.source, "free_plan_after_expiry");
    assert.equal(limits.plan_id, "starter");
  });

  it("keeps the paid plan's entitlements until the period ends", async () => {
    await setPlan("fx_entitled", { branches: 50, employees: 500 });
    await subscribeRow("fx_entitled", `now() + interval '2 days'`);
    const [limits] = await as(db, ROLES.service, `select * from provider_plan_limits($1)`, [SEED.provider1]);
    assert.deepEqual([limits.plan_id, Number(limits.max_branches), limits.source], ["fx_entitled", 50, "current_plan"]);
  });

  it("refuses the expiry job and the limits lookup to everyone but an administrator or the scheduler", async () => {
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(as(db, actor, `select expire_provider_subscriptions()`), /permission denied|Only administrators/i);
    }
    await expectError(as(db, owner, `select * from provider_plan_limits($1)`, [SEED.provider1]), /permission denied/i);
    await expectError(as(db, ROLES.user(SEED.owner2), `select subscribe_provider_plan($1, 'starter', 'monthly')`, [SEED.provider1]), /Only the provider owner/);
  });
});
