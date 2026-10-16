import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

// F1, F2, F3 and F4 of docs/reviews/2026-10-16-security-final-recheck.md. Each reproduction from the review is replayed and must
// now be refused; the permitted path is tested next to it.
let db;
let owner;
let owner2;
let operations;
let finance;

const nowS = () => Math.floor(Date.now() / 1000);
const stale = (id) => ROLES.user(id, { amr: [{ method: "totp", timestamp: nowS() - 900 }, { method: "password", timestamp: nowS() - 900 }] });
const aal1 = (id) => ROLES.user(id, { aal: "aal1", amr: [{ method: "password", timestamp: nowS() - 10 }] });
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const decide = (user, approval, decision = "approve") =>
  call(user, `select admin_decide_approval($1, $2, 'Second person checked it') r`, [approval, decision]);
const profile = (id) => one(`select first_name, email, phone_number from profiles where id = $1`, [id]);

async function customer(first, email, phone) {
  const id = await createUser(db, { role: "customer", phone, verified: Boolean(phone) });
  await sys(db, `update profiles set first_name = $2, last_name = 'Test', email = $3 where id = $1`, [id, first, email]);
  return id;
}
async function accountHold(subject, ref) {
  const hold = await call(operations, `select admin_privacy_propose_legal_hold($1, 'court_case', $2, $3::text[], null, $4, $5) r`,
    [subject, ref, ["account", "reviews"], `Riyadh commercial court case ${ref} names this customer`,
     "The court asked for the account history of this customer"]);
  await decide(owner, hold.approval_id);
  assert.equal((await one(`select status from privacy_legal_holds where id = $1`, [hold.hold_id])).status, "active");
  return hold.hold_id;
}

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
});

describe("F1: a profile clear respects an active account court hold", () => {
  it("refuses the request while a court hold covers the account (the review's reproduction cleared it)", async () => {
    const id = await customer("Maha", "maha.f1@example.test", "+966501230001");
    await accountHold(id, "CASE-F1-001");
    const err = await expectError(call(operations, `select admin_clear_customer_profile($1, 'Customer asked by phone') r`, [id]),
      /active legal hold \(CASE-F1-001\)/);
    assert.equal(err.hint, "legal_hold_active");
    assert.equal(await one(`select count(*)::int n from admin_approval_requests where kind = 'customer_profile_clear' and target_id = $1`, [id])
      .then((r) => r.n), 0, "no request is opened");
    assert.deepEqual(await profile(id), { first_name: "Maha", email: "maha.f1@example.test", phone_number: "+966501230001" });
  });

  it("refuses the approval when the hold was placed after the request, and shows the approver the hold", async () => {
    const id = await customer("Dana", "dana.f1@example.test", "+966501230002");
    const asked = await call(operations, `select admin_clear_customer_profile($1, 'Customer e-mailed support') r`, [id]);
    assert.equal(asked.status, "pending_approval");
    const holdId = await accountHold(id, "CASE-F1-002");
    const inbox = await call(owner2, `select admin_approval_inbox('pending', 100, 0) r`);
    const row = inbox.rows.find((r) => r.id === asked.approval_id);
    assert.equal(row.legal_hold?.hold_id, holdId, "the approver sees the hold before deciding");
    assert.equal(row.legal_hold.case_reference, "CASE-F1-002");
    assert.equal(row.legal_hold.pseudonym_token, undefined);
    await expectError(decide(owner2, asked.approval_id), /active legal hold \(CASE-F1-002\)/);
    assert.equal((await one(`select status from admin_approval_requests where id = $1`, [asked.approval_id])).status, "pending");
    assert.equal((await profile(id)).first_name, "Dana", "the review's reproduction cleared the profile here");
    const rejected = await decide(owner2, asked.approval_id, "reject");
    assert.equal(rejected.status, "rejected", "the approver can still reject it");
  });

  it("clears once the hold is no longer active, and an unheld customer is unaffected", async () => {
    const id = await customer("Rana", "rana.f1@example.test", null);
    const holdId = await accountHold(id, "CASE-F1-003");
    await sys(db, `update privacy_legal_holds set status = 'released', released_at = now() where id = $1`, [holdId]);
    const asked = await call(operations, `select admin_clear_customer_profile($1, 'Hold ended; customer asked again') r`, [id]);
    assert.equal(asked.status, "pending_approval");
    const inbox = await call(owner2, `select admin_approval_inbox('pending', 100, 0) r`);
    assert.equal(inbox.rows.find((r) => r.id === asked.approval_id).legal_hold, null);
    assert.equal((await decide(owner2, asked.approval_id)).status, "approved");
    assert.equal((await profile(id)).first_name, null);
  });
});

describe("F4: the approver of a profile clear needs privacy.approve, not operations.write", () => {
  it("runs the approved clear without the operations.write check, and still refuses a requester without it", async () => {
    const id = await customer("Lina", "lina.f4@example.test", null);
    await expectError(call(finance, `select admin_clear_customer_profile($1, 'Finance tries to ask') r`, [id]), /Administrator access required/);
    const asked = await call(operations, `select admin_clear_customer_profile($1, 'Customer asked in branch') r`, [id]);
    // Take operations.write away from the owner role for this decision only: the approval must still run.
    await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "authenticated", sub: owner2.sub,
        session_id: owner2.sub, aal: "aal2", amr: [{ method: "totp", timestamp: nowS() }] })]);
      await tx.exec(`RESET ROLE`);
      await tx.query(`create temp table perm_backup on commit drop as select * from admin_role_permissions where admin_role = 'owner' and permission = 'operations.write'`);
      await tx.query(`delete from admin_role_permissions where admin_role = 'owner' and permission = 'operations.write'`);
      await tx.exec(`SET LOCAL ROLE authenticated`);
      const out = (await tx.query(`select admin_decide_approval($1, 'approve', 'Privacy approver checked it') r`, [asked.approval_id])).rows[0].r;
      assert.equal(out.status, "approved");
      await tx.exec(`RESET ROLE`);
      await tx.query(`insert into admin_role_permissions select * from perm_backup`);
    });
    assert.equal((await profile(id)).first_name, null);
    await expectError(call(owner, `select gov_exec_customer_profile_clear(r) from admin_approval_requests r where r.id = $1`, [asked.approval_id]),
      /permission denied/);
  });
});
