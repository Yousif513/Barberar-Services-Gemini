# FIX-DBB report (inventory / P3 correctness, fee invoices, subscriptions, analytics events, reports)

Branch `wp/fixdbb`, migrations `20261007150000` .. `20261007199999`. Every function change is a patch of the LATEST definition
(`pg_get_functiondef`) through a session helper `pg_temp.patch_function`, which normalises CRLF on both sides so it works on a Windows checkout.

Environment note: in a Windows checkout with `core.autocrlf=true` the migrations are written as CRLF and the earlier booking migrations
(`20261007050000`, `evolve_function`) cannot find their LF patterns, so the harness fails before reaching any test. The index is LF; I
converted the working-tree copies of `supabase/migrations/*.sql` to LF (no diff against the index). This is an existing integration issue, not
something these migrations depend on.

## Status per defect

| id | status | commit | test |
|---|---|---|---|
| C-D29 | fixed | (see git log: "C-D29") | `fixdbb_inventory.test.mjs` "C-D29" |
| C-D21b | fixed | next commit "C-D21b" | `fixdbb_inventory.test.mjs` "C-D21b" (5 tests: 1,000 stays 1,000 after a cost edit to 50; 100@10 + 100@20 = 200@15; transfer carries the average; cost audit with reason; role refusals) |
| C-D22 | fixed | next commit "C-D22" | `fixdbb_inventory.test.mjs` "C-D22" (waste/negative adjust/transfer on inactive product; own message for an increase; role refusals; deactivation refused with open orders) |
| C-D27 | fixed | next commit "C-D27" | `fixdbb_inventory.test.mjs` "C-D27" (request-id receipt, content dedupe without id, merged lines, different-cost refusal, approved-order cancel rights, reserve/release commands writing quantity_reserved, role refusals) |
| C-D31 | fixed | next commit "C-D31" | `supabase/tests/inventory.test.mjs` (10/10 after deleting the booking-update assertion); `.coworking_changelog.md` corrected: join_waitlist signature, BNPL (untrue, G62 missing), "91/91" is source-text greps |
| R19 | fixed (netting deferred) | next commit "R19" | `fixdbb_fee_invoices.test.mjs` (open month refused, ON CONFLICT DO NOTHING, paid invoice never rewritten, monthly batch with pg_cron 03:00 UTC on the 2nd, `admin_mark_fee_invoice_paid`, role refusals). Deferred: netting a receivable in `admin_release_payout`. VAT scope (15 percent on the receivable only) left as is: question for tax counsel. |
| R20 | fixed (mechanism; values need the owner) | next commit "R20" | `fixdbb_subscriptions.test.mjs` (no limit when unset, branch/employee limits for owner and admin, service role bypass, free plan scheduled to period end, `expire_provider_subscriptions`, free-plan fallback after expiry, role refusals). Not done: nothing reads `commission_discount_pct` / `included_monthly_sms`; seeded prices 299/799 SAR and limits 1/3, 3/10, 10/50 were invented by an earlier agent and are left for the owner to confirm; `tap_subscription_id` still holds the payment intent id. Existing test `inventory_workflows.test.mjs` updated: a positive adjustment on an inactive product now answers "Product is inactive" instead of "Forbidden" (C-D22). |
| C-D11 | fixed (fee refund deferred) | next commit "C-D11" | `fixdbb_no_show_appeal.test.mjs` (contest pauses the strike, upheld restores, `admin_clear_no_show` removes, audit with reason, role refusals, RLS). Table `no_show_contests`, columns `bookings.no_show_contested` / `no_show_cleared_at`. Deferred: refunding a no-show fee after a cleared strike is a ledger decision (status and money are not touched). |
| C-D17 | fixed | next commit "C-D17" | `fixdbb_report_definitions.test.mjs` (numeric: first-time vs repeat inside the range for April/May/June/quarter/empty; 60/40 split of a multi-service booking from `booking_services`; fallback for a booking without lines; 01:30 Riyadh visit lands in October). `get_provider_detailed_analytics` already used Asia/Riyadh dates; only `get_provider_multi_branch_summary` used UTC. Per-service revenue is the booked service price (before tax and discounts). |
| C-D30 | fixed (partly reported) | next commit "C-D30 D-03" | `fixdbb_platform_constants.test.mjs`. Keys `no_show_strike_policy` (strikes, window_days), `gift_card_limits` (min_sar, max_sar, valid_days), `tip_limits` (min_sar, max_sar), read by `check_customer_booking_eligibility`, `purchase_gift_card`, `add_booking_tip`; seeded with the values the functions already enforced and flagged `requires_owner_approval` (approved_by empty) so behaviour is unchanged until the owner edits them; a missing key means strikes are not counted and gifts/tips are refused as "not configured" (no fallback number). `admin_update_platform_setting` validates the four keys. NOT changed (reported): VAT rate in `booking_create_internal` (off limits), wallet value `points / 10` in `customer/wallet/page.tsx` (web file), `claim_url` in the waitlist functions and `share_url` in the referral function (still `https://primora.sa/...`), referral amount (already in `platform_settings` via FIX-BOOKING). |
| D-03 | fixed (SQL part) | same commit | `booking_message_variables` reads `public_app_url` (seeded `null` = unset: every link is null, no hard-coded domain); `action_url` -> `/customer/bookings?booking=<id>`, new `confirm_url` -> `...&action=confirm_attendance`, `review_url`, `rebook_url`, `dashboard_url` on the same base. Web part (the page opening the matching modal from `?booking=`/`action=`) belongs to the screen package; templates must use `confirm_url` for the confirm action. |
| D-26 | fixed (SQL part) | next commit "D-26" | `fixdbb_analytics_events.test.mjs`. `analytics_events` table (admin read only, no direct writes), `track_analytics_event` (insert-only RPC for anon/authenticated; names validated, server-owned funnel names refused, no personal keys, 4 KB cap, 120/min), additive triggers on `bookings` (confirmed/completed/cancelled/no_show) and `transactional_ledger` (payment_succeeded) that warn instead of failing the write, `admin_get_event_counts` for the funnel by Riyadh day. Not done here (web files): loading PostHog/Sentry only after consent and calling `captureError` from an error boundary; the consents table has no analytics purpose and none was invented. |
| R32 | fixed (SQL part) | next commit "R32" | `fixdbb_wathq_name_check.test.mjs`. `cr_names_match` (normalised Arabic/English, legal-form words, containment of at least 4 characters); `record_wathq_cr_verification` stores `name_match`/`registered_name` and answers `verified` / `name_mismatch` / `rejected`; applications get `cr_verification_status` (applicant cannot write it; reset when the CR or the names change), `record_wathq_application_check` (service role), `admin_confirm_application_cr` (administrator, notes); `approve_provider_application` refuses an application that states a CR number until it is verified or manually reviewed and copies the result to the provider. Freelancers without a CR number are not gated. NOT done (Deno/web, outside this package): `supabase/functions/wathq-verify/index.ts` must send the application id (or provider id) and pass the response's registered name as `crName` in the payload, and the admin approval screen must run the check or the manual confirmation before approving. Existing tests changed: `trust.test.mjs` (confirm the CR before approving; Wathq payload carries `crName`; `track_analytics_event` added to the anonymous allow-list, D-26). |
| R33 | fixed (SQL part); Expo integration set back to disconnected | next commit "R33" | `fixdbb_push_notifications.test.mjs`. `register_push_token` / `unregister_push_token`, bilingual in-app notifications from booking events (customer, and the salon owner for a new booking; a failure never fails the booking), `push_notification_queue` filled only when the `expo_push` integration is enabled and the user has an active token, `claim_push_batch` / `complete_push_delivery` (service role) for the sender. The `expo_push` integration row is now `disconnected`, disabled, without the invented key mask. NOT done (outside this package): `mobile_app` registering tokens on sign-in (needs `expo-notifications`), `supabase/functions/send-push` calling `claim_push_batch` / `complete_push_delivery`, and the owner switching the integration on. |

## Verification (exact commands, run from an LF copy of the repository, see the environment note)

| command | result |
|---|---|
| `node --test supabase/tests/db/fixdbb_inventory.test.mjs` | 22 tests pass (C-D29 x2, C-D21b x5, C-D22 x3, C-D27 x7) |
| `node --test supabase/tests/db/fixdbb_fee_invoices.test.mjs` | 6 pass |
| `node --test supabase/tests/db/fixdbb_subscriptions.test.mjs` | 7 pass |
| `node --test supabase/tests/db/fixdbb_no_show_appeal.test.mjs` | 4 pass |
| `node --test supabase/tests/db/fixdbb_report_definitions.test.mjs` | 6 pass |
| `node --test supabase/tests/db/fixdbb_platform_constants.test.mjs` | 7 pass |
| `node --test supabase/tests/db/fixdbb_analytics_events.test.mjs` | 7 pass |
| `node --test supabase/tests/db/fixdbb_wathq_name_check.test.mjs` | 7 pass |
| `node --test supabase/tests/db/fixdbb_push_notifications.test.mjs` | 7 pass |
| `node --test "supabase/tests/db/**/*.test.mjs"` | 539 tests, 539 pass, 0 fail (includes `migration_hygiene`, `data_api_grants`, `admin_security_matrix`) |
| `node --test supabase/tests/inventory.test.mjs` | 10 pass |
| `node scripts/verify-ui-schema.mjs` | checked 77 rpc calls and 174 select strings; 0 mismatches, 0 in the baseline |

## Existing tests changed because behaviour changed on purpose

- `supabase/tests/db/inventory_workflows.test.mjs`: a positive adjustment on an inactive product now answers "Product is inactive" (C-D22); `track_analytics_event` added to the anonymous allow-list (D-26).
- `supabase/tests/db/qa_adversarial.test.mjs`: `track_analytics_event` added to the anonymous allow-list (D-26).
- `supabase/tests/db/trust.test.mjs`: approval confirms the CR first (R32); the Wathq payload carries `crName` (R32); `track_analytics_event` in the anonymous allow-list.
- `supabase/tests/inventory.test.mjs`: the stale booking-update assertion deleted (C-D31).
- `.coworking_changelog.md`: join_waitlist signature, BNPL claim and the "91/91" claim corrected (C-D31).

## Migrations added (all in 20261007150000 .. 20261007151100)

150000 inventory audit allow-list, 150100 moving-average cost + cost audit command, 150200 inactive products, 150300 purchase-order idempotency + reservations,
150400 fee invoices (closed months), 150500 subscription entitlements, 150600 no-show appeal, 150700 report definitions, 150800 platform-setting constants + public URL,
150900 analytics events, 151000 Wathq name check, 151100 push tokens and notification queue.

## Open questions for the owner / counsel (nothing was decided for them)

- VAT on fee invoices is still 15 percent of the receivable only (R19); whether it applies to the whole commission is a tax question.
- Seeded plan prices (299 / 799 SAR) and limits (1/3, 3/10, 10/50) were invented by an earlier agent and are now enforced as plan limits; confirm or edit them (R20). `commission_discount_pct` and `included_monthly_sms` are still unused.
- The seeded strike policy (3 in 60 days), gift card limits (50-5,000 SAR, 365 days) and tip limits (5-1,000 SAR) keep today's behaviour and are flagged `requires_owner_approval` until the owner edits them in the console (C-D30).
- `public_app_url` is unset: until the owner enters it, WhatsApp/message links are empty (D-03).
- Not changed because off limits or outside the package: VAT rate in `booking_create_internal`, wallet `points / 10` in `customer/wallet/page.tsx`, `claim_url` (waitlist) and `share_url` (referral) still contain `https://primora.sa`.
- Not done: netting a fee-invoice receivable in `admin_release_payout` (R19); refund of a no-show fee after a cleared strike (C-D11).

## Files touched outside the package's own new files

`supabase/tests/db/inventory_workflows.test.mjs`, `supabase/tests/db/qa_adversarial.test.mjs`, `supabase/tests/db/trust.test.mjs`, `supabase/tests/inventory.test.mjs`, `.coworking_changelog.md`.
No web, mobile or Edge Function file was changed.
