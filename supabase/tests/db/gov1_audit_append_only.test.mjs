import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// GOV-1 (Q4 items 5-6): the audit log is append-only for every role and kept 5 years; the purge removes only older rows.
let db;
let owner;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  await as(db, owner, `select admin_role_directory(null, null, 5, 0)`);
});

describe("append-only audit log", () => {
  it("refuses update, delete and truncate from clients, the service role and the table owner", async () => {
    for (const user of [owner, ROLES.user(SEED.customer), ROLES.service]) {
      await expectError(as(db, user, `update admin_audit_logs set action = 'edited'`), /permission denied|append-only/);
      await expectError(as(db, user, `delete from admin_audit_logs`), /permission denied|append-only/);
    }
    await expectError(sys(db, `update admin_audit_logs set action = 'edited'`), /append-only/);
    await expectError(sys(db, `delete from admin_audit_logs`), /append-only/);
    await expectError(sys(db, `truncate admin_audit_logs`), /append-only/);
    assert.ok((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'roles.directory_read'`))[0].n >= 1);
  });

  it("keeps the actor id when the profile is deleted (no foreign key rewrites history)", async () => {
    const gone = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
    await as(db, gone, `select admin_role_directory(null, null, 5, 0)`);
    await sys(db, `delete from auth.users where id = $1`, [gone.sub]).catch(() => null);
    await sys(db, `delete from profiles where id = $1`, [gone.sub]);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where actor_id = $1`, [gone.sub]))[0].n, 1);
  });

  it("purges only rows older than 5 years, only as a server job, and records that it ran", async () => {
    await sys(db, `alter table admin_audit_logs disable trigger trg_audit_log_append_only`);
    await sys(db, `insert into admin_audit_logs (action, target_type, created_at) values ('old.event', 'test', now() - interval '5 years 1 day'),
      ('recent.event', 'test', now() - interval '4 years 360 days')`);
    await sys(db, `alter table admin_audit_logs enable trigger trg_audit_log_append_only`);
    await expectError(as(db, owner, `select purge_expired_audit_logs()`), /permission denied/);
    const [purged] = await as(db, ROLES.service, `select purge_expired_audit_logs() n`);
    assert.equal(purged.n, 1);
    const left = (await sys(db, `select action from admin_audit_logs where action in ('old.event', 'recent.event', 'audit.retention_purged')`)).map((r) => r.action).sort();
    assert.deepEqual(left, ["audit.retention_purged", "recent.event"]);
  });
});
