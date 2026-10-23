# Release closure tasks — proposed 2026-10-24

Existing approved requirements remain authoritative. Planning is complete; the implementation tasks below are not checked off by this audit. Full release remains failed330errors/42warnings.

## RG-00: Finish credential containment and verify replacement authentication

- [ ] Independently accepted closure.

Owner: security + founder. Dependencies: None.

Likely scope: redacted incident receipt; provider authorizations.

Acceptance:

- [ ] All three reset authorizations verified removed; exposed credential is rejected without printing its value.
- [ ] Replacement CLI identity and non-writing Git authentication succeed using secure storage.
- [ ] Independent incident review records remaining limitations; no exposed value in project artifacts.

Verification: GitHub authorization lists; sanitized /user and gh status; noninteractive push --dry-run.

Holds: founder completes private sign-in; no new repository/app installation permissions.

## RG-01: Repair bounded scanner contexts

- [ ] Independently accepted closure.

Owner: validator implementer; different security reviewer. Dependencies: RG-00.

Likely scope: tools/adminwright/scripts/evidence_context.py; tools/adminwright/tests/test_evidence_context*.py.

Acceptance:

- [ ] Reproduce crypto identifiers, zero counters and negative assertions as false alerts before the fix.
- [ ] Real fabricated release data, nonzero unfinished work, inert assertions and hostile negations still fail.
- [ ] Existing136 tests remain; fresh independent adversarial acceptance and exact before/after finding delta.

Verification: python -X utf8 -m unittest discover -s tools/adminwright/tests; project-local release and coverage.

Holds: do not rename proof comments, scrub logs, blanket-allow test files or lower the regulated profile.

## RG-02: Reconcile historical gate and successor evidence

- [ ] Independently accepted closure.

Owner: evidence architect + independent reviewer. Dependencies: RG-01.

Likely scope: held-checkout evidence bindings; tools/adminwright/PROVENANCE.json; manifest evidence metadata.

Acceptance:

- [ ] Keep historical failed logs and their original pins.
- [ ] Resolve the one nested historical scanner finding through truthful successor evidence.
- [ ] Restore missing worklog pointers only after reading actual artifacts; preserve raw versus LF distinctions.

Verification: hash/chronology checks; plan, coverage and release delta.

Holds: local synthetic only; independent acceptance before status changes.

## RG-03: Prove the local HQ evidence bindings safely

- [ ] Independently accepted closure.

Owner: HQ QA; separate security reviewer. Dependencies: RG-01, RG-02.

Likely scope: web_platform/tests-browser/hq-local-acceptance.mjs; HQ agent/source/Council focused tests; relevant manifest evidence bindings.

Acceptance:

- [ ] Prove agent-capability inspection, source knowledge and Council-record operations with actual assertions.
- [ ] Nine rejected browser-test references resolve without inventing missing files.
- [ ] Browser runner refuses the real preview and uses only a positively marked disposable synthetic root/profile.

Verification: separate synthetic browser acceptance; source-linked assertion inventory; release evidence delta.

Holds: never use default3113/current cookies, real HQ data, seat, launcher or live backup/restore.

Checkpoint: focused tests, source-pinned independent review and truthful gate delta before accepting the preceding slices.

## RG-04: Independently accept service and branch commands

- [ ] Independently accepted closure.

Owner: admin domain QA/security. Dependencies: RG-00.

Likely scope: existing service and branch commands; focused synthetic database tests; capability review receipts.

Acceptance:

- [ ] Re-read current fixes before proposing changes; verify permitted and denied roles/object scopes.
- [ ] Prove atomic transitions, honest failure/empty states and immutable audit events.
- [ ] A separate reviewer accepts only named unchanged source pins and fresh tests.

Verification: local synthetic SQL/command tests; focused AR/EN browser checks.

Holds: local synthetic only; independent acceptance before status changes.

## RG-05: Independently accept integration, payment-method and package controls

- [ ] Independently accepted closure.

Owner: admin domain QA/security. Dependencies: RG-04.

Likely scope: existing integration commands; existing payment-method commands; package list/toggle evidence.

Acceptance:

- [ ] Review each capability as a separate small slice; prove per-target authorization and failure rollback.
- [ ] Reconcile stale integration narratives against actual source and adopted decisions.
- [ ] No actual provider call, money movement, notice send or credential publication.

Verification: isolated synthetic command/negative tests; focused interface tests.

Holds: local synthetic only; independent acceptance before status changes.

## RG-06: Resolve the contested profile-clear capability

- [ ] Independently accepted closure.

Owner: privacy QA + independent security. Dependencies: RG-04.

Likely scope: customer.clear-profile command; existing privacy/legal-hold tests; review disposition.

Acceptance:

- [ ] Use adopted legal decisions; prove legal holds, restricted scope and applicable maker/checker.
- [ ] Denied attempts preserve data and emit appropriate audit evidence.
- [ ] Do not mark the disputed capability accepted without independent source and test review.

Verification: synthetic role and legal-hold matrix.

Holds: no real erasure, legal reinterpretation or new sensitive-data permission.

Checkpoint: focused tests, source-pinned independent review and truthful gate delta before accepting the preceding slices.

## RG-07: Reproduce private checkout-wire lifecycle gap

- [ ] Independently accepted closure.

Owner: privacy/security implementer + independent reviewer. Dependencies: RG-00.

Likely scope: durable checkout wire storage; existing privacy lifecycle commands/tests.

Acceptance:

- [ ] Reproduce the recorded PII lifecycle omission against current synthetic SQL.
- [ ] Document actual affected fields/access and reuse already adopted lifecycle rules.
- [ ] Fix only proven local defects; unresolved retention/legal choices remain explicit.

Verification: focused synthetic SQL lifecycle and access tests.

Holds: no invented retention period, hosted mutation or real customer/payment data.

## RG-08: Close durable/unknown checkout evidence in stages

- [ ] Independently accepted closure.

Owner: checkout implementer + independent QA. Dependencies: RG-07.

Likely scope: durable attempt recovery; read-only held-checkout queue; sandbox acceptance specification.

Acceptance:

- [ ] Verify timeout, crash, duplicate/concurrent session and idempotent outcomes using local fixtures.
- [ ] Unknown provider outcomes remain held; queue/handoff cannot initiate capture/refund/retry.
- [ ] Identify exact hosted Deno/PostgREST/provider proof still needed and request a named sandbox only when required.

Verification: local multi-session/negative recovery tests; separate approved sandbox acceptance later.

Holds: no financial transaction, real gateway reconciliation, provider write or commercial-rule change.

## RG-09: Complete screen state, responsive and accessibility proof

- [ ] Independently accepted closure.

Owner: UX implementer + independent UX/QA. Dependencies: RG-03, RG-04, RG-05, RG-06.

Likely scope: nine state metadata gaps; eight empty test bindings; 22 accessibility and two responsive findings.

Acceptance:

- [ ] Inspect current behavior first; add honest loading/empty/error/forbidden states only where absent.
- [ ] Verify keyboard, AR/EN RTL, contrast, focus and narrow viewport in synthetic accounts.
- [ ] Bind meaningful tests and accept review per domain rather than bulk toggling screen status.

Verification: focused browser/a11y tests at mobile and desktop widths; component lint/build.

Holds: local synthetic only; independent acceptance before status changes.

## RG-10: Prove audit, observability, performance and security

- [ ] Independently accepted closure.

Owner: platform QA + independent security. Dependencies: RG-03, RG-08.

Likely scope: cross-cutting audit/observability evidence; dependency reachability assessment; six failed quality gates.

Acceptance:

- [ ] Demonstrate actor/target/reason/result, correlation and privileged mutation coverage in synthetic traces.
- [ ] Assess pinned dependency advisories and actual reachable exposure before targeted changes.
- [ ] Record bounded performance/recovery/security results and remaining gaps without inferring platform-wide acceptance.

Verification: local trace/audit tests; primary-vendor advisory review; bounded performance/security checks.

Holds: no paid monitoring, external telemetry, broad forced upgrades or production job activation.

Checkpoint: focused tests, source-pinned independent review and truthful gate delta before accepting the preceding slices.

## RG-11: Reconcile adopted terms and prepare missing CEO decisions

- [ ] Independently accepted closure.

Owner: product/finance/risk proposals. Dependencies: RG-02.

Likely scope: 16 assumed decisions; 12 blocked HIGH gaps; docs/legal/2026-10-10-adopted-decisions.md.

Acceptance:

- [ ] Recover approved source for technical/adopted rules; do not send16 routine technical questions to the CEO.
- [ ] Present concrete missing acquisition terms/event, refund allocation and provider acceptance choices with options and consequences.
- [ ] Keep held access, legal, notice/archive/provider dependencies separately owned with no implied approval.

Verification: decision-to-source matrix; independent business-rule consistency review.

Holds: no numeric commission/VAT invention, permission grants, legal certification or financial execution.

## RG-12: Prepare named hosted acceptance contracts

- [ ] Independently accepted closure.

Owner: integration architect + QA. Dependencies: RG-08, RG-11.

Likely scope: environment/credential contract; auth/session settings acceptance; licensed provider sandbox requirements.

Acceptance:

- [ ] Specify each test environment, data boundary, exact provider operation, cleanup and expected evidence.
- [ ] Request credentials securely only for the named approved integration.
- [ ] Obtain separate permission for any held external write, new service, business role or financial sandbox operation.

Verification: read-only contract review; execution only after necessary explicit authorization.

Holds: Azure deferred; no global auth setting change or production/provider write.

## RG-13: Run final same-revision release acceptance

- [ ] Independently accepted closure.

Owner: independent QA/security. Dependencies: RG-02, RG-03, RG-04, RG-05, RG-06, RG-07, RG-08, RG-09, RG-10, RG-11, RG-12, RG-14.

Likely scope: current source and manifest; all release evidence.

Acceptance:

- [ ] Every original finding has source-linked disposition; no unresolved critical/high omission.
- [ ] Project-local regulated release0, coverage0, build/typecheck/lint/test success and meaningful browser/quality acceptance.
- [ ] Record installed-tool compatibility separately; do not claim production-ready while either required gate remains unresolved.

Verification: project-local and required installed release/coverage; npm run typecheck:mobile; npm run build --workspace=web_platform; web eslint/native tests and approved isolated browser/SQL suites.

Holds: a passing gate does not authorize production merge/deploy, real HQ migration, activation or transactions.

## RG-14: Reconcile unused static declarations

- [ ] Independently accepted closure.

Owner: manifest maintainer + independent reviewer. Dependencies: RG-02.

Likely scope: 42 declared-static-unused warnings.

Acceptance:

- [ ] Trace each warning to actual use and prior approver.
- [ ] Remove obsolete metadata only with provenance; preserve still-required static values and approval.
- [ ] Do not call warnings false positives without proof or add runtime constants merely to satisfy scanning.

Verification: manifest/static usage mapping; plan/coverage/release warning delta.

Holds: local synthetic only; independent acceptance before status changes.

## Remaining domain acceptance slices

Each slice below precedes RG-13. At most three original unresolved status findings are assigned to one slice. RG-13 has no unresolved finding dumped into it.

### RG-15-access-governance-01

- [ ] Independent acceptance completed.

Owner: security implementer + separate security/QA. Dependencies: RG-00, RG-02.

Named scope:

- `entities[admin-governance].capabilities[gov.approvals]`
- `entities[admin-governance].capabilities[gov.audited-reads]`
- `entities[admin-governance].capabilities[gov.break-glass]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real grants, second-owner activation, IBAN reveal or hosted MFA/session setting changes.

### RG-15-access-governance-02

- [ ] Independent acceptance completed.

Owner: security implementer + separate security/QA. Dependencies: RG-00, RG-02.

Named scope:

- `entities[admin-governance].capabilities[gov.console-roles]`
- `entities[admin-governance].capabilities[gov.iban-change]`
- `entities[admin-governance].capabilities[gov.iban-reveal]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real grants, second-owner activation, IBAN reveal or hosted MFA/session setting changes.

### RG-15-access-governance-03

- [ ] Independent acceptance completed.

Owner: security implementer + separate security/QA. Dependencies: RG-00, RG-02.

Named scope:

- `entities[admin-governance].capabilities[gov.mfa]`
- `entities[role-assignment].capabilities[role.directory]`
- `entities[role-assignment].capabilities[role.set-administrator]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real grants, second-owner activation, IBAN reveal or hosted MFA/session setting changes.

### RG-15-marketplace-operations-01

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[country].capabilities[country.configure]`
- `entities[country].capabilities[country.list]`
- `entities[customer].capabilities[customer.detail]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-02

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[customer].capabilities[customer.list]`
- `entities[customer].capabilities[customer.suspend]`
- `entities[customer].capabilities[customer.verify-phone]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-03

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[employee].capabilities[employee.list]`
- `entities[feature-flag].capabilities[feature-flag.list]`
- `entities[inventory-operations].capabilities[inventory.adjust]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-04

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[inventory-operations].capabilities[inventory.catalog]`
- `entities[inventory-operations].capabilities[inventory.chain-read]`
- `entities[inventory-operations].capabilities[inventory.delegation]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-05

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[inventory-operations].capabilities[inventory.supply-read]`
- `entities[inventory-operations].capabilities[inventory.transfer]`
- `entities[operations-dashboard].capabilities[activity.feed]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-06

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[platform-settings].capabilities[settings.api-limits]`
- `entities[platform-settings].capabilities[settings.list]`
- `entities[platform-settings].capabilities[settings.platform]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-07

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[platform-settings].capabilities[settings.vat-rate]`
- `entities[provider].capabilities[provider.approve]`
- `entities[provider].capabilities[provider.list]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-08

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[provider].capabilities[provider.notes]`
- `entities[provider].capabilities[provider.reject]`
- `entities[provider].capabilities[provider.suspend]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-09

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `entities[provider].capabilities[provider.vat-status]`
- `entities[review].capabilities[review.hide]`
- `entities[review].capabilities[review.moderate-queue]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-marketplace-operations-10

- [ ] Independent acceptance completed.

Owner: marketplace implementer + separate domain QA. Dependencies: RG-02, RG-04.

Named scope:

- `workQueues[provider-onboarding]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real customer/provider mutation, sensitive-data permission or business employee activation.

### RG-15-privacy-01

- [ ] Independent acceptance completed.

Owner: privacy implementer + separate privacy/security QA. Dependencies: RG-02, RG-06.

Named scope:

- `entities[customer].capabilities[customer.data-request]`
- `entities[customer].capabilities[customer.submit-data-request]`
- `entities[privacy-incident].capabilities[incident.list]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real PII/erasure/export, retention invention or new permitted data scope.

### RG-15-privacy-02

- [ ] Independent acceptance completed.

Owner: privacy implementer + separate privacy/security QA. Dependencies: RG-02, RG-06.

Named scope:

- `entities[privacy-incident].capabilities[incident.register]`
- `entities[privacy-request].capabilities[intake.health-retention-and-gate]`
- `entities[privacy-request].capabilities[privacy.copy-export]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real PII/erasure/export, retention invention or new permitted data scope.

### RG-15-privacy-03

- [ ] Independent acceptance completed.

Owner: privacy implementer + separate privacy/security QA. Dependencies: RG-02, RG-06.

Named scope:

- `entities[privacy-request].capabilities[privacy.correction]`
- `entities[privacy-request].capabilities[privacy.deadline-and-refusal]`
- `entities[privacy-request].capabilities[privacy.deletion-ledger]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real PII/erasure/export, retention invention or new permitted data scope.

### RG-15-privacy-04

- [ ] Independent acceptance completed.

Owner: privacy implementer + separate privacy/security QA. Dependencies: RG-02, RG-06.

Named scope:

- `entities[privacy-request].capabilities[privacy.deletion]`
- `entities[privacy-request].capabilities[privacy.legal-hold]`
- `entities[privacy-request].capabilities[privacy.queue]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real PII/erasure/export, retention invention or new permitted data scope.

### RG-15-privacy-05

- [ ] Independent acceptance completed.

Owner: privacy implementer + separate privacy/security QA. Dependencies: RG-02, RG-06.

Named scope:

- `entities[privacy-request].capabilities[privacy.request-intake]`
- `entities[processing-register].capabilities[ropa.view]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real PII/erasure/export, retention invention or new permitted data scope.

### RG-15-money-controls-01

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[dispute].capabilities[dispute.list]`
- `entities[dispute].capabilities[dispute.resolve]`
- `entities[fee-rule].capabilities[fee-rule.list]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-02

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[fee-rule].capabilities[fee-rule.save]`
- `entities[fee-rule].capabilities[fee.effective-display]`
- `entities[fee-rule].capabilities[money.pending-change]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-03

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[ledger-entry].capabilities[ledger.adjustment]`
- `entities[ledger-entry].capabilities[ledger.export]`
- `entities[ledger-entry].capabilities[ledger.list]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-04

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[ledger-entry].capabilities[ledger.release-payout]`
- `entities[ledger-entry].capabilities[ledger.vat-report]`
- `entities[ledger-entry].capabilities[money.append-only]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-05

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[payout-request].capabilities[payout.approve]`
- `entities[payout-request].capabilities[payout.list]`
- `entities[payout-request].capabilities[payout.reject]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-06

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[reconciliation].capabilities[reconciliation.daily]`
- `entities[reconciliation].capabilities[reconciliation.overview]`
- `entities[reconciliation].capabilities[reconciliation.resolve-break]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-07

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[refund-request].capabilities[refund.check-with-tap]`
- `entities[refund-request].capabilities[refund.execute]`
- `entities[refund-request].capabilities[refund.list]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-08

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `entities[refund-request].capabilities[refund.retry]`
- `workQueues[failed-payment]`
- `workQueues[payout-approval]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-money-controls-09

- [ ] Independent acceptance completed.

Owner: payments implementer + separate financial-control QA. Dependencies: RG-00, RG-02, RG-11.

Named scope:

- `workQueues[refund-arbitration]`
- `workQueues[webhook-failure]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: synthetic financial records only; no provider call, payment/refund/payout, historical real reconciliation or commercial-rate changes.

### RG-15-growth-communications-01

- [ ] Independent acceptance completed.

Owner: operations implementer + separate QA/security. Dependencies: RG-02, RG-11.

Named scope:

- `entities[notification-broadcast].capabilities[notification.broadcast]`
- `entities[notification-broadcast].capabilities[notification.dispatch]`
- `entities[notification-broadcast].capabilities[notification.log]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real message, WhatsApp/provider write, reward enablement, price change or new service.

### RG-15-growth-communications-02

- [ ] Independent acceptance completed.

Owner: operations implementer + separate QA/security. Dependencies: RG-02, RG-11.

Named scope:

- `entities[promotional-code].capabilities[coupon.list]`
- `entities[promotional-code].capabilities[coupon.toggle]`
- `entities[promotional-code].capabilities[coupon.upsert]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real message, WhatsApp/provider write, reward enablement, price change or new service.

### RG-15-growth-communications-03

- [ ] Independent acceptance completed.

Owner: operations implementer + separate QA/security. Dependencies: RG-02, RG-11.

Named scope:

- `entities[reward-program].capabilities[reward-program.enable]`
- `entities[reward-program].capabilities[reward-program.overview]`
- `entities[sponsored-placement].capabilities[sponsored.configure]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real message, WhatsApp/provider write, reward enablement, price change or new service.

### RG-15-growth-communications-04

- [ ] Independent acceptance completed.

Owner: operations implementer + separate QA/security. Dependencies: RG-02, RG-11.

Named scope:

- `entities[sponsored-placement].capabilities[sponsored.overview]`
- `entities[sponsored-placement].capabilities[sponsored.void-attribution]`
- `entities[support-contact].capabilities[support.contact]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real message, WhatsApp/provider write, reward enablement, price change or new service.

### RG-15-growth-communications-05

- [ ] Independent acceptance completed.

Owner: operations implementer + separate QA/security. Dependencies: RG-02, RG-11.

Named scope:

- `entities[whatsapp-channel].capabilities[whatsapp.overview]`
- `entities[whatsapp-channel].capabilities[whatsapp.verify-channel]`

Acceptance:

- [ ] Re-read each named capability/queue source and adopted decisions; classify code defect versus missing review/evidence without rebuilding existing fixes.
- [ ] Add or run meaningful focused synthetic success/forbidden/object-scope/failure/audit tests; repair only reproduced defects with required command/idempotency/hold controls.
- [ ] A different reviewer accepts exact source pins and results; blocked or deferred capability gets a truthful decision/dependency record, never a bulk implemented/reviewed promotion.

Verification: per-capability local synthetic command/DB/interface suite; source-to-test assertion matrix; independent disposition and regulated gate delta.

Holds: no real message, WhatsApp/provider write, reward enablement, price change or new service.

## RG-16-booking-operations: Booking reads, history and hold release

- [ ] Independent acceptance completed.

Owner: booking implementer + independent operations/security QA. Dependencies: RG-00, RG-02.

Named scope: booking.detail, booking.list, booking.release-holds.

Acceptance:

- [ ] Inspect current booking detail/list/hold-release source against approved requirements; reproduce any unaudited invoice read, incomplete history or missing server/test/audit binding recorded in the manifest.
- [ ] Prove object-scoped permitted/denied reads, truthful detail/history and audited privileged access; hold release has atomic preconditions, idempotency and negative concurrency tests.
- [ ] Separate review accepts exact sources and synthetic results for each capability, with real defects and missing evidence distinguished; no real booking mutation.

Verification: focused synthetic booking read/history/hold-release tests; per-role negative and audit assertions; independent source/test binding disposition.

Holds: no real customer/invoice data, hosted hold release, financial operation or new sensitive-data permission.
