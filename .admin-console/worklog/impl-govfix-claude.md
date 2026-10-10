# impl-govfix-claude — GOV-1 security review fixes and GOV-2 remaining reads (2026-10-10)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: the recommended fixes in
`docs/reviews/2026-10-10-security-gov1.md` (decision `govfix-adopt-security-review-fixes`). `FIX-README.md` named in the
dispatch does not exist in this checkout. Claimed: gov.console-roles, gov.mfa, gov.approvals, gov.break-glass, gov.iban-reveal,
gov.iban-change, gov.audited-reads, role.set-administrator. All left `in-progress`, `unreviewed`.

## Findings

| Id | Result | Commit |
|---|---|---|
| C-1, C-2, H-4, M-1 | already fixed by MONEY (verified in the live DB) | 967d7b5 |
| H-1 | membership visit writes need operations.write; wathq-verify / dispatch-messages / deliver-webhooks need their permission | 4ad7de7 (helpers: 6b1ed8b) |
| H-2 | privileged grants = role_change request for a different owner, 72 h cooling-off, 30-day assigner independence, break-glass closed 7 days after an approver demotion | f5248e0 |
| H-3 | notices to Auth-verified contacts only (old and new, snapshotted, hidden from console reads); IBAN change paused 48 h after a contact change. No sender exists | 7e0f1ed |
| M-2 | console role needs the token's live session; jwt_expiry 900 | 9a695ad |
| M-3 | step-up on 8 remaining commands | 9a695ad |
| M-4 | no self-review of break-glass, no self-acknowledgement of alerts | f5248e0 |
| M-5 | staff IBAN masked everywhere, audited reveal | 21d7585 |
| M-6 | mfa_factor_added alert/audit/notice; max 2 factors | 7e0f1ed |
| L-1 | purge checks session_user | 9a695ad |
| L-2 | strong references, ceiling 20/24 h lifted by another owner | 21d7585 |
| L-3 | pending account revealed masked, "do not pay" | 21d7585 |
| L-4 | re-auth counts credential methods only | 9a695ad |
| GOV-2 remaining reads | restrictive reads on 13 tables, 6 audited functions, 6 screens switched, private directory needs personal.read | 249ad7e, 8148889 |

Migrations `20261010400000`–`450000`, each applied with `supabase migration up --local`. Two grant/trigger tweaks to
410000/420000 after they were applied were also run by hand on the local DB.

## Checks

test:db 1295/1295 (final full run after 8148889), test:inventory 10, test:edge 21
(new console-permission suite), test:mobile 27, test:ui-schema 0 mismatches, web 730, test:security-core and
test:admin-controls pass, `npx tsc -p web_platform` clean, `npm run lint` 0 errors, typecheck:mobile clean. Live local stack
(PostgREST, locally signed aal2 tokens with real session rows): direct bookings/hidden reviews empty for the owner, audited
reads 200, finance refused reviews and the private directory (console_role_forbidden), wps_iban and notice destination 403, a
finance grant came back pending_approval (withdrawn afterwards), is_admin false once the session row was deleted. All changed
routes answer 200 on :3100. Not clicked through with a real TOTP sign-in. Manifest validate 0 errors; coverage exits 1 with the
same 21 errors as before this pass (reconciliation/reward routes); release validate exits 1 (capabilities in progress).

## Gaps filed

sole-owner-cannot-grant-approver-roles (blocked, owner), audit-log-read-directly-by-every-console-role,
contact-change-history-has-no-retention, govfix-screens-not-browser-verified-with-totp, local-auth-config-not-reloaded-after-govfix,
reviews-moderation-list-shows-newest-200. governance-notifications-have-no-delivery-worker stays open (no sender).

## Next agent's first action

adminwright-security over gov.console-roles, gov.approvals, gov.break-glass, gov.iban-reveal, gov.iban-change, gov.mfa,
gov.audited-reads: re-read migrations 20261010400000–450000 (not this summary), retry each report reproduction, attack the
role_change execution (target changed in between, approver = target), the session_id check, and the reveal ceiling; then
ux-reviewer with a real TOTP sign-in over /admin/approvals, /admin/roles, the switched read screens and /provider/employees.
