import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-02: consent status is not an oracle, and reviews do not publish who wrote them.
let db;
let customer;
let customer2;
let admin;
const owner = ROLES.user(SEED.owner1);
const force = async (sql, params) => {
  await db.exec(`alter table bookings disable trigger user`);
  try { await db.query(sql, params); } finally { await db.exec(`alter table bookings enable trigger user`); }
};
async function makeBooking(user) {
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 3);
  const [slot] = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
  const [b] = await as(db, user, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slot.slot_start]);
  if (b.status === "pending_payment") await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_${b.id}`, b.deposit_required]);
  return b;
}

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer" }));
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  await as(db, customer, `select record_consent('marketing', 'granted', 'v1.0', 'web_form')`);
});

describe("P-02 has_active_consent", () => {
  it("answers the person themself", async () => {
    assert.equal((await as(db, customer, `select has_active_consent($1, 'marketing') ok`, [customer.sub]))[0].ok, true);
    assert.equal((await as(db, customer2, `select has_active_consent($1, 'marketing') ok`, [customer2.sub]))[0].ok, false);
  });
  it("refuses another signed-in user, a provider owner, and a visitor", async () => {
    await assert.rejects(as(db, customer2, `select has_active_consent($1, 'marketing')`, [customer.sub]), /not authorized/i);
    await assert.rejects(as(db, owner, `select has_active_consent($1, 'health_data')`, [customer.sub]), /not authorized/i);
    await assert.rejects(as(db, ROLES.anon, `select has_active_consent($1, 'marketing')`, [customer.sub]), /permission denied/i);
  });
  it("answers an administrator and the service role", async () => {
    assert.equal((await as(db, admin, `select has_active_consent($1, 'marketing') ok`, [customer.sub]))[0].ok, true);
    assert.equal((await as(db, ROLES.service, `select has_active_consent($1, 'marketing') ok`, [customer.sub]))[0].ok, true);
  });
});

describe("P-02 reviews reviewer identity", () => {
  let booking;
  before(async () => {
    booking = await makeBooking(customer);
    await force(`update bookings set scheduled_at = now() - interval '2 days', status = 'completed' where id = $1`, [booking.id]);
    await as(db, customer, `insert into reviews (booking_id, customer_id, rating, comment) values ($1, $2, 5, 'ok')`, [booking.id, customer.sub]);
    await sys(db, `update profiles set first_name = 'Noura', last_name = 'Alharbi' where id = $1`, [customer.sub]);
  });
  it("hides customer_id, booking_id and moderated_by from visitors, keeps the public columns", async () => {
    await assert.rejects(as(db, ROLES.anon, `select customer_id from reviews`), /permission denied/);
    await assert.rejects(as(db, ROLES.anon, `select booking_id from reviews`), /permission denied/);
    await assert.rejects(as(db, ROLES.anon, `select moderated_by from reviews`), /permission denied/);
    const rows = await as(db, ROLES.anon, `select id, rating, comment, provider_id from reviews`);
    assert.ok(rows.length >= 1);
  });
  it("serves a public reviewer display without any identifier", async () => {
    const rows = await as(db, ROLES.anon, `select * from public_provider_reviews($1, 20)`, [SEED.provider1]);
    assert.ok(rows.length >= 1);
    const row = rows.find((r) => r.comment === "ok");
    assert.equal(row.reviewer_first_name, "Noura");
    assert.equal(row.reviewer_last_initial, "A.");
    assert.deepEqual(Object.keys(row).filter((k) => /customer|booking|moderated|profile/.test(k)), []);
  });
  it("still lets the customer, the owner and an administrator read their reviews", async () => {
    assert.ok((await as(db, customer, `select customer_id, booking_id from reviews where customer_id = $1`, [customer.sub])).length >= 1);
    assert.ok((await as(db, owner, `select id from reviews where provider_id = $1`, [SEED.provider1])).length >= 1);
    assert.ok((await as(db, admin, `select moderated_by from reviews`)).length >= 1);
  });
});
