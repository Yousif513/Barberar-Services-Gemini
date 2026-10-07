# FIX-PROV report (provider portal)

Branch `wp/fixprov`, worktree `primora-wp-fixprov`. Status per defect is updated after every commit group.

| Defect | Status | Commit | Test |
|---|---|---|---|
| R8 invented staff/services | fixed | group 1 | `web_platform/tests/provider-portal-guards.test.mjs` (no demo data, empty state) |
| R50 employee profile fields, portfolio | fixed (URL + client consent; no file uploader, see below) | group 1 | same file, "edits the profile columns" |
| C-D13 pay rules editor | fixed (editor); payroll export pending | group 1 | same file |

## Group 1: team page

* Deleted `demoStaffMembers`, `demoServiceOptions` and `demoProfileFor` (stock photos, invented phone/email, invented
  earnings, rating and booking counts). Earnings and completed bookings come from `employee_earnings_summary`; when that
  query fails the tiles show a dash and the page names the reason. The average-rating tile and per-card rating were removed:
  `reviews` has no per-professional link, so there is no honest number to show.
* Empty roster renders "Add your first professional" with a button.
* Employee form edits `bio_en`, `bio_ar`, `years_of_experience`, `specialties`, `instagram_handle` (validated).
* `employee_portfolios` dialog (`provider/_components/employee-extras.tsx`): https image link plus a mandatory client-consent
  tick (writes `customer_consent_confirmed = true`). A binary uploader needs a Storage bucket and policies that do not exist in the
  repository, so it is not built; the integrator can add a bucket and swap the URL field.
* `employee_commission_rules` editor: base salary, service and product commission, optional Saudi IBAN (`SA` + 22 digits).
  Nothing is pre-filled: rates are business decisions and stay unset until the owner types them. Writes go through the existing
  owner RLS policy (the audit trigger records the change).
* Delete uses the shared confirmation instead of `window.confirm`, and falls back to deactivation only for a foreign-key
  violation (previously any error was reported as "deactivated").
* The four hand-made modal layers use `ProviderDialog` (shared `ModalOverlay`: focus trap, Escape, inert background).

## Group 2: counter booking (database), settings, policy, hours, context, my day

| Defect | Status | Test |
|---|---|---|
| C-D15 database: `create_walk_in_booking` notes and payment method | fixed | `supabase/tests/db/fixprov_walk_in.test.mjs` (10 tests: stored, defaults, method refused, note length, replay conflict, anonymous/customer/other owner refused, staff-only read, no direct writes, audit trigger) |
| R5/R6 follow-up: private columns through commands | fixed in screens | `provider-portal-guards.test.mjs` "reads private columns only through the owner commands" |
| D-27 booking policy card | fixed (UI); command is FIX-DBA's | guard test "saves the booking policy through its command" |
| R16 hours form (overnight shift, per professional) | fixed | guard test "lets the hours form express an overnight shift" |
| R18 `my_provider_context()` + employee screen | fixed (layout + `/provider/my-day`); owner-only screens keep their own owner lookup (see below) | `supabase/tests/db/fixprov_context.test.mjs` (5 tests) |

* `create_walk_in_booking` gained `p_notes`; `p_payment_method` is now validated against `payment_methods` (enabled, offered to customers, not the
  wallet). Method and note are stored in the new staff-only table `walk_in_booking_details` (not on `bookings`, which the phone-linked customer can read).
  The function was patched in place from `pg_get_functiondef`. Adding a parameter changes the signature, so the one regprocedure literal in
  `20261007900300_delegated_access_scope.sql` (which patches this function) was updated to the nine-argument signature. **Integrator: that is a one-line
  edit in another package's migration; if 900300 changed in `claude-code`, re-apply the same one-line signature change.**
* `caller_is_provider_staff(uuid)` is an answer-only wrapper so policies can ask "is the caller staff of this provider" (clients cannot execute `is_provider_staff`).
* Settings: business phone via `get_provider_private_profile`; staff phone and email via `get_provider_staff_contacts` (FIX-DBA). The invented 09:00-22:00 hours
  and the 20% deposit default are gone. The weekly hours are applied through `HoursApplyDialog`: it lists every active professional, leaves those with their own
  schedule unticked, and writes only the ticked ones. A closing time before the opening time is an overnight shift (equal times are refused).
* Booking policy card: four bounded fields, plain-language preview from `policySentences` (the same sentences customers see), "not confirmed yet" banner until
  `policy_confirmed_at` is set by the command.
* Layout: business and role come from `my_provider_context` (`ProviderContextProvider`); an employee gets one navigation entry ("My day") and is redirected to it
  from every management screen. `/provider/my-day`: today's appointments (Riyadh day), check in / complete / no-show (reason dialog) through
  `employee_update_booking_status`, and own earnings from `employee_earnings_summary`.
* Deferred for R18: the other owner screens still resolve the business with `providers.owner_id`. They are owner-only surfaces (the layout keeps employees off them),
  so a delegated manager without an owned business still sees them empty; converting each screen to `useProviderContext` is mechanical and listed under "not done".
* `scripts/ui-schema-baseline.json` lists exactly the four mismatches that exist only because FIX-DBA's functions/column are not in this worktree:
  `set_provider_booking_policy`, `get_provider_private_profile`, `get_provider_staff_contacts`, `providers.policy_confirmed_at`. The integrator removes them on merge.

## Group 3: closures, seasons and leave (R16)

* `/provider/time-off` (reached from Settings, no extra navigation entry): closures (type, branch scope, bilingual reason; a count of existing bookings in the range is shown in a
  confirmation before closing, and nothing is cancelled for the owner), seasonal schedules (overnight and second shift, pause/resume, delete), and team leave (approve or reject
  pending requests, record approved leave). Employees ask for leave from `/provider/my-day` (always sent as `pending`: the column defaults to approved and the existing
  `trg_enforce_leave_approval` trigger refuses self-approval).
* No new migration: the existing tables, policies and trigger already enforce the rules. `supabase/tests/db/fixprov_schedule_exceptions.test.mjs` (14 tests) pins them for every
  role: owner, other provider's owner, employee, colleague, customer, anonymous. Pure checks live in `src/lib/schedule-exceptions.mjs` (`tests/schedule-exceptions.test.mjs`).
* Not done: rejecting leave does not record a reason (the table has no column for it and I did not widen the schema); a closure does not list the affected bookings, only counts them.

## Group 4: calendar (R4, C-D15 screen)

* Drag and drop and a new keyboard control ("Move to another time" in the details dialog, free slots only) both call `reschedule_booking`. Nothing on the calendar changes
  until the command accepts the move; a refusal is shown (in the dialog and as the page error) and the appointment stays where it was.
* Walk-in dialog: the name is always a text input, with an optional selector of people who have booked this business before (it used to list 100 customers of the whole
  platform); phone is normalised (`+9665XXXXXXXX`) and sent so a verified customer is linked; payment method comes from `payment_methods` (no hard-coded cash); notes are sent
  as `p_notes`; the invented "Walk-in Customer", "Styling Service", "Fahad Al-Malki", the initial 150 SAR price and the seeded "Stylist Break & Sanitation" blockout are gone.
  Walk-in details (name, phone, private note, payment method) show in the appointment dialog.
* Cancelling now asks for a reason in `CommandDialog` (it used to cancel on one click with a constant reason). The modals use `ProviderDialog`; double mirroring was replaced by logical utilities.
* Tests: `tests/phone-and-slots.test.mjs` (28), guard tests "calendar (R4, C-D15)".

## Group 5: dashboard honesty and a real QR code (D-28, R27, D-09)

| Defect | Status | Test |
|---|---|---|
| D-09 QR is hand-placed rectangles; print page calls api.qrserver.com and writes the unescaped name | fixed: local SVG from `toqr`, escaped print page | `web_platform/tests/qr.test.mjs` (finder patterns, timing, dark module, a valid BCH format word with both copies equal, escaping), guard test |
| D-28 invented defaults ("Elite Barbershop", "EB", 3 services, 4 staff, policy ticked, fallback slug) | fixed | guard tests + `supabase/tests/db/fixprov_dashboard.test.mjs` |
| R27 walk-ins counted as non-home bookings; unbounded bookings select; hasPolicy true | fixed (`source = 'walk_in'`; one aggregate command; checklist from rows) | `fixprov_dashboard.test.mjs` (7 tests: walk-ins by source, revenue, checklist, occupancy with overnight and second shifts and leave, role refusals, share-kit idempotency and audit) |

* Migration `20261007102000_provider_dashboard_summary.sql`: `get_provider_dashboard_summary(provider)` (owner, administrator or a delegate holding `reports`, wide scope) and
  `record_share_kit_use(provider)` (owner only, first use remembered and audited once, replay answers unchanged). It adds `providers.share_kit_used_at`, and
  `policy_confirmed_at` idempotently (FIX-DBA adds the same column; `ADD COLUMN IF NOT EXISTS`). `share_kit_used_at` is never selected by a client, so FIX-DBA's column-level
  grants need no change.
* Occupancy was "confirmed bookings of all time over active staff x 8". It is now today's booked minutes over today's scheduled minutes in Riyadh time (second shift included,
  an overnight shift counted past midnight, approved leave and closures excluded) and is a dash when nobody is scheduled.
* QR: `toqr` 0.1.1 (MIT) was already in the lockfile through Expo; I added it to `web_platform/package.json` and the matching workspace line of `package-lock.json`
  (`npm install --package-lock-only`, no node_modules change). `src/lib/qr-svg.mjs` draws it as one SVG path with a four-module quiet zone.
* When the figures cannot be read the KPI strip shows dashes and the error banner names the reason (the "Unavailable" demo label is gone). The "0% Commission" badge,
  "0% Commission Guarantee", "15% Saved" and "G43 Verified" labels were removed; the explainer now states what the fee rules do (direct clients are exempt from the marketplace first-visit fee).
* Verification limit: a QR cannot be scanned in the test run, so the tests prove the structure a scanner locks on to (finders, timing, format information). Scan it once in a browser.
