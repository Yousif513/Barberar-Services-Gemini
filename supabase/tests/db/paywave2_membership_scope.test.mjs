// PAY-WAVE2, the money-related remainder of P-14: a delegate scoped to one branch no longer reads the provider-wide membership data
// (members, prices, visits, draft plans); the chain report keeps rolling up only the branches the caller may read.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

let db;
let scoped;
let wide;
let branch2;
let membershipId;
let draftPlan;
const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);

// A delegate is an active employee (can_access_provider_operation requires it) with a delegation scoped to a branch or provider-wide.
async function delegate(branchId, role, permissions) {
  const sub = await createUser(db, { role: "provider_employee" });
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Delegate', 'مفوض')`, [branchId ?? SEED.branch1, sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, branch_id, permissions, is_active) values ($1, $2, $3, $4, $5::jsonb, true)`,
    [SEED.provider1, sub, role, branchId, JSON.stringify(permissions)]);
  return ROLES.user(sub);
}

before(async () => {
  db = await createMigratedDb();
  branch2 = (await sys(db, `insert into branches (provider_id, name_en, name_ar, city, address_text_en, address_text_ar, latitude, longitude)
    values ($1, 'North', 'الشمال', 'Riyadh', 'a', 'ع', 24.8, 46.7) returning id`, [SEED.provider1]))[0].id;
  scoped = await delegate(SEED.branch1, "branch_manager", { bookings: true, reports: true });
  wide = await delegate(null, "manager", { bookings: true, reports: true });
  const plan = (await as(db, owner1, `select provider_create_membership_plan($1, 'Gold', 'ذهبي', null, null, 300, 30, 3, true, '{}'::uuid[]) r`, [SEED.provider1]))[0].r.plan_id;
  await as(db, owner1, `select provider_set_membership_plan_active($1, true)`, [plan]);
  draftPlan = (await as(db, owner1, `select provider_create_membership_plan($1, 'Draft', 'مسودة', null, null, 100, 30, 1, true, '{}'::uuid[]) r`, [SEED.provider1]))[0].r.plan_id;
  const m = (await as(db, customer, `select purchase_membership($1, 'pw2-scope-key-0001') r`, [plan]))[0].r;
  await as(db, ROLES.service, `select confirm_membership_payment($1, 'chg_pw2_scope', 300)`, [m.membership_id]);
  membershipId = m.membership_id;
});

describe("P-14: provider-wide membership data", () => {
  it("a branch-scoped delegate reads no memberships, redemptions or draft plans; a provider-wide one and the owner do", async () => {
    assert.equal((await as(db, scoped, `select id from memberships where id = $1`, [membershipId])).length, 0);
    assert.equal((await as(db, scoped, `select id from membership_plans where id = $1`, [draftPlan])).length, 0);
    assert.equal((await as(db, scoped, `select id from membership_redemptions where membership_id = $1`, [membershipId])).length, 0);
    // A delegate without an employee row is no staff at all.
    const ghost = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `insert into provider_memberships (provider_id, user_id, role, branch_id, permissions, is_active) values ($1, $2, 'manager', null, '{"bookings":true}', true)`, [SEED.provider1, ghost.sub]);
    assert.equal((await as(db, ghost, `select id from memberships where id = $1`, [membershipId])).length, 0);
    await expectError(as(db, ghost, `select * from list_provider_memberships($1)`, [SEED.provider1]), /Provider not found/);
    for (const user of [wide, owner1]) {
      assert.equal((await as(db, user, `select id from memberships where id = $1`, [membershipId])).length, 1);
      assert.equal((await as(db, user, `select id from membership_plans where id = $1`, [draftPlan])).length, 1);
      assert.ok((await as(db, user, `select membership_id from list_provider_memberships($1)`, [SEED.provider1])).some((r) => r.membership_id === membershipId));
    }
    assert.equal((await as(db, customer, `select id from memberships where id = $1`, [membershipId])).length, 1, "the member still reads it");
  });

  it("plans on sale stay public only while the provider is selling", async () => {
    const onSale = (await sys(db, `select id from membership_plans where provider_id = $1 and is_active limit 1`, [SEED.provider1]))[0].id;
    assert.equal((await as(db, customer, `select id from membership_plans where id = $1`, [onSale])).length, 1);
    await sys(db, `update providers set status = 'suspended' where id = $1`, [SEED.provider1]);
    assert.equal((await as(db, customer, `select id from membership_plans where id = $1`, [onSale])).length, 0);
    assert.equal((await as(db, owner1, `select id from membership_plans where id = $1`, [onSale])).length, 1, "the owner keeps them");
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider1]);
  });

  it("the chain report rolls up only the branches a scoped delegate may read", async () => {
    const scopedView = (await as(db, scoped, `select get_provider_chain_operations($1, current_date - 30, current_date) r`, [SEED.provider1]))[0].r;
    assert.deepEqual(scopedView.branches.map((b) => b.branch_id), [SEED.branch1]);
    const wideView = (await as(db, wide, `select get_provider_chain_operations($1, current_date - 30, current_date) r`, [SEED.provider1]))[0].r;
    assert.ok(wideView.branches.some((b) => b.branch_id === branch2));
    assert.ok(wideView.branches.length > scopedView.branches.length);
  });
});
