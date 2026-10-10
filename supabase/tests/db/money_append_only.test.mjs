import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { approvedDestination, payableLedger } from "./gov1_fixtures.mjs";

// MONEY part 1: D-Q8 (append-only money tables, corrections only as linked entries with maker and a different checker) and the
// GOV-1 security review findings C-1 (no direct money writes), C-2 (booking money columns), H-4 (manual settlement needs a second
// person) and M-1 (the daily refund threshold is serialised).
let db;
let owner;
let finance;
let finance2;
let operations;
let analyst;
let customer2;
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const now = () => Math.floor(Date.now() / 1000);
const stale = (user) => ROLES.user(user.sub, { amr: [{ method: "totp", timestamp: now() - 900 }] });
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
let keySeq = 0;
const key = () => `adj-key-${Date.now()}-${(keySeq += 1)}`;

const propose = (user, args) => as(db, user,
  `select admin_propose_ledger_adjustment(p_entry_id => $1, p_kind => $2, p_provider_share_delta => $3, p_platform_share_delta => $4,
     p_reason_code => $5, p_justification => $6, p_idempotency_key => $7, p_tap_object_id => $8, p_provider_id => $9) r`,
  [args.entry ?? null, args.kind ?? "adjustment", args.provider ?? 0, args.platform ?? 0, args.reason ?? "posting_error",
   args.justification ?? "Original entry posted the wrong share", args.key ?? key(), args.tap ?? null, args.providerId ?? null]).then((rows) => rows[0].r);
const decide = (user, id, decision = "approve") =>
  as(db, user, `select admin_decide_approval($1, $2, 'Checked against the Tap dashboard') r`, [id, decision]).then((rows) => rows[0].r);
const balance = async (providerId) => Number((await sys(db, `select provider_available_balance($1) b`, [providerId]))[0].b);

before(async () => {
  db = await createMigratedDb();
  owner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer" }));
});

describe("C-1: no client role writes a money table directly", () => {
  const writes = [
    ["transactional_ledger", `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
       values ('${SEED.provider1}', 'package_sale', 'chg_forged_c1', 50000, 0, 50000, 'pending')`],
    ["wallet_credits", `insert into wallet_credits (customer_id, amount, reason, source) values ('${SEED.customer}', 9999, 'x', 'compensation')`],
    ["customer_loyalty", `insert into customer_loyalty (customer_id, provider_id, points_balance) values ('${SEED.customer}', '${SEED.provider1}', 100000)`],
    ["loyalty_points_ledger", `update loyalty_points_ledger set points_change = 99999`],
    ["customer_referrals", `update customer_referrals set status = 'rewarded'`],
    ["coupon_redemptions", `delete from coupon_redemptions`],
    ["booking_tips", `update booking_tips set amount = 1000`],
    ["payment_disputes", `update payment_disputes set status = 'resolved_refund'`],
    ["psp_reconciliation_runs", `insert into psp_reconciliation_runs (run_date, status) values (current_date - 400, 'matched')`],
    ["refund_requests", `update refund_requests set amount = 1`],
    ["payout_requests", `update payout_requests set status = 'paid'`],
    ["payment_refund_requests", `delete from payment_refund_requests`],
    ["fee_rules", `update fee_rules set fee_percentage = 0`],
    ["bookings", `update bookings set wallet_credit_amount = 25000`],
  ];
  it("refuses every write, for every client role and every console role", async () => {
    const roles = [["anon", ROLES.anon], ["customer", customer], ["provider owner", owner1], ["owner", owner], ["finance", finance],
      ["operations", operations], ["analyst", analyst]];
    const failures = [];
    for (const [table, sql] of writes) {
      for (const [name, user] of roles) {
        const result = await outcome(as(db, user, sql));
        if (result !== "42501") failures.push(`${name} on ${table}: ${result}`);
      }
    }
    assert.deepEqual(failures, []);
    assert.equal((await sys(db, `select count(*)::int n from transactional_ledger where payment_intent_id = 'chg_forged_c1'`))[0].n, 0);
  });

  it("removes money.write from every console role", async () => {
    assert.equal((await sys(db, `select count(*)::int n from admin_role_permissions where permission = 'money.write'`))[0].n, 0);
    const policies = await sys(db, `select tablename, policyname from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE') and tablename in ('transactional_ledger', 'wallet_credits', 'customer_loyalty',
      'loyalty_points_ledger', 'customer_referrals', 'coupon_redemptions', 'booking_tips', 'payment_disputes', 'psp_reconciliation_runs',
      'payment_refund_requests', 'package_redemptions', 'payout_requests', 'bookings')`);
    assert.deepEqual(policies, [], "no write policy is left on a money table");
  });

  it("keeps console reads and the provider's own payroll setting", async () => {
    assert.ok((await as(db, finance, `select count(*)::int n from psp_reconciliation_runs`))[0].n >= 0);
    await as(db, owner1, `insert into employee_commission_rules (employee_id, provider_id, commission_rate) values ($1, $2, 10)
      on conflict do nothing`, [SEED.employee1, SEED.provider1]);
    assert.equal((await as(db, finance, `update employee_commission_rules set commission_rate = 50 returning id`).catch(() => [])).length, 0);
  });
});

describe("D-Q8: append-only, for every role including the table owner", () => {
  it("never deletes, truncates or rewrites a ledger row; a settling server path may only move its state and lower its shares", async () => {
    const id = await payableLedger(db, SEED.provider1, 120);
    await expectError(sys(db, `delete from transactional_ledger where id = $1`, [id]), /append-only/);
    await expectError(sys(db, `truncate transactional_ledger cascade`), /append-only|never truncated/);
    await expectError(sys(db, `update transactional_ledger set payout_status = 'released' where id = $1`, [id]), /append-only/);
    await expectError(as(db, ROLES.service, `delete from transactional_ledger where id = $1`, [id]), /permission denied/);
    const viaPath = (sql) => sys(db, `with s as (select set_config('primora.ledger_system_write', 'on', true)) ${sql} from s where id = '${id}'`);
    await expectError(viaPath(`update transactional_ledger set total_captured = 1`), /cannot change/);
    await expectError(viaPath(`update transactional_ledger set provider_share = 500`), /never grow/);
    await expectError(viaPath(`update transactional_ledger set refunded_amount = -5`), /never decreases/);
    await viaPath(`update transactional_ledger set provider_share = 100, payout_status = 'pending'`);
    assert.equal(Number((await sys(db, `select provider_share from transactional_ledger where id = $1`, [id]))[0].provider_share), 100);
  });

  it("keeps related money rows: no delete statement, frozen amounts, but an erased customer's promotional rows follow the account", async () => {
    const person = await createUser(db, { role: "customer" });
    const credit = (await sys(db, `insert into wallet_credits (customer_id, amount, reason, source) values ($1, 20, 'Goodwill', 'compensation') returning id`, [person]))[0].id;
    await expectError(sys(db, `delete from wallet_credits where id = $1`, [credit]), /append-only/);
    await expectError(sys(db, `update wallet_credits set amount = 999 where id = $1`, [credit]), /cannot change/);
    await sys(db, `update wallet_credits set remaining_amount = 5 where id = $1`, [credit]);
    await sys(db, `delete from auth.users where id = $1`, [person]);
    assert.equal((await sys(db, `select count(*)::int n from wallet_credits where id = $1`, [credit]))[0].n, 0, "the PDPL erasure cascade still works");
    const guarded = (await sys(db, `select tgrelid::regclass::text t from pg_trigger where tgname = 'trg_money_append_only'`)).map((r) => r.t.replace(/^public\./, ""));
    for (const table of ["transactional_ledger", "payout_allocations", "payout_requests", "refund_requests", "provider_receivables", "provider_fee_invoices",
      "payment_disputes", "psp_reconciliation_runs", "fee_rules", "wallet_credits", "wallet_credit_redemptions", "loyalty_points_ledger", "customer_referrals"]) {
      assert.ok(guarded.includes(table), `${table} carries the append-only trigger`);
    }
  });
});

describe("C-2: booking money columns", () => {
  let bookingId;
  before(async () => {
    const svc = await serviceFor(db, SEED.employee1);
    bookingId = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price,
        total_price, tax_amount, deposit_required, platform_commission, source)
      values ($1, $2, $3, $4, 'confirmed', now() - interval '2 hours', 30, 100, 115, 15, 0, 0, 'link') returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0].id;
  });

  it("freezes wallet credit, package cover, invoice number and fee snapshot for every writer, the table owner included", async () => {
    for (const set of ["wallet_credit_amount = 25000", "package_covered_amount = 50", "invoice_number = 9999", "fee_rule_snapshot = '{}'::jsonb"]) {
      await expectError(sys(db, `update bookings set ${set} where id = $1`, [bookingId]), /immutable/);
    }
    for (const set of ["refund_amount = 10", "cancellation_fee = 10", "discounts_released_at = now()"]) {
      await expectError(sys(db, `update bookings set ${set} where id = $1`, [bookingId]), /only through the command/);
    }
  });

  it("refuses the review's reproduction: operations edits the wallet credit and completes the booking", async () => {
    assert.equal(await outcome(as(db, operations, `update bookings set wallet_credit_amount = 25000 where id = $1`, [bookingId])), "42501");
    assert.equal(await outcome(as(db, owner, `update bookings set status = 'completed' where id = $1`, [bookingId])), "42501");
    assert.equal((await sys(db, `select count(*)::int n from transactional_ledger where booking_id = $1 and entry_type = 'wallet_credit_settlement'`, [bookingId]))[0].n, 0);
  });
});

describe("corrections: linked adjustment and reversal entries with maker and a different checker", () => {
  it("posts a positive provider adjustment only after a different finance user approves, and it becomes payable", async () => {
    const entry = await payableLedger(db, SEED.provider2, 200);
    const before = await balance(SEED.provider2);
    const k = key();
    const asked = await propose(finance, { entry, provider: 50, key: k });
    assert.equal(asked.status, "pending_approval");
    assert.equal(await balance(SEED.provider2), before, "nothing changes while it waits");
    assert.equal((await propose(finance, { entry, provider: 50, key: k })).approval_id, asked.approval_id, "the same key is the same proposal");
    await expectError(decide(finance, asked.approval_id), /your own request/);
    await expectError(decide(operations, asked.approval_id), /cannot decide|permission|access/);
    await expectError(decide(stale(finance2), asked.approval_id), /step-up required/);
    const done = await decide(finance2, asked.approval_id);
    const [row] = await sys(db, `select entry_type, adjusts_entry_id, provider_share, maker_id, checker_id, reason_code, payout_status, approval_request_id
      from transactional_ledger where id = $1`, [done.result.entry_id]);
    assert.deepEqual([row.entry_type, row.adjusts_entry_id, Number(row.provider_share), row.maker_id, row.checker_id, row.reason_code, row.payout_status],
      ["adjustment", entry, 50, finance.sub, finance2.sub, "posting_error", "pending"]);
    assert.equal(await balance(SEED.provider2), before + 50);
    assert.equal((await propose(finance, { entry, provider: 50, key: k })).status, "already_applied", "a replay after approval changes nothing");
    const [audit] = await sys(db, `select actor_id, details from admin_audit_logs where action = 'ledger.correction_posted' and target_id = $1`, [done.result.entry_id]);
    assert.equal(audit.actor_id, finance2.sub);
    assert.equal(audit.details.maker, finance.sub);
  });

  it("turns a negative provider adjustment into a receivable recovered from the next payout, and reverses an entry once", async () => {
    const entry = await payableLedger(db, SEED.provider2, 80);
    const before = await balance(SEED.provider2);
    const neg = await decide(owner, (await propose(finance, { entry, provider: -30 })).approval_id);
    assert.equal(Number((await sys(db, `select amount from provider_receivables where adjustment_entry_id = $1`, [neg.result.entry_id]))[0].amount), 30);
    assert.equal(await balance(SEED.provider2), before - 30);
    const rev = await decide(finance2, (await propose(finance, { entry, kind: "reversal" })).approval_id);
    const [row] = await sys(db, `select entry_type, reverses_entry_id, provider_share from transactional_ledger where id = $1`, [rev.result.entry_id]);
    assert.deepEqual([row.entry_type, row.reverses_entry_id, Number(row.provider_share)], ["reversal", entry, -80]);
    await expectError(propose(finance, { entry, kind: "reversal" }), /already reversed/);
    await expectError(sys(db, `update transactional_ledger set justification = 'edited' where id = $1`, [rev.result.entry_id]), /append-only|cannot change/);
  });

  it("validates input and refuses every role without money.ledger", async () => {
    const entry = await payableLedger(db, SEED.provider2, 10);
    await expectError(propose(finance, { entry, provider: 5, justification: "short" }), /at least 10/);
    await expectError(propose(finance, { entry, provider: 5, reason: "made_up" }), /Unknown reason/);
    await expectError(propose(finance, { entry, provider: 5, reason: "reconciliation_break" }), /Tap object id/);
    await expectError(propose(finance, { entry, provider: 0, platform: 0 }), /at least one amount/);
    await expectError(propose(finance, { entry: "00000000-0000-4000-8000-0000000000ee", provider: 5 }), /not found/);
    await expectError(propose(stale(finance), { entry, provider: 5 }), /step-up required/);
    for (const user of [operations, analyst, customer, owner1, ROLES.anon]) {
      assert.equal(await outcome(propose(user, { entry, provider: 5 })), "42501");
    }
    for (const user of [finance, customer, ROLES.anon]) {
      await expectError(as(db, user, `select gov_exec_ledger_adjustment(r) from admin_approval_requests r limit 1`), /permission denied/);
    }
  });
});

describe("H-4 and M-1", () => {
  it("manual settlement needs money.payout, a bank reference, an approved account and a second person", async () => {
    const id = await payableLedger(db, SEED.provider1, 60);
    for (const user of [operations, analyst, customer, owner1]) {
      assert.equal(await outcome(as(db, user, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-1')`, [id])), "42501");
    }
    assert.equal(await outcome(as(db, finance, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-1')`, [id])), "22023", "no approved account yet");
    await approvedDestination(db, SEED.provider1, "SA0380000000608010167519");
    const asked = (await as(db, finance, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-1') r`, [id]))[0].r;
    assert.equal(asked.status, "pending_approval");
    await expectError(decide(finance, asked.approval_id), /your own request/);
    assert.equal((await decide(owner, asked.approval_id)).result.status, "released");
    const [row] = await sys(db, `select payout_status, settlement_bank_reference from transactional_ledger where id = $1`, [id]);
    assert.deepEqual([row.payout_status, row.settlement_bank_reference], ["released", "TRF-1"]);
  });

  it("serialises the daily refund threshold per administrator", async () => {
    const [fn] = await sys(db, `select provolatile, prosrc from pg_proc where proname = 'refund_needs_approval'`);
    assert.equal(fn.provolatile, "v");
    assert.match(fn.prosrc, /pg_advisory_xact_lock\(hashtext\('primora\.refund_daily:'/);
  });
});

describe("break-glass covers balance adjustments within the cap (D-Q8), never other money changes", () => {
  it("lets a sole owner post an adjustment alone, with a review due, and refuses a settlement", async () => {
    const solo = await createMigratedDb();
    const only = ROLES.user(await createUser(solo, { role: "admin", adminRole: "owner" }));
    const entry = await payableLedger(solo, SEED.provider2, 100);
    const asked = (await as(solo, only, `select admin_propose_ledger_adjustment($1, 'adjustment', 40, 0, 'posting_error', 'Original entry posted the wrong share', 'solo-key-1') r`, [entry]))[0].r;
    const done = (await as(solo, only, `select admin_break_glass_execute($1, 'Only owner available, provider statement dispute upheld') r`, [asked.approval_id]))[0].r;
    assert.equal(done.break_glass, true);
    const [row] = await sys(solo, `select maker_id, checker_id, break_glass from transactional_ledger where id = $1`, [done.result.entry_id]);
    assert.deepEqual([row.maker_id, row.checker_id, row.break_glass], [only.sub, only.sub, true]);
    assert.equal((await sys(solo, `select count(*)::int n from break_glass_reviews where approval_request_id = $1`, [asked.approval_id]))[0].n, 1);
    await approvedDestination(solo, SEED.provider2, "SA4420000001234567891234");
    const settle = (await as(solo, only, `select admin_release_ledger_item($1, 'Paid by transfer', 'TRF-9') r`, [entry]))[0].r;
    await expectError(as(solo, only, `select admin_break_glass_execute($1, 'Only owner available this weekend again')`, [settle.approval_id]), /never available/);
  });
});
