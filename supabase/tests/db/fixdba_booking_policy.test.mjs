import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// D-08 (bounds on the provider's money terms, platform deposit floor) and D-27 (set_provider_booking_policy).

let db;
let admin;
let delegate;
let branchManager;
let stylist;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const code = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const policy = (user, args) => as(db, user, `select set_provider_booking_policy($1, $2, $3, $4, $5, $6) as r`, args).then((rows) => rows[0].r);
const provider = async () => (await sys(db, `select free_cancellation_hours h, late_cancellation_fee_percent late, no_show_fee_percent ns, deposit_percentage dep, policy_confirmed_at at from providers where id = $1`, [SEED.provider1]))[0];

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  const member = async (role, permissions, branch) => {
    const id = await createUser(db, { role: "customer" });
    await sys(db, `insert into provider_memberships (user_id, provider_id, branch_id, role, permissions) values ($1, $2, $3, $4, $5::jsonb)`,
      [id, SEED.provider1, branch, role, JSON.stringify(permissions)]);
    return ROLES.user(id);
  };
  delegate = await member("manager", { settings: true }, null);
  branchManager = await member("manager", { settings: true }, SEED.branch1);
  stylist = await member("stylist", {}, null);
});

describe("D-08: the money terms a provider controls are bounded", () => {
  it("refuses a deposit of zero, which let a booking confirm with no payment", async () => {
    assert.equal(await code(as(db, owner1, `update providers set deposit_percentage = 0 where id = $1`, [SEED.provider1])), "23514");
    assert.equal(await code(as(db, owner1, `update providers set deposit_percentage = 100.01 where id = $1`, [SEED.provider1])), "23514");
  });
  it("refuses negative or absurd hours and percentages written straight to the table", async () => {
    for (const set of ["free_cancellation_hours = -5", "free_cancellation_hours = 721", "late_cancellation_fee_percent = -50",
      "late_cancellation_fee_percent = 101", "no_show_fee_percent = 500", "no_show_fee_percent = -1"]) {
      assert.equal(await code(as(db, owner1, `update providers set ${set} where id = $1`, [SEED.provider1])), "23514", set);
    }
  });
  it("keeps the migration defaults for a shop that never chose", async () => {
    const p = await provider();
    assert.deepEqual([p.h, Number(p.late), Number(p.ns), Number(p.dep)], [24, 50, 100, 20]);
    assert.equal(p.at, null, "nobody has confirmed the policy yet");
  });
});

describe("D-27: set_provider_booking_policy", () => {
  it("lets the owner set the policy, stamps the confirmation and writes an audit row", async () => {
    const r = await policy(owner1, [SEED.provider1, 48, 25, 75, 30, null]);
    assert.equal(r.success, true);
    assert.equal(r.changed, true);
    const p = await provider();
    assert.deepEqual([p.h, Number(p.late), Number(p.ns), Number(p.dep)], [48, 25, 75, 30]);
    assert.ok(p.at, "policy_confirmed_at is set");
    const audit = await sys(db, `select details from admin_audit_logs where action = 'provider.booking_policy_set' and target_id = $1`, [SEED.provider1]);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].details.before.free_cancellation_hours, 24);
    assert.equal(audit[0].details.after.free_cancellation_hours, 48);
  });
  it("is idempotent: the same values again change nothing and add no audit row", async () => {
    const before = await provider();
    const r = await policy(owner1, [SEED.provider1, 48, 25, 75, 30, null]);
    assert.equal(r.changed, false);
    assert.equal((await provider()).at.toISOString(), before.at.toISOString());
    assert.equal((await sys(db, `select count(*)::int c from admin_audit_logs where action = 'provider.booking_policy_set' and target_id = $1`, [SEED.provider1]))[0].c, 1);
  });
  it("rejects missing, out-of-range and zero-deposit values with 22023", async () => {
    for (const args of [
      [SEED.provider1, null, 25, 75, 30, null], [SEED.provider1, 48, null, 75, 30, null], [SEED.provider1, 48, 25, null, 30, null], [SEED.provider1, 48, 25, 75, null, null],
      [SEED.provider1, -1, 25, 75, 30, null], [SEED.provider1, 721, 25, 75, 30, null],
      [SEED.provider1, 48, -50, 75, 30, null], [SEED.provider1, 48, 101, 75, 30, null],
      [SEED.provider1, 48, 25, 500, 30, null], [SEED.provider1, 48, 25, -1, 30, null],
      [SEED.provider1, 48, 25, 75, 0, null], [SEED.provider1, 48, 25, 75, 100.5, null], [SEED.provider1, 48, 25, 75, 0.004, null],
    ]) {
      assert.equal(await code(policy(owner1, args)), "22023", JSON.stringify(args));
    }
    assert.equal((await provider()).h, 48, "a rejected call changes nothing");
  });
  it("lets a delegate with the settings permission act, and refuses every other role", async () => {
    assert.equal((await policy(delegate, [SEED.provider1, 24, 50, 100, 20, null])).changed, true);
    assert.equal(await code(policy(branchManager, [SEED.provider1, 12, 50, 100, 20, null])), "42501", "a branch-scoped manager cannot change the business-wide policy");
    assert.equal(await code(policy(stylist, [SEED.provider1, 12, 50, 100, 20, null])), "42501", "staff without the permission");
    assert.equal(await code(policy(owner2, [SEED.provider1, 12, 50, 100, 20, null])), "P0002", "another provider's owner gets 'not found'");
    assert.equal(await code(policy(customer, [SEED.provider1, 12, 50, 100, 20, null])), "P0002");
    assert.equal(await code(policy(ROLES.anon, [SEED.provider1, 12, 50, 100, 20, null])), "42501", "anonymous has no EXECUTE");
    assert.equal(await code(policy(ROLES.service, [SEED.provider1, 12, 50, 100, 20, null])), "28000", "the service role has no acting user");
    assert.equal(await code(policy(owner1, ["99999999-9999-4999-8999-999999999999", 12, 50, 100, 20, null])), "P0002");
    assert.equal((await provider()).h, 24);
  });
  it("requires a reason from an administrator acting on someone else's business", async () => {
    assert.equal(await code(policy(admin, [SEED.provider1, 36, 50, 100, 20, null])), "22023");
    assert.equal(await code(policy(admin, [SEED.provider1, 36, 50, 100, 20, "ab"])), "22023");
    assert.equal((await policy(admin, [SEED.provider1, 36, 50, 100, 20, "Owner phoned support"])).changed, true);
    const audit = await sys(db, `select details->>'reason' r from admin_audit_logs where action = 'provider.booking_policy_set' order by created_at desc limit 1`);
    assert.equal(audit[0].r, "Owner phoned support");
  });
  it("cannot be forged: the confirmation stamp is not writable from the table", async () => {
    await sys(db, `update providers set policy_confirmed_at = null where id = $1`, [SEED.provider2]);
    await as(db, owner2, `update providers set policy_confirmed_at = now() where id = $1`, [SEED.provider2]);
    assert.equal((await sys(db, `select policy_confirmed_at at from providers where id = $1`, [SEED.provider2]))[0].at, null);
  });
});

describe("D-08: platform floor for the online deposit", () => {
  it("is unset until the marketplace owner approves a value", async () => {
    assert.equal((await sys(db, `select value from platform_settings where key = 'minimum_online_deposit_percentage'`))[0].value, null);
    assert.equal((await policy(owner1, [SEED.provider1, 24, 50, 100, 1, null])).changed, true, "with no floor, any deposit above zero is allowed");
  });
  it("is enforced by the command and by direct writes once set", async () => {
    await as(db, admin, `select admin_update_platform_setting('minimum_online_deposit_percentage', '15'::jsonb, 'Collect the first-visit fee')`);
    assert.equal(await code(policy(owner1, [SEED.provider1, 24, 50, 100, 10, null])), "22023");
    assert.equal(await code(as(db, owner1, `update providers set deposit_percentage = 10 where id = $1`, [SEED.provider1])), "22023");
    assert.equal((await policy(owner1, [SEED.provider1, 24, 50, 100, 15, null])).changed, true);
    // Unrelated edits are not blocked when the floor rises above an old deposit.
    await as(db, admin, `select admin_update_platform_setting('minimum_online_deposit_percentage', '40'::jsonb, 'Raise the floor')`);
    await as(db, owner1, `update providers set description_en = 'Updated text' where id = $1`, [SEED.provider1]);
  });
  it("accepts only a percentage or null from the console", async () => {
    for (const bad of ['"x"', "0", "101", "-5", "true"]) {
      assert.equal(await code(as(db, admin, `select admin_update_platform_setting('minimum_online_deposit_percentage', $1::jsonb, 'bad value')`, [bad])), "22023", bad);
    }
    await as(db, admin, `select admin_update_platform_setting('minimum_online_deposit_percentage', 'null'::jsonb, 'Remove the floor')`);
  });
});
