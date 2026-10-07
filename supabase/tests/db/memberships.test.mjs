// G65 Memberships: plans, purchase through the payment webhook, visits redeemed against bookings, expiry and reminders.
// Weight is on money: a membership is paid only by a service-role confirmation, the amounts equal a package sale, and a plan edit never
// reaches a membership that was already sold.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svcA;
let svcB;
let svcOther;
let stranger;
let seq = 0;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
let staff1;
let staff2;
const EMPLOYEE_P2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4"; // an employee of the second provider
const money = (n) => Math.round(Number(n) * 100) / 100;
const key = () => `membership-key-${Date.now()}-${(seq += 1)}`;

const createPlan = (user, over = {}) => as(db, user,
  `select provider_create_membership_plan($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[]) r`,
  [over.provider ?? SEED.provider1, over.nameEn ?? "Monthly cuts", over.nameAr ?? "قصات شهرية", over.descEn ?? "Four cuts a month", over.descAr ?? "أربع قصات شهرياً",
   over.price ?? 300, over.days ?? 30, over.visits ?? 4, over.all ?? false, over.services ?? [svcA.id]]).then((r) => r[0].r);
const activatePlan = (user, id, on = true) => as(db, user, `select provider_set_membership_plan_active($1, $2) r`, [id, on]).then((r) => r[0].r);
const livePlan = async (over = {}) => {
  const p = await createPlan(owner1, over);
  await activatePlan(owner1, p.plan_id);
  return p.plan_id;
};
const buy = (user, planId, k = key()) => as(db, user, `select purchase_membership($1, $2) r`, [planId, k]).then((r) => r[0].r);
const confirm = (id, intent, amount) => as(db, ROLES.service, `select confirm_membership_payment($1, $2, $3) r`, [id, intent, amount]).then((r) => r[0].r);
const mem = async (id) => (await sys(db, `select * from memberships where id = $1`, [id]))[0];
const ledgerFor = async (intent) => sys(db, `select entry_type, provider_id, total_captured, platform_share, provider_share, payout_status from transactional_ledger where payment_intent_id = $1`, [intent]);
const paidMembership = async (over = {}) => {
  const planId = over.planId ?? (await livePlan(over.plan));
  const m = await buy(over.user ?? customer, planId);
  await confirm(m.membership_id, `chg_mem_${(seq += 1)}_${Date.now()}`, over.amount ?? 300);
  return m.membership_id;
};

before(async () => {
  db = await createMigratedDb();
  svcA = await serviceFor(db, SEED.employee1, 0);
  svcB = await serviceFor(db, SEED.employee1, 1);
  svcOther = await serviceFor(db, EMPLOYEE_P2, 0);
  stranger = ROLES.user(await createUser(db));
  // Seed employees have no login; give one at each provider an account so staff rights can be tested.
  staff1 = ROLES.user(await createUser(db, { role: "provider_employee" }));
  staff2 = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [staff1.sub, SEED.employee1]);
  await sys(db, `update employees set profile_id = $1 where id = $2`, [staff2.sub, EMPLOYEE_P2]);
});

describe("membership plans", () => {
  it("are created inactive with exactly the provider's own terms, and only the provider owner can manage them", async () => {
    const p = await createPlan(owner1);
    assert.equal(p.is_active, false, "nothing is on sale until the provider says so");
    const row = (await sys(db, `select * from membership_plans where id = $1`, [p.plan_id]))[0];
    assert.equal(money(row.price), 300);
    assert.equal(row.period_days, 30);
    assert.equal(row.visits_per_period, 4);
    assert.equal(row.covers_all_services, false);
    assert.deepEqual((await sys(db, `select service_id from membership_plan_services where plan_id = $1`, [p.plan_id])).map((r) => r.service_id), [svcA.id]);

    await expectError(createPlan(ROLES.anon), /permission denied/);
    await expectError(createPlan(customer), /Only the provider owner/);
    await expectError(createPlan(stranger), /Only the provider owner/);
    await expectError(createPlan(owner2), /Only the provider owner/);
    await expectError(createPlan(staff1), /Only the provider owner/);
    await expectError(activatePlan(staff1, p.plan_id), /Only the provider owner/);
    await expectError(activatePlan(owner2, p.plan_id), /Plan not found/);
    await expectError(activatePlan(customer, p.plan_id), /Plan not found/);
    await expectError(activatePlan(ROLES.anon, p.plan_id), /permission denied/);
    await expectError(as(db, owner2, `select provider_update_membership_plan($1, 'x', 'y', null, null, 10, 30, 1, true, '{}'::uuid[])`, [p.plan_id]), /Plan not found/);
  });

  it("validate the terms: names, SAR price, period, visits, and that covered services belong to the provider", async () => {
    await expectError(createPlan(owner1, { nameAr: " " }), /Arabic plan name/);
    await expectError(createPlan(owner1, { price: 0 }), /positive SAR amount/);
    await expectError(createPlan(owner1, { price: -5 }), /positive SAR amount/);
    await expectError(createPlan(owner1, { price: 10.555 }), /two decimals/);
    await expectError(createPlan(owner1, { days: 0 }), /between 1 and 3660/);
    await expectError(createPlan(owner1, { visits: 0 }), /between 1 and 1000/);
    await expectError(createPlan(owner1, { services: [] }), /at least one covered service/);
    await expectError(createPlan(owner1, { services: [svcOther.id] }), /belong to this provider/);
    await expectError(createPlan(owner1, { all: true, services: [svcA.id] }), /cannot also list/);
    await expectError(createPlan(owner1, { provider: "00000000-0000-4000-8000-000000000999" }), /Provider not found/);
    const all = await createPlan(owner1, { all: true, services: [] });
    assert.equal((await sys(db, `select count(*)::int n from membership_plan_services where plan_id = $1`, [all.plan_id]))[0].n, 0);
  });

  it("are readable by customers only while on sale; drafts are visible to the owner and the administrator only", async () => {
    const p = await createPlan(owner1);
    assert.equal((await as(db, customer, `select id from membership_plans where id = $1`, [p.plan_id])).length, 0);
    assert.equal((await as(db, owner2, `select id from membership_plans where id = $1`, [p.plan_id])).length, 0);
    assert.equal((await as(db, owner1, `select id from membership_plans where id = $1`, [p.plan_id])).length, 1);
    await activatePlan(owner1, p.plan_id);
    assert.equal((await as(db, customer, `select id from membership_plans where id = $1`, [p.plan_id])).length, 1);
    await expectError(as(db, ROLES.anon, `select id from membership_plans`), /permission denied/);
    await expectError(as(db, customer, `update membership_plans set price = 1 where id = $1`, [p.plan_id]), /permission denied/);
    await expectError(as(db, owner1, `insert into membership_plans (provider_id, name_en, name_ar, price, period_days, visits_per_period, covers_all_services) values ($1, 'x', 'y', 1, 1, 1, true)`, [SEED.provider1]), /permission denied/);
  });
});

describe("buying a membership", () => {
  it("creates a pending membership that carries the plan's terms and is NOT usable until the webhook confirms it", async () => {
    const planId = await livePlan();
    const m = await buy(customer, planId);
    assert.equal(m.status, "pending_payment");
    assert.equal(m.purchase_type, "membership");
    assert.equal(money(m.amount_sar), 300);
    const row = await mem(m.membership_id);
    assert.equal(row.status, "pending_payment");
    assert.equal(row.visits_remaining, 0);
    assert.equal(row.period_end, null);
    assert.equal(row.customer_id, SEED.customer);
    assert.equal(row.payment_intent_id, null);
    assert.equal((await ledgerFor("anything")).length, 0);
  });

  it("refuses an inactive plan, an unknown plan, anonymous callers and a reused key for a different plan; replays the same key", async () => {
    const draft = (await createPlan(owner1)).plan_id;
    await expectError(buy(customer, draft), /not found or not on sale/);
    await expectError(buy(customer, "00000000-0000-4000-8000-000000000999"), /not found or not on sale/);
    await expectError(buy(ROLES.anon, draft), /permission denied/);
    const a = await livePlan();
    const b = await livePlan({ price: 120 });
    const k = key();
    const first = await buy(customer, a, k);
    const again = await buy(customer, a, k);
    assert.equal(again.membership_id, first.membership_id);
    assert.equal(again.replayed, true);
    await expectError(buy(customer, b, k), /already used for a different purchase/);
    await expectError(buy(customer, a, "short"), /idempotency key/);
    assert.equal((await sys(db, `select count(*)::int n from memberships where customer_id = $1 and idempotency_key = $2`, [SEED.customer, k]))[0].n, 1);
    assert.equal((await sys(db, `select count(*)::int n from membership_payments where membership_id = $1`, [first.membership_id]))[0].n, 1);
  });

  it("refuses a plan of a suspended provider", async () => {
    const planId = await livePlan();
    await sys(db, `update providers set status = 'suspended' where id = $1`, [SEED.provider1]);
    try { await expectError(buy(customer, planId), /not found or not on sale/); }
    finally { await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider1]); }
  });

  it("the customer cannot activate, extend or edit their own membership, and cannot call the confirmation", async () => {
    const m = await buy(customer, await livePlan());
    await expectError(as(db, customer, `update memberships set status = 'active', visits_remaining = 4 where id = $1`, [m.membership_id]), /permission denied/);
    await expectError(as(db, customer, `insert into memberships (customer_id, provider_id, status, plan_name_en, plan_name_ar, amount_due, period_days, visits_per_period, covers_all_services, idempotency_key) values ($1, $2, 'active', 'x', 'y', 1, 30, 4, true, 'forged-key-123')`, [SEED.customer, SEED.provider1]), /permission denied/);
    await expectError(as(db, customer, `select confirm_membership_payment($1, 'chg_self', 300)`, [m.membership_id]), /permission denied/);
    await expectError(as(db, owner1, `select confirm_membership_payment($1, 'chg_owner', 300)`, [m.membership_id]), /permission denied/);
    await expectError(as(db, ROLES.anon, `select confirm_membership_payment($1, 'chg_anon', 300)`, [m.membership_id]), /permission denied/);
    assert.equal((await mem(m.membership_id)).status, "pending_payment");
    assert.equal((await ledgerFor("chg_self")).length, 0);
  });

  it("a stranger and another provider's owner cannot read the membership; the buyer and the provider owner can", async () => {
    const m = await buy(customer, await livePlan());
    const read = (u) => as(db, u, `select id from memberships where id = $1`, [m.membership_id]);
    assert.equal((await read(customer)).length, 1);
    assert.equal((await read(owner1)).length, 1);
    assert.equal((await read(staff1)).length, 1);
    assert.equal((await read(stranger)).length, 0);
    assert.equal((await read(owner2)).length, 0);
    assert.equal((await read(staff2)).length, 0);
    await expectError(read(ROLES.anon), /permission denied/);
    assert.equal((await as(db, stranger, `select id from membership_payments where membership_id = $1`, [m.membership_id])).length, 0);
  });
});

describe("confirm_membership_payment (webhook): money", () => {
  it("activates only on a captured amount equal to the price, once, and records one ledger row", async () => {
    const m = await buy(customer, await livePlan());
    await expectError(confirm(m.membership_id, "chg_wrong_amount", 299.99), /does not match/);
    await expectError(confirm(m.membership_id, "chg_wrong_amount", 300.01), /does not match/);
    await expectError(confirm(m.membership_id, "chg_wrong_amount", null), /does not match/);
    await expectError(confirm(m.membership_id, "", 300), /payment intent id is required/);
    await expectError(confirm(m.membership_id, null, 300), /payment intent id is required/);
    assert.equal((await mem(m.membership_id)).status, "pending_payment");
    assert.equal((await ledgerFor("chg_wrong_amount")).length, 0);

    const ok = await confirm(m.membership_id, "chg_mem_ok", 300);
    assert.equal(ok.status, "activated");
    const row = await mem(m.membership_id);
    assert.equal(row.status, "active");
    assert.equal(row.visits_remaining, 4);
    assert.equal(row.payment_intent_id, "chg_mem_ok");
    assert.ok(row.period_start && row.period_end && row.paid_at);
    const days = (new Date(row.period_end) - new Date(row.period_start)) / 86400000;
    assert.equal(Math.round(days), 30);
    const pay = (await sys(db, `select status, payment_intent_id, amount from membership_payments where membership_id = $1`, [m.membership_id]))[0];
    assert.equal(pay.status, "paid");
    assert.equal(pay.payment_intent_id, "chg_mem_ok");
    assert.equal(money(pay.amount), 300);
    const notice = await sys(db, `select type from notifications where user_id = $1 and type = 'membership' and data->>'membership_id' = $2`, [SEED.customer, m.membership_id]);
    assert.equal(notice.length, 1);
  });

  it("a webhook replay changes nothing: no second ledger row, no second grant of visits", async () => {
    const id = await paidMembership();
    const intent = (await mem(id)).payment_intent_id;
    const before = await mem(id);
    for (let i = 0; i < 3; i += 1) assert.equal((await confirm(id, intent, 300)).status, "already_recorded");
    assert.equal((await ledgerFor(intent)).length, 1);
    const after = await mem(id);
    assert.equal(after.visits_remaining, before.visits_remaining);
    assert.equal(String(after.period_end), String(before.period_end));
  });

  it("concurrent deliveries of the same capture record exactly one ledger row", async () => {
    const m = await buy(customer, await livePlan());
    const settled = await Promise.allSettled([1, 2, 3, 4].map(() => confirm(m.membership_id, "chg_mem_parallel", 300)));
    assert.ok(settled.every((s) => s.status === "fulfilled" || /already|not awaiting/.test(s.reason.message)), settled.map((s) => s.reason?.message).join("|"));
    assert.equal((await ledgerFor("chg_mem_parallel")).length, 1);
    assert.equal((await mem(m.membership_id)).visits_remaining, 4);
  });

  it("refuses a payment intent that already paid for something else, a wrong membership id and a cancelled membership", async () => {
    const paid = await paidMembership();
    const intent = (await mem(paid)).payment_intent_id;
    const other = await buy(customer, await livePlan());
    await expectError(confirm(other.membership_id, intent, 300), /already used for another purchase/);
    assert.equal((await mem(other.membership_id)).status, "pending_payment");

    await expectError(confirm("00000000-0000-4000-8000-000000000999", "chg_nobody", 300), /not awaiting payment/);

    const gone = await buy(customer, await livePlan());
    await as(db, customer, `select cancel_membership($1, 'changed my mind')`, [gone.membership_id]);
    await expectError(confirm(gone.membership_id, "chg_late", 300), /not awaiting payment/);
    assert.equal((await ledgerFor("chg_late")).length, 0);

    // an intent that already carries a booking payment cannot be replayed against a membership either
    const m3 = await buy(customer, await livePlan());
    await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                   values ($1, 'gift_card_sale', 'chg_taken', 300, 300, 0, 'not_applicable')`, [null]);
    await expectError(confirm(m3.membership_id, "chg_taken", 300), /already used for another purchase/);
  });

  it("the ledger row, the provider's balance and the money totals equal those of an equal-priced package", async () => {
    const pkg = (await sys(db, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, is_active)
                                values ($1, 'Four cuts', 'أربع قصات', 300, 4, 30, true) returning id`, [SEED.provider1]))[0];
    const balance = async () => Number((await sys(db, `select provider_available_balance($1) v`, [SEED.provider1]))[0].v);
    const b0 = await balance();
    const up = (await as(db, customer, `select purchase_service_package($1) r`, [pkg.id]))[0].r;
    await as(db, ROLES.service, `select confirm_purchase_payment('package', $1, 'chg_eq_pkg', 300)`, [up.purchase_id]);
    const b1 = await balance();
    const id = (await buy(customer, await livePlan({ price: 300 }))).membership_id;
    await confirm(id, "chg_eq_mem", 300);
    const b2 = await balance();
    const [pk] = await ledgerFor("chg_eq_pkg");
    const [mb] = await ledgerFor("chg_eq_mem");
    assert.deepEqual(mb, pk, "same entry type, provider, captured, platform share, provider share and payout status");
    assert.equal(money(b2 - b1), money(b1 - b0), "the provider is credited the same amount");
    assert.equal(mb.entry_type, "package_sale");
    assert.equal(money(mb.platform_share), 0);
    assert.equal(money(mb.provider_share), 300);
  });

  it("a plan edit or deactivation never changes a membership that was already sold", async () => {
    const planId = await livePlan({ price: 300, days: 30, visits: 4 });
    const pending = await buy(customer, planId);
    const sold = await paidMembership({ planId });
    await as(db, owner1, `select provider_update_membership_plan($1, 'Gold', 'ذهبي', 'd', 'و', 999, 90, 20, false, $2::uuid[]) r`, [planId, [svcB.id]]);
    await activatePlan(owner1, planId, false);
    for (const id of [sold, pending.membership_id]) {
      const r = await mem(id);
      assert.equal(money(r.amount_due), 300);
      assert.equal(r.period_days, 30);
      assert.equal(r.visits_per_period, 4);
      assert.deepEqual(r.covered_service_ids, [svcA.id]);
      assert.equal(r.plan_name_en, "Monthly cuts");
    }
    assert.equal((await mem(sold)).visits_remaining, 4);
    // the pending purchase still settles at the price it was sold at, not at the edited price
    await expectError(confirm(pending.membership_id, "chg_after_edit", 999), /does not match/);
    assert.equal((await confirm(pending.membership_id, "chg_after_edit", 300)).status, "activated");
    assert.equal((await mem(pending.membership_id)).visits_remaining, 4);
    assert.equal(money((await ledgerFor("chg_after_edit"))[0].total_captured), 300);
  });
});

describe("renewing and cancelling", () => {
  it("renewal is a new pending payment that starts when the current period ends, with one open renewal at a time", async () => {
    const planId = await livePlan();
    const id = await paidMembership({ planId });
    const first = await mem(id);
    const r1 = await as(db, customer, `select renew_membership($1, $2) r`, [id, key()]).then((r) => r[0].r);
    const r2 = await as(db, customer, `select renew_membership($1, $2) r`, [id, key()]).then((r) => r[0].r);
    assert.equal(r1.status, "pending_payment");
    assert.equal(r2.membership_id, r1.membership_id, "a second tap does not open a second charge");
    assert.equal((await mem(r1.membership_id)).renewal_of, id);
    assert.equal((await mem(r1.membership_id)).visits_remaining, 0);
    await confirm(r1.membership_id, "chg_renew_1", 300);
    const next = await mem(r1.membership_id);
    assert.equal(next.status, "active");
    assert.equal(String(next.period_start), String(first.period_end), "no days are lost by renewing early");
    assert.equal(next.visits_remaining, 4);
    assert.equal((await mem(id)).visits_remaining, 4, "the current period keeps its own visits");
    assert.equal((await ledgerFor("chg_renew_1")).length, 1);
  });

  it("refuses to renew someone else's membership, a pending one, and a plan that is no longer on sale", async () => {
    const planId = await livePlan();
    const id = await paidMembership({ planId });
    await expectError(as(db, stranger, `select renew_membership($1, $2)`, [id, key()]), /Membership not found/);
    await expectError(as(db, ROLES.anon, `select renew_membership($1, $2)`, [id, key()]), /permission denied/);
    const pending = await buy(customer, planId);
    await expectError(as(db, customer, `select renew_membership($1, $2)`, [pending.membership_id, key()]), /Only a paid membership/);
    await activatePlan(owner1, planId, false);
    await expectError(as(db, customer, `select renew_membership($1, $2)`, [id, key()]), /not found or not on sale/);
  });

  it("the customer can cancel a pending purchase with a reason; no money moves", async () => {
    const m = await buy(customer, await livePlan());
    await expectError(as(db, customer, `select cancel_membership($1, 'x')`, [m.membership_id]), /reason of at least 3/);
    await expectError(as(db, stranger, `select cancel_membership($1, 'not mine')`, [m.membership_id]), /Membership not found/);
    await expectError(as(db, owner2, `select cancel_membership($1, 'not mine')`, [m.membership_id]), /Membership not found/);
    await expectError(as(db, ROLES.anon, `select cancel_membership($1, 'anon')`, [m.membership_id]), /permission denied/);
    const r = (await as(db, customer, `select cancel_membership($1, 'changed my mind') r`, [m.membership_id]))[0].r;
    assert.equal(r.status, "cancelled");
    assert.equal((await as(db, customer, `select cancel_membership($1, 'changed my mind') r`, [m.membership_id]))[0].r.replayed, true);
    const row = await mem(m.membership_id);
    assert.equal(row.status, "cancelled");
    assert.equal(row.cancelled_by, SEED.customer);
  });

  it("cancelling an active membership forfeits its visits and leaves the ledger untouched; staff other than the owner cannot", async () => {
    const id = await paidMembership();
    const intent = (await mem(id)).payment_intent_id;
    await expectError(as(db, staff1, `select cancel_membership($1, 'staff try')`, [id]), /Only the provider owner/);
    await as(db, owner1, `select cancel_membership($1, 'abuse of the plan')`, [id]);
    assert.equal((await mem(id)).status, "cancelled");
    assert.equal((await ledgerFor(intent)).length, 1);
    assert.equal(money((await ledgerFor(intent))[0].provider_share), 300);
  });
});
