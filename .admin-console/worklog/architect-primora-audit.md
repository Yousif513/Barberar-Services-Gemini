# worklog architect-primora-audit
role: architect
mode: audit    profile: regulated
started: 2026-09-04    ended: 2026-09-04
repo state: branch `codex` @ 734fcd9, read-only. No feature code, migration or test was changed.

claims-held: none
claims-released: none (no capability claim was taken; an audit pass models, it does not build)

## did
- manifest created from nothing at `.admin-console/manifest.json` — 15 entities, 52 capabilities
  (all `status: discovered`), 21 screens, 3 integrations, 5 work queues, 4 roles, 30 gaps,
  8 decisions, 5 feedback entries.
- every capability's `rationale` carries the audit verdict for that surface — REAL /
  PARTIALLY REAL / DECORATIVE / MISSING / BROKEN — with the `path:line` that proves it.
- `AGENTS.md` extended with an "Admin console delivery rules" section (existing content
  preserved; the repo forbids full-file overwrites).

## verified
- `validate --manifest .admin-console/manifest.json --phase plan` — exit 0, 27 warnings, all of
  which are the audit finding rather than a modeling error (8 screens expose no capability
  because they are decorative; 3 roles are unused by the console because it serves admins only;
  several lifecycle states are unreachable because the commands that would reach them do not exist).
- No middleware, no route handler, no `"use server"` anywhere in `web_platform` — confirmed by
  exhaustive search, not assumed. RLS is the only authorization boundary.
- `booking_status` enum never contains `'refunded'` — confirmed across all 24 migrations.

## decided
- `profile-regulated` — regulated profile: ZATCA tax records, IBANs, PII, live money. assumed
- `authz-is-rls-only` — RLS is the sole authorization boundary; AuthGuard is a render gate. confirmed
- `rls-is-sound` — the RLS layer is the strongest part of the system; the defects sit above it. confirmed
- `migration-application-unverified` — applied-migration state was never observed. assumed
- `real-vs-decorative-criterion` — a screen that reports success on a failed write is classified
  with the decorative ones, because an operator cannot tell the difference. confirmed
- `build-order` — spine (money + audit + honesty) serialized, then truth, then fan-out,
  role-split last. confirmed
- `design-architect-not-used` — affordance graph closed by hand instead. confirmed

## found — 30 gaps, 9 critical
- `refund-function-unauthenticated` critical — process-refund has no auth, no role check,
  service-role key, live Tap API, CORS `*`.
- `refund-writes-nonexistent-enum-value` critical — every refund path writes an enum value that
  cannot exist; in process-refund the failure lands *after* the money has moved.
- `send-notification-unauthenticated` critical — arbitrary push to any userId by any caller.
- `payout-money-mutation-in-browser` critical — non-atomic three-step money write from React;
  the correctly guarded server version exists and is never called.
- `no-audit-trail` critical — 3 of ~30 state-changing commands write an audit row.
- `audit-surface-misrepresented` critical — three "audit log" routes redirect to a booking feed.
- `fabricated-vat-figures` critical — invented ZATCA totals shown on a zero-row result.
- `decorative-tax-and-settings-screens` critical — VAT rate save is a no-op with a success toast.
- `no-customer-data-rights-path` critical — no export, erasure or legal hold exists.
- plus 8 high, 9 medium, 4 low. Full list with `path:line` evidence in `gaps[]`.

## next
The next agent is an **implementer** building the spine, **serialized — no fan-out until it is
green**. Its single first action: harden `supabase/functions/process-refund/index.ts` by copying
the four-step admin check from `supabase/functions/process-payout/index.ts:22-54` (read
Authorization header, `auth.getUser(token)`, load `profiles.role`, 403 unless `admin`), narrow
`Access-Control-Allow-Origin` off `*`, and in the same change add `'refunded'` to the
`booking_status` enum in a new migration so the write at line 92 can succeed. Do the same auth
hardening to `send-notification` in the same slice. Then, still serialized: `admin_audit_log`
table with append-only RLS; replace `ledger/page.tsx:598-667` with
`functions.invoke('process-payout')`; delete the catch-and-succeed branches at
`provider-management.tsx:1005, 1063, 1084`; make the dev bypass opt-in at `dev-access.ts:11,26`.

## blocked-on
- **Live database unreachable.** The Supabase MCP server is unauthenticated and this session is
  non-interactive, so no applied-migration state, row count or policy list was ever observed.
  Everything in this audit is read from source. The highest-stakes consequence: if
  `20260615182811_harden_auth_and_booking_core.sql` is **not** applied, its `DROP POLICY` at
  line 57 has not run and `"Public read on profiles" USING (true)` from
  `20260613010000_triggers_rls.sql:44` is still live — every customer name, email and phone
  number readable by any anonymous visitor. **Confirm this first**, with
  `supabase migration list --linked` or `select policyname, qual from pg_policies where
  tablename='profiles';`
- Human decisions still needed: whether admins may see unmasked provider IBANs; the monetary
  threshold above which a payout needs a second approver; ZATCA retention horizon for
  bookings and ledger rows; whether support may impersonate a customer.
