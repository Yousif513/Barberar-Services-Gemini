# Durable checkout client implementation

Date: 2026-10-22. Implementer: hq_repo_inventory. Scope: authorized development repair in the managed reconciliation checkout. Independent review is a separate pass; this log does not mark any capability reviewed or authorize release.

## Result and boundaries

Every original web/mobile checkout invocation delegates to a shared per-platform adapter. An explicit user action first recovers the existing payable target. Only a precise recovery 404 `checkout_not_found`, or verified failed 409 `checkout_failed` / `state:failed`, permits the normal start request. Submitting, unknown and captured 202 outcomes are handled before any supplied URL. A lost or unreadable transport response remains unknown. Captured results refresh the authoritative booking/product record and give a receipt notice; browser navigation and client state do not activate a product.

Ready receipts require success/state, attempt ID, charge ID and a valid HTTPS URL without embedded credentials. Same-account/same-target in-flight actions share one dispatch. Both AR/EN copies direct the customer to check the existing record; uncertain outcomes never assert that nothing was charged.

Purchase creation persists an opaque identity or a pre-dispatch creation marker before invoking the existing business RPC. Reload/retry checks owned pending rows and all relevant material fields before resuming. The client never guesses between multiple rows or silently changes an existing tip/subscription/gift. Non-idempotent RPC response loss is held until an exact owned row is found. Membership commands retain their real idempotency key across reloads. Missing/corrupt/unwritable durable storage fails closed. A settled earlier record with changed form material produces a distinct `prior_settled` notice and does not report that the new form was paid or create it automatically.

Web stores only opaque IDs/command keys in localStorage; native uses the existing Expo SecureStore dependency, with browser storage for Expo web. Actor IDs namespace state. Authoritative database ownership/RLS and server authorization remain required. These local guards do not claim atomic duplicate prevention for simultaneous creation from different devices or tabs using non-idempotent creation RPCs.

## Reachable caller inventory at the initial freeze (native increment below)

The original inventory had 13 direct invocation locations (10 web, 3 mobile). There are now 16 shared-adapter delegation locations across 11 UI files, adding three existing-record continuation buttons. Membership buy/renew/pay share a single transport helper; counted as user actions rather than code locations this is 18 checkout entry actions. Pending booking list/detail links route to the existing confirmation Pay Now action rather than adding a transport invocation.

| UI source | Target and behavior |
| --- | --- |
| `web_platform/src/app/shop/[id]/page.tsx` | Package purchase resumes owned pending record; new booking redirects an uncertain/captured result to its existing confirmation record |
| `web_platform/src/app/customer/packages/page.tsx` | Purchase and pending-record continuation; pending passes remain visible even if the offer retires, show awaiting confirmation and cannot book/report as an active pass |
| `web_platform/src/app/customer/wallet/page.tsx` | Gift creation and existing pending gift continuation without re-entering recipient details; submitting form controls are guarded |
| `web_platform/src/app/customer/bookings/page.tsx` | Tip creation/recovery; first reads the actual prior tip, holds failed reads, locks an existing pending tip to its recorded amount; pending booking row/detail links lead to confirmation |
| `web_platform/src/app/customer/memberships/page.tsx` | Purchase/renewal use persistent command key; existing Pay Now recovers; actual membership list is refreshed |
| `web_platform/src/app/customer/group/page.tsx` | Existing per-booking Pay Now recovers and refreshes the group list on capture |
| `web_platform/src/app/customer/series/page.tsx` | Existing per-booking Pay Now recovers and refreshes the series list on capture |
| `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx` | Existing booking Pay Now recovers; existing authoritative polling/manual refresh remains |
| `web_platform/src/app/provider/pricing/page.tsx` | Subscription purchase resumes prior pending payment without cancelling it; explicit pending-record continuation shows recorded plan, interval and amount; plan/billing controls guarded while processing; free/paid status comes from database reads |
| `mobile_app/src/app/bookings.tsx` | Existing booking Pay Now and owned pending-package continuation use `openCheckout` / `openAuthSessionAsync` with allowed `mobileapp://bookings`; pending packages query their recorded snapshot, independent of live offers |
| `mobile_app/src/components/shop-details-modal.tsx` | New booking checkout closes to existing bookings after a retained booking receipt/uncertain checkout; package retries reuse durable owned purchase identity |

Shared modules: `web_platform/src/lib/payment-checkout.mjs`; `mobile_app/src/lib/payment-checkout.js`; mobile declaration `mobile_app/src/lib/payment-checkout.d.ts`; native storage adapter `mobile_app/src/lib/checkout-storage.ts`. Existing `mobile_app/src/lib/payment-return.ts` was reused unchanged: its finally callback reloads bookings and never trusts an auth-session browser result as proof of payment.

## Verified source fields and documentation consulted

Owned recovery uses: user_packages(customer_id, id, status, paid_at, package_id); gift_cards(purchaser_id, id, status, paid_at, recipient_name, recipient_phone, recipient_email, original_amount, message); booking_tips(customer_id, id, status, paid_at, booking_id, amount); subscription_payments(provider_id, id, status, paid_at, plan_id, billing_interval); memberships(customer_id, id, status, paid_at, plan_id, renewal_of). These were checked against migration source. Independent QA also probed all five tables in isolated migrated PGlite before source freeze.

Consulted installed primora-marketplace-payments, primora-durable-workflows, primora-mobile-engineering and test-driven-development; workspace and web/mobile AGENTS; installed Next16.3.8 use-client/error-handling documentation; official pinned Expo56 SecureStore and WebBrowser API documentation. No dependencies or runtime versions changed. Existing theme and components were reused; no screens or HQ surfaces were added.

## Validation evidence

- Initial client contract RED: 36 failed because both adapters were absent; implementation GREEN 36/36.
- Owned lookup/subscription mismatch additions RED 36 pass/4 fail (`preparePurchase` absent), then GREEN40/40.
- Independent reviewer identified completed earlier record vs changed form material ambiguity. Regression RED44 pass/2 fail (`captured` vs `prior_settled`), then GREEN46/46.
- Final focused command: `node --test web_platform/tests/payment-checkout-client.test.mjs mobile_app/tests/payment-checkout-client.test.mjs`: 46/46 pass. Every new suite hard-blocks global fetch and asserts zero unexpected network attempts. All service and gateway outcomes are controlled substitutes.
- Full mobile unit command: 52/52 pass; mobile typecheck exit0.
- Full web unit command: 894/894 pass after updating the group shared-delegation contract. Security-core exit0 after updating only the obsolete direct-invocation bindings and adding shared-adapter transport checks. Existing RPC/server protections retained.
- Web production build succeeded (103 pages). A later closure extraction exposed a nullable provider-id callback type error, fixed with a checked immutable provider ID; rebuild passed. The build shell had no NEXT_PUBLIC_SUPABASE_URL and used `supabase-not-configured.invalid`, with the existing sitemap provider-list fetch warning. Root will rebuild with local-stack environment in memory before browser checks.
- Focused web ESLint: exit0, zero errors, 66 warnings in touched legacy pages. Final aggregate lint/build/browser verification belongs to root after source freeze.
- `git diff --check`: exit0 before final source freeze; no SQL, Edge, manifest or package edits by this implementer.

## Limitations and next handoff

No real gateway request, financial transaction, hosted database write, migration application, production deployment or company-agent activation occurred. Node cases validate the client state contract; no browser/device UX is claimed by this implementer. Root owns the fixture-backed browser pass and final gates. New tests do not require a live backend.

The initial freeze lacked native pending-package continuation for retired offers; the authorized native increment below closes it in the existing Bookings screen. No separate purchased-packages screen was added. Web also retains owned pending package cards. Multiple unresolved pending rows, unreadable owned records and ambiguous non-idempotent creation markers are deliberately held for reconciliation rather than guessed or silently discarded.

No commit/push was performed by this worker. Root owns integration, audit metadata, changelog and the separate independent review. Do not mark production ready from this slice.


## Authorized native recovery closure after initial freeze

Root authorized a clearly labelled AR/EN unfinished-package-payments section in the existing mobile Bookings screen. It reads owned `user_packages` pending rows directly, with `customer_id = session.user.id`, no live catalogue join or active-offer filter. Snapshot fields are real migrated columns: `id,status,package_name_en,package_name_ar,amount_paid,session_count,created_at` (terms snapshot migration 20261018110000). Recorded price, sessions, purchase date and selectable stable purchase reference remain available for retired offers.

The section has named loading, signed-out, empty, failed-read/retry and pending states, exact-count server pagination, request-identity protection against old responses, AR/EN text/RTL rows and the existing warm-sand card/button styles. Pending sessions are labelled as awaiting confirmation, never usable/active. Continue existing payment invokes the same recovery-first target and auth-session browser, then rereads the authoritative package list on ready return, unknown or captured outcome. A ref guards repeated booking/package checkout taps. Modal package settled/captured outcomes notify the same owned section; no replacement purchase is created.

Independent review also found a misleading modal heading: a captured receipt said Booking failed above Payment received. The modal now uses localized Payment status for CheckoutStateError and a package heading for package creation failures; genuine booking-creation errors retain the booking-failure heading. Actual caller functions are transpiled and executed with controlled dependencies in both languages to verify this distinction.

New helpers/declarations: `mobile_app/src/lib/pending-package-payments.js` and `.d.ts`. Original 13 checkout locations became 16 UI delegations plus this owned-package continuation helper (17 transport delegation locations; 19 user action types when membership buy/renew/pay are counted separately).

Native regression RED: pending-package suite 0/7 because the helper was absent; GREEN7/7. Caller-title regression RED2 pass/6 fail with the old headings, then GREEN8/8. All use hard global fetch blocks and controlled data/service substitutes; no real payment or hosted write. Final targeted/full verification and independent re-review are recorded by root after this source freeze.


Native increment source freeze verification: full mobile units 67/67; mobile typecheck exit0; focused mobile lint 0 errors/8 legacy warnings; security-core exit0; UI/schema scan 312 RPC calls/202 select strings, 34 dynamic calls unchecked, zero mismatches; diff check exit0. This is source and controlled-test evidence. Actual native-device/Expo UI acceptance remains held; Next web browser tests do not certify native rendering. Independent reviewer is executing the real loader with an isolated fully migrated database to prove retired-offer recovery and another-customer exclusion.


Independent review finalized in `.admin-console/worklog/qa-checkout-clients.md` by skills_and_delivery. The separate reviewer requested no further client-code change after the native freeze and recorded C1-C4 corrected. Its scoped runs passed: 46 shared core cases, 38 final native-focused cases, 6 actual migrated/RLS retired-package loader cases, 4 extracted caller race/ref cases, and 18 earlier adverse cases; these overlap other runs and are not an additive repository total. No external network was used. Actual device/Expo UI acceptance and production release gates remain explicitly unclaimed. Full mobile repository command independently run by this implementer remains 67/67, with typecheck/security/schema/diff gates at 0.
