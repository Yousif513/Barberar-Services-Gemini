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
