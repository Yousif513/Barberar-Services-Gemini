# Independent checkout client QA and source UX review

Date: 2026-10-22. Reviewer: skills_and_delivery, independent of the client implementer hq_repo_inventory. Scope: the frozen web/mobile checkout adapters, durable purchase-identity helpers, their executing Node suites, and the 11 reachable UI caller files. This is a scoped review, not regulated-admin release clearance or a device/browser acceptance claim. No manifest review fields were changed.

Status: **Scoped independent source/contract review finished after both source freezes.** C1-C4 were corrected before integration; no open finding requiring another client code change remains in this review. Native device/Expo UX and root browser/release gates remain separate, unclaimed acceptance work. Shared helper evidence remains bound to the recorded hashes.

## Findings and disposition

- **C1, corrected before source freeze:** A completed saved purchase A with changed form material B was reported as `captured`, which could imply that B had been paid. Both helpers now remove only the settled old saved identity, refresh where a product callback exists, and return localized `prior_settled` for changed material without creating B. The implementer's regression went RED (44 pass / 2 fail) to GREEN (46/46); this reviewer independently exercised EN/AR on both modules with no creation call. See `web_platform/src/lib/payment-checkout.mjs:120-125` and the corresponding mobile lines; suite case `completed prior purchase with changed material cannot be reported as payment for the new form`.
- **C2, corrected before source freeze:** Provider plan/billing selection could change during an unresolved checkout dispatch. The final handler refuses plan changes during processing and disables the plan, interval and payment controls. Fresh source review confirmed these guards at `web_platform/src/app/provider/pricing/page.tsx:288-289,471,538,700,749`. This is source evidence; a real browser race case was not executed by this reviewer.
- **C3, source recovery gap corrected in the authorized native increment:** The initial modal package recovery lacked a captured/settled product refresh and there was no retired-offer continuation. The existing Bookings screen now includes an owned pending `user_packages` section, independent of catalogue availability, with recorded snapshot context and Continue existing payment. The modal captured/settled callbacks notify its actual reread; the continuation helper refreshes after ready-return, unknown and captured outcomes. This reviewer executed the real loader against migrated tables with actual authenticated RLS/grants, including a retired offer and another-customer exclusion (six cases below). The section labels pending sessions as awaiting confirmation and cannot activate/use them locally. C3 is closed for source/controlled-query recovery acceptance; actual native rendering/deep-link acceptance remains held. No dedicated active purchased-packages management screen is claimed.

- **C4, corrected in the native increment:** The modal previously titled captured/submitting/unknown checkout notices `Booking failed`, including package receipts. It now uses localized `Payment status` for `CheckoutStateError`, a package heading for ordinary package errors, and retains the booking-failure title for actual booking creation errors (`mobile_app/src/components/shop-details-modal.tsx:290,314`). Eight actual extracted caller-function cases execute both languages with controlled boundaries and pass, including captured/unknown booking, real creation refusal and package captured receipt.

No additional defect requiring a client code change was found in the final frozen snapshot. Source and controlled-query acceptance do not establish device UX, hosted gateway or full product-lifecycle acceptance. No replacement purchase or business-agent activation was authorized by this review.

## Verified behavior and entry coverage

The original 13 invocation locations now delegate through per-platform adapters. The initial freeze had 16 delegations / 18 user actions across 11 UI files. The native continuation adds one helper delegation and one action: final 17 transport delegation locations / 19 user action types (membership buy/renew/pay counted separately). Source review followed their handlers to visible controls and existing destinations; this count is not a claim that all 19 were clicked in a browser/device.

| UI source | Reachable behavior checked |
| --- | --- |
| `web_platform/src/app/shop/[id]/page.tsx` | Package purchase uses durable owned purchase recovery; booking checkout retains its committed booking and routes an uncertain result to that booking's confirmation |
| `web_platform/src/app/customer/packages/page.tsx` | Purchase and existing pending purchase continuation; pending snapshots stay visible after offer retirement and cannot book as active passes; captured refreshes owned list |
| `web_platform/src/app/customer/wallet/page.tsx` | Gift purchase and pending gift continuation; full recipient/amount/message material checked; failed form retained, close/input guarded during submission; captured refreshes wallet |
| `web_platform/src/app/customer/bookings/page.tsx` | Tip creation/recovery checks the actual prior owned tip and locks pending recorded amount; failed prior read holds submission; pending booking row/detail links reach confirmation Pay Now |
| `web_platform/src/app/customer/memberships/page.tsx` | Buy, renew and existing Pay Now; buy/renew retain actual persistent business-command keys; captured refreshes authoritative list |
| `web_platform/src/app/customer/group/page.tsx` | Existing per-booking Pay Now and captured list refresh |
| `web_platform/src/app/customer/series/page.tsx` | Existing per-booking Pay Now and captured list refresh |
| `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx` | Existing booking Pay Now; captured refresh; existing authoritative polling/manual refresh |
| `web_platform/src/app/provider/pricing/page.tsx` | New or existing pending subscription; recorded plan/interval/amount displayed, changed pending intent held; no implicit replacement cancellation; processing context guarded; actual subscription status reread |
| `mobile_app/src/app/bookings.tsx` | Existing booking Pay Now plus owned pending package section/continuation (including retired offers); actual list refresh, named AR/EN states, exact-count pagination, request identity and allowed app return |
| `mobile_app/src/components/shop-details-modal.tsx` | New booking retention/continuation through bookings; package saved identity reused; captured/settled refresh notifications, neutral localized payment status notices |

`requestCheckout` recovers before dispatch. Only exact HTTP404 `checkout_not_found`, or HTTP409 `state:failed` with `checkout_failed`, permits the one start request. A generic 404/409, unreadable response, transport failure, submitting or unknown outcome cannot create another attempt through the helper. Captured/submitting/unknown are interpreted before any misleading URL. Ready navigation requires success/state, nonempty attempt/charge IDs and an HTTPS URL without embedded credentials.

Actor ID namespaces both in-flight checkout state and saved purchase identity. The purchase helper serializes same-actor/scope submissions within its JS module, inspects saved owned records, compares complete intended material, and holds corrupt state, inaccessible rows, multiple candidates or unresolved non-idempotent creation markers. It writes the marker before the business RPC. Membership retry reuses the persisted request key. Local data contains opaque IDs/keys, not card or recipient details; native uses the existing SecureStore adapter. Local storage and client session checks are not authorization boundaries: server ownership/RLS and Edge authorization remain required.

The actual `mobile_app/src/lib/payment-return.ts` calls `openAuthSessionAsync` with `mobileapp://bookings`, reloads bookings in `finally`, and never treats success/cancel/dismiss/query text as proof of capture. AR/EN error strings distinguish captured, submitting, unknown, failed and prior-settled. Source review confirmed retained gift/tip form state and guarded pending context. Visual RTL layout, accessibility, native deep-link dispatch and actual Expo browser behavior still require runtime acceptance.

## Independent execution evidence

1. `node --test web_platform/tests/payment-checkout-client.test.mjs mobile_app/tests/payment-checkout-client.test.mjs` rerun on final frozen helpers: exit0, **46 passed, 0 failed** (23 per platform). Both new suites hard-block global fetch and assert zero unexpected network. Client/service/gateway responses are controlled injected substitutes, not live gateway tests. Node reports the existing mobile package's module-type detection warning; it does not fail the cases.
2. Separate reviewer Node stdin harness: **18/18 adverse cases passed, zero external network attempts**. For each actual helper module: changed-material settled record in EN and AR; actor A/B saved-key isolation; corrupt idempotent marker without original key; mismatched 404 code; mismatched failed409 code; concurrent same-scope different intent held after one creation. Four additional cases imported the actual payment-return source through a type-erasure/injected Expo boundary and exercised success, cancel, dismiss and throw. Each used the exact return URL and notified reload once; none promoted returned URL/query content into capture. This validates the module contract with an injected Expo API, not a native device.
3. Separate isolated PGlite probe created the repository's migrated database and queried actual columns for all five owned purchase tables. Exit0 confirmed every selected material field and `paid_at`: `user_packages(customer_id,package_id)`, `gift_cards(purchaser_id,recipient_name,recipient_phone,recipient_email,original_amount,message)`, `booking_tips(customer_id,booking_id,amount)`, `subscription_payments(provider_id,plan_id,billing_interval)`, `memberships(customer_id,plan_id,renewal_of)`, plus each `id/status`. This is actual migrated-schema evidence, not a real PostgREST/HTTP/JWT integration test.
4. Fresh source grep plus surrounding handler/control review confirmed all 16 final adapter delegations, the two booking continuation links, pending package cards and provider processing guards.

Reviewed helper hashes (SHA256; both platforms identical):

- Web `payment-checkout.mjs` and native `payment-checkout.js`: `AB8FF10C0700DBD143EB90C716136A808C2A069C4D34595A3AC65474327176E1`.
- Web client suite: `F21B17822C6FE8C10A44B47B95557B4891ABF9F8ACB06714E5BD5FE41CB9AE24`.
- Native client suite: `AE9900175301E128863ACDDF786AC4DA2BEE0CFCD78963E3EFFF6E582BEB1793`.

## Limits and release handoff

The implementer's worklog reports web894/mobile67 unit cases after the native increment, mobile typecheck, build and security-core passed. These aggregate results were not independently rerun by this reviewer. Root owns the fixture-backed browser suite, the local-environment rebuild, aggregate checks and final release metadata. This reviewer inspected the checkout-recovery browser cases but did not execute them; controlled responses in those cases are not Tap sandbox acceptance.

C3 source recovery is corrected; native device/Expo acceptance remains unverified. Local module serialization does not give atomic cross-device/cross-tab duplicate prevention for non-idempotent business-record creation; existing server constraints and durable checkout-attempt rules must supply their separate guarantees. Ambiguous creation/recovery is deliberately held for reconciliation. No real gateway, credentials, hosted database, financial mutation, deployment or company-agent activation was used by this review. No new company authority or production permission was granted.

Adminwright release validate/coverage were not run or marked cleared in this scoped review. Completion of this client review does not establish feature-wide or platform production readiness. The independent SQL/Edge reviews, root's browser evidence, remaining native device acceptance and existing regulated-console release gaps remain separate gates.


## Native increment independent re-review and execution

Final native source freeze was received after the bounded Bookings section and modal notice correction. Re-read the helper, declaration, Bookings load/continuation/control/state wiring, modal callbacks/catch headings, executing tests and updated implementation log. Owned read explicitly filters session customer and pending state, orders by created_at plus id, pages 25 rows with exact count, and reads snapshot fields without a packages join or is_active condition. The UI has separate loading, signed-out, empty, page-empty, query-error/retry and pending states, recorded SAR price/sessions/date/id, AR/EN labels and RTL row/text styles. The ref guard prevents repeated checkout dispatch while a booking/package action is pending. Unmount/context cleanup invalidates old package reads.

- Ran `node --test mobile_app/tests/payment-checkout-client.test.mjs mobile_app/tests/pending-package-payments.test.mjs mobile_app/tests/checkout-modal-status.test.mjs`: **38/38 passed, exit0** (23 previously reviewed core +7 new package +8 actual caller-title cases). All new suites hard-block global fetch; zero unexpected network. Together with the web suite above this covers61 distinct supplied client cases; the23 native core cases were deliberately rerun after the increment.
- Ran the actual `loadPendingPackagePayments` through a constrained query adapter into isolated fully migrated PGlite as **authenticated**, using the real role grants/RLS: **6/6 passed, zero network**. Created two customer fixtures and real pending purchases through `purchase_service_package`, then legitimately retired the offer with `is_active=false`. The owner still received its recorded name/amount/sessions; the other customer received only its own purchase; a malicious owner filter under the other database actor returned zero; page1 was empty with exact total1; signed-out identity issued no query; an isolated fixture transition to active/paid disappeared after reread. Five exact selected-column/filter/order/range queries executed. This is real SQL/RLS evidence through an injected PostgREST-shaped boundary, not actual PostgREST/HTTP/JWT or capture-provider evidence.
- The first fixture attempt also changed sold price/sessions and was correctly rejected by the existing `package_sold` invariant. No product defect was inferred: reran using legitimate retirement only, as above. No constraint, trigger, migration or product code was changed for the probe.
- Ran **4/4 reviewer cases** executing the actual extracted/transpiled Bookings load/continue callback bodies with injected boundaries: delayed old-account success cannot replace current results; old failure cannot override newer success; cleanup invalidates an outstanding result; double continuation taps invoke the existing target only once. Zero network. These prove callback contracts, not React scheduling, Supabase SDK auth-lock behavior or native rendering.

Final native snapshot SHA256:

- Bookings screen: `7F8A4C1D9B0266AB382D63DF3FEBF39C67C649D5B750F934A839BD102A430EDD`.
- Shop modal: `16E098DCC5CE71356AEB54915277F81ED65BAE6451A8CFB15CF110E4E2630483`.
- Pending package helper: `D842D99DA2134F0B9E3213BD5A6F3866FEB258262B0730970C904B0CBCB83FC2`.
- Pending package suite: `0BF9C5B00F126D2FC18633E860383E3E3900DD6D3788A9BC404D6BB6823C2277`.
- Caller-title suite: `AEAEF0581A3989921A5575FE86100DCCD191D8B8CBEB0675F38DE3E78C75794A`.

No client code, SQL, manifest or other worker file was edited by this reviewer. Root owns final browser/build/release evidence and integration; this review supplies no company activation, production clearance or financial authorization.
