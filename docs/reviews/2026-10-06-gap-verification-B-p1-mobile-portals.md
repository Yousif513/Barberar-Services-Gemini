# Gap verification B: P1 gaps G20-G43, mobile app, customer and provider portals

Reviewer: Claude Code (read-only review). Checkout: `primora-fix`, branch `claude-code`. Date: 2026-10-07 (file name keeps the 2026-10-06 start date).
Scope: `docs/competitive-research/12-prioritized-backlog.md` rows G20-G43, plus the customer portal, provider portal, public pages and mobile app.
Nothing in the repository was edited; the only file written is this report.

## Summary

- **No gap in G20-G43 meets the COMPLETE bar** (database command + authorization + UI + AR/EN with RTL + a behavioural test). Counts: 1 MISSING (G23), 2 BROKEN (G21 web UI, G37), 21 PARTIAL.
- The database layer is much better than the screens. Booking, cancel, reschedule, disputes, refunds, payouts and invoices are server commands with executing tests (DB suite 219/219). The screens and public pages still contain invented data, failing queries and dead controls, and **nothing tests a screen against the schema** (the 156 web tests are text assertions).
- A script that checks every `.rpc()` / `.from().select()` (including embedded resources) against the migrated schema found three screens that cannot load on a real database (provider bookings, provider settings, customer favorites) and one RPC that always fails (waitlist). See R5, R6, R13, R14.
- Two items are critical: a fixed fake seller VAT number on customer tax invoices (R1) and four public pages (in the sitemap) listing invented businesses with fake ratings and review counts (R2).
- Mobile session persistence was fixed by the integrator (keychain adapter) and is accepted; what remains for mobile is listed in section 4.

## 0. Method and baseline

- Baseline run on this checkout: `npm run test:db` 219/219 (also 219/219 with `TZ=UTC`), `npm run test --workspace=web_platform` 156/156, `npm run typecheck:mobile` exit 0.
- The DB suite runs on PGlite = **PostgreSQL 18.3**; `supabase/config.toml` says `major_version = 15`. A static scan of all migrations found no PG16+/17+/18-only syntax, but nothing was applied to a real PG15. PGlite's session `TimeZone` follows the host (`Etc/GMT-3` here, `UTC` in CI and on Supabase); this hides R3.
- I applied all migrations to an in-memory database with the repo's own harness and ran probe scripts (kept outside the repo) as `anon`, an unrelated signed-in user, the customer and the provider owner. Evidence lines say `PROBE`.
- RPC names/arguments (80 call sites), `select()` strings with embeds, and filter/insert keys were checked against the migrated schema by script.
- Mobile session persistence: `mobile_app/src/lib/supabase.ts` + `chunked-storage.ts` (keychain via `expo-secure-store`, AppState auto-refresh) are in the working tree (uncommitted) and are not reported as open.
- Currency of evidence: the probes were re-run on 2026-10-07 against the working tree that already contains the integrator's untracked `supabase/migrations/20261006220000_explicit_data_api_grants.sql` (explicit Data API grants) and the changed `supabase/tests/db/harness.mjs`; R3, R6, R10, R11, R12, R15 and R28 still reproduce. The baseline test counts above were taken before those two changes.

## 1. Verdict table G20-G43

| Gap | Verdict | Evidence | Notes |
|---|---|---|---|
| G20 any available professional | PARTIAL | `get_branch_available_slots` (INVOKER, works for guests: PROBE 6 rows); `booking_create_internal` picks the least-loaded employee (`supabase/migrations/20261005000000_review_fix_booking_core.sql:620`); web `web_platform/src/app/shop/[id]/page.tsx:898-905,1102`; mobile `mobile_app/src/lib/marketplace.ts:240-254` | Only `create_booking(null employee)` is tested (`supabase/tests/db/booking.test.mjs:78`); the aggregated slot list is never executed in a test. R3, R24 (first-service duration only), R22 (cards not keyboard-operable). |
| G21 reschedule | BROKEN (web UI); DB COMPLETE | `reschedule_booking` effective def (`20261005000000_review_fix_booking_core.sql:1416`, row lock, notice rule, audit), tested `booking.test.mjs:146`; web modal `web_platform/src/app/customer/bookings/page.tsx:378-429` | The list query omits `employee_id` and `duration_minutes` (`:332-346`), so the slot RPC is always called without an employee, fails, and the modal shows invented slots (R7). Provider calendar drag-and-drop does not call it (R4). No staff or mobile UI. No message to the other party. |
| G22 time off, closures, seasons | PARTIAL (engine only) | engine in `get_available_slots` (`20261004010000_scheduling_depth.sql:192-450`); PROBE: closure blocks the day; weekly overnight shift spills past midnight | **No UI anywhere** for `provider_closures`, `employee_time_off`, `seasonal_schedules` (R16); seasonal overnight loses its after-midnight hours (R23); the hours form cannot save an overnight shift (R16); no behavioural test of closures, leave or seasons. |
| G23 buffers, processing time, variants | MISSING (schema only) | columns and table `20261004010000_scheduling_depth.sql:148-182`; nothing reads them | PROBE: `buffer_after_minutes = 60` changes nothing. The changelog sentence "Prevents booking collision across buffer windows" is false (R15). |
| G24 employee "My day" | PARTIAL; unusable for employees | `employee_update_booking_status` correct and tested (`booking.test.mjs:163`) | 16 provider screens and the layout resolve the business with `providers.owner_id = auth.uid()` (grep), so a `provider_employee` sees empty pages; the one screen with the status buttons cannot load (R5); no My-day screen (R18). |
| G25 ZATCA phase 2 | PARTIAL (phase 1 data only) | `generate_zatca_tax_invoice` (`20261005010000_review_fix_money.sql:1081`): completed bookings only, provider VAT required, QR TLV, status `not_submitted`, tested `money.test.mjs` | Honest status, but the customer invoice view and XML export are wrong (R1); no partner, CSID, signing or reporting; the hash chain is read-then-write without a lock (two concurrent invoices fork it); invoices are created lazily when a customer first opens them, so the issue time is not the supply time. |
| G26 Wathq CR verification | PARTIAL | `supabase/functions/wathq-verify/index.ts` (admin only), service-only `record_wathq_cr_verification`, admin button `web_platform/src/app/admin/providers/provider-management.tsx:839`, public badge `shop/[id]/page.tsx:1257` | Existence/status only; owner or name never compared (R32); verification is an optional manual step after approval. Web test asserts a removed function (R29). |
| G27 localization | PARTIAL | Arabic font and pre-paint lang/dir (`web_platform/src/app/layout.tsx:9-33`) | No locale provider (11 files read `primora_lang`, 54 own a language state, 24 poll `document.documentElement.lang` every second); server always renders `lang="en" dir="ltr"`; manual `flex-row-reverse` on top of `dir="rtl"` (R25, R26). |
| G28 SSR / SEO | PARTIAL | `web_platform/src/app/sitemap.ts`, `robots.ts`, server `generateMetadata` (`app/shop/[id]/layout.tsx:12-39`) | Every public page is `"use client"`; crawlers get a loading shell; no JSON-LD, district pages, Arabic slugs or hreflang; the category pages in the sitemap show invented data (R2). |
| G29 server search | PARTIAL | `search_marketplace_providers` (Arabic normalization, Haversine, paged), tested `supabase/tests/db/trust.test.mjs`; used by `/discover`, `/customer/search`, mobile | `/services` still downloads all services, providers and all reviews and filters in the browser (R35); distance sort uses the city centre on `/discover` only, no geolocation anywhere. |
| G30 reviews, ratings, moderation | PARTIAL | `reply_to_review`, `moderate_review`, admin and provider screens | Hidden reviews remain public (R11); customer can forge a provider reply (R28); no "report review" action; `reply_to_review` tested by source text only. |
| G31 orphaned tables / features | PARTIAL | tables exist and are read by UI | `provider_promos` is never read by checkout (R9); `expo_push_tokens` never written, no push sender caller (R33); `notifications` only written by admin broadcasts. |
| G32 honest admin states | PARTIAL | SAR fixed, demo fallbacks removed | Four financial lists still show an empty table when the query fails (R31); most lists unpaginated (manifest gap). |
| G33 disputes, refunds, PSP reconciliation | PARTIAL | `open_booking_dispute`, `resolve_booking_dispute`, `run_daily_psp_reconciliation`, `reconcile-psp`; tested `money.test.mjs` | Case management is thin (no provider response, admin UI cannot set a partial refund amount); reconciliation compares daily totals only, no per-charge match. |
| G34 provider fee invoices | PARTIAL, not operable | `generate_provider_monthly_fee_invoice` (`20261005010000_review_fix_money.sql:835`), tested | No caller (no UI, cron or function); re-run overwrites a paid invoice; nothing collects the receivable (R19). |
| G35 client CSV import | PARTIAL | `import_provider_clients` (owner, consent flag, 2000 rows, audited), tested `trust.test.mjs:113`; UI `provider/customers/page.tsx:139-196` | Paste box not a file; naive comma split; header row imported; NULL phones never de-duplicated; English-only labels (R36). |
| G36 mobile app | PARTIAL | live data via `lib/marketplace.ts`, phone OTP, keychain session | See section 4 and R37-R42. |
| G37 home-service privacy | BROKEN / not built | PROBE: owner reads the address of an unpaid booking | R12 and section 4. |
| G38 subscription billing | PARTIAL | `subscribe_provider_plan` -> Tap -> `confirm_purchase_payment`, tested | One-off charge; no renewal, expiry or entitlement checks; prices invented by the agent (R20). |
| G39 dashboard accessibility / mobile nav | PARTIAL | labelled hamburger on all three shells (`provider/layout.tsx:302-313`, `customer/layout.tsx:281-284`), skip link on admin | No skip link on customer/provider; hand-made modals; `div onClick` cards; unlabeled inputs; mobile app has no accessibility props (R22, R41). |
| G40 CORS, tokens, framework | PARTIAL (mostly done) | no `Access-Control-Allow-Origin: *` in `supabase/functions`; `verify_jwt=false` only for `payment-webhook`; Next 16.3.8; developer tokens stored as SHA-256 | Source-text tests only (Deno not available here); localhost origin allowed and used as fallback (tracked low); `send-otp` has no caller or auth hook. |
| G41 post-visit WhatsApp | PARTIAL | `handle_booking_messaging_lifecycle` enqueues `post_visit_review` one hour after the visit | No executing test; hard-coded domain; `?booking=` ignored by the review page (R29, R43). |
| G42 professional profiles | PARTIAL | columns, `employee_portfolios`, specialist cards show experience and specialties (`shop/[id]/page.tsx:1510-1523`) | No screen edits bio, experience, specialties, instagram or portfolio (employees page writes only `photo_url`); consent flag is a self-set boolean; staff phone/email exposed (R10). |
| G43 "PRIMORA brought you" summary | PARTIAL | `get_provider_monthly_value_summary` + dashboard card, tested `trust.test.mjs:161` | No monthly message is sent; `provider_value_summaries` unused; "commission saved" assumes every direct booking would have paid the first-visit fee. |

### G36 and G37 detail

- G36 real: six screens on live RPCs/tables, phone OTP (`mobile_app/src/app/profile.tsx:196-243`), payments through Tap checkout, cancel and "pay now" retry (`app/bookings.tsx:156-185`), session persisted. G36 not real: no home-service or reschedule UI, no push (no `expo-notifications`), per-screen language state, English tab labels, no accessibility props, payment returns to the web site, deposit estimate and cancellation copy wrong (R37-R42).
- G37 exists in the database only as a masking function (`get_booking_address_secure`) that nothing calls and that is bypassed by a plain table select; no customer UI collects an address; the radius `branches.geofence_radius_km` is read by no function; `calculate-travel` has no caller; no hold-then-capture.

## 2. Ranked defect list

Format: **Rn [id] title.** Where. What is wrong. Failure scenario. Fix. (`id` links to the evidence in the appendix.)

### Critical

**R1 [D9] Customer tax invoice shows a fake seller VAT number and the XML export carries wrong amounts and invented party data.**
Where: `web_platform/src/app/customer/bookings/page.tsx:954` (literal `300000000000003`, the ZATCA simulation id), `:262-268` (`price: Number(invoiceData.subtotal_sar)`), `web_platform/src/lib/zatca.ts` (`schemeID="CRN"` value `1010899452`, `CityName` Riyadh, buyer "Walk-in Customer / B2C", names not XML-escaped, header says "Phase II ... compliant").
Scenario: a customer of a provider whose VAT number is real opens the invoice and sees 300000000000003; downloads the XML and gets net 73.91 / VAT 11.09 / gross 85.00 for a booking whose invoice row says 85.00 / 12.75 / 97.75 (the function treats the ex-VAT subtotal as VAT-inclusive); a name like "Hair & Beauty" makes the XML malformed.
Fix: render `invoiceData.seller_vat_number` and `buyer_name`; remove "Download XML" until an edge function builds the document from the `invoices` row (and signs it through the certified partner); delete the fixed CRN and city; escape every interpolated value; reword the file comment.

**R2 [D33] Public category pages list invented businesses with fake ratings, review counts and prices.**
Where: `web_platform/src/app/categories/barber/page.tsx:48-63`, `hair/page.tsx:48-63`, `makeup/page.tsx:48-63`, `spa/page.tsx:48-63` (eight businesses, ratings 4.8-4.9, 74-148 reviews, stock photos); in `sitemap.ts` at priority 0.9 and linked from the shop footer; their "Book" button only goes to `/login`.
Scenario: Google indexes "Elite Grooming Lounge 4.9 (128 reviews)", a business that does not exist; a customer cannot book it. Consumer-protection exposure; contradicts the earlier "no invented ratings" fix, and `web_platform/tests/no-mock-data.test.mjs` does not scan these files.
Fix: render each page from `search_marketplace_providers(p_category => slug)` (server component, real ratings, link to `/shop/{id}`), show an honest empty state, and add `app/categories/**` and `app/provider/**` to the no-mock test.

### High

**R3 [D1] Booking confirmation ignores the prayer windows the customer was shown; the fallback windows depend on the database time zone.**
Where: `supabase/migrations/20261005000000_review_fix_booking_core.sql:620` (any-professional resolution), `:668` (final availability check) and `:1489` (`reschedule_booking`) call `get_available_slots(...)` without windows; fallback windows are hard-coded `'03:45'-'04:05'`, `'12:00'-'12:20'`, `'15:30'-'15:50'`, `'18:45'-'19:05'`, `'20:15'-'20:35'` compared with `v_slot_time::time` (`20261004010000_scheduling_depth.sql:323-324,374-375,423-424`), i.e. the session time zone (UTC on Supabase, not Riyadh).
Scenario (PROBE, `TimeZone=UTC`): the shop lists 14:30, 15:00, 18:00, 18:30 (Riyadh) from the customer's own Umm al-Qura windows; `create_booking` answers "Selected time is no longer available" for each. Tests pass only because PGlite takes the host time zone.
Fix: pass the same windows to `create_booking`/`create_multi_service_booking`/`reschedule_booking` (new optional `prayer_window_starts/ends` arguments), or store per-branch prayer rules server-side (Umm al-Qura table or a setting) and use one rule in listing and validation; replace `v_slot_time::time` by `(v_slot_time AT TIME ZONE 'Asia/Riyadh')::time`; add a test run under `TZ=UTC` that lists a slot with client windows and books it.

**R4 [D43] Provider calendar "reschedule by drag and drop" is client-state only.**
Where: `web_platform/src/app/provider/calendar/page.tsx:1108-1124` (`onDrop` calls only `setAppointments`, label "Rescheduled").
Scenario: the owner drags the 15:00 customer to 17:00, sees "Rescheduled"; after a reload the booking is at 15:00 and the customer was never told.
Fix: on drop call `reschedule_booking(target_booking_id, new_scheduled_at, reschedule_reason)`, update state only on success, restore and show the error otherwise; add a keyboard "Move to..." control in the details modal (drag is mouse-only).

**R5 [D31] Provider bookings page cannot load.**
Where: `web_platform/src/app/provider/bookings/page.tsx:118` selects `profiles ( first_name, last_name, phone )`; `profiles` has `phone_number` (also used at `:394`, `:501`).
Scenario: PostgREST rejects the request (`column ... phone does not exist`); the page shows its error and an empty list, including the staff buttons Seat in chair / Complete / No-show (G24).
Fix: select `phone_number` and render `bk.profiles?.phone_number`; add R44 so this cannot recur.

**R6 [D23] Provider settings page cannot load.**
Where: `web_platform/src/app/provider/settings/page.tsx:229` selects `providers.phone` (columns are `contact_phone`, `contact_email`); `:253` reads it.
Scenario (PROBE `column "phone" does not exist`): `loadSettings` throws on `fetchError`; names, description, deposit %, hours and radius never load.
Fix: select `contact_phone` and use `providerInfo?.contact_phone`.

**R7 [D10] Customer reschedule modal always offers invented slots.**
Where: `web_platform/src/app/customer/bookings/page.tsx:332-346` (select lacks `employee_id`, `duration_minutes`, `services.id`), `:386-403` (RPC called with `target_employee_id: undefined`, then the catch fabricates 10:00, 11:00, 14:00, 15:00, 16:00, 17:00 at +03:00), `:413-418`.
Scenario: every customer who taps Reschedule sees the same six fake times; the server then refuses most of them, or books one that happens to be free.
Fix: add `employee_id, duration_minutes, services(id, name_en, name_ar)` to the select; delete the fallback and show the RPC error; pass the same prayer windows as the shop page (see R3).

**R8 [D44] A provider with no staff sees three invented employees and four invented services.**
Where: `web_platform/src/app/provider/employees/page.tsx:709-756` (`demoServiceOptions`, `demoStaffMembers`, ids `demo-*`, used when `liveStaffMembers` is empty).
Scenario: a new owner's team page shows Omar Khaled, Yousef Adel, Karim Saad and prices 45/30/80/90; edits against `demo-*` ids fail.
Fix: delete both constants, render an empty state with "Add your first professional"; extend `no-mock-data.test.mjs` to `app/provider/**`.

**R9 [D34] Provider promo codes can never be redeemed.**
Where: `web_platform/src/app/provider/promotions/page.tsx:142,187` writes `provider_promos`; no function reads that table (grep of effective definitions); checkout uses `promotional_codes` (`booking_create_internal`, `validate_and_apply_coupon`). `target_segment` is never enforced.
Scenario: a provider publishes `EID20` to clients; every attempt answers "not valid for this booking".
Fix: create the code in `promotional_codes` (provider_id set, funding_source `provider`) through an owner-only RPC and drop `provider_promos`, or make `booking_create_internal` read it; enforce `target_segment` (new clients) with `is_first_visit`.

**R10 [D3] Any signed-in user can read provider and staff internals.**
Where: `supabase/migrations/20260613010000_triggers_rls.sql:51` (row policy) with table-level SELECT for `authenticated`; anon was fixed in `20261005150000_security_review_hardening.sql:133`, `authenticated` was not. Tracked in the manifest as `public-read-policies-expose-internal-provider-and-staff-columns` (open).
Scenario (PROBE): a customer with no booking selects `vat_number, cr_number, admin_notes, contact_phone, contact_email, commission_percentage, trade_license_url, cr_wathq_data` of any verified provider and `phone, email` of any active employee ("internal: slow payer" returned).
Fix: `REVOKE SELECT ON public.providers FROM authenticated; GRANT SELECT (id, owner_id, type, business_name_en, business_name_ar, description_en, description_ar, logo_url, cover_image_url, is_verified, created_at, deposit_percentage, status, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent, cr_verification_status, cr_verified_at) ON public.providers TO authenticated;` and the same for `employees` without `phone, email`; serve owner/admin fields through a `SECURITY INVOKER` view or RPC checked with `is_provider_staff`/`is_admin`.

**R11 [D4] Hidden or flagged reviews are still public.**
Where: `supabase/migrations/20260615182811_harden_auth_and_booking_core.sql:377` (`"Public read reviews"` `USING (true)`); moderation only filtered in the browser (`shop/[id]/page.tsx:383`, `mobile_app/src/lib/marketplace.ts:201`).
Scenario (PROBE): after an admin hides an abusive review, `select comment from reviews` as `anon` still returns it.
Fix: replace the policy with `USING (moderation_status = 'published' OR customer_id = auth.uid() OR is_admin() OR is_provider_staff(provider_id, auth.uid()))`.

**R12 [D2] Home-service address is readable by the provider before confirmation, and the feature has no UI.**
Where: policy `"Providers view branch bookings"` (`20260613010000_triggers_rls.sql:88`) exposes `bookings.home_address_text/lat/lng`; `get_booking_address_secure` (`20261005170000_qa_release_gate_fixes.sql:454`) masks only when called, and nothing calls it; `shop/[id]/page.tsx:1681-1687` says home booking is unavailable.
Scenario (PROBE): a `pending_payment` home booking made through the API shows the full address and coordinates to the owner. Not live from the web or mobile UI today, so this must be fixed before the UI is built.
Fix: move the address to `booking_home_addresses(booking_id, text, lat, lng)` with RLS: customer always; staff and owner only when the booking status is `confirmed`/`completed` (set `address_revealed_at` through the RPC); revoke the three columns from `bookings`; keep coordinates out of `bookings`.

**R13 [D8] Waitlist join always fails.**
Where: `web_platform/src/app/shop/[id]/page.tsx:770-777` calls `join_waitlist` with `target_branch_id, target_service_id, target_date, preferred_employee_id, preferred_time_start, preferred_time_end`; the function takes `p_branch_id, p_service_id, p_employee_id, p_preferred_date, p_preferred_time_start, p_preferred_time_end`.
Scenario: "Join waitlist" returns PGRST202 every time.
Fix: rename the keys; keep the cross-check in R44.

**R14 [D32] Customer favorites page cannot load.**
Where: `web_platform/src/app/customer/favorites/page.tsx:94-114` embeds `providers ( id, name_en, name_ar, rating, reviews_count, branches(...) )`; those four columns do not exist.
Fix: select `business_name_en, business_name_ar`; get rating from `search_marketplace_providers` or a view; adjust the mapping at `:130-140`.

**R15 [D5] G23 (buffers, processing time, variants) is not implemented.**
Where: `supabase/migrations/20261004010000_scheduling_depth.sql:148-182`; neither `get_available_slots` (`:192-450`) nor `booking_create_internal` reads the columns; no UI; no variant argument in `create_booking`.
Scenario (PROBE): a service with `buffer_after_minutes = 60` still offers the next slot right after the previous booking ends.
Fix: store `duration + buffer_before + buffer_after (+ processing)` in `bookings.duration_minutes`/`booking_window` and make slot generation use it; add `variant_id` to `create_booking` and `booking_services`; add provider screens; test with a buffered service.

**R16 [D7, D50] G22 has no UI, and the hours form cannot express or protect schedules.**
Where: no screen references `provider_closures`, `employee_time_off`, `seasonal_schedules` (grep web+mobile = 0). `web_platform/src/app/provider/settings/page.tsx:414-416` rejects `open >= close` (an overnight Ramadan shift 21:00-02:00 cannot be saved though the engine supports it); `:419-427` upserts the same hours into every active employee, overwriting individual schedules.
Scenario: an owner cannot close for Eid or add a Ramadan season; saving "business hours" silently replaces each professional's own shifts.
Fix: add screens (owner: closures and seasons; employee: leave requests; owner: approval) using the existing tables and RLS; allow `close <= open` as overnight; make the hours form per professional or apply only to staff without custom shifts, with a confirmation that lists what will change.

**R17 [D11] Booking confirmation receipt shows wrong money, wrong policy and wrong status.**
Where: `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx:70,105-106` ("Deposit Paid (15%)", "Balance Due (85%)" hard-coded; real percentage is per provider, default 20), `:280` (VAT = total x 15 / 115 although `total_price` excludes VAT) and `:279` (balance ignores VAT), `:396-400` (24 h / 50% / full forfeit hard-coded; the provider's own policy is on the shop page), `:283` (`isPaid = status !== "pending_payment"`, so a cancelled booking is labelled Paid and headed "Booking Confirmed" at `:296`), `:352` (the badge reads "Confirmed" for every status except cancelled, including `no_show`), no pay-now action and no refresh after the Tap redirect.
Scenario: price 85 SAR, deposit 20%: receipt says total 85.00, deposit 17.00, due at venue 68.00, VAT 11.09; the shop page quoted VAT 12.75 and 80.75 at the venue. A cancelled booking reads "Booking Confirmed / Paid".
Fix: read `subtotal_price, discount_amount, tax_amount, total_price, deposit_required, source`; total due = `total_price + tax_amount`; venue balance = total due - deposit - gift card; VAT = `tax_amount`; load the provider's `deposit_percentage` and cancellation fields; map every status to its own title/badge; add "Pay now" (call `payment-checkout`) and poll every 3 s for up to 60 s while `pending_payment`.

**R18 [D22] A `provider_employee` account cannot use the provider portal.**
Where: `web_platform/src/components/auth-guard.tsx:14` sends employees to `/provider/dashboard`; all 16 provider screens and `provider/layout.tsx:225` look up the business by `providers.owner_id = auth.uid()`.
Scenario: a stylist signs in and sees empty pages and no business name; RLS would allow their own bookings but no screen asks.
Fix: add an RPC `my_provider_context()` (resolving the business through `provider_memberships`/`employees.profile_id`) and use it in the layout and every screen instead of `owner_id`; build `/provider/my-day` (today's bookings for `employees.profile_id = auth.uid()`, check-in / complete / no-show through `employee_update_booking_status`, own earnings from `employee_earnings_summary`); hide owner-only navigation for employees.

**R19 [D25, D26-part] Provider fee invoices cannot be generated or collected.**
Where: `supabase/migrations/20261005010000_review_fix_money.sql:835` has no caller; `:885-886` `ON CONFLICT (invoice_number) DO UPDATE ... status = EXCLUDED.status`; `:878` VAT only on `v_receivable`.
Scenario: nobody runs it, so the receivable is never billed; if an admin does run it, a re-run mid-month or later turns a paid invoice back to `issued` and rewrites its amounts.
Fix: monthly scheduled call for closed months only; `ON CONFLICT DO NOTHING` and raise when the month is open; add `mark_fee_invoice_paid` and netting in `admin_release_payout`; decide with tax counsel whether VAT applies to the whole commission.

### Medium

**R20 [D26] Subscription billing is a single charge with no entitlements.** `supabase/migrations/20261005010000_review_fix_money.sql:226` and `confirm_purchase_payment` (`provider_subscriptions` never expires; `tap_subscription_id` holds a payment intent id); no function reads `max_branches`, `max_employees`, `commission_discount_pct`, `included_monthly_sms`; free plan replaces a paid period at once; prices 299/799 SAR seeded by the agent. Fix: expiry job, enforce limits in employee/branch insert policies, keep the paid period until `current_period_end`, owner approves prices.

**R21 [D6] Seasonal overnight schedules lose their after-midnight hours and override days off.** `20261004010000_scheduling_depth.sql:300-304` reads the weekly `employee_availability` for the previous day instead of the seasonal row; `:291` sets `v_is_working := TRUE` regardless of the employee's day off. PROBE: seasonal 21:00-02:00 offers 21:00-23:30 but nothing at 00:00-01:30 the next day, while a weekly overnight shift does. Fix: compute the previous-day spillover from the schedule that applied on that day (seasonal first), keep `is_working_day` for seasons or add `days_of_week`.

**R22 [D13] Main booking flow is not keyboard or screen-reader operable.** `shop/[id]/page.tsx:1376,1445,1481` (service and specialist cards are `div onClick`), `:1692` (date input has no accessible name), `:1177-1186` (icon links without names), modals without `role="dialog"`, focus trap or Escape (`:2088-2235`; `customer/bookings/page.tsx` six modals; 16 files with `fixed inset-0`). Fix: render cards as `<button type="button" aria-pressed>`; add `htmlFor`/`aria-label`; move every modal to `ModalOverlay`/`useModalBehavior` from `web_platform/src/components/modal.tsx`; add `min` to date inputs.

**R23 [D12] Cancelling hides the consequences and swallows failures.** `customer/bookings/page.tsx:361-376` catches and only `console.warn`s; the confirm dialog (`:782-809`) never shows the late-cancel fee or refund and the result of `cancel_booking` (fee, refund) is discarded; status enum printed raw (`:594`); dates always `en-GB` and no time zone (`:559-569`); "Book Again" (`:650`) links to `/customer/book?service_id=` but that page reads `?id=` and the select lacks `services.id`, so it lands on `/discover`. Fix: preview from provider policy before confirming, show the returned fee/refund, show errors, translate statuses, use `Asia/Riyadh` and the active locale, link to `/shop/{provider_id}?service=...`.

**R24 [D14, D15] Slot display and any-professional duration.** `shop/[id]/page.tsx:205` formats slots with `en-US` AM/PM in Arabic; 15 hard-coded "SAR" in the page; `get_branch_available_slots` (`20261004010000_scheduling_depth.sql:481-543`) uses the first service's `base_duration_minutes` and checks only that service, so any-professional with several services lists slots `booking_create_internal` rejects. Fix: format with `ar-SA` and `Asia/Riyadh`, pass the combined duration and the service list to the RPC.

**R25 [D17, D29] No locale provider.** 24 pages run `setInterval(handleLangSync, 1000)` (customer, provider, public); 54 files own language state; `app/layout.tsx:33` always renders `lang="en" dir="ltr"`; `customer/bookings/page.tsx:135` and `provider/bookings/page.tsx:68` default to Arabic while the shop defaults to English. Fix: one `LocaleProvider` (cookie `primora_lang`, read on the server for `<html lang dir>`), one `useLocale()` hook; delete the intervals.

**R26 [D18] RTL is mirrored twice.** `provider/layout.tsx:294,331,363,380`, `customer/layout.tsx:270,304,324`, calendar and others use `isRTL ? "flex-row-reverse" : "flex-row"` while `document.documentElement.dir = "rtl"` is set (CSS: `row-reverse` under `dir=rtl` reads left-to-right; no override in `app/globals.css`). Reasoned from CSS semantics, not rendered. Fix: remove the conditional reversals and use logical utilities (`ps-`, `pe-`, `text-start`, `rtl:rotate-180` for arrows).

**R27 [D50-part] Provider dashboard numbers and share kit.** `provider/dashboard/page.tsx:278` "Walk-ins" = non-home bookings; `:236` unbounded bookings select (1,000-row cap) summed in the browser; `:162,226,285` `hasPolicy: true` hard-coded; `:377-382,395` fall back to the slug `elite-barbershop`; `:621-648` the "QR" is a hand-drawn SVG that cannot be scanned; `:656` print window loads `api.qrserver.com` and writes `businessName` into `document.write`. Fix: server-side aggregates (`source = 'walk_in'`), derive the checklist from rows, hide the share kit until the provider id exists, draw the QR locally (dependency decision: `toqr` already in the lockfile) and escape the name.

**R28 [D24] A customer can forge a provider reply.** `20260615182811_harden_auth_and_booking_core.sql:362` check allows every column; PROBE inserted `reply_comment = 'Thank you - owner'`. Fix: `GRANT INSERT (booking_id, rating, comment) ON public.reviews TO authenticated` after revoking table INSERT, or extend WITH CHECK (`reply_comment IS NULL AND reply_created_at IS NULL AND moderation_status = 'published' AND moderated_by IS NULL`).

**R29 [D27, D45] Tests do not prove screens or removed functions.** `web_platform/tests/negative-authorization.test.mjs:714-726` (`verify_provider_cr`) and `:933-944` (`enqueue_post_visit_rebook`, `post_visit_review_rebook`) assert text of functions later migrations removed; the `get_branch_available_slots`, closure, leave and season behaviours are never executed. Fix: delete the stale cases; add executing tests (complete a booking and read `message_queue`; list branch slots as anon; closures, leave, seasonal overnight). See R44.

**R30 [G25] Tax-invoice hash chain is not concurrency-safe and invoices are issued lazily.** `supabase/migrations/20261005010000_review_fix_money.sql:1081` reads the provider's last `invoice_hash` (`ORDER BY created_at DESC LIMIT 1`) and inserts without a lock; the function runs only when a customer, staff member or admin opens the invoice (`customer/bookings/page.tsx:204-220`), so `issue_date` is the first click, not the visit. Scenario: two simultaneous requests for one provider both chain from the same predecessor (a fork); an invoice for a visit in September is dated in November. Fix: take `pg_advisory_xact_lock(hashtext(provider_id::text))` before reading the previous hash; issue the invoice in the completion trigger (service role) and keep `issue_date` = completion time; add a test that issues two invoices in parallel connections.

**R31 [D35] Failed queries on financial screens render empty tables.** `web_platform/src/app/admin/ledger/page.tsx:661` (payout requests), `:717-719` (reconciliation runs), `:753-755` (fee invoices), `web_platform/src/app/admin/notifications/page.tsx:187-188` (message log). Fix: set an error state and render it instead of the table.

**R32 Wathq check does not tie the CR to the applicant.** `supabase/functions/wathq-verify/index.ts:46-53` ignores `payload.crName`/owners; the badge says "CR verified via Wathq". Fix: compare the registered name (normalized Arabic) with `business_name_ar/en` and require admin confirmation on mismatch; require a verified or manually reviewed CR in `approve_provider_application`.

**R33 [G31] Push notifications are not wired.** No code writes `expo_push_tokens` (no `expo-notifications` in `mobile_app/package.json`), `send-push`/`send-notification` have no caller, yet `20260703014433_phase2_admin_control_plane.sql:157` marks Expo Push `connected`; `notifications` is written only by admin broadcasts. Fix: register tokens on sign-in, add a trigger/queue that creates a notification and a push for booking events, or set the integration to `not_configured`.

**R34 [D46, D47] Public claims contradict the system.** `web_platform/src/app/become-provider/page.tsx:31,94` (15% commission; real rule is 20% with 10-40 SAR on a first marketplace visit, 0% otherwise) and Growth features nothing gates; `app/page.tsx:49,60` and `about/page.tsx:16-17` ("Top 1% Vetted", "passes verified identity checks, portfolio evaluations"). Fix: derive pricing text from `fee_rules` and `subscription_plans`; remove the vetting claims.

**R35 [G29] `/services` filters in the browser and truncates ratings.** `web_platform/src/app/services/page.tsx:442-454,563-607` downloads all services, providers and all reviews (1,000-row cap, ratings become wrong beyond it), plain `includes` search. Fix: use `search_marketplace_providers` with paging; remove the `reviews` select.

**R36 [G35] CSV import robustness.** `web_platform/src/app/provider/customers/page.tsx:139-196` and `import_provider_clients`: accept a file, parse quotes, skip a header row, normalize `966...`/`00966...`/Arabic-Indic digits, reject rows without a phone, translate "CSV Data (Name, Phone, Notes)" and the two error strings.

**R37 [D36] Mobile deposit estimate is wrong.** `mobile_app/src/components/shop-details-modal.tsx:236` uses `total (incl. VAT) x deposit %`; the server uses `taxable x deposit %` (`booking_create_internal` `:750-757`). 85 SAR at 20%: app 19.55, charge 17.00. Fix: `Math.round(price * pct) / 100`.

**R38 [D37] Mobile cancellation copy is wrong.** `shop-details-modal.tsx:84-85` says the late and no-show fees are "% of the price"; the server takes a percentage of the deposit (`booking.test.mjs:131`). Fix: "% of the deposit" in both languages.

**R39 [D38] Mobile payment returns to the web site.** `supabase/functions/payment-checkout/index.ts` always redirects to `${APP_URL}${redirectPath}`; the app opens the URL with `Linking.openURL` and closes (`shop-details-modal.tsx:279-280`). Fix: accept an allow-listed `returnUrl` (`mobileapp://bookings`), use `expo-web-browser` `openAuthSessionAsync`, refresh bookings on return.

**R40 [D39] Mobile language and RTL.** Six independent `useState<"en" | "ar">("ar")` (`app/index.tsx:19`, `explore.tsx:39`, `profile.tsx:47`, `messages.tsx:36`, `service-board.tsx:43`, `bookings.tsx:32`), nothing persisted, tab labels English (`components/app-tabs.tsx`), RTL by `row-reverse` (`app/index.tsx:237`) without `I18nManager` (double mirroring on an Arabic-locale Android phone; not device-tested), English placeholders in `service-board.tsx:474-569`. Fix: one provider persisted in storage, `I18nManager.allowRTL/forceRTL` with `expo-localization`, remove `rtlRow`.

**R41 [D40] Mobile has no accessibility metadata.** 129 `Pressable/TouchableOpacity`, zero `accessibilityLabel/accessibilityRole/accessibilityState`; "OK" hard-coded (`shop-details-modal.tsx:268`). Fix: shared pressable wrapper with `accessibilityRole="button"`, label and state.

**R42 [G37] Home-service radius and travel are not enforced.** `branches.geofence_radius_km` is read by no function; `calculate-travel` has no caller; `booking_create_internal` checks only eligibility and non-null coordinates. Fix: reject a booking outside `geofence_radius_km` (Haversine in SQL), use `calculate-travel` for the travel buffer, show the radius to the customer.

**R43 [D28, G41] Post-visit link defects.** `booking_message_variables` hard-codes `https://primora.sa` and `/provider/bookings`; `customer/reviews/page.tsx` ignores `?booking=`. Fix: `platform_settings.public_base_url`; read the parameter and open that booking's review form.

**R44 [D45] No CI check ties UI queries to the schema.** The three scripts used here (rpc argument names, select/embed columns, filter and insert keys) found R5, R6, R13, R14 in minutes. Fix: add `scripts/verify-ui-schema.mjs` using `supabase/tests/db/harness.mjs` to `npm test`, failing on any mismatch; also run the DB suite once with `TZ=UTC` in CI.

### Low

**R45 [D19, D41] Baked-in project fallback.** `web_platform/src/lib/supabase.ts:20-26` and `mobile_app/src/lib/supabase.ts:5-14` hard-code the dead project ref and a publishable key; the mobile module throws at import when `EXPO_PUBLIC_SUPABASE_URL` has another host and `EXPO_PUBLIC_SUPABASE_PROJECT_REF` is unset, so a new project crashes the app on launch. Fix: delete the fallbacks and the throw (warn only).

**R46 [D42] Mobile start-up and consent.** `mobile_app/src/app/profile.tsx:190` uses `getUser()` (network) so an offline launch shows signed-out; `:235-241` inserts a new `terms_privacy` consent row with the fixed version `v1.0` at every sign-in and throws after sign-in when it fails (the web modal swallows the same failure, `shop/[id]/page.tsx:1000-1025`). Fix: `getSession()` first; record consent once through an RPC that stores the published `legal_agreements` version.

**R47 [D21] Portfolio consent is a self-set boolean.** `employee_portfolios.customer_consent_confirmed` can be set by the employee; no customer or `consents` link. Fix: store `consent_id` referencing a `photos_portfolio` consent of the pictured customer.

**R48 Residual edge case in the integrator's storage adapter.** `mobile_app/src/lib/chunked-storage.ts:34-36` splits by UTF-16 units; a split inside an emoji surrogate pair in `user_metadata` would corrupt the session on read. Fix: split on code points (`Array.from(value)`).

**R49 `send-otp` is unused and carries stale text.** `supabase/functions/send-otp/index.ts:48-57`: brand "Beauty & Grooming", "valid for 3 minutes", Twilio sandbox sender default `whatsapp:+14155238886`; no caller, no auth hook in `supabase/config.toml`. Fix: wire it as the Supabase Send-SMS hook with settings, or delete it.

**R50 [G42, G43] Delivery surfaces are missing.** `web_platform/src/app/provider/employees/page.tsx` edits only `photo_url` (`:560`); no screen edits `bio_en/ar`, `years_of_experience`, `specialties`, `instagram_handle` or `employee_portfolios`, and the shop page never shows the bio or portfolio; nothing sends the monthly "PRIMORA brought you" message. Fix: add the profile fields and a consented-photo uploader to the employee form and a portfolio section to the specialist card; add a monthly job that enqueues a `provider_monthly_summary` template to the owner (consent permitting).

## 3. Could not verify

- Hosted behaviour: no hosted Supabase project (reference no longer resolves), Tap, WhatsApp Cloud, Wathq or Twilio; Edge Functions were read, not run (no Deno on this machine).
- Real PostgreSQL 15: only PGlite 18.3 was available; local Docker containers on this machine belong to other sessions and were not touched.
- Rendering: no browser session was driven, so RTL double mirroring (R26), keyboard order and screen-reader output (R22, R41) come from reading JSX/CSS, not from a device.
- Mobile on devices: RTL on an Arabic-locale phone (R40), keychain behaviour on real iOS/Android, `openAuthSessionAsync` feasibility.
- Tap list API parameters used by `reconcile-psp`, Wathq response shape, Meta template approval.
- Whether `payment-checkout`'s Tap redirect parameters are accepted exactly as sent.
- Expo/React Native tooling advisories and `eslint-config-next` (no network).
- Lint and `next build` were not re-run (not in scope of the read-only pass beyond the three suites).

## 4. Things the earlier review left undone

1. **Mobile session persistence** - done by the integrator. Verified in the working tree: `mobile_app/src/lib/supabase.ts` passes a keychain-backed `storage`, `persistSession`, `autoRefreshToken`, `detectSessionInUrl: false` and an AppState listener; `chunked-storage.ts` writes parts before the count so a cut write reads as "no session"; `mobile_app/tests/chunked-storage.test.mjs` exists. Residual: R46, R48, R45. Not yet committed.
2. **Home-service booking UI** - still not built. To finish: (a) database: `booking_home_addresses` table with reveal-on-confirmation RLS and a revoked column grant (R12); radius check against `branches.geofence_radius_km` and a travel buffer from `calculate-travel` (R42); capture the deposit only after the provider accepts (hold-then-capture through Tap authorization, or refund automatically on rejection); (b) web `shop/[id]/page.tsx`: toggle "at my address" when every selected service is `is_home_service_eligible`, address text + map pin or `navigator.geolocation`, pass `request_home_service`, `request_home_address_text`, `request_home_address_lat/lng` to `create_booking`/`create_multi_service_booking` (arguments already exist), remove the "not available yet" notice (`:1681-1687`); (c) provider screens: show the address through `get_booking_address_secure` only after confirmation; (d) mobile: same form in `shop-details-modal.tsx`; (e) tests: provider cannot read the address before confirmation, outside-radius booking refused, address revealed once and audited; AR/EN strings and RTL for the form.
3. Expo/React Native advisories and the `gemini` branch merge are process items outside this review.

## Appendix: evidence by gap

The sections below are the working evidence notes for each gap (paths, probes, tests). References `Rnn` point to the ranked list above.

## APPEND 2 (G26, G30, G35, G41, G43, G34, G38 detail) - evidence

### G26 Wathq CR verification - PARTIAL
- `supabase/functions/wathq-verify/index.ts:15-18` admin-only (resolveCaller), 10-digit check, records through the service-only `record_wathq_cr_verification`; admin UI `web_platform/src/app/admin/providers/provider-management.tsx:839`; public badge `web_platform/src/app/shop/[id]/page.tsx:1257`; the search RPC returns `cr_verification_status`.
- Weaknesses: only "registration exists and is active" is checked; the Wathq payload name/owner is never compared with the applicant (`index.ts:46-53` ignores `payload.crName`), so any active CR number earns the public badge "CR verified via Wathq". `approve_provider_application` does not require a verified CR (manifest gap `provider-approval-needs-no-reason-or-verified-registration`). Verification is a manual admin click after approval, not "at application" as the roadmap says.
- Tests: `supabase/tests/db/trust.test.mjs` covers the recording rules; the web test `web_platform/tests/negative-authorization.test.mjs:714` asserts a function (`verify_provider_cr`) that no longer exists in the effective schema.

### G30 reviews, ratings, moderation - PARTIAL
- A review needs a completed booking (policy + `set_review_relationships`), one per booking (`reviews_booking_id_key`), rating 1-5 check; provider reply only through `reply_to_review` (owner/admin); moderation only through `moderate_review` (admin, reason of 3+ characters, audited). Employee rating shown per specialist (`shop/[id]/page.tsx:407`). Behavioural test only for `moderate_review` (`supabase/tests/db/qa_defect_fixes.test.mjs`); `reply_to_review` has a source-text test only.
- No "report review" action for providers or customers (roadmap: "report/hide flow"); the admin simply browses all reviews (`admin/reviews/page.tsx:78`).
- R11 (hidden reviews stay public) and R28 (forged reply) below.

### G35 client CSV import - PARTIAL
- `import_provider_clients` (owner/admin, consent flag required, max 2000 rows, audited; behavioural test `trust.test.mjs:113`). UI `web_platform/src/app/provider/customers/page.tsx:139-196` is a paste box, not a file upload; parsing is `line.split(",")`, so quoted commas break and a header row `Name,Phone` is imported as a contact named `Name` (the non-numeric phone becomes NULL in SQL and NULL phones are not de-duplicated because `ON CONFLICT (provider_id, phone)` ignores NULLs). Phones `966501234567` and `00966...` are skipped. The label "CSV Data (Name, Phone, Notes)" and the errors "No valid rows found to import." and "Provider account not found." are English-only in the Arabic UI.

### G41 post-visit WhatsApp - PARTIAL
- `enqueue_post_visit_rebook` no longer exists; `handle_booking_messaging_lifecycle` (effective def) enqueues template `post_visit_review` (AR/EN, review and rebook links) one hour after the visit ends. Variables come from `booking_message_variables` (`review_url`, `rebook_url`).
- Defects: the domain `https://primora.sa` is hard-coded in the database function; `review_url` carries `?booking=` but `customer/reviews/page.tsx` never reads it; no behavioural test that completing a booking enqueues the message (the web test `negative-authorization.test.mjs:933-941` asserts the removed function and a removed template name `post_visit_review_rebook`).

### G43 "PRIMORA brought you" summary - PARTIAL
- `get_provider_monthly_value_summary` (staff/admin only) + dashboard card; behavioural test `trust.test.mjs:161`. The roadmap asked for a monthly WhatsApp/email summary: nothing sends it, and table `provider_value_summaries` is unused. `commission_saved_sar` assumes every direct booking would have paid the first-visit marketplace fee, which overstates the saving for repeat customers.

### G34 provider fee invoices - PARTIAL, not operable
- `generate_provider_monthly_fee_invoice` (effective: `supabase/migrations/20261005010000_review_fix_money.sql:835`) has no caller anywhere (no UI, edge function or cron); the admin ledger table can only be filled by tests. `ON CONFLICT (invoice_number) DO UPDATE ... status = EXCLUDED.status` means a re-run resets a paid/settled invoice to `issued` and rewrites its amounts; any month, including the unfinished current one, is accepted. VAT (15%) is charged only on the uncollected part (`v_receivable`), not on the whole commission, which needs a tax decision. No collection step exists (no netting against payouts; `paid_at` and `payment_method` are never written). The admin ledger swallows a failed invoice load and shows an empty table (`admin/ledger/page.tsx:753-755`).

### G38 subscription billing - PARTIAL
- `subscribe_provider_plan` creates `subscription_payments(pending_payment)`, Tap pays it, `confirm_purchase_payment` activates `provider_subscriptions` for one month/year (behavioural test `money.test.mjs`). It is a one-off charge: nothing renews, expires or downgrades at `current_period_end`; `tap_subscription_id` stores the payment intent id; the plan columns `max_branches`, `max_employees`, `commission_discount_pct`, `included_monthly_sms` are read by no function (grep of effective definitions), so there are no entitlement checks. Choosing the free plan overwrites an active paid period immediately. Plan prices (299/799 SAR) were seeded by the agent although the roadmap says "prices confirmed by the owner".

---
## APPEND 3 (G28, G29, G31, G32, G39, G40, G24 portal, mobile, public pages) - evidence

Method addition: I wrote a script that parses every `.from().select()` string (including embedded resources) and every `.rpc()` call in
`web_platform/src` and `mobile_app/src` and checks them against the migrated schema. It found three real column errors (R6, R5, R14) that
no test caught. Recommended as a permanent CI test, see R44.

### G28 server-rendered pages / SEO - PARTIAL
- Real: `web_platform/src/app/sitemap.ts` (static routes + every verified shop, hourly revalidate), `robots.ts`, server `generateMetadata` for shop pages (`app/shop/[id]/layout.tsx:12-39`, Arabic first, canonical, OpenGraph).
- Missing: every public page is `"use client"` (landing, discover, services, shop, categories), so the HTML a crawler receives is the loading shell ("Loading provider..."); no JSON-LD/schema.org anywhere (grep = 0); no district pages, no Arabic slugs, no hreflang. The roadmap deliverable "server-rendered provider, category and district pages" is not met.
- The four category pages that the sitemap ranks at priority 0.9 contain invented businesses (R2).

### G29 server search - PARTIAL
- Real and tested: `search_marketplace_providers` (Arabic normalization via `normalize_arabic`, Haversine distance, pagination capped at 50; `trust.test.mjs`). Used by `/discover`, `/customer/search`, mobile explore.
- Gaps: the main catalogue `/services` still downloads all categories, services, providers and **all reviews** and filters in the browser (`web_platform/src/app/services/page.tsx:442-454` and filters at `:563-607`, plain `toLowerCase().includes`, no Arabic normalization). With more than 1,000 reviews (`max_rows = 1000`) provider ratings there become wrong because the list is truncated. Distance sort: only `/discover` passes coordinates and they are the city centre (`discover/page.tsx:156`), `customer/search` and mobile pass none; no browser geolocation anywhere.
- SQL: the text filter is `normalize_arabic(...) LIKE '%q%'` over concatenated columns with per-row correlated review subqueries and no index; `%` and `_` typed by the user act as wildcards.

### G31 orphaned tables and features - PARTIAL
- `notifications`: only `admin_broadcast_notification` inserts into it; booking events never create in-app notifications, so the customer notification centre shows admin broadcasts only.
- `expo_push_tokens`: nothing writes it (no `expo-notifications` in `mobile_app/package.json`, no registration code); `send-notification` reads it but has no caller; `send-push` has no caller; yet the integrations seed marks Expo Push `connected` (`20260703014433_phase2_admin_control_plane.sql:157`).
- `provider_promos`: the provider Promotions page writes only this table (`provider/promotions/page.tsx:187`) but no database function reads it. Checkout (`booking_create_internal`, `validate_and_apply_coupon`) reads `promotional_codes` only. A provider can publish a code that customers can never redeem (R9).
- `provider_customer_notes`: wired both ways (OK).

### G32 honest admin states - PARTIAL
- Fixed since the first review: SAR, demo fallbacks. Still masking failures on financial screens: `admin/ledger/page.tsx:661` (payout requests), `:717-719` (reconciliation runs), `:753-755` (fee invoices) and `admin/notifications/page.tsx:187-188` (message log: nothing set, no error shown) turn a failed query into an empty list (R31). Pagination remains open for most lists (manifest gap `no-pagination-or-server-side-filtering`).

### G39 dashboard accessibility and mobile navigation - PARTIAL
- Provider/customer/admin layouts have a labelled hamburger (`aria-expanded`, `aria-controls`; `provider/layout.tsx:302-313`, `customer/layout.tsx:281-284`) and the admin shell has a skip link; status badge contrast was fixed in admin only.
- Not done: customer and provider layouts have no skip link or focus target on `<main>` (`customer/layout.tsx:383`, `provider/layout.tsx:444`); hand-made modals (R25) and `div onClick` cards (R22); icon-only controls without names (`shop/[id]/page.tsx:1177-1186`, modal close "x" buttons everywhere); date inputs and promo/gift inputs without associated labels (`shop/[id]/page.tsx:1692,1814,1858`); mobile app has 129 `Pressable/TouchableOpacity` and zero `accessibilityLabel/accessibilityRole`. Not verified with a screen reader or in a browser.

### G40 CORS, tokens, framework - mostly COMPLETE
- No `Access-Control-Allow-Origin: *` remains (grep over `supabase/functions`); `verify_jwt = false` only for `payment-webhook`, which re-fetches the charge from Tap; each service-role function reads the Authorization header. Next.js 16.3.8 in `web_platform/package.json` (AGENTS.md still says 16.2.9). Developer tokens are generated in the browser and stored as SHA-256 only (`developer/page.tsx:247-256`); there is no API that accepts them (G69).
- Residual (tracked low in the manifest): localhost origin allowed and `http://localhost:3000` returned as the fallback origin (`calculate-travel/index.ts:18`, `send-otp/index.ts:17`, ...); `send-otp` hard-codes the Twilio sandbox sender default and the old brand "Beauty & Grooming", has no caller and no auth hook configured.

### G24 employee experience - PARTIAL (portal evidence)
- `employee_update_booking_status` is correct (tested `booking.test.mjs:163`), but the only screen that calls it cannot load (R5) and is owner-scoped: it finds the business with `providers.owner_id = user.id` (`provider/bookings/page.tsx:92-96`), so a `provider_employee` gets an empty list without an error. There is no My-day screen, no employee earnings screen (view `employee_earnings_summary` is read only by the owner pages).

### G36 mobile app - PARTIAL
- Real: all six screens read live data through `lib/marketplace.ts` and the RPCs; phone OTP sign-in (`app/profile.tsx:196-243`); payments via Tap checkout opened with `Linking.openURL`; session persisted in the keychain (integrator change, accepted).
- Defects: R37 (wrong deposit estimate), R38 (wrong cancellation-fee copy), R39 (payment return lands on the web site), R40 (per-screen language state, English tab labels, `row-reverse` mirroring), R41 (no accessibility props), R45 (project-ref guard throws at import), R46 (every sign-in inserts consent rows with a hard-coded version; getUser on start signs the UI out offline). No home-service booking UI, no reschedule UI, no push notifications (R9-related), no tests (`mobile_app/tests/` is new and uncommitted).

