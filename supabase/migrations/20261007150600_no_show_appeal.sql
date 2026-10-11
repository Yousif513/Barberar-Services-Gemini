-- Migration: 20261007150600_no_show_appeal.sql
-- FIX-DBB / C-D11: a no-show strike could never be appealed or cleared. A provider could mark a no-show after the start time and three
-- marks inside 60 days force full prepayment at every provider. Now:
--  * contest_no_show(booking, reason): the customer contests their own no-show; while the contest is open the strike is paused.
--  * admin_clear_no_show(booking, reason): an administrator clears the strike (status and the money already moved are not touched; a refund of
--    the no-show fee is a ledger decision, see the report).
--  * admin_uphold_no_show_contest(booking, reason): the contest is rejected and the strike counts again.
--  * check_customer_booking_eligibility ignores contested and cleared no-shows.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_contested BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS no_show_cleared_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.no_show_contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'upheld')),
  resolution_reason TEXT,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_no_show_contests_status ON public.no_show_contests (status, created_at);
ALTER TABLE public.no_show_contests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers read their own no-show contests" ON public.no_show_contests;
CREATE POLICY "Customers read their own no-show contests" ON public.no_show_contests
  FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_admin());

CREATE OR REPLACE FUNCTION public.contest_no_show(p_booking_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking public.bookings; v_contest public.no_show_contests;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF v_booking.status <> 'no_show' THEN
    RAISE EXCEPTION 'Only a booking marked as a no-show can be contested' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_contest FROM public.no_show_contests WHERE booking_id = p_booking_id;
  IF v_contest.id IS NOT NULL THEN
    RETURN jsonb_build_object('contest_id', v_contest.id, 'status', v_contest.status, 'already_filed', TRUE);
  END IF;
  INSERT INTO public.no_show_contests (booking_id, customer_id, reason) VALUES (p_booking_id, auth.uid(), trim(p_reason))
    RETURNING * INTO v_contest;
  UPDATE public.bookings SET no_show_contested = TRUE WHERE id = p_booking_id;
  PERFORM public.write_audit_log('booking.no_show_contested', 'bookings', p_booking_id, jsonb_build_object('contest_id', v_contest.id));
  RETURN jsonb_build_object('contest_id', v_contest.id, 'status', 'open', 'already_filed', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_no_show(p_booking_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking public.bookings;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.status <> 'no_show' THEN
    RAISE EXCEPTION 'No-show booking not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF v_booking.no_show_cleared_at IS NOT NULL THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'cleared', TRUE, 'already_cleared', TRUE);
  END IF;
  UPDATE public.bookings SET no_show_cleared_at = now() WHERE id = p_booking_id;
  UPDATE public.no_show_contests SET status = 'cleared', resolution_reason = trim(p_reason), resolved_by = auth.uid(), resolved_at = now()
    WHERE booking_id = p_booking_id AND status = 'open';
  PERFORM public.write_audit_log('booking.no_show_cleared', 'bookings', p_booking_id,
    jsonb_build_object('customer_id', v_booking.customer_id, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('booking_id', p_booking_id, 'cleared', TRUE, 'already_cleared', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_uphold_no_show_contest(p_booking_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contest public.no_show_contests;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_contest FROM public.no_show_contests WHERE booking_id = p_booking_id FOR UPDATE;
  IF v_contest.id IS NULL THEN RAISE EXCEPTION 'Contest not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF v_contest.status <> 'open' THEN
    RETURN jsonb_build_object('booking_id', p_booking_id, 'status', v_contest.status, 'already_resolved', TRUE);
  END IF;
  UPDATE public.no_show_contests SET status = 'upheld', resolution_reason = trim(p_reason), resolved_by = auth.uid(), resolved_at = now()
    WHERE id = v_contest.id;
  UPDATE public.bookings SET no_show_contested = FALSE WHERE id = p_booking_id;
  PERFORM public.write_audit_log('booking.no_show_contest_upheld', 'bookings', p_booking_id,
    jsonb_build_object('contest_id', v_contest.id, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('booking_id', p_booking_id, 'status', 'upheld', 'already_resolved', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.contest_no_show(UUID, TEXT), public.admin_clear_no_show(UUID, TEXT),
  public.admin_uphold_no_show_contest(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contest_no_show(UUID, TEXT), public.admin_clear_no_show(UUID, TEXT),
  public.admin_uphold_no_show_contest(UUID, TEXT) TO authenticated, service_role;

SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
  $q$    AND no_show_at >= now() - interval '60 days';$q$,
  $q$    AND no_show_at >= now() - interval '60 days'
    AND NOT no_show_contested AND no_show_cleared_at IS NULL;$q$);

SELECT public.grant_data_api_access('public.no_show_contests');
SELECT public.attach_admin_audit_trigger('public.no_show_contests');

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
