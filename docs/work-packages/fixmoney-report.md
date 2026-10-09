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
| M-12 anonymous placement search writes | fixed (migration 20261009142000: `get_sponsored_placements` is a pure read; `record_sponsored_click` stamps the rotation for a recorded click; new service-role `record_sponsored_impressions(uuid[])` for the trusted server-side recorder) | see git log | fixmoney_sponsored_read_only.test.mjs; sponsored.test.mjs rotation tests now record impressions through the service command |

Open for M-12: nothing calls `record_sponsored_impressions` yet (the shop search runs in the browser and there is no server route). Until a server-side caller or a scheduled job records shows, the rotation advances on clicks only, so with more eligible campaigns than slots the same campaigns stay on top until clicked. Wire the recorder (Edge Function or scheduled job) before relying on the fairness promise.
| M-16 duplicate ZATCA invoice per booking | fixed (migration 20261009143000: advisory lock taken before the existing-invoice check; partial unique index on `invoices(booking_id)`) | see git log | fixmoney_invoice_chain.test.mjs. True concurrency not provable on PGlite (single connection); the unique index is the backstop. If production already holds two invoices for one booking the index creation fails loudly: resolve with credit notes first (M-18 is an owner item) |
| P-15 non-deterministic invoice chain order | fixed (same migration: `invoices.chain_seq`, per-provider counter assigned by a BEFORE INSERT trigger under the same lock, unique (provider_id, chain_seq); existing rows numbered once in (created_at, id) order; the chain follows `chain_seq`) | see git log | fixmoney_invoice_chain.test.mjs |
| M-22 confirm_booking_payment granted to authenticated | fixed (migration 20261009144000: EXECUTE for service_role only) | see git log | fixmoney_grants.test.mjs; qa_adversarial.test.mjs now expects no service-role-only command in the client-executable set |
| M-23 write grants broader than policies | fixed as far as policies allow (same migration: INSERT/UPDATE/DELETE revoked from `authenticated` wherever no permissive policy for that command applies to it; before: 56 tables with INSERT/UPDATE and 52 with DELETE, after: 54/54/50; `payout_requests` loses INSERT, so only `request_provider_payout` creates requests) | see git log | fixmoney_grants.test.mjs (catalog-driven: fails when a privilege has no policy behind it) |

Note on M-23: most money tables keep their client privileges because their only write policy is the administrator policy (`is_admin()`), which applies to the role `authenticated`; their privileges are needed for an administrator who writes through the Data API. Removing them is a design change (every administrator write through a command) and is not done here.
| M-13 sponsored new-client lock per campaign | fixed in code (migration 20261009145000: advisory lock on (provider, customer) before the decision) | see git log | fixmoney_sponsored_read_only.test.mjs (source order only; the two-session race cannot be run on PGlite) |

## Not done, and why

| Item | Status |
|------|--------|
| M-17 open unpaid series/group holds per customer | deferred (needs a per-provider cap setting: business value, owner) |
| M-19 plan limits fail open; plan change forfeits paid time | deferred (proration is an owner decision) |
| M-20 package session plus membership visit on one booking | deferred (by code reading only, not reproduced; not attempted for budget) |
| M-01..M-03 (memberships, wallet credit) | already fixed in the base commit, not redone |

## Owner / legal decisions (not mine, listed for the owner)

- M-11: VAT 15 percent hard-coded on platform fees (`generate_provider_monthly_fee_invoice`) and the 15 percent fallback commission when no fee rule matches; whether commission is VAT-inclusive; fail closed on a missing rule.
- M-15: VAT on sponsored fees, and invoicing a sponsored fee for a provider with no later completed booking.
- M-18: credit notes / correction mechanism for tax invoices and the global invoice sequence (ZATCA counter rules).
- M-21: late-cancellation fee avoidable by paying with credit/gift card/coupon (policy).
- M-06: intended annual subscription price (see above). M-09: whether package/membership/gift-card sales and bookings need a payout holding period (none exists in `platform_settings`).

## Verification (run in the worktree, node_modules junction, no npm install)

| Command | Result |
|---------|--------|
| `node --test "supabase/tests/db/**/*.test.mjs"` | 1106 tests, 1106 pass, 0 fail (includes the new fixmoney_*.test.mjs files) |
| `node --test supabase/tests/inventory.test.mjs` | 10 pass, 0 fail |
| `node scripts/verify-ui-schema.mjs` | checked 194 rpc calls and 229 select strings; 0 mismatches |
| `npm run test --workspace=web_platform` | 714 pass, 0 fail |
| `npm run test:security-core` | Security core verification passed |
| `npx tsc --noEmit -p web_platform` | exit 0 (provider/pricing page touched) |

Not run: `npm run build --workspace=web_platform` and eslint (junctioned node_modules); the integrator builds after merging. Edge Function change (payment-webhook) is read-only verified: no Deno here.

## Files touched outside fixmoney_* and the new migrations

- `supabase/functions/payment-webhook/index.ts` (refund_request_id handling for every non-booking purchase type)
- `web_platform/src/app/provider/pricing/page.tsx` (price from `quote_provider_plan`, hard-coded prices and the screen-only VAT row removed)
- Tests updated for intended behaviour changes: `fixdbb_fee_invoices.test.mjs` (late activity now yields a supplementary invoice), `booking_engine_attribution.test.mjs` (import goes through the command and a review), `sponsored.test.mjs` (rotation recorded through `record_sponsored_impressions`), `qa_adversarial.test.mjs` (no service-role-only command left for `authenticated`)
- `supabase/tests/db/review_money_open.repro.mjs` deleted (all seven reproductions now pass as normal tests)

## Migrations (timestamps 20261009100000 .. 20261009145000)

100000 purchase_capture_conflicts, 110000 fee_invoice_carry_forward, 120000 subscription_price_quote, 130000 walk_ins_are_not_first_visits, 140000 import_channel_review,
141000 payout_after_visit, 142000 sponsored_placements_read_only, 143000 invoice_chain_integrity, 144000 revoke_unneeded_write_grants, 145000 sponsored_new_client_lock.
