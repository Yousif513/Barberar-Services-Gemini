# QA recurring fixture reconciliation

- Agent: qa-recurring-fixture-reconciliation
- Date: 2026-10-22
- Scope: `supabase/tests/db/recurring.test.mjs` only; this worklog records the local evidence.
- Production SQL, authorization policies, assertions, test count and test runner behavior are unchanged.

## Confirmed cause

The focused baseline reproduced the full-suite failure: 23/24 pass; the series-visibility test failed before its authorization assertions with appointment 2 unavailable on 2026-11-01 15:00 Riyadh.

A disposable diagnostic copy showed scenario 20's anchor at 2026-10-25 15:00 Riyadh. Earlier scenarios already had pending bookings on both 2026-11-01 and 2026-11-08 at 15:00. Preview correctly reported both following dates unavailable. The fixture selected only a free anchor slot and assumed its later weekly times were free. Its rotating six-day date selection allowed those later occurrences to overlap prior scenarios.

## Fix

The anchor fixture accepts optional `weeklyOccurrences`, defaulting to its existing one-date behavior. When requested, it selects a candidate present in the real `get_available_slots` results on the anchor date and each following weekly date. The visibility test requests three dates before creating its three-booking series.

All customer, owner, delegate, professional, administrator, stranger and anonymous access checks remain intact. No skip, retry, fallback, ignored conflict, invented time or weaker assertion was introduced.

## Verification

- Baseline: `node --test supabase/tests/db/recurring.test.mjs` — exit 1; 23 pass, 1 fail.
- Final same command — exit 0; 24 pass, 0 fail, 6 suites, 0 skipped.
- `git diff --check` — exit 0.
- Root owns the aggregate final database rerun and broader release gates. This pass does not claim aggregate completion.
- No hosted write, reset, provider API/payment, deployment or Git commit occurred.
