# Independent checkout browser QA

Reviewer: `server_hq_audit` (did not implement the reviewed browser changes). Date: 2026-10-22. Checkout HEAD: `6328543` plus the current uncommitted development slice.

Scope: root-authored `e2e/specs/checkout-recovery.spec.ts` and the targeted changes in `e2e/support/booking.ts` and `e2e/specs/booking-deposit.spec.ts`. Read the shared fixtures, stack discovery, global setup, local SQL/API helpers, and Playwright configuration. No application client, Edge Function, SQL, or manifest edits were made by this QA pass.

## Findings and disposition

No actionable defect found in this bounded browser-test slice. The updated initial-checkout assertion correctly expects the existing recovery request to return `checkout_not_found`, followed by a fresh request for the same booking. It verifies both request bodies and the actual local booking/ledger result. The console-error exception is restricted to the deliberately stubbed 404 on `payment-checkout`; it does not suppress arbitrary errors. This is a fixture/assertion update for the intended protocol, not a reported product defect.

The English desktop (1440 x 900) and Arabic phone (375 x 812) cases assert that an unknown result remains visible after reload and explicit retry, both calls target the same existing booking with `action: recover`, and its authoritative database status remains `pending_payment`. The captured case updates the real local booking through the existing confirmation RPC, then verifies that the client refreshes to Booking Confirmed and removes Pay deposit.

## Independent verification

Executed in the managed checkout:

```powershell
$env:E2E_BASE_URL='http://localhost:3112'
npx --no-install playwright test e2e/specs/checkout-recovery.spec.ts e2e/specs/booking-deposit.spec.ts --grep 'unknown checkout|captured recovery|a customer books on the shop' --workers=1
```

Result: exit 0, **4 passed in 13.1 seconds**, one Chromium worker, no retries. The only run warning concerned NO_COLOR/FORCE_COLOR. Every selected test passed its unexpected browser-console/uncaught-error assertion.

Evidence: `e2e/.report/` and `e2e/.results/`, including `checkout-held-en.png` and `checkout-held-ar.png` in the corresponding checkout-recovery result folders. Screenshots were produced by the tests; no separate visual-design acceptance is claimed.

## Safety and limits

Stack setup rejects non-loopback Supabase, app, and Mailpit addresses. Browser contexts abort the known hosted Supabase and Tap/gotap hosts. Selected tests intercept the checkout endpoint and the synthetic `tap-checkout.e2e.invalid` destination; captures use only the local service RPC. This run exercised real local authentication, booking creation, persisted booking/ledger checks, navigation, and client recovery behavior with controlled payment receipts.

The run did not execute the real Edge checkout handler, Tap SDK/API, a hosted environment, production deployment, or any financial transaction. Provider acceptance, durable-attempt SQL contracts, webhook binding, and the complete regression suite require their separate recorded verification. No source correction was required during this pass.
