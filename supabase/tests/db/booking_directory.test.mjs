import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// The Bookings screen reads one server-computed page of bookings (admin_booking_directory), so an operator can find
// a booking from any month and the totals describe every booking that matches, not only the page on screen.
let db;
let admin;
let svc;
let layla;
let omar;
const owner = ROLES.user(SEED.owner1);
const customerRole = ROLES.user(SEED.customer);

const directory = async (args = {}) => {
  const { search = null, status = null, from = null, to = null, limit = 25, offset = 0 } = args;
  return (await as(db, admin, `select admin_booking_directory($1, $2, $3::date, $4::date, $5, $6) d`, [search, status, from, to, limit, offset]))[0].d;
};
const auditRows = (action) => sys(db, `select actor_id, details from admin_audit_logs where action = $1 order by created_at`, [action]);

let step = 0;
async function booking(customerId, status, { price = 100, at } = {}) {
  step += 1;
  return (await sys(db, `
    insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                          subtotal_price, total_price, platform_commission, tax_amount, deposit_required)
    values ($1, $2, $3, $4, $5::booking_status, ${at ?? `now() - make_interval(days => ${20 + step * 3})`}, 30, 100, $6::numeric, 10, 15, 0) returning id, invoice_number`,
    [customerId, SEED.branch1, SEED.employee1, svc.id, status, price]))[0];
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  layla = await createUser(db, { role: "customer", phone: "+966511110001", verified: false });
  omar = await createUser(db, { role: "customer", phone: "+966511110002", verified: true });
  await sys(db, `update profiles set first_name = 'Layla', last_name = 'Alharbi', email = 'layla.a@example.com' where id = $1`, [layla]);
  await sys(db, `update profiles set first_name = 'Omar', last_name = 'Khan', email = 'omar.k@example.com' where id = $1`, [omar]);
});

describe("booking directory", () => {
  it("is for administrators only", async () => {
    await expectError(as(db, owner, `select admin_booking_directory(null, null, null, null, 25, 0)`), /Administrator access required/);
    await expectError(as(db, customerRole, `select admin_booking_directory(null, null, null, null, 25, 0)`), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_booking_directory(null, null, null, null, 25, 0)`), /permission denied/);
  });

  it("totals describe every matching booking, however many fit on a page", async () => {
    for (let i = 0; i < 6; i += 1) await booking(layla, "completed", { price: 100 + i });
    await booking(omar, "cancelled", { price: 70 });
    const all = await directory({ limit: 2 });
    assert.equal(all.rows.length, 2, "the page is clamped to what was asked");
    assert.equal(Number(all.matching), 7);
    assert.equal(Number(all.total_value), 100 + 101 + 102 + 103 + 104 + 105 + 70);
    assert.equal(Number(all.total_commission), 70);
    const completed = await directory({ status: "completed", limit: 3 });
    assert.equal(Number(completed.matching), 6);
    assert.equal(Number(completed.active), 0);
  });

  it("returns at most 100 rows however large a page is asked for, and never a negative offset", async () => {
    assert.ok((await directory({ limit: 5000 })).rows.length <= 100);
    assert.equal((await directory({ limit: -4, offset: -9 })).rows.length, 1, "a negative limit becomes one row and a negative offset zero");
  });

  it("pages in a stable order without overlap", async () => {
    const first = (await directory({ limit: 3, offset: 0 })).rows.map((r) => r.id);
    const second = (await directory({ limit: 3, offset: 3 })).rows.map((r) => r.id);
    assert.equal(new Set([...first, ...second]).size, 6);
    const times = (await directory({ limit: 7 })).rows.map((r) => new Date(r.scheduled_at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a), "newest first");
  });

  it("finds a booking by its ID, its invoice number, the customer or the provider", async () => {
    const target = await booking(omar, "confirmed", { price: 250, at: "now() - interval '200 days'" });
    // Fixture as the table owner: the invoice number is frozen for every writer after creation (GOV-1 review C-2).
    await sys(db, `alter table bookings disable trigger protect_booking_immutable_fields_before_update`);
    await sys(db, `update bookings set invoice_number = 70123 where id = $1`, [target.id]);
    await sys(db, `alter table bookings enable trigger protect_booking_immutable_fields_before_update`);
    target.invoice_number = 70123;
    assert.deepEqual((await directory({ search: target.id })).rows.map((r) => r.id), [target.id], "the full booking ID, however old");
    assert.deepEqual((await directory({ search: `#${target.invoice_number}` })).rows.map((r) => r.id), [target.id], "the invoice number");
    assert.ok((await directory({ search: "omar.k@example" })).rows.some((r) => r.id === target.id), "the customer's email");
    assert.ok((await directory({ search: "khan" })).rows.some((r) => r.id === target.id), "the customer's name");
    assert.ok((await directory({ search: "+966511110002" })).rows.some((r) => r.id === target.id), "the customer's phone");
    const providerName = (await sys(db, `select business_name_en n from providers where id = $1`, [SEED.provider1]))[0].n;
    assert.ok((await directory({ search: providerName.slice(0, 5) })).matching > 0, "the provider's name");
    assert.equal(Number((await directory({ search: "%" })).matching), 0, "a percent sign is not a wildcard");
    assert.equal(Number((await directory({ search: "no such customer" })).matching), 0);
  });

  it("filters by Riyadh calendar date", async () => {
    // 22:30 UTC on 31 August is 01:30 on 1 September in Riyadh.
    const late = await booking(layla, "completed", { at: "timestamptz '2025-08-31 22:30:00+00'" });
    assert.deepEqual((await directory({ from: "2025-09-01", to: "2025-09-01" })).rows.map((r) => r.id), [late.id]);
    assert.equal(Number((await directory({ from: "2025-08-31", to: "2025-08-31" })).matching), 0);
  });

  it("refuses an unknown status and a start date after the end date, and says what", async () => {
    await expectError(directory({ status: "paid" }), /Unknown booking status/);
    await expectError(directory({ from: "2026-02-01", to: "2026-01-01" }), /start date is after/);
  });

  it("records every listing as a privileged read, with the administrator and the page, and no search text", async () => {
    const before = (await auditRows("bookings.listed")).length;
    await directory({ search: "layla.a@example.com", status: "completed", limit: 10, offset: 20 });
    const rows = await auditRows("bookings.listed");
    assert.equal(rows.length, before + 1);
    const row = rows.at(-1);
    assert.equal(row.actor_id, admin.sub);
    // SECFIX-2 R2-M6: the search is recorded as its SHA-256, with the purpose and the ids of the bookings returned.
    assert.match(row.details.filter.search_sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual([row.details.filter.status, row.details.filter.limit, row.details.filter.offset], ["completed", 10, 20]);
    assert.ok(row.details.purpose);
    assert.ok(!JSON.stringify(row.details).includes("layla"), "an email typed into the search box never enters the audit log");
  });
});
