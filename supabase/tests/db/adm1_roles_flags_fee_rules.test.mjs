import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// ADM1 item 5: the role directory, feature flags and platform fee rules change only through reasoned, audited, bounded commands.
let db;
let admin;
let admin2;
let stranger;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const outsiders = () => [ROLES.anon, customer, stranger, owner1, owner2, ROLES.service];
const denied = /permission denied|Administrator access required/i;

const directory = (user, role = null, search = null, limit = 25, offset = 0) =>
  as(db, user, `select admin_role_directory($1, $2, $3, $4) r`, [role, search, limit, offset]).then((rows) => rows[0].r);
const flag = (user, key, on, reason = "Owner confirmed the legal opinion") => as(db, user, `select admin_set_feature_flag($1, $2, $3) r`, [key, on, reason]).then((rows) => rows[0].r);
const audits = (action, targetId = null) => sys(db, `select details from admin_audit_logs where action = $1 and ($2::uuid is null or target_id = $2) order by created_at`, [action, targetId]);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  admin2 = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db));
});

describe("admin_role_directory", () => {
  it("lists administrators and staff, not customers, with counts, and pages on the server", async () => {
    const all = await directory(admin);
    assert.ok(all.rows.length >= 2);
    assert.ok(all.rows.every((r) => r.role !== "customer"));
    assert.equal(all.rows[0].role, "admin", "administrators come first");
    assert.ok(Number(all.counts.admin) >= 2 && Number(all.counts.customer) >= 1);
    const page = await directory(admin, null, null, 1, 0);
    assert.equal(page.rows.length, 1);
    assert.equal(page.matching, all.matching);
    assert.deepEqual((await directory(admin, "admin")).rows.every((r) => r.role === "admin"), true);
  });

  it("finds a customer to promote only by search, and audits the read without the search text", async () => {
    await expectError(directory(admin, "customer"), /at least 3 characters/);
    const [found] = (await directory(admin, "customer", SEED.customer)).rows;
    assert.equal(found.id, SEED.customer);
    const logged = JSON.stringify(await audits("roles.directory_read"));
    assert.ok(!logged.includes(SEED.customer), "the search text is not logged");
    assert.ok(logged.includes('"searched": true') || logged.includes('"searched":true'));
  });

  it("refuses unknown roles and everyone who is not an administrator", async () => {
    await expectError(directory(admin, "root"), /Unknown role/);
    for (const actor of outsiders()) await expectError(directory(actor), denied);
  });
});

describe("role changes go through set_user_role with its guards (shown by the screen)", () => {
  const change = (user, target, role, reason = "Joined the operations team") => as(db, user, `select set_user_role($1, $2::user_role, $3) r`, [target, role, reason]);
  it("grants and removes the administrator role with a reason, never your own, never the last administrator", async () => {
    const person = await createUser(db);
    await expectError(change(admin, person, "admin", "no"), /reason of at least 3/);
    await change(admin, person, "admin");
    assert.equal((await directory(admin, "admin", person)).rows[0].role, "admin");
    assert.equal((await audits("profile.role_changed", person)).length, 1);
    await expectError(change(admin, admin.sub, "customer"), /cannot change your own role/);
    await change(admin, person, "customer", "Left the operations team");
    for (const actor of outsiders()) await expectError(change(actor, person, "admin"), /permission denied|Administrator role required/i);
    assert.equal((await sys(db, `select role from profiles where id = $1`, [person]))[0].role, "customer");
  });
});

describe("admin_set_feature_flag", () => {
  it("switches an existing flag with a reason, idempotently, and audits it once", async () => {
    const on = await flag(admin, "payments_marketplace_split", true);
    assert.deepEqual([on.is_enabled, on.changed], [true, true]);
    assert.equal((await sys(db, `select is_enabled from platform_feature_flags where flag_key = 'payments_marketplace_split'`))[0].is_enabled, true);
    assert.equal((await flag(admin, "payments_marketplace_split", true)).changed, false);
    const [entry] = await audits("feature_flag.changed");
    assert.deepEqual([entry.details.enabled_before, entry.details.enabled_after], [false, true]);
    assert.equal(entry.details.reason, "Owner confirmed the legal opinion");
    await flag(admin, "payments_marketplace_split", false, "Rolled back while the counsel reviews");
    assert.equal((await audits("feature_flag.changed")).length, 2);
  });

  it("refuses a missing reason, an unknown flag, a null value and every non-administrator, and no client writes the table", async () => {
    await expectError(flag(admin, "payments_marketplace_split", true, " x "), /reason of at least 3/);
    await expectError(flag(admin, "no_such_flag", true), /not found/);
    await expectError(as(db, admin, `select admin_set_feature_flag('payments_marketplace_split', null, 'Not a boolean')`), /on or off/);
    for (const actor of outsiders()) await expectError(flag(actor, "payments_marketplace_split", true), denied);
    for (const actor of [admin, owner1, customer]) {
      await expectError(as(db, actor, `update platform_feature_flags set is_enabled = true`), /permission denied|row-level security/);
      await expectError(as(db, actor, `insert into platform_feature_flags (flag_key) values ('rogue')`), /permission denied|row-level security/);
    }
    assert.equal((await sys(db, `select is_enabled from platform_feature_flags where flag_key = 'payments_marketplace_split'`))[0].is_enabled, false);
  });
});

describe("fee rules (MONEY, D-Q8)", () => {
  it("are no longer changed by one administrator in one call: admin_save_fee_rule is gone and no client writes the table", async () => {
    assert.equal((await sys(db, `select count(*)::int n from pg_proc where proname = 'admin_save_fee_rule'`))[0].n, 0);
    for (const actor of [admin, owner1, customer]) {
      await expectError(as(db, actor, `update fee_rules set fee_percentage = 0`), /permission denied|row-level security/);
      await expectError(as(db, actor, `delete from fee_rules`), /permission denied|row-level security/);
    }
    assert.ok((await as(db, admin, `select 1 from fee_rules`)).length > 0, "administrators still read every rule");
    // The two-person, effective-dated change is tested in money_pending_changes.test.mjs.
  });
});

