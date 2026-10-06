import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// The customer screen reads one server-computed page of customers and changes data requests and phone
// verification only through commands that need the operator's own words.
let db;
let admin;
let svc;
let layla;
let omar;
let omarLookalike;
let noPhone;
const owner = ROLES.user(SEED.owner1);
const customerRole = ROLES.user(SEED.customer);

const overview = async (search = null, limit = 25, offset = 0) =>
  (await as(db, admin, `select admin_customer_overview($1, $2, $3) o`, [search, limit, offset]))[0].o;
const auditRows = (action) => sys(db, `select actor_id, target_id, details from admin_audit_logs where action = $1 order by created_at`, [action]);

let day = 0;
async function booking(customerId, status, { price = 115, cancelledBy = null } = {}) {
  day += 1;
  await sys(db, `
    insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                          subtotal_price, total_price, tax_amount, deposit_required, cancelled_by)
    values ($1, $2, $3, $4, $5::booking_status, now() - make_interval(days => ${60 + day}), 30, 100, $6::numeric, 15, 0, $7)`,
    [customerId, SEED.branch1, SEED.employee1, svc.id, status, price, cancelledBy]);
}

async function profile(user, { first, last, email, createdDaysAgo }) {
  await sys(db, `update profiles set first_name = $2, last_name = $3, email = $4, created_at = now() - make_interval(days => $5::int) where id = $1`,
    [user, first, last, email, createdDaysAgo]);
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  layla = await createUser(db, { role: "customer", phone: "+966511110001", verified: false });
  omar = await createUser(db, { role: "customer", phone: "+966511110002", verified: true });
  omarLookalike = await createUser(db, { role: "customer", phone: "+966511110003", verified: false });
  noPhone = await createUser(db, { role: "customer", phone: null, verified: false });
  await profile(layla, { first: "Layla", last: "Alharbi", email: "layla.a@example.com", createdDaysAgo: 1 });
  await profile(omar, { first: "Omar", last: "Khan", email: "omar_k@example.com", createdDaysAgo: 2 });
  await profile(omarLookalike, { first: "Omar", last: "Xu", email: "omarxk@example.com", createdDaysAgo: 3 });
  await profile(noPhone, { first: "Nada", last: "Saleh", email: "nada@example.com", createdDaysAgo: 4 });
});

describe("customer overview", () => {
  it("is for administrators only", async () => {
    await expectError(as(db, owner, `select admin_customer_overview(null, 25, 0)`), /Administrator access required/);
    await expectError(as(db, customerRole, `select admin_customer_overview(null, 25, 0)`), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_customer_overview(null, 25, 0)`), /permission denied/);
  });

  it("counts visits and completed spend from bookings, leaving out unpaid and system-released holds", async () => {
    await booking(layla, "completed", { price: 115 });
    await booking(layla, "completed", { price: 230 });
    await booking(layla, "confirmed", { price: 99 });
    await booking(layla, "no_show");
    await booking(layla, "cancelled", { cancelledBy: "customer" });
    await booking(layla, "cancelled", { cancelledBy: "system" });
    await booking(layla, "pending_payment");
    const row = (await overview("layla")).rows.find((r) => r.id === layla);
    assert.equal(Number(row.bookings), 5);
    assert.equal(Number(row.completed_bookings), 2);
    assert.equal(Number(row.spend), 345);
    const quiet = (await overview("omar_k")).rows.find((r) => r.id === omar);
    assert.deepEqual([Number(quiet.bookings), Number(quiet.completed_bookings), Number(quiet.spend)], [0, 0, 0], "a customer with no bookings really has none");
  });

  it("returns totals over every customer and one page of the matching ones, newest first", async () => {
    const all = await overview();
    const customers = (await sys(db, `select count(*)::int total, count(*) filter (where phone_verified)::int verified from profiles where role = 'customer'`))[0];
    assert.equal(Number(all.total_customers), customers.total);
    assert.equal(Number(all.verified_customers), customers.verified);
    assert.equal(Number(all.matching), customers.total);
    const first = await overview(null, 1, 0);
    const second = await overview(null, 1, 1);
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 1);
    assert.notEqual(first.rows[0].id, second.rows[0].id);
    assert.equal(Number(first.matching), customers.total, "the match count ignores the page size");
    const ordered = all.rows.map((r) => new Date(r.created_at).getTime());
    assert.deepEqual(ordered, [...ordered].sort((a, b) => b - a), "newest customers come first");
  });

  it("searches names, email and phone, treating % and _ as ordinary characters", async () => {
    assert.deepEqual((await overview("alharbi")).rows.map((r) => r.id), [layla]);
    assert.deepEqual((await overview("Layla Alharbi")).rows.map((r) => r.id), [layla], "first and last name together");
    assert.deepEqual((await overview("0003")).rows.map((r) => r.id), [omarLookalike], "phone");
    const underscore = (await overview("omar_k")).rows.map((r) => r.id);
    assert.deepEqual(underscore, [omar], "an underscore is not a wildcard that would also match omarxk");
    assert.equal(Number((await overview("%")).matching), 0, "a percent sign does not match everything");
  });

  it("finds a customer by ID, so a data request can open the record it concerns", async () => {
    assert.deepEqual((await overview(layla)).rows.map((r) => r.id), [layla], "the full ID");
    assert.deepEqual((await overview(layla.toUpperCase())).rows.map((r) => r.id), [layla], "letter case does not matter");
  });

  it("records each look at customer data without the search text", async () => {
    await overview("layla.a@example.com", 10, 20);
    const row = (await auditRows("customers.listed")).at(-1);
    assert.equal(row.actor_id, admin.sub);
    assert.equal(row.details.searched, true);
    assert.equal(row.details.limit, 10);
    assert.equal(row.details.offset, 20);
    assert.ok(!JSON.stringify(row.details).includes("layla"), "an email typed into the search box never enters the audit log");
    await overview(null, 1000, -5);
    const clamped = (await auditRows("customers.listed")).at(-1);
    assert.equal(clamped.details.limit, 100);
    assert.equal(clamped.details.offset, 0);
  });
});

describe("data-subject requests", () => {
  let request;
  const act = (user, status, note) => as(db, user, `select admin_update_data_request($1, $2, $3) r`, [request, status, note]);

  before(async () => {
    request = (await sys(db, `insert into data_subject_requests (user_id, request_type, status, due_date)
                              values ($1, 'export', 'pending', current_date + 20) returning id`, [layla]))[0].id;
  });

  it("are for administrators only and need the operator's own note", async () => {
    await expectError(act(owner, "in_progress", "Looking into it"), /Administrator access required/);
    await expectError(act(customerRole, "completed", "Done"), /Administrator access required/);
    await expectError(act(ROLES.anon, "completed", "Done"), /permission denied/);
    await expectError(act(admin, "completed", " "), /note of at least 3 characters/);
    await expectError(act(admin, "pending", "Back to the start"), /started, completed or rejected/);
    await expectError(as(db, admin, `select admin_update_data_request('00000000-0000-4000-8000-000000000998', 'completed', 'Done')`), /not found/);
    assert.equal((await sys(db, `select status from data_subject_requests where id = $1`, [request]))[0].status, "pending");
  });

  it("move through start, complete and reject once, recording who reviewed them and why", async () => {
    await act(admin, "in_progress", "Identity confirmed by phone, export being prepared");
    const started = (await sys(db, `select status, admin_notes, reviewed_by, reviewed_at from data_subject_requests where id = $1`, [request]))[0];
    assert.equal(started.status, "in_progress");
    assert.equal(started.reviewed_by, admin.sub);
    assert.ok(started.reviewed_at);
    await expectError(act(admin, "in_progress", "Again"), /already in_progress/);
    await act(admin, "completed", "Export sent to the customer on 4 October");
    await expectError(act(admin, "rejected", "Changed my mind"), /closed/);
    const audit = (await auditRows("data_subject_requests.update")).filter((r) => r.target_id === request);
    assert.equal(audit.length, 2);
    assert.equal(audit.at(-1).details.reason, "Export sent to the customer on 4 October");
    assert.equal(audit.at(-1).details.changes.status.after, "completed");
  });
});

describe("manual phone verification", () => {
  const set = (user, id, verified, reason) => as(db, user, `select admin_set_phone_verified($1, $2, $3) r`, [id, verified, reason]);

  it("is for administrators only and needs a reason", async () => {
    await expectError(set(owner, layla, true, "Confirmed by phone"), /Administrator access required/);
    await expectError(set(customerRole, layla, true, "Confirmed by phone"), /Administrator access required/);
    await expectError(set(ROLES.anon, layla, true, "Confirmed by phone"), /permission denied/);
    await expectError(set(admin, layla, true, ""), /reason of at least 3 characters/);
    await expectError(set(admin, SEED.owner1, true, "Confirmed by phone"), /Only customer profiles/);
    assert.equal((await sys(db, `select phone_verified from profiles where id = $1`, [layla]))[0].phone_verified, false);
  });

  it("cannot verify a number that does not exist", async () => {
    await expectError(set(admin, noPhone, true, "Confirmed by phone"), /no phone number to verify/);
  });

  it("verifies and revokes with the reason in the audit log, and treats a repeat as a safe retry", async () => {
    const verified = (await set(admin, layla, true, "Customer confirmed the number at the front desk"))[0].r;
    assert.equal(verified.unchanged, false);
    const row = (await sys(db, `select phone_verified, phone_verified_at from profiles where id = $1`, [layla]))[0];
    assert.equal(row.phone_verified, true);
    assert.ok(row.phone_verified_at);
    assert.equal((await set(admin, layla, true, "Same again"))[0].r.unchanged, true);
    await set(admin, layla, false, "Number belongs to someone else");
    const revoked = (await sys(db, `select phone_verified, phone_verified_at from profiles where id = $1`, [layla]))[0];
    assert.deepEqual([revoked.phone_verified, revoked.phone_verified_at], [false, null]);
    const audit = (await auditRows("profiles.update")).filter((r) => r.target_id === layla && r.details.changes?.phone_verified);
    assert.equal(audit.at(-2).details.reason, "Customer confirmed the number at the front desk");
    assert.equal(audit.at(-1).details.reason, "Number belongs to someone else");
  });
});
