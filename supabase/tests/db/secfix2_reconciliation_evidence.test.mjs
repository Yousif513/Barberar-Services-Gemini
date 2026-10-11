import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// SECFIX-2 R2-H3 (forged Tap evidence), R2-M4 (break closed by any correction), R2-M5 (payouts ignore breaks), R2-L6
// (break-glass resolves breaks). Each reproduction from docs/reviews/2026-10-11-security-round2.md must now fail.
let db;
let owner;
let finance;
let finance2;
const DAY = "2026-09-24"; // a Thursday, in the past
const DAY2 = "2026-09-27";
const ev = (object_type, tap_object_id, amount, extra = {}) => ({ object_type, tap_object_id, amount: String(amount), currency: "SAR", status: "CAPTURED", ...extra });
const importTap = (day, events) => as(db, ROLES.service, `select record_tap_reconciliation_import($1::date, $2::jsonb) r`, [day, JSON.stringify(events)]).then((r) => r[0].r);
const run = (day) => as(db, ROLES.service, `select run_tap_reconciliation($1::date) r`, [day]).then((r) => r[0].r);
const breakOf = async (kind, subject) => (await sys(db, `select * from reconciliation_breaks where kind = $1 and subject = $2 order by opened_at desc limit 1`, [kind, subject]))[0];
const stage = (user, source, day, rows, reason = "Monthly settlement file from the Tap portal") =>
  as(db, user, `select admin_import_reconciliation_file($1, $2::date, $3::jsonb, $4) r`, [source, day, JSON.stringify(rows), reason]).then((r) => r[0].r);

async function ledgerAt(day, intent, amount, providerShare) {
  return (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status, created_at)
    values ($1, 'package_sale', $2, $3::numeric, $3::numeric - $4::numeric, $4::numeric, 'pending', ($5::date + time '12:00') at time zone 'Asia/Riyadh') returning id`,
    [SEED.provider2, intent, amount, providerShare, day]))[0].id;
}

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
});

describe("R2-H3: console files cannot forge Tap charges or refunds", () => {
  it("reproduction: the forged charge file is refused and the break stays open", async () => {
    await ledgerAt(DAY, "chg_unbacked_1", 5000, 4500);
    await importTap(DAY, [ev("charge", "chg_other_real", 10)]);
    await run(DAY);
    assert.equal((await breakOf("ledger_missing_at_tap", "chg_unbacked_1")).status, "open");
    for (const source of ["tap_settlement_file", "bank_statement"]) {
      for (const type of ["charge", "refund"]) {
        await expectError(stage(finance, source, DAY, [ev(type, "chg_unbacked_1", 5000)]), /charges and refunds come only from the Tap API/);
      }
    }
    await run(DAY);
    const still = await breakOf("ledger_missing_at_tap", "chg_unbacked_1");
    assert.equal(still.status, "open");
    assert.equal(still.approval_request_id, null);
  });

  it("a settlement file is staged with its SHA-256 and applied only by a different money.ledger holder", async () => {
    const rows = [{ object_type: "settlement", tap_object_id: "stl_sec2_1", amount: "1.00", currency: "SAR" }];
    const staged = await stage(finance, "tap_settlement_file", DAY, rows);
    assert.equal(staged.status, "pending_approval");
    assert.match(staged.file_sha256, /^[0-9a-f]{64}$/);
    const [imp] = await sys(db, `select status, file_sha256, imported_by from tap_reconciliation_imports where id = $1`, [staged.import_id]);
    assert.deepEqual([imp.status, imp.file_sha256, imp.imported_by], ["pending_approval", staged.file_sha256, finance.sub]);
    assert.equal((await sys(db, `select count(*)::int n from tap_reconciliation_events where tap_object_id = 'stl_sec2_1'`))[0].n, 0, "nothing applied yet");
    await expectError(stage(finance, "tap_settlement_file", DAY, rows), /already imported or is waiting/);
    await expectError(as(db, finance, `select admin_decide_approval($1, 'approve', 'Approving my own file')`, [staged.approval_id]), /own request/);
    await expectError(as(db, owner, `select admin_break_glass_execute($1, 'Nobody else is around to approve this file today')`, [staged.approval_id]),
      /never available|second administrator|for reconciliation_import|own request|Another eligible/);
    await as(db, finance2, `select admin_decide_approval($1, 'approve', 'Matches the Tap portal export')`, [staged.approval_id]);
    const [applied] = await sys(db, `select status, approved_by from tap_reconciliation_imports where id = $1`, [staged.import_id]);
    assert.deepEqual([applied.status, applied.approved_by], ["applied", finance2.sub]);
    const [event] = await sys(db, `select source, amount::float8 amount from tap_reconciliation_events where tap_object_id = 'stl_sec2_1'`);
    assert.deepEqual(event, { source: "tap_settlement_file", amount: 1 }, "file evidence is marked as imported from a file");
  });

  it("the authoritative Tap record is never shadowed: the API version is stored and the disagreement opens a break", async () => {
    await importTap(DAY, [ev("settlement", "stl_sec2_1", 900, { status: "PAID" })]);
    const versions = await sys(db, `select source, amount::float8 amount from tap_reconciliation_events where tap_object_id = 'stl_sec2_1' order by source`);
    assert.deepEqual(versions, [{ source: "tap_api", amount: 900 }, { source: "tap_settlement_file", amount: 1 }]);
    const conflict = await breakOf("evidence_conflict", "settlement:stl_sec2_1:tap_api");
    assert.equal(conflict.status, "open");
    assert.deepEqual([Number(conflict.tap_amount), Number(conflict.ledger_amount)], [900, 1]);
    await run(DAY);
    assert.equal((await breakOf("evidence_conflict", "settlement:stl_sec2_1:tap_api")).status, "open", "a conflict never auto-closes");
  });

  it("a rejected file is marked rejected and never applied; a withdrawn one is marked withdrawn", async () => {
    const rejected = await stage(finance, "bank_statement", DAY, [{ object_type: "bank_credit", tap_object_id: "bank-sec2-1", reference: "stl_sec2_1", amount: "900", currency: "SAR" }],
      "Bank statement line for the settlement");
    await as(db, finance2, `select admin_decide_approval($1, 'reject', 'Amount does not match the statement')`, [rejected.approval_id]);
    assert.equal((await sys(db, `select status from tap_reconciliation_imports where id = $1`, [rejected.import_id]))[0].status, "rejected");
    assert.equal((await sys(db, `select count(*)::int n from tap_reconciliation_events where tap_object_id = 'bank-sec2-1'`))[0].n, 0);
    const withdrawn = await stage(finance, "bank_statement", DAY, [{ object_type: "bank_credit", tap_object_id: "bank-sec2-2", reference: "stl_sec2_1", amount: "900", currency: "SAR" }],
      "Bank statement line for the settlement");
    await as(db, finance, `select admin_cancel_approval($1, 'Uploaded the wrong day')`, [withdrawn.approval_id]);
    assert.equal((await sys(db, `select status from tap_reconciliation_imports where id = $1`, [withdrawn.import_id]))[0].status, "withdrawn");
  });

  it("only Tap API evidence auto-closes a charge break", async () => {
    await importTap(DAY, [ev("charge", "chg_unbacked_1", 5000)]);
    await run(DAY);
    assert.equal((await breakOf("ledger_missing_at_tap", "chg_unbacked_1")).status, "auto_matched");
  });
});

describe("R2-M4: a break is corrected only by its own difference", () => {
  let big;
  before(async () => {
    await ledgerAt(DAY2, "chg_sec2_big", 50000, 45000);
    await importTap(DAY2, [ev("charge", "chg_sec2_other", 10)]);
    await run(DAY2);
    big = await breakOf("ledger_missing_at_tap", "chg_sec2_big");
    assert.equal(Number(big.difference), -50000);
  });

  it("reproduction: the generic correction command refuses to cite a break", async () => {
    await expectError(as(db, finance, `select admin_propose_ledger_adjustment($1, 'adjustment', 0, 0.01, 'posting_error', 'rounding correction', 'sec2-m4-generic', null, null, 0, $2)`,
      [big.ledger_id, big.id]), /admin_propose_break_resolution/);
  });

  it("a SAR 0.01 correction is recorded as partial and the SAR 50,000 break stays open", async () => {
    const asked = (await as(db, finance, `select admin_propose_break_resolution($1, 0, 0, 'Tap holds no such charge, first part', 'sec2-m4-part', -0.01) r`, [big.id]))[0].r;
    assert.equal(asked.partial, true);
    const [req] = await sys(db, `select summary from admin_approval_requests where id = $1`, [asked.approval_id]);
    assert.equal(Number(req.summary.break_difference), -50000, "the approver sees the break's difference");
    await as(db, finance2, `select admin_decide_approval($1, 'approve', 'Checked against Tap')`, [asked.approval_id]);
    const after = await breakOf("ledger_missing_at_tap", "chg_sec2_big");
    assert.equal(after.status, "open");
    assert.equal(Number(after.corrected_amount), 0.01);
  });

  it("refuses a correction larger than what is left of the break", async () => {
    await expectError(as(db, finance, `select admin_propose_break_resolution($1, 0, 0, 'Reverse the whole capture', 'sec2-m4-over', -50000)`, [big.id]),
      /at most SAR 49999.99/);
  });

  it("resolves the break when the corrections add up to its difference", async () => {
    const asked = (await as(db, finance, `select admin_propose_break_resolution($1, -44999.99, 0, 'Tap holds no such charge: reverse the rest', 'sec2-m4-rest', -49999.99) r`, [big.id]))[0].r;
    assert.equal(asked.partial, false);
    await as(db, finance2, `select admin_decide_approval($1, 'approve', 'Checked against Tap')`, [asked.approval_id]);
    const done = await breakOf("ledger_missing_at_tap", "chg_sec2_big");
    assert.equal(done.status, "resolved");
    assert.equal(Number(done.corrected_amount), 50000);
  });
});

describe("R2-L6: break-glass never resolves a reconciliation break", () => {
  it("refuses break-glass for a break correction", async () => {
    await ledgerAt(DAY2, "chg_sec2_glass", 300, 270);
    await run(DAY2);
    const b = await breakOf("ledger_missing_at_tap", "chg_sec2_glass");
    const asked = (await as(db, owner, `select admin_propose_break_resolution($1, 0, 0, 'Tap holds no such charge at all', 'sec2-l6-glass', -300) r`, [b.id]))[0].r;
    await expectError(as(db, owner, `select admin_break_glass_execute($1, 'No second person is available today at all')`, [asked.approval_id]),
      /always waits for a second person/);
  });
});

describe("R2-M5: payouts wait for open breaks", () => {
  it("refuses a payout request and a manual settlement while the provider has an open break, and shows the hold to finance", async () => {
    const providerOwner = (await sys(db, `select owner_id from providers where id = $1`, [SEED.provider2]))[0].owner_id;
    await approvedDestination(db, SEED.provider2, "SA0380000000608010167519");
    const payable = await payableLedger(db, SEED.provider2, 500);
    assert.ok((await sys(db, `select count(*)::int n from reconciliation_breaks where provider_id = $1 and status in ('open', 'escalated')`, [SEED.provider2]))[0].n > 0);
    await expectError(as(db, ROLES.user(providerOwner), `select request_provider_payout($1, 100, null, '')`, [SEED.provider2]), /open reconciliation break/);
    await expectError(as(db, finance, `select admin_release_ledger_item($1, 'Paid by hand', 'TRX-123456')`, [payable]), /open reconciliation break/);
  });

  it("finance sees the held amount on the payout list", async () => {
    const providerOwner = (await sys(db, `select owner_id from providers where id = $1`, [SEED.provider2]))[0].owner_id;
    await sys(db, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban, status) values ($1, $2, 50, 'Test Bank', 'SA0380000000608010167519', 'requested')`,
      [SEED.provider2, providerOwner]);
    const list = (await as(db, finance, `select admin_list_payout_requests(null, $1, 10, 0, null) r`, [SEED.provider2]))[0].r;
    assert.ok(list.rows[0].reconciliation_hold.open_breaks >= 1);
  });
});
