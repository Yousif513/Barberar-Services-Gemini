# Defects owned by fixbooking

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

### D-02 HIGH: `bookings.source` is chosen by the caller, so any customer can zero the platform fee
- Where: `20261005000000_review_fix_booking_core.sql:560-564` (accepts `link|qr|whatsapp|instagram|import` from `p_source`); `web_platform/src/app/shop/[id]/page.tsx:1049-1051` (reads `?source=`); `20261003220000_booking_rules_and_money.sql:538-540` (these sources return 0).
- Probe E4: same customer, same provider, same slot: `marketplace` commission 17.00; `qr` 0.00; `import` 0.00 with no client list. The test `supabase/tests/db/booking.test.mjs:71-76` asserts exactly this as intended behaviour.
- Fix: derive source server-side. Add `provider_booking_links(token, provider_id, channel)`; the shop page passes `?ref=<token>`; `booking_create_internal` maps token to channel and otherwise forces `marketplace`; allow `import` only when the customer's verified phone matches a `provider_client_contacts` row of that provider; `walk_in` stays staff-only.

### D-16 HIGH: overnight second shifts lose their after-midnight slots; no behaviour test for G17
- `20261004010000_scheduling_depth.sql:300-346` handles spill-over for the previous day's first shift only (second-shift columns are selected and never used); the seasonal branch (`:274-298`) also forces `is_working = TRUE` for every employee on every day. Probe E13b: split shift 09-13 and 21-02 gives no 00:00-01:30 slots next day (single shift does, E13a). Only text assertion exists: `web_platform/tests/negative-authorization.test.mjs:312-329` against the superseded `20261003220000` file.
- Fix: restore the second-shift spill-over block, apply seasonal windows per employee with the employee's own working days, add a PGlite test for 21:00-02:00 single and split shifts.

### D-21 HIGH: server-side slot validation uses a hard-coded prayer fallback read in the database session time zone
- `20261004010000_scheduling_depth.sql:322-328,373-379,422-428` compare `v_slot_time::time` to fixed 03:45-04:05 / 12:00-12:20 / 15:30-15:50 / 18:45-19:05 / 20:15-20:35 when no client windows are passed. `booking_create_internal` calls `get_available_slots(emp, date, duration)` with no windows (`20261005000000_review_fix_booking_core.sql:667-672`), and a hosted Supabase session is UTC, so the cast yields UTC clock time.
- Probe E14-UTC: with a 06:00-23:30 shift the server refuses Riyadh-local slots 06:30, 07:00, 15:00, 18:30, 21:30, 22:00, 23:00 while the customer was offered them using the Umm al-Qura windows (`shop/[id]/page.tsx:849-927`). The tests run on a Riyadh-time PGlite host (probe E13 shows `Etc/GMT-3`), which hides it.
- Scenario: a customer picks 15:00 (not a prayer time that day), pays nothing yet, taps Pay and gets "Selected time is no longer available".
- Fix: delete the hard-coded fallback; when no windows are passed return the raw availability (prayer pauses are a presentation rule supplied by the client or stored per branch), and cast with `(v_slot_time AT TIME ZONE 'Asia/Riyadh')::time` anywhere a local clock is compared. Run the DB tests with `SET TIME ZONE 'UTC'` in the harness.

**R3 [D1] Booking confirmation ignores the prayer windows the customer was shown; the fallback windows depend on the database time zone.**
Where: `supabase/migrations/20261005000000_review_fix_booking_core.sql:620` (any-professional resolution), `:668` (final availability check) and `:1489` (`reschedule_booking`) call `get_available_slots(...)` without windows; fallback windows are hard-coded `'03:45'-'04:05'`, `'12:00'-'12:20'`, `'15:30'-'15:50'`, `'18:45'-'19:05'`, `'20:15'-'20:35'` compared with `v_slot_time::time` (`20261004010000_scheduling_depth.sql:323-324,374-375,423-424`), i.e. the session time zone (UTC on Supabase, not Riyadh).
Scenario (PROBE, `TimeZone=UTC`): the shop lists 14:30, 15:00, 18:00, 18:30 (Riyadh) from the customer's own Umm al-Qura windows; `create_booking` answers "Selected time is no longer available" for each. Tests pass only because PGlite takes the host time zone.
Fix: pass the same windows to `create_booking`/`create_multi_service_booking`/`reschedule_booking` (new optional `prayer_window_starts/ends` arguments), or store per-branch prayer rules server-side (Umm al-Qura table or a setting) and use one rule in listing and validation; replace `v_slot_time::time` by `(v_slot_time AT TIME ZONE 'Asia/Riyadh')::time`; add a test run under `TZ=UTC` that lists a slot with client windows and books it.

**R15 [D5] G23 (buffers, processing time, variants) is not implemented.**
Where: `supabase/migrations/20261004010000_scheduling_depth.sql:148-182`; neither `get_available_slots` (`:192-450`) nor `booking_create_internal` reads the columns; no UI; no variant argument in `create_booking`.
Scenario (PROBE): a service with `buffer_after_minutes = 60` still offers the next slot right after the previous booking ends.
Fix: store `duration + buffer_before + buffer_after (+ processing)` in `bookings.duration_minutes`/`booking_window` and make slot generation use it; add `variant_id` to `create_booking` and `booking_services`; add provider screens; test with a buffered service.

**R21 [D6] Seasonal overnight schedules lose their after-midnight hours and override days off.** `20261004010000_scheduling_depth.sql:300-304` reads the weekly `employee_availability` for the previous day instead of the seasonal row; `:291` sets `v_is_working := TRUE` regardless of the employee's day off. PROBE: seasonal 21:00-02:00 offers 21:00-23:30 but nothing at 00:00-01:30 the next day, while a weekly overnight shift does. Fix: compute the previous-day spillover from the schedule that applied on that day (seasonal first), keep `is_working_day` for seasons or add `days_of_week`.

**R24 [D14, D15] Slot display and any-professional duration.** `shop/[id]/page.tsx:205` formats slots with `en-US` AM/PM in Arabic; 15 hard-coded "SAR" in the page; `get_branch_available_slots` (`20261004010000_scheduling_depth.sql:481-543`) uses the first service's `base_duration_minutes` and checks only that service, so any-professional with several services lists slots `booking_create_internal` rejects. Fix: format with `ar-SA` and `Asia/Riyadh`, pass the combined duration and the service list to the RPC.

**R42 [G37] Home-service radius and travel are not enforced.** `branches.geofence_radius_km` is read by no function; `calculate-travel` has no caller; `booking_create_internal` checks only eligibility and non-null coordinates. Fix: reject a booking outside `geofence_radius_km` (Haversine in SQL), use `calculate-travel` for the travel buffer, show the radius to the customer.

**D8. Marketplace fee can be avoided by a URL parameter.** The shop page reads `?source=` (`shop/[id]/page.tsx:1049-1051`)
and passes it to `create_booking`; `booking_create_internal` accepts `link`, `qr`, `whatsapp`, `instagram`, `import`
(`20261005000000:561`) and `calculate_booking_platform_commission` returns 0 for them. Scenario: a provider
tells marketplace customers to open `/shop/<id>?source=link`; the 20 percent first-visit fee is never charged. Fix:
issue a per-provider signed attribution token with the share kit (`provider_share_tokens`: provider_id, source, random
secret), accept a non-marketplace source only with a valid token (`p_source_token`), otherwise force `marketplace`; test it.

**D10. Waitlist "exclusive 15-minute claim" does not exist.** Probe: after a cancellation the first waitlister became
`notified`, a stranger then booked the slot immediately (`create_booking` returned `pending_payment`); after the window
passed `claim_waitlist_slot` raised "Claim window has expired", the row stayed `notified` (the `UPDATE ... 'expired'` at
`20261004050000:205-207` is rolled back by the `RAISE`), the second waitlister stayed `active`, and the first customer
cannot re-join that service and date (`:126-135`). Copy promising exclusivity: `shop/[id]/page.tsx:68,133`. Fix: add
`p_waitlist_claim_id` to `booking_create_internal` and refuse other customers while an unexpired `notified` entry covers
the slot; a pg_cron job `expire_waitlist_claims()` (outside a failing transaction) marks `expired` and notifies the next
`active` entry; handle `?claim_waitlist=` on the shop page; require verified phone and WhatsApp consent at join (the
message is skipped otherwise, `claim_message_batch`); until then change the copy to "we will message you if a slot opens".

**D19. Packages are not connected to bookings.** `redeem_package_session` (`20261005010000:476-530`) neither checks the
booking's service against `packages.service_id` nor reduces `total_price`/`deposit_required`; a customer who bought a
package still pays a deposit to book. Fix: add `p_user_package_id` to `booking_create_internal` (reserve one session,
zero the covered service price, return it in `booking_release_discounts`) and make redemption a transition of that
booking; require `service_id` match.

**D5. Coupons have no per-customer limit.** `booking_create_internal` (`20261005000000:687-712`) checks only the global
`max_redemptions`; `coupon_redemptions` is unique on `(coupon_id, booking_id)` only. Probe: one customer used the same
unlimited 50 percent platform code on two separate bookings (discount 42.50 each). Scenario: a "first booking" or
influencer code is reused on every visit and drains a capped budget. Fix: add `promotional_codes.per_customer_limit
INTEGER NOT NULL DEFAULT 1` and `first_booking_only BOOLEAN`, count non-reversed `coupon_redemptions` for the customer
inside the same `FOR UPDATE` section, expose both fields in `admin/coupons/page.tsx`, and test the second use.

**D12. Loyalty points are burned beyond the discount.** Probe: 1,000 points (worth 500 at `sar_per_point` 0.5) redeemed on
an 85.00 service gave a discount of 85.00 and set the balance to 0. `booking_create_internal` caps the discount
(`20261005000000:726`) but deducts the requested points (`:804`). Fix: `v_loyalty_points := CEIL(v_loyalty_discount /
sar_per_point)` after the cap; reject when `sar_per_point <= 0`; add an enabled-programme test.

**D4. Referral loop is dead end to end, and the credit cannot be spent.** `apply_referral_code`
(`20261004060000:1153`) has no caller (grep of web and mobile finds none); `web_platform/src/app/login/page.tsx:17`
reads only `returnUrl`, so the link built at `20261004060000:1144` / `customer/wallet/page.tsx:216` does nothing; the
reward writes `wallet_credits` (`20261005000000:1719+`), which no function ever spends or marks `is_spent` (functions
mentioning the table: `apply_referral_code` text, `audit_admin_write`, the rewards trigger). The wallet says
"Auto-applied as discount during checkout" (`customer/wallet/page.tsx:376-380`) and the referral card promises SAR 25
(`:29-30` EN, `:62-63` AR; hard-coded in `20261004060000:1145,1207,1213`, not read from `platform_settings.referral_program`). Fix: (a) on
sign-in read `?ref`, store it, and call `apply_referral_code` once; (b) add a `wallet_credit_amount` input to
`booking_create_internal` that locks `wallet_credits` oldest-first (`FOR UPDATE`, `is_spent=false`, not expired), consumes
them with a partial-use column, restores them in `booking_release_discounts`, and tests it; until (b) exists remove the
"auto-applied" copy and hide the card; (c) take the amount from `platform_setting('referral_program')` in both messages.

**D4b. Referral abuse and code collisions.** `trigger_on_booking_completed_rewards` (`20261005000000:1719+`) pays both users
SAR 25 on the referee's next completed booking of any value, any source (a staff-created walk-in linked by phone counts),
referee may already have history, mutual referrals (A uses B's code, B uses A's) pay twice, no per-referrer cap. Codes are
`'REF-' || UPPER(SUBSTRING(MD5(user_id::text),1,6))` (`20261004060000:1128`): 16,777,216 values, 50 percent chance of a
collision near 4,800 users, and `profiles.referral_code` is UNIQUE, so the colliding user's `get_or_create_referral_code`
fails permanently. Fix: require at `apply_referral_code` that the referee has no confirmed or completed booking; refuse a
reverse referral; reward only `source <> 'walk_in'` with `total_price >= min_qualifying_sar` (setting) and cap rewards per
referrer per 30 days (setting); generate codes with 8 random characters in a retry loop on unique violation.

**D14. "Send a Gift Card" does not send.** No message template or queue write references a gift card
(`20261005010000:101-140` and `confirm_purchase_payment` end without enqueueing); the recipient fields are stored only;
the code is shown to the purchaser only. The Gemini changelog says a WhatsApp notice is queued; it is not. Fix: on
activation enqueue a `gift_card_received` template (add AR/EN rows to `message_templates`, `is_transactional = true`)
with the code, amount and sender message, and rename the button until then; add a test on the queue row.

**D16. Multi-service with "any specialist" lists unusable slots.** `shop/[id]/page.tsx:899-905` passes one service id to
`get_branch_available_slots` (`20261005000000` chain, `STABLE` invoker function, base duration only; employees'
`custom_duration_minutes` ignored). Fix: add `p_duration_minutes INT` and `p_service_ids UUID[]` to the function and filter
to employees who offer every service.
