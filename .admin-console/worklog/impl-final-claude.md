# impl-final-claude (implementer) — 2026-10-16

Scope: the items docs/reviews/2026-10-11-security-priv-recheck.md left open, the date-dependent fee-invoice test, and the bookings
cancel dialog thresholds. Claimed and released: privacy.deletion, privacy.legal-hold, privacy.deletion-ledger,
intake.health-retention-and-gate, incident.register, booking.transition. Statuses unchanged (in-progress), reviewStatus unreviewed.

## What changed (commit per item, branch claude-code, not pushed)

| Item | Commit | Migration / files |
|---|---|---|
| Fee-invoice test date-dependent | afb717b | supabase/tests/db/money.test.mjs (visit pinned to the previous Riyadh month from the DB clock; open month refused). The production function was correct. |
| N9 scratch file | 913fc9a | removed `.sql.tmp`; migration_hygiene test rejects any non `<version>_<name>.sql` file |
| Cancel dialog thresholds | dd5c233 | bookings/page.tsx reads governance_settings each time the dialog opens; loading / could-not-load copy |
| M3/N2 | c0a65b0 | 20261016100000 — money sub-records make a booking linked; money FKs to bookings RESTRICT |
| M5/N1 + N4 | 22cc306 | 20261016110000 — hold release unlinks runs, summaries, notices, approvals; staff notes erased; note text out of the audit log |
| N3, N5, renewal note | eec1d3f | 20261016120000, 20261016130000 — release / 4th+ renewal / aware_at correction are approval kinds; UI says what waits |
| N7 | 4c9e234 | 20261016140000 — recorder reads only while active staff |
| N6 | 4400310 | 20261016150000 + privacy-erasure.ts + privacy-erase-account — tenure-bounded scrub and WhatsApp windows |
| N8 | fb90160, d20f39a | 20261016160000, 20261016170000 — privacy_purge_expired_retention (dry run default, not scheduled) |

Negative tests: supabase/tests/db/final_priv_recheck.test.mjs (14 cases), plus priv_privacy.test.mjs updated for the new
approval flows, supabase/tests/privacy-erasure.test.mjs, web_platform/tests/booking-cancel-thresholds.test.mjs and
final-approval-kinds.test.mjs.

## Verification (all on this checkout)

test:db 1416/1416; test:inventory 10/10; test:edge 46/46; test:mobile 27/27; test:ui-schema 0 mismatches; web tests 747/747;
test:security-core and test:admin-controls passed; test:p3-compat HEAD passed; tsc -p web_platform 0; lint 0 errors (warnings
only); typecheck:mobile 0; deno lint 50 files clean; deno check 21/21; smoke-local-supabase 19/19; verify-privacy-local 4/4 with
Edge Functions served (I started `supabase functions serve`, which was not running; left running). Migrations 20261016100000 to
20261016170000 applied locally with `migration up --local`.

## Decisions (assumed)

final-money-records-restrict-booking-delete, final-hold-release-four-eyes, final-hold-renewal-fresh-owner-after-3 (re-approval
chosen over a duration cap), final-incident-aware-at-second-person, final-phone-tenure-scrub,
final-retention-purge-anonymise-ledger-referenced.

## Gaps filed

retention-purge-not-scheduled (blocked, owner), retention-end-delete-or-anonymise-books (blocked, legal),
hold-renewal-reapproval-threshold-unconfirmed, historic-audit-rows-link-erased-subjects-to-holds,
final-screens-not-browser-verified. Fixed: money-fee-invoice-test-is-date-dependent, bookings-cancel-copy-names-fixed-thresholds.

## Next agent's first action

Security (not this agent) re-runs the recheck probes for M3, M5, N1-N9 against migrations 20261016100000-20261016170000,
then decides historic-audit-rows-link-erased-subjects-to-holds. UX reviewer verifies the cancel dialog and the pending-approval
messages (privacy holds, incidents, approvals inbox) with a TOTP console session.
