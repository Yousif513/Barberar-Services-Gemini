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

## Stage 2: web (done)

- `web_platform/src/components/make-regular.tsx`: the "Make this a regular" button and dialog (own file). Shown only for a confirmed, upcoming, single-service,
  non-home booking. It previews on open and whenever the interval (1 to 8 weeks) or the total (2 to 26, counting the booking itself) changes, lists each date as
  available or not, explains the deposit rule, offers "skip unavailable dates", then books through one command. The idempotency key lives in the dialog and is renewed
  only when the request changes, so a retry cannot book twice.
- `web_platform/src/app/customer/series/page.tsx`: the customer's series with per-occurrence status, payment deadline, "Pay deposit" (existing `payment-checkout`
  function), "Cancel this and the rest" and "Cancel all upcoming" through `CommandDialog`; server-side paging (10 per page), loading, empty and error states.
- `web_platform/src/app/provider/recurring/page.tsx`: enable switch, maximum appointments, payment-hold hours (owner only; others see them read-only) and the paged list of
  series with every occurrence and its status, which is how providers see which bookings belong to a series.
- `web_platform/src/lib/recurring.ts`: answer types, all strings in English and Arabic, and `describeRecurringError` (server reasons translated, unknown reasons shown as written).
- One navigation entry in each of `customer/layout.tsx` ("My Regulars" / مواعيدي المنتظمة) and `provider/layout.tsx` ("Regular Appointments" / المواعيد المنتظمة); one import and one
  button each in `customer/bookings/page.tsx` and `customer/bookings/[id]/confirmation/page.tsx`.
- `web_platform/tests/recurring-screens.test.mjs`: every static reason the migration raises has an Arabic form, the screens call only existing commands with their declared arguments, shared dialogs only,
  paging and states present, one button/import per entry screen, EN/AR copy keys identical.

## Commands run and results (worktree `primora-wp-rec`)

- `node --test supabase/tests/db/recurring.test.mjs`: 24 tests, 24 pass.
- `node --test "supabase/tests/db/**/*.test.mjs"`: 547 tests, 547 pass (the first run caught that `preview_booking_series` had no identity check of its own; fixed).
- `node scripts/verify-ui-schema.mjs`: 105 rpc calls, 194 select strings, 0 mismatches, 0 in the baseline.
- `npx tsc --noEmit -p web_platform`: clean. `npx eslint` on every changed web file: 0 errors, 0 warnings in the new files.
- `npm run test --workspace=web_platform`: 330 tests, 330 pass. `npm run test:security-core`, `npm run test:admin-controls`, `npm run typecheck:mobile`: pass.
- `npm run build --workspace=web_platform`: could not run here, Turbopack stops on the junctioned `node_modules` ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"). The integrator builds after merging.

## Tests (database)

Happy path (dates, Riyadh clock time, ownership, service lines, audit, notification, UTC session); replay and key reuse; bad input; unpaid, past, foreign and role negatives
(anonymous, other customer, owner, other owner, employee, delegate, administrator, service role); gap handling (preview, all-or-nothing rollback, skip mode, all skipped);
payment deadline (held occurrence survives the sweep until its deadline, then is released; an ordinary unpaid booking is still released; paying a held occurrence; reminders once, scheduler/admin only;
deposit rounding to zero confirms at once); cancellation (this and following through `cancel_booking` with refund of a paid deposit, replay, series ends, per-role "not found", administrator needs a reason);
RLS (visibility for customer, owner, delegate, professional, administrator; strangers and anonymous see nothing; no direct writes); core functions still have one definition each.

## What could not be verified

- The Next.js production build (see above) and the screens in a browser: no running Supabase or dev server was used; the queries were checked statically against the migrated schema and the commands by the database tests.
- pg_cron scheduling of `primora-series-payment-reminders` (pg_cron does not exist in the test database; the migration schedules it only when the extension is present, as earlier migrations do). Until it is scheduled, reminders are sent by calling `enqueue_series_payment_reminders` as the scheduler.
- Real Tap payment of a held occurrence: the test confirms the payment through `confirm_booking_payment` (the webhook's function); the checkout call itself is the existing `payment-checkout` function.

## Decisions and assumptions for the owner

- `occurrences` counts the anchor booking (a series of 6 is the booking plus 5 more).
- Payment hold length is not defaulted: a provider with a deposit must choose 1 to 168 hours before customers can book a series (documented above). If the owner prefers a platform-wide value, it belongs in `platform_settings`.
- Disabling the setting stops new series; existing series continue and can be cancelled.
- Cancelling the rest is available to the customer (and an administrator with a reason); providers cancel individual bookings through the normal booking commands.
- Not carried over to later occurrences: coupons, loyalty points, gift cards, wallet credit, package sessions, home visits, multi-service bookings.
- The weekly step is computed in Asia/Riyadh clock time (no daylight saving there), so the time of day is preserved.

## Files touched outside this package's own files

`web_platform/src/app/customer/layout.tsx` and `web_platform/src/app/provider/layout.tsx` (one navigation entry plus its two labels each),
`web_platform/src/app/customer/bookings/page.tsx` and `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx` (one import and one button each).
`expire_stale_booking_holds` is patched in place inside the migration (one extra NOT EXISTS condition), not replaced. `.admin-console/manifest.json` untouched.
