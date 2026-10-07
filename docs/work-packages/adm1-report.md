# ADM1 report: finishing the administrator console

Branch `wp/adm1`. Migration range `20261008100000` to `20261008149999`. Newest item last.

## Item 1: CR check before approving an application (FIX-DBB R32) - done

- `20261008100000_adm1_application_cr_view.sql`: `admin_provider_applications_view` gains `cr_verification_status` and `cr_check_data` (appended columns, still `security_invoker`).
- `admin/providers/provider-management.tsx`: an application that states a CR number shows its check state (confirmed / manually reviewed / name differs / not active / not checked), the registered name Wathq returned, and, while it is not cleared, "Check with Wathq" and "Manual review" buttons (the manual review calls `admin_confirm_application_cr` with the required notes). The approval dialog shows the state and warns that the database will refuse approval; the database's refusal text is shown in the dialog with the typed reason kept. Provider detail also labels `name_mismatch`.
- `supabase/functions/wathq-verify/index.ts`: accepts `applicationId` (calls `record_wathq_application_check`) or `providerId` (calls `record_wathq_cr_verification`), always passes the registered name as `crName`, and returns the database's status (`verified` / `name_mismatch` / `rejected`). Deno code could not be run here.
- Tests: `supabase/tests/db/adm1_application_cr_view.test.mjs`, `web_platform/tests/adm1-admin-wiring.test.mjs`.

## Item 2: send-push claims batches - done

- `supabase/functions/send-push/index.ts` now calls `claim_push_batch(p_limit)` and sends only the tokens and texts that come back (title and body carry Arabic and English because users have no language preference), then reports each queue entry with `complete_push_delivery` (invalid tokens: Expo `DeviceNotRegistered`). The caller check (`Bearer <service role key>`) and the shared CORS are unchanged. Not run (no Deno).

## Item 3: failed financial lists (R31) - done

- `admin/ledger/page.tsx`: payout requests, reconciliation runs and provider fee invoices each keep their own error string (`requestsError`, `reconError`, `feeInvoicesError`), set from the failed query and cleared on the next try; the table shows the reason (`role="alert"`, both languages) with a Retry button that re-runs that query. The old `console.warn` plus empty list is gone. Zero rows still shows the honest empty row.
- `admin/notifications/page.tsx`: the message-log query and the two queue-count queries now read their `error`; a failure shows the reason and a Retry button instead of an empty log with zero counts.
- Test: `web_platform/tests/adm1-admin-wiring.test.mjs` (source wiring guard). Not exercised in a browser here.

## Item 4: promotional codes (C-D26) - done

- `20261008100100_adm1_admin_promo_code_commands.sql`: `admin_save_promo_code(...)` (create or full replace; reason of 3+ characters, code 4 to 20 characters, percentage 1 to 100, flat up to 10000 SAR, redemption limit 1 to 1000000, per-customer limit 1 to 1000 or unlimited, minimum order 0 to 100000, cap up to 10000, ends after starts; a code that customers already used keeps its name; the limit cannot go below the redemptions used; a provider-owned code keeps its funding; duplicate name answers 23505) and `admin_set_promo_code_active(id, active, reason)` (idempotent). Both audited with the reason. The admin insert/update policies and the INSERT/UPDATE/DELETE privileges on `promotional_codes` are gone, so no client writes the table; the provider commands are SECURITY DEFINER and are unaffected.
- `admin/coupons/page.tsx`: save goes through the command in a dialog (labelled fields, the reason, inline refusal text, everything typed is kept); on/off and deactivate use `CommandDialog` with a required reason; per-customer limit, first-booking-only, and validity dates (Riyadh days) are exposed and shown in the table. A failed load shows the reason with a Retry. The "Saved by customers" card was an estimate that ignored percentage codes (flat value times count); it now shows the number of switched-off codes.
- Decision for the owner: funding source "provider" on a platform-wide code (no provider) remains selectable as before; what that means for checkout is the owner's call.
- Tests: `supabase/tests/db/adm1_promo_code_commands.test.mjs` (happy path, replay, every bound, every role including service role, direct writes refused, redemption at checkout); `booking_engine_coupons.test.mjs` changed in one line (a customer's direct UPDATE is now refused with permission denied instead of matching no rows).

## Item 5: roles, feature flags, fee rules (and the API settings) - done

- `20261008100200_adm1_roles_flags_fee_rules.sql`
  - `admin_role_directory(role, search, limit, offset)`: administrators and staff with counts per role, paged on the server, audited without the search text; customers are listed only when searched for (3+ characters).
  - `admin_set_feature_flag(key, enabled, reason)`: an existing flag only; idempotent; audited with before and after.
  - `admin_save_fee_rule(channel, first_visit, percentage, min, max, active, reason, description, id)`: marketplace rules only. Bounds that come from what the commission engine really does (`calculate_platform_commission`): the six provider-own channels are always 0 in the engine so their rows cannot be edited; a marketplace rule cannot be switched off because with no active rule the engine charges a built-in 15 percent (set 0 instead); percentage 0 to 50 (a safeguard, not a rate: the table allows 100), minimum 0 to 1000, maximum between the minimum and 1000 or empty; a duplicate rule answers 23505.
  - The "manageable by admins" FOR ALL policies on `fee_rules` and `platform_feature_flags` are replaced by read-only administrator access and INSERT/UPDATE/DELETE are revoked, so the commands are the only write path. `set_user_role` (reason, no self change, last-administrator guard) is unchanged and reused.
- Screens: `admin/roles/page.tsx` (tabs, server search and paging, grant or remove the administrator role through `CommandDialog` with the reason; the server's refusal text, including "cannot change your own role" and "last administrator", is shown in the dialog; the signed-in account's own row shows no action; provider roles are not editable here because approval creates them) and `admin/platform-rules/page.tsx` (feature flags, marketplace fee rules, the five `api.*` settings). Turning a flag on needs the flag name typed. Each section has its own error state with retry.
- API settings: the screen sends whole numbers to `admin_set_api_setting` (command from `wp/api`, `20261006090000_api_keys.sql`, not in this branch's migrations). When the rows are absent the section says the migrations are not applied. **Unsetting a value is not offered**: a JSON null argument reaches the function as SQL NULL through PostgREST and the command refuses it ("use JSON null to unset"), so unsetting needs a command change or an SQL-editor call; flagged for the integrator. `adm1_api_settings_screen.test.mjs` skips itself on this branch and runs after the merge.
- Existing tests changed because direct administrator writes are gone: `qa_defect_fixes.test.mjs` and `security_hardening.test.mjs` change the fee rule through `admin_save_fee_rule` (the audit trigger still records the full values).
- Decisions for the owner: the 50 percent ceiling; fee changes need the owner's approval (the screen says so; the database cannot know it).
- Tests: `supabase/tests/db/adm1_roles_flags_fee_rules.test.mjs` (every command, bounds, replay, every role including service role, direct writes refused), wiring guards in `web_platform/tests/adm1-admin-wiring.test.mjs`.

## Item 7: navigation - done

- `admin/layout.tsx`: "Roles & Permissions" (`/admin/roles`) and "Platform Rules" (`/admin/platform-rules`) in the Management section, both languages. `next.config.ts`: the old `/admin/roles` to `/admin/employees` redirect was removed because it would have hidden the new screen (nothing else retired).

## Item 6: funnel on admin/reports - done

- `admin/reports/page.tsx`: a read-only "Booking funnel and events" card under the exports. It follows the exported period, calls `admin_get_event_counts(start, end)` (no table read), and lists per event: source (server or app), events in the period, the busiest single day's people count and the days with events, with the server funnel steps first (confirmed, payment received, completed, cancelled, no-show). The people figure is the busiest day on purpose: people on different days cannot be summed. A failed read shows the reason with a retry, an empty period says so, a period over 365 days or a reversed range explains itself instead of calling the server. The report page itself was not rewritten; the card is added to it.
- Test: wiring guard in `adm1-admin-wiring.test.mjs`. The command is covered by `fixdbb_analytics_events.test.mjs`.

## Verification (run in this worktree, results as observed)

| Command | Result |
|---|---|
| `node --test "supabase/tests/db/**/*.test.mjs"` | 612 tests, 611 pass, 0 fail, 1 skipped (`adm1_api_settings_screen`, see below); includes the admin command matrix over every `admin_*` function, `data_api_grants` and `migration_hygiene` |
| `node --test supabase/tests/db/adm1_*.test.mjs` | pass (application CR view 2, promo codes 8, roles/flags/fee rules 10; API settings skipped) |
| `npm run test --workspace=web_platform` | 332 tests, 332 pass (new guard file `tests/adm1-admin-wiring.test.mjs`, 10 tests) |
| `npm run test:admin-controls` | passed |
| `npm run test:security-core` | passed |
| `npx tsc --noEmit -p web_platform` | no errors |
| `npx eslint <changed files>` from `web_platform/` | 0 errors, 30 warnings, all of the kinds the files already had (`any`, effect dependencies); `ledger`/`notifications`/`provider-management` have the same count as before |
| `node scripts/verify-ui-schema.mjs` | **1 mismatch** on this branch: `rpc("admin_set_api_setting")` does not exist because the developer API migration (`20261006090000_api_keys.sql`, branch `wp/api`) is not in this worktree. With that migration copied in temporarily (not committed), the script reports 0 mismatches and `adm1_api_settings_screen.test.mjs` and the command matrix pass (20 tests, 0 skipped); the file was removed again. So the mismatch disappears on merge. |

Not run: `npm run build --workspace=web_platform` and `npm run typecheck:mobile` (not in the requested list); the Deno Edge Functions (`wathq-verify`, `send-push`) cannot run here (no Deno); nothing was tried in a browser.

## Edge Functions

- `wathq-verify` and `send-push` are thin and unrun. Their static guards (`verify-security-core`, `negative-authorization` send-push CORS rule) pass; `send-push` keeps `import { corsHeaders as sharedCorsHeaders } from "../_shared/http.ts"` on its own line because a test looks for that exact text.

## Files touched outside the admin console (for the integrator)

- Tests changed because behaviour changed on purpose: `supabase/tests/db/booking_engine_coupons.test.mjs` (a customer's direct UPDATE on `promotional_codes` is now refused), `qa_defect_fixes.test.mjs` and `security_hardening.test.mjs` (fee rules change through `admin_save_fee_rule`), `web_platform/tests/admin-console-guards.test.mjs` (redirect table needs 9 entries, not 10, since `/admin/roles` is a screen).
- `web_platform/next.config.ts`: removed the `/admin/roles` redirect. `web_platform/src/app/admin/layout.tsx`: two navigation entries.
- Migrations: `20261008100000_adm1_application_cr_view.sql`, `20261008100100_adm1_admin_promo_code_commands.sql`, `20261008100200_adm1_roles_flags_fee_rules.sql` (none replaces an existing function).

## Deferred or open

- Unsetting an `api.*` setting from the screen (see item 5).
- Provider roles cannot be changed from the role screen on purpose.
- A browser pass of the new screens (RTL layout, keyboard order, console errors) has not been done.
- Owner decisions flagged: fee-rule ceiling of 50 percent, the meaning of provider-funded platform-wide promo codes, who approves fee changes.
