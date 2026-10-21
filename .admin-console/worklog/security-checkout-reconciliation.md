# Security review: checkout reconciliation guards

Date: 22 October 2026 (Asia/Riyadh). Reviewer: sec-checkout-reconciliation, independent of the checkout implementer. Profile: regulated. Scope: the corrected uncommitted payment-checkout handler guard changes, its isolated handler tests, the migrated-schema handler contract tests, and test command wiring on codex-booking-payment-reconciliation.

Pass boundary: a scoped independent security/code review, not a complete Adminwright security release pass. No manifest, capability status, production configuration, payment provider, business policy or implementation file was changed. No risk exception was accepted. This worklog is the reviewer's only worktree change.

## Findings

Resolved before release: the initial patch selected bookings.provider_id, but the canonical booking stores branch_id and the provider belongs to branches.provider_id. That nonexistent selected column would make valid booking checkout return 503. My initial review accepted the injected booking fixture without checking the table contract, so its initial "No findings" assessment was incorrect and is withdrawn. The implementer found the mismatch before release and corrected the guard to resolve the booking's branch and then its provider.

Independent follow-up checked the migrated column contract, re-read the revised handler and both complete test suites, and executed the revised suites. No remaining actionable security or correctness regression introduced by the corrected guard changes was identified. This assessment supersedes the initial review; it is scoped to the corrected source and evidence below.

## Checks and evidence

- Read the complete revised handler, both full new test files, fresh handler/package.json diff, shared HTTP authentication helper, the existing provider_is_selling definition/grants, canonical booking/branch schema, routing flag schema/seed and architect-reconciliation handoff. The handler was reviewed from fresh source, not only its diff.
- Booking authorization still requires a real caller resolved through the shared auth helper; service callers are rejected. The service-role booking query includes both booking id and customer_id equal to the authenticated caller. A pending payment state is required. The new guard does not give administrators cross-customer checkout authority.
- The amount comes from the owned database record, not request.amount. The new Number.isFinite check rejects non-finite converted amounts across every payable branch before Tap dispatch. Existing positive-value checks remain.
- Canonical schema 20260613000000_init_schema.sql defines bookings.branch_id and branches.provider_id. An independent isolated migrated-database probe confirmed that selecting bookings.provider_id fails, while the booking-to-branch provider join compiles. The corrected handler selects booking.branch_id, queries that exact branch for provider_id, and calls the same provider_is_selling RPC already used by package/membership checkout. The database definition requires provider.status = active and is_verified; the later migration retains execution for service_role while revoking public/anon/authenticated execution. Missing/false/malformed eligibility cannot authorize dispatch because the helper accepts only literal true. RPC errors fail closed through the handler's existing error path.
- Failed booking reads return 503 rather than being presented as an absent booking; inaccessible/absent rows still return 404. A failed branch lookup returns 503; a missing branch or ineligible seller returns 409 before the gateway is called.
- Routing configuration now authorizes dispatch only when the query succeeds and is_enabled is the literal boolean false. Errors, missing rows and malformed data return 503. A true split flag retains the pre-existing 503 hold while destinations remain unconfigured.
- The source migration 20261003220000_booking_rules_and_money.sql creates is_enabled as BOOLEAN NOT NULL DEFAULT FALSE and explicitly inserts payments_marketplace_split = FALSE with ON CONFLICT DO NOTHING. Thus the new guard is compatible with the seeded migrated schema and does not reset an existing true value. This is repository evidence only; no hosted flag value or migration application was checked.
- No new role, policy, grant, commission/VAT rate, provider routing contract or fund-custody interpretation is introduced by this slice.

## Executed verification

Command: node --test supabase/tests/payment-checkout.test.mjs supabase/tests/db/checkout_schema_contract.test.mjs

Result on independent rerun: exit 0; 16 tests passed; 0 failed (13 isolated handler cases and 3 migrated-schema handler contract cases).

Both suites execute the real handler source after stripping its TypeScript syntax and imports and intercept the gateway fetch. The isolated suite injects the database/auth/config/redirect/response boundaries. Its successful case checks owner query predicates, branch id, stored amount, SAR currency, seller RPC arguments and one intercepted dispatch. Negative cases check no dispatch on routing query failure/missing/malformed data, enabled split, failed booking read, failed/missing branch, ineligible/erroring seller lookup, inaccessible booking, non-finite amount, unauthenticated/service callers and missing gateway configuration.

The new contract suite creates a booking through the actual migrated create_booking function in isolated PGlite. Its adapter executes every selected handler field and equality predicate against those tables as service_role and executes the real provider_is_selling SQL function. It checks a real booking's stored deposit and branch/provider resolution, another real customer's 404 with no dispatch, and an actual unverified provider's 409 with no dispatch. This catches the original nonexistent-column error that the initial isolated fixtures missed.

No network requests, hosted databases, real credentials or real financial calls are used by these suites. The logged seller lookup error is the deliberately exercised failure fixture. Node also reports its stripTypeScriptTypes experimental warning; neither is a test failure.

The package change includes the isolated suite in test:edge; the existing test:db glob includes the new migrated-schema suite. Other aggregate/repository checks were not rerun by this reviewer, so no claim about their current results is made here.

## Material test limits

The isolated suite injects database results. The new SQL adapter exercises actual migrated tables, selected columns, owner predicates and seller SQL as service_role; it does not implement the full PostgREST HTTP client, embedded relationships or maybeSingle cardinality/error semantics. resolveCaller is injected in both suites, so neither establishes the actual JWT/auth boundary. Neither runs Deno import resolution, actual CORS/return-url behavior or a real provider API. Existing shared-boundary tests, full PostgREST/Deno integration and deployment evidence remain separate.

The non-finite guard applies to every purchase type; the focused suites exercise it through booking checkout only. A stale provider_id in the Infinity unit fixture was identified during re-review and the implementer corrected it to branch_id; the reviewer read back that exact fixture correction after the independent 16-test rerun. The implementer separately reported a passing 67-case Edge aggregate after that fixture-only edit; that aggregate was not rerun by this reviewer. The migrated-schema success case separately protects the real booking-to-branch column contract. A malformed seller RPC result and a missing provider id are visibly denied by the helper, but do not have dedicated isolated cases; a missing branch is explicitly tested.

## Remaining durable checkout gap

The handler still has no durable checkout-attempt/idempotency receipt or persisted gateway request/charge result before or after the external charge POST. Two concurrent or retried pending-booking requests can create separate checkout attempts, and a timeout after submission leaves the outcome without an authoritative local attempt record for safe reconciliation. This is pre-existing in the reviewed base and is not fixed or introduced by these guards; it must remain an open financial release dependency.

Completing that gap needs a server-owned attempt/claim and stable operation identity, exact booking/amount/currency/provider binding, checked request/result audit persistence, explicit unknown outcomes, and provider-supported reconciliation/retry semantics. No live provider contract was verified or chosen in this review. A provider becoming ineligible between the read guard and capture also requires downstream capture/reconciliation controls; a pre-dispatch lookup alone cannot guarantee the later state.

## Disposition

The corrected bounded fail-closed checkout guards have no remaining introduced actionable findings in this re-review and pass 13 isolated handler tests plus 3 migrated-schema handler contract tests. The initial review missed the schema defect and is superseded by this record. This does not clear the complete payment feature or the regulated release. Durable attempt/reconciliation behavior, actual hosted environment/PostgREST/Deno/provider evidence, the existing wider gaps, and the applicable manifest release/coverage gates remain separate. Manifest validate/coverage were not run or changed by this reviewer; no production-ready claim is made.