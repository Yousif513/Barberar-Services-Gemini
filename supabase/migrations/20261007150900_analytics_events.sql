-- Migration: 20261007150900_analytics_events.sql
-- FIX-DBB / D-26: the funnel and error tracking could not produce a report because nothing was recorded. This adds the store and the writers:
--   * analytics_events(event, user_id, anon_id, props, source, created_at), readable by administrators only, no direct writes.
--   * track_analytics_event(): the INSERT-only entry for client events (anonymous or signed in). Event names are lower_snake_case; the
--     server-owned funnel names (booking_confirmed, booking_completed, booking_cancelled, booking_no_show, payment_succeeded) cannot be
--     sent by a client; props are a small object that may not carry personal keys (phone, e-mail, name, address, token, card ...);
--     at most 120 events a minute per person or anonymous id.
--   * additive AFTER triggers on bookings (status changes) and transactional_ledger (a captured payment) write the server events. A
--     failure to record an analytics row never fails the booking or the payment: it raises a WARNING instead.
--   * admin_get_event_counts(): events per day (Asia/Riyadh) with unique people, for the funnel report.
-- Consent: loading PostHog/Sentry on the client only after a consent record is a client duty (the consents table has no analytics purpose and
-- none is invented here). Nothing in this table holds a name, a phone number or an e-mail.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event VARCHAR(50) NOT NULL CHECK (event ~ '^[a-z][a-z0-9_]{1,49}$'),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anon_id VARCHAR(64),
  props JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(props) = 'object' AND octet_length(props::text) <= 4096),
  source VARCHAR(10) NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'server')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created ON public.analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON public.analytics_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_anon_created ON public.analytics_events (anon_id, created_at DESC) WHERE anon_id IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Administrators read analytics events" ON public.analytics_events;
CREATE POLICY "Administrators read analytics events" ON public.analytics_events
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.track_analytics_event(p_event TEXT, p_anon_id TEXT DEFAULT NULL, p_props JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID := auth.uid(); v_props JSONB := COALESCE(p_props, '{}'::jsonb); v_recent INT;
BEGIN
  IF p_event IS NULL OR p_event !~ '^[a-z][a-z0-9_]{1,49}$' THEN
    RAISE EXCEPTION 'Event names are lower_snake_case, 2 to 50 characters' USING ERRCODE = '22023'; END IF;
  IF p_event ~ '^(booking_(confirmed|completed|cancelled|no_show)|payment_succeeded)$' THEN
    RAISE EXCEPTION 'This event is recorded by the server only' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(v_props) <> 'object' OR octet_length(v_props::text) > 4096 THEN
    RAISE EXCEPTION 'Properties must be an object of at most 4096 bytes' USING ERRCODE = '22023'; END IF;
  IF v_props::text ~* '"[A-Za-z0-9_ -]*(phone|mobile|e-?mail|name|address|token|password|secret|iban|card|national|passport)[A-Za-z0-9_ -]*"\s*:' THEN
    RAISE EXCEPTION 'Properties must not carry personal data' USING ERRCODE = '22023'; END IF;
  IF v_user IS NULL AND (p_anon_id IS NULL OR length(p_anon_id) < 8 OR length(p_anon_id) > 64) THEN
    RAISE EXCEPTION 'An anonymous id of 8 to 64 characters is required when signed out' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_recent FROM public.analytics_events
  WHERE created_at > now() - interval '1 minute' AND source = 'client'
    AND ((v_user IS NOT NULL AND user_id = v_user) OR (v_user IS NULL AND anon_id = p_anon_id));
  IF v_recent >= 120 THEN RAISE EXCEPTION 'Too many events' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.analytics_events (event, user_id, anon_id, props, source)
  VALUES (p_event, v_user, CASE WHEN v_user IS NULL THEN p_anon_id ELSE left(p_anon_id, 64) END, v_props, 'client');
END;
$$;
REVOKE ALL ON FUNCTION public.track_analytics_event(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_analytics_event(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

-- Server events: bookings
CREATE OR REPLACE FUNCTION public.record_booking_analytics_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_event := CASE NEW.status::text WHEN 'confirmed' THEN 'booking_confirmed' WHEN 'completed' THEN 'booking_completed'
    WHEN 'cancelled' THEN 'booking_cancelled' WHEN 'no_show' THEN 'booking_no_show' ELSE NULL END;
  IF v_event IS NULL THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.analytics_events (event, user_id, props, source)
    VALUES (v_event, NEW.customer_id, jsonb_build_object('booking_id', NEW.id, 'branch_id', NEW.branch_id,
      'source', COALESCE(NEW.source, 'marketplace'), 'total_price_sar', NEW.total_price), 'server');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'analytics event % was not recorded: %', v_event, SQLERRM;  -- telemetry must never fail a booking
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_booking_analytics_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS record_booking_analytics_event ON public.bookings;
CREATE TRIGGER record_booking_analytics_event AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.record_booking_analytics_event();

-- Server events: a captured payment
CREATE OR REPLACE FUNCTION public.record_payment_analytics_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.total_captured, 0) <= 0 THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.analytics_events (event, user_id, props, source)
    VALUES ('payment_succeeded', (SELECT b.customer_id FROM public.bookings b WHERE b.id = NEW.booking_id),
      jsonb_build_object('booking_id', NEW.booking_id, 'provider_id', NEW.provider_id, 'entry_type', NEW.entry_type,
        'amount_sar', NEW.total_captured), 'server');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'analytics event payment_succeeded was not recorded: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_payment_analytics_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS record_payment_analytics_event ON public.transactional_ledger;
CREATE TRIGGER record_payment_analytics_event AFTER INSERT ON public.transactional_ledger
  FOR EACH ROW EXECUTE FUNCTION public.record_payment_analytics_event();

CREATE OR REPLACE FUNCTION public.admin_get_event_counts(p_start_date DATE, p_end_date DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date OR p_end_date - p_start_date > 366 THEN
    RAISE EXCEPTION 'A date range of at most 366 days is required' USING ERRCODE = '22023'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('day', d, 'event', event, 'source', source, 'events', n, 'people', people) ORDER BY d, event)
    FROM (
      SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date AS d, event, source, count(*) AS n,
             count(DISTINCT COALESCE(user_id::text, anon_id)) AS people
      FROM public.analytics_events
      WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date
      GROUP BY 1, 2, 3) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_event_counts(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_event_counts(DATE, DATE) TO authenticated, service_role;

SELECT public.grant_data_api_access('public.analytics_events');
SELECT public.attach_admin_audit_trigger('public.analytics_events');
