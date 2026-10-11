# impl-gov2-claude — GOV-2 audited admin reads (2026-10-10)

Role: implementer. Branch `claude-code` in `primora-fix`. Plan of record: Q4 and D4 "Final decision text" in
`docs/legal/2026-10-10-privacy-decision-memo.md`, adopted in `docs/legal/2026-10-10-adopted-decisions.md`; recorded as decision
`adopted-q4-d4-audited-reads`. Claimed: `gov.audited-reads` (new), `customer.list`, `ledger.list`, `payout.list`, `ledger.export`,
`employee.list`. All left `in-progress`, review status unchanged or `unreviewed` (contested ones kept contested).

## Built

- `supabase/migrations/20261010200000_gov2_audited_admin_reads.sql`
  - Permissions `personal.read` (owner, operations) and `health.break_glass` (owner). Security alert kind `health_break_glass`.
  - Internal helpers (no client execute): `gov2_require_read`, `gov2_read_purpose` (purpose allowlist), `gov2_log_read` (actor,
    console role, purpose, fields, target ids, filter, rows, IP, user agent; ids only, never values).
  - Admin permissive read policies dropped; RESTRICTIVE `Console sessions read only through audited functions` on 30 tables
    (profiles, consents, DSRs, payouts, allocations, ledger, wallet, gift cards, invoices, fee invoices, message log/queue,
    notifications, conversations, messages, WhatsApp tables, employees (active catalogue only), home addresses, walk-in details,
    client contacts/profiles, intake answers/submissions, patch tests, push tokens, analytics events); own rows excepted.
    Reconciliation runs need `money.ledger`. Write privileges with no permissive policy revoked (ledger, wallet, gift cards,
    allocations, fee invoices, message log/queue) with their now-meaningless restrictive guards.
  - `can_access_provider_operation` / `_wide`: administrator branch is `admin_can('operations.write')` (GOV-1 analyst gap).
  - `admin_customer_overview` needs `personal.read`; `admin_booking_directory` needs `personal.read` or `money.ledger`.
  - Audited, server-paged reads: `admin_list_data_requests`, `admin_list_consents`, `admin_list_ledger_entries`,
    `admin_list_payout_requests` (masked only), `admin_finance_summary`, `admin_list_fee_invoices`, `admin_get_booking_invoice`,
    `admin_export_finance_report` (step-up, 20,000-row cap, logs delivered rows; `admin_record_export` revoked),
    `admin_list_message_log` (number masked), `admin_message_queue_summary` (aggregate, unlogged), `admin_list_employees`,
    `admin_employee_performance_report`, `admin_list_provider_applications`, `admin_people_names`.
  - `read_intake_answers_break_glass`: owner, step-up, reason >= 20 chars, audit without answers, security alert, notice to
    other owners. No DPO role exists (gap `dpo-role-not-defined`).
  - D4: `d4_small_cell_threshold()` = 5 (declaredStatic), dashboard KPIs and queue money totals with 1-4 people/rows suppressed,
    funnel day cells suppressed.
- Screens: customers, ledger, reports, bookings (invoice), notifications, employees, providers (performance, applications),
  dashboard, audit logs, disputes, reviews, approvals (alert label). AR/EN strings; suppressed figures read "Fewer than 5".

## Tests and checks (all passing)

New `supabase/tests/db/gov2_audited_reads.test.mjs` (17). Updated 15 existing DB test files and 2 web test files plus
`scripts/verify-admin-controls.mjs` where the decision changed behaviour (direct admin reads/writes now refused, exports
server-built). `npm run test:db` 1208/1208, test:inventory 10, test:edge 8, test:mobile 27, web 721, test:ui-schema 0 mismatches,
test:security-core and test:admin-controls pass, `npx tsc -p web_platform` clean, `npm run lint` 0 errors, typecheck:mobile clean.
Local stack: migration applied with `supabase migration up --local`. Live PostgREST with a locally signed aal2 session: direct
selects return only own rows; audited functions return data and write audit rows; finance refused DSRs (42501). Dev server was
not running at :3100; started it; every admin route answers 200. Not clicked through with a real TOTP sign-in.

## Not done / gaps filed

gov2-remaining-direct-admin-reads (high), dpo-role-not-defined (owner), provider-detail-hides-inactive-staff-from-admins,
gov2-not-browser-verified-with-totp. GOV-1 security review findings were not touched (dropping admin ALL policies on the ledger,
wallet and gift cards removes the direct-write path in C-1 for those tables).

## Next agent's first action

adminwright-security over `gov.audited-reads`: re-read the migration, try every console role against each restricted table and
function, check that no audited function leaks a column the screen does not need; then ux-reviewer with a real TOTP sign-in over
/admin, /admin/customers, /admin/ledger, /admin/reports, /admin/employees.
