# Release-gap implementation (claude-code checkout)

Agent: impl-claude-release-gaps. Mode: repair. Profile: regulated. Date: 2026-10-04.

Carried Codex's uncommitted P3 work from the `gemini` checkout into `claude-code` with targeted edits, then
reassessed the manifest's gaps against current source and fixed what could be fixed without an owner
decision. Everything below is implemented and tested in source; none of it is reviewed (review is a separate
pass) and none of the new migrations is applied to the hosted Barberar project (vpszcnxsgmoavkqorjzt does not
resolve from this machine and the CLI token is unauthorized).

## Server commands and migrations

- `20261005080000_release_gap_controls.sql`: row-level audit of admin writes on the eleven tables the console
  mutates (changed fields only, sensitive values redacted, reason via `primora.audit_reason`);
  `admin_review_payout_request`; validated `admin_update_platform_setting` (direct writes revoked);
  `admin_release_expired_holds`.
- `20261005090000_admin_dashboard_overview.sql`: admin-only summary for the landing page - work waiting for an
  operator (count, oldest item, money at stake, PDPL due dates, refunds the scheduler stopped retrying),
  reconciliation status and live SAR figures.
- `20261005100000_admin_refund_retry.sql`: `admin_retry_refund_request` records an operator's reasoned retry
  and re-opens a refund that ran out of automatic attempts for exactly one more; money still moves only
  through `process-refund`.
- `20261005110000_admin_clear_customer_profile.sql`: replaces a browser "anonymize" that wrote a random,
  UNIQUE phone number and discarded the reason; clears profile details only and says so.

## Screens

- `/admin` rebuilt as an exception router on `admin_dashboard_overview()` (was entirely fabricated: USD
  amounts, invented people, fixed May 2025 dates, decorative search/branch/date controls).
- `/admin/refunds` new: paginated refund queue with status filter, gateway errors, attempt counts and a
  reasoned retry.
- `/admin/audit-logs` real (was a redirect to the booking feed); `/admin/taxes` read-only from `fee_rules`;
  `/admin/settings` edits through the validated command; bookings console gained cancel / no-show /
  complete / release-holds commands; ledger statements surface load failures.
- Portal shells: hard-coded identities removed ("Admin Root", "Elite Barbershop", "Yousif"), real sign-out,
  phone-width menus for customer and provider, admin phone drawer fixed (global CSS made it take page height).

## Tests

- `supabase/tests/db/inventory_workflows.test.mjs`, `release_controls.test.mjs`, `admin_dashboard.test.mjs`
  (negative tests for owner, customer, anon and staff on every new command).
- `web_platform/tests/no-mock-data.test.mjs`: release-path guards for invented data, dollar amounts,
  hard-coded identities, random values in operator screens, hard deletes, mojibake.

## Verification (source only)

DB 76/76 + release-controls additions, inventory 10/10, web 114/114, security-core and admin-controls pass,
web eslint 0 errors, mobile lint 0 errors, mobile typecheck 0 errors, web build passes, P3 compatibility
script passes. Browser: dev-role pages checked in English and Arabic (RTL), at 375 px and 1280 px, keyboard
focus visible; populated states checked against a local verification-only mock API, never against the
hosted project. Signed-in hosted workflows are unverified.

## Left for an owner decision (recorded as blocked gaps)

IBAN visibility to every admin; separation of duties for money approvals; what
`providers.commission_percentage` means (pricing uses `fee_rules`); PDPL erasure scope versus ZATCA
retention; loyalty and referral programme values.

Next action: independent security, UX and QA passes over these domains; apply the four migrations to the
hosted project only after inspecting its migration history.

## Round 2 (2026-10-06): fixes for the security and UX review findings

Implementer: `impl-claude-release-gaps` (the same agent that built these screens, so none of this is reviewed).

Security review (`sec-claude-release-review`): migration `20261005150000_security_review_hardening.sql` adds
pattern-based audit redaction, an audit trigger on every administrator-writable table, a payout destination
lock, anonymous column restrictions and the stuck-refund reopen command; response headers are set in
`next.config.ts`. Details and tests are in `supabase/tests/db/security_hardening.test.mjs`.

UX review (`ux-claude-release-review`, 32 findings): fixed or partly fixed in source, each recorded on its gap.

- One dialog behaviour (`web_platform/src/components/modal.tsx`): focus in, Tab trapped, Escape out, the rest of
  the page inert, focus restored. `CommandDialog` names the target, states the consequence, captures the reason,
  keeps it when the server refuses, optionally needs a typed confirmation or an acknowledgement of a check made
  outside the console. Used by bookings, customers (phone, clear profile, data requests), refunds (retry,
  reopen) and provider status changes; the provider edit/approve/reject/detail surfaces and the invoice use
  `ModalOverlay`. No admin screen under review uses a native prompt or confirm any more.
- `operations-ui.tsx`: `isForbidden` / `ForbiddenNotice` (a refusal is not an outage), `CommandResult`
  (a message fixed to the viewport), `signOutFailedText`.
- Admin shell: language switch, skip link, named navigation, per-route localized title, inert phone drawer with
  Escape and focus return, local sign-out that reports failure; `AuthGuard` no longer signs out on a failed
  profile read. Customer and provider shells sign out locally, show real unread counts from `conversations`,
  and lost the invented badge, assistant card and dead search boxes.
- Invoice: no request to an outside QR service (the encoded value is shown with a Copy action); the panel is
  exempt from the card skin that clipped it; a failed invoice read is reported. Drawing the QR locally needs a
  dependency decision (gap `invoice-qr-image-not-drawn-locally`).
- Reports: migration `20261005160000_report_months_in_riyadh_time.sql` cuts the monthly views in Riyadh time
  (test `report_months.test.mjs`); monthly exports are named with their months.
- Customer directory search also finds a complete customer ID (migration 140000 amended, test added), so a data
  request can open the record it concerns.
- URL state (`web_platform/src/lib/url-state.ts`): providers, customers and bookings keep their filters in the
  address bar; the dashboard queues deep-link to the view they count.
- Focus rings: every unprefixed `outline-none` on admin inputs replaced with a visible ring; the active sidebar
  link keeps its ring.
- Stable ordering (`id` tie-break) on audit-log, refund and booking lists; settings validate per field.

Checked in a browser (stand-in API only, never the hosted project): clear-profile dialog (validation, refusal
keeps input, success), reopen-refund dialog, invoice dialog, phone drawer, language switch, forbidden state,
deep links, filter bar at 375 px in both languages.

Not done, recorded as open or partly fixed on their gaps: the audit-log, refunds and employees filters are not
in the address bar; provider application approval still captures no reason; the providers KPI tiles have no
definition; one numeral system per language; phone-width layout of the audit-log, customers and providers
tables; the Taxes literals need an approver; drawing the invoice QR needs a dependency decision.

Verification at the end of this round: DB 129/129, inventory 10/10, web 149/149, security-core and
admin-controls pass, migration compatibility passes, mobile typecheck clean, lint 0 errors, web build passes.
Release validate exit 1 (229 errors) and coverage exit 1 (11 errors): what remains is review status, quality
gates and the owner decisions.

## Round 3 (2026-10-06): fixes for the independent QA findings

Implementer: `impl-claude-release-gaps` again (so nothing here is reviewed; QA re-verifies). QA's 18 reproductions
(`supabase/tests/db/qa_open_defects.repro.mjs`, now trimmed to the one that is still open) became 22 passing tests in
`supabase/tests/db/qa_defect_fixes.test.mjs`.

Migration `20261005170000_qa_release_gate_fixes.sql`:
- Bookings: the provider-owner and delegate UPDATE policies are dropped; cancel, no-show and complete happen only through
  `cancel_booking`, `mark_booking_no_show`, `employee_update_booking_status`. The provider calendar cancels through the command.
  The three commands require an administrator's reason (3+ characters) and answer a foreign booking like a missing one.
- Audit: `audit_admin_write` is attached to every base table in `public` (the audit logs excepted), found from the catalog, and
  records a self-demotion. `invoices` are read-only for administrators and append-only for everyone (a trigger refuses changes to
  figures, hash, QR value, seller and any delete; the reporting status and the clearing of a removed booking/customer link pass).
- Payouts: no INSERT policy on `payout_requests`; `request_provider_payout` is owner-only. `admin_release_ledger_item` and
  `admin_release_payout` take a required reason. `admin_create_refund_request` derives its idempotency key (or takes one).
- Access: `set_user_role(target, role, reason)` refuses your own role and the last administrator, serializes changes, audits.
  `approve_provider_application(id, reason, commission)` takes a reason.
- Privacy: `employee_time_off` is readable only by the staff member, the provider's owner and administrators;
  `get_available_slots` is SECURITY DEFINER so a day off still removes slots (it now also sees other customers' bookings, as the
  booking itself always did). `get_booking_address_secure` read columns and an enum value that do not exist; fixed.

Migration `20261005180000_admin_booking_directory.sql`: `admin_booking_directory` (search by booking ID, invoice number, customer,
provider; status; Riyadh date range; clamped pages; totals over all matches; audited without the search text). The Bookings screen uses
it, with the filters in the address bar.

Screens: ledger (release, payout review, mark paid with the amount typed), disputes, review moderation, application approval,
payment-method changes, and the branch, coupon, integration and service confirmations all use the shared dialog (`useConfirm` for yes/no
questions); no native prompt or confirm is left under `app/admin` (a guard test enforces it). The phone drawer makes the rest of the
page inert while open. `process-payout` and `request-payout` answer 410 behind their gates; `calculate-travel` needs a signed-in session.

Changed existing tests because the behaviour changed on purpose: the matrix and money tests pass a reason; the booking test expects
"Booking not found"; the owner's direct booking write now changes zero rows (stronger than the old trigger error); the anonymous
function allow-list gained `get_available_slots`. `supabase/tests/inventory.test.mjs` models only the P3 migrations, so its delegate
direct-write line is left as it was.

Checked in a browser (stand-in API only): the bookings directory (search from the address, totals of 123 matches, paging, a bad date range,
clearing filters) and the mark-paid dialog (target facts, typed amount, reason).

Not done, still open on their own gaps: a console screen for administrator roles and any second approver or re-authentication (owner),
credit notes for issued invoices (legal), audit rows for service-key edge function paths, console surfaces for customer credit,
gift cards, feature flags, fee rules, plans and legal agreement versions, moderation of job posts and chats, audit-log export and
retention, CORS origin matching, visitor-readable templates and settings, the drawer sliver after a language switch, Arabic load errors on
two screens, and web tests that assert source text rather than behaviour (the database suites carry the behavioural load).

Verification: DB 197/197, inventory 10/10, web 155/155, security-core and admin-controls pass, migration compatibility passes, mobile
typecheck clean, lint 0 errors, web build passes. Release validate exit 1 (229 errors), coverage exit 1 (11).
