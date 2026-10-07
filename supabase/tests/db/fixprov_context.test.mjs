import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PROV R18: my_provider_context answers for the owner, for an employee, and for nobody else.
let db;
const ctx = async (user) => (await as(db, user, `select my_provider_context() c`))[0].c;

before(async () => {
  db = await createMigratedDb();
});

describe("my_provider_context (R18)", () => {
  it("tells an owner which business is theirs", async () => {
    const c = await ctx(ROLES.user(SEED.owner1));
    assert.equal(c.role, "owner");
    assert.equal(c.provider_id, SEED.provider1);
    assert.ok(c.business_name_en || c.business_name_ar);
    assert.equal(c.employee_id, null);
  });

  it("does not mix up two owners", async () => {
    assert.equal((await ctx(ROLES.user(SEED.owner2))).provider_id, SEED.provider2);
  });

  it("tells an active employee their business, their employee row and their delegation", async () => {
    const stylist = await createUser(db, { role: "provider_employee" });
    await sys(db, `update employees set profile_id = $1 where id = $2`, [stylist, SEED.employee1]);
    const c = await ctx(ROLES.user(stylist));
    assert.equal(c.role, "employee");
    assert.equal(c.employee_id, SEED.employee1);
    assert.equal(c.provider_id, SEED.provider1);
    assert.equal(c.membership_role, "stylist");
    assert.deepEqual(c.permissions, {});
    await sys(db, `insert into provider_memberships (user_id, provider_id, role, permissions) values ($1, $2, 'manager', '{"bookings": true}')`, [stylist, SEED.provider1]);
    const withDelegation = await ctx(ROLES.user(stylist));
    assert.equal(withDelegation.membership_role, "manager");
    assert.deepEqual(withDelegation.permissions, { bookings: true });
  });

  it("gives nothing to a deactivated professional, a customer or an administrator who works for nobody", async () => {
    const left = await createUser(db, { role: "provider_employee" });
    await sys(db, `update employees set profile_id = $1, is_active = false where id = $2`, [left, SEED.employee2]);
    assert.equal((await ctx(ROLES.user(left))).role, "none");
    assert.equal((await ctx(ROLES.user(SEED.customer))).role, "none");
    const admin = await createUser(db, { role: "admin" });
    const c = await ctx(ROLES.user(admin));
    assert.equal(c.role, "none");
    assert.equal(c.provider_id, null);
  });

  it("refuses an anonymous visitor and takes no argument that could name someone else", async () => {
    await assert.rejects(as(db, ROLES.anon, `select my_provider_context()`), (error) => error.code === "42501");
    const args = await sys(db, `select pronargs from pg_proc where proname = 'my_provider_context'`);
    assert.deepEqual(args, [{ pronargs: 0 }]);
  });
});
