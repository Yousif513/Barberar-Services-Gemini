# Defects owned by fixcust

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-04 HIGH: the booking receipt states a hard-coded cancellation policy, hard-coded 15%/85% deposit split and wrong VAT
- Where: `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx:70-71,105-106` ("Deposit Paid (15%)", "Balance (85%)"), `:280` (`total*15/115`), `:392-401` (24 h / 50% / full deposit). The query at `:150-170` does not select the provider policy.
- DB prices ex-VAT: `20261005000000_review_fix_booking_core.sql:732-733` (`total_price` = taxable, `tax_amount` separate, amount due = both). Receipt for a 100 SAR service shows balance due 80.00; the venue will ask for 95.00 (115 minus 20 deposit).
- Fix: select `deposit_required, tax_amount, subtotal_price, discount_amount` and the provider's three policy columns; render them; delete the literals.

### D-05 HIGH: invented payment cards and dependents are shown to every customer
- `web_platform/src/app/customer/wallet/page.tsx:331-334,557-570`: "Mada **** 4920 YOUSIF AL-SAUD" and "Visa / Apple Pay **** 7701". `web_platform/src/app/customer/settings/page.tsx:100-103`: dependents "Faisal Al-Saud (Son, 12)" and "Sara Al-Saud (Spouse, 34)" remain when the account has none or the load fails (`:173,181`).
- The guard test `web_platform/tests/no-mock-data.test.mjs:25-41` is a phrase blacklist and misses both.
- Fix: delete both arrays, render empty states; extend the guard with a rule that no `useState([{ ... name: "` literal appears in `src/app`.

### D-11 HIGH: consent writes ignore errors, so a withdrawal can silently fail
- `web_platform/src/app/customer/settings/page.tsx:194-207`: `await supabase.from("consents").insert(...)` without reading `{ error }`; the toast says "updated successfully" and the toggle already moved. Same pattern in `login/page.tsx:69-72` and `shop/[id]/page.tsx:1000-1025` (supabase-js returns errors, it does not throw).
- Scenario: a user withdraws WhatsApp consent, the insert is refused, the UI shows withdrawn, messages continue (PDPL breach).
- Fix: call `record_consent` RPC, check `error`, roll back the toggle and show the message; a failed sign-up consent must block the "terms accepted" state.

### D-14 MEDIUM: receipt headline says "Booking Confirmed" for cancelled and expired bookings
- `confirmation/page.tsx:283,296-297`: `isPaid = status !== "pending_payment"`; a cancelled hold shows the success headline, a green tick and "Paid".
- Fix: derive headline and payment pill from the status (confirmed/completed paid; cancelled "Cancelled"; pending).

### D-29 MEDIUM: customer cancel and reschedule hide failures or invent slots
- `customer/bookings/page.tsx:361-376` cancel: a refused `cancel_booking` is only `console.warn`ed; the modal stays open with no message. `:394-402`: if loading slots fails the page substitutes 10:00-17:00 slots it made up, which the customer can pick. The cancel dialog (`:783-809`) does not show the fee that will be kept.
- Fix: surface `cancelError.message`; on slot failure show an error state with retry; fetch the policy and display "you will lose X SAR" in the confirmation dialog before calling the RPC.

**R7 [D10] Customer reschedule modal always offers invented slots.**
Where: `web_platform/src/app/customer/bookings/page.tsx:332-346` (select lacks `employee_id`, `duration_minutes`, `services.id`), `:386-403` (RPC called with `target_employee_id: undefined`, then the catch fabricates 10:00, 11:00, 14:00, 15:00, 16:00, 17:00 at +03:00), `:413-418`.
Scenario: every customer who taps Reschedule sees the same six fake times; the server then refuses most of them, or books one that happens to be free.
Fix: add `employee_id, duration_minutes, services(id, name_en, name_ar)` to the select; delete the fallback and show the RPC error; pass the same prayer windows as the shop page (see R3).

**R17 [D11] Booking confirmation receipt shows wrong money, wrong policy and wrong status.**
Where: `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx:70,105-106` ("Deposit Paid (15%)", "Balance Due (85%)" hard-coded; real percentage is per provider, default 20), `:280` (VAT = total x 15 / 115 although `total_price` excludes VAT) and `:279` (balance ignores VAT), `:396-400` (24 h / 50% / full forfeit hard-coded; the provider's own policy is on the shop page), `:283` (`isPaid = status !== "pending_payment"`, so a cancelled booking is labelled Paid and headed "Booking Confirmed" at `:296`), `:352` (the badge reads "Confirmed" for every status except cancelled, including `no_show`), no pay-now action and no refresh after the Tap redirect.
Scenario: price 85 SAR, deposit 20%: receipt says total 85.00, deposit 17.00, due at venue 68.00, VAT 11.09; the shop page quoted VAT 12.75 and 80.75 at the venue. A cancelled booking reads "Booking Confirmed / Paid".
Fix: read `subtotal_price, discount_amount, tax_amount, total_price, deposit_required, source`; total due = `total_price + tax_amount`; venue balance = total due - deposit - gift card; VAT = `tax_amount`; load the provider's `deposit_percentage` and cancellation fields; map every status to its own title/badge; add "Pay now" (call `payment-checkout`) and poll every 3 s for up to 60 s while `pending_payment`.

**R22 [D13] Main booking flow is not keyboard or screen-reader operable.** `shop/[id]/page.tsx:1376,1445,1481` (service and specialist cards are `div onClick`), `:1692` (date input has no accessible name), `:1177-1186` (icon links without names), modals without `role="dialog"`, focus trap or Escape (`:2088-2235`; `customer/bookings/page.tsx` six modals; 16 files with `fixed inset-0`). Fix: render cards as `<button type="button" aria-pressed>`; add `htmlFor`/`aria-label`; move every modal to `ModalOverlay`/`useModalBehavior` from `web_platform/src/components/modal.tsx`; add `min` to date inputs.

**R23 [D12] Cancelling hides the consequences and swallows failures.** `customer/bookings/page.tsx:361-376` catches and only `console.warn`s; the confirm dialog (`:782-809`) never shows the late-cancel fee or refund and the result of `cancel_booking` (fee, refund) is discarded; status enum printed raw (`:594`); dates always `en-GB` and no time zone (`:559-569`); "Book Again" (`:650`) links to `/customer/book?service_id=` but that page reads `?id=` and the select lacks `services.id`, so it lands on `/discover`. Fix: preview from provider policy before confirming, show the returned fee/refund, show errors, translate statuses, use `Asia/Riyadh` and the active locale, link to `/shop/{provider_id}?service=...`.

**R43 [D28, G41] Post-visit link defects.** `booking_message_variables` hard-codes `https://primora.sa` and `/provider/bookings`; `customer/reviews/page.tsx` ignores `?booking=`. Fix: `platform_settings.public_base_url`; read the parameter and open that booking's review form.

**D18. Copy that claims things the system does not do.** Tip "goes directly to your specialist"
(`customer/bookings/page.tsx:62,124`; ledger credits the provider); wallet Arabic still says "held in escrow" and
"escrow cases" (`customer/wallet/page.tsx:45,59`) although escrow copy was removed in English and the guard test misses
Arabic; "redeemable across salons" for per-provider points (`:14,50`); "Deposits for Upcoming Visits" sums every ledger
row that is not `released`, including completed visits awaiting payout and refund-pending rows
(`:176-195`); cancelled bookings are labelled REFUNDED even when a late-cancellation fee was kept. Fix: reword, compute the
upcoming figure from `bookings.status = 'confirmed' AND scheduled_at > now()`, and extend the guard test to Arabic strings.

**D21. Invented or non-real data.** Fake saved payment cards with a person's name are hard-coded and rendered in the
customer wallet (`customer/wallet/page.tsx:331-334,558`: Mada 4920 and Visa 7701 for "YOUSIF AL-SAUD"); map pins for
branches without coordinates (`discover/page.tsx:198-199`); invented favourites ratings (D7). Fix: delete `savedCards`,
render "No saved cards" (cards are not stored), skip pins without coordinates and list them separately.
