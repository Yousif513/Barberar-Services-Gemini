# GROUP (G52) Group booking: work package report

Branch `wp/group`. Migrations `20261008500000_group_booking_tables.sql` and `20261008500100_group_booking_commands.sql`.

## Stage 1: database (migrations written, smoke-tested; tests follow)

Tables (all RLS, read-only for clients, `grant_data_api_access` + admin audit trigger):
- `provider_group_settings` (provider opt-in: `enabled` default false, `max_group_size` 2..30 required when enabled, optional `payment_hold_hours` 1..168).
- `group_bookings` (host, provider, branch, event_date, occasion enum `group_occasion` wedding|family|party|other, headcount, notes, status, `payment_due_at`, idempotency key + request fingerprint).
- `group_booking_members` (group, `booking_id` unique, `guest_label`, `sequence`). Guests are the host's saved client profiles or a free-text label; no guest contact or personal data.
- View `group_booking_payment_summary` (`security_invoker`): per group member/confirmed/awaiting/cancelled counts, `deposit_due`, `total_with_vat`, `effective_status`. Read-only.

Commands (SECURITY DEFINER, revoked from PUBLIC/anon, granted to `authenticated`):
- `set_provider_group_settings(provider, enabled, max_group_size, payment_hold_hours, reason)`: owner, or an administrator with a reason.
- `list_group_booking_providers()`: providers with groups enabled (a customer cannot read the settings table).
- `preview_group_booking(branch, event_date, guests, prayer_window_starts, prayer_window_ends)`: writes nothing; places guests in order from `get_branch_available_slots`, never double-booking a professional.
- `create_group_booking(branch, event_date, occasion, notes, guests, idempotency_key, prayer windows)`: one transaction; every guest is booked as the host through `create_booking` (one service) or `create_multi_service_booking` (several services, the same engine behind `create_booking`); any failure raises and rolls back everything; replay with the same key returns the same group.
- `cancel_group_booking(group, reason)` and `cancel_group_member(booking, reason)`: every guest goes through `cancel_booking`; per-booking outcomes (`cancelled`, `already_cancelled`, `not_cancellable`, `failed`).
- `admin_group_booking_counts()`: administrators count groups; they never read rows.

None of `create_booking`, `cancel_booking`, `reschedule_booking`, `booking_create_internal`, `get_available_slots`, `confirm_booking_payment` is redefined. `expire_stale_booking_holds` was patched in place (see decisions).

## Decisions

- Guest JSON: `{label?, client_profile_id?, services:[{service_id, variant_id?}], employee_id?, scheduled_at?}`. `scheduled_at` is optional in the preview (preference) and required to create.
- Payment hold: unset by default, so the platform's standard hold (platform setting `booking_hold_minutes`, 15 by default) applies to each guest booking. The owner may set `payment_hold_hours`; then `payment_due_at` is the earlier of that long after booking and one hour before the first unpaid guest and the hold sweeper leaves the group's unpaid bookings alone until then. Business value left to the owner; nothing invented.
- Not supported in a group (each guest is a plain salon booking at the current price): home visits, coupons, loyalty points, gift cards, wallet credit, packages, waitlist claims.
- A single group checkout is a documented follow-up: it needs a Tap contract that cannot be verified here.
