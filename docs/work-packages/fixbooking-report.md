# FIX-BOOKING report

Package owner of: `booking_create_internal`, `create_booking`, `create_multi_service_booking`, `get_available_slots`, `get_branch_available_slots`,
`reschedule_booking` (plus the `set_booking_window` trigger function where a fix needs it). Branch `wp/fixbooking`, migrations `20261007050000` ..
`20261007099999`. No web page, mobile screen, Edge Function or other package's function was touched.

Method for every item: reproduce on the base commit with a failing DB test (harness runs in UTC with no default table privileges), patch the LATEST
function definition in place (`pg_get_functiondef` + exact-substring replace, with a hard failure when a pattern is not found), prove with the same test,
run the whole DB suite.

| Defect | Status | Migration | Test |
|---|---|---|---|
| D-21 / R3 | fixed | `20261007050000_booking_prayer_windows_riyadh_time.sql` | `booking_engine_prayer_windows.test.mjs` |

## 1. D-21 / R3 prayer windows and the Riyadh clock (fixed)

Reproduced on the base commit under the UTC harness: with a 06:00-23:30 shift `get_available_slots` listed no 06:30, 15:00, 18:30 or 21:30 (the
fixed 03:45-04:05 / 12:00-12:20 / 15:30-15:50 / 18:45-19:05 / 20:15-20:35 windows read as UTC clock time), and `booking_create_internal`
never received the windows the shop page showed the customer.

One rule now:
- `create_booking`, `create_multi_service_booking` and `reschedule_booking` take two optional trailing arguments `prayer_window_starts timestamptz[]`,
  `prayer_window_ends timestamptz[]` (same names as the `get_available_slots` RPC). They are validated by the new internal `assert_prayer_windows`
  (matching lists, at most 12, each start before its end; `22023` otherwise) and passed on to `get_available_slots` for the
  any-professional resolution, the final availability check and the reschedule check.
- When none are passed there is NO prayer exclusion: the hard-coded fallback is deleted from the three loops of `get_available_slots`
  (a `v_slot_time::time` comparison no longer exists anywhere in the booking functions; a regression test reads the function source).
- A window can only remove slots, never add them, so a client passing fewer windows cannot book anything the schedule does not offer.
- The old overloads are dropped (the argument list grew), the new functions receive exactly the privileges the old ones had
  (`authenticated` for the three public commands, `service_role` only for `booking_create_internal`).

Callers (for the screen packages):
- `web_platform/src/app/shop/[id]/page.tsx` (~849-927 computes the windows; the booking submit near `create_booking`/`create_multi_service_booking`) and
  `web_platform/src/app/customer/bookings/page.tsx` (reschedule) and `mobile_app/src/lib/marketplace.ts`, `mobile_app/src/components/shop-details-modal.tsx`:
  pass the SAME arrays they pass to `get_available_slots` as `prayer_window_starts` and `prayer_window_ends` (ISO timestamps) on
  `create_booking`, `create_multi_service_booking` and `reschedule_booking`. Omitting them is valid and means "no prayer pause".
- Slot display: format with `ar-SA`/`en` and `timeZone: 'Asia/Riyadh'` (R24, screen part).
