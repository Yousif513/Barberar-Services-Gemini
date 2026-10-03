# Unified AI Agent Rules & Constraints (AGENTS.md)

This file contains the mandatory operational rules, constraints, and verification protocols that **ALL AI models** (Claude Code, Gemini/Antigravity, Cursor, and Codex) must read and verify **BEFORE** taking any action in this workspace.

---

## 1. Pre-Work Verification Checklist (Read before editing)
Before modifying any files or running commands, you **MUST** execute the following steps:
1. **Check Git Status**: Run `git status` and `git diff` to audit the current branch and verify if there are any uncommitted changes left by another model.
2. **Verify Branch Alignment**:
   * If you are **Claude Code**: You must be on the `claude-code` branch. Switch via `git checkout claude-code` if not.
   * If you are **Gemini (Antigravity)**: You must be on the `gemini` branch. Switch via `git checkout gemini` if not.
3. **Read the Changelog**: Open [.coworking_changelog.md](file:///c:/Users/Yousif's%20PC/Desktop/Ai%20Projects/Barberar%20Services-Gemini/.coworking_changelog.md) to review what the other models recently committed.
4. **Sync with Master**: Ensure your branch is updated by merging/pulling the latest stable code from `master` (`git pull origin master`).

---

## 2. Coding & Design Integrity Rules
* **No Full-File Overwrites**: Never overwrite a tracked file completely. Always perform targeted line replacements (search-and-replace) to preserve surrounding hooks, comments, and structure.
* **No Placeholders**: Never write placeholders, mockup stubs, or "TODO" comments. Implement complete, fully functional code structures.
* **Bilingual UI (AR/EN)**: All UI components must support translations. Direct hardcoding of strings is prohibited.
* **RTL Mirroring**: Enable Right-to-Left (RTL) mirroring when the active locale is Arabic (`dir="rtl"`). Mirror flex rows, navigation controls, and icons.
* **Observe the Design System**: Read and follow the localized design system skills (`primora-design-system`, `primora-dashboard-layout`, `primora-data-visualization`) before editing layout components.

---

## 3. Post-Work Verification Checklist (Run before ending session)
Before completing your turn or ending your session, you **MUST** verify codebase health:
1. **Run Mobile Type-Check**: Execute `npm run typecheck:mobile` to verify Expo React Native TS safety.
2. **Run Web Build**: Execute `npm run build --workspace=web_platform` to verify Next.js build compilation.
3. **Log Your Progress**: Append your changes (modified files, commit hash, and next steps) to [.coworking_changelog.md](file:///c:/Users/Yousif's%20PC/Desktop/Ai%20Projects/Barberar%20Services-Gemini/.coworking_changelog.md).
4. **Commit & Push**: Commit your changes to your designated branch and push them to `origin`.

---

---

# Admin console delivery rules

These rules govern `web_platform/src/app/admin/**`, `supabase/migrations/**` and
`supabase/functions/**`. They were added by an adminwright architect audit on 2026-09-04 and
supersede nothing above; where they are stricter, the stricter rule applies.

## Ownership

You own end-to-end completeness for every capability you implement. Do not build only the
page that was named. Infer the supporting capabilities the platform's domain, entities,
roles, workflows, risks, and existing architecture obviously require.

The console under these rules is `/admin`, built at profile `regulated`, modeled in
`.admin-console/manifest.json`. The profile is `regulated` because the platform holds Saudi
VAT/ZATCA tax records, provider IBANs, customer PII, and moves real money through Tap.

## The four defects this codebase already has — never reintroduce them

1. **Catch-and-succeed.** A `catch` block whose body is identical to its `try` block, so a
   failed write reports success. See `web_platform/src/app/admin/providers/provider-management.tsx:1005`.
   A failed write must roll the optimistic state back and surface the error, as
   `web_platform/src/app/admin/services/page.tsx:329` does.
2. **Demo fallback on empty or failed queries.** Six screens substitute invented records when
   a query errors *or returns zero rows*, so an outage, an unapplied migration and a genuinely
   quiet month are indistinguishable. A zero-row result renders an empty state. A failed query
   renders an error state naming the reason. Financial and tax screens may never substitute
   sample data under any circumstance.
3. **Money mutations in the browser.** Multi-step financial writes must be one server-side
   transaction with an idempotency key, never a sequence of PostgREST calls from a React
   handler. See `web_platform/src/app/admin/ledger/page.tsx:598`.
4. **Grep-bait comments.** No comment block exists to satisfy an automated check. See
   `web_platform/src/app/admin/payments/page.tsx:6-9`, which must be deleted.

## Supabase-specific authorization rules

- RLS is currently the **only** authorization boundary: there is no Next.js middleware, no
  route handler and no server action anywhere in `web_platform`. `AuthGuard` is a client
  render gate and is not authorization.
- `verify_jwt = true` on an Edge Function is **not** authorization. It is satisfied by the
  project's public publishable key, which ships in every browser bundle. Every service-role
  Edge Function must independently read the `Authorization` header, call `auth.getUser`, and
  check `profiles.role`, exactly as `supabase/functions/process-payout/index.ts:22-54` does.
- `Access-Control-Allow-Origin: '*'` is forbidden on any function holding
  `SUPABASE_SERVICE_ROLE_KEY`.
- Every new view is created `WITH (security_invoker = true)` unless a `decisions[]` entry
  records why not.
- Every new policy migration uses `DROP POLICY IF EXISTS` before `CREATE POLICY` so it stays
  idempotent, matching the existing convention.
- Default deny. Validate both the action and the object scope on every request. Exports and
  search obey the same row and field policy as detail views. Bulk actions authorize per
  target row, not once for the batch.
- Every role has negative tests proving forbidden operations are rejected by the server.
  There are currently none; write them before adding a role.

## Decide these yourself, document the assumption, and continue

- Loading, empty, filtered-empty, error, forbidden, conflict, stale, and success states
- Field validation, and preserving operator input when a request fails
- Search, filtering, sorting, and server-side pagination — every admin list currently selects
  all rows with no limit and will hit the `max_rows = 1000` ceiling in `supabase/config.toml`
- Audit records on privileged reads and every mutation
- Safeguards on destructive actions: preview, confirmation, reason capture, recovery
- Responsive layout and keyboard operability
- Timezone and locale handling; **currency is SAR only** — the dashboard currently renders
  US dollars, which is a defect

## Ask a human before proceeding

- Pricing, commission or VAT rates, or anything that changes the business model
- Legal or regulatory interpretation, including ZATCA retention and PDPL erasure obligations
- Destructive data migrations, and anything irreversible in production
- External credentials, and which environment a credential belongs to
- Whether operators are permitted to view a specific class of sensitive data — provider IBANs
  are currently rendered unmasked to every admin and no one has approved that
- Which system is authoritative when Tap and `transactional_ledger` disagree

## Read before implementing

- `.admin-console/manifest.json` — the current truth about this console, including 30 open
  gaps ranked by severity
- `.admin-console/worklog/architect-primora-audit.md` — what the last pass found
- `GEMINI_PLAN.md`, `docs/barberar-dev-dashboard-data.md`, `supabase/migrations/`
- `web_platform/AGENTS.md` — Next.js 16 has breaking changes from training data; read
  `node_modules/next/dist/docs/` before writing App Router code

Stack, pinned from lockfiles: Next.js 16.2.9, React 19.2.4, Tailwind 4,
`@supabase/supabase-js` 2.108.1, Postgres 15, Deno Edge Functions. Record what you consulted
in the manifest's `platform.researchSources[]`. Do not guess a framework's authorization,
policy, or job idiom.

## No mock data, no hard-coded values

No mock, placeholder, stub, sample, random, or hard-coded value may reach the release path.
A value that is genuinely static by design must be registered in the manifest's
`declaredStatic[]` with a reason and an approver. That registry is the only exception.

Fixtures and seeds are legitimate and must stay out of the paths named in `dataBinding`,
`sourceOfTruth`, and `dataSources`. `supabase/seed.sql` is the correct home for demo data;
a React component is not.

## Per-entity capability review

For every managed entity, decide explicitly whether operators need: list and search; filters,
sorting, and saved views; detail and history; creation and editing; status transitions;
assignment; bulk operations; import; export; archive, deletion, and restoration; audit
history; and permission or scope restrictions.

Do not add these mechanically. Record in the manifest why each is required, not required, or
deferred. A transition is a business command with preconditions and effects, never a status
dropdown. Every delete in this console is currently a hard `DELETE` with no restore; prefer a
`deleted_at` soft delete with RLS-filtered reads.

## Review independence

The agent that implements a capability does not mark it reviewed. Review is a separate pass
that re-reads the code rather than recalling it.

## Completion gate

Do not report completion until all of these hold:

- `python "C:/Users/Yousif's PC/.claude/skills/adminwright/scripts/admin_console_manifest.py" validate --manifest .admin-console/manifest.json --project-root . --phase release` exits 0
- `python "C:/Users/Yousif's PC/.claude/skills/adminwright/scripts/admin_console_manifest.py" coverage --manifest .admin-console/manifest.json --project-root .` exits 0
- `npm run build --workspace=web_platform` succeeds
- `npm run typecheck:mobile` succeeds (repo-wide gate from section 3 above)
- `npx eslint` succeeds in `web_platform`
- A test command exists and succeeds. There is currently **no test runner configured in
  `web_platform/package.json`** — adding one, starting with authorization negative tests, is
  part of the first slice that touches authorization.
- No unexplained TODO, placeholder route, or disconnected control remains
- No browser console errors on any admin route
- Every destructive operation has a safeguard and a recovery path
- Every privileged operation emits an audit event
- The adversarial gap audit found no unresolved critical or high omission

## Reporting

Report by operational domain, not page by page. State the profile, what an operator can now
do without engineering involvement, what remains blocked or deferred and why, and the
validation and coverage results.

---

*By proceeding with any action in this repository, you agree to follow these guidelines.*
