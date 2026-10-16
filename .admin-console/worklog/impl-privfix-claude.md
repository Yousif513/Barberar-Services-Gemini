# impl-privfix-claude — fixes for the PRIV security review (2026-10-11)

Role: implementer. Branch `claude-code` in `primora-fix`, no push. Input: `docs/reviews/2026-10-11-security-priv.md` (1 critical,
3 high, 7 medium, 6 low), Q1/Q2 "Final decision text" in `docs/legal/2026-10-10-privacy-decision-memo.md`, worklog
`impl-priv-claude.md`. Capabilities stay `in-progress` / `unreviewed` (unchanged by this pass); nothing marked reviewed.

## Commits

- `adf6456` PRIVFIX-1 `20261011300000_privfix_deletion_engine.sql`: C1 (console reapply takes no entries; `privacy_import_deletion_archive`
  service-only, SHA-256 of the exported entries, entry must match a completed verified deletion request, inserted with
  `auth_deleted_at NULL`; `privacy_require_customer_subject` in the engine), L3 (re-check at approval), H1 (`held_released` set,
  final completion notice from `privacy_erasure_pending`), H2 (account held only when the hold names `account` with
  `account_reason`; other held categories re-linked to the hold's own token; `privacy_finish_court_hold` on release), H3
  (`privacy_scrub_contact_traces`: message_queue/log, governance_notifications, account_contact_changes; completion notice scrubbed
  by trigger once sent/failed/skipped/waived), M3 (seven money tables SET NULL + per-row pseudonym), M5 (per-row tokens, per-hold
  token; released hold nulls token and subject), M6 (other open requests withdrawn, restrictions/correction values/details destroyed,
  copies expired and their files removed by the worker), M7 (every phone held → WhatsApp hashes; count in the summary), hold renewal
  (new approver ≠ proposer and ≠ last approver/renewer, reason). Edge `privacy-erase-account` + `_shared/privacy-erasure.ts`; admin
  privacy screen (account reason field, no-arg reapply, released holds without subject).
- `f25b939` PRIVFIX-2 `..._310000_privfix_identity_and_copy.sql`: M1 (download needs fresh OTP, 5 per file), M2 (contact changed in
  30 days refuses the OTP check and blocks propose/approve/release; `[auth.sms] enable_confirmations = true`), L1, L2, L5. Customer
  privacy screen opens the code step when a download asks for it.
- `c19a343` PRIVFIX-3 `..._320000_privfix_health_retention.sql`: M4 (a) never-closed appointments purge 30 days after scheduled end,
  (b) patch tests same rule + assigned-provider/recorder reads (owner sees uncleared positives), (c) pg_cron jobs.
- `411539e` PRIVFIX-4 `..._330000_privfix_incident_history.sql`: L4 (append-only events, RESTRICT, one reasoned step-up correction of
  aware_at, console control); L6 (`allowedOrigins()` in `_shared/http.ts`, no localhost shipped; local via `APP_ORIGIN`).
- PRIVFIX-5 `..._340000_privfix_money_cascade_and_grants.sql`: Auth-side deletion keeps money rows with the link cleared by the FK
  (no block, no delete); service role reaches `privacy_erasure_pending`.

Every review reproduction now fails in `supabase/tests/db/priv_privacy.test.mjs` (C1 owner reapply with entries, H1 auth due after
release, H2 reviews/bookings hold deletes the profile, H3 whole-schema search for e-mail/phones, M1 password-session download, M2
phone swap, M4 stale confirmed booking, L1–L5).

## Decisions taken (assumed, recorded in the manifest)

- Patch tests are health data (review M4(b)): 30-day rule; owner reads only uncleared positives (the block only the owner clears).
- Archive import requires the completed request row: a restore that predates the request loses it too (gap filed).
- `enable_confirmations = true` takes effect on the next stack start; the running local stack was not restarted.

## Checks

test:db 1387/1387, test:inventory 10, test:edge 45, test:mobile 27, test:ui-schema 0 mismatches, web 734, test:security-core, test:admin-controls,
test:p3-compat HEAD, `npx tsc -p web_platform`, lint 0 errors, typecheck:mobile, deno lint + deno check on every function, smoke 19/19,
verify-privacy-local 4/4 with functions served (results in the final report).

## Next agent's first action

adminwright-security (a different agent id) re-reads migrations 20261011300000–340000 and re-runs the review's reproductions; then
ux-reviewer over /admin/privacy (hold form account reason, ledger note), /admin/incidents (aware_at correction) and /customer/privacy
(download asks for a code).
