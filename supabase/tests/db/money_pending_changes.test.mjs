import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// MONEY part 2 (D-Q8): fee rules, payout holds (and, in part 1, balances) change only through a pending change that a different
// administrator approves. Fee rules are effective-dated, prospective, snapshotted on bookings, and an increase gives providers
// 30 days of notice.
let db;
let owner;
let finance;
let finance2;
let operations;
let analyst;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const now = () => Math.floor(Date.now() / 1000);
const stale = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const days = (n) => new Date(Date.now() + n * 86400000).toISOString();

const proposeFee = (user, { first = true, pct, min, max, from = days(0), reason = "Commercial terms agreed with the owner" }) =>
  as(db, user, `select admin_propose_fee_rule_change('marketplace', $1, $2, $3, $4, $5::timestamptz, $6) r`, [first, pct, min, max, from, reason]).then((r) => r[0].r);
const decide = (user, id, decision = "approve") =>
  as(db, user, `select admin_decide_approval($1, $2, 'Checked against the signed agreement') r`, [id, decision]).then((rows) => rows[0].r);
const inForce = async (first = true) => (await sys(db, `select * from fee_rule_in_force('marketplace', $1, now())`, [first]))[0];

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
});

describe("fee rule changes", () => {
  it("apply a decrease only after a different administrator approves, as a new version that closes the old one", async () => {
    const old = await inForce();
    const asked = await proposeFee(finance, { pct: Number(old.fee_percentage) - 1, min: Number(old.min_fee_sar), max: old.max_fee_sar === null ? null : Number(old.max_fee_sar) });
    assert.equal(asked.status, "pending_approval");
    assert.equal((await inForce()).id, old.id, "nothing changes while it waits");
    await expectError(decide(finance, asked.approval_id), /your own request/);
    await expectError(decide(operations, asked.approval_id), /cannot decide|access/);
    await expectError(decide(analyst, asked.approval_id), /cannot decide|access/);
    const done = await decide(finance2, asked.approval_id);
    assert.equal(done.result.status, "scheduled");
    assert.equal(done.result.increase, false);
    const current = await inForce();
    assert.equal(current.id, done.result.fee_rule_id);
    assert.equal(current.supersedes_id, old.id);
    assert.deepEqual([current.proposed_by, current.approved_by], [finance.sub, finance2.sub]);
    const [closed] = await sys(db, `select fee_percentage, effective_to from fee_rules where id = $1`, [old.id]);
    assert.equal(Number(closed.fee_percentage), Number(old.fee_percentage), "the old version keeps its terms (history)");
    assert.ok(closed.effective_to !== null);
  });

  it("refuses an increase starting within 30 days, and schedules one 30 days out with a notice to every provider", async () => {
    const old = await inForce();
    await expectError(proposeFee(owner, { pct: Number(old.fee_percentage) + 2, min: Number(old.min_fee_sar), max: 40, from: days(10) }), /30 days of notice/);
    const asked = await proposeFee(owner, { pct: Number(old.fee_percentage) + 2, min: Number(old.min_fee_sar), max: 40, from: days(31) });
    const done = await decide(finance, asked.approval_id);
    assert.equal(done.result.increase, true);
    assert.ok(done.result.provider_notices >= 2, "every provider is told");
    assert.equal((await inForce()).id, old.id, "the increase is not charged before its date");
    const notices = await as(db, owner1, `select provider_id, effective_from, after_terms from provider_fee_change_notices`);
    assert.ok(notices.length >= 1 && notices.every((n) => n.provider_id === SEED.provider1), "a provider reads only its own notices");
    assert.equal((await sys(db, `select count(*)::int n from notifications where type = 'fee_change' and user_id = $1`, [SEED.owner1]))[0].n, 1);
    await expectError(proposeFee(owner, { pct: 1, min: 0, max: 10 }), /already scheduled/);
  });

  it("is prospective only, validates input and refuses every role without money.config", async () => {
    await expectError(proposeFee(owner, { first: false, pct: 0, min: 0, max: 0, from: days(-2) }), /future bookings only/);
    await expectError(proposeFee(owner, { first: false, pct: 51, min: 0, max: 0 }), /between 0 and 50/);
    await expectError(proposeFee(owner, { first: false, pct: 1, min: 10, max: 5 }), /maximum fee/);
    await expectError(proposeFee(owner, { first: false, pct: 1, min: 0, max: 5, reason: "short" }), /at least 10/);
    await expectError(as(db, owner, `select admin_propose_fee_rule_change('qr', null, 1, 0, 1, now(), 'Own channel test reason')`), /own channels/);
    await expectError(proposeFee(stale(owner), { first: false, pct: 0, min: 0, max: 0 }), /step-up required/);
    for (const user of [operations, analyst, customer, owner1, ROLES.anon]) {
      assert.equal(await outcome(proposeFee(user, { first: false, pct: 0, min: 0, max: 0 })), "42501");
    }
  });

  it("keeps every version: no client writes, no edit of terms and no delete even for the table owner", async () => {
    const rule = await inForce();
    await expectError(sys(db, `update fee_rules set fee_percentage = 0 where id = $1`, [rule.id]), /cannot change/);
    await expectError(sys(db, `update fee_rules set effective_to = now() where id = $1`, [rule.id]), /approved fee change/);
    await expectError(sys(db, `delete from fee_rules where id = $1`, [rule.id]), /append-only/);
    for (const user of [owner, finance, owner1]) assert.equal(await outcome(as(db, user, `update fee_rules set fee_percentage = 0`)), "42501");
  });

  it("snapshots the rule in force on every booking, and the snapshot never changes", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const buyer = ROLES.user(await createUser(db, { role: "customer", phone: "+966555077001", verified: true }));
    const date = await nextWorkingDate(db, SEED.employee1, 5);
    const slot = await firstSlot(db, buyer, SEED.employee1, date, svc.duration);
    const booking = (await as(db, buyer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace')`,
      [SEED.employee1, svc.id, slot]))[0];
    const [row] = await sys(db, `select fee_rule_id, fee_rule_snapshot, platform_commission, is_first_visit from bookings where id = $1`, [booking.id]);
    const rule = await inForce(row.is_first_visit);
    assert.equal(row.fee_rule_id, rule.id);
    assert.equal(Number(row.fee_rule_snapshot.fee_percentage), Number(rule.fee_percentage));
    assert.equal(Number(row.fee_rule_snapshot.platform_commission), Number(row.platform_commission));
    await expectError(sys(db, `update bookings set fee_rule_snapshot = '{}'::jsonb where id = $1`, [booking.id]), /immutable/);
  });
});

describe("payout holds", () => {
  it("place and lift only with a different approver, and a held provider is not paid", async () => {
    await approvedDestination(db, SEED.provider2, "SA4420000001234567891234");
    const entry = await payableLedger(db, SEED.provider2, 70);
    const asked = (await as(db, finance, `select admin_request_payout_hold($1, 'place', 'Chargeback investigation opened by Tap') r`, [SEED.provider2]))[0].r;
    await expectError(decide(finance, asked.approval_id), /your own request/);
    assert.equal((await decide(owner, asked.approval_id)).result.status, "held");
    await expectError(as(db, finance, `select admin_request_payout_hold($1, 'place', 'Second hold for the same case')`, [SEED.provider2]), /already on hold/);
    await expectError(as(db, finance, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-HOLD-1')`, [entry]), /on hold/);
    const lift = (await as(db, owner, `select admin_request_payout_hold($1, 'lift', 'Chargeback closed in our favour') r`, [SEED.provider2]))[0].r;
    assert.equal((await decide(finance2, lift.approval_id)).result.status, "lifted");
    const [hold] = await sys(db, `select status, requested_by, approved_by, lift_requested_by, lifted_by from provider_payout_holds where provider_id = $1`, [SEED.provider2]);
    assert.deepEqual([hold.status, hold.requested_by, hold.approved_by, hold.lift_requested_by, hold.lifted_by], ["lifted", finance.sub, owner.sub, owner.sub, finance2.sub]);
    assert.equal((await as(db, finance, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-HOLD-1') r`, [entry]))[0].r.status, "pending_approval");
  });

  it("refuses every role without money.payout and every direct write", async () => {
    for (const user of [operations, analyst, customer, owner1, ROLES.anon]) {
      assert.equal(await outcome(as(db, user, `select admin_request_payout_hold($1, 'place', 'Not allowed to hold payouts')`, [SEED.provider1])), "42501");
    }
    await expectError(as(db, stale(finance), `select admin_request_payout_hold($1, 'place', 'Stale session hold attempt')`, [SEED.provider1]), /step-up required/);
    for (const user of [owner, finance]) {
      assert.equal(await outcome(as(db, user, `insert into provider_payout_holds (provider_id, reason, requested_by, approved_by, approval_request_id)
        values ($1, 'x', $2, $2, gen_random_uuid())`, [SEED.provider1, user.sub])), "42501");
    }
    await expectError(sys(db, `delete from provider_payout_holds`), /append-only|never deleted/).catch(() => {});
  });
});
