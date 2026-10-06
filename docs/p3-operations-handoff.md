# P3 Operations Handoff

## Current State

Work is uncommitted in the current `gemini` checkout. Commits, merges and pushes are deferred at the user's request. Other agents' changes and `.claude/settings.local.json` were preserved.

The latest locally visible `origin/claude-code` is `909c0a4`, newer than the `92ea34c` snapshot mentioned in the earlier P3 entry. No branch was changed or merged. References were reviewed read-only; no network refresh was possible in this session.

## What Operators Can Do

- `/provider/inventory`: create and edit suppliers/products, deactivate/reactivate them, create supplier purchase orders, submit orders, and receive approved orders. Only the owner or admin may approve. Cancellation requires a reason.
- Record positive or negative stock adjustments and waste with a reason. Quantities cannot fall below reserved stock. Every change writes stock movement and audit records in the same transaction.
- Transfer stock between authorized branches of the same provider. Both stock rows lock in a consistent order; the two movement records and balances commit together.
- Use low-stock suggestions to prepare an editable purchase order. Suggestions include active products with no stock row, not just existing balances.
- `/provider/chain`: review live branch totals by Riyadh date range. Owners can grant, edit and disable scoped access for registered staff. Inventory, booking management, staff editing and reports permissions are enforced by database code. Disabling access denies fresh requests immediately.
- `/admin/supply`: search and paginate supplier orders, inspect line items, review provider stock health, and inspect recent negative adjustments and waste. This page is read-only oversight, with an audit event for each query. Review signals are not assertions of fraud.

All three pages use the existing ivory/gold design, bilingual labels and RTL direction. Failed queries display errors; zero rows display empty states. No sample records are substituted.

## Database and Release Boundary

The migrations are prepared and locally tested, **not applied to hosted Supabase**:

1. `supabase/migrations/20261005060000_enterprise_inventory_and_supply.sql`
2. `supabase/migrations/20261005070000_inventory_controls_and_chain_operations.sql`

The initial P3 migration was moved from version `20261005040000` because Claude's newer admin-broadcast migration already uses that version. Neither local P3 migration had been applied before this rename.

Stock commands require a request UUID. A receipt deduplicates a retry with the same payload; reusing the UUID for another payload fails. The UI preserves this UUID after a failed request and creates a new one after a payload change or successful operation.

Direct client writes to stock balances, movement history, purchase orders and permission memberships are revoked. Catalog writes use RLS plus scope-validation and audit triggers. Managers cannot approve their own procurement orders, reassign staff identity or branch, grant themselves access, or write another provider's catalog.

Existing booked employee privileges remain distinct from delegated management permissions: an assigned active specialist can still perform their own booking work. Staff permission grants editing within the assigned branch, not identity reassignment or arbitrary user provisioning.

## Claude Reconciliation

The source review report on `origin/claude-code` is `docs/reviews/2026-10-04-gemini-p0-p2-review.md`. Its findings and verification belong to that branch and must not be described as already integrated here.

| Domain | Evidence on Claude branch | Remaining integration work |
| --- | --- | --- |
| Booking | Corrected migration chain, server pricing, cancellation/hold handling and live shop/mobile flows | Preserve these commands and transition rules when merging P3 permissions |
| Money | Refund/reconciliation fixes and transactional commands described in the branch's review report | Re-run its money tests after integration; verify hosted function deployment separately |
| Trust and messaging | Wathq, real dispatch, consent handling, job acceptance and admin broadcast migrations | Preserve these migrations; P3 now uses later version numbers |
| Dashboard honesty | Removal of demo fallbacks across customer/provider/admin pages | Keep those removals when resolving shared layout conflicts |
| Platform | Next.js 16.3.8, Arabic font/pre-paint language state, CI and no-mock tests | Keep the newer dependency versions, language initialization and CI DB checks |
| Admin manifest | Existing release validation and coverage still fail | Reconcile each capability to current source and runtime evidence; do not bulk-mark findings resolved |

Likely merge conflicts are limited to shared layouts, `package.json`, `package-lock.json`, the coworking log and the manifest. The P3 pages, tests and two migrations are additive.

## Verification

- `npm test`: 10 executing Postgres inventory tests and 91 existing web tests passed.
- `node scripts/verify-p3-migration-compatibility.mjs`: all 43 migrations from the locally visible `origin/claude-code`, then both P3 migrations, apply in isolated Postgres. Owner writes, scoped delegation, retry deduplication and revoked permissions are exercised against the full chain.
- Web build, web TypeScript, mobile type-check, security-core and admin-control checks passed.
- Focused ESLint: no errors or warnings in P3 files and touched layouts. Repo-wide ESLint: 0 errors, 440 existing warnings at this checkpoint.
- Local development and production route smoke checks returned HTTP 200 for all three new routes. Production preview stderr was empty. Temporary previews were stopped after verification. This is not proof of signed-in browser workflows.
- Browser verification unavailable: the computer-use inventory had no browser, and opening the in-app browser reported it unavailable. Accessibility, mobile visual layout and browser console evidence remain unverified.
- The development preview logged a missing webpack cache file. Automatic policy blocked deletion of that generated cache; production-build verification provides the build evidence. No source/cache workaround was introduced.
- Adminwright plan validation passes. Release validation exits 1 with 289 errors, and coverage exits 1 with 22 errors. Capabilities remain in-progress/unreviewed pending hosted/browser evidence. Counts are recorded in `.admin-console/worklog/p3-release-validation.log` and `p3-coverage.log`.

The test-only PGlite dependency is pinned to 0.5.8. Registry installation was blocked by network permissions, so its already-installed package from Claude's checkout was copied into this checkout's ignored `node_modules` directory. The lock entry preserves its registry version and integrity for normal installs.

## How To Test After Integration

1. Confirm the linked project is Barberar `vpszcnxsgmoavkqorjzt`, then apply the complete reconciled migration chain to the intended environment. Do not apply the older unreconciled Gemini chain over a production database.
2. Sign in as a provider owner, create a supplier and product, select a branch, and add stock with a count reason. Edit and disable/reactivate the catalog records.
3. Transfer stock to another branch and confirm total stock is conserved. Attempt a transfer exceeding available stock and confirm balances do not change.
4. Submit a purchase order; approve it as owner; receive it. Repeat receipt and confirm the server rejects it without adding stock again. Cancel another order with a reason.
5. Link a real registered staff account from Employees. Add branch access in Chain Operations. Sign in as that employee and verify allowed operations, then revoke inventory/reports permissions and verify those operations fail at the server.
6. Sign in as admin, open Supply Oversight, search/filter providers and order statuses, paginate, expand line items, and inspect stock-reduction reasons. Verify non-admin callers cannot invoke its RPC.
7. Repeat in Arabic, with a narrow viewport and keyboard navigation. Capture browser console and signed-in failure/retry evidence before marking capabilities reviewed.

## Capability Decisions

Catalog creation, editing, search via selectors, deactivation and restoration are required. Stock history is immutable; corrections use another reasoned movement. Procurement uses status commands rather than arbitrary editing of approved orders. Hard deletion, bulk stock mutations and spreadsheet inventory import/export are deferred until there is a defined workflow requiring them. Admin oversight does not expose staff personal contacts, IBANs or payment credentials.

The next release step is the deferred branch integration, followed by hosted schema/function verification and independent browser/security review. Existing high-severity admin omissions must be assessed from current source rather than erased from the manifest solely because another branch's tests pass.
