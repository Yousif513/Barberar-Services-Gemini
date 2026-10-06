# Fix package brief (read after README.md)

Three independent reviewers read the whole P0-P3 delivery on 2026-10-06 and wrote down every defect they could reproduce:

- `docs/reviews/2026-10-06-gap-verification-A-p0.md`  (defects `D-01` ... `D-29`)
- `docs/reviews/2026-10-06-gap-verification-B-p1-mobile-portals.md`  (defects `R1` ... `R50`)
- `docs/reviews/2026-10-06-gap-verification-C-p2-codex-p3.md`  (defects `D1` ... `D32`, note: C's ids overlap A's pattern, so write C ids as `C-D1`)

Each defect has a path:line, a failure scenario and a proposed fix. You own a list of them (in your task). The reviewers were right more
often than not, but verify before you change anything: reproduce the defect first, then fix it.

## Method (every defect)

1. **Reproduce** with a failing test: a DB test on the migrated schema for anything in SQL, a node test for anything in a pure module,
   and for a screen that cannot load, a schema check of its query (`.from().select()` and `.rpc()` argument names against the migrated schema).
   If you cannot reproduce it, say so in your report and do not "fix" it.
2. **Fix** the root cause, in the smallest change that is complete. Do not paper over it in the browser when the database is wrong.
3. **Prove** with the test that failed. Keep every other test green.
4. Record in `docs/work-packages/<your-package>-report.md`: for each defect id, `fixed` / `not reproduced` / `deferred (reason)`, the commit, and the test name.

## Editing existing functions safely

Earlier packages each pasted a full copy of a function and the last copy won, which silently dropped fixes (for example overnight second shifts).
So: when your fix changes an existing SQL function, patch the **latest definition in place** instead of pasting an old copy:

```sql
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_def text := pg_get_functiondef(p_sig);
BEGIN
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $$;
-- SELECT pg_temp.patch_function('public.claim_message_batch(integer)'::regprocedure, 'old text', 'new text');
```

`CREATE OR REPLACE` keeps the function's existing privileges. Several packages change the same migration chain in parallel, so keep each patch
small and specific; if a patch needs a big rewrite of a function that another package owns (see the ownership list in your task), stop and put it in your report instead.
The pattern must be an exact substring of what `pg_get_functiondef` prints (view it in a PGlite session first).

## Rules that still apply

README.md rules (database is the boundary, audit, bilingual AR/EN with RTL, no mock or invented data, keyboard operable, no native dialogs,
tests per role) and the invariants section. Additional points for fixes:

- New migrations go in YOUR timestamp range (given in your task) which is later than `20261006220000_explicit_data_api_grants.sql`.
  Every new table needs `SELECT public.grant_data_api_access('public.<table>');` (add `, TRUE` only for a deliberately public table) and the audit trigger
  (`attach_admin_audit_trigger`). The DB test harness starts with NO table privileges (like current Supabase), and runs in UTC (like a hosted session).
  `supabase/tests/db/data_api_grants.test.mjs` fails when a policy has no privilege behind it or when an anonymous role gets more than the public catalogue.
- A screen change is only done when the query it makes is valid against the migrated schema. After editing a page, check every `.from(...).select(...)`,
  `.rpc(...)` argument name and `.insert/.update` key you touched against the migrations.
- Delete invented data (arrays of fake people, ratings, cards, slots) rather than hiding it; render an honest empty or error state in both languages.
- Do not touch another package's files except for the one-line wiring a fix needs; if two fixes need the same file, the package that owns the page in your task does it.
- Commit after each coherent group of fixes with the Co-Authored-By trailer; never push; keep the report current (write it after the first group of fixes, then append).
