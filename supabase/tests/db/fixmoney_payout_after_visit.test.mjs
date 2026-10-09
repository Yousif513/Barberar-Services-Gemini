// FIX-MONEY: M-09 of docs/reviews/2026-10-08-security-money.md. A deposit is payable only after the visit; a refund after payout books a receivable.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const IBAN = "SA0380000000608010167519";
let db;
let svc;
let admin;
let seq = 0;

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

const balance = async (provider = SEED.provider1) => Number((await sys(db, `select provider_available_balance($1) b`, [provider]))[0].b);
// A paid booking whose visit is `days` days away (negative = in the past), created directly with its captured deposit in the ledger.
async function paidBooking({ days, deposit = 40, commission = 15, status = "confirmed" }) {
  seq += 1;
  const customer = await createUser(db);
  const b = (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
       tax_amount, deposit_required, platform_commission, source, is_first_visit)
     values ($1, $2, $3, $4, $5, now() + make_interval(days => $6::int, mins => $7::int), 30, 100, 100, 15, $8::numeric, $9::numeric, 'marketplace', true) returning *`,
    [customer, SEED.branch1, SEED.employee1, svc.id, status, days, seq * 40, deposit, commission]))[0];
  await sys(db, `insert into transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
                 values ($1, $2, 'booking_payment', $3, $4::numeric, $5::numeric, $4::numeric - $5::numeric, 'pending')`,
    [b.id, SEED.provider1, `chg_fm_pay_${seq}`, deposit, commission]);
  return b;
}
const complete = (id) => sys(db, `update bookings set status = 'completed' where id = $1`, [id]);

describe("M-09: money for a visit that has not happened is not withdrawable", () => {
  it("the deposit of a future booking adds nothing to the balance until the visit is completed", async () => {
    const before0 = await balance();
    const b = await paidBooking({ days: 6, deposit: 42.5, commission: 17 });
    assert.equal(await balance(), before0, "a paid but unperformed booking is not available");
    await expectError(as(db, owner1, `select * from request_provider_payout($1, 1, 'Bank', $2)`, [SEED.provider1, IBAN]), /exceeds the available balance/);
    await complete(b.id);
    assert.equal(await balance(), before0 + 25.5);
  });

  it("a payout release never allocates the deposit of an unperformed booking", async () => {
    const done = await paidBooking({ days: -1, deposit: 40, commission: 10 });
    await complete(done.id);
    const future = await paidBooking({ days: 7, deposit: 40, commission: 10 });
    const avail = await balance();
    const req = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, avail, IBAN]))[0];
    await as(db, admin, `select admin_release_payout($1, 'fm-release-1', 'pay the performed visits')`, [req.id]);
    const rows = await sys(db, `select booking_id, payout_status from transactional_ledger where booking_id = any ($1::uuid[]) order by booking_id`, [[done.id, future.id]]);
    assert.equal(rows.find((r) => r.booking_id === future.id).payout_status, "pending", "the unperformed booking's deposit stays pending");
    assert.equal(rows.find((r) => r.booking_id === done.id).payout_status, "released");
  });

  it("repro M-09: a provider cancellation of a future booking is refunded automatically (nothing was paid out)", async () => {
    await sys(db, `update providers set deposit_percentage = 50 where id = $1`, [SEED.provider1]);
    const date = await nextWorkingDate(db, SEED.employee1, 6);
    const customer = ROLES.user(await createUser(db));
    const slot = (await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]))[0].slot_start;
    const b = (await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`, [SEED.employee1, svc.id, slot]))[0];
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_fm_m09_${b.id}`, b.deposit_required]);
    const available = await balance();
    await as(db, owner1, `select cancel_booking($1, 'provider cancels')`, [b.id]);
    const rr = (await sys(db, `select id from refund_requests where booking_id = $1`, [b.id]))[0];
    const claim = (await as(db, ROLES.service, `select claim_refund_request($1) r`, [rr.id]))[0].r;
    assert.equal(claim.claimed, true, `the customer's refund was refused: ${claim.reason}`);
    assert.ok(available >= 0);
  });
});

describe("M-09: a refund after payout books a receivable instead of failing", () => {
  it("refunds the customer, books the paid-out share against the provider, and recovers it from the next payout", async () => {
    const b = await paidBooking({ days: -2, deposit: 40, commission: 10 });
    await complete(b.id);
    const startBalance = await balance();
    const req = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, startBalance, IBAN]))[0];
    await as(db, admin, `select admin_release_payout($1, 'fm-release-2', 'pay out everything')`, [req.id]);
    assert.equal(await balance(), 0);
    assert.equal((await sys(db, `select payout_status from transactional_ledger where booking_id = $1`, [b.id]))[0].payout_status, "released");

    // the customer wins a dispute after the money left: the refund is no longer refused as already_paid_out
    const refundId = (await as(db, admin, `select admin_create_refund_request($1, 40, 'upheld dispute after payout') id`, [b.id]))[0].id;
    const claim = (await as(db, ROLES.service, `select claim_refund_request($1) r`, [refundId]))[0].r;
    assert.equal(claim.claimed, true);
    const open0 = (await sys(db, `select count(*)::int n from provider_receivables where refund_request_id = $1`, [refundId]))[0].n;
    assert.equal(open0, 0, "nothing is booked until the customer is actually refunded");
    await as(db, ROLES.service, `select complete_refund_request($1, true, 're_fm_1')`, [refundId]);
    const rec = (await sys(db, `select provider_id, amount::float8 a, status from provider_receivables where refund_request_id = $1`, [refundId]))[0];
    assert.equal(rec.provider_id, SEED.provider1);
    assert.equal(rec.a, startBalance, "the whole share that was paid out is owed back");
    assert.equal(rec.status, "open");
    assert.equal(await balance(), -startBalance, "the balance carries the receivable");
    // a replay of the completion cannot book it twice
    await assert.rejects(as(db, ROLES.service, `select complete_refund_request($1, true, 're_fm_1')`, [refundId]), /not being processed/);
    assert.equal((await sys(db, `select count(*)::int n from provider_receivables where refund_request_id = $1`, [refundId]))[0].n, 1);
    await expectError(as(db, owner1, `select * from request_provider_payout($1, 1, 'Bank', $2)`, [SEED.provider1, IBAN]), /exceeds the available balance/);

    // new earnings first cover the receivable; the next release recovers it
    const next = await paidBooking({ days: -1, deposit: 100, commission: 10 });
    await complete(next.id); // provider share 90
    assert.equal(await balance(), 90 - startBalance);
    const req2 = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, 90 - startBalance, IBAN]))[0];
    await as(db, admin, `select admin_release_payout($1, 'fm-release-3', 'pay the net')`, [req2.id]);
    assert.equal((await sys(db, `select status from provider_receivables where refund_request_id = $1`, [refundId]))[0].status, "settled");
    assert.equal(await balance(), 0, "the ledger rows were consumed by the payout plus the recovered receivable");
  });

  it("a failed refund books nothing, and another business or a customer cannot read the receivables", async () => {
    const b = await paidBooking({ days: -3, deposit: 40, commission: 10 });
    await complete(b.id);
    const req = (await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, await balance(), IBAN]))[0];
    await as(db, admin, `select admin_release_payout($1, 'fm-release-4', 'pay out')`, [req.id]);
    const refundId = (await as(db, admin, `select admin_create_refund_request($1, 10, 'goodwill after payout') id`, [b.id]))[0].id;
    await as(db, ROLES.service, `select claim_refund_request($1)`, [refundId]);
    await as(db, ROLES.service, `select complete_refund_request($1, false, null, 'gateway refused')`, [refundId]);
    assert.equal((await sys(db, `select count(*)::int n from provider_receivables where refund_request_id = $1`, [refundId]))[0].n, 0);
    for (const user of [ROLES.user(SEED.customer), owner2]) {
      assert.equal((await as(db, user, `select 1 from provider_receivables`)).length, 0);
    }
    await assert.rejects(as(db, owner1, `insert into provider_receivables (provider_id, ledger_id, refund_request_id, amount, reason) values ($1, $2, $3, 5, 'x')`,
      [SEED.provider1, (await sys(db, `select id from transactional_ledger limit 1`))[0].id, refundId]), /permission denied|row-level security/i);
  });
});
