# Work package brief (read this first)

PRIMORA is a Saudi beauty and grooming booking marketplace: Next.js 16 web (`web_platform`), Expo mobile
(`mobile_app`), Supabase (Postgres 15 with RLS, SECURITY DEFINER commands, Deno Edge Functions). Several AI agents
have worked on it; the owner has asked for the remaining roadmap (`docs/competitive-research/12-prioritized-backlog.md`,
gaps G52, G60, G61, G63, G65-G75) and for every earlier deliverable to be reviewed and repaired. You own ONE work
package. Build it completely and prove it, or say precisely what is not done and why.

## Read before writing code

1. `AGENTS.md` (root: workflow, bilingual rule, "no mock data, no hard-coded values", admin delivery rules) and
   `web_platform/AGENTS.md`. **Next.js 16 differs from your training data: read `node_modules/next/dist/docs/` before
   writing App Router code** (`useSearchParams` needs a Suspense boundary, and so on).
2. The gap rows for your package in `docs/competitive-research/12-prioritized-backlog.md`, and the matching section of
   `docs/competitive-research/11-product-roadmap.md`, `docs/competitive-research/06-missing-features.md` and `15-agreements-and-partnerships.md`
   where relevant.
3. The code you will sit next to: `supabase/migrations/` (read the latest definitions of anything you call),
   `supabase/tests/db/harness.mjs` and two or three existing `*.test.mjs` files, `web_platform/src/components/modal.tsx`
   (`CommandDialog`, `useConfirm`, `ModalOverlay`), `web_platform/src/components/operations-ui.tsx` (`useOperationsLocale`,
   `sar`, `operationsDate`, `CommandResult`, `ForbiddenNotice`, `isForbidden`), `web_platform/src/lib/url-state.ts`,
   an existing provider screen (for example `provider/inventory`) and an existing admin screen (for example `admin/customers`).

## Hard rules

- **Database is the authorization boundary.** There is no middleware. Every operator or user action is a SECURITY DEFINER
  command that asks who is calling (`auth.uid()`, `public.is_admin()`, ownership, `service_role`), validates input, checks
  object scope, requires a reason (3+ characters) when it is privileged, is idempotent where money or replay matters, and writes
  `public.write_audit_log(...)`. Tables are RLS-enabled with default deny; new views are `WITH (security_invoker = true)`; policies
  use `DROP POLICY IF EXISTS` before `CREATE POLICY`. Never grant `anon` anything you did not mean to publish. The audit trigger
  already exists on every table; do not log personal text yourself.
- **Never replace a core function.** Do not `CREATE OR REPLACE` any function that already exists in a migration
  (`create_booking`, `cancel_booking`, `mark_booking_no_show`, `employee_update_booking_status`, `reschedule_booking`,
  `confirm_booking_payment`, `get_available_slots`, `search_marketplace_providers`, money/ledger/refund/payout functions,
  `audit_admin_write`, ...). Other packages change in parallel and the last definition wins. Call them, wrap them, or add
  new functions, tables, triggers and views. If you truly need a core change, stop and describe it in your report instead.
- **Migrations**: only add files in YOUR timestamp range (given in your task), idempotent where sensible, applying cleanly on
  top of every existing migration (the harness applies them all from scratch in PGlite; assume real Postgres 15 will be strict:
  no PGlite-only syntax).
- **No mock, sample, random or hard-coded business values on any release path.** Numbers that are business decisions
  (prices, commission, fees, limits) come from `platform_settings` or provider settings and **default to off/unset until an
  owner sets them**; build the mechanism, never invent the value. Failed queries show errors, zero rows show empty states.
- **Bilingual AR/EN and RTL**: every user-visible string has both languages, the layout mirrors under `dir="rtl"`
  (use `text-start`/`ps-`/`pe-`, `flex` order that survives `dir`), numbers/dates/currency go through the shared formatters
  (SAR only, Asia/Riyadh time). Keyboard and screen-reader operable: labelled controls, visible focus, named row actions,
  dialogs via `CommandDialog`/`ModalOverlay`, no native `prompt`/`confirm`/`alert`.
- **Payments**: never collect card fields. Use the existing flows (`payment-checkout` / `payment-webhook` /
  `confirm_purchase_payment` pattern and Tap-hosted payment). Money is confirmed only by the webhook (service role).
- **PDPL**: personal or sensitive data needs recorded consent, is shown only to those who need it, and privileged reads are audited.
- Do not touch `.admin-console/manifest.json` (the owner's integrator updates it from your report), other packages' files
  beyond a one-line navigation entry, or anything under another worktree.

## Tests you must write (and keep green)

- `supabase/tests/db/<your-feature>.test.mjs`: executing tests on the migrated PGlite schema. For every command: the happy path,
  replay/idempotency, invalid input, and a **negative test for every role** (anonymous, customer, other customer, provider
  owner, other provider's owner, employee, delegated manager if relevant, administrator, service role) proving the forbidden
  operations are rejected by the server. Table-level: prove RLS (a stranger reads nothing, direct writes are refused).
- Web: extend `web_platform/tests/` guard tests only where they check real behaviour (wiring of screens to commands, bilingual copy
  present, no native dialogs). The existing suites must stay green: `node --test supabase/tests/db/**/*.test.mjs`,
  `npm run test --workspace=web_platform`, `npm run test:security-core`, `npm run test:admin-controls`, `npm run typecheck:mobile`.
- Before you finish run: the DB suite, the web tests, `npx tsc --noEmit -p web_platform`, `npx eslint <files you changed>`
  (0 errors, add no new warnings), and `npm run build --workspace=web_platform` if it works in your worktree (the junctioned
  `node_modules` may stop Turbopack; if the build fails only for that reason say so, the integrator builds after merging).

## Worktree and delivery

- You work ONLY in your own git worktree (path in your task) on your own branch. Commit there in logical commits with the
  trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push, merge, rebase, reset, or switch branches. Do not touch
  `primora-fix` or any other worktree. No hosted Supabase, no network calls to payment/WhatsApp providers: write code against their
  documented contracts and prove behaviour with the database tests; state clearly what could not be verified.
- Navigation: add at most one entry per portal to the existing layout `navItems` (provider/customer/admin layouts), with both languages.
- Finish by writing `docs/work-packages/<your-package>-report.md` (committed): what you built (tables, commands, screens, Edge
  Functions), decisions you took and defaults you chose, the exact commands you ran with results, what you could not verify, and
  every file you touched outside your own directories (so the integrator can merge). End your final message with a 15-line summary.
- If you hit a usage limit, commit what is consistent and write the report first.
