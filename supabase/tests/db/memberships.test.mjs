// G65 Memberships: plans, purchase through the payment webhook, visits redeemed against bookings, expiry and reminders.
// Weight is on money: a membership is paid only by a service-role confirmation, the amounts equal a package sale, and a plan edit never
// reaches a membership that was already sold.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

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
    assert.equal((await read(staff1)).length, 0, "a plain employee reads members through the audited list function, not the table");
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
    // M-01: the capture is not lost and the webhook is not failed for ever: it is recorded and its refund is queued
    const late = await confirm(gone.membership_id, "chg_late", 300);
    assert.equal(late.conflict, true);
    assert.equal(late.status, "refund_required");
    assert.equal((await ledgerFor("chg_late")).length, 1);
    assert.equal((await ledgerFor("chg_late"))[0].payout_status, "refund_pending");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where idempotency_key = 'late:chg_late'`))[0].n, 1);
    const replayed = await confirm(gone.membership_id, "chg_late", 300);
    assert.equal(replayed.conflict, true, "a retried webhook is answered, not failed");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where idempotency_key = 'late:chg_late'`))[0].n, 1, "one refund only");
    assert.equal((await mem(gone.membership_id)).status, "cancelled");

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

// ---------------------------------------------------------------------------------------------------------------------------------
// Redeeming included visits, voiding, expiry, reminders
// ---------------------------------------------------------------------------------------------------------------------------------
describe("redeeming included visits", () => {
  let date;
  let admin;
  let other;
  const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
  const book = async (hhmm, { services = [svcA.id], user = customer, status = "confirmed" } = {}) => {
    const r = await as(db, user,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, riyadh(hhmm), JSON.stringify(services.map((id) => ({ service_id: id })))]).then((x) => x[0].r);
    if (status !== "pending_payment") await sys(db, `update bookings set status = $2::booking_status where id = $1`, [r.booking_id, status]);
    return r.booking_id;
  };
  const redeem = (user, membershipId, bookingId, notes = null) => as(db, user, `select redeem_membership_visit($1, $2, $3) r`, [membershipId, bookingId, notes]).then((r) => r[0].r);
  const left = async (id) => (await mem(id)).visits_remaining;
  const redemptions = async (id) => sys(db, `select * from membership_redemptions where membership_id = $1 order by redeemed_at`, [id]);

  before(async () => {
    date = await nextWorkingDate(db, SEED.employee1);
    for (const s of [svcA, svcB]) await sys(db, `update services set base_duration_minutes = 30 where id = $1`, [s.id]);
    await sys(db, `update employee_services set custom_duration_minutes = null where service_id in ($1, $2)`, [svcA.id, svcB.id]);
    await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                     second_start_time = null, second_end_time = null where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
    admin = ROLES.user(await createUser(db, { role: "admin" }));
    other = ROLES.user(await createUser(db));
  });

  afterEach(async () => {
    const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
    for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("the provider owner and an active employee redeem a visit against the member's booking; the balance drops and no money moves", async () => {
    const id = await paidMembership();
    const ledgerBefore = (await sys(db, `select count(*)::int n from transactional_ledger`))[0].n;
    const b1 = await book("09:00");
    const b2 = await book("10:00");
    const r1 = await redeem(owner1, id, b1, "first cut");
    assert.equal(r1.visits_remaining, 3);
    const r2 = await redeem(staff1, id, b2);
    assert.equal(r2.visits_remaining, 2);
    assert.equal(await left(id), 2);
    const rows = await redemptions(id);
    assert.deepEqual(rows.map((r) => r.booking_id), [b1, b2]);
    assert.equal(rows[0].redeemed_by, SEED.owner1);
    assert.equal(rows[0].notes, "first cut");
    assert.equal((await sys(db, `select count(*)::int n from transactional_ledger`))[0].n, ledgerBefore, "revenue is recognised at purchase; a redemption writes no ledger row");
    // the member sees the balance and the history; strangers see nothing
    assert.equal((await as(db, customer, `select id from membership_redemptions where membership_id = $1`, [id])).length, 2);
    assert.equal((await as(db, stranger, `select id from membership_redemptions where membership_id = $1`, [id])).length, 0);
    assert.equal((await as(db, owner2, `select id from membership_redemptions where membership_id = $1`, [id])).length, 0);
  });

  it("refuses everyone who is not this provider's staff: the member, a stranger, anonymous, the other provider's owner and staff", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    await expectError(redeem(customer, id, b), /Only the provider staff/);
    await expectError(redeem(stranger, id, b), /Membership not found/);
    await expectError(redeem(owner2, id, b), /Membership not found/);
    await expectError(redeem(staff2, id, b), /Membership not found/);
    await expectError(redeem(ROLES.anon, id, b), /permission denied/);
    await expectError(as(db, ROLES.service, `select redeem_membership_visit($1, $2, null)`, [id, b]), /Authentication required/);
    assert.equal(await left(id), 4);
    assert.equal((await redemptions(id)).length, 0);
  });

  it("GOV-FIX H-1: a console session records or voids a visit only with operations.write (analyst and finance are refused)", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    const analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
    const finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
    const operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
    await expectError(redeem(analyst, id, b), /Membership not found/);
    await expectError(redeem(finance, id, b), /Membership not found/);
    assert.equal(await left(id), 4, "the read-only roles changed nothing");
    assert.equal((await redeem(operations, id, b)).visits_remaining, 3);
    const red = (await redemptions(id))[0];
    await expectError(as(db, analyst, `select void_membership_redemption($1, 'analyst write test')`, [red.id]), /Redemption not found/);
    await expectError(as(db, finance, `select void_membership_redemption($1, 'finance write test')`, [red.id]), /Redemption not found/);
    assert.equal(await left(id), 3);
    assert.equal((await as(db, operations, `select void_membership_redemption($1, 'recorded by mistake') r`, [red.id]))[0].r.visits_remaining, 4);
  });

  it("refuses a visit that falls after the membership period has ended (M-02)", async () => {
    const m = await paidMembership();
    const bookingId = await book("10:00");
    await sys(db, `update memberships set period_end = now() + interval '1 day' where id = $1`, [m]);
    await expectError(redeem(owner1, m, bookingId), /outside the period/);
    assert.equal(await left(m), (await mem(m)).visits_per_period, "no visit was used");
  });

  it("an administrator can redeem; a membership of another provider cannot be used on this provider's booking", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    assert.equal((await redeem(admin, id, b)).visits_remaining, 3);
    const plan2 = (await createPlan(owner2, { provider: SEED.provider2, all: true, services: [] })).plan_id;
    await activatePlan(owner2, plan2);
    const m2 = await buy(customer, plan2);
    await confirm(m2.membership_id, "chg_mem_p2", 300);
    const b2 = await book("10:00");
    await expectError(redeem(owner2, m2.membership_id, b2), /does not belong to this member at this provider/);
    assert.equal(await left(m2.membership_id), 4);
  });

  it("checks the booking: owner, status, covered service, one live redemption per booking, and a visit needs a booking", async () => {
    const id = await paidMembership();
    await expectError(redeem(owner1, id, null), /booking is required/);
    await expectError(redeem(owner1, id, "00000000-0000-4000-8000-000000000999"), /does not belong to this member/);
    const foreign = await book("09:00", { user: other });
    await expectError(redeem(owner1, id, foreign), /does not belong to this member/);
    const pending = await book("10:00", { status: "pending_payment" });
    await expectError(redeem(owner1, id, pending), /confirmed or completed/);
    const wrongService = await book("11:00", { services: [svcB.id] });
    await expectError(redeem(owner1, id, wrongService), /does not cover the services/);
    const good = await book("12:00");
    await redeem(owner1, id, good);
    await expectError(redeem(owner1, id, good), /already recorded for this booking/);
    const m2 = await paidMembership();
    await expectError(redeem(owner1, m2, good), /already recorded for this booking/);
    assert.equal(await left(id), 3);
    assert.equal(await left(m2), 4);
    const completed = await book("13:00", { status: "completed" });
    assert.equal((await redeem(owner1, id, completed)).visits_remaining, 2);
    await sys(db, `update bookings set status = 'cancelled' where id = $1`, [completed]);
  });

  it("an all-services plan covers any service, and the sold terms (not the edited plan) decide coverage", async () => {
    const planId = await livePlan();
    const id = await paidMembership({ planId });
    await as(db, owner1, `select provider_update_membership_plan($1, 'Gold', 'ذهبي', null, null, 999, 90, 20, false, $2::uuid[])`, [planId, [svcB.id]]);
    const bB = await book("09:00", { services: [svcB.id] });
    await expectError(redeem(owner1, id, bB), /does not cover the services/);
    const bA = await book("10:00", { services: [svcA.id] });
    assert.equal((await redeem(owner1, id, bA)).visits_remaining, 3);
    const all = await paidMembership({ plan: { all: true, services: [] } });
    assert.equal((await redeem(owner1, all, bB)).visits_remaining, 3);
  });

  it("two redemptions at once cannot overspend the last visit, and the same booking cannot be redeemed twice at once", async () => {
    const id = await paidMembership({ plan: { visits: 1 } });
    const b1 = await book("09:00");
    const b2 = await book("10:00");
    const settled = await Promise.allSettled([redeem(owner1, id, b1), redeem(staff1, id, b2), redeem(owner1, id, b1)]);
    assert.equal(settled.filter((s) => s.status === "fulfilled").length, 1, settled.map((s) => s.reason?.message ?? "ok").join(" | "));
    assert.equal(await left(id), 0);
    assert.equal((await redemptions(id)).length, 1);
    await expectError(redeem(owner1, id, b2), /No included visits remain|already recorded/);

    const id2 = await paidMembership();
    const b3 = await book("11:00");
    const dup = await Promise.allSettled([redeem(owner1, id2, b3), redeem(owner1, id2, b3)]);
    assert.equal(dup.filter((s) => s.status === "fulfilled").length, 1);
    assert.equal(await left(id2), 3);
  });

  it("refuses a pending, cancelled, expired or not yet started membership and one that is out of visits", async () => {
    const b = await book("09:00");
    const pending = (await buy(customer, await livePlan())).membership_id;
    await expectError(redeem(owner1, pending, b), /not active/);
    const cancelled = await paidMembership();
    await as(db, customer, `select cancel_membership($1, 'stop')`, [cancelled]);
    await expectError(redeem(owner1, cancelled, b), /not active/);
    const expired = await paidMembership();
    await sys(db, `update memberships set period_end = now() - interval '1 minute' where id = $1`, [expired]);
    await expectError(redeem(owner1, expired, b), /has expired/);
    const future = await paidMembership();
    await sys(db, `update memberships set period_start = now() + interval '1 day', period_end = now() + interval '31 days' where id = $1`, [future]);
    await expectError(redeem(owner1, future, b), /has not started/);
    const spent = await paidMembership();
    await sys(db, `update memberships set visits_remaining = 0 where id = $1`, [spent]);
    await expectError(redeem(owner1, spent, b), /No included visits remain/);
    assert.equal((await redemptions(pending)).length + (await redemptions(cancelled)).length + (await redemptions(expired)).length, 0);
  });

  it("voiding a visit needs a reason and the provider's staff, gives the visit back once, and frees the booking", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    await redeem(owner1, id, b);
    const red = (await redemptions(id))[0];
    const voidIt = (user, reason = "recorded by mistake") => as(db, user, `select void_membership_redemption($1, $2) r`, [red.id, reason]).then((r) => r[0].r);
    await expectError(voidIt(owner1, "x"), /reason of at least 3/);
    await expectError(voidIt(customer), /Only the provider staff/);
    await expectError(voidIt(stranger), /Redemption not found/);
    await expectError(voidIt(owner2), /Redemption not found/);
    await expectError(voidIt(staff2), /Redemption not found/);
    await expectError(voidIt(ROLES.anon), /permission denied/);
    assert.equal(await left(id), 3);
    assert.equal((await voidIt(staff1)).visits_remaining, 4);
    assert.equal((await voidIt(owner1)).replayed, true);
    assert.equal(await left(id), 4, "a second void does not give a second visit back");
    const row = (await sys(db, `select voided_by, void_reason from membership_redemptions where id = $1`, [red.id]))[0];
    assert.equal(row.voided_by, staff1.sub);
    assert.equal(row.void_reason, "recorded by mistake");
    assert.equal((await redeem(owner1, id, b)).visits_remaining, 3, "the booking can be redeemed again after a void");
  });

  it("a void on an ended membership does not hand a visit back", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    await redeem(owner1, id, b);
    await sys(db, `update memberships set status = 'expired' where id = $1`, [id]);
    const red = (await redemptions(id))[0];
    const r = (await as(db, owner1, `select void_membership_redemption($1, 'late correction') r`, [red.id]))[0].r;
    assert.equal(r.visits_remaining, 3);
    assert.equal(await left(id), 3);
  });

  it("every privileged action leaves an audit event", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    await redeem(owner1, id, b);
    const red = (await redemptions(id))[0];
    await as(db, owner1, `select void_membership_redemption($1, 'audit check')`, [red.id]);
    const actions = (await sys(db, `select action from admin_audit_logs where target_id = $1`, [id])).map((r) => r.action);
    for (const a of ["purchase.paid", "membership.visit_redeemed", "membership.visit_voided", "membership.purchase_started"]) assert.ok(actions.includes(a), `${a} in ${actions}`);
  });

  it("the member list is for the provider's staff only, names the members and records the read; redeemable bookings follow the same rule", async () => {
    const id = await paidMembership();
    const b = await book("09:00");
    const list = (user, provider = SEED.provider1) => as(db, user, `select * from list_provider_memberships($1)`, [provider]);
    const rows = await list(owner1);
    assert.ok(rows.some((r) => r.membership_id === id && r.status === "active" && r.visits_remaining === 4));
    assert.ok(Number(rows[0].total_count) >= 1);
    assert.equal((await list(staff1)).length, rows.length);
    await expectError(list(owner2), /Provider not found/);
    await expectError(list(customer), /Provider not found/);
    await expectError(list(stranger), /Provider not found/);
    await expectError(list(ROLES.anon), /permission denied/);
    await expectError(as(db, owner1, `select * from list_provider_memberships($1, 'bogus')`, [SEED.provider1]), /Unknown membership status/);
    assert.ok((await sys(db, `select 1 from admin_audit_logs where action = 'membership.members_listed' and target_id = $1`, [SEED.provider1])).length >= 1);
    const eligible = await as(db, owner1, `select * from list_membership_redeemable_bookings($1)`, [id]);
    assert.ok(eligible.some((e) => e.booking_id === b));
    await redeem(owner1, id, b);
    assert.ok(!(await as(db, owner1, `select * from list_membership_redeemable_bookings($1)`, [id])).some((e) => e.booking_id === b));
    await expectError(as(db, owner2, `select * from list_membership_redeemable_bookings($1)`, [id]), /Membership not found/);
    await expectError(as(db, customer, `select * from list_membership_redeemable_bookings($1)`, [id]), /Membership not found/);
  });
});

describe("expiry and reminders", () => {
  const run = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0].r);
  const atFixedInstant = async (claims, fn) => db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return fn(tx);
  });

  it("expire_memberships ends exactly the memberships whose period is over; the end instant itself is already over", async () => {
    const live = await paidMembership();
    const over = await paidMembership();
    const edge = await paidMembership();
    const pending = (await buy(customer, await livePlan())).membership_id;
    await sys(db, `update memberships set period_end = now() - interval '1 second' where id = $1`, [over]);
    await sys(db, `update memberships set period_end = now() + interval '1 hour' where id = $1`, [live]);
    const result = await atFixedInstant({ role: "service_role" }, async (tx) => {
      await tx.query(`update memberships set period_end = now() where id = $1`, [edge]);
      return (await tx.query(`select expire_memberships() r`)).rows[0].r;
    });
    assert.ok(result.expired >= 2);
    assert.equal((await mem(over)).status, "expired");
    assert.equal((await mem(edge)).status, "expired");
    assert.equal((await mem(live)).status, "active");
    assert.equal((await mem(pending)).status, "pending_payment");
    assert.equal((await run(ROLES.service, `select expire_memberships() r`)).expired, 0, "running it again changes nothing");
  });

  it("a visit at the end instant is refused, one just before it is accepted", async () => {
    const id = await paidMembership();
    const date = await nextWorkingDate(db, SEED.employee1, 5);
    const b = (await as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, `${date}T15:00:00+03:00`, JSON.stringify([{ service_id: svcA.id }])]))[0].r.booking_id;
    await sys(db, `update bookings set status = 'confirmed' where id = $1`, [b]);
    const refused = await atFixedInstant({ role: "authenticated", sub: SEED.owner1 }, async (tx) => {
      await tx.query(`update memberships set period_end = now() where id = $1`, [id]);
      try { await tx.query(`select redeem_membership_visit($1, $2, null)`, [id, b]); return "accepted"; } catch (e) { return e.message; }
    });
    assert.match(refused, /has expired/);
    // still inside the period at the moment of the call, and the visit itself falls inside it (M-02)
    await sys(db, `update memberships set period_end = (select scheduled_at + interval '1 hour' from bookings where id = $2) where id = $1`, [id, b]);
    assert.equal((await as(db, owner1, `select redeem_membership_visit($1, $2, null) r`, [id, b]))[0].r.visits_remaining, 3);
    await as(db, customer, `select cancel_booking($1, 'cleanup')`, [b]);
  });

  it("only the service role or an administrator may expire or remind; everyone else is refused", async () => {
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    for (const u of [customer, owner1, staff1, stranger]) {
      await expectError(as(db, u, `select expire_memberships()`), /Service role or administrator required/);
      await expectError(as(db, u, `select send_membership_expiry_reminders(3)`), /Service role or administrator required/);
    }
    await expectError(as(db, ROLES.anon, `select expire_memberships()`), /permission denied/);
    await expectError(as(db, ROLES.anon, `select send_membership_expiry_reminders(3)`), /permission denied/);
    assert.equal((await run(admin, `select expire_memberships() r`)).success, true);
    assert.equal((await run(admin, `select send_membership_expiry_reminders(3) r`)).success, true);
  });

  it("reminds each member once, only inside the lead time you pass, and not when a paid renewal already follows", async () => {
    const soon = await paidMembership();
    const later = await paidMembership();
    const renewed = await paidMembership();
    await sys(db, `update memberships set period_end = now() + interval '2 days' where id = $1`, [soon]);
    await sys(db, `update memberships set period_end = now() + interval '20 days' where id = $1`, [later]);
    await sys(db, `update memberships set period_end = now() + interval '2 days' where id = $1`, [renewed]);
    const renewal = (await as(db, customer, `select renew_membership($1, $2) r`, [renewed, key()]))[0].r;
    await confirm(renewal.membership_id, "chg_renewal_rem", 300);
    await expectError(as(db, ROLES.service, `select send_membership_expiry_reminders(null)`), /between 1 and 60/);
    await expectError(as(db, ROLES.service, `select send_membership_expiry_reminders(0)`), /between 1 and 60/);
    await expectError(as(db, ROLES.service, `select send_membership_expiry_reminders(61)`), /between 1 and 60/);
    const notices = (id) => sys(db, `select title_en, title_ar, body_en, body_ar from notifications where data->>'membership_id' = $1 and data->>'kind' = 'expiry_reminder'`, [id]);
    assert.equal((await run(ROLES.service, `select send_membership_expiry_reminders(1) r`)).reminded, 0, "too early for a one day lead");
    const first = await run(ROLES.service, `select send_membership_expiry_reminders(3) r`);
    assert.ok(first.reminded >= 1);
    assert.equal((await notices(soon)).length, 1);
    assert.equal((await notices(later)).length, 0);
    assert.equal((await notices(renewed)).length, 0, "a paid renewal already follows");
    const n = (await notices(soon))[0];
    assert.ok(n.title_en && n.title_ar && n.body_en && n.body_ar, "both languages");
    assert.equal((await run(ROLES.service, `select send_membership_expiry_reminders(3) r`)).reminded, 0, "once per membership");
    assert.equal((await notices(soon)).length, 1);
    assert.equal((await run(ROLES.service, `select send_membership_expiry_reminders(30) r`)).reminded >= 1, true);
    assert.equal((await notices(later)).length, 1);
  });
});
