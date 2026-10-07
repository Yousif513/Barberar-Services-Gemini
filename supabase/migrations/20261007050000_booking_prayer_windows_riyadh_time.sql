-- FIX-BOOKING item 1 (D-21 / R3): one prayer-window rule for listing and validation, never read in the session time zone.
--
-- Defect: get_available_slots excluded hard-coded prayer windows (03:45-04:05, 12:00-12:20, 15:30-15:50, 18:45-19:05, 20:15-20:35) whenever the
-- caller passed none, comparing them with `v_slot_time::time`. That cast reads the clock of the database SESSION time zone, which is UTC on a
-- hosted Supabase project, so the server refused slots the customer had been shown (the shop page computes Umm al-Qura windows itself) and
-- accepted others that fall in a prayer time. booking_create_internal and reschedule_booking never received the windows the customer saw.
--
-- Rule implemented here (one rule):
--   * prayer pauses are a presentation rule supplied by the client (or, later, stored per branch): create_booking, create_multi_service_booking
--     and reschedule_booking accept optional prayer_window_starts / prayer_window_ends, validate them (matching lists, at most 12, start < end)
--     and hand them to get_available_slots;
--   * when none are passed NO prayer exclusion is applied (the hard-coded fallback is deleted from get_available_slots);
--   * a clock time is only ever compared after AT TIME ZONE 'Asia/Riyadh' (there is no such comparison left in the booking functions).
--
-- Functions are patched in place from their LATEST definition (pg_get_functiondef), so earlier fixes in them survive.

-- ---------------------------------------------------------------------------
-- Migration helpers (session scoped; dropped first so an earlier file's helper with other parameter names cannot block this one)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[])
RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_old), $e$
$e$, $e$
$e$);
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], $e$
$e$, $e$
$e$) IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], $e$
$e$, $e$
$e$), p_to[i]);
  END LOOP;
  EXECUTE v_def;                               -- a new overload when the argument list changed, an in-place patch otherwise
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature;
  END IF;
  IF v_new <> p_old THEN
    -- the replacement inherits exactly the privileges of the function it replaces, then the old overload goes
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_new);
    FOR v_grantee IN
      SELECT DISTINCT r.rolname
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = p_old::oid AND a.privilege_type = 'EXECUTE'
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_new, v_grantee);
    END LOOP;
    EXECUTE format('DROP FUNCTION %s', p_old);
  END IF;
END
$helper$;

-- ---------------------------------------------------------------------------
-- 1. Validation of client-supplied windows (internal helper)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_prayer_windows(p_starts timestamptz[], p_ends timestamptz[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_n INT := COALESCE(array_length(p_starts, 1), 0);
  i INT;
BEGIN
  IF v_n <> COALESCE(array_length(p_ends, 1), 0) THEN
    RAISE EXCEPTION 'Prayer windows must be given as matching start and end lists' USING ERRCODE = '22023';
  END IF;
  IF v_n > 12 THEN
    RAISE EXCEPTION 'At most 12 prayer windows can be given' USING ERRCODE = '22023';
  END IF;
  FOR i IN 1 .. v_n LOOP
    IF p_starts[i] IS NULL OR p_ends[i] IS NULL OR p_ends[i] <= p_starts[i] THEN
      RAISE EXCEPTION 'Each prayer window needs a start before its end' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_prayer_windows(timestamptz[], timestamptz[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_prayer_windows(timestamptz[], timestamptz[]) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. get_available_slots: delete the hard-coded session-clock fallback (three copies: previous-day spill-over, shift 1, shift 2)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_sig regprocedure := 'public.get_available_slots(uuid, date, integer, timestamptz[], timestamptz[])'::regprocedure;
  v_def text := replace(pg_get_functiondef(v_sig), $e$
$e$, $e$
$e$);
  v_new text;
  v_copies int;
BEGIN
  v_new := regexp_replace(v_def,
    $re$v_prayer_hit := \(\s*(\(v_slot_time::time < '[0-9:]+' AND v_slot_end::time > '[0-9:]+'\)(\s*OR\s*)?)+\s*\);$re$,
    'v_prayer_hit := FALSE;', 'g');
  v_copies := (length(v_def) - length(replace(v_def, 'v_slot_time::time', ''))) / length('v_slot_time::time');
  IF v_copies <> 15 OR position('v_slot_time::time' IN v_new) > 0 THEN
    RAISE EXCEPTION 'get_available_slots: expected 3 fallback blocks (15 clock comparisons), found %, % left after the patch',
      v_copies, (length(v_new) - length(replace(v_new, 'v_slot_time::time', ''))) / length('v_slot_time::time');
  END IF;
  EXECUTE v_new;
END $$;

-- ---------------------------------------------------------------------------
-- 3. booking_create_internal: accept the windows and use them for both availability checks
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer)'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[])',
  ARRAY[
    $e$p_loyalty_points integer)
 RETURNS bookings$e$,
    $e$           WHERE es.employee_id = e.id AND es.service_id = ANY(p_service_ids))
        ) sl$e$,
    $e$SELECT 1 FROM public.get_available_slots(v_employee_id, v_date, v_duration) sl$e$,
    $e$  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN$e$
  ],
  ARRAY[
    $e$p_loyalty_points integer, p_prayer_window_starts timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], p_prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS bookings$e$,
    $e$           WHERE es.employee_id = e.id AND es.service_id = ANY(p_service_ids)),
          p_prayer_window_starts, p_prayer_window_ends
        ) sl$e$,
    $e$SELECT 1 FROM public.get_available_slots(v_employee_id, v_date, v_duration, p_prayer_window_starts, p_prayer_window_ends) sl$e$,
    $e$  PERFORM public.assert_prayer_windows(p_prayer_window_starts, p_prayer_window_ends);
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN$e$
  ]);

-- ---------------------------------------------------------------------------
-- 4. create_booking / create_multi_service_booking / reschedule_booking: the same two optional arguments
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text)'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[])',
  ARRAY[
    $e$)
 RETURNS bookings$e$,
    $e$    request_loyalty_points
  );$e$
  ],
  ARRAY[
    $e$, prayer_window_starts timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS bookings$e$,
    $e$    request_loyalty_points, prayer_window_starts, prayer_window_ends
  );$e$
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid)'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[])',
  ARRAY[
    $e$)
 RETURNS jsonb$e$,
    $e$    request_loyalty_points
  );$e$
  ],
  ARRAY[
    $e$, prayer_window_starts timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS jsonb$e$,
    $e$    request_loyalty_points, prayer_window_starts, prayer_window_ends
  );$e$
  ]);

SELECT pg_temp.evolve_function(
  'public.reschedule_booking(uuid, timestamptz, uuid, text)'::regprocedure,
  'public.reschedule_booking(uuid, timestamptz, uuid, text, timestamptz[], timestamptz[])',
  ARRAY[
    $e$reschedule_reason text DEFAULT NULL::text)
 RETURNS jsonb$e$,
    $e$  PERFORM set_config('primora.reschedule_in_progress', 'on', true);

  IF NOT EXISTS (
    SELECT 1 FROM public.get_available_slots(v_employee, v_date, v_booking.duration_minutes) sl$e$
  ],
  ARRAY[
    $e$reschedule_reason text DEFAULT NULL::text, prayer_window_starts timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS jsonb$e$,
    $e$  PERFORM public.assert_prayer_windows(prayer_window_starts, prayer_window_ends);
  PERFORM set_config('primora.reschedule_in_progress', 'on', true);

  IF NOT EXISTS (
    SELECT 1 FROM public.get_available_slots(v_employee, v_date, v_booking.duration_minutes, prayer_window_starts, prayer_window_ends) sl$e$
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
