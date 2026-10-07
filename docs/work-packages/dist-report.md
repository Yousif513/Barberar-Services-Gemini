# DIST report: G61 Google and Instagram booking integrations (deep links first)

Branch `wp/dist`, migration range `20261008600000 .. 20261008649999`. Written in stages; the newest stage is at the bottom.

## Decisions taken (from the brief) and what they mean in code

- Attribution is analytics only. It never touches a fee: `bookings.source` / `source_token_id` (FIX-BOOKING share tokens) remain the only input to fees.
  The test "never changes a fee" compares the booking row before and after `record_booking_attribution`.
- Deep links carry the provider's own share token (`provider_share_tokens`, created with `create_provider_share_token`) in `?ref=`; `src` and
  `utm_*` are analytics labels only.
- "Reserve with Google" partner feeds are NOT built: they need Google's approval and a signed partner agreement. External dependency, see the end.

## Stage 1: database (commit "dist: booking attribution table and commands")

Migration `supabase/migrations/20261008600000_distribution_booking_attribution.sql`:

- Table `booking_attribution` (booking_id PK, channel google|instagram|whatsapp|facebook|tiktok|snapchat|qr|direct|other as a CHECK, utm_source/medium/campaign
  `^[a-z0-9][a-z0-9_.-]{0,63}$`, landing_path path only without a query string, referrer_host host only, verified_by_token, captured_at). RLS on, the booking's
  customer can read their own row, there is no write policy. `grant_data_api_access` and the audit trigger are attached.
- `record_booking_attribution(p_booking_id, p_channel, p_utm_source, p_utm_medium, p_utm_campaign, p_landing_path, p_referrer_host)`: authenticated only,
  the booking's customer only (anyone else, including the provider and an administrator, gets `P0002` "Booking not found"), once per booking (a replay returns
  `already_recorded` and changes nothing), every field validated (`22023`), refused for a booking older than 24 hours. A booking made through the provider's
  QR / WhatsApp / Instagram share token gets that channel (`verified_by_token = true`) whatever the browser reported.
- `provider_bookings_by_channel(p_provider_id, p_from, p_to)`: owner, administrator, or a provider-wide delegate holding the `reports` permission
  (`can_access_provider_wide`); everybody else `P0002`. Aggregate counts only (bookings, attributed, unattributed, walk-ins, by channel with completed and lost,
  by campaign top 50). Dates are Riyadh calendar days, default last 30 days, at most 366 days. Walk-ins are counted apart because nobody "came from" a channel.
- `admin_booking_channel_counts(p_from, p_to)`: the same counts for the whole platform, administrator only. `booking_channel_counts_internal` is not callable by any
  client role.
- No audit row per attribution write or per aggregate read: neither moves money nor reveals a person (the table has no personal column, which a test pins).

Tests: `supabase/tests/db/distribution.test.mjs` (19 tests: customer-only write, once, every field validated at the command and at the table, token channel, fee
untouched, RLS, owner / delegate / admin allowed, other provider's owner / employee / delegate without reports / customers / anonymous / service role refused,
aggregate keys pinned and no personal data, UTC session with a 23:59 Riyadh booking).

## Stage 2: web (commit "dist: share kit, shop metadata and JSON-LD, attribution capture")

- `web_platform/src/lib/distribution.mjs` (pure, tested): link building (`buildShareLink` / `buildDeepLink`: `ref` share key, `src` channel, `utm_source|medium|campaign`,
  `service`, `pro`), label sanitising identical to the database pattern, `parseAttributionParams` (src, then utm_source, then referrer host; labels the database would refuse
  are dropped, the path loses its query string, the referrer is reduced to a host), `buildProviderJsonLd`, `openingHoursFromShifts`, `priceRangeFrom`, `serializeJsonLd`
  (`<`, `>`, `&`, U+2028/2029 written as unicode escapes).
- `web_platform/src/lib/attribution.ts`: `captureAttribution` (sessionStorage, per shop, at most 10 shops), `attributionRefToken`, `recordBookingAttribution` (best effort:
  the booking already exists, so a failure is logged and returned, never thrown).
- `/provider/share` (`web_platform/src/app/provider/share/page.tsx`): link builder per channel (link, QR, WhatsApp, Instagram) x service x professional x campaign, creates and
  revokes the provider's share keys (`create_provider_share_token` / `revoke_provider_share_token`, reason dialog through `CommandDialog`), copy, WhatsApp share, Web Share for
  Instagram with a copy fallback, QR rendered locally with the existing `qr-svg.mjs` (download SVG, print), and the attribution report from `provider_bookings_by_channel`
  (7 / 30 / 90 days; totals, by channel with share bar, by campaign; loading, empty, error and forbidden states; AR/EN, RTL).
- Shop layout (`web_platform/src/app/shop/[id]/layout.tsx`): metadata now has canonical, `alternates.languages` (ar-SA, en-US, x-default; the language is chosen on the page so all
  point to the same address), Open Graph with images, Twitter card, robots, and a `HealthAndBeautyBusiness` JSON-LD script with a `ReserveAction`. Secondary reads that fail are
  logged and that fact is left out; nothing is invented. A suspended or rejected shop is `noindex`.
- `web_platform/src/app/sitemap.ts`: the shop list is read page by page (the API caps a response at `max_rows = 1000`, so the old `.limit(5000)` silently stopped at 1000 shops);
  suspended and rejected shops are left out; `lastModified` uses `last_activity_at`; language alternates added. `robots.ts` already allows `/shop/*` and points at the sitemap: unchanged.

### Files touched outside this package's own files (for the integrator)

- `web_platform/src/app/shop/[id]/page.tsx` (another package owns it): +1 import, +2 lines `request_source_token: attributionRefToken(shop.id)` (single and multi-service booking:
  FIX-BOOKING's screen note says the page must forward the `?ref=` key, otherwise a share-kit link would never be provider-sourced), +1 line
  `void recordBookingAttribution(supabase, bookedBookingId, shop.id)` after the booking exists, +3 lines inside the existing loader that pick `?pro=<employee id>`. The capture itself
  lives in the layout (`attribution-capture.tsx`), not in the page. If the page owner has already changed the booking calls, keep their version and these two lines only.
- `web_platform/src/app/provider/layout.tsx`: one nav entry (`share`, both languages) and its icon.
- `web_platform/src/app/shop/[id]/layout.tsx` and `web_platform/src/app/sitemap.ts`: edited (they are the metadata files this package was asked to extend).

## Decisions and defaults

- Channel is a CHECK on text (not a Postgres enum): same set, easier to extend in a later migration. Replays of `record_booking_attribution` return `already_recorded` (first write wins)
  instead of an error, so a lost response can be retried safely.
- A booking made through the provider's QR / WhatsApp / Instagram share key is attributed to that channel (`verified_by_token`); a plain `link` key does not name a channel, the browser's report
  stands. This keeps the provider honest about where their own keys led without making any claim about fees.
- Default UTM labels per share channel: instagram -> social, whatsapp -> messaging, qr -> print, link -> referral (editable under "Advanced labels"). They are conventions, not business values.
- Attribution window: the booking must be at most 24 hours old when its source is recorded (the screen records it immediately after creating the booking).
- Aggregates are not audited (no money, no person); administrator counts are counts only (`admin_booking_channel_counts`). Walk-ins are reported separately and never count as unattributed.
- JSON-LD states: names, description, images/logo, the first active branch's public address text, city and coordinates, aggregate rating from published reviews
  (`provider_rating_summaries`), `priceRange` from active services' base prices (`SAR 50-200`, not VAT-inclusive), opening hours derived from the staff schedules (the union of the active
  professionals' shifts per weekday; this is when somebody is scheduled, not a separately declared opening time), and a `ReserveAction` whose target is the shop deep link
  `?src=google&utm_source=google&utm_medium=structured-data` (no share key, so the public page never publishes a provider key). Not stated, because the database does not hold them as public
  facts: telephone and e-mail (`contact_phone` / `contact_email` are private contact details), country (`addressCountry`).

## Verification (all run in `primora-wp-dist`)

| Command | Result |
|---|---|
| `node --test supabase/tests/db/distribution.test.mjs` | 19 / 19 pass |
| `node --test "supabase/tests/db/**/*.test.mjs"` (whole DB suite, includes data_api_grants, migration_hygiene, admin_security_matrix) | 858 tests, 858 pass, 0 fail |
| `npm run test --workspace=web_platform` | 517 tests, 517 pass (26 are `tests/distribution.test.mjs`) |
| `node scripts/verify-ui-schema.mjs` | 150 rpc calls, 215 select strings, 0 mismatches |
| `npx tsc --noEmit -p web_platform` | 0 errors |
| `npx eslint` on every changed web file (from `web_platform/`) | 0 errors; the new files add no warnings and `shop/[id]/page.tsx` keeps its 28 pre-existing warnings |
| `npm run build --workspace=web_platform` | not verifiable here: Turbopack stops with "Symlink [project]/node_modules is invalid, it points out of the filesystem root" (the worktree's `node_modules` is a junction). The integrator builds after merging. |

## Could not verify / external dependencies

- No browser or hosted Supabase here: the share-kit page, the layout's server rendering and Google's Rich Results Test were not exercised. The page's queries and rpc argument names are
  checked against the migrated schema by `verify-ui-schema`, and the pure builders (links, capture parsing, JSON-LD) by node tests, but the first real render is the integrator's check.
- "Reserve with Google" partner feeds (bookable-inventory feed, merchant and services feeds, real-time booking server) are NOT built: they require Google's approval and a signed partner
  agreement, plus a production endpoint Google can reach. Until then the `ReserveAction` JSON-LD and the Google Business Profile booking link (a share link of the `link` channel pasted into the
  profile) are the supported deep-link route. Instagram has no booking partner API in scope; the kit covers bio link, story link sticker and Web Share.
- Known limits: marketplace-internal traffic (a customer coming from PRIMORA's own search) has no channel of its own in the decided list, so it is counted under `direct`; the
  platform-wide admin counts exist as a command with tests but no admin screen yet (deferred, the brief asked for the command only); the mobile app does not capture or record attribution.
