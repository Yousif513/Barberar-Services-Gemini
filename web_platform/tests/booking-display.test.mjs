import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  receiptAmounts, bookingStatusKey, bookingStatusLabel, settlementKey, policyFromProvider, policySentences,
  cancellationPreview, formatBookingDateTime, formatBookingTime, riyadhDateKey, bookAgainHref,
} from "../src/lib/booking-display.mjs";

// Executes the pure helpers behind the customer receipt, the booking list and the cancel dialog (D-04, R17, D-14, D-29, R23).
describe("receipt arithmetic", () => {
  it("prices a booking the way create_booking does: taxable + VAT, deposit online, rest at the venue", () => {
    // 85 SAR service, 20% deposit: the shop quotes VAT 12.75 and 80.75 at the venue (review R17).
    const r = receiptAmounts({ subtotal_price: 85, discount_amount: 0, total_price: 85, tax_amount: 12.75, deposit_required: 17, gift_card_amount: 0 });
    assert.equal(r.vat, 12.75);
    assert.equal(r.totalDue, 97.75);
    assert.equal(r.deposit, 17);
    assert.equal(r.balanceAtVenue, 80.75);
  });

  it("matches the review's 100 SAR example: venue balance is 95.00, not 80.00", () => {
    const r = receiptAmounts({ total_price: 100, tax_amount: 15, deposit_required: 20 });
    assert.equal(r.balanceAtVenue, 95);
    assert.equal(r.subtotal, 100);
  });

  it("subtracts a gift card from the venue balance and never goes negative", () => {
    assert.equal(receiptAmounts({ total_price: 100, tax_amount: 15, deposit_required: 20, gift_card_amount: 30 }).balanceAtVenue, 65);
    assert.equal(receiptAmounts({ total_price: 100, tax_amount: 15, deposit_required: 0, gift_card_amount: 115 }).balanceAtVenue, 0);
  });

  it("shows a discount against the subtotal and a full prepayment as nothing left at the venue", () => {
    const r = receiptAmounts({ subtotal_price: 100, discount_amount: 10, total_price: 90, tax_amount: 13.5, deposit_required: 103.5 });
    assert.equal(r.discount, 10);
    assert.equal(r.totalDue, 103.5);
    assert.equal(r.balanceAtVenue, 0);
  });

  it("avoids floating point drift and tolerates strings and nulls from PostgREST", () => {
    const r = receiptAmounts({ total_price: "0.1", tax_amount: "0.2", deposit_required: null });
    assert.equal(r.totalDue, 0.3);
    assert.equal(r.balanceAtVenue, 0.3);
    assert.equal(receiptAmounts({}).totalDue, 0);
  });
});

describe("status mapping", () => {
  it("never calls a cancelled or no-show booking confirmed or paid", () => {
    assert.equal(bookingStatusKey("cancelled"), "cancelled");
    assert.equal(bookingStatusLabel("cancelled", "en"), "Cancelled");
    assert.equal(bookingStatusLabel("no_show", "ar"), "لم يحضر");
    assert.equal(settlementKey({ status: "pending_payment", deposit_required: 20 }), "pending");
    assert.equal(settlementKey({ status: "confirmed", deposit_required: 20 }), "paid");
    assert.equal(settlementKey({ status: "completed", deposit_required: 0 }), "not_required");
  });

  it("does not print an unmapped status raw", () => {
    assert.equal(bookingStatusKey("in_service"), "unknown");
    assert.equal(bookingStatusLabel("in_service", "en"), "Unknown");
    assert.ok(!bookingStatusLabel("pending_payment", "en").includes("_"));
  });

  it("does not call a cancellation that kept a late fee refunded", () => {
    assert.equal(settlementKey({ status: "cancelled", cancellation_fee: 10, refund_amount: 0 }), "fee_kept");
    assert.equal(settlementKey({ status: "cancelled", cancellation_fee: 10, refund_amount: 10 }), "partly_refunded");
    assert.equal(settlementKey({ status: "cancelled", cancellation_fee: 0, refund_amount: 20 }), "refunded");
    assert.equal(settlementKey({ status: "cancelled", cancellation_fee: 0, refund_amount: 0 }), "no_charge");
  });
});

describe("cancellation policy", () => {
  const policy = policyFromProvider({ free_cancellation_hours: 24, late_cancellation_fee_percent: 50, no_show_fee_percent: 100, deposit_percentage: 20 });

  it("reads the provider's own numbers and prints them, not literals", () => {
    const own = policyFromProvider({ free_cancellation_hours: 6, late_cancellation_fee_percent: 30, no_show_fee_percent: 70, deposit_percentage: 40 });
    const en = policySentences(own, "en").join(" ");
    assert.match(en, /6 hours/);
    assert.match(en, /30%/);
    assert.match(en, /70%/);
    assert.doesNotMatch(en, /24 hours|50%|100%/);
    assert.equal(policyFromProvider(null), null);
  });

  it("describes a provider without a free window or fees", () => {
    const none = policyFromProvider({ free_cancellation_hours: 0, late_cancellation_fee_percent: 0, no_show_fee_percent: 0 });
    assert.match(policySentences(none, "en")[0], /no free-cancellation window/);
    assert.match(policySentences(none, "ar")[1], /لا يُخصم/);
  });

  it("previews the fee only for a paid booking cancelled inside the free window", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const late = cancellationPreview({ status: "confirmed", scheduledAt: "2026-10-07T20:00:00Z", now, depositRequired: 20, policy });
    assert.equal(late.late, true);
    assert.equal(late.fee, 10);
    assert.equal(late.refund, 10);
    const early = cancellationPreview({ status: "confirmed", scheduledAt: "2026-10-10T20:00:00Z", now, depositRequired: 20, policy });
    assert.equal(early.late, false);
    assert.equal(early.fee, 0);
    assert.equal(early.refund, 20);
    const unpaid = cancellationPreview({ status: "pending_payment", scheduledAt: "2026-10-07T20:00:00Z", now, depositRequired: 20, policy });
    assert.equal(unpaid.fee, 0);
    assert.equal(unpaid.refund, 0);
  });
});

describe("dates and links", () => {
  it("formats in Asia/Riyadh in the active language", () => {
    // 21:30 UTC is 00:30 the next day in Riyadh (UTC+3).
    assert.equal(riyadhDateKey(new Date("2026-10-07T21:30:00Z")), "2026-10-08");
    assert.match(formatBookingDateTime("2026-10-07T21:30:00Z", "en"), /8 October 2026/);
    assert.match(formatBookingTime("2026-10-07T15:00:00Z", "en"), /6:00\s?pm/i);
    assert.match(formatBookingDateTime("2026-10-07T15:00:00Z", "ar"), /[٠-٩]/);
    assert.equal(formatBookingDateTime("not a date", "en"), "not a date");
  });

  it("links Book Again to the shop with the service, never to /customer/book", () => {
    assert.equal(bookAgainHref("p1", "s 1"), "/shop/p1?service=s%201");
    assert.equal(bookAgainHref("p1", null), "/shop/p1");
    assert.equal(bookAgainHref(null, "s1"), null);
  });
});

import { walletEntryStatus, upcomingDepositTotal } from "../src/lib/booking-display.mjs";

describe("wallet ledger rows (C-D18)", () => {
  const now = new Date("2026-10-07T10:00:00Z");
  const future = "2026-10-12T10:00:00Z";
  const past = "2026-10-01T10:00:00Z";

  it("labels a cancelled booking that kept a late fee as fee kept, never refunded", () => {
    assert.equal(walletEntryStatus({ status: "cancelled", cancellation_fee: 10, refund_amount: 10 }, now), "partly_refunded");
    assert.equal(walletEntryStatus({ status: "cancelled", cancellation_fee: 20, refund_amount: 0 }, now), "fee_kept");
    assert.equal(walletEntryStatus({ status: "cancelled", cancellation_fee: 0, refund_amount: 20 }, now), "refunded");
    assert.equal(walletEntryStatus({ status: "confirmed", scheduled_at: future }, now), "upcoming");
    assert.equal(walletEntryStatus({ status: "confirmed", scheduled_at: past }, now), "completed");
    assert.equal(walletEntryStatus({ status: "completed", scheduled_at: past }, now), "completed");
  });

  it("sums only confirmed, future visits, net of refunds, and ignores completed, cancelled and tip rows", () => {
    const entries = [
      { entry_type: "booking_payment", total_captured: 20, refunded_amount: 0, booking: { status: "confirmed", scheduled_at: future } },
      { entry_type: "booking_payment", total_captured: 30, refunded_amount: 5, booking: { status: "confirmed", scheduled_at: future } },
      { entry_type: "booking_payment", total_captured: 40, refunded_amount: 0, booking: { status: "completed", scheduled_at: past } },
      { entry_type: "booking_payment", total_captured: 50, refunded_amount: 50, booking: { status: "cancelled", scheduled_at: future } },
      { entry_type: "tip", total_captured: 10, refunded_amount: 0, booking: { status: "confirmed", scheduled_at: future } },
      { entry_type: "booking_payment", total_captured: 60, refunded_amount: 0, booking: { status: "confirmed", scheduled_at: past } },
    ];
    assert.equal(upcomingDepositTotal(entries, now), 45);
    assert.equal(upcomingDepositTotal([], now), 0);
  });
});
