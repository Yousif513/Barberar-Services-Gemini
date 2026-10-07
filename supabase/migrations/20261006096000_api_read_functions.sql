-- Migration: 20261006096000_api_read_functions.sql
-- G69 "Real developer API", part 3: the data functions behind the public read API.
--
-- The Edge Function public-api authenticates a key with authenticate_api_key and then calls one of these functions
-- with the provider, branch and scopes that call returned. Every function:
--   * runs only for the service role (grant plus an in-function check on the JWT role);
--   * requires its scope (api_require_scope) and answers 42501 without it;
--   * reads rows of the given provider only, and of the given branch when the key is narrowed to one;
--   * returns a JSON array of documented fields: no customer name, phone, email, notes, address or payment detail.
-- Lists are keyset-paginated (the caller asks for one more row than it shows) so a page never skips or repeats a row.
-- The function names, argument names and fields are mirrored in supabase/functions/_shared/api-router.ts.

CREATE OR REPLACE FUNCTION public.api_assert_service_caller(p_provider_id UUID, p_branch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_provider_id IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.api_assert_service_caller(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_assert_service_caller(UUID, UUID) TO service_role;

-- Services of the provider. A key narrowed to a branch sees the services that branch's active staff perform.
CREATE OR REPLACE FUNCTION public.api_list_services(
  p_provider_id UUID, p_branch_id UUID, p_scopes TEXT[], p_after_id UUID, p_limit INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 26), 1), 101);
  v_result JSONB;
BEGIN
  PERFORM public.api_assert_service_caller(p_provider_id, p_branch_id);
  PERFORM public.api_require_scope(p_scopes, 'services:read');
  SELECT COALESCE(jsonb_agg(row_json ORDER BY id), '[]'::jsonb) INTO v_result
    FROM (
      SELECT s.id, jsonb_build_object(
               'id', s.id, 'name_en', s.name_en, 'name_ar', s.name_ar,
               'description_en', s.description_en, 'description_ar', s.description_ar,
               'category_id', s.category_id, 'price', s.base_price, 'currency', 'SAR',
               'duration_minutes', s.base_duration_minutes, 'is_home_service_eligible', COALESCE(s.is_home_service_eligible, FALSE),
               'is_active', COALESCE(s.is_active, FALSE), 'created_at', s.created_at, 'updated_at', s.updated_at) AS row_json
        FROM public.services s
       WHERE s.provider_id = p_provider_id
         AND (p_after_id IS NULL OR s.id > p_after_id)
         AND (p_branch_id IS NULL OR EXISTS (
               SELECT 1 FROM public.employee_services es JOIN public.employees e ON e.id = es.employee_id
                WHERE es.service_id = s.id AND e.branch_id = p_branch_id AND e.is_active))
       ORDER BY s.id
       LIMIT v_limit
    ) page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.api_list_services(UUID, UUID, TEXT[], UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_list_services(UUID, UUID, TEXT[], UUID, INTEGER) TO service_role;

-- Staff of the provider's branches. Contact details (phone, email) are not part of the API.
CREATE OR REPLACE FUNCTION public.api_list_employees(
  p_provider_id UUID, p_branch_id UUID, p_scopes TEXT[], p_after_id UUID, p_limit INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 26), 1), 101);
  v_result JSONB;
BEGIN
  PERFORM public.api_assert_service_caller(p_provider_id, p_branch_id);
  PERFORM public.api_require_scope(p_scopes, 'employees:read');
  SELECT COALESCE(jsonb_agg(row_json ORDER BY id), '[]'::jsonb) INTO v_result
    FROM (
      SELECT e.id, jsonb_build_object(
               'id', e.id, 'branch_id', e.branch_id, 'name_en', e.name_en, 'name_ar', e.name_ar,
               'title_en', e.title_en, 'title_ar', e.title_ar, 'is_active', COALESCE(e.is_active, FALSE),
               'service_ids', COALESCE((SELECT jsonb_agg(es.service_id ORDER BY es.service_id) FROM public.employee_services es
                                         JOIN public.services s ON s.id = es.service_id AND s.provider_id = p_provider_id
                                        WHERE es.employee_id = e.id), '[]'::jsonb)) AS row_json
        FROM public.employees e
        JOIN public.branches b ON b.id = e.branch_id
       WHERE b.provider_id = p_provider_id
         AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
         AND (p_after_id IS NULL OR e.id > p_after_id)
       ORDER BY e.id
       LIMIT v_limit
    ) page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.api_list_employees(UUID, UUID, TEXT[], UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_list_employees(UUID, UUID, TEXT[], UUID, INTEGER) TO service_role;

-- Open start times of a service on one calendar day (Asia/Riyadh), per professional who performs it. It asks the
-- booking engine's own get_available_slots, so what the API offers is what a booking would accept. A slot lasts the
-- professional's duration for the service (their custom duration, else the service's).
CREATE OR REPLACE FUNCTION public.api_get_availability(
  p_provider_id UUID, p_branch_id UUID, p_scopes TEXT[], p_service_id UUID, p_date DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration INTEGER;
  v_result JSONB;
BEGIN
  PERFORM public.api_assert_service_caller(p_provider_id, p_branch_id);
  PERFORM public.api_require_scope(p_scopes, 'availability:read');
  IF p_service_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'A service and a date are required' USING ERRCODE = '22023';
  END IF;
  SELECT s.base_duration_minutes INTO v_duration FROM public.services s WHERE s.id = p_service_id AND s.provider_id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY employee_id), '[]'::jsonb) INTO v_result
    FROM (
      SELECT e.id AS employee_id,
             jsonb_build_object(
               'employee_id', e.id, 'branch_id', e.branch_id, 'service_id', p_service_id, 'date', p_date,
               'slots', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'start', sl.slot_start,
                          'end', sl.slot_start + make_interval(mins => COALESCE(es.custom_duration_minutes, v_duration)))
                        ORDER BY sl.slot_start)
                   FROM public.get_available_slots(e.id, p_date, COALESCE(es.custom_duration_minutes, v_duration)) sl), '[]'::jsonb)) AS item
        FROM public.employee_services es
        JOIN public.employees e ON e.id = es.employee_id AND e.is_active
        JOIN public.branches b ON b.id = e.branch_id AND b.provider_id = p_provider_id
       WHERE es.service_id = p_service_id
         AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    ) per_employee;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.api_get_availability(UUID, UUID, TEXT[], UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_get_availability(UUID, UUID, TEXT[], UUID, DATE) TO service_role;

-- Bookings of the provider, ordered by start time then id. p_from is inclusive and p_to exclusive; a value that is a
-- plain date means midnight in Riyadh, anything else is a timestamp with an offset. The cursor is the pair
-- (p_after_scheduled_at, p_after_id) of the last row of the previous page.
CREATE OR REPLACE FUNCTION public.api_list_bookings(
  p_provider_id UUID, p_branch_id UUID, p_scopes TEXT[], p_from TEXT, p_to TEXT, p_status TEXT,
  p_after_scheduled_at TIMESTAMPTZ, p_after_id UUID, p_limit INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 26), 1), 101);
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  PERFORM public.api_assert_service_caller(p_provider_id, p_branch_id);
  PERFORM public.api_require_scope(p_scopes, 'bookings:read');
  IF (p_after_scheduled_at IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'A cursor needs both a time and an id' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Unknown booking status' USING ERRCODE = '22023';
  END IF;
  -- Only ISO dates and timestamps with an offset: PostgreSQL would also accept words such as 'tomorrow' or 'infinity'.
  IF (p_from IS NOT NULL AND p_from !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([Tt][0-9:.]+([Zz]|[+-][0-9]{2}:[0-9]{2}))?$')
     OR (p_to IS NOT NULL AND p_to !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([Tt][0-9:.]+([Zz]|[+-][0-9]{2}:[0-9]{2}))?$') THEN
    RAISE EXCEPTION 'Dates must be ISO 8601' USING ERRCODE = '22007';
  END IF;
  IF p_from IS NOT NULL THEN
    v_from := CASE WHEN p_from ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN p_from::date::timestamp AT TIME ZONE 'Asia/Riyadh' ELSE p_from::timestamptz END;
  END IF;
  IF p_to IS NOT NULL THEN
    v_to := CASE WHEN p_to ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN p_to::date::timestamp AT TIME ZONE 'Asia/Riyadh' ELSE p_to::timestamptz END;
  END IF;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY scheduled_at, id), '[]'::jsonb) INTO v_result
    FROM (
      SELECT b.id, b.scheduled_at, public.api_booking_json(b) AS row_json
        FROM public.bookings b
        JOIN public.branches br ON br.id = b.branch_id
       WHERE br.provider_id = p_provider_id
         AND (p_branch_id IS NULL OR b.branch_id = p_branch_id)
         AND (v_from IS NULL OR b.scheduled_at >= v_from)
         AND (v_to IS NULL OR b.scheduled_at < v_to)
         AND (p_status IS NULL OR b.status::text = p_status)
         AND (p_after_id IS NULL OR (b.scheduled_at, b.id) > (p_after_scheduled_at, p_after_id))
       ORDER BY b.scheduled_at, b.id
       LIMIT v_limit
    ) page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.api_list_bookings(UUID, UUID, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_list_bookings(UUID, UUID, TEXT[], TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, INTEGER) TO service_role;

-- Supports the keyset above: bookings by provider branch and start time.
CREATE INDEX IF NOT EXISTS idx_bookings_branch_schedule ON public.bookings (branch_id, scheduled_at, id);
