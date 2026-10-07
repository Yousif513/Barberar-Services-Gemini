# MEMBER work package: G65 Memberships

Providers sell a period membership with included visits; customers buy it through the hosted payment page; staff redeem a visit against a booking.

## What was built

**Migrations** (`supabase/migrations/`)
- `20261008300000_memberships_core.sql`: tables `membership_plans`, `membership_plan_services`, `memberships`, `membership_payments`, `membership_redemptions`
  (RLS read-only for clients, audit trigger and Data API grants on all five); commands `provider_create_membership_plan`, `provider_update_membership_plan`,
  `provider_set_membership_plan_active`, `purchase_membership(plan, idempotency_key)`, `renew_membership(membership, key)`, `cancel_membership(membership, reason)`,
  service-role-only `confirm_membership_payment(membership, payment_intent_id, amount)`; helpers `membership_validate_plan_terms`, `membership_open_purchase`, `is_membership_staff`.
- `20261008310000_membership_visits.sql`: `redeem_membership_visit`, `void_membership_redemption`, `expire_memberships()`, `send_membership_expiry_reminders(days)`,
  read models `list_provider_memberships` (audited) and `list_membership_redeemable_bookings`.

**Edge Functions** (only these two edits; they cannot be run here, no Deno): `payment-checkout` gets a `membership` case that reads `memberships.amount_due` and the status from the
database row (the customer's own pending row) and never the request; `payment-webhook` routes `purchase_type = membership` to `confirm_membership_payment` with the verified, CAPTURED, SAR charge id and amount.

**Web**: `/provider/memberships` (plans with create, edit and on/off sale; members with balance, status filter and server pagination; redeem dialog listing only eligible bookings; history with void),
`/customer/memberships` (owned memberships with balance, renew, cancel, complete payment, browse and buy, payment handoff and post-payment polling like `/customer/packages`),
shared wording `web_platform/src/lib/membership-copy.ts`, one nav entry in each layout, source guard `web_platform/tests/memberships-screens.test.mjs`.

## Behaviour and decisions

- State machine `pending_payment -> active -> expired | cancelled`. A membership is active ONLY after `confirm_membership_payment`; client roles have no write privilege on any of the tables, so a customer cannot activate, extend or edit one (tested).
- Terms (name, price, period days, visits, covered services) are copied onto the membership row at purchase; a plan edit or deactivation never changes memberships sold, and a pending purchase settles at its sold price (tested).
- Plans start inactive and have no default price, visits, period or coverage: "every service" versus "chosen services" is an explicit choice. Plans are managed by the provider owner (or an administrator) only.
- v1 benefit is included visits only. **Percentage discounts are deferred** (stated on both screens). No automatic card-on-file renewal: renewal is customer-initiated, creates one new pending payment (one open renewal at a time) and starts when the current period ends (`period_start = old period_end`); unused visits do not roll over. A bilingual reminder notification goes out before the period ends.
- Money, mirrored from the package path: `confirm_membership_payment` writes the same single ledger row as the package branch of `confirm_purchase_payment`
  (`entry_type = package_sale`, `platform_share = 0`, `provider_share = amount`, `payout_status = pending`), idempotent on the payment intent id (a replay returns `already_recorded`; the same intent used for another purchase is refused with 23505; a wrong amount is refused with 22003). Revenue is recognised at purchase; a redemption writes no ledger row (tested).
  **Finding for the owner:** the existing package path records no platform commission, fee, VAT or invoice, and there is no helper to call. Memberships therefore carry none either, and a test asserts the ledger row and the provider balance change equal an equal-priced package. If commission or VAT should apply to packages and memberships, that is one change to both (it would redefine a core money function, so it was not done here).
- Redemption uses the same permission as `redeem_package_session` (owner, active employee, administrator, delegate with the bookings permission). Rules: membership active and inside `[period_start, period_end)` (the end instant is already over), visits remaining, booking belongs to the member at this provider, status confirmed or completed, not already covered by a package session, a covered service (from the sold snapshot), one live redemption per booking (partial unique index), and the membership row is locked so two redemptions cannot overspend. A booking is mandatory (stricter than packages). Non-staff are told "not found"; the member gets 42501.
- Void needs a reason (3+ characters) and returns the visit once while the membership is active.
- Cancellation (customer, owner or administrator, with a reason) never moves money; a refund goes through the existing refund process.
- Privileged reads (the member list with names) write an audit event; every command writes `write_audit_log`.
- Table reads: the member, the owner, an administrator or a delegate with the bookings permission read the rows; a plain employee works through the audited list function. The cross-tenant sweep in `qa_adversarial.test.mjs` caught my first, wider policy; it was narrowed.

## Scheduling (owner configures; no cron job is created and no earlier migration uses pg_cron for this)

Call as service role: `select expire_memberships();` hourly, and `select send_membership_expiry_reminders(<days>);` daily with the lead time the owner chooses (1 to 60, no default). Both are also callable by an administrator. Expiry is also enforced at redemption (`now() >= period_end` is refused), so a late job never lets an expired membership be used.

## Commands run

- `node --test supabase/tests/db/memberships.test.mjs`: 33 tests pass (plans, purchase, webhook replay, wrong amount, wrong intent, concurrent confirmations, plan edit versus sold, package equality, renewal, cancel, redeem, double and concurrent redeem, other provider's staff, void, expiry boundary, reminders; roles: anonymous, customer, stranger, owner, other owner, employee, other provider's employee, administrator, service role).
- `node --test "supabase/tests/db/**/*.test.mjs"`: first run 785 of 786 (the cross-tenant sweep, fixed as described above); final run 786 of 786 pass.
- `node scripts/verify-ui-schema.mjs`: 0 mismatches. `npx tsc --noEmit -p web_platform`: clean. `npx eslint` on the changed files: 0 errors (one pre-existing warning in `customer/layout.tsx`). `npm run test --workspace=web_platform`: 470 pass. `npm run test:security-core`: passed.
- `npm run build --workspace=web_platform`: fails only because of the junctioned `node_modules` ("Symlink [project]/node_modules is invalid"); the integrator builds after merging.

## Not verified / limits

- The Edge Function edits are untested at runtime (no Deno, no Tap network access); they are covered by source guards and by the database tests of the function they call.
- The DB harness has a single connection: the "concurrent" tests prove the locking and unique-index logic through interleaved calls, not true parallel sessions.
- The screens were checked against the migrated schema (`verify-ui-schema`) and type-checked, not driven in a browser (no reachable Supabase).
- A second Tap capture for the same membership (the customer pays twice on two charges) is refused like a duplicate package payment (the webhook answers an error); a refund path for that case is the existing late-payment refund flow and is not wired for memberships.
- Plain employees have no screen (the provider layout shows employees only `/provider/my-day`); the database permits them to redeem. Delegates and owners use `/provider/memberships`.

## Files touched outside the package's own files

`web_platform/src/app/provider/layout.tsx` and `web_platform/src/app/customer/layout.tsx` (one nav entry and its two-language label each),
`supabase/functions/payment-checkout/index.ts` and `supabase/functions/payment-webhook/index.ts` (the two permitted edits).
