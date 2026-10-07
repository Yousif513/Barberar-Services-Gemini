# FIX-DBA report

Branch `wp/fixdba`, migrations `20261007010000` .. `20261007049999`. Status per defect: `fixed` / `not reproduced` / `deferred (reason)`.
Tests: `supabase/tests/db/fixdba_*.test.mjs`.

| Defect | Status | Migration | Test |
|---|---|---|---|
| D-08 bounds on provider money terms | fixed | `20261007010000_provider_booking_policy.sql` | `fixdba_booking_policy.test.mjs` (D-08 suites) |
| D-27 `set_provider_booking_policy` | fixed | `20261007010000_provider_booking_policy.sql` | `fixdba_booking_policy.test.mjs` (D-27 suite) |

## D-08 / D-27 notes

- CHECK constraints: `free_cancellation_hours` 0..720, `late_cancellation_fee_percent` and `no_show_fee_percent` 0..100, `deposit_percentage` above 0 and at most 100
  (the old 0..100 constraint let a deposit of 0 confirm a booking without payment). Rows already outside the bounds are clamped by the migration (a deposit of 0 or less becomes 20, the original default).
- Platform floor: `platform_settings.minimum_online_deposit_percentage` is seeded as JSON `null` (unset, needs the owner's approval). `admin_update_platform_setting` was patched in place (pg_temp.patch_function) to accept a percentage above 0 and at most 100, or `null`. A trigger on `providers` enforces the floor whenever the deposit is written, directly or through the command (it does not block unrelated edits when the floor later rises above an old deposit).
- Command `set_provider_booking_policy(p_provider_id, p_free_cancellation_hours, p_late_cancellation_fee_percent, p_no_show_fee_percent, p_deposit_percentage, p_reason DEFAULT NULL)`: owner, a delegate holding an active business-wide (`branch_id IS NULL`) `manager`/`owner` membership with `permissions.settings = true`, or an administrator (reason of 3+ characters required when the business is not their own). Strangers get `P0002`, staff without the permission `42501`, anonymous has no EXECUTE, the service role has no acting user (`28000`). Idempotent (same values: `changed=false`, no audit row, stamp unchanged). Audited as `provider.booking_policy_set` with before/after and reason.
- `providers.policy_confirmed_at` / `policy_confirmed_by` added; the stamp can only be written by the command (trigger resets it for every other writer except the service role). The provider dashboard checklist step "Policy" should read `policy_confirmed_at IS NOT NULL`.
- New delegate permission key: `settings` (inside `provider_memberships.permissions`). `can_access_provider_operation` only knows `inventory/bookings/staff/reports` and belongs to another package, so the command checks the membership itself.
- Direct owner writes of the four columns remain possible but bounded and floored (the provider settings screen still saves the deposit that way until it calls the command). Blocking direct writes is a one-line follow-up once that screen is migrated.
- Not changed (other packages own it): `cancel_booking` reads the provider's *current* policy, so a policy change also applies to bookings made earlier under the old terms.
