// FIX-MONEY: M-01 (package, gift card, tip, subscription) and M-07 of docs/reviews/2026-10-08-security-money.md.
// A capture for a purchase that is no longer payable is recorded and queued for refund, never raised (the webhook would retry for ever).
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
});

const pay = (type, id, intent, amount) => as(db, ROLES.service, `select confirm_purchase_payment($1, $2, $3, $4) r`, [type, id, intent, amount]).then((r) => r[0].r);
const trace = async (intent) => ({
  ledger: (await sys(db, `select payout_status, entry_type, total_captured::float8 c from transactional_ledger where payment_intent_id = $1`, [intent]))[0],
  refund: (await sys(db, `select amount::float8 a, status, source from refund_requests where payment_intent_id = $1`, [intent]))[0],
});

async function assertConflict(type, id, intent, amount) {
  const r = await pay(type, id, intent, amount);
  assert.equal(r.conflict, true);
  assert.equal(r.status, "refund_required");
  assert.ok(r.refund_request_id);
  const t = await trace(intent);
  assert.equal(t.ledger.payout_status, "refund_pending");
  assert.equal(t.ledger.c, Number(amount));
  assert.equal(t.refund.a, Number(amount));
  assert.equal(t.refund.source, "late_payment_conflict");
  // A replay of the same charge is answered, names the same refund, and creates nothing new.
  const again = await pay(type, id, intent, amount);
  assert.equal(again.conflict, true);
  assert.equal(again.replay, true);
  assert.equal(again.refund_request_id, r.refund_request_id);
  assert.equal((await sys(db, `select count(*)::int n from refund_requests where payment_intent_id = $1`, [intent]))[0].n, 1);
  assert.equal((await sys(db, `select count(*)::int n from transactional_ledger where payment_intent_id = $1`, [intent]))[0].n, 1);
}

describe("M-01 family: a capture for a purchase that is no longer payable is recorded and refunded", () => {
  it("gift card paid twice", async () => {
    const r = (await as(db, customer, `select purchase_gift_card('Sara', '+966500000123', null, 200, 'Eid') r`))[0].r;
    assert.equal((await pay("gift_card", r.purchase_id, "chg_fm_gift_1", 200)).status, "activated");
    await assertConflict("gift_card", r.purchase_id, "chg_fm_gift_2", 200);
  });

  it("package paid twice", async () => {
    const pkg = (await sys(db, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, is_active)
                                values ($1, 'Five cuts', 'five', 400, 5, 90, true) returning id`, [SEED.provider1]))[0];
    const r = (await as(db, customer, `select purchase_service_package($1) r`, [pkg.id]))[0].r;
    assert.equal((await pay("package", r.purchase_id, "chg_fm_pkg_1", 400)).status, "activated");
    await assertConflict("package", r.purchase_id, "chg_fm_pkg_2", 400);
    const t = await trace("chg_fm_pkg_2");
    assert.equal(t.ledger.entry_type, "package_sale");
  });

  it("tip paid twice", async () => {
    const b = (await sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
         tax_amount, deposit_required, platform_commission, source, is_first_visit)
       values ($1, $2, $3, $4, 'confirmed', now() - interval '3 days', 30, 100, 100, 15, 0, 0, 'marketplace', true) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0];
    await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [b.id]);
    const tip = (await as(db, customer, `select add_booking_tip($1, 50) r`, [b.id]))[0].r;
    assert.equal((await pay("tip", tip.purchase_id, "chg_fm_tip_1", 50)).status, "activated");
    await assertConflict("tip", tip.purchase_id, "chg_fm_tip_2", 50);
  });

  it("a superseded subscription checkout (M-07) that is paid anyway", async () => {
    const first = (await as(db, owner2, `select subscribe_provider_plan($1, 'growth', 'monthly') r`, [SEED.provider2]))[0].r;
    await as(db, owner2, `select subscribe_provider_plan($1, 'elite', 'monthly') r`, [SEED.provider2]);
    await assertConflict("subscription", first.purchase_id, "chg_fm_sub_old", Number(first.amount_sar));
    assert.equal((await sys(db, `select count(*)::int n from provider_subscriptions where provider_id = $1 and tap_subscription_id = 'chg_fm_sub_old'`, [SEED.provider2]))[0].n, 0,
      "the superseded charge must not activate a plan");
  });

  it("an unknown purchase is still an error, and the amount check still applies to live purchases", async () => {
    await assert.rejects(pay("gift_card", "00000000-0000-4000-8000-000000000001", "chg_fm_unknown", 10), /not awaiting payment/);
    const r = (await as(db, customer, `select purchase_gift_card('Sara', '+966500000123', null, 200, 'x') r`))[0].r;
    await assert.rejects(pay("gift_card", r.purchase_id, "chg_fm_short", 150), /does not match/);
  });

  it("only the service role may confirm", async () => {
    const r = (await as(db, customer, `select purchase_gift_card('Sara', '+966500000123', null, 200, 'x') r`))[0].r;
    for (const who of [ROLES.anon, customer, owner1]) {
      await assert.rejects(as(db, who, `select confirm_purchase_payment('gift_card', $1, 'chg_fm_deny', 200)`, [r.purchase_id]), /permission denied|Service role/);
    }
    await assert.rejects(as(db, customer, `select queue_purchase_conflict_refund('gift_card', $1, null, null, 'gift_card_sale', 'chg_fm_x', 1, 1, 0)`, [r.purchase_id]), /permission denied/);
  });
});
