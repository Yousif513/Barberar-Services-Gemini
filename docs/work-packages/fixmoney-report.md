# FIX-MONEY report (defects M-01 family .. M-23 of docs/reviews/2026-10-08-security-money.md)

Branch wp/fixmoney. Migrations 20261009100000 .. 20261009149999. Tests: supabase/tests/db/fixmoney_*.test.mjs (each repro that passes was moved there
and removed from review_money_open.repro.mjs).

## Status per defect

| Defect | Status | Commit | Test |
|--------|--------|--------|------|
| M-01 package, gift card, tip, subscription | fixed (confirm_purchase_payment records the capture as `refund_pending` ledger row + `refund_requests` row `late:<charge>`, replay answered with `replay:true`; payment-webhook processes `refund_request_id` for every non-booking type) | see git log | fixmoney_purchase_conflicts.test.mjs |
| M-07 superseded subscription checkout | fixed (same path) | see git log | fixmoney_purchase_conflicts.test.mjs |
| M-04 late-completed booking never billed | fixed (migration 20261009110000: `bookings.fee_invoice_id` stamps each billed booking; a run bills every completed, unbilled booking visited on or before the month end; a month that already has an invoice gets a supplementary invoice `supplement_no` 1, 2, ... only when something new is billable; issued invoices never rewritten) | see git log | fixmoney_fee_invoices.test.mjs; fixdbb_fee_invoices.test.mjs updated (its old expectation "the late booking is silently ignored" is the defect) |
| M-05 invoice number collision | fixed (number carries the whole provider id; identity = unique (provider, period_start, supplement_no); legacy invoices keep their number) | see git log | fixmoney_fee_invoices.test.mjs |

Migration note M-04: invoices issued before the migration did not record what they billed, so every completed booking visited inside an already invoiced
month is stamped as billed by that month's original invoice. A booking completed after its (pre-migration) invoice cannot be told apart from the rest
(no completed_at exists); the integrator should compare `total_bookings_count` of old invoices with the actual count on production data and bill any difference by hand
(`update bookings set fee_invoice_id = null where id = ...` then run `issue_monthly_fee_invoices`).
