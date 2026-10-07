# INTAKE (G72): intake forms and patch tests with explicit consent

Branch `wp/intake`, migrations `20261008200000` .. `20261008200200`. Health answers are sensitive personal data (Saudi PDPL).

## What was built

**Tables** (all RLS-enabled, `grant_data_api_access`, admin audit trigger; no client role can INSERT/UPDATE/DELETE any of them)
- `provider_intake_settings` (`enforce_requirements`, default false, row absent until the owner sets it)
- `intake_form_templates` + `intake_form_template_versions` (provider-owned, versioned; a version is immutable, a change of questions publishes a new one)
- `intake_service_requirements` (one row per service: template, `form_required` default true, `patch_test_required`, `patch_validity_days`, `patch_min_hours_before`; every number NULL until the owner sets it; a patch test cannot be required without a validity)
- `intake_submissions` (non-sensitive status and tombstone: version answered, status `submitted|withdrawn|deleted|purged`, reason, `read_count`, `last_read_at`) and `intake_answers` (the answers; SELECT only for the customer who gave them)
- `patch_test_results` (negative / positive per provider, service, client and dependent; `cleared_at/by/reason` for a positive block)

**Consent**: purpose `health_data` added to the `consents` check and to `record_consent` (patched in place with `patch_function`, dollar quoted). `submit_booking_intake` refuses unless the latest `health_data` row is a grant.

**Commands** (SECURITY DEFINER, search_path pinned, REVOKE then GRANT, audited)
- Owner: `save_intake_template`, `set_service_intake_requirement`, `remove_service_intake_requirement`, `set_provider_intake_enforcement`, `clear_patch_test_block` (reason of 3+ characters)
- Staff who serve a booking (owner, delegate with the bookings permission, assigned active employee; never an administrator): `read_booking_intake_answers` (writes `intake.answers_read` with booking, provider and version but never an answer; bumps the client-visible read counter), `record_patch_test` (idempotent by `p_request_key`)
- Customer: `get_booking_intake`, `submit_booking_intake`, `delete_booking_intake`, `withdraw_health_data_consent`
- Administrator: `admin_intake_overview` (counts and statuses only), `admin_purge_expired_intake(reason, dry_run)`; service role: `purge_expired_intake(dry_run)`
- Validation in the database: field list (types short/long text, yes/no, single/multi choice, date, acknowledge; both languages on every label and option; max 60 fields, 30 options, 2000 characters) and answers (required, choice values, lengths, real dates, unknown keys). Messages name the field, never the value.

**Status view** `provider_booking_intake_status` (`security_invoker`): per booking `form_status`, `patch_status` (`valid|missing|expired|too_late|blocked|not_required`), `blocked`, `met`. Customers see their own rows, staff see the bookings they can already read; it carries no answer. `intake_booking_state()` is its guarded per-row function.

**Enforcement (additive triggers on `bookings`, no core function redefined)**
- `trg_booking_intake_enforcement` (BEFORE UPDATE OF status, checked_in_at, only when moving to completed or setting `checked_in_at`): when the provider turned `enforce_requirements` on, refuses while a required form or valid patch test is missing. Cancellation and no-show do not match the trigger and are never blocked. `employee_update_booking_status` is untouched (its check-in sets `checked_in_at`, completion sets `status = completed`; there is no `in_progress` status in the schema).
- A positive patch test blocks that service for that client (start, completion, and new bookings via `trg_booking_patch_test_block`) until the owner clears it with a reason, whether or not enforcement is on.
- Walk-in clients (no account) are exempt: they cannot complete a form.

**Withdrawal and retention**: an AFTER INSERT trigger on `consents` blanks (deletes) answers of future-dated submissions when `health_data` is withdrawn and keeps the tombstone; past submissions stay until deleted or purged. Platform setting `intake.retention_days` is seeded as `null` (unset); the purge does nothing while unset.

**Screens** (bilingual AR/EN, RTL, shared `CommandDialog`/`ModalOverlay`/`useConfirm`, loading/empty/error states, `.range()` paging)
- `/provider/intake`: enforcement switch, form list and builder dialog, requirement per service, upcoming bookings missing something (view), view answers, record patch test, patch-test log with clear-block
- `/customer/bookings/[id]/intake`: consent step first (what is shared with whom, how long kept), questions, summary with read counter, change, delete, withdraw consent
- `IntakeLink` on the customer bookings list and the confirmation page; nav entry "Intake & Patch Tests" in the provider layout.

## Decisions taken (assumptions to confirm)
- Patch tests are per service (a result qualifies one service) and per person (a customer's own test does not cover their dependent).
- Validity is judged against the appointment time: `tested_at <= scheduled_at - min_hours` and `scheduled_at <= tested_at + validity_days`.
- Staff can read patch-test results (operational safety data) through RLS; answers only through the audited command. Administrators read neither.
- A positive result blocks even when enforcement is off (the provider chose to record it).
- No bypass of the enforcement trigger, including `service_role`; if a scheduled job auto-completes bookings for an enforcing provider it will be refused (no such job exists in the migrations).
- Technical ceilings (60 fields, 30 options, 2000 characters, 3650 days, 720 hours) are safety bounds, not business values.
- Reverting to earlier question content still creates a new version number.

## Verification run
| Command | Result |
|---|---|
| `node --test supabase/tests/db/intake.test.mjs` | 32 tests pass |
| `node --test "supabase/tests/db/**/*.test.mjs"` (whole DB suite) | 647 pass, 0 fail |
| `npm run test --workspace=web_platform` | 341 pass, 0 fail (11 new in `tests/intake-screens.test.mjs`) |
| `node scripts/verify-ui-schema.mjs` | 0 mismatches |
| `npx tsc --noEmit -p web_platform` | clean |
| `npx eslint` on the new files (from `web_platform/`) | 0 errors, 0 warnings; the three edited existing files add no warnings (their existing warnings are unchanged) |
| `npm run build --workspace=web_platform` | not verifiable here: Turbopack refuses the junctioned `node_modules` ("Symlink [project]/node_modules is invalid"); the integrator builds after merging |

DB tests cover: roles x operations (anonymous, customer, other customer, owner, other owner, stranger employee, other provider's employee, delegate, assigned employee, administrator, service role), a stranger reads nothing, an administrator cannot read answers, audit rows for each read without any answer text, validation failures, consent required, withdrawal blanks future bookings only, delete, enforcement off and on, cancellation never blocked, positive block and clear, retention unset and set, replay of `record_patch_test`.

## Not done / could not verify
- No browser run of the new screens (no hosted Supabase, no dev server session); wiring is proven by the schema verifier, tsc, eslint and the source-text tests.
- Employees assigned to a booking can read answers through `read_booking_intake_answers`, but the provider layout confines employees to `/provider/my-day`, so there is no employee screen for it; adding a button there touches another package's page. Owners and booking delegates use `/provider/intake`.
- `IntakeLink` makes one small status query per booking on the list page.
- Patch-test date entry uses the browser's local time zone (`datetime-local`); leaving it empty records "now" on the server.
- The retention value (and who sets it via `admin_update_platform_setting` on `intake.retention_days`) is a legal decision (PDPL / clinic record rules) left to the owner.

## Files touched outside this package's own files
- `web_platform/src/app/provider/layout.tsx` (one nav entry + two translation keys)
- `web_platform/src/app/customer/bookings/page.tsx` and `web_platform/src/app/customer/bookings/[id]/confirmation/page.tsx` (one import + one `<IntakeLink>` each)
- Existing function patched in place by migration: `public.record_consent(text,text,text,text)` (adds `health_data`); constraint `consents_purpose_check` replaced.
