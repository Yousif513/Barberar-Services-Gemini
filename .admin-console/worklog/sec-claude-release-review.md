# worklog sec-claude-release-review
role: security
mode: audit (independent pass over the release-gap, P3 and admin-console work)    profile: regulated
started: 2026-10-04    ended: 2026-10-06
branch: claude-code, source and local PGlite evidence only. No git writes, no hosted Supabase, no application or server code edited.

claims-held: none
claims-released: refund.list, refund.retry, refund.execute, customer.clear-profile, customer.list, customer.verify-phone, customer.data-request, provider.approve, provider.suspend, provider.reject, provider.list, provider.notes, booking.release-holds, ledger.export, employee.list, inventory.catalog, inventory.adjust, inventory.transfer, inventory.supply-read, inventory.delegation, inventory.chain-read

## did
- Fresh read of migrations 080000 to 140000, the P3 pair (060000, 070000), process-refund, _shared/http.ts and refunds.ts, auth-guard, dev-access, supabase.ts, next.config.ts and the admin pages (dashboard, refunds, audit-logs, customers, reports, employees, ledger, providers, integrations).
- Ran empirical probes against the fully migrated PGlite database (scratchpad only): catalog introspection of every SECURITY DEFINER function, grant and view; role-by-table write attempts; audit-content checks.
- Added `supabase/tests/db/admin_security_matrix.test.mjs` (19 tests): catalog-driven administrator-gate matrix (16+ commands x owner, employee, customer, anonymous, plus an administrator control), direct-write denial per role on 12 console and money tables, cross-provider denial, audit-log tamper and forgery, dashboard data minimisation, structural invariants.
- Mutation-checked the new tests from the scratchpad: 9 of 9 weakenings were caught (ungated command, open audit writer, open audit insert and update policies, unpinned search path, ledger/settings/payout FOR ALL policies, view opened to anon).
- Manifest: 22 gaps, 1 decision, 6 feedback, 21 capability review states, 4 separationOfDuties statements, crossCutting evidence and flags (see report).
- Advisory check: Next.js installed 16.3.8 (>= 16.2.6 middleware-bypass fixes); supabase-js 2.108.1 (>= auth-js 2.69.1); the Supabase Auth Apple/Azure ID-token issue applies only if those providers are enabled (not seen).

## verified
- npm run test:db 116/116, test:inventory 10/10, test:security-core pass, test:admin-controls pass; web workspace tests 134/134. validate plan exit 0, validate release exit 1 (230 errors), coverage exit 1 (11 errors).
- Administrator gate: every admin_* and admin-guarded command refuses the four non-admin roles with SQLSTATE 42501 before validation; search_path pinned on every SECURITY DEFINER function; RLS on every public table; write_audit_log and audit writers not executable by client roles.

## decided
- sec-dashboard-aggregates-need-no-per-call-audit  proposes that the dashboard summary needs no per-call audit  assumed (a human must confirm)
- No risk accepted. No accepted-risk decision was written; none can be, without a named human approver.

## found
- admin-direct-writes-to-money-tables-leave-no-audit  critical
- audit-log-keeps-cleared-customer-name-and-push-token, admin-reads-of-personal-and-bank-data-bypass-the-audited-commands, public-read-policies-expose-internal-provider-and-staff-columns, admin-sessions-have-no-mfa-or-step-up, refund-outcomes-that-cannot-be-known-have-no-recovery, payout-iban-can-be-rewritten-by-an-admin-before-release, referral-and-loyalty-values-self-approved-and-unbounded  high
- audit-redaction-is-a-short-deny-list, audit-trail-is-not-tamper-evident-beyond-rls, refused-and-failed-admin-actions-are-not-recorded, refund-execution-has-no-operator-in-the-audit-trail, payout-request-insert-bypasses-balance-and-iban-checks, provider-approval-needs-no-reason-or-verified-registration, admin-console-sends-no-browser-security-headers, demo-accounts-and-providers-are-created-by-the-migration-chain, high-risk-capabilities-missing-safeguard-and-audit-links  medium
- five low gaps (service-key compare and localhost origin, fixed test OTP, consent oracle, QR window markup, view default grants)

## next
Implementer pass under a new claim, in this order: (1) admin-direct-writes-to-money-tables-leave-no-audit, (2) audit-log-keeps-cleared-customer-name-and-push-token with an allow-list audit writer, (3) public-read-policies-expose-internal-provider-and-staff-columns. Then rerun supabase/tests/db/admin_security_matrix.test.mjs and add the failing-first tests named in each gap. Capabilities marked contested return to reviewed only by a reviewer other than the implementer.

## blocked-on
- Human decisions: IBAN visibility, separation of duties and approval thresholds, referral/loyalty limits, PDPL erasure versus ZATCA retention, whether staff phone and email may be public, whether MFA is required for administrators.
- Not verifiable from this machine: hosted schema and policy state, hosted Auth MFA and session settings, Tap idempotency window and refund lookup, edge-function runtime behaviour (no Deno here), response headers set by the hosting platform, browser console and signed-in workflows.
