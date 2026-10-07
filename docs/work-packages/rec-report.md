# REC (G71) Recurring appointments: work package report

Branch `wp/rec`. Migration `20261008010000_recurring_appointments.sql`, tests `supabase/tests/db/recurring.test.mjs`.

## Stage 1: database (done)

Tables: `provider_recurring_settings` (provider opt-in, off by default), `booking_series`, `booking_series_occurrences`. All have RLS (read only,
no direct writes), `grant_data_api_access` and the admin audit trigger.

Commands (all SECURITY DEFINER, revoked from PUBLIC/anon, granted to `authenticated`):

- `set_provider_recurring_settings(provider, enabled, max_occurrences, payment_hold_hours, reason)`: owner, or an administrator with a reason.
- `preview_booking_series(booking, interval_weeks, occurrences)`: writes nothing, returns each date's availability and the payment picture.
- `create_booking_series_from_booking(booking, interval_weeks, occurrences, skip_unavailable, idempotency_key)`: `occurrences` counts the anchor, so 6
  means the anchor plus 5 more. Each following date is booked by calling `create_booking` as the customer (inside the definer function `auth.uid()` still
  reads the caller's JWT claims, so `create_booking` sees the customer and applies every rule). All-or-nothing by default (a failed date aborts the whole
  command and the subtransactions roll back every booking made so far); with `skip_unavailable` a date that fails with SQLSTATE 23P01 is recorded as
  `skipped` with reason `slot_unavailable`, any other error still aborts.
- `cancel_booking_series(series, reason, from)`: cancels this and every later not-started occurrence through `cancel_booking` (policy and refunds apply)
  and returns per-occurrence outcomes (`cancelled`, `already_cancelled`, `not_cancellable`, `failed`). Customer, or an administrator with a reason.
- `enqueue_series_payment_reminders(within_hours)`: scheduler/administrator; one reminder per held occurrence before it lapses (pg_cron job every 30 minutes when pg_cron exists).

None of `create_booking`, `cancel_booking`, `reschedule_booking`, `booking_create_internal`, `get_available_slots` is redefined.

### Payment deadline decision

`create_booking` makes a booking `pending_payment` whenever a deposit is due (providers cannot ask for a 0% deposit any more), and
`expire_stale_booking_holds` cancels it after `booking_hold_minutes` (15 by default). Occurrences created weeks ahead would therefore vanish minutes
after the customer was told they were booked. Rule implemented:

- the provider chooses `payment_hold_hours` (1..168, unset by default). An unpaid occurrence is held until `payment_due_at` = the earlier of that many
  hours after booking and one hour before the visit; `expire_stale_booking_holds` was patched in place (not replaced) to skip an occurrence until its own
  `payment_due_at` has passed, then the normal sweep releases it;
- with no hold chosen, the command refuses with a clear reason and creates nothing, rather than promising slots the system will release;
- the customer gets a notification with the deadline when the series is made and one reminder before it lapses; payment uses the existing Tap flow for each booking.
- Recorded as an assumption for the owner: the hold length is a business decision and is not defaulted.

### Not supported in this version (refused with a clear reason)

Home visits, multi-service bookings, bookings that are not yet paid/confirmed, and carrying over coupons, loyalty points, gift cards, wallet credit or
package sessions (each occurrence is booked at the price current on its date).

## Environment note

The worktree had CRLF line endings on 61 old migrations (the index stores them as LF), which makes later `evolve_function` migrations fail in the harness.
I converted the working copies to LF locally to run the tests; those changes are not committed.
