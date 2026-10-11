# Gap verification C: Gemini P2 (G44-G64) and Codex P3 (inventory, supply, chain)

Reviewer: Claude Code, read-only. Branch `claude-code`, working tree clean at the start. Nothing in the
application was edited; this file is the only artifact written in the repository.

## 0. Method and what was run

- The final database state was rebuilt by applying every migration (59 files) in PGlite with the repository's own
  harness (`supabase/tests/db/harness.mjs`). The harness engine is PostgreSQL 18.3; production is PG 15 (section 5).
  Every function, policy, trigger, grant, constraint and view was dumped from that state and read, so statements
  below describe the last definition in migration order, not a superseded one.
- All 90 `supabase.rpc(...)` calls in `web_platform/src`, `mobile_app` and `supabase/functions` were machine-checked
  against the real function signatures. Exactly one real mismatch exists (`join_waitlist`, D1).
- All 285 `.from(...)` chains and every embedded select were checked against the real columns: favourites (D7), and
  two screens outside the assigned gaps (D9), select columns that do not exist.
- Behaviour was proved with throw-away probes against that database (probe scripts live in the session scratchpad,
  not in the repository; each result is quoted below with the SQL or call that produced it).
- The branch moved while this review ran: HEAD was `26c0ef8` at the start and is `c8dd7ed` now, which adds migrations
  `20261006000000_attach_admin_audit_trigger_helper.sql` and `20261006220000_explicit_data_api_grants.sql` (table
  privileges only: it removes `TRUNCATE`/`REFERENCES`/`TRIGGER` and anonymous DML). All probes were re-run on the current
  tree after that commit and every result quoted below reproduced. Table-grant observations about `anon` and
  `TRUNCATE` made earlier in the session are superseded by that migration and are not relied on.
- Existing suites, run unchanged (before that commit): `npm run test:db` 219/219 pass; `npm run test:inventory` 10/10 pass;
  `npm run test --workspace=web_platform` 156/156 pass. These passes do not contradict the defects below; they show
  what the suites do not cover (section 3, D20).

Verdict legend. COMPLETE = database command + authorization + UI + AR/EN with RTL + a test that proves it.
PARTIAL = some of those exist and works. BROKEN = the feature exists in code but fails when used. MISSING = absent.

## 1. Gap table G44-G64

| Gap | Verdict | Evidence | Notes |
|---|---|---|---|
| G44 Waitlist | BROKEN | UI `web_platform/src/app/shop/[id]/page.tsx:770-777`; function `supabase/migrations/20261004050000_booking_depth_and_capacity.sql:77-84`; claim `:179-223`; backfill `20261005000000_review_fix_booking_core.sql:1818-1885` | The UI sends `target_branch_id`, `target_service_id`, `target_date`, `preferred_employee_id`, ...; the function takes `p_branch_id`, `p_service_id`, `p_employee_id`, `p_preferred_date`, ... so the call cannot resolve and nobody can join (D1). No screen calls `claim_waitlist_slot` or reads `?claim_waitlist=`; claiming holds nothing (D10); rows are rewritable by the customer and the owner (D10b). Only tests are source-text greps (`web_platform/tests/negative-authorization.test.mjs:1021-1062`). AR/EN strings exist (`shop/[id]/page.tsx:66-72,131-137`). |
| G45 Packages | PARTIAL | purchase `20261005010000_review_fix_money.sql:141`; payment `:281`; staff redeem `:476-530`; UI `customer/packages/page.tsx:181-211`, `shop/[id]/page.tsx:727-755`, `provider/packages/page.tsx:112-131`, `admin/packages/page.tsx`; test `supabase/tests/db/money.test.mjs:52-67` | Buy -> pay -> activate -> staff deduct works and is tested. Redemption does not touch the booking price or deposit and ignores `packages.service_id` (D19). The provider screen is English-only and LTR (2 lines contain Arabic) and deducts a prepaid session on one click with no confirmation or undo. |
| G46 Coupons | PARTIAL | pricing `20261005000000:687-712`; release `:434-480`; check `20261005010000:402-445`; admin `web_platform/src/app/admin/coupons/page.tsx:187-208`; shop `shop/[id]/page.tsx:640-678`; test `booking.test.mjs:218-237` | Server-side redemption and release on cancel are real and tested. No per-customer limit, every active code is readable by every signed-in user (D5, D6). Admin form has no validity window or provider field; writes go straight to the table with no reason (D26). |
| G47 Tips | COMPLETE (copy defect) | `20261005010000:174-230`, `:281` (`tip` branch); UI `customer/bookings/page.tsx:171-202`; test `money.test.mjs:69-79` | Flow is wired end to end (pending tip -> Tap checkout -> webhook -> ledger) and tested. Copy "goes directly to your specialist" (`customer/bookings/page.tsx:62,124`) is not what happens: the ledger credits the provider's payout balance (D18). |
| G48 Gift credit | PARTIAL | `20261005010000:87-140,446-475`; wallet UI `customer/wallet/page.tsx:262-311`; shop `shop/[id]/page.tsx:680-705`; tests `money.test.mjs:34-50,180-190`, `booking.test.mjs:218-237` | Purchase is pending until Tap confirms; redemption and release are server-side and tested; 60-bit code. The recipient is never told: no template, no queue row, no email path mentions a gift card, so "Send a Gift Card" only stores recipient fields (D14). No record of the stored-value legal check the roadmap requires. |
| G49 Referral | BROKEN | `20261004060000_commercials_and_monetization.sql:1107-1216`; reward `20261005000000:1719-1800`; `web_platform/src/app/login/page.tsx:17`; wallet `customer/wallet/page.tsx:210-224,376-380` | `apply_referral_code` is called by no screen; the share link `login?ref=` is never read; reward credit (`wallet_credits`) is referenced by no spending function, so it is unspendable, yet the wallet says it is "auto-applied as discount during checkout" (D4); reward rules are abusable and codes collide at scale (D4b). Programme is off by default, but the apply message still promises SAR 25. No executing test. |
| G50 Loyalty | PARTIAL | earn `20261005000000:1719-1790`; redeem `booking_create_internal` `:718-732,798-812`; UI `shop/[id]/page.tsx:707-725,1897-1922`; wallet `customer/wallet/page.tsx:235-240,405-420` | Works when enabled; off by default. Points are burned beyond the discount actually granted (D12). Wallet claims points are "redeemable across salons" but balances are per provider, and shows value as points / 10 (hard-coded). Enabled path has no executing test (only "rejected while disabled", `booking.test.mjs:239-243`). |
| G51 Multi-service | PARTIAL | `20261005000000:854-910` -> `booking_create_internal` (max 6 services, one professional); UI `shop/[id]/page.tsx:1081-1099`; test `booking.test.mjs:245-256` | Server pricing, duration and slot validation are real. For "any specialist" the slot list is built from the first service only (`shop/[id]/page.tsx:899-905` calls `get_branch_available_slots(target_service_id)`, which has no duration parameter), so slots can be offered that the whole cart cannot fit (D16). `bookings.service_id` holds only the first service, so popular-service and revenue reports misattribute (D17). |
| G52 Group booking | MISSING | no table, function or screen | |
| G53 Walk-in | PARTIAL | `20261005000000:913-1000`; UI `provider/calendar/page.tsx:688-750,1702-1824`; test `booking.test.mjs:258-271` | Command is sound: no fabricated profile, 0% fee, VAT, audit, conflict check; tested. Screen: with any past customer present only a `<select>` is shown, so a new walk-in name cannot be typed (`:1715-1743`); `p_customer_phone` is always `null` (`:731`) so nobody is linked; the notes input is never sent (`:1797-1806`); payment method is hard-coded "cash" (`:732`); the calendar labels every walk-in with the English literal "Walk-in Customer" (`:643`) instead of `walk_in_name` (D15). Staff authorization is `is_provider_staff` (D2). |
| G54 Provider reports | PARTIAL | `20261005020000_review_fix_trust_growth.sql:791-878` (guard `:806`); UI `provider/reports/page.tsx:248-262`; test `trust.test.mjs:152-166` | Real data, honest empty and error states, Riyadh dates. Readable by any employee or any membership (D2); repeat/first-time split ignores the selected range; multi-service revenue is attributed to the first service (D17). The test only asserts the call returns something and a customer is refused. |
| G55 Staff commission rules + export | PARTIAL (leaning BROKEN) | `20261005020000:880-930`; export `provider/reports/page.tsx:347-376`; table policies `employee_commission_rules` | No screen writes `employee_commission_rules`, so every employee is "unconfigured" and gets null totals. The CSV prints `undefined` for Role (`emp.role`; the function returns `title_en`) and the text `null` for IBAN, rate and totals, and is labelled "Mudad / WPS compliant" although it has no identity number, bank code or the fixed WPS layout (D13). Failure reporting uses `alert()` (`:377`). |
| G56 Multi-branch dashboard | PARTIAL | `20261004070000_operations_analytics_and_discovery.sql:291-385` (final definition unchanged); UI `provider/reports/page.tsx:265-275`; superseded for chains by `provider/chain/page.tsx` | Filters bookings with `bk.scheduled_at::date` (UTC date), unlike every other report (Riyadh date), so bookings between 00:00 and 03:00 Riyadh time land on the previous day and month (D17). Owner/admin only. Two overlapping implementations now exist (this and `get_provider_chain_operations`). |
| G57 Block list / strikes | PARTIAL | `20261005000000:345-433`; enforcement `booking_create_internal` `:532-540`; UI `provider/customers/page.tsx:115-135`; test `booking.test.mjs:273-286` | Block list and the three-strike rule work (probe: three no-shows in 60 days -> deposit equals total + VAT, 97.75 on an 85.00 service; direct `update bookings set status='no_show'` by the owner changes 0 rows; `mark_booking_no_show` refuses before start). Gaps: block reason is the hard-coded string "Policy violations / no-show protection" with no input or confirmation (`:123`); no appeal or clearing path for a strike (D11); blocked customers can still join the waitlist; strike rule has no test. |
| G58 Prayer pause | PARTIAL | UI `shop/[id]/page.tsx:849-882,1717-1730`; unused RPC `20261005000000:1912` | The customer sees a text list of the day's prayer windows above the grid; the grid is not labelled (the `prayerLocked` branch is dead, `:933`) and the RPC is called by nothing. The server validates with different static windows: on 96 of 314 simulated working days the screen offers a slot the server rejects (D8). Copy gives 20 min (`:30,95`), 25 min (`:75,140`) and the code uses 10 + 30 = 40 min (`:841-847`). Slot labels use `en-US` (AM/PM) in the Arabic UI (`:205-206`). |
| G59 Map | PARTIAL | `web_platform/src/app/discover/page.tsx:187-209,464-492` | Search and filters use the real RPC. The "map" is a hand-drawn SVG (generic ring-road lines) over a fixed Riyadh/Jeddah bounding box; a branch without coordinates is drawn at an invented position (`:198-199`) and other cities clamp to the edge (D21). |
| G60 AI receptionist | MISSING | not built | |
| G61 Google / Instagram | MISSING | not built (only a `source=instagram` URL tag) | |
| G62 BNPL (Tabby/Tamara) | MISSING | Gemini's visual-only selectors were removed in `11d4ce7`; only admin registry rows remain (`20260714170000_link_payment_methods_to_integrations.sql:22-23`) | The changelog entry for P2-C describing BNPL checkout and installment badges is not true of the current tree. No BNPL charge path exists in `payment-checkout`. |
| G63 Sponsored placement | MISSING | not built | |
| G64 Favourites | BROKEN (list), PARTIAL (toggle) | toggle `20261004070000:61-100` and `shop/[id]/page.tsx:582-613` work; list `customer/favorites/page.tsx:94-112` | The list selects `providers(name_en, name_ar, rating, reviews_count)`; `providers` has `business_name_en/ar` and no rating columns, so PostgREST rejects the query and the page shows an error. Had it worked it invents data: `rating || 4.9`, `reviews_count || 120` and a stock photograph (`:134-136`) (D7). Test is smoke only (`trust.test.mjs:163-164`). |

## 2. Codex P3 deliverables

Reviewed: migrations `20261005060000_enterprise_inventory_and_supply.sql` and
`20261005070000_inventory_controls_and_chain_operations.sql`; screens `web_platform/src/app/provider/inventory/page.tsx`,
`provider/inventory/inventory-controls.tsx`, `provider/chain/page.tsx`, `admin/supply/page.tsx`; helpers
`web_platform/src/lib/operations-data.ts`, `web_platform/src/components/operations-ui.tsx`; tests
`supabase/tests/inventory.test.mjs`, `supabase/tests/db/inventory_workflows.test.mjs`; and the earlier Codex commits.

| Deliverable | Verdict | Evidence and notes |
|---|---|---|
| Supplier and product catalog (create, edit, deactivate, reactivate) | COMPLETE with defects | RLS `20261005060000:176-204`, scope trigger `20261005070000:53-89`, audit trigger `:91-103`; UI `inventory-controls.tsx:71-79`. Catalog is chain-wide for any delegate regardless of branch (D23); full-row audit leaks supplier contacts (D25); deactivating a product with stock strands it (D22). |
| Stock adjust / waste / transfer | COMPLETE | `20261005070000:106-195`. Verified: stock rows locked in stable order, reserved and negative stock refused, per-request receipt with advisory lock, same UUID replays once and a changed payload is refused, transfers conserve stock; tests `inventory.test.mjs`, `inventory_workflows.test.mjs`. Caveats: valuation is retroactive (D21b), inactive-product writes refused with a misleading error. Concurrent behaviour not testable on a single-connection engine (section 5). |
| Reservations | NOT BUILT | `quantity_reserved` is only read and constrained (`20261005070000:39-40`); no function writes it (probe: no function body contains `quantity_reserved =`), so "reservation protection" has no producer (D27). |
| Purchase orders (create, submit, approve, receive, cancel) | PARTIAL | `20261005060000:284-521`. Status machine, owner-only approval, one-time receive and stock/movement/audit in one transaction are correct. Create is not idempotent (D27), allows only one line from the UI (`provider/inventory/page.tsx:471-475`), no partial receipt or quantity variance, no supplier-active check at approve/receive, and any scoped delegate can cancel an order the owner approved (D27). |
| Branch delegation (memberships) | PARTIAL | `save_provider_operation_membership` `20261005070000:197-242`: owner/admin only, registered staff only, permission keys validated, reason required, audited; direct writes revoked (`:243`). Not tied to employment (D3) and its "staff" memberships widen older RPCs (D2). |
| Chain operations screen and `get_provider_chain_operations` | COMPLETE | `20261005070000:279-315`, `provider/chain/page.tsx`. Riyadh dates, per-branch permission filtering, audit on read, honest empty/error. Stock value uses current product cost (D21b). Permission group has no `<legend>`; refusal text is raw English server text (D28). |
| Admin supply oversight | COMPLETE (read-only) | `20261005070000:332-400`, `admin/supply/page.tsx`. Admin-only, audited, paginated; one `page` value drives three independent lists, so paging past a short list shows empty panels (low). |
| `operations-data.ts`, `operations-ui.tsx` | COMPLETE | `readAllOperationsRows` pages 500 rows with stable `order(...).order("id")` at every call site; shared notices are accessible (`role="alert"`, `role="status"`). |
| Bilingual AR/EN and RTL | COMPLETE | EN/AR key sets are identical on all four screens (57/57, 47/47, 44/44, 47/47); logical (`text-start`) layout and a `dir` on the root. Residual: native `window.confirm`/`window.prompt` (`provider/inventory/page.tsx:492-496`, `inventory-controls.tsx:61`), server errors shown in English in Arabic mode. |
| Tests | PARTIAL | `inventory.test.mjs` (10) runs the two migrations against a hand-built mini schema; it still asserts that a delegate can `update bookings set status='completed'` (line 126), which the final chain forbids (policy dropped at `20261005170000:34`). The real-chain port `inventory_workflows.test.mjs` is the meaningful one. No test for the membership/`is_provider_staff` interplay, offboarding, valuation, PO create retries or concurrency. |
| Earlier Codex commits (`git log codex`): `5801005`, `c5ea05d`, `bfd9737`, `fe0c57f`, `96ea30f`, `e19292b`, `734fcd9` | PARTIAL | All are ancestors of `claude-code`. Ledger key fix, overlay fix and mock-fallback removal are UI-only and were later rewritten; `e19292b` vendors 2,228 lines of third-party skill documents and a lock file, no code and no secrets. The integrations work (`c5ea05d`, `bfd9737`) has real defects (D3b below, D24). |

## 3. Defects, ranked

Critical: none found. Every High below is reproducible from the quoted call.

### High

**D1. Waitlist join cannot be called.** `web_platform/src/app/shop/[id]/page.tsx:770-777` sends `target_branch_id,
target_service_id, target_date, preferred_employee_id, preferred_time_start, preferred_time_end`; the only function is
`join_waitlist(p_branch_id, p_service_id, p_employee_id, p_preferred_date, p_preferred_time_start, p_preferred_time_end)`
(`supabase/migrations/20261004050000_booking_depth_and_capacity.sql:77-84`). Probe: the UI's argument names give
`function join_waitlist(target_branch_id => uuid, ...) does not exist`; the real names succeed. Scenario: a customer
whose chosen day is full presses "Confirm Waitlist Entry" and always gets an error toast. The success branch also reads
`data?.queue_position` (`:781-782`) while the function returns `position`. Fix: call
`supabase.rpc("join_waitlist", { p_branch_id: shop.branchId, p_service_id: selectedService.id, p_employee_id: preferredStaffId,
p_preferred_date: selectedDate, p_preferred_time_start: waitlistStartTime, p_preferred_time_end: waitlistEndTime })`, read
`data.position`, and add a DB test that joins, cancels a matching booking and asserts a `message_queue` row, plus the
signature check used for this review (parse every `.rpc(` argument object and compare with `pg_proc.proargnames`) in CI.

**D2. `is_provider_staff` grants unrelated powers to every membership and every employee.**
`20261005000000_review_fix_booking_core.sql:290-310` is true for any active `provider_memberships` row (any role, any
permissions, even `{}` or role `stylist`) and for any active employee of any branch. It alone guards
`get_provider_detailed_analytics` (`20261005020000:806`), `get_provider_monthly_value_summary` (`:472`),
`create_walk_in_booking` (`20261005000000:947`), `redeem_package_session` (`20261005010000:498`) and
`check_customer_booking_eligibility`. Probe: a membership `inventory_manager` with `{"inventory":true}` read provider
analytics (revenue, platform fees, staff revenue), read the monthly value summary, created a walk-in booking and read a
customer's strike count, while `get_provider_chain_operations` correctly said "Reports permission required". Scenario:
the owner grants a stockroom clerk inventory-only access in the chain screen (which also offers a zero-permission
"stylist" role) and the clerk can see all revenue and create or redeem bookings at every branch. Fix: replace
`is_provider_staff` in those five functions with
`can_access_provider_operation(provider_id, branch_id, 'reports')` for analytics and monthly summary,
`..., 'bookings'` for walk-in and package redemption (branch taken from the booking or branch argument) and keep the
employee branch rule only for an employee acting on their own bookings; delete the membership clause from
`is_provider_staff` or rename it `is_provider_member`. Add negative tests per role.

**D3. Delegated access survives offboarding.** `can_access_provider_operation`
(`20261005070000:2-19`) never consults `employees`. Probe: after `update employees set is_active=false` the former branch
manager still ran `adjust_branch_inventory_stock` successfully and still read `get_provider_operations_context`. Scenario:
a dismissed manager keeps editing stock (concealing theft), reading reports and, with the `staff` permission, editing
staff rows until the owner remembers to disable the separate membership. Fix: in `can_access_provider_operation` and
`get_provider_operations_context` require
`EXISTS (SELECT 1 FROM employees e WHERE e.profile_id = m.user_id AND e.is_active)`; and add an `AFTER UPDATE OF is_active`
trigger on `employees` that sets `provider_memberships.is_active=false` for that profile; test both.

**D3b. Admin integrations store secrets in plaintext and ship them to the browser, and nothing uses them.**
`supabase/migrations/20260714153000_expand_integrations_registry.sql:7` adds `integrations.api_key TEXT`;
`web_platform/src/app/admin/integrations/page.tsx:268` reads `select("*")` (including `api_key`) into the page,
`:350` makes a key mandatory for every new integration and `:373` writes it from the browser, while the file header
(`:5-8`) states "Secrets never live client-side". No Edge Function reads `integrations` (grep of `supabase/functions`
for `api_key` and `from("integrations")` is empty; they use `TAP_SECRET_KEY` etc. from the environment). Scenario: an
admin pastes the live Tap or Twilio secret; it sits in clear text readable by every admin and by any admin
browser session, and does nothing. Fix: drop the column (`ALTER TABLE integrations DROP COLUMN api_key`), stop selecting
`*` (select named columns), remove the key input and make `key_masked` a server-written last-4 hint, and state in the
page that credentials are Edge Function secrets.

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

**D5. Coupons have no per-customer limit.** `booking_create_internal` (`20261005000000:687-712`) checks only the global
`max_redemptions`; `coupon_redemptions` is unique on `(coupon_id, booking_id)` only. Probe: one customer used the same
unlimited 50 percent platform code on two separate bookings (discount 42.50 each). Scenario: a "first booking" or
influencer code is reused on every visit and drains a capped budget. Fix: add `promotional_codes.per_customer_limit
INTEGER NOT NULL DEFAULT 1` and `first_booking_only BOOLEAN`, count non-reversed `coupon_redemptions` for the customer
inside the same `FOR UPDATE` section, expose both fields in `admin/coupons/page.tsx`, and test the second use.

**D6 (High as a pair with D5). Every active promo code is enumerable by any signed-in user.** Policy "Promotional codes
readable by admins or when active" (`20260621184453_refine_admin_control_policies.sql:5`) lets `authenticated` read
`code`, value and redemption counts. Probe: a stranger listed an active `VIP-SECRET` 50 percent code. Fix: drop that
policy; `validate_and_apply_coupon` and `booking_create_internal` are `SECURITY DEFINER` and need no table access.

**D7. Favourites list queries columns that do not exist and would invent data.** `web_platform/src/app/customer/favorites/page.tsx:94-112`
selects `providers(id, name_en, name_ar, rating, reviews_count, ...)` but `providers` has `business_name_en/ar` and no
rating columns; the request fails, the page shows an error and no favourites. Lines `:130-136` default the rating to
`4.9`, reviews to `120` and use a stock photograph. Fix: select `providers(id, business_name_en, business_name_ar,
logo_url, cover_image_url, branches(id, city, district))`, compute rating from published reviews (as
`search_marketplace_providers` does) or show "New", use `logo_url`/`cover_image_url` and no fallback image, and add a
test that renders the select string against the schema.

**D8. Marketplace fee can be avoided by a URL parameter.** The shop page reads `?source=` (`shop/[id]/page.tsx:1049-1051`)
and passes it to `create_booking`; `booking_create_internal` accepts `link`, `qr`, `whatsapp`, `instagram`, `import`
(`20261005000000:561`) and `calculate_booking_platform_commission` returns 0 for them. Scenario: a provider
tells marketplace customers to open `/shop/<id>?source=link`; the 20 percent first-visit fee is never charged. Fix:
issue a per-provider signed attribution token with the share kit (`provider_share_tokens`: provider_id, source, random
secret), accept a non-marketplace source only with a valid token (`p_source_token`), otherwise force `marketplace`; test it.

**D9 (outside the assigned gaps, found by the schema cross-check). Two provider screens query columns that do not
exist.** `web_platform/src/app/provider/bookings/page.tsx:118` embeds `profiles(first_name, last_name, phone)` (`profiles`
has `phone_number`), so the provider bookings list throws and shows an error; `web_platform/src/app/provider/settings/page.tsx:229`
selects `providers.phone` (the column is `contact_phone`). Fix: use `phone_number` and `contact_phone`, and run the
schema-vs-select check in CI.

### Medium

**D10. Waitlist "exclusive 15-minute claim" does not exist.** Probe: after a cancellation the first waitlister became
`notified`, a stranger then booked the slot immediately (`create_booking` returned `pending_payment`); after the window
passed `claim_waitlist_slot` raised "Claim window has expired", the row stayed `notified` (the `UPDATE ... 'expired'` at
`20261004050000:205-207` is rolled back by the `RAISE`), the second waitlister stayed `active`, and the first customer
cannot re-join that service and date (`:126-135`). Copy promising exclusivity: `shop/[id]/page.tsx:68,133`. Fix: add
`p_waitlist_claim_id` to `booking_create_internal` and refuse other customers while an unexpired `notified` entry covers
the slot; a pg_cron job `expire_waitlist_claims()` (outside a failing transaction) marks `expired` and notifies the next
`active` entry; handle `?claim_waitlist=` on the shop page; require verified phone and WhatsApp consent at join (the
message is skipped otherwise, `claim_message_batch`); until then change the copy to "we will message you if a slot opens".

**D10b. Waitlist rows can be rewritten by the customer and by the provider owner.** Policy "Customers and providers cancel
waitlist entries" (`20261004050000:61-74`) is `FOR UPDATE` with no `WITH CHECK` and no column limit, and `authenticated`
holds UPDATE on the table. Probe: a customer ran `update waitlists set status='claimed', expires_at=now()+interval '100 years'`
on their own row (succeeded) and the owner ran `update waitlists set customer_id=<another user>` (succeeded). Scenario: a
customer forges a `notified` row with a 100-year claim window; an owner moves a customer's entry to a friend. Fix: drop the
policy, revoke UPDATE on `waitlists` from `authenticated`, and add `cancel_waitlist_entry(p_id)` (customer cancels own,
owner/staff with the `bookings` permission cancel for their branch).

**D4b. Referral abuse and code collisions.** `trigger_on_booking_completed_rewards` (`20261005000000:1719+`) pays both users
SAR 25 on the referee's next completed booking of any value, any source (a staff-created walk-in linked by phone counts),
referee may already have history, mutual referrals (A uses B's code, B uses A's) pay twice, no per-referrer cap. Codes are
`'REF-' || UPPER(SUBSTRING(MD5(user_id::text),1,6))` (`20261004060000:1128`): 16,777,216 values, 50 percent chance of a
collision near 4,800 users, and `profiles.referral_code` is UNIQUE, so the colliding user's `get_or_create_referral_code`
fails permanently. Fix: require at `apply_referral_code` that the referee has no confirmed or completed booking; refuse a
reverse referral; reward only `source <> 'walk_in'` with `total_price >= min_qualifying_sar` (setting) and cap rewards per
referrer per 30 days (setting); generate codes with 8 random characters in a retry loop on unique violation.

**D11. Strike has no appeal or clearing.** `open_booking_dispute` only disputes captured payments
(`20261005010000`); nothing clears `bookings.no_show_at`. A provider can leave a customer un-checked-in and mark a
no-show after the start time; three such marks force 100 percent prepayment at every provider for 60 days. Fix:
`admin_clear_no_show(booking_id, reason)` with audit, a customer "contest" request that pauses the strike count, and an
`is_contested` filter in `check_customer_booking_eligibility`.

**D12. Loyalty points are burned beyond the discount.** Probe: 1,000 points (worth 500 at `sar_per_point` 0.5) redeemed on
an 85.00 service gave a discount of 85.00 and set the balance to 0. `booking_create_internal` caps the discount
(`20261005000000:726`) but deducts the requested points (`:804`). Fix: `v_loyalty_points := CEIL(v_loyalty_discount /
sar_per_point)` after the cap; reject when `sar_per_point <= 0`; add an enabled-programme test.

**D13. WPS payroll export is wrong and over-claimed.** `provider/reports/page.tsx:352-366`: `emp.role` is undefined (field
is `title_en`), unconfigured staff print `null`, names are not CSV-escaped and `encodeURI` of a data URI breaks on `#`;
the label claims Mudad/WPS compliance. No screen authors `employee_commission_rules`. Fix: build the CSV with the shared
escaper in `web_platform/src/lib/csv.mjs`, use a Blob download, skip or flag unconfigured staff, rename to "Payroll
summary (not a WPS file)" until the bank layout is implemented, and add a rules editor on `provider/employees`.

**D14. "Send a Gift Card" does not send.** No message template or queue write references a gift card
(`20261005010000:101-140` and `confirm_purchase_payment` end without enqueueing); the recipient fields are stored only;
the code is shown to the purchaser only. The Gemini changelog says a WhatsApp notice is queued; it is not. Fix: on
activation enqueue a `gift_card_received` template (add AR/EN rows to `message_templates`, `is_transactional = true`)
with the code, amount and sender message, and rename the button until then; add a test on the queue row.

**D15. Walk-in screen.** See G53: new names cannot be typed when any customer exists, phone never sent, notes discarded,
"cash" hard-coded, English-only "Walk-in Customer". Fix: always render the text input plus an optional customer
`<select>`; send `p_customer_phone`; add `p_notes` and `p_payment_method` parameters to `create_walk_in_booking`
(validate against `payment_methods`); select `walk_in_name` and use a translated fallback.

**D16. Multi-service with "any specialist" lists unusable slots.** `shop/[id]/page.tsx:899-905` passes one service id to
`get_branch_available_slots` (`20261005000000` chain, `STABLE` invoker function, base duration only; employees'
`custom_duration_minutes` ignored). Fix: add `p_duration_minutes INT` and `p_service_ids UUID[]` to the function and filter
to employees who offer every service.

**D17. Report definitions.** `get_provider_detailed_analytics` computes first-time vs repeat over all time (ignores the
range); popular services join `bookings.service_id` (first service only) so multi-service revenue is credited to one
service (`20261005020000:791-878`); `get_provider_multi_branch_summary` uses `scheduled_at::date` in UTC
(`20261004070000:291+`). Fix: compute first-time as "first completed visit date inside range", join `booking_services`
for per-service revenue and counts, and use `(scheduled_at AT TIME ZONE 'Asia/Riyadh')::date` everywhere; add numeric tests.

**D18. Copy that claims things the system does not do.** Tip "goes directly to your specialist"
(`customer/bookings/page.tsx:62,124`; ledger credits the provider); wallet Arabic still says "held in escrow" and
"escrow cases" (`customer/wallet/page.tsx:45,59`) although escrow copy was removed in English and the guard test misses
Arabic; "redeemable across salons" for per-provider points (`:14,50`); "Deposits for Upcoming Visits" sums every ledger
row that is not `released`, including completed visits awaiting payout and refund-pending rows
(`:176-195`); cancelled bookings are labelled REFUNDED even when a late-cancellation fee was kept. Fix: reword, compute the
upcoming figure from `bookings.status = 'confirmed' AND scheduled_at > now()`, and extend the guard test to Arabic strings.

**D19. Packages are not connected to bookings.** `redeem_package_session` (`20261005010000:476-530`) neither checks the
booking's service against `packages.service_id` nor reduces `total_price`/`deposit_required`; a customer who bought a
package still pays a deposit to book. Fix: add `p_user_package_id` to `booking_create_internal` (reserve one session,
zero the covered service price, return it in `booking_release_discounts`) and make redemption a transition of that
booking; require `service_id` match.

**D20. The P2 "tests" are source greps.** `web_platform/tests/negative-authorization.test.mjs` is 1,356 lines and 92
tests that read migration text and assert `.includes(...)`; the changelog's "91/91 passed" is that file. They pass while
D1, D4 and D7 exist. Executing tests are missing for waitlist, claim, referral, enabled loyalty, strikes, prayer pause,
favourites, payroll and report arithmetic (`trust.test.mjs:152-166` asserts only `r !== undefined`). Fix: replace the
grep tests with PGlite tests per feature and keep a small text guard only for banned phrases.

**D21. Invented or non-real data.** Fake saved payment cards with a person's name are hard-coded and rendered in the
customer wallet (`customer/wallet/page.tsx:331-334,558`: Mada 4920 and Visa 7701 for "YOUSIF AL-SAUD"); map pins for
branches without coordinates (`discover/page.tsx:198-199`); invented favourites ratings (D7). Fix: delete `savedCards`,
render "No saved cards" (cards are not stored), skip pins without coordinates and list them separately.

**D21b (P3). Stock valuation is retroactive.** Probe: 100 units at SAR 10 = 1,000; after a product edit to SAR 50 the same
stock reads 5,000 (`get_provider_chain_operations`, `get_admin_supply_overview` multiply on-hand by the current
`unit_cost_sar`, `20261005070000:299-300,355-356`). Fix: record `unit_cost_sar` on receipts and keep a moving-average cost
column on `branch_inventory_stock`, value from that, and audit cost edits with a reason.

**D22 (P3). Deactivated products strand stock.** `adjust_branch_inventory_stock` joins `inventory_products ... AND p.is_active`
(`20261005070000:113-114`), so waste or transfer of remaining stock fails with "Forbidden inventory scope"; stock still counts in
valuation. Fix: allow negative adjustments and transfers for inactive products, refuse deactivation while open orders exist,
and use a distinct "product inactive" message.

**D23 (P3). A branch-scoped delegate edits the whole chain's catalog.** Policies call
`can_manage_provider_operations(provider_id, NULL)` (`20261005060000:176-204`) and a scoped membership passes when the branch
argument is NULL. Probe: a `branch_manager` delegate with `{"inventory":true}` scoped to one branch set a product's cost and retail price to 1 and
created a supplier for the whole provider. Fix: require unscoped membership (`m.branch_id IS NULL`) for catalog writes, or move
catalog edits behind a `save_inventory_catalog` command that checks role.

**D24 (Codex earlier commits). Payment-method linkage governs nothing.** `accepted_payment_methods`
(`20260714170000_link_payment_methods_to_integrations.sql:61-96`) is referenced by no screen, mobile code or function; checkout
always creates a Tap charge (`supabase/functions/payment-checkout/index.ts`). Operators can mark any gateway "connected" and
tick method support with no effect. The view is also created without `security_invoker` and granted to `anon`
(already recorded as a gap at `.admin-console/manifest.json:4722`). Fix: either read the view in the checkout screen and
route by `gateway_key`, or remove the controls and the view; add `WITH (security_invoker = true)` and revoke `anon` writes.

**D25. Shop page is not keyboard or screen-reader operable.** `shop/[id]/page.tsx` (2,240 lines) has zero `role="dialog"`,
zero `aria-label`, zero `tabIndex`/`onKeyDown`; services and specialists are `div onClick` (`:1376-1383,1445-1525`), modal close
buttons are the bare character "x", labels are not associated with inputs. A keyboard user cannot pick a specialist and so
cannot book. Fix: use `<button>`/radio inputs for cards, `role="dialog" aria-modal="true" aria-labelledby`, focus trap and Escape
(the admin shared dialog already implements this), `aria-label` on icon buttons.

**D26. Coupon and block writes lack safeguards.** `admin/coupons/page.tsx:187-208` writes the table directly with no reason;
`provider/customers/page.tsx:120-125` blocks with one click and a constant reason. Fix: `admin_save_promo_code(...)` and a
block dialog with required reason, both audited by command.

### Low

**D27 (P3).** `create_supplier_purchase_order` is not idempotent (probe: two identical calls made two draft orders) and a duplicate
product line returns the raw `supplier_purchase_order_items_purchase_order_id_product_id_key` error (fix: request id receipt
as the stock commands use, merge duplicate lines); `quantity_reserved` is never written (build reservation commands or drop the
column and the `inventory_reserved_within_on_hand` check); a delegate can cancel an order the owner approved
(`20261005060000:449-453`; fix: cancel of `approved` requires owner/admin).

**D28 (P3).** Native `window.confirm`/`window.prompt` for receive, cancel and stock changes
(`provider/inventory/page.tsx:492-496`, `inventory-controls.tsx:61`); every failed write shows the generic `saveFailed`
(`page.tsx:403-406,448-451,482-485,509-513`) instead of the server's reason; Arabic mode shows English DB messages;
no forbidden state (`ForbiddenNotice` is not used on P3 screens); permission `fieldset` without `<legend>`
(`provider/chain/page.tsx`); low-stock metric uses `on_hand - reserved` (`page.tsx:244-248`) while the row flag ignores reserved
(`:731`). Fix: use the shared admin dialog, surface `error.message` through a translation map, add the legend.

**D29 (P3).** `audit_inventory_catalog` logs full rows (`20261005070000:91-99`); probe: a supplier's `contact_phone` and
`contact_email` appear in `admin_audit_logs.details.after`. Fix: log only an allow-list of columns, as `audit_admin_write` does.

**D30.** Business constants hard-coded in SQL and UI: three strikes in 60 days (`check_customer_booking_eligibility`), gift card
50-5,000 SAR and 365 days, tip 5-1,000 SAR, VAT 0.15 (`booking_create_internal` `:733`, shop page `:941`), referral 25.00,
wallet value `points / 10` (`customer/wallet/page.tsx:421`), `https://primora.sa` links in message variables
(`booking_message_variables`). Fix: move to `platform_settings` (owner-approved values) and read them.

**D31.** Stale or untrue project documentation: the P2-A changelog gives the wrong `join_waitlist` signature, the P2-C entry
claims BNPL, and "adminwright validation passed with 0 errors" was contradicted in the review of 2026-10-04.
`supabase/tests/inventory.test.mjs` asserts a booking update the final system forbids. Fix: correct the changelog and delete the
stale assertion.

**D32.** `20261005070000` is not re-runnable (`CREATE TABLE`, `CREATE TRIGGER`, `ADD CONSTRAINT` without guards); harmless in
a transactional `db push`, harmful after a partial manual apply. Fix: add `IF NOT EXISTS`/`DROP ... IF EXISTS`.

## 4. Roadmap gaps not built

- P2: G52 group booking, G60 WhatsApp AI receptionist, G61 Google/Instagram integrations, G63 sponsored placement,
  and G62 BNPL (only registry rows).
- P3 table: G65 memberships (none), G67 payroll (only the broken G55 export), G68 white-label, G69 developer API (a token
  page with browser-side SHA-256 exists, no API), G70 GCC configuration (`+03` and VAT 0.15 constants remain), G71 recurring
  appointments, G72 intake forms and patch tests, G73 own licence, G74 kiosk, G75 portable professional identity.
- G66 inventory: catalog, stock and purchasing are built by Codex; retail sale and stock deduction are not (`movement_type 'sale'`
  is allowed by the check constraint but no function writes it).
- Also absent for built gaps: waitlist, gift card, coupon, loyalty and favourites on the mobile app; claim UI for waitlist;
  referral entry UI; wallet spending; package-to-booking linkage; commission-rule editor.

## 5. Not verifiable here, and why

- Hosted Supabase: the old project does not resolve and no connector is authorized; no hosted policy, grant or Auth setting
  was checked.
- PostgreSQL 15: the test engine is 18.3 (PGlite 0.5.8). A scan of all migrations for PG16-18-only syntax (MERGE, JSON_TABLE,
  SQL/JSON constructors, `any_value`, virtual generated columns, `uuidv7`, `RETURNING OLD`) found none, but the chain was not
  run on 15.
- True concurrency: PGlite is single-connection, so lock order, advisory locks and the double-submit paths (transfers in
  opposite directions, simultaneous coupon redemption, simultaneous receive) were reviewed by reading only.
- Edge Functions: `deno` is not installed on this machine; `deno check`/`lint` and the CI result were not re-run.
- Tap, WhatsApp Cloud API and Wathq: not contacted; the waitlist, gift and tip messages and charges were not exercised.
- Signed-in browser behaviour, screen readers, keyboard order, mobile layout and console errors: no browser session was
  available; accessibility findings come from source (missing roles, labels, key handlers).
- Production data volume: `max_rows = 1000` effects on provider customer and bookings lists were read, not measured.
- Legal questions (stored-value gift cards, WPS format, PDPL treatment of audit contents) need human decisions.
