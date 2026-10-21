# Booking and payment reconciliation

The CEO approved this incremental repair phase on 21 October 2026. Production deployment, company-agent activation and financial transactions remain pending explicit CEO approval. This report describes repository changes and local verification; hosted state has not been reconciled.

## Branch and schema

The original dirty `gemini` checkout is preserved. It is 343 commits behind `origin/master`. The repair uses the isolated managed checkout on `codex-booking-payment-reconciliation`, based on `origin/codex-booking-foundation` at `01a37b6`, which contains master `da932eb` plus two booking/account repair commits. The existing branch named `codex` prevents Git from creating a `codex/...` branch; no existing branch was renamed.

Master, the booking foundation and the inspected Claude branch have the same 210 migration filenames and contents, and the same database harness and Edge Function baseline. The two uncommitted P3 migrations in Gemini already match that chain and were not replayed. Claude's two unpublished mobile helper/documentation commits remain separate; they were not needed for this slice. A fetch confirmed the remote references before selecting the foundation.

The old Gemini audit is superseded for this slice by current-source evidence: full-cart booking/account continuation, real marketplace data, purchase write verification, captured-payment verification, unknown-refund quarantine and split-enabled refusal already existed. They were reused.

## Operational changes

**Working hours and booking availability.** The existing provider roster now has a connected Save action and visible bilingual progress, error and success feedback. It submits both shifts once and requires the returned employee/day receipt. It no longer retries a failed save with a reduced payload that drops the second shift. Failed drafts remain available for an explicit retry. Provider-owner RLS remains the authorization boundary; no new policy or permission was introduced.

**Booking capture and refund accounting.** New migration `20261021090000_booking_capture_refund_binding.sql` binds a rejected capture's refund to that exact new ledger row and payment ID. Replays return the same refund request, so existing claim limits and unknown-outcome quarantine continue to apply. Rejected captures cannot inflate ordinary cancellation or no-show consideration, regardless of their refund status. Existing provider percentages, first-acquisition commission rules and repeat-booking rates are unchanged.

**Checkout.** Booking checkout verifies the active, verified seller using the same authoritative RPC already used for package/membership checkout. Booking query failures report unavailability. Routing-configuration failures, missing/malformed switch values and enabled splits without destinations stop before a charge request. Non-finite amounts are refused. Owner scoping and database-derived SAR amounts are retained.

The migration patches three uniquely verified blocks in the final canonical function definitions, aborting if the expected definition differs. It preserves intervening wallet, authorization, audit and locking fixes. It appends to the chain and does not rewrite old migrations or financial rows.

## Verification and review

Local verification is recorded in `.admin-console/evidence/reconciliation/verification.json` and the reconciliation worklogs. The refund implementation and checkout guards were reviewed by agents other than their implementers. Calendar review required a further correction to protect the pending save's draft/selection context.

Payment handler tests execute the actual handler with injected database/auth/config boundaries and an intercepted gateway request. Database tests apply the complete migration chain in disposable PGlite and execute the real SQL, including service-only denials, amount mismatch rollback, original-versus-duplicate ledger isolation, replay identity, audit idempotency, refund claim limits and ordinary cancellation/no-show rules. They do not prove simultaneous hosted multi-session execution or real gateway behavior.

Browser tests use the existing local Supabase stack and disposable provider fixtures, with only the first failure response intercepted. Explicit retries write through the authenticated owner session and are checked against database readback and reload persistence in English and Arabic. No shared database reset, hosted mutation or real payment is part of acceptance.

The reconciled lockfile uses Next.js **16.3.8**, React 19.2.4 and Supabase CLI 2.106.0; the older AGENTS version note says Next.js 16.2.9. The installed Next.js documentation was consulted for the existing page behavior. No dependency upgrade was made in this repair.

## Remaining work and holds

1. **Durable checkout attempts:** persist/claim immutable operation identity and request/result evidence before gateway dispatch; reconcile submission timeouts and concurrent retries. Current guards and exact-charge conflict refunds do not prevent duplicate checkout creation. This remains a financial release dependency.
2. **Historical financial evidence:** inspect the named hosted environment and actual gateway outcomes before deciding how to correct any already-misbound refund rows. This migration makes no historical financial changes.
3. **Provider allocation:** split checkout remains refused while enabled without destinations. Licensed-provider split settlement, merchant onboarding and actual sandbox acceptance remain unverified dependencies.
4. **First-acquisition lifecycle:** repeat commission remains zero. A durable acquisition record, concurrent first-booking handling and cancellation/refund lifecycle need a separate source-linked specification before changing the qualifying event; no numeric rate or provider term was inferred here.
5. **Broader regulated console:** release validation and coverage still contain prior unresolved work. This bounded repair does not clear unrelated capabilities or claim the full platform is ready for production.
6. **Production deployment, company-agent activation and financial transactions:** held for explicit CEO approval. No production branch merge or deployment was performed. The existing production release switch was not changed.

## Global skills

Separately, all ten requested GitHub repositories were installed globally as **134 new skill packages**. All 409 pre-existing global files remained unchanged; five colliding names received explicit namespaces. Source revisions, adaptations, support-file hashes and prerequisites are recorded in the separate third-party installation report and registry. Optional CLIs, automatic lifecycle hooks, MCP/cloud connections and credentials were not configured by copying the skill files. Skills are available from the next turn.

Next development slice: durable checkout-attempt and unknown-outcome reconciliation, followed by verified provider/schedule integration acceptance and the remaining release gaps. The CEO's held actions remain separate approvals.

## Final check results

| Check | Result |
|---|---|
| Full database suite, with all211 migrations | 1531 passed |
| Actual checkout queries on migrated schema, included above |3 passed |
| Edge / web / inventory / mobile unit |67 /871 /10 /29 passed |
| Calendar browser, AR/EN and failure/race recovery |7 passed |
| Web build, mobile/e2e type checks, security/admin guards, P3 compatibility |passed |
| Web lint |zero errors;300 warnings |
| Adminwright plan |exit0;0 errors |
| Adminwright release validation / coverage |exit1 /1;232 /4 errors |

The first aggregate run had one pre-existing recurring-fixture conflict, corrected without changing production availability or authorization assertions before the final complete rerun. The initial checkout draft's nonexistent direct provider column was also caught and corrected before publication. Updated independent review and the new migrated-query cases supersede the first stub-based assessment.

Implementation commit: `304e02e6c33aebac7cd6dc805faab024075af561`. This report and the coworking changelog record that immutable implementation in a subsequent documentation commit.
