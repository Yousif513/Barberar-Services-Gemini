import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

let db;
let admin;
const owner = ROLES.user(SEED.owner1);

const auditRows = (action) => sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at`, [action]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("admin write audit", () => {
  it("records admin changes to services with before/after values in the same transaction", async () => {
    const service = (await sys(db, `select id, base_price from services where provider_id = $1 limit 1`, [SEED.provider1]))[0];
    await as(db, admin, `update services set base_price = base_price + 5 where id = $1`, [service.id]);
    const rows = await auditRows("services.update");
    const row = rows.find((r) => r.target_id === service.id);
    assert.ok(row, "audit row written");
    assert.equal(row.actor_id, admin.sub);
    assert.equal(Number(row.details.changes.base_price.before), Number(service.base_price));
    assert.equal(Number(row.details.changes.base_price.after), Number(service.base_price) + 5);
  });

  it("redacts sensitive values and ignores provider-owner writes", async () => {
    await as(db, admin, `update providers set contact_phone = '+966511111111' where id = $1`, [SEED.provider1]);
    const row = (await auditRows("providers.update")).at(-1);
    assert.deepEqual(row.details.changes.contact_phone, { changed: true });
    const before = (await auditRows("services.update")).length;
    await as(db, owner, `update services set base_price = base_price + 1 where provider_id = $1`, [SEED.provider1]);
    assert.equal((await auditRows("services.update")).length, before, "owner writes are not operator actions");
  });
});

describe("payout.approve: payout review", () => {
  it("approves and rejects only through valid transitions with a reason", async () => {
    const id = (await sys(db, `
      insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
      values ($1, $2, 100, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1]))[0].id;
    await expectError(as(db, owner, `select admin_review_payout_request($1, 'processing', 'looks fine')`, [id]), /Administrator/);
    await expectError(as(db, admin, `select admin_review_payout_request($1, 'rejected', '')`, [id]), /reason/);
    await as(db, admin, `select admin_review_payout_request($1, 'processing', 'Bank details checked')`, [id]);
    const retry = (await as(db, admin, `select admin_review_payout_request($1, 'processing', 'Bank details checked') r`, [id]))[0].r;
    assert.equal(retry.unchanged, true, "a repeated decision is a safe retry");
    await as(db, admin, `select admin_review_payout_request($1, 'rejected', 'Provider asked to cancel')`, [id]);
    await expectError(as(db, admin, `select admin_review_payout_request($1, 'processing', 'Reopen')`, [id]), /cannot move/);
    const audit = (await auditRows("payout_requests.update")).filter((r) => r.target_id === id);
    assert.equal(audit.length, 2);
    assert.equal(audit[1].details.reason, "Provider asked to cancel");
    assert.deepEqual(audit[0].details.changes.iban, undefined, "IBAN never enters the audit log");
  });
});

describe("platform settings", () => {
  it("change only through the validated command, with reason and audit", async () => {
    await expectError(as(db, admin, `update platform_settings set value = '30'::jsonb where key = 'booking_hold_minutes'`).then(async () => {
      const v = (await sys(db, `select value from platform_settings where key = 'booking_hold_minutes'`))[0].value;
      if (Number(v) === 30) throw new Error("direct write succeeded");
      throw new Error("no rows changed");
    }), /no rows changed|permission denied/);
    await expectError(as(db, admin, `select admin_update_platform_setting('booking_hold_minutes', '500'::jsonb, 'Longer holds')`), /between 5 and 120/);
    await expectError(as(db, owner, `select admin_update_platform_setting('booking_hold_minutes', '20'::jsonb, 'Longer holds')`), /Administrator/);
    await as(db, admin, `select admin_update_platform_setting('booking_hold_minutes', '20'::jsonb, 'Customers need longer to pay')`);
    assert.equal(Number((await sys(db, `select value from platform_settings where key = 'booking_hold_minutes'`))[0].value), 20);
    const row = (await auditRows("platform_settings.update")).at(-1);
    assert.equal(row.details.key, "booking_hold_minutes");
    assert.equal(row.details.reason, "Customers need longer to pay");
  });

  it("validates loyalty values and keeps tier tables", async () => {
    await expectError(as(db, admin, `select admin_update_platform_setting('loyalty_program', '{"enabled":true}'::jsonb, 'Launch')`), /need enabled/);
    await as(db, admin, `select admin_update_platform_setting('loyalty_program',
      '{"enabled":true,"points_per_sar":0.1,"sar_per_point":0.1,"min_redeem_points":100}'::jsonb, 'Owner approved launch values')`);
    const v = (await sys(db, `select value, approved_by from platform_settings where key = 'loyalty_program'`))[0];
    assert.equal(v.value.enabled, true);
    assert.ok(v.value.tiers, "tier table preserved");
  });
});

describe("operator hold release", () => {
  it("is admin-only, needs a reason and records how many holds were released", async () => {
    await expectError(as(db, owner, `select admin_release_expired_holds('Clear stuck holds')`), /Administrator/);
    await expectError(as(db, admin, `select admin_release_expired_holds('')`), /reason/);
    const r = (await as(db, admin, `select admin_release_expired_holds('Clear stuck holds') r`))[0].r;
    assert.equal(typeof r.released, "number");
    const row = (await auditRows("booking.holds_released")).at(-1);
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.reason, "Clear stuck holds");
    assert.equal(row.details.released, r.released);
  });
});

describe("customer profile clearing", () => {
  it("is admin-only, needs a reason and only applies to customer profiles", async () => {
    const target = await createUser(db, { role: "customer", phone: "+966512340001", verified: true });
    await expectError(as(db, owner, `select admin_clear_customer_profile($1, 'Customer asked')`, [target]), /Administrator access required/);
    await expectError(as(db, ROLES.user(target), `select admin_clear_customer_profile($1, 'Customer asked')`, [target]), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_clear_customer_profile($1, 'Customer asked')`, [target]), /permission denied/);
    await expectError(as(db, admin, `select admin_clear_customer_profile($1, '')`, [target]), /reason/);
    await expectError(as(db, admin, `select admin_clear_customer_profile($1, 'Owner asked')`, [SEED.owner1]), /Only customer profiles/);
  });

  it("clears profile details without inventing values, so repeated clears never collide", async () => {
    const first = await createUser(db, { role: "customer", phone: "+966512340002", verified: true });
    const second = await createUser(db, { role: "customer", phone: "+966512340003", verified: true });
    await as(db, admin, `select admin_clear_customer_profile($1, 'PDPL request 1')`, [first]);
    await as(db, admin, `select admin_clear_customer_profile($1, 'PDPL request 2')`, [second]);
    const rows = await sys(db, `select first_name, last_name, email, phone_number, phone_verified from profiles where id = any($1) order by id`, [[first, second]]);
    for (const row of rows) {
      assert.deepEqual(row, { first_name: null, last_name: null, email: null, phone_number: null, phone_verified: false });
    }
    const event = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'customer.profile_cleared' and target_id = $1`, [first]))[0];
    assert.equal(event.actor_id, admin.sub);
    assert.equal(event.details.reason, "PDPL request 1");
    const change = (await sys(db, `select details from admin_audit_logs where action = 'profiles.update' and target_id = $1 order by created_at desc limit 1`, [first]))[0];
    assert.equal(change.details.reason, "PDPL request 1", "the row-level audit carries the reason too");
    assert.deepEqual(change.details.changes.phone_number, { changed: true }, "the cleared phone number never enters the audit log");
  });
});

describe("report exports", () => {
  // GOV-2 (Q4 item 4): exports are built by admin_export_finance_report on the server; the browser no longer reports a count.
  it("are built for administrators only, for a known report and a sensible period", async () => {
    const call = (user, args) => as(db, user, `select admin_export_finance_report(${args})`);
    await expectError(call(owner, `'payments_ledger', '2026-10-01', '2026-10-31'`), /Administrator access required/);
    await expectError(call(ROLES.user(SEED.customer), `'payments_ledger', '2026-10-01', '2026-10-31'`), /Administrator access required/);
    await expectError(call(ROLES.anon, `'payments_ledger', '2026-10-01', '2026-10-31'`), /permission denied/);
    await expectError(call(admin, `'everything', '2026-10-01', '2026-10-31'`), /Unknown report/);
    await expectError(call(admin, `'vat_summary', '2026-10-31', '2026-10-01'`), /valid range/);
    await expectError(call(admin, `'vat_summary', '2024-01-01', '2026-10-01'`), /at most 400 days/);
    await expectError(as(db, admin, `select admin_record_export('vat_summary', '2026-10-01', '2026-10-31', 12)`), /permission denied/);
  });

  it("leave an audit entry naming the report, the period and how many rows left the system", async () => {
    await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                   values ($1, 'package_sale', 'chg_release_export_1', 50, 5, 45, 'pending')`, [SEED.provider1]);
    const exported = (await as(db, admin, `select admin_export_finance_report('payments_ledger', current_date - 1, current_date + 1) r`))[0].r;
    const row = (await auditRows("report.exported")).at(-1);
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.filter.report, "payments_ledger");
    assert.ok(row.details.filter.from && row.details.filter.to);
    assert.ok(exported.row_count >= 1);
    assert.equal(row.details.rows, exported.row_count);
  });
});
