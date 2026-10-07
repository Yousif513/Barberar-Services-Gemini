import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// C-D17: numeric tests for the report definitions (first-time against repeat inside the range, per-service revenue of a multi-service
// booking, Asia/Riyadh dates).

let db;
let svc1;
let svc2;
let a;
let b;
let c;
const owner = ROLES.user(SEED.owner1);

const visit = async (customer, ts, { price = 100, commission = 10, service = svc1 } = {}) => {
  const [row] = await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
    values ($1, $2, $3, $4, 'completed', $5::timestamptz, 30, $6, $6, 0, 0, $7) returning id`,
    [customer.sub, SEED.branch1, SEED.employee1, service.id, ts, price, commission]);
  return row.id;
};
const analytics = async (from, to) => (await as(db, owner, `select get_provider_detailed_analytics($1, $2::date, $3::date) r`, [SEED.provider1, from, to]))[0].r;

before(async () => {
  db = await createMigratedDb();
  svc1 = await serviceFor(db, SEED.employee1, 0);
  svc2 = await serviceFor(db, SEED.employee1, 1);
  [a, b, c] = await Promise.all([1, 2, 3].map(async () => ROLES.user(await createUser(db))));
  // client A: a visit before June 2025 and one in June (a returning client); client B: first visit in June, two visits in the month;
  // client C: only a visit before June (not a client of the range at all)
  await visit(a, "2025-04-10T09:00:00Z");
  await visit(a, "2025-06-05T09:00:00Z");
  await visit(b, "2025-06-06T09:00:00Z");
  await visit(b, "2025-06-20T09:00:00Z");
  await visit(c, "2025-05-02T09:00:00Z");
});

describe("first-time against repeat clients", () => {
  it("counts a client as first-time only when the first completed visit ever falls inside the range", async () => {
    const june = await analytics("2025-06-01", "2025-06-30");
    assert.equal(june.first_time_clients, 1, "B");
    assert.equal(june.repeat_clients, 1, "A");
    assert.equal(june.repeat_rate_pct, 50);
    assert.equal(june.unique_clients, 2);
  });

  it("changes with the range: in April only A is first-time, in May only C", async () => {
    const april = await analytics("2025-04-01", "2025-04-30");
    assert.deepEqual([april.first_time_clients, april.repeat_clients], [1, 0]);
    const may = await analytics("2025-05-01", "2025-05-31");
    assert.deepEqual([may.first_time_clients, may.repeat_clients], [1, 0]);
    const quarter = await analytics("2025-04-01", "2025-06-30");
    assert.deepEqual([quarter.first_time_clients, quarter.repeat_clients], [3, 0], "all three began inside the quarter");
    const empty = await analytics("2024-01-01", "2024-01-31");
    assert.deepEqual([empty.first_time_clients, empty.repeat_clients, empty.repeat_rate_pct], [0, 0, 0]);
  });
});

describe("popular services of a multi-service booking", () => {
  it("credits each service with its own count and price", async () => {
    const booking = await visit(a, "2025-07-08T09:00:00Z", { price: 115, commission: 10, service: svc1 });
    await sys(db, `insert into booking_services (booking_id, service_id, employee_id, sequence_order, duration_minutes, price) values ($1, $2, $4, 1, 30, 60), ($1, $3, $4, 2, 30, 40)`,
      [booking, svc1.id, svc2.id, SEED.employee1]);
    const july = await analytics("2025-07-01", "2025-07-31");
    const byService = Object.fromEntries(july.popular_services.map((s) => [s.service_id, s]));
    assert.deepEqual([byService[svc1.id].bookings_count, Number(byService[svc1.id].revenue_sar)], [1, 60]);
    assert.deepEqual([byService[svc2.id].bookings_count, Number(byService[svc2.id].revenue_sar)], [1, 40]);
    assert.equal(Number(july.gross_revenue_sar), 115, "the headline revenue is still the booking total");
  });

  it("falls back to the booking's own service and total when it has no lines", async () => {
    await visit(b, "2025-08-04T09:00:00Z", { price: 80, service: svc2 });
    const august = await analytics("2025-08-01", "2025-08-31");
    assert.deepEqual(august.popular_services.map((s) => [s.service_id, s.bookings_count, Number(s.revenue_sar)]), [[svc2.id, 1, 80]]);
  });
});

describe("Riyadh dates in the multi-branch summary", () => {
  it("puts a visit at 01:30 Riyadh time on the 1st in the new month, not the previous one", async () => {
    // 2025-09-30 22:30 UTC is 2025-10-01 01:30 in Riyadh
    await visit(c, "2025-09-30T22:30:00Z", { price: 70 });
    const summary = async (from, to) => (await as(db, owner, `select get_provider_multi_branch_summary($1, $2::date, $3::date) r`, [SEED.provider1, from, to]))[0].r;
    const revenue = (r) => Number(r.branches.find((x) => x.branch_id === SEED.branch1).revenue_sar);
    assert.equal(revenue(await summary("2025-09-01", "2025-09-30")), 0);
    assert.equal(revenue(await summary("2025-10-01", "2025-10-31")), 70);
  });

  it("is refused to everybody but the owner or an administrator", async () => {
    for (const actor of [ROLES.anon, ROLES.user(SEED.owner2), a]) {
      await expectError(as(db, actor, `select get_provider_multi_branch_summary($1, '2025-01-01', '2025-12-31')`, [SEED.provider1]), /permission denied|Forbidden|Authentication/i);
      await expectError(as(db, actor, `select get_provider_detailed_analytics($1, '2025-01-01', '2025-12-31')`, [SEED.provider1]), /permission denied|Not authorized/i);
    }
  });
});
