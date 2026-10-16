# Security final re-check (2026-10-16)

Reviewer: `sec-final-claude`. This is an independent review. I implemented none of the code reviewed here. The branch is `claude-code` at `9138eb7`.

The fix commits are `afb717b..9138eb7`. They add migrations `20261016100000` to `20261016170000`, which are applied locally. I also reviewed the UX-fix server functions in `20261011400000` and `20261011410000`.

Method:
- I read every migration after `37596e8` fresh.
- I ran probes against `supabase_db_beauty_grooming_marketplace`. Every probe was one `BEGIN … ROLLBACK` transaction.
- Callers were impersonated with `SET LOCAL ROLE authenticated` plus `request.jwt.claims`, with my own `auth.sessions` rows inside the same transaction. The owner's real session (`…0901`) was not used.
- Actors: customer `…0001` and `…0002`; owners `e43f…`, `68e7…`, `13a8…` and `7eff…`; owner `8ba0…`, demoted to operations inside the transaction; finance `…0902`.
- I did not run `db reset`. I made no source, test or manifest edits.

## 1. Items from 2026-10-11-security-priv-recheck.md

All 11 are closed: M3, M5, N1–N9 and the renewal note.

| ID | Status | Reproduction result |
|---|---|---|
| M3 / N2 | Closed | A tip on cancelled booking `b…0002`, which has no ledger row, makes `privacy_booking_is_linked` return true. After a full erasure (submit → propose by ops → approve by owner A), the booking is kept and the tip is kept (`b2_kept 1`, `tip_left 1`). The money tables whose foreign key to `bookings` is not RESTRICT: 0. |
| M5 / N1 (dispute) | Closed | Setup: a dispute on `b…0001`, then erasure, then the dispute is closed 31 days earlier, then `privacy_release_due_holds()` (`released 1`). I scanned every `public` base table for a row that holds the subject id (or its request or approval ids) together with the booking, dispute, hold id or pseudonym: 0 rows. The hold row now has no subject, booking, dispute, approval or token, and `case_reference='payment_dispute'`. |
| M5 / N1 (court) | Closed | An account court hold, then erasure (`account_held t`), then release through the new approval. The same scan with the hold id and the case reference: 0 rows. `approval.approved` carries the erasure summary without a subject. |
| N3 | Closed | `admin_privacy_review_legal_hold(h,false,…)` now returns `release_needs_approval`. The hold stays `active` and the profile stays. These are refused: the requester decides; ops (`privacy.approve required`); a stale step-up (900 s); a direct `gov_exec_…_release`; `privacy_release_hold_internal`. A second owner decides: the hold is released, the profile has 0 rows and the worker lists the subject. |
| Renewal note | Closed | Owners B and C alternate renewals up to 3. The 4th renewal becomes `privacy_legal_hold_renewal`. These deciders are refused with `fresh_owner_required`: B, a previous renewer, and A, who approved the hold. Owner D, never involved, is accepted (`renewals 4`). |
| N4 | Closed | Staff notes containing `0501234567` are nulled on both requests after erasure. `privacy.note_added` audit rows that contain the number: 0. |
| N5 | Closed | Moving `aware_at` 99 h later now opens a pending request, and the incident is unchanged. These are refused: a second pending request (`correction_pending`); a direct UPDATE (`permission denied`); the requester deciding; ops; finance. Owner B decides. Events `created → requested → corrected` are recorded with requester and approver, and `aware_at_original` is kept. |
| N6 | Closed | Customer `…0002` held `+966509990000` until 3 days ago. The queue row from inside that tenure is deleted. Two rows are kept: one created after the tenure under `966509990000`, and one addressed to another account. `privacy_erase_whatsapp(uuid,jsonb)` and `privacy_scrub_contact_traces` are not executable by `authenticated`. |
| N7 | Closed | The recorder `…0201` reads its patch test while an active employee (1 row) and cannot read it after deactivation (0 rows). |
| N8 | Closed (function) | These callers are refused: ops (privacy.approve); a stale step-up; `anon` (`permission denied`). A dry run by owner A returns counts and writes one `privacy.retention_purged` audit row. A forged `primora.retention_purge_run` GUC gives `privacy_retention_purge_active() = f`, because the txid is bound. Scheduling is still an owner gap (`retention-purge-not-scheduled`). |
| N9 | Closed | No file in `supabase/migrations` breaks the `<version>_<name>.sql` pattern. |

## 2. UX-fix server functions

**`customer_profile_clear`.**
- These callers are refused: a stale step-up; finance (`Administrator access required`); a non-customer target; a direct `gov_exec_customer_profile_clear`.
- The first call by ops only creates a pending request, and the profile stays intact.
- These deciders are refused: the requester, and finance (`cannot decide`). Approval by a privacy.approve owner then clears the profile.
- Four-eyes holds. See F1 for the gap.

**`admin_privacy_find_customers`.**
- These callers are refused: `anon` (`permission denied`); a customer; aal1 operations; finance.
- Admin accounts are not returned.
- `%%%` and `___` match nothing, because they are escaped.
- Results are capped at 10 and carry `more`.
- The e-mail is masked to `y***@domain` and only the last 4 phone digits are shown.
- Each call is audited (`privacy.subject_lookup`, kind, length and ids), with no query text.
- See F2 for the gaps.

**Server-side refusal.** Hiding navigation by role is not the only control. In every case above, the server refused the forbidden role directly:
- ops: hold release, approval decisions, incident correction, purge, audit log;
- finance: lookup, profile clear, incident decision.

`admin_session_state` returns `role_permissions` as `{}` for a customer.

## 3. Regressions (migrations after 37596e8)

- Functions defined in these migrations that `anon` can execute: none.
- SECURITY DEFINER functions defined there without `search_path`: none.
- The new grants to `authenticated` since the last review:
  - `admin_session_state`
  - `audit_event_is_read` (not a definer)
  - `admin_list_audit_events` (gated by audit.read; ops refused)
  - `admin_privacy_find_customers`
  - `admin_clear_customer_profile`
  - `privacy_purge_expired_retention`

  Each is gated on the server as probed above.
- `authenticated` and `anon` have no SELECT on these new or changed tables: `privacy_retention_purge_runs`, `privacy_erasure_pending`, `privacy_legal_holds`, `privacy_incident_events` and `account_contact_changes`. RLS is enabled on all of them.

## New findings

There are no critical or high findings.

**F1 (Medium). A profile clear ignores an active account court hold.**

Reproduction:
1. Ops proposes a `court_case` hold with `['account']` on `…0002`, and owner A approves it.
2. Ops calls `admin_clear_customer_profile('…0002', …)`.
3. Owner B approves. The result is `approved`, and the profile's `first_name`, `email` and `phone_number` are all NULL while the hold is active.

The approval summary does not tell the approver that a hold exists. The erasure engine respects this hold (H1/H2), but this path does not.

Fix: refuse the request, and refuse again in the executor, when an active `court_case` hold covers `account` for the subject. Show the hold in the approval summary.

**F2 (Medium). The customer lookup is an unthrottled oracle that defeats its own masking.**

Reproduction as operations (privacy.manage; no step-up):
- `966501234567` returns 1 row and `966501234568` returns 0, so an exact phone number can be confirmed.
- `yousif@primora.com` returns 1 row, so an exact e-mail can be confirmed.
- Name mode also matches inside e-mails: `sif@prim` returns 2 rows.
- 200 lookups in a row all succeeded (209 audit rows in total in the transaction).

With substring matching, someone can rebuild a full phone number or e-mail one character at a time, despite `phone_last4` and `y***@`. Because the query text is not audited, the audit log cannot show the probing.

Fix:
- Phone lookups match the whole normalised number, and e-mail lookups the whole address.
- Name mode stops matching e-mails.
- Add a per-actor rate limit, for example 30 per hour, with an alert.
- Require step-up.
- Audit a salted hash of the query.

**F3 (Low). The real retention purge is decided by one person.** `privacy_purge_expired_retention(false)` irreversibly deletes data, and one privacy.approve holder can run it after step-up. Every other irreversible privacy action takes two people. Fix: make a non-dry run an approval kind, or allow it with the service key only once it is scheduled.

**F4 (Info). A profile clear needs `operations.write` from the approver as well.** The executor re-enters `admin_clear_customer_profile`, which checks `operations.write` in the approver's session. Today only owners can approve, and owners hold it, so nothing breaks. A future privacy-only approver role would break this flow.

The open gap `historic-audit-rows-link-erased-subjects-to-holds` (audit rows written before the fix) was not re-decided here. It needs an owner decision on rewriting append-only audit history.
