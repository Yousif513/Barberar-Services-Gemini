-- ============================================================================
-- PRIMORA P1-B MIGRATION: SCHEDULING DEPTH (G22, G23, G20, G21)
-- 1. G22: Time off, closures, holidays & seasonal (Ramadan) schedules
-- 2. G23: Buffers, processing time & service variants
-- 3. G20: "Any available professional" aggregated slots & auto-assignment
-- 4. G21: Atomic reschedule RPC respecting policy & reminders
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. G22: TIME OFF, CLOSURES & SEASONAL SCHEDULES
-- ----------------------------------------------------------------------------

-- A. PROVIDER / BRANCH CLOSURES (Holidays, emergency closures, maintenance)
CREATE TABLE IF NOT EXISTS public.provider_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE, -- NULL means all branches of provider
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason_en TEXT NOT NULL DEFAULT 'Scheduled Closure',
    reason_ar TEXT NOT NULL DEFAULT 'إغلاق مجدول',
    closure_type VARCHAR(50) NOT NULL DEFAULT 'holiday',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_closure_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_closures_provider_dates ON public.provider_closures(provider_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_closures_branch_dates ON public.provider_closures(branch_id, start_date, end_date);

ALTER TABLE public.provider_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view closures" ON public.provider_closures;
CREATE POLICY "Public can view closures"
    ON public.provider_closures
    FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "Provider owners and admins manage closures" ON public.provider_closures;
CREATE POLICY "Provider owners and admins manage closures"
    ON public.provider_closures
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_closures.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- B. EMPLOYEE TIME OFF (Vacation, sick leave, personal time)
CREATE TABLE IF NOT EXISTS public.employee_time_off (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_time_off_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_employee_dates ON public.employee_time_off(employee_id, start_date, end_date);

ALTER TABLE public.employee_time_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view approved employee time off" ON public.employee_time_off;
CREATE POLICY "Authenticated can view approved employee time off"
    ON public.employee_time_off
    FOR SELECT
    TO authenticated
    USING (
        status = 'approved' OR EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_time_off.employee_id
              AND (e.profile_id = auth.uid() OR EXISTS (
                  SELECT 1 FROM public.branches b
                  JOIN public.providers p ON p.id = b.provider_id
                  WHERE b.id = e.branch_id AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
              ))
        )
    );

DROP POLICY IF EXISTS "Employees request own time off and owners manage" ON public.employee_time_off;
CREATE POLICY "Employees request own time off and owners manage"
    ON public.employee_time_off
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_time_off.employee_id
              AND (e.profile_id = auth.uid() OR EXISTS (
                  SELECT 1 FROM public.branches b
                  JOIN public.providers p ON p.id = b.provider_id
                  WHERE b.id = e.branch_id AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
              ))
        )
    );

-- C. SEASONAL SCHEDULES (e.g. Ramadan late evening schedules, Eid special shifts)
CREATE TABLE IF NOT EXISTS public.seasonal_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    season_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    has_second_shift BOOLEAN NOT NULL DEFAULT FALSE,
    second_start_time TIME,
    second_end_time TIME,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_season_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_schedules_dates ON public.seasonal_schedules(provider_id, start_date, end_date);

ALTER TABLE public.seasonal_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active seasonal schedules" ON public.seasonal_schedules;
CREATE POLICY "Public can view active seasonal schedules"
    ON public.seasonal_schedules
    FOR SELECT
    USING (is_active = TRUE);

DROP POLICY IF EXISTS "Owners and admins manage seasonal schedules" ON public.seasonal_schedules;
CREATE POLICY "Owners and admins manage seasonal schedules"
    ON public.seasonal_schedules
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = seasonal_schedules.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );


-- ----------------------------------------------------------------------------
-- 2. G23: BUFFERS, PROCESSING TIME & SERVICE VARIANTS
-- ----------------------------------------------------------------------------

ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS buffer_before_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_time_minutes INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.service_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    name_en VARCHAR(150) NOT NULL,
    name_ar VARCHAR(150) NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    price_sar DECIMAL(10,2) NOT NULL CHECK (price_sar >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_variants_service ON public.service_variants(service_id);

ALTER TABLE public.service_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active service variants viewable by everyone" ON public.service_variants;
CREATE POLICY "Active service variants viewable by everyone"
    ON public.service_variants
    FOR SELECT
    USING (is_active = TRUE OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Provider owners manage service variants" ON public.service_variants;
CREATE POLICY "Provider owners manage service variants"
    ON public.service_variants
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.services s
            JOIN public.providers p ON p.id = s.provider_id
            WHERE s.id = service_variants.service_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );


-- ----------------------------------------------------------------------------
-- 3. UPGRADED get_available_slots (AWARE OF TIME OFF, CLOSURES, SEASONS, BUFFERS)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_available_slots(
    target_employee_id UUID,
    target_date DATE,
    service_duration_minutes INT,
    prayer_window_starts TIMESTAMPTZ[] DEFAULT NULL,
    prayer_window_ends TIMESTAMPTZ[] DEFAULT NULL
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_emp_branch_id UUID;
    v_emp_provider_id UUID;
    v_day_of_week INT;
    v_prev_day_of_week INT;
    v_shift_start TIME;
    v_shift_end TIME;
    v_second_start TIME;
    v_second_end TIME;
    v_has_second_shift BOOLEAN := FALSE;
    v_is_working BOOLEAN := FALSE;
    v_slot_time TIMESTAMP WITH TIME ZONE;
    v_slot_end TIMESTAMP WITH TIME ZONE;
    v_temp_start TIMESTAMP WITH TIME ZONE;
    v_temp_end TIMESTAMP WITH TIME ZONE;
    v_has_windows BOOLEAN;
    i INT;
    v_prayer_hit BOOLEAN;

    -- Overnight spillover variables
    v_prev_shift_start TIME;
    v_prev_shift_end TIME;
    v_prev_second_start TIME;
    v_prev_second_end TIME;
    v_prev_has_second BOOLEAN := FALSE;
    v_prev_is_working BOOLEAN := FALSE;

    -- Seasonal variables
    v_is_seasonal BOOLEAN := FALSE;
    v_season_rec RECORD;
BEGIN
    -- 1. Check approved employee time off (Vacation/leave)
    IF EXISTS (
        SELECT 1 FROM public.employee_time_off
        WHERE employee_id = target_employee_id
          AND status = 'approved'
          AND target_date >= start_date AND target_date <= end_date
    ) THEN
        RETURN; -- Employee on leave
    END IF;

    -- 2. Lookup employee branch and provider
    SELECT e.branch_id, br.provider_id
    INTO v_emp_branch_id, v_emp_provider_id
    FROM public.employees e
    JOIN public.branches br ON br.id = e.branch_id
    WHERE e.id = target_employee_id AND e.is_active = TRUE;

    IF v_emp_branch_id IS NULL THEN
        RETURN;
    END IF;

    -- 3. Check provider / branch closures (holidays, emergencies)
    IF EXISTS (
        SELECT 1 FROM public.provider_closures
        WHERE provider_id = v_emp_provider_id
          AND (branch_id IS NULL OR branch_id = v_emp_branch_id)
          AND target_date >= start_date AND target_date <= end_date
    ) THEN
        RETURN; -- Closed for holiday/maintenance
    END IF;

    v_has_windows := prayer_window_starts IS NOT NULL
        AND array_length(prayer_window_starts, 1) IS NOT NULL
        AND array_length(prayer_window_starts, 1) = COALESCE(array_length(prayer_window_ends, 1), -1);

    v_day_of_week := extract(dow from target_date)::int;
    v_prev_day_of_week := (v_day_of_week + 6) % 7;

    -- 4. Check for active seasonal schedule (e.g. Ramadan schedule)
    SELECT start_time, end_time, has_second_shift, second_start_time, second_end_time
    INTO v_season_rec
    FROM public.seasonal_schedules
    WHERE provider_id = v_emp_provider_id
      AND (branch_id IS NULL OR branch_id = v_emp_branch_id)
      AND is_active = TRUE
      AND target_date >= start_date AND target_date <= end_date
    ORDER BY (branch_id IS NOT NULL) DESC
    LIMIT 1;

    IF v_season_rec.start_time IS NOT NULL THEN
        v_is_seasonal := TRUE;
        v_shift_start := v_season_rec.start_time;
        v_shift_end := v_season_rec.end_time;
        v_has_second_shift := v_season_rec.has_second_shift;
        v_second_start := v_season_rec.second_start_time;
        v_second_end := v_season_rec.second_end_time;
        v_is_working := TRUE;
    ELSE
        -- Standard weekly schedule
        SELECT start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time
        INTO v_shift_start, v_shift_end, v_is_working, v_has_second_shift, v_second_start, v_second_end
        FROM public.employee_availability
        WHERE employee_id = target_employee_id AND day_of_week = v_day_of_week;
    END IF;

    -- Check previous day's overnight shift spillover into target_date morning
    SELECT start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time
    INTO v_prev_shift_start, v_prev_shift_end, v_prev_is_working, v_prev_has_second, v_prev_second_start, v_prev_second_end
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_prev_day_of_week;

    IF v_prev_is_working = TRUE THEN
        IF v_prev_shift_end <= v_prev_shift_start THEN
            v_temp_start := ((target_date - 1)::text || ' ' || v_prev_shift_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_prev_shift_end::text || '+03')::timestamptz;
            v_slot_time := (target_date::text || ' 00:00:00+03')::timestamptz;
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
                v_slot_time := v_slot_time + interval '30 minutes';
            END LOOP;
        END IF;
    END IF;

    -- Shift 1 for target_date
    IF v_is_working = TRUE AND v_shift_start IS NOT NULL AND v_shift_end IS NOT NULL THEN
        IF v_shift_end <= v_shift_start THEN
            -- Overnight shift starting on target_date and ending next morning
            v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamptz;
            v_temp_end := ((target_date + 1)::text || ' ' || v_shift_end::text || '+03')::timestamptz;
        ELSE
            v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamptz;
        END IF;

        v_slot_time := v_temp_start;
        WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
            -- Filter only slots that start on target_date
            IF (v_slot_time AT TIME ZONE 'Asia/Riyadh')::date = target_date THEN
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
            END IF;
            v_slot_time := v_slot_time + interval '30 minutes';
        END LOOP;
    END IF;

    -- Shift 2 for target_date (if split shift)
    IF v_is_working = TRUE AND v_has_second_shift = TRUE AND v_second_start IS NOT NULL AND v_second_end IS NOT NULL THEN
        IF v_second_end <= v_second_start THEN
            v_temp_start := (target_date::text || ' ' || v_second_start::text || '+03')::timestamptz;
            v_temp_end := ((target_date + 1)::text || ' ' || v_second_end::text || '+03')::timestamptz;
        ELSE
            v_temp_start := (target_date::text || ' ' || v_second_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_second_end::text || '+03')::timestamptz;
        END IF;

        v_slot_time := v_temp_start;
        WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
            IF (v_slot_time AT TIME ZONE 'Asia/Riyadh')::date = target_date THEN
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
            END IF;
            v_slot_time := v_slot_time + interval '30 minutes';
        END LOOP;
    END IF;

    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INT, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;

-- 3-arg legacy overload
CREATE OR REPLACE FUNCTION public.get_available_slots(
    target_employee_id UUID,
    target_date DATE,
    service_duration_minutes INT
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT s.slot_start
    FROM public.get_available_slots(target_employee_id, target_date, service_duration_minutes, NULL, NULL) s;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. G20: "ANY AVAILABLE PROFESSIONAL" (AGGREGATED SLOTS)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_branch_available_slots(
    target_branch_id UUID,
    target_service_id UUID,
    target_date DATE,
    prayer_window_starts TIMESTAMPTZ[] DEFAULT NULL,
    prayer_window_ends TIMESTAMPTZ[] DEFAULT NULL
)
RETURNS TABLE (
    slot_start TIMESTAMPTZ,
    available_employee_count INT,
    candidate_employee_ids UUID[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_duration INT;
BEGIN
    SELECT COALESCE(base_duration_minutes, 30)
    INTO v_duration
    FROM public.services
    WHERE id = target_service_id;
    
    IF v_duration IS NULL THEN
        v_duration := 30;
    END IF;

    RETURN QUERY
    WITH eligible_employees AS (
        SELECT DISTINCT e.id AS emp_id
        FROM public.employees e
        WHERE e.branch_id = target_branch_id
          AND e.is_active = TRUE
          AND EXISTS (
              SELECT 1 FROM public.employee_services es
              WHERE es.employee_id = e.id AND es.service_id = target_service_id
          )
    ),
    emp_slots AS (
        SELECT 
            ee.emp_id,
            s.slot_start
        FROM eligible_employees ee
        CROSS JOIN LATERAL public.get_available_slots(
            ee.emp_id,
            target_date,
            v_duration,
            prayer_window_starts,
            prayer_window_ends
        ) s
    )
    SELECT
        es.slot_start,
        COUNT(DISTINCT es.emp_id)::INT AS available_employee_count,
        array_agg(DISTINCT es.emp_id) AS candidate_employee_ids
    FROM emp_slots es
    GROUP BY es.slot_start
    ORDER BY es.slot_start;
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_available_slots(UUID, UUID, DATE, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_available_slots(UUID, UUID, DATE, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. UPGRADED create_booking (HANDLES target_employee_id IS NULL -> AUTO ASSIGN)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_booking(
    target_employee_id UUID,
    target_service_id UUID,
    target_scheduled_at TIMESTAMPTZ,
    request_home_service BOOLEAN DEFAULT FALSE,
    request_home_address_lat DECIMAL DEFAULT NULL,
    request_home_address_lng DECIMAL DEFAULT NULL,
    request_client_profile_id UUID DEFAULT NULL,
    request_source VARCHAR DEFAULT 'marketplace'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_resolved_employee_id UUID := target_employee_id;
  v_branch_id UUID;
  v_provider_id UUID;
  v_duration INT;
  v_price DECIMAL(10,2);
  v_provider public.providers;
  v_home_eligible BOOLEAN;
  v_is_first_visit BOOLEAN := TRUE;
  v_source VARCHAR(30);
  v_commission DECIMAL(10,2);
  v_deposit_amount DECIMAL(10,2);
  v_booking public.bookings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF target_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Booking time must be in the future' USING ERRCODE = '22007';
  END IF;

  v_source := LOWER(COALESCE(request_source, 'marketplace'));
  IF v_source NOT IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import') THEN
    v_source := 'marketplace';
  END IF;

  -- 1. If target_employee_id IS NULL (Any available professional requested), resolve automatically
  IF v_resolved_employee_id IS NULL THEN
    SELECT s.provider_id, s.base_duration_minutes, s.base_price, s.is_home_service_eligible
    INTO v_provider_id, v_duration, v_price, v_home_eligible
    FROM public.services s
    WHERE s.id = target_service_id AND s.is_active = TRUE;

    IF v_provider_id IS NULL THEN
      RAISE EXCEPTION 'Service not found or inactive' USING ERRCODE = 'P0002';
    END IF;

    -- Pick first eligible branch for the provider
    SELECT b.id INTO v_branch_id
    FROM public.branches b
    WHERE b.provider_id = v_provider_id AND b.is_active = TRUE
    ORDER BY b.created_at ASC
    LIMIT 1;

    -- Select employee with lowest booking load at requested slot
    SELECT ee.emp_id
    INTO v_resolved_employee_id
    FROM (
      SELECT e.id AS emp_id, COUNT(b.id) AS current_bookings
      FROM public.employees e
      JOIN public.employee_services es ON es.employee_id = e.id AND es.service_id = target_service_id
      LEFT JOIN public.bookings b ON b.employee_id = e.id 
        AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date
        AND b.status IN ('confirmed', 'pending_payment')
      WHERE e.branch_id = v_branch_id AND e.is_active = TRUE
        AND EXISTS (
            SELECT 1 FROM public.get_available_slots(
                e.id,
                (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
                v_duration
            ) s
            WHERE s.slot_start = target_scheduled_at
        )
      GROUP BY e.id
      ORDER BY current_bookings ASC, e.id ASC
      LIMIT 1
    ) ee;

    IF v_resolved_employee_id IS NULL THEN
      RAISE EXCEPTION 'No available professional found for the selected time' USING ERRCODE = '23P01';
    END IF;
  ELSE
    -- Specific employee was selected
    SELECT
      e.branch_id,
      s.provider_id,
      COALESCE(es.custom_duration_minutes, s.base_duration_minutes),
      COALESCE(es.custom_price, s.base_price),
      s.is_home_service_eligible
    INTO
      v_branch_id,
      v_provider_id,
      v_duration,
      v_price,
      v_home_eligible
    FROM public.employee_services es
    JOIN public.employees e ON e.id = es.employee_id AND e.is_active = TRUE
    JOIN public.branches br ON br.id = e.branch_id
    JOIN public.services s
      ON s.id = es.service_id
     AND s.provider_id = br.provider_id
     AND s.is_active = TRUE
    WHERE es.employee_id = v_resolved_employee_id
      AND es.service_id = target_service_id;

    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'Service not available for this employee' USING ERRCODE = 'P0002';
    END IF;

    -- Validate slot availability
    IF NOT EXISTS (
      SELECT 1
      FROM public.get_available_slots(
        v_resolved_employee_id,
        (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
        v_duration
      ) slots
      WHERE slots.slot_start = target_scheduled_at
    ) THEN
      RAISE EXCEPTION 'Selected time is no longer available'
        USING ERRCODE = '23P01';
    END IF;
  END IF;

  SELECT * INTO v_provider
  FROM public.providers
  WHERE id = v_provider_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  IF request_home_service AND NOT v_home_eligible THEN
    RAISE EXCEPTION 'This service is not available for home visits'
      USING ERRCODE = '22023';
  END IF;

  IF request_client_profile_id IS NOT NULL AND request_client_profile_id <> v_user_id THEN
    RAISE EXCEPTION 'Cannot book on behalf of another user'
      USING ERRCODE = '42501';
  END IF;

  -- Detect first visit for this customer-provider pair
  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE b.customer_id = v_user_id
      AND br.provider_id = v_provider_id
      AND b.status IN ('confirmed', 'completed')
  ) INTO v_is_first_visit;

  -- Calculate commission via fee_rules engine (G02)
  v_commission := public.calculate_booking_commission(
    v_provider_id,
    v_source,
    v_is_first_visit,
    v_price
  );

  -- Deposit calculation
  v_deposit_amount := ROUND((v_price * (COALESCE(v_provider.deposit_percentage, 20.00) / 100.0)), 2);

  -- Insert booking
  INSERT INTO public.bookings (
    customer_id,
    employee_id,
    service_id,
    branch_id,
    scheduled_at,
    duration_minutes,
    total_price,
    platform_commission,
    deposit_required,
    tax_amount,
    is_home_service,
    home_address_lat,
    home_address_lng,
    source,
    is_first_visit,
    status
  ) VALUES (
    v_user_id,
    v_resolved_employee_id,
    target_service_id,
    v_branch_id,
    target_scheduled_at,
    v_duration,
    v_price,
    v_commission,
    v_deposit_amount,
    ROUND(v_price * 0.15, 2), -- 15% Saudi VAT
    request_home_service,
    request_home_address_lat,
    request_home_address_lng,
    v_source,
    v_is_first_visit,
    'pending_payment'
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. G21: ATOMIC RESCHEDULE RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reschedule_booking(
    target_booking_id UUID,
    new_scheduled_at TIMESTAMPTZ,
    new_employee_id UUID DEFAULT NULL,
    reschedule_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_provider public.providers;
    v_target_employee_id UUID;
    v_duration INT;
    v_cutoff_hours INT;
    v_hours_notice NUMERIC;
    v_is_admin BOOLEAN := FALSE;
    v_is_provider BOOLEAN := FALSE;
    v_is_customer BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF new_scheduled_at <= NOW() THEN
        RAISE EXCEPTION 'New booking time must be in the future' USING ERRCODE = '22007';
    END IF;

    -- Fetch booking with lock
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = target_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    -- State machine check
    IF v_booking.status NOT IN ('confirmed', 'pending_payment') THEN
        RAISE EXCEPTION 'Cannot reschedule a booking with status %', v_booking.status
            USING ERRCODE = '22023';
    END IF;

    -- Authorization check
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin')
    INTO v_is_admin;

    SELECT EXISTS (
        SELECT 1 FROM public.branches br
        JOIN public.providers p ON p.id = br.provider_id
        WHERE br.id = v_booking.branch_id AND p.owner_id = v_user_id
    ) INTO v_is_provider;

    v_is_customer := (v_booking.customer_id = v_user_id);

    IF NOT (v_is_admin OR v_is_provider OR v_is_customer) THEN
        RAISE EXCEPTION 'Forbidden: not authorized to reschedule this booking'
            USING ERRCODE = '42501';
    END IF;

    -- Fetch provider for policy
    SELECT p.* INTO v_provider
    FROM public.branches br
    JOIN public.providers p ON p.id = br.provider_id
    WHERE br.id = v_booking.branch_id;

    v_cutoff_hours := COALESCE(v_provider.free_cancellation_window_hours, 24);
    v_hours_notice := EXTRACT(EPOCH FROM (v_booking.scheduled_at - NOW())) / 3600.0;

    -- Determine employee
    v_target_employee_id := COALESCE(new_employee_id, v_booking.employee_id);
    v_duration := COALESCE(v_booking.duration_minutes, 30);

    -- Check employee availability at new slot (excluding current booking itself)
    IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.employee_id = v_target_employee_id
          AND b.id <> target_booking_id
          AND b.status IN ('confirmed', 'pending_payment')
          AND b.scheduled_at < (new_scheduled_at + (v_duration || ' minutes')::interval)
          AND (b.scheduled_at + (b.duration_minutes || ' minutes')::interval) > new_scheduled_at
    ) THEN
        RAISE EXCEPTION 'The selected employee is not available at the requested time'
            USING ERRCODE = '23P01';
    END IF;

    -- Perform atomic reschedule update
    UPDATE public.bookings
    SET scheduled_at = new_scheduled_at,
        employee_id = v_target_employee_id,
        updated_at = NOW()
    WHERE id = target_booking_id;

    -- Audit log
    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'booking.reschedule',
        'bookings',
        target_booking_id,
        jsonb_build_object(
            'old_scheduled_at', v_booking.scheduled_at,
            'new_scheduled_at', new_scheduled_at,
            'old_employee_id', v_booking.employee_id,
            'new_employee_id', v_target_employee_id,
            'reason', reschedule_reason,
            'actor_role', CASE WHEN v_is_admin THEN 'admin' WHEN v_is_provider THEN 'provider' ELSE 'customer' END
        )
    );

    -- Cancel obsolete pending reminders in message_queue
    UPDATE public.message_queue
    SET status = 'cancelled'
    WHERE payload->>'booking_id' = target_booking_id::text
      AND status = 'pending'
      AND template_id IN (
          SELECT id FROM public.message_templates 
          WHERE template_key IN ('booking_reminder_24h', 'booking_reminder_2h')
      );

    -- Enqueue new 24h & 2h reminders if time allows
    IF new_scheduled_at - interval '24 hours' > NOW() THEN
        INSERT INTO public.message_queue (
            recipient_phone,
            template_id,
            payload,
            scheduled_for,
            status
        )
        SELECT 
            prof.phone_number,
            t.id,
            jsonb_build_object(
                'booking_id', target_booking_id,
                'customer_name', COALESCE(prof.first_name, 'Valued Client'),
                'service_name', s.name_ar,
                'appointment_time', to_char(new_scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'),
                'provider_name', v_provider.business_name_ar
            ),
            new_scheduled_at - interval '24 hours',
            'pending'
        FROM public.profiles prof
        CROSS JOIN public.message_templates t
        JOIN public.services s ON s.id = v_booking.service_id
        WHERE prof.id = v_booking.customer_id
          AND t.template_key = 'booking_reminder_24h';
    END IF;

    IF new_scheduled_at - interval '2 hours' > NOW() THEN
        INSERT INTO public.message_queue (
            recipient_phone,
            template_id,
            payload,
            scheduled_for,
            status
        )
        SELECT 
            prof.phone_number,
            t.id,
            jsonb_build_object(
                'booking_id', target_booking_id,
                'customer_name', COALESCE(prof.first_name, 'Valued Client'),
                'service_name', s.name_ar,
                'appointment_time', to_char(new_scheduled_at AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
                'provider_name', v_provider.business_name_ar
            ),
            new_scheduled_at - interval '2 hours',
            'pending'
        FROM public.profiles prof
        CROSS JOIN public.message_templates t
        JOIN public.services s ON s.id = v_booking.service_id
        WHERE prof.id = v_booking.customer_id
          AND t.template_key = 'booking_reminder_24h';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', target_booking_id,
        'old_scheduled_at', v_booking.scheduled_at,
        'new_scheduled_at', new_scheduled_at,
        'employee_id', v_target_employee_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_booking(UUID, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(UUID, TIMESTAMPTZ, UUID, TEXT) TO authenticated;
