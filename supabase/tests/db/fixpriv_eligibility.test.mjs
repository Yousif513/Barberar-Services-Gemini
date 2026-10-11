import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-03: check_customer_booking_eligibility is scoped to customers who dealt with the asking provider.
let db;
let customer;
let stranger;
let admin;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  stranger = ROLES.user(await createUser(db, { role: "customer" }));
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 3);
  const [slot] = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
  const [b] = await as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slot.slot_start]);
  if (b.status === "pending_payment") await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_${b.id}`, b.deposit_required]);
});

const ask = (user, provider, who) => as(db, user, `select check_customer_booking_eligibility($1, $2) r`, [provider, who]);

describe("P-03 eligibility scope", () => {
  it("answers the provider the customer booked with, without the platform-wide strike count", async () => {
    const r = (await ask(owner1, SEED.provider1, customer.sub))[0].r;
    assert.equal(r.is_blocked, false);
    assert.equal(r.no_show_strikes, null);
    assert.equal(typeof r.requires_full_prepayment, "boolean");
  });
  it("refuses another provider's owner for a customer who never dealt with them", async () => {
    await assert.rejects(ask(owner2, SEED.provider2, customer.sub), /Not authorized/);
  });
  it("refuses a stranger customer and a visitor, and still answers the customer about themself with strikes", async () => {
    await assert.rejects(ask(stranger, SEED.provider1, customer.sub), /Not authorized/);
    await assert.rejects(ask(ROLES.anon, SEED.provider1, customer.sub), /permission denied/);
    const own = (await ask(customer, SEED.provider1, customer.sub))[0].r;
    assert.equal(own.no_show_strikes, 0);
  });
  it("answers administrators and the service role for any customer", async () => {
    assert.equal((await ask(admin, SEED.provider2, customer.sub))[0].r.no_show_strikes, 0);
    assert.equal((await ask(ROLES.service, SEED.provider2, customer.sub))[0].r.no_show_strikes, 0);
  });
  it("blocking needs a relationship, so an owner cannot create one for a stranger", async () => {
    await assert.rejects(as(db, owner2, `select toggle_customer_block($1, $2, 'testing a block', true)`, [SEED.provider2, customer.sub]), /Customer not found/);
    await assert.rejects(as(db, owner2, `select toggle_customer_block($1, $2, 'testing a block', true)`, [SEED.provider2, crypto.randomUUID()]), /Customer not found/);
    await as(db, owner1, `select toggle_customer_block($1, $2, 'testing a block', true)`, [SEED.provider1, customer.sub]);
    assert.equal((await ask(owner1, SEED.provider1, customer.sub))[0].r.is_blocked, true);
    await assert.rejects(ask(owner2, SEED.provider2, customer.sub), /Not authorized/);
  });
});
