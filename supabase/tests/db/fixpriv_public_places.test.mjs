import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-10: branches, staff schedules and closures follow the provider's public state.
let db;
let customer;
let stranger;
let admin;
const owner = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  stranger = ROLES.user(await createUser(db, { role: "customer" }));
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  // a provider-1 booking made while verified; the provider is switched off in the second block
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 3);
  const [slot] = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
  await as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slot.slot_start]);
});

const count = async (user, table, where = "true", params = []) => (await as(db, user, `select count(*)::int n from ${table} where ${where}`, params))[0].n;

describe("P-10 verified provider", () => {
  it("is visible to everyone", async () => {
    for (const user of [ROLES.anon, customer, stranger, owner, owner2]) {
      assert.ok((await count(user, "branches", "provider_id = $1", [SEED.provider1])) >= 1);
      assert.ok((await count(user, "employee_availability", "employee_id = $1", [SEED.employee1])) >= 1);
    }
  });
});

describe("P-10 provider that is not public", () => {
  before(async () => {
    await sys(db, `update providers set is_verified = false where id = $1`, [SEED.provider1]);
  });
  it("hides its branches, staff schedules and closures from visitors and strangers", async () => {
    for (const user of [ROLES.anon, stranger, owner2]) {
      assert.equal(await count(user, "branches", "provider_id = $1", [SEED.provider1]), 0);
      assert.equal(await count(user, "provider_closures", "provider_id = $1", [SEED.provider1]), 0);
      assert.equal(await count(user, "employee_availability", "employee_id = $1", [SEED.employee1]), 0);
    }
  });
  it("still shows them to its owner, an administrator and a customer who booked there", async () => {
    for (const user of [owner, admin, customer]) {
      assert.ok((await count(user, "branches", "provider_id = $1", [SEED.provider1])) >= 1);
    }
    assert.ok((await count(owner, "employee_availability", "employee_id = $1", [SEED.employee1])) >= 1);
    assert.ok((await count(admin, "employee_availability", "employee_id = $1", [SEED.employee1])) >= 1);
  });
  it("still shows the other provider's rows, and writes are unchanged", async () => {
    assert.ok((await count(ROLES.anon, "branches", "provider_id = $1", [SEED.provider2])) >= 1);
    await as(db, owner, `update branches set name_en = name_en where id = $1`, [SEED.branch1]);
    await assert.rejects(as(db, owner2, `insert into branches (provider_id, name_en, name_ar, city, address_text_en, address_text_ar, latitude, longitude) values ($1, 'B', 'ب', 'Riyadh', 'a', 'ع', 24.7, 46.7)`, [SEED.provider1]), /row-level security|permission denied/);
  });
});
