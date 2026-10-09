import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// R19: provider fee invoices are issued for closed months only, never rewritten, billed by a scheduler-callable batch and
// marked paid by an administrator.

let db;
let admin;
let customer;
let svc;
const owner = ROLES.user(SEED.owner1);
const lastMonthSql = `(((date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '5 days') + interval '12 hours') AT TIME ZONE 'Asia/Riyadh')`;
const lastMonth = async () => (await sys(db, `select to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 month', 'YYYY-MM-DD') d`))[0].d;
const thisMonth = async () => (await sys(db, `select to_char(date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM-DD') d`))[0].d;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
  for (const commission of [20, 30]) {
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
        tax_amount, deposit_required, platform_commission)
      values ($1, $2, $3, $4, 'completed', ${lastMonthSql} + make_interval(mins => $6::int), 30, 100, 100, 0, 0, $5)`,
      [customer.sub, SEED.branch1, SEED.employee1, svc.id, commission, commission]);
  }
});

const generate = (actor, month) => as(db, actor, `select generate_provider_monthly_fee_invoice($1, $2::date) r`, [SEED.provider1, month]).then((r) => r[0].r);

describe("generate_provider_monthly_fee_invoice", () => {
  it("refuses the current, an open and a missing month", async () => {
    await expectError(generate(admin, await thisMonth()), /closed month/);
    await expectError(generate(admin, null), /closed month/);
  });

  it("issues a closed month once and never rewrites it, not even a paid one", async () => {
    const month = await lastMonth();
    const first = await generate(admin, month);
    assert.equal(Number(first.commission_sar), 50);
    assert.equal(first.already_issued, undefined);
    const [{ status }] = await sys(db, `select status from provider_fee_invoices where id = $1`, [first.invoice_id]);
    assert.equal(status, "issued");

    const paid = (await as(db, admin, `select admin_mark_fee_invoice_paid($1, 'bank_transfer', 'Transfer received on the statement') r`, [first.invoice_id]))[0].r;
    assert.equal(paid.status, "paid");
    // more activity arrives after the invoice was issued: the invoice must not change
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
      values ($1, $2, $3, $4, 'completed', ${lastMonthSql} + interval '7 hours', 30, 100, 100, 0, 0, 40)`, [customer.sub, SEED.branch1, SEED.employee1, svc.id]);
    // FIX-MONEY M-04: the issued invoice is untouched; the new activity is billed on a supplementary invoice of the same month, once.
    const again = await generate(admin, month);
    assert.equal(again.already_issued, undefined);
    assert.notEqual(again.invoice_id, first.invoice_id);
    assert.equal(Number(again.commission_sar), 40);
    const repeat = await generate(admin, month);
    assert.equal(repeat.already_issued, true);
    assert.equal(repeat.invoice_id, again.invoice_id);
    const [row] = await sys(db, `select status, platform_commission_sar::float8 c, paid_at is not null as has_paid_at, (select count(*)::int from provider_fee_invoices where provider_id = $1) n from provider_fee_invoices where id = $2`, [SEED.provider1, first.invoice_id]);
    assert.deepEqual(row, { status: "paid", c: 50, has_paid_at: true, n: 2 });
  });

  it("is refused to every non-administrator role", async () => {
    const month = await lastMonth();
    await expectError(generate(ROLES.anon, month), /permission denied|Only administrators/i);
    await expectError(generate(customer, month), /Only administrators/);
    await expectError(generate(owner, month), /Only administrators/);
    await expectError(generate(ROLES.user(SEED.owner2), month), /Only administrators/);
  });
});

describe("issue_monthly_fee_invoices and admin_mark_fee_invoice_paid", () => {
  it("bills the last closed month for providers with completed bookings, and a second run adds nothing", async () => {
    const month = await lastMonth();
    const run = () => as(db, ROLES.service, `select issue_monthly_fee_invoices() r`).then((r) => r[0].r);
    const first = await run();
    assert.equal(first.month, month.slice(0, 7));
    const second = await run();
    assert.equal(second.issued, 0);
    assert.ok(second.already_issued >= 1);
    assert.equal((await as(db, admin, `select issue_monthly_fee_invoices($1::date) r`, [month]))[0].r.issued, 0);
  });

  it("refuses the batch to everyone but an administrator or the scheduler", async () => {
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(as(db, actor, `select issue_monthly_fee_invoices()`), /permission denied|Only administrators/i);
    }
  });

  it("marks paid with a method and a reason, answers a repeat, and refuses everybody else", async () => {
    const id = (await sys(db, `select id from provider_fee_invoices where provider_id = $1 limit 1`, [SEED.provider1]))[0].id;
    const again = (await as(db, admin, `select admin_mark_fee_invoice_paid($1, 'bank_transfer', 'Repeat of the same confirmation') r`, [id]))[0].r;
    assert.equal(again.already_paid, true);
    await expectError(as(db, admin, `select admin_mark_fee_invoice_paid($1, 'bank_transfer', 'x')`, [id]), /reason/);
    await expectError(as(db, admin, `select admin_mark_fee_invoice_paid($1, 'bank_transfer', 'Unknown invoice')`, [SEED.provider1]), /not found/i);
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(as(db, actor, `select admin_mark_fee_invoice_paid($1, 'cash', 'Not an administrator')`, [id]), /permission denied|Administrator access/i);
    }
    const [log] = await sys(db, `select details from admin_audit_logs where action = 'fee_invoice.paid' and target_id = $1 limit 1`, [id]);
    assert.equal(log.details.reason, "Transfer received on the statement");
  });
});
