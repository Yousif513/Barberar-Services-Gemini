# Work package API (G69): a real developer API

Branch `wp/api`, migrations `20261006090000` to `20261006096000`. Replaces the placeholder token page with hashed, scoped,
expiring, rate-limited API keys, a read-only HTTPS API served by an Edge Function, and signed, retried, idempotent booking webhooks.

## 1. Read this first (what the owner must know)

* **Existing API tokens stop working and cannot be recovered. This is by design.** Every row of `api_tokens` is revoked and its
  `token_hash` is set to NULL by the migration, and a CHECK constraint forbids a credential from ever being written to that table
  again. They never authenticated anything (no API existed), and older builds of the old page stored the plaintext token. Nothing
  can be restored. The old webhook subscriptions (secrets chosen in the browser) are switched off and the `secret_key` column is dropped.
  `developer_profiles` rows are kept as history; clients can no longer write them (the old policy let a developer set `is_approved`
  on themselves). The approval step had no administrator screen, so it is retired: keys belong to the provider and are created by its owner.
* **Nothing works until the owner sets platform settings** (section 6). While they are unset, keys cannot be created and no webhook is queued or sent.
  There is no administrator screen for them yet: the command `admin_set_api_setting(key, value, reason)` exists and an admin-console
  screen must call it (see section 9).
* **The Edge Functions were not executed.** Deno and a hosted Supabase were not available. `public-api` and `deliver-webhooks` are
  thin, were syntax-checked with the TypeScript compiler, and every behaviour that can be tested without Deno lives in pure
  modules that were tested in Node, including the whole request pipeline running against the real migrated database.
* `deliver-webhooks` must be **scheduled** (section 8). Nothing schedules it yet.

## 2. What was built

### Database (`supabase/migrations`)

| Migration | Contents |
|---|---|
| `20261006090000_api_keys.sql` | `api_keys` (metadata only, owner/admin read through RLS), `api_key_hashes` (SHA-256 digest, **no client privilege and no policy**), `api_rate_counters` (one row per key per clock minute). Commands `create_api_key`, `revoke_api_key`, `admin_revoke_api_key` (kill switch), `admin_set_api_setting`. Service-role functions `authenticate_api_key`, `api_require_scope`, `api_setting_int`. Five `api.*` settings seeded as unset. Retirement of `api_tokens` and `developer_profiles` write access. Audit trigger on all three tables. |
| `20261006093000_webhook_endpoints.sql` | `webhook_subscriptions` reused and hardened (provider-owned, no client writes, no secret column), `webhook_subscription_secrets` (service-role only), `webhook_deliveries`. `webhook_url_rejection` (address policy). `api_booking_json` (the booking facts shared by the API and the events). AFTER triggers on `bookings` that enqueue deliveries. Owner commands `create_webhook_endpoint`, `update_webhook_endpoint`, `set_webhook_endpoint_active`, `rotate_webhook_secret`, `delete_webhook_endpoint` (soft), `retry_webhook_delivery`. Service-role state machine `webhook_delivery_settings`, `webhook_claim_deliveries`, `webhook_record_attempt`. |
| `20261006096000_api_read_functions.sql` | `api_list_services`, `api_list_employees`, `api_get_availability` (wraps the booking engine's `get_available_slots`), `api_list_bookings`, `api_assert_service_caller`. All service-role only. |

No existing function was replaced (`CREATE OR REPLACE` is used only for functions this package creates). The only objects added to existing
tables are columns on `webhook_subscriptions` and two additive AFTER triggers on `bookings` (`trg_webhook_booking_created`, `trg_webhook_booking_status`).

### Pure modules (`supabase/functions/_shared`, no Deno globals, no remote imports)

`api-contract.ts` (the contract constants), `api-errors.ts`, `api-params.ts`, `api-pagination.ts`, `api-rate-limit.ts`, `api-router.ts`
(`handleApiRequest`: the whole pipeline over an injected backend), `webhook-signature.ts`, `webhook-url.ts` (address policy and DNS-answer
classification), `webhook-delivery.ts`.

### Edge Functions

* `supabase/functions/public-api/index.ts`: adapter over `handleApiRequest`. `verify_jwt = false` in `config.toml` (a provider key is not a
  Supabase JWT); the function authenticates every request itself. **No CORS headers and no preflight handling at all.**
* `supabase/functions/deliver-webhooks/index.ts`: accepts only the service-role key or an administrator session (via `resolveCaller`, checked in the function, not by
  `verify_jwt`), re-validates each address, resolves DNS and refuses when any answer is non-public, never follows redirects, records every outcome through the database.

### Console (`web_platform/src/app/provider/developer`)

Tabs **Keys**, **Webhooks** (endpoints, per-endpoint delivery status, server-paged delivery log with retry), **API reference**, **Limits**.
It never reads a stored secret; a new key or signing secret is shown once in a dialog with copy that cannot be dismissed before the owner
confirms they stored it; revoke, pause, resume, rotate, delete and retry go through the shared command dialog with a reason; all text is
AR/EN with logical (RTL-safe) spacing; no native dialogs. `/developer` now redirects to `/provider/developer`.

## 3. Endpoint reference

Base address: `https://<project>.supabase.co/functions/v1/public-api`. `Authorization: Bearer prm_live_<64 hex>`. GET only.

| Endpoint | Scope | Parameters | Returns |
|---|---|---|---|
| `GET /v1/services` | `services:read` | `limit`, `cursor` | `id, name_en, name_ar, description_en, description_ar, category_id, price, currency, duration_minutes, is_home_service_eligible, is_active, created_at, updated_at` |
| `GET /v1/employees` | `employees:read` | `limit`, `cursor` | `id, branch_id, name_en, name_ar, title_en, title_ar, is_active, service_ids` (no phone, no email) |
| `GET /v1/availability` | `availability:read` | `service_id` (required), `date` (required, Riyadh calendar day) | per professional: `employee_id, branch_id, service_id, date, slots[{start,end}]` |
| `GET /v1/bookings` | `bookings:read` | `from` (inclusive), `to` (exclusive), `status`, `limit`, `cursor` | `id, status, scheduled_at, duration_minutes, branch_id, employee_id, service_id, service_name_en, service_name_ar, is_home_service, source, total_price, tax_amount, discount_amount, currency, created_at` |

* **Never returned**: customer id, name, phone, email, notes, addresses, payment details, staff contact details. Enforced three times: the SQL functions select only these
  fields, the router keeps only an allow-list of fields per route, and tests plant personal data in the database and search every response for it.
* **Lists**: `{ "data": [...], "pagination": { "limit", "has_more", "next_cursor" } }`, ordered by start time then id (bookings) or id. Cursors are opaque, validated, and keep
  microsecond timestamps exactly. **Page size contract: default 25, hard maximum 100; a larger `limit` is a 400, never a silent clamp.**
* **Dates**: a date without a time is a calendar day in Asia/Riyadh; a timestamp must state its offset. Amounts are SAR.
* **Errors**: always `{ "error": { "code", "message", "request_id" } }` plus `X-Request-Id`. 400 `invalid_request` (unknown, repeated or malformed parameter), 401 `unauthorized` (one message
  for missing, malformed, unknown, revoked, expired keys and for a suspended or rejected provider), 403 `forbidden` (names the missing scope), 404 `not_found`, 405 `method_not_allowed`
  (with `Allow: GET`), 429 `rate_limited` (with `Retry-After`), 500 `internal_error` (no database text ever leaves).
* **Rate limit headers** on every authenticated answer: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix seconds at the end of the clock minute).
* Order of checks: route and method (404/405), bearer shape (401, no database call), `authenticate_api_key` (401 / 429), scope (403), parameters (400), data.

### Webhooks

Events `booking.created`, `booking.confirmed`, `booking.cancelled`, `booking.completed` (a booking inserted already confirmed emits created and confirmed). Body:
`{ id, type, api_version: "v1", created_at, data: { booking: <same fields as /v1/bookings> } }`. The `id` is `md5('primora:booking-event:<booking id>:<type>')` as a UUID: stable per
booking and event type, unique per endpoint. Headers: `X-Primora-Event`, `X-Primora-Event-Id`, `X-Primora-Signature: t=<unix>,v1=<hex>` where `v1 = HMAC-SHA256(secret, "<t>.<raw body>")`
and the key is the `whsec_...` string exactly as shown once. A 2xx within 10 s is a delivery; anything else (including a redirect) is a failed attempt. Receiver snippet and the replay
window (300 s) are in `webhook-signature.ts` and on the console's reference tab; a test runs the published snippet against the real signer.

## 4. Security model

* **Key**: `prm_live_` + 32 bytes from pgcrypto's `gen_random_bytes` (`extensions.gen_random_bytes`; works in PGlite and is the Supabase location), hex-encoded: 256 bits. Returned once by
  `create_api_key`. Stored: `encode(sha256(convert_to(key,'UTF8')),'hex')` in `api_key_hashes.token_hash` (a CHECK allows only 64 hex characters, so a plaintext key cannot be stored), the first 10 characters
  and the last 4 for display. A test searches **every table** of the migrated database and the whole audit log for the plaintext, the digest and the prefix after creating and using a key.
* **Digest in its own table**, with no grant and no policy, so "no client can read a credential" does not depend on a column privilege that a later blanket `GRANT` could undo. The column is named `token_hash` so
  the audit trigger's secret rule redacts it should it ever be logged.
* **Who can do what**: provider owner creates/revokes keys and manages endpoints (anyone else, including an administrator, an employee and another provider's owner, is told "not found"; anonymous has no EXECUTE).
  An administrator can only read key metadata and revoke any key (`admin_revoke_api_key`, with a reason): a key authenticates as the provider, so administrators cannot mint one.
* **Authentication** (`authenticate_api_key`, service role only, plus an in-function check of the JWT role so a widened grant would not open it): hash lookup, uniform `28000 Invalid API key`,
  `last_used_at` moves at most once a minute, fixed one-minute rate-limit windows with the limit stored on the key (refused requests do not push the counter past the limit; old windows are removed when a new one opens).
* **Tenant isolation**: the data functions take `provider_id`, `branch_id` and scopes from the authentication result and read only that provider's rows (and that branch when the key is branch-limited). Isolation of every function is
  proven in the database tests, and again through the real router. The functions check the scope themselves as a second wall.
* **Webhook secrets** are generated by the database, shown once, kept in `webhook_subscription_secrets` (service role only), destroyed when an endpoint is deleted, replaced by `rotate_webhook_secret`. They are returned to the delivery function only by `webhook_claim_deliveries`.
  The audit log never receives a secret or an endpoint address (an address can carry a token in its query string).
* **SSRF** (the limits are stated honestly): the address must be `https`, port 443, no credentials, no IP literal in any spelling (decimal, hex, octal, short forms, IPv6), no single-label or local/reserved names. The database command enforces
  it (`webhook_url_rejection`, stricter than the TypeScript version in exotic spellings; both are driven by one vector file). The delivery function re-validates, resolves A and AAAA records and refuses when **any** answer is non-public, never follows
  redirects, never stores the endpoint's answer. **Residual risk**: `fetch` resolves the name again when it connects, so DNS rebinding is narrowed, not excluded, and where the runtime cannot resolve names only the static policy applies.
  Run the delivery function where outbound traffic to private ranges is blocked at the network.
* **Secrets at rest** are plaintext in a service-role-only table (the brief's decision). Anyone with database superuser access or a backup can read them. Supabase Vault or an application-level envelope key would reduce that and needs a key-management decision.
* **No CORS** on either function, no wildcard origin, no key in a URL (a key in the query string is simply not read).
* An enqueue failure can never break a booking (the trigger swallows and warns). A suspended or rejected provider's keys stop authenticating.

## 5. Decisions taken, defaults chosen, deviations

* Keys, prefix 10 characters + last 4, scopes (`services:read`, `employees:read`, `availability:read`, `bookings:read`), format and hash as decided. `webhooks:manage` is not a scope.
* **Digest split into `api_key_hashes`** instead of a column privilege on `api_keys` (stronger form of "never selectable").
* Key creation refuses with SQLSTATE `55000` and a clear message while `api.max_requests_per_minute` is unset. Expiry is required and must be in the future; an optional ceiling `api.max_key_lifetime_days` applies when set.
  A second active key of the same name for a provider is refused (`23505`), which makes a double submit safe without storing the plaintext.
* Revoke requires a reason of 3+ characters and is idempotent (second call changes and logs nothing).
* Retry back-off: `delay = api.webhook_retry_base_seconds * 2^(attempt-1)`, **capped at 24 hours**. Disable rule counts **consecutive failed attempts** (not events) at endpoint level; one success resets it.
  Pausing, deleting or auto-disabling an endpoint marks its waiting deliveries `skipped` (re-queueable by the owner with `retry_webhook_delivery`), so a re-enabled endpoint does not receive a stale burst.
* **No event is queued while `api.webhook_max_attempts` or `api.webhook_retry_base_seconds` is unset**, so switching delivery on later does not release a backlog. `webhook_claim_deliveries` also returns nothing in that state.
* Multi-service bookings: the payload and API show the booking's primary `service_id` and its name (`booking_services` rows are inserted after the booking row, so they are not available to the creation event).
* Availability slot length is the professional's custom duration for the service, else the service duration (buffers and processing time are the booking engine's business, not part of this read).
* The console is in the provider portal (`/provider/developer`) because it needs the signed-in owner's business; `/developer` redirects. The customer settings card that promised sandbox tokens is removed.
* My migration timestamps (`...090000` to `...096000`) sort before `20261006220000_explicit_data_api_grants.sql`, so the helper `grant_data_api_access` did not exist yet. Explicit `GRANT`s are in my migrations and
  the helper's one-time no-argument call (which runs later) covers the tables again; `data_api_grants.test.mjs` passes.

## 6. Settings the owner must set (`platform_settings`), and the effect while unset

All are seeded as JSON `null` (= unset) with `requires_owner_approval`. Set with `select admin_set_api_setting('<key>', '<n>'::jsonb, '<reason>')` (administrator; whole number 1 to 1,000,000; `null` unsets again). Audited.

| Key | Meaning | While unset |
|---|---|---|
| `api.max_requests_per_minute` | Ceiling for the per-key limit a provider can choose | **Keys cannot be created** (`55000`). Existing keys keep their stored limit. |
| `api.max_key_lifetime_days` | Optional ceiling on a key's lifetime | Any future expiry is accepted. |
| `api.webhook_max_attempts` | Delivery attempts per event | **No webhook is queued or sent.** The console says so. |
| `api.webhook_retry_base_seconds` | Base of the exponential back-off | **No webhook is queued or sent.** |
| `api.webhook_disable_after_failures` | Failed attempts in a row before an endpoint is disabled | Endpoints are never disabled automatically. |

Values are read by `api_setting_int`; a malformed value counts as unset.

## 7. Static values for the manifest's `declaredStatic[]` (the integrator registers them; I did not touch the manifest)

API contract constants (`supabase/functions/_shared/api-contract.ts`, mirrored in `web_platform/src/lib/developer-api.ts`, drift-checked by a test): page size default 25 and maximum 100; rate-limit window 60 s; signature tolerance 300 s; delivery timeout 10 s;
delivery note length 200; maximum address length 2048; port 443 only; API version `v1`; event and scope lists. Database mechanism constants: delivery lease 5 minutes; back-off cap 86,400 s; setting sanity bound 1,000,000; batch size 20 and 5 parallel sends
in `deliver-webhooks`; delivery log page 25 (console); `currency: 'SAR'` and time zone `Asia/Riyadh` in the payloads (G70 will make these configurable). The reserved-name list in the address policy (`localhost, local, internal, lan, test, example, ...`).

## 8. Deployment steps and what is deliberately not done

1. Apply the migrations; set the settings above.
2. `supabase functions deploy public-api deliver-webhooks` (the `config.toml` entry sets `verify_jwt = false` for `public-api` only).
3. **Schedule `deliver-webhooks`** with the service key, for example (needs the key kept in Vault; documentation, not a migration):
   `select cron.schedule('deliver-webhooks', '* * * * *', $$ select net.http_post(url := '<project>/functions/v1/deliver-webhooks', headers := jsonb_build_object('Authorization', 'Bearer ' || '<service key from Vault>')) $$);`
   The cadence bounds how fast a retry can happen.
4. Not built: a scheduled prune of `api_rate_counters` (bounded to one row per key per window and cleaned when the next window opens) and a **retention period for `webhook_deliveries`** (needs an owner decision); a notification to the provider when an
   endpoint is disabled automatically (the console shows it); a test-ping event; per-provider caps on keys and endpoints (not a decided business value); `HEAD` support; a customer-contact scope (separate future scope with its own consent, as decided).

## 9. Admin side (SQL only, as instructed)

* `admin_set_api_setting(text, jsonb, text)`: sets or unsets the five settings. **Needs an admin-console screen** (the existing `admin_update_platform_setting` only accepts three other keys and was not replaced).
* `admin_revoke_api_key(uuid, text)`: kill switch for any key.
* Listing: administrators can already `select` from `api_keys`, `webhook_subscriptions` and `webhook_deliveries` through their RLS policies (metadata only; no secret or digest exists in those tables).

## 10. Verification (commands run in this worktree and results)

| Command | Result |
|---|---|
| `node --test supabase/tests/db/api_keys.test.mjs` | 29 pass, 0 fail |
| `node --test supabase/tests/db/webhook_endpoints.test.mjs` | 77 pass, 0 fail |
| `node --test supabase/tests/db/api_read_functions.test.mjs` | 22 pass, 0 fail |
| `node --test supabase/tests/db/public_api_end_to_end.test.mjs` | 10 pass, 0 fail (the real router against the real migrated database) |
| `node --test web_platform/tests/api-router.test.mjs web_platform/tests/api-params-pagination.test.mjs web_platform/tests/webhook-signature.test.mjs web_platform/tests/webhook-url.test.mjs web_platform/tests/developer-console.test.mjs` (pure modules and console) | 136 pass, 0 fail |
| `node --test "supabase/tests/db/**/*.test.mjs"` (whole DB suite) | 661 pass, 0 fail |
| `node --test supabase/tests/inventory.test.mjs` | 10 pass, 0 fail |
| `npm run test --workspace=web_platform` | 458 pass, 0 fail |
| `npm run test:security-core` | passed (now also checks `public-api`, `deliver-webhooks`, the router and `config.toml`) |
| `npm run test:admin-controls` | passed |
| `npx tsc --noEmit -p web_platform` | exit 0 |
| `npx eslint` on every changed web file | exit 0, no warnings in my files (3 existing warnings remain in `customer/settings/page.tsx`, untouched code) |
| `npm run build --workspace=web_platform` | **fails only because Turbopack rejects the `node_modules` junction** ("Symlink [project]/node_modules is invalid"); the integrator builds after merging |

Tests worth knowing about: plaintext absent from every table and the audit log; the same refusal for unknown, revoked, expired, malformed keys and suspended provider; rate-limit exhaustion and reset; cross-provider isolation of every data function; cursor walk including bookings
that start at the same instant and Riyadh day boundaries; webhook events through real `create_booking`, `confirm_booking_payment`, `cancel_booking` and `employee_update_booking_status`; replay and idempotency (a replayed confirmation adds no second delivery, the unique constraint refuses a duplicate event);
the retry state machine (lease, back-off 10 s then 20 s, cap, exhaustion, replay, out-of-order report, auto-disable, resume); URL vectors run through both the SQL and the TypeScript policy.

**Could not be verified**: Deno execution of either Edge Function; real HTTPS requests, real DNS resolution and the SSRF behaviour of `fetch`; a hosted Supabase (PostgREST argument coercion of `rpc` calls was exercised with named-argument SQL in PGlite, not through PostgREST);
the console was type-checked, linted and checked by source-level tests, but **not opened in a browser** (it needs a signed-in provider owner on a Supabase backend, which is not available here); the Turbopack build.

Defects I found in my own work while testing, and fixed: `text[] || 'literal'` in the booking trigger (broke inserting a confirmed booking; caught by the existing booking tests), the console's latest offered expiry date could exceed the database's lifetime ceiling, and the first
console guard test was written against the old page.

## 11. Files touched outside this package's own files (for the integrator)

* `supabase/seed.sql`: section 14 (a plaintext-looking token and webhook secret, with invalid UUID literals and nonexistent columns, which could never have applied) replaced by a comment. Merge conflict with `claude-code`'s `set_config` line resolved by keeping both.
* `supabase/config.toml`: `[functions.public-api] verify_jwt = false`.
* `scripts/verify-security-core.mjs`: four entries added (public-api, api-router, deliver-webhooks, config.toml).
* `web_platform/src/app/provider/layout.tsx`: one nav entry ("Developer API" / "واجهة المطورين") plus its icon.
* `web_platform/src/app/customer/settings/page.tsx`: the developer card and its six strings removed.
* `web_platform/src/app/developer/page.tsx`: replaced by a redirect.
* `web_platform/tests/negative-authorization.test.mjs`: the guard that asserted the old page's client-side hashing and `is_approved: false` replaced by one asserting the old page is gone.
* New: `supabase/functions/_shared/*.ts`, `supabase/functions/public-api`, `supabase/functions/deliver-webhooks`, `supabase/tests/fixtures/webhook-url-vectors.json`, four DB test files, five test files under `web_platform/tests`, `web_platform/src/lib/developer-api.ts`, `web_platform/src/app/provider/developer/*`.

Notes: the pure-module tests live in `web_platform/tests` so `npm test` runs them without editing any `package.json` script (subdirectories there would break the unquoted glob on POSIX shells, so they are flat). Node prints a cosmetic
`MODULE_TYPELESS_PACKAGE_JSON` warning when it imports the `.ts` modules (the root `package.json` has no `"type"`); adding one would affect other packages, so it was left alone. Working copies of 58 older migrations in this worktree were CRLF from before
`.gitattributes` landed, which made `evolve_function` patches in `20261007050000` fail; they were re-checked out as LF (content unchanged).
