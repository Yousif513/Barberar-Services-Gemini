# impl-f123-claude — F1, F2, F3 (and F4) of the 2026-10-16 security final re-check

Agent: impl-f123-claude (implementer). Branch claude-code, working directly in primora-fix. No push, no db reset, no hosted
Supabase. Claimed customer.clear-profile, privacy.request-intake, privacy.deletion; released at the end.

## What changed

| Finding | Commit | Where |
|---|---|---|
| F1 profile clear ignored an account court hold | e90c078 | 20261016200000 — admin_clear_customer_profile refuses (HINT legal_hold_active) at request and inside the approved execution while an active hold lists 'account'; admin_approval_inbox returns `legal_hold` on a pending profile clear; customers and approvals screens say so (EN/AR) |
| F4 approver needed operations.write | e90c078 | same migration — inside the approved execution the approval is the authority; requester still needs operations.write; executor refuses the requester |
| F2 lookup oracle | 2da65fd, e807680 | 20261016210000 + 20261016230000 — whole-value phone (00/966/0 normalised, 9+ digits) and e-mail (equality) match; names never match e-mails; last-name initial only; step-up; 10 per actor per 10 min (audit-log count, advisory lock), refusal returned + audited + one `privacy_lookup_limit_reached` alert per window; audit carries `query_hmac` (HMAC-SHA256, key in privacy_lookup_keys, no anon/authenticated grant). customer-picker.tsx and approvals alert label updated (EN/AR) |
| F3 purge by one person | 88aa16f | 20261016220000 — privacy_purge_expired_retention(dry, reason); a real console run returns a `privacy_retention_purge` approval request with dry-run counts; a different privacy.approve holder decides after step-up; break-glass excluded; service key unchanged; audit names approval and reason. Approvals screen label/summary (EN/AR) |

Negative tests: supabase/tests/db/f123_final_recheck.test.mjs (13 cases; F1/F4 confirmed failing with the migration removed),
supabase/tests/db/uxfix_console_ux.test.mjs updated to the whole-value contract, web_platform/tests/f123-recheck-ui.test.mjs.

## Verification

Migrations 20261016200000, 20261016210000, 20261016220000, 20261016230000 applied with `npx supabase migration up --local`.
test:db 1429/1429; test:edge 46/46; test:ui-schema 0 mismatches; web tests 753/753; test:security-core and
test:admin-controls passed; tsc -p web_platform 0; npm run lint 0 errors (warnings only); smoke-local-supabase 19/19;
deno lint 50 files clean. Not run (as instructed): npm run build. Browser not exercised.

## Decisions (assumed)

f1-any-active-account-hold-blocks-profile-clear, f2-lookup-exact-match-limit-and-hmac, f3-retention-purge-approval-kind;
declaredStatic f2-privacy-lookup-limit (owner to confirm).

## Gaps

Fixed: sec-final-f1/f2/f3/f4. Open: f123-screens-not-browser-verified, retention-purge-console-entry-missing.
customer.clear-profile stays contested/in-progress for its reviewer to clear; the other two stay in-progress (pre-existing owner gaps).

## Next agent's first action

Security (not this agent) re-runs the F1–F3 reproductions from docs/reviews/2026-10-16-security-final-recheck.md against
migrations 20261016200000–20261016230000; UX reviewer checks the picker refusals, the held profile-clear message and the
purge approval line in a TOTP console session.

## Manifest gates

validate --phase release exits 1 (340 errors; 336 before this pass). Added by this pass: 3 decision-assumed (owner to confirm)
and 1 placeholder-scan false positive on the F2 migration's `extensions.gen_random_bytes` (feedback
f123-placeholder-scan-flags-gen-random-bytes). The three claimed capabilities' release-status errors were there before.
coverage exits 1 with 6 errors, the same 6 as before this pass.
