-- FIX-BOOKING item 5 (R24 / C-D16): "any professional" slots agree with what booking_create_internal accepts.
--
-- Defect: get_branch_available_slots(branch, service, date, windows) used the FIRST service's base_duration_minutes, checked only that one service,
-- and ignored the employee's custom duration, buffers and variants. With several services (or a professional with a custom duration) it listed
-- slots that create_booking / create_multi_service_booking then refused ("No professional is available at the selected time").
--
-- Fix: the function takes the whole service list (p_service_ids) and the variants chosen for them (p_variant_ids, positionally aligned) and, per
-- professional of the branch, asks booking_visit_profile - the same helper booking_create_internal uses to resolve "any professional" - for
-- validity (offers EVERY service, active services, variants of the right service), the real combined duration and the blocked buffer minutes. A
-- professional appears in a slot only when get_available_slots says the visit fits for that professional. The result also carries each candidate's
-- duration (candidate_duration_minutes, aligned with candidate_employee_ids) so the screen can show the effective length.
--
-- p_duration_minutes is accepted for callers written against the review's proposed signature, and ignored on purpose: a duration supplied by the client
-- can never be what the server books (durations are per professional: custom durations, variants), so listing and booking both derive it from the
-- services. Read candidate_duration_minutes instead.
--
-- Callers that pass only (branch, service, date, windows) keep working: the list defaults to that one service.
--
-- The function is now SECURITY DEFINER (like get_available_slots, which it calls) so that the visit-profile helper and the window validator
-- stay internal and anonymous visitors keep exactly one extra discovery function. It lists only professionals of verified providers, the same
-- providers booking_create_internal accepts, and returns nothing but slot times, professional ids and durations.

CREATE TEMP TABLE IF NOT EXISTS _gbas_grantees (rolname TEXT);
TRUNCATE _gbas_grantees;
INSERT INTO _gbas_grantees
SELECT DISTINCT r.rolname
FROM pg_proc p
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE p.oid = 'public.get_branch_available_slots(uuid, uuid, date, timestamptz[], timestamptz[])'::regprocedure
  AND a.privilege_type = 'EXECUTE' AND r.rolname IN ('anon', 'authenticated', 'service_role');

DROP FUNCTION public.get_branch_available_slots(uuid, uuid, date, timestamptz[], timestamptz[]);

CREATE FUNCTION public.get_branch_available_slots(
  target_branch_id uuid,
  target_service_id uuid,
  target_date date,
  prayer_window_starts timestamptz[] DEFAULT NULL,
  prayer_window_ends timestamptz[] DEFAULT NULL,
  p_service_ids uuid[] DEFAULT NULL,
  p_variant_ids uuid[] DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS TABLE (
  slot_start timestamptz,
  available_employee_count integer,
  candidate_employee_ids uuid[],
  candidate_duration_minutes integer[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_services UUID[] := COALESCE(NULLIF(p_service_ids, ARRAY[]::uuid[]), ARRAY[target_service_id]);
BEGIN
  IF array_length(v_services, 1) > 6 THEN
    RAISE EXCEPTION 'A booking can contain at most 6 services' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_services) x WHERE x IS NULL)
     OR (SELECT COUNT(DISTINCT x) FROM unnest(v_services) x) <> array_length(v_services, 1) THEN
    RAISE EXCEPTION 'Each selected service must be given once' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_prayer_windows(prayer_window_starts, prayer_window_ends);

  RETURN QUERY
  WITH eligible AS (
    SELECT e.id AS emp_id, vp.total_duration_minutes AS dur, vp.blocked_before_minutes AS blocked_before,
           vp.blocked_after_minutes AS blocked_after
    FROM public.employees e
    JOIN public.branches br ON br.id = e.branch_id
    JOIN public.providers pr ON pr.id = br.provider_id AND COALESCE(pr.is_verified, FALSE)
    CROSS JOIN LATERAL public.booking_visit_profile(e.id, v_services, p_variant_ids) vp
    WHERE e.branch_id = target_branch_id
      AND e.is_active
      AND COALESCE(br.is_active, TRUE)
      AND vp.is_valid
  ),
  emp_slots AS (
    SELECT el.emp_id, el.dur, s.slot_start AS slot
    FROM eligible el
    CROSS JOIN LATERAL public.get_available_slots(
      el.emp_id, target_date, el.dur, prayer_window_starts, prayer_window_ends, el.blocked_before, el.blocked_after
    ) s
  )
  SELECT es.slot,
         COUNT(*)::int,
         array_agg(es.emp_id ORDER BY es.emp_id),
         array_agg(es.dur ORDER BY es.emp_id)
  FROM emp_slots es
  GROUP BY es.slot
  ORDER BY es.slot;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_available_slots(uuid, uuid, date, timestamptz[], timestamptz[], uuid[], uuid[], integer) FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE
  v_role TEXT;
BEGIN
  FOR v_role IN SELECT rolname FROM _gbas_grantees LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.get_branch_available_slots(uuid, uuid, date, timestamptz[], timestamptz[], uuid[], uuid[], integer) TO %I', v_role);
  END LOOP;
END $$;
DROP TABLE _gbas_grantees;
