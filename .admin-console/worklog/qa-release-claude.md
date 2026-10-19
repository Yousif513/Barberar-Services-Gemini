# worklog qa-release-claude
role: qa
mode: audit (release gate)    profile: regulated
started: 2026-10-16T21:30Z    ended: 2026-10-17T08:10Z (paused in between)
branch: claude-code (primora-fix). Local stack only; hosted Supabase never contacted. No application, migration or function
file edited. Wrote evidence under .admin-console/evidence/qa-release/, docs/reviews/2026-10-17-qa-release-gate.md and the
manifest through the adminwright script (harness/apply-manifest-updates.py, re-reading before each group).

claims-held: none (reviewers do not claim)
claims-released: none

did
- gates re-run: test:db 1429/1429, web 753/753, edge 46, inventory 10, mobile 27, ui-schema, security-core, admin-controls,
  p3-compat, lint, typecheck (mobile and web), build: all exit 0 (gate-summary.txt)
- browser (headless Chrome over CDP, harness/qa-browser-harness.mjs): axe EN/AR x 1440/375 on 38 screens, keyboard, states
  by request injection, four real console roles plus a customer on every admin route, UI workflow with password + TOTP +
  two-person approval for finance and owner, false-success probe, focus-ring follow-up, performance on the production build
- database attacks through local PostgREST: 137-function role matrix, 66-command permission gates, direct table writes,
  maker-checker and replay, sign-out, role removal and step-up window, privileged reads
- capabilities: booking.transition, payout.mark-paid, customer.clear-profile, audit.search, feature-flag.set,
  dashboard.overview, analytics.funnel in-progress -> implemented, reviewed. refund.retry, ropa.view and 11 direct-write
  commands contested with paired gaps. 95 others left in-progress (capability-record-deficits.txt)
- screens: 21 accessibilityStatus implemented, all 38 responsive true, forbidden/loading added where seen
- crossCutting: mfaForPrivilegedRoles, sessionRevocation, stepUpForSensitiveActions, tamperProtected,
  privilegedReadsWhenRequired, capturesSafeBeforeAfter, riskClassifiedActions, sensitiveFieldsClassified set true with
  evidence; experience evidence added
- placeholder scan: 17 hits, all false positives on fixed gaps; replaced by scanner-clean excerpts (scan-excerpts/)

verified
- validate --phase release: before exit 1 / 299 errors, after exit 1 / 211 (validate-before.txt, validate-after.txt)
- coverage: before exit 1 / 6, after exit 1 / 4 (coverage-before.txt, coverage-after.txt)
- quality gates: build, typecheck, lint, tests passed; browser, accessibility, security, performance failed (reasons in manifest)

decided
- performance gate failed, not pending: measured well inside 2.5 s LCP, but only at fixture volume and with no owner budget
- security gate stays failed: every executed check held, but critical false success and high refund-outcome gaps are open

found
- direct-table-updates-report-success-when-the-row-policy-refuses  critical
- refused-reads-shown-with-an-empty-state, axe-critical-unlabelled-controls-on-services-and-integrations,
  axe-contrast-and-scroll-region-failures, read-only-roles-see-enabled-write-controls, capability-records-incomplete-for-release,
  manifest-roles-do-not-model-console-roles, coverage-structural-orphans, admin-observability-has-no-instrumentation  medium
- finance-employees-screen-fires-refused-reads, console-refusals-say-administrator-access-required,
  dev-server-metadata-routes-break-on-apostrophe-path, ropa-register-ships-in-the-client-bundle, static-screens-lack-required-states  low
- fixed with evidence: admin-sessions-have-no-mfa-or-step-up, no-separation-of-duties, iban-unmasked-to-every-admin,
  referral-and-loyalty-values-self-approved-and-unbounded

incident
- priming the harness on /robots.txt took the shared dev server down (500 on every route) for about 6 minutes; it recovered
  without a restart. Harness now primes on /file.svg. Filed as a low gap and feedback.

next
- implementer under a new claim: fix direct-table-updates-report-success-when-the-row-policy-refuses (services, branches,
  integrations, payment methods, packages), then a different agent re-runs `node harness/qa-browser-harness.mjs falsesuccess`

blocked-on
- owner: hosted Auth settings, ZATCA verification, rewards counsel, second owner, notice sender, off-database archive,
  finance holders, DPO, schedules, performance budget
- test accounts: qa.* in supabase/.temp/local-admin-logins.txt and qa-release-accounts.json (gitignored, local only)
