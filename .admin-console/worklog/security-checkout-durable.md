# Independent security and QA — durable checkout Edge slice

Reviewer: security-checkout-durable. Date: 2026-10-22. Profile: regulated.

Final disposition: no unresolved critical/high finding identified in this bounded Edge review. Three findings were reported to the implementer before changes; the implementer corrected them and added regressions. Fresh independent verification passes 63/63 cases. This does not approve production or certify the complete marketplace.

## Independence and scope

This reviewer did not implement the reviewed Edge sources:
- `supabase/functions/payment-checkout/index.ts`
- `supabase/functions/payment-webhook/index.ts`
- `supabase/functions/_shared/checkout-attempts.ts`

Reviewed their three isolated Node suites and `supabase/tests/db/checkout_schema_contract.test.mjs`. No Edge source/test fix was made by this reviewer. The same reviewer authored the separate database schema slice; that SQL requires its own independent reviewer and is not signed off here.

Used the security-best-practices skill; no Deno-specific framework reference exists in its catalog. Findings are grounded in actual source, the approved contract, executing tests and official gateway documentation.

## Findings and closure

### F1 — terminal create-response casing bypassed verification GET — resolved

The original helper classified terminal create statuses case-sensitively while SQL normalized statuses. A lower/mixed-case declined or captured creation response could reach receipt persistence without the contract's required charge retrieval.

The implementer normalized only classification, then refetched the actual charge before recording terminal/captured proof. Current evidence: `_shared/checkout-attempts.ts:76` and four lowercase/mixed-case regressions in `checkout-attempt-recovery.test.mjs`. Independently re-read and passed.

### F2 — resumed ready URL bypassed authoritative amount/provider revalidation — resolved

The original ready recovery fetched the frozen receipt, separately checked current pending/seller/routing, then returned the existing URL without comparing its frozen amount/provider to current authoritative values. A stale amount/provider could therefore reuse the wrong checkout.

The implementer now re-enters the canonical locked claim with the SAME attempt UUID, exact stored request bytes and gateway context, and accepts only dispatch:false. A mismatch returns held unknown state without a checkout URL. Current evidence: `payment-checkout/index.ts:159`; both changed-amount and changed-provider regressions pass. The real-schema adapter also passes.

### F3 — raced captured RPC returns omitted immediate confirmation retry — resolved

A capture could race either the unknown marker or the locked ready revalidation. The original branch returned the captured row without invoking the existing idempotent confirmation command on that response. It stayed a truthful recoverable 202 and could retry later, but did not meet the stronger every-captured-replay invariant.

The implementer now passes a captured mark-unknown result through confirmCaptured (`_shared/checkout-attempts.ts:31`) and a captured revalidation result through recovery/confirmation (`payment-checkout/index.ts:166`). Both dedicated race cases pass. Confirmation failures remain recoverable and do not trigger a second charge submission.

## Verified controls

- Checkout resolves a verified caller and passes its actor ID to service-owned, authoritative payable commands. Request amounts are not accepted from clients.
- Malformed/ambiguous payable IDs and recovery-only calls cannot acquire a new dispatch.
- The initial claimant sends the persisted request_text verbatim. No resubmission path regenerates a payload or relies on indefinite provider idempotency.
- Gateway context binds configured credentials/environment; context errors fail before payment recovery or dispatch.
- Receipt checks bind charge, SAR amount, attempt/type/target metadata and original transaction/order references; the database remains the final strict binding boundary.
- Empty, malformed, incomplete, ambiguous and failed lookups remain held. Bounded pagination collects all matching candidates within its page/time limit before accepting one charge, which is then retrieved independently.
- Captured replays retry the existing money confirmation command; lookup/recovery does not dispatch refunds.
- Webhook metadata is fetched from the provider rather than trusted from callback input. Attempt-bound results are persisted before money confirmation. Malformed attempt IDs do not fall through to legacy handling.
- Legacy in-flight captures retain existing confirmation behavior. Noncaptured observations do not invoke money commands.
- The helper/webhook do not log request wire bytes, credentials or raw provider response bodies. Tested negative paths log generic/fixture failures.

## Verification evidence

Command:
`node --test supabase/tests/payment-checkout.test.mjs supabase/tests/checkout-attempt-recovery.test.mjs supabase/tests/payment-webhook.test.mjs supabase/tests/db/checkout_schema_contract.test.mjs`

- Initial independent run: 55/55 pass; review still found the uncovered cases above.
- After F1/F2 fixes: 61/61 pass.
- Final after F3 fixes: exit 0; 63/63 pass, 7 suites, no skipped/cancelled cases. This includes 59 isolated handler/helper/webhook cases and 4 cases executing the actual handler against the fully migrated local schema.
- Global fetch is hard-blocked in the suites; handler code explicitly passes its fake fetch into helper options. Test environment values are fixture literals, and no actual credential file was loaded.
- Expected fixture error logs and Node's experimental TypeScript stripping warning are not test failures.

Earlier verification isolation failure: before this independent pass, the implementer reported that a helper's uninjected default fetch attempted the provider URL using a dummy fixture key. Those earlier results are not accepted as isolation evidence. The implementer corrected dependency injection and installed the hard network blockers; all independent acceptance runs above used the corrected fixtures. No real credentials were loaded and no real financial transaction was used as verification.

## Official references checked

- [Tap list charges](https://developers.tap.company/reference/list-all-charges): read operation uses POST, starting_after pagination, maximum page size 50.
- [Tap retrieve charge](https://developers.tap.company/reference/retrieve-a-charges): authenticated charge-ID retrieval.
- [Tap idempotency](https://developers.tap.company/docs/idempotency): documented 24-hour idempotency window; this implementation does not assume perpetual replay protection.

No provider request was sent with real credentials. No hosted write, production deploy, business-agent activation or Git commit occurred in this review. Root owns aggregate tests, remaining regulated-console gates and external sandbox acceptance.

