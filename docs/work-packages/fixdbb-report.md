# FIX-DBB report (inventory / P3 correctness, fee invoices, subscriptions, analytics events, reports)

Branch `wp/fixdbb`, migrations `20261007150000` .. `20261007199999`. Every function change is a patch of the LATEST definition
(`pg_get_functiondef`) through a session helper `pg_temp.patch_function`, which normalises CRLF on both sides so it works on a Windows checkout.

Environment note: in a Windows checkout with `core.autocrlf=true` the migrations are written as CRLF and the earlier booking migrations
(`20261007050000`, `evolve_function`) cannot find their LF patterns, so the harness fails before reaching any test. The index is LF; I
converted the working-tree copies of `supabase/migrations/*.sql` to LF (no diff against the index). This is an existing integration issue, not
something these migrations depend on.

## Status per defect

| id | status | commit | test |
|---|---|---|---|
| C-D29 | fixed | (see git log: "C-D29") | `fixdbb_inventory.test.mjs` "C-D29" |
