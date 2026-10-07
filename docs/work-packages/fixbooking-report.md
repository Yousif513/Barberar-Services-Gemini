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
| R24 / C-D16 | fixed (DB part; shop page and mobile pass the list) | `20261007090000_branch_slots_any_professional.sql` | `booking_engine_branch_slots.test.mjs`, `qa_adversarial.test.mjs` (allow-list updated) |

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
- Owner commands `create_provider_share_token(p_provider_id, p_source, p_label, p_expires_at)` (returns the token once more on read: owners read it from the table)
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
