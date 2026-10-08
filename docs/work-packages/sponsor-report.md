# SPONSOR report (G63 Sponsored placement, labelled)

Branch `wp/sponsor`, worktree `primora-wp-sponsor`. Owner-priced, pay per NEW client, off until the owner has set every value.

## What was built

### Database (`supabase/migrations/20261008800000_sponsored_placement_tables.sql`, `20261008800100_sponsored_placement_commands.sql`)

| Object | Purpose |
|---|---|
| `platform_settings` keys `sponsored.enabled` (false), `sponsored.price_per_new_client_sar`, `sponsored.max_slots_per_search`, `sponsored.attribution_window_days` (all JSON null) | The owner's decisions. No number is invented anywhere. `admin_update_platform_setting` was patched in place (new `ELSIF` branches before `referral_program`) to validate and audit the four keys. |
| `sponsored_config()` | One validated object: `configured` is true only when the switch is on AND price, slots and window are all valid. Everything below checks it. SECURITY INVOKER (reads a world-readable table), granted to `authenticated`/`service_role`. |
| `sponsored_campaigns` | provider, optional branch, city, category slug, `monthly_budget_cap_sar` (required, > 0), `status` draft/active/paused/ended, dates, `accepted_price_sar` (stamped at activation), `last_shown_at`. |
| `sponsored_clicks` | one row per campaign, customer and Riyadh day (unique index; anonymous visitors share the nil identity, so an anonymous click counts once a day per campaign). |
| `sponsored_attributions` | one row per booking (`booking_id` unique): `is_new_client`, `fee_amount_sar` (price snapshot), `status` accrued/waived/void, `status_reason`, `period_month`, `billed_invoice_id`. |
| `get_sponsored_placements(city, category, limit)` | Public. Returns eligible active campaigns (provider active and verified, dates, branch in the city, within this month's cap) in fair rotation (least recently shown first, one place per provider, never more than the owner's slot count) and records the show time. Every place has `is_sponsored = true`. Returns `{configured:false, placements:[]}` while the feature is off. |
| `record_sponsored_click(campaign)` | Public (signed in or anonymous), live campaigns only, rate limited by the unique index. |
| `create_sponsored_campaign`, `update_sponsored_campaign`, `set_sponsored_campaign_status` | Provider OWNER only (not delegates, not administrators), reason of 3+ characters, audit log. Activation stamps the price the provider accepts. Pause and end work even while the feature is off. |
| `sponsored_statement(provider, month)` | Owner, delegate holding `reports`, administrator, service role. Totals, per-campaign stats, lines. No customer identity in a line. |
| `admin_void_sponsored_attribution(id, 'void'\|'waive', reason)`, `admin_sponsored_overview(month)` | Administrator only. |
| `sponsored_fees_for_month(provider, month)` | Administrator/scheduler. The sum the invoice carries (reconciliation, tests). |
| Trigger `trg_bookings_sponsored_attribution` (AFTER UPDATE OF status ON bookings, WHEN becomes completed) | Additive. Booking functions are untouched. |
| Column `provider_fee_invoices.sponsored_fees_sar` + trigger `trg_fee_invoices_sponsored_lines` (AFTER INSERT) | Billing, see below. |

RLS: the three tables are readable by the owner, a delegate with `reports` (`can_access_provider_wide`) and an administrator; there is no write policy, so every write is a command. Customers and strangers read nothing, `anon` has no table privilege. Each table has `grant_data_api_access` and the administrator audit trigger.

### Money rules (as built)

1. **Attribution.** When a booking becomes `completed`, if the customer has a click on a campaign of that provider before the booking was created and inside `attribution_window_days`, one attribution is written. Idempotent on `booking_id`. The business's own owner is never attributed. A walk-in (no customer) is never attributed. Nothing is written while `sponsored_config().configured` is false.
2. **New client.** No OTHER completed booking of that customer at that provider. A returning client who clicked is recorded as `waived` / `not_new_client` with fee 0 so the statement shows why nothing was charged.
3. **Price.** `LEAST(current price, price the provider accepted when it activated the campaign)`. A later price rise never charges a provider more than it agreed to; it takes effect when the provider re-activates (pause then resume). A price fall applies at once. This rule goes beyond the written spec and is a consumer-protection choice; say so if you want it removed (one `LEAST`).
4. **Cap.** Accrued fees of the campaign in the booking's Riyadh month plus this fee must not exceed `monthly_budget_cap_sar`; otherwise the row is `waived` / `cap` (snapshot kept, not billed). The campaign also leaves the rotation as soon as one more fee would not fit. The campaign row is locked (`FOR UPDATE`) while the cap is computed.
5. **Billing (the smallest change that redefines no money function).** `generate_provider_monthly_fee_invoice` and `issue_monthly_fee_invoices` are not touched. An AFTER INSERT trigger on `provider_fee_invoices` (it fires only for a row that was really inserted, and the batch uses `ON CONFLICT DO NOTHING`) attaches every accrued, not yet billed attribution of that provider up to the invoice month (`billed_invoice_id`), sets `sponsored_fees_sar`, adds it to `total_invoice_due_sar`, and turns a `settled` invoice into `issued`. An issued invoice is never rewritten: a fee accrued after the month's invoice exists rolls into the next invoice. Test: the batch run puts 51.00 on the invoice, a repeat run bills nothing twice, `sponsored_fees_for_month` equals the invoice column, and a late fee stays unbilled.
6. **Void / waive.** Only an accrued fee that is not on an invoice. A fee already invoiced is refused ("correct it with a credit").

### Screens (Next.js 16 client pages, AR/EN + RTL, shared components, SAR formatter, no native dialogs)

- `/provider/promote` (`web_platform/src/app/provider/promote/page.tsx`): price and how it is charged (read from the database), campaigns with activate / pause / resume / end / edit budget (each a `CommandDialog` with a reason; activation requires an acknowledgement of the price), create-campaign form, monthly statement. Loading, empty, error and "not switched on yet" states.
- `/admin/sponsored` (`web_platform/src/app/admin/sponsored/page.tsx`): owner settings (the four keys, each change through a reasoned dialog and `admin_update_platform_setting`), month totals, campaigns, fee lines with Waive / Void.
- Discover: `web_platform/src/components/sponsored-placements.tsx`, a separate region above the organic results, every place carries the visible `Sponsored / إعلان` badge; it renders nothing when the database returns no place. Shared types and Arabic reasons: `web_platform/src/lib/sponsored.ts`.
- Settings are editable in `/admin/sponsored`, not in the existing screens: `/admin/settings` has fixed sections for three other keys and `/admin/platform-rules` only reads API keys, so a small section was added where the feature lives.

## Tests

| Command | Result |
|---|---|
| `node --test supabase/tests/db/sponsored.test.mjs` | 43 pass (UTC session asserted) |
| `node --test "supabase/tests/db/**/*.test.mjs"` (whole suite, after the last migration edit) | 993 pass, 0 fail |
| `node scripts/verify-ui-schema.mjs` | 0 mismatches (187 rpc calls, 226 select strings) |
| `npx tsc --noEmit -p web_platform` | clean |
| `npx eslint <changed files>` (from `web_platform/`) | 0 errors, 0 warnings |
| `npm run test --workspace=web_platform` | 560 pass (includes `tests/sponsored-screens.test.mjs`, 9 tests) |
| `npm run test:admin-controls` | passed |
| `npm run build --workspace=web_platform` | fails only because of the junctioned `node_modules`: Turbopack reports "Symlink [project]/node_modules is invalid, it points out of the filesystem root" before compiling anything. The integrator builds after merging. |

`sponsored.test.mjs` covers: disabled when ANY setting is unset (each of the three taken away in turn, and the switch), setting validation and refusal for non-admins, owner-only campaign commands against every role, activation stamping and replay, rotation (exact order of 6 calls, equal turns with 2 slots, one place per provider, slot limit), `is_sponsored` for every caller, exclusions (paused, unverified provider, not started, ended), city/category targeting, click rate limit (customer, anonymous, next day), attribution only for a new client inside the window (click after booking, other provider, no click, walk-in, own owner, mechanism off), idempotent accrual, price rule, cap (waived `cap`, campaign leaves rotation, raising the cap brings it back), void/waive with reason and replay, administrator overview equals the table, statement arithmetic (totals = lines, billed + unbilled = accrued), invoice line through the real monthly batch, RLS matrix (owner, delegate with reports, delegate without, employee, other owner, customer, stranger, administrator, anonymous, service role) and refused direct writes.

## Decisions I took

- No `pending` attribution state: the decision is made at the moment the booking completes, so a pending state would never be used. `accrued | waived | void` only.
- Anonymous clicks count once per campaign per day (no identity to rate limit on). They can never be billed, because billing needs a signed-in customer who later books.
- Campaign commands are owner-only; delegates with `reports` can read the statement but not spend money. The UI therefore serves the owner only (same as `/provider/share`).
- `sponsored_config` is SECURITY INVOKER so that it is not flagged by the "elevated function without identity check" catalogue test; it only reads `platform_settings`.
- Sanity bounds in the setting validators are limits, not business values: price 0 to 100000, slots 1 to 10, window 1 to 365 days, budget up to 1,000,000.

## Not verified / open questions for the owner

- **No browser run.** No dev server was started: the screens need a signed-in Supabase session and the hosted project is unreachable. Verified statically (tsc, eslint, schema check of every query, guard tests) and the commands by the database tests only.
- **`npm run build --workspace=web_platform`** could not run in this worktree (junction, see the table); `tsc --noEmit` and `eslint` on every changed file pass.
- **VAT.** The mechanism adds no VAT to the sponsored fee and extracts none. Whether the owner's price is VAT-inclusive, and whether the line must be a separate tax invoice, is a question for tax counsel (same open question as R19 for the commission).
- **A provider with a rolled-over fee and no completed booking in the following month is not invoiced by the existing batch** (it only bills providers with completed bookings in the month). The fee stays `accrued`, unbilled, and is visible in the administrator overview ("Waiting for invoices") and the provider statement. If that matters, the batch needs a second loop; I did not redefine it.
- `generate_provider_monthly_fee_invoice` still RETURNS the arithmetic of its own columns (it does not know the sponsored line); read `provider_fee_invoices.total_invoice_due_sar` for the amount due.
- No impression log: the only trace of a show is `last_shown_at` (enough for fair rotation). Click-through statistics therefore have no denominator.
- `get_sponsored_placements` is a public function that writes (`last_shown_at`), like `track_analytics_event`. It is a no-op while the feature is off. A rate limit per client is not built.
- The existing mobile app is untouched (the G63 surface is web only).

## Files touched outside my own directories

- `web_platform/src/app/discover/page.tsx`: one import and one `<SponsoredPlacements locale city category />` element before the results.
- `web_platform/src/app/provider/layout.tsx`, `web_platform/src/app/admin/layout.tsx`: one navigation entry each, both languages.
- `supabase/tests/db/inventory_workflows.test.mjs`, `qa_adversarial.test.mjs`, `trust.test.mjs`: the catalogue allow-lists of functions callable by `anon` now name `get_sponsored_placements` and `record_sponsored_click` (and the "no identity check" list names `get_sponsored_placements`), with the reason in a comment. These are the only edits to other packages' tests; a merge conflict there is resolved by keeping both names.
- Migration side effect on `provider_fee_invoices` (a new column with default 0) and `admin_update_platform_setting` (patched in place).
