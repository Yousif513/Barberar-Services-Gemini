import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// Fixes from the independent security review: every administrator write is audited, the audit log keeps
// no personal values, a payout's destination is fixed once requested, anonymous visitors cannot read internal
// columns, and a refund stuck in progress can be reopened by an operator.
let db;
let admin;
const owner = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);

const auditRows = (action) => sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at`, [action]);
const count = async (action) => (await auditRows(action)).length;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("administrator writes to money and configuration tables", () => {
  it("leave an audit entry, the way the console commands do", async () => {
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                                   values ($1, 'package_sale', 'chg_hard_1', 100, 10, 90, 'pending') returning id`, [SEED.provider1]))[0].id;
    const before = await count("transactional_ledger.update");
    await as(db, admin, `update transactional_ledger set provider_share = provider_share + 5000, payout_status = 'released' where id = $1`, [ledger]);
    const rows = await auditRows("transactional_ledger.update");
    assert.equal(rows.length, before + 1, "the direct ledger write is recorded");
    const row = rows.at(-1);
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.target_id, ledger);
    assert.equal(Number(row.details.changes.provider_share.before), 90);
    assert.equal(Number(row.details.changes.provider_share.after), 5090);
    assert.equal(row.details.changes.payout_status.after, "released");

    const rule = (await sys(db, `select id from fee_rules limit 1`))[0];
    assert.ok(rule, "the seeded fee rules exist");
    const feeBefore = await count("fee_rules.update");
    await as(db, admin, `update fee_rules set fee_percentage = fee_percentage + 1 where id = $1`, [rule.id]);
    assert.equal(await count("fee_rules.update"), feeBefore + 1, "fee changes are recorded");
  });

  it("cover every table an administrator policy can write", async () => {
    const writable = (await sys(db, `
      select distinct p.tablename t from pg_policies p
      where p.schemaname = 'public' and p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        and (p.qual ilike '%is_admin()%' or p.with_check ilike '%is_admin()%')
        and p.tablename not in ('admin_audit_logs', 'integration_audit_log', 'customer_favorites')
        and (select relkind from pg_class where oid = to_regclass('public.' || p.tablename)) = 'r'`)).map((r) => r.t);
    const audited = new Set((await sys(db, `select tgrelid::regclass::text t from pg_trigger where tgname = 'trg_audit_admin_write'`)).map((r) => r.t.replace(/^public\./, "")));
    const missing = writable.filter((table) => !audited.has(table));
    assert.deepEqual(missing, [], `administrator-writable tables without the audit trigger: ${missing.join(", ")}`);
    assert.ok(writable.length >= 25, "the list is derived from policies, not a short fixed set");
  });

  it("do not copy personal values into the log, even when the command that clears them runs", async () => {
    const target = await createUser(db, { role: "customer", phone: "+966566660001", verified: true });
    await sys(db, `update profiles set first_name = 'Sara', last_name = 'Alharbi', gender = 'female', email = 'sara.private@example.com', expo_push_token = 'ExponentPushToken[secret-device]' where id = $1`, [target]);
    await as(db, admin, `select admin_clear_customer_profile($1, 'PDPL request 77')`, [target]);
    const logged = JSON.stringify((await auditRows("profiles.update")).filter((r) => r.target_id === target).map((r) => r.details));
    for (const personal of ["Sara", "Alharbi", "female", "sara.private", "secret-device", "+966566660001"]) {
      assert.ok(!logged.includes(personal), `the audit log must not hold ${personal}`);
    }
    const changes = (await auditRows("profiles.update")).filter((r) => r.target_id === target).at(-1).details.changes;
    assert.deepEqual(changes.first_name, { changed: true });
    assert.deepEqual(changes.expo_push_token, { changed: true });
  });

  it("keep only the last four digits of a bank account, and no codes or free text", async () => {
    const gift = (await sys(db, `insert into gift_cards (code, purchaser_id, recipient_name, recipient_phone, message, original_amount, remaining_balance, status)
                                 values ('GIFT-SECRET-4821', $1, 'Noura', '+966577770001', 'Happy birthday', 200, 200, 'active') returning id`, [SEED.customer]))[0];
    await as(db, admin, `update gift_cards set code = 'GIFT-SECRET-9999', recipient_name = 'Lama', message = 'Thank you', remaining_balance = 150 where id = $1`, [gift.id]);
    const giftAudit = (await auditRows("gift_cards.update")).filter((r) => r.target_id === gift.id);
    assert.equal(giftAudit.length, 1, "the gift card write is recorded");
    assert.equal(Number(giftAudit[0].details.changes.remaining_balance.after), 150, "the balance change is visible");
    const logged = JSON.stringify(giftAudit.map((r) => r.details));
    for (const secret of ["GIFT-SECRET", "Noura", "Lama", "Happy birthday", "Thank you", "+966577770001"]) {
      assert.ok(!logged.includes(secret), `gift card value ${secret} stays out of the log`);
    }

    const rule = (await sys(db, `insert into employee_commission_rules (employee_id, provider_id, wps_iban) values ($1, $2, 'SA0380000000608010167519') returning id`,
      [SEED.employee1, SEED.provider1]))[0];
    await as(db, admin, `update employee_commission_rules set wps_iban = 'SA4420000001234567891234' where id = $1`, [rule.id]);
    const change = (await auditRows("employee_commission_rules.update")).filter((r) => r.target_id === rule.id).at(-1).details.changes.wps_iban;
    assert.deepEqual(change, { changed: true, before_last4: "7519", after_last4: "1234" });
    assert.ok(!JSON.stringify(change).includes("SA0380") && !JSON.stringify(change).includes("SA4420"), "a full account number never enters the log");
  });
});

describe("payout requests", () => {
  let request;
  before(async () => {
    request = (await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
                              values ($1, $2, 250, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1]))[0].id;
  });

  it("keep the amount and bank details the provider asked for, even against an administrator", async () => {
    await expectError(as(db, admin, `update payout_requests set iban = 'SA4420000001234567891234' where id = $1`, [request]), /cannot be changed/);
    await expectError(as(db, admin, `update payout_requests set bank_name = 'Other Bank' where id = $1`, [request]), /cannot be changed/);
    await expectError(as(db, admin, `update payout_requests set amount = 9000 where id = $1`, [request]), /cannot be changed/);
    const row = (await sys(db, `select iban, bank_name, amount from payout_requests where id = $1`, [request]))[0];
    assert.deepEqual([row.iban, row.bank_name, Number(row.amount)], ["SA0380000000608010167519", "Test Bank", 250]);
  });

  it("can still be reviewed, which only changes the status", async () => {
    await as(db, admin, `select admin_review_payout_request($1, 'processing', 'Details checked with the provider')`, [request]);
    assert.equal((await sys(db, `select status from payout_requests where id = $1`, [request]))[0].status, "processing");
  });
});

describe("what anonymous visitors can read", () => {
  it("keeps the public marketplace columns and drops provider and staff internals", async () => {
    await sys(db, `update providers set admin_notes = 'internal: owes us a licence' where id = $1`, [SEED.provider1]);
    const publicRows = await as(db, ROLES.anon, `select id, business_name_en, is_verified from providers where is_verified limit 1`);
    assert.equal(publicRows.length, 1, "verified providers are still public");
    for (const column of ["admin_notes", "cr_wathq_data", "commission_percentage", "contact_email", "contact_phone", "cr_number", "vat_number", "trade_license_url"]) {
      await expectError(as(db, ROLES.anon, `select ${column} from providers limit 1`), /permission denied/);
    }
    const staff = await as(db, ROLES.anon, `select name_en, title_en, photo_url, is_active from employees where is_active limit 1`);
    assert.equal(staff.length, 1, "active staff stay public");
    for (const column of ["phone", "email"]) {
      await expectError(as(db, ROLES.anon, `select ${column} from employees limit 1`), /permission denied/);
    }
    await expectError(as(db, ROLES.anon, `select admin_note from payment_methods limit 1`), /permission denied/);
    // The marketplace keeps working for a guest: search and slots read the public columns only.
    assert.ok((await as(db, ROLES.anon, `select search_marketplace_providers(null) r`))[0].r.total_count > 0);
  });

  it("does not change what the provider owner and the administrator can read", async () => {
    assert.match((await as(db, owner, `select admin_notes from providers where id = $1`, [SEED.provider1]))[0].admin_notes, /internal/);
    assert.match((await as(db, admin, `select admin_notes from providers where id = $1`, [SEED.provider1]))[0].admin_notes, /internal/);
    assert.equal((await as(db, owner, `select phone, email from employees where branch_id = $1`, [SEED.branch1])).length > 0, true, "the owner still reads their own staff contact details");
  });
});

describe("refunds stuck in progress", () => {
  let seq = 0;
  async function refund({ status = "processing", claimedMinutesAgo = 30 } = {}) {
    seq += 1;
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                                   values ($1, 'package_sale', $2, 120, 12, 108, 'pending') returning id`, [SEED.provider1, `chg_stuck_${seq}`]))[0].id;
    return (await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key, claimed_at)
                           values ($1, $2, 40, 'Customer cancelled', 'admin', $3, 1, $4, now() - make_interval(mins => $5::int)) returning id`,
      [ledger, `chg_stuck_${seq}`, status, `stuck-${seq}`, claimedMinutesAgo]))[0].id;
  }

  it("are reopened only by an administrator, with a reason, and only after 15 minutes", async () => {
    const stuck = await refund();
    await expectError(as(db, owner, `select admin_reopen_stuck_refund($1, 'The gateway never answered')`, [stuck]), /Administrator access required/);
    await expectError(as(db, customer, `select admin_reopen_stuck_refund($1, 'The gateway never answered')`, [stuck]), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_reopen_stuck_refund($1, 'The gateway never answered')`, [stuck]), /permission denied/);
    await expectError(as(db, admin, `select admin_reopen_stuck_refund($1, ' ')`, [stuck]), /reason/);
    await expectError(as(db, admin, `select admin_reopen_stuck_refund($1, 'Fresh one')`, [await refund({ claimedMinutesAgo: 2 })]), /still in progress/);
    await expectError(as(db, admin, `select admin_reopen_stuck_refund($1, 'Wrong state')`, [await refund({ status: "succeeded" })]), /stuck in progress/);
    assert.equal((await sys(db, `select status from refund_requests where id = $1`, [stuck]))[0].status, "processing");
  });

  it("go back to failed so the operator can retry them, with the reason in the audit log", async () => {
    const stuck = await refund({ claimedMinutesAgo: 45 });
    await as(db, admin, `select admin_reopen_stuck_refund($1, 'Checked the gateway: no refund was issued')`, [stuck]);
    assert.equal((await sys(db, `select status from refund_requests where id = $1`, [stuck]))[0].status, "failed");
    const audit = (await auditRows("refund.reopened")).find((r) => r.target_id === stuck);
    assert.equal(audit.actor_id, admin.sub);
    assert.equal(audit.details.reason, "Checked the gateway: no refund was issued");
    await as(db, admin, `select admin_retry_refund_request($1, 'Customer is waiting')`, [stuck]);
  });

  it("are counted as stuck on the dashboard", async () => {
    await refund({ claimedMinutesAgo: 90 });
    const overview = (await as(db, admin, `select admin_dashboard_overview() o`))[0].o;
    const queue = overview.queues.find((q) => q.key === "refund_requests");
    assert.ok(Number(queue.stuck) >= 1);
  });
});
