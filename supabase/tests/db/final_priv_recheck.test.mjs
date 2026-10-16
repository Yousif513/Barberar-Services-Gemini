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
