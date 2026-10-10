import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { payableLedger } from "./gov1_fixtures.mjs";

// GOV-2 (Q4 and D4 final decision texts): no console session reads personal, bank, ledger, invoice or message rows from a
// table; audited, paged functions serve the console and each read writes an audit event; analyst and operations read no
// money; no administrator reads health answers except through the owner break-glass; small cells are suppressed.
let db;
let owner;
let finance;
let operations;
let analyst;
const now = () => Math.floor(Date.now() / 1000);
const staleMfa = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const forbidden = /permission denied|access required|cannot read|Only the data protection/i;
const auditCount = async (action) => (await sys(db, `select count(*)::int n from admin_audit_logs where action = $1`, [action]))[0].n;
const lastAudit = async (action) => (await sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at desc limit 1`, [action]))[0];
const call = (user, sql, params = []) => as(db, user, sql, params).then((rows) => rows[0].r);

// Every table the decision names, with a statement that would read other people's rows.
const TABLES = [
  ["profiles", `select id from profiles where id <> auth.uid()`],
  ["consents", `select id from consents where user_id <> auth.uid()`],
  ["data_subject_requests", `select id from data_subject_requests where user_id <> auth.uid()`],
  ["payout_requests", `select id from payout_requests`],
  ["payout_allocations", `select payout_request_id from payout_allocations`],
  ["transactional_ledger", `select id from transactional_ledger`],
  ["wallet_credits", `select id from wallet_credits`],
  ["gift_cards", `select id from gift_cards`],
  ["invoices", `select id from invoices`],
  ["provider_fee_invoices", `select id from provider_fee_invoices`],
  ["message_log", `select id from message_log`],
  ["message_queue", `select id from message_queue`],
  ["notifications", `select id from notifications where user_id <> auth.uid()`],
  ["conversations", `select id from conversations`],
  ["messages", `select id from messages`],
  ["employees (inactive staff)", `select id from employees where not is_active`],
  ["booking_home_addresses", `select booking_id from booking_home_addresses`],
  ["intake_answers", `select submission_id from intake_answers`],
  ["intake_submissions", `select id from intake_submissions`],
  ["analytics_events", `select id from analytics_events`],
];

let submissionId;
let ledgerId;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));

  // One row in each table, so "no rows" means the policy refused them, not that the table was empty.
  ledgerId = await payableLedger(db, SEED.provider1, 120);
  await sys(db, `insert into consents (user_id, purpose, status, document_version, method) values ($1, 'marketing', 'granted', 'v1', 'web_form')`, [SEED.customer]);
  await sys(db, `insert into data_subject_requests (user_id, request_type, status, details) values ($1, 'access', 'pending', 'Copy of my data')`, [SEED.customer]);
  await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban) values ($1, $2, 10, 'Test Bank', 'SA0380000000608010167519')`, [SEED.provider1, SEED.owner1]);
  await sys(db, `insert into message_log (recipient_phone, recipient_id, channel, template_name, locale, message_body, status, sent_at)
                 values ('+966500000123', $1, 'whatsapp', 'booking_confirmed', 'ar', 'Your booking is confirmed', 'delivered', now())`, [SEED.customer]);
  await sys(db, `update employees set is_active = false where id = $1`, [SEED.employee2]);
  await sys(db, `insert into analytics_events (event, user_id, source) values ('booking_confirmed', $1, 'server')`, [SEED.customer]);

  const [service] = await sys(db, `select service_id as id from employee_services where employee_id = $1 limit 1`, [SEED.employee1]);
  const [booking] = await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, 'confirmed', now() + interval '40 days', 30, 100, 115, 15, 0, 0, 'link') returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, service.id]);
  const [template] = await sys(db, `insert into intake_form_templates (provider_id, name_en, name_ar) values ($1, 'Skin check', 'فحص البشرة') returning id`, [SEED.provider1]);
  const [version] = await sys(db, `insert into intake_form_template_versions (template_id, provider_id, version, fields) values ($1, $2, 1, '[]'::jsonb) returning id`, [template.id, SEED.provider1]);
  const [submission] = await sys(db, `insert into intake_submissions (booking_id, provider_id, customer_id, template_id, template_version_id, template_version)
                                      values ($1, $2, $3, $4, $5, 1) returning id`, [booking.id, SEED.provider1, SEED.customer, template.id, version.id]);
  submissionId = submission.id;
  await sys(db, `insert into intake_answers (submission_id, customer_id, answers) values ($1, $2, '{"allergy":"latex"}'::jsonb)`, [submissionId, SEED.customer]);
});

describe("direct table reads by console sessions", () => {
  it("have rows behind them (read as the database owner)", async () => {
    for (const table of ["consents", "data_subject_requests", "payout_requests", "transactional_ledger", "message_log", "intake_answers", "analytics_events"]) {
      assert.ok((await sys(db, `select count(*)::int n from ${table}`))[0].n > 0, `${table} has a fixture row`);
    }
  });

  it("return no rows or permission denied for every console role, on every listed table", async () => {
    const leaks = [];
    for (const [roleName, user] of [["owner", owner], ["finance", finance], ["operations", operations], ["analyst", analyst]]) {
      for (const [table, sql] of TABLES) {
        const rows = await as(db, user, sql).catch((error) => (/permission denied/.test(error.message) ? [] : Promise.reject(error)));
        if (rows.length > 0) leaks.push(`${roleName}: ${table} returned ${rows.length}`);
      }
    }
    assert.deepEqual(leaks, []);
  });

  it("still let an administrator read their own profile, and leave customers and providers their own rows", async () => {
    assert.equal((await as(db, owner, `select id from profiles where id = auth.uid()`)).length, 1);
    assert.ok((await as(db, ROLES.user(SEED.customer), `select id from consents`)).length >= 1);
    assert.ok((await as(db, ROLES.user(SEED.owner1), `select id from payout_requests`)).length >= 1);
    assert.equal((await as(db, ROLES.user(SEED.customer), `select submission_id from intake_answers`)).length, 1);
  });

  it("refuse direct writes to the ledger and wallet tables to every console role (no write privilege remains)", async () => {
    for (const user of [owner, finance]) {
      await expectError(as(db, user, `update transactional_ledger set payout_status = payout_status where id = $1 returning 1`, [ledgerId]), /permission denied/);
      await expectError(as(db, user, `insert into wallet_credits (customer_id, amount) values ($1, 1)`, [SEED.customer]), /permission denied|violates|null value/);
    }
  });
});

describe("audited read functions", () => {
  it("serve data requests and consents to owner and operations, each read writing one audit event with role, purpose and targets", async () => {
    const before = await auditCount("data_requests.listed");
    const result = await call(operations, `select admin_list_data_requests('open', 50, 0, 'privacy_request') r`);
    assert.ok(result.total >= 1 && result.rows.length >= 1);
    assert.equal(result.rows[0].profiles.first_name !== undefined, true);
    assert.equal(await auditCount("data_requests.listed"), before + 1);
    const audit = await lastAudit("data_requests.listed");
    assert.equal(audit.actor_id, operations.sub);
    assert.equal(audit.details.console_role, "operations");
    assert.equal(audit.details.purpose, "privacy_request");
    assert.ok(audit.details.target_ids.includes(SEED.customer));
    assert.equal(audit.details.rows, result.rows.length);

    const consents = await call(owner, `select admin_list_consents(null, 50, 0, null) r`);
    assert.ok(consents.rows.some((row) => row.user_id === SEED.customer));
    assert.equal((await lastAudit("consents.listed")).details.console_role, "owner");
  });

  it("refuse personal data to finance and analyst, and refuse a purpose that is not on the list", async () => {
    for (const user of [finance, analyst]) {
      await expectError(call(user, `select admin_list_data_requests('open', 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_customer_overview(null, 10, 0) r`), forbidden);
      await expectError(call(user, `select admin_list_message_log(null, null, 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_list_employees(null, null, null, 10, 0, null) r`), forbidden);
    }
    await expectError(call(owner, `select admin_list_consents(null, 10, 0, 'curiosity') r`), /Unknown purpose/);
  });

  it("serve the ledger, payouts, statements and fee invoices to finance and owner only, masked and audited", async () => {
    const ledger = await call(finance, `select admin_list_ledger_entries(null, null, $1, null, 50, 0, null) r`, [SEED.provider1]);
    assert.ok(ledger.rows.some((row) => row.id === ledgerId));
    assert.equal((await lastAudit("ledger.listed")).details.filter.provider_id, SEED.provider1);
    const payouts = await call(owner, `select admin_list_payout_requests(null, null, 50, 0, null) r`);
    assert.ok(payouts.rows.length >= 1);
    assert.ok(!JSON.stringify(payouts).includes("SA0380000000608010167519"), "never the full IBAN");
    assert.equal(payouts.rows[0].iban_masked, "SA** **** **** **** **** 7519");
    for (const kind of ["vat", "settlement", "employee_earnings"]) {
      const summary = await call(finance, `select admin_finance_summary($1, null, null, null, 50, 0, null) r`, [kind]);
      assert.ok(Array.isArray(summary.rows));
    }
    assert.ok(Array.isArray((await call(finance, `select admin_list_fee_invoices(null, null, 50, 0, null) r`)).rows));
  });

  it("refuse the ledger, payouts, invoices, statements and exports to operations and analyst", async () => {
    for (const user of [operations, analyst]) {
      await expectError(call(user, `select admin_list_ledger_entries(null, null, null, null, 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_list_payout_requests(null, null, 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_finance_summary('vat', null, null, null, 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_list_fee_invoices(null, null, 10, 0, null) r`), forbidden);
      await expectError(call(user, `select admin_get_booking_invoice($1, null) r`, [SEED.provider1]), forbidden);
      await expectError(call(user, `select admin_export_finance_report('payments_ledger', current_date - 1, current_date) r`), forbidden);
      assert.equal((await as(db, user, `select id from psp_reconciliation_runs`)).length, 0);
    }
  });

  it("build exports on the server, need step-up, and log the delivered row count; the browser-reported count is gone", async () => {
    await expectError(call(staleMfa(finance), `select admin_export_finance_report('payments_ledger', current_date - 1, current_date) r`), /step-up/);
    const before = await auditCount("report.exported");
    const exported = await call(finance, `select admin_export_finance_report('payments_ledger', current_date - 1, current_date + 1) r`);
    assert.ok(exported.row_count >= 1);
    assert.equal(await auditCount("report.exported"), before + 1);
    const audit = await lastAudit("report.exported");
    assert.equal(audit.details.rows, exported.row_count);
    assert.equal(audit.details.filter.report, "payments_ledger");
    await expectError(as(db, finance, `select admin_record_export('payments_ledger', current_date, current_date, 1)`), /permission denied/);
  });

  it("mask the recipient number in the message log and log the read", async () => {
    const log = await call(operations, `select admin_list_message_log(null, null, 10, 0, null) r`);
    const row = log.rows.find((item) => item.message_body === "Your booking is confirmed");
    assert.ok(row && row.recipient_phone.endsWith("123") && !row.recipient_phone.includes("96650"));
    assert.ok((await lastAudit("message_log.listed")).details.target_ids.includes(SEED.customer));
    const queue = await call(analyst, `select admin_message_queue_summary() r`);
    assert.ok("pending" in queue, "queue sizes are an aggregate any console role sees");
  });

  it("list inactive staff through the audited directory, with earnings only for a money role", async () => {
    const forOps = await call(operations, `select admin_list_employees(null, 'inactive', null, 50, 0, null) r`);
    const inactive = forOps.rows.find((row) => row.id === SEED.employee2);
    assert.ok(inactive, "the inactive employee is listed");
    assert.equal(inactive.performance?.employee_earnings ?? null, null);
    const forOwner = await call(owner, `select admin_list_employees(null, 'all', null, 50, 0, null) r`);
    assert.ok(forOwner.rows.length >= 2);
    assert.ok((await lastAudit("employees.listed")).details.target_ids.length >= 2);
  });

  it("return staff names to every console role but customer names only with personal.read, logged", async () => {
    const forAnalyst = await call(analyst, `select admin_people_names($1::uuid[], null) r`, [[owner.sub, SEED.customer]]);
    assert.deepEqual(forAnalyst.map((p) => p.id), [owner.sub]);
    const before = await auditCount("people.names_viewed");
    const forOps = await call(operations, `select admin_people_names($1::uuid[], 'review_moderation') r`, [[owner.sub, SEED.customer]]);
    assert.equal(forOps.length, 2);
    assert.equal(await auditCount("people.names_viewed"), before + 1);
    const forFinanceDispute = await call(finance, `select admin_people_names($1::uuid[], 'dispute_resolution') r`, [[SEED.customer]]);
    assert.equal(forFinanceDispute.length, 1);
  });
});

describe("health-intake answers", () => {
  it("are readable by no console role through tables or the provider read command", async () => {
    for (const user of [owner, finance, operations, analyst]) {
      assert.equal((await as(db, user, `select answers from intake_answers`)).length, 0);
      await expectError(as(db, user, `select read_booking_intake_answers(booking_id) from intake_submissions where id = $1`, [submissionId]).then(async (rows) => {
        if (rows.length === 0) throw new Error("permission denied: submission hidden");
        return rows;
      }), /not found|permission denied/);
    }
  });

  it("open only through the owner break-glass with step-up and a 20-character reason, alerting and notifying", async () => {
    const reason = "DPO request ticket PRIV-2041 customer dispute";
    for (const user of [finance, operations, analyst]) {
      await expectError(call(user, `select read_intake_answers_break_glass($1, $2) r`, [submissionId, reason]), forbidden);
    }
    await expectError(call(staleMfa(owner), `select read_intake_answers_break_glass($1, $2) r`, [submissionId, reason]), /step-up/);
    await expectError(call(owner, `select read_intake_answers_break_glass($1, 'too short') r`, [submissionId]), /20 characters/);
    const read = await call(owner, `select read_intake_answers_break_glass($1, $2) r`, [submissionId, reason]);
    assert.equal(read.answers.allergy, "latex");
    const audit = await lastAudit("intake.break_glass_read");
    assert.equal(audit.target_id, submissionId);
    assert.ok(!JSON.stringify(audit.details).includes("latex"), "the audit event never carries an answer");
    const [alert] = await sys(db, `select user_id, details from security_alerts where kind = 'health_break_glass' order by created_at desc limit 1`);
    assert.equal(alert.user_id, owner.sub);
    assert.equal(alert.details.submission_id, submissionId);
  });
});

describe("D4 small cells", () => {
  it("suppress dashboard KPIs that describe 1 to 4 people and keep queue counts", async () => {
    const overview = await call(analyst, `select admin_dashboard_overview() r`);
    assert.equal(overview.small_cell_threshold, 5);
    assert.ok(Array.isArray(overview.kpis.suppressed));
    const customers = (await sys(db, `select count(*)::int n from profiles where role = 'customer'`))[0].n;
    if (customers >= 1 && customers <= 4) assert.equal(overview.kpis.customers, null);
    else assert.equal(Number(overview.kpis.customers), customers);
    const payouts = overview.queues.find((q) => q.key === "payout_requests");
    assert.ok(Number(payouts.count) >= 1, "the work-queue count stays");
    if (Number(payouts.count) < 5) assert.equal(payouts.amount_sar, null);
    assert.equal(await auditCount("dashboard.viewed"), 0, "aggregate tiles are not logged per view");
  });

  it("suppress funnel cells with fewer than 5 people", async () => {
    const rows = await call(analyst, `select admin_get_event_counts(current_date - 2, current_date + 1) r`);
    const cell = rows.find((row) => row.event === "booking_confirmed");
    assert.ok(cell);
    assert.equal(cell.suppressed, true);
    assert.equal(cell.events, null);
    assert.equal(cell.people, null);
  });
});

describe("shared provider helpers", () => {
  it("let operations and owner through but not analyst or finance (GOV-1 gap)", async () => {
    const check = (user) => as(db, user, `select can_access_provider_operation($1, null, 'bookings') a, can_access_provider_wide($1, 'staff') b`, [SEED.provider1]).then((rows) => rows[0]);
    assert.deepEqual(await check(owner), { a: true, b: true });
    assert.deepEqual(await check(operations), { a: true, b: true });
    assert.deepEqual(await check(analyst), { a: false, b: false });
    assert.deepEqual(await check(finance), { a: false, b: false });
  });
});
