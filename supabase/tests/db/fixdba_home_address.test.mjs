import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// R12: the home address of a booking lives in booking_home_addresses and is revealed to staff only after confirmation, by command.

let db;
let admin;
let stranger;
let bookingId;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const vaultRows = async (user, id) => (await as(db, user, `select count(*)::int c from booking_home_addresses where booking_id = $1`, [id]))[0].c;
const reveal = async (user, id) => (await as(db, user, `select get_booking_address_secure($1) r`, [id]))[0].r;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db, { role: "customer" }));
  const svc = await serviceFor(db, SEED.employee1);
  bookingId = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, is_home_service, home_address_text, home_address_lat, home_address_lng,
      scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
    values ($1, $2, $3, $4, 'pending_payment', true, 'Villa 12, Al Malqa, Riyadh', 24.812345, 46.623456, now() + interval '4 days', 30, 100, 100, 0, 20, 0) returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0].id;
});

describe("R12: where the address is stored", () => {
  it("moves what the booking command writes into the vault and leaves the bookings columns empty", async () => {
    const b = (await sys(db, `select home_address_text, home_address_lat, home_address_lng, is_home_service from bookings where id = $1`, [bookingId]))[0];
    assert.deepEqual(b, { home_address_text: null, home_address_lat: null, home_address_lng: null, is_home_service: true });
    const v = (await sys(db, `select address_text, latitude::float8 lat, longitude::float8 lng, revealed_at from booking_home_addresses where booking_id = $1`, [bookingId]))[0];
    assert.deepEqual(v, { address_text: "Villa 12, Al Malqa, Riyadh", lat: 24.812345, lng: 46.623456, revealed_at: null });
  });
  it("holds for the real booking command: create a home booking and its address is in the vault, not on the booking", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 6);
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const id = (await as(db, ROLES.service, `select (booking_create_internal($1, $2, $3, array[$4]::uuid[], $5::timestamptz, true, 24.7, 46.6, 'Flat 4, Olaya St', null, 'web', null, null, 0)).id as id`,
      [SEED.customer, SEED.employee1, SEED.branch1, svc.id, slot]))[0].id;
    const b = (await sys(db, `select home_address_text, home_address_lat from bookings where id = $1`, [id]))[0];
    assert.deepEqual(b, { home_address_text: null, home_address_lat: null });
    assert.equal((await sys(db, `select address_text from booking_home_addresses where booking_id = $1`, [id]))[0].address_text, "Flat 4, Olaya St");
  });
  it("ignores a booking without an address", async () => {
    const svc = await serviceFor(db, SEED.employee2);
    const id = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
      values ($1, $2, $3, $4, 'confirmed', now() + interval '5 days', 30, 100, 100, 0, 0, 0) returning id`, [SEED.customer, SEED.branch1, SEED.employee2, svc.id]))[0].id;
    assert.equal((await sys(db, `select count(*)::int c from booking_home_addresses where booking_id = $1`, [id]))[0].c, 0);
  });
  it("cannot be written, changed or deleted from a client", async () => {
    for (const user of [customer, owner1, admin, ROLES.anon]) {
      assert.equal(await code(as(db, user, `insert into booking_home_addresses (booking_id, address_text) values ($1, 'x')`, [bookingId])), "42501");
      assert.equal(await code(as(db, user, `update booking_home_addresses set address_text = 'x'`)), "42501");
      assert.equal(await code(as(db, user, `delete from booking_home_addresses`)), "42501");
    }
  });
});

describe("R12: before confirmation", () => {
  it("lets the customer read the address, and nobody else (the table, bookings and the command)", async () => {
    assert.equal(await vaultRows(customer, bookingId), 1);
    for (const user of [owner1, owner2, stranger, admin]) assert.equal(await vaultRows(user, bookingId), 0);
    assert.equal(await code(as(db, ROLES.anon, `select 1 from booking_home_addresses`)), "42501");
    const seen = (await as(db, owner1, `select home_address_text, home_address_lat, home_address_lng from bookings where id = $1`, [bookingId]))[0];
    assert.deepEqual(seen, { home_address_text: null, home_address_lat: null, home_address_lng: null }, "the owner sees the booking but no address");
  });
  it("hides the address from the provider in the command and shows the customer their own", async () => {
    const ownerView = await reveal(owner1, bookingId);
    assert.match(ownerView.address, /hidden/i);
    assert.equal(ownerView.latitude, null);
    assert.equal(ownerView.longitude, null);
    const own = await reveal(customer, bookingId);
    assert.equal(own.address, "Villa 12, Al Malqa, Riyadh");
    assert.equal(Number(own.latitude), 24.812345);
    assert.equal((await sys(db, `select revealed_at from booking_home_addresses where booking_id = $1`, [bookingId]))[0].revealed_at, null, "the customer looking is not a reveal to the provider");
  });
  it("answers a stranger as if the booking did not exist", async () => {
    for (const user of [owner2, stranger]) assert.equal(await code(reveal(user, bookingId)), "P0002");
    assert.equal(await code(reveal(ROLES.anon, bookingId)), "42501");
  });
});

describe("R12: after confirmation", () => {
  before(async () => {
    await sys(db, `update bookings set status = 'confirmed' where id = $1`, [bookingId]);
  });
  it("keeps the table closed to staff until the reveal command ran", async () => {
    assert.equal(await vaultRows(owner1, bookingId), 0);
  });
  it("reveals address and coordinates to the owner through the command and stamps the reveal", async () => {
    const r = await reveal(owner1, bookingId);
    assert.equal(r.address, "Villa 12, Al Malqa, Riyadh");
    assert.equal(Number(r.latitude), 24.812345);
    assert.ok((await sys(db, `select revealed_at from booking_home_addresses where booking_id = $1`, [bookingId]))[0].revealed_at);
    assert.equal(await vaultRows(owner1, bookingId), 1, "after the reveal the owner can read the row");
    assert.equal(await vaultRows(owner2, bookingId), 0, "another business still reads nothing");
    assert.equal(await vaultRows(stranger, bookingId), 0);
  });
  it("gives administrators the command, which records the view, and no direct table access", async () => {
    assert.equal(await vaultRows(admin, bookingId), 0);
    const r = await reveal(admin, bookingId);
    assert.equal(r.address, "Villa 12, Al Malqa, Riyadh");
    const audit = await sys(db, `select count(*)::int c from admin_audit_logs where action = 'booking.home_address_viewed' and target_id = $1`, [bookingId]);
    assert.equal(audit[0].c, 1);
    assert.equal((await sys(db, `select details::text d from admin_audit_logs where action = 'booking.home_address_viewed'`))[0].d.includes("Villa"), false, "the address is not copied into the audit log");
  });
  it("closes the table again when the booking is cancelled", async () => {
    await sys(db, `update bookings set status = 'cancelled' where id = $1`, [bookingId]);
    assert.equal(await vaultRows(owner1, bookingId), 0);
    assert.equal(await vaultRows(customer, bookingId), 1, "the customer keeps their own record");
  });
});
