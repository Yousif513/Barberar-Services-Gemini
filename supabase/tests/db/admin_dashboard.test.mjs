import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// The /admin landing page reads admin_dashboard_overview(); these tests prove each figure moves with
// the live rows behind it and that nobody but an administrator can read it.
let db;
let admin;
let svc;
const owner = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);

const overview = async () => (await as(db, admin, `select admin_dashboard_overview() o`))[0].o;
const queue = (o, key) => o.queues.find((q) => q.key === key);

let minute = 0;
async function booking(status, scheduledSql, extra = {}) {
  minute += 45;
  const rows = await sys(db, `
    insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                          subtotal_price, total_price, tax_amount, deposit_required, created_at, cancelled_by)
    values ($1, $2, $3, $4, $5::booking_status, ${scheduledSql} + make_interval(mins => $6::int), 30, 100, 115, 15, 0,
            coalesce($7::timestamptz, now()), $8)
    returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, svc.id, status, minute, extra.createdAt ?? null, extra.cancelledBy ?? null]);
  return rows[0].id;
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  await seedCrowd();
});

// D4 (GOV-2) suppresses a figure that describes 1 to 4 people. These tests prove how each figure is counted, so every figure
// starts from at least five people: five more customers with a visit today, a completed visit and a payment this week, a
// payout request and a refund each, and enough live providers.
async function seedCrowd() {
  for (let i = 0; i < 5; i += 1) {
    const person = await createUser(db, { role: "customer" });
    const at = (sql) => sys(db, `
      insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                            subtotal_price, total_price, tax_amount, deposit_required)
      values ($1, $2, $3, $4, $5::booking_status, ${sql}, 30, 100, 115, 15, 0) returning id`,
      [person, SEED.branch1, SEED.employee1, svc.id, sql.includes("3 days") ? "completed" : "confirmed"]);
    await at(`date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh' + interval '${8 + i} hours 13 minutes'`);
    const [done] = await at(`now() - interval '3 days' - interval '${i} hours'`);
    const [ledger] = await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                                   values ($1, $2, 'booking_payment', $3, 50, 5, 45, 'pending') returning id`, [done.id, SEED.provider1, `chg_crowd_${i}`]);
    await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban) values ($1, $2, 10, 'Test Bank', 'SA0380000000608010167519')`, [SEED.provider1, SEED.owner1]);
    await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
                   values ($1, $2, 5, 'Crowd refund', 'admin', 'pending', 0, $3)`, [ledger.id, `chg_crowd_${i}`, `crowd-refund-${i}`]);
    const providerOwner = await createUser(db, { role: "provider_owner" });
    const [provider] = await sys(db, `insert into providers (owner_id, type, business_name_en, business_name_ar, status, is_verified)
                                      select $1, type, 'Crowd Salon ' || $2, 'صالون ' || $2, 'active', true from providers where id = $3 returning id`,
      [providerOwner, i, SEED.provider1]);
    await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
                   select $1, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude from branches where id = $2`, [provider.id, SEED.branch1]);
  }
}

describe("admin dashboard overview", () => {
  it("is readable by administrators only", async () => {
    await expectError(as(db, owner, `select admin_dashboard_overview()`), /Administrator access required/);
    await expectError(as(db, customer, `select admin_dashboard_overview()`), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_dashboard_overview()`), /permission denied/);
    const o = await overview();
    assert.equal(o.timezone, "Asia/Riyadh");
    assert.deepEqual(o.queues.map((q) => q.key), [
      "payout_requests", "payouts_processing", "refund_requests", "disputes",
      "provider_applications", "data_requests", "expired_holds", "flagged_reviews",
    ]);
  });

  it("counts work waiting for an operator from live rows", async () => {
    const before = await overview();

    await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
                   values ($1, $2, 250, 'Test Bank', 'SA0380000000608010167519')`, [SEED.provider1, SEED.owner1]);
    await sys(db, `insert into data_subject_requests (user_id, request_type, status, due_date)
                   values ($1, 'export', 'pending', current_date - 1)`, [SEED.customer]);
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                   values ($1, 'package_sale', 'chg_dashboard_refund', 80, 8, 72, 'pending') returning id`, [SEED.provider1]))[0].id;
    await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
                   values ($1, 'chg_dashboard_refund', 30, 'Gateway refused', 'admin', 'failed', 5, 'dash-refund-1')`, [ledger]);
    await booking("pending_payment", "now() + interval '20 days'", { createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() });
    // A hold still inside the hold window is not stuck yet.
    await booking("pending_payment", "now() + interval '21 days'");

    const after = await overview();
    assert.equal(queue(after, "payout_requests").count, queue(before, "payout_requests").count + 1);
    assert.equal(Number(queue(after, "payout_requests").amount_sar), Number(queue(before, "payout_requests").amount_sar) + 250);
    assert.ok(queue(after, "payout_requests").oldest_at, "oldest waiting time is reported");
    assert.equal(queue(after, "data_requests").count, queue(before, "data_requests").count + 1);
    assert.equal(queue(after, "data_requests").overdue, queue(before, "data_requests").overdue + 1);
    assert.equal(queue(after, "expired_holds").count, queue(before, "expired_holds").count + 1);
    assert.equal(queue(after, "expired_holds").hold_minutes, 15);
    assert.equal(queue(after, "refund_requests").count, queue(before, "refund_requests").count + 1);
    assert.equal(Number(queue(after, "refund_requests").amount_sar), Number(queue(before, "refund_requests").amount_sar) + 30);
    assert.equal(queue(after, "refund_requests").stalled, queue(before, "refund_requests").stalled + 1,
      "a refund the scheduler has stopped retrying is called out");
  });

  it("reports platform figures in SAR from the ledger and bookings", async () => {
    const before = await overview();

    await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                   values ($1, 'package_sale', 'chg_dashboard_1', 100, 10, 90, 'pending')`, [SEED.provider1]);
    await booking("confirmed", "date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh' + interval '1 hour'");
    await booking("completed", "now() - interval '3 days'");
    await booking("no_show", "now() - interval '3 days'");
    await booking("cancelled", "now() - interval '4 days'", { cancelledBy: "customer" });
    await booking("cancelled", "now() - interval '4 days'", { cancelledBy: "system" });

    const after = await overview();
    assert.equal(Number(after.kpis.captured_7d_sar), Number(before.kpis.captured_7d_sar) + 100);
    assert.equal(Number(after.kpis.platform_share_7d_sar), Number(before.kpis.platform_share_7d_sar) + 10);
    assert.equal(after.kpis.bookings_today, before.kpis.bookings_today + 1);
    assert.equal(after.kpis.completed_30d, before.kpis.completed_30d + 1);
    assert.equal(after.kpis.finished_30d, before.kpis.finished_30d + 3, "expired unpaid holds are not counted as finished visits");
    const customers = (await sys(db, `select count(*)::int n from profiles where role = 'customer'`))[0].n;
    assert.equal(after.kpis.customers, customers);
  });

  it("stops counting a suspended provider as live", async () => {
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider1]);
    const before = await overview();
    await as(db, admin, `update providers set status = 'suspended' where id = $1`, [SEED.provider1]);
    const verified = (await sys(db, `select is_verified from providers where id = $1`, [SEED.provider1]))[0].is_verified;
    assert.equal(verified, false, "suspension clears the verified flag search and booking rely on");
    const after = await overview();
    assert.equal(after.kpis.live_providers, before.kpis.live_providers - 1);
    await as(db, admin, `update providers set status = 'active' where id = $1`, [SEED.provider1]);
    assert.equal((await overview()).kpis.live_providers, before.kpis.live_providers);
  });
});

describe("operator refund retry", () => {
  let seq = 0;
  async function refund({ status = "failed", attempts = 5 } = {}) {
    seq += 1;
    const ledger = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                     values ($1, 'package_sale', $2, 120, 12, 108, 'pending') returning id`, [SEED.provider1, `chg_retry_${seq}`]))[0].id;
    return (await sys(db, `insert into refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, attempts, idempotency_key)
                     values ($1, $2, 40, 'Gateway refused', 'admin', $3, $4, $5) returning id`,
      [ledger, `chg_retry_${seq}`, status, attempts, `retry-${seq}`]))[0].id;
  }

  it("is admin-only and needs a reason", async () => {
    const id = await refund();
    await expectError(as(db, owner, `select admin_retry_refund_request($1, 'Card reissued')`, [id]), /Administrator access required/);
    await expectError(as(db, customer, `select admin_retry_refund_request($1, 'Card reissued')`, [id]), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_retry_refund_request($1, 'Card reissued')`, [id]), /permission denied/);
    await expectError(as(db, admin, `select admin_retry_refund_request($1, ' ')`, [id]), /reason/);
  });

  it("re-opens a refund that ran out of attempts for exactly one more, and audits who asked", async () => {
    const id = await refund({ attempts: 5 });
    const r = (await as(db, admin, `select admin_retry_refund_request($1, 'Customer confirmed the card is active') r`, [id]))[0].r;
    assert.equal(r.reopened, true);
    assert.equal((await sys(db, `select attempts from refund_requests where id = $1`, [id]))[0].attempts, 4,
      "process-refund may claim it once more");
    const audit = (await sys(db, `select actor_id, details from admin_audit_logs where action = 'refund.retry_requested' and target_id = $1`, [id]))[0];
    assert.equal(audit.actor_id, admin.sub);
    assert.equal(audit.details.reason, "Customer confirmed the card is active");
    assert.equal(audit.details.reopened, true);
  });

  it("leaves attempts alone while automatic retries remain, and refuses finished refunds", async () => {
    const pending = await refund({ status: "pending", attempts: 1 });
    const r = (await as(db, admin, `select admin_retry_refund_request($1, 'Customer is waiting') r`, [pending]))[0].r;
    assert.equal(r.reopened, false);
    assert.equal((await sys(db, `select attempts from refund_requests where id = $1`, [pending]))[0].attempts, 1);
    const done = await refund({ status: "succeeded", attempts: 1 });
    await expectError(as(db, admin, `select admin_retry_refund_request($1, 'Again please')`, [done]), /cannot be retried/);
    const busy = await refund({ status: "processing", attempts: 1 });
    await expectError(as(db, admin, `select admin_retry_refund_request($1, 'Again please')`, [busy]), /cannot be retried/);
  });
});
