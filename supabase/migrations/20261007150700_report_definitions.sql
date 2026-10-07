-- Migration: 20261007150700_report_definitions.sql
-- FIX-DBB / C-D17: report definitions.
--  * get_provider_detailed_analytics counted first-time against repeat clients over ALL time, ignoring the range. Now, among the clients
--    with a completed visit inside the range, "first-time" = their first completed visit ever falls inside the range, "repeat" = they had
--    a completed visit before the range started.
--  * popular_services credited a multi-service booking to its first service only. Counts and revenue now come from booking_services
--    (service price as booked, before tax and discounts); a booking with no booking_services rows falls back to its own service and total.
--  * get_provider_multi_branch_summary filtered on scheduled_at::date in the session zone (UTC): a visit at 01:30 Riyadh time on the 1st
--    belonged to the previous month. It now uses the Asia/Riyadh date, like every other report.

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

-- first-time against repeat, inside the range
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$SELECT COUNT(*) FILTER (WHERE n = 1) AS first_time, COUNT(*) FILTER (WHERE n > 1) AS repeat$q$,
  $q$SELECT COUNT(*) FILTER (WHERE first_visit >= p_start_date) AS first_time, COUNT(*) FILTER (WHERE first_visit < p_start_date) AS repeat$q$);
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$SELECT b.customer_id, COUNT(*) AS n$q$,
  $q$SELECT b.customer_id, MIN((b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date) AS first_visit,
           bool_or((b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) AS visited_in_range$q$);
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$    GROUP BY b.customer_id
  ) c;$q$,
  $q$    GROUP BY b.customer_id
  ) c WHERE c.visited_in_range;$q$);

-- popular services from the lines of each booking
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$'bookings_count', COUNT(b.id),
                 'revenue_sar', COALESCE(SUM(b.total_price), 0)) AS row_json$q$,
  $q$'bookings_count', COUNT(DISTINCT li.booking_id),
                 'revenue_sar', COALESCE(SUM(li.price), 0)) AS row_json$q$);
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$        JOIN public.services s ON s.id = b.service_id$q$,
  $q$        JOIN LATERAL (
          SELECT bs.service_id, bs.booking_id, bs.price FROM public.booking_services bs WHERE bs.booking_id = b.id
          UNION ALL
          SELECT b.service_id, b.id, b.total_price WHERE NOT EXISTS (SELECT 1 FROM public.booking_services x WHERE x.booking_id = b.id)
        ) li ON TRUE
        JOIN public.services s ON s.id = li.service_id$q$);
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $q$ORDER BY COUNT(b.id) DESC LIMIT 10) t)$q$,
  $q$ORDER BY COUNT(DISTINCT li.booking_id) DESC LIMIT 10) t)$q$);

-- Riyadh dates in the multi-branch summary
SELECT pg_temp.patch_function('public.get_provider_multi_branch_summary(uuid, date, date)'::regprocedure,
  $q$AND bk.scheduled_at::date >= p_start_date$q$,
  $q$AND (bk.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date >= p_start_date$q$);
SELECT pg_temp.patch_function('public.get_provider_multi_branch_summary(uuid, date, date)'::regprocedure,
  $q$AND bk.scheduled_at::date <= p_end_date;$q$,
  $q$AND (bk.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date <= p_end_date;$q$);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
