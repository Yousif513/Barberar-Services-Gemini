# impl-priv-claude — PRIV package (2026-10-11)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: the "Final decision text" of Q1, Q2 (incl. 2.4, 2.5, 2.6),
X1, X2 and X3 item 6 in `docs/legal/2026-10-10-privacy-decision-memo.md`, adopted in `docs/legal/2026-10-10-adopted-decisions.md`
(decisions `adopted-q1-privacy-requests`, `adopted-q2-deletion-retention`, `adopted-q2-6-health-intake`, `adopted-x3-6-health-collection-gate`,
`adopted-x1-incident-register`, `adopted-x2-ropa`; implementer assumptions recorded as `priv-*` decisions). All capabilities left
`in-progress`, `unreviewed`; `customer.data-request` moved from reviewed to unreviewed because it was rebuilt.

## Built (commits 816f11b, f19adaf, abc97c8, d8ff447, + UX fix)

- `20261011200000_priv_privacy_requests.sql` — `data_subject_requests` renamed `privacy_requests` (rows kept, FK to profiles dropped so the
  record outlives the account), five types, four channels, OTP identity (`privacy_require_contact_otp`: amr otp within 10 min + verified
  contact), staff-logged requests confirmed by the customer, 30-day deadline, one extension before day 30, day-20/28 escalation with alerts
  and owner notices, coded refusal with the SDAIA right, correction with the field held aside (+ guard trigger) and provider notices, consent
  withdrawal, append-only event history, permissions `privacy.manage` (owner, operations), `privacy.approve`, `incident.manage` (owner),
  approval kinds `privacy_export`, `privacy_deletion`, `privacy_legal_hold` (never break-glass).
- `..._210000_priv_copy_export.sql` — propose/approve, `privacy_export_payload` (service only; other party's identifiers removed, their
  e-mails/phones redacted), private bucket, record built/failure, customer-token download authorisation (7 days, audited), expiry.
- `..._220000_priv_deletion_engine.sql` — recorded erasure run (booking immutability lifted only inside it), health destroyed, messages
  deleted with provider tombstone + notice, reviews deleted or "Deleted user", bookings pseudonymised (token, basis, retention_until) or
  deleted, money records pseudonymised, profile deleted, legal holds (court keeps the account; disputes auto-held, released 30 days after
  close), deletion ledger with re-application and export, completion notice to snapshotted verified contacts, B2C invoices without buyer.
- `..._230000_priv_health_intake.sql` — collection gate (owner records the transfer risk assessment; `collection_paused` does not block a
  visit), 30-day destruction, 12-month reuse consent, assigned-provider reads.
- `..._240000_priv_incident_register.sql` — register, decisions, evidence bucket, 48 h alert, 5-year purge; package hygiene (audit triggers,
  service grants, helper revokes).
- Edge Functions `privacy-export`, `privacy-export-download`, `privacy-erase-account`; pure modules `_shared/privacy-export-document.ts`
  (pdf-lib + fontkit, Arabic runs shaped and placed RTL; whole IBM Plex Sans Arabic fonts embedded because the subsetter fails in the Edge
  Runtime) and `_shared/privacy-erasure.ts`; notice templates.
- Screens: `/customer/privacy`, `/admin/privacy`, `/admin/incidents`, `/admin/ropa` (from `docs/privacy/ropa.md` via `scripts/build-ropa.mjs`),
  approvals labels + follow-up Edge calls, customers tab links to privacy, `/privacy` links to the account, intake gate notice and reuse.

## Checks (all run this pass)

test:db 1374/1374 (26 new in `priv_privacy.test.mjs`; 11 older files updated where the decisions changed behaviour), test:edge 42,
test:inventory 10, test:mobile 27, web 734, test:ui-schema 0 mismatches, security-core and admin-controls pass, test:p3-compat HEAD pass,
`npx tsc -p web_platform` clean, `npm run lint` 0 errors, typecheck:mobile clean, smoke 19/19, `deno lint supabase/functions` clean,
`deno check` on the three new functions and deliver-governance-notices clean. Live: `scripts/verify-privacy-local.mjs` 4/4 with
`supabase functions serve` (OTP read from Mailpit, two TOTP owners, PDF built in the Edge Runtime, customer download, auth deletion).
Browser on :3100: customer submitted a copy request through the code step (Arabic RTL checked); owner with a real TOTP sign-in opened the
queue, the request detail, the ledger tab, incidents and RoPA. Manifest validate 0 errors; coverage exits 1 with the 21 pre-existing errors
(none from PRIV); release validate exits 1 (capabilities in progress).

## Gaps filed

privacy-jobs-not-scheduled (high), deletion-ledger-needs-off-database-archive (blocked), privacy-notices-have-no-sender (blocked),
processor-correction-notices-manual, privacy-verification-without-app-access, privacy-non-customer-accounts, unused-balances-on-deletion
(blocked), financial-year-end-not-recorded, privacy-request-record-retention-not-set, incident-subject-notification-templates-missing,
pdf-font-licence-text-not-vendored, provider-intake-answer-button-shows-for-owner, whatsapp-erasure-needs-pepper, priv-not-reviewed.
Closed with evidence: no-customer-data-rights-path, pdpl-erasure-scope-undecided. dpo-role-not-defined stays blocked (owner).

## Next agent's first action

adminwright-security over privacy-request, privacy-incident and processing-register: re-read migrations 20261011200000–240000 (not this
summary), attack the erasure-run flag (`primora.privacy_erasure_run` + txid), the OTP freshness check (amr method names), the payload
redaction, the export download path checks, self-approval of the three privacy kinds and the hold release path; then ux-reviewer with a
real TOTP sign-in over /admin/privacy, /admin/incidents, /admin/ropa and /customer/privacy.
