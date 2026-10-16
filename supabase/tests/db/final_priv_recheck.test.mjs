import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FINAL: the items docs/reviews/2026-10-11-security-priv-recheck.md left open (M3/N2, M5/N1, N3, N4, N5, N6, N7, N8 and the hold
// renewal note). Every rule has its refusal next to the permitted case.
let db;
let svc;
let owner;
let owner2;
let owner3;
let operations;
let seq = 0;

const nowS = () => Math.floor(Date.now() / 1000);
const otp = (id, age = 10) => ROLES.user(id, { aal: "aal1", amr: [{ method: "otp", timestamp: nowS() - age }] });
const stale = (id) => ROLES.user(id, { amr: [{ method: "totp", timestamp: nowS() - 900 }, { method: "password", timestamp: nowS() - 900 }] });
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const count = async (table, where = "true", params = []) => (await one(`select count(*)::int n from ${table} where ${where}`, params)).n;

async function customer() {
  const id = await createUser(db);
  await sys(db, `update profiles set first_name = 'Sara', last_name = 'Ahmed', email = $2 where id = $1`, [id, `c${id.slice(-4)}@test.local`]);
  return id;
}
async function booking(customerId, status = "completed", daysAgo = 10) {
  seq += 1;
  return (await one(
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit, home_address_text)
     values ($1, $2, $3, $4, $5::booking_status, now() - make_interval(days => $6::int, mins => $7::int), 30, 100, 100, 15, 0, 0, 'marketplace', false, 'Street 1')
     returning id`, [customerId, SEED.branch1, SEED.employee1, svc.id, status, daysAgo, seq * 40])).id;
}
const ledger = (b, charge) => sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share)
                                       values ($1, $2, 'booking_payment', $3, 115, 15, 100)`, [b, SEED.provider1, charge]);
const submit = (user, type, options = {}, details = "Please act on my data") =>
  call(user, `select privacy_submit_request($1, $2, $3::jsonb) r`, [type, details, JSON.stringify(options)]);
const propose = (user, id) => call(user, `select admin_privacy_propose_execution($1, 'Identity verified in app; scope checked') r`, [id]);
const decide = (user, approval, decision = "approve") => call(user, `select admin_decide_approval($1, $2, 'Second person checked it') r`, [approval, decision]);
// An approved deletion of the customer's account (operations proposes, owner2 approves).
async function erase(id) {
  const r = await submit(otp(id), "deletion", { review_choice: "delete_text" });
  const out = await decide(owner2, (await propose(operations, r.id)).approval_id);
  return { request: r, out };
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  owner3 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
});

describe("M3 / N2: a booking with any money record is pseudonymised, never deleted", () => {
  it("keeps a tip, a coupon, a gift-card and a wallet-credit redemption on a cancelled booking with no ledger row", async () => {
    const id = await customer();
    const tipped = await booking(id, "cancelled", 3);
    const couponed = await booking(id, "cancelled", 4);
    const gifted = await booking(id, "cancelled", 5);
    const credited = await booking(id, "cancelled", 6);
    const plain = await booking(id, "cancelled", 7);
    await sys(db, `insert into booking_tips (booking_id, customer_id, employee_id, provider_id, amount) values ($1, $2, $3, $4, 20)`,
      [tipped, id, SEED.employee1, SEED.provider1]);
    const code = (await one(`insert into promotional_codes (code, discount_type, discount_value) values ($1, 'flat', 10) returning id`, [`FINAL${seq}`])).id;
    await sys(db, `insert into coupon_redemptions (coupon_id, customer_id, booking_id, discount_amount, funding_source) values ($1, $2, $3, 10, 'platform')`,
      [code, id, couponed]);
    const card = (await one(`insert into gift_cards (code, purchaser_id, recipient_name, recipient_phone, original_amount, remaining_balance)
                             values ($1, $2, 'Noura', '+966500009911', 100, 70) returning id`, [`GC-FINAL-${seq}`, id])).id;
    await sys(db, `insert into gift_card_redemptions (gift_card_id, customer_id, booking_id, amount) values ($1, $2, $3, 30)`, [card, id, gifted]);
    const credit = (await one(`insert into wallet_credits (customer_id, amount, reason, source) values ($1, 25, 'Goodwill', 'compensation') returning id`, [id])).id;
    await sys(db, `insert into wallet_credit_redemptions (wallet_credit_id, booking_id, customer_id, amount) values ($1, $2, $3, 25)`, [credit, credited, id]);

    const preview = await call(otp(id), `select privacy_deletion_preview() r`);
    assert.equal(Number(preview.bookings_to_pseudonymise), 4, "the four bookings with a money record are kept");
    assert.equal(Number(preview.bookings_to_delete), 1);
    const { out } = await erase(id);
    assert.equal(out.result.summary.deleted.bookings_deleted, 1, "the review's reproduction deleted the tipped booking");
    assert.equal(out.result.summary.deleted.bookings_pseudonymised, 4);
    for (const b of [tipped, couponed, gifted, credited]) {
      const row = await one(`select customer_id, pseudonym_token, retention_until from bookings where id = $1`, [b]);
      assert.ok(row, "the booking is kept");
      assert.equal(row.customer_id, null);
      assert.match(row.pseudonym_token, /^[0-9a-f]{32}$/);
      assert.ok(row.retention_until);
    }
    assert.equal(await count("bookings", "id = $1", [plain]), 0, "a booking with no record of any kind is still deleted");
    assert.equal(await count("booking_tips", "booking_id = $1 and customer_id is null and amount = 20", [tipped]), 1);
    assert.equal(await count("coupon_redemptions", "booking_id = $1 and customer_id is null", [couponed]), 1);
    assert.equal(await count("gift_card_redemptions", "booking_id = $1 and customer_id is null", [gifted]), 1);
    assert.equal(await count("wallet_credit_redemptions", "booking_id = $1 and customer_id is null", [credited]), 1);
  });

  it("refuses to delete a booking that carries a money record by any path, and never cascades the record away", async () => {
    const id = await customer();
    const b = await booking(id, "cancelled", 3);
    await sys(db, `insert into booking_tips (booking_id, customer_id, employee_id, provider_id, amount) values ($1, $2, $3, $4, 15)`,
      [b, id, SEED.employee1, SEED.provider1]);
    await expectError(sys(db, `delete from bookings where id = $1`, [b]), /violates foreign key constraint|booking_tips/);
    assert.equal(await count("booking_tips", "booking_id = $1", [b]), 1);
    const rules = await sys(db, `select c.conrelid::regclass::text t, c.confdeltype d from pg_constraint c
                                  where c.contype = 'f' and c.confrelid = 'public.bookings'::regclass
                                    and exists (select 1 from pg_trigger g where g.tgrelid = c.conrelid and g.tgname = 'trg_money_append_only')`);
    assert.ok(rules.length >= 9);
    assert.deepEqual(rules.filter((r) => r.d !== "r").map((r) => r.t), [], "every money table restricts the booking's deletion");
  });
});

// Every public table row that still names the person must not also name a record a hold kept (or the hold itself).
// The person is named by their id, and also by the id of each of their privacy requests and of the approvals of those requests.
async function rowsLinking(subjectId, needles) {
  const ids = [subjectId, ...(await sys(db, `select id::text i from privacy_requests where subject_id = $1
                                              union select a.id::text from admin_approval_requests a join privacy_requests q on q.id = a.target_id
                                              where q.subject_id = $1`, [subjectId])).map((r) => r.i)];
  const tables = await sys(db, `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
  const hits = [];
  for (const { table_name: t } of tables) {
    const n = (await one(`select count(*)::int n from public."${t}" x where x::text ilike any($1::text[]) and x::text ilike any($2::text[])`,
      [ids.map((v) => `%${v}%`), needles.map((v) => `%${v}%`)])).n;
    if (n) hits.push(t);
  }
  return hits;
}

describe("M5 / N1: after a hold ends nothing ties the erased person to what it kept", () => {
  it("a released dispute hold leaves no run, summary, notice, approval or audit row pairing the person with the booking", async () => {
    const id = await customer();
    const b = await booking(id);
    await ledger(b, `chg_final_n1_${seq}`);
    const dispute = (await one(`insert into payment_disputes (booking_id, customer_id, provider_id, charge_id, disputed_amount_sar, reason, status)
                                values ($1, $2, $3, 'chg_final_n1', 115, 'Not as described', 'opened') returning id`, [b, id, SEED.provider1])).id;
    const { request } = await erase(id);
    const hold = await one(`select * from privacy_legal_holds where dispute_id = $1`, [dispute]);
    assert.equal(hold.status, "active");
    const summary = (await one(`select completion_summary from privacy_requests where id = $1`, [request.id])).completion_summary;
    assert.equal(summary.held[0].reference, `payment_dispute:${dispute}`, "while the hold lasts the customer is told what is held");
    await sys(db, `update payment_disputes set status = 'closed', resolved_at = now() - interval '31 days' where id = $1`, [dispute]);
    assert.ok((await call(ROLES.service, `select privacy_release_due_holds() r`)).released >= 1);

    const token = (await one(`select pseudonym_token from bookings where id = $1`, [b])).pseudonym_token;
    assert.match(token, /^[0-9a-f]{32}$/, "the booking is kept, pseudonymised");
    const needles = [b, dispute, hold.id, token];
    assert.deepEqual(await rowsLinking(id, needles), [], "the review's reproduction: privacy_erasure_runs and the summaries named the booking");
    const after = await one(`select subject_id, booking_id, dispute_id, approval_request_id, case_reference, pseudonym_token from privacy_legal_holds where id = $1`, [hold.id]);
    assert.deepEqual([after.subject_id, after.booking_id, after.dispute_id, after.approval_request_id, after.pseudonym_token], [null, null, null, null, null]);
    assert.equal(after.case_reference, "payment_dispute");
    const done = (await one(`select completion_summary from privacy_requests where id = $1`, [request.id])).completion_summary;
    assert.equal(done.held[0].reference, undefined);
    assert.equal(done.held[0].released, true);
    assert.deepEqual(done.held[0].categories, ["bookings", "messages"], "the customer's record still says a hold existed and ended");
    const runs = await sys(db, `select subject_id, request_id, summary from privacy_erasure_runs where summary::text ilike $1`, [`%${b}%`]);
    assert.deepEqual(runs, [], "no run names the booking");
  });

  it("a hold proposal is audited without the subject or the booking", async () => {
    const id = await customer();
    const hold = await call(operations, `select admin_privacy_propose_legal_hold($1, 'court_case', 'CASE-1447-555', $2::text[], null, $3) r`,
      [id, ["bookings"], "Riyadh commercial court case 1447/555 names this customer"]);
    const rows = await sys(db, `select action, details::text d from admin_audit_logs where target_id = $1`, [hold.hold_id]);
    assert.ok(rows.some((r) => r.action === "privacy.legal_hold_proposed"));
    assert.ok(rows.every((r) => !r.d.includes(id)), "no audit row on the hold names the person");
    await decide(owner, hold.approval_id, "reject");
  });
});

describe("N4: staff notes go with the account", () => {
  it("erases the notes on every request of the person, redacts a later note and never copies a note's text into the audit log", async () => {
    const id = await customer();
    const access = await submit(otp(id), "access");
    await call(operations, `select admin_privacy_add_note($1, 'Customer phoned from 0501234567 asking') r`, [access.id]);
    const del = await submit(otp(id), "deletion", { review_choice: "delete_text" });
    await call(operations, `select admin_privacy_add_note($1, 'Called back on 0501234567, sara@example.com') r`, [del.id]);
    const audit = await sys(db, `select details::text d from admin_audit_logs where action = 'privacy.note_added' and target_id = any($1::uuid[])`, [[access.id, del.id]]);
    assert.equal(audit.length, 2);
    assert.ok(audit.every((r) => !r.d.includes("0501234567") && r.d.includes("note_length")), "the audit log keeps the length, not the text");
    await decide(owner2, (await propose(operations, del.id)).approval_id);
    const notes = await sys(db, `select staff_notes from privacy_requests where subject_id = $1`, [id]);
    assert.ok(notes.length >= 2);
    assert.deepEqual(notes.map((n) => n.staff_notes), notes.map(() => null), "the review's reproduction kept the phone on the deletion request");
    await call(operations, `select admin_privacy_add_note($1, 'Worker retried; customer emailed from x.y@example.com and +966 50 123 4567') r`, [del.id]);
    const later = (await one(`select staff_notes from privacy_requests where id = $1`, [del.id])).staff_notes;
    assert.match(later, /\[redacted e-mail\]/);
    assert.match(later, /\[redacted number\]/);
    assert.ok(!later.includes("example.com") && !later.includes("123 4567"));
    await expectError(call(ROLES.user(id), `select admin_privacy_add_note($1, 'my own note') r`, [del.id]), /privacy.manage|console|permission|Administrator/);
  });
});

const reviewHold = (who, holdId, keep, note) => call(who, `select admin_privacy_review_legal_hold($1, $2, $3) r`, [holdId, keep, note]);
async function courtHold(id, categories, ref) {
  const hold = await call(operations, `select admin_privacy_propose_legal_hold($1, 'court_case', $2, $3::text[], null, $4) r`,
    [id, ref, categories, `Riyadh commercial court case ${ref} names this customer`]);
  await decide(owner, hold.approval_id);
  return hold.hold_id;
}

describe("N3: an early release needs a second person after step-up", () => {
  it("a court hold stays in force until a different privacy.approve holder approves its release; the proposer cannot release alone", async () => {
    const id = await customer();
    const b = await booking(id);
    await ledger(b, `chg_final_n3_${seq}`);
    const holdId = await courtHold(id, ["bookings"], "CASE-1447-301");
    await erase(id);
    const held = await one(`select pseudonym_token from privacy_legal_holds where id = $1`, [holdId]);
    assert.equal((await one(`select pseudonym_token from bookings where id = $1`, [b])).pseudonym_token, held.pseudonym_token);
    const note = "The court case was closed by final judgment";

    await expectError(reviewHold(operations, holdId, false, note), /privacy.approve/);
    await expectError(reviewHold(stale(owner.sub), holdId, false, note), /recent|verif|step|MFA|two-factor|authenticator/i);
    const asked = await reviewHold(owner, holdId, false, note);
    assert.equal(asked.status, "pending_approval");
    assert.equal(asked.release_needs_approval, true);
    assert.equal((await one(`select status from privacy_legal_holds where id = $1`, [holdId])).status, "active", "the review's reproduction released it at once");
    assert.equal((await one(`select pseudonym_token from bookings where id = $1`, [b])).pseudonym_token, held.pseudonym_token, "nothing is finished yet");
    const approval = await one(`select kind, requested_by, summary from admin_approval_requests where id = $1`, [asked.approval_id]);
    assert.equal(approval.kind, "privacy_legal_hold_release");
    assert.ok(!JSON.stringify(approval.summary).includes(id), "the approver is not shown the person's id");
    await expectError(decide(owner, asked.approval_id), /own request/);
    await expectError(decide(operations, asked.approval_id), /cannot decide/);
    await expectError(decide(stale(owner2.sub), asked.approval_id), /recent|verif|step|MFA|two-factor|authenticator/i);
    const out = await decide(owner2, asked.approval_id);
    assert.equal(out.status, "approved");
    const after = await one(`select status, released_by, subject_id from privacy_legal_holds where id = $1`, [holdId]);
    assert.deepEqual([after.status, after.released_by, after.subject_id], ["released", owner2.sub, null]);
    assert.notEqual((await one(`select pseudonym_token from bookings where id = $1`, [b])).pseudonym_token, held.pseudonym_token);
    assert.deepEqual(await rowsLinking(id, [b, holdId]), [], "N1 also holds for a court hold released by approval");
  });

  it("a rejected release leaves the hold as it was", async () => {
    const id = await customer();
    const holdId = await courtHold(id, ["reviews"], "CASE-1447-302");
    const asked = await reviewHold(owner2, holdId, false, "Counsel says the case is about to close");
    await decide(owner, asked.approval_id, "reject");
    assert.equal((await one(`select status, subject_id from privacy_legal_holds where id = $1`, [holdId])).status, "active");
    const again = await reviewHold(owner2, holdId, false, "Counsel confirmed the case closed today");
    assert.notEqual(again.approval_id, asked.approval_id);
    await decide(owner3, again.approval_id);
    assert.equal((await one(`select status from privacy_legal_holds where id = $1`, [holdId])).status, "released");
  });
});

describe("Renewal note: alternating renewals need a fresh owner after 3", () => {
  it("lets two people alternate 3 renewals, then asks an owner who never proposed, approved or renewed the hold", async () => {
    const id = await customer();
    const holdId = await courtHold(id, ["bookings"], "CASE-1447-303");
    const note = "Still pending before the court in Riyadh";
    for (const who of [owner2, owner3, owner2]) assert.equal((await reviewHold(who, holdId, true, note)).status, "active");
    assert.equal((await one(`select renewals from privacy_legal_holds where id = $1`, [holdId])).renewals, 3);
    const asked = await reviewHold(owner3, holdId, true, note);
    assert.equal(asked.status, "pending_approval", "the review's reproduction renewed a 4th time without anyone new");
    assert.equal(asked.renewal_needs_approval, true);
    const before = await one(`select renewals, review_due_at from privacy_legal_holds where id = $1`, [holdId]);
    assert.equal(before.renewals, 3, "not renewed until approved");
    await expectError(decide(owner3, asked.approval_id), /own request/);
    await expectError(decide(owner2, asked.approval_id), /never proposed, approved or renewed/, "an earlier renewer");
    await expectError(decide(owner, asked.approval_id), /never proposed, approved or renewed/, "the approver of the hold");
    const owner4 = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
    const out = await decide(owner4, asked.approval_id);
    assert.equal(out.status, "approved");
    const after = await one(`select renewals, renewed_by, last_reviewed_by from privacy_legal_holds where id = $1`, [holdId]);
    assert.equal(after.renewals, 4);
    assert.ok(after.renewed_by.includes(owner4.sub) && after.renewed_by.includes(owner3.sub));
    // The next renewal again needs someone new: owner4 has now renewed it.
    const next = await reviewHold(owner2, holdId, true, note);
    assert.equal(next.status, "pending_approval");
    await expectError(decide(owner4, next.approval_id), /never proposed, approved or renewed/);
  });
});

describe("N5: moving an incident's awareness time needs a second person and stays in the history", () => {
  const create = (who) => call(who, `select admin_incident_create('Mis-sent export', 'A report with customer phones went to the wrong partner', now() - interval '100 hours', now() - interval '99 hours') r`);
  const fix = `select admin_incident_correct_aware_at($1, $2::timestamptz, $3) r`;
  const why = "The person who first saw it only reported it four days later";

  it("asks, then changes nothing until a different incident.manage holder approves after step-up", async () => {
    const i = await create(owner);
    const later = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    await expectError(call(operations, fix, [i.id, later, why]), /incident.manage/);
    await expectError(call(stale(owner.sub), fix, [i.id, later, why]), /step-up required/);
    const asked = await call(owner, fix, [i.id, later, why]);
    assert.equal(asked.status, "pending_approval");
    const unchanged = await one(`select aware_at, aware_at_corrected_at from privacy_incidents where id = $1`, [i.id]);
    assert.equal(unchanged.aware_at_corrected_at, null, "the review's reproduction moved the clock 99 hours on one person's word");
    assert.equal(new Date(unchanged.aware_at).getTime(), new Date(i.aware_at).getTime());
    await expectError(call(owner, fix, [i.id, later, why]), /already waiting for a second person/);
    await expectError(decide(owner, asked.approval_id), /own request/);
    await expectError(decide(operations, asked.approval_id), /cannot decide/);
    await expectError(decide(stale(owner2.sub), asked.approval_id), /step-up required/);
    const summary = (await one(`select summary from admin_approval_requests where id = $1`, [asked.approval_id])).summary;
    assert.ok(Number(summary.moves_deadline_hours) > 90, "the approver sees how far the deadline moves");
    const done = await decide(owner2, asked.approval_id);
    assert.equal(new Date(done.result.aware_at).getTime(), new Date(later).getTime());
    const events = await sys(db, `select event, actor_id, details from privacy_incident_events where incident_id = $1 order by created_at, event`, [i.id]);
    const requested = events.find((e) => e.event === "aware_at_correction_requested");
    const corrected = events.find((e) => e.event === "aware_at_corrected");
    assert.equal(requested.actor_id, owner.sub);
    assert.equal(corrected.actor_id, owner2.sub);
    assert.equal(corrected.details.requested_by, owner.sub);
    assert.equal(new Date(corrected.details.from).getTime(), new Date(i.aware_at).getTime());
    await expectError(sys(db, `update privacy_incident_events set details = '{}' where incident_id = $1`, [i.id]), /append-only/);
    await expectError(sys(db, `delete from privacy_incident_events where incident_id = $1 and event = 'aware_at_corrected'`, [i.id]), /append-only/);
    assert.equal(await count("privacy_incident_events", "incident_id = $1", [i.id]), events.length);
    await expectError(call(owner2, fix, [i.id, later, why]), /already corrected once/);
  });

  it("a rejected correction leaves the time and records the rejection", async () => {
    const i = await create(owner2);
    const asked = await call(owner2, fix, [i.id, new Date(Date.now() - 3600 * 1000).toISOString(), why]);
    await decide(owner, asked.approval_id, "reject");
    assert.equal((await one(`select aware_at_corrected_at from privacy_incidents where id = $1`, [i.id])).aware_at_corrected_at, null);
    assert.equal(await count("privacy_incident_events", "incident_id = $1 and event = 'aware_at_correction_rejected'", [i.id]), 1);
  });
});

describe("N7: a patch-test recorder reads the result only while still staff of that business", () => {
  it("the recorder loses access when their employment ends; the assigned professional keeps it", async () => {
    const id = await customer();
    const b = await booking(id, "confirmed", -5);
    const recorder = ROLES.user(await createUser(db, { role: "provider_employee" }));
    const emp = (await one(`insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Recorder', 'المسجل') returning id`,
      [SEED.branch1, recorder.sub])).id;
    const assigned = ROLES.user(await createUser(db, { role: "provider_employee" }));
    const before = (await one(`select profile_id from employees where id = $1`, [SEED.employee1])).profile_id;
    await sys(db, `update employees set profile_id = $1 where id = $2`, [assigned.sub, SEED.employee1]);
    try {
      const pt = (await one(`insert into patch_test_results (provider_id, service_id, customer_id, booking_id, result, tested_at, recorded_by)
                             values ($1, $2, $3, $4, 'negative', now(), $5) returning id`, [SEED.provider1, svc.id, id, b, recorder.sub])).id;
      const reads = async (user) => (await as(db, user, `select id from patch_test_results where id = $1`, [pt])).length;
      assert.equal(await reads(recorder), 1, "active staff who recorded it");
      assert.equal(await reads(assigned), 1, "the professional assigned to the booking");
      await sys(db, `update employees set is_active = false where id = $1`, [emp]);
      assert.equal(await reads(recorder), 0, "the review's reproduction: a former employee still read it");
      assert.equal(await reads(assigned), 1);
      await sys(db, `update employees set is_active = true where id = $1`, [emp]);
      await sys(db, `update employees set branch_id = (select id from branches where provider_id = $1 limit 1) where id = $2`, [SEED.provider2, emp]);
      assert.equal(await reads(recorder), 0, "staff of another business now");
      const stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
      await expectError(as(db, stranger, `select * from patch_test_results where id = $1`, [pt]).then((r) => { if (r.length === 0) throw new Error("no rows"); }), /no rows/);
    } finally {
      await sys(db, `update employees set profile_id = $1 where id = $2`, [before, SEED.employee1]);
    }
  });
});

describe("N6: the contact scrub touches only what was the person's while they held the number", () => {
  it("keeps another person's messages under a reassigned number and erases the erased person's own", async () => {
    const id = await customer();
    const A = "+966511110001";
    const B = "+966511110002";
    const W = "+966511110009";
    await sys(db, `update auth.users set created_at = now() - interval '400 days', phone = $2, phone_confirmed_at = now() where id = $1`, [id, A]);
    await sys(db, `update auth.users set phone = $2, phone_confirmed_at = now() where id = $1`, [id, B]);
    // A was added 300 days ago; it was replaced by B 40 days ago (outside the 30-day cooling-off). A was the person's in between.
    await sys(db, `update account_contact_changes set changed_at = case when old_value is null then now() - interval '300 days'
                                                                        else now() - interval '40 days' end where user_id = $1`, [id]);
    const other = await customer();
    await sys(db, `update profiles set phone_number = $2 where id = $1`, [other, A]);
    const walkIn = await booking(id);
    await sys(db, `update bookings set walk_in_phone = $2 where id = $1`, [walkIn, W]);
    const q = (phone, recipient, ageDays, label) => one(
      `insert into message_queue (recipient_phone, recipient_id, channel, template_name, variables, status, created_at)
       values ($1, $2, 'sms', 'reminder', $3::jsonb, 'pending', now() - make_interval(days => $4::int)) returning id`,
      [phone, recipient, JSON.stringify({ label }), ageDays]).then((r) => r.id);
    const mine = await q(A, null, 100, "mine: A before it changed");
    const nowMine = await q(B, null, 2, "mine: B now");
    const theirsAfter = await q(A, null, 5, "theirs: A after it was reassigned");
    const theirsNamed = await q(A, other, 100, "theirs: addressed to the other account");
    const walkInOther = await q(W, other, 3, "theirs: the walk-in number is someone else's");
    const log = (phone, ageDays, body) => one(
      `insert into message_log (recipient_phone, recipient_id, channel, template_name, message_body, status, sent_at)
       values ($1, null, 'sms', 'reminder', $2, 'sent', now() - make_interval(days => $3::int)) returning id`, [phone, body, ageDays]).then((r) => r.id);
    const logMine = await log(A, 90, "Hi Sara");
    const logTheirs = await log(A, 10, "Hi Noura");

    const { request } = await erase(id);
    assert.equal(await count("message_queue", "id = any($1::uuid[])", [[mine, nowMine]]), 0, "the person's own pending messages are gone");
    for (const kept of [theirsAfter, theirsNamed, walkInOther]) {
      const row = await one(`select recipient_phone, variables from message_queue where id = $1`, [kept]);
      assert.ok(row, "the review's reproduction erased another person's message");
      assert.notEqual(row.recipient_phone, null);
      assert.ok(row.variables.label.startsWith("theirs"));
    }
    assert.equal((await one(`select message_body from message_log where id = $1`, [logMine])).message_body, null);
    assert.equal((await one(`select message_body from message_log where id = $1`, [logTheirs])).message_body, "Hi Noura");

    // The worker gets each number with its tenure; WhatsApp is erased only inside it.
    const due = await call(ROLES.service, `select privacy_auth_erasures_due() r`);
    const task = due.requests.find((x) => x.request_id === request.id);
    const tA = task.phone_tenures.find((t) => t.phone === A);
    const tB = task.phone_tenures.find((t) => t.phone === B);
    assert.ok(tA.until && tB.until === null, "A ended when it was replaced; B is current");
    assert.ok(!task.phone_tenures.some((t) => t.phone === W), "a walk-in phone is not an account number");
    // One WhatsApp channel per business and one thread per number per channel: three businesses, one thread each under the number.
    const hash = "a".repeat(64);
    let channelNo = 0;
    const conv = async (ageDays) => {
      channelNo += 1;
      const ownerId = await createUser(db, { role: "provider_owner" });
      const provider = (await one(`insert into providers (owner_id, type, business_name_en, business_name_ar, status)
                                   values ($1, 'salon_barber_shop', $2, 'اختبار', 'active') returning id`, [ownerId, `WA Test ${seq}-${channelNo}`])).id;
      const channel = (await one(`insert into whatsapp_channels (provider_id, phone_number_id) values ($1, $2) returning id`, [provider, `5550${seq}${channelNo}`])).id;
      return (await one(`insert into whatsapp_conversations (provider_id, channel_id, customer_hash, customer_last4, created_at)
                         values ($1, $2, $3, '0001', now() - make_interval(days => $4::int)) returning id`, [provider, channel, hash, ageDays])).id;
    };
    const msg = (c, ageDays, body) => sys(db, `insert into whatsapp_messages (conversation_id, direction, sender, body, created_at)
                                               values ($1, 'inbound', 'customer', $2, now() - make_interval(days => $3::int))`, [c, body, ageDays]);
    const spanning = await conv(120);
    await msg(spanning, 110, "mine");
    await msg(spanning, 20, "theirs");
    const insideOnly = await conv(100);
    await msg(insideOnly, 95, "mine");
    const afterOnly = await conv(15);
    await msg(afterOnly, 14, "theirs");
    const windows = [{ hash, from: tA.from, until: tA.until }];
    await expectError(call(ROLES.service, `select privacy_erase_whatsapp($1, $2::jsonb) r`, [request.id, JSON.stringify([{ hash, until: tA.until }])]), /start of its tenure/);
    await expectError(call(owner, `select privacy_erase_whatsapp($1, $2::jsonb) r`, [request.id, JSON.stringify(windows)]), /erasure worker|permission denied/);
    const threads = await call(ROLES.service, `select privacy_erase_whatsapp($1, $2::jsonb) r`, [request.id, JSON.stringify(windows)]);
    assert.equal(threads, 1, "only the thread that began and ended inside the tenure");
    assert.deepEqual((await sys(db, `select body from whatsapp_messages where conversation_id = $1`, [spanning])).map((r) => r.body), ["theirs"]);
    assert.equal(await count("whatsapp_conversations", "id = $1", [insideOnly]), 0);
    assert.equal(await count("whatsapp_messages", "conversation_id = $1", [afterOnly]), 1);
  });
});
