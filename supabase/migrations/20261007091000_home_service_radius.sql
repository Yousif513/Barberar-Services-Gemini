-- FIX-BOOKING item 6 (R42 / G37): home-service bookings respect branches.geofence_radius_km.
--
-- Defect: branches.geofence_radius_km was read by no function. booking_create_internal checked only that the services are home-eligible and that
-- coordinates were given, so a customer 800 km away could book a home visit at a branch with a 5 km service area.
--
-- Rules:
--   * A home-service booking is accepted only when the customer's coordinates lie within geofence_radius_km of the branch (great-circle distance,
--     Haversine, mean earth radius 6371.0088 km) - for the branch of the professional who will serve it.
--   * geofence_radius_km is a business decision of the provider. 0 or NULL means "no service area configured" and is NOT enforced (the status quo; the
--     migration invents no radius). The owner may decide to require a radius before a branch can offer home visits; that is a product decision.
--   * "Any professional" only considers professionals of branches that serve the address, so a nearer branch of the same provider is chosen
--     instead of failing at the end.
--   * Coordinates outside -90..90 / -180..180 are refused.
--   * Not done here: the travel buffer. The calculate-travel Edge Function needs a routing provider over the network and an owner decision on speeds;
--     a booking transaction must not call out. A travel buffer can be stored in services.buffer_before_minutes (item 4) once the owner sets it.

CREATE OR REPLACE FUNCTION public.haversine_km(p_lat1 NUMERIC, p_lng1 NUMERIC, p_lat2 NUMERIC, p_lng2 NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (2 * 6371.0088 * asin(sqrt(LEAST(1.0,
      power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
      + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
        * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2)
  ))))::numeric;
$$;
REVOKE ALL ON FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.branch_serves_location(p_branch_id UUID, p_lat NUMERIC, p_lng NUMERIC)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(b.geofence_radius_km, 0) <= 0
            OR public.haversine_km(b.latitude, b.longitude, p_lat, p_lng) <= b.geofence_radius_km
     FROM public.branches b WHERE b.id = p_branch_id),
    FALSE);
$$;
REVOKE ALL ON FUNCTION public.branch_serves_location(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branch_serves_location(uuid, numeric, numeric) TO service_role;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text[], p_to text[]) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], E'\r\n', E'\n') IN v_def) = 0 THEN
      RAISE EXCEPTION 'patch_function: pattern % not found in %', i, p_sig;
    END IF;
    v_def := replace(v_def, replace(p_from[i], E'\r\n', E'\n'), p_to[i]);
  END LOOP;
  EXECUTE v_def;
END
$helper$;

SELECT pg_temp.patch_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[])'::regprocedure,
  ARRAY[
    -- the any-professional pick only considers branches that serve the address
    E'      AND e.is_active\n      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)\n',
    -- the chosen professional's branch must serve the address
    E'  IF v_branch_id IS NULL THEN\n    RAISE EXCEPTION ''The selected professional does not work at this provider'' USING ERRCODE = ''22023'';\n  END IF;\n'
  ],
  ARRAY[
    E'      AND e.is_active\n      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)\n      AND (NOT COALESCE(p_home_service, FALSE) OR public.branch_serves_location(e.branch_id, p_home_lat, p_home_lng))\n',
    E'  IF v_branch_id IS NULL THEN\n    RAISE EXCEPTION ''The selected professional does not work at this provider'' USING ERRCODE = ''22023'';\n  END IF;\n\n  IF COALESCE(p_home_service, FALSE) THEN\n    IF p_home_lat NOT BETWEEN -90 AND 90 OR p_home_lng NOT BETWEEN -180 AND 180 THEN\n      RAISE EXCEPTION ''The home-visit coordinates are not valid'' USING ERRCODE = ''22023'';\n    END IF;\n    IF NOT public.branch_serves_location(v_branch_id, p_home_lat, p_home_lng) THEN\n      RAISE EXCEPTION ''This address is outside the branch home-visit area of % km'',\n        (SELECT b.geofence_radius_km FROM public.branches b WHERE b.id = v_branch_id) USING ERRCODE = ''22023'';\n    END IF;\n  END IF;\n'
  ]);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
