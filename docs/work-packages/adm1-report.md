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
