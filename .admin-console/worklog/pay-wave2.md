# pay-wave2 — prepaid refunds, unknown refund outcomes, package terms (2026-10-18/19)

Role: payments implementer. Branch `claude-code` in `primora-fix`. Plan of record: RT-H2 and RT-M3 fixes in
`docs/reviews/2026-10-17-redteam-whole-stack.md`, QA item 4 in `docs/reviews/2026-10-17-qa-release-gate.md`, the money-related
remainder of P-13/P-14 (`docs/reviews/2026-10-08-security-privacy.md`), memo D-Q5/D-Q8/D-Q9/D-L. Nothing reviewed by this agent.

## Built (commits 53e92be, fc76db1, 83a4e56, 37f14b8, d46c562, d4243fe, bcf03d2, 2d1e3dd)

| Item | Migration / code | Result |
|---|---|---|
| QA 4 unknown refund outcome | `20261018100000`, `_shared/refunds.ts`, `_shared/tap-refund-status.ts`, `process-refund`, `check-refund-status`, `/admin/refunds` | timeout, dropped connection, 5xx/408/409/425, 2xx without a refund id or with an unknown status = `unknown` (never claimed, queued or retried); a stuck refund becomes `unknown`, not `failed`; Check with Tap reads the refund by id or searches POST /v2/refunds/list for the request id in the metadata (`apply_tap_refund_lookup`: issued completes it with the ledger effects, failed makes it retryable, not found changes nothing, two matches refused); `admin_request_refund_outcome_decision` -> `refund_outcome` approval by a different money.refund holder citing the Tap refund id; unknown and failed refunds count as open money |
| RT-M3 | `20261018110000`, `20261018150000`, `payment-checkout` | user_packages snapshot (provider, service, sessions, validity, names), frozen; sold packages keep their terms and cannot be deleted (cascade removed); only active+verified providers sell (purchase, checkout, public policies); a late payment after the provider stopped selling cancels the purchase and queues a refund (packages and memberships) |
| RT-H2 cancellation refund + M-09 prepaid | `20261018120000` | ledger/refund rows linked to their purchase; `ledger_prepaid_earned_share` (delivered visits/sessions, everything once ended, nothing held by open refunds or an open dispute) used by `provider_available_balance`, `admin_release_payout`, `admin_release_ledger_item` (which now also refuses bookings whose visit is ahead); `cancel_membership` queues the refund in the same transaction; console uses `admin_cancel_membership` (step-up, operations.write, 10-char reason, D-Q5 thresholds, `membership_cancellation` approval); receivable for prepaid refunds after payout = paid beyond remaining share |
| RT-H2 dispute path | `20261018130000`, `/customer/memberships`, `/customer/packages`, `src/lib/purchase-disputes.ts`, `/admin/disputes`, `/admin/approvals` | `open_purchase_dispute`; `resolve_booking_dispute` handles purchases (full refund ends the product); customer screens show report and refund status (AR/EN); privacy copy lists purchase refunds |
| P-13 | `send-notification`, `expire-holds` | `serviceKeyMatches`; guard test over every function |
| P-14 (money part) | `20261018140000` | memberships, redemptions and draft plans readable by owner and provider-wide delegates only; chain report roll-up tested |

## Owner defaults (recorded as decisions, status assumed)

1. Customer cancels a paid membership: refund = price x unused visits / visits per period.
2. Provider or console cancels: refund = price x the greater of unused visits and unused time.
3. Rounding to the halala, half up (customer side). Nothing refundable once the period is over.
4. Prepaid value earned on a completed booking (package sessions recorded without a booking: when recorded); unused value is earned
   by the provider at expiry; an open dispute holds the whole remainder.
5. No break-glass for `refund_outcome` or `membership_cancellation`; with a single admin they wait for a second person.
6. Counter staff (active employees, any branch) keep the member list.

## Checks

test:db 1497 tests: 1493 pass before another agent's untracked `20261018210000_dbsec2_booking_hold_limits.sql` appeared (the 4
failures then were mine and are fixed: anon allow-list, console HINT translations); with that file present 26 fail, all
"You already have 2 unpaid bookings" / coupon counts from RT-M1 work in progress, none in paywave2 files. New suites:
paywave2_refund_unknown 11, paywave2_package_terms 8, paywave2_prepaid 14, paywave2_purchase_disputes 6, paywave2_membership_scope 3.
test:edge 54/54, test:ui-schema 0 mismatches, web 822 (821 + the hint test fixed after), security-core and admin-controls pass,
test:p3-compat HEAD pass, `npx tsc -p web_platform` 0, `npm run lint` 0 errors, typecheck:mobile 0, deno lint 50 files clean,
deno check 21/21, smoke 19/19, changed routes 200 on :3100. Migrations applied with `supabase migration up --local --include-all`.

## Not verified without Tap's sandbox

Tap honouring the refund Idempotency-Key; the list endpoint (POST /v2/refunds/list, `refunds`/`has_more`/`starting_after`) and
whether refunds carry our metadata back; the full refund status vocabulary. Not browser-tested with a TOTP session.

## Next agent's first action

adminwright-security over refund.retry/refund.execute/membership cancel/purchase disputes: re-read migrations 20261018100000–150000,
attack apply_tap_refund_lookup (wrong charge, reused Tap id), the governance flags (`primora.console_membership_cancellation`), the
earned-share function with voids, renewals and partial refunds; then a TOTP browser pass over /admin/refunds and the customer screens.

## Manifest (written last, via the script)

4 decisions (paywave2-membership-refund-rule, paywave2-prepaid-earned-as-delivered, paywave2-unknown-refund-resolution,
paywave2-membership-member-list-staff, all `assumed` for the owner), gap refund-outcomes-that-cannot-be-known-have-no-recovery
fixed with evidence, 3 gaps opened (tap-refund-lookup-and-idempotency-unverified blocked, mobile-app-has-no-purchase-dispute-path,
provider-wallet-balance-computed-in-browser), agent record pay-wave2. validate 0; coverage 1 (same 4 structural orphans);
validate --phase release 1 (220 errors: 217 before this pass, +4 assumed decisions awaiting the owner, -1 high gap fixed).
