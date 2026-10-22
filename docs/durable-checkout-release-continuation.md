# Durable checkout recovery and release-gap continuation

> Historical design-only checkpoint. The CEO subsequently explicitly authorized development workers on2026-10-22; that registration blocker is resolved. See [the implementation and Headquarters handoff](durable-checkout-recovery-and-volabi.md) for current source, verification and remaining release dependencies. The older results below are retained as history.

Date:22 October2026. Branch:codex-booking-payment-reconciliation. Profile:regulated. Repair mode follows the CEO-approved plan. Production deployment, company-agent activation and financial transactions remain held.

## Current outcome

Remote references were refreshed and master remains an ancestor of this clean repair baseline8ee1df9. The original dirty Gemini checkout was not edited. This continuation adds an approved checkout design, source provenance and factual release-coverage corrections. It does not implement durable checkout or change application, database or payment behavior.

The four previous structural coverage failures were missing models for existing provider/customer wallet routes and missing query capabilities for existing reconciliation/reward reads. These are now recorded through the manifest CLI. Existing customer bookings/packages/memberships routes are also recorded for the planned recovery slice. No role, permission, employee or runtime was activated. New entries remain in progress or planned; accessibility and independent review are not asserted. The reconciliation source was corrected to the actual public.reconciliation_breaks table. The earlier report now says injected-query assessment, avoiding the evidence scanner's inaccurate interpretation of its historical wording.

## Durable checkout contract ready for implementation

1. Persist the exact gateway request text and database SHA-256 before dispatch, bound to an immutable attempt UUID, authenticated payer, payable type/ID, authoritative amount, SAR, seller and gateway-account/environment fingerprint.
2. Serialize claims per payable across caller keys. Only insertion of the attempt owns the charge POST. Replayed, simultaneous and stale claims do not dispatch again. No lease reclaim may repeat a financial submission.
3. Send the immutable attempt as Tap reference.transaction and reference.idempotent and metadata.checkout_attempt_id; reference.order identifies the payable. Keep the original wire bytes and key after transport failures.
4. Use submitting,ready,unknown,captured,failed states. Timeouts, malformed responses, uncertain persistence and inconclusive lookup remain blocked. Authenticated evidence of an actual failed charge is required before another attempt. Conflicting or multiple charges require reconciliation.
5. Recover using the documented reference-filtered list operation, complete bounded pagination and authenticated GET of every candidate. Validate attempt, target, references, amount, currency and unique charge identity before storing a receipt. An empty list is inconclusive.
6. Bind fetched webhook results to attempts before the existing idempotent confirmation commands. Captured replays must retry confirmation even when the receipt already exists. Preserve legacy in-flight checkout compatibility and handle webhook/create-response and late-capture races without discarding evidence.
7. Adapt all13 existing checkout callers:10 web and3 mobile. Interpret pending/unknown/captured before expecting a URL. Keep purchase identity across retries/reload, recover existing records, preserve AR/EN messages and avoid claiming no charge after an uncertain response. Reuse existing controls/theme and complete mobile return handling.
8. Independently review SQL, handlers and clients; test ownership/role denials, concurrent claims, exact wire/hash, timeout/crash/persistence failure, lookup pagination/ambiguity, stale callbacks and capture replay. Provider sandbox acceptance remains a separate dependency; no actual financial call is authorized for this pass.

Tap documents a24-hour idempotency window; this design does not assume perpetual protection or replay after expiry. Its documented charge-list operation supports merchant references but does not establish that absence proves failure. Sources: [idempotency](https://developers.tap.company/docs/idempotency), [charge list schema](https://developers.tap.company/reference/list-all-charges.md), [retrieve charge](https://developers.tap.company/reference/retrieve-a-charges), [charge statuses](https://developers.tap.company/reference/charges), [webhooks](https://developers.tap.company/docs/webhook). Supabase RPC/security and PostgreSQL15 locking guidance were also consulted.

## Implementation gate requiring human clarification

The repository's implementer protocol requires an agent audit record with status active and an exclusive capability claim before feature edits. Automatic approval review twice rejected that exact record as conflicting with the CEO's hold on agent activation, including after clarification that it was a development audit pass. The code workers were interrupted. No active implementer record or claim was written. Approval is pending specifically for development audit records/workers; company-agent activation, production and financial holds would remain.

Acceptance cases were drafted and exercised before implementation:15 fail because the recovery module does not exist. They are preserved as an unwired review artifact in .admin-console/evidence/durable-checkout/checkout-recovery-acceptance-draft.mjs.txt. The empty CLI-created migration draft was removed; no empty migration or failing draft test was added to the release path. No implementation completion is claimed.

## Fresh verification

- Mobile type check:passed.
- Web production build:passed. Provider listing for the sitemap could not be fetched in this build environment; no application compilation failure occurred.
- Existing Edge tests:67 passed; admin controls verification passed.
- Existing reconciliation/rewards executing SQL tests:22 passed in disposable PGlite, no gateway calls.
- Plan validation:exit0,0 errors,19 warnings.
- Structural coverage:exit0.
- Full release validation:exit1,247 errors,19 warnings. This is not a cleared release. New explicit planned capabilities and unreviewed screen inventory increase unresolved evidence counts; structural holes are no longer hidden.

Release errors by rule:147 unresolved statuses;22 accessibility records;16 assumed decisions;14 unreviewed capabilities;12 cross-cutting flags;9 missing screen states;8 required fields;8 unresolved high gaps;6 quality gates;2 required nonfunctional gates;2 responsive records;1 cross-cutting evidence record. See the saved JSON for exact fields. No status was promoted merely to reduce this count.

## Prioritized remaining work

First unblock the required development audit registration, implement the durable contract, and add complete existing-client recovery with independent security/QA evidence. Next perform a source-by-source review of the remaining capability and screen evidence; verified behavior must precede any status promotion. Retain the existing split-routing refusal until licensed-provider destinations, merchant onboarding and sandbox acceptance are established. Preserve first-acquisition-only commission and zero repeat-booking commission; unresolved qualifying-event semantics must not be invented.

Seven other high gaps remain externally blocked:hosted auth configuration; ZATCA VAT verification; rewards legal/tax dependencies; second-owner role-grant controls; governance notice sender; off-database deletion-ledger archive; historical capture/refund evidence. Historical financial rows cannot be remapped without the named environment and actual gateway outcomes. Existing assumed business/governance decisions need their proper owner resolution, not automatic confirmation.

Next action: CEO clarification of development-pass audit records, then resume the already specified durable checkout slice. No production merge/deployment, company-agent activation or actual financial transaction was performed.

Design and inventory commit: `4495a3d5bcdf272b35b1223116888b291eb811ed`. This report records design/audit progress only; checkout implementation remains pending.
