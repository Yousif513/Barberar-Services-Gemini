# Security review round 2: GOV-2, MONEY, GOV-FIX

- Reviewer: `sec-round2-claude` (adminwright security pass). It is independent of `impl-gov2-claude`, `impl-money-claude` and `impl-govfix-claude`.
- Date: 2026-10-11. Branch `claude-code`. Scope: `d01db64..HEAD` (88c99ae).
  - Migrations `20261010200000` (GOV-2), `20261010300000`–`350000` (MONEY) and `20261010400000`–`450000` (GOV-FIX).
  - Edge Functions `check-refund-status`, `reconcile-psp`, `process-refund`, `wathq-verify`, `dispatch-messages`, `deliver-webhooks` and `_shared/http.ts`.
- Spec: `docs/legal/2026-10-10-adopted-decisions.md` and the "Final decision text" of both memos (Q4, D4, D-Q5, D-Q7, D-Q8, D-Q9, Q6).
- Method: I re-read the migrations. I did not use the worklogs or the diff. I ran live probes against `supabase_db_beauty_grooming_marketplace`, where all 17 in-scope migrations are applied.
  - Every probe ran inside `BEGIN … ROLLBACK` as `authenticated`.
  - Each probe used a forged `request.jwt.claims` with `aal2`, a real `auth.sessions` row inserted in the same transaction (`session_id`) and an `amr` entry.
  - `"password"` in the `amr` means a stale session with no step-up. `"totp"` with the current timestamp means a fresh step-up.
- Test suites: the GOV-1, GOV-2, GOV-FIX and MONEY DB suites pass 155/155, and `test:edge` passes 21/21. None of them covers the findings below.
- Nothing in the code or the manifest was changed. This file is the only write.

## Verdict

GOV-1's money-minting paths are closed. A stolen finance or owner session can no longer write money tables. An operations session can no longer edit booking money. An owner can no longer appoint their own approver.

Several gaps remain:

- **Direct reads.** A stolen session of **any** console role, including read-only `analyst` with no step-up, still reads by direct PostgREST SELECT and with no audit row:
  - provider notes about customers (health-type free text)
  - provider applicants' phone, email and home address
  - customer no-show contests, waitlists, blocks and membership payments
  - staff salaries
  - the full audit log
- **Refunds without approval.** A stolen **operations** session (no money permission) can cancel any confirmed booking. Each cancellation queues a full refund with no step-up, no threshold and no second person.
- **Reconciliation evidence.** A single **finance** user can import invented "Tap" objects that make a reconciliation break auto-close. The same objects permanently shadow the real Tap record when it arrives later.

**Not acceptable for the regulated profile. Release stays blocked on R2-H1..R2-H4.**

Count: **0 critical, 4 high, 8 medium, 7 low.**

## GOV-1 findings: closure check (each reproduction re-run)

| Id | Result | Evidence |
|---|---|---|
| C-1 | **Closed** | Finance with a stale session gets `permission denied` on INSERT/DELETE of `transactional_ledger`, INSERT of `wallet_credits` and UPDATE of `provider_receivables`, `membership_payments` and `subscription_payments`. The owner is refused on `provider_receivables` and `provider_payout_holds`. The `money.write` permission no longer exists. The `guard_money_append_only` trigger is present on the 19 money tables. |
| C-2 | **Closed** | Operations: `UPDATE bookings SET wallet_credit_amount…` → `permission denied for table bookings`. `protect_booking_immutable_fields` freezes every money column. The wallet settlement is computed from `wallet_credit_redemptions`. |
| H-1 | **Closed** | Analyst: `can_access_provider_wide(…,'inventory')` = f. The helpers require `admin_can('operations.write')`. `wathq-verify`, `dispatch-messages` and `deliver-webhooks` call `adminSessionAllows(token, permission)`. |
| H-2 | **Closed** | `admin_set_console_role(<customer>, 'finance', …)` becomes a `role_change` request. Removing the only other approver writes `admin_role_history`. `admin_break_glass_execute` then refuses: "break-glass is closed until …". The 72-hour cooling-off and the 30-day assigner rule are enforced in `admin_decide_approval`. |
| H-3 | **Partially closed (still high: R2-H4)** | Recipients come from `auth.users` verified contacts, are snapshotted, and include the old and new channels. IBAN changes pause for 48 hours after a contact change. **Nothing delivers `governance_notifications`**, which was part of the fix ("Ship the delivery worker as part of the same package"). |
| H-4 | **Closed** | `admin_release_ledger_item` creates a `ledger_settlement` request. It needs a bank reference, an active account past its hold and no payout hold, and it is re-checked in the approver's session. |
| M-1 | **Closed** | `refund_needs_approval` takes `pg_advisory_xact_lock('primora.refund_daily:'||uid)`. |
| M-2 | **Closed** | `admin_role()` requires `session_is_live()`, and `jwt_expiry = 900`. With the session row deleted, `is_admin()` = f. |
| M-3 | **Closed in the DB** | All ten named commands contain `require_recent_mfa`. `admin_record_export` is revoked from clients. One service-key path bypasses step-up: see R2-L1. |
| M-4 | **Closed** | Self sign-off and self-acknowledgement are refused (`security_alert_involves_caller`). |
| M-5 | **Closed** | `wps_iban` has no client SELECT. `wps_iban_masked` is a generated column. The audited reveal works. No other function returns `wps_iban`. |
| M-6 | **Closed locally** | `trg_alert_admin_mfa_factor_added` is on `auth.mfa_factors`, and `max_enrolled_factors = 2`. The hosted setting is still gap `hosted-auth-settings-must-match-gov1`. |
| L-1..L-4 | **Closed** | `session_user` check, reference rules plus a 20/24 h ceiling, pending account masked, credential-only `amr`. |

The manifest gap `admin-can-still-rewrite-money-tables-directly` (high, blocked) is stale. C-1 is fixed, so the security owner should close it.

---

## High

### R2-H1. Every console role reads personal, bank-adjacent and money tables directly, with no audit (Q4)

GOV-2 put restrictive "read only through audited functions" policies on 43 tables. These tables still carry a permissive `is_admin()` read branch and no restrictive policy, so `analyst`, `finance` and `operations` read them by plain PostgREST SELECT. A stale session is enough, and no audit row is written:

| Table | What leaks | Policy giving the admin branch |
|---|---|---|
| `provider_customer_notes` | Provider's free-text notes per customer (health-type content in practice) | "Providers manage own customer notes" (`… OR is_admin()`) |
| `provider_applications` | Applicant `contact_email`, `contact_phone`, `address_text`, lat/long, CR, tax number | "Admins read all provider applications" |
| `agreement_acceptances` | Every user's `ip_address` and `user_agent` | "Admins read all agreement acceptances" |
| `no_show_contests` | `customer_id` plus the customer's written reason | "Customers read their own no-show contests" (`OR is_admin()`) |
| `waitlists` | `customer_id`, preferred dates and times | "Customers view own waitlist entries" (admin branch) |
| `provider_customer_blocks` | `customer_id` plus the block reason | "Providers view own blocked customers" (admin branch) |
| `membership_payments`, `subscription_payments` | Payments: `customer_id`, amount, `payment_intent_id` | `… OR is_admin()` |
| `provider_receivables`, `provider_payout_holds`, `reward_reversals` | Ledger-class money rows (D-Q5: analyst and operations hold no money permission) | `is_admin()` |
| `employee_commission_rules` | Base salary and commission rate per employee | "Administrators read employee commission rules" |
| `employee_time_off` | Absence reason (may be medical) | "Employees request own time off and owners manage" (admin branch) |
| `admin_audit_logs` | Every read and write event, with reasons, customer ids and IPs | "Admins read audit logs" (already gap `audit-log-read-directly-by-every-console-role`) |

The audited function `admin_list_provider_applications` refuses analyst ("console_role_forbidden"), but the table hands analyst the same columns directly. Reproduction (reproduced, rolled back):

```sql
-- seed one note and one application as postgres, then:
UPDATE admin_role_assignments SET admin_role='analyst' WHERE user_id='…0902';
SET LOCAL ROLE authenticated;  -- aal2, live session row, amr password (no step-up)
SELECT admin_can('personal.read');                       -- f
SELECT notes FROM provider_customer_notes;               -- 'Allergic to henna; pregnant - avoid chemicals'
SELECT contact_email, contact_phone, address_text FROM provider_applications;  -- applicant@…, +9665…, Home street 1
SELECT admin_list_provider_applications(NULL,10,0,NULL); -- ERROR console_role_forbidden
```

**Fix:**

1. Add the GOV-2 restrictive policy to every table above. Use `AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT (SELECT public.is_admin()) OR <own-row predicate>)`, with own rows as `user_id/customer_id = auth.uid()` or `FALSE`.
2. Drop the `is_admin()` branches from the permissive policies, using `DROP POLICY IF EXISTS` then `CREATE POLICY`.
3. Serve the screens that need these tables through `gov2_require_read` and `gov2_log_read` functions:
   - `personal.read` for notes, contests, waitlists, blocks, applications and acceptances
   - `money.ledger` for receivables, holds, reversals and membership or subscription payments
   - `personal.read` plus `money.ledger` for salary
   - the audit log through an audited, paged `admin_list_audit_events`
4. Add a CI check that fails when any `public` table with an `is_admin()` permissive SELECT branch lacks the restrictive console policy, unless it is on an allow-list of catalogue and config tables.
5. Add negative tests: analyst and finance SELECT on each table returns 0 rows.

### R2-H2. `operations` (no money permission) issues unbounded refunds through `cancel_booking` (D-Q5)

`cancel_booking` treats `admin_can('operations.write')` as actor `admin`. It refunds the full captured amount (no late fee) through `create_refund_request_internal`. That path has no `refund_needs_approval`, no step-up and no daily cumulative cap. The scheduler (`process-refund`, `processPending`) then sends the refund to Tap.

Operations can do this for every confirmed booking. Waiving late fees, or refunding a service the colluding customer actually received before staff marked it complete, costs the provider and the platform real money. The row is labelled `provider_cancellation`, which hides the console origin from finance.

Reproduction (reproduced, rolled back):

```sql
-- confirmed seed booking with SAR 4,500 captured; operations, stale session (amr password)
SELECT admin_role(), admin_can('money.refund');  -- operations | f
SELECT (cancel_booking('b0000000-…0001','ops')).status;  -- cancelled
SELECT amount, status, source FROM refund_requests WHERE booking_id='b0000000-…0001';
-- 4500.00 | pending | provider_cancellation        (no admin_approval_requests row)
```

**Fix:**

1. Give the console cancellation its own command, `admin_cancel_booking`. It requires `require_recent_mfa()` and a reason of at least 10 characters. When the booking has captured money, it requires `money.refund` or routes the refund through `refund_needs_approval` and `governance_request('refund', …)`, exactly like `admin_create_refund_request`.
2. In `cancel_booking`, stop treating a console session as `admin` (keep `service_role`).
3. Record `source = 'admin_cancellation'` and the actor.
4. Add a negative test: operations cancelling a captured booking creates no refund without an approved request. A SAR 1,000+ refund needs a different person, and the 5,000/day cumulative cap applies.

### R2-H3. One finance user forges "Tap" evidence: breaks auto-close, and real Tap data is shadowed (D-Q9)

`admin_import_reconciliation_file('tap_settlement_file', …)` accepts `charge` and `refund` objects, not only settlements. Their amount and status are typed by the finance user and stored with the same weight as the Tap API import.

`run_tap_reconciliation` then auto-closes any charge or refund break the new rows "match". That closure needs no approval, no maker-checker and no Tap object from the API.

`tap_reconciliation_events` is unique on `(object_type, tap_object_id)` with `ON CONFLICT DO NOTHING`. A forged row inserted before the API import therefore makes the **authoritative Tap record get silently dropped**.

Bank-statement lines (`bank_credit`) are typed in the same way, so a missing or short settlement can be hidden before the first run. This breaks D-Q9: "Tap is authoritative", and "breaks are resolved only by approved adjustments".

Reproduction (reproduced, rolled back):

```sql
-- yesterday: ledger row chg_unbacked_1 (SAR 5,000, provider_share 4,500 pending); Tap API import without it
-- service run → break ledger_missing_at_tap / chg_unbacked_1 = open
-- finance alone, fresh TOTP:
SELECT admin_import_reconciliation_file('tap_settlement_file', <yesterday>,
  '[{"object_type":"charge","tap_object_id":"chg_unbacked_1","amount":"5000.00","currency":"SAR","status":"CAPTURED"},
    {"object_type":"charge","tap_object_id":"chg_future_real","amount":"1.00","currency":"SAR","status":"CAPTURED"}]',
  'monthly settlement file from Tap portal');
SELECT run_tap_reconciliation(<yesterday>);
-- ledger_missing_at_tap | chg_unbacked_1 | auto_matched   (no approval_request_id)
-- later service import of the real chg_future_real (SAR 900): {"new": 0}; stored row stays 1.00 from tap_settlement_file
```

**Fix:**

1. A console file import may carry only `settlement` objects (Tap settlement file) and `bank_credit` lines (bank statement). Reject `charge` and `refund` from any source except `tap_api`.
2. Make the import a maker-checker `reconciliation_import` request that a different `money.ledger` holder approves. Store the file's SHA-256 with the import.
3. Auto-match only on events whose import source is `tap_api`. A break matched by file evidence stays open until an approved correction resolves it.
4. On a `(object_type, tap_object_id)` conflict with different `amount` or `status`, do not drop the row. Record the API version and open a `evidence_conflict` break, or key the uniqueness on `(source, object_type, tap_object_id)`.
5. Add negative tests for each step above.

### R2-H4. Out-of-band governance notices are still never sent (H-3 remainder)

`governance_notifications` rows are queued with a verified destination, but no worker, Edge Function or cron reads them. The provider is never told that their bank account changed, an owner is never told that break-glass was used, and an administrator is never told that an MFA factor was added. D-Q5 and Q3 require the notice. The 48-hour hold only works as a control if someone hears about it. Tracked as gap `governance-notifications-have-no-delivery-worker` (high); it is confirmed open here.

**Fix:** ship the sender (Edge Function on a schedule, service key, provider credentials as an owner decision). It must mark `sent_at`/`status`/`error_message` and retry with backoff, and an IBAN change must not leave `pending` hold before its notice reached `sent`. Add a test that a queued `iban_change_requested` notice blocks release until delivered or explicitly waived by a second person.

---

## Medium

### R2-M1. `get_provider_private_profile` bypasses the GOV-FIX `personal.read` rule

GOV-FIX restricted `admin_provider_private_directory` to `personal.read`. The single-provider function returns the same columns to any `is_admin()`:

- `contact_phone` and `contact_email` (the owner's personal contact)
- CR and VAT numbers
- `cr_wathq_data` and `admin_notes`

Reproduced as analyst with a stale session: it returned `lumi@primora.local` and `+966500000222`. It writes an audit row, but with no purpose, no fields and no permission scope.

**Fix:** call `gov2_require_read(ARRAY['personal.read'], …)` and `gov2_log_read` in the admin branch. Add an analyst negative test.

### R2-M2. Staff pay is readable by every console role and is not logged

`calculate_staff_payroll` is gated only by `is_admin()`. Analyst got, for any provider:

- base salary, commission rate, commission earned and tips
- total payout per named employee

Nothing was logged. `admin_list_employees` deliberately hides earnings without `money.ledger`, so this contradicts it. Related to R2-H1 for `employee_commission_rules`.

**Fix:** for console sessions, require `money.ledger` (plus `personal.read`), require a purpose and call `gov2_log_read` with the employee ids.

### R2-M3. D4 is not applied to `admin_branch_performance_report`

GOV-FIX added `admin_branch_performance_report` with the comment "counts of 1 to 4 people are suppressed (D4)". The code returns `SELECT * FROM admin_branch_performance` as definer. That means:

- every row and every figure: bookings, cancellations, no-shows, gross revenue, commission and revenue_30d
- no suppression and no audit
- available to any console role

Analyst saw branch cells with `total_bookings` 1 and 2.

**Fix:**

- Null each count and money figure whose distinct-customer count is 1–4, and return a `suppressed` flag (`d4_is_small_cell`).
- Or log the read as a single-entity view.
- Add a test with a 1-customer branch.

### R2-M4. A reconciliation break closes with any approved correction, of any size, without its Tap object

`admin_propose_ledger_adjustment` accepts `p_break_id` directly. It does not check that the break exists or is open, that the reason is `reconciliation_break`, that `tap_object_id` matches the break, or that the correction relates to `difference`. `gov_exec_ledger_adjustment` then marks the break `resolved`.

Reproduced (rolled back): a SAR 50,000 `ledger_missing_at_tap` break was resolved by a SAR 0.01 platform-share adjustment with reason `posting_error`, justified as "rounding correction". The approval came from a second administrator. The SAR 45,000 provider share stayed payable.

**Fix:**

1. Accept `p_break_id` only through `admin_propose_break_resolution`, and refuse it in the generic command.
2. Require reason `reconciliation_break` and `tap_object_id = break.tap_object_id`.
3. Require the correction to equal the break's difference, or record `partial` and keep the break open until the cumulative corrections equal it.
4. Show the break's difference next to the correction in the approval summary.

### R2-M5. Payouts ignore open reconciliation breaks

No payout path reads `reconciliation_breaks`: `request_provider_payout`, `admin_release_payout` and `admin_release_ledger_item`. A ledger row that Tap never captured (`ledger_missing_at_tap`) stays `pending`, can be allocated to a payout and can be approved. D-Q9 makes Tap authoritative for money movement.

**Fix:** exclude from payout allocation, and refuse release for, any ledger row with an open or escalated break of kind `ledger_missing_at_tap`, `charge_amount_mismatch` or `refund_*`. Show the held amount to finance.

### R2-M6. The two highest-volume personal reads still log no target ids, fields or purpose (Q4 item 5)

GOV-2 only re-gated `admin_customer_overview` (customer names, email, phone, spend) and `admin_booking_directory`. Their audit rows still carry `{searched, limit, offset, rows}`: no `target_ids`, no `fields` and no `purpose`. A page-by-page dump of every customer leaves no record of whose data was read.

**Fix:** switch both to `gov2_read_purpose` plus `gov2_log_read(…, v_ids, fields, purpose, filter, rows)`. Log the search text's hash, not the text.

### R2-M7. Customer home addresses go to any console role (`get_booking_address_secure`)

Any `is_admin()` session gets the street address and coordinates of every confirmed or completed home-service booking. This includes analyst and finance, which have no `personal.read`. It is logged (`booking.home_address_viewed`), but with no purpose and no permission scope.

**Fix:** in the admin branch, require `personal.read`, require a purpose and call `gov2_log_read`. Add an analyst negative test.

### R2-M8. The audit log is directly readable by every console role

This confirms the existing gap `audit-log-read-directly-by-every-console-role`.

- `details` carries customer ids (intake break-glass), free-text reasons and IP addresses.
- Analyst reads all of it with no record.
- The bulk-write cap in `audit_admin_write` stops itemising after 5 rows per transaction.

**Fix:** as in R2-H1 item 3, plus a restrictive policy.

---

## Low

### R2-L1. `reconcile-psp` runs step-up-protected RPCs through the service key

`reconcile-psp` accepts an admin holding `money.ledger`, then calls the following with `serviceClient()`:

- `run_daily_psp_reconciliation`
- `record_tap_reconciliation_import`
- `run_tap_reconciliation`

`require_recent_mfa()` returns early for `service_role`, so a stale session runs them, and `ran_by` and `actor` are NULL.

**Fix:** have the function call `admin_begin_*` with the caller's token first (as `check-refund-status` does), and pass the actor id into the service RPCs.

### R2-L2. `reveal_employee_wps_iban` has no ceiling or volume alert

The provider IBAN reveal stops at 20 per 24 hours and alerts above 10. Staff salary IBANs have neither, so finance can reveal every staff account. **Fix:** share the same counter and ceiling.

### R2-L3. Reward edge cases

- `reward_capacity_sar` and `reward_vest_referral` take no lock, so concurrent completions can pass the per-customer cap and the programme budget.
- Loyalty points are not reversed when a completed booking is later refunded.
- Referral reversal fires only on `refund_requests.status → succeeded`, not on a Tap chargeback.
- `apply_referral_code` checks "new customers" against `confirmed` and `completed` only, so a customer with a `pending_payment` booking can enrol.

All of this is disabled until `rewards-counsel-and-tax-before-enablement` clears.

**Fix:**

- `pg_advisory_xact_lock(hashtext('reward:'||program))` before the capacity check.
- A loyalty reversal on refund.
- A chargeback hook.
- Count every non-cancelled booking in the new-customer check.

### R2-L4. Audit target lists are cut at 500 ids

`gov2_log_read` stores `target_ids[1:500]`. Two functions return unbounded row sets: `admin_employee_performance_report` (all employees) and `admin_provider_private_directory` (all providers). Beyond 500 rows, the audit no longer says whose data was read. **Fix:** page both, with a maximum of 500.

### R2-L5. `provider_payout_destination_summary` returns bank details to any console role

It returns the bank name and account-holder name (personal data) to any console role, with no log. **Fix:** `money.payout` or `money.ledger`, plus `gov2_log_read`.

### R2-L6. Break-glass by a sole money approver closes reconciliation breaks

When no second `money.ledger` holder exists, an owner can resolve a break through a break-glass `ledger_adjustment` within the SAR 10,000 cap. This matches D-Q8 break-glass, but D-Q9 says "approved adjustments". **Owner decision:** confirm in `decisions[]` or exclude break-resolving adjustments from break-glass.

### R2-L7. The sponsored price changes in one step

`sponsored.price_per_new_client_sar` changes through `admin_update_platform_setting` with one owner, no step-up and no notice. Providers are protected by `accepted_price_sar`, which applies a LEAST cap, but campaigns with a NULL accepted price are not. **Fix:** step-up, plus `setting_change` approval for this key.

---

## Verified sound in this round (no finding)

- **No direct client writes to money tables.** Every money table refuses INSERT, UPDATE and DELETE from `authenticated`. Column-level grants are removed too. `service_role` keeps no DELETE or TRUNCATE.
- **The ledger trigger.**
  - It refuses changes to the frozen identity and amount columns.
  - It refuses deletes.
  - Outside the four system paths it refuses all writes. Inside them it refuses any growth of the share sum.
  - `primora.ledger_system_write` can only be set inside definer functions. No public function runs dynamic SQL from user input, except `governance_execute`, which is constrained by the kind CHECK.
- **Adjustments.**
  - Self-approval is refused.
  - Replaying an idempotency key returns `already_applied`, or the existing pending request with its original amount, and never re-executes. Unique `payment_intent_id = 'adj:'||key`.
  - Reversal of a correction is refused, and a double reversal is refused.
  - `transactional_ledger_correction_complete` enforces maker ≠ checker unless break-glass.
- **Fee rules.**
  - A version never changes.
  - A start date before now is refused.
  - An increase needs 30 days from approval, re-checked at execution.
  - Supersession is checked (`supersedes_id`).
  - Bookings snapshot the rule they were priced with.
- **Referral and loyalty.**
  - Enabling needs every value, published terms, `rewards.approve` (owner) and a different person.
  - Break-glass is refused.
  - `platform_settings` keys are guarded by a trigger.
  - Self-referral is refused, and one referral per referee is allowed.
- **Payout holds.** Two people are required (CHECK `requested_by <> approved_by`), and both release paths refuse a held provider.
- **Health answers.**
  - `intake_is_serving_staff` excludes console sessions.
  - The only console path is `read_intake_answers_break_glass`: owner, step-up, reason of at least 20 characters, alert and notice.
- **Views.** All 11 public views have `security_invoker=true`, and `anon` holds no INSERT, UPDATE or DELETE grant in `public`.
- **SECURITY DEFINER functions.** Every one has a `search_path`. The internal helpers (`gov_exec_*`, `gov2_*`, `reconciliation_*`, `queue_governance_notice` and others) are not executable by clients.
- **`check-refund-status` Edge Function.**
  - It verifies the caller (`getUser`) and checks `money.refund`.
  - It runs `admin_begin_tap_refund_check` with the caller's token (step-up, due check).
  - It reads `TAP_SECRET_KEY` from the environment only.
  - Its CORS comes from the allow-list.
  - The service RPC re-checks the refund id and the actor's permission.
- **The `admin_approval_requests.payload` column** is not client-readable, and the IBAN-change payload holds no IBAN.

## Accepted risks proposed

None. Every finding above needs a fix, or a decision with a named human approver. R2-L6 is explicitly an owner decision.
