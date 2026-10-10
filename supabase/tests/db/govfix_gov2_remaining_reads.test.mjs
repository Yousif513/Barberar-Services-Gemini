import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// GOV-FIX (GOV-2 gap gov2-remaining-direct-admin-reads): console sessions read bookings, refunds, disputes, reviews, packages,
// loyalty, referrals, coupons, tips and favourites only through audited functions; the provider private directory needs
// personal.read. Before this change every query below returned the rows to any console role.
let db;
let owner;
let finance;
let operations;
let analyst;
let customer;
let bookingId;
const forbidden = /Administrator access required|cannot read/;
const lastAudit = async (action) => (await sys(db, `select actor_id, details from admin_audit_logs where action = $1 order by created_at desc limit 1`, [action]))[0];

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = await createUser(db);
  await sys(db, `update profiles set first_name = 'Noura', last_name = 'Saleh' where id = $1`, [customer]);
  const svc = await serviceFor(db, SEED.employee1);
  [{ id: bookingId }] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
    values ($1, $2, $3, $4, 'confirmed', now() + interval '40 days', 30, 200, 200, 0, 200, 0, 'marketplace', true) returning id`,
    [customer, SEED.branch1, SEED.employee1, svc.id]);
  const [ledger] = await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
    values ($1, $2, 'booking_payment', 'chg_gov2_rest_1', 200, 0, 200, 'pending') returning id`, [bookingId, SEED.provider1]);
  await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key)
    values ($1, $2, 'chg_gov2_rest_1', 50, 'Late start', 'admin', 'gov2-rest-refund-1')`, [bookingId, ledger.id]);
  await sys(db, `insert into payment_disputes (booking_id, customer_id, provider_id, disputed_amount_sar, reason)
    values ($1, $2, $3, 50, 'Service not as described')`, [bookingId, customer, SEED.provider1]);
  await sys(db, `alter table reviews disable trigger user`);
  await sys(db, `insert into reviews (booking_id, customer_id, provider_id, employee_id, rating, comment, moderation_status)
    values ($1, $2, $3, $4, 1, 'Rude staff', 'flagged')`, [bookingId, customer, SEED.provider1, SEED.employee1]);
  await sys(db, `alter table reviews enable trigger user`);
});

describe("no direct console reads of customer-linked tables", () => {
  const tables = ["bookings", "refund_requests", "payment_disputes", "customer_loyalty", "loyalty_points_ledger", "customer_favorites",
    "customer_referrals", "coupon_redemptions", "package_redemptions", "user_packages", "booking_tips", "payment_refund_requests"];
  it("returns no rows to any console role (report: they all read every row), while the customer still reads their own", async () => {
    for (const table of tables) {
      const total = (await sys(db, `select count(*)::int n from ${table}`))[0].n;
      for (const user of [owner, finance, operations, analyst]) {
        const rows = await as(db, user, `select count(*)::int n from ${table}`).catch((e) => (/permission denied/.test(e.message) ? [{ n: 0 }] : Promise.reject(e)));
        assert.equal(rows[0].n, 0, `${table} is not readable directly by a console session (${total} rows exist)`);
      }
    }
    assert.equal((await as(db, ROLES.user(customer), `select count(*)::int n from bookings where id = $1`, [bookingId]))[0].n, 1);
    assert.equal((await as(db, ROLES.user(customer), `select count(*)::int n from payment_disputes`))[0].n, 1);
  });

  it("keeps hidden and flagged reviews (and their reviewer ids) away from direct reads; published ones stay public", async () => {
    for (const user of [owner, operations, analyst]) {
      assert.equal((await as(db, user, `select count(*)::int n from reviews where moderation_status <> 'published'`))[0].n, 0);
    }
    const published = (await sys(db, `select count(*)::int n from reviews where moderation_status = 'published'`))[0].n;
    assert.equal((await as(db, analyst, `select count(*)::int n from reviews where moderation_status = 'published'`))[0].n, published);
  });
});

describe("audited reads", () => {
  it("admin_recent_bookings: every console role, nothing about the customer, logged with the booking ids", async () => {
    for (const user of [owner, finance, operations, analyst]) {
      const out = (await as(db, user, `select admin_recent_bookings(5, 'customer_support') r`))[0].r;
      assert.ok(out.rows.length >= 1);
      assert.equal(out.rows[0].customer_id, undefined);
      assert.ok(out.rows[0].services && out.rows[0].branches.providers);
    }
    const audit = await lastAudit("bookings.recent_listed");
    assert.equal(audit.actor_id, analyst.sub);
    assert.ok(audit.details.target_ids.includes(bookingId));
    await expectError(as(db, ROLES.user(customer), `select admin_recent_bookings(5, null)`), forbidden);
  });

  it("admin_list_refund_requests: finance and owner only, paged, logged", async () => {
    const page = (await as(db, finance, `select admin_list_refund_requests('attention', 25, 0, null) r`))[0].r;
    assert.equal(page.total, 1);
    assert.equal(Number(page.rows[0].amount), 50);
    assert.ok("invoice_number" in page.rows[0].bookings);
    assert.equal((await lastAudit("refunds.listed")).actor_id, finance.sub);
    for (const user of [operations, analyst]) await expectError(as(db, user, `select admin_list_refund_requests('all', 25, 0, null)`), forbidden);
    await expectError(as(db, finance, `select admin_list_refund_requests('everything', 25, 0, null)`), /Unknown filter/);
  });

  it("admin_list_disputes: finance sees no name, operations sees it, analyst is refused; logged with the customer ids", async () => {
    const forFinance = (await as(db, finance, `select admin_list_disputes(null, 50, 0, null) r`))[0].r;
    assert.equal(forFinance.names_included, false);
    assert.equal(forFinance.rows[0].customer, null);
    const forOps = (await as(db, operations, `select admin_list_disputes(null, 50, 0, null) r`))[0].r;
    assert.deepEqual(forOps.rows[0].customer, { first_name: "Noura", last_name: "Saleh" });
    assert.equal(forOps.rows[0].booking.id, bookingId);
    const audit = await lastAudit("disputes.listed");
    assert.ok(audit.details.target_ids.includes(customer) && audit.details.fields.includes("first_name"));
    await expectError(as(db, analyst, `select admin_list_disputes(null, 50, 0, null)`), forbidden);
  });

  it("admin_list_reviews: operations and owner, every moderation state, finance and analyst refused", async () => {
    const out = (await as(db, operations, `select admin_list_reviews('flagged', 50, 0, null) r`))[0].r;
    assert.equal(out.rows.length, 1);
    assert.deepEqual([out.rows[0].comment, out.rows[0].customer.first_name, out.rows[0].employee !== null], ["Rude staff", "Noura", true]);
    assert.equal((await lastAudit("reviews.listed")).actor_id, operations.sub);
    for (const user of [finance, analyst]) await expectError(as(db, user, `select admin_list_reviews(null, 50, 0, null)`), forbidden);
  });

  it("admin_package_usage_summary: totals only, 1 to 4 suppressed", async () => {
    const out = (await as(db, analyst, `select admin_package_usage_summary() r`))[0].r;
    const active = (await sys(db, `select count(*)::int n from user_packages where remaining_sessions > 0`))[0].n;
    if (active >= 1 && active <= 4) assert.deepEqual([out.active_vouchers, out.active_vouchers_suppressed], [null, true]);
    else assert.equal(out.active_vouchers, active);
  });

  it("admin_branch_performance_report: the branch figures without direct booking reads", async () => {
    const viaFunction = await as(db, analyst, `select branch_id, total_bookings from admin_branch_performance_report() order by branch_id`);
    const truth = await sys(db, `select branch_id, total_bookings from admin_branch_performance order by branch_id`);
    assert.deepEqual(viaFunction, truth);
    const direct = await as(db, analyst, `select coalesce(sum(total_bookings), 0)::int n from admin_branch_performance`);
    assert.equal(direct[0].n, 0, "the view itself shows a console session nothing (security invoker)");
  });

  it("admin_provider_private_directory: personal.read only, logged per provider and field (report: every console role read it)", async () => {
    for (const user of [owner, operations]) assert.ok((await as(db, user, `select * from admin_provider_private_directory('provider_onboarding')`)).length >= 3);
    const audit = await lastAudit("provider.private_directory_viewed");
    assert.ok(audit.details.target_ids.includes(SEED.provider1) && audit.details.fields.includes("admin_notes"));
    for (const user of [finance, analyst]) await expectError(as(db, user, `select * from admin_provider_private_directory()`), forbidden);
  });
});
