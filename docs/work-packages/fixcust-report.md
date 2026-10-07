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
| D-11 (consent writes ignore errors), `customer/settings` | fixed | see git log (`fixcust: settings consent`) | Toggle now calls `record_consent(p_purpose, p_status, p_method)`, reads `{ error }`, rolls the toggle back and shows the server message; toggles stay disabled until the saved choices were read (a failed read shows an error rather than every purpose as withdrawn). Verified by `verify-ui-schema.mjs` (rpc argument names). Same-pattern writes in `login/page.tsx:69-72` and `shop/[id]/page.tsx:1000-1025` are outside this package's files: deferred to their owners |
| D-29 / R23 cancel: failure shown, policy preview, returned fee/refund | fixed | see git log (`fixcust: bookings`) | Cancel is a `CommandDialog` (danger tone): it states the deposit, the fee you will lose and the refund computed from the provider's policy by `cancellationPreview` (unit-tested), lists the provider's terms, and a refused `cancel_booking` is returned to the dialog, which stays open and shows `errorMessage`. After success the message uses the `cancellation_fee` / `refund_amount` of the row `cancel_booking` returns |
| D-29 / R7 reschedule: no fabricated slots | fixed | same | The 10:00-17:00 fallback was deleted. The select now has `employee_id, duration_minutes, services(id, ...)` and branch coordinates; `get_available_slots` receives the same prayer windows as the shop page (`lib/prayer-windows.mjs`, tested). A failed load shows the error with a retry button; no specialist shows a contact-the-provider message |
| R23 statuses, dates, Book Again | fixed | same | statuses via `bookingStatusLabel`, dates via `formatBookingDate/Time/DateTime` (ar-SA / en-GB, Asia/Riyadh), "Book Again" is a `Link` to `/shop/<provider_id>?service=<service_id>` (needs the shop page to read `?service=`, which is not in this package's files) |
| D18 tip copy | fixed | same | The notice now says the whole tip is paid to the provider, no platform commission, and the provider decides how it reaches the specialist (ledger `entry_type = 'tip'` credits the provider) |
| R22 on bookings page | fixed | same | five hand-made `fixed inset-0` modals moved to `ModalPortal`/`ModalOverlay` (focus trap, Escape, inert background, `role="dialog"`); cancel uses `CommandDialog`; icon-only close buttons named; inputs labelled; time and tip chips carry `aria-pressed`; list prices show total incl. VAT |
| R43 reviews page ignores `?booking=` | fixed | see git log (`fixcust: reviews`) | `customer/reviews` reads `?booking=` with `useSearchParams` inside a `Suspense` boundary (Next 16 requirement), opens that completed, unreviewed visit's form on arrival, and says so when the visit is already reviewed or not reviewable. The `booking_message_variables` base-URL half of R43 is SQL (not this package). Review form: star buttons named with `aria-pressed`, labelled textarea, save errors keep the draft, bilingual strings, `formatBookingDate` |
| C-D18 wallet copy and upcoming-deposits figure | fixed | see git log (`fixcust: wallet`) | Arabic "held in escrow" / "escrow cases" removed (identifiers renamed too); "redeemable across salons" replaced by the per-provider truth; the "Deposits for Upcoming Visits" figure is now `upcomingDepositTotal`: sum of (`total_captured` - `refunded_amount`) over `booking_payment` ledger rows whose booking is `confirmed` and `scheduled_at > now` (tips, completed visits awaiting payout and refund-pending rows are excluded). Tests: "wallet ledger rows (C-D18)" in `booking-display.test.mjs` |
| C-D18 cancelled rows labelled REFUNDED despite a kept fee | fixed | same | `walletEntryStatus` returns refunded / partly refunded / fee kept / no charge from `cancellation_fee` and `refund_amount`; the refunded part is shown under the amount |
| C-D18 other invented or false wallet content | fixed | same | removed: "Secured" badge, "Equivalent Value = points / 10" (an invented rate), the fake `REF-PRIMORA` code shown when the referral RPC fails (now an error and a disabled Copy button), the `https://primora.sa` share-URL fallback, a hard-coded 25 SAR (now `reward_per_friend_sar` from the RPC, generic wording when absent), the dead "WhatsApp gift notification queued" success branch, and the claim that wallet credit is "auto-applied during checkout" (no database function spends `wallet_credits`: see Needs). A failed ledger, credit, gift-card or loyalty read now shows an error instead of an empty list. Payments to the customer are no longer printed as "+": deposits and tips are outflows |
| D21 leftovers | partly | same | Fake cards and dependents were already removed by the integrator; wallet invented content removed as above. `discover/page.tsx:198-199` (map pins for branches without coordinates) is outside this package's files: deferred to the owner of `discover/**` |
| R22 on wallet | fixed | same | gift-card dialog moved to `ModalPortal`/`ModalOverlay` (`role="dialog"`, labelled inputs, `aria-pressed` presets, own error line); table headers have `scope="col"` and are translated; `dir` prop removed (the document already sets it) |

Receipt details: `subtotal_price, discount_amount, tax_amount, total_price, deposit_required, gift_card_amount,
cancellation_fee, refund_amount` are selected; amount due = `total_price + tax_amount`; venue balance = due - deposit - gift card;
the policy text is generated from the provider's `free_cancellation_hours`, `late_cancellation_fee_percent`,
`no_show_fee_percent` (no literals). Cancelled and no-show receipts show the fee kept and the refund from the booking row.

Settings page extras: profile inputs now have `htmlFor`/`id`, the 1 s `setInterval` locale sync was replaced by
`useOperationsLocale()`, locale-conditional `text-right`/`justify-start` classes became `text-start`/`justify-end`, and the dead
dependents add/remove handlers (still carrying the invented ids "1"/"2") were deleted. The email/SMS/push checkboxes on that page are
local state only (no table stores channel preferences): deferred, reported here so they are not mistaken for working controls.
