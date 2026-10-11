# Work package AI: G60 WhatsApp AI receptionist (Arabic), v1 deterministic

Branch `wp/ai`. Migrations `20261008700000` and `20261008700100`. No language model is called anywhere; the rules engine is plain TypeScript
and the model hook is an interface only.

## What an owner gets

A customer writes to the salon's WhatsApp business number, in Arabic (Gulf dialect included) or English:
`أبغى حجز قص شعر بكرة العصر`, `مواعيد اليوم؟`, `book a haircut tomorrow`. The receptionist understands the request by rules, asks the database
for real free times (`get_branch_available_slots`, with the same prayer pauses the shop page sends), and replies with up to three options and
a link `https://<public_app_url>/shop/<provider_id>?service=<id>&date=<date>&src=whatsapp`. It never creates a booking and never takes payment.
Cancellation or reschedule requests, requests for a person, and anything it does not understand twice go to a list the provider sees in
`/provider/whatsapp`, where the provider reads the transcript, replies from the business number, and marks the conversation resolved.
The platform administrator sees counts only.

## Built

### Database (`supabase/migrations/`)
`20261008700000_whatsapp_receptionist_tables.sql`
- Tables `whatsapp_channels` (provider, Meta phone number id, display number, `enabled` default false, `ai_enabled` default false,
  `handoff_enabled` default true, `verified_at`), `whatsapp_conversations` (customer as a keyed HASH plus last 4 digits, `state` jsonb, status
  `bot | awaiting_human | closed`, `last_inbound_at`, `opted_out_at`), `whatsapp_messages` (`wa_message_id` UNIQUE, body, delivery status,
  idempotency key), and `whatsapp_contact_addresses` (the only place the plain WhatsApp id lives; no client policy; deleted on opt-out and on
  resolve). All four: RLS on, `grant_data_api_access`, `attach_admin_audit_trigger`.
- Clients can read only `whatsapp_channels` and `whatsapp_conversations`, and only through column-level grants that leave out the hash and the
  state. `whatsapp_messages` and the address table have no client privilege at all.
- `platform_settings` keys `whatsapp.message_retention_days` and `whatsapp.session_window_hours`, both seeded UNSET (JSON null) and learned by
  `admin_update_platform_setting` (patched in place; whole numbers, 1..3650 and 1..24, or null).
- `message_queue` gained `conversation_id` and `outbound_message_id`. `claim_message_batch` was patched in place with one line
  (`AND conversation_id IS NULL`) so template dispatch never claims a free-form reply.
- `whatsapp_can_handle(provider)`: owner, or provider-wide delegate with the bookings permission who is an active employee (mirrors
  `can_access_provider_wide` without its administrator clause: administrators get counts, not conversations).

`20261008700100_whatsapp_receptionist_commands.sql`
- Service role: `whatsapp_ingest_message` (idempotent on `wa_message_id`; opt-out / start words; hands to a person when the receptionist is off),
  `whatsapp_provider_context` (services, branches, 7 days of hours from `employee_day_schedule`, `public_app_url`), `whatsapp_record_turn`
  (stores state, queues the reply through `message_queue`, forces hand-off when a reply cannot be sent), `claim_whatsapp_session_batch` and
  `complete_whatsapp_session_delivery` (the dispatcher's pair; opt-out and window are re-checked at send time), `whatsapp_purge_expired_messages`.
- Provider: `provider_save_whatsapp_channel` (owner only), `provider_open_whatsapp_conversation` (AUDITED read of a transcript),
  `provider_send_whatsapp_reply` (idempotency key), `provider_resolve_whatsapp_conversation`.
- Administrator: `admin_whatsapp_overview` (counts and the numbers waiting for verification, no customer data),
  `admin_set_whatsapp_channel_verified` (reason required, audited).
- Helpers: `whatsapp_normalize_text`, `whatsapp_text_kind` (opt-out / opt-in words, whole message only), `whatsapp_setting_number`,
  `whatsapp_reply_block_reason` (one rule shared by the bot, the provider and the dispatcher), `whatsapp_enqueue_reply` (internal).

### Pure TypeScript (`supabase/functions/_shared/`, no Deno globals, no remote imports)
`whatsapp-intent.ts` (Arabic normalisation, intents, service matching, dates, time of day, all Asia/Riyadh), `whatsapp-reply.ts` (AR/EN composer),
`whatsapp-engine.ts` (slot filling, availability search, hand-off rules), `whatsapp-prayer.ts` (the shop's prayer windows, library injected),
`whatsapp-signature.ts` (HMAC-SHA256 of the raw body, constant-time compare, subscription handshake, keyed customer hash),
`whatsapp-payload.ts` (Meta payload parser), `whatsapp-context.ts`, `whatsapp-send.ts` (Cloud API request bodies),
`whatsapp-llm-adapter.ts` (interface plus a fact-preservation guard; not wired).

### Edge Functions
- `whatsapp-inbound` (new; `verify_jwt = false` registered in `supabase/config.toml`): GET handshake with `WHATSAPP_VERIFY_TOKEN`; POST verifies
  `X-Hub-Signature-256` against the raw bytes BEFORE parsing; refuses everything if `WHATSAPP_APP_SECRET` is unset; ingests, runs the engine with
  the real slot function, records the turn. Answers 500 on failure so Meta redelivers (ingest is idempotent).
- `dispatch-messages` (extended, about 40 lines): after the template loop it claims and sends receptionist replies from the provider's own
  `phone_number_id`, reports each outcome, and calls the purge command (a no-op while retention is unset). Runs every minute (existing cron job).

### Screens
- `/provider/whatsapp`: connection form (phone number id, display number, three switches), connection status
  (not connected / awaiting verification / off / waiting for first message / receiving), the reply-window notice, conversation list with the
  filter `needs a person | with the receptionist | resolved`, server pagination, a transcript dialog (audited open), manual reply, mark resolved.
- `/admin/whatsapp`: counts, the two platform settings, and numbers waiting for verification with a `CommandDialog` that requires a reason.
- Bilingual with RTL, shared components, no native dialogs, loading / empty / error states, one nav entry in each portal layout.

## Decisions and defaults I took

1. **Plain WhatsApp id.** A reply cannot be sent from a hash, so the plain id is kept in `whatsapp_contact_addresses`, a service-role-only table that
   no client can read, and is deleted when the customer opts out or the provider resolves the conversation. The hash is HMAC-SHA256 keyed with a
   secret pepper held by the Edge Function (`WHATSAPP_CONTACT_PEPPER`), so it cannot be reversed by hashing a list of numbers. Never change the pepper
   after go-live: every customer would become a new conversation.
2. **Number ownership.** A provider types its Meta phone number id, but nothing proves it is theirs, and routing by that id would let a provider
   claim a competitor's number. So `verified_at` is set by an administrator (`admin_set_whatsapp_channel_verified`, reason required) and nothing is
   routed to an unverified channel. This is the one thing in "Admin: counts only" that is not a count.
3. **Window UNSET = no free-form reply.** The conversation is stored, the engine still runs, nothing is queued, and the conversation goes to a
   person with reason `window_unset` (when hand-off is on). Same when the channel is off or the customer unsubscribed.
4. **Retention UNSET = bodies stored, purge does nothing** (returns `{purged: 0, reason: "retention_unset"}`). When set, the purge blanks bodies
   (rows and metadata stay) and spares a reply still waiting to be sent. Message text never enters `message_queue`, `message_log` or the audit log.
5. **Opt-out is silent.** STOP / إيقاف / الغاء الاشتراك (whole message only, after normalisation) set `opted_out_at`, erase the stored number and
   close the conversation. The bot sends nothing afterwards, not even an acknowledgement, until the customer writes START / ابدأ / اشتراك. See
   "Questions for the owner".
6. **Hand-off off** keeps the conversation with the receptionist; the database enforces it (`whatsapp_record_turn` downgrades `awaiting_human`).
   While a conversation is `awaiting_human` the receptionist stays silent; a manual reply also puts it there.
7. **Interpretation windows.** "العصر" = 15:00-17:30, "بعد العصر" = 16:00-19:00, "مساء" = 17:00-22:00, and so on (`BANDS` in `whatsapp-intent.ts`).
   They only shape which of the real free times are shown first; they are not business rules. A bare hour 7-11 without am/pm keeps both readings.
8. **"next Friday"** (`الجمعة الجاية`) means the Friday of the following Sunday-based week; plain `الجمعة` is the coming one. The reply always names the
   resolved date so the customer can correct it.
9. **Search horizon:** if the requested day is full, the next 7 days are searched and the nearest day with times is offered, saying so.
   Past start times are never offered. No minimum-notice rule is invented; the database's own rules apply when the customer books on the site.
10. **Reply length / state:** a reply is at most 1500 characters, the slot-filling state at most 4000 and is forgotten after 120 minutes.
11. **Prices** are `services.base_price` with the sentence "base price, may differ by professional". Hours come from `employee_day_schedule` (seasons and
    second shifts included). Addresses and map links come from the branch row. Missing data produces "a person will answer" and a hand-off.
12. **No public_app_url** (UNSET today): options are listed without a link, the reply says a person will follow up, and the conversation is handed over
    with reason `no_booking_link`.
13. The "opt-out" wording is checked in both SQL (authoritative) and TypeScript.

## Commands run and results (worktree `primora-wp-ai`)

| Command | Result |
|---|---|
| `node --test "supabase/tests/db/**/*.test.mjs"` | 921 tests, 921 pass, 0 fail (the whole suite, including the catalog tests: admin matrix, Data API grants, migration hygiene, audit and search-path invariants) |
| `node --test supabase/tests/db/whatsapp_receptionist.test.mjs` | 48 tests, 48 pass (every role, idempotency, opt-out, window, hand-off, RLS, hash, audit, queue hand-over, end to end on the real schema) |
| `npm run test --workspace=web_platform` | 654 tests, 654 pass (includes `whatsapp-intent` 88, `whatsapp-receptionist` 54, `whatsapp-screens` 8) |
| `node scripts/verify-ui-schema.mjs` | 159 rpc calls, 216 select strings, 0 mismatches (my two page queries and four RPCs are among them) |
| `npx tsc --noEmit -p web_platform` | clean |
| strict `tsc` over `supabase/functions/_shared/whatsapp-*.ts` (`--strict --lib es2022,dom`) | clean |
| `npx eslint` on every changed page, layout, lib and test | 0 errors, 0 warnings |
| `npm run test:security-core`, `npm run test:admin-controls`, `npm run typecheck:mobile` | pass |
| `npm run build --workspace=web_platform` | FAILS only because of the worktree: Turbopack reports `Symlink [project]/node_modules is invalid, it points out of the filesystem root` (the node_modules junction). Not a code error; the integrator builds after merging. |

The corpus in `web_platform/tests/whatsapp-intent.test.mjs` has 50 utterances (Arabic, Gulf dialect, English) with expected intent, service and date,
plus targeted tests of normalisation, date, time and service matching. Signature vectors: RFC 4231 cases 1 and 2, an independent `node:crypto`
HMAC over Arabic JSON bytes, tampering, wrong secret, missing secret or header, malformed headers.

## NOT verified (stated plainly)

- **Meta delivery.** No call was made to the WhatsApp Cloud API. Request bodies follow Meta's documented shape (`whatsapp-send.ts`) but real
  delivery, the 24-hour window behaviour on Meta's side and message ids are unproven.
- **Signature against a real Meta payload.** Verified against RFC vectors and an independent HMAC, not against a payload Meta signed.
- **Deno.** `whatsapp-inbound/index.ts` and the edited `dispatch-messages/index.ts` were never run in Deno. In particular the
  `https://esm.sh/adhan@4.4.4` import is unverified there (the same package at `^4.4.4` powers the shop page, and the pure wrapper is tested
  against it in Node). Everything with logic is in the pure modules, which are tested.
- **Browser.** The two screens were type-checked, linted, schema-checked and guard-tested but not rendered: the build is blocked by the junction,
  and the hosted Supabase is unreachable. No visual check of RTL layout was done.
- Real concurrency (two webhook deliveries of one message at the same instant) is covered by unique constraints and `FOR UPDATE` but was not
  exercised in parallel.

## Deployment checklist (owner)

1. Secrets: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_CONTACT_PEPPER` (new); `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
   already required by `dispatch-messages` (the early 503 there still needs both; the platform token must be allowed to send from each salon's number).
2. Deploy `whatsapp-inbound` (config.toml already sets `verify_jwt = false`), subscribe the Meta app webhook to `messages`.
3. Console: set `public_app_url`, `whatsapp.session_window_hours` (24 is Meta's limit) and, if wanted, `whatsapp.message_retention_days`.
4. Each salon enters its phone number id in `/provider/whatsapp`; an administrator verifies it in `/admin/whatsapp`.

## Questions for the owner

- Should STOP be acknowledged once ("you are unsubscribed")? The brief says the bot never messages an opted-out conversation, so v1 is silent.
- The shop reads `?source=whatsapp` for attribution and ignores `?date=`; the link the brief fixes uses `src=whatsapp&date=`. Until the shop accepts
  `src` (one line) bookings from this link are attributed as "search". I did not touch the shop page.
- Free-form replies are only allowed inside the window; outside it a Meta-approved template would be needed (none exists for this).
- Legal basis and consent wording for storing a customer's WhatsApp message text (PDPL) is not decided here; retention is the control provided.

## Files touched outside this package's own files

- `supabase/functions/dispatch-messages/index.ts` (about 40 lines added after the template loop; the template path is unchanged)
- `supabase/config.toml` (one `[functions.whatsapp-inbound]` stanza)
- `web_platform/src/app/provider/layout.tsx` and `web_platform/src/app/admin/layout.tsx` (one nav entry and one label pair each)
- Existing database objects patched in place by migration: `admin_update_platform_setting` (two `ELSIF` branches before `public_app_url`),
  `claim_message_batch` (one `AND conversation_id IS NULL`), `message_queue` (two nullable columns).

New files: the two migrations; `supabase/tests/db/whatsapp_receptionist.test.mjs`; `supabase/functions/whatsapp-inbound/index.ts`; the nine
`supabase/functions/_shared/whatsapp-*.ts` modules; `web_platform/src/lib/whatsapp-receptionist.ts`; the two pages under
`web_platform/src/app/{provider,admin}/whatsapp/`; `web_platform/tests/whatsapp-{intent,receptionist,screens}.test.mjs`; this report.

## Not built (by design)

LLM paraphrase (interface and fact guard only), taking a booking or payment in chat, template (marketing) messages, voice or media understanding
(a non-text message gets the fallback and, twice in a row, a hand-off), multi-number channels per provider (one channel per provider), a
`/provider/whatsapp` entry for employees (the nav shows the owner menu; delegates reach it by URL).
