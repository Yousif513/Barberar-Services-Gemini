# Security and privacy review: PRIV package (2026-10-11)

Reviewer: `sec-priv-claude` (independent; did not implement any of the reviewed code). Branch `claude-code`, commits `37596e8..3015cc8`.
Read fresh: migrations `20261011200000` to `20261011240000`, Edge Functions `privacy-export`, `privacy-export-download`,
`privacy-erase-account`, `_shared/http.ts`, `_shared/console-permission.ts`, `_shared/privacy-erasure.ts`, the customer and admin
privacy screens' data calls, and live function definitions in the local database. Spec: Q1, Q2, X1, X2, X3 "Final decision text" in
`docs/legal/2026-10-10-privacy-decision-memo.md`.

Probes ran against `supabase_db_beauty_grooming_marketplace` inside `BEGIN … ROLLBACK`. Each probe impersonated a user with
`SET LOCAL role authenticated` and `request.jwt.claims` (aal, amr, session_id); the session row was inserted inside the same
rolled-back transaction. Nothing was committed.

## Counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 7 |
| Low | 6 |

## What holds

- Request IDOR is closed. Every customer RPC filters on `subject_id = auth.uid()`. `privacy_export_authorize_download` checks the subject, the
  `built` status and the 7-day expiry, and returns a path stored by the server. The function then reads with the service key, so no
  signed URL exists that could be reused.
- In-app submission and confirmation of a staff-logged request both require a sign-in by one-time code within the last 10 minutes
  (`privacy_require_contact_otp`). `admin_privacy_propose_execution` refuses a request in `awaiting_verification`.
- Maker-checker for copy, deletion and legal hold: `admin_decide_approval` refuses `requested_by = auth.uid()` and requires step-up to
  approve. The proposer also steps up. None of the privacy approval kinds can use break-glass.
- Health answers can be read only through `read_booking_intake_answers` (the assigned professional, or the owner when the professional
  has no account), the customer themselves, or the audited DPO break-glass. Console sessions are excluded by RLS. Erasure destroys
  answers even when other records are held.
- No `anon` grants exist on any PRIV table or function. All new tables revoke `authenticated` access. The Edge Functions use an origin
  allowlist (no `*`), resolve the caller with `auth.getUser`, and require `privacy.approve` in an aal2 console session or the service key.
- The incident register is reachable only through `incident.manage` functions. The evidence bucket is private, with INSERT and SELECT
  policies only, so evidence cannot be overwritten or deleted.

## Critical

### C1. One owner can erase any account, including another administrator, with no request, no approval and no identity check

`privacy_reapply_deletion_ledger(p_entries)` (220000:661) is granted to `authenticated`. A console caller needs only
`require_recent_mfa()` and `privacy.approve`. The function inserts any `subject_id` from `p_entries` into `deletion_ledger` with
`auth_deleted_at = erased_at`, then runs `privacy_erase_subject_internal` on it. The engine deletes the profile, which cascades to role
assignments, consents and tokens. It does not check that the subject is a customer, that a verified request exists, or that a second
person approved. Because `auth_deleted_at` is set, `privacy_auth_erasures_due().restored` then lists the subject, and the next run of
`privacy-erase-account` (scheduler, or the button on `/admin/privacy`) deletes the auth user through the Admin API.

This bypasses Q1.2 (identity verification), Q1.7 (four eyes and step-up on both sides) and the non-customer guard in
`privacy_request_options`. A stolen owner session, or a malicious owner, can destroy any customer, staff member or co-owner and make it
look like a routine ledger re-application.

Reproduction (rolled back). Owner `…0901` at aal2 with a fresh `totp` amr:
```sql
SELECT public.privacy_reapply_deletion_ledger('[{"subject_id":"00000000-0000-0000-0000-000000000001"},
                                               {"subject_id":"00000000-0000-0000-0000-000000000902"}]'::jsonb);
-- {"reapplied": 2, "added_from_archive": 2, "auth_accounts_to_delete": ["…0001", "…0902"]}
-- profiles for the customer …0001 and the finance admin …0902: 0 rows; privacy_auth_erasures_due().restored lists both.
```

Fix:
1. Remove `p_entries` from the RPC that `authenticated` can call. Restoring archive entries must be a service-role-only path, for
   example a `privacy_import_deletion_archive(p_entries, p_archive_sha256)` granted only to `service_role`.
2. If archive import has to stay in the console, make it an approval kind (`privacy_ledger_import`) decided by a second
   `privacy.approve` holder. Accept an entry only when `privacy_requests` already holds a completed deletion for that `subject_id`, and
   check the archive's digest against `admin_privacy_export_deletion_ledger` output.
3. In `privacy_erase_subject_internal`, refuse any subject whose profile `role <> 'customer'` (`RAISE … 42501`).
4. Insert archive entries with `auth_deleted_at = NULL`. Change the `restored` set to require a matching completed deletion request.
5. Add a negative test: an owner calling the RPC with `p_entries` is refused, and a non-customer subject is refused.

## High

### H1. After a court hold is released, the auth account (e-mail, phone, password, MFA factors) is never deleted

When a court hold exists, `gov_exec_privacy_deletion` calls `privacy_finish_deletion` at once. The request becomes `completed` and the
ledger keeps `account_held = true, auth_deleted_at = NULL`. When `privacy_release_hold_internal` later runs the engine in
`hold_release` mode, the profile is deleted. However, `privacy_auth_erasures_due` lists only `requests` with
`execution_state = 'erased_awaiting_auth'` (the request is already completed) and `restored` entries with `auth_deleted_at IS NOT NULL`
(it is NULL). The auth user is therefore never deleted, and the person can still sign in to an account with no profile. Q2.1 is not met.

Reproduction (rolled back): an active `court_case` hold `['reviews']` on customer `55c5…`, then `privacy_erase_subject_internal`, then
`privacy_release_hold_internal`. Result: profile 0 rows, `auth.users` 1 row, ledger `account_held=f, auth_deleted_at=NULL`,
`privacy_auth_erasures_due() = {"requests": [], "restored": []}`.

Fix: in `privacy_auth_erasures_due`, add a set `held_released` for ledger rows where `NOT account_held AND auth_deleted_at IS NULL`, no
profile exists and the auth user exists. Have `privacy-erase-account` delete those accounts and call `privacy_record_auth_erasure(NULL, subject)`.
Send the completion notice again with the final summary. Add a DB test for the sequence hold, erase, release, auth due.

### H2. Any court hold, whatever its categories, keeps the whole account

`v_account_held := cardinality(v_court) > 0` (220000:361). A hold scoped to `['reviews']` still keeps the profile (name, e-mail, phone,
gender), favourites, device tokens, notifications, consents and the auth account. Q2.5 requires that "all other categories are deleted
on schedule". The probe above shows the profile surviving a reviews-only hold. Because a hold can be renewed every 90 days by one
`privacy.approve` holder, a narrow hold can block deletion of the whole account indefinitely.

Fix: `v_account_held := 'account' = ANY (v_court)`. When `account` is not held, delete the profile. Keep only the held categories,
re-linked to a hold-scoped pseudonym the same way dispute holds already do. Add a test that a `['reviews']` hold deletes the profile.

### H3. Contact details and the booking link survive erasure, so the "pseudonymised" bookings can be re-identified

After a full erasure the following remain:
- `governance_notifications` (no FK) keeps `recipient_user_id`, `destination` (verified e-mail or phone) and `payload` for every
  notice sent to the customer, including the privacy notices and the deletion completion notice. Probe: after erasing
  `44444444-…`, one row with a destination remained.
- `message_queue` and `message_log` keep `recipient_phone`, `variables` or `message_body`, and `booking_id`. The FK is
  `ON DELETE SET NULL` on `recipient_id` only, so a phone number points straight at a pseudonymised booking.
- `account_contact_changes` (no FK) keeps `user_id` and `old_value` (previous e-mails and phones).

Q2.1 (delete contact details) and Q2.3 ("null every other customer field"; the token must be irreversible) are not met.

Fix: in `privacy_erase_subject_internal`, do the following:
- Delete `account_contact_changes WHERE user_id = p_subject`.
- Null `destination` and `payload` on sent or failed `governance_notifications` for the subject. Keep the completion notice row only
  until it is sent, then null it in the sender.
- For `message_queue` and `message_log` rows whose `recipient_id = p_subject` or whose `booking_id` belongs to the subject, null
  `recipient_phone`, `variables` and `message_body` (or delete the rows that are not retained cost records).
- Add a DB test that searches every `public` table for the subject's e-mail, phone and uuid after erasure.

## Medium

M1. **Downloading the copy needs only a session, not a fresh one-time code.** `privacy_export_authorize_download` checks only `auth.uid()`.
A stolen or replayed refresh token can download the whole package, including health answers, for 7 days. Submission needs an OTP
sign-in, but the release of the data does not. Fix: call `privacy_require_contact_otp()` (10-minute window) in
`privacy_export_authorize_download`, and cap downloads (for example 5 per file).

M2. **The one-time code proves control of the contact the account has now, not the contact it had when the request was made.** A session
thief can change the phone number (an OTP to the new number) and then sign in by code. That passes `privacy_require_contact_otp` and
lets them request a copy or a deletion. Fix: in `privacy_require_contact_otp`, refuse when
`account_contact_changes` shows a change in the last 30 days. Send every privacy request notice to the previous contacts as well
(`queue_governance_notice` already includes them for 30 days, so make the refusal explicit). Stop treating the local
`[auth.sms] enable_confirmations = false` as proof of verification: with it, phone sign-ups are auto-confirmed.

M3. **Money sub-records are destroyed by cascade, against Q2.4.** Profile deletion cascades to `booking_tips`, `wallet_credits`,
`wallet_credit_redemptions`, `coupon_redemptions`, `gift_card_redemptions`, `package_redemptions` and `customer_loyalty`. Each is
`ON DELETE CASCADE` to `profiles` (checked with a `pg_constraint` query). These are payment records that the memo retains for 10 years.
Fix: change these FKs to `ON DELETE SET NULL`, add `pseudonym_token`, and pseudonymise them in the engine as is already done for
`memberships` and `user_packages`.

M4. **Health retention gaps.**
- (a) `intake_purge_internal` purges only bookings in `completed`, `cancelled` or `no_show`. Answers on a `pending_payment` booking, or
  on a `confirmed` booking that nobody closed, are kept forever. Fix: also purge when `scheduled_at + duration < now() - 30 days`,
  whatever the status.
- (b) `patch_test_results` are destroyed on erasure (the engine treats them as health data), but they are never purged by retention.
  They are readable by every provider member through `can_read_patch_test_row`, not only the assigned provider. Fix: apply the
  30-day rule and the assigned-provider read rule to them, or record a decision that they are not health data.
- (c) The purge is not scheduled (gap `privacy-jobs-not-scheduled`), so in practice nothing expires.

M5. **The pseudonym token is stored next to the subject id.** `privacy_legal_holds` keeps `subject_id` and `pseudonym_token` on every
dispute hold forever, including after release. That one token is shared by all of the subject's retained bookings, memberships,
packages, gift cards and disputes, so the "random irreversible token" can be reversed with one join for 10 years. Fix: on release, set
`pseudonym_token = NULL` and `subject_id` to a hash or NULL on the hold. Use a separate token per retained row, or per hold, instead of
one per subject.

M6. **Erasure leaves other privacy records of the subject behind.** The following are not touched:
- an open correction's `privacy_requests.correction_value` and `privacy_field_restrictions.held_value` (both names);
- other open requests, which stay open against a deleted account;
- built export files in `privacy-exports`, which stay up to 7 days and contain everything, including health answers.

Fix: in `gov_exec_privacy_deletion`, close the subject's other open requests (`withdrawn`, with the reason "superseded by deletion"),
delete `privacy_field_restrictions`, null `correction_value` and `details`, mark exports `expired`, and return their paths so
`privacy-erase-account` removes the files.

M7. **WhatsApp threads are erased only for the verified phone at deletion time** (`notice_contacts->>'sms'`). Threads under an earlier
number (`account_contact_changes`), or under an unverified WhatsApp number, stay. Fix: pass every phone the account has held into the
hash set before `account_contact_changes` is deleted (H3), and record the count in the completion summary.

## Low

- L1. The `multiple_requests` extension is satisfied by any other request in the last 12 months, including an unverified request that
  staff logged themselves. The extension needs no step-up. The `repetitive` refusal code needs no earlier request at all. Fix: count
  only verified requests that the customer made or confirmed, require step-up on both actions, and require an earlier completed
  request for `repetitive`.
- L2. `privacy_redact_text` removes only ASCII-digit phone numbers and ASCII e-mails. Arabic-Indic digits (٠-٩, ۰-۹) and names in
  provider messages reach the export (Q1.5 says the other party's data must be redacted). Fix: add `[0-9٠-٩۰-۹]` to the pattern, and redact
  the provider's staff first names, taken from `employees`, in received messages.
- L3. `gov_exec_privacy_deletion` does not check again that the subject is still a customer when the deletion runs. A role change
  between proposal and approval lets the engine delete a provider owner or staff profile. This is blocked only by RESTRICT FKs that
  some accounts do not have. The fix is C1.3.
- L4. `privacy_incident_events` has no append-only trigger, while `privacy_request_events` does, and it is `ON DELETE CASCADE`. The
  header comment of `admin_incident_update` says "aware_at can be corrected once with a reason", but no such path exists, so a wrong
  `aware_at` cannot be fixed and the 72-hour clock stays wrong. Register access is owner only (gap `dpo-role-not-defined`).
- L5. `privacy_withdraw_request` and `privacy_set_review_choice` need no fresh code. A stolen session can quietly withdraw the victim's
  deletion request. Fix: require `privacy_require_contact_otp()` on withdrawal.
- L6. `_shared/http.ts` ships `http://localhost:3000` in the production CORS allowlist for service-role functions. Move it behind
  `APP_ORIGIN` for local runs only.

## Areas checked with no finding

- Grants on every `privacy_*` table and function.
- The `primora.privacy_erasure_run` flag: it needs a `privacy_erasure_runs` row with this transaction's `txid`, which clients cannot
  insert.
- `primora.governance_token`: a random token matched to a row in `executing`.
- Export path checks in `privacy_export_record_built`.
- Hold release by the scheduler (service role or `privacy.approve`).
- Incident evidence storage policies.
- Edge Function caller resolution and service key handling.
- Admin aal2 enforcement through `admin_role()`.
