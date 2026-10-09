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
| M-06 yearly subscription undercharged | fixed (migration 20261009120000: `quote_provider_plan(plan, interval)`; `subscribe_provider_plan` charges its `total_sar`; yearly = `price_yearly_sar` x 12; provider pricing screen reads the same RPC, its hard-coded 299/239/799/639 table and the screen-only 15% VAT row are removed) | see git log | fixmoney_subscription_quote.test.mjs |

OWNER MUST CONFIRM (M-06): the seeded `price_yearly_sar` (growth 239, elite 639) is treated as a PER-MONTH rate billed annually (239 = 299 x 0.8), as the old screen did, so
an annual growth subscription now charges 2,868.00 SAR and elite 7,668.00 SAR. If the intended annual price is the stored number itself, change the single
`months` multiplier for yearly in `quote_provider_plan` (and nothing else; the screen follows). The quote adds NO VAT: the old screen displayed a 15% VAT row that was never
charged; it was removed rather than invented (VAT on platform fees is owner item M-11).
| M-08 walk-in removes first-visit commission | fixed (migration 20261009130000: the first-visit test in `booking_create_internal` and `handle_booking_first_visit_detection` ignores `source = 'walk_in'` and `total_price = 0` bookings) | see git log | fixmoney_first_visit.test.mjs |
| M-14 walk-ins billed as sponsored acquisitions | fixed (same migration: `sponsored_attribute_completed_booking` skips walk-ins and ignores them when deciding "new client") | see git log | fixmoney_first_visit.test.mjs |
| M-10 'import' channel self-attested | fixed (migration 20261009140000: contacts are created only by `import_provider_clients` (no INSERT policy/privilege; owners keep SELECT, DELETE and UPDATE of name/notes/VIP only); `resolve_booking_source` honours `import` only for a contact of an import reviewed with new `admin_review_client_import(import_id, reason)` (stores reviewed_by, reviewed_at, review_reason, audited, idempotent) and not for a customer with a marketplace booking before the review) | see git log | fixmoney_import_channel.test.mjs; booking_engine_attribution.test.mjs updated (import now goes through the command + review) |

Not built: an administrator screen for `admin_review_client_import` (the command and its audit exist; deferred, web scope). Until an admin reviews an import, the provider's imported clients pay the normal first-visit commission.
| M-09 deposits payable before the visit; refund after payout fails | fixed (migration 20261009141000: a `booking_payment` ledger row counts in `provider_available_balance` and is allocated by `admin_release_payout` only once its booking is `completed`; `claim_refund_request` no longer refuses a share already paid out; `complete_refund_request` books a `provider_receivables` row (new table, RLS read for owner/admin, audit trigger) when the customer refund succeeds; the balance subtracts open receivables; the next release consumes requested amount + open receivables and settles them) | see git log | fixmoney_payout_after_visit.test.mjs (the reviewer's M-09 repro is the third test) |

Decisions for M-09: no payout hold period exists in `platform_settings`, so none is applied (completion is the only condition). Package, gift card, subscription and tip ledger rows keep their previous payability
(package sales have no visit: whether they need a holding period is an owner decision). The receivable is the paid-out part of the refunded share (payout_allocations of that ledger row x refund / captured), capped by what was paid out.
The original reproduction file `review_money_open.repro.mjs` is deleted: all of its tests (M-04 .. M-10) now live in fixmoney_*.test.mjs.
