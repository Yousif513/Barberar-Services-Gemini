# Durable checkout schema implementation

Role: implementer. Agent: impl-checkout-schema. Profile: regulated.
Date: 2026-10-22. Plan gate: root recorded architect validation exit 0.
Development workers and claims are authorized by CEO decision `ceo-development-workers-authorized-20261022`. Business-agent activation, production deployment and live financial transactions remain held.

## Owned files

- `supabase/migrations/20261022062147_durable_checkout_attempts.sql`, created with local Supabase CLI 2.106.0 `migration new durable_checkout_attempts`.
- `supabase/tests/db/checkout_attempts.test.mjs`.
- `supabase/tests/db/data_api_grants.test.mjs` (later explicitly assigned private-table exception).
- This worklog.

Other agents own Edge/client integration, the manifest, independent review and aggregate release checks. Their changes were preserved.

## Contract

`public.payment_checkout_attempts` persists immutable actor, payable type/target/provider, authoritative SAR amount, gateway-context digest and exact request text plus database-computed SHA-256 before dispatch. Request reference.transaction and reference.idempotent equal the attempt UUID; reference.order equals the payable target. Metadata binds the same attempt and existing purchase type and target key.

The table has RLS and no direct privileges for PUBLIC, anon, authenticated or service_role. Four explicitly service-only RPCs independently require the service JWT role, use a fixed empty search path and fixed SQL target lookups:

- `claim_checkout_attempt(p_actor_id uuid,p_purchase_type text,p_target_id uuid,p_attempt_id uuid,p_request text,p_gateway_context text)`
- `read_checkout_attempt(p_actor_id uuid,p_purchase_type text,p_target_id uuid,p_gateway_context text)`
- `record_checkout_attempt(p_attempt_id uuid,p_gateway_context text,p_charge jsonb)`
- `mark_checkout_attempt_unknown(p_attempt_id uuid,p_gateway_context text)`

The private snapshot helper and identity trigger are not executable by service/client roles.

Claim returns the full private row and dispatch boolean. Only INSERT returns dispatch:true; repeated calls with the same or a new UUID cannot reclaim a submitting, ready, unknown or captured attempt. An original failed UUID is history and cannot dispatch again. Exact-byte mutations under the same UUID are refused. Global target advisory serialization plus the current-unresolved unique index protects cross-caller keys.

All six existing payer rules are checked against current rows. Booking, package and membership seller checks reuse provider_is_selling. New dispatch and ready reuse require pending state, finite positive amount and known disabled split flag. Existing captured/unknown/submitting attempts are consumed before pending-state rejection so concurrent confirmation/cancellation does not erase recovery. Reading a recovery attempt requires current ownership but permits nonpending targets.

Receipt persistence verifies exact amount, SAR, attempt/type/target metadata, transaction/order references and globally unique charge binding. Echoed idempotent is optional; if present it must match. An authenticated create response may establish ready. Terminal failure/CAPTURED receipts must come from the Edge's authenticated charge GET; the database cannot infer HTTP provenance. Only FAILED, DECLINED, CANCELLED, ABANDONED, RESTRICTED and VOID permit a replacement. UNKNOWN, TIMEDOUT, unfamiliar status or unusable checkout URL remain unknown.

Captured status cannot regress. A failed historical attempt cannot become ready. A late actual capture of an older failed attempt is retained, marks newer active siblings unknown/reconciliation-required, and blocks fresh dispatch. The is_current marker allows multiple genuine capture receipts to be recorded without hiding financial evidence behind a target unique-index violation. Existing money confirmation remains separate and must run on every verified captured replay; this migration does not activate purchases, move funds or issue refunds itself.

Every mutation and privileged read emits a minimized canonical audit entry. The immutable payer's actor_id is included in details because service auth.uid is null. No wire bytes or contact data enter audit details.

## Verification

- RED baseline: all 25 initial cases failed because the new commands did not exist.
- Final focused command: `node --test supabase/tests/db/checkout_attempts.test.mjs` — exit 0, 31/31 pass, 3 suites, no skipped/cancelled cases.
- The real harness applies every current migration to disposable PGlite with explicit Supabase-shaped roles; actual tables and command bodies execute.
- Coverage: ownership/amount all six types; role/direct table denials; wire text/hash and immutability; sole dispatch; missing routing/context/seller refusal; unknown and stale submission; all terminal failures; strict receipt mismatch and charge uniqueness; raced unknown marker; monotonic captured replay; late-capture sibling quarantine; canceled and already-confirmed target recovery; existing financial confirmation integration; minimized audit payer attribution.
- `git diff --check` — exit 0.
- PGlite serializes its connection; the Promise.all claim case proves one-dispatch behavior for interleaved calls, not independent hosted multi-session execution. Root's aggregate verification and independent review remain separate.

## Limits and follow-up

No hosted write/reset, real gateway call, deployment, new business role, changed commercial rate or Git commit was performed. No historic financial record was rewritten.

Gateway credentials/account changes intentionally block recovery under a different context. A negative lookup never proves there was no charge and does not release an unknown attempt.

Frozen private wire bytes may contain payment contact data. They must be included in existing privacy export/erasure/retention controls before broader production/privacy clearance; no retention duration, legal interpretation or erasure exception was selected here. This implementation is not a full regulated release approval.


## Full-suite invariant repair — 2026-10-22

Root's full run found two integration failures: qa_defect_fixes required the standard administrator trigger name on the new public table, and data_api_grants assumed every non-append-only table was directly writable by service_role. These findings were addressed without relaxing the payment boundary.

- Added private `audit_checkout_admin_write()`, attached as mandatory `trg_audit_admin_write`. It reuses canonical write_audit_log but persists only payer UUID, constrained status, request digest and changed field NAMES. It never serializes request_text, customer values, checkout URL or raw gateway status into audit details. Service mutations retain explicit minimized command events.
- Added an executing maintenance probe using a database-owner fixture with a real admin JWT, without granting admin/service table access. It verifies administrator attribution and checks name/email/phone/token/raw-response sentinels remain absent from all target audit entries. RED run failed because the trigger was absent; final test passes.
- Targeted amendment to `supabase/tests/db/data_api_grants.test.mjs` documents the RPC-only table as an explicit exception. It additionally verifies service_role has no direct SELECT/INSERT/UPDATE/DELETE and only service_role can execute each of the four public checkout RPCs. No table privileges were granted.
- Final affected command: `node --test --test-concurrency=2 supabase/tests/db/checkout_attempts.test.mjs supabase/tests/db/qa_defect_fixes.test.mjs supabase/tests/db/data_api_grants.test.mjs` — exit 0; 76/76 pass, 21 suites, no skipped/cancelled cases. Checkout suite now has 32 cases. Root must rerun the aggregate suite; the prior full-suite failure is not presented as a green result.

Open gap **CHECKOUT-PRIVATE-WIRE-LIFECYCLE**: immutable private request bytes are not yet integrated into the existing authorized privacy export, erasure and retention workflows. The table is RPC-only and audit output is sanitized; those safeguards do not establish a lawful retention period or an erasure exception. Preserve this as an unresolved production/privacy acceptance dependency. No automatic erasure, new retention duration, legal policy or identity-retention rule was introduced.


## Independent SQL finding S1 — gateway-status audit text

Root independently found that checkout.recorded still copied raw upper(provider status) into its append-only audit details. A status outside the documented vocabulary could contain personal data or a token even though the table trigger was sanitized.

The audit expression now emits only the eleven documented charge statuses or the literal UNRECOGNIZED. The private attempt row retains the original normalized provider evidence; charge classification and financial behavior are unchanged. A sentinel receipt test reproduced the original leak, then checks every target audit entry for the email/token sentinels and verifies a known INITIATED status remains visible.

This is an implementation response to root's independent S1 finding, not self-review approval. The named CHECKOUT-PRIVATE-WIRE-LIFECYCLE gap remains open; no retention/erasure policy was introduced. Final focused test evidence is reported to root for its fresh aggregate rerun.

S1 final verification: node --test supabase/tests/db/checkout_attempts.test.mjs exited 0, 33/33 pass, five suites, zero skips/cancellations. git diff --check exited 0. SQL and tests frozen for root's aggregate rerun.
