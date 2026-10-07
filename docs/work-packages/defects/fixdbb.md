# Defects owned by fixdbb

Extracted verbatim from the three reviews in docs/reviews/ (A = D-xx, B = Rxx, C = C-Dxx). Some ids appear in two packages because the fix has a
database part and a screen part: your task says which part is yours.

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

**D23 (P3). A branch-scoped delegate edits the whole chain's catalog.** Policies call
`can_manage_provider_operations(provider_id, NULL)` (`20261005060000:176-204`) and a scoped membership passes when the branch
argument is NULL. Probe: a `branch_manager` delegate with `{"inventory":true}` scoped to one branch set a product's cost and retail price to 1 and
created a supplier for the whole provider. Fix: require unscoped membership (`m.branch_id IS NULL`) for catalog writes, or move
catalog edits behind a `save_inventory_catalog` command that checks role.

**D29 (P3).** `audit_inventory_catalog` logs full rows (`20261005070000:91-99`); probe: a supplier's `contact_phone` and
`contact_email` appear in `admin_audit_logs.details.after`. Fix: log only an allow-list of columns, as `audit_admin_write` does.

**D21b (P3). Stock valuation is retroactive.** Probe: 100 units at SAR 10 = 1,000; after a product edit to SAR 50 the same
stock reads 5,000 (`get_provider_chain_operations`, `get_admin_supply_overview` multiply on-hand by the current
`unit_cost_sar`, `20261005070000:299-300,355-356`). Fix: record `unit_cost_sar` on receipts and keep a moving-average cost
column on `branch_inventory_stock`, value from that, and audit cost edits with a reason.

**D22 (P3). Deactivated products strand stock.** `adjust_branch_inventory_stock` joins `inventory_products ... AND p.is_active`
(`20261005070000:113-114`), so waste or transfer of remaining stock fails with "Forbidden inventory scope"; stock still counts in
valuation. Fix: allow negative adjustments and transfers for inactive products, refuse deactivation while open orders exist,
and use a distinct "product inactive" message.

**D27 (P3).** `create_supplier_purchase_order` is not idempotent (probe: two identical calls made two draft orders) and a duplicate
product line returns the raw `supplier_purchase_order_items_purchase_order_id_product_id_key` error (fix: request id receipt
as the stock commands use, merge duplicate lines); `quantity_reserved` is never written (build reservation commands or drop the
column and the `inventory_reserved_within_on_hand` check); a delegate can cancel an order the owner approved
(`20261005060000:449-453`; fix: cancel of `approved` requires owner/admin).

**D32.** `20261005070000` is not re-runnable (`CREATE TABLE`, `CREATE TRIGGER`, `ADD CONSTRAINT` without guards); harmless in
a transactional `db push`, harmful after a partial manual apply. Fix: add `IF NOT EXISTS`/`DROP ... IF EXISTS`.

**D11. Strike has no appeal or clearing.** `open_booking_dispute` only disputes captured payments
(`20261005010000`); nothing clears `bookings.no_show_at`. A provider can leave a customer un-checked-in and mark a
no-show after the start time; three such marks force 100 percent prepayment at every provider for 60 days. Fix:
`admin_clear_no_show(booking_id, reason)` with audit, a customer "contest" request that pauses the strike count, and an
`is_contested` filter in `check_customer_booking_eligibility`.

**D17. Report definitions.** `get_provider_detailed_analytics` computes first-time vs repeat over all time (ignores the
range); popular services join `bookings.service_id` (first service only) so multi-service revenue is credited to one
service (`20261005020000:791-878`); `get_provider_multi_branch_summary` uses `scheduled_at::date` in UTC
(`20261004070000:291+`). Fix: compute first-time as "first completed visit date inside range", join `booking_services`
for per-service revenue and counts, and use `(scheduled_at AT TIME ZONE 'Asia/Riyadh')::date` everywhere; add numeric tests.

**D30.** Business constants hard-coded in SQL and UI: three strikes in 60 days (`check_customer_booking_eligibility`), gift card
50-5,000 SAR and 365 days, tip 5-1,000 SAR, VAT 0.15 (`booking_create_internal` `:733`, shop page `:941`), referral 25.00,
wallet value `points / 10` (`customer/wallet/page.tsx:421`), `https://primora.sa` links in message variables
(`booking_message_variables`). Fix: move to `platform_settings` (owner-approved values) and read them.

**R19 [D25, D26-part] Provider fee invoices cannot be generated or collected.**
Where: `supabase/migrations/20261005010000_review_fix_money.sql:835` has no caller; `:885-886` `ON CONFLICT (invoice_number) DO UPDATE ... status = EXCLUDED.status`; `:878` VAT only on `v_receivable`.
Scenario: nobody runs it, so the receivable is never billed; if an admin does run it, a re-run mid-month or later turns a paid invoice back to `issued` and rewrites its amounts.
Fix: monthly scheduled call for closed months only; `ON CONFLICT DO NOTHING` and raise when the month is open; add `mark_fee_invoice_paid` and netting in `admin_release_payout`; decide with tax counsel whether VAT applies to the whole commission.

**R20 [D26] Subscription billing is a single charge with no entitlements.** `supabase/migrations/20261005010000_review_fix_money.sql:226` and `confirm_purchase_payment` (`provider_subscriptions` never expires; `tap_subscription_id` holds a payment intent id); no function reads `max_branches`, `max_employees`, `commission_discount_pct`, `included_monthly_sms`; free plan replaces a paid period at once; prices 299/799 SAR seeded by the agent. Fix: expiry job, enforce limits in employee/branch insert policies, keep the paid period until `current_period_end`, owner approves prices.

**R30 [G25] Tax-invoice hash chain is not concurrency-safe and invoices are issued lazily.** `supabase/migrations/20261005010000_review_fix_money.sql:1081` reads the provider's last `invoice_hash` (`ORDER BY created_at DESC LIMIT 1`) and inserts without a lock; the function runs only when a customer, staff member or admin opens the invoice (`customer/bookings/page.tsx:204-220`), so `issue_date` is the first click, not the visit. Scenario: two simultaneous requests for one provider both chain from the same predecessor (a fork); an invoice for a visit in September is dated in November. Fix: take `pg_advisory_xact_lock(hashtext(provider_id::text))` before reading the previous hash; issue the invoice in the completion trigger (service role) and keep `issue_date` = completion time; add a test that issues two invoices in parallel connections.

**R32 Wathq check does not tie the CR to the applicant.** `supabase/functions/wathq-verify/index.ts:46-53` ignores `payload.crName`/owners; the badge says "CR verified via Wathq". Fix: compare the registered name (normalized Arabic) with `business_name_ar/en` and require admin confirmation on mismatch; require a verified or manually reviewed CR in `approve_provider_application`.

**R33 [G31] Push notifications are not wired.** No code writes `expo_push_tokens` (no `expo-notifications` in `mobile_app/package.json`), `send-push`/`send-notification` have no caller, yet `20260703014433_phase2_admin_control_plane.sql:157` marks Expo Push `connected`; `notifications` is written only by admin broadcasts. Fix: register tokens on sign-in, add a trigger/queue that creates a notification and a push for booking events, or set the integration to `not_configured`.

### D-26 MEDIUM: the funnel and error tracking cannot produce a report
- Evidence in the G15 row. Fix: add `analytics_events(id, event, user_id, anon_id, props jsonb, created_at)` written by an `INSERT`-only RPC for client events and by triggers on `bookings` (confirmed, completed, cancelled, no_show) and `transactional_ledger` (payment_succeeded); load PostHog/Sentry only behind the consent record; call `captureError` from an error boundary.

### D-03 HIGH: every WhatsApp link points to a page that does not exist
- Where: `20261005000000_review_fix_booking_core.sql:1403` builds `https://primora.sa/customer/bookings/<id>`; `web_platform/src/app/customer/bookings/` contains only `page.tsx` and `[id]/confirmation/page.tsx`. The "confirm attendance" action is parsed only from `?action=confirm_attendance&booking_id=` in `customer/bookings/page.tsx:301-321`, a URL no template emits. Base URL is also hard-coded SQL.
- Scenario: customer taps the link in the 24 h reminder, gets a 404; Confirm / Reschedule / Cancel (G11 exit check) cannot happen.
- Fix: put the base URL in `platform_settings` (`public_app_url`), emit `/customer/bookings?booking=<id>&action=confirm_attendance` for confirm and `/customer/bookings?booking=<id>` otherwise, and open the matching modal from the page.
