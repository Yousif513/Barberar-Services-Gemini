// REPRODUCES OPEN DEFECTS M-04 .. M-10 of docs/reviews/2026-10-08-security-money.md.
// Every test asserts the CORRECT behaviour, so each one FAILS until its defect is fixed. This file is named *.repro.mjs on purpose:
// it is not matched by "supabase/tests/db/**/*.test.mjs", so it does not break `npm run test:db`. Run it with
//   node --test supabase/tests/db/review_money_open.repro.mjs
// When a defect is fixed, move its test into a *.test.mjs file. Do not count this file in passing claims.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const PROVIDER2_EMPLOYEE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const IBAN = "SA0380000000608010167519";
let db;

before(async () => {
  db = await createMigratedDb();
});

const freshCustomer = async (opts) => ROLES.user(await createUser(db, opts));
const lastSlot = async (user, employee, svc, date) =>
  (await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 desc limit 1`, [employee, date, svc.duration]))[0].slot_start;
const firstSlotOf = async (user, employee, svc, date) =>
  (await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [employee, date, svc.duration]))[0].slot_start;
const book = async (user, employee, svc, slot, extra = "") =>
  (await as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3${extra})`, [employee, svc.id, slot]))[0];

describe("REPRODUCES OPEN DEFECT M-06 / M-07: subscriptions", () => {
  it("M-06: a yearly plan charges the annual price (12 x the per-month annual rate), not one month of it", async () => {
    const r = (await as(db, owner1, `select subscribe_provider_plan($1, 'growth', 'yearly') r`, [SEED.provider1]))[0].r;
    assert.ok(Number(r.amount_sar) >= 12 * 239, `yearly growth charged ${r.amount_sar}; the screen quotes 12 x 239 = 2868 before VAT`);
  });

});

describe("REPRODUCES OPEN DEFECT M-08 / M-10: first-visit commission can be bypassed by the provider", () => {
  it("M-08: a zero-price walk-in linked to a customer's verified phone does not remove the first-visit commission", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 3);
    const phone = "+966500000123";
    const target = await freshCustomer({ phone, verified: true });
    const control = await freshCustomer();
    const controlBooking = await book(control, SEED.employee1, svc, await firstSlotOf(control, SEED.employee1, svc, date));
    await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'x', $4, 'cash', 0) r`, [SEED.branch1, SEED.employee1, svc.id, phone]);
    const targetBooking = await book(target, SEED.employee1, svc, await lastSlot(target, SEED.employee1, svc, date));
    assert.equal(Number(targetBooking.platform_commission), Number(controlBooking.platform_commission),
      "the customer is still new to the marketplace; commission must equal the control customer's");
  });

  it("M-10: a provider-created 'imported client' row does not make a first marketplace visit fee-free", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 4);
    const phone = "+966500000555";
    const customer = await freshCustomer({ phone, verified: true });
    await as(db, owner1, `insert into provider_client_contacts (provider_id, full_name, phone, consent_confirmed_at) values ($1, 'Lead', $2, now())`, [SEED.provider1, phone]);
    const b = await book(customer, SEED.employee1, svc, await firstSlotOf(customer, SEED.employee1, svc, date), ", request_source => 'import'");
    assert.ok(Number(b.platform_commission) > 0, `claimed import with a contact row created seconds ago gave commission ${b.platform_commission}`);
  });
});

describe("REPRODUCES OPEN DEFECT M-09: payouts of unperformed bookings", () => {
  it("M-09: the deposit of a future booking is not payable, so a provider cancellation can still be refunded", async () => {
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    await sys(db, `update providers set deposit_percentage = 50 where id = $1`, [SEED.provider1]);
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 6);
    const customer = await freshCustomer();
    const b = await book(customer, SEED.employee1, svc, await firstSlotOf(customer, SEED.employee1, svc, date));
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_m09_${b.id}`, b.deposit_required]);
    const available = Number((await sys(db, `select provider_available_balance($1) b`, [SEED.provider1]))[0].b);
    assert.equal(available, 0, "money for a visit that has not happened is not available to withdraw");
    if (available > 0) {
      await as(db, owner1, `select * from request_provider_payout($1, $2, 'Bank', $3)`, [SEED.provider1, available, IBAN]);
      const req = (await sys(db, `select id from payout_requests order by created_at desc limit 1`))[0];
      await as(db, admin, `select admin_release_payout($1, 'key-m09', 'review probe')`, [req.id]);
      await as(db, owner1, `select cancel_booking($1, 'provider cancels')`, [b.id]);
      const rr = (await sys(db, `select id from refund_requests where booking_id = $1`, [b.id]))[0];
      const claim = (await as(db, ROLES.service, `select claim_refund_request($1) r`, [rr.id]))[0].r;
      assert.equal(claim.claimed, true, `the customer's refund was refused: ${claim.reason}`);
    }
  });
});
