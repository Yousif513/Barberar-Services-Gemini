# Gap verification A: P0 gaps G01-G19 (reviewer: Claude Code, read-only)

Status: COMPLETE for the scope reviewed (all 19 gaps have a verdict; 29 defects listed). Written incrementally. Rows and defects were verified by reading the final-state code and, where marked "probe", by running the repo's own migrations in an in-memory PGlite database (probe scripts are in the reviewer scratchpad; nothing was written to the repository except this file).

Headline: the database layer is the strongest part of the work (219 behaviour tests, catalog-driven negative matrix, reasoned and audited admin commands). The P0 milestone is not met for users, for four reasons: (1) a phone is never marked verified after OTP, so the whole WhatsApp pipeline (G11) and the "verified phone" promise (G09) cannot work (D-01); (2) fee, policy and consent inputs that the business depends on are chosen by the caller or by the provider with no bounds and no editor (D-02, D-08, D-27, D-15); (3) several customer-facing screens still show invented or wrong data (D-04, D-05, D-09, D-14, D-22); (4) the tests that are meant to prove G05, G06, G09, G16, G17, G18 are string searches over source or over superseded migrations (G19).

### Ranked index
- CRITICAL: D-01, D-19
- HIGH: D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-11, D-16, D-21, D-23, D-27
- MEDIUM: D-10, D-12, D-13, D-14, D-15, D-17, D-18, D-22, D-24, D-26, D-29
- LOW: D-20, D-25, D-28

Scope: `primora-fix`, branch `claude-code`, reviewed at commit `26c0ef8` plus the docs-only commits after it (other agents had uncommitted edits in `mobile_app/`, `package.json`, `supabase/config.toml` and `supabase/seed.sql` while I worked; they are not part of this review). Method: read the final-state migration function/policy, the screen that calls it, and one test; plus read-only probes against an in-memory PGlite database migrated from the repo (scripts live in the reviewer scratchpad, nothing written to the repo).

Baseline run by the reviewer: `npm run test:db` 219/219 pass; `npm run test --workspace=web_platform` 156/156 pass (118 ms: these are source-text assertions, see G19).

Verdict key: COMPLETE (DB command + authorization + UI on web and mobile where needed + AR/EN/RTL + a test that proves behaviour), PARTIAL, MISSING, BROKEN.

## 1. Verdict table (preliminary rows; evidence is refined below as each gap is finished)

| Gap | Verdict | Evidence (path:line) | Notes |
|---|---|---|---|
| G01 Provider application to approval | PARTIAL | `supabase/migrations/20261005170000_qa_release_gate_fixes.sql:737-802` approve (admin-gated, reason, audited); `web_platform/src/app/become-provider/page.tsx:235-267` form | Approval works and is tested (`supabase/tests/db/trust.test.mjs:66`). Form never collects coordinates, so every branch gets Riyadh-centre defaults (D-07); city hard-coded "Riyadh" (`become-provider/page.tsx:244`); documents are a free-text URL; provider agreement acceptance is not enforced (D-12). |
| G02 Source-attributed fees | PARTIAL | `supabase/migrations/20261005000000_review_fix_booking_core.sql:560-564,683`; `20261003220000_booking_rules_and_money.sql:521-566` | Fee engine and fee_rules exist; `source` is chosen by the caller so the fee can be dodged (D-02); a provider can set deposit to 0 so nothing is collected (D-08); no admin screen edits fee_rules. |
| G03 Booking link, QR, share | PARTIAL | `web_platform/src/app/provider/dashboard/page.tsx:377-402,618-663` | Links and WhatsApp/Instagram share exist. The on-screen "QR code" is a hand-drawn SVG that encodes nothing (D-09). |
| G04 Hold expiry | PARTIAL | `20261005000000_review_fix_booking_core.sql:1537-1571,1575-1652`; `20261005020000_review_fix_trust_growth.sql:753-786`; `supabase/tests/db/booking.test.mjs:183,196` | DB side is sound and behaviour-tested. The scheduler block is skipped when pg_cron/pg_net are absent, so it is never executed by tests; confirmation page shows "Booking Confirmed" for a cancelled hold (D-14). |
| G05 Refund function | COMPLETE (server) | `supabase/functions/process-refund/index.ts:11-52`; `_shared/refunds.ts:13-63`; `20261005010000_review_fix_money.sql:565-655` | Admin/service only, refund_requests, idempotency key, audited. Edge-function auth is asserted by text only (G19). Tap idempotency header support unverified (Section 3). |
| G06 Notification function | PARTIAL | `supabase/functions/send-notification/index.ts:4-83` | Needs a session; cross-user only for admin/service (correct). Any signed-in user may still push arbitrary title/body to their own device. CORS accepts any `*.vercel.app` and any host ending `primora.sa` (D-20). Grep over the repo finds no caller of `send-notification` or `send-push`: no server event sends push, so "push only from trusted server events" is satisfied by non-use, not by a built path. |
| G07 Raw card fields removed | PARTIAL | removed from `shop/[id]/page.tsx`, `provider/pricing/page.tsx`; but `web_platform/src/app/customer/wallet/page.tsx:331-334,557-570` | Card inputs are gone. The wallet still renders two invented saved cards with a real-looking name (D-05). |
| G08 Unbacked public claims | PARTIAL | `web_platform/src/app/page.tsx:63-64,116-117,127,413-414`; `provider/pricing/page.tsx:69-70,147-148,875-878`; `about/page.tsx:14`; `privacy/page.tsx:176`; `security/page.tsx:102-103` | ZATCA/SMS/escrow/SAMA/5-minute payout wording is gone from the pages that were edited. Still live: "Hygiene Certified" and "100% strict sterilisation protocols", Arabic "trusted escrow payment system", "Booking Guarantee", "Bank-Grade Encryption", "PCI-DSS Compliant" badges, "Saudi PDPL Compliance" heading, "guarantees a vetted ... experience" (D-22). The guard test (`web_platform/tests/no-mock-data.test.mjs:33`) only matches the English word "escrow" inside quoted strings. |
| G09 Phone OTP identity | BROKEN | `20261003200000_phone_identity_and_consents.sql:13-44`; probe E3; `web_platform/src/app/login/page.tsx:126-131`; `supabase/functions/send-otp/index.ts:34` | Fabricated numbers are gone, but `profiles.phone_verified` never becomes true after OTP (D-01), phone numbers are unique and user-writable (D-06), `send-otp` has no caller, login screen is English-only (D-17). |
| G10 Cancellation policy | PARTIAL | `20261005170000_qa_release_gate_fixes.sql:515-673`; `shop/[id]/page.tsx:1989-2017`; tests `supabase/tests/db/booking.test.mjs:107-145` | Server enforcement (window, late fee, no-show fee, refund request, audit) is correct and behaviour-tested. Shown before payment on web and mobile. But: no screen lets a provider set the three policy columns (grep of `web_platform/src` finds only reads; `provider/settings/page.tsx:372` writes `deposit_percentage` only), so every shop runs the DB defaults (D-27); the receipt hard-codes 24 h / 50% (D-04); mobile says "% of the price" (D-10); columns unbounded (D-08); the customer cancel button swallows failures (`customer/bookings/page.tsx:361-376`, D-29). |
| G11 WhatsApp messaging | BROKEN (end to end) | `20261005020000_review_fix_trust_growth.sql:597-786`; `20261005000000_review_fix_booking_core.sql:1385-1414,1657-1717`; `supabase/functions/dispatch-messages/index.ts:13-91`; test `supabase/tests/db/trust.test.mjs:126` | Good design: DB claims and renders, function sends and reports, a message is "sent" only with a Meta id, consent + verified phone + quiet hours enforced, retries with backoff, templates AR/EN. Nothing can send in practice because no phone is ever verified (D-01) and providers have no way to give the WhatsApp consent that `owner_new_booking` also requires (`claim_message_batch` checks consent for every template; consent UI exists only for customers); every link points to a route that does not exist (D-03); a 2 h reminder can be deferred past the appointment (D-13); the admin "Total Cost" KPI sums `cost_sar`, which is now always NULL (`20261005020000...:568-569`, `admin/notifications/page.tsx:178`), so it always shows 0.00 SAR; quick-reply buttons (Confirm/Reschedule/Cancel) were not built, only a web link. The test passes because the harness sets `phone_verified` by hand. |
| G12 Fund custody | PARTIAL (flag only; mechanism MISSING) | `supabase/functions/payment-checkout/index.ts:98-104`; `20261003220000_booking_rules_and_money.sql:1056-1081` | Flag defaults off. Turning it on returns 503: no sub-merchant onboarding or split exists. |
| G13 Consents and DSR | PARTIAL | `20261003200000_phone_identity_and_consents.sql:74-263`; `20261005140000_admin_customer_directory.sql:109-154`; `web_platform/src/app/privacy/page.tsx:92-123`; `admin/customers/page.tsx:456`; `customer/settings/page.tsx:188-208` | Tables, intake form, 30-day default, admin queue and a reasoned status command exist. `record_consent` is never called by any client (all insert directly). Consent writes ignore errors (D-11), the evidence is client-forgeable (D-15), the signup consent is recorded without being asked (D-23), email sign-ups record none (`login/page.tsx:544-619` has no checkboxes), and no screen can export a customer's data or erase it (only "clear profile details", `admin/customers/page.tsx:437`). `photos_portfolio` consent can be toggled but nothing reads it. |
| G14 Audit and idempotent money | PARTIAL (strong) | `20261005170000_qa_release_gate_fixes.sql:39-128,170-387`; `20261005010000_review_fix_money.sql:565-655`; `supabase/tests/db/qa_adversarial.test.mjs:130-236` | Payout request, release, refund, role change and booking commands are single server transactions with reasons and audit rows; replay/double-release are tested with behaviour. The browser no longer writes money tables (grep finds no `.update/.insert` on ledger, payouts, refunds, fee rules). Gaps: audit trigger skips service-role writes, so `confirm_booking_payment` (money capture) leaves no audit row (ledger only); `admin_release_ledger_item` records its idempotency key but does not enforce it; the idempotency lookup reads `admin_audit_logs.details` with no unique index (safe only because of the row lock); fee_rules and feature flags have no console screen, so changes are plain table writes (probe E22: flipping `payments_marketplace_split` needs no reason). |
| G15 Funnel analytics | PARTIAL | `web_platform/src/lib/analytics.ts:127-142`; call sites: `login/page.tsx:78,134`, `discover/page.tsx:169`, `shop/[id]/page.tsx:472,1124,1130,1753`, `become-provider/page.tsx:271`, `customer/reviews/page.tsx:152` | Events are only forwarded to `window.posthog` if something else loads it; nothing does, and there is no server-side event table. Only 9 call sites exist: `payment_succeeded`, `payment_failed`, `booking_completed`, `booking_cancelled`, `booking_no_show`, `reminder_sent`, `reminder_action`, `provider_live` are declared and never emitted, so the funnel stops at "payment_started". `booking_confirmed` is sent with `total_price: 0` (`shop/[id]/page.tsx:1124`). Error tracking (`captureError`) is never called (D-26). |
| G16 Booking survives login | PARTIAL | `shop/[id]/page.tsx:1053-1067,978-1036,2171-2235`; `mobile_app/src/components/shop-details-modal.tsx:240-247`; `mobile_app/src/app/profile.tsx:197-251` | Web keeps the selection (sessionStorage, 2 h) and verifies the phone inline, then re-runs `handleBook`; it is AR/EN. Mobile only shows an alert "sign in from the Profile tab", which drops the selection, and Tap returns to the website URL `APP_URL/customer/bookings` (`payment-checkout/index.ts:40,96`), not the app. The inline modal records a `terms_privacy` consent although it never asks for it (D-23). No test exercises the flow (only string searches, `web_platform/tests/negative-authorization.test.mjs:213-235`). |
| G17 Overnight shifts | PARTIAL (regressed) | `20261004010000_scheduling_depth.sql:300-346`; probe E13b | Single overnight shift works; the second shift's spill-over was dropped in P1-B; no behaviour test (D-16). |
| G18 Agreements | PARTIAL | `become-provider/page.tsx:253-267`; `20261005020000_review_fix_trust_growth.sql:212-274`; `20261003210000_supply_and_agreements.sql:315-335`; probes E16-E18 | Tables, publish command (`admin_publish_agreement`, tested in `supabase/tests/db/trust.test.mjs:90-100`) and versioning exist. No screen calls `admin_publish_agreement` (grep of `web_platform/src`), so nothing can be published by an operator; all three agreements are drafts, acceptance is silently skipped, approval does not require it (E18: provider approved with 0 acceptances), and `requires_reacceptance` is unused anywhere. The `/terms` and `/privacy` pages are static text, not the stored versions. See D-12, D-24. |
| G19 Test runner and negatives | PARTIAL | `package.json:19-25`; `supabase/tests/db/admin_security_matrix.test.mjs:14-110`; `supabase/tests/db/qa_adversarial.test.mjs:54-86,329-405`; `web_platform/tests/negative-authorization.test.mjs:14-68,455-468`; `.github/workflows/deploy.yml` | Runner exists and CI runs it. The DB suite (219 tests, catalog-driven role-by-operation matrix) is the real safety net and is strong. Edge-function "negative authorization" tests never call a function: they search the source for strings (e.g. `:14-25` for process-refund), and many assert text in superseded migrations (`:455-468` asserts `dispatch_message_queue_batch`, a function dropped at `20261005020000...:595`; `:431-441` asserts a `cost_sar DEFAULT 0.1500` that `:568-569` of the later file removes). There is no Deno test for any Edge Function, no test of the web flows, no UTC-time-zone run of the DB suite (D-21), and the harness fabricates verified phones (D-01). CI only triggers on master/main. |

## 2. Defect list (working list; final ranking is done at the end)

IDs are stable. Severity is provisional until the final pass.

### D-01 CRITICAL: phone verification is never set after OTP, so no WhatsApp message can ever be sent
- Where: `supabase/migrations/20261003200000_phone_identity_and_consents.sql:13-44` (only place that derives `phone_verified` from Auth, at INSERT time); no trigger on `auth.users` UPDATE exists anywhere in `supabase/migrations`. `claim_message_batch` requires `phone_verified` (`20261005020000_review_fix_trust_growth.sql:638-645`).
- Probe E3: insert `auth.users(phone)` then set `phone_confirmed_at`: profile stays `phone_verified=false`. GoTrue creates the user row first and confirms the phone on the verify call, so every OTP sign-up stays unverified. Tests hide this: `supabase/tests/db/harness.mjs:114-121` sets `phone_verified` by direct UPDATE.
- Scenario: customer signs up by OTP, books, pays; confirmation and reminders are logged `skipped_unverified`; nobody is ever messaged. The G09 exit check ("100% of messaged numbers verified") is met only because nothing is messaged.
- Fix: new migration adding `AFTER UPDATE OF phone_confirmed_at, phone ON auth.users` trigger (SECURITY DEFINER, owner postgres) that sets `profiles.phone_number = '+' || NEW.phone` (E.164), `phone_verified = (NEW.phone_confirmed_at IS NOT NULL)`, `phone_verified_at`; and a DB test that inserts then updates `auth.users` instead of editing profiles.

### D-02 HIGH: `bookings.source` is chosen by the caller, so any customer can zero the platform fee
- Where: `20261005000000_review_fix_booking_core.sql:560-564` (accepts `link|qr|whatsapp|instagram|import` from `p_source`); `web_platform/src/app/shop/[id]/page.tsx:1049-1051` (reads `?source=`); `20261003220000_booking_rules_and_money.sql:538-540` (these sources return 0).
- Probe E4: same customer, same provider, same slot: `marketplace` commission 17.00; `qr` 0.00; `import` 0.00 with no client list. The test `supabase/tests/db/booking.test.mjs:71-76` asserts exactly this as intended behaviour.
- Fix: derive source server-side. Add `provider_booking_links(token, provider_id, channel)`; the shop page passes `?ref=<token>`; `booking_create_internal` maps token to channel and otherwise forces `marketplace`; allow `import` only when the customer's verified phone matches a `provider_client_contacts` row of that provider; `walk_in` stays staff-only.

### D-03 HIGH: every WhatsApp link points to a page that does not exist
- Where: `20261005000000_review_fix_booking_core.sql:1403` builds `https://primora.sa/customer/bookings/<id>`; `web_platform/src/app/customer/bookings/` contains only `page.tsx` and `[id]/confirmation/page.tsx`. The "confirm attendance" action is parsed only from `?action=confirm_attendance&booking_id=` in `customer/bookings/page.tsx:301-321`, a URL no template emits. Base URL is also hard-coded SQL.
- Scenario: customer taps the link in the 24 h reminder, gets a 404; Confirm / Reschedule / Cancel (G11 exit check) cannot happen.
- Fix: put the base URL in `platform_settings` (`public_app_url`), emit `/customer/bookings?booking=<id>&action=confirm_attendance` for confirm and `/customer/bookings?booking=<id>` otherwise, and open the matching modal from the page.

### D-04 HIGH: the booking receipt states a hard-coded cancellation policy, hard-coded 15%/85% deposit split and wrong VAT
- Where: `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx:70-71,105-106` ("Deposit Paid (15%)", "Balance (85%)"), `:280` (`total*15/115`), `:392-401` (24 h / 50% / full deposit). The query at `:150-170` does not select the provider policy.
- DB prices ex-VAT: `20261005000000_review_fix_booking_core.sql:732-733` (`total_price` = taxable, `tax_amount` separate, amount due = both). Receipt for a 100 SAR service shows balance due 80.00; the venue will ask for 95.00 (115 minus 20 deposit).
- Fix: select `deposit_required, tax_amount, subtotal_price, discount_amount` and the provider's three policy columns; render them; delete the literals.

### D-05 HIGH: invented payment cards and dependents are shown to every customer
- `web_platform/src/app/customer/wallet/page.tsx:331-334,557-570`: "Mada **** 4920 YOUSIF AL-SAUD" and "Visa / Apple Pay **** 7701". `web_platform/src/app/customer/settings/page.tsx:100-103`: dependents "Faisal Al-Saud (Son, 12)" and "Sara Al-Saud (Spouse, 34)" remain when the account has none or the load fails (`:173,181`).
- The guard test `web_platform/tests/no-mock-data.test.mjs:25-41` is a phrase blacklist and misses both.
- Fix: delete both arrays, render empty states; extend the guard with a rule that no `useState([{ ... name: "` literal appears in `src/app`.

### D-06 HIGH: unverified, user-writable phone numbers are globally UNIQUE (phone squatting blocks sign-up)
- `supabase/migrations/20260613000000_init_schema.sql:29` (`phone_number ... UNIQUE`), `20260615182811_harden_auth_and_booking_core.sql:76-83` (users may update `phone_number`), `20261003200000...:13-44` (trigger inserts the Auth phone).
- Probe E10: user A sets own `phone_number` to a victim's number; the victim's later OTP sign-up fails with `profiles_phone_number_key`.
- Fix: `ALTER TABLE profiles DROP CONSTRAINT profiles_phone_number_key; CREATE UNIQUE INDEX profiles_verified_phone_key ON profiles(phone_number) WHERE phone_verified;` and validate `phone_number ~ '^\+9665[0-9]{8}$'` in the trigger.

### D-07 HIGH: every approved branch is placed at the Riyadh centre
- `become-provider/page.tsx:235-250` never sends latitude/longitude; `20261003210000_supply_and_agreements.sql:51-52` defaults them to 24.7136/46.6753, so the NULL guard in `20261005170000...:767-769` never fires. Probe E21 confirms the approved branch keeps those values and city "Riyadh" (`become-provider/page.tsx:244`).
- Scenario: a Jeddah salon is approved at the Riyadh centre; distance sorting, home-service radius and maps are wrong.
- Fix: remove the column defaults, add city/location inputs (map pin or geocoded address), keep the NOT NULL guard.

### D-08 HIGH: provider-controlled money terms have no bounds and can bypass collection
- `20261003220000_booking_rules_and_money.sql:249-253` adds `free_cancellation_hours`, `late_cancellation_fee_percent`, `no_show_fee_percent`, `deposit_percentage` with no CHECK; owners may write them (only status/verification/commission are protected, `20261005000000...:146-185`).
- Probe E7: owner stored deposit 0, late fee -50, free hours -5, no-show 500. With deposit 0 the booking is `confirmed` with no payment, `platform_commission` 17.00 recorded, 0 ledger rows, so the marketplace fee is never collected.
- Fix: CHECK constraints (hours 0-720, percents 0-100, deposit between a platform minimum read from `platform_settings` and 100); enforce a minimum online deposit so the first-visit fee is always collectable.

### D-09 HIGH: the QR code on the provider dashboard is not a QR code
- `web_platform/src/app/provider/dashboard/page.tsx:621-648` is hand-placed rectangles ("QR sample data blocks"). Only the print popup (`:654-657`) uses a third-party image (`api.qrserver.com`) and writes the unescaped business name into the popup HTML.
- Fix: generate a real QR in-browser (small MIT library, or the `toqr` already in the lockfile through Expo) and render it as SVG; escape the name; remove the third-party call.

### D-10 MEDIUM: mobile checkout misstates the cancellation fee and the deposit
- `mobile_app/src/components/shop-details-modal.tsx:84,135` say fees are "% of the price" (server applies them to the captured deposit); `:231-238` computes the deposit on the VAT-inclusive total (server: on the ex-VAT subtotal).
- Fix: use the web wording ("of the deposit") and `deposit = round(subtotal * pct / 100)`.

### D-11 HIGH: consent writes ignore errors, so a withdrawal can silently fail
- `web_platform/src/app/customer/settings/page.tsx:194-207`: `await supabase.from("consents").insert(...)` without reading `{ error }`; the toast says "updated successfully" and the toggle already moved. Same pattern in `login/page.tsx:69-72` and `shop/[id]/page.tsx:1000-1025` (supabase-js returns errors, it does not throw).
- Scenario: a user withdraws WhatsApp consent, the insert is refused, the UI shows withdrawn, messages continue (PDPL breach).
- Fix: call `record_consent` RPC, check `error`, roll back the toggle and show the message; a failed sign-up consent must block the "terms accepted" state.

### D-12 MEDIUM: provider agreement acceptance is silently skipped
- `become-provider/page.tsx:253-267` records nothing when no published version exists, which is always true now (`20261005020000...:212-216` returns terms to draft; provider_agreement was seeded draft). The form still requires the checkbox and approval does not check acceptance.
- Fix: refuse submission when no published agreement exists (show "agreement not yet published"), store `agreed_at/agreement_version` on the application, and make `approve_provider_application` require an acceptance row.

### D-13 MEDIUM: a 2 h reminder can be sent after the appointment
- `20261005020000_review_fix_trust_growth.sql:655-666`: non-transactional templates are pushed to 09:00 during 22:00-09:00 with no check against the booking start. Probe E15 shows the deferral at 22:xx Riyadh.
- Scenario: Ramadan appointment at 00:30, reminder due 22:30, delivered 09:00 next day.
- Fix: in `claim_message_batch`, for `reminder_*` skip (status `expired`) when `booking.scheduled_at <= now() + interval '15 minutes'`, and treat `reminder_2h` as time-critical (exempt from quiet hours or send at 21:59).

### D-14 MEDIUM: receipt headline says "Booking Confirmed" for cancelled and expired bookings
- `confirmation/page.tsx:283,296-297`: `isPaid = status !== "pending_payment"`; a cancelled hold shows the success headline, a green tick and "Paid".
- Fix: derive headline and payment pill from the status (confirmed/completed paid; cancelled "Cancelled"; pending).

### D-15 MEDIUM: consent and DSR evidence are client-writable
- `20261003200000...:97-102` lets users insert any `created_at`, `method`, `document_version`, `ip_address`; `:218-223` lets them set `due_date`, `reviewed_by`, `admin_notes`. Probes E9/E11: a future-dated granted row defeats a later withdrawal; a request can be inserted with a 10-year due date and a self-approved note.
- Fix: drop the INSERT policies, force writes through `record_consent` / a `submit_data_request` SECURITY DEFINER function that sets timestamps, version from the published agreement and the 30-day due date.

### D-16 HIGH: overnight second shifts lose their after-midnight slots; no behaviour test for G17
- `20261004010000_scheduling_depth.sql:300-346` handles spill-over for the previous day's first shift only (second-shift columns are selected and never used); the seasonal branch (`:274-298`) also forces `is_working = TRUE` for every employee on every day. Probe E13b: split shift 09-13 and 21-02 gives no 00:00-01:30 slots next day (single shift does, E13a). Only text assertion exists: `web_platform/tests/negative-authorization.test.mjs:312-329` against the superseded `20261003220000` file.
- Fix: restore the second-shift spill-over block, apply seasonal windows per employee with the employee's own working days, add a PGlite test for 21:00-02:00 single and split shifts.

### D-17 MEDIUM: login screen is English-only with no RTL
- `web_platform/src/app/login/page.tsx` has no locale state and no `dir`; strings such as "Select portal", "Secure account access" are English (AGENTS.md section 2 forbids this).
- Fix: translation table and `dir` on the root element as in `become-provider/page.tsx:155-162`.

### D-18 MEDIUM: Supabase client falls back to a hard-coded dead project and key; "not configured" can never show
- `web_platform/src/lib/supabase.ts:20,30-34`: `isSupabaseConfigured = Boolean(configuredAnonKey || fallbackAnonKey)` is always true, so `login/page.tsx:332-343` can never warn. The default project ref no longer resolves (review of 2026-10-04).
- Fix: remove the fallbacks and fail loudly at build/startup.

### D-19 CRITICAL (release blocker): demo providers and demo auth users are created by a migration
- `supabase/migrations/20260704082805_live_demo_seed_messages.sql:262-299` inserts four `auth.users` (placeholder bcrypt hash), three verified, active providers with stock photos, employees and fake conversations. CI applies every migration with `supabase db reset --no-seed`, so every environment that applies migrations gets bookable fake salons.
- Scenario: the first customer who finds "Elite Barbershop Riyadh" books and pays a real deposit through Tap to a salon that does not exist; the "owner" accounts exist with a placeholder password hash and confirmed e-mails.
- Fix: move the block to `supabase/seed.sql` for local development only (at commit 26c0ef8 that file had invalid UUID literals such as `'p0000000-...'`, `supabase/seed.sql:57`, so it could not run; the working tree now contains an uncommitted rewrite of it and `[db.seed] enabled = false` in `supabase/config.toml` made by someone else, which I did not review), add a guarded cleanup migration that deletes these ids on hosted databases after the owner approves a production data change, and make the test harness load the demo fixture explicitly.

### D-20 LOW: CORS on service-role functions accepts any `*.vercel.app` and any host ending `primora.sa`
- `supabase/functions/send-notification/index.ts:11-12` (also `send-otp`, `send-push`, `process-payout`, `request-payout`, `calculate-travel`).
- Fix: use `_shared/http.ts` `corsHeaders` (exact allow-list) everywhere.

### D-21 HIGH: server-side slot validation uses a hard-coded prayer fallback read in the database session time zone
- `20261004010000_scheduling_depth.sql:322-328,373-379,422-428` compare `v_slot_time::time` to fixed 03:45-04:05 / 12:00-12:20 / 15:30-15:50 / 18:45-19:05 / 20:15-20:35 when no client windows are passed. `booking_create_internal` calls `get_available_slots(emp, date, duration)` with no windows (`20261005000000_review_fix_booking_core.sql:667-672`), and a hosted Supabase session is UTC, so the cast yields UTC clock time.
- Probe E14-UTC: with a 06:00-23:30 shift the server refuses Riyadh-local slots 06:30, 07:00, 15:00, 18:30, 21:30, 22:00, 23:00 while the customer was offered them using the Umm al-Qura windows (`shop/[id]/page.tsx:849-927`). The tests run on a Riyadh-time PGlite host (probe E13 shows `Etc/GMT-3`), which hides it.
- Scenario: a customer picks 15:00 (not a prayer time that day), pays nothing yet, taps Pay and gets "Selected time is no longer available".
- Fix: delete the hard-coded fallback; when no windows are passed return the raw availability (prayer pauses are a presentation rule supplied by the client or stored per branch), and cast with `(v_slot_time AT TIME ZONE 'Asia/Riyadh')::time` anywhere a local clock is compared. Run the DB tests with `SET TIME ZONE 'UTC'` in the harness.

### D-22 MEDIUM: unbacked public claims remain on the landing, pricing, about, security and privacy pages
- Evidence in the G08 row. Nothing in the repo implements hygiene certification, a booking guarantee, escrow or PCI certification of PRIMORA itself; a hosted payment page makes the gateway, not PRIMORA, PCI-scoped. The privacy page headline "Saudi PDPL Compliance" sits over a consent/DSR flow that is partial (G13).
- Fix: remove or reword each string in both languages ("deposit paid through Tap's hosted page"); replace the guard regex with a list that includes the Arabic terms (الضمان، شهادة النظافة، متوافق، معتمد) and the English words guarantee, certified, compliant, bank-grade.

### D-23 HIGH: a "terms accepted" consent is stored for people who were never asked
- `web_platform/src/app/shop/[id]/page.tsx:1000-1007` inserts `terms_privacy granted` (`method inline_booking_modal`, version `v1.0`) after OTP; the modal at `:2171-2235` has WhatsApp and marketing boxes but no terms checkbox or link. `login/page.tsx:39-50` also pins `v1.0`, a version that is a draft in `legal_agreements` (`20261005020000...:212-216`).
- Scenario: in a dispute the platform presents a consent row for terms the customer never saw.
- Fix: add a required, linked terms/privacy checkbox to the modal, store the id of the published `legal_agreements` row (not the literal `v1.0`), and write through `record_consent`.

### D-24 MEDIUM: agreement evidence can be forged or rewritten
- Probe E16: a customer inserted an acceptance of the unpublished provider agreement with `accepted_at` 400 days ago through the INSERT policy `20261003210000_supply_and_agreements.sql:330-335`, bypassing the published-only check in `record_agreement_acceptance`. Probe E17: an administrator rewrote `content_en` of a published, already-accepted version (`FOR ALL` policy `:315-321`, no immutability trigger). Probe E18: `approve_provider_application` approved a provider with 0 provider-agreement acceptances.
- Fix: drop the INSERT policy; add `BEFORE UPDATE` trigger that rejects changes to `content_*`, `version` when `status = 'published'`; make approval require an acceptance row for the current published `provider_agreement` (and refuse approval while none is published).

### D-25 LOW: applications accept unlimited pending rows and any URL scheme
- Probe E19: three pending applications for one user, and `trade_license_url = 'javascript:alert(1)'`, were stored; the admin screen renders it as `<a href>` (`web_platform/src/app/admin/providers/provider-management.tsx:1290`). React 19 blocks `javascript:` navigation, but any `https` phishing URL is still shown to administrators.
- Fix: partial unique index `ON provider_applications(user_id) WHERE status IN ('pending','under_review')`; `CHECK (trade_license_url ~ '^https://')` or, better, upload to a private Storage bucket.

### D-26 MEDIUM: the funnel and error tracking cannot produce a report
- Evidence in the G15 row. Fix: add `analytics_events(id, event, user_id, anon_id, props jsonb, created_at)` written by an `INSERT`-only RPC for client events and by triggers on `bookings` (confirmed, completed, cancelled, no_show) and `transactional_ledger` (payment_succeeded); load PostHog/Sentry only behind the consent record; call `captureError` from an error boundary.

### D-27 HIGH: providers cannot configure their cancellation / no-show policy
- No UI writes `free_cancellation_hours`, `late_cancellation_fee_percent` or `no_show_fee_percent` (grep); `web_platform/src/app/provider/settings/page.tsx:363-382` saves only the deposit. The dashboard checklist step "Policy" is hard-coded complete (`provider/dashboard/page.tsx:285`, `:162`). Every shop therefore advertises and enforces 24 h / 50% / 100% (the migration defaults, `20261003220000...:249-253`), which is the G10 requirement for a *per-provider* policy unmet.
- Fix: add a "Booking policy" card to provider settings that calls a `set_provider_booking_policy(p_provider_id, hours, late_pct, no_show_pct, deposit_pct)` SECURITY DEFINER function with the bounds from D-08; drive the checklist from `policy_confirmed_at IS NOT NULL`.

### D-28 LOW: setup checklist and dashboard show invented defaults
- `provider/dashboard/page.tsx:140` (`"Elite Barbershop"`), `:148` avatar "EB", `:158-164` (`hasHours: true, servicesCount: 3, staffCount: 4, hasPolicy: true`), `:282` (`hasHours = branchIds.length > 0`), `:377-382` slug fallback `elite-barbershop`, `:390` "link shared" kept in memory only. A provider with no data sees 3 services and 4 staff ticked; the share link falls back to a shop that does not exist.
- Fix: initial state all false/empty, derive each step from real counts (working-hours rows, services, employees, policy confirmed, share-click stored server-side); never build a link without `providerId`.

### D-29 MEDIUM: customer cancel and reschedule hide failures or invent slots
- `customer/bookings/page.tsx:361-376` cancel: a refused `cancel_booking` is only `console.warn`ed; the modal stays open with no message. `:394-402`: if loading slots fails the page substitutes 10:00-17:00 slots it made up, which the customer can pick. The cancel dialog (`:783-809`) does not show the fee that will be kept.
- Fix: surface `cancelError.message`; on slot failure show an error state with retry; fetch the policy and display "you will lose X SAR" in the confirmation dialog before calling the RPC.

## 3. Could not verify, and why
- Tap `Idempotency-Key` header on `POST /v2/refunds`, and whether a Tap refund in status PENDING/IN_PROGRESS can still fail later: `supabase/functions/_shared/refunds.ts:25-47` treats those statuses as success and `admin_reopen_stuck_refund` (`20261005150000...:208-248`) relies on the key to prevent a double refund. No network access to Tap documentation or sandbox was used. Suggested guard: before re-sending a reopened refund, list the charge's refunds in Tap and look for `metadata.refund_request_id`.
- GoTrue behaviour: that `auth.users.phone_confirmed_at` is written by an UPDATE after the row is inserted (D-01 depends on it), and whether `auth.users.phone` is stored without the leading `+` (it would then not match the `+9665...` formats used by `import_provider_clients`, `create_walk_in_booking` and the WhatsApp sender). Needs one real sign-up on a staging project.
- Hosted Supabase: SMS provider / Send-SMS hook (`supabase/functions/send-otp` has no caller and cannot be an Auth hook: it expects `{phone, code}` and the service key, `send-otp/index.ts:34-41`), pg_cron/pg_net/Vault (the scheduler block, `20261005020000...:753-786`, is skipped inside PGlite so never executed by tests), `supabase.config` `test_otp` (`supabase/config.toml:30-32` maps +966500000000 to code 123456; harmless locally, an account takeover if pushed to a hosted project).
- Edge Functions at runtime (Deno): all were read, none was executed; CI runs only `deno check` and `deno lint` (`.github/workflows/deploy.yml`). Real-Postgres migration validity is covered only by that CI job (`supabase db reset --no-seed`), which could not be run here; PGlite accepted the full chain and the harness showed no syntax that Postgres 15 would reject, but extension-dependent blocks (pg_cron, vault) were not exercised.
- WhatsApp: Meta template approval and the `primora_<name>` template names, Tap webhook retry behaviour, rendering of Arabic templates on real devices.
- Browser behaviour: no browser session was run, so RTL layout, focus order and modal accessibility were assessed from code only (the booking auth modal at `shop/[id]/page.tsx:2171-2235` has no `role="dialog"`, `aria-modal`, focus trap or Escape handling).
- Mobile app: read for G09/G10/G16 only; not built or run.
- Items outside the P0 scope that I noticed and did not pursue: `get_branch_available_slots` uses only the first service's duration for "any professional" with several services (`20261004010000...:500-507`); `supabase/seed.sql` at 26c0ef8 could not run (invalid UUID literals, line 57; since rewritten in the working tree, not reviewed); anonymous column grants on `providers` (`20261005150000...:139-162`) make any future public column invisible until granted.
