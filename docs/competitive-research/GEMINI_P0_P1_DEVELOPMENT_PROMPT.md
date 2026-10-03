# PRIMORA — Development Hand-off to Gemini (Antigravity): build P0, then P1

You are Gemini (Antigravity), the implementer for PRIMORA, a Saudi beauty & grooming marketplace with salon software. The owner has approved development of the **P0 and P1 scope** from the competitive audit. Build it **now, step by step, in the order below**. Do not wait for any business calendar: the 24-month plan governs only commercial rollout, never engineering.

---

## 0. Repository and branch — verify before anything else

- Repository: `C:\Users\Yousif's PC\Desktop\Ai Projects\Barberar Services-Gemini` · remote `origin` = `https://github.com/Yousif513/Barberar-Services-Gemini.git`.
- Prepared on 2026-10-03 by Claude Code: working tree clean and checked out on **`gemini`**. `gemini`, `master` and `claude-code` (local and on origin) point to the **same commit**, which contains Codex's former `codex` branch work, the audit documents and the adminwright manifest. The `codex` branch is now an ancestor of `master` — do not use it.
- Run `git status` → it must say `On branch gemini` and `nothing to commit, working tree clean`. Run `git fetch origin`, then `git rev-parse HEAD origin/master` → both hashes must be equal. If `HEAD` is only behind, run `git merge --ff-only origin/master`.
- If you are on any other branch, or the tree is dirty: **STOP and tell the owner.** Never run `git checkout`/`git switch` to another branch, `git reset --hard`, `git rebase`, `git cherry-pick` across branches, or any force-push.
- **Git authorization for this task (from the owner):** commit on `gemini` with messages starting `gemini:`; push `origin gemini`. After a step passes every check in §5, integrate with master: `git fetch origin`; if `origin/master` moved, `git merge origin/master` (normal merge, never rebase) and re-run the checks; then `git push origin gemini` and `git push origin gemini:master` (fast-forward only — if rejected, fetch, merge, re-check, retry; never force).

---

## 1. Read first, in this order

1. Root `AGENTS.md` — all of it, including **"Admin console delivery rules"**, which govern `web_platform/src/app/admin/**`, `supabase/migrations/**` and `supabase/functions/**`.
2. `.cursorrules` and the latest entries of `.coworking_changelog.md` (some committed migrations may not be applied to the remote Supabase project).
3. `docs/competitive-research/PRIMORA_MASTER_AUDIT.md`, then:
   - `11-product-roadmap.md` — step definitions and exit checks (**this is your spec**)
   - `12-prioritized-backlog.md` — G-IDs
   - `08-technical-audit.md` — evidence and booking edge cases E1–E28
   - `07-ux-audit.md`, `09-saudi-localization.md`, `14-pricing-strategy.md`, `15-agreements-and-partnerships.md`, `17-kpi-and-success-framework.md` §5 (analytics events)
4. `.admin-console/manifest.json` and `.admin-console/worklog/architect-primora-audit.md`.
5. `web_platform/AGENTS.md` — Next.js 16.2.9 differs from your training data; read `node_modules/next/dist/docs/` before writing any App Router server code (route handlers, server actions, middleware).
6. Design: `AGENTS.md` names `primora-design-system`, `primora-dashboard-layout`, `primora-data-visualization` skills, but they were **not found** in `.agents/skills/` on 2026-10-03. Use them if your environment has them; otherwise follow the tokens in `web_platform/src/app/globals.css` and the light-lux tokens in `GEMINI_PLAN.md` §2.

`GEMINI_PLAN.md` (July 2026) is superseded by this prompt wherever they conflict.

---

## 2. Build order — each step starts as soon as the previous step's exit checks pass

### P0 — launch-blocking

**P0-A · Safety, truth & cleanup** (G05, G06, G07, G08, G04, G15, G19)
- Lock `supabase/functions/process-refund` behind admin authentication exactly like `supabase/functions/process-payout/index.ts` (read `Authorization`, `auth.getUser`, require `profiles.role = 'admin'`), fail closed, no `Access-Control-Allow-Origin: '*'`. Full rebuild happens in P0-D.
- `send-notification`: require an authenticated caller; only server-side events may target another user; stop writing to the non-existent `notifications` table.
- Remove raw card number / expiry / CVV / cardholder state and inputs from `web_platform/src/app/provider/pricing/page.tsx` and `web_platform/src/app/shop/[id]/page.tsx`. Payment only through Tap's hosted or embedded flow.
- Remove or correct every unbacked public claim — ZATCA e-invoicing, SMS reminders, escrow, SAMA, "payout in under 5 minutes", automatic refunds, hygiene audits, PDPL compliance — in English **and** Arabic: pricing page, `/terms`, `/about`, `/privacy`, `/security`, `/become-provider`. **Do not change plan prices or fee numbers.**
- Expire `pending_payment` bookings after a configurable hold window (scheduled job); handle payment webhooks that arrive after expiry (confirm if the slot is still free, otherwise refund and notify) — edge cases E2–E5.
- Cleanup: delete grep-bait comments (e.g., `web_platform/src/app/admin/payments/page.tsx:6-9`) and update `scripts/verify-*.mjs` to check behaviour, not comments; remove demo-data fallbacks on financial and tax screens (zero rows → empty state, failed query → error state naming the reason); remove mock fallbacks in `send-otp` and `calculate-travel` (missing configuration → explicit error, never fake success).
- Analytics and error tracking with the events in report 17 §5; keys via environment variables; add variable names to `.env.example`.
- Add a test runner to `web_platform` (`npm test --workspace=web_platform`) and database tests (pgTAP via `supabase test db` if local Supabase/Docker is available — if not, tell the owner). First tests: negative authorization tests per role for bookings, providers, ledger and the refund / payout / notification functions.

**P0-B · Identity & consent** (G09, G16, G13)
- Phone + OTP sign-up and sign-in using `send-otp`. Remove the `'+9665' || random` phone fallback in `handle_new_user` through a **new** migration (phone stays NULL until verified). Cleaning existing fabricated numbers is a production data change → ask the owner.
- A guest who picks a slot authenticates by inline phone OTP and returns to the same step with service, professional, date and slot intact (replace the bare `router.push("/login")` in `shop/[id]/page.tsx`).
- `consents` table (purpose, granted/withdrawn, timestamp, method, document version); separate opt-ins for WhatsApp, marketing and photos; data-subject request intake plus an admin queue with a 30-day due date.

**P0-C · Supply & agreements** (G01, G18, G03)
- `provider_applications` → admin review queue (approve / reject with reason) → **one server-side, audited approval operation** that creates the `providers` row, the owner relationship and the `provider_owner` role → guided setup checklist (hours → services → staff → policy → share link). Replace the React-state-only "Add provider" in `admin/providers/provider-management.tsx` and fix its catch-and-succeed block.
- Versioned legal documents with acceptance records (user, version, timestamp, method). Drafted texts are stored as **draft**; publishing requires the owner to confirm legal review.
- Public provider booking URL, QR code and WhatsApp / Instagram share kit; `bookings.source` (`marketplace`, `link`, `qr`, `whatsapp`, `instagram`, `walk_in`, `import`) set server-side; first-visit detection per provider–customer pair.

**P0-D · Booking rules & money** (G17, G10, G02, G14, G12)
- Overnight shifts (end earlier than start → next day) in `get_available_slots`, with tests for 21:00–02:00.
- Per-provider cancellation / no-show policy (free-cancellation window, late-cancel %, no-show %, deposit %), shown before payment and on the confirmation, enforced in `cancel_booking` and in no-show marking.
- Replace the commission forced to 15 % (`supabase/migrations/20260615182811_harden_auth_and_booking_core.sql`, provider insert trigger) with a **fee-rules table**: own-client sources 0 %; marketplace first visit = percentage with minimum and maximum. Values are data, never hard-coded; the owner must confirm the numbers before production use (report 14 hypothesis: 20 %, min SAR 10, max SAR 40). Commission is currently capped at the captured deposit (`LEAST(platform_commission, total_captured)`); fix that through the fee ledger in P1-D, not silently here.
- `admin_audit_log` written in the same transaction as every privileged action. Payout approval and the refund rebuild become single server operations with idempotency keys — remove the three-step browser mutation in `admin/ledger/page.tsx` and the direct-insert fallback in `provider/wallet`.
- Tap Marketplace sub-merchant onboarding and split at capture behind feature flag `payments_marketplace_split`, **OFF** until the owner confirms the legal opinion on fund custody.

**P0-E · WhatsApp messaging** (G11)
- `message_queue` and `message_log` (template, recipient, status, cost); scheduled dispatcher with retries and backoff.
- Arabic and English templates: confirmation; 24 h and 2 h reminders with Confirm / Reschedule / Cancel; post-visit review + rebook; owner new-booking alert.
- Send only to verified numbers with WhatsApp consent; respect quiet hours.

### P1 — competitive core (starts immediately after P0)

- **P1-A · Platform hygiene** (G31, G32, G40, G39): create or remove the features using missing tables (`notifications`, `expo_push_tokens`, `provider_customer_notes`, `provider_promos`); honest loading / empty / error states, server-side pagination and SAR on every admin screen (the dashboard shows USD today); CORS allow-list on every function; hash developer tokens or hide `/developer` until an API exists; apply the Next.js security patch flagged by `npm audit`; fix `globals.css` line ~124 (`!important` override erasing status badges) and line ~166 (breaks sticky), WCAG AA contrast, visible focus rings, dashboard mobile navigation.
- **P1-B · Scheduling depth** (G22, G23, G20, G21): time off, closures, holidays, Ramadan schedules; buffers, processing time, service variants; "any available professional"; atomic reschedule.
- **P1-C · People & trust** (G24, G26, G30, G42): membership model (user ↔ provider ↔ role ↔ branch); employee "My day" with status updates; Wathq CR verification and "verified" badge; professional ratings, provider replies, moderation queue; professional profiles and portfolios (consented photos only).
- **P1-D · Money depth & compliance** (G33, G34, G38, G25): disputes, refunds and daily PSP reconciliation; fee ledger with collection beyond the deposit; real subscription billing with plan entitlements (prices confirmed by the owner); ZATCA Phase 2 through a certified partner — Wave 25 deadline **2027-02-01**.
- **P1-E · Growth surfaces** (G27, G28, G29, G35, G41, G43, G37, G36): one locale provider with server-rendered `lang`/`dir` and an Arabic webfont; server-rendered provider, category and district pages with sitemap and schema.org; server search with Arabic normalization and distance; client import; post-visit rebook message; monthly "PRIMORA brought you…" summary; home-service address privacy and capture after completion; mobile app connected to real data or withheld (owner decides).

After P1, continue with P2 from `12-prioritized-backlog.md` unless the owner redirects.

---

## 3. Engineering rules (non-negotiable)

- Targeted edits only; never overwrite a tracked file wholesale. Never edit an applied migration — add new timestamped migrations. `DROP POLICY IF EXISTS` before every `CREATE POLICY`. Views `WITH (security_invoker = true)`. `SECURITY DEFINER` functions set a fixed `search_path`. Every service-role Edge Function checks the caller and role itself — `verify_jwt` is not authorization.
- Money: one server-side transaction with an idempotency key. Never multi-step financial writes from React.
- A failed write rolls back optimistic state and shows the error (pattern: `admin/services/page.tsx`, the `updateError` branch). No catch-and-succeed.
- No mock, demo, sample, random or hard-coded business values in release paths. Demo data belongs in `supabase/seed.sql`; genuinely static values go in the manifest's `declaredStatic[]` with a reason.
- No placeholders or TODO comments. When something needs an owner decision or a credential, ship the complete mechanism disabled or failing closed with a clear message, and record the pending decision in the changelog and the manifest's `decisions[]`.
- Every UI string in Arabic and English; RTL mirrored; SAR currency; Asia/Riyadh behaviour today, but store a timezone per branch when you touch scheduling.
- Bulk actions authorize per row; exports obey row and field policies; destructive actions get confirmation, reason capture and recovery (prefer `deleted_at` soft delete).
- Never commit secrets. Add variable names (not values) to `.env.example`.

---

## 4. Stop and ask the owner (keep building other items while waiting)

1. Fee and price numbers (G02, G38, founding-partner terms), any change to what real providers are charged, and any change to the prices shown on the public pricing page.
2. Publishing legal texts (G18) and turning on the PSP split (G12) — both need Saudi legal review.
3. Production data changes, destructive migrations, and pushing migrations to the remote Supabase project (`vpszcnxsgmoavkqorjzt`). Check remote state with `supabase migration list --linked` once credentials exist.
4. Credentials and which environment they belong to: WhatsApp (Meta / Twilio), Tap Marketplace, Wathq, analytics / error tracking, ZATCA partner.
5. Whether admins may see unmasked provider IBANs — mask by default until decided.
6. Which system is authoritative when Tap and `transactional_ledger` disagree.
7. Mobile app: connect to real data or withhold from stores (G36).
8. Any **new** marketing claim. (Removing false claims is already approved.)

---

## 5. Exit checks for every step — all must pass before merging to master

- `npm run typecheck:mobile`
- `npm run build --workspace=web_platform`
- `npx eslint` in `web_platform` — 0 errors, warnings not increased
- `npm test --workspace=web_platform` plus the database tests
- `npm run test:security-core` and `npm run test:admin-controls`
- The step's exit checks in `docs/competitive-research/11-product-roadmap.md`
- Browser check of every route you changed, in English and Arabic: no console errors; loading, empty, error and success states all reachable
- For admin / Supabase changes:
  `python "C:/Users/Yousif's PC/.claude/skills/adminwright/scripts/admin_console_manifest.py" validate --manifest .admin-console/manifest.json --project-root . --phase release`
  `python "C:/Users/Yousif's PC/.claude/skills/adminwright/scripts/admin_console_manifest.py" coverage --manifest .admin-console/manifest.json --project-root .`
  Report the exit codes honestly. Update the manifest status of what you implemented, but **do not mark your own work reviewed** — Claude Code reviews each completed step.
- Append a `.coworking_changelog.md` entry per step (files, migrations, tests, check results, commit hash, pending owner decisions, next step); commit; push `gemini`; fast-forward `master` (§0).

---

## 6. Report back after each step

A short plain summary: what customers, providers and operators can now do; G-IDs completed; tests added; every check with its exit code; decisions waiting for the owner; the next step. Never say "production-ready" unless validate and coverage exit 0 and every check above passes.

**Start now with P0-A.**
