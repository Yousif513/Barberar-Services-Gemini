# FIX-CUST report (customer portal screens)

Branch `wp/fixcust`. Scope: `web_platform/src/app/customer/**` (not `layout.tsx`), new pure helper
`web_platform/src/lib/booking-display.mjs`, tests under `web_platform/tests/`. No migrations written.

## Shared helper

`web_platform/src/lib/booking-display.mjs` (plain ES module, JSDoc types): receipt arithmetic (`receiptAmounts`), status
mapping (`bookingStatusKey`, `bookingStatusLabel`, `settlementKey`), provider policy (`policyFromProvider`,
`policySentences`), cancellation preview (`cancellationPreview`), Riyadh-time formatting (`formatBookingDateTime`,
`formatBookingDate`, `formatBookingTime`, `riyadhDateKey`) and `bookAgainHref`. Executed by
`web_platform/tests/booking-display.test.mjs` (13 tests).

## Defects

| Id | Result | Commit | Test / proof |
|----|--------|--------|--------------|
| D-04 / R17 (receipt money, policy) | fixed | see git log (`fixcust: receipt`) | `booking-display.test.mjs` "receipt arithmetic": 85 SAR / 20% case gives VAT 12.75 and 80.75 at the venue; 100 SAR case gives 95.00 (not 80.00) |
| D-14 (headline for cancelled/expired) | fixed | same | "status mapping"; headline, icon, status badge and payment pill all derive from `bookings.status` |
| R17 Pay now + polling | fixed | same | Pay now calls `payment-checkout` with `{ bookingId }` (same body as the shop page); polls every 3 s, 20 times, then offers "Refresh status" |

Receipt details: `subtotal_price, discount_amount, tax_amount, total_price, deposit_required, gift_card_amount,
cancellation_fee, refund_amount` are selected; amount due = `total_price + tax_amount`; venue balance = due - deposit - gift card;
the policy text is generated from the provider's `free_cancellation_hours`, `late_cancellation_fee_percent`,
`no_show_fee_percent` (no literals). Cancelled and no-show receipts show the fee kept and the refund from the booking row.
