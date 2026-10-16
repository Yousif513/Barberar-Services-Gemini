# Security re-check: PRIVFIX against the PRIV review (2026-10-11)

Reviewer: `sec-priv2-claude`. This is an independent re-review. I did not implement any of the reviewed code. Branch `claude-code` at `6b81ce9`.
Fix commits reviewed: `adf6456`, `f25b939`, `c19a343`, `411539e`, `e2b30af` and `6b81ce9`, with migrations `20261011300000` to `20261011340000`,
`privacy-erase-account`, `_shared/privacy-erasure.ts`, `_shared/http.ts` and `expire-holds`. I read the files fresh and checked the live
function definitions in `supabase_db_beauty_grooming_marketplace`, where `20261011300000` to `20261011340000` are applied.

Method:
- Every database probe ran inside `BEGIN … ROLLBACK`. Nothing was committed.
- Callers were impersonated with `SET LOCAL ROLE authenticated` plus `request.jwt.claims` (sub, session_id, aal, amr). The
  `auth.sessions` row was inserted inside the same transaction.
- `node --test priv_privacy.test.mjs money_append_only.test.mjs intake.test.mjs` ran on in-memory PGlite: 84 of 84 passed.

Note: the working tree has another agent's uncommitted `20261011400000_uxfix_console_ux_server_support.sql`. Its function bodies are
already present in the local database. This review does not cover them, except as noted under "UX-routed issue".

## Verdict on the original 17 findings

15 are closed. 2 are not fully closed (M3 and M5).

| ID | Status | Evidence |
|---|---|---|
| C1 | Closed | `privacy_reapply_deletion_ledger(jsonb)` no longer exists. `privacy_import_deletion_archive` as owner `…0901` gives `permission denied`. Called with the service key, a forged entry with no completed request is skipped (`skipped_without_completed_request: 1`). `privacy_reapply_deletion_ledger()` as owner returned `reapplied: 0`, and the profiles of `…0001` and `…0902` are intact. Of the definer functions callable by `authenticated`, only `privacy_reapply_deletion_ledger()`, `privacy_release_due_holds()` and `admin_privacy_review_legal_hold` reach the engine. All three are console-gated and act only on completed requests or active holds. |
| H1 | Closed | Account court hold, then erase (`account_held: true`, profile kept), then release. After the release the profile has 0 rows, the ledger shows `account_held=f`, and `privacy_auth_erasures_due().held_released` lists the subject with its phones. `privacy_record_auth_erasure(NULL, s)` queues the final notice. |
| H2 | Closed | A `['reviews']` court hold gives `account_held: false` and the profile has 0 rows. `account` needs a 20-character `account_reason`, enforced by the function and by a CHECK constraint. |
| H3 | Closed | Fixture: rolled-back erasure of `…0001` with previous e-mail and phone, a sent notice, queue and log rows, and phones. I then searched every table in `public`, `storage`, `auth`, `vault`, `net` and `cron` for the e-mail, the phone, the surname, the old contacts and the uuid. Contact data remains only in `auth.users` and `privacy_erasure_pending`, and both are removed by the worker. The uuid alone remains in `deletion_ledger`, `governance_notifications` (destination and payload nulled), `privacy_erasure_runs` and existing `admin_audit_logs`. |
| M1 | Closed | Download with a password session, or with an OTP older than 10 minutes: refused (`contact_otp_required`). A fresh OTP is accepted 5 times, and the 6th gives `download_limit_reached`. The Edge Function calls the RPC with the caller's own token. |
| M2 | Closed | A phone swap in `auth.users` records an `account_contact_changes` row. After that, both download and submission are refused (`contact_changed_recently`). Propose, the export executor and the deletion executor all call `privacy_require_unchanged_contacts`. `[auth.sms] enable_confirmations = true`. |
| M3 | **Not fully closed** | The profile-side foreign keys are now SET NULL (checked in `pg_constraint`) and the engine pseudonymises those rows. However, `privacy_booking_is_linked` ignores `booking_tips`, `coupon_redemptions`, `gift_card_redemptions`, `wallet_credit_redemptions` and `package_redemptions`. The first four cascade from `bookings`, and the guard is in `no_delete_allow_cascade` mode. Repro: a tip on cancelled booking `b…0002` (no ledger or invoice row), then erasure. Result: `bookings_deleted: 1`, `tip_rows_left: 0`. See N2. |
| M4 | Closed | A patch test on a never-closed `confirmed` booking scheduled 45 days ago is purged (`patch_tests_purged: 1`), and a 6-day-old one is kept. The read policy now uses `can_read_patch_test_result`: the assigned provider, the recorder, or the owner (only for an uncleared positive), and never a console session. Five pg_cron jobs exist locally (`primora-intake-purge` and others). The old `can_read_patch_test_row` is no longer used by any policy. It is still granted, but it only returns a boolean. |
| M5 | **Not fully closed** | Pseudonyms are now per row and per hold, and a released hold nulls `subject_id` and `pseudonym_token`. However, after a dispute hold is released, `privacy_erasure_runs` still stores `subject_id` together with the booking id (`hold_release` summary) and the dispute reference (`request` summary `held`). `privacy_requests.completion_summary.held` keeps the same reference next to `subject_id`. Repro: both `privacy_erasure_runs` rows for `…0001` have `links_booking = t`. See N1. |
| M6 | Closed | Through `gov_exec_privacy_deletion` (the executing approval token was set inside the transaction): the other copy and correction requests become `withdrawn`, `correction_value` and `details` are nulled, and the export becomes `expired`. `export_files` lists both paths for the worker. |
| M7 | Closed | `privacy_erasure_pending.phones` = `{+966501234567, 966501234567, +966559998877}`, which includes the earlier phone. |
| L1 | Closed | Reviewed in code (only `in_app_otp_*` verified requests count, extension needs `require_recent_mfa`, `repetitive` needs an earlier completed request). The tests pass. |
| L2 | Closed | `٠٥٠١٢٣٤٥٦٧`, `۰۵۰۱۲۳۴۵۶۷` and an ASCII number are all redacted. Staff and owner names are redacted with `privacy_redact_provider_text`. |
| L3 | Closed | The engine refuses the admin `…0902` and the provider owner `1111…` with `not_a_customer_account`. `gov_exec_privacy_deletion` checks this again. |
| L4 | Closed | UPDATE and DELETE on `privacy_incident_events` give `append-only`. The foreign key is RESTRICT, and deleting the incident is blocked. A second `aware_at` correction gives `already_corrected`. The purge GUC can be set only from a SQL session, and clients have no table privileges. See N5. |
| L5 | Closed | `privacy_withdraw_request` with a password session gives `contact_otp_required`. |
| L6 | Closed | There is no `localhost` in `supabase/functions/**`. `allowedOrigins()` adds only well-formed `APP_ORIGIN` values. |

## New findings

There are no critical or high findings.

**N1 (Medium). A pseudonymised booking stays linked to the erased subject.** `privacy_finish_held_booking` writes
`privacy_erasure_runs (subject_id, summary {booking_id})`. The engine's `held` summary, also stored in `privacy_requests.completion_summary`,
carries `payment_dispute:<dispute_id>`, and `payment_disputes.booking_id` resolves that to the booking. Q2.3 requires the token to be
irreversible. Fix: null `subject_id` on `privacy_erasure_runs` when a hold is released. Strip `reference` from `held` in both summaries
once the hold ends. Add a test that no row ties the subject to a retained booking after release.

**N2 (Medium). Money sub-records still disappear when the engine deletes a booking it treats as "unlinked".** Reproduced above with a
tip; the same applies to coupon, gift-card and wallet-credit redemptions, which cascade from `bookings`. Fix: add these tables to
`privacy_booking_is_linked`, or change their `booking_id` foreign keys to SET NULL. Make the guard refuse cascade deletes coming from
`bookings`.

**N3 (Medium). One person can release a court hold early, which erases the account straight away.** Placing a hold takes two people.
Releasing it takes one `privacy.approve` holder, even the proposer. Repro: owner A, who proposed the hold, calls
`admin_privacy_review_legal_hold(h, false, …)`. The account is erased in the same transaction and `held_released` lists the login for
deletion. This is irreversible destruction of evidence on one person's decision. Fix: make an early release of a `court_case` hold an
approval kind decided by a second person. Leave scheduler releases of dispute holds as they are.

**N4 (Low). `staff_notes` survives erasure.** This free text is written by staff. The probe left
`"Customer phoned from 0501234567 asking"` on the deletion request. Fix: run `privacy_redact_text` over it, or null it, at
completion.

**N5 (Low). One person can move the 72-hour clock later.** `admin_incident_correct_aware_at` lets a single `incident.manage` holder move
`aware_at` later without limit. In the probe it moved 99 hours, which turned an overdue filing into one that looks on time. The original
value and the reason are kept, but no second person checks it. Fix: require approval when the correction moves the deadline later.

**N6 (Low). The contact scrub can hit another person's records.** `privacy_scrub_contact_traces` and the WhatsApp erasure match on every
phone the subject ever held, including old numbers and `walk_in_phone`. If a number has since been reassigned, another customer's pending
messages, logs and threads are erased.

**N7 (Low). Patch-test recorders keep read access.** `can_read_patch_test_result` grants the recorder read access for as long as the
row exists, even after their membership ends. Fix: also require an active membership.

**N8 (Low). Retained rows are never purged.** No job removes or further anonymises retained rows after `retention_until` or 10 years
(none found by grep). This is over-retention.

**N9 (Low). A working file was committed into the migrations folder.** `supabase/migrations/20261011330000_privfix_incident_history.sql.tmp`
is a scratch patch. The CLI does not apply it, but it should not be in the migrations folder.

**Info.** The hold renewal rule holds: the proposer and the last approver are refused. However, two people can alternate renewals
indefinitely. The probe reached 3 renewals with B and C alternating.

## UX-routed issue: clearing a customer's profile

At `HEAD`, a single administrator can clear a customer's profile without a second owner's approval. The committed function is
`20261005110000` as patched by `20261010100000`. It requires `require_recent_mfa()` and `admin_can('operations.write')`, so an
operations-role admin is enough: no owner role and no second person. It irreversibly nulls the name, e-mail, phone, gender and push
token. It also bypasses the privacy deletion's identity check, cooling-off period and four-eyes approval.

The uncommitted `20261011400000` changes this to `governance_request('customer_profile_clear', …)`, decided by a `privacy.approve`
holder. That migration is not reviewed here.
