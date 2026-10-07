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
