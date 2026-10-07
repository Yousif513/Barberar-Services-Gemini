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
