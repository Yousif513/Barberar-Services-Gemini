# Volabi finance, refund and payment-allocation gaps

Status: source audit and proposed inactive role/skill boundaries, 22 October 2026. Installation update: the four new instruction packages are now globally installed and byte-verified; later references to staging describe the source-audit preparation stage. Agent bindings, evaluations and business permissions remain unassigned. This supports the approved local HQ request → task → recommendation → CEO decision → follow-up loop. No commercial rate, refund authority, business permission, provider configuration or financial record changes. Company employees remain inactive; local decisions are record-only.

[Exact source evidence](../planning/volabi/persona-and-skills/FINANCE_CONTROL_SOURCE_EXCERPTS.json) preserves canonical URI/locator, author kind/status, UTF-8 byte offsets/text and full-file/excerpt SHA256. The recovered conversation files reside outside this checkout; if unavailable later, show unavailable evidence rather than substitute a summary.

## Source requirements

| Source | Established direction | Still unestablished |
|---|---|---|
| P074 human | First-acquisition-only per customer–salon relationship | Numeric rate, base, durable identity or adopted qualifying event |
| P075 human | Salon-paid direct/repeat processing; zero repeat acquisition | Universal PSP price, reimbursement or markup |
| P076/P079 human | Licensed-provider direct allocation at checkout; no Primora custody | Legal opinion, provider agreement or tested split API |
| P077 human | Questions missing SAR3 | Adopted corrected rate/formula |
| P078 human | Merchant/payment-method deduction differences must be visible | One processing rate for all merchants/card networks |
| P080/P081 human | Primora-led standardized refunds; bounded low-risk assistance and complex-case escalation as conceptual direction | Activation, financial execution or override of existing human controls |
| P207 human/assistant | Packaging is conceptual; rates illustrative; relationship, earning event, percentage/base need contract design | Adoption of example 15% or code 20% |

The assistant's qualifying-completed-service recommendation is proposal evidence, not an adopted event merely because the assistant called it confirmed.

## Existing controls remain in force

[The repository adoption record](legal/2026-10-10-adopted-decisions.md) conditionally adopts memo final texts and explicitly retains counsel and owner-external prerequisites. Preserve those conditions; this audit does not independently certify legal/tax conclusions or reopen existing controls as absent.

- **D-Q5:** a different human approves refunds ≥ SAR1,000 or cumulative refunds > SAR5,000 per administrator/Riyadh day; no self-approval. Preserve the separate existing payout/IBAN and bounded break-glass provisions. AI personas are not different human approvers.
- **D-Q8:** linked append-only money corrections with maker/checker; pending approval for fee rules, balances, payout holds and refund thresholds; prospective effective-dated fees and 30-day increase notice.
- **D-Q9:** Tap evidence governs money movement; ledger governs entitlements. Differences require reconciliation/approved adjustments. Preserve the documented timing controls; missing evidence is unknown, not completed.
- **D-D3:** effective fee-rule display plus recorded 15% fee VAT/worked example and provider VAT status. Tax/counsel prerequisites remain; this does not adopt an acquisition commission percentage.

Written Tap Marketplace eligibility/no-custody confirmation and provider agreements setting fee terms remain explicit owner prerequisites. Local ledger/tests do not prove provider acceptance, signed agreements, hosted configuration or current financial permission.

## Implementation facts and gaps

| Area | Current code fact | Gap |
|---|---|---|
| Numeric fee | 20261003220000_booking_rules_and_money.sql:511–563 seeds 20%, SAR 10 floor/SAR 40 cap “subject to commercial confirmation”; calculator has 15% fallback | Code numbers are not founder adoption; missing-rule fallback may charge without policy evidence |
| Repeat | 20261005010000_review_fix_money.sql:8–16 supersedes old 10% with zero | Configuration-driven; missing/inactive/generic future rules must not reintroduce repeat acquisition |
| Base/snapshot |booking_create_internal uses pre-discount subtotal (20261005000000:674–683);20261010310000:89–119 effective-dates/snapshots fee rules | Adopt base, discounts/tax/refund treatment and agreement scope; snapshot is not approval |
| Acquisition |Confirmed/completed customer/provider history; later20261009130000 excludes zero-value/walk-ins | Pending bookings can each snapshot first; confirmation precedes completion; no durable once-per-relationship acquisition ledger |
| Identity |Branches join provider ID; privacy engine unlinks/removes customer booking links (20261011300000:349–381) | Define salon/branch/provider/chain and privacy-compatible no-reset continuity without inventing permanent PII retention |
| Capture/earning |Capture records internal shares; completed visits feed fee invoicing | Allocation, capture, earning and settlement are distinct; qualifying event remains explicit |
| Cancellation/no-show |ledger_settle_unperformed_booking removes platform share | Preserve; retained cancellation consideration is not automatically an acquisition |
| Refund |Recorded claims, exact-charge conflict binding and unknown quarantine exist | Performed refunds deplete provider share first (20261005010000:633–644); commission/processing/chargeback reversal needs agreements |
| PSP split |payment-checkout/index.ts:147–156 returns 503 if split enabled; otherwise no destinations; source is src_all (:174–191) | No submerchant allocation payload or settlement/reversal acceptance established; internal ledger is not PSP movement |
| Processing cost |Checkout supports sources without a verified merchant-specific fee contract | Obtain actual merchant/network pricing, who bears costs, rounding and estimate-versus-actual reconciliation |

Full byte-preserving code excerpts and later-patch qualifications are in the JSON. Existing repaired duplicate-capture/refund-binding/unknown-outcome controls remain implemented; this audit did not rerun their tests or contact Tap.

## Required decision/evidence queue

1. **FIN-COMMERCIAL-TERMS:** adopt first percentage/floor/cap, base, discount/tax/refund treatment, agreement/version/scope. No rate recommended; repeat acquisition remains zero.
2. **FIN-ACQUISITION-EVENT:** define qualifying event, verified existing customers, salon identity, concurrency, cancellation/no-show/refund and erasure/recreation continuity.
3. **FIN-REFUND-ALLOCATION:** adopt performed-service partial/full refund, commission reversal, processing-cost and chargeback allocation using actual terms. Existing human thresholds remain.
4. **FIN-PSP-ACCEPTANCE:** written eligibility, named test account/environment, onboarding/destinations, method/merchant fees, allocation/reversal/insufficient-balance evidence. Release/financial activation is separate.
5. **FIN-LOW-RISK-AI:** later specify evidence, limits, assistance/execution boundaries and independent appeal; conceptual assistance grants no transfer authority.

These can become source-linked local HQ review records. A local approval does not alter rates, activate employees, resolve counsel prerequisites or execute finance.

## Proposed inactive role/skill segregation

Packages remain distinct from assigned skills, evaluated competence and actual permission. “Alex” means the original Alexander, not a new identity.

| Identity | Proposed responsibility/skills | Limits and evaluation cases |
|---|---|---|
| Daniel | Financial evidence owner; primora-finance-accounting, marketplace-payments, pricing-revenue, business-analytics; staged payment-reconciliation proposal | Prepare reconciliation/recommendations; no own adjustment approval or funds. Evaluate GMV versus revenue, duplicate capture, unknown refund, merchant fees/control totals |
| Emma | Case/service-recovery coordinator; customer-support, quality-control; staged refund-case-review proposal | Gather facts/policy/remedy/escalation; no contested final decision/self-review. Evaluate missing policy, contradictory evidence, notices/appeal |
| Lina | Customer intake/status; customer-support, booking-operations, retrieval-grounding | Minimum evidence and confirmed request; no card secrets, refund promise or financial decision. Evaluate honest unknown and safe handoff |
| Sarah | Salon/booking verification; booking-operations, partnerships-onboarding, quality-control | Verify attendance/completion/cancellation; no attribution/financial history edits. Evaluate cross-salon scope/conflicting evidence |
| Layla | Policy/compliance dependencies; risk-compliance, saudi-pdpl, authority-and-approvals | Preserve counsel/retention prerequisites and protected escalation; not licensed counsel confirmation. Evaluate erasure/hold and provenance conflicts |
| Omar | Independent assurance/appeal proposal; quality-control, agent-evaluations, incident-management | Separate from original preparer/implementer; retain dissent; no balance edits. Evaluate wrong charge/tenant, stale approval/conflicted reviewer |
| Alexander | Coordination; project-delivery, durable-workflows, agent-charters | One case owner, dependencies/escalation; cannot override CEO or assurance/finance controls. Evaluate duplicate/stalled cases/protected escalation |
| Nora | CEO queue/continuity; authority-and-approvals, source-continuity, memory-and-knowledge | Present exact versions/evidence and record decision; cannot impersonate CEO. Evaluate changed payload, stale citations/recovery, record-only receipt |

Skill names above use the primora- prefix. Staged domain skills are proposals, not installed/assigned capability. CEO retains final approval; applicable existing different-human controls remain required. Execution belongs only to a separately authorized server/PSP workflow. Daniel prepares reconciliation; independent review checks discrepancies, with approved corrections under existing controls. Appeal must be separate from the original preparer/decision-maker, with Omar's assurance and appropriate human review proposed.

## Verification and HQ boundary

Every excerpt is validated against its original byte slice and SHA256; human records must match user sections. Code facts, assistant proposals and conditional repository adoptions stay distinct. No external lookup, new software test, legal inference or commercial change is represented as verification.

The [root-owned local API contract](volabi-local-api-contract.md) supplies immutable source versions, exact citations/hashes, decision/follow-up/audit records and local sessions with record-only effects. This document author did not implement that backend; independent review follows its source freeze.
