import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { setPlatformSetting } from "./gov1_fixtures.mjs";

// SECFIX-2 mediums and lows (docs/reviews/2026-10-11-security-round2.md): each reproduction must now fail.
let db;
let owner;
let owner2;
let finance;
let operations;
let analyst;
let customer;
let svc;
const stale = (user) => ({ ...user, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 3600 }] });
const lastAudit = async (action) => (await sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at desc limit 1`, [action]))[0];
let seq = 0;
const booking = async (values = {}) => {
  seq += 1;
  return (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_home_service)
    values ($1, $2, $3, $4, $5, now() + make_interval(days => 20, mins => $6::int), 30, 100, 100, 0, 100, 0, 'marketplace', $7) returning id`,
    [values.customer ?? customer, values.branch ?? SEED.branch1, SEED.employee1, svc.id, values.status ?? "confirmed", seq * 45, values.home ?? false]))[0].id;
};

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = await createUser(db);
  svc = await serviceFor(db, SEED.employee1);
});

describe("R2-M1: get_provider_private_profile", () => {
  it("refuses analyst and finance (reproduction: analyst with a stale session got the owner's phone and email)", async () => {
    for (const user of [stale(analyst), analyst, finance]) {
      await expectError(as(db, user, `select get_provider_private_profile($1, 'provider_onboarding')`, [SEED.provider1]), /cannot read provider contact details/);
    }
  });
  it("needs a purpose, and logs the fields read", async () => {
    await expectError(as(db, operations, `select get_provider_private_profile($1)`, [SEED.provider1]), /State the purpose/);
    const r = (await as(db, operations, `select get_provider_private_profile($1, 'provider_onboarding') r`, [SEED.provider1]))[0].r;
    assert.equal(r.provider_id, SEED.provider1);
    const audit = await lastAudit("provider.private_profile_viewed");
    assert.deepEqual([audit.actor_id, audit.details.purpose, audit.details.console_role], [operations.sub, "provider_onboarding", "operations"]);
    assert.ok(audit.details.fields.includes("contact_phone"));
  });
});

describe("R2-M2: calculate_staff_payroll", () => {
  it("refuses every console role without both money.ledger and personal.read, and needs a purpose", async () => {
    for (const user of [analyst, finance, operations]) {
      await expectError(as(db, user, `select calculate_staff_payroll($1, current_date - 30, current_date, 'staff_administration')`, [SEED.provider1]), /cannot read staff pay/);
    }
    await expectError(as(db, owner, `select calculate_staff_payroll($1, current_date - 30, current_date)`, [SEED.provider1]), /State the purpose/);
    const r = (await as(db, owner, `select calculate_staff_payroll($1, current_date - 30, current_date, 'staff_administration') r`, [SEED.provider1]))[0].r;
    const audit = await lastAudit("staff_payroll.viewed");
    assert.equal(audit.actor_id, owner.sub);
    assert.deepEqual(audit.details.target_ids.sort(), r.payroll_entries.map((e) => e.employee_id).sort());
    assert.ok(audit.details.fields.includes("base_salary_sar"));
  });
  it("still answers the provider's owner without a purpose", async () => {
    const r = (await as(db, ROLES.user(SEED.owner1), `select calculate_staff_payroll($1, current_date - 30, current_date) r`, [SEED.provider1]))[0].r;
    assert.equal(r.provider_id, SEED.provider1);
  });
});

describe("R2-M3: D4 on the branch performance report", () => {
  it("withholds every figure of a branch whose bookings come from 1 to 4 customers", async () => {
    const [{ id: branch }] = await sys(db, `insert into branches (provider_id, name_en, name_ar, city, address_text_en, address_text_ar, latitude, longitude)
      select provider_id, 'One Client Branch', 'فرع عميل واحد', city, address_text_en, address_text_ar, latitude, longitude from branches where id = $1 returning id`, [SEED.branch1]);
    await booking({ branch, status: "completed" });
    await booking({ branch, status: "completed" });
    const [row] = await as(db, analyst, `select * from admin_branch_performance_report() where branch_id = $1`, [branch]);
    assert.equal(row.suppressed, true);
    for (const key of ["total_bookings", "completed_bookings", "gross_revenue", "commission_amount", "revenue_30d", "review_count"]) assert.equal(row[key], null, key);
    const [truth] = await sys(db, `select total_bookings from admin_branch_performance where branch_id = $1`, [branch]);
    assert.equal(Number(truth.total_bookings), 2, "the figure exists; the report withholds it");
  });
});

describe("R2-M6: the two highest-volume personal reads log whose data was read", () => {
  it("admin_customer_overview logs target ids, fields, purpose and the search hash", async () => {
    const out = (await as(db, operations, `select admin_customer_overview('Noura', 25, 0, 'customer_support') r`))[0].r;
    const audit = await lastAudit("customers.listed");
    assert.deepEqual(audit.details.target_ids, out.rows.map((r) => r.id));
    assert.equal(audit.details.purpose, "customer_support");
    assert.ok(audit.details.fields.includes("phone_number"));
    assert.match(audit.details.filter.search_sha256, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(audit.details).includes("Noura"));
  });
  it("admin_booking_directory logs the booking ids and gives finance no customer names", async () => {
    const id = await booking();
    await sys(db, `update profiles set first_name = 'Hessa', last_name = 'Qahtani' where id = $1`, [customer]);
    const fin = (await as(db, finance, `select admin_booking_directory(null, null, null, null, 100, 0, null) r`))[0].r;
    assert.equal(fin.names_included, false);
    assert.ok(fin.rows.every((r) => r.customer === null));
    assert.ok(!JSON.stringify(fin).includes("Hessa"));
    assert.equal((await as(db, finance, `select admin_booking_directory('Hessa', null, null, null, 100, 0, null) r`))[0].r.matching, 0, "finance cannot search by name either");
    const audit = await lastAudit("bookings.listed");
    assert.equal(audit.details.purpose, "finance_operations");
    const ops = (await as(db, operations, `select admin_booking_directory('Hessa', null, null, null, 100, 0, 'customer_support') r`))[0].r;
    assert.ok(ops.rows.some((r) => r.id === id && r.customer.first_name === "Hessa"));
    const opsAudit = await lastAudit("bookings.listed");
    assert.ok(opsAudit.details.target_ids.includes(id));
    assert.ok(opsAudit.details.fields.includes("customer_first_name"));
  });
});

describe("R2-M7: customer home addresses", () => {
  it("refuses analyst and finance, needs a purpose, and logs the read", async () => {
    const id = await booking({ home: true });
    await sys(db, `insert into booking_home_addresses (booking_id, address_text, latitude, longitude) values ($1, 'Villa 3, Al Yasmin', 24.81, 46.64)`, [id]);
    for (const user of [analyst, finance]) {
      await expectError(as(db, user, `select get_booking_address_secure($1, 'customer_support')`, [id]), /cannot read customer addresses/);
    }
    await expectError(as(db, operations, `select get_booking_address_secure($1)`, [id]), /State the purpose/);
    const r = (await as(db, operations, `select get_booking_address_secure($1, 'customer_support') r`, [id]))[0].r;
    assert.match(r.address, /Yasmin/);
    const audit = await lastAudit("booking.home_address_viewed");
    assert.deepEqual([audit.actor_id, audit.target_id, audit.details.purpose], [operations.sub, id, "customer_support"]);
    assert.ok(!JSON.stringify(audit.details).includes("Yasmin"));
  });
});

describe("R2-L2: staff salary IBAN reveals share the ceiling", () => {
  it("stops at the shared 24-hour ceiling and raises the limit alert", async () => {
    await sys(db, `insert into employee_commission_rules (employee_id, provider_id, wps_iban) values ($1, $2, 'SA0380000000608010167519')
      on conflict (employee_id) do update set wps_iban = excluded.wps_iban`, [SEED.employee1, SEED.provider1]);
    const [{ ceiling }] = await sys(db, `select iban_reveal_ceiling($1) ceiling`, [finance.sub]);
    await sys(db, `insert into admin_audit_logs (actor_id, action, target_type, details) select $1, 'iban.revealed', 'providers', '{}'::jsonb from generate_series(1, $2::int)`,
      [finance.sub, ceiling]);
    const out = (await as(db, finance, `select reveal_employee_wps_iban($1, 'Salary run check for TCK-2044') r`, [SEED.employee1]))[0].r;
    assert.equal(out.refused, true);
    assert.equal(out.iban, undefined);
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'iban_reveal_limit_reached' and user_id = $1`, [finance.sub]))[0].n, 1);
  });
});

describe("R2-L4: audited directories are paged at 500", () => {
  it("never return more rows than the audit row names", async () => {
    const rows = await as(db, operations, `select * from admin_provider_private_directory('provider_onboarding', 100000, 0)`);
    const audit = await lastAudit("provider.private_directory_viewed");
    assert.ok(rows.length <= 500);
    assert.equal(audit.details.filter.limit, 500);
    assert.deepEqual(rows.map((r) => r.provider_id).sort(), [...audit.details.target_ids].sort());
    const perf = (await as(db, operations, `select admin_employee_performance_report(null, 'provider_onboarding', 100000, 0) r`))[0].r;
    assert.ok(perf.length <= 500);
    assert.equal((await lastAudit("employee_performance.viewed")).details.filter.limit, 500);
  });
});

describe("R2-L5: payout account summary", () => {
  it("refuses analyst and operations and logs finance's read", async () => {
    for (const user of [analyst, operations]) {
      await expectError(as(db, user, `select provider_payout_destination_summary($1)`, [SEED.provider1]), /cannot read payout accounts/);
    }
    await as(db, finance, `select provider_payout_destination_summary($1)`, [SEED.provider1]);
    assert.equal((await lastAudit("payout_destination.summary_viewed")).actor_id, finance.sub);
    await as(db, ROLES.user(SEED.owner1), `select provider_payout_destination_summary($1)`, [SEED.provider1]);
  });
});

describe("R2-L3: rewards", () => {
  it("a customer with a booking awaiting payment is not a new customer for a referral code", async () => {
    const referrer = await createUser(db);
    const newcomer = await createUser(db);
    await sys(db, `update profiles set referral_code = 'SECFIX2REF' where id = $1`, [referrer]);
    await booking({ customer: newcomer, status: "pending_payment" });
    // The programme as an approved enablement would leave it (fixture: values set directly as the database owner).
    await sys(db, `insert into reward_terms (program, version, body_en, body_ar, published_by) values ('referral', 'secfix2-test', repeat('Test referral terms. ', 12), repeat('شروط برنامج الإحالة للاختبار. ', 10), $1)
      on conflict do nothing`, [owner.sub]);
    await sys(db, `alter table reward_programs disable trigger user`);
    await sys(db, `update reward_programs set terms_version = 'secfix2-test' where program = 'referral'`);
    await sys(db, `alter table reward_programs enable trigger user`);
    await sys(db, `alter table platform_settings disable trigger user`);
    await sys(db, `update platform_settings set value = '{"enabled": true, "reward_sar": 10}'::jsonb where key = 'referral_program'`);
    await sys(db, `alter table platform_settings enable trigger user`);
    await sys(db, `insert into reward_terms_acceptances (customer_id, program, version, locale) values ($1, 'referral', 'secfix2-test', 'en')`, [newcomer]);
    await expectError(as(db, ROLES.user(newcomer), `select apply_referral_code('SECFIX2REF')`), /new customers only/);
  });
  it("loyalty points are taken back in proportion when the booking is refunded", async () => {
    const id = await booking({ status: "completed" });
    const [ledger] = await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, $2, 'booking_payment', 'chg_secfix2_loyalty', 100, 0, 100, 'pending') returning id`, [id, SEED.provider1]);
    const [loyalty] = await sys(db, `insert into customer_loyalty (customer_id, provider_id, points_balance, lifetime_points) values ($1, $2, 40, 40) returning id`,
      [customer, SEED.provider1]);
    await sys(db, `insert into loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description) values ($1, $2, 40, 'booking_completed', 'Earned 40 points')`, [loyalty.id, id]);
    const [refund] = await sys(db, `insert into refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source, idempotency_key, status)
      values ($1, $2, 'chg_secfix2_loyalty', 50, 'Half refunded', 'admin', 'secfix2-loyalty-1', 'processing') returning id`, [id, ledger.id]);
    await sys(db, `update refund_requests set status = 'succeeded' where id = $1`, [refund.id]);
    const [after] = await sys(db, `select points_balance from customer_loyalty where id = $1`, [loyalty.id]);
    assert.equal(after.points_balance, 20);
    assert.equal((await sys(db, `select sum(points_change)::int n from loyalty_points_ledger where booking_id = $1 and event_type = 'refund_reversal'`, [id]))[0].n, -20);
  });
});

describe("R2-L7: the sponsored price", () => {
  it("one owner alone cannot change it; a different owner approves, after a step-up", async () => {
    await expectError(as(db, stale(owner), `select admin_update_platform_setting('sponsored.price_per_new_client_sar', '30'::jsonb, 'Raise the sponsored price')`), /step-up|MFA|verification/i);
    const asked = (await as(db, owner, `select admin_update_platform_setting('sponsored.price_per_new_client_sar', '30'::jsonb, 'Raise the sponsored price') r`))[0].r;
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select value from platform_settings where key = 'sponsored.price_per_new_client_sar'`))[0].value, null);
    await expectError(as(db, owner, `select admin_decide_approval($1, 'approve', 'Mine')`, [asked.approval_id]), /own request/);
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Looks fine')`, [asked.approval_id]), /cannot decide/);
    await as(db, owner2, `select admin_decide_approval($1, 'approve', 'Agreed at the pricing review')`, [asked.approval_id]);
    assert.equal(Number((await sys(db, `select value from platform_settings where key = 'sponsored.price_per_new_client_sar'`))[0].value), 30);
    await setPlatformSetting(db, owner, "sponsored.price_per_new_client_sar", 25);
  });
});

describe("R2-L1: reconciliation runs started from the console run under the caller", () => {
  it("the service run refuses an administrator who did not open it with a fresh step-up, and records the actor when they did", async () => {
    const day = "2026-09-29";
    const run = () => as(db, ROLES.service, `select service_reconcile_day_for_actor($1, $2::date, 0, 0, 0, '[]'::jsonb) r`, [finance.sub, day]);
    await expectError(run(), /No reconciliation run was opened/);
    await expectError(as(db, stale(finance), `select admin_begin_reconciliation_run($1::date)`, [day]), /step|MFA|verification/i);
    await expectError(as(db, operations, `select admin_begin_reconciliation_run($1::date)`, [day]), /cannot run reconciliation/);
    await as(db, finance, `select admin_begin_reconciliation_run($1::date)`, [day]);
    const out = (await run())[0].r;
    assert.equal(out.actor_id, finance.sub);
    assert.equal((await sys(db, `select ran_by from tap_reconciliation_runs where business_day = $1`, [day]))[0].ran_by, finance.sub);
    assert.equal((await lastAudit("reconciliation.run")).actor_id, finance.sub);
    for (const user of [finance, owner]) {
      await expectError(as(db, user, `select service_reconcile_day_for_actor($1, $2::date, 0, 0, 0, '[]'::jsonb)`, [user.sub, day]), /Service role required|permission denied/);
    }
  });
});
