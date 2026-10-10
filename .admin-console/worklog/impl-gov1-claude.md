# impl-gov1-claude — GOV-1 governance package (2026-10-10)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: `docs/legal/2026-10-10-adopted-decisions.md`
(D-Q5, Q6, Q3; final decision texts in the two memos), recorded as decisions `adopted-d-q5-roles-maker-checker`,
`adopted-q6-mfa-step-up-sessions`, `adopted-q3-iban` (owner confirmation 2026-10-10).

## Built

- `supabase/migrations/20261010100000_gov1_console_roles_and_mfa.sql` — console roles (owner/finance/operations/analyst,
  existing admins → owner), permission matrix, `is_admin()` = console role + aal2 + not locked, `admin_can()`,
  `require_recent_mfa()` (amr TOTP within 5 min, HINT `step_up_required`), `require_recent_login()` (HINT `reauth_required`),
  inline `profiles.role = 'admin'` policies rewritten to `is_admin()`, restrictive per-command policies narrowing direct
  administrator writes by table class, 75 changing commands patched in place to `admin_can(...)` (+ step-up on money,
  deletion, role commands), `admin_set_console_role`, MFA verification hook with 10-failure lockout + alert,
  `admin_reset_mfa` (different owner, reason, step-up), `admin_session_state`, security alerts, out-of-band outbox.
- `..._110000_gov1_maker_checker_approvals.sql` — approvals table, thresholds (1,000 / 5,000 / 10,000 SAR as settings),
  gate inside `admin_release_payout`, `admin_create_refund_request`, `resolve_booking_dispute`; `admin_request_refund`,
  `admin_decide_approval` (no self-approval, permission, step-up, executes under a one-time token), cancel, break-glass,
  review sign-off, setting change via approval, inbox.
- `..._120000_gov1_iban_controls.sql` — `provider_payout_destinations` (no client privilege), masked `iban_masked`,
  `iban` column unreadable by clients, provider change with re-auth, approval (never break-glass), 48 h hold, notices,
  release only to an approved destination after hold, `reveal_provider_iban`.
- `..._130000_gov1_audit_log_append_only.sql` — append-only audit log (privileges + trigger), 5-year purge (unscheduled).
- UI: `/login/mfa`, AuthGuard aal2 redirect, `StepUpDialog` + step-up-aware Supabase fetch, idle sign-out, `/admin/approvals`,
  roles screen (console roles, MFA reset), ledger (masked + 60 s reveal), wallet (real account, change flow; invented IBAN
  removed), disputes (pending approval). Edge Functions require an aal2 console session and the money permission.
- `supabase/config.toml`: TOTP, sessions 12h/30m, MFA hook. Local stack restarted once to load it (data kept).
- Local accounts: `admin.owner@primora.local` (owner), `admin.finance@primora.local` (finance); passwords in the
  git-ignored `supabase/.temp/local-admin-logins.txt`; also in `supabase/seed.sql` without passwords.

## Tests

New: `supabase/tests/db/gov1_console_roles_mfa.test.mjs` (14), `gov1_maker_checker.test.mjs` (12), `gov1_iban.test.mjs` (7),
`gov1_audit_append_only.test.mjs` (3), `web_platform/tests/gov1-governance-screens.test.mjs` (7). Harness: signed-in test users
carry aal2 + fresh TOTP amr by default; admins get a console role (owner by default). Existing payout tests now release
through a second approver (`gov1_fixtures.mjs`), masked-IBAN and permission-denied expectations updated where the decisions
changed behaviour.

Browser (localhost:3100, local stack): sign-in → redirected to /login/mfa → enrolled TOTP → dashboard; approvals, roles,
ledger load; a role change after 5 minutes opened the step-up prompt and, cancelled, showed the server refusal. The TOTP
factor created for that check was removed afterwards so the owner enrols their own.

## Not done / gaps filed

governance-notifications-have-no-delivery-worker (high), hosted-auth-settings-must-match-gov1 (high, owner),
audit-retention-purge-not-scheduled, analyst-read-only-not-enforced-through-shared-provider-helpers,
export-step-up-is-not-server-enforced, support-entered-iban-change-not-built, legacy-payout-requests-need-an-approved-account,
employee-wps-iban-not-masked, sole-owner-mfa-lockout-has-no-console-recovery, finance-role-holders-not-yet-approved (owner).
Not browser-verified: the full step-up retry after entering a code, the wallet change flow as a provider, reveal (no
approved destination exists locally).

## Next agent's first action

adminwright-security over `admin-governance`, `payout-request`, `refund-request`, `role-assignment`, `audit-event`:
re-read the four migrations (not this summary), attack self-approval, token forgery (`primora.governance_token`),
restrictive-policy coverage and the helper-function gap; then ux-reviewer over `/login/mfa`, `/admin/approvals`, `/admin/roles`.
