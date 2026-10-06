# worklog qa-claude-release-gate
role: qa
mode: audit (independent release-gate pass over the repair work)    profile: regulated
started: 2026-10-06    ended: 2026-10-06
branch: claude-code (primora-fix). No git write, no hosted Supabase, no application or migration file edited. Only tests, evidence files and the manifest (through add and set) were written.

claims-held: none. Claim records the claimer as capability owner and takes an exclusive lock, which collides with the reviewer-identity rule (feedback qa-claim-instruction-conflicts-with-independent-review). The audited domain is named in agents[].notes.
claims-released: n/a

## did
- Ran every gate: test:db 167/167 (129 existing + 38 new), test:inventory 10/10, web 149/149, test:security-core, test:admin-controls, test:p3-compat, typecheck:mobile, lint (0 errors), web build, all exit 0.
- Added supabase/tests/db/qa_adversarial.test.mjs (38 executing tests, in the suite) and supabase/tests/db/qa_open_defects.repro.mjs (18 reproductions of open defects, deliberately outside the suite, all fail today). Mutation-checked the suite in a scratch copy: 10 of 10 weakenings caught.
- Attacked the database command surface (guessed ids, replays, wrong roles, blank reasons, direct writes, cross-provider and anonymous reads, pagination clamps, export record) and read all 13 edge functions.
- Browser pass against the verification-only stand-in (never the hosted project): 22 admin routes, dialogs by keyboard, deep links, states, phone width, Arabic.
- Re-checked the gaps the implementer marked fixed: 3 re-opened, 11 annotated as independently verified, 9 partly-fixed remainders confirmed honest.
- Filed 25 gaps (1 critical, 7 high, 10 medium, 7 low; one medium is blocked on legal), 6 feedback entries, quality gates, review status.

## verified (command, evidence, result)
- npm run test:db / test:inventory / web tests / source guards: .admin-console/evidence/qa-claude-release-gate/gate-*.txt  pass
- npm run build, lint, typecheck:mobile: gate-build-lint-typecheck.txt  pass (lint 387 + 14 warnings, 0 errors)
- qa_adversarial.test.mjs: adversarial-suite-run.txt  pass 38/38; mutation-checks.txt  10/10 caught
- qa_open_defects.repro.mjs: open-defect-repro-run.txt  fail 18/18 as intended
- database-adversarial-probes.txt, edge-function-read.txt, browser-session-stand-in.txt: what each attack returned
- validate --phase release: exit 1, 234 errors. coverage: exit 1, 11 errors (unchanged). Validate rose from 229 because the new and re-opened gaps are real unresolved findings.

## decided
- No capability set to reviewed: nothing was independently strong enough while an open gap names it. booking.transition and audit.search set to contested (paired gaps booking-commands-accept-blank-reasons-at-the-database and admin-direct-writes-to-money-tables-leave-no-audit).
- Gates: build, typecheck, lint, tests passed; security and accessibility failed; browser and performance left pending with reasons (admin role only, stand-in only; nothing measured).
- No gap marked accepted. The ZATCA credit-note question is filed blocked for a human.

## found (highlights; all in gaps[])
- critical: provider-direct-booking-writes-bypass-cancel-refund-and-time-guards (provider cancels a paid booking directly: no refund, deposit stays payable to the provider); admin-direct-writes-to-money-tables-leave-no-audit re-opened (tax invoices, reconciliation runs, fee invoices, templates unaudited; the coverage test is circular)
- high: payout-iban-can-be-rewritten-by-an-admin-before-release re-opened (admin INSERT of a payout request plus release); admin-create-refund-request-replay-creates-a-second-refund; process-payout-edge-function-releases-money-without-allocation-or-audit; issued-tax-invoices-can-be-edited-and-deleted-by-an-administrator; ledger-and-payout-commands-use-native-dialogs-and-take-no-reason; administrator-role-grants-have-no-screen-reason-or-last-admin-guard; staff-leave-reasons-readable-by-every-signed-in-account; operators-cannot-find-a-booking-outside-the-newest-500
- re-opened medium: admin-phone-drawer-not-keyboard-operable (aria-modal without a focus trap)
- the rest: see gap-report

## next
Implementer pass under a new claim, in this order: (1) bookings UPDATE policy and status-transition preconditions (critical), (2) audit coverage by behaviour on every administrator-writable table and invoice immutability, (3) remove the admin branch of the payout INSERT policy and delete process-payout and request-payout, (4) idempotency key for admin_create_refund_request, (5) one shared reason check across all reasoned commands, then move ledger, disputes and reviews onto CommandDialog. Move each fixed reproduction from qa_open_defects.repro.mjs into qa_adversarial.test.mjs. A different agent then re-reviews.

## blocked-on
Owner decisions already on gaps (IBAN visibility, separation of duties, PDPL erasure scope, loyalty limits, MFA) plus ZATCA credit notes. Not verifiable here: hosted schema and policies, hosted Auth settings, Deno runtime behaviour of any edge function, provider and customer roles in a browser, screen readers, performance.

## Round 3 (2026-10-06): independent verification of the implementer's fixes
role: qa    mode: audit    profile: regulated    agent id unchanged (qa-claude-release-gate)
claims-held: none. No application, migration or function file edited. Only tests, evidence files and the manifest (through add and set) were written. Both servers started for the browser pass were stopped and ports 3030 and 54397 confirmed free.

did
- Re-ran every gate: test:db 210/210 (the implementer's 197 plus 13 new in qa_round3_verification.test.mjs), test:inventory 10/10, web 156/156, test:security-core, test:admin-controls, test:p3-compat, typecheck:mobile, lint (0 errors; 390 + 14 warnings), web build: all exit 0. validate --phase release exit 1 (227 errors), coverage exit 1 (12 errors), validate --phase plan exit 0.
- Attacked the new surfaces by executing them: every role against the bookings policies, invoices against foreign-key actions and the service role, old function overloads and grants, set_user_role, request_provider_payout, admin_booking_directory (Riyadh midnight, hostile search text), staff time off against booking, the address command by role, the audit trigger on admin-run commands and bulk writes. Searched web, mobile and edge-function code for direct booking, time-off and payout writes (none remain that would silently change zero rows).
- Added supabase/tests/db/qa_round3_verification.test.mjs (13 executing tests, in the suite, mutation-checked 8 of 8) and 5 new open-defect cases in qa_open_defects.repro.mjs (7 cases now, all fail today).
- Browser (stand-in only): ledger mark-paid and reject dialogs, bookings directory (search, paging, bad date range), phone drawer at 375 px. The stand-in does not serve disputes, reviews or the ledger table, so the dispute dialog, review dialog and release-item dialog were read in source only.
- Re-checked every gap the implementer marked fixed: 15 verified and annotated, 2 re-opened, 2 partly fixed confirmed honest.

verified closed (annotated, status fixed): provider-direct-booking-writes-bypass-cancel-refund-and-time-guards, admin-direct-writes-to-money-tables-leave-no-audit (coverage), issued-tax-invoices-can-be-edited-and-deleted-by-an-administrator, admin-create-refund-request-replay-creates-a-second-refund, process-payout-edge-function-releases-money-without-allocation-or-audit, ledger-and-payout-commands-use-native-dialogs-and-take-no-reason, payout-iban-can-be-rewritten-by-an-admin-before-release, staff-leave-reasons-readable-by-every-signed-in-account, booking-commands-accept-blank-reasons-at-the-database, get-booking-address-secure-fails-for-every-caller, operators-cannot-find-a-booking-outside-the-newest-500, admin-phone-drawer-not-keyboard-operable, calculate-travel-edge-function-is-unauthenticated-and-spends-a-paid-key, manifest-ledger-and-payout-capabilities-describe-code-that-has-changed.
re-opened: audit-redaction-is-a-short-deny-list (now high: the all-table trigger copies message variables with customer names, customer notes and leave reasons into the permanent log), refused-booking-commands-reveal-whether-a-booking-id-exists (reschedule_booking, customer_confirm_attendance and generate_zatca_tax_invoice still differ).
partly fixed, confirmed honest and left open: administrator-role-grants-have-no-screen-reason-or-last-admin-guard (command verified; screen and second approver missing), reason-prompts-do-not-name-target-or-impact.
new gaps: bulk-administrator-writes-write-one-audit-row-per-affected-row (medium), provider-registration-review-still-asks-through-bare-native-prompts (medium; the guard regex misses bare prompt()), reason-length-rules-differ-across-administrator-commands (low), staff-can-approve-their-own-leave (low), ledger-and-payout-sibling-capabilities-keep-pre-fix-notes (low).
capability review: reviewed ledger.release-payout, payout.approve, payout.mark-paid (command, replay, reason, audit and the browser dialog verified; residual maker-checker and MFA stay on their owner-decision gaps); contested booking.transition and audit.search (paired with audit-redaction-is-a-short-deny-list and bulk-administrator-writes-write-one-audit-row-per-affected-row).
quality gates: build, typecheck, lint, tests passed (round 3 evidence); security and accessibility failed; browser and performance pending, with reasons.
feedback added: guard tests for banned calls must match bare calls; QA-owned tests edited by the implementer need a diff review.
note on edits to QA tests: the implementer adapted qa_adversarial.test.mjs (allow-list gained get_available_slots, reason arguments, an owner's direct booking write now changes 0 rows instead of raising). I re-read the edited assertions (the allow-list, the reason arguments, the owner's direct write) and the file still passes 38/38; the edits are not diffed against the original because the repository has no history of the file, which is why the feedback entry asks for a changelog per test file.

validate and coverage errors that are the implementer's to fix next: audit.search is critical and has no recovery declared (high-risk-controls); booking.transition cites supabase/tests/db/booking.test.mjs, which contains a word the content scan reserves, in a fixture helper, so the scan rejects it (the content-scan rule); capability-unreviewed for the two contested capabilities; the 89 release-status errors, screen state, accessibility and responsive rules, cross-cutting evidence and the owner decisions are unchanged.

next
Implementer pass under a new claim, in this order: (1) replace the name-pattern audit redaction with per-table allow-lists and make bulk writes inside a console command record one summary row (audit-redaction-is-a-short-deny-list, bulk-administrator-writes-write-one-audit-row-per-affected-row); (2) answer a foreign booking like a missing one in reschedule_booking, customer_confirm_attendance and generate_zatca_tax_invoice; (3) move the provider CR review onto CommandDialog and widen the native-dialog guard; (4) one shared three-character reason check; (5) split the employee_time_off policy so staff cannot approve themselves; (6) update the four ledger and payout sibling capabilities and declare recovery on audit.search; (7) cite a test file without the reserved word on booking.transition. Move each fixed reproduction from qa_open_defects.repro.mjs into a .test.mjs file.

blocked-on
Unchanged owner decisions: IBAN visibility, maker-checker and MFA, PDPL scope, loyalty limits, ZATCA credit notes, direct money-table writes. Not verifiable here: hosted schema and policies, Auth settings, Deno runtime behaviour, provider and customer roles in a browser, the ledger release-item, dispute and review dialogs in a browser, screen readers, performance budgets.

## Round 4 (2026-10-06): re-verification of the audit allow-list migration (20261005190000)
role: qa    mode: audit    profile: regulated    claims-held: none. Only a repro file, evidence and the manifest (through set and add) were written; no application or migration file edited.
gates re-run, all exit 0: test:db 217/217, test:inventory 10/10, web 156/156, security-core, admin-controls, p3-compat, typecheck:mobile, lint (0 errors; 390 + 14 warnings), build. validate --phase release exit 1 (227 errors), coverage exit 1 (11).
verified by executing: customer names in message variables, customer notes and leave reasons no longer enter the audit log; a 500-row administrator insert or delete writes 6 audit rows; foreign against missing booking answers equal for reschedule_booking, customer_confirm_attendance and generate_zatca_tax_invoice and the owner's reschedule still works; moderate_review, reject_provider_application and resolve_booking_dispute refuse a one-character reason; the leave trigger lets the owner, administrators and the service role approve and refuses the staff member; no bare prompt() remains in the provider screen and the guard regex matches bare forms; the payout and ledger commands still write their reason-bearing audit entries.
broke it: (1) invoices and integrations are on the full-value list, so an administrator generating a tax invoice logs the buyer's name and a change of a webhook or base URL logs the URL with any token in it; (2) a staff member can edit the dates of a leave row the owner already approved, so the leave trigger (status changes only) does not stop widening. Residual by design: the bulk counter spans tables within one transaction, and an audit reason set by one command stays on later writes in the same transaction (only reachable inside one command, which writes its own audit entry).
gaps: re-opened audit-redaction-is-a-short-deny-list (high) and staff-can-approve-their-own-leave (low); confirmed closed bulk-administrator-writes-write-one-audit-row-per-affected-row, refused-booking-commands-reveal-whether-a-booking-id-exists, reason-length-rules-differ-across-administrator-commands, provider-registration-review-still-asks-through-bare-native-prompts. New repro cases R4-1 and R4-2 in qa_open_defects.repro.mjs (4 cases fail today).
capability review: booking.transition reviewed (reasons, foreign-booking answers, no personal values in its audit rows, direct write path closed); audit.search stays contested (the two audit leaks above, and the critical capability declares no recovery); ledger.release-payout, payout.approve and payout.mark-paid had been reset to unreviewed by the implementer's edits and were re-cleared after re-running their commands against the new trigger.
gates: build, typecheck, lint, tests passed; security and accessibility failed; browser and performance pending (unchanged; no browser pass this round).
next: exclude buyer_name and the URL columns from the full-value tables; make the leave trigger refuse date and employee changes on an approved row by a non-approver; declare recovery on audit.search; cite a test file without the reserved word on booking.transition.

## Round 5 (2026-10-06): verification of the round 4 fixes
claims-held: none. Only the evidence file r5-round4-fix-probes.txt, this section and the manifest (through set) were written.
gates re-run, all exit 0: test:db 219/219, test:inventory 10/10, web 156/156, security-core, admin-controls, p3-compat, typecheck:mobile, lint (0 errors), build. validate --phase release exit 1 (222 errors), coverage exit 1 (11).
verified: my two audit reproductions (invoice buyer name, webhook and base URL secrets) and the leave-widening reproduction now pass; the leave trigger refuses staff widening or moving approved leave and still lets staff edit their own pending row and a reason, and the owner, administrator and service role change dates; the new pattern hides only invoices.buyer_name and buyer_vat_number on money tables. The signed-in column-visibility reproduction still fails (public-read-policies-expose-internal-provider-and-staff-columns).
gaps annotated as verified closed: audit-redaction-is-a-short-deny-list, staff-can-approve-their-own-leave.
review status restored by me after the coordinator's script reset it: reviewed for booking.transition, ledger.release-payout, payout.approve and payout.mark-paid (re-run against the changes); audit.search moved from contested to reviewed because the two audit leaks I contested it for are closed and it now declares recovery. What stays outside that verdict, tracked on open gaps: audit rows from service-key edge-function paths, refused attempts not recorded, and no tamper evidence beyond row-level security.
remaining open high gaps are owner decisions plus public-read-policies-expose-internal-provider-and-staff-columns and refund-outcomes-that-cannot-be-known-have-no-recovery; no browser pass this round (browser and performance gates stay pending, security and accessibility stay failed).
