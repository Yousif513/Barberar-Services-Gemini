// PAY-WAVE2, red team RT-H2 and the prepaid half of M-09 (docs/reviews/2026-10-17-redteam-whole-stack.md): cancelling a paid
// membership refunds the customer through the refund queue, and prepaid value (memberships, packages) is payable to the provider only
// as it is earned. Gift cards stay a platform liability until a booking that used them is completed.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { approvedDestination, releaseWithApproval } from "./gov1_fixtures.mjs";

const IBAN = "SA0380000000608010167519";
const customer = ROLES.user(SEED.customer);
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const money = (n) => Math.round(Number(n) * 100) / 100;
let db;
let svc;
let finance;
let finance2;
let operations;
let analyst;
let stranger;
let consoleOwner;
let seq = 0;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  finance = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  finance2 = ROLES.user(await createUser(db, { role: "admin", adminRole: "finance" }));
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
  analyst = ROLES.user(await createUser(db, { role: "admin", adminRole: "analyst" }));
  stranger = ROLES.user(await createUser(db));
  consoleOwner = ROLES.user(await createUser(db, { role: "admin", adminRole: "owner" }));
  await approvedDestination(db, SEED.provider1, IBAN);
});

const balance = async (provider = SEED.provider1) => money((await sys(db, `select provider_available_balance($1) v`, [provider]))[0].v);
const plan = async ({ price = 1200, days = 365, visits = 12 } = {}) => {
  const p = (await as(db, owner1, `select provider_create_membership_plan($1, 'Gold', 'ذهبي', null, null, $2, $3, $4, true, '{}'::uuid[]) r`,
    [SEED.provider1, price, days, visits]))[0].r;
  await as(db, owner1, `select provider_set_membership_plan_active($1, true)`, [p.plan_id]);
  return p.plan_id;
};
// A paid, active membership of the seed customer.
const membership = async (over = {}) => {
  const planId = await plan(over);
  const m = (await as(db, over.user ?? customer, `select purchase_membership($1, $2) r`, [planId, `pw2-prepaid-${(seq += 1)}-${Date.now()}`]))[0].r;
  const intent = `chg_pw2_prepaid_${seq}_${Date.now()}`;
  await as(db, ROLES.service, `select confirm_membership_payment($1, $2, $3)`, [m.membership_id, intent, over.price ?? 1200]);
  return { id: m.membership_id, intent };
};
const ledgerOf = async (intent) => (await sys(db, `select * from transactional_ledger where payment_intent_id = $1`, [intent]))[0];
// A confirmed booking of the customer at the first provider, `days` ahead, created directly as the table owner.
async function booking({ days = 1, customerId = SEED.customer, giftCard = 0 } = {}) {
  seq += 1;
  return (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit, gift_card_amount)
     values ($1, $2, $3, $4, 'confirmed', now() + make_interval(days => $5::int, mins => $6::int), 30, 100, 100, 15, 0, 0, 'marketplace', false, $7::numeric) returning id`,
    [customerId, SEED.branch1, SEED.employee1, svc.id, days, (seq % 300) * 37, giftCard]))[0].id;
}
const complete = (id) => sys(db, `update bookings set status = 'completed' where id = $1`, [id]);
const redeemVisit = async (membershipId, { done = true } = {}) => {
  const b = await booking();
  const r = (await as(db, owner1, `select redeem_membership_visit($1, $2) r`, [membershipId, b]))[0].r;
  if (done) await complete(b);
  return { booking: b, redemption: r.redemption_id };
};
// Moves the membership's period so that `elapsed` of it has passed (0..1).
const elapse = (id, elapsed, days = 365) => sys(db,
  `update memberships set period_start = now() - make_interval(secs => $2::numeric * $3::int * 86400),
                          period_end = now() + make_interval(secs => (1 - $2::numeric) * $3::int * 86400) where id = $1`, [id, elapsed, days]);
const cancel = (user, id, reason = "closing the programme") => as(db, user, `select cancel_membership($1, $2) r`, [id, reason]).then((r) => r[0].r);
const refundOf = async (id) => (await sys(db, `select * from refund_requests where id = $1`, [id]))[0];
const succeedRefund = async (refundId) => {
  await as(db, ROLES.service, `select claim_refund_request($1)`, [refundId]);
  await as(db, ROLES.service, `select complete_refund_request($1, true, $2, null)`, [refundId, `re_pw2_${refundId.slice(0, 8)}`]);
};

describe("prepaid value is payable only as it is earned", () => {
  it("a membership sale adds nothing; a visit counts once its booking is completed, a voided one never", async () => {
    const b0 = await balance();
    const m = await membership();
    assert.equal(await balance(), b0, "nothing is payable at the sale");
    await expectError(as(db, owner1, `select * from request_provider_payout($1, 1200, 'Bank', $2)`, [SEED.provider1, IBAN]), /exceeds the available balance/);
    const first = await redeemVisit(m.id, { done: false });
    assert.equal(await balance(), b0, "a visit booked but not yet given earns nothing");
    await complete(first.booking);
    assert.equal(await balance(), money(b0 + 100), "1 of 12 visits delivered: SAR 100 earned");
    const second = await redeemVisit(m.id);
    assert.equal(await balance(), money(b0 + 200));
    await as(db, owner1, `select void_membership_redemption($1, 'recorded by mistake')`, [second.redemption]);
    assert.equal(await balance(), money(b0 + 100), "a voided visit is not earned");
  });

  it("a payout pays only the earned part and keeps the sale open for the rest", async () => {
    const b0 = await balance();
    const m = await membership();
    await redeemVisit(m.id);
    await redeemVisit(m.id);
    const earned = await balance();
    assert.equal(money(earned - b0), 200);
    const req = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, earned, IBAN]))[0];
    await releaseWithApproval(db, finance, req.id, `pw2-release-${seq}`, "pay the delivered visits");
    const row = await ledgerOf(m.intent);
    const allocated = money((await sys(db, `select coalesce(sum(amount), 0) a from payout_allocations where ledger_id = $1`, [row.id]))[0].a);
    assert.equal(allocated, 200, "only the two delivered visits were paid out of the sale");
    assert.equal(row.payout_status, "pending", "the rest is earned visit by visit");
    assert.equal(await balance(), 0);
    await redeemVisit(m.id);
    assert.equal(await balance(), 100);
  });

  it("everything left is earned once the membership has ended, unless a refund holds it", async () => {
    const b0 = await balance();
    const m = await membership({ price: 600, days: 30, visits: 6 });
    await redeemVisit(m.id);
    assert.equal(await balance(), money(b0 + 100));
    await sys(db, `update memberships set period_end = now() - interval '1 minute' where id = $1`, [m.id]);
    assert.equal(await balance(), money(b0 + 600), "the period is over: unused visits are not carried over");
    await sys(db, `update memberships set status = 'expired' where id = $1`, [m.id]);
    assert.equal(await balance(), money(b0 + 600));
  });

  it("packages: a session without a booking is earned when recorded, one with a booking when it is completed; an expired package is earned", async () => {
    const pkg = (await as(db, owner1, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, is_active)
                                       values ($1, 'Five', 'خمس', 500, 5, 60, true) returning id`, [SEED.provider1]))[0].id;
    const b0 = await balance();
    const up = (await as(db, customer, `select purchase_service_package($1) r`, [pkg]))[0].r;
    await as(db, ROLES.service, `select confirm_purchase_payment('package', $1, $2, 500)`, [up.purchase_id, `chg_pw2_pkg_earn_${Date.now()}`]);
    assert.equal(await balance(), b0);
    await as(db, owner1, `select redeem_package_session($1)`, [up.purchase_id]);
    assert.equal(await balance(), money(b0 + 100));
    const b = await booking();
    await as(db, owner1, `select redeem_package_session($1, $2)`, [up.purchase_id, b]);
    assert.equal(await balance(), money(b0 + 100));
    await complete(b);
    assert.equal(await balance(), money(b0 + 200));
    await sys(db, `update user_packages set expires_at = now() - interval '1 minute' where id = $1`, [up.purchase_id]);
    assert.equal(await balance(), money(b0 + 500));
  });

  it("the manual bank-transfer settlement refuses a prepaid sale that is not fully earned, and a booking whose visit is still ahead", async () => {
    const m = await membership({ price: 300, visits: 3 });
    const row = await ledgerOf(m.intent);
    await expectError(as(db, finance, `select admin_release_ledger_item($1, 'pay by transfer', 'BANK-REF-1')`, [row.id]), /not fully earned yet/);
    const future = await booking({ days: 4 });
    await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                   values ($1, $2, 'booking_payment', $3, 40, 6, 34, 'pending')`, [future, SEED.provider1, `chg_pw2_future_${seq}`]);
    const futureRow = (await sys(db, `select id from transactional_ledger where booking_id = $1`, [future]))[0];
    await expectError(as(db, finance, `select admin_release_ledger_item($1, 'pay by transfer', 'BANK-REF-2')`, [futureRow.id]), /not earned yet/);
  });

  it("gift cards: the sale is the platform's, never a provider balance; the provider is settled when the booking that used it is completed", async () => {
    const intent = `chg_pw2_gift_${Date.now()}`;
    const b0 = await balance();
    const card = (await sys(db, `insert into gift_cards (code, purchaser_id, recipient_name, recipient_phone, original_amount, remaining_balance, status, expires_at)
                                 values (generate_gift_card_code(), $1, 'Friend', '+966500000001', 200, 200, 'pending_payment', now() + interval '1 year') returning id`,
      [SEED.customer]))[0].id;
    await as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, $2, 200)`, [card, intent]);
    const sale = await ledgerOf(intent);
    assert.deepEqual([sale.provider_id, money(sale.provider_share), sale.payout_status], [null, 0, "not_applicable"]);
    assert.equal(await balance(), b0);
    const b = await booking({ giftCard: 50 });
    assert.equal(await balance(), b0, "a booking paid with a gift card is not payable before the visit");
    await complete(b);
    assert.equal(await balance(), money(b0 + 50));
  });
});

describe("cancelling a paid membership refunds the customer", () => {
  it("the customer's own cancellation returns the unused visits, rounded to the halala in the customer's favour", async () => {
    const m = await membership({ price: 1200, visits: 12 });
    for (let i = 0; i < 3; i += 1) await redeemVisit(m.id);
    const preview = (await as(db, customer, `select preview_membership_cancellation($1) r`, [m.id]))[0].r;
    assert.deepEqual([money(preview.refund_amount), preview.refund_rule, preview.cancelled_by], [900, "customer_unused_visits", "customer"]);
    const r = await cancel(customer, m.id, "moving away");
    assert.equal(money(r.refund_amount), 900);
    const refund = await refundOf(r.refund_request_id);
    assert.deepEqual([money(refund.amount), refund.source, refund.status, refund.purchase_type, refund.purchase_id, refund.booking_id],
      [900, "customer_membership_cancellation", "pending", "membership", m.id, null]);
    const row = (await sys(db, `select status, refund_request_id, refund_amount, refund_rule from memberships where id = $1`, [m.id]))[0];
    assert.deepEqual([row.status, row.refund_request_id, money(row.refund_amount), row.refund_rule], ["cancelled", r.refund_request_id, 900, "customer_unused_visits"]);
    const again = await cancel(customer, m.id, "moving away");
    assert.equal(again.replayed, true);
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where purchase_id = $1`, [m.id]))[0].n, 1, "one refund, however often it is asked");

    const thirds = await membership({ price: 1000, visits: 3 });
    await redeemVisit(thirds.id);
    await redeemVisit(thirds.id);
    assert.equal(money((await cancel(customer, thirds.id, "not using it")).refund_amount), 333.33, "1000 x 1/3");
    const twoThirds = await membership({ price: 100, visits: 3 });
    await redeemVisit(twoThirds.id);
    assert.equal(money((await cancel(customer, twoThirds.id, "not using it")).refund_amount), 66.67, "100 x 2/3 rounds half up");
  });

  it("the provider's cancellation returns the greater of the unused visits and the unused time", async () => {
    const visitsWin = await membership();
    for (let i = 0; i < 3; i += 1) await redeemVisit(visitsWin.id);
    await elapse(visitsWin.id, 0.5);
    assert.equal(money((await cancel(owner1, visitsWin.id)).refund_amount), 900, "9 of 12 visits left beats half the time left");

    const timeWins = await membership();
    for (let i = 0; i < 9; i += 1) await redeemVisit(timeWins.id);
    await elapse(timeWins.id, 0.2);
    const r = await cancel(owner1, timeWins.id);
    assert.ok(Math.abs(money(r.refund_amount) - 960) <= 0.05, `80% of the time left beats 3 of 12 visits: ${r.refund_amount}`);
    const refund = await refundOf(r.refund_request_id);
    assert.equal(refund.source, "provider_membership_cancellation");
    const note = (await sys(db, `select title_en, body_en, body_ar from notifications where user_id = $1 and data->>'membership_id' = $2 and title_en = 'Your membership was cancelled'`, [SEED.customer, timeWins.id]))[0];
    assert.match(note.body_en, /The salon cancelled your membership/);
    assert.match(note.body_en, /original payment method/);
    assert.match(note.body_ar, /ر\.س/);
  });

  it("after the provider cancels, the refunded part is never in its balance, and money it was paid beyond its share is owed back", async () => {
    const b0 = await balance();
    const m = await membership();
    for (let i = 0; i < 3; i += 1) await redeemVisit(m.id);
    assert.equal(await balance(), money(b0 + 300));
    const req = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, money(b0 + 300), IBAN]))[0];
    await releaseWithApproval(db, finance, req.id, `pw2-release-cancel-${seq}`, "pay the delivered visits");
    assert.equal(await balance(), 0);
    await elapse(m.id, 0.2);
    const r = await cancel(owner1, m.id);
    const refund = money(r.refund_amount);
    assert.ok(refund > 900, "80% of the year is left");
    assert.equal(await balance(), 0, "the provider gets nothing more while the refund is open");
    await succeedRefund(r.refund_request_id);
    const row = await ledgerOf(m.intent);
    assert.equal(money(row.provider_share), money(1200 - refund));
    const receivable = (await sys(db, `select amount from provider_receivables where refund_request_id = $1`, [r.refund_request_id]))[0];
    assert.equal(money(receivable.amount), money(300 - (1200 - refund)), "paid 300 for visits, entitled to what the refund left");
    assert.equal(await balance(), money(-(300 - (1200 - refund))));
  });

  it("a cancellation of an unpaid membership refunds nothing; an ended one cannot be cancelled; strangers and staff cannot", async () => {
    const planId = await plan({ price: 300, visits: 3 });
    const pending = (await as(db, customer, `select purchase_membership($1, $2) r`, [planId, `pw2-unpaid-${Date.now()}`]))[0].r;
    const r = await cancel(customer, pending.membership_id, "changed my mind");
    assert.deepEqual([money(r.refund_amount), r.refund_request_id], [0, null]);
    const ended = await membership({ price: 300, visits: 3 });
    await sys(db, `update memberships set period_end = now() - interval '1 minute' where id = $1`, [ended.id]);
    await expectError(cancel(customer, ended.id), /already ended/);
    const m = await membership({ price: 300, visits: 3 });
    await expectError(cancel(stranger, m.id), /Membership not found/);
    await expectError(cancel(owner2, m.id), /Membership not found/);
    await expectError(as(db, stranger, `select preview_membership_cancellation($1)`, [m.id]), /Membership not found/);
    await expectError(as(db, ROLES.anon, `select preview_membership_cancellation($1)`, [m.id]), /permission denied/);
  });

  it("only the customer reads the refund of their purchase", async () => {
    const m = await membership({ price: 300, visits: 3 });
    const r = await cancel(customer, m.id, "not for me");
    assert.equal((await as(db, customer, `select id, amount, status from refund_requests where id = $1`, [r.refund_request_id])).length, 1);
    for (const user of [stranger, owner1, owner2]) {
      assert.equal((await as(db, user, `select id from refund_requests where id = $1`, [r.refund_request_id])).length, 0);
    }
    await expectError(as(db, customer, `update refund_requests set amount = 1 where id = $1`, [r.refund_request_id]), /permission denied/);
    await expectError(as(db, customer, `select create_purchase_refund_request_internal('membership', $1, 300, 'admin', 'x', 'x-key')`, [m.id]), /permission denied/);
  });
});

describe("a console cancellation applies the refund approval rules", () => {
  const consoleCancel = (user, id, reason = "Customer asked support to stop it") =>
    as(db, user, `select admin_cancel_membership($1, $2) r`, [id, reason]).then((r) => r[0].r);

  it("the self-service command refuses a console session, and the console command needs step-up, operations.write and a reason", async () => {
    const m = await membership({ price: 300, visits: 3 });
    for (const user of [operations, finance]) await expectError(cancel(user, m.id), /admin_cancel_membership/);
    await expectError(consoleCancel(analyst, m.id), /cannot change memberships/);
    await expectError(consoleCancel(customer, m.id), /Administrator access required/);
    await expectError(consoleCancel(owner1, m.id), /Administrator access required/);
    await expectError(as(db, ROLES.anon, `select admin_cancel_membership($1, 'x')`, [m.id]), /permission denied/);
    await expectError(consoleCancel(operations, m.id, "too short"), /at least 10 characters/);
    await expectError(as(db, ROLES.user(operations.sub, { aal: "aal1", amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] }),
      `select admin_cancel_membership($1, 'Customer asked support to stop it')`, [m.id]), /step-up|authenticator|Administrator access required/);
    assert.equal((await sys(db, `select status from memberships where id = $1`, [m.id]))[0].status, "active");
  });

  it("operations (no money permission) only asks; a different money.refund holder's approval cancels and refunds", async () => {
    const m = await membership({ price: 300, visits: 3 });
    const asked = await consoleCancel(operations, m.id);
    assert.equal(asked.status, "pending_approval");
    assert.equal(money(asked.refund_amount), 300);
    assert.equal((await sys(db, `select status from memberships where id = $1`, [m.id]))[0].status, "active", "asking changes nothing");
    await expectError(as(db, operations, `select admin_decide_approval($1, 'approve', 'my own request')`, [asked.approval_id]), /own request/);
    await expectError(as(db, analyst, `select admin_decide_approval($1, 'approve', 'looks fine')`, [asked.approval_id]), /cannot decide membership_cancellation/);
    const done = (await as(db, finance, `select admin_decide_approval($1, 'approve', 'Checked with the customer') r`, [asked.approval_id]))[0].r;
    assert.equal(done.status, "approved");
    const row = (await sys(db, `select status, refund_request_id, refund_rule from memberships where id = $1`, [m.id]))[0];
    assert.deepEqual([row.status, row.refund_rule], ["cancelled", "greater_of_unused_visits_or_time"]);
    const refund = await refundOf(row.refund_request_id);
    assert.deepEqual([refund.source, refund.requested_by, money(refund.amount)], ["admin_membership_cancellation", finance.sub, 300]);
  });

  it("finance alone cannot cancel; an owner (operations and money) cancels a small refund directly, and SAR 1,000 or more waits for a second person", async () => {
    const small = await membership({ price: 300, visits: 3 });
    await expectError(consoleCancel(finance, small.id), /cannot change memberships/);
    const direct = await consoleCancel(consoleOwner, small.id);
    assert.equal(direct.status, "cancelled");
    assert.equal(money(direct.refund_amount), 300);
    const big = await membership({ price: 1200, visits: 12 });
    const asked = await consoleCancel(consoleOwner, big.id);
    assert.equal(asked.status, "pending_approval");
    assert.equal((await sys(db, `select status from memberships where id = $1`, [big.id]))[0].status, "active");
    await expectError(as(db, consoleOwner, `select admin_break_glass_execute($1, 'Only one admin is on duty for this request')`, [asked.approval_id]), /never available|Break-glass|permission/i);
    const done = (await as(db, finance, `select admin_decide_approval($1, 'approve', 'Second person agrees') r`, [asked.approval_id]))[0].r;
    assert.equal(done.result.status, "cancelled");
  });
});
