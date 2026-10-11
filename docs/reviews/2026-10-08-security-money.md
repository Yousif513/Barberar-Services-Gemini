# Security and money-correctness review, 2026-10-08

Reviewer: independent (did not write this code). Checkout: primora-fix, branch claude-code.
Method: read-only on source and migrations. Probes run against a migrated PGlite database
(supabase/tests/db/harness.mjs createMigratedDb) from scripts in the scratchpad.
Status: COMPLETE for the scope listed. Reproductions: scratchpad probes plus `supabase/tests/db/review_money_open.repro.mjs` (7 tests, all FAIL today, one per M-04..M-10; M-01..M-03 were handed to the integrator and are not re-tested there).
Supporting detail for each defect is in the "Working notes" below the ranked list.

## Verdict per area

| Area | Verdict | Defects |
|------|---------|---------|
| 0. Function and table privilege sweep (365 functions, 141 relations) | SOUND (hygiene gap only) | M-22, M-23 |
| 1. Memberships | ISSUES | M-01, M-02, M-20 |
| 2. Sponsored placement (accrual, cap, billing) | ISSUES (low) | M-12, M-13, M-14, M-15 |
| 3. Fee invoices and subscriptions | ISSUES | M-04, M-05, M-06, M-07, M-11, M-19 |
| 4. Recurring series and group booking holds | SOUND (low) | M-17; shares M-03 |
| 5. Wallet credit, referral, coupon, loyalty, package in the booking path | ISSUES | M-03, M-21 |
| 6. Source attribution tokens / first-visit commission | ISSUES | M-08, M-10 |
| 7. Refunds, payouts, idempotency, invoice chain | ISSUES | M-09, M-16, M-18 |

## Ranked defects

CRITICAL
- M-03 `confirm_booking_payment` conflict test omits `wallet_credit_amount`: expired hold restores the credit, late payment resurrects the booking still marked as paid with credit; repeatable. (fix in progress by integrator)

HIGH
- M-01 Non-booking purchases (membership, package, gift card, tip, subscription) captured twice or after cancellation raise in `confirm_*_payment`: HTTP 500 loop, no ledger row, no refund request. Fix: record the capture and create a refund request, as the booking path does. (integrator)
- M-04 Commission of a booking completed after its month's fee invoice is never billed (`generate_provider_monthly_fee_invoice` buckets by scheduled_at and never rewrites). Fix: completed_at bucketing or carry-forward of un-invoiced completed bookings.
- M-06 Yearly subscription is charged one month of the annual per-month rate (239 instead of 2,868), no VAT on the charge. Fix: one server-side price quote, `price_yearly_sar * 12` or store the annual total; owner confirms the intended price.
- M-08 Zero-price walk-in linked to a customer's verified phone removes the first-visit commission (17.00 -> 0.00). Fix: ignore `walk_in` source and zero-value bookings when computing first visit.
- M-09 Deposits of future bookings are payable immediately; after release a provider cancellation cannot be refunded automatically (`already_paid_out`). Fix: payable only after completion plus hold; platform refunds and books a receivable.
- M-10 `request_source = 'import'` is self-attested by the provider through directly inserted contact rows (commission 0.00 on a first marketplace visit). Fix: see Area 6.

MEDIUM
- M-02 Membership redemption does not bound the booking date to the membership period (1-day membership redeemed against a booking 6 days later). Fix: require `scheduled_at >= period_start AND < period_end`.
- M-05 Fee invoice number uses an 8-hex-character provider prefix; collisions drop the second provider's invoice silently. Fix: full id or (provider, period) conflict target.
- M-07 Superseded subscription checkout, when paid, is captured and unrecorded (instance of M-01, reproduced).
- M-11 Hard-coded 15 percent VAT and fallback commission; VAT not computed on collected commission. Owner/legal decision plus fail-closed.
- M-15 Sponsored fee carries no VAT, is not invoiced for a provider with no later completed bookings, no credit mechanism. Owner/tax decision.
- M-16 Duplicate ZATCA invoice per booking possible (check-before-lock, no unique index).

LOW
- M-12 anon-callable `get_sponsored_placements` writes on every call. M-13 sponsored new-client lock is per campaign not per (provider, customer). M-14 walk-ins are attributed and billed as sponsored acquisitions.
- M-17 unpaid series/group holds uncapped per customer. M-18 no credit-note mechanism; global invoice sequence. M-19 plan limits fail open; plan change forfeits paid time.
- M-20 package session plus membership visit on one booking. M-21 late-cancel fee avoidable with instruments. M-22 `confirm_booking_payment` granted to authenticated; webhook unrate-limited. M-23 write grants broader than policies.

## Could not verify, and why
- True concurrency (M-13, M-16, double redemption, simultaneous confirmations): PGlite is a single connection; the tests prove lock/unique-index logic through interleaving only. Needs a two-session test on a real Postgres 15.
- Edge Functions (payment-webhook, payment-checkout, refunds) at runtime: no Deno and no Tap sandbox; reviewed by reading. Tap amount format (decimal SAR number) and charge metadata handling are assumed from the code.
- Hosted Supabase grants: privileges were computed in the harness, which mirrors Supabase default privileges; the live project (unreachable per project notes) was not queried, and migrations not yet applied there were not checked against it.
- Not reviewed in depth: country configuration (GCC), intake, WhatsApp receptionist, professional identity, API keys/webhooks, inventory. Role matrices for these were taken from the authors' tests, not re-run.
- ZATCA/VAT/PDPL conformance and the business choices flagged as owner decisions (payout holdback, yearly price, commission on packages/memberships, sponsored VAT) are legal or commercial questions.
- M-20 and M-21 are from code reading, not reproduced. Browser behaviour of the screens was not exercised.

---
## Working notes (appended per area; the ranked list at the end supersedes this)

### Area 0: privilege and function-hygiene sweep (done)
Method: migrated PGlite, queried pg_proc/pg_class/pg_policy for all 365 public functions and 141 relations.
- 314 SECURITY DEFINER functions: 0 without `search_path` in proconfig.
- SECURITY DEFINER executable by `anon`: 8, all intended public reads/telemetry (get_available_slots, get_branch_available_slots, get_branch_schedule_with_prayer_pauses, get_sponsored_placements, public_professional_profile, record_sponsored_click, search_marketplace_providers, track_analytics_event).
- Of 216 function names created/replaced since 20261006220000: 77 are not executable by anon or authenticated (service/internal); 125 secdef are executable by authenticated and every one of them contains an identity/permission reference in its body except the few that are deliberately pure readers (country_*, branch_*, provider_timezone, setting_number, sponsored_config: INVOKER, read-only on world-readable settings).
- Tables: 0 relations with client privileges and RLS off; 0 with RLS on and zero policies but client grants; anon holds SELECT on 17 public-catalogue tables only (all with policies). Views: 0 without security_invoker among client-visible views.
- Money tables (wallet_credits, customer_loyalty, loyalty_points_ledger, coupon_redemptions, gift_card_redemptions, package_redemptions, transactional_ledger, provider_fee_invoices, payment_refund_requests, customer_referrals, payout_requests, payment_disputes, booking_tips, memberships*, sponsored_*): `authenticated` holds table-level INSERT/UPDATE/DELETE privileges on many of them (grants broader than policies) but the only write policies are admin-only (`is_admin()`), so a non-admin write is refused by RLS. Defence in depth is missing, not an open hole (see M-23).
- bookings: `authenticated` has column UPDATE on money columns (total_price, deposit_required, status, platform_commission, refund_amount, wallet_credit_amount ...) but the only non-SELECT policy is "Admins manage bookings", so provider/customer direct writes are refused.

### Area 1: memberships (in progress)
Reproduced with scratchpad probes (m1.mjs, m2.mjs):
- M-01 (orphaned capture): customer cancels a `pending_payment` membership (allowed) or pays the same membership on two Tap charges; the webhook calls `confirm_membership_payment` -> 22023 "Membership is not awaiting payment" -> HTTP 500 -> Tap retries forever. Result: captured SAR with no ledger row and no payment_refund_requests row (probe: ledger rows 0, refund requests 0 after both). `confirm_booking_payment` creates a refund request in the equivalent conflict; the membership path does not.
- M-02 (redemption not bounded by the membership period): a 1-day membership (period ends 2026-10-09) was redeemed against a booking scheduled 2026-10-14, and a second visit against another booking the same day. `redeem_membership_visit` checks `now()` against the period but never the booking's `scheduled_at`.

### Area 5/6 (booking path: wallet credit, coupons, loyalty, packages, source tokens), first results
- M-03 (CRITICAL, reproduced w1.mjs): `confirm_booking_payment` decides whether a late payment for a released hold is a conflict with
  `discounts_released_at IS NOT NULL AND (discount_amount > 0 OR gift_card_amount > 0 OR loyalty_points_redeemed > 0)`. `wallet_credit_amount` is not in the list.
  A booking paid partly with wallet credit (credit 30.00, deposit 17.00) whose hold expires gets its credit restored by `booking_release_discounts`
  (remaining_amount back to 30.00, is_spent false). The Tap checkout is still payable, so the customer pays the 17.00 late: `confirm_booking_payment` returns
  `confirmed, conflict:false`, the booking is resurrected with `wallet_credit_amount = 30.00`, and the customer still holds 30.00 spendable credit (a second booking spent it again).
  At completion `trigger_on_booking_completed_rewards` writes a `wallet_credit_settlement` of 30.00 payable to the provider. Net: the platform pays 30.00 per cycle for credit that was never consumed,
  and the cycle can be repeated indefinitely with one credit.

### Area 3: fee invoices (reproduced with scratchpad f1.mjs)
- M-04 (HIGH): commission is lost for a booking completed after its month's invoice exists. `generate_provider_monthly_fee_invoice` buckets by `bookings.scheduled_at` (Riyadh month) and
  only `status = 'completed'`; an issued invoice is never rewritten (`ON CONFLICT (invoice_number) DO NOTHING`, then `already_issued`). Probe: September booking B (commission 40.00) confirmed, September invoice issued
  (`issued:1`), provider owner then calls `employee_update_booking_status(B,'completed')` on 9 Oct (allowed, no upper time bound) -> second `issue_monthly_fee_invoices` returns `issued:0, already_issued:2`; the invoice still shows
  `total_bookings_count 1, platform_commission_sar 20.00`; October's run only counts bookings scheduled in October, so B is never billed. The existing test fixdbb_fee_invoices.test.mjs ("more activity arrives after the invoice was issued")
  asserts the invoice does not change but nothing bills the 40.00 later. A provider can do this on purpose for every end-of-month booking.
  Fix: bucket by completion time (add `bookings.completed_at`, set by trigger) or add a carry-forward: the next invoice also includes completed bookings of earlier months not yet attached to an invoice (`invoiced_in uuid` on bookings).
- M-05 (MEDIUM): invoice number `'FEE-' || YYYYMM || '-' || left(provider_id::text, 8)` is a 32-bit prefix and `provider_fee_invoices.invoice_number` is unique. Two providers whose ids share the first 8 hex characters collide and the second provider's invoice is silently
  dropped and reported as `already_issued` (and the call returns the OTHER provider's invoice id, status and amount). Probe: the two seeded demo providers (`aaaaaaaa-...a1` and `...a2`) both complete a September booking; `issue_monthly_fee_invoices` returns `issued:1, already_issued:1`, provider 2's 25.00 commission is never invoiced.
  Random v4 ids collide with probability about N^2/2^33 per month (about 1 in 8,600 months-pairs at 1,000 providers, near certain beyond 100,000).
  Fix: use the full provider id (or a per-provider sequence) in the number, and make the conflict target `(provider_id, period_start)`.

### Area 3: subscriptions (reproduced with s1.mjs)
- M-06 (HIGH): a yearly plan is charged one month's discounted rate. Seed `subscription_plans`: growth monthly 299.00 / yearly 239.00, elite 799.00 / 639.00 (239 = 299 x 0.8, i.e. a PER-MONTH price billed annually).
  `provider/pricing/page.tsx:303-318` treats it that way (`subtotal = basePricePerMonth * 12`, so the screen shows 2,868 + 430.20 VAT). `subscribe_provider_plan(...,'yearly')` sets `amount := price_yearly_sar` (239) and
  `confirm_purchase_payment` grants `interval '1 year'` for it. Probe: `subscribe_provider_plan(provider1,'growth','yearly')` -> `amount_sar 239`, status pending_payment; payment-checkout charges Tap 239.00 for 12 months (undercharge 2,629 SAR per growth year, 5,431 per elite year).
  The charge also carries no VAT while the screen quotes 15 percent (ledger `subscription` row: platform_share = full amount, no tax split). Which reading of `price_yearly_sar` is the intended price is an owner decision (pricing); fix either the seed/column meaning (store the annual total) or `amount := price_yearly_sar * 12`,
  and have one server-side quote function used by both the screen and the charge.
- M-07 (MEDIUM, same family as M-01): `subscribe_provider_plan` cancels earlier `pending_payment` rows (`UPDATE subscription_payments SET status='cancelled'`) while their Tap checkout pages stay payable. Paying the older page makes `confirm_purchase_payment` raise "Subscription payment is not awaiting payment"; money is captured with no ledger row and no refund request. A provider who clicks Subscribe twice then pays the first page triggers it by accident.

### Area 6: source attribution / first-visit commission (reproduced with wi.mjs)
- M-08 (HIGH): the marketplace commission is charged only on a customer's FIRST confirmed/completed booking at a provider (`fee_rules`: marketplace first visit 20 percent, min 10, max 40; repeat visits 0 percent), and
  `create_walk_in_booking` lets the provider's staff create a `confirmed` counter booking at ANY price (including 0) linked to a registered customer by verified phone (`p_customer_phone`; `customer_id` set when `profiles.phone_verified`).
  Probe: control customer books first time -> `is_first_visit true, commission 17.00`; provider owner calls `create_walk_in_booking(branch, employee, service, 'x', '<target customer verified phone>', 'cash', 0)` -> `linked_customer true, total 0`;
  the target customer then books through the marketplace -> `is_first_visit false, commission 0.00, source marketplace`. The provider avoids the commission on any customer whose verified phone it knows (e.g. one who messaged it first) at no cost.
  Checked and NOT a bypass for sponsored fees (sp1.mjs): when the customer clicked a sponsored placement before the provider created and completed the linked walk-in, the walk-in itself is attributed as the new client
  (accrued 17.00) and the later real booking is waived `not_new_client`, so the fee is billed once, but against a walk-in that never came from the marketplace (LOW, M-14).
  Fix: compute `is_first_visit` and "new client" from bookings whose `source <> 'walk_in'` (or with `total_price > 0` and a captured payment), and/or do not link a walk-in to a customer profile without the customer's confirmation.

### Area 2: sponsored placement (sp1.mjs and code reading of the current function bodies)
Verified: settings UNSET -> `get_sponsored_placements` returns `{configured:false, placements:[]}` and `record_sponsored_click` raises "Campaign not found", no rows written (probe: sponsored_clicks 0). With the four settings set: one placement, owner-only campaign commands,
accrual 17.00 for a clicked new client, `not_new_client` waiver for a returning one, `LEAST(price, accepted)`, cap check under a campaign row lock, void/waive refused once billed, all `anon` EXECUTE grants limited to the two intended functions.
- M-12 (LOW): `get_sponsored_placements` is executable by `anon` and UPDATEs `sponsored_campaigns.last_shown_at` on every call (write amplification and rotation manipulation by anyone who can call the API; no rate limit). Fix: separate the read from the rotation bookkeeping, or throttle (e.g. record at most one show per campaign per N seconds).
- M-13 (LOW, cannot be proved on one connection): the lock that serialises "new client" is on the CAMPAIGN row, but "new client" is a property of (provider, customer). A customer who clicked two different campaigns of one provider and has two bookings completing at the same moment can be accrued twice (each transaction sees no other completed booking only if it takes a different campaign lock). Fix: `pg_advisory_xact_lock(hashtext(provider||customer))` before the `v_new` check.
- M-14 (LOW): a provider-created walk-in linked to the customer's profile is attributed and billed as a sponsored new client (probe above). Fix: skip `source = 'walk_in'` in `sponsored_attribute_completed_booking`.
- M-15 (MEDIUM, needs owner/tax decision): the sponsored fee is added to `provider_fee_invoices.total_invoice_due_sar` with no VAT (the commission part carries 15 percent) and the fee of a provider with no completed booking in the following month is never invoiced (documented in sponsor-report). `admin_void_sponsored_attribution` tells the admin to "correct it with a credit" but no credit mechanism exists in any migration.

### Area 7: payouts and refunds (reproduced with po.mjs)
- M-09 (HIGH): `provider_available_balance` sums `provider_share` of every ledger row with `payout_status = 'pending'`, and `confirm_booking_payment` writes `pending` at capture time, so the deposit of a booking that has NOT happened yet is payable at once
  (also package_sale and membership sales, which have no service to perform). Probe: customer pays a 42.50 deposit for a booking 5 days ahead -> ledger `provider_share 25.50, payout_status pending`, available balance 25.50;
  owner `request_provider_payout(25.50)`; admin `admin_release_payout` succeeds (ledger row `released`); the provider then cancels the booking -> `cancel_booking` creates refund request 42.50 -> `claim_refund_request` answers `claimed:false, reason already_paid_out`
  and marks it `failed: Funds were already paid out to the provider; recover manually before refunding`. The customer's refund can never be paid automatically (every retry fails the same way) and the platform is out the provider's share.
  Fix: make a ledger row payable only after the visit is performed (join bookings.status = 'completed' and a hold period for disputes), keep package/membership/gift revenue payable only after a configurable hold (owner decision), and when a released row must be refunded let the platform refund the customer and book a receivable against the provider's next payout.
- Verified sound: `create_refund_request_internal` caps at captured - refunded - pending and is idempotent on its key; refund Tap call uses the stored idempotency key so a retry after a lost response is de-duplicated; `admin_reopen_stuck_refund` waits 15 minutes; `request_provider_payout` locks the provider row and subtracts open requests; `admin_release_payout` re-checks status under a row lock and allocates ledger rows (a second release with a new key fails "Payout request is paid"); client roles cannot write any of these tables.

### Area 6 continued (im.mjs)
- M-10 (HIGH): the `import` channel is self-attested by the provider. `resolve_booking_source` returns `import` (0 percent commission) when the CALLER claims `request_source = 'import'` and a `provider_client_contacts` row of that provider matches the customer's verified phone.
  The owner can insert such a row directly (RLS "Provider staff manage client contacts" allows the owner to INSERT; the only requirement is a non-null `consent_confirmed_at`, which the owner supplies). The web shop page forwards `?source=import` from the address bar (`web_platform/src/app/shop/[id]/page.tsx:1086-1088`).
  Probe: owner inserts `(provider, 'Lead', '+966500000555', now())`; the customer (verified phone, no prior booking) books with `request_source => 'import'` -> `source import, is_first_visit true, commission 0.00` (control: 17.00).
  Verified closed: a share token of provider 2 used at provider 1 is ignored (`marketplace`, commission 17.00).
  Fix: accept `import` only for contacts created through the import command with a retained consent record and created before the customer's first booking at that provider (and not for a customer who already has a marketplace booking there), or drop the claim and rely on revocable share tokens; add a per-token booking counter and an admin report of providers whose zero-fee share is anomalous.
  Residual by design: a share token is a bearer string; anyone holding the link books fee-free (documented decision in fixbooking-report 3).

### Areas 4: recurring series and group booking holds
Verified from current function bodies: series occurrences are created through `create_booking` as the customer (every price, deposit, VAT and availability rule applies; follow-ups are `marketplace` with `is_first_visit false`, so 0 percent commission, probe r1.mjs);
the hold sweeper skips a series occurrence or a group member only while `payment_due_at > now()`, and both due dates are capped at one hour before the first unpaid visit (`LEAST(now()+hold, first_pending - 1h)`); a missing provider hold setting makes the command refuse instead of defaulting; replay with a different request is 23505.
Late payment of a released series/group booking goes through the same `confirm_booking_payment` and is subject to M-03.
- M-17 (LOW): a series or group can hold up to `max_occurrences`/`max_group_size` slots unpaid for up to `payment_hold_hours` (max 168) with no per-customer cap on concurrent open series; opt-in per provider, anchor must be paid. Fix: limit open unpaid occurrences per customer per provider.
- Not tested, cannot be proved on one connection: two simultaneous `create_group_booking`/series calls with different keys racing for the same slot (protected by the booking exclusion constraint, `23P01` is mapped).

### Other findings from reading the current function bodies
- M-11 (MEDIUM, owner/legal decision): `generate_provider_monthly_fee_invoice` hard-codes `v_vat := ROUND(v_receivable * 0.15, 2)` (20261005010000_review_fix_money.sql:878) while the rest of the platform reads `country_vat_rate(...)`; VAT is computed only on the uncollected part of the commission (`net_fee_receivable`), not on the part already collected inside the deposit (`platform_share`),
  so VAT on collected commission appears on no invoice; and `calculate_booking_platform_commission` falls back to a hard-coded 15 percent when no fee rule matches (`p_price * 0.15`) instead of failing closed. Fix: take the rate from the provider's country setting, decide with counsel whether commission is VAT-inclusive, make a missing rule an error.
- M-16 (MEDIUM, race structure proven, race not provable here): `generate_zatca_tax_invoice` checks `SELECT ... FROM invoices WHERE booking_id = p_booking_id` BEFORE it takes the per-provider advisory lock and does not re-check after, and `invoices` has no unique index on `booking_id` (only `idx_invoices_booking`). Two near-simultaneous calls (customer, provider and admin may all call it) produce two chained tax invoices for one supply. Fix: take the lock first, re-check inside it, add `CREATE UNIQUE INDEX ... (booking_id) WHERE booking_id IS NOT NULL`.
- M-18 (LOW/MEDIUM, compliance): the code tells operators to "correct it with a credit note" (protect_issued_invoice, admin_void_sponsored_attribution) but no credit-note or credit function exists in any migration. A refunded completed visit leaves its tax invoice standing. Invoice numbers are `INV-` + one global sequence (non-contiguous per seller, gaps on rollback): ZATCA counter rules need legal review.
- M-19 (LOW): `provider_plan_limits` returns NULL limits (enforcement skipped) for a provider with no subscription row and for an expired one when there is not exactly one free plan, i.e. it fails open to unlimited branches/employees. `subscribe_provider_plan`/`confirm_purchase_payment` start a plan CHANGE at `now()`, forfeiting remaining paid time of the old plan with no proration (owner decision).
- M-20 (LOW, by code reading, not reproduced): `redeem_package_session` neither sets `bookings.user_package_id` nor checks `membership_redemptions`, and `redeem_membership_visit` checks only `user_package_id IS NOT NULL`, so one booking can consume a package session and a membership visit.
- M-21 (LOW): late cancellation fee is a percentage of the CASH captured only (`cancel_booking`); wallet credit, gift card, coupon and package value are restored in full by `booking_release_discounts`, so paying with credit avoids the fee. Policy decision.
- M-22 (LOW): `confirm_booking_payment` is granted to `authenticated` (it rejects non-service callers inside); revoke EXECUTE from `authenticated` like `confirm_purchase_payment`/`confirm_membership_payment`. `payment-webhook` (verify_jwt false) fetches Tap for any posted id with no rate limit.
- M-23 (LOW, defence in depth): `authenticated` holds table-level INSERT/UPDATE/DELETE on ~55 tables (wallet_credits, transactional_ledger, provider_fee_invoices, payout_requests, bookings money columns, ...) although only admin policies permit writes. RLS stops it today; one permissive policy added later would expose money columns. Fix: REVOKE write grants on tables written only through commands.
