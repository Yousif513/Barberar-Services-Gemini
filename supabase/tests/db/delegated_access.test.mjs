import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// A delegation carries only the permissions that were delegated (inventory, bookings, staff, reports), provider-wide only when
// it has no branch, and it ends when the person leaves. Before, any active membership counted as "staff".

let db;
let admin;
let clerk; // employee with an inventory-only delegation, provider-wide
let reporter; // employee with the reports delegation, provider-wide
let frontDesk; // employee with the bookings delegation
let branchManager; // employee of the second branch with inventory+reports for that ONE branch
let barber; // plain employee
let ghost; // a membership row with no employee row (not possible through the command, possible through a direct write)
let stranger;
let secondBranch;
const owner = ROLES.user(SEED.owner1);
const range = ["2026-01-01", "2026-12-31"];

const delegate = (user, role, permissions, branch = null) =>
  as(db, owner, `select save_provider_operation_membership($1, $2, $3, $4, $5, true, null, 'Delegation for the access test')`,
    [SEED.provider1, user.sub, branch, role, JSON.stringify(permissions)]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  clerk = ROLES.user(await createUser(db, { role: "provider_employee" }));
  reporter = ROLES.user(await createUser(db, { role: "provider_employee" }));
  frontDesk = ROLES.user(await createUser(db, { role: "provider_employee" }));
  branchManager = ROLES.user(await createUser(db, { role: "provider_employee" }));
  barber = ROLES.user(await createUser(db, { role: "provider_employee" }));
  ghost = ROLES.user(await createUser(db, { role: "provider_employee" }));
  stranger = ROLES.user(await createUser(db));
  secondBranch = (await sys(db, `
    insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
    values ($1, 'North Branch', 'الفرع الشمالي', 'North Riyadh', 'شمال الرياض', 24.80, 46.65) returning id`, [SEED.provider1]))[0].id;
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Branch Lead', 'مسؤول الفرع')`, [secondBranch, branchManager.sub]);
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Barber', 'حلاق')`, [SEED.branch1, barber.sub]);
  for (const person of [clerk, reporter, frontDesk]) {
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Delegate', 'مفوّض')`, [SEED.branch1, person.sub]);
  }
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'inventory_manager', '{"inventory":true,"reports":true,"bookings":true}', true)`, [SEED.provider1, ghost.sub]);
  await delegate(clerk, "inventory_manager", { inventory: true });
  await delegate(reporter, "manager", { reports: true });
  await delegate(frontDesk, "receptionist", { bookings: true });
  await delegate(branchManager, "branch_manager", { inventory: true, reports: true }, secondBranch);
});

describe("who counts as staff", () => {
  it("is the owner or an active employee, not a delegation by itself", async () => {
    const staff = async (user) => (await sys(db, `select is_provider_staff($1, $2) s`, [SEED.provider1, user.sub]))[0].s;
    assert.equal(await staff({ sub: SEED.owner1 }), true);
    for (const user of [barber, branchManager, clerk, reporter, frontDesk]) assert.equal(await staff(user), true, "a registered employee is staff");
    assert.equal(await staff(ghost), false, "an active membership with every permission is still not staff without being employed");
    assert.equal(await staff(stranger), false);
  });
});

describe("revenue and platform fees", () => {
  const analytics = (user) => as(db, user, `select get_provider_detailed_analytics($1, $2::date, $3::date) r`, [SEED.provider1, ...range]);
  const monthly = (user) => as(db, user, `select get_provider_monthly_value_summary($1) r`, [SEED.provider1]);

  it("are read by the owner, an administrator and a provider-wide delegate with the reports permission", async () => {
    for (const user of [owner, admin, reporter]) {
      assert.ok((await analytics(user))[0].r !== undefined);
      assert.equal((await monthly(user))[0].r.success, true);
    }
  });

  it("are refused to an inventory clerk, a front desk delegate, a branch-scoped delegate, an employee, a stranger and anyone signed out", async () => {
    for (const user of [clerk, frontDesk, branchManager, barber, ghost, stranger, ROLES.anon]) {
      await expectError(analytics(user), /not authorized|Forbidden|permission denied|42501/i);
      await expectError(monthly(user), /not authorized|Forbidden|permission denied|42501/i);
    }
  });
});

describe("walk-in bookings and customer strikes", () => {
  it("are allowed to the owner, an employee and a delegate with the bookings permission, and refused to everyone else", async () => {
    const svc = await serviceFor(db, SEED.employee2);
    const walkIn = (user) => as(db, user, `select create_walk_in_booking($1, $2, $3, 'Walk-in Test', '+966 50 000 1111') r`, [SEED.branch1, SEED.employee2, svc.id]);
    await expectError(walkIn(stranger), /Not authorized|Forbidden|42501/i);
    await expectError(walkIn(ROLES.anon), /Not authorized|Forbidden|42501|permission denied/i);
    // The ones who may are not refused by the authorization check (they may still meet a slot or capacity rule).
    await expectError(walkIn(ghost), /Not authorized|Forbidden|42501/i);
    for (const user of [owner, barber, frontDesk]) {
      const result = await walkIn(user).then(() => "ok", (error) => error.message);
      assert.ok(result === "ok" || !/Not authorized|Forbidden/i.test(result), `${user.sub}: ${result}`);
    }
  });

  it("keep a customer's block and strike details from people with no booking role at the provider", async () => {
    const blocked = await createUser(db);
    await sys(db, `insert into conversations (customer_id, provider_id) values ($1, $2)`, [blocked, SEED.provider1]); // P-03: a block needs a relationship with the provider
    await as(db, owner, `select toggle_customer_block($1, $2, 'abusive messages', true)`, [SEED.provider1, blocked]);
    const seen = async (user) => (await as(db, user, `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, blocked]))[0].r;
    assert.equal((await seen(owner)).block_reason, "abusive messages");
    assert.equal((await seen(frontDesk)).block_reason, "abusive messages");
    await expectError(as(db, stranger, `select check_customer_booking_eligibility($1, $2)`, [SEED.provider1, blocked]), /Not authorized/);
    // A membership without an employee row is not staff and its permissions do not count either.
    await expectError(as(db, ghost, `select check_customer_booking_eligibility($1, $2)`, [SEED.provider1, blocked]), /Not authorized/);
  });
});

describe("provider-wide records need a provider-wide delegation", () => {
  it("lets the owner and an unscoped inventory delegate save a product, and refuses a branch-scoped delegate", async () => {
    const save = (user, name) => as(db, user, `insert into inventory_products (provider_id, name_en, name_ar, unit_cost_sar, default_reorder_point) values ($1, $2, $2, 10, 1) returning id`, [SEED.provider1, name]);
    assert.ok((await save(owner, "Owner product"))[0].id);
    assert.ok((await save(clerk, "Clerk product"))[0].id);
    await expectError(save(branchManager, "Branch manager product"), /permission denied|row-level security|violates/i);
    await expectError(save(stranger, "Stranger product"), /permission denied|row-level security|violates/i);
  });
});

describe("offboarding ends delegations", () => {
  it("switches off the membership when the employee row is switched off, and the former manager can no longer use it", async () => {
    const membershipOf = async (user) => (await sys(db, `select is_active from provider_memberships where provider_id = $1 and user_id = $2`, [SEED.provider1, user.sub]))[0].is_active;
    assert.equal(await membershipOf(branchManager), true);
    await sys(db, `update employees set is_active = false where profile_id = $1`, [branchManager.sub]);
    assert.equal(await membershipOf(branchManager), false);
    // The former manager can no longer use the delegated operations.
    const product = (await sys(db, `insert into inventory_products (provider_id, name_en, name_ar, unit_cost_sar, default_reorder_point) values ($1, 'Offboarding probe', 'اختبار', 10, 1) returning id`, [SEED.provider1]))[0].id;
    await expectError(as(db, branchManager, `select adjust_branch_inventory_stock($1, $2, 5, 'Stock count', 'adjustment', $3)`, [secondBranch, product, crypto.randomUUID()]), /Forbidden|not authorized|42501/i);

  });

  it("also ends a delegation when the employee row is deleted", async () => {
    const person = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Leaver', 'مغادر')`, [SEED.branch1, person.sub]);
    await delegate(person, "manager", { staff: true });
    await sys(db, `delete from employees where profile_id = $1`, [person.sub]);
    assert.equal((await sys(db, `select is_active from provider_memberships where provider_id = $1 and user_id = $2`, [SEED.provider1, person.sub]))[0].is_active, false);
  });
});
