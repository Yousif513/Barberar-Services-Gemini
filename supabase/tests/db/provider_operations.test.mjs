import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// Provider management reads real branch and employee figures and changes a provider's status only through
// admin_set_provider_status. Each figure below is checked against rows inserted here, as a change from
// whatever the demo seed already holds.
// Second branch and its stylist from the demo seed (20260704082805_live_demo_seed_messages.sql).
const BRANCH2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const EMPLOYEE4 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
let db;
let admin;
let svc;
let svc2;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

let day = 0;
async function booking({ status, price = 100, commission = 20, customerId = SEED.customer, employeeId = SEED.employee1, branchId = SEED.branch1, cancelledBy = null, offsetDays = null }) {
  day += 1;
  const when = offsetDays === null ? `now() - make_interval(days => ${40 + day})` : `now() + make_interval(days => ${offsetDays})`;
  return (await sys(db, `
    insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                          subtotal_price, total_price, tax_amount, deposit_required, platform_commission, cancelled_by)
    values ($1, $2, $3, $4, $5::booking_status, ${when}, 30, $6::numeric, $6::numeric, 0, 0, $7::numeric, $8)
    returning id`,
    [customerId, branchId, employeeId, svc.id, status, price, commission, cancelledBy]))[0].id;
}
// GOV-2 (Q4): per-employee figures (earnings come from the ledger) reach a console session only through the audited
// admin_employee_performance_report; the branch view holds no personal or ledger data and is still read directly.
const row = async (view, key, value) => (view === "admin_employee_performance"
  ? (await as(db, admin, `select admin_employee_performance_report(null, null) r`))[0].r.find((item) => item[key] === value)
  : (await as(db, admin, `select * from ${view} where ${key} = $1`, [value]))[0]);
const n = (value) => Number(value);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  svc2 = await serviceFor(db, EMPLOYEE4);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("admin visibility of employees", () => {
  it("lets administrators read inactive employees only through the audited directory; nobody else outside the provider sees them", async () => {
    const id = (await sys(db, `insert into employees (branch_id, name_en, name_ar, title_en, title_ar, is_active)
                               values ($1, 'Former Stylist', 'مصفف سابق', 'Stylist', 'مصفف', false) returning id`, [SEED.branch1]))[0].id;
    const visible = async (user) => (await as(db, user, `select count(*)::int c from employees where id = $1`, [id]))[0].c;
    assert.equal(await visible(admin), 0, "no direct table read for a console session");
    const listed = (await as(db, admin, `select admin_list_employees(null, 'inactive', null, 200, 0, null) r`))[0].r;
    assert.ok(listed.rows.some((item) => item.id === id));
    assert.equal(await visible(owner1), 1, "the owner still manages their own staff");
    assert.equal(await visible(owner2), 0);
    assert.equal(await visible(customer), 0);
  });
});

describe("branch and employee figures", () => {
  it("count outcomes, revenue, commission and earnings from bookings and the ledger", async () => {
    const otherCustomer = await createUser(db, { role: "customer" });
    const empBefore = await row("admin_employee_performance", "employee_id", SEED.employee1);
    const branchBefore = await row("admin_branch_performance", "branch_id", SEED.branch1);

    const a1 = await booking({ status: "completed", price: 100, commission: 20 });
    const a2 = await booking({ status: "completed", price: 200, commission: 30 });
    await booking({ status: "completed", price: 300, commission: 40 });
    const b1 = await booking({ status: "completed", price: 50, commission: 5, customerId: otherCustomer });
    await booking({ status: "cancelled", cancelledBy: "customer" });
    await booking({ status: "cancelled", cancelledBy: "system" });
    await booking({ status: "no_show" });
    await booking({ status: "confirmed", offsetDays: 9 });

    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, employee_share, payout_status)
                   values ($1, $3, 'booking_payment', 'chg_perf_1', 100, 20, 40, 40, 'pending'),
                          ($2, $3, 'booking_payment', 'chg_perf_2', 100, 20, 70, 10, 'pending')`, [a1, a2, SEED.provider1]);

    // Ratings: two published reviews count, a hidden one does not.
    for (const [bookingId, rating, moderation] of [[a1, 5, "published"], [a2, 4, "published"], [b1, 1, "hidden"]]) {
      await sys(db, `insert into reviews (booking_id, customer_id, provider_id, employee_id, rating, moderation_status)
                     values ($1, $2, $3, $4, $5, $6)`, [bookingId, SEED.customer, SEED.provider1, SEED.employee1, rating, moderation]);
    }

    const emp = await row("admin_employee_performance", "employee_id", SEED.employee1);
    assert.equal(n(emp.completed_bookings) - n(empBefore.completed_bookings), 4);
    assert.equal(n(emp.cancelled_bookings) - n(empBefore.cancelled_bookings), 1, "a hold the system released is nobody's cancellation");
    assert.equal(n(emp.no_show_bookings) - n(empBefore.no_show_bookings), 1);
    assert.equal(n(emp.gross_revenue) - n(empBefore.gross_revenue), 650);
    assert.equal(n(emp.commission_amount) - n(empBefore.commission_amount), 95);
    assert.equal(n(emp.employee_earnings) - n(empBefore.employee_earnings), 50);
    assert.equal(n(emp.review_count) - n(empBefore.review_count), 2);
    assert.equal(n(emp.rating_sum) - n(empBefore.rating_sum), 9);
    assert.equal(n(emp.repeat_customers) - n(empBefore.repeat_customers), 1, "only the client with several completed visits is a repeat client");

    const branch = await row("admin_branch_performance", "branch_id", SEED.branch1);
    assert.equal(n(branch.completed_bookings) - n(branchBefore.completed_bookings), 4);
    assert.equal(n(branch.total_bookings) - n(branchBefore.total_bookings), 8, "every status counts towards the total");
    assert.equal(n(branch.gross_revenue) - n(branchBefore.gross_revenue), 650);
    assert.equal(n(branch.commission_amount) - n(branchBefore.commission_amount), 95);
    assert.equal(n(branch.review_count) - n(branchBefore.review_count), 2);
    assert.equal(n(branch.rating_sum) - n(branchBefore.rating_sum), 9);
  });

  it("report revenue for the last 30 days separately from older revenue", async () => {
    const before = await row("admin_branch_performance", "branch_id", BRANCH2);
    const recent = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                                                       subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
                                  values ($1, $2, $3, $4, 'completed', now() - interval '3 days', 30, 120, 120, 0, 0, 12) returning id`,
      [SEED.customer, BRANCH2, EMPLOYEE4, svc2.id]);
    assert.ok(recent[0].id);
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                                         subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
                   values ($1, $2, $3, $4, 'completed', now() - interval '90 days', 30, 80, 80, 0, 0, 8)`,
      [SEED.customer, BRANCH2, EMPLOYEE4, svc2.id]);
    const after = await row("admin_branch_performance", "branch_id", BRANCH2);
    assert.equal(n(after.gross_revenue) - n(before.gross_revenue), 200);
    assert.equal(n(after.revenue_30d) - n(before.revenue_30d), 120);
  });

  it("show a provider's own figures to its owner only, and nothing to the public", async () => {
    const asOther = (await as(db, owner2, `select completed_bookings, gross_revenue, employee_earnings from admin_employee_performance where employee_id = $1`, [SEED.employee1]))[0];
    assert.equal(n(asOther?.completed_bookings ?? 0), 0, "another provider's owner sees none of these bookings");
    assert.equal(n(asOther?.gross_revenue ?? 0), 0);
    assert.equal(n(asOther?.employee_earnings ?? 0), 0);
    await expectError(as(db, ROLES.anon, `select * from admin_employee_performance`), /permission denied/);
    await expectError(as(db, ROLES.anon, `select * from admin_branch_performance`), /permission denied/);
  });
});

describe("provider status command", () => {
  const status = async (id) => (await sys(db, `select status, is_verified from providers where id = $1`, [id]))[0];

  it("is for administrators only and needs a reason", async () => {
    await expectError(as(db, owner1, `select admin_set_provider_status($1, 'suspended', 'Testing')`, [SEED.provider1]), /Administrator access required/);
    await expectError(as(db, customer, `select admin_set_provider_status($1, 'suspended', 'Testing')`, [SEED.provider1]), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_set_provider_status($1, 'suspended', 'Testing')`, [SEED.provider1]), /permission denied/);
    await expectError(as(db, admin, `select admin_set_provider_status($1, 'suspended', '  ')`, [SEED.provider1]), /reason/);
    await expectError(as(db, admin, `select admin_set_provider_status('00000000-0000-4000-8000-000000000999', 'suspended', 'Testing')`), /not found/);
    assert.equal((await status(SEED.provider1)).status, "active", "nothing changed");
  });

  it("suspends and reactivates with the reason in the audit log, and reports bookings still ahead", async () => {
    await booking({ status: "confirmed", offsetDays: 12 });
    const suspended = (await as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Fraud report under review') r`, [SEED.provider1]))[0].r;
    assert.equal(suspended.unchanged, false);
    assert.ok(n(suspended.upcoming_bookings) >= 1, "the operator is told about bookings that stay on the calendar");
    const now = await status(SEED.provider1);
    assert.equal(now.status, "suspended");
    assert.equal(now.is_verified, false, "a suspended provider is no longer verified, so search and booking exclude it");

    const audit = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'providers.update' and target_id = $1 order by created_at desc limit 1`, [SEED.provider1]))[0];
    assert.equal(audit.actor_id, admin.sub);
    assert.equal(audit.details.reason, "Fraud report under review");
    assert.equal(audit.details.changes.status.before, "active");
    assert.equal(audit.details.changes.status.after, "suspended");

    await expectError(as(db, admin, `select admin_set_provider_status($1, 'rejected', 'Escalate')`, [SEED.provider1]), /cannot move/);
    const repeat = (await as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Same decision again') r`, [SEED.provider1]))[0].r;
    assert.equal(repeat.unchanged, true, "a repeated decision is a safe retry");

    await as(db, admin, `select admin_set_provider_status($1, 'active', 'Review closed, no fraud found')`, [SEED.provider1]);
    assert.deepEqual(await status(SEED.provider1), { status: "active", is_verified: true });
  });

  it("only offers the moves that change what customers can book", async () => {
    await sys(db, `update providers set status = 'pending' where id = $1`, [SEED.provider2]);
    await expectError(as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Not live yet')`, [SEED.provider2]), /cannot move/);
    await as(db, admin, `select admin_set_provider_status($1, 'rejected', 'Trade licence expired')`, [SEED.provider2]);
    assert.equal((await status(SEED.provider2)).is_verified, false);
    await expectError(as(db, admin, `select admin_set_provider_status($1, 'suspended', 'Already rejected')`, [SEED.provider2]), /cannot move/);
    await as(db, admin, `select admin_set_provider_status($1, 'pending', 'Provider sent a renewed licence')`, [SEED.provider2]);
    await as(db, admin, `select admin_set_provider_status($1, 'active', 'Licence verified')`, [SEED.provider2]);
    assert.deepEqual(await status(SEED.provider2), { status: "active", is_verified: true });
  });
});
