import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-14: a delegate scoped to one branch sees only that branch's staff contacts and patch tests.
let db;
let scopedA; // branch 1
let scopedB; // new branch 2
let wide; // provider-wide manager
let booking;
let customer;
const owner = ROLES.user(SEED.owner1);
const PHONE_B = "+966599999999";

async function delegate(branchId, role, branchForEmployee) {
  const sub = await createUser(db, { role: "provider_employee" });
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Del', 'م')`, [branchForEmployee, sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, branch_id, permissions, is_active)
    values ($1, $2, $3, $4, '{"staff":true,"bookings":true}', true)`, [SEED.provider1, sub, role, branchId]);
  return ROLES.user(sub);
}

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  const [br2] = await sys(db, `insert into branches (provider_id, name_en, name_ar, city, address_text_en, address_text_ar, latitude, longitude)
    values ($1, 'B', 'ب', 'Jeddah', 'a', 'ع', 21.5, 39.2) returning id`, [SEED.provider1]);
  await sys(db, `insert into employees (branch_id, name_en, name_ar, phone) values ($1, 'Other', 'ا', $2)`, [br2.id, PHONE_B]);
  scopedA = await delegate(SEED.branch1, "branch_manager", SEED.branch1);
  scopedB = await delegate(br2.id, "branch_manager", br2.id);
  wide = await delegate(null, "manager", SEED.branch1);
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 3);
  const [slot] = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
  [booking] = await as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slot.slot_start]);
  await sys(db, `insert into patch_test_results (provider_id, service_id, customer_id, booking_id, result, tested_at, recorded_by, request_key)
    values ($1, $2, $3, $4, 'negative', now() - interval '1 day', $5, $6)`, [SEED.provider1, svc.id, customer.sub, booking.id, SEED.owner1, crypto.randomUUID()]);
});

const phones = async (user) => (await as(db, user, `select phone from get_provider_staff_contacts($1) where phone = $2`, [SEED.provider1, PHONE_B])).length;
const patch = async (user) => (await as(db, user, `select id from patch_test_results where customer_id = $1`, [customer.sub])).length;

describe("P-14 staff contacts", () => {
  it("hides another branch's staff contact from a branch-scoped delegate", async () => {
    assert.equal(await phones(scopedA), 0);
  });
  it("shows a delegate their own branch, and the owner and a provider-wide manager everything", async () => {
    assert.equal(await phones(scopedB), 1);
    assert.equal(await phones(owner), 1);
    assert.equal(await phones(wide), 1);
    const own = await as(db, scopedA, `select employee_id from get_provider_staff_contacts($1)`, [SEED.provider1]);
    assert.ok(own.length >= 1 && own.length < (await as(db, owner, `select employee_id from get_provider_staff_contacts($1)`, [SEED.provider1])).length);
  });
});

describe("P-14 patch tests", () => {
  it("shows a patch test only to a delegate of the branch the booking belongs to", async () => {
    assert.equal(await patch(scopedA), 1);
    assert.equal(await patch(scopedB), 0);
  });
  it("still shows the owner, a provider-wide manager and the client; nothing to a stranger", async () => {
    assert.equal(await patch(owner), 1);
    assert.equal(await patch(wide), 1);
    assert.equal(await patch(customer), 1);
    assert.equal(await patch(ROLES.user(SEED.owner2)), 0);
  });
});

describe("P-14 professional links", () => {
  it("lists only the delegate's branch employees (already filtered per branch; not reproduced as a leak)", async () => {
    const a = (await as(db, scopedA, `select provider_professional_links($1) r`, [SEED.provider1]))[0].r;
    const b = (await as(db, scopedB, `select provider_professional_links($1) r`, [SEED.provider1]))[0].r;
    const all = (await as(db, owner, `select provider_professional_links($1) r`, [SEED.provider1]))[0].r;
    assert.ok(a.length < all.length && b.length < all.length);
    assert.equal(a.length + b.length, all.length);
  });
});
