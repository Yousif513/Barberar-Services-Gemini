-- FIX-BOOKING item 2 (D-16 / R21): overnight second shifts, seasonal overnight schedules, and seasons that must not override days off.
--
-- Defects in the latest get_available_slots (20261004010000, patched by 20261007050000):
--   * the after-midnight spill-over was computed for the previous day's FIRST shift only; the second-shift columns were selected and never used
--     (probe E13b: split shift 09-13 and 21-02 gave no 00:00-01:30 slots the next morning, a single shift did);
--   * the spill-over always read the weekly employee_availability row of the previous day, never the seasonal schedule that applied on that day
--     (a seasonal 21:00-02:00 offered 21:00-23:30 and nothing after midnight);
--   * a seasonal schedule set is_working = TRUE for every employee on every day, overriding the employee's days off.
--
-- Fix: one rule, applied to both the target day and the day before it. The hours of a day come from the seasonal schedule that applied on THAT
-- day (branch-specific first), else from the weekly row; whether the employee works that day always comes from the weekly row, so a day off stays
-- off in every season. Each shift of the day (first and second, overnight when its end is not after its start) contributes the part that falls on the
-- target day (Riyadh calendar). A shift of the previous day only spills over when the employee was not on approved leave and the provider/branch was
-- not closed on that previous day.
--
-- get_available_slots is owned by this package and its three duplicated loops are replaced by one loop over the day's shifts; the signature, the
-- 30-minute grid, the prayer-window rule of item 1 and the conflict rule are unchanged. A spill-over slot continues the grid of the shift it belongs
-- to (a 21:15 shift continues at 00:15), where the old spill-over restarted at 00:00.

CREATE OR REPLACE FUNCTION public.employee_day_schedule(
  p_employee_id UUID, p_provider_id UUID, p_branch_id UUID, p_date DATE
)
RETURNS TABLE (is_working BOOLEAN, shift_start TIME, shift_end TIME, has_second_shift BOOLEAN, second_start TIME, second_end TIME)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_week public.employee_availability;
  v_season public.seasonal_schedules;
BEGIN
  SELECT * INTO v_week
  FROM public.employee_availability a
  WHERE a.employee_id = p_employee_id AND a.day_of_week = extract(dow FROM p_date)::int;

  -- The weekly row alone decides whether the employee works on this weekday: a season changes hours, never days off.
  IF NOT FOUND OR NOT COALESCE(v_week.is_working_day, FALSE) THEN
    RETURN QUERY SELECT FALSE, NULL::time, NULL::time, FALSE, NULL::time, NULL::time;
    RETURN;
  END IF;

  SELECT * INTO v_season
  FROM public.seasonal_schedules s
  WHERE s.provider_id = p_provider_id
    AND (s.branch_id IS NULL OR s.branch_id = p_branch_id)
    AND s.is_active = TRUE
    AND p_date >= s.start_date AND p_date <= s.end_date
  ORDER BY (s.branch_id IS NOT NULL) DESC, s.start_date DESC, s.created_at DESC, s.id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_season.start_time, v_season.end_time,
      COALESCE(v_season.has_second_shift, FALSE), v_season.second_start_time, v_season.second_end_time;
  ELSE
    RETURN QUERY SELECT TRUE, v_week.start_time, v_week.end_time,
      COALESCE(v_week.has_second_shift, FALSE), v_week.second_start_time, v_week.second_end_time;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.employee_day_schedule(uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employee_day_schedule(uuid, uuid, uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  target_employee_id uuid, target_date date, service_duration_minutes integer,
  prayer_window_starts timestamp with time zone[] DEFAULT NULL::timestamp with time zone[],
  prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[]
)
RETURNS TABLE(slot_start timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_branch_id UUID;
  v_emp_provider_id UUID;
  v_has_windows BOOLEAN;
  v_day_start TIMESTAMPTZ := target_date::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_day_end TIMESTAMPTZ := (target_date + 1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_duration INTERVAL := make_interval(mins => service_duration_minutes);
  v_day DATE;
  v_sched RECORD;
  v_n INT;
  v_from TIME;
  v_to TIME;
  v_shift_start TIMESTAMPTZ;
  v_shift_end TIMESTAMPTZ;
  v_slot_time TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_prayer_hit BOOLEAN;
  v_slots TIMESTAMPTZ[] := ARRAY[]::TIMESTAMPTZ[];
  i INT;
BEGIN
  IF service_duration_minutes IS NULL OR service_duration_minutes <= 0 THEN
    RETURN;
  END IF;

  -- 1. Approved employee time off
  IF EXISTS (
    SELECT 1 FROM public.employee_time_off
    WHERE employee_id = target_employee_id AND status = 'approved'
      AND target_date >= start_date AND target_date <= end_date
  ) THEN
    RETURN;
  END IF;

  -- 2. Employee branch and provider
  SELECT e.branch_id, br.provider_id
  INTO v_emp_branch_id, v_emp_provider_id
  FROM public.employees e
  JOIN public.branches br ON br.id = e.branch_id
  WHERE e.id = target_employee_id AND e.is_active = TRUE;

  IF v_emp_branch_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Provider / branch closures
  IF EXISTS (
    SELECT 1 FROM public.provider_closures
    WHERE provider_id = v_emp_provider_id
      AND (branch_id IS NULL OR branch_id = v_emp_branch_id)
      AND target_date >= start_date AND target_date <= end_date
  ) THEN
    RETURN;
  END IF;

  v_has_windows := prayer_window_starts IS NOT NULL
    AND array_length(prayer_window_starts, 1) IS NOT NULL
    AND array_length(prayer_window_starts, 1) = COALESCE(array_length(prayer_window_ends, 1), -1);

  -- 4. The day before (its overnight shifts spill into the morning) and the target day itself.
  FOREACH v_day IN ARRAY ARRAY[target_date - 1, target_date] LOOP
    IF v_day < target_date AND (
      EXISTS (
        SELECT 1 FROM public.employee_time_off
        WHERE employee_id = target_employee_id AND status = 'approved'
          AND v_day >= start_date AND v_day <= end_date
      ) OR EXISTS (
        SELECT 1 FROM public.provider_closures
        WHERE provider_id = v_emp_provider_id
          AND (branch_id IS NULL OR branch_id = v_emp_branch_id)
          AND v_day >= start_date AND v_day <= end_date
      )
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_sched FROM public.employee_day_schedule(target_employee_id, v_emp_provider_id, v_emp_branch_id, v_day);
    IF NOT COALESCE(v_sched.is_working, FALSE) THEN
      CONTINUE;
    END IF;

    FOR v_n IN 1 .. 2 LOOP
      IF v_n = 1 THEN
        v_from := v_sched.shift_start; v_to := v_sched.shift_end;
      ELSE
        IF NOT COALESCE(v_sched.has_second_shift, FALSE) THEN EXIT; END IF;
        v_from := v_sched.second_start; v_to := v_sched.second_end;
      END IF;
      IF v_from IS NULL OR v_to IS NULL THEN
        CONTINUE;
      END IF;

      -- A shift whose end is not after its start runs past midnight into the next calendar day (Riyadh).
      v_shift_start := (v_day + v_from) AT TIME ZONE 'Asia/Riyadh';
      v_shift_end := (CASE WHEN v_to <= v_from THEN v_day + 1 ELSE v_day END + v_to) AT TIME ZONE 'Asia/Riyadh';
      IF v_shift_end <= v_day_start OR v_shift_start >= v_day_end THEN
        CONTINUE;  -- no part of this shift falls on the target day
      END IF;

      v_slot_time := v_shift_start;
      IF v_slot_time < v_day_start THEN
        -- stay on the shift's own 30-minute grid when jumping to the first slot of the target day
        v_slot_time := v_shift_start + ceil(extract(epoch FROM (v_day_start - v_shift_start)) / 1800.0)::int * interval '30 minutes';
      END IF;

      WHILE v_slot_time < v_day_end AND v_slot_time + v_duration <= v_shift_end LOOP
        v_slot_end := v_slot_time + v_duration;
        v_prayer_hit := FALSE;
        IF v_has_windows THEN
          FOR i IN 1 .. array_length(prayer_window_starts, 1) LOOP
            IF v_slot_time < prayer_window_ends[i] AND v_slot_end > prayer_window_starts[i] THEN
              v_prayer_hit := TRUE;
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF NOT v_prayer_hit AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.employee_id = target_employee_id
            AND b.status IN ('confirmed', 'pending_payment')
            AND b.scheduled_at < v_slot_end
            AND (b.scheduled_at + make_interval(mins => b.duration_minutes)) > v_slot_time
        ) THEN
          v_slots := v_slots || v_slot_time;
        END IF;
        v_slot_time := v_slot_time + interval '30 minutes';
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT DISTINCT u.s FROM unnest(v_slots) AS u(s) ORDER BY 1;
END;
$function$;
