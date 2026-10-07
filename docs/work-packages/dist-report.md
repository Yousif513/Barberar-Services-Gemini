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
