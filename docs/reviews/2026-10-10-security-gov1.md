# Security review: GOV-1 (console roles, AAL2/step-up, maker-checker, IBAN controls, append-only audit)

- Reviewer: `sec-gov1-claude` (adminwright security pass, independent of implementer `impl-gov1-claude`)
- Date: 2026-10-10. Branch `claude-code`, commits 99dfd65, 65800a4, 0c050fb, 4cff25a
- Method: fresh read of migrations `20261010100000`..`130000`, `supabase/config.toml`, `supabase/functions/_shared/http.ts` and
  every Edge Function admin check, `/admin/ledger` reveal code; live checks against the local stack
  (`supabase_db_beauty_grooming_marketplace`, all four GOV-1 migrations applied) as `authenticated` with forged
  `request.jwt.claims`, every write inside `BEGIN ... ROLLBACK`. GOV-1 node suites: 36/36 pass (they do not cover the findings below).
- Spec: `docs/legal/2026-10-10-adopted-decisions.md`, D-Q5 / D-Q8 final text (money memo), Q3 / Q4 / Q6 final text (privacy memo).

## Verdict

A stolen finance or owner session (aal2, no fresh code needed) can mint provider balance or customer wallet value and delete
ledger rows with plain PostgREST writes; a stolen **operations** session (no money permission) can mint provider balance by
editing a booking. Either is then paid out through a normal-looking, second-person-approved payout. A malicious owner can
create their own second approver in one call. The maker-checker RPCs themselves are sound (self-approval refused, one-time
execution token cannot be forged from a client, break-glass cap serialised correctly), but they are routed around.
**Not acceptable for the regulated profile. Release blocked on C-1, C-2, H-1..H-4.**

Count: **2 critical, 4 high, 6 medium, 4 low.**

---

## Critical

### C-1. Finance and owner write money tables directly: no step-up, no second person, no idempotency (D-Q5, D-Q8)

`money.write` (finance, owner) satisfies the restrictive policies GOV-1 added, and the old permissive `FOR ALL USING (is_admin())`
policies remain. `authenticated` still holds INSERT/UPDATE/DELETE on `transactional_ledger`, `wallet_credits`,
`payment_refund_requests`, `gift_cards`, `gift_card_redemptions`, `provider_fee_invoices`, `payment_disputes`,
`psp_reconciliation_runs`, `customer_loyalty`, `loyalty_points_ledger`, `coupon_redemptions`, `booking_tips`,
`employee_commission_rules`, `payment_methods`, `package_redemptions`, `customer_referrals`.

Reproduction (reproduced, rolled back). The amr timestamp is 1970, so there is no step-up:

```sql
BEGIN; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated","aal":"aal2","amr":[{"method":"password","timestamp":1}]}',true);
INSERT INTO transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','package_sale','chg_forged',50000,0,50000,'pending');   -- succeeds: SAR 50,000 payable
DELETE FROM transactional_ledger WHERE payment_intent_id='chg_forged';                               -- succeeds: ledger row erased
INSERT INTO wallet_credits (customer_id, amount, reason, source)
SELECT id, 9999, 'x', 'compensation' FROM profiles WHERE role='customer' LIMIT 1;                     -- succeeds
ROLLBACK;
```

Over PostgREST this is `POST /rest/v1/transactional_ledger`. The provider then calls `request_provider_payout`. A second
administrator approves a payout that the ledger shows as fully backed. Step-up, thresholds, break-glass caps and four eyes never run.

**Fix:** `REVOKE INSERT, UPDATE, DELETE` on every table in the `v_money` list from `authenticated` (and `anon`). Change the
"Admins manage …" `FOR ALL` policies to `FOR SELECT`. Delete the `money.write` permission row for both roles. Add the D-Q8
`BEFORE UPDATE OR DELETE` blocking trigger on `transactional_ledger` and its related money tables. Any correction a person
needs becomes an RPC with `require_recent_mfa()`, an idempotency key and `governance_request('ledger_adjustment', …)`.
Add negative tests: finance and owner `INSERT`/`UPDATE`/`DELETE` on each money table must get 42501.

### C-2. `operations` (no money permission) mints payable provider balance through `bookings`

`protect_booking_immutable_fields()` freezes `gift_card_amount` but not `wallet_credit_amount` (nor `package_covered_amount`,
`refund_amount`, `cancellation_fee`, `fee_invoice_id`). `trigger_on_booking_completed_rewards` turns
`NEW.wallet_credit_amount` into a `wallet_credit_settlement` ledger row (`provider_share`, `payout_status='pending'`). Admins
hold direct UPDATE on `bookings` through `operations.write`.

Reproduction (reproduced, rolled back):

```sql
BEGIN;
UPDATE admin_role_assignments SET admin_role='operations' WHERE user_id='00000000-0000-0000-0000-000000000902';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated","aal":"aal2","amr":[{"method":"totp","timestamp":1}]}',true);
SELECT admin_can('money.write');                                        -- f
UPDATE bookings SET wallet_credit_amount = 25000 WHERE status='confirmed';
UPDATE bookings SET status='completed' WHERE status='confirmed';
RESET ROLE;
SELECT entry_type, provider_share, payout_status FROM transactional_ledger WHERE payment_intent_id LIKE 'wallet-settlement:%';
-- wallet_credit_settlement | 25000.00 | pending
ROLLBACK;
```

This breaks D-Q5: "`operations` and `analyst` have no money permissions, server-enforced through RLS and RPC checks". The
owner can do the same alone.

**Fix:** add every money column of `bookings` to `protect_booking_immutable_fields`. That covers `wallet_credit_amount`,
`package_covered_amount`, `refund_amount`, `cancellation_fee`, `fee_invoice_id`, `user_package_id` and
`discounts_released_at`, for every caller except the RPCs that set them under a `primora.*` GUC. Compute the settlement
amount from the actual wallet-credit redemption rows, not from the booking column. Revoke direct INSERT and UPDATE on
`bookings` from `authenticated` for administrators. Status changes already have RPCs (`cancel_booking`, `reschedule_booking`
and others). Add a negative test: operations completing a booking with an edited money column fails.

## High

### H-1. `analyst` (read-only) writes through SECURITY DEFINER RPCs that gate on `is_admin()` helpers

`can_access_provider_wide`, `can_access_provider_operation` and `can_manage_provider_operations` return TRUE for any console
role. Twenty-two definer RPCs write after that check: `adjust_branch_inventory_stock`, `set_inventory_product_cost`,
`transfer_branch_inventory_stock`, `reserve_inventory_stock`, `release_inventory_stock`, `create_supplier_purchase_order`,
`transition_supplier_purchase_order`, `create_walk_in_booking`, `redeem_package_session`, `redeem_membership_visit`,
`void_membership_redemption`, `invite_professional_link`, `end_professional_link`, `save_intake_template`,
`set_service_intake_requirement`, `remove_service_intake_requirement`, `set_provider_intake_enforcement`,
`set_provider_group_settings`, `set_provider_recurring_settings`, `clear_patch_test_block`, `cancel_waitlist_entry`,
`get_provider_chain_operations`. The section 7 regex patch replaced only literal `is_admin()` calls. Restrictive table
policies do not apply because these functions bypass RLS. Filed by the implementer as
`analyst-read-only-not-enforced-through-shared-provider-helpers`; confirmed here with a live call.

```sql
-- analyst, aal2: admin_can('operations.write') = f, can_access_provider_wide(...,'inventory') = t
SELECT set_inventory_product_cost('<product>', 1234.50, 'analyst write test');   -- succeeds
```

The `wathq-verify` Edge Function also accepts any console role (`caller.kind !== "admin"`). It writes the CR verification
through the service client. `dispatch-messages` and `deliver-webhooks` accept any console role too.

**Fix:** split the helpers into read (`is_admin()`) and write (`admin_can('operations.write')`) variants, and call the write
variant in every function above. In `wathq-verify`, add `adminSessionAllows(token, 'operations.write')`. Add a negative test
per RPC for analyst.

### H-2. Self-approval by proxy: an owner creates their own approver in one call, or removes the others to unlock break-glass

`admin_set_console_role` is single-person (owner plus step-up) and takes effect at once. The four-eyes check
(`requested_by <> auth.uid()`) compares user ids only.

Reproduction (reproduced, rolled back):

```sql
-- owner 901, fresh TOTP amr
SELECT admin_set_console_role('<any customer account the owner controls>', 'finance', 'my second account for approvals');  -- changed: true
SELECT admin_set_console_role('00000000-0000-0000-0000-000000000902', 'analyst', 'demote the only other approver');      -- changed: true
```

After the first call, the owner's second login (after enrolling TOTP) approves the owner's payouts, refunds and IBAN changes,
including an IBAN change the owner entered for a colluding provider. After the second call,
`governance_second_approver_exists` is false and break-glass becomes available. This breaks "Self-approval is rejected by
the server, including for `owner`".

**Fix:**
1. A role grant that confers an approver permission (`money.*`, `iban.approve`, `roles.manage`, `break_glass.*`) becomes a
   `governance_request('role_change', …)` that a different owner approves. With a sole owner there is no break-glass for it.
2. A newly granted approver cannot decide any request for 72 hours.
3. Refuse a decision where `admin_role_assignments.assigned_by = requested_by` within 30 days.
4. Refuse break-glass for 7 days after any eligible approver was demoted or removed.

### H-3. Out-of-band notices go to self-editable, unverified contacts, and nothing delivers them

`queue_governance_notice` reads `profiles.email` and `profiles.phone_number`. `authenticated` may UPDATE both columns.
`handle_profile_phone_update` only clears `phone_verified` and does not stop the change, and the notice ignores
verification anyway. An attacker who takes over a provider account sets their own phone and email in `profiles`, then
requests the IBAN change. The "change requested" and "approved" notices go to the attacker. The same applies to an owner
account before break-glass, MFA reset or a role change. D-Q5 requires notice to the provider's previous verified contact,
and Q3 requires old and new channels. No worker reads `governance_notifications`; the implementer filed this as high.

**Fix:**
- Resolve recipients from `auth.users`, using `email` where `email_confirmed_at` is set and `phone` where `phone_confirmed_at`
  is set.
- Snapshot the previous verified contacts into the notice payload when the request is made.
- For IBAN changes, notify both the old and the new contacts.
- Refuse an IBAN change, or extend the hold, when the contact changed in the last 48 hours.
- Ship the delivery worker as part of the same package.

### H-4. `admin_release_ledger_item`: one finance user settles any ledger row with no second person

The function marks a `pending` ledger row `released` (paid outside the payout flow). It runs with step-up, but with no
approval request, no amount threshold, no approved destination and no 48-hour hold. One person can record an off-platform
payout of any size, or wipe a provider's payable balance. D-Q5 requires a different administrator for every payout.

**Fix:** route it through `governance_request('ledger_settlement', 'transactional_ledger', id, provider_share, …)` and
execute it in the approver's session, as `admin_release_payout` does. Allow it only with a bank reference, and refuse it
while the provider's destination is pending or on hold.

## Medium

### M-1. Daily cumulative refund cap can be raced

`refund_needs_approval` sums the caller's refunds today without a lock. Example: an admin with SAR 4,000 already refunded
today sends five concurrent `admin_request_refund(…, 999, …)` calls on different bookings. Each call reads 4,000 + 999 ≤
5,000 and executes, for 8,995 in total.

**Fix:** add `PERFORM pg_advisory_xact_lock(hashtext('refund_daily:' || auth.uid()))` before the sum, in
`admin_create_refund_request` and in the `resolve_booking_dispute` refund branch. Add a concurrency test with two
connections.

### M-2. Revoked or reset sessions keep console power until the access token expires (Q6)

`admin_role()` trusts the `aal` claim and never checks that the session still exists. `admin_reset_mfa` deletes
`auth.sessions`, but an already issued access token (`jwt_expiry = 3600`) stays aal2 for up to an hour. The 30-minute idle
limit is therefore enforced only at refresh. Demotion takes effect at once, but MFA reset, the containment step, does not.

**Fix:** in `admin_role()`, add
`AND EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id = (auth.jwt()->>'session_id')::uuid AND s.user_id = p.id AND (s.not_after IS NULL OR s.not_after > now()))`.
Reduce `jwt_expiry` to 900 or less.

### M-3. Step-up missing on Q6-listed actions

Live check with `prosrc ~ 'require_recent_mfa'` found no step-up in:

| Function | Q6 category |
|---|---|
| `admin_record_export` | export (filed as a gap) |
| `admin_update_data_request` | DSR deletion or export; Q1.7 also requires step-up |
| `admin_save_fee_rule`, `admin_set_promo_code_active`, `admin_save_promo_code` | money configuration |
| `admin_void_sponsored_attribution` | ledger |
| `admin_review_payout_request` | payout |
| `run_daily_psp_reconciliation` | ledger |
| `admin_set_api_setting`, `admin_revoke_api_key` | security settings |

**Fix:** add `PERFORM public.require_recent_mfa();` as the first statement of each, and add a test with a stale amr per
function.

### M-4. Break-glass reviewer and alert acknowledgement are not independent

`admin_sign_off_break_glass` lets the owner who used break-glass record their own "independent" review under any reviewer
name; it only logs `recorded_by_actor`. `admin_acknowledge_security_alert` lets that owner acknowledge their own
`break_glass_used`, `iban_reveal_volume` or `mfa_reset` alert, which removes it from `open_alerts` in the inbox. D-Q5 requires
an independent review.

**Fix:** refuse the sign-off when `auth.uid() = actor_id`. Refuse the acknowledgement when `alert.user_id = auth.uid()` or
`details->>'changed_by'`/`'reset_by'` equals `auth.uid()`.

### M-5. Employee salary IBAN unmasked (`employee_commission_rules.wps_iban`)

`authenticated` has column SELECT on `wps_iban`. Every console role and the provider read it, and `calculate_staff_payroll`
returns it in full. It is personal bank data under the Q3 rationale. Filed as `employee-wps-iban-not-masked`; confirmed.

**Fix:** revoke column SELECT, return `mask_iban(wps_iban)`, and reveal it only through an audited function.

### M-6. MFA factor persistence goes undetected

`max_enrolled_factors = 10` and nothing raises an alert when a factor is enrolled. An attacker in a stolen aal2 session can
add their own TOTP factor and keep access after the password is changed.

**Fix:** set `max_enrolled_factors = 2`. Add an `AFTER INSERT OR UPDATE OF status` trigger on `auth.mfa_factors` for
administrator accounts that writes a `security_alerts` row (new kind `mfa_factor_added`) and queues a notice.

## Low

- **L-1.** `purge_expired_audit_logs` checks `current_user NOT IN ('postgres','supabase_admin')`. Inside SECURITY DEFINER,
  `current_user` is always the owner (`postgres`), so the check is dead. Only the EXECUTE grant (service_role) protects the
  function. Check `auth.jwt()->>'role'` only, or `session_user`.
- **L-2.** `reveal_provider_iban` accepts weak references: any 8 hex characters (`deadbeef…`), or two letters and two digits
  anywhere in the text. There is no hard ceiling after the alert at more than 10 reveals in 24 hours. Consider a hard stop
  at 20 per 24 hours that needs another owner to lift.
- **L-3.** `reveal_provider_iban` also returns the pending, unapproved IBAN. A finance user making a manual transfer could pay
  it. Omit it, or label it "NOT APPROVED – do not pay".
- **L-4.** `require_recent_login` accepts any amr method, including `recovery` and `invite` links. Confirm GoTrue never adds a
  fresh-timestamp amr entry on token refresh in the pinned version; if it does, provider re-authentication is a no-op.

## Verified sound (no finding)

- **aal1 administrators get nothing.** `is_admin()`, `admin_role()` and `admin_can()` all need aal2, and no policy still
  compares `profiles.role = 'admin'` inline (pg_policies scan: none).
- **No SECURITY DEFINER function in `public` lacks `search_path`.** The internal helpers are not executable by `anon` or
  `authenticated`: `governance_request/execute/execution_active`, `gov_*_payout_destination`, `queue_governance_notice`,
  `write_audit_log`, `hook_mfa_verification_attempt`, `purge_expired_audit_logs`.
- **The execution token cannot be forged.** The `executing` state never commits; it is set and cleared in one transaction.
  The token is a fresh UUID compared through a GUC that clients cannot set through PostgREST.
- **Direct self-approval is refused for every kind, and so is an approval on a provider's own IBAN.** The pending-target
  unique index stops duplicate requests.
- **The break-glass cap holds.** It is serialised by an advisory lock and counted globally per Riyadh day
  (`riyadh_day_start` is correct across the UTC boundary). It applies only to payout and refund requests the owner made.
- **Negative refunds are refused.** `admin_request_refund` checks for them, and `create_refund_request_internal` clamps the
  amount and returns NULL when nothing remains.
- **Provider IBANs never reach clients.** `provider_payout_destinations` has no client policy. `payout_requests.iban` has no
  client column privilege. `payout_requests` amount, IBAN and provider are immutable to clients. Clients cannot INSERT
  `payout_requests`. Release requires an active destination past its hold. The audit trigger keeps only the last 4
  characters of IBAN columns. Error messages never echo an IBAN. No view selects an IBAN.
- **The audit log is append-only.** UPDATE, DELETE and TRUNCATE are revoked from every API role including service_role. The
  BEFORE trigger blocks the owner. No public function updates or deletes `admin_audit_logs` except the retention purge.
  Clients cannot INSERT.
- **The lockout hook is correct.** It returns the documented `decision`/`message` shape, locks at 10 failures, rejects valid
  codes while locked and resets on success. `admin_role()` excludes locked accounts, so live sessions are cut off too.
- **The CORS allow-list** on the shared Edge Function helper no longer sends `*`.

## Residual risk outside code (for the owner, not accepted here)

- **Hosted Auth settings** (TOTP, the 12-hour and 30-minute session limits, the MFA hook) are not in the repo for the hosted
  project. The implementer filed this as a high gap.
- **Table-owner tampering:** dashboard or SQL-editor sessions as `postgres` can `ALTER TABLE ... DISABLE TRIGGER`. Mitigation
  is the owner action already listed: pgaudit and named break-glass engineers.
- **No accepted-risk decisions are proposed in this review.** Every finding above needs a fix or a named human approver.
