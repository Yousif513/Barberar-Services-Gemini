# PRIMORA completion plan (continuity tracker)

Owner request (2026-10-06): review everything Codex and Gemini delivered, fix every defect, complete the remaining
roadmap phases in one pass with all checks and tests, commit everything, and resolve obstacles without stopping.

This file is the continuity record. If a session is interrupted, resume from the first row that is not `done`.
Branch of record: `claude-code` (checkout `primora-fix`). Feature work happens in worktrees
`../primora-wp-<name>` on branches `wp/<name>` and is merged here one at a time by the integrator after review.

Standing constraints: preserve Codex, Claude and Gemini work; no history rewrite, no force push, nothing is merged into
`master`; no destructive or irreversible production operation (the hosted Supabase project is never touched);
no mock or invented data; owner-priced features ship disabled and unset; unverifiable things are reported as unverified.

## Status as of 2026-10-09 (supersedes the per-row "queued" markers below)

Every fix package (fixcust, fixdba, fixbooking, fixpub, fixprov, fixmobile, fixdbb, fixqa, fixmoney, fixpriv) and every
roadmap package (REC, API, INTAKE, ADM1, MEMBER, GROUP, DIST, PRO, GCC, AI/WhatsApp, SPONSOR) is merged into `claude-code`;
reports are in `docs/work-packages/*-report.md`, independent reviews in `docs/reviews/2026-10-08-*.md`.
Not built on purpose: G68 white-label, G73 own SAMA licence, G74 kiosk. Verified on the merged tree: DB suite 1165/1165,
inventory 10/10, edge guards 8/8, web 714/714, mobile 27/27, ui-schema 0 mismatches, security-core and admin-controls pass,
typecheck:mobile, web tsc, eslint (0 errors), web build, and on a real local Postgres 15: reset + seed + smoke 19/19 + `db lint`.
Release gate section E is NOT met: `validate --phase release` still reports open items (screens and work queues not yet
marked implemented, owner and legal decisions); no production-ready claim is made. Open owner decisions and unverifiable
items are listed in `.coworking_changelog.md` (entry 2026-10-08).

## A. Review and repair of earlier deliverables

The three reviews are done and committed: `docs/reviews/2026-10-06-gap-verification-{A-p0,B-p1-mobile-portals,C-p2-codex-p3}.md`
(A: 29 defects, B: 50, C: 36 including P3). Result: no gap G01-G64 meets the "complete" bar; the database layer is strong, screens and
public pages carried invented data, dead controls and calls that could not run. Fix packages (each owns a disjoint set of files; defect
lists extracted into `docs/work-packages/defects/<package>.md`):

| Package | Scope | Status |
|---------|-------|--------|
| integrator (done, committed) | explicit Data API grants (fresh Supabase had no table privileges), working seed, real-stack smoke test, UI-vs-schema check in CI, phone verification trigger (D-01, D-06), demo data switched off (D-19), real category pages (R2), invoice VAT (R1), screens that could not load (R5, R6, R13, R14), no invented cards/profile (D-05), no baked-in dead project (D-18), mobile session persistence, deploy gate | done |
| fixdba | consent/agreement evidence, policy bounds + `set_provider_booking_policy`, reminder expiry, column exposure (R10), reviews (R11, R28), home-service address (R12), integrations secrets, waitlist/promo policies | queued |
| fixbooking | slots and time zone (R3/D-21), overnight shifts, buffers/variants (G23), source attribution (D-02), geofence, waitlist claim, packages-to-booking, coupons, loyalty, referral/wallet | queued |
| fixcust | receipt, cancel/reschedule, consent writes, wallet copy, reviews deep link, accessibility on customer pages | queued |
| fixprov | calendar reschedule, closures/leave/seasons UI, employee portal (R18), dashboard honesty and real QR, promos, CSV import, payroll export, walk-in, inventory dialogs | queued |
| fixdbb | authorization scoping (`is_provider_staff`), offboarding, P3 valuation/idempotency/audit, fee invoices, subscriptions, invoice hash lock, analytics events | queued |
| fixpub | login i18n, public claims, shop page a11y/terms consent/slot format, /services search, locale provider | queued |
| fixmobile | deposit/fee copy, payment return to the app, language/RTL, accessibility, session start | queued |

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
| D1 | Local Supabase stack (Docker): apply every migration plus seed on real Postgres 15, smoke the API | done: all migrations and the seed apply; `scripts/smoke-local-supabase.mjs` 19/19; CI runs it |
| D2 | Mobile session persistence (keychain, not AsyncStorage) | done, with unit tests |
| D3 | Home-service booking UI | queued |
| D4 | CI gate before production deploy (Vercel deploys only after CI) | done (`vercel.json` ignoreCommand + tests); the owner can add GITHUB_TOKEN in Vercel for private repos |
| D5 | Expo / React Native advisories check | queued |

## E. Release gate (never claim production-ready unless all hold)

`validate --phase release` exit 0, `coverage` exit 0, `npm run test:db`, `test:inventory`, web tests, `test:security-core`,
`test:admin-controls`, `test:p3-compat`, `typecheck:mobile`, `npm run lint`, `npm run build --workspace=web_platform`,
browser pass with no console errors, independent QA/security/UX passes over everything built here, changelog entry.
Owner decisions (IBAN visibility, PDPL erasure vs ZATCA retention, separation of duties, MFA, Tap vs ledger authority,
credit notes) remain open items in `.admin-console/manifest.json` and are not decided here.
