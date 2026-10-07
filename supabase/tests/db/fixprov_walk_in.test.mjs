import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PROV C-D15: counter bookings keep the payment method and a private note, and validate the method.
let db;
let svc;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

const walkIn = (user, { when, method = "cash", notes = null, phone = null, name = "Walk-in Test" } = {}) => as(db, user,
  `select create_walk_in_booking(p_branch_id => $1, p_employee_id => $2, p_service_id => $3, p_customer_name => $4,
      p_customer_phone => $5, p_payment_method => $6, p_scheduled_at => $7::timestamptz, p_notes => $8) r`,
  [SEED.branch1, SEED.employee2, svc.id, name, phone, method, when, notes]).then((rows) => rows[0].r);

const day = (n) => `now() + interval '${n} days'`;
const future = async (n) => (await sys(db, `select (date_trunc('hour', ${day(n)}))::text t`))[0].t;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee2);
});

describe("create_walk_in_booking keeps method and notes (C-D15)", () => {
  it("stores the chosen payment method and a private note for the provider's staff", async () => {
    const r = await walkIn(owner1, { when: await future(11), method: "mada", notes: "Prefers the quiet chair" });
    assert.equal(r.success, true);
    const row = (await sys(db, `select payment_method, notes, provider_id from walk_in_booking_details where booking_id = $1`, [r.booking_id]))[0];
    assert.equal(row.payment_method, "mada");
    assert.equal(row.notes, "Prefers the quiet chair");
    assert.equal(row.provider_id, SEED.provider1);
    const seen = await as(db, owner1, `select booking_id from walk_in_booking_details where booking_id = $1`, [r.booking_id]);
    assert.equal(seen.length, 1);
  });

  it("defaults to cash and stores no note when none is given", async () => {
    const r = await walkIn(owner1, { when: await future(12) });
    const row = (await sys(db, `select payment_method, notes from walk_in_booking_details where booking_id = $1`, [r.booking_id]))[0];
    assert.deepEqual(row, { payment_method: "cash", notes: null });
  });

  it("keeps the note off the booking row the linked customer can read", async () => {
    const phone = "+966500009911";
    const linked = await createUser(db, { role: "customer", phone, verified: true });
    const r = await walkIn(owner1, { when: await future(13), phone, notes: "private staff note" });
    assert.equal(r.linked_customer, true);
    const own = await as(db, ROLES.user(linked), `select * from bookings where id = $1`, [r.booking_id]);
    assert.equal(own.length, 1, "the customer sees their booking");
    assert.ok(!JSON.stringify(own[0]).includes("private staff note"));
    assert.deepEqual(await as(db, ROLES.user(linked), `select * from walk_in_booking_details`), []);
  });

  it("refuses an unknown, disabled or non-counter payment method", async () => {
    for (const method of ["bitcoin", "tamara", "wallet", "bank_transfer", "", null]) {
      await expectError(walkIn(owner1, { when: await future(14), method }), /Choose an available payment method/);
    }
  });

  it("refuses a note longer than 500 characters", async () => {
    await expectError(walkIn(owner1, { when: await future(15), notes: "x".repeat(501) }), /at most 500/);
  });

  it("refuses a second booking at the same time for the same professional", async () => {
    const when = await future(16);
    await walkIn(owner1, { when });
    await expectError(walkIn(owner1, { when }), /already has a booking/);
  });

  it("is refused for anonymous visitors, customers and another provider's owner", async () => {
    const when = await future(17);
    await assert.rejects(walkIn(ROLES.anon, { when }), (e) => /permission denied|Not authorized|Authentication/i.test(e.message));
    await expectError(walkIn(customer, { when }), /Not authorized/);
    await expectError(walkIn(owner2, { when }), /Not authorized/);
  });

  it("shows the details only to the owner, a booking manager or an administrator, never to a stylist, another provider, a customer or a visitor", async () => {
    const r = await walkIn(owner1, { when: await future(18), notes: "visible to staff only" });
    const rowsFor = async (user) => as(db, user, `select booking_id from walk_in_booking_details where booking_id = $1`, [r.booking_id]);
    assert.equal((await rowsFor(owner1)).length, 1);
    assert.equal((await rowsFor(owner2)).length, 0);
    assert.equal((await rowsFor(customer)).length, 0);
    await assert.rejects(rowsFor(ROLES.anon), /permission denied/);
    const stylist = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `update employees set profile_id = $1 where id = $2`, [stylist.sub, SEED.employee1]);
    assert.equal((await rowsFor(stylist)).length, 0, "an ordinary stylist does not read the owner's private notes");
    const admin = await createUser(db, { role: "admin" });
    assert.equal((await rowsFor(ROLES.user(admin))).length, 1);
  });

  it("cannot be written directly by a client", async () => {
    const r = await walkIn(owner1, { when: await future(19) });
    await assert.rejects(as(db, owner1, `update walk_in_booking_details set notes = 'edited' where booking_id = $1`, [r.booking_id]), /permission denied/);
    await assert.rejects(as(db, owner1, `insert into walk_in_booking_details (booking_id, provider_id, payment_method) values (gen_random_uuid(), $1, 'cash')`, [SEED.provider1]), /permission denied/);
    await assert.rejects(as(db, owner1, `delete from walk_in_booking_details where booking_id = $1`, [r.booking_id]), /permission denied/);
  });

  it("leaves the audit trigger on the new table", async () => {
    const rows = await sys(db, `select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'walk_in_booking_details' and not t.tgisinternal`);
    assert.ok(rows.length >= 1);
  });
});
