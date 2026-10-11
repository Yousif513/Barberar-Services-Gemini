# Work package GCC: G70 multi-country configuration

Branch `wp/gcc`, migrations `20261008900000` .. `20261008900200`. Scope: country, currency, tax and time zone move out of constants into
configuration; Saudi Arabia reproduces today's behaviour exactly. Configuration and tests only: no screen was changed, there is no admin
screen for countries (command and tests only, as briefed).

## What was built

**Tables and columns** (`20261008900000_gcc_country_configuration.sql`)
- `countries(code PK ISO alpha-2, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code, active default false, created_at, updated_at)`.
  RLS on; signed-in users read the open countries, an administrator reads all; **no client write policy** (default deny); anonymous visitors have no privilege.
  Audit trigger attached. Seeded with **Saudi Arabia only** (SA, SAR, 2, Asia/Riyadh, 15, +966, active).
- `branches.country_code` (NOT NULL, default `'SA'`, FK to `countries`) and `branches.timezone` (nullable override). Existing branches are all `SA`.
- Trigger `guard_branch_country`: a provider that inserts a branch gets its provider's country (an explicit value is overwritten) and no zone override; a provider cannot UPDATE a branch's country or time zone (42501); a zone must exist in `pg_timezone_names`.

**Resolvers** (STABLE, SQL, executable by `authenticated` and `service_role`, not by `anon`): `country_vat_rate(country)`, `country_timezone(country)`,
`country_is_active(country)`, `branch_country(branch_id)`, `branch_timezone(branch_id)` (= branch override, else country zone), `provider_country(provider_id)`
(country of the provider's oldest branch; `'SA'` when it has none), `provider_timezone(provider_id)`.
They are SECURITY INVOKER on purpose: `qa_adversarial.test.mjs` forbids SECURITY DEFINER functions that never ask who calls, and that test had to stay unchanged.
A client calling them directly resolves only what it may read (an open country); the SECURITY DEFINER commands that call them run as the owner and resolve every country.

**Commands** (`20261008900100_gcc_country_commands.sql`), both administrator-only, reason of 3+ characters, audited (`country.created`, `country.updated`, `branch.country_changed`):
- `admin_upsert_country(code, name_en, name_ar, currency_code, currency_minor_units, timezone, vat_rate_percent, phone_dial_code, active, reason)`.
  Validates every field, the zone against `pg_timezone_names`, refuses to close the last open country, and **refuses to open a country whose currency is not SAR** (see Decisions).
- `admin_set_branch_country(branch_id, country_code, timezone, reason)`: places a branch in a country, optional zone override (empty clears it); refused while the branch has upcoming pending or confirmed bookings; idempotent (`changed: false`).

**Functions patched in place** (`20261008900200_gcc_country_patches.sql`, `pg_temp.patch_function_all` with an expected occurrence count, so a drifted definition fails the migration instead of silently patching the wrong thing; no old copy of any function was pasted):

| Function | Change |
|---|---|
| `booking_create_internal` | VAT = `country_vat_rate(branch_country(branch))`; the booking's local day (`v_date`) uses the professional's branch zone, else the requested branch, else the provider's country; the per-employee load count uses the employee's branch zone; refuses with 22023 when the branch's country is not active |
| `create_walk_in_booking` | VAT from the branch's country; refuses in an inactive country |
| `generate_zatca_tax_invoice` | refuses (22023) for any branch whose country is not `SA` (literal `'SA'` is deliberate: ZATCA is a Saudi regime); `vat_rate_percent` written from the country's rate instead of `15` |
| `get_available_slots` | day bounds and shift start/end on the branch's zone; returns no slots in an inactive country |
| `reschedule_booking` | the new day is computed on the booking's branch zone |
| `preview_booking_series`, `create_booking_series_from_booking` | series dates on the anchor booking's branch zone |
| `create_group_booking`, `group_booking_check_request`, `join_waitlist` | "today" / event day on the requested branch's zone |
| `waitlist_sweep`, `backfill_waitlist_on_cancellation` | preferred-time match on the branch's zone |
| `get_branch_schedule_with_prayer_pauses` | displayed window and slot times on the branch's zone |
| `booking_message_variables` | message date and time on the branch's zone |
| `claim_message_batch` | quiet hours (22:00-09:00) on the booking's branch zone when the message has a booking |
| `send_membership_expiry_reminders` | expiry date on the provider's zone |
| `get_provider_dashboard_summary`, `get_provider_detailed_analytics`, `get_provider_multi_branch_summary`, `get_provider_chain_operations`, `calculate_staff_payroll`, `booking_channel_counts_internal`, `api_list_bookings` | the provider's days (zone looked up once per query through a sub-select) |

**Web** (`web_platform/src/lib/country.ts`, for NEW code only): `COUNTRY_COLUMNS`, `parseCountries`, `countryByCode`, `countryName`, `formatMoney`, `formatDateTime`, `vatAmount`.
It names no country. `web_platform/tests/country.test.mjs` proves it formats Saudi Arabia exactly like `sar()` and `operationsDate()` in `operations-ui.tsx`. No screen uses it yet.

## Decisions and defaults

1. **Only Saudi Arabia is seeded.** VAT rate, licensing and tax-invoice regime of the other GCC countries are owner and legal decisions. An administrator opens one with `admin_upsert_country` once they are decided.
2. **A country can be PREPARED in any currency but OPENED only in SAR.** Every stored amount (booking totals, ledger, wallet, payouts, `*_sar` columns, Tap charges in `payment-checkout`, `payment-webhook`, `reconcile-psp`, `_shared/refunds.ts`) is SAR. Opening an AED or KWD country would label dirhams as riyals. The check is one `IF` in `admin_upsert_country`; lift it when the money model holds more than one currency. This is the main blocker for real GCC launch, not a detail.
3. A provider with branches in several time zones uses its oldest branch's zone for provider-level reports (a rare mixed case; booking-level functions always use the branch).
4. A booking does not snapshot its VAT rate. `generate_zatca_tax_invoice` writes the country's rate at invoice time next to the booking's stored `tax_amount`. If a country's rate is ever changed, invoices of older bookings would show the new rate. Adding `bookings.vat_rate_percent` is a core-table change, so it is left for the integrator. Saudi Arabia is unaffected (15 % unchanged).
5. Deactivating a country does not touch existing bookings; it only stops new slots and new bookings. Moving a branch to another country is blocked while it has upcoming bookings.

## Constants NOT converted, and why

Database (`Asia/Riyadh` kept as the platform's home clock where no branch is in scope):
- Platform-level reports and jobs: `admin_booking_directory`, `admin_dashboard_overview`, `admin_get_event_counts`, `run_daily_psp_reconciliation`, `submit_data_request` (platform operator's day, not a branch's).
- Billing: `issue_monthly_fee_invoices`, `generate_provider_monthly_fee_invoice` (the platform bills in its own month, and its **0.15 VAT on the platform fee is a tax-law question about the platform's own entity, not about the branch**; left for the owner and legal).
- `enqueue_gift_card_received` (a gift card belongs to no branch) and the `COALESCE(..., 'Asia/Riyadh')` fallback in `claim_message_batch` for a queued message that belongs to no booking.
- `calculate_booking_platform_commission` fallback `0.15` and `approve_provider_application` default commission `15.00`: platform commission, not tax; an owner decision (README: business numbers default to unset until the owner sets them).
- `api_booking_json`, `api_list_services`, `calculate_staff_payroll` label amounts `'SAR'`: the money is SAR (decision 2).
- `provider_country()` falls back to `'SA'` for a provider with no branch (the platform's home market, equal to the column default).
- `generate_zatca_tax_invoice` keeps the literal `'SA'` by design.

Outside the database:
- Edge Functions: `currency: "SAR"` in `payment-checkout`, `payment-webhook` (rejects any other currency), `reconcile-psp`, `_shared/refunds.ts`; Tap is SAR only today.
- 50 web files format SAR and 22 name `Asia/Riyadh` (screens, `operations-ui.tsx`); 6 mobile files. Per the brief, no screen was edited; new code uses `lib/country.ts`.
- Saudi phone rules (`lib/phone.mjs` turns `05...` into `+9665XXXXXXXX`; the database and the WhatsApp consent flow match on it). Other GCC numbers need their own national rules.
- Prayer-time logic (`use-prayer-times`, `prayer-windows.mjs`, `assert_prayer_windows`): windows are computed on the client and passed in as timestamps; the database only compares instants, so it is zone-neutral. Which prayer calculation method a country uses is a product decision.
- ZATCA/Fatoora, Wathq CR check, Saudi VAT number format: Saudi regimes by definition.

## Verification (all run in `primora-wp-gcc`)

| Command | Result |
|---|---|
| `node --test supabase/tests/db/countries.test.mjs` | 24 pass, 0 fail |
| `node --test "supabase/tests/db/**/*.test.mjs"` (every existing test unchanged, plus the new file) | 974 pass, 0 fail |
| `node --test supabase/tests/inventory.test.mjs` | 10 pass |
| `node scripts/verify-ui-schema.mjs` | 177 rpc calls, 222 selects, 0 mismatches |
| `node --test "tests/**/*.test.mjs"` in `web_platform` (includes `country.test.mjs`, 4 tests) | 555 pass, 0 fail |
| `npx tsc --noEmit -p web_platform` | no errors |
| `npx eslint src/lib/country.ts tests/country.test.mjs` (in `web_platform`) | 0 problems |

`countries.test.mjs` covers: the seed (SA only); the resolvers; golden Saudi slot list (06:00-14:00 UTC); Saudi booking and counter-booking VAT equal to `round(x * 0.15, 2)` for awkward amounts (0.05, 33.33, 99.99, 1234.57); the Saudi ZATCA invoice (rate 15); then with a test-only country `ZZ` (Asia/Dubai, VAT 5) opened by the test through the command: VAT 5 %, slots at 05:00 UTC for 09:00, a 00:30 next-day slot that is still "today" in Riyadh being bookable on the Dubai branch, message date/time on the branch's clock, a per-branch zone override that leaves tax alone, ZATCA refusal for the non-SA branch (and no invoice row), nothing bookable (slots, `create_booking`, `create_walk_in_booking`) once the country is closed; command tests for anonymous, customer, provider owner, other owner, employee and service role plus input validation, audit rows, the SAR-only opening rule and the last-open-country rule; RLS (closed countries invisible to customers, no direct write for customer, owner or administrator, anonymous refused).

Not verified: a hosted Supabase (unreachable by design); `npm run build --workspace=web_platform` was not run (no web route was touched, only a new library file that `tsc` accepts); real Postgres 15 (the suite runs on PGlite; the migrations use only dollar quoting and plain SQL, `pg_timezone_names` is a standard catalog view).

## Files touched

New only: `supabase/migrations/20261008900000_gcc_country_configuration.sql`, `20261008900100_gcc_country_commands.sql`, `20261008900200_gcc_country_patches.sql`,
`supabase/tests/db/countries.test.mjs`, `web_platform/src/lib/country.ts`, `web_platform/tests/country.test.mjs`, `docs/work-packages/gcc-report.md`.
No existing file was edited. Merge notes: the patches migration edits the latest definition of 23 core functions in place. A later migration that pastes a full old copy of one of them would silently
revert the patch (`countries.test.mjs`, "no longer carries the fixed VAT or time zone", would then fail). If another package changes one of them **before** this range and alters the exact text patched (for example the `v_tax := ROUND(v_taxable * 0.15, 2);` line or the `Asia/Riyadh` occurrence counts), the migration fails loudly with "expected N occurrence(s)"; adjust the pattern then. The integrator should add `countries`, `admin_upsert_country` and `admin_set_branch_country` to `.admin-console/manifest.json`.
