# FIX-BOOKING report

Package owner of: `booking_create_internal`, `create_booking`, `create_multi_service_booking`, `get_available_slots`, `get_branch_available_slots`,
`reschedule_booking` (plus the `set_booking_window` trigger function where a fix needs it). Branch `wp/fixbooking`, migrations `20261007050000` ..
`20261007099999`. No web page, mobile screen, Edge Function or other package's function was touched.

Method for every item: reproduce on the base commit with a failing DB test (harness runs in UTC with no default table privileges), patch the LATEST
function definition in place (`pg_get_functiondef` + exact-substring replace, with a hard failure when a pattern is not found), prove with the same test,
run the whole DB suite.

| Defect | Status | Migration | Test |
|---|---|---|---|
| D-21 / R3 | fixed | `20261007050000_booking_prayer_windows_riyadh_time.sql` | `booking_engine_prayer_windows.test.mjs` |
| D-16 / R21 | fixed | `20261007060000_scheduling_overnight_and_seasons.sql` | `booking_engine_overnight_schedules.test.mjs` |
| D-02 / C-D8 | fixed | `20261007070000_booking_source_attribution_tokens.sql` | `booking_engine_attribution.test.mjs`, `booking.test.mjs` (updated) |
| R15 / G23 | fixed (DB part; provider screens deferred to the screen packages) | `20261007080000_booking_buffers_processing_variants.sql` | `booking_engine_buffers_variants.test.mjs` |
| R42 / G37 | fixed (radius); travel buffer deferred | `20261007091000_home_service_radius.sql` | `booking_engine_home_radius.test.mjs` |
| C-D10 / D10 | fixed (DB part; claim screen deferred) | `20261007092000_waitlist_exclusive_claim.sql` | `booking_engine_waitlist.test.mjs` |
| D19 / C-D19 | fixed (DB part; shop/customer screens deferred) | `20261007093000_packages_linked_to_bookings.sql` | `booking_engine_packages.test.mjs` |
| D5 / C-D5 | fixed (DB part; admin coupon screen deferred) | `20261007094000_coupon_per_customer_limit.sql` | `booking_engine_coupons.test.mjs` |
| D12 / C-D12 | fixed | `20261007095000_loyalty_spend_equals_discount.sql` | `booking_engine_loyalty.test.mjs` |
| D4 part b / C-D4 wallet spend | fixed (DB part; wallet/checkout screens deferred) | `20261007096000_wallet_credit_spend.sql` | `booking_engine_wallet_credit.test.mjs` |
| D4 (a, c) and D4b referral rules | fixed (DB part; login `?ref` capture and wallet copy deferred) | `20261007097000_referral_rules.sql` | `booking_engine_referrals.test.mjs` |
| D14 / C-D14 | fixed for reachable recipients (decision pending for non-users) | `20261007098000_gift_card_received_message.sql` | `booking_engine_gift_card_message.test.mjs` |
| R24 / C-D16 | fixed (DB part; shop page and mobile pass the list) | `20261007090000_branch_slots_any_professional.sql` | `booking_engine_branch_slots.test.mjs`, `qa_adversarial.test.mjs` (allow-list updated) |

## Callers cheat-sheet (current signatures; every new argument is optional and last, named arguments keep old callers working)

Pass these by NAME through PostgREST (`supabase.rpc(name, { ... })`). Argument names are exactly as written.

- `create_booking(target_employee_id, target_service_id, target_scheduled_at, request_home_service, request_home_address_lat, request_home_address_lng, request_client_profile_id,
  request_source, request_coupon_code, request_gift_card_code, request_loyalty_points, request_branch_id, request_home_address_text,`
  **`prayer_window_starts, prayer_window_ends`** (timestamptz[], the SAME arrays sent to `get_available_slots`; omit = no prayer pause), **`request_source_token`** (text, the `?ref=` value of a provider
  share link; `request_source` is no longer trusted), **`request_variant_id`** (uuid), **`request_waitlist_claim_id`** (uuid from `?claim_waitlist=`)`)`
- `create_multi_service_booking(target_branch_id, target_employee_id, target_scheduled_at, services_payload, request_home_service, request_home_address_text, request_source, request_coupon_code,
  request_gift_card_code, request_loyalty_points, request_home_address_lat, request_home_address_lng, request_client_profile_id,` **`prayer_window_starts, prayer_window_ends, request_source_token,
  request_waitlist_claim_id`**`)`; `services_payload` items are `{ "service_id": uuid, "variant_id": uuid|null }` in visit order.
- `reschedule_booking(target_booking_id, new_scheduled_at, new_employee_id, reschedule_reason,` **`prayer_window_starts, prayer_window_ends`**`)`.
- `get_available_slots(target_employee_id, target_date, service_duration_minutes, prayer_window_starts, prayer_window_ends,` **`p_buffer_before_minutes, p_buffer_after_minutes, p_ignore_booking_id`**`)`:
  for a service with buffers/processing time prefer `get_branch_available_slots`, which computes them.
- `get_branch_available_slots(target_branch_id, target_service_id, target_date, prayer_window_starts, prayer_window_ends,` **`p_service_ids, p_variant_ids, p_duration_minutes`**`)` returns
  `slot_start, available_employee_count, candidate_employee_ids, candidate_duration_minutes`. Send `p_service_ids` (all selected services in order) and `p_variant_ids` (aligned, NULL = none);
  `p_duration_minutes` is ignored on purpose (see item 5).
- New owner commands: `create_provider_share_token(p_provider_id, p_source, p_label, p_expires_at)`, `revoke_provider_share_token(p_token_id, p_reason)`; table `provider_share_tokens` (owner read).
- New customer command: `claim_waitlist_slot(p_waitlist_id)` returns the held slot; scheduler-only: `expire_waitlist_claims()`.
- Slot display: format with `ar-SA`/`en` and `timeZone: 'Asia/Riyadh'`; amounts in SAR only.
- 7b: `create_booking` and `create_multi_service_booking` take **`request_user_package_id`** (uuid of the customer's `user_packages` row; last argument).
- 7e: `create_booking` and `create_multi_service_booking` take **`request_wallet_credit_amount`** (numeric SAR, two decimals; last argument).
- 7c/7d/7f add no argument. 7e adds **`request_wallet_credit_amount`** (above). Final order of the optional trailing arguments of `create_booking`: `prayer_window_starts, prayer_window_ends,
  request_source_token, request_variant_id, request_waitlist_claim_id, request_user_package_id, request_wallet_credit_amount`; of `create_multi_service_booking`: `prayer_window_starts, prayer_window_ends,
  request_source_token, request_waitlist_claim_id, request_user_package_id, request_wallet_credit_amount` (variants travel in `services_payload`). Always call them with named arguments.
- Other changed contracts: `claim_waitlist_slot` (returns the held slot, no longer flips the row), `join_waitlist` (verified phone + WhatsApp consent required),
  `get_or_create_referral_code` (adds `programme_active`, reward from settings), `apply_referral_code` (refuses when the programme is inactive, for customers with history, reverse referrals),
  `promotional_codes.per_customer_limit` / `first_booking_only`, `bookings.user_package_id` / `package_covered_amount` / `wallet_credit_amount` / `source_token_id` / `blocked_*_minutes`.

## 1. D-21 / R3 prayer windows and the Riyadh clock (fixed)

Reproduced on the base commit under the UTC harness: with a 06:00-23:30 shift `get_available_slots` listed no 06:30, 15:00, 18:30 or 21:30 (the
fixed 03:45-04:05 / 12:00-12:20 / 15:30-15:50 / 18:45-19:05 / 20:15-20:35 windows read as UTC clock time), and `booking_create_internal`
never received the windows the shop page showed the customer.

One rule now:
- `create_booking`, `create_multi_service_booking` and `reschedule_booking` take two optional trailing arguments `prayer_window_starts timestamptz[]`,
  `prayer_window_ends timestamptz[]` (same names as the `get_available_slots` RPC). They are validated by the new internal `assert_prayer_windows`
  (matching lists, at most 12, each start before its end; `22023` otherwise) and passed on to `get_available_slots` for the
  any-professional resolution, the final availability check and the reschedule check.
- When none are passed there is NO prayer exclusion: the hard-coded fallback is deleted from the three loops of `get_available_slots`
  (a `v_slot_time::time` comparison no longer exists anywhere in the booking functions; a regression test reads the function source).
- A window can only remove slots, never add them, so a client passing fewer windows cannot book anything the schedule does not offer.
- The old overloads are dropped (the argument list grew), the new functions receive exactly the privileges the old ones had
  (`authenticated` for the three public commands, `service_role` only for `booking_create_internal`).

Callers (for the screen packages):
- `web_platform/src/app/shop/[id]/page.tsx` (~849-927 computes the windows; the booking submit near `create_booking`/`create_multi_service_booking`) and
  `web_platform/src/app/customer/bookings/page.tsx` (reschedule) and `mobile_app/src/lib/marketplace.ts`, `mobile_app/src/components/shop-details-modal.tsx`:
  pass the SAME arrays they pass to `get_available_slots` as `prayer_window_starts` and `prayer_window_ends` (ISO timestamps) on
  `create_booking`, `create_multi_service_booking` and `reschedule_booking`. Omitting them is valid and means "no prayer pause".
- Slot display: format with `ar-SA`/`en` and `timeZone: 'Asia/Riyadh'` (R24, screen part).

## 2. D-16 / R21 overnight second shifts and seasons (fixed)

Reproduced on the base commit (9 of 15 new assertions failed): a split shift 09-13 + 21-02 gave nothing after midnight, a seasonal 21-02 gave nothing
after midnight, a season turned a weekly day off into a working day, and leave on the evening did not cancel the overnight shift.

`get_available_slots` is owned by this package; its three copy-pasted loops (previous-day first shift, shift 1, shift 2) are replaced by ONE loop
over the shifts of the previous day and of the target day (same signature, same privileges, same 30-minute grid, same conflict rule, item 1's
prayer rule kept). It reads the day through the new internal `employee_day_schedule(employee, provider, branch, date)`:
- whether the employee works a weekday always comes from the weekly `employee_availability` row, so a seasonal schedule changes hours, never days off
  (`seasonal_schedules` has no per-weekday column; the employee's own working days are the weekdays);
- the hours of a day come from the seasonal schedule that applied on THAT day (branch-specific first, then the latest start), else from the weekly row;
- each of the two shifts is overnight when its end is not after its start; the part after Riyadh midnight is offered on the next date;
- a shift of the previous day only spills over when the employee was not on approved leave and the provider/branch was not closed on that day;
- a spill-over slot continues the 30-minute grid of its shift (a 21:15 shift continues at 00:15, the old code restarted the grid at 00:00).

Not changed: how a closure or leave on the target day removes the whole day (including the morning spill-over of the evening before).

## 3. D-02 / C-D8 the caller no longer chooses `bookings.source` (fixed)

Reproduced on the base commit: `booking.test.mjs` "charges no platform fee on provider-sourced bookings" asserted that `request_source => 'link'` with no
proof gave a 0.00 platform fee (probe E4: `marketplace` 17.00, `qr` 0.00, `import` 0.00). That test now asserts the secure behaviour (and a second one asserts the
claimed channel pays the marketplace fee).

- New table `provider_share_tokens` (provider, channel link|qr|whatsapp|instagram, random 64-hex token, label, optional expiry, revoked_at/by/reason). RLS: the
  owning provider and administrators read; there is no write policy. Grants through `grant_data_api_access`, audit trigger attached.
- Owner commands `create_provider_share_token(p_provider_id, p_source, p_label, p_expires_at)` (returns the token; the owner can read it again from the table)
  and `revoke_provider_share_token(p_token_id, p_reason)` (reason 3+ chars, idempotent). Owner or administrator only; anyone else gets `P0002` not found;
  anonymous is refused by privilege; at most 50 live tokens per provider; both write an audit row (`provider.share_token_created` / `_revoked`).
- `resolve_booking_source` (internal) decides the channel: a live token of THAT provider gives the token's channel (the claimed `request_source` is ignored); `import` is
  accepted only for a customer matching a `provider_client_contacts` row of that provider (verified phone or matched profile); everything else, including `walk_in`, is `marketplace`.
- `booking_create_internal` gets `p_source_token`; `create_booking` / `create_multi_service_booking` get `request_source_token text DEFAULT NULL` (last argument).
  `request_source` is still accepted and still only a hint (import). `bookings.source_token_id` records which token produced a provider-sourced booking.

Screens (not touched here): `web_platform/src/app/shop/[id]/page.tsx:1049-1051` must stop reading `?source=`, read `?ref=<token>` and pass it as `request_source_token`
(the same on mobile `shop-details-modal.tsx` / `marketplace.ts`); the provider share-kit screen must call `create_provider_share_token` / `revoke_provider_share_token`,
list `provider_share_tokens` and build links `/shop/<id>?ref=<token>` (QR encodes the same link).
Decision for the owner: tokens are stored in clear because the provider must be able to re-display the link/QR; they are an attribution marker, not a credential.

## 4. R15 / G23 buffers, processing time, variants (fixed in the database)

Reproduced on the base commit: with `buffer_after_minutes = 60`, after a 09:00 booking `get_available_slots` still listed 09:30 10:00 10:30.

Decisions (the owner can change them; they are encoded in `booking_visit_profile` and `booking_create_internal`):
- A visit occupies the professional for `[start - blocked_before, start + duration + blocked_after)`. `blocked_before` = `buffer_before_minutes` of the FIRST service;
  `blocked_after` = for every service `processing_time_minutes + buffer_after_minutes`, plus the `buffer_before_minutes` of every later service.
  Processing time is treated as occupied time (the professional cannot serve someone else meanwhile): conservative, never double books.
- `bookings.duration_minutes` stays the visible length (calendar end, price). The blocked minutes are new columns `bookings.blocked_before_minutes` /
  `blocked_after_minutes`; `set_booking_window` (a trigger function outside the six owned functions, changed because the exclusion constraint is built on
  `booking_window`) folds them into the window, so concurrency is guarded by the existing exclusion constraint too. Existing rows have 0/0 and keep their window.
- The visible duration must fit the shift; the buffers need not.
- A variant (`service_variants`) replaces the service's duration and price for that booking (employee `custom_*` applies only to the plain service); it must belong to the
  service and be active (`22023` "The selected option is not available for this service"). `booking_services.variant_id` records it.
- `get_available_slots` gained three trailing optional arguments: `p_buffer_before_minutes`, `p_buffer_after_minutes`, `p_ignore_booking_id`. Its conflict test is now the
  stored `booking_window` overlap with the candidate's blocked window (identical to the old test when no buffers exist).
- New internal `booking_visit_profile(employee, service_ids, variant_ids)` returns validity, total duration, price and blocked minutes for one professional; the
  any-professional resolution in `booking_create_internal` uses it (item 5 reuses it for `get_branch_available_slots`).
- `reschedule_booking` now checks the move with `get_available_slots(..., p_ignore_booking_id => the booking)` and its own blocked minutes. This removes the old "the only thing
  in the way is the booking itself" exception, which also accepted a move to before the shift start (reproduced by the new test: 08:30 was allowed, now refused).
- `services` got a CHECK that the three minute columns are not negative.

New arguments for the screens: `create_booking(request_variant_id uuid)`; `create_multi_service_booking` reads an optional `variant_id` in each `services_payload` item.
Provider screens (services form: buffer before/after, processing time; variants CRUD) and the shop page (variant picker, send `variant_id`, show the effective duration)
are not part of this package. Slot listing for a buffered service: pass the same blocked minutes to `get_available_slots` (or use `get_branch_available_slots`, item 5).

## 5. R24 / C-D16 any-professional slots (fixed in the database)

Reproduced by construction: the old `get_branch_available_slots(branch, service, date, windows)` took one service, used its base duration and listed every professional
who offered that one service; for a visit of A + B it listed the professional who offers only A, and `booking_create_internal` then answered "does not offer every
selected service" (asserted in the new test), and a professional with a custom 60-minute B was listed at slots where the 90-minute visit did not fit.

New signature (old four/five-argument calls keep working): `get_branch_available_slots(target_branch_id, target_service_id, target_date, prayer_window_starts,
prayer_window_ends, p_service_ids uuid[] DEFAULT NULL, p_variant_ids uuid[] DEFAULT NULL, p_duration_minutes integer DEFAULT NULL)`, returning
`slot_start, available_employee_count, candidate_employee_ids, candidate_duration_minutes` (the last aligned with the ids).
- Per professional of the branch it asks `booking_visit_profile` (the same helper `booking_create_internal` uses for "any professional"): offers EVERY service, services
  active, variants belong to their service, real combined duration (custom durations, variants) and blocked buffer minutes; then `get_available_slots` with those numbers.
  Test: every listed (slot, professional) pair books successfully and the unlisted ones are refused.
- `p_duration_minutes` is accepted (the review's proposed argument) and deliberately ignored: a client-supplied duration can never be what the server books, because durations
  are per professional. The screen should send the service list (and variant list) and read `candidate_duration_minutes`.
- At most 6 services, each given once, valid prayer windows (`22023` otherwise); only professionals of verified providers, active branches and active professionals are listed.
- The function is now `SECURITY DEFINER` (like `get_available_slots`) so the helper and the window validator stay internal and the anonymous allow-list of
  `qa_adversarial.test.mjs` only grows by what it already contained; that test's "known open definers" list now names `get_branch_available_slots` (it is a public discovery function).

Screens: `web_platform/src/app/shop/[id]/page.tsx:899-905` and `mobile_app/src/lib/marketplace.ts:248` must pass `p_service_ids` (all selected services, in order) and
`p_variant_ids` (aligned, NULL for none), and format slots with `ar-SA` and `timeZone: 'Asia/Riyadh'` (shop page line ~205 formats with `en-US`; the page has 15 hard-coded "SAR").

## 6. R42 / G37 home-service radius (fixed; travel buffer deferred)

Reproduced on the base commit: a home visit 300 km (and 800 km) from a branch with `geofence_radius_km = 5` was accepted, and the any-professional pick ignored the
branch's service area (the new tests fail on the base and pass now).
- `haversine_km` (great-circle, 6371.0088 km) and `branch_serves_location(branch, lat, lng)` are internal helpers. `booking_create_internal` refuses a home-service booking
  whose address is farther than the radius of the branch of the professional who would serve it (`22023`, "This address is outside the branch home-visit area of N km"),
  refuses coordinates outside -90..90 / -180..180, and "any professional" only considers professionals of branches that serve the address.
- DECISION FOR THE OWNER: `geofence_radius_km` 0 or NULL (the column default) means "no service area configured" and is NOT enforced; the migration invents no radius. If home
  visits must not be offered without a radius, that is a product rule (require a radius when `is_home_service_eligible` is switched on); not changed here.
- DEFERRED: the travel buffer. `calculate-travel` is an Edge Function that needs a routing provider over the network; the booking transaction must not call out, and a
  travel speed is an owner decision. A provider can already add a fixed travel allowance through `services.buffer_before_minutes` (item 4).
- Screens: show the radius to the customer (public `branches.geofence_radius_km`, latitude, longitude) and refuse client-side before submit; the server message above is the backstop.

## 7a. C-D10 / D10 waitlist exclusive claim (fixed in the database)

Reproduced on the base commit (script, not kept): after a cancellation the first waitlister became `notified` and a stranger's `create_booking` for the same slot
returned `pending_payment`; an expired claim raised and rolled its own `expired` update back.
- Holding: when the cancellation trigger notifies a waitlister it now records the freed window (`waitlists.held_employee_id`, `held_window`, `held_slot_start`,
  `held_from_booking_id`). `get_available_slots` leaves that window out for everyone except the holder (`w.customer_id IS DISTINCT FROM auth.uid()`), and booking validation,
  the any-professional pick and reschedule all go through it, so the hold is one rule in one place.
- Using the offer: `create_booking(..., request_waitlist_claim_id)` / `create_multi_service_booking(..., request_waitlist_claim_id)` (new LAST argument of both; the claim
  must be the caller's own open unexpired offer for the same professional, one of the booked services and the exact slot; `22023` otherwise). The holder booking the held window
  without passing the id uses the offer up as well. The entry becomes `claimed`, `claimed_booking_id` is set.
- `claim_waitlist_slot(offer)` validates and returns `{success, slot_start, employee_id, service_id, branch_id, expires_at, seconds_left}`; other people's offers are `P0002`;
  an overdue offer returns `{success:false, status:'expired'}` after sweeping (it no longer raises, so the expiry is persisted). It no longer flips the row to `claimed`
  (the booking does).
- `expire_waitlist_claims()` (service role only) / internal `waitlist_sweep()` mark overdue offers `expired` and offer the same slot to the next `active` entry (same branch, date,
  service, window covers the slot, not the customer who just let it expire) when the slot is still free and in the future, queueing `waitlist_slot_opened`. Scheduled every minute
  with pg_cron (`primora-expire-waitlist-claims`) where pg_cron exists; otherwise an external scheduler must call it (NOTICE raised).
- `platform_settings.waitlist_claim_minutes` sets the window; unset keeps the existing 15 minutes the customer copy promises (the old literal `15` in the trigger and in the
  message variable is gone). DECISION for the owner: whether 15 is the right number.
- `join_waitlist` now requires a verified phone number and an active WhatsApp consent (`22023` with a clear message otherwise) and compares the date on the Riyadh calendar.
- Test list adjustment: `qa_adversarial.test.mjs` "known open definers" no longer lists `get_available_slots` (it now mentions `auth.uid()` for the hold; that is not an authorization check).

Screens (not touched): the shop page must handle `?claim_waitlist=<id>` (call `claim_waitlist_slot`, show the countdown from `seconds_left`, book with `request_waitlist_claim_id`
/ the same id in `create_multi_service_booking`), and the waitlist join form must collect WhatsApp consent (`record_consent('whatsapp')`) and show the new refusal messages.
Follow-up for the messaging owner: `booking_message_variables.rebook_url` still ends with `?source=whatsapp`; after item 3 a `source` in the URL no longer makes a booking provider-sourced,
so provider "rebook" links must carry a provider share token (`?ref=<token>`) to stay fee-free (not changed here: that function is not in this package).

## 7b. D19 / C-D19 packages linked to bookings (fixed in the database)

Reproduced by construction: `booking_create_internal` had no package input, so a package holder paid the deposit like anybody else, and `redeem_package_session`
accepted a booking that did not contain the package's service.
- `create_booking(..., request_user_package_id)` / `create_multi_service_booking(..., request_user_package_id)` / `booking_create_internal(..., p_user_package_id)`: the package must be the
  caller's own (`P0002` otherwise), `active`, with a session left, not expiring before the appointment, of the same provider, and cover a service of the visit
  (`packages.service_id`; NULL = a package for any service, which covers the FIRST service of the visit: owner decision, say so in the package screen).
- The covered service's price is taken off like a discount (`bookings.discount_amount`), recorded in `bookings.package_covered_amount` and `bookings.user_package_id`; coupons and loyalty apply
  to the remainder; VAT only on the remainder; nothing left to collect = `confirmed` immediately. One session is reserved (`remaining_sessions - 1`, `package_redemptions` row with the booking).
- `booking_release_discounts` returns the session and marks the redemption `reversed_at` (new column), once (the function was already idempotent through `discounts_released_at`).
- `redeem_package_session` (provider staff, bookings made without a package) requires the booking to contain the package's service and ignores reversed redemptions.
- Not changed: the platform commission is still calculated on the pre-discount subtotal, as for coupons; the owner should decide whether a package-covered service carries a commission at redemption
  (the package sale may already have carried one). A fully covered booking is `confirmed` without a ledger capture, like a gift-card-covered one.
- Screens: customer "my packages" -> "book with this package" (pass `request_user_package_id`), provider package form (the covered service), show "covered by package" from `package_covered_amount`.

## 7c. D5 / C-D5 coupon per-customer limit (fixed in the database)

Reproduced by the reviewer's probe (one customer, one unlimited 50 percent code, two bookings, 42.50 off each); the new test asserts the second use is now refused.
- `promotional_codes.per_customer_limit INTEGER DEFAULT 1` (NULL = unlimited, must be > 0) and `first_booking_only BOOLEAN DEFAULT false`. The customer's non-reversed `coupon_redemptions`
  are counted inside the coupon's existing `FOR UPDATE` lock; a cancelled or expired booking frees the use. `first_booking_only` refuses customers with a confirmed or completed booking (with that
  provider for a provider-scoped code, anywhere for a platform code). Errors `22023`: "You have already used this promo code" / "This promo code is for a first booking only".
- DECISION FOR THE OWNER: the default of 1 now applies to every existing code; reusable codes must be set to NULL or a higher number.
- Screens: `web_platform/src/app/admin/coupons/page.tsx` must expose both fields; the checkout should map the two new messages.
- Observation for the policy owner (not changed): any signed-in customer can SELECT the active rows of `promotional_codes` (the new test found 9 visible rows), i.e. all code strings are enumerable.

## 7d. D12 / C-D12 loyalty deduction equals the capped discount (fixed)

Reproduced with the reviewer's numbers (1,000 points at 0.5 SAR on an 85.00 service): before, discount 85.00 and balance 0; now discount 85.00, 170 points spent, balance 830 (test).
`booking_create_internal` sets `v_loyalty_points := LEAST(requested, CEIL(discount / sar_per_point))` after the cap (the cap also respects what a package or coupon leaves payable), so the
balance deduction, the `redemption` ledger row, `bookings.loyalty_points_redeemed` and the release on cancellation (exactly those points come back) all agree. A programme without a positive
`sar_per_point` can no longer be redeemed ("Loyalty redemption is not available"). The minimum-points and balance checks still apply to the REQUESTED points.
Screens: the checkout can show "N points will be used" from the preview (the booking returns `loyalty_points_redeemed`); no argument changed.

## 7e-1. D4 (b) / C-D4 wallet credit can be spent (fixed in the database)

Reproduced by construction: no function ever read `wallet_credits.is_spent`; the wallet screen promised "auto-applied as discount during checkout" but nothing applied it.
- `create_booking(..., request_wallet_credit_amount)` / `create_multi_service_booking(..., request_wallet_credit_amount)` / `booking_create_internal(..., p_wallet_credit_amount)` (SAR, 2 decimals;
  NULL or 0 = none; more than the usable credit = `22023` "Not enough wallet credit"; negative or fractional cents = "not valid"). Usable = the caller's own, not spent, not expired, remaining > 0.
- The credit is a payment instrument like a gift card: it reduces what is due after VAT and the gift card, never exceeds it, and the deposit shrinks with it (fully covered = confirmed at once).
  The amount applied is `bookings.wallet_credit_amount`; the screen should send `LEAST(balance, due)` and show the applied amount from the booking.
- Oldest credit first under row locks. New `wallet_credits.remaining_amount` (backfilled; set on insert by a trigger) allows partial use; `is_spent` is true only at 0. Every use is a row of the new table
  `wallet_credit_redemptions` (customer and admin read; no client writes). `booking_release_discounts` restores the amount exactly once on cancellation or hold expiry.
- Completion: `trigger_on_booking_completed_rewards` writes a `wallet_credit_settlement` ledger entry (provider_share = the credit used, platform_share 0, payout pending), the same mechanism as the gift-card and
  platform-funded coupon settlements, so the provider is not paid less because of platform marketing money. The new entry type is appended to the current `transactional_ledger_entry_type_check` list, whatever it holds.
  DECISION FOR THE OWNER: confirm that the platform funds wallet credit (assumed: referral and promotion credit are platform marketing spend).
- Screens: `web_platform/src/app/customer/wallet/page.tsx` must show `remaining_amount` (not `amount`) and drop the "auto-applied" promise or send the amount at checkout.

## 7e-2. D4 / D4b referral rules (fixed in the database)

Reproduced by reading the code and the base behaviour (no invented numbers remain): the amount 25 was a literal in `apply_referral_code`, `get_or_create_referral_code`, the `customer_referrals.reward_amount`
default and the seeded setting.
- Settings (`platform_settings.referral_program`, edited in the console): `enabled`, `reward_sar` (UNSET or 0 = no payout and codes cannot be applied: "The referral programme is not active"),
  `min_qualifying_sar` (optional), `max_rewards_per_referrer_30d` (optional; a referral over the cap becomes `disqualified` and nobody is paid). The seeded `reward_sar: 25` is removed while the row is still the
  untouched seed, and the table default is dropped. DECISION FOR THE OWNER: set the amount, the minimum and the cap before enabling the programme.
- `get_or_create_referral_code()` returns `programme_active`, `reward_per_friend_sar` (NULL unless active), `min_qualifying_sar`, plus the old keys; codes are `REF-` + 8 random hex characters retried on a
  unique violation (existing codes are kept), so the permanent failure after a collision is gone.
- `apply_referral_code(p_referral_code)`: only for a customer with no confirmed or completed booking ("new customers only"), refuses a reverse referral (A used B's code, B tries A's), still 23505 for a second code,
  and snapshots the amount from the setting.
- `trigger_on_booking_completed_rewards` pays only for a booking whose source is not `walk_in` and whose `total_price` reaches the minimum, only while `enabled` and `reward_sar > 0`, once, and respects the cap.
- Screens (not touched): `web_platform/src/app/login/page.tsx` must read `?ref`, keep it through sign-up and call `apply_referral_code` once after sign-in; `customer/wallet/page.tsx` must drop the hard-coded SAR 25
  (EN lines ~29-30, AR ~62-63) and read `reward_per_friend_sar`, hiding the card while `programme_active` is false.

## 7f. D14 / C-D14 gift card received message (fixed for registered recipients)

Reproduced by reading the code and the base queue (no message template or queue write referenced a gift card; the new test fails without the migration).
- New `message_templates` rows `gift_card_received` (ar, en; utility; `is_transactional = true`; Meta template name `primora_gift_card_received`, which must be approved in WhatsApp Manager;
  `body_param_keys` follow the placeholders: recipient_name, sender_name, amount, gift_code, expires_date, gift_message).
- Additive trigger `trigger_enqueue_gift_card_received` on `gift_cards` (pending_payment -> active, i.e. the payment webhook through `confirm_purchase_payment`, which is not touched) queues the message once for the
  recipient when their phone number (normalised like the client import: `05xxxxxxxx` -> `+9665xxxxxxxx`) belongs to a verified profile; the sender message is cut at 300 characters, an empty one becomes "-".
  `gift_cards.recipient_notice_status` ('queued' | 'not_reachable'), `recipient_notice_queued_at`, `recipient_notice_queue_id` record the outcome for the screen.
- LIMIT (decision for the owner and legal review): the dispatcher only sends to a verified registered user with an active WhatsApp consent. A recipient without an account is marked `not_reachable` and nothing is
  queued; the purchaser must pass the code on (the gift-card screen must say so, and the "Send" wording should become "Create gift card" until messaging non-users is approved under PDPL).
  A recipient with an account but no WhatsApp consent is queued and then skipped by the dispatcher (`skipped_no_consent`), as for every other message.

## Verification (worktree primora-wp-fixbooking, branch wp/fixbooking, final commit)

| Command | Result |
|---|---|
| `node --test "supabase/tests/db/**/*.test.mjs"` | 375 tests, 375 pass, 0 fail (before this package: 245) |
| the new files `supabase/tests/db/booking_engine_*.test.mjs` (13 files) | 129 tests: 11 prayer windows, 15 overnight, 12 attribution, 15 buffers/variants, 10 branch slots, 8 home radius, 9 waitlist, 10 packages, 7 coupons, 8 loyalty, 8 wallet, 9 referrals, 7 gift card; plus 1 test added to `booking.test.mjs` |
| `node --test supabase/tests/inventory.test.mjs` | 10 pass, 0 fail |
| `node scripts/verify-ui-schema.mjs` | checked 82 rpc calls and 195 select strings, 0 mismatches |
| `npm run test --workspace=web_platform` | 171 pass, 0 fail |
| `npm run test:security-core` / `npm run test:admin-controls` | both "verification passed" |

Every defect was reproduced first (a failing assertion, or a script on the base commit for D-21, R15, D10, R42) and the same test passes after the fix.
Not run here: `npm run typecheck:mobile`, `npm run build --workspace=web_platform`, eslint (no TypeScript or page was changed). Real Postgres 15 and pg_cron were not available: the migrations were proven
on PGlite only, so the `cron.schedule` block (guarded by `pg_available_extensions`) is unproven there; `acldefault` / `aclexplode` exist in Postgres 15.

## Files touched outside the six owned functions (for the integrator)

- Migrations added, in order (all `2026100705..098000`, one topic each): `050000` prayer windows, `060000` overnight/seasons, `070000` attribution tokens, `080000` buffers/variants, `090000` branch slots,
  `091000` home radius, `092000` waitlist claim, `093000` packages, `094000` coupons, `095000` loyalty, `096000` wallet spend, `097000` referral rules, `098000` gift card message.
- Existing functions patched in place from their latest definition (not among the six, but required by the defects): `set_booking_window` (trigger function), `booking_release_discounts`,
  `redeem_package_session`, `claim_waitlist_slot` (rewritten, same signature), `join_waitlist`, `backfill_waitlist_on_cancellation`, `trigger_on_booking_completed_rewards`, `get_or_create_referral_code`,
  `apply_referral_code` (rewritten, same signatures). If another package pasted a full copy of any of these later in the chain, its patch point fails loudly (each patch raises when its pattern is missing)
  or silently drops mine; re-apply from these files.
- Tables changed: `bookings` (+8 columns), `booking_services.variant_id`, `waitlists` (+5), `package_redemptions.reversed_at`, `wallet_credits.remaining_amount`, `promotional_codes` (+2), `gift_cards` (+3),
  `customer_referrals.reward_amount` default dropped, `services` buffers CHECK; new: `provider_share_tokens`, `wallet_credit_redemptions`; ledger entry type `wallet_credit_settlement` added to its CHECK.
- Existing tests edited: `booking.test.mjs` (the old test that asserted the fee loophole now asserts the token rule), `qa_adversarial.test.mjs` (allow-list of public definer functions: `get_branch_available_slots`
  added, `get_available_slots` removed because it now mentions `auth.uid()` for the waitlist hold).

## Deferred or open (with the reason)

- Screens: every item above lists what the shop page, customer bookings/wallet/login, admin coupons and provider screens must send or show; none was edited (not in this package).
- R42 travel buffer (needs a routing provider and an owner decision on speeds); wallet-credit funding and the referral/coupon/package business numbers (owner); messaging non-registered gift recipients (legal, PDPL).
- `booking_message_variables.rebook_url` still ends with `?source=whatsapp`: provider rebook links must carry a provider share token to stay fee-free (messaging owner).
- The platform commission on package-covered services, and whether home-visit offering should require a configured radius, are product decisions (see 7b and 6).
- Customers can list active coupon codes (policy owner), and `has_active_consent` stays the known consent oracle (policy owner); neither changed.
