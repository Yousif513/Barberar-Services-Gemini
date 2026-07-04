ALTER TABLE public.employee_availability
  ADD COLUMN IF NOT EXISTS has_second_shift BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS second_start_time TIME,
  ADD COLUMN IF NOT EXISTS second_end_time TIME;

COMMENT ON COLUMN public.employee_availability.has_second_shift IS
  'When true, the employee has a second working window on the same day.';

COMMENT ON COLUMN public.employee_availability.second_start_time IS
  'Optional second shift opening time for split-shift schedules.';

COMMENT ON COLUMN public.employee_availability.second_end_time IS
  'Optional second shift closing time for split-shift schedules.';

CREATE OR REPLACE FUNCTION public.get_available_slots(
    target_employee_id UUID,
    target_date DATE,
    service_duration_minutes INT,
    prayer_window_starts TIMESTAMPTZ[],
    prayer_window_ends TIMESTAMPTZ[]
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_day_of_week INT;
    v_shift_start TIME;
    v_shift_end TIME;
    v_second_start TIME;
    v_second_end TIME;
    v_has_second_shift BOOLEAN;
    v_is_working BOOLEAN;
    v_slot_time TIMESTAMP WITH TIME ZONE;
    v_slot_end TIMESTAMP WITH TIME ZONE;
    v_temp_start TIMESTAMP WITH TIME ZONE;
    v_temp_end TIMESTAMP WITH TIME ZONE;
    v_has_windows BOOLEAN;
    v_window_index INT;
    i INT;
    v_prayer_hit BOOLEAN;
BEGIN
    v_has_windows := prayer_window_starts IS NOT NULL
        AND array_length(prayer_window_starts, 1) IS NOT NULL
        AND array_length(prayer_window_starts, 1) = COALESCE(array_length(prayer_window_ends, 1), -1);

    v_day_of_week := extract(dow from target_date)::int;

    SELECT start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time
    INTO v_shift_start, v_shift_end, v_is_working, v_has_second_shift, v_second_start, v_second_end
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_day_of_week;

    IF v_is_working = FALSE OR v_is_working IS NULL THEN
        RETURN;
    END IF;

    FOR v_window_index IN 1..2 LOOP
        IF v_window_index = 1 THEN
            v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamptz;
        ELSE
            IF COALESCE(v_has_second_shift, FALSE) = FALSE OR v_second_start IS NULL OR v_second_end IS NULL THEN
                CONTINUE;
            END IF;
            v_temp_start := (target_date::text || ' ' || v_second_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_second_end::text || '+03')::timestamptz;
        END IF;

        v_slot_time := v_temp_start;

        WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
            v_slot_end := v_slot_time + (service_duration_minutes || ' minutes')::interval;

            IF v_has_windows THEN
                v_prayer_hit := FALSE;
                FOR i IN 1 .. array_length(prayer_window_starts, 1) LOOP
                    IF v_slot_time < prayer_window_ends[i] AND v_slot_end > prayer_window_starts[i] THEN
                        v_prayer_hit := TRUE;
                        EXIT;
                    END IF;
                END LOOP;
            ELSE
                v_prayer_hit := (
                    (v_slot_time::time < '04:05:00' AND v_slot_end::time > '03:45:00') OR
                    (v_slot_time::time < '12:20:00' AND v_slot_end::time > '12:00:00') OR
                    (v_slot_time::time < '15:50:00' AND v_slot_end::time > '15:30:00') OR
                    (v_slot_time::time < '19:05:00' AND v_slot_end::time > '18:45:00') OR
                    (v_slot_time::time < '20:35:00' AND v_slot_end::time > '20:15:00')
                );
            END IF;

            IF NOT v_prayer_hit THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.bookings
                    WHERE employee_id = target_employee_id
                      AND status IN ('confirmed', 'pending_payment')
                      AND scheduled_at < v_slot_end
                      AND (scheduled_at + (duration_minutes || ' minutes')::interval) > v_slot_time
                ) THEN
                    slot_start := v_slot_time;
                    RETURN NEXT;
                END IF;
            END IF;

            v_slot_time := v_slot_time + interval '15 minutes';
        END LOOP;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;
