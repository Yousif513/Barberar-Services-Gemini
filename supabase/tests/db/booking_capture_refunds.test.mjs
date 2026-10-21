import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  as, createMigratedDb, createUser, expectError, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys,
} from "./harness.mjs";

let db;
let service;
let bookingSequence = 0;

before(async () => {
  db = await createMigratedDb();
  service = await serviceFor(db, SEED.employee1);
});
after(async () => { await db?.close(); });

async function booking() {
  const user = ROLES.user(await createUser(db));
  const date = await nextWorkingDate(db, SEED.employee1, 3 + bookingSequence++ * 3);
  const slot = await firstSlot(db, user, SEED.employee1, date, service.duration);
  assert.ok(slot, "a real available slot is required for the fixture");
  const row = (await as(db, user,
    "select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)",
    [SEED.employee1, service.id, slot]))[0];
  assert.ok(Number(row.deposit_required) > 0);
  return { user, row };
}

async function capture(row, suffix, amount = row.deposit_required, caller = ROLES.service) {
  const charge = `chg_binding_${row.id}_${suffix}`;
  const result = (await as(db, caller, "select confirm_booking_payment($1, $2, $3) r", [row.id, charge, amount]))[0].r;
  return { charge, result };
}

async function duplicateCapture() {
  const fixture = await booking();
  const original = await capture(fixture.row, "original");
  assert.equal(original.result.status, "confirmed");
  const duplicate = await capture(fixture.row, "duplicate");
  return { ...fixture, original, duplicate };
}

const ledgers = (id) => sys(db,
  "select * from transactional_ledger where booking_id = $1 order by payment_intent_id", [id]);
const refunds = (id) => sys(db, "select * from refund_requests where booking_id = $1 order by created_at, id", [id]);

describe("booking captured-charge refund binding", () => {
  it("refunds a second distinct capture and leaves the original payment untouched", async () => {
    const { row, original, duplicate } = await duplicateCapture();
    assert.equal(duplicate.result.conflict, true);
    assert.equal(duplicate.result.status, "refund_required");
    const ledger = await ledgers(row.id);
    assert.equal(ledger.length, 2);
    const accepted = ledger.find((r) => r.payment_intent_id === original.charge);
    const extra = ledger.find((r) => r.payment_intent_id === duplicate.charge);
    const requested = await refunds(row.id);
    assert.equal(requested.length, 1);
    assert.equal(requested[0].id, duplicate.result.refund_request_id);
    assert.equal(requested[0].ledger_id, extra.id);
    assert.equal(requested[0].payment_intent_id, duplicate.charge);
    assert.equal(Number(requested[0].amount), Number(extra.total_captured));
    assert.equal(requested[0].idempotency_key, `late:${duplicate.charge}`);
    assert.equal(Number(accepted.refunded_amount), 0);
    assert.equal(accepted.payout_status, "pending");
    assert.equal(extra.payout_status, "refund_pending");
    assert.equal(Number(extra.platform_share), 0);
    assert.equal((await sys(db, "select status from bookings where id = $1", [row.id]))[0].status, "confirmed");
    const audit = await sys(db,
      "select details from admin_audit_logs where action = 'refund.requested' and target_type = 'refund_requests' and target_id = $1",
      [requested[0].id]);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].details.booking_id, row.id);
    assert.equal(Number(audit[0].details.amount), Number(row.deposit_required));
  });

  it("still queues the new capture when the original captured deposit was fully refunded", async () => {
    const { row, user } = await booking();
    const original = await capture(row, "original");
    await as(db, user, "select cancel_booking($1, 'Customer changed plans')", [row.id]);
    const prior = (await refunds(row.id))[0];
    assert.equal(prior.payment_intent_id, original.charge);
    assert.equal((await as(db, ROLES.service, "select claim_refund_request($1) r", [prior.id]))[0].r.claimed, true);
    await as(db, ROLES.service, "select complete_refund_request($1, true, $2)", [prior.id, `re_binding_${row.id}`]);
    const duplicate = await capture(row, "after_refund");
    assert.ok(duplicate.result.refund_request_id, "the new capture remains refundable even when the old capture is exhausted");
    const all = await refunds(row.id);
    assert.equal(all.length, 2);
    const next = all.find((r) => r.id === duplicate.result.refund_request_id);
    assert.equal(next.payment_intent_id, duplicate.charge);
    assert.equal(Number(next.amount), Number(row.deposit_required));
    const ledger = await ledgers(row.id);
    assert.equal(next.ledger_id, ledger.find((r) => r.payment_intent_id === duplicate.charge).id);
    assert.equal(Number(ledger.find((r) => r.payment_intent_id === original.charge).refunded_amount), Number(row.deposit_required));
    assert.equal((await sys(db, "select status from bookings where id = $1", [row.id]))[0].status, "cancelled");
  });

  it("returns the same exact-charge conflict refund on replay without another ledger, request or audit", async () => {
    const { row, duplicate } = await duplicateCapture();
    const replay = await capture(row, "duplicate");
    assert.equal(replay.result.conflict, true);
    assert.equal(replay.result.status, "refund_required");
    assert.equal(replay.result.replay, true);
    assert.equal(replay.result.refund_request_id, duplicate.result.refund_request_id);
    assert.equal((await ledgers(row.id)).length, 2);
    assert.equal((await refunds(row.id)).length, 1);
    const audit = await sys(db,
      "select count(*)::int n from admin_audit_logs where action = 'refund.requested' and target_id = $1",
      [duplicate.result.refund_request_id]);
    assert.equal(audit[0].n, 1);
  });

  it("preserves a normal accepted-payment replay and refuses reuse on another booking", async () => {
    const first = await booking();
    const original = await capture(first.row, "original");
    const replay = await capture(first.row, "original");
    assert.equal(replay.result.status, "already_recorded");
    assert.equal(replay.result.conflict, false);
    assert.equal((await ledgers(first.row.id)).length, 1);
    assert.equal((await refunds(first.row.id)).length, 0);
    const second = await booking();
    await expectError(as(db, ROLES.service, "select confirm_booking_payment($1, $2, $3)",
      [second.row.id, original.charge, second.row.deposit_required]), /already assigned to another booking/);
    assert.equal((await ledgers(second.row.id)).length, 0);
  });

  it("preserves refund claim limits, unknown-outcome quarantine and the same refund identity on replay", async () => {
    const { row, duplicate } = await duplicateCapture();
    const id = duplicate.result.refund_request_id;
    const claimed = (await as(db, ROLES.service, "select claim_refund_request($1) r", [id]))[0].r;
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.payment_intent_id, duplicate.charge);
    assert.equal(Number(claimed.amount), Number(row.deposit_required));
    assert.equal((await as(db, ROLES.service, "select claim_refund_request($1) r", [id]))[0].r.claimed, false);
    await as(db, ROLES.service, "select record_refund_outcome_unknown($1, 'Local test: gateway outcome unknown')", [id]);
    const replay = await capture(row, "duplicate");
    assert.equal(replay.result.refund_request_id, id);
    assert.equal(replay.result.replay, true);
    assert.equal((await as(db, ROLES.service, "select claim_refund_request($1) r", [id]))[0].r.claimed, false);
    assert.equal((await refunds(row.id)).length, 1);
  });

  it("completes the duplicate refund against its own ledger only and never claims it again", async () => {
    const { row, original, duplicate } = await duplicateCapture();
    const id = duplicate.result.refund_request_id;
    await as(db, ROLES.service, "select claim_refund_request($1)", [id]);
    await as(db, ROLES.service, "select complete_refund_request($1, true, $2)", [id, `re_binding_${row.id}`]);
    const ledger = await ledgers(row.id);
    const accepted = ledger.find((r) => r.payment_intent_id === original.charge);
    const extra = ledger.find((r) => r.payment_intent_id === duplicate.charge);
    assert.equal(Number(accepted.refunded_amount), 0);
    assert.equal(accepted.payout_status, "pending");
    assert.equal(Number(extra.refunded_amount), Number(extra.total_captured));
    assert.equal(extra.payout_status, "refunded");
    assert.equal((await as(db, ROLES.service, "select claim_refund_request($1) r", [id]))[0].r.claimed, false);
    const replay = await capture(row, "duplicate");
    assert.equal(replay.result.refund_request_id, id);
    assert.equal(replay.result.replay, true);
    assert.equal((await refunds(row.id)).length, 1);
  });

  it("keeps service-only execution and rolls back mismatched captured amounts", async () => {
    const { row, user } = await booking();
    for (const caller of [ROLES.anon, user, ROLES.user(SEED.owner1)]) {
      await expectError(capture(row, "forbidden", row.deposit_required, caller), /permission denied|Service role required/);
    }
    await expectError(capture(row, "wrong_amount", Number(row.deposit_required) + 1), /Captured amount does not match/);
    assert.equal((await ledgers(row.id)).length, 0);
    assert.equal((await refunds(row.id)).length, 0);
    assert.equal((await sys(db, "select status from bookings where id = $1", [row.id]))[0].status, "pending_payment");
  });
});


describe("rejected captures do not increase cancellation or no-show money", () => {
  for (const outcome of ["pending", "failed", "unknown", "succeeded"]) {
    it(`uses only the accepted deposit for a customer late cancellation while the rejected capture refund is ${outcome}`, async () => {
      const { row, user, original, duplicate } = await duplicateCapture();
      const conflictId = duplicate.result.refund_request_id;
      if (outcome !== "pending") {
        await as(db, ROLES.service, "select claim_refund_request($1)", [conflictId]);
        if (outcome === "unknown") {
          await as(db, ROLES.service, "select record_refund_outcome_unknown($1, 'Local test: unknown duplicate refund')", [conflictId]);
        } else {
          await as(db, ROLES.service, "select complete_refund_request($1, $2, $3, $4)", [
            conflictId, outcome === "succeeded",
            outcome === "succeeded" ? `re_binding_cancel_${row.id}` : null,
            outcome === "failed" ? "Local test: refund refused" : null,
          ]);
        }
      }

      const policy = (await sys(db,
        "select free_cancellation_hours, late_cancellation_fee_percent from providers where id = $1", [SEED.provider1]))[0];
      assert.ok(Number(policy.free_cancellation_hours) > 0);
      assert.ok(Number(policy.late_cancellation_fee_percent) > 0);
      // Move only this disposable fixture inside the provider's existing late-cancellation window.
      await sys(db, "update bookings set scheduled_at = now() + interval '1 minute' where id = $1 and set_config('primora.reschedule_in_progress', 'on', true) = 'on'", [row.id]);
      const before = Number((await as(db, ROLES.service, "select booking_captured_amount($1) amount", [row.id]))[0].amount);
      assert.equal(before, Number(row.deposit_required));
      const cancelled = (await as(db, user, "select * from cancel_booking($1, 'Customer changed plans')", [row.id]))[0];
      const acceptedAmount = Number(row.deposit_required);
      const fee = Math.min(Math.round(acceptedAmount * Number(policy.late_cancellation_fee_percent)) / 100, acceptedAmount);
      assert.equal(Number(cancelled.cancellation_fee), fee);
      assert.equal(Number(cancelled.refund_amount), acceptedAmount - fee);

      const all = await refunds(row.id);
      const originalRefund = all.find((r) => r.source === "customer_cancellation");
      const conflictRefund = all.find((r) => r.id === conflictId);
      assert.equal(all.length, 2);
      assert.equal(originalRefund.payment_intent_id, original.charge);
      assert.equal(Number(originalRefund.amount), acceptedAmount - fee);
      assert.equal(conflictRefund.payment_intent_id, duplicate.charge);
      assert.equal(conflictRefund.status, outcome);
      assert.equal(Number(conflictRefund.amount), acceptedAmount);
      assert.ok(all.reduce((sum, r) => sum + Number(r.amount), 0) <= acceptedAmount * 2);
      // A normal cancellation reservation does not remove the accepted capture from the existing helper's accounting.
      assert.equal(Number((await as(db, ROLES.service, "select booking_captured_amount($1) amount", [row.id]))[0].amount), acceptedAmount);
    });
  }

  it("uses only the accepted deposit for a no-show, with the duplicate refund separately reserved", async () => {
    const { row, original, duplicate } = await duplicateCapture();
    const conflictId = duplicate.result.refund_request_id;
    await as(db, ROLES.service, "select claim_refund_request($1)", [conflictId]);
    await as(db, ROLES.service, "select record_refund_outcome_unknown($1, 'Local test: unknown duplicate refund')", [conflictId]);
    const policy = (await sys(db, "select no_show_fee_percent from providers where id = $1", [SEED.provider1]))[0];
    assert.ok(Number(policy.no_show_fee_percent) > 0);
    await sys(db, "update bookings set scheduled_at = now() - interval '3 hours' where id = $1 and set_config('primora.reschedule_in_progress', 'on', true) = 'on'", [row.id]);
    const marked = (await as(db, ROLES.user(SEED.owner1), "select * from mark_booking_no_show($1, 'Customer did not arrive')", [row.id]))[0];
    const acceptedAmount = Number(row.deposit_required);
    const fee = Math.min(Math.round(acceptedAmount * Number(policy.no_show_fee_percent)) / 100, acceptedAmount);
    assert.equal(marked.status, "no_show");
    assert.equal(Number(marked.cancellation_fee), fee);
    assert.equal(Number(marked.refund_amount), acceptedAmount - fee);
    const all = await refunds(row.id);
    assert.equal(all.find((r) => r.id === conflictId).payment_intent_id, duplicate.charge);
    const normalRefund = all.find((r) => r.source === "no_show_remainder");
    if (acceptedAmount > fee) {
      assert.equal(all.length, 2);
      assert.equal(normalRefund.payment_intent_id, original.charge);
      assert.equal(Number(normalRefund.amount), acceptedAmount - fee);
    } else {
      assert.equal(all.length, 1);
      assert.equal(normalRefund, undefined);
    }
    const ledger = await ledgers(row.id);
    assert.equal(Number(ledger.find((r) => r.payment_intent_id === original.charge).provider_share), fee);
    assert.equal(Number(ledger.find((r) => r.payment_intent_id === duplicate.charge).provider_share), 0);
    assert.ok(all.reduce((sum, r) => sum + Number(r.amount), 0) <= acceptedAmount * 2);
  });
});
