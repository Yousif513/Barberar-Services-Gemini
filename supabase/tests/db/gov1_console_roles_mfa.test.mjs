import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// GOV-1 (D-Q5, Q6): console roles owner / finance / operations / analyst, AAL2 sessions, step-up within 5 minutes,
// lockout after 10 failed MFA codes, MFA reset only by a different owner.
let db;
let owner;
let owner2;
let finance;
let operations;
let analyst;
const now = () => Math.floor(Date.now() / 1000);
const aal1 = (user) => ROLES.user(user.sub, { aal: "aal1", amr: [{ method: "password", timestamp: now() }] });
const stale = (user) => ROLES.user(user.sub, { aal: "aal2", amr: [{ method: "totp", timestamp: now() - 600 }, { method: "password", timestamp: now() - 700 }] });
const denied = /permission denied|access required|role required|Only an owner|Only administrators|administrator/i;
const stepUp = /step-up required/;

const payoutRequest = async () => (await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
  values ($1, $2, 10, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1]))[0].id;
const setRole = (user, target, role, reason = "Moved to the finance team today") =>
  as(db, user, `select admin_set_console_role($1, $2, $3) r`, [target, role, reason]).then((rows) => rows[0].r);
const hook = (userId, valid) => sys(db, `select hook_mfa_verification_attempt($1::jsonb) r`,
  [JSON.stringify({ user_id: userId, factor_id: "00000000-0000-4000-8000-00000000f001", factor_type: "totp", valid })]).then((rows) => rows[0].r);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("console roles and permissions", () => {
  it("publishes the D-Q5 matrix: operations and analyst hold no money permission, analyst holds none at all", async () => {
    const rows = await as(db, analyst, `select admin_role, permission from admin_role_permissions order by 1, 2`);
    const of = (role) => rows.filter((r) => r.admin_role === role).map((r) => r.permission);
    assert.deepEqual(of("analyst"), []);
    // GOV-2 adds the audited personal-data read (personal.read) for operations and the owner-only health break-glass.
    assert.deepEqual(of("operations"), ["operations.write", "personal.read"]);
    assert.ok(!of("finance").includes("personal.read") && of("owner").includes("health.break_glass") && !of("finance").includes("health.break_glass"));
    assert.ok(of("finance").includes("money.payout") && of("finance").includes("iban.reveal") && !of("finance").includes("operations.write"));
    assert.ok(of("owner").includes("roles.manage") && of("owner").includes("break_glass.use") && of("owner").includes("money.payout"));
    assert.ok(!of("finance").includes("roles.manage") && !of("finance").includes("break_glass.use"));
  });

  it("lets every console role read, and narrows writes to the role that owns them", async () => {
    for (const user of [owner, finance, operations, analyst]) {
      const [row] = await as(db, user, `select admin_role_directory(null, null, 5, 0) r`);
      assert.ok(row.r.rows.length > 0, "every console role reads the directory");
    }
    const status = (user) => as(db, user, `select admin_set_provider_status($1, 'active', 'Checked documents again')`, [SEED.provider2]);
    await status(operations);
    await status(owner);
    await expectError(status(finance), denied);
    await expectError(status(analyst), denied);

    const review = async (user) => as(db, user, `select admin_review_payout_request($1, 'processing', 'Bank details checked')`, [await payoutRequest()]);
    await review(finance);
    await review(owner);
    await expectError(review(operations), denied);
    await expectError(review(analyst), denied);
  });

  it("narrows direct table writes the same way (restrictive policies), without touching other accounts", async () => {
    const touch = (user) => as(db, user, `update providers set status = status where id = $1 returning id`, [SEED.provider2]).catch(() => []);
    assert.equal((await touch(analyst)).length, 0, "analyst is read-only");
    assert.equal((await touch(finance)).length, 0, "finance does not manage providers");
    assert.equal((await touch(operations)).length, 1, "operations manages providers");
    const ledger = (user) => as(db, user, `update payment_methods set enabled = enabled returning id`).catch(() => []);
    assert.equal((await ledger(operations)).length, 0, "operations has no money permission");
    assert.equal((await ledger(analyst)).length, 0);
    // MONEY: payment_methods is an owner setting (settings.manage), not a money record; finance no longer writes it directly.
    assert.equal((await ledger(finance)).length, 0, "finance holds no direct table write");
    assert.ok((await ledger(owner)).length > 0, "the owner keeps the payment method setting");
    const money = (user) => as(db, user, `update customer_loyalty set points_balance = points_balance + 1000 returning id`).catch(() => []);
    for (const user of [owner, finance, operations, analyst]) assert.equal((await money(user)).length, 0, "no console role writes a money table directly");
    assert.equal((await as(db, ROLES.user(SEED.owner1), `update providers set status = status where id = $1 returning id`, [SEED.provider1])).length, 1,
      "a provider owner's own policies still decide");
  });

  it("starts an account made administrator outside the console role command as read-only analyst", async () => {
    const person = await createUser(db);
    await sys(db, `update profiles set role = 'admin' where id = $1`, [person]);
    assert.equal((await sys(db, `select admin_role from admin_role_assignments where user_id = $1`, [person]))[0].admin_role, "analyst");
    await sys(db, `update profiles set role = 'customer' where id = $1`, [person]);
    assert.equal((await sys(db, `select count(*)::int n from admin_role_assignments where user_id = $1`, [person]))[0].n, 0);
  });
});

describe("AAL2 sessions", () => {
  it("treats an administrator without a verified MFA factor in this session as no administrator", async () => {
    const weak = aal1(owner);
    assert.equal((await as(db, weak, `select is_admin() a`))[0].a, false);
    await expectError(as(db, weak, `select admin_role_directory(null, null, 5, 0)`), denied);
    assert.equal((await as(db, weak, `select count(*)::int n from admin_audit_logs`))[0].n, 0, "RLS hides the audit log too");
    const [state] = await as(db, weak, `select admin_session_state() s`);
    assert.deepEqual([state.s.is_admin_account, state.s.console_role, state.s.aal, state.s.active], [true, "owner", "aal1", false]);
    assert.deepEqual(state.s.permissions, []);
    const [strong] = await as(db, owner, `select admin_session_state() s`);
    assert.equal(strong.s.active, true);
    assert.ok(strong.s.permissions.includes("roles.manage"));
  });

  it("applies the same rule to policies that compared the profile role inline", async () => {
    const leftovers = await sys(db, `select tablename, policyname from pg_policies where coalesce(qual, '') || coalesce(with_check, '') like $1`, ["%'admin'::user_role%"]);
    assert.deepEqual(leftovers, []);
    assert.equal((await as(db, aal1(owner), `select count(*)::int n from message_templates`))[0].n,
      (await as(db, ROLES.user(SEED.customer), `select count(*)::int n from message_templates`))[0].n, "an aal1 admin sees what a customer sees");
  });
});

describe("step-up within 5 minutes", () => {
  it("refuses sensitive commands after 5 minutes without a fresh code, with the hint the console reacts to", async () => {
    const person = await createUser(db);
    const error = await expectError(setRole(stale(owner), person, "analyst"), stepUp);
    assert.equal(error.hint, "step_up_required");
    await expectError(as(db, stale(owner), `select set_user_role($1, 'admin', 'Joined the analytics team')`, [person]), stepUp);
    await expectError(as(db, stale(finance), `select admin_release_ledger_item($1, 'probe-key', 'Settled by bank transfer')`, ["00000000-0000-4000-8000-0000000000aa"]), stepUp);
    await expectError(as(db, stale(owner), `select admin_reset_mfa($1, 'Lost the phone with the app')`, [finance.sub]), stepUp);
    await expectError(as(db, aal1(owner), `select admin_set_console_role($1, 'analyst', 'Needs read access')`, [person]), stepUp);
  });

  it("does not ask for step-up on reads", async () => {
    const [row] = await as(db, stale(analyst), `select admin_role_directory(null, null, 5, 0) r`);
    assert.ok(row.r.rows.length > 0);
  });
});

describe("admin_set_console_role", () => {
  it("assigns, changes and removes console roles with a reason, audited, alerted and notified", async () => {
    const person = await createUser(db, { phone: "+966555000901" });
    // GOV-FIX H-2: finance adds money and IBAN rights, so it waits for a different owner.
    const asked = await setRole(owner, person, "finance");
    assert.deepEqual([asked.status, asked.changed], ["pending_approval", false]);
    await as(db, owner2, `select admin_decide_approval($1, 'approve', 'Confirmed with HR and the finance lead')`, [asked.approval_id]);
    assert.equal((await sys(db, `select role from profiles where id = $1`, [person]))[0].role, "admin");
    assert.equal((await sys(db, `select admin_role from admin_role_assignments where user_id = $1`, [person]))[0].admin_role, "finance");
    assert.equal((await setRole(owner, person, "finance")).changed, false, "the same role again changes nothing");
    await setRole(owner, person, "operations", "Moved to operations this week");
    const [audit] = await sys(db, `select details from admin_audit_logs where action = 'admin.console_role_changed' and target_id = $1 order by created_at desc limit 1`, [person]);
    assert.deepEqual([audit.details.role_before, audit.details.role_after, audit.details.reason], ["finance", "operations", "Moved to operations this week"]);
    assert.ok((await sys(db, `select count(*)::int n from security_alerts where kind = 'console_role_changed' and user_id = $1`, [person]))[0].n >= 2);
    assert.ok((await sys(db, `select count(*)::int n from governance_notifications where recipient_user_id = $1 and template_key = 'console_role_changed'`, [person]))[0].n >= 2);
    await setRole(owner, person, null, "Left the company yesterday");
    assert.equal((await sys(db, `select role from profiles where id = $1`, [person]))[0].role, "customer");
  });

  it("refuses a short reason, an unknown role, your own account, provider accounts, and every non-owner", async () => {
    const person = await createUser(db);
    await expectError(setRole(owner, person, "finance", "short"), /at least 10/);
    await expectError(setRole(owner, person, "root"), /Unknown console role/);
    await expectError(setRole(owner, owner.sub, "analyst"), /your own role/);
    await expectError(setRole(owner, SEED.owner1, "finance"), /provider account/);
    for (const user of [finance, operations, analyst, ROLES.user(SEED.customer), ROLES.anon]) {
      await expectError(setRole(user, person, "finance"), denied);
    }
  });

  it("never removes the last owner: the only owner cannot demote themselves, and an owner is needed to change roles", async () => {
    const db2 = await createMigratedDb();
    const solo = ROLES.user(await createUser(db2, { role: "admin", adminRole: "owner" }));
    const other = ROLES.user(await createUser(db2, { role: "admin", adminRole: "finance" }));
    await expectError(as(db2, solo, `select admin_set_console_role($1, 'analyst', 'Stepping back from ownership')`, [solo.sub]), /your own role/);
    await expectError(as(db2, solo, `select set_user_role($1, 'customer', 'Stepping back from ownership')`, [solo.sub]), /your own role/);
    await expectError(as(db2, other, `select set_user_role($1, 'customer', 'Removing the only owner')`, [solo.sub]), denied);
    await expectError(as(db2, other, `select admin_set_console_role($1, 'analyst', 'Removing the only owner')`, [solo.sub]), denied);
    // GOV-FIX H-2: a sole owner cannot make a second owner alone; the grant waits for a different owner and break-glass never applies.
    const asked = (await as(db2, solo, `select admin_set_console_role($1, 'owner', 'Second owner for holiday cover') r`, [other.sub]))[0].r;
    assert.equal(asked.status, "pending_approval");
    await expectError(as(db2, solo, `select admin_decide_approval($1, 'approve', 'Approving my own request')`, [asked.approval_id]), /your own request/);
    await expectError(as(db2, solo, `select admin_break_glass_execute($1, 'Nobody else can approve this role change')`, [asked.approval_id]), /never available/);
    await expectError(as(db2, other, `select admin_decide_approval($1, 'approve', 'Approving my own promotion')`, [asked.approval_id]), /cannot decide/);
    assert.equal((await sys(db2, `select admin_role from admin_role_assignments where user_id = $1`, [other.sub]))[0].admin_role, "finance");
  });
});

describe("MFA lockout (Supabase MFA verification hook)", () => {
  it("locks after 10 consecutive failed codes, raises an alert, rejects even a valid code, and drops the console role", async () => {
    const victim = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
    for (let i = 0; i < 9; i += 1) assert.equal((await hook(victim.sub, false)).decision, "continue");
    assert.equal((await hook(victim.sub, true)).decision, "continue", "a valid code resets the count");
    for (let i = 0; i < 9; i += 1) assert.equal((await hook(victim.sub, false)).decision, "continue");
    const tenth = await hook(victim.sub, false);
    assert.equal(tenth.decision, "reject");
    assert.match(tenth.message, /locked/);
    assert.equal((await hook(victim.sub, true)).decision, "reject", "a locked account stays locked");
    assert.equal((await sys(db, `select count(*)::int n from security_alerts where kind = 'mfa_lockout' and user_id = $1`, [victim.sub]))[0].n, 1);
    assert.equal((await as(db, victim, `select is_admin() a`))[0].a, false);
    assert.equal((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'mfa.locked' and target_id = $1`, [victim.sub]))[0].n, 1);

    await sys(db, `insert into auth.mfa_factors (user_id) values ($1)`, [victim.sub]);
    await sys(db, `insert into auth.sessions (user_id) values ($1)`, [victim.sub]);
    await expectError(as(db, victim, `select admin_reset_mfa($1, 'Locked out after a phone change')`, [victim.sub]), denied);
    await expectError(as(db, finance, `select admin_reset_mfa($1, 'Locked out after a phone change')`, [victim.sub]), denied);
    await expectError(as(db, owner, `select admin_reset_mfa($1, 'short')`, [victim.sub]), /at least 10/);
    const reset = (await as(db, owner, `select admin_reset_mfa($1, 'Locked out after a phone change') r`, [victim.sub]))[0].r;
    assert.deepEqual([reset.factors_removed, reset.sessions_ended], [1, 1]);
    assert.equal((await hook(victim.sub, true)).decision, "continue");
    assert.equal((await as(db, victim, `select is_admin() a`))[0].a, true);
    const [audit] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'mfa.reset' and target_id = $1`, [victim.sub]);
    assert.equal(audit.actor_id, owner.sub);
    assert.equal(audit.details.reason, "Locked out after a phone change");
  });

  it("is not callable by clients; only Supabase Auth runs it", async () => {
    for (const user of [owner, ROLES.user(SEED.customer), ROLES.anon]) {
      await expectError(as(db, user, `select hook_mfa_verification_attempt('{}'::jsonb)`), /permission denied/);
    }
    for (const user of [owner, ROLES.user(SEED.customer)]) {
      await expectError(as(db, user, `select * from mfa_verification_failures`), /permission denied/);
    }
  });
});

describe("security alerts", () => {
  it("are acknowledged by an owner with a note, once", async () => {
    const [alert] = await sys(db, `select id from security_alerts where acknowledged_at is null and kind = 'mfa_lockout' order by created_at limit 1`);
    await expectError(as(db, finance, `select admin_acknowledge_security_alert($1, 'Reviewed with the owner')`, [alert.id]), denied);
    await expectError(as(db, owner, `select admin_acknowledge_security_alert($1, 'ok')`, [alert.id]), /at least 10/);
    assert.equal((await as(db, owner, `select admin_acknowledge_security_alert($1, 'Reviewed with the team') r`, [alert.id]))[0].r.changed, true);
    assert.equal((await as(db, owner, `select admin_acknowledge_security_alert($1, 'Reviewed with the team') r`, [alert.id]))[0].r.changed, false);
    await expectError(as(db, owner, `update security_alerts set acknowledged_at = null where id = $1`, [alert.id]), /permission denied/);
  });
});

describe("GOV-FIX M-4: nobody clears an alert about themselves", () => {
  it("refuses the owner who reset MFA or changed a role, and the person the alert is about; another owner acknowledges", async () => {
    const [reset] = await sys(db, `select id from security_alerts where kind = 'mfa_reset' and details->>'reset_by' = $1 and acknowledged_at is null limit 1`, [owner.sub]);
    await expectError(as(db, owner, `select admin_acknowledge_security_alert($1, 'Reviewed my own reset')`, [reset.id]), /another owner acknowledges/);
    assert.equal((await as(db, owner2, `select admin_acknowledge_security_alert($1, 'Checked the ticket and the caller') r`, [reset.id]))[0].r.changed, true);

    const person = await createUser(db);
    await setRole(owner, person, "analyst", "Joined the analytics team");
    const [changed] = await sys(db, `select id from security_alerts where kind = 'console_role_changed' and user_id = $1`, [person]);
    await expectError(as(db, owner, `select admin_acknowledge_security_alert($1, 'Reviewed my own change')`, [changed.id]), /another owner acknowledges/);
    const inbox = (await as(db, owner, `select admin_approval_inbox('pending', 5, 0) r`))[0].r;
    assert.equal(inbox.open_alerts.find((a) => a.id === changed.id).can_acknowledge, false, "the inbox hides the button the server refuses");
    assert.equal((await as(db, owner2, `select admin_acknowledge_security_alert($1, 'Confirmed with the team lead') r`, [changed.id]))[0].r.changed, true);
  });
});
