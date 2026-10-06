import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMigratedDb, createUser, SEED, serviceFor, sys } from "./harness.mjs";

// The monthly rollups behind the VAT and settlement exports cut months in Riyadh time, not in the database's
// session time zone, so a booking just after midnight on the 1st lands in the month the shop and the tax authority
// see.
let db;
let customer;
let svc;

async function completedBooking(scheduledAt, price) {
  await sys(db, `
    insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                          subtotal_price, total_price, tax_amount, deposit_required)
    values ($1, $2, $3, $4, 'completed', $5::timestamptz, 30, 100, $6::numeric, 15, 0)`,
    [customer, SEED.branch1, SEED.employee1, svc.id, scheduledAt, price]);
}
const months = async () => (await sys(db, `select month_start::text as month, total_bookings::int as bookings, total_sales::numeric as sales from monthly_vat_summary order by month_start`));

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  customer = await createUser(db, { role: "customer" });
});

describe("monthly VAT summary", () => {
  it("puts a booking after midnight Riyadh time on the 1st in the new month", async () => {
    // 22:30 UTC on 31 August is 01:30 on 1 September in Riyadh.
    await completedBooking("2026-08-31T22:30:00Z", 115);
    // 20:30 UTC on 31 August is 23:30 on 31 August in Riyadh.
    await completedBooking("2026-08-31T20:30:00Z", 230);
    const rows = await months();
    assert.deepEqual(rows.map((r) => [r.month, r.bookings, Number(r.sales)]), [
      ["2026-08-01", 1, 230],
      ["2026-09-01", 1, 115],
    ]);
  });
});
