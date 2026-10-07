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
