import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

// UXFIX (docs/reviews/2026-10-11-ux-review.md): the server side of the console UX fixes, migration
// 20261011400000_uxfix_console_ux_server_support.sql. Each control is tested for the role that may use it and for the roles that
// may not.

let db;
let owner;
let secondOwner;
let finance;
let operations;
let analyst;
let customer;

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  secondOwner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer = await createUser(db, { role: "customer", phone: "+966 55 123 4567", verified: true });
  await sys(db, `update profiles set first_name = 'Hessa', last_name = 'Alqahtani', email = 'hessa.alqahtani@example.test' where id = $1`, [customer]);
});

const profile = (id) => sys(db, `select first_name, last_name, email, phone_number from profiles where id = $1`, [id]).then((r) => r[0]);

describe("clearing a customer profile needs a second owner, as a privacy deletion does", () => {
  it("one administrator's call only asks: nothing is cleared and an approval request waits", async () => {
    const before = await profile(customer);
    const [first] = await as(db, owner, `select admin_clear_customer_profile($1, 'Customer asked by phone') r`, [customer]);
    assert.equal(first.r.status, "pending_approval");
    assert.equal(first.r.kind, "customer_profile_clear");
    assert.deepEqual(await profile(customer), before, "the profile is untouched until a second owner approves");
    const [req] = await sys(db, `select kind, status, requested_by, target_id from admin_approval_requests where id = $1`, [first.r.approval_id]);
    assert.deepEqual(req, { kind: "customer_profile_clear", status: "pending", requested_by: owner.sub, target_id: customer });
    // Repeating the call does not open a second request or clear anything.
    const [again] = await as(db, owner, `select admin_clear_customer_profile($1, 'Customer asked by phone') r`, [customer]);
    assert.equal(again.r.approval_id, first.r.approval_id);
    assert.deepEqual(await profile(customer), before);
  });

  it("the maker cannot approve it, finance and operations cannot decide it, and the executor is not callable", async () => {
    const [{ id }] = await sys(db, `select id from admin_approval_requests where kind = 'customer_profile_clear' and target_id = $1 and status = 'pending'`, [customer]);
    await expectError(as(db, owner, `select admin_decide_approval($1, 'approve', 'My own request')`, [id]), /cannot approve or reject your own request/);
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Finance tries to approve')`, [id]), /cannot decide customer_profile_clear/);
    await expectError(as(db, operations, `select admin_decide_approval($1, 'approve', 'Operations tries to approve')`, [id]), /cannot decide customer_profile_clear/);
    const [grant] = await sys(db, `select has_function_privilege('authenticated', 'public.gov_exec_customer_profile_clear(public.admin_approval_requests)', 'EXECUTE') ok`);
    assert.equal(grant.ok, false, "the executor runs only inside an approved execution");
    await expectError(as(db, owner, `select gov_exec_customer_profile_clear(r) from admin_approval_requests r where r.id = $1`, [id]), /permission denied/);
    assert.equal((await profile(customer)).first_name, "Hessa", "still not cleared");
  });

  it("operations can ask too, but only an owner (privacy.approve) other than the maker clears it", async () => {
    const other = await createUser(db, { role: "customer" });
    await sys(db, `update profiles set first_name = 'Reem' where id = $1`, [other]);
    const [asked] = await as(db, operations, `select admin_clear_customer_profile($1, 'Customer e-mailed support') r`, [other]);
    assert.equal(asked.r.status, "pending_approval");
    assert.equal((await profile(other)).first_name, "Reem");
    const [done] = await as(db, secondOwner, `select admin_decide_approval($1, 'approve', 'Identity checked by owner') r`, [asked.r.approval_id]);
    assert.equal(done.r.status, "approved");
    assert.equal((await profile(other)).first_name, null);
  });

  it("a second owner's approval clears the profile, recorded with the approval", async () => {
    const [{ id }] = await sys(db, `select id from admin_approval_requests where kind = 'customer_profile_clear' and target_id = $1 and status = 'pending'`, [customer]);
    const [done] = await as(db, secondOwner, `select admin_decide_approval($1, 'approve', 'Second owner checked the request') r`, [id]);
    assert.equal(done.r.status, "approved");
    assert.deepEqual(await profile(customer), { first_name: null, last_name: null, email: null, phone_number: null });
    const [event] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'customer.profile_cleared' and target_id = $1`, [customer]);
    assert.equal(event.actor_id, secondOwner.sub);
    assert.equal(event.details.approval_request_id, id);
    assert.equal(event.details.reason, "Customer asked by phone");
  });

  it("a rejected request clears nothing", async () => {
    const other = await createUser(db, { role: "customer" });
    await sys(db, `update profiles set first_name = 'Lama' where id = $1`, [other]);
    const [asked] = await as(db, owner, `select admin_clear_customer_profile($1, 'Wrong customer picked') r`, [other]);
    await as(db, secondOwner, `select admin_decide_approval($1, 'reject', 'Not the requester')`, [asked.r.approval_id]);
    assert.equal((await profile(other)).first_name, "Lama");
  });
});

describe("finding the customer of an off-app privacy request", () => {
  const find = (who, query) => as(db, who, `select admin_privacy_find_customers($1, 'privacy_request') r`, [query]).then((r) => r[0].r);
  let target;
  before(async () => {
    target = await createUser(db, { role: "customer", phone: "+966501112233", verified: true });
    await sys(db, `update profiles set first_name = 'Nouf', last_name = 'Alharbi', email = 'nouf.harbi@example.test' where id = $1`, [target]);
  });

  // F2 (2026-10-16 re-check): the e-mail and the phone match whole values only; partial ones are refused in f123_final_recheck.
  it("finds by name, whole e-mail, whole phone and account id, masking contact details", async () => {
    for (const query of ["Nouf Alh", "Nouf.Harbi@example.test", "050 111 2233", "+966501112233", target]) {
      const result = await find(owner, query);
      const row = result.rows.find((r) => r.id === target);
      assert.ok(row, `found by ${query}`);
      assert.equal(row.email_masked, "n***@example.test");
      assert.equal(row.phone_last4, "2233");
      assert.equal(row.email, undefined, "the full e-mail is never returned");
      assert.equal(row.phone_number, undefined, "the full phone is never returned");
      assert.equal(row.last_initial, "A");
      assert.equal(row.last_name, undefined, "only the initial of the last name is returned");
    }
    assert.ok((await find(operations, "Nouf")).rows.some((r) => r.id === target), "operations works the privacy queue too");
  });

  it("only returns customer accounts, at most 10, and says when there are more", async () => {
    const admins = await find(owner, "test.local");
    assert.ok(admins.rows.every((r) => r.id !== owner.sub && r.id !== finance.sub), "console accounts never come back");
    for (let i = 0; i < 11; i += 1) {
      const id = await createUser(db, { role: "customer" });
      await sys(db, `update profiles set first_name = 'Bulkname' where id = $1`, [id]);
    }
    const many = await find(owner, "Bulkname");
    assert.equal(many.rows.length, 10);
    assert.equal(many.more, true);
  });

  it("refuses roles without privacy.manage, customers and anonymous callers", async () => {
    await expectError(find(finance, "Nouf"), /console role cannot do this/);
    await expectError(find(analyst, "Nouf"), /console role cannot do this/);
    await expectError(find(ROLES.user(target), "Nouf"), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_privacy_find_customers('Nouf')`), /permission denied/);
  });

  it("refuses a query shorter than 3 characters", async () => {
    await expectError(find(owner, "No"), /at least 3 characters/);
  });

  it("records the lookup as a read with the ids returned, never the query text", async () => {
    await find(owner, "nouf.harbi@example.test");
    const [row] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'privacy.subject_lookup' order by created_at desc limit 1`);
    assert.equal(row.actor_id, owner.sub);
    assert.deepEqual(row.details.target_ids, [target]);
    assert.equal(row.details.filter.query_kind, "email");
    assert.ok(!JSON.stringify(row.details).includes("nouf"), "the query text stays out of the log");
  });
});

describe("audit log event classes", () => {
  const list = (cls) => as(db, owner, `select admin_list_audit_events(p_limit => 100, p_purpose => 'audit_review', p_event_class => $1) r`, [cls]).then((r) => r[0].r);

  it("separates changes from reads without deleting either", async () => {
    await as(db, owner, `select admin_role_directory()`);
    const all = await list("all");
    const changes = await list("changes");
    const reads = await list("reads");
    // Each listing is itself a read event: the two listings before the reads query add two reads, no change.
    assert.equal(Number(changes.total) + Number(reads.total), Number(all.total) + 2);
    assert.ok(changes.rows.every((r) => r.is_read === false));
    assert.ok(reads.rows.every((r) => r.is_read === true));
    assert.ok(reads.rows.some((r) => r.action === "roles.directory_read"));
    assert.ok(changes.rows.some((r) => r.action === "approval.requested"));
    assert.ok(Array.isArray(all.target_types) && all.target_types.includes("admin_approval_requests"));
  });

  it("refuses an unknown class and every role without audit.read", async () => {
    await expectError(list("everything"), /all, changes or reads/);
    await expectError(as(db, finance, `select admin_list_audit_events(p_event_class => 'changes')`), /cannot read the audit log/);
    await expectError(as(db, operations, `select admin_list_audit_events(p_event_class => 'reads')`), /cannot read the audit log/);
  });
});

describe("session state", () => {
  const state = (who) => as(db, who, `select admin_session_state() s`).then((r) => r[0].s);

  it("tells a console account its permissions, the role catalogue and the codes left", async () => {
    const s = await state(finance);
    assert.equal(s.console_role, "finance");
    assert.ok(s.permissions.includes("money.ledger"));
    assert.ok(!s.permissions.includes("audit.read"));
    assert.ok(s.role_permissions.owner.includes("audit.read"));
    assert.equal(s.mfa_attempts_left, 10);
    await sys(db, `insert into mfa_verification_failures (user_id, failed_count) values ($1, 3)
                   on conflict (user_id) do update set failed_count = 3`, [finance.sub]);
    assert.equal((await state(finance)).mfa_attempts_left, 7);
  });

  it("gives a customer no role catalogue", async () => {
    const s = await state(ROLES.user(customer));
    assert.equal(s.console_role, null);
    assert.deepEqual(s.role_permissions, {});
    assert.deepEqual(s.permissions, []);
  });
});
