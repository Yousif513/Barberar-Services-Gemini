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
| C-D21b | fixed | next commit "C-D21b" | `fixdbb_inventory.test.mjs` "C-D21b" (5 tests: 1,000 stays 1,000 after a cost edit to 50; 100@10 + 100@20 = 200@15; transfer carries the average; cost audit with reason; role refusals) |
| C-D22 | fixed | next commit "C-D22" | `fixdbb_inventory.test.mjs` "C-D22" (waste/negative adjust/transfer on inactive product; own message for an increase; role refusals; deactivation refused with open orders) |
| C-D27 | fixed | next commit "C-D27" | `fixdbb_inventory.test.mjs` "C-D27" (request-id receipt, content dedupe without id, merged lines, different-cost refusal, approved-order cancel rights, reserve/release commands writing quantity_reserved, role refusals) |
| C-D31 | fixed | next commit "C-D31" | `supabase/tests/inventory.test.mjs` (10/10 after deleting the booking-update assertion); `.coworking_changelog.md` corrected: join_waitlist signature, BNPL (untrue, G62 missing), "91/91" is source-text greps |
