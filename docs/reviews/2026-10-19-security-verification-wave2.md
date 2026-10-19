# Security verification, wave 2 (2026-10-19)

Reviewer: `sec-verify-wave2` (adminwright security, verification only). Checkout `primora-fix`, branch `claude-code`,
HEAD `4ecb13a`; baseline `0adac2a`. Independent: this agent implemented none of the code reviewed. Read-only for source,
tests and manifest; this file is the only write. No `supabase db reset`, no server stopped, `admin.owner@primora.local`
not used. Defensive format: each issue gets the fix commit, the covering negative tests, the test run result, what the
fixed server function was read to contain, and a verdict. Weaknesses are described as missing controls with a
recommended fix; no exploit steps.

Inputs: `docs/reviews/2026-10-17-redteam-whole-stack.md` (RT-*, P-*), `docs/reviews/2026-10-17-qa-release-gate.md`
(QA 1-5), `docs/reviews/2026-10-17-e2e-suite.md` (E2E defects and observations), worklogs `impl-qafix-claude.md`,
`pay-wave2.md`, `dbsec-wave2.md`.

Status: DONE, see section 8 for counts.

## 1. Test runs (this pass, 2026-10-19)

| Command | Result |
|---|---|
| `node --test supabase/tests/db/dbsec2_*.test.mjs supabase/tests/db/paywave2_*.test.mjs supabase/tests/db/qafix_console_commands.test.mjs` | 84/84 pass (21 suites) |
| `npm run test:db` (PGlite harness, every migration applied) | 1513/1513 pass, exit 0 |
| `npm run test:edge` | 54/54 pass, exit 0 |
| `npm run test:mobile` | 29/29 pass, exit 0 |
| `npm test --workspace=web_platform` | 857/857 pass, exit 0 |
| `node --test` on the web tests safe-redirect, dbsec2-chat-screens, session-state-retry, write-result, qafix-console-writes, console-errors | 80/80 pass |
| `node --test mobile_app/tests/chat-commands.test.mjs` | 2/2 pass |
| `node --test supabase/tests/request-guards.test.mjs` | 10/10 pass ("every Edge Function uses serviceKeyMatches") |

The e2e run against :3100 is in section 7.

## 2. Red team items: chat, holds, redirect

### RT-H1 (High): chat rewrite, backdating, re-pointing. Verdict: **Fixed**
- Fix: `fcaf359`, migration `20261018200000_dbsec2_chat_integrity.sql`.
- Read: `INSERT/UPDATE/DELETE/TRUNCATE` revoked on `messages` and `conversations` from `anon` and `authenticated`, and the write
  policies dropped. BEFORE triggers on both tables refuse every client-role write. They also freeze body, role, time, thread and
  sender, plus the conversation participants, for every caller including definer code (`customer_id` may only become NULL,
  which is the privacy tombstone). `start_conversation`, `send_message` and `mark_conversation_read` are `SECURITY DEFINER` with
  `SET search_path = public`. Their EXECUTE is revoked from PUBLIC and anon and granted to authenticated only. Sender, side and
  time are set on the server. A missing conversation and a foreign one get the same answer. Rate limits come from
  `platform_settings`. Helpers (`chat_participant_side`, `chat_limit`, the guard triggers) are not client-executable.
  `touch_conversation_from_message` became a definer function and already had `SET search_path = public`.
- Tests: `dbsec2_chat_integrity.test.mjs` (10), including "refuses every direct write to messages from both parties", "refuses
  every direct write to conversations, so participants never change", "freezes message text, time and participants for every
  caller, including definer code", "lets only a participant send, and never into a foreign conversation". Also
  web `dbsec2-chat-screens.test.mjs` and mobile `chat-commands.test.mjs`. All pass.
- Not applicable: aal2 and second person (customer and provider chat).

### P-03 (privacy): manufactured customer relationship. Verdict: **Fixed**
- Fix: `fcaf359` (same migration). A conversation can only be opened by the customer through `start_conversation` (active
  verified provider, staff refused for their own business, console refused). Participants are frozen, so a provider cannot
  create or re-point a thread.
- Test: `dbsec2_chat_integrity` "P-03: a provider cannot manufacture a relationship with a customer who never contacted it". Pass.

### RT-M1 (Medium): unlimited unpaid holds. Verdict: **Fixed** (the per-IP edge limit is still an open gap)
- Fix: `84ea021`, migration `20261018210000_dbsec2_booking_hold_limits.sql`.
- Read: `assert_booking_hold_capacity` is patched into `booking_create_internal` after the write. It runs under a per-customer
  `pg_advisory_xact_lock` and releases lapsed holds first. A group or a series counts as one hold, checked once at the end of
  `create_group_booking` and `create_booking_series_from_booking`. A promo redemption is consumed only on payment
  (`counted_at`), and availability counts live reservations. All helpers are definer functions with `search_path` set, and
  EXECUTE is revoked from PUBLIC, anon and authenticated.
- Tests: `dbsec2_booking_holds.test.mjs` (8): "refuses a third open hold with one business and a fourth across the
  marketplace", "cannot be bypassed by calling the internal helpers", "reserves the only redemption for a live hold without
  consuming it". Pass.
- Residual: bullet 3 of the red-team fix (per-user and per-IP rate limit at the edge) is not built; dbsec-wave2 filed it as gap `booking-create-edge-rate-limit`,
  still open. Open e-mail sign-up still lets many throwaway accounts each hold 3 slots. The cap removes the one-account case.

### RT-M2 (Medium): open redirect after sign-in and MFA. Verdict: **Fixed**
- Fix: `eff9525` (with `49ecf19`, `9c462cf` for the guard tests), `web_platform/src/lib/safe-redirect.mjs`.
- Read: `safeInternalPath` refuses non-`/` values, `//`, backslash and control characters, and an encoded `/` or `\` at the
  host position (also after repeated decoding). It resolves against a fixed placeholder origin and requires the same origin with
  no credentials. Both sinks use it: `login/page.tsx:181` (`returnUrl`) and `login/mfa/page.tsx:93` (`next`). A search of
  `web_platform/src` and `mobile_app/src` found no other query-driven redirect.
- Test: web `safe-redirect.test.mjs` (29 cases, every bypass payload checked the way the router resolves it). Pass.

## 3. Red team and QA items: money

### RT-H2 (High): provider cancels a paid membership and keeps the money. Verdict: **Fixed**
- Fix: `83a4e56` and `37f14b8` (with `d46c562` screens and `bcf03d2` hints). Migrations `20261018120000` and `20261018130000`.
- Read:
  - `cancel_membership` now queues the refund in the same transaction through `create_purchase_refund_request_internal`. That
    function is idempotent by key `mcancel:<id>`, is capped at what is captured minus refunded minus open refunds, and is executable
    by service_role only.
  - A console session is refused (`use_admin_cancel_membership`). `admin_cancel_membership` requires `is_admin`,
    `require_recent_mfa` (step-up), `operations.write` and a reason of at least 10 characters. A refund without `money.refund`, or
    above the D-Q5 thresholds, becomes a `membership_cancellation` approval decided by a different `money.refund` holder.
    `governance_approver_permission` names money.refund. The executing approval is refused when the refund grew after approval.
  - Prepaid value is earned only as delivered (`ledger_prepaid_earned_share`). It is used by `provider_available_balance`,
    `admin_release_payout` and `admin_release_ledger_item`. An open refund or dispute holds the remainder, and a refund after
    payout books a receivable.
  - `open_purchase_dispute`: buyer only, the same answer for a foreign purchase, https evidence only, one open dispute per
    purchase.
  - All new functions are `SECURITY DEFINER SET search_path = public`. Internal helpers are revoked from authenticated.
- Tests: `paywave2_prepaid.test.mjs` (14): "after the provider cancels, the refunded part is never in its balance, and money it
  was paid beyond its share is owed back", "the self-service command refuses a console session, and the console command needs
  step-up, operations.write and a reason", "operations (no money permission) only asks; a different money.refund holder's
  approval cancels and refunds". `paywave2_purchase_disputes.test.mjs` (6): "only the buyer opens it…", "while it is open the
  provider is paid nothing more from the sale". All pass.
- Residual: weakness W-1 in section 6 (a package session recorded without a booking is earned at once).

### RT-M3 (Medium): package bait and switch; suspended sellers still selling. Verdict: **Fixed**
- Fix: `fc76db1` (before the baseline, in the pay-wave2 set) and `2d1e3dd`. Migrations `20261018110000` and `20261018150000`.
- Read:
  - `user_packages` snapshots the provider, service, sessions, validity and names at purchase. A trigger freezes them for every
    writer. `confirm_purchase_payment` and `redeem_package_session` use only the snapshot.
  - `packages_freeze_sold_terms` blocks price, session, validity and service changes and deletion once any unit is sold
    (pending ones included). The FK no longer cascades.
  - The purchase and the public policies require `status = 'active' AND is_verified`. A late payment to a seller that has
    stopped selling is cancelled and refunded.
  - `provider_is_selling` was taken back from anon and authenticated (service_role only).
- Tests: `paywave2_package_terms.test.mjs` (8): "payment gives exactly the bought sessions and validity, even if the package row
  was changed behind the guard", "a suspended or unverified provider's packages are hidden and cannot be bought". Pass.

### QA 4 (High gap): unknown refund outcome re-sent. Verdict: **Fixed** in code (Tap behaviour not verifiable locally)
- Fix: `53e92be` (before the baseline, in the pay-wave2 set). Migration `20261018100000`, `check-refund-status`,
  `_shared/tap-refund-status.ts`.
- Read:
  - Status `unknown` is never claimed or retried: `admin_retry_refund_request` refuses it, and `admin_reopen_stuck_refund` sets
    unknown, not failed.
  - Unknown refunds count as open money in `create_refund_request_internal`, settlement and referral vesting.
  - `record_refund_outcome_unknown` and `apply_tap_refund_lookup` check the service_role claim and are granted only to
    service_role. The lookup re-checks the actor's `money.refund`, refuses a different charge or a Tap id already recorded on
    another request, and leaves a not-found unchanged.
  - The edge function calls `admin_begin_tap_refund_check` with the caller's own token (permission, step-up and due check)
    before using the service key. It treats two Tap refunds for one request as a conflict.
  - The decision path (`admin_request_refund_outcome_decision`) needs step-up, money.refund, a 10-character reason and the Tap
    refund id for "paid", and a different money.refund approver.
  - No break-glass, by decision.
- Tests: `paywave2_refund_unknown.test.mjs` (11), e.g. "is never claimed again, never retried by an operator…", "a refund Tap
  failed becomes retryable; a Tap refund already recorded for another request is refused", "changes nothing until a different
  money.refund holder approves". Edge: `tap-refund-status.test.mjs` in test:edge. All pass.
- Open (owner/vendor): gap `tap-refund-lookup-and-idempotency-unverified`. Tap's list endpoint, the metadata round-trip and
  whether Tap honours the idempotency key are unconfirmed without a sandbox. See W-4.

### P-13 / RT-L6 (Low): service key compared with `===`. Verdict: **Fixed**
- Fix: `d4243fe`. `send-notification` and `expire-holds` use `serviceKeyMatches`. These are the only two function files changed
  since the baseline.
- Test: `request-guards.test.mjs` "no function compares the service key with ===" / "every Edge Function uses
  serviceKeyMatches". Pass.

### P-14 (privacy): branch-scoped delegate passes with a NULL branch. Verdict: **Fixed**
- Fix: `d4243fe`, migration `20261018140000`.
- Read: `can_access_provider_wide_operation` requires the owner, or an active delegate who is an active employee with the
  permission and `branch_id IS NULL`. The `memberships`, `membership_redemptions` and `membership_plans` read policies and
  `is_membership_staff` use it. `get_provider_chain_operations` keeps its gate and was tested to roll up only the permitted
  branches. Counter staff keep the member list by owner decision (`paywave2-membership-member-list-staff`, assumed).
- Test: `paywave2_membership_scope.test.mjs` (3): "a branch-scoped delegate reads no memberships, redemptions or draft plans;
  a provider-wide one and the owner do", "the chain report rolls up only the branches a scoped delegate may read". Pass.

## 4. Console fixes, E2E findings, WhatsApp and promo names

### QA 1 (Critical): screens report success when the row policy refused. Verdict: **Fixed** (see W-3)
- Fix: `9bcd604` and `19eaacc`. Migration `20261017100000_qafix_console_catalogue_commands.sql`, `lib/write-result.mjs`,
  `lib/console-errors.mjs`.
- Read: seven commands (`admin_save_service`, `admin_set_branch_active`, `admin_set_package_active`, `admin_set_integration_state`,
  `admin_save_integration`, `admin_set_payment_method`, `admin_set_default_payment_method`).
  - All are `SECURITY DEFINER SET search_path = public`, revoked from PUBLIC and anon, granted to authenticated.
  - Each calls `console_require_permission` (`admin_can`, HINT `missing_permission`) and locks the row `FOR UPDATE`.
    `console_require_unchanged` refuses a stale write (40001).
  - The integration and payment-method commands call `require_recent_mfa` (step-up).
  - The default switch locks the whole table and is one statement per audience.
  - Client INSERT, UPDATE and DELETE on `integration_audit_log` are revoked.
  - Approvals report an already-decided request as unchanged (`19eaacc`).
- Tests: `qafix_console_commands.test.mjs` (16): "refuses the analyst, finance and a customer with the missing permission and
  changes nothing", "refuses a stale screen…", "refuse operations and finance with settings.manage, and an owner without a fresh
  code", "no browser can write the integration history any more". Web `qafix-console-writes.test.mjs`: "no console screen writes
  the catalogue, branch, package, integration or payment-method tables directly", "every other direct update or delete names the
  rows it changed and treats zero rows as a refusal". `write-result.test.mjs`. All pass.

### QA 2 (Medium): read-only roles see enabled write controls. Verdict: **Fixed**
- Fix: `9bcd604`, `9c1ff6f`. Controls follow the console role. The server refusal (QA 1) remains the real boundary.
- Tests: web `qafix-console-writes.test.mjs`. E2E `role-navigation.spec.ts` (six role tests, including "server refuses its
  read"). Pass (section 7).

### QA 3 (Medium): refused reads shown as empty lists. Verdict: **Fixed**
- Fix: `9c1ff6f`, `components/read-failure.tsx` on eight screens. Tests: web `console-errors.test.mjs` and the qafix web suites.
  Pass.

### QA 5 (accessibility; not a security control). Verdict: **Fixed** per tests
- Fix: `9bcd604`, `f860700`, `5e34964`. Test: web `qafix-accessibility.test.mjs` (in the 857). The worklog's axe evidence is
  `.admin-console/evidence/qafix/`. That evidence was not re-run in this pass.

### E2E defect 1 (Medium): revealed IBAN painted under the payout table, "Hide now" unreachable. Verdict: **Fixed**
- Fix: `95c9c66` (panel portalled above the table). The `test.fail` markers are removed: `e2e/specs` has no `test.fail` or
  `APP DEFECT` left.
- Tests: `iban-reveal.spec.ts` "Arabic on a phone: 'Hide now' can be pressed and removes the IBAN at once" and "English on a
  desktop: 'Hide now' removes the IBAN at once". Result in section 7.

### E2E defect 2 (Medium): calendar picker shows yesterday after midnight Riyadh. Verdict: **Fixed**
- Fix: `95c9c66` (`riyadhDateKey`). Test: `provider-calendar.spec.ts` "just after midnight in Riyadh the date picker shows
  today's date". Result in section 7.

### E2E defect 3 (Low, accessibility): nine screens without h1. Verdict: **Fixed**
- Fix: `95c9c66`. Test: `admin-routes.spec.ts` "every admin screen has one page heading (h1)". Result in section 7.

### E2E observation: operations grant applies on one owner's word. Verdict: **Fixed**
- Fix: `33a4a2f`, migration `20261018230000`. `console_permission_is_privileged` now includes `personal.read`, `privacy.manage`
  and `privacy.approve`, so a grant adding them needs a different owner (never break-glass). Analyst still applies at once,
  by decision `dbsec2-analyst-grant-immediate` (assumed, owner to confirm). The function is revoked from PUBLIC, anon and
  authenticated, with `search_path` set.
- Test: `govfix_h2_role_grants.test.mjs` "grants nothing privileged at once: analyst applies immediately, operations waits for a
  different owner". Pass. The e2e approval spec exercises a finance grant only.

### E2E observation: session state not retried after "JWT issued at future". Verdict: **Fixed**
- Fix: `33a4a2f`, `lib/session-state-retry.mjs`, `admin/layout.tsx`. This is a UI resilience fix. Server authorization is
  unchanged.
- Test: web `session-state-retry.test.mjs` (6), e.g. "does not retry a real refusal, and reports it", "loads the session state
  through the retry and tells the operator when it still failed". Pass.

### P-05 / RT-L1 (Low): WhatsApp number squatting. Verdict: **Fixed** (ownership proof is still a manual operations step)
- Fix: `b0f78b8`, migration `20261018220000`.
- Read:
  - The unique number constraint is now a partial index on verified rows only. `provider_save_whatsapp_channel` refuses only
    when the number is verified elsewhere.
  - `admin_set_whatsapp_channel_verified` refuses a number verified elsewhere, switches off unverified claims, notifies their
    owners and audits the eviction count.
  - Inbound routing prefers the verified channel, and unverified channels are never routed.
- Tests: `dbsec2_whatsapp_squatting.test.mjs` (8): "an unverified squat does not stop the real business from saving its
  number", "verifying the real business evicts the squatter…", "once verified, the number is refused to every other
  business…". Pass. Automatic Graph API verification is an owner decision (needs Meta credentials).

### RT-L1 (Low): platform promo-code names squatted. Verdict: **Fixed** for new codes (see W-5)
- Fix: `b0f78b8`. `promo_code_reserved_for_platform` (definer, `search_path` set, revoked from clients) is checked in
  `create_provider_promo_code`, the only provider write path (client writes on `promotional_codes` were revoked earlier). The
  refusal is the same as for a taken code.
- Tests: `dbsec2_whatsapp_squatting` "refuses reserved names and the platform prefix…", "the reserved-name check is not a client
  endpoint". Pass.

## 5. Items not in any wave-2 dispatch: Not fixed

| Id | Evidence on HEAD | Verdict |
|---|---|---|
| RT-L2 anonymous analytics limit keyed by the caller-chosen id | `track_analytics_event` last changed in `20261007150900`; no later migration touches it | **Not fixed** |
| RT-L3 `calculate-travel` spends the Maps quota with no booking link or ceiling, and returns Google's error text | function last changed in `c11f0fe`; `details: errText` still returned | **Not fixed** |
| RT-L4 push-token re-binding; `profiles.expo_push_token` readable by providers | `register_push_token` still `ON CONFLICT (token) DO UPDATE SET user_id = auth.uid()`; no grant change on the column | **Not fixed** |
| RT-L5 fixed test OTP in the shared auth config | `supabase/config.toml:53-55` unchanged | **Not fixed** (local by design; needs a release check before any `config push`) |

## 6. New weaknesses in the new server commands (defensive descriptions)

**W-1 (Medium): a package session recorded without a booking is earned and payable at once.**
`ledger_prepaid_earned_share` counts a `package_redemptions` row with `booking_id IS NULL` as delivered when it is recorded.
`redeem_package_session` lets any active employee of the provider record such a session with no customer confirmation and no
customer notification. Staff can therefore mark every remaining session as used, which makes the whole prepaid sale payable
and reopens the RT-H2 money path for packages. The dispute hold only helps a customer who notices.
Missing control: proof that the customer was present, or a notice to the customer.
Recommended fix: require customer confirmation for a booking-less session (an in-app confirm or a one-time code shown to the
customer), and notify the customer on every redemption. Until then, count booking-less sessions as earned only after a dispute
window (for example 72 hours), and cap booking-less redemptions per package per day. Tied to decision
`paywave2-prepaid-earned-as-delivered` (assumed, owner to confirm).

**W-2 (Low): the hold-limit skip depends on a session setting.**
`assert_booking_hold_capacity` returns early when `primora.hold_bundle = 'on'`. The group and series commands set it and clear
it in the same transaction. PostgREST callers cannot set it today, so this is not reachable from a client. It would become a
bypass for any future definer path or direct database role that sets the setting and then books.
Recommended fix: pass the bundle state as an explicit argument to the internal booking function instead of a setting, or check
inside the function that the setting was set by the bundle command (for example by tying it to the transaction id).

**W-3 (Low): a direct table write skips the step-up and reason that the new commands require.**
The commands for payment methods and integrations require a fresh authenticator code and a reason. The direct-write policies on
`payment_methods` (and `integrations`) still admit a `settings.manage` holder through `admin_table_write_allowed`, which checks
the permission only. A stolen owner session that passed MFA once can change these rows without step-up or reason. The row audit
trigger still records the change.
Recommended fix: revoke client INSERT, UPDATE and DELETE on `payment_methods` and `integrations` (and on services, branches and
packages for console sessions) so the commands are the only write path, as already done for providers and platform settings.

**W-4 (Low): "Check with Tap" not finding a refund can lead to a re-send.**
`lookUpUnknownRefund` reads at most 5 pages of 50 refunds and then answers not-found. Two `money.refund` holders can then record
"not refunded at Tap", which makes the refund retryable. If Tap did pay it and does not honour the idempotency key (unverified,
gap `tap-refund-lookup-and-idempotency-unverified`), the customer is refunded twice.
Recommended fix: when the page limit is reached, answer "incomplete search" instead of not-found. Require the decision to cite a
Tap dashboard search reference (charge id, time window) or a charge-level refund total from `GET /v2/charges/{id}`. Keep
`not_refunded_at_tap` blocked until the idempotency behaviour is confirmed in Tap's sandbox.

**W-5 (Low): reserved promo names apply only to new codes.**
`promo_code_reserved_for_platform` is checked only when a provider code is created. A provider code that already holds a
reserved name keeps blocking the platform campaign. Matching is a case-insensitive exact or prefix match, so look-alike
spellings are not covered.
Recommended fix: run a one-time report of existing provider codes that match the reserved list and prefix, and have operations
resolve them. Normalise codes (letters and digits only, look-alike characters folded) before the reserved check and the
uniqueness check.

**W-6 (Low): repeated purchase disputes can hold a provider's earnings without limit.**
`open_purchase_dispute` allows one open dispute per purchase, but a new one can be opened as soon as the last is resolved. There
is no time window after the purchase ends. While one is open, `ledger_prepaid_earned_share` returns 0 for the whole sale.
Recommended fix: limit purchase disputes to a window (for example 120 days after the charge or the end of the period). Allow
reopening only with new evidence and console approval, and record a dispute count per customer for operations review.

## 7. E2E run against :3100

`npm run test:e2e` (Playwright, `next dev` on http://localhost:3100, local stack, throw-away `e2e.*@primora.test` accounts
created and deleted by the suite): **155 passed, 0 failed, 0 expected failures, 6.0 minutes, exit 0**. No `test.fail`
markers remain in `e2e/specs`, so the three pinned app defects are now real passing assertions:
- `iban-reveal.spec.ts` "Arabic on a phone: 'Hide now' can be pressed and removes the IBAN at once" and "English on a desktop:
  'Hide now' removes the IBAN at once" pass (E2E defect 1). "operations (no iban.reveal) is offered no reveal control and the
  server refuses the reveal" passes.
- `provider-calendar.spec.ts` "just after midnight in Riyadh the date picker shows today's date" passes (E2E defect 2).
  "another provider's owner does not see the booking through the calendar's own query" passes.
- `admin-routes.spec.ts` "every admin screen has one page heading (h1)" passes (E2E defect 3). All 31 routes × EN/AR × 375/1440
  load with no console errors.
- `role-navigation.spec.ts` (6) and `two-person-approval.spec.ts` (2) pass (QA 2, maker-checker with step-up).

## 8. Counts

| Verdict | Count | Ids |
|---|---|---|
| Fixed | 20 | RT-H1, RT-H2, RT-M1, RT-M2, RT-M3, RT-L1, RT-L6/P-13, P-03, P-05, P-14, QA 1, QA 2, QA 3, QA 4, QA 5, E2E defects 1-3, E2E operations grant, E2E session-state retry |
| Partly fixed | 0 | (RT-M1's per-IP edge limit and QA 4's Tap sandbox confirmation are tracked residuals, gaps `booking-create-edge-rate-limit` and `tap-refund-lookup-and-idempotency-unverified`) |
| Not fixed | 4 | RT-L2, RT-L3, RT-L4, RT-L5 (none was in a wave-2 dispatch) |

New weaknesses: Medium 1 (W-1, booking-less package sessions earned at once), Low 5 (W-2 to W-6). No critical or high.

Owner items that affect these verdicts: decisions `paywave2-prepaid-earned-as-delivered`, `paywave2-membership-refund-rule`,
`dbsec2-analyst-grant-immediate`, the hold and chat limits and the reserved-name list are all `assumed`. A named human must
confirm them. This reviewer proposes nothing as accepted risk.

Status: DONE (2026-10-19). No source, test, migration or manifest file was changed; this file is the only write.
