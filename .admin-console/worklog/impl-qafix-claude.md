# impl-qafix-claude — QA release-gate fixes, UX round 2, e2e-pinned defects

Agent: impl-qafix-claude (implementer). Branch claude-code in primora-fix; no push, no db reset, hosted Supabase never contacted,
dev server and functions serve left running. Claims taken and released at the end (coordinator: manifest last).

## What changed

| Item | Commit | Where |
|---|---|---|
| QA 1 false success (critical) | 9bcd604, 19eaacc | Migration 20261017100000: admin_save_service, admin_set_branch_active, admin_set_package_active, admin_set_integration_state, admin_save_integration, admin_set_payment_method, admin_set_default_payment_method (permission named via HINT missing_permission, stale/missing row refused, reasons, step-up for integrations and payment methods, one default per audience, server-written integration history, client INSERT on integration_audit_log withdrawn, console read of inactive packages). Screens believe only the answer (lib/write-result.mjs, lib/console-errors.mjs). Provider portal and provider notes/edit direct updates/deletes ask for their rows (checkedWrite). Found on the way: services status trigger reverted every console/portal toggle; approvals said "Approved and executed" for an unchanged (withdrawn) request |
| QA 2 controls by role | 9bcd604, 9c1ff6f | services, branches, packages (operations.write), integrations, payment methods (settings.manage), coupons (money.config), sponsored (settings.manage / money.ledger), reviews (operations.write) |
| QA 3 failed reads | 9bcd604, 9c1ff6f | components/read-failure.tsx on services, branches, packages, coupons, integrations, activity, reviews, payment methods |
| QA 5 accessibility | 9bcd604, f860700, 5e34964 | labels on services and integrations controls; dark gold #7A5B12 for small text; public/customer contrast; focusable named scroll regions; #admin-main focusable |
| UX round 2 | 2bed790 | CommandDialog capped (inline style) with scrolling body and sticky actions, base-layer cap for every modal dialog; approvals card list below md; describeConsoleError on approvals, notices, incidents, privacy, picker, customers (every HINT has Arabic, tested); Arabic digits in the deletion preview; retention purge panel (dry run, approval request) |
| E2E defects | 95c9c66 | IBAN reveal panel portalled above the payout table; calendar picker on riyadhDateKey; h1 on nine screens; test.fail markers flipped |
| Evidence | 1326976 | .admin-console/evidence/qafix/ (summary.txt, browser-*.json, shots/) |

## Verification

test:db 1505/1505; test:inventory 10/10; test:edge 54/54; test:mobile 29/29; test:ui-schema 0 mismatches (314 rpc calls);
web 857/857 (two tests broken by eff9525 were fixed by dbsec-wave2 in 49ecf19); test:security-core and test:admin-controls passed; test:p3-compat HEAD passed;
tsc -p web_platform 0; npm run lint 0 errors (warnings only); typecheck:mobile 0; deno lint 50 files clean; smoke 19/19.
npm run test:e2e against :3100: 155/155 (an earlier full run was 154/155: the h1 sweep timed out once on "Verifying secure
session" under load and passed alone). Browser: summary.txt (roles, refused writes in EN/AR, success paths stored as shown,
read states, dialogs at 375x600, purge/approvals in Arabic at 375, axe 88 runs clean). npm run build not run (instructed).

## Decisions (assumed)

qafix-console-commands-raise-and-name-the-permission, qafix-reasons-and-step-up-by-risk,
qafix-one-default-payment-method-per-audience, qafix-integration-key-fixed, qafix-console-main-panel-focusable.

## Gaps

Fixed: direct-table-updates-report-success-when-the-row-policy-refuses, read-only-roles-see-enabled-write-controls,
refused-reads-shown-with-an-empty-state, axe-critical-unlabelled-controls-on-services-and-integrations,
axe-contrast-and-scroll-region-failures, admin-packages-screen-controls-reach-no-rows,
payment-method-default-switch-is-two-browser-writes-with-no-reason, integration-audit-log-accepts-client-written-rows,
packages-and-services-load-errors-ignore-the-interface-language, console-refusals-say-administrator-access-required,
ux2-command-dialog-height-uncapped-confirm-unreachable, ux2-approvals-actions-offscreen-at-375,
ux2-arabic-console-shows-english-server-refusals, ux2-customer-deletion-preview-latin-zero-reads-as-five,
retention-purge-console-entry-missing, ux1-reviewed-screens-have-no-h1; new and fixed: approvals-unchanged-decision-reported-as-approved,
services-status-trigger-reverted-console-toggles, provider-portal-direct-writes-ignored-zero-rows, e2e-pinned-iban-panel-calendar-date-h1.
Not done: QA item 4 (pay-wave2 owns it), lows of UX round 2,
customer-portal direct writes (out of this dispatch), /become-provider hero image from images.unsplash.com.

## Next agent's first action

ux-reviewer re-runs the 375 x 600 dialog and Approvals checks and the axe phase; security (red team) probes the seven new
commands (missing permission, stale write, step-up, integration_audit_log INSERT) and reviews the 13 capabilities set
implemented/unreviewed here; QA re-runs its falsesuccess phase with a role changed mid-session.

## Manifest gates

validate --phase release: exit 1, 220 errors before this pass, 223 after: release-status-unresolved 151 -> 138 and
gap-unresolved 8 -> 6, offset by 13 capability-unreviewed (the 13 capabilities set implemented here need an independent
reviewer) and 5 decision-assumed (owner to confirm the qafix-* decisions). coverage: exit 1, the same 4 structural orphans.
Claims on the 13 capabilities were taken and released at the end; agent status handed-off.
