# FIX-MONEY report (defects M-01 family .. M-23 of docs/reviews/2026-10-08-security-money.md)

Branch wp/fixmoney. Migrations 20261009100000 .. 20261009149999. Tests: supabase/tests/db/fixmoney_*.test.mjs (each repro that passes was moved there
and removed from review_money_open.repro.mjs).

## Status per defect

| Defect | Status | Commit | Test |
|--------|--------|--------|------|
| M-01 package, gift card, tip, subscription | fixed (confirm_purchase_payment records the capture as `refund_pending` ledger row + `refund_requests` row `late:<charge>`, replay answered with `replay:true`; payment-webhook processes `refund_request_id` for every non-booking type) | see git log | fixmoney_purchase_conflicts.test.mjs |
| M-07 superseded subscription checkout | fixed (same path) | see git log | fixmoney_purchase_conflicts.test.mjs |
