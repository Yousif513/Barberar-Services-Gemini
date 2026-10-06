# P3 Source and Executing-Test Review

Pass: qa-p3-source. Profile: regulated. This is a fresh source/test pass, not signed-in browser acceptance. The manifest capabilities remain unreviewed.

Read the final permission predicate, grants, stock adjustment/transfer transactions, membership command, catalog triggers, client request receipts, filtered query and pagination code. Executing Postgres tests cover both authorized and forbidden paths rather than only matching source text.

Confirmed locally:

- Owners retain their provider scope; managers require explicit active permission and matching branch scope. Cross-provider identifiers fail.
- Stock balances and movement records cannot be written directly by browser roles. Transfers conserve quantity, and reserved balances cannot be consumed.
- Replayed stock commands do not apply twice. A reused request UUID with a changed payload fails. Authorization is rechecked before replaying a receipt.
- Catalog deactivation/reactivation is reversible and audited. Orders require an active supplier/product; supplier linkage is checked. Approval is owner/admin-only, and receipt cannot repeat.
- Membership settings require owner/admin authorization, valid registered staff, recognized permission keys and a reason. Staff identity reassignment is protected.
- Stock/history and permission failures retain operator input. Loading, data, empty and query error outcomes remain distinct. Admin supply queries are authorized and audited in the database.
- Supplier/order searches also identify the corresponding provider health; reductions and their aggregate counts use matching provider/search scope.
- Currency is SAR. Reporting uses Riyadh dates. Arabic/English copy and root-language subscriptions share the existing dashboard theme.

Evidence: 10 Postgres tests, 91 existing web tests, full application of Claude's 43 migrations plus P3, full-chain delegation/retry/revocation probes, successful build/mobile checks, focused ESLint with zero warnings, and HTTP 200 for all three routes in a production preview. Production preview stderr was empty. The temporary previews were stopped after checks.

Still unverified: hosted Supabase schema/application state; signed-in browser saves and failure recovery; visual mobile/RTL checks; browser console and accessibility acceptance. No browser provider was available. Repo-wide admin release validation and coverage remain nonzero, and pre-existing lint warnings remain outside this slice.

Next action: resolve the deferred integration, then perform authenticated browser and independent security review. Do not mark this source pass as a completed release review.
