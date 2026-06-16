-- Migration: 20260613020000_booking_engine.sql
-- Description: Implement get_available_slots database function with prayer-time blocking.

CREATE OR REPLACE FUNCTION public.get_available_slots(
    target_employee_id UUID,
    target_date DATE,
    service_duration_minutes INT
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE) AS $$
DECLARE
    v_day_of_week INT;
    v_shift_start TIME;
    v_shift_end TIME;
    v_is_working BOOLEAN;
    v_slot_time TIMESTAMP WITH TIME ZONE;
    v_slot_end TIMESTAMP WITH TIME ZONE;
    v_temp_start TIMESTAMP WITH TIME ZONE;
    v_temp_end TIMESTAMP WITH TIME ZONE;
BEGIN
    -- 1. Get Day of Week (0 = Sunday, 6 = Saturday)
    v_day_of_week := extract(dow from target_date)::int;

    -- 2. Fetch employee availability shift
    SELECT start_time, end_time, is_working_day 
    INTO v_shift_start, v_shift_end, v_is_working
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_day_of_week;

    -- If not working day, return empty
    IF v_is_working = FALSE OR v_is_working IS NULL THEN
        RETURN;
    END IF;

    -- 3. Initialize loop boundaries
    v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamp with time zone; -- Riyadh timezone (+03)
    v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamp with time zone;

    v_slot_time := v_temp_start;

    -- 4. Generate slots in 15-minute increments
    WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
        v_slot_end := v_slot_time + (service_duration_minutes || ' minutes')::interval;

        -- 5. FILTER out slots that overlap with Riyadh prayer times
        -- Fajr: 03:45 - 04:05
        -- Dhuhr: 12:00 - 12:20
        -- Asr: 15:30 - 15:50
        -- Maghrib: 18:45 - 19:05
        -- Isha: 20:15 - 20:35
        IF NOT (
            (v_slot_time::time < '04:05:00' AND v_slot_end::time > '03:45:00') OR
            (v_slot_time::time < '12:20:00' AND v_slot_end::time > '12:00:00') OR
            (v_slot_time::time < '15:50:00' AND v_slot_end::time > '15:30:00') OR
            (v_slot_time::time < '19:05:00' AND v_slot_end::time > '18:45:00') OR
            (v_slot_time::time < '20:35:00' AND v_slot_end::time > '20:15:00')
        ) THEN

            -- 6. FILTER out slots that overlap with existing bookings
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

        -- Step forward 15 minutes
        v_slot_time := v_slot_time + interval '15 minutes';
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;
