import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// GOV-FIX H-2 (docs/reviews/2026-10-10-security-gov1.md): an owner cannot create their own second approver, and cannot remove the
// other approvers to unlock break-glass. Each reproduction from the report is run and must now fail.
let db;
let ownerA;
let ownerB;
let finance;
const setRole = (user, target, role, reason) =>
  as(db, user, `select admin_set_console_role($1, $2, $3) r`, [target, role, reason]).then((rows) => rows[0].r);
const decide = (user, id, decision = "approve", reason = "Checked with the requester's manager") =>
  as(db, user, `select admin_decide_approval($1, $2, $3) r`, [id, decision, reason]).then((rows) => rows[0].r);
const assignment = async (userId) => (await sys(db, `select * from admin_role_assignments where user_id = $1`, [userId]))[0];

async function payoutRequestedBy(dbx, maker, amount = 25) {
  await payableLedger(dbx, SEED.provider1, amount);
  const [p] = await sys(dbx, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban)
    values ($1, $2, $3, 'Test Bank', 'SA0380000000608010167519') returning id`, [SEED.provider1, SEED.owner1, amount]);
  return (await as(dbx, maker, `select admin_release_payout($1, $2, 'Weekly payout run', null) r`, [p.id, `govfix-${p.id}`]))[0].r;
}

before(async () => {
  db = await createMigratedDb();
  ownerA = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  ownerB = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  await approvedDestination(db, SEED.provider1, "SA0380000000608010167519");
});

describe("a privileged console role is granted only with a different owner's approval", () => {
  it("report reproduction 1: the owner's 'second account' does not become finance on the owner's word", async () => {
    const second = await createUser(db);
    const asked = await setRole(ownerA, second, "finance", "my second account for approvals");
    assert.equal(asked.status, "pending_approval");
    assert.equal(asked.changed, false);
    assert.equal((await sys(db, `select role from profiles where id = $1`, [second]))[0].role, "customer", "nothing changed yet");
    assert.equal(await assignment(second), undefined);
    await expectError(decide(ownerA, asked.approval_id), /your own request/);
    await expectError(decide(finance, asked.approval_id), /cannot decide role_change/);
    await expectError(as(db, ownerA, `select admin_break_glass_execute($1, 'Nobody else is around to approve this role')`, [asked.approval_id]), /never available/);
    // A second, different grant for the same person cannot be queued on top.
    await expectError(setRole(ownerA, second, "owner", "Changing my mind about the role"), /already waiting/);
    assert.equal((await decide(ownerB, asked.approval_id, "reject", "Not a staff member")).status, "rejected");
  });

  it("grants nothing privileged at once: analyst and operations apply immediately, owner -> finance too", async () => {
    const person = await createUser(db);
    assert.equal((await setRole(ownerA, person, "analyst", "Joined the analytics team")).changed, true);
    assert.equal((await setRole(ownerA, person, "operations", "Moved to the operations desk")).changed, true);
    assert.equal((await assignment(person)).admin_role, "operations");
  });

  it("an approved grant waits 72 hours before its holder decides anything, and they never decide for the person who asked for them", async () => {
    const person = await createUser(db);
    const asked = await setRole(ownerA, person, "finance", "New finance analyst starting Sunday");
    const done = await decide(ownerB, asked.approval_id);
    assert.equal(done.status, "approved");
    const row = await assignment(person);
    assert.deepEqual([row.admin_role, row.assigned_by, row.approved_by], ["finance", ownerA.sub, ownerB.sub]);
    assert.ok(new Date(row.decisions_allowed_from) > new Date(Date.now() + 71 * 3600 * 1000));
    const history = await sys(db, `select role_before, role_after, approval_request_id from admin_role_history where user_id = $1`, [person]);
    assert.deepEqual(history.map((h) => [h.role_before, h.role_after, h.approval_request_id]), [[null, "finance", asked.approval_id]],
      "the grant is one history row, with no transient read-only role");

    const fresh = ROLES.user(person);
    const byOwnerB = await payoutRequestedBy(db, ownerB);
    await expectError(decide(fresh, byOwnerB.approval_id), /less than 72 hours/);
    const inbox = (await as(db, fresh, `select admin_approval_inbox('pending', 50, 0) r`))[0].r;
    const seen = inbox.rows.find((r) => r.id === byOwnerB.approval_id);
    assert.equal(seen.can_decide, false);
    assert.match(seen.decide_blocked_reason, /72 hours/);

    // Three days later the cooling-off is over: they may decide ownerB's request, but not the requests of ownerA, who asked
    // for their role less than 30 days ago (report reproduction: approving the payouts of the owner who created you).
    await sys(db, `update admin_role_assignments set decisions_allowed_from = now() - interval '1 minute' where user_id = $1`, [person]);
    const byOwnerA = await payoutRequestedBy(db, ownerA);
    await expectError(decide(fresh, byOwnerA.approval_id), /assigned by the person who made this request/);
    assert.equal((await decide(fresh, byOwnerB.approval_id)).status, "approved");
    // After 30 days the link no longer blocks.
    await sys(db, `update admin_role_assignments set assigned_at = now() - interval '31 days' where user_id = $1`, [person]);
    assert.equal((await decide(fresh, byOwnerA.approval_id)).status, "approved");
  });

  it("re-checks the person at approval: a role changed in between is refused, never overwritten", async () => {
    const person = await createUser(db);
    const asked = await setRole(ownerA, person, "owner", "Co-founder joins the console");
    await sys(db, `insert into admin_role_assignments (user_id, admin_role, reason) values ($1, 'analyst', 'Changed outside the request')
                   on conflict (user_id) do update set admin_role = 'analyst'`, [person]);
    await sys(db, `update profiles set role = 'admin' where id = $1`, [person]);
    await expectError(decide(ownerB, asked.approval_id), /changed after this request/);
    assert.equal((await assignment(person)).admin_role, "analyst");
  });
});

describe("break-glass after demoting the other approvers", () => {
  it("report reproduction 2: demoting the only other approver applies at once but keeps break-glass closed for 7 days", async () => {
    const dbs = await createMigratedDb();
    const solo = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "owner" }));
    const other = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "finance" }));
    await approvedDestination(dbs, SEED.provider1, "SA0380000000608010167519");
    const asked = await payoutRequestedBy(dbs, solo, 40);
    const bg = () => as(dbs, solo, `select admin_break_glass_execute($1, 'Only administrator; provider waiting on rent payment') r`, [asked.approval_id]);
    await expectError(bg(), /Another eligible administrator/);

    const demoted = (await as(dbs, solo, `select admin_set_console_role($1, 'analyst', 'demote the only other approver') r`, [other.sub]))[0].r;
    assert.equal(demoted.changed, true, "taking power away stays immediate");
    await expectError(bg(), /demoted or removed recently/);
    const inbox = (await as(dbs, solo, `select admin_approval_inbox('pending', 10, 0) r`))[0].r;
    const row = inbox.rows.find((r) => r.id === asked.approval_id);
    assert.equal(row.can_break_glass, false);
    assert.ok(row.break_glass_blocked_until);

    // Removing an approver from the console entirely (not just demoting) is the same.
    await sys(dbs, `update admin_role_history set changed_at = now() - interval '8 days'`);
    const another = await createUser(dbs, { role: "admin", adminRole: "finance" });
    await as(dbs, solo, `select set_user_role($1, 'customer', 'Left the company yesterday')`, [another]);
    await expectError(bg(), /demoted or removed recently/);

    // Seven days on, the sole owner may use break-glass again (cap, step-up, alert and review still apply).
    await sys(dbs, `update admin_role_history set changed_at = now() - interval '8 days'`);
    assert.equal((await bg())[0].r.break_glass, true);
  });

  it("a demotion that keeps the approval right (owner -> finance) does not close break-glass for payouts", async () => {
    const dbs = await createMigratedDb();
    const solo = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "owner" }));
    const other = ROLES.user(await createUser(dbs, { role: "admin", adminRole: "owner" }));
    await as(dbs, solo, `select admin_set_console_role($1, 'finance', 'Moves to the finance desk')`, [other.sub]);
    const blocked = (await sys(dbs, `select governance_break_glass_blocked_until('payout_release', $1) t`, [solo.sub]))[0].t;
    assert.equal(blocked, null);
  });
});
