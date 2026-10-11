# impl-secfix2-claude — security review round 2 fixes (2026-10-11)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: the fixes in `docs/reviews/2026-10-11-security-round2.md`
(decision `secfix2-adopt-security-round2-fixes`). Claimed: gov.audited-reads, gov.approvals, gov.break-glass, gov.iban-reveal,
refund.execute, booking.transition, booking.list, reconciliation.daily, reconciliation.resolve-break, notification.dispatch,
ledger.release-payout, payout.approve, employee.list, branch.list, customer.list, provider.list, audit.search, audit.emit,
sponsored.configure, reward-program.enable. All left `in-progress`; review `unreviewed` (contested ones kept contested).

## Findings

| Id | Result | Commit |
|---|---|---|
| R2-H1 | restrictive console read policy on 28 more tables (incl. helper-gated memberships/sponsored and the 4 reconciliation tables), admin branches dropped; pg_policies enumeration test with a reviewed allow-list | 2930075 |
| R2-H2 | `admin_cancel_booking` / `admin_mark_booking_no_show`: step-up, 10-char reason, money.refund + thresholds + daily cap, else `booking_cancellation` request for a different money.refund holder; self-service commands refuse console sessions; sources `admin_cancellation`/`admin_no_show` | 8505280 |
| R2-H3 | files carry only settlements / bank lines, staged maker-checker with SHA-256, evidence per source, `evidence_conflict` breaks, matching and auto-close on Tap API evidence only | 671b787 |
| R2-H4 | `deliver-governance-notices` + pure module (Resend / Twilio by env only; inert, rows marked `undeliverable: no sender configured`); backoff, 8 attempts; changed accounts not paid until notice sent or waived by a second person; console notices panel | 9e912c6 |
| R2-M1, M2, M3, M6, M7, L2, L4, L5 | personal.read / money checks, required purpose, gov2_log_read, D4 branch suppression, search SHA-256, names only with personal.read, shared reveal ceiling, 500-row pages | 829a5b5 |
| R2-M4, M5, L6 | break corrections only via `admin_propose_break_resolution`, capped at the difference, partial keeps it open; payouts wait for open breaks; no break-glass for break corrections | 671b787 |
| R2-M8 | audit log owner-only through `admin_list_audit_events` | 2930075 |
| R2-L1, L3, L7 | console reconcile run opened in caller's session and run under their id; reward locks, loyalty reversal on refund, new-customer check; sponsored price needs a second owner | 4d0a881 |
| R2-L3 chargeback hook | not fixed: PRIMORA ingests no Tap chargebacks (gap tap-chargebacks-not-ingested) | — |
| Smoke (coordinator) | smoke admin is a console owner with an aal2 TOTP session; 19/19 | e1cd19b |

Migrations `20261011100000`–`150000`, each applied with `npx supabase migration up --local` (two H2 function fixes made after
110000 was applied were also run by hand on the local DB). Stale gap `admin-can-still-rewrite-money-tables-directly` closed with evidence.

## Checks

test:db 1348/1348, test:edge 31, test:inventory 10, test:mobile 27, test:ui-schema 0 mismatches, web 731, security-core and
admin-controls pass, `npx tsc -p web_platform` clean, `npm run lint` 0 errors, typecheck:mobile clean, smoke 19/19 on the local
stack, changed admin routes answer 200 on :3100. Manifest validate 0 errors; coverage exits 1 and release validate exits 1 with the
same 21 pre-existing route/lifecycle errors. Not clicked through with a real TOTP sign-in.

## Gaps filed

governance-notice-sender-not-chosen (blocked, owner), deliver-governance-notices-not-scheduled, tap-chargebacks-not-ingested,
secfix2-screens-not-browser-verified-with-totp. Assumed decisions for the owner: break-glass never resolves breaks (R2-L6),
break correction amount rule, provider-wide payout hold, "sent" = provider accepted, console no-shows follow refund rules,
sponsored price needs a second owner.

## Next agent's first action

adminwright-security over the claimed capabilities: re-read migrations 20261011100000–150000 (not this summary), re-run every
R2 reproduction, attack the session flags (`primora.console_cancellation`, `primora.console_no_show`, `primora.break_resolution`),
the evidence-conflict path and the notice waiver; then ux-reviewer with a real TOTP sign-in over /admin/bookings, /admin/approvals,
/admin/reconciliation, /admin/ledger, /admin/audit-logs and /admin/providers.
