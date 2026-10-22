# Read-only held-checkout queue: local development contract

The CEO authorized this bounded continuation on 22 October 2026. It adds observation inside the regulated reconciliation domain, not financial recovery authority. Azure signup/audio remains deferred; the existing SAR10 all-in, 100,000 aggregate-character, three-round audition allowance and Saudi male/Lebanese female preferences remain recorded without reset. All production, employee activation, business permission, external business write and financial execution holds remain.

## Operator scope and entry

Direct console navigation opens `/admin/reconciliation/checkouts`. The separate route never calls `admin_reconciliation_overview`, which currently escalates old breaks on read. The parent reconciliation screen has an additional queue link; existing reconciliation controls are outside this slice. The queue itself has only list, filter, pagination, refresh and detail actions. It cannot retry a checkout, contact a provider, dispatch a refund, change flags or override terminal state.

The source is `public.payment_checkout_attempts`. An eligible record has status `submitting` or `unknown`, or `reconciliation_required = true`. Noncurrent quarantined records remain visible. Captured and failed records without that flag, and ready records, are absent. Age is elapsed time from created_at to the displayed server snapshot, not a payment deadline, breach or approved SLA. No local record proves money moved or that a provider lookup is complete.

Existing `money.ledger` holders (owner and finance) have platform-wide minimized reconciliation visibility. Both read functions require an authenticated JWT role and non-null auth.uid, then the existing checked console session/MFA/revocation and permission helper. Customer, provider, operations, analyst, anonymous and service-role callers receive no queue data. No new business role or permission is granted. Direct table grants remain revoked, including service_role.

## Exact data and API contract

Both functions return only these attempt fields: `id`, `purchase_type`, `target_id`, `amount_sar`, `currency`, `status`, `is_current`, `reconciliation_required`, `created_at`, `updated_at`, `unknown_at`. No actor/provider/charge identifiers, customer contacts, checkout URL, request bytes/hash, gateway context or raw provider status are returned. List and detail use the same eligibility and projection.

`admin_list_held_checkout_attempts(p_status text = null, p_purchase_type text = null, p_attempt_id uuid = null, p_target_id uuid = null, p_limit integer = 25, p_offset integer = 0)` returns `{items,total,as_of,limit,offset}`. Optional exact-ID filters combine with status/type using AND. Status allows submitting, unknown, captured and failed; purchase type allows booking, gift_card, package, membership, tip and subscription. Limit must be 1 through 50; offset must be 0 through 100000. Explicit null bounds and unknown filters fail. Page and total derive from one SQL statement snapshot, oldest `created_at ASC,id ASC` first. There is no cursor/snapshot lock across separate pages; refresh can change membership/order and the visible as_of explains that boundary. A partial held-record index supports the queue predicate. Offset paging retains the existing console convention and remains bounded; very large production volumes need measured query-plan review before release.

`admin_get_held_checkout_attempt(p_attempt_id uuid)` returns `{attempt,as_of}`. Null IDs fail validation. A missing or no-longer-eligible record returns attempt:null and an audited zero-row read, without differentiating a guessed reference from an excluded record.

Each function is SECURITY DEFINER with fixed empty search_path and qualified application relations/helpers. PUBLIC, anon and service-role execute privileges are revoked; only authenticated can call, with the actual console permission still checked inside. The definer boundary is necessary because the private table is not a direct Data API source. Successful list/detail/empty reads atomically write `checkout.operator.list` or `checkout.operator.detail` through `gov2_log_read`, recording actor/console role, purpose reconciliation, allowlisted field names, target IDs, filter, count and existing request metadata. Read audit failure propagates; no response data is returned. Checkout, ledger, refund, reconciliation and notification state are not mutated by the query functions.

## Interface and closure

One new page uses the existing ivory/white/gold operations components. Detail is inline on that page, not a new overlay or business action. Controls have English/Arabic copy, RTL, bidi-isolated machine references, SAR and Riyadh dates, explicit loading/empty/filtered-empty/validation/error/forbidden/missing-detail states and refresh/retry. Request generations prevent older responses replacing a newer query; failed reads never substitute fixture data. Current snapshot and detail snapshot remain separately identified.

The generic Design Architect pipeline ran into an isolated diagnostics directory and produced 41 unrelated generations with a synthesized cerulean theme. Its zero machine holes are not acceptance of this task. The architect preserved the output as rejected diagnostics and recorded the supplied bounded plan and inherited theme as authoritative. No generated broad screen set, paid renderer or new visual direction is adopted. Scope: direct sidebar/parent entry -> one queue; Apply/Reset/Previous/Next/Refresh/Retry -> audited list; Inspect/Refresh detail -> audited same-projection detail; close detail -> existing list. Shared shell destinations retain their existing routes.

## Verification and release boundary

Owner SQL regression cases are in `supabase/tests/db/held_checkout_queue.test.mjs`; independent SQL and browser tests/evidence are recorded separately. The local PGlite harness applies the complete migration chain with Supabase-shaped roles and auth claims. Browser fixture adapters belong only to test paths, and must block hosted/provider requests; they do not certify real Auth/PostgREST transport. No hosted migration, production merge/deployment or actual payment operation is authorized by test results.

The high/open `checkout-unknown-operator-recovery` gap remains open: minimized visibility does not resolve unknown provider outcomes. Provider sandbox/hosted concurrency acceptance, exact private-wire retention/privacy integration and regulated release gates remain prerequisites. Preserve evidence and do not invent a safe retry or change the approved commercial model.

## Sources consulted

- Existing durable checkout migration `20261022062147_durable_checkout_attempts.sql`, audited-read migration `20261010200000_gov2_audited_admin_reads.sql`, live-session helper migration `20261010430000_govfix_sessions_step_up_and_lows.sql` and original source/authority records.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL 15 CREATE FUNCTION](https://www.postgresql.org/docs/15/sql-createfunction.html) and [Supabase changelog](https://supabase.com/changelog.md), checked 22 October 2026. Changelog transport through web reader rejected markdown; direct official HTTPS read succeeded. No relevant API change required a new SDK or service.
- Repository-pinned Next16.3.8 server/client component and Link documentation under node_modules/next/dist/docs; existing operation components and console permission mapping.
