# worklog impl-capture-reconciliation

role: implementer
agent: impl-capture-reconciliation
profile: regulated
date: 2026-10-22
review status: implementation complete; independent review and release gates belong to root
claim: refund.execute (claimed by root in the manifest)

## Scope and files

Root authorized the narrow booking/payment capture reconciliation after architect plan validation exited 0. No new role, financial rate, provider settlement contract, commercial policy or qualifying first-acquisition event was selected.

- `supabase/migrations/20261021090000_booking_capture_refund_binding.sql`
- `supabase/tests/db/booking_capture_refunds.test.mjs`
- this worklog

## Behavior changed

A second captured payment on a booking is recorded as a rejected capture. Its refund now binds to the ledger row inserted for that exact payment, rather than the booking's earliest captured payment. A replay returns the same durable refund request. Booking locks, captured-deposit equality, payment-intent uniqueness, idempotency keys, service-only execution and the existing canonical audit event remain intact.

`booking_captured_amount` excludes only ledger rows carrying a `late_payment_conflict` refund request, regardless of the refund's status. Those payments were rejected and cannot increase cancellation or no-show fees. Ordinary refund/cancellation rules and existing percentage fields are unchanged.

The migration reads the current canonical definition and replaces three verified single-occurrence blocks. It aborts if the expected source is absent or ambiguous, preserving later wallet-credit and authorization changes. `CREATE OR REPLACE` retains the helper's security/search-path/stability and permissions; the capture command explicitly reasserts its service-only execute contract. No existing migration or financial row is rewritten.

## Verification performed

- Original focused baseline: 2/7 pass; five failures reproduced wrong-ledger refund binding, absent refund after old capture exhaustion, lost replay identity and incorrect ledger completion.
- After binding/replay repair: 7/7 pass.
- Related executing suites before the helper extension: 78/78 pass across booking, wallet credit, holds, first visit, purchase conflicts, unknown refunds and money.
- Added accounting regression reproduced 34 SAR captured consideration against the expected single accepted 17 SAR fixture deposit.
- Final focused run: 12/12 pass, 2 suites, every migration including this new file applied in disposable PGlite. Four cancellation cases cover pending, failed, unknown and succeeded conflict refunds; no-show uses the provider's existing rate. Original captured amounts, refund reservations, original/duplicate ledger separation, audit idempotency, forbidden callers and mismatched amounts are asserted.
- `git diff --check` before final documentation passed. Root owns final full database/browser/build/mobile/manifest verification and independently reviews the implementation.

PGlite is local PostgreSQL with Supabase-shaped auth roles. The tests do not call Tap, hosted Supabase or another financial service. True simultaneous multi-session hosted execution is not claimed.

## Source and skill references

Read current AGENTS, changelog, manifest, architect audit, GEMINI_PLAN, dashboard-data notes, Supabase skill, PostgreSQL best-practices skill and short-transaction/least-privilege references.

Current official references consulted:
- https://supabase.com/changelog
- https://supabase.com/docs/guides/database/functions
- https://www.postgresql.org/docs/15/sql-createfunction.html
- https://www.postgresql.org/docs/15/explicit-locking.html

The Supabase CLI package in the old checkout lacked its Windows binary (ENOENT), and the isolated install did not initially expose the wrapper. No additional dependency or CLI was installed. The single migration was created directly using the verified existing ordered naming convention, then applied by the executing local migration harness.

## Remaining boundaries

- No hosted inspection, migration push, deployment, real charge/refund, company agent activation or Git commit was performed.
- Existing incorrectly bound refund rows are not automatically remapped. Their actual provider outcomes need verified reconciliation before any correction.
- Pending-checkout idempotency and configured licensed-provider destinations remain separate dependencies.
- Zero-repeat calculation guard and durable first-acquisition semantics remain separate work. Do not invent when acquisition permanently qualifies or retain erased identity without policy approval.
- Full regulated-console release validation, coverage, browser acceptance and environment/provider sandbox evidence are not supplied by this implementation pass. This is not a production-ready claim.
