# MEMBER work package: G65 Memberships

Status: in progress (updated after every stage).

## Stage 1: plans, purchase, payment confirmation (migration 20261008300000_memberships_core.sql)

Tables: `membership_plans`, `membership_plan_services`, `memberships` (state machine `pending_payment -> active -> expired | cancelled`,
terms snapshotted on the row), `membership_payments`, `membership_redemptions`. All RLS read-only for clients, audit trigger and Data API grants attached.

Commands: `provider_create_membership_plan`, `provider_update_membership_plan`, `provider_set_membership_plan_active` (owner or admin only; plans start
inactive, no default price/visits/period), `purchase_membership(plan, idempotency_key)`, `renew_membership`, `cancel_membership`,
`confirm_membership_payment` (service role only). Helper `is_membership_staff(provider)` because `is_provider_staff` is not executable by clients.

Money (finding): `confirm_purchase_payment` for a package writes exactly one ledger row (`package_sale`, platform_share 0, provider_share = amount,
payout pending). There is NO commission, fee, VAT or invoice step in the package path today, and no helper to call. `confirm_membership_payment` therefore
reproduces that row and nothing more; a test asserts the ledger row and the provider balance delta equal an equal-priced package. If the owner wants VAT/commission on packages
and memberships, that is a change to both together (not done here, would redefine a core function).

## Stage 2: visits, void, expiry, reminders (migration 20261008310000_membership_visits.sql)

`redeem_membership_visit(membership, booking, notes)` and `void_membership_redemption(redemption, reason)` use the same staff test as `redeem_package_session`
(owner, active employee, administrator, delegate with the bookings permission, via `is_membership_staff`). Checks: membership active and inside
[period_start, period_end), visits remaining, booking belongs to the member at this provider, status confirmed or completed, not already covered by a package, covered service
(from the sold snapshot, not the live plan). One live redemption per booking is a partial unique index; the membership row is locked, so two concurrent redemptions cannot overspend.
Differences from packages, on purpose: a booking is mandatory; non-staff get "not found" (the member gets 42501).
`expire_memberships()` / `send_membership_expiry_reminders(days)` are service-role or admin functions; the reminder lead time has no default (owner decision), one reminder per
membership (`reminder_sent_at`), none when a paid renewal already follows. `list_provider_memberships` (audited read, names) and `list_membership_redeemable_bookings` feed the provider screen.

Schedule (owner configures; no pg_cron job is created): call `select expire_memberships();` hourly and `select send_membership_expiry_reminders(<days>);` daily with the lead time
the owner chooses, as service role (for example an Edge Function on a Supabase scheduled invocation, or pg_cron once the owner enables it). Expiry is also enforced at redemption time
(`now() >= period_end` is refused), so a late job never lets an expired membership be used.

Test note: the DB harness (PGlite) has one connection, so the "concurrent" tests prove the locking/unique-index logic through interleaved calls, not true parallel sessions.
