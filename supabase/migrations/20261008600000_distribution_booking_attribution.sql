-- G61 Distribution: where do bookings come from?
--
-- Providers share their shop through links, QR codes, WhatsApp and Instagram, and the shop page is indexed by search engines. This migration adds the
-- measuring side, and only the measuring side:
--
--   * booking_attribution: one row per booking saying which channel the customer arrived through (google, instagram, whatsapp, facebook, tiktok,
--     snapchat, qr, direct, other), the short utm_source / utm_medium / utm_campaign labels of the link, the landing path (no query string) and the
--     host of the referring site. No IP address, no user agent, no full URL, no person: the table cannot identify anybody beyond the booking it hangs on.
--   * record_booking_attribution(...): written once per booking, only by the customer who made it. First write wins; a replay changes nothing.
--   * provider_bookings_by_channel(provider, from, to): aggregate counts for the owner, an administrator, or a delegate with the reports permission.
--   * admin_booking_channel_counts(from, to): the same counts across the platform for an administrator.
--
-- Attribution is analytics only. It never changes a fee: the platform fee follows bookings.source, which FIX-BOOKING derives from the provider's share
-- tokens (provider_share_tokens, request_source_token). A booking made through a share token of the QR, WhatsApp or Instagram kind gets that channel here
-- as well (verified_by_token), because the provider issued the token for that channel; every other channel is what the customer's browser reported.

CREATE TABLE IF NOT EXISTS public.booking_attribution (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  channel TEXT NOT NULL
    CHECK (channel IN ('google', 'instagram', 'whatsapp', 'facebook', 'tiktok', 'snapchat', 'qr', 'direct', 'other')),
  utm_source TEXT CHECK (utm_source IS NULL OR utm_source ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  utm_medium TEXT CHECK (utm_medium IS NULL OR utm_medium ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  utm_campaign TEXT CHECK (utm_campaign IS NULL OR utm_campaign ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  landing_path TEXT CHECK (landing_path IS NULL OR (char_length(landing_path) <= 200 AND landing_path ~ '^/[A-Za-z0-9/_.~-]*$')),
  referrer_host TEXT CHECK (referrer_host IS NULL OR (char_length(referrer_host) <= 253 AND referrer_host ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')),
  verified_by_token BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_attribution ENABLE ROW LEVEL SECURITY;

-- A customer may read the row of their own booking. Nobody else reads rows: providers and administrators see counts through the commands below.
-- There is no write policy: rows are written only by record_booking_attribution.
DROP POLICY IF EXISTS "Customers read own booking attribution" ON public.booking_attribution;
CREATE POLICY "Customers read own booking attribution"
  ON public.booking_attribution FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_attribution.booking_id AND b.customer_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 1. The customer records where the booking came from
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_booking_attribution(
  p_booking_id UUID,
  p_channel TEXT,
  p_utm_source TEXT DEFAULT NULL,
  p_utm_medium TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_landing_path TEXT DEFAULT NULL,
  p_referrer_host TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_booking public.bookings;
  v_channel TEXT := lower(btrim(coalesce(p_channel, '')));
  v_source TEXT := NULLIF(lower(btrim(coalesce(p_utm_source, ''))), '');
  v_medium TEXT := NULLIF(lower(btrim(coalesce(p_utm_medium, ''))), '');
  v_campaign TEXT := NULLIF(lower(btrim(coalesce(p_utm_campaign, ''))), '');
  v_path TEXT := NULLIF(btrim(coalesce(p_landing_path, '')), '');
  v_host TEXT := NULLIF(lower(btrim(coalesce(p_referrer_host, ''))), '');
  v_token_channel TEXT;
  v_verified BOOLEAN := FALSE;
  v_existing public.booking_attribution;
  v_inserted UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  -- Only the customer who made the booking: anyone else is told the booking does not exist.
  IF v_booking.id IS NULL OR v_booking.customer_id IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- Once per booking: a replay (a retry after a lost response) reports the stored row and changes nothing.
  SELECT * INTO v_existing FROM public.booking_attribution WHERE booking_id = p_booking_id;
  IF v_existing.booking_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'recorded', FALSE, 'already_recorded', TRUE,
                              'booking_id', v_existing.booking_id, 'channel', v_existing.channel);
  END IF;

  IF v_channel NOT IN ('google', 'instagram', 'whatsapp', 'facebook', 'tiktok', 'snapchat', 'qr', 'direct', 'other') THEN
    RAISE EXCEPTION 'The channel must be google, instagram, whatsapp, facebook, tiktok, snapchat, qr, direct or other' USING ERRCODE = '22023';
  END IF;
  IF v_source IS NOT NULL AND v_source !~ '^[a-z0-9][a-z0-9_.-]{0,63}$' THEN
    RAISE EXCEPTION 'utm_source can only contain letters, digits, dot, dash and underscore (64 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF v_medium IS NOT NULL AND v_medium !~ '^[a-z0-9][a-z0-9_.-]{0,63}$' THEN
    RAISE EXCEPTION 'utm_medium can only contain letters, digits, dot, dash and underscore (64 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF v_campaign IS NOT NULL AND v_campaign !~ '^[a-z0-9][a-z0-9_.-]{0,63}$' THEN
    RAISE EXCEPTION 'utm_campaign can only contain letters, digits, dot, dash and underscore (64 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF v_path IS NOT NULL AND (char_length(v_path) > 200 OR v_path !~ '^/[A-Za-z0-9/_.~-]*$') THEN
    RAISE EXCEPTION 'The landing path must start with / and carry no query string (200 characters at most)' USING ERRCODE = '22023';
  END IF;
  IF v_host IS NOT NULL AND (char_length(v_host) > 253 OR v_host !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$') THEN
    RAISE EXCEPTION 'The referrer must be a host name only' USING ERRCODE = '22023';
  END IF;
  IF v_booking.created_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'The booking is too old to record where it came from' USING ERRCODE = '22023';
  END IF;

  -- A share token the provider issued for the QR, WhatsApp or Instagram channel names the channel, whatever the browser reported.
  IF v_booking.source_token_id IS NOT NULL THEN
    SELECT t.source INTO v_token_channel FROM public.provider_share_tokens t WHERE t.id = v_booking.source_token_id;
    IF v_token_channel IN ('qr', 'whatsapp', 'instagram') THEN
      v_channel := v_token_channel;
      v_verified := TRUE;
    END IF;
  END IF;

  INSERT INTO public.booking_attribution (booking_id, channel, utm_source, utm_medium, utm_campaign, landing_path, referrer_host, verified_by_token)
  VALUES (p_booking_id, v_channel, v_source, v_medium, v_campaign, v_path, v_host, v_verified)
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING booking_id INTO v_inserted;

  IF v_inserted IS NULL THEN
    SELECT * INTO v_existing FROM public.booking_attribution WHERE booking_id = p_booking_id;
    RETURN jsonb_build_object('success', TRUE, 'recorded', FALSE, 'already_recorded', TRUE,
                              'booking_id', p_booking_id, 'channel', v_existing.channel);
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'recorded', TRUE, 'already_recorded', FALSE,
                            'booking_id', p_booking_id, 'channel', v_channel, 'verified_by_token', v_verified);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_booking_attribution(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_booking_attribution(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Counts by channel and campaign (no person, no booking id)
-- ---------------------------------------------------------------------------
-- Shared by the provider and the administrator command. p_provider_id NULL = the whole platform. Dates are Riyadh calendar days, both ends included,
-- and the range is capped at 366 days. Bookings the provider typed in at the counter (walk-ins) are counted apart: nobody "came from" a channel.
CREATE OR REPLACE FUNCTION public.booking_channel_counts_internal(p_provider_id UUID, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_from DATE := COALESCE(p_from, ((now() AT TIME ZONE 'Asia/Riyadh')::date - 29));
  v_to DATE := COALESCE(p_to, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF v_from > v_to THEN
    RAISE EXCEPTION 'The start date must not be after the end date' USING ERRCODE = '22023';
  END IF;
  IF v_to - v_from > 365 THEN
    RAISE EXCEPTION 'The date range can span at most 366 days' USING ERRCODE = '22023';
  END IF;
  v_start := v_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_end := (v_to + 1)::timestamp AT TIME ZONE 'Asia/Riyadh';

  WITH scoped AS (
    SELECT b.status, b.source, a.channel, a.utm_source, a.utm_medium, a.utm_campaign
      FROM public.bookings b
      JOIN public.branches br ON br.id = b.branch_id
      LEFT JOIN public.booking_attribution a ON a.booking_id = b.id
     WHERE (p_provider_id IS NULL OR br.provider_id = p_provider_id)
       AND b.created_at >= v_start AND b.created_at < v_end
  ), online AS (
    SELECT * FROM scoped WHERE source IS DISTINCT FROM 'walk_in'
  )
  SELECT jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'bookings', (SELECT COUNT(*) FROM online),
      'attributed', (SELECT COUNT(*) FROM online WHERE channel IS NOT NULL),
      'unattributed', (SELECT COUNT(*) FROM online WHERE channel IS NULL),
      'walk_ins', (SELECT COUNT(*) FROM scoped WHERE source = 'walk_in'),
      'by_channel', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('channel', c.channel, 'bookings', c.bookings, 'completed', c.completed, 'lost', c.lost)
                         ORDER BY c.bookings DESC, c.channel)
          FROM (SELECT channel,
                       COUNT(*) AS bookings,
                       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                       COUNT(*) FILTER (WHERE status IN ('cancelled', 'no_show')) AS lost
                  FROM online WHERE channel IS NOT NULL GROUP BY channel) c), '[]'::jsonb),
      'by_campaign', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('utm_source', k.utm_source, 'utm_medium', k.utm_medium, 'utm_campaign', k.utm_campaign,
                                            'bookings', k.bookings, 'completed', k.completed)
                         ORDER BY k.bookings DESC, k.utm_campaign, k.utm_source)
          FROM (SELECT utm_source, utm_medium, utm_campaign,
                       COUNT(*) AS bookings,
                       COUNT(*) FILTER (WHERE status = 'completed') AS completed
                  FROM online
                 WHERE utm_campaign IS NOT NULL OR utm_source IS NOT NULL OR utm_medium IS NOT NULL
                 GROUP BY utm_source, utm_medium, utm_campaign
                 ORDER BY COUNT(*) DESC, utm_campaign, utm_source
                 LIMIT 50) k), '[]'::jsonb))
    INTO v_result;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.booking_channel_counts_internal(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.provider_bookings_by_channel(p_provider_id UUID, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  -- The owner, an administrator, or a delegate holding the reports permission provider-wide. Everyone else is told the provider does not exist.
  IF v_owner IS NULL OR NOT (v_owner = v_user OR public.is_admin() OR public.can_access_provider_wide(p_provider_id, 'reports')) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.booking_channel_counts_internal(p_provider_id, p_from, p_to) || jsonb_build_object('provider_id', p_provider_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.provider_bookings_by_channel(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_bookings_by_channel(UUID, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_booking_channel_counts(p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN public.booking_channel_counts_internal(NULL, p_from, p_to);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_booking_channel_counts(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_booking_channel_counts(DATE, DATE) TO authenticated;

SELECT public.grant_data_api_access('public.booking_attribution');
SELECT public.attach_admin_audit_trigger('public.booking_attribution');
