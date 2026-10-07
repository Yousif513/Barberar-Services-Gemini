import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
const owner1 = ROLES.user(SEED.owner1);
const customer = ROLES.user(SEED.customer);
let admin;

// A completed visit that was paid online (deposit captured), created directly for money tests.
let seq = 0;
async function paidCompletedBooking({ commission = 20, deposit = 17, price = 100, customerId = SEED.customer } = {}) {
  seq += 1;
  const b = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
                           subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source, is_first_visit)
     values ($1, $2, $3, $4, 'confirmed', now() - make_interval(days => $5::int), 30, $6::numeric, $6::numeric, round($6::numeric * 0.15, 2), $7::numeric, $8::numeric, 'marketplace', true)
     returning *`, [customerId, SEED.branch1, SEED.employee1, svc.id, 10 + seq, price, deposit, commission]))[0];
  await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                 values ($1, $2, 'booking_payment', $3, $4::numeric, least($5::numeric, $4::numeric), $4::numeric - least($5::numeric, $4::numeric), 'pending')`,
    [b.id, SEED.provider1, `chg_money_${seq}`, deposit, commission]);
  await as(db, owner1, `select employee_update_booking_status($1, 'completed')`, [b.id]);
  return b;
}

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("purchases need a captured payment", () => {
  it("keeps a gift card unusable until the webhook confirms payment", async () => {
    const r = (await as(db, customer, `select purchase_gift_card('Sara', '+966500000123', null, 200, 'Eid') r`))[0].r;
    assert.equal(r.status, "pending_payment");
    const card = (await sys(db, `select code, status from gift_cards where id = $1`, [r.purchase_id]))[0];
    assert.equal((await as(db, customer, `select preview_gift_card($1) r`, [card.code]))[0].r.valid, false);

    await expectError(as(db, customer, `select confirm_purchase_payment('gift_card', $1, 'chg_x', 200)`, [r.purchase_id]), /permission denied/);
    await expectError(as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, 'chg_gift_1', 150)`, [r.purchase_id]), /does not match/);
    const ok = (await as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, 'chg_gift_1', 200) r`, [r.purchase_id]))[0].r;
    assert.equal(ok.status, "activated");
    const again = (await as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, 'chg_gift_1', 200) r`, [r.purchase_id]))[0].r;
    assert.equal(again.status, "already_recorded");
    const preview = (await as(db, customer, `select preview_gift_card($1) r`, [card.code]))[0].r;
    assert.equal(preview.valid, true);
    assert.equal(Number(preview.remaining_balance), 200);
    await expectError(as(db, ROLES.anon, `select purchase_gift_card('x', '+966500000001', null, 100)`), /permission denied/);
  });

  it("activates a package only after payment and lets only provider staff record sessions", async () => {
    const pkg = (await sys(db, `insert into packages (provider_id, name_en, name_ar, price, session_count, expires_in_days, is_active)
                                values ($1, 'Five cuts', 'خمس قصات', 400, 5, 90, true) returning id`, [SEED.provider1]))[0];
    const r = (await as(db, customer, `select purchase_service_package($1) r`, [pkg.id]))[0].r;
    await expectError(as(db, owner1, `select redeem_package_session($1)`, [r.purchase_id]), /not active/);
    await as(db, ROLES.service, `select confirm_purchase_payment('package', $1, 'chg_pkg_1', 400)`, [r.purchase_id]);
    const row = (await sys(db, `select status, remaining_sessions from user_packages where id = $1`, [r.purchase_id]))[0];
    assert.equal(row.status, "active");
    assert.equal(row.remaining_sessions, 5);
    await expectError(as(db, customer, `select redeem_package_session($1)`, [r.purchase_id]), /provider's staff/);
    const used = (await as(db, owner1, `select redeem_package_session($1) r`, [r.purchase_id]))[0].r;
    assert.equal(used.remaining_sessions, 4);
    const ledger = (await sys(db, `select entry_type, provider_share from transactional_ledger where payment_intent_id = 'chg_pkg_1'`))[0];
    assert.equal(ledger.entry_type, "package_sale");
    assert.equal(Number(ledger.provider_share), 400);
  });

  it("only credits a tip to the provider after it is paid", async () => {
    const b = await paidCompletedBooking();
    const before = (await sys(db, `select provider_available_balance($1) v`, [SEED.provider1]))[0].v;
    const tip = (await as(db, customer, `select add_booking_tip($1, 50) r`, [b.id]))[0].r;
    assert.equal(tip.status, "pending_payment");
    assert.equal(Number((await sys(db, `select provider_available_balance($1) v`, [SEED.provider1]))[0].v), Number(before));
    await as(db, ROLES.service, `select confirm_purchase_payment('tip', $1, 'chg_tip_1', 50)`, [tip.purchase_id]);
    assert.equal(Number((await sys(db, `select provider_available_balance($1) v`, [SEED.provider1]))[0].v), Number(before) + 50);
    const other = await createUser(db);
    await expectError(as(db, ROLES.user(other), `select add_booking_tip($1, 20)`, [b.id]), /Only the booking customer/);
  });

  it("activates a paid plan only after payment and only for the owner", async () => {
    const plan = (await sys(db, `select id, price_monthly_sar from subscription_plans where price_monthly_sar > 0 order by price_monthly_sar limit 1`))[0];
    await expectError(as(db, customer, `select subscribe_provider_plan($1, $2)`, [SEED.provider1, plan.id]), /provider owner/);
    const r = (await as(db, owner1, `select subscribe_provider_plan($1, $2) r`, [SEED.provider1, plan.id]))[0].r;
    assert.equal(r.status, "pending_payment");
    assert.equal((await sys(db, `select count(*)::int n from provider_subscriptions where provider_id = $1 and status = 'active' and plan_id = $2`, [SEED.provider1, plan.id]))[0].n, 0);
    await as(db, ROLES.service, `select confirm_purchase_payment('subscription', $1, 'chg_sub_1', $2)`, [r.purchase_id, plan.price_monthly_sar]);
    const sub = (await sys(db, `select plan_id, status from provider_subscriptions where provider_id = $1`, [SEED.provider1]))[0];
    assert.equal(sub.plan_id, plan.id);
    assert.equal(sub.status, "active");
  });
});

describe("refunds, payouts and reports", () => {
  it("processes refunds only through the service role and updates the ledger", async () => {
    const b = await paidCompletedBooking({ deposit: 40, commission: 20 });
    const refundId = (await as(db, admin, `select admin_create_refund_request($1, 15, 'goodwill') id`, [b.id]))[0].id;
    await expectError(as(db, admin, `select claim_refund_request($1)`, [refundId]), /permission denied/);
    const claim = (await as(db, ROLES.service, `select claim_refund_request($1) r`, [refundId]))[0].r;
    assert.equal(claim.claimed, true);
    assert.equal(Number(claim.amount), 15);
    await as(db, ROLES.service, `select complete_refund_request($1, true, 're_123')`, [refundId]);
    const ledger = (await sys(db, `select refunded_amount, provider_share, platform_share from transactional_ledger where booking_id = $1`, [b.id]))[0];
    assert.equal(Number(ledger.refunded_amount), 15);
    assert.equal(Number(ledger.provider_share), 5, "the provider's share absorbs the refund first");
    assert.equal(Number(ledger.platform_share), 20);
    await expectError(as(db, customer, `select admin_create_refund_request($1, 1, 'x')`, [b.id]), /Administrator/);
  });

  it("never lets the same balance be requested or released twice", async () => {
    const other = await createUser(db, { role: "provider_owner" });
    const prov = (await sys(db, `insert into providers (owner_id, type, business_name_en, business_name_ar, status) values ($1, 'salon_barber_shop', 'Payout Test', 'اختبار', 'active') returning id`, [other]))[0].id;
    for (const amount of [60, 40]) {
      await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                     values ($1, 'package_sale', $2, $3::numeric, 0, $3::numeric, 'pending')`, [prov, `chg_payout_${amount}`, amount]);
    }
    const owner = ROLES.user(other);
    const first = (await as(db, owner, `select * from request_provider_payout($1, 70, 'SNB', 'SA0380000000608010167519')`, [prov]))[0];
    await expectError(as(db, owner, `select request_provider_payout($1, 40, 'SNB', 'SA0380000000608010167519')`, [prov]), /exceeds the available balance/);
    const released = (await as(db, admin, `select admin_release_payout($1, 'release-1', 'Bank transfer made') r`, [first.id]))[0].r;
    assert.equal(released.status, "success");
    assert.equal((await as(db, admin, `select admin_release_payout($1, 'release-1', 'Bank transfer made') r`, [first.id]))[0].r.status, "already_processed");
    const rows = await sys(db, `select provider_share, payout_status from transactional_ledger where provider_id = $1 order by provider_share`, [prov]);
    assert.deepEqual(rows.map((r) => r.payout_status).sort(), ["pending", "released"]);
    assert.equal(Number((await sys(db, `select provider_available_balance($1) v`, [prov]))[0].v), 30);
  });

  it("invoices the fee still owed after what the deposit already covered", async () => {
    const b = await paidCompletedBooking({ commission: 20, deposit: 17, price: 100 });
    const month = new Date(b.scheduled_at).toISOString().slice(0, 10);
    const inv = (await as(db, admin, `select generate_provider_monthly_fee_invoice($1, $2::date) r`, [SEED.provider1, month]))[0].r;
    assert.ok(Number(inv.commission_sar) >= 20);
    assert.ok(Number(inv.already_collected_sar) >= 17);
    assert.equal(Number(inv.total_due_sar), Math.round(Number(inv.receivable_sar) * 115) / 100);
    await expectError(as(db, owner1, `select generate_provider_monthly_fee_invoice($1, $2::date)`, [SEED.provider1, month]), /administrators/);
  });

  it("does not report a reconciliation as matched without Tap figures", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const pending = (await as(db, admin, `select run_daily_psp_reconciliation($1::date) r`, [day]))[0].r;
    assert.equal(pending.status, "awaiting_psp_data");
    const matched = (await as(db, admin, `select run_daily_psp_reconciliation($1::date, $2, $3) r`,
      [day, pending.ledger_captured_sar, pending.ledger_refunded_sar]))[0].r;
    assert.equal(matched.status, "matched");
    const off = (await as(db, admin, `select run_daily_psp_reconciliation($1::date, $2, 0) r`, [day, Number(pending.ledger_captured_sar) + 5]))[0].r;
    assert.equal(off.status, "discrepancy");
  });

  it("turns an upheld dispute into a refund request", async () => {
    const b = await paidCompletedBooking({ deposit: 30 });
    const d = (await as(db, customer, `select open_booking_dispute($1, 'Service was not delivered') r`, [b.id]))[0].r;
    await expectError(as(db, owner1, `select resolve_booking_dispute($1, 'resolved_refund', 'x')`, [d.dispute_id]), /administrators/);
    const res = (await as(db, admin, `select resolve_booking_dispute($1, 'resolved_refund', 'Customer evidence accepted') r`, [d.dispute_id]))[0].r;
    assert.ok(res.refund_request_id);
    const rr = (await sys(db, `select source, amount, status from refund_requests where id = $1`, [res.refund_request_id]))[0];
    assert.equal(rr.source, "dispute");
    assert.equal(Number(rr.amount), 30);
  });

  it("issues a tax invoice only with the provider's real VAT number and never claims FATOORA submission", async () => {
    const b = await paidCompletedBooking();
    await sys(db, `update providers set vat_number = null where id = $1`, [SEED.provider1]);
    await expectError(as(db, customer, `select generate_zatca_tax_invoice($1)`, [b.id]), /has not registered a VAT number/);
    await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
    const inv = (await as(db, customer, `select generate_zatca_tax_invoice($1) r`, [b.id]))[0].r;
    assert.equal(inv.seller_vat_number, "310123456700003");
    assert.equal(inv.zatca_status, "not_submitted");
    const tlv = Buffer.from(inv.zatca_qr_code, "base64");
    assert.equal(tlv[0], 1, "TLV tag 1 (seller name) comes first");
    assert.ok(tlv.includes(Buffer.from("310123456700003")), "QR carries the provider VAT number");
    const again = (await as(db, customer, `select generate_zatca_tax_invoice($1) r`, [b.id]))[0].r;
    assert.equal(again.invoice_number, inv.invoice_number);
  });

  it("chains every invoice of a provider to the one before it, even when they are issued in the same transaction", async () => {
    const first = await paidCompletedBooking();
    const second = await paidCompletedBooking();
    await sys(db, `update providers set vat_number = '310123456700003' where id = $1`, [SEED.provider1]);
    const issued = await db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE authenticated`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "authenticated", sub: SEED.customer })]);
      const a = (await tx.query(`select generate_zatca_tax_invoice($1) r`, [first.id])).rows[0].r;
      const b = (await tx.query(`select generate_zatca_tax_invoice($1) r`, [second.id])).rows[0].r;
      return { a, b };
    });
    assert.equal(issued.b.previous_invoice_hash, issued.a.invoice_hash, "the second invoice follows the first");
    const third = await paidCompletedBooking();
    const c = (await as(db, customer, `select generate_zatca_tax_invoice($1) r`, [third.id]))[0].r;
    assert.equal(c.previous_invoice_hash, issued.b.invoice_hash, "a later invoice follows the newest one, not the oldest transaction start");
  });

  it("charges no platform fee on a returning marketplace client", async () => {
    const fee = (await sys(db, `select calculate_booking_platform_commission('marketplace', false, 200, null) f`))[0].f;
    assert.equal(Number(fee), 0);
  });

  it("books with a paid gift card end to end", async () => {
    const date = await nextWorkingDate(db, SEED.employee1);
    const r = (await as(db, customer, `select purchase_gift_card('Me', '+966500000444', null, 50) r`))[0].r;
    await as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, 'chg_gift_2', 50)`, [r.purchase_id]);
    const code = (await sys(db, `select code from gift_cards where id = $1`, [r.purchase_id]))[0].code;
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const b = (await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_gift_card_code => $4)`,
      [SEED.employee1, svc.id, slot, code]))[0];
    assert.equal(Number(b.gift_card_amount), Math.min(50, Number(b.total_price) + Number(b.tax_amount)));
    await as(db, customer, `select cancel_booking($1, 'cleanup')`, [b.id]);
  });
});
