// FIX-MONEY: M-04 (commission of a booking completed after its month's invoice) and M-05 (invoice number collision).
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

const owner1 = ROLES.user(SEED.owner1);
const PROVIDER2_EMPLOYEE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
let db;
const lm = `(date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') - interval '1 month')`;

before(async () => {
  db = await createMigratedDb();
});

const insertBooking = async (customerId, branch, employee, svcId, status, hours, commission) => (await sys(db,
  `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
     tax_amount, deposit_required, platform_commission)
   values ($1, $2, $3, $4, $5, ${lm} + make_interval(hours => $6::int), 30, 100, 100, 0, 0, $7) returning id`,
  [customerId, branch, employee, svcId, status, hours, commission]))[0].id;
const issue = () => as(db, ROLES.service, `select issue_monthly_fee_invoices() r`).then((r) => r[0].r);

describe("M-04 / M-05: monthly fee invoices", () => {
  it("M-04: a booking completed after its month's invoice was issued is billed on a supplementary invoice, once", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const customer = ROLES.user(await createUser(db));
    await insertBooking(customer.sub, SEED.branch1, SEED.employee1, svc.id, "completed", 10, 20);
    const late = await insertBooking(customer.sub, SEED.branch1, SEED.employee1, svc.id, "confirmed", 30, 40);
    await issue();
    const original = (await sys(db, `select id, invoice_number, platform_commission_sar::float8 c, total_bookings_count n from provider_fee_invoices where provider_id = $1`, [SEED.provider1]))[0];
    assert.equal(original.c, 20);
    await as(db, owner1, `select employee_update_booking_status($1, 'completed', 'late completion')`, [late]);
    const second = await issue();
    assert.ok(second.issued >= 1, "the supplementary invoice counts as issued");
    const rows = await sys(db, `select id, supplement_no, invoice_number, platform_commission_sar::float8 c, total_bookings_count n from provider_fee_invoices where provider_id = $1 order by supplement_no`, [SEED.provider1]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, original.id);
    assert.equal(rows[0].c, 20, "the issued invoice is never rewritten");
    assert.equal(rows[1].supplement_no, 1);
    assert.equal(rows[1].c, 40);
    assert.equal(rows[1].n, 1);
    assert.match(rows[1].invoice_number, /-S1$/);
    assert.equal((await sys(db, `select fee_invoice_id from bookings where id = $1`, [late]))[0].fee_invoice_id, rows[1].id);
    // nothing is billed twice
    await issue();
    await issue();
    assert.equal((await sys(db, `select coalesce(sum(platform_commission_sar), 0)::float8 c, count(*)::int n from provider_fee_invoices where provider_id = $1`, [SEED.provider1]))[0].c, 60);
    assert.equal((await sys(db, `select count(*)::int n from provider_fee_invoices where provider_id = $1`, [SEED.provider1]))[0].n, 2);
  });

  it("M-04: an unbilled completed booking of an earlier month is carried into the next run", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const customer = ROLES.user(await createUser(db));
    const old = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
         tax_amount, deposit_required, platform_commission)
       values ($1, $2, $3, $4, 'completed', ${lm} - interval '40 days', 30, 100, 100, 0, 0, 33) returning id`,
      [customer.sub, SEED.branch1, SEED.employee1, svc.id]))[0].id;
    await issue();
    const row = (await sys(db, `select f.platform_commission_sar::float8 c from bookings b join provider_fee_invoices f on f.id = b.fee_invoice_id where b.id = $1`, [old]))[0];
    assert.equal(row.c, 33, "the old booking is billed by the first invoice run that sees it");
  });

  it("M-05: two providers whose ids share the first 8 hex characters each get their own fee invoice", async () => {
    const svc2 = await serviceFor(db, PROVIDER2_EMPLOYEE);
    const branch2 = (await sys(db, `select branch_id from employees where id = $1`, [PROVIDER2_EMPLOYEE]))[0].branch_id;
    const customer = ROLES.user(await createUser(db));
    await insertBooking(customer.sub, branch2, PROVIDER2_EMPLOYEE, svc2.id, "completed", 12, 25);
    await issue();
    const rows = await sys(db, `select provider_id, invoice_number, platform_commission_sar::float8 c from provider_fee_invoices where provider_id = $1`, [SEED.provider2]);
    assert.equal(rows.length, 1, "provider 2 shares the prefix 'aaaaaaaa' with provider 1; its invoice is no longer dropped");
    assert.equal(rows[0].c, 25);
    assert.ok(rows[0].invoice_number.includes(SEED.provider2.replace(/-/g, "")), "the number carries the whole provider id");
  });

  it("the invoice identity (provider, month, supplement) is unique", async () => {
    await assert.rejects(sys(db,
      `insert into provider_fee_invoices (provider_id, invoice_number, period_start, period_end, supplement_no)
       select provider_id, 'FEE-DUP-1', period_start, period_end, supplement_no from provider_fee_invoices where provider_id = $1 limit 1`, [SEED.provider1]),
    /duplicate key|unique/i);
  });
});
