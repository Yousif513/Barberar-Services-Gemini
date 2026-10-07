-- FIX-PROV D-28 / R27 / D-09: the provider dashboard reads server-side figures and a setup checklist derived from rows.
--
-- Before, the page pulled every booking of the business into the browser (the Data API stops at 1,000 rows, so the totals were
-- wrong for any busy shop), counted "walk-ins" as bookings that were not home visits, divided by an invented eight appointments per
-- professional for "occupancy", ticked hours, a policy and three services by default, and kept "link shared" in memory only.
--
--   get_provider_dashboard_summary(provider)   one jsonb of aggregates for the owner (or a delegate holding the reports permission)
--   record_share_kit_use(provider)             the owner copied or shared the booking link: remembered once, on the server
--
-- Occupancy is today's booked minutes over today's scheduled working minutes (second shifts included, overnight shifts counted past
-- midnight, professionals on approved leave left out) in Riyadh time; it is null when nobody is scheduled today.

-- policy_confirmed_at is stamped by set_provider_booking_policy (FIX-DBA); the column is added idempotently so this migration stands alone.
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS policy_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS share_kit_used_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_provider_dashboard_summary(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_dow INT := EXTRACT(DOW FROM (now() AT TIME ZONE 'Asia/Riyadh'))::int;
  v_day_start TIMESTAMPTZ := ((now() AT TIME ZONE 'Asia/Riyadh')::date)::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_bookings JSONB;
  v_staff JSONB;
  v_ratings JSONB;
  v_scheduled NUMERIC;
  v_booked NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;
  IF v_provider.id IS NULL OR NOT (v_provider.owner_id = v_uid OR public.is_admin() OR public.can_access_provider_wide(p_provider_id, 'reports')) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
      'bookings', COUNT(*),
      'customers', COUNT(DISTINCT b.customer_id),
      'completed', COUNT(*) FILTER (WHERE b.status = 'completed'),
      'revenue', COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0),
      'walk_ins', COUNT(*) FILTER (WHERE b.source = 'walk_in'),
      'open_workload', COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'pending_payment') AND b.scheduled_at >= now()))
    INTO v_bookings
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
   WHERE br.provider_id = p_provider_id;

  SELECT jsonb_build_object(
      'total', COUNT(*),
      'active', COUNT(*) FILTER (WHERE e.is_active),
      'with_hours', COUNT(*) FILTER (WHERE e.is_active AND EXISTS (
          SELECT 1 FROM public.employee_availability a WHERE a.employee_id = e.id AND a.is_working_day)))
    INTO v_staff
    FROM public.employees e
    JOIN public.branches br ON br.id = e.branch_id
   WHERE br.provider_id = p_provider_id;

  SELECT jsonb_build_object('average', COALESCE(AVG(r.rating), 0), 'count', COUNT(*))
    INTO v_ratings
    FROM public.reviews r
   WHERE r.provider_id = p_provider_id;

  -- Working minutes scheduled today: first shift plus second shift; a shift that ends before it starts runs past midnight.
  SELECT COALESCE(SUM(
           (CASE WHEN a.end_time > a.start_time THEN EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60
                 ELSE EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60 + 1440 END)
         + (CASE WHEN COALESCE(a.has_second_shift, FALSE) AND a.second_start_time IS NOT NULL AND a.second_end_time IS NOT NULL THEN
                   (CASE WHEN a.second_end_time > a.second_start_time THEN EXTRACT(EPOCH FROM (a.second_end_time - a.second_start_time)) / 60
                         ELSE EXTRACT(EPOCH FROM (a.second_end_time - a.second_start_time)) / 60 + 1440 END)
                 ELSE 0 END)), 0)
    INTO v_scheduled
    FROM public.employee_availability a
    JOIN public.employees e ON e.id = a.employee_id AND e.is_active
    JOIN public.branches br ON br.id = e.branch_id
   WHERE br.provider_id = p_provider_id
     AND a.day_of_week = v_dow
     AND a.is_working_day
     AND NOT EXISTS (
       SELECT 1 FROM public.employee_time_off o
        WHERE o.employee_id = e.id AND o.status = 'approved' AND v_today BETWEEN o.start_date AND o.end_date)
     AND NOT EXISTS (
       SELECT 1 FROM public.provider_closures c
        WHERE c.provider_id = p_provider_id AND (c.branch_id IS NULL OR c.branch_id = e.branch_id)
          AND v_today BETWEEN c.start_date AND c.end_date);

  SELECT COALESCE(SUM(b.duration_minutes), 0)
    INTO v_booked
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
   WHERE br.provider_id = p_provider_id
     AND b.status IN ('confirmed', 'pending_payment', 'completed')
     AND b.scheduled_at >= v_day_start AND b.scheduled_at < v_day_start + interval '1 day';

  RETURN jsonb_build_object(
    'provider_id', p_provider_id,
    'bookings', v_bookings,
    'staff', v_staff,
    'ratings', v_ratings,
    'services_count', (SELECT COUNT(*) FROM public.services s WHERE s.provider_id = p_provider_id AND s.is_active),
    'branches_count', (SELECT COUNT(*) FROM public.branches br WHERE br.provider_id = p_provider_id),
    'today_scheduled_minutes', v_scheduled,
    'today_booked_minutes', v_booked,
    'occupancy_percent', CASE WHEN v_scheduled > 0 THEN LEAST(100, ROUND(v_booked / v_scheduled * 100, 1)) ELSE NULL END,
    'policy_confirmed_at', v_provider.policy_confirmed_at,
    'share_kit_used_at', v_provider.share_kit_used_at);
END;
$$;
REVOKE ALL ON FUNCTION public.get_provider_dashboard_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_dashboard_summary(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_share_kit_use(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  IF v_provider.id IS NULL OR v_provider.owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_provider.share_kit_used_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'recorded', FALSE, 'share_kit_used_at', v_provider.share_kit_used_at);
  END IF;
  UPDATE public.providers SET share_kit_used_at = now() WHERE id = p_provider_id RETURNING share_kit_used_at INTO v_provider.share_kit_used_at;
  PERFORM public.write_audit_log('provider.share_kit_used', 'providers', p_provider_id, '{}'::jsonb);
  RETURN jsonb_build_object('success', TRUE, 'recorded', TRUE, 'share_kit_used_at', v_provider.share_kit_used_at);
END;
$$;
REVOKE ALL ON FUNCTION public.record_share_kit_use(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_share_kit_use(UUID) TO authenticated;
