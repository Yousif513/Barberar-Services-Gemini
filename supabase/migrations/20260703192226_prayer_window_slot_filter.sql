-- Task 3: date-accurate prayer-window slot filtering.
--
-- The original public.get_available_slots(uuid, date, int) filters out prayer
-- times using HARD-CODED, date-invariant Riyadh windows (Fajr 03:45–04:05,
-- Dhuhr 12:00–12:20, ...). Those drift from the true Umm al-Qura times as the
-- year progresses. This migration adds a backward-compatible OVERLOAD that
-- accepts the real prayer windows (computed client-side with the `adhan`
-- Umm al-Qura method and passed in as timestamptz[] pairs). When no windows are
-- supplied it falls back to the legacy static behaviour, so existing callers —
-- including create_booking's 3-arg validation call — keep working unchanged.
--
-- Never edits the applied definition; this is a new overloaded signature.

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
    v_is_working BOOLEAN;
    v_slot_time TIMESTAMP WITH TIME ZONE;
    v_slot_end TIMESTAMP WITH TIME ZONE;
    v_temp_start TIMESTAMP WITH TIME ZONE;
    v_temp_end TIMESTAMP WITH TIME ZONE;
    v_has_windows BOOLEAN;
    i INT;
    v_prayer_hit BOOLEAN;
BEGIN
    v_has_windows := prayer_window_starts IS NOT NULL
        AND array_length(prayer_window_starts, 1) IS NOT NULL
        AND array_length(prayer_window_starts, 1) = COALESCE(array_length(prayer_window_ends, 1), -1);

    v_day_of_week := extract(dow from target_date)::int;

    SELECT start_time, end_time, is_working_day
    INTO v_shift_start, v_shift_end, v_is_working
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_day_of_week;

    IF v_is_working = FALSE OR v_is_working IS NULL THEN
        RETURN;
    END IF;

    v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamptz;
    v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamptz;
    v_slot_time := v_temp_start;

    WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
        v_slot_end := v_slot_time + (service_duration_minutes || ' minutes')::interval;

        -- Determine whether this slot overlaps a prayer window.
        IF v_has_windows THEN
            -- Real per-day windows supplied by the caller (Umm al-Qura).
            v_prayer_hit := FALSE;
            FOR i IN 1 .. array_length(prayer_window_starts, 1) LOOP
                IF v_slot_time < prayer_window_ends[i] AND v_slot_end > prayer_window_starts[i] THEN
                    v_prayer_hit := TRUE;
                    EXIT;
                END IF;
            END LOOP;
        ELSE
            -- Legacy static Riyadh windows (fallback when caller passes nothing).
            v_prayer_hit := (
                (v_slot_time::time < '04:05:00' AND v_slot_end::time > '03:45:00') OR
                (v_slot_time::time < '12:20:00' AND v_slot_end::time > '12:00:00') OR
                (v_slot_time::time < '15:50:00' AND v_slot_end::time > '15:30:00') OR
                (v_slot_time::time < '19:05:00' AND v_slot_end::time > '18:45:00') OR
                (v_slot_time::time < '20:35:00' AND v_slot_end::time > '20:15:00')
            );
        END IF;

        IF NOT v_prayer_hit THEN
            -- Not double-booked?
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
END;
$$;

-- Same authorization posture as the base function: callable by authenticated
-- clients (RLS on bookings still governs what they can ultimately create).
REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;

COMMENT ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) IS
  'Available booking slots for an employee on a date, excluding real prayer windows supplied as timestamptz[] pairs (Umm al-Qura, computed client-side). Falls back to legacy static Riyadh windows when no windows are passed.';
