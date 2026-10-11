# GROUP (G52) Group booking: work package report

Branch `wp/group`. Migrations `20261008500000_group_booking_tables.sql` and `20261008500100_group_booking_commands.sql`
(inside the range 20261008500000..20261008549999). DB tests `supabase/tests/db/group_booking.test.mjs`, web guard tests
`web_platform/tests/group-screens.test.mjs`.

A host books N guests at one provider, at one branch, on one day. Each guest has their own service(s), professional and time and is an
ordinary booking made through the existing booking engine, so availability, holds, rules, payments, notifications, ledger and audit are
unchanged. The bookings are grouped under a group booking with an occasion and notes. Creation is all-or-nothing and replay safe.

## Database

Tables (all RLS, read-only for clients, `grant_data_api_access` plus the administrator audit trigger):

- `provider_group_settings`: provider opt-in. `enabled` defaults to false, `max_group_size` 2..30 is required to enable, optional
  `payment_hold_hours` 1..168. Nothing is enabled and no number is invented.
- `group_bookings`: host, provider, branch, `event_date`, `occasion` (enum `group_occasion`: wedding, family, party, other), `headcount`, `notes`
  (max 1000), `status` (active, cancelled), `payment_due_at`, request fingerprint, idempotency key (unique per host).
- `group_booking_members`: group, `booking_id` (unique), `guest_label` (max 80), `sequence`. A guest is the host's saved client profile or a free-text
  label; no guest contact or personal data is stored.
- View `group_booking_payment_summary` (`security_invoker`): per group member, awaiting, confirmed and cancelled counts, `deposit_due` (sum of
  `deposit_required` of the still-unpaid guest bookings), `total_with_vat`, `effective_status` (a group whose every guest lapsed or was cancelled reads as cancelled).

Commands (SECURITY DEFINER, `search_path = public`, revoked from PUBLIC/anon, granted to `authenticated`):

| Command | Who | What |
| --- | --- | --- |
| `set_provider_group_settings(provider, enabled, max_group_size, payment_hold_hours, reason)` | owner; administrator with a reason; delegate gets "only the owner" | opt-in and limits, audited |
| `list_group_booking_providers()` | signed-in | providers with groups enabled (customers cannot read the settings table) |
| `preview_group_booking(branch, event_date, guests, prayer_window_starts, prayer_window_ends)` | signed-in | writes nothing; places guests in order from `get_branch_available_slots`, honours a preferred time or offers the nearest, never double-books a professional |
| `create_group_booking(branch, event_date, occasion, notes, guests, idempotency_key, prayer windows)` | signed-in (the host) | one transaction; each guest booked as the host through `create_booking` (one service) or `create_multi_service_booking` (several services, the same engine); any failure raises and rolls back every earlier guest and the group; same key + same request returns the same group (`replayed: true`), same key + different request is `23505` |
| `cancel_group_booking(group, reason)` | host; provider owner or delegate with the bookings operation (reason of 3+ characters) | every guest that has not started goes through `cancel_booking`; per-booking outcomes `cancelled`, `already_cancelled`, `not_cancellable`, `failed` |
| `cancel_group_member(booking, reason)` | same | one guest through `cancel_booking`; the group ends when its last guest is cancelled |
| `admin_group_booking_counts()` | administrators | counts only (groups, guests, by occasion, providers enabled); audited |

Guest JSON: `{label?, client_profile_id?, services: [{service_id, variant_id?}], employee_id?, scheduled_at?}`. `scheduled_at` is a preference in the
preview and required to create (the screen sends the reviewed assignment). Every guest must be on the event date by the Riyadh clock.

Read scope (RLS): the host reads own groups and members; the provider's owner and a delegate with the `bookings` permission read their provider's
groups; another customer, another provider, a professional without the permission and the signed-out read nothing (the commands answer "Group booking not found",
never "forbidden"); an administrator reads no rows at all, only the counts function (`can_access_provider_wide` answers true for administrators, so the
provider side is spelled out in `group_booking_provider_access`).

Not redefined: `create_booking`, `cancel_booking`, `reschedule_booking`, `booking_create_internal`, `get_available_slots`, `confirm_booking_payment`
(the test greps the migrations and counts one definition of each). One function is patched in place with the `pg_temp.patch_function` pattern:
`expire_stale_booking_holds` (see payment decision).

## Web

- `/customer/group` (`src/app/customer/group/page.tsx`) with the create flow in its own component `src/components/group-booking-form.tsx`:
  provider (from `list_group_booking_providers`), branch, date, occasion, notes, guest rows (name or saved profile, professional, services filtered by what
  the professional offers, optional preferred time in Riyadh time), "Check availability" (preview), a review table with each guest's professional, time and
  status (available / preferred time taken, nearest suggested / nobody free), the subtotal and the payment rule, then "Confirm and book the group". Any edit
  after the review returns to editing, so a host only confirms a plan they saw. One idempotency key per reviewed plan, so a retry cannot book twice.
  Below it the host's groups (paged, 10 per page): occasion, date, provider, per-guest time/professional/status, the read-only payment summary (deposit still due,
  total with VAT, counts), "Pay deposit" per guest (the existing `payment-checkout` function, per booking), "Cancel this guest" and "Cancel the group"
  through `CommandDialog`.
- `/provider/groups` (`src/app/provider/groups/page.tsx`): enable switch, largest group, optional payment hold hours (owner edits, others read), the paged list of
  groups with every guest, and cancel guest / cancel group with a required reason.
- `src/lib/group-booking.ts`: answer types, all strings in English and Arabic, `describeGroupError` (server reasons translated, including create_booking's own
  reasons when a guest cannot be booked; unknown reasons shown as written), Riyadh helpers.
- Loading, empty, error (with retry) states, server-side paging, SAR and Asia/Riyadh formatters, `dir` and logical (`text-start`, `ps-`, `pe-`) classes,
  labelled controls, named row actions, no native dialogs.

## Decisions

- **Payment hold.** `create_booking` makes each guest booking `pending_payment`, and `expire_stale_booking_holds` releases it after the platform's
  `booking_hold_minutes` (15 by default). Paying N deposits inside that window is the host's problem unless the owner chooses otherwise, so the owner may set
  `payment_hold_hours` (unset by default: the standard hold applies and the preview says so). When set, the group's `payment_due_at` is the earlier of that long after
  booking and one hour before the first unpaid guest, and the sweeper (patched in place, applied once) leaves a group's unpaid bookings alone until then. The
  hold length is a business decision and is left to the owner; nothing is invented. The host is told once, by notification, that each guest needs its own deposit.
- **Payment stays per booking** through the existing flow. A single group checkout is a documented follow-up: it needs a Tap contract that cannot be verified here.
  No payment Edge Function was touched.
- **Several services per guest** use `create_multi_service_booking`, the sibling of `create_booking` over the same `booking_create_internal`; one service uses `create_booking`.
- **Not supported in a group** (each guest is a plain salon booking at the current price): home visits, coupons, loyalty points, gift cards, wallet credit,
  packages, waitlist claims. Prayer windows are accepted by the commands (optional trailing arguments) but the screen does not ask for them.
- **Administrators** count groups and cannot cancel a group through it (they can still cancel any single booking). **Professionals** without the bookings permission
  see their own bookings as before but not the group (the group note may contain personal text).
- **Host profile on the provider screen** reads the host's name through the `profiles` embed; where the provider cannot read the profile it shows "Customer".

## Commands run and results (worktree `primora-wp-group`)

- `node --test supabase/tests/db/group_booking.test.mjs`: 34 tests, 34 pass.
- `node --test "supabase/tests/db/**/*.test.mjs"`: 840 tests, 840 pass (includes `migration_hygiene`, `data_api_grants`, `admin_security_matrix`).
- `node scripts/verify-ui-schema.mjs`: 142 rpc calls, 209 select strings, 0 mismatches, 0 in the baseline.
- `npx tsc --noEmit -p web_platform`: clean.
- `npx eslint` (from `web_platform/`) on every changed file: 0 errors; 1 warning, `react-hooks/set-state-in-effect` at `customer/layout.tsx:204`, which was there before this package (not in a line I touched).
- `npm run test --workspace=web_platform`: 500 tests, 500 pass (13 are `group-screens.test.mjs`).
- `npm run test:security-core` and `npm run test:admin-controls`: pass.
- `npm run build --workspace=web_platform`: could not run here, Turbopack stops on the junctioned `node_modules` ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"). The integrator builds after merging.
- `npm run typecheck:mobile`: not run, no mobile file was touched.

## Tests (database)

Opt-in (off by default, owner / administrator-with-reason only, every other role refused with "not found", number validation, audit, who can read the settings, the
provider list for customers); preview (writes nothing, one professional per guest, never double-booked, preferred time kept or nearest offered, a guest nobody can take is reported,
bad requests, signed-in only); create (ordinary bookings of the host, grouped, deposits and summary, notification, audit; several services; saved profile and somebody else's
profile refused; replay and key reuse; rollback of every guest when guest 2 clashes or guest 3 belongs to another provider, then the same key succeeds once fixed; size limit; provider
not enabled or switched off; validation including the Riyadh midnight boundary; anonymous and service role refused); cancel (group with refund of a paid deposit, one guest then the last,
a served guest left alone, provider owner and delegate with a reason, "not found" for other customer, other owner, stranger, professional, administrator, an ordinary booking is not a member);
payment deadline (standard hold releases, provider hold keeps then releases at the deadline, an ordinary booking is still released, one guest paid at a time); RLS (host, owner, delegate see; other
customer, other owner, stranger, professional, administrator, anonymous do not; administrator counts only and audited; no direct writes by anyone; helpers not callable by clients); core functions have one definition each.
The session runs in UTC.

## What could not be verified

- The screens were not driven in a browser (no dev server could start on the junctioned `node_modules`); they are checked by `tsc`, `eslint`, `verify-ui-schema` (every query and
  argument name against the migrated schema) and the source guard tests.
- Real Tap payment of a guest deposit (the existing `payment-checkout` / webhook flow is reused unchanged and was not exercised here).
- Behaviour on a hosted Postgres 15 (everything ran on PGlite; no PGlite-only syntax is used, dollar quoting only).

## Files touched outside this package's own files

- `web_platform/src/app/customer/layout.tsx`: one navigation entry (`/customer/group`) and its two translations.
- `web_platform/src/app/provider/layout.tsx`: one navigation entry (`/provider/groups`) and its two translations.
- `.admin-console/manifest.json` was not touched.
