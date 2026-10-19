# dbsec-wave2 — database and authorization fixes from the 2026-10-17 red team and E2E reports

Agent: `dbsec-wave2` (primora-postgres-security-engineer). Checkout `primora-fix`, branch `claude-code`. Nothing pushed; hosted
project untouched; no `supabase db reset`, no `next build`; servers left running. Migrations applied locally with
`npx supabase migration up --local`. The owner account `admin.owner@primora.local` was not used.

## What changed

| Item | Fix | Migration / files | Commit |
|---|---|---|---|
| RT-H1 chat integrity | Client INSERT/UPDATE/DELETE on `messages` and `conversations` revoked, write policies dropped. Three definer commands: `start_conversation` (customer only, active verified provider, never staff for their own business, console sessions refused, 20 new conversations per day), `send_message` (participant only; sender, side and time set by the server; 2000 chars; 20 per minute per sender per conversation; closed/tombstoned thread refused), `mark_conversation_read` (own side's unread flag, `read_at` only on the other side's messages). Triggers freeze message text, role, time, thread and sender, and conversation participants, for every caller including definer code (customer_id may only become NULL, which the privacy engine does). No edit command: edits are not a feature. | `20261018200000_dbsec2_chat_integrity.sql`; web customer and provider messages, shop page; mobile messages screen and shop details modal | fcaf359 |
| P-03 | Closed by RT-H1: a provider can no longer create or re-point a conversation, so it cannot manufacture the relationship `customer_has_provider_relationship` accepts. | same | fcaf359 |
| RT-M1 hold flooding | Per-customer open unpaid holds limited (setting `booking_hold_limits`, default 2 per business, 3 overall); a group booking or a series is one hold, checked once at its end; paid/confirmed bookings never count. Checked after the write under a per-customer advisory lock. The customer's own lapsed holds are released first (same rule and effects as the sweeper). Promo redemptions are consumed (`redeemed_count`) only when the booking is paid or needs no payment; a live hold reserves the use (availability = consumed + live reservations), a lapsed hold frees it without touching the count (`coupon_redemptions.counted_at`). Partial index `idx_bookings_customer_pending` (plan checked: index-only scan). | `20261018210000_dbsec2_booking_hold_limits.sql` | 84ea021 |
| RT-M2 open redirect | `safeInternalPath` resolves against a fixed placeholder origin and refuses backslash, control characters, `//`, encoded `/` or `\` at the host position (also after repeated decoding), schemes and credentials. Used by `/login?returnUrl=` and `/login/mfa?next=`. | `web_platform/src/lib/safe-redirect.mjs`, both login pages | eff9525 |
| P-05 WhatsApp squatting | Unique number only for verified channels (partial unique index). A save is refused only when another business holds the number verified. Verification refuses a number verified elsewhere and evicts (switches off) unverified claims on the number, notifying their owners; inbound routing picks the verified channel. | `20261018220000_dbsec2_whatsapp_and_code_squatting.sql` | b0f78b8 |
| RT-L1 promo-name squatting | Provider codes cannot take a reserved platform name or the `PRIMORA` prefix (setting `promo.reserved_codes`); same refusal as a taken code. | same | b0f78b8 |
| E2E: operations grant | `personal.read`, `privacy.manage`, `privacy.approve` are privileged, so granting operations (or any role adding them) waits for a different owner, like finance. Analyst still applies at once (holds no permission). | `20261018230000_dbsec2_operations_role_needs_second_owner.sql` | 33a4a2f |
| E2E: token race | The console retries `admin_session_state` on PGRST303 / expired token / network failures (250, 600, 1200, 2500 ms, re-reading the session between tries) and shows an alert with a retry button if it still fails, instead of silently hiding role-gated actions. | `web_platform/src/lib/session-state-retry.mjs`, `web_platform/src/app/admin/layout.tsx` | 33a4a2f |
| P-14 | Handled by pay-wave2 (`20261018140000_paywave2_membership_branch_scope.sql`, chain report gate kept and tested). Not changed here. | | |

## Tests added or changed

- New DB: `dbsec2_chat_integrity.test.mjs` (10), `dbsec2_booking_holds.test.mjs` (8), `dbsec2_whatsapp_squatting.test.mjs` (8).
- New web: `safe-redirect.test.mjs` (29, every bypass payload checked as the router resolves it), `dbsec2-chat-screens.test.mjs`,
  `session-state-retry.test.mjs`. New mobile: `chat-commands.test.mjs`.
- Changed where the rule legitimately changed, each with a comment: coupon tests now expect consumption at payment
  (`booking.test.mjs`, `adm1_promo_code_commands`, `fixprov_promo_codes`; `booking_engine_coupons` counts uses as live
  redemptions), `whatsapp_receptionist` (an unverified claim no longer blocks), `govfix_h2_role_grants` and
  `gov1_console_roles_mfa` (operations grant waits for a second owner), two web source checks for the redirect helper.
- Harness: `createMigratedDb` raises the hold limits for fixture suites (they book many unpaid fixtures for one seeded
  customer); `holdLimits: null` keeps the migrated defaults, which the hold suite uses. No assertion was weakened.

## Checks (2026-10-19)

- `npm run test:db` 1513/1513; `test:edge` 54/54; `test:mobile` 29/29; `test:ui-schema` 0 mismatches; web tests 857/857;
  `test:security-core` and `test:admin-controls` passed; `test:p3-compat -- HEAD` passed (210 migrations).
- `npx tsc -p web_platform` clean; `npm run lint` 0 errors (warnings only, pre-existing); `typecheck:mobile` clean.
- `deno lint supabase/functions` 50 files clean; `deno check` 21/21.
- `node scripts/smoke-local-supabase.mjs` 19/19.
- `npx supabase db lint --local --level error`: one pre-existing false positive (`privacy_purge_expired_retention` uses a
  `pg_temp` table the linter cannot see); nothing from these migrations.
- `npm run test:e2e` against :3100 (`next dev`): 155 passed, 0 failed, 7.0 minutes.

## Owner-confirmable defaults (recorded as decisions)

1. Hold limits: 2 open unpaid holds per business, 3 overall; group or series counts as one.
2. Promo codes: consumed at payment; a live unpaid hold reserves a use (no over-redemption; a code can be held up to the hold
   window by holds).
3. Chat limits: 20 new conversations per customer per day, 20 messages per minute per sender per conversation, 2000 characters;
   no message editing.
4. Reserved promo names: the starting list in `promo.reserved_codes` plus the `PRIMORA` prefix.
5. WhatsApp ownership is still confirmed by an operations admin in Meta Business Manager; automatic Graph API verification needs
   Meta credentials (a human decision).
6. Operations grants need a second owner; analyst grants apply at once.

## Not done here

- Per-IP rate limiting of booking creation at the edge (RT-M1 bullet 3): no edge layer in front of PostgREST RPCs today; the
  per-customer hold cap is the server control. Filed as a gap.
