# PRIMORA expert agent team

The lead (Claude Code, this session) plans, dispatches, verifies every result independently, and owns commits, pushes and merges.
Agents never push, merge, touch the hosted Supabase project or the owner's own account.
Agent definitions live in `C:\Users\Yousif's PC\.claude\agents\` and are available to every future session.

## Specialists

| Squad | Agent | Expertise | Writes code? |
|-------|-------|-----------|--------------|
| Compliance | `primora-saudi-compliance-counsel` | PDPL, SDAIA, ZATCA VAT and e-invoicing, Commercial Books Law, SAMA, MoC, NCA | No (memos) |
| Money | `primora-payments-architect` | Tap, ledger, reconciliation, refunds, fees, VAT on fees, idempotency | Yes |
| Data and authorization | `primora-postgres-security-engineer` | Postgres 15, Supabase RLS, definer functions, grants, pg_cron, query performance | Yes |
| Security | `primora-red-team` | Offensive testing of web, API, Edge Functions, auth/MFA, business logic | No (findings) |
| Security | `adminwright-security` | Admin-console threat model, authorization matrix, data exposure | No (findings) |
| Quality | `primora-e2e-test-architect` | Playwright end-to-end suite in CI | Yes (tests) |
| Quality | `adminwright-qa` | Release gate, capability review with evidence | No (review) |
| Experience | `primora-accessibility-specialist` | WCAG 2.2 AA, keyboard, screen readers, RTL | Yes |
| Experience | `primora-arabic-localization-lead` | Arabic copy, glossary, RTL, numerals, dates, currency | Yes |
| Experience | `adminwright-ux-reviewer` | Admin information architecture, states, forms | No (findings) |
| Experience | `frontend-artisan`, `design-steward` | Front-end craft and design system | Yes |
| Mobile | `primora-mobile-expo-engineer` | Expo SDK 56 parity, secure sessions, RTL | Yes |
| Performance | `primora-performance-engineer` | Core Web Vitals, bundles, waterfalls, slow queries | Yes |
| Product | `primora-product-strategist` | Marketplace journeys, benchmarks, requirements | No (requirements) |
| Delivery | `primora-release-engineer` | Go-live runbooks, hosted migrations, schedules, monitoring | Runbooks and inert migrations |
| Docs | `primora-technical-writer` | Bilingual runbooks, help center, policy drafts for counsel | Docs |
| Console build | `adminwright-architect`, `adminwright-implementer`, `adminwright-harvester` | Admin console model, build, lessons | Yes |

## Quality gates (every change)
1. **Plan of record.** Work follows `docs/legal/2026-10-10-adopted-decisions.md` and `docs/OWNER-DECISIONS.md`. Conflicts are raised, never silently changed.
2. **Independent review.** The builder never reviews its own work. Money and authorization changes are reviewed by `primora-red-team` or `adminwright-security`. Screens are reviewed by the accessibility and Arabic leads.
3. **Lead verification.** The lead re-runs the full checks itself: DB, web, edge, mobile, schema, security-core, admin-controls, p3-compat, tsc, lint, deno, real-stack smoke, build.
4. **CI must be green** before any merge to `master`. Production stays held until the owner enables the release switch.

## Capacity
At most 3 agents run at once. More parallel agents hit the account's usage limits sooner and collide on shared files, so specialists rotate in waves.
