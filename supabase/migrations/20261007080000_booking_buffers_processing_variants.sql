-- FIX-BOOKING item 4 (R15 / G23): buffers, processing time and service variants take part in slot generation and conflict checks.
--
-- Defect: services.buffer_before_minutes / buffer_after_minutes / processing_time_minutes and service_variants were stored and then ignored. A service
-- with buffer_after_minutes = 60 still offered the next slot right after the previous booking ended; create_booking had no variant argument.
--
-- Rules implemented (decisions recorded in docs/work-packages/fixbooking-report.md):
--   * A visit keeps the professional occupied for  [start - blocked_before, start + duration + blocked_after).
--       blocked_before = buffer_before of the FIRST service;
--       blocked_after  = for every service: processing_time + buffer_after, plus the buffer_before of every later service.
--     Processing time is therefore treated as time the professional cannot give to another client (conservative: no double booking).
--   * bookings.duration_minutes stays the visible length of the visit (calendar end time, price); the buffers are stored in
--     bookings.blocked_before_minutes / blocked_after_minutes and folded into bookings.booking_window, which the exclusion constraint and
--     get_available_slots both use, so two visits can never overlap in their blocked windows even under concurrency.
--   * The visible duration must fit the shift; the buffers need not (a cleaning buffer after the last visit of the day is fine).
--   * A variant (service_variants) replaces the service's duration and price for that booking (the employee's custom price/duration apply only to
--     the plain service); it must belong to the booked service and be active. booking_services.variant_id records it.
--   * One helper, booking_visit_profile, computes duration, price and blocked minutes for an employee, so booking_create_internal and the
--     any-professional listing (get_branch_available_slots, item 5) cannot disagree.
--   * reschedule_booking validates the move with get_available_slots ignoring the booking itself (new p_ignore_booking_id) and no longer needs the
--     "overlaps itself" exception, which also accepted moves outside working hours.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS blocked_before_minutes INT NOT NULL DEFAULT 0 CHECK (blocked_before_minutes >= 0),
  ADD COLUMN IF NOT EXISTS blocked_after_minutes INT NOT NULL DEFAULT 0 CHECK (blocked_after_minutes >= 0);

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.service_variants(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_buffers_non_negative' AND conrelid = 'public.services'::regclass) THEN
    ALTER TABLE public.services ADD CONSTRAINT services_buffers_non_negative
      CHECK (buffer_before_minutes >= 0 AND buffer_after_minutes >= 0 AND processing_time_minutes >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_booking_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.booking_window := tstzrange(
    NEW.scheduled_at - make_interval(mins => COALESCE(NEW.blocked_before_minutes, 0)),
    NEW.scheduled_at + make_interval(mins => NEW.duration_minutes + COALESCE(NEW.blocked_after_minutes, 0)),
    '[)'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_booking_window_before_write ON public.bookings;
CREATE TRIGGER set_booking_window_before_write
BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes, blocked_before_minutes, blocked_after_minutes
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_window();

-- ---------------------------------------------------------------------------
-- booking_visit_profile: what one professional would need for these services (and variants, positionally aligned; NULL = the plain service)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_visit_profile(
  p_employee_id UUID, p_service_ids UUID[], p_variant_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN, total_duration_minutes INT, total_price NUMERIC, blocked_before_minutes INT, blocked_after_minutes INT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH items AS (
    SELECT ord.n,
           s.id IS NOT NULL AND es.service_id IS NOT NULL
             AND (p_variant_ids IS NULL OR p_variant_ids[ord.n::int] IS NULL OR sv.id IS NOT NULL) AS ok,
           COALESCE(sv.duration_minutes, es.custom_duration_minutes, s.base_duration_minutes) AS duration,
           COALESCE(sv.price_sar, es.custom_price, s.base_price) AS price,
           COALESCE(s.buffer_before_minutes, 0) AS buf_before,
           COALESCE(s.buffer_after_minutes, 0) AS buf_after,
           COALESCE(s.processing_time_minutes, 0) AS processing
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(service_id, n)
    LEFT JOIN public.services s ON s.id = ord.service_id AND s.is_active
    LEFT JOIN public.employee_services es ON es.service_id = s.id AND es.employee_id = p_employee_id
    LEFT JOIN public.service_variants sv ON sv.id = p_variant_ids[ord.n::int] AND sv.service_id = s.id AND sv.is_active
  )
  SELECT COALESCE(bool_and(i.ok), FALSE),
         COALESCE(SUM(i.duration), 0)::int,
         COALESCE(SUM(i.price), 0)::numeric,
         COALESCE(MAX(CASE WHEN i.n = 1 THEN i.buf_before END), 0)::int,
         COALESCE(SUM(i.processing + i.buf_after + CASE WHEN i.n > 1 THEN i.buf_before ELSE 0 END), 0)::int
  FROM items i;
$$;
REVOKE ALL ON FUNCTION public.booking_visit_profile(uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_visit_profile(uuid, uuid[], uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Function evolution helper (session scoped)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[])
RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_old), chr(13) || chr(10), chr(10));
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], chr(13) || chr(10), chr(10)) IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], chr(13) || chr(10), chr(10)), p_to[i]);
  END LOOP;
  EXECUTE v_def;
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature;
  END IF;
  IF v_new <> p_old THEN
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
-- get_available_slots: blocked window around each candidate slot, optionally ignoring one booking (reschedule)
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.get_available_slots(uuid, date, integer, timestamptz[], timestamptz[])'::regprocedure,
  'public.get_available_slots(uuid, date, integer, timestamptz[], timestamptz[], integer, integer, uuid)',
  ARRAY[
    $e$prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])
 RETURNS TABLE(slot_start timestamp with time zone)$e$,
    $e$  v_duration INTERVAL := make_interval(mins => service_duration_minutes);
$e$,
    $e$            AND b.scheduled_at < v_slot_end
            AND (b.scheduled_at + make_interval(mins => b.duration_minutes)) > v_slot_time
$e$
  ],
  ARRAY[
    $e$prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], p_buffer_before_minutes integer DEFAULT 0, p_buffer_after_minutes integer DEFAULT 0, p_ignore_booking_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_start timestamp with time zone)$e$,
    $e$  v_duration INTERVAL := make_interval(mins => service_duration_minutes);
  v_before INTERVAL := make_interval(mins => GREATEST(COALESCE(p_buffer_before_minutes, 0), 0));
  v_after INTERVAL := make_interval(mins => GREATEST(COALESCE(p_buffer_after_minutes, 0), 0));
$e$,
    $e$            AND b.booking_window && tstzrange(v_slot_time - v_before, v_slot_end + v_after, '[)')
            AND b.id IS DISTINCT FROM p_ignore_booking_id
$e$
  ]);

-- ---------------------------------------------------------------------------
-- booking_create_internal: variants, buffers, one visit profile for the any-professional pick
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text)'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[])',
  ARRAY[
    $e$p_source_token text DEFAULT NULL::text)
 RETURNS bookings$e$,
    $e$  v_seq INT := 0;
BEGIN$e$,
    $e$  PERFORM public.assert_prayer_windows(p_prayer_window_starts, p_prayer_window_ends);
$e$,
    $e$        SELECT 1 FROM public.get_available_slots(
          e.id, v_date,
          (SELECT SUM(COALESCE(es.custom_duration_minutes, s.base_duration_minutes))::int
           FROM public.employee_services es JOIN public.services s ON s.id = es.service_id
           WHERE es.employee_id = e.id AND es.service_id = ANY(p_service_ids)),
          p_prayer_window_starts, p_prayer_window_ends
        ) sl
        WHERE sl.slot_start = p_scheduled_at$e$,
    $e$    SELECT s.id, COALESCE(es.custom_duration_minutes, s.base_duration_minutes) AS duration,
           COALESCE(es.custom_price, s.base_price) AS price, ord.n
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(service_id, n)
    JOIN public.services s ON s.id = ord.service_id
$e$,
    $e$    v_duration := v_duration + v_item.duration;
    v_subtotal := v_subtotal + v_item.price;
  END LOOP;$e$,
    $e$get_available_slots(v_employee_id, v_date, v_duration, p_prayer_window_starts, p_prayer_window_ends) sl$e$,
    $e$      client_profile_id, source, is_first_visit, source_token_id
    ) VALUES ($e$,
    $e$      p_client_profile_id, v_source, v_first_visit, v_source_token_id
    )$e$,
    $e$    INSERT INTO public.booking_services (booking_id, service_id, employee_id, sequence_order, duration_minutes, price)
    VALUES (v_booking.id, v_item.id, v_employee_id, v_item.n, v_item.duration, v_item.price);$e$
  ],
  ARRAY[
    $e$p_source_token text DEFAULT NULL::text, p_variant_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS bookings$e$,
    $e$  v_seq INT := 0;
  v_blocked_before INT := 0;
  v_blocked_after INT := 0;
BEGIN$e$,
    $e$  PERFORM public.assert_prayer_windows(p_prayer_window_starts, p_prayer_window_ends);
  IF p_variant_ids IS NOT NULL AND COALESCE(array_length(p_variant_ids, 1), 0) > COALESCE(array_length(p_service_ids, 1), 0) THEN
    RAISE EXCEPTION 'At most one option per selected service can be given' USING ERRCODE = '22023';
  END IF;
$e$,
    $e$        SELECT 1 FROM public.booking_visit_profile(e.id, p_service_ids, p_variant_ids) vp
        CROSS JOIN LATERAL public.get_available_slots(
          e.id, v_date, vp.total_duration_minutes,
          p_prayer_window_starts, p_prayer_window_ends, vp.blocked_before_minutes, vp.blocked_after_minutes
        ) sl
        WHERE vp.is_valid AND sl.slot_start = p_scheduled_at$e$,
    $e$    SELECT s.id, COALESCE(sv.duration_minutes, es.custom_duration_minutes, s.base_duration_minutes) AS duration,
           COALESCE(sv.price_sar, es.custom_price, s.base_price) AS price, ord.n, sv.id AS variant_id,
           COALESCE(s.buffer_before_minutes, 0) AS buf_before, COALESCE(s.buffer_after_minutes, 0) AS buf_after,
           COALESCE(s.processing_time_minutes, 0) AS processing
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(service_id, n)
    JOIN public.services s ON s.id = ord.service_id
    LEFT JOIN public.service_variants sv ON sv.id = p_variant_ids[ord.n::int] AND sv.service_id = s.id AND sv.is_active
$e$,
    $e$    IF p_variant_ids IS NOT NULL AND p_variant_ids[v_item.n::int] IS NOT NULL AND v_item.variant_id IS NULL THEN
      RAISE EXCEPTION 'The selected option is not available for this service' USING ERRCODE = '22023';
    END IF;
    v_duration := v_duration + v_item.duration;
    v_subtotal := v_subtotal + v_item.price;
    -- Buffers and processing time keep the professional occupied around the visit (R15): the buffer before the first service,
    -- and after the visit everything else (processing time, buffers after, the buffer before each later service).
    IF v_item.n = 1 THEN
      v_blocked_before := v_item.buf_before;
    ELSE
      v_blocked_after := v_blocked_after + v_item.buf_before;
    END IF;
    v_blocked_after := v_blocked_after + v_item.processing + v_item.buf_after;
  END LOOP;$e$,
    $e$get_available_slots(v_employee_id, v_date, v_duration, p_prayer_window_starts, p_prayer_window_ends, v_blocked_before, v_blocked_after) sl$e$,
    $e$      client_profile_id, source, is_first_visit, source_token_id, blocked_before_minutes, blocked_after_minutes
    ) VALUES ($e$,
    $e$      p_client_profile_id, v_source, v_first_visit, v_source_token_id, v_blocked_before, v_blocked_after
    )$e$,
    $e$    INSERT INTO public.booking_services (booking_id, service_id, employee_id, sequence_order, duration_minutes, price, variant_id)
    VALUES (v_booking.id, v_item.id, v_employee_id, v_item.n, v_item.duration, v_item.price, v_item.variant_id);$e$
  ]);

-- Both loops of booking_create_internal (pricing, then the booking_services rows) share one select list; the shared text is replaced in both,
-- so the stored rows carry the same variant-aware duration and price that the visit was priced with.

-- ---------------------------------------------------------------------------
-- create_booking (variant) and create_multi_service_booking (variants in the payload)
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text)'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid)',
  ARRAY[
    $e$request_source_token text DEFAULT NULL::text)
 RETURNS bookings$e$,
    $e$prayer_window_starts, prayer_window_ends, request_source_token
  );$e$
  ],
  ARRAY[
    $e$request_source_token text DEFAULT NULL::text, request_variant_id uuid DEFAULT NULL::uuid)
 RETURNS bookings$e$,
    $e$prayer_window_starts, prayer_window_ends, request_source_token,
    CASE WHEN request_variant_id IS NULL THEN NULL ELSE ARRAY[request_variant_id] END
  );$e$
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text)'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text)',
  ARRAY[
    $e$  v_ids UUID[];
$e$,
    $e$  SELECT array_agg((item->>'service_id')::uuid ORDER BY n)
  INTO v_ids
$e$,
    $e$prayer_window_starts, prayer_window_ends, request_source_token
  );$e$
  ],
  ARRAY[
    $e$  v_ids UUID[];
  v_variants UUID[];
$e$,
    $e$  SELECT array_agg((item->>'service_id')::uuid ORDER BY n), array_agg(NULLIF(item->>'variant_id', '')::uuid ORDER BY n)
  INTO v_ids, v_variants
$e$,
    $e$prayer_window_starts, prayer_window_ends, request_source_token, v_variants
  );$e$
  ]);

-- ---------------------------------------------------------------------------
-- reschedule_booking: the move is checked with the booking's own blocked window, ignoring the booking itself
-- ---------------------------------------------------------------------------
SELECT pg_temp.evolve_function(
  'public.reschedule_booking(uuid, timestamptz, uuid, text, timestamptz[], timestamptz[])'::regprocedure,
  'public.reschedule_booking(uuid, timestamptz, uuid, text, timestamptz[], timestamptz[])',
  ARRAY[
    $e$get_available_slots(v_employee, v_date, v_booking.duration_minutes, prayer_window_starts, prayer_window_ends) sl$e$,
    $e$  ) AND NOT (
    -- The only thing occupying the new slot is this booking itself (same professional, overlapping move).
    v_employee = v_booking.employee_id
    AND tstzrange(v_booking.scheduled_at, v_booking.scheduled_at + make_interval(mins => v_booking.duration_minutes))
        && tstzrange(new_scheduled_at, new_scheduled_at + make_interval(mins => v_booking.duration_minutes))
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = v_employee AND b.id <> v_booking.id
        AND b.status IN ('pending_payment', 'confirmed')
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_minutes))
            && tstzrange(new_scheduled_at, new_scheduled_at + make_interval(mins => v_booking.duration_minutes))
    )
  ) THEN$e$
  ],
  ARRAY[
    $e$get_available_slots(v_employee, v_date, v_booking.duration_minutes, prayer_window_starts, prayer_window_ends,
                                             v_booking.blocked_before_minutes, v_booking.blocked_after_minutes, v_booking.id) sl$e$,
    $e$  ) THEN$e$
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
