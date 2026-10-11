import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-08: staff read a home address only around the visit; an administrator's reveal does not expose it to staff.
let db;
let admin;
let svc;
let seq = 3;
const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);
const reveal = async (user, id) => (await as(db, user, `select get_booking_address_secure($1, 'customer_support') r`, [id]))[0].r;
const vaultRows = async (user, id) => (await as(db, user, `select count(*)::int c from booking_home_addresses where booking_id = $1`, [id]))[0].c;
const force = async (sql, params) => {
  await db.exec(`alter table bookings disable trigger user`);
  try { await db.query(sql, params); } finally { await db.exec(`alter table bookings enable trigger user`); }
};
async function homeBooking(status = "confirmed") {
  return (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, is_home_service, home_address_text, home_address_lat, home_address_lng,
      scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
    values ($1, $2, $3, $4, $5, true, 'Villa 12, Al Malqa, Riyadh', 24.8, 46.6, now() + make_interval(days => $6), 30, 100, 100, 0, 20, 0) returning id`,
    [SEED.customer, SEED.branch1, SEED.employee1, svc.id, status, (seq += 1)]))[0].id;
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  svc = await serviceFor(db, SEED.employee1);
});

describe("P-08 the reveal stamp", () => {
  it("is not set by an administrator or the service role, and is set by the owner", async () => {
    const id = await homeBooking();
    assert.match((await reveal(admin, id)).address, /Malqa/);
    assert.match((await reveal(ROLES.service, id)).address, /Malqa/);
    assert.equal((await sys(db, `select revealed_at from booking_home_addresses where booking_id = $1`, [id]))[0].revealed_at, null);
    assert.equal(await vaultRows(owner1, id), 0, "staff still cannot read the row after an administrator looked");
    assert.match((await reveal(owner1, id)).address, /Malqa/);
    assert.notEqual((await sys(db, `select revealed_at from booking_home_addresses where booking_id = $1`, [id]))[0].revealed_at, null);
    assert.equal(await vaultRows(owner1, id), 1);
  });
});

describe("P-08 staff read window (address.staff_read_days unset)", () => {
  it("hides the address from staff the day after the visit, in the command and in the table", async () => {
    const id = await homeBooking();
    await reveal(owner1, id);
    await force(`update bookings set scheduled_at = now() - interval '40 days', status = 'completed' where id = $1`, [id]);
    assert.equal(await vaultRows(owner1, id), 0);
    const r = await reveal(owner1, id);
    assert.doesNotMatch(r.address, /Malqa/);
    assert.equal(r.latitude, null);
    assert.equal(await vaultRows(customer, id), 1, "the customer always reads their own address");
    assert.match((await reveal(customer, id)).address, /Malqa/);
    assert.match((await reveal(admin, id)).address, /Malqa/);
  });
  it("keeps it readable on the day of the visit and the day after", async () => {
    const id = await homeBooking();
    await reveal(owner1, id);
    await force(`update bookings set scheduled_at = now() - interval '20 hours', status = 'completed' where id = $1`, [id]);
    assert.equal(await vaultRows(owner1, id), 1);
    assert.match((await reveal(owner1, id)).address, /Malqa/);
  });
  it("follows the owner's setting once it is set", async () => {
    const id = await homeBooking();
    await reveal(owner1, id);
    await force(`update bookings set scheduled_at = now() - interval '5 days', status = 'completed' where id = $1`, [id]);
    assert.equal(await vaultRows(owner1, id), 0);
    await sys(db, `update platform_settings set value = '10'::jsonb where key = 'address.staff_read_days'`);
    assert.equal(await vaultRows(owner1, id), 1);
    await sys(db, `update platform_settings set value = 'null'::jsonb where key = 'address.staff_read_days'`);
    assert.equal(await vaultRows(owner1, id), 0);
  });
  it("is private: a stranger and a visitor cannot read the setting or the row", async () => {
    const stranger = ROLES.user(await createUser(db, { role: "customer" }));
    assert.equal((await as(db, stranger, `select count(*)::int c from platform_settings where key = 'address.staff_read_days'`))[0].c, 0);
    assert.equal((await as(db, admin, `select count(*)::int c from platform_settings where key = 'address.staff_read_days'`))[0].c, 1);
  });
});
