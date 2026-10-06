# PRIMORA completion plan (continuity tracker)

Owner request (2026-10-06): review everything Codex and Gemini delivered, fix every defect, complete the remaining
roadmap phases in one pass with all checks and tests, commit everything, and resolve obstacles without stopping.

This file is the continuity record. If a session is interrupted, resume from the first row that is not `done`.
Branch of record: `claude-code` (checkout `primora-fix`). Feature work happens in worktrees
`../primora-wp-<name>` on branches `wp/<name>` and is merged here one at a time by the integrator after review.

Standing constraints: preserve Codex, Claude and Gemini work; no history rewrite, no force push, nothing is merged into
`master`; no destructive or irreversible production operation (the hosted Supabase project is never touched);
no mock or invented data; owner-priced features ship disabled and unset; unverifiable things are reported as unverified.

## A. Review and repair of earlier deliverables

| Id | Scope | Reviewer report | Status |
|----|-------|-----------------|--------|
| A1 | Gemini P0 gaps G01-G19 verified against the code | `docs/reviews/2026-10-06-gap-verification-A-p0.md` | running |
| A2 | Gemini P1 gaps G20-G43, mobile, portals | `docs/reviews/2026-10-06-gap-verification-B-p1-mobile-portals.md` | running |
| A3 | Gemini P2 gaps G44-G64 and Codex P3 inventory/supply/chain | `docs/reviews/2026-10-06-gap-verification-C-p2-codex-p3.md` | running |
| A4 | Fix every defect the three reports list (critical first), with tests | review fix migrations from `20261006220000` | waiting on A1-A3 |

## B. Remaining roadmap (master gap table `docs/competitive-research/12-prioritized-backlog.md`)

| Gap | Package | Worktree / branch | Migration range | Status |
|-----|---------|-------------------|-----------------|--------|
| G71 | REC recurring appointments | `primora-wp-rec` / `wp/rec` | 20261006010000-020000 | building |
| G72 | INTAKE intake forms and patch tests | `primora-wp-intake` / `wp/intake` | 030000-040000 | building |
| G65 | MEMBER memberships | `primora-wp-member` / `wp/member` | 050000-060000 | building |
| G75 | PRO portable professional identity | `primora-wp-pro` / `wp/pro` | 070000-080000 | building |
| G69 | API real developer API | `primora-wp-api` / `wp/api` | 090000-100000 | building |
| G52 | GROUP group booking | `primora-wp-group` / `wp/group` | 110000-120000 | queued |
| G61 | DIST Google/Instagram distribution, attribution, JSON-LD | `primora-wp-dist` / `wp/dist` | 130000-140000 | queued |
| G60 | AI WhatsApp Arabic receptionist (deterministic) | `primora-wp-ai` / `wp/ai` | 150000-160000 | queued |
| G63 | SPONSOR sponsored placement (labelled, owner-priced, off by default) | `primora-wp-sponsor` / `wp/sponsor` | 170000-180000 | queued |
| G67 | Payroll runs and export (extends `calculate_staff_payroll`) | integrator | 190000-200000 | queued |
| G66 | Inventory / retail | built by Codex P3, verified in A3 | - | review only |
| G70 | GCC multi-country configuration | integrator (serialized last) | 210000 | queued |
| G68 | White-label apps | - | - | intentionally not built (plan: defer) |
| G73 | Own SAMA licence | - | - | intentionally not built (plan: defer, use the PSP) |
| G74 | Kiosk / hardware | - | - | intentionally not built (plan: do not build) |

## C. Admin console surfaces still open (from QA and UX passes)

Role management screen with approver; customer credit and gift cards; feature flags; fee rules; subscription plans;
legal agreement versions; job-post and chat moderation; audit-log export and retention; audit rows for service-key
Edge Function paths; CORS origin matching in Edge Functions; audit/refunds/employees filters in the address bar;
provider KPI definitions; phone-width tables; one numeral system per language; invoice QR image; drawer sliver after a
language switch; Arabic load errors on Packages and Services. Status: queued behind A4.

## D. Platform and delivery

| Id | Item | Status |
|----|------|--------|
| D1 | Local Supabase stack (Docker): apply every migration plus seed on real Postgres 15, smoke the API | in progress |
| D2 | Mobile session persistence (AsyncStorage) | queued |
| D3 | Home-service booking UI | queued |
| D4 | CI gate before production deploy (Vercel deploys only after CI) | queued |
| D5 | Expo / React Native advisories check | queued |

## E. Release gate (never claim production-ready unless all hold)

`validate --phase release` exit 0, `coverage` exit 0, `npm run test:db`, `test:inventory`, web tests, `test:security-core`,
`test:admin-controls`, `test:p3-compat`, `typecheck:mobile`, `npm run lint`, `npm run build --workspace=web_platform`,
browser pass with no console errors, independent QA/security/UX passes over everything built here, changelog entry.
Owner decisions (IBAN visibility, PDPL erasure vs ZATCA retention, separation of duties, MFA, Tap vs ledger authority,
credit notes) remain open items in `.admin-console/manifest.json` and are not decided here.
