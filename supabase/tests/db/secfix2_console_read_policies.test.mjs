import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// SECFIX-2 R2-H1 and R2-M8 (docs/reviews/2026-10-11-security-round2.md). Every console role used to read provider notes about
// customers, applicants' contact details, agreement IPs, contests, waitlists, blocks, payments, receivables, holds, staff pay
// and the whole audit log by direct SELECT with no audit row. Each reproduction below must now come back empty.

// A permissive read policy that lets a console session through: an administrator test, or a shared provider helper that
// admits operations.write.
const ADMIN_BRANCH = /\b(is_admin|admin_can|admin_role|can_access_provider_operation|can_access_provider_wide|is_booking_staff)\(/;

// Tables a console session may still read directly, each reviewed: catalogue and configuration data with no personal,
// bank or pay content, and the governance tables the console exists to operate. Anything else with an administrator read
// branch must carry the restrictive console policy.
const ALLOW_DIRECT_CONSOLE_READ = {
  admin_approval_requests: "governance inbox; the payload column is not client-readable (GOV-1)",
  admin_role_assignments: "console role assignments (governance)",
  admin_role_history: "console role history (governance)",
  break_glass_reviews: "break-glass review queue (governance)",
  governance_notifications: "notice status only; the destination column is not client-readable (GOV-FIX H-3)",
  governance_settings: "approval thresholds and caps (configuration)",
  iban_reveal_limit_lifts: "reveal-ceiling lifts: who lifted whose limit, no IBAN (governance)",
  security_alerts: "security alerts the console acknowledges (governance)",
  integration_audit_log: "integration configuration change history; no customer data",
  integrations: "integration configuration",
  api_keys: "API key metadata: name, prefix and last 4 characters only, never the secret",
  webhook_subscriptions: "provider webhook endpoint configuration",
  categories: "service catalogue",
  countries: "country catalogue",
  fee_rules: "platform fee rules (configuration)",
  membership_plans: "provider membership plan catalogue",
  message_templates: "message template catalogue",
  legal_agreements: "published agreement texts",
  platform_settings: "platform configuration",
  promotional_codes: "promotion catalogue",
  services: "service catalogue",
  service_variants: "service catalogue",
  provider_group_settings: "provider booking configuration",
  provider_recurring_settings: "provider booking configuration",
  seasonal_schedules: "provider opening hours",
  provider_closures: "provider closure days",
  ledger_adjustment_reasons: "correction reason catalogue",
  reward_programs: "reward programme configuration (D-Q7)",
  payment_methods: "payment method configuration",
  providers: "business profile; private columns are not client-readable (column grants)",
  professional_handle_redirects: "public profile handle redirects",
  professional_reserved_handles: "reserved handle list",
  professional_portfolio_items: "public professional portfolio",
  professional_profiles: "public professional profile",
  professional_workplaces: "public professional workplaces",
  provider_promos: "provider promotions (public offers)",
  employee_portfolios: "portfolio photos published with consent",
  provider_fee_change_notices: "fee change notices to businesses (D-Q8), no personal data",
  provider_value_summaries: "aggregate business value summaries",
  psp_reconciliation_runs: "has its own restrictive policy requiring money.ledger",
  sponsored_campaigns: "business campaign configuration",
};

let db;
let owner;
let finance;
let operations;
let analyst;
let customer;
let applicant;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = await createUser(db);
  applicant = await createUser(db);
  const svc = await serviceFor(db, SEED.employee1);
  const [{ id: bookingId }] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
    values ($1, $2, $3, $4, 'no_show', now() - interval '2 days', 30, 200, 200, 0, 200, 0, 'marketplace', true) returning id`,
    [customer, SEED.branch1, SEED.employee1, svc.id]);
  await sys(db, `insert into provider_customer_notes (provider_id, customer_id, notes) values ($1, $2, 'Allergic to henna; pregnant - avoid chemicals')`,
    [SEED.provider1, customer]);
  await sys(db, `insert into provider_applications (user_id, business_name_en, business_name_ar, contact_email, contact_phone, city, district, address_text)
    values ($1, 'Applicant Salon', 'صالون المتقدم', 'applicant@example.test', '+966500000999', 'Riyadh', 'Olaya', 'Home street 1')`, [applicant]);
  await sys(db, `insert into agreement_acceptances (user_id, agreement_id, agreement_key, version, ip_address, user_agent)
    select $1, id, agreement_key, version, '203.0.113.7', 'Test agent' from legal_agreements order by created_at limit 1`, [customer]);
  await sys(db, `insert into no_show_contests (booking_id, customer_id, reason) values ($1, $2, 'I was there, the door was locked')`, [bookingId, customer]);
  await sys(db, `insert into waitlists (customer_id, branch_id, service_id, preferred_date, preferred_time_start, preferred_time_end)
    values ($1, $2, $3, current_date + 5, '10:00', '12:00')`, [customer, SEED.branch1, svc.id]);
  await sys(db, `insert into provider_customer_blocks (provider_id, customer_id, reason, created_by)
    select $1, $2, 'Abusive messages', owner_id from providers where id = $1`, [SEED.provider1, customer]);
  await sys(db, `insert into employee_commission_rules (employee_id, provider_id, base_salary_sar, commission_rate)
    values ($1, $2, 4200, 12) on conflict do nothing`, [SEED.employee1, SEED.provider1]);
  await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason) values ($1, current_date + 3, current_date + 4, 'Medical appointment')`,
    [SEED.employee1]);
  const [ledger] = await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
    values ($1, $2, 'booking_payment', 'chg_secfix2_reads_1', 200, 0, 200, 'pending') returning id`, [bookingId, SEED.provider1]);
  // One audited read, so the audit log holds a row the direct-read checks can look for.
  await as(db, owner, `select admin_list_audit_events(null, null, null, null, 5, 0, null)`);
  await sys(db, `insert into provider_receivables (provider_id, ledger_id, adjustment_entry_id, amount, reason) values ($1, $2, $2, 25, 'Correction after payout')`, [SEED.provider1, ledger.id]);
});

const directCount = (user, table) =>
  as(db, user, `select count(*)::int n from ${table}`).then((rows) => rows[0].n, (e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));

describe("R2-H1: no console read policy on a sensitive table can come back unnoticed", () => {
  it("every table whose read policy admits a console session carries the restrictive console policy or is on the reviewed allow-list", async () => {
    const policies = await sys(db, `select tablename, policyname, permissive, cmd, coalesce(qual, '') as qual
      from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL')`);
    const restricted = new Set(policies
      .filter((p) => p.permissive === "RESTRICTIVE" && /is_admin\(\)/.test(p.qual))
      .map((p) => p.tablename));
    const exposed = [...new Set(policies.filter((p) => p.permissive === "PERMISSIVE" && ADMIN_BRANCH.test(p.qual)).map((p) => p.tablename))];
    const unguarded = exposed.filter((t) => !restricted.has(t) && !(t in ALLOW_DIRECT_CONSOLE_READ)).sort();
    assert.deepEqual(unguarded, [], `tables a console session reads directly without the audited-read guard: ${unguarded.join(", ")}`);
    for (const [table, reason] of Object.entries(ALLOW_DIRECT_CONSOLE_READ)) {
      assert.ok(reason.length > 10, `${table} has a reviewed reason`);
    }
  });

  it("the allow-list holds no personal, bank, pay, money or audit table", () => {
    for (const table of ["admin_audit_logs", "provider_customer_notes", "provider_applications", "agreement_acceptances", "no_show_contests",
      "waitlists", "provider_customer_blocks", "membership_payments", "subscription_payments", "provider_receivables", "provider_payout_holds",
      "reward_reversals", "employee_commission_rules", "employee_time_off", "webhook_deliveries", "memberships", "membership_redemptions"]) {
      assert.ok(!(table in ALLOW_DIRECT_CONSOLE_READ), table);
    }
  });

  it("analyst with a stale session reads none of the report's rows directly (reproduction)", async () => {
    const stale = { ...analyst, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 3600 }] };
    assert.equal((await as(db, stale, `select admin_can('personal.read') r`))[0].r, false);
    assert.equal((await as(db, stale, `select count(*)::int n from provider_customer_notes`))[0].n, 0);
    assert.equal((await as(db, stale, `select count(*)::int n from provider_applications`))[0].n, 0);
  });

  it("returns no rows to any console role on every guarded table, while the rows exist", async () => {
    const tables = ["provider_customer_notes", "provider_applications", "agreement_acceptances", "no_show_contests", "waitlists",
      "provider_customer_blocks", "membership_payments", "subscription_payments", "provider_receivables", "provider_payout_holds",
      "reward_reversals", "employee_commission_rules", "employee_time_off", "admin_audit_logs", "booking_services", "memberships",
      "membership_redemptions", "provider_memberships", "provider_share_tokens", "provider_subscriptions", "provider_client_imports",
      "sponsored_attributions", "sponsored_clicks", "webhook_deliveries", "tap_reconciliation_imports", "tap_reconciliation_events",
      "tap_reconciliation_runs", "reconciliation_breaks"];
    for (const table of ["provider_customer_notes", "provider_applications", "agreement_acceptances", "no_show_contests", "waitlists",
      "provider_customer_blocks", "provider_receivables", "employee_commission_rules", "employee_time_off", "admin_audit_logs"]) {
      assert.ok((await sys(db, `select count(*)::int n from ${table}`))[0].n > 0, `${table} has rows for the test`);
    }
    for (const table of tables) {
      for (const user of [owner, finance, operations, analyst]) {
        assert.equal(await directCount(user, table), 0, `${table} is not readable directly by a console session`);
      }
    }
  });

  it("keeps the data subjects' and providers' own access", async () => {
    const me = ROLES.user(customer);
    assert.equal((await as(db, me, `select count(*)::int n from no_show_contests`))[0].n, 1);
    assert.equal((await as(db, me, `select count(*)::int n from waitlists`))[0].n, 1);
    assert.equal((await as(db, me, `select count(*)::int n from agreement_acceptances`))[0].n, 1);
    assert.equal((await as(db, ROLES.user(applicant), `select count(*)::int n from provider_applications`))[0].n, 1);
    const providerOwner = ROLES.user(SEED.owner1);
    assert.equal((await as(db, providerOwner, `select count(*)::int n from provider_customer_notes`))[0].n, 1);
    assert.equal((await as(db, providerOwner, `select count(*)::int n from provider_customer_blocks`))[0].n, 1);
    assert.equal((await as(db, providerOwner, `select count(*)::int n from provider_receivables`))[0].n, 1);
  });

  it("a console session can no longer write provider notes, blocks or memberships through the dropped administrator branch", async () => {
    await expectError(as(db, operations, `insert into provider_customer_notes (provider_id, customer_id, notes) values ($1, $2, 'x')`, [SEED.provider2, customer]),
      /row-level security|permission denied/);
    assert.equal((await as(db, operations, `update employee_time_off set reason = 'edited' returning 1`)).length, 0);
  });
});

describe("R2-M8: the audit log is the owner's, through an audited function", () => {
  it("only the owner reads it, page by page, and the read itself is logged with the entry ids", async () => {
    const out = (await as(db, owner, `select admin_list_audit_events(null, null, null, null, 10, 0, 'audit_review') r`))[0].r;
    assert.ok(Number(out.total) > 0);
    assert.ok(out.rows.length > 0 && out.rows.length <= 10);
    const [read] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'audit.listed' order by created_at desc limit 1`);
    assert.equal(read.actor_id, owner.sub);
    assert.equal(read.details.purpose, "audit_review");
    assert.ok(read.details.target_ids.includes(out.rows[0].id));
    for (const user of [finance, operations, analyst]) {
      await expectError(as(db, user, `select admin_list_audit_events(null, null, null, null, 10, 0, null)`), /cannot read the audit log/);
    }
    await expectError(as(db, ROLES.user(customer), `select admin_list_audit_events()`), /Administrator access required/);
  });

  it("filters by action and refuses an unknown purpose or an inverted range", async () => {
    const out = (await as(db, owner, `select admin_list_audit_events('audit.listed', null, null, null, 50, 0, null) r`))[0].r;
    assert.ok(out.rows.every((row) => row.action.includes("audit.listed")));
    await expectError(as(db, owner, `select admin_list_audit_events(null, null, null, null, 10, 0, 'curiosity')`), /Unknown purpose/);
    await expectError(as(db, owner, `select admin_list_audit_events(null, null, now(), now() - interval '1 day', 10, 0, null)`), /must not be after/);
  });
});
