-- Migration: 20261003220000_booking_rules_and_money.sql
-- Description: P0-D Booking rules & money (G17, G10, G02, G14, G12)
-- 1. Overnight shifts (21:00 - 02:00) in get_available_slots (G17)
-- 2. Per-provider cancellation & no-show policy enforcement (G10)
-- 3. Dynamic fee_rules table replacing hardcoded 15% commission (G02)
-- 4. Atomic admin_release_payout & request_provider_payout with idempotency and audit logging (G14, G12)
-- 5. Feature flags for payments_marketplace_split (default OFF per Report 15)

-- ============================================================================
-- 1. OVERNIGHT SHIFTS IN get_available_slots (G17)
-- ============================================================================

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
    v_day_of_week INT;
    v_prev_day_of_week INT;
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

    -- For previous day overnight spillover into target_date morning
    v_prev_shift_start TIME;
    v_prev_shift_end TIME;
    v_prev_second_start TIME;
    v_prev_second_end TIME;
    v_prev_has_second BOOLEAN;
    v_prev_is_working BOOLEAN;
BEGIN
    v_has_windows := prayer_window_starts IS NOT NULL
        AND array_length(prayer_window_starts, 1) IS NOT NULL
        AND array_length(prayer_window_starts, 1) = COALESCE(array_length(prayer_window_ends, 1), -1);

    v_day_of_week := extract(dow from target_date)::int;
    v_prev_day_of_week := (v_day_of_week + 6) % 7;

    -- Part A: Check if previous day had an overnight shift ending on target_date morning
    SELECT start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time
    INTO v_prev_shift_start, v_prev_shift_end, v_prev_is_working, v_prev_has_second, v_prev_second_start, v_prev_second_end
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_prev_day_of_week;

    IF v_prev_is_working = TRUE THEN
        -- Check previous day's shift 1 overnight
        IF v_prev_shift_end <= v_prev_shift_start THEN
            v_temp_start := ((target_date - 1)::text || ' ' || v_prev_shift_start::text || '+03')::timestamptz;
            v_temp_end := (target_date::text || ' ' || v_prev_shift_end::text || '+03')::timestamptz;
            -- Only generate slots that fall on target_date (>= target_date 00:00)
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
                v_slot_time := v_slot_time + interval '15 minutes';
            END LOOP;
        END IF;

        -- Check previous day's shift 2 overnight
        IF COALESCE(v_prev_has_second, FALSE) = TRUE AND v_prev_second_start IS NOT NULL AND v_prev_second_end IS NOT NULL THEN
            IF v_prev_second_end <= v_prev_second_start THEN
                v_temp_start := ((target_date - 1)::text || ' ' || v_prev_second_start::text || '+03')::timestamptz;
                v_temp_end := (target_date::text || ' ' || v_prev_second_end::text || '+03')::timestamptz;
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
                    v_slot_time := v_slot_time + interval '15 minutes';
                END LOOP;
            END IF;
        END IF;
    END IF;

    -- Part B: Check shifts starting on target_date
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
            -- Overnight shift detection: if end <= start, end is on the next calendar day
            IF v_shift_end <= v_shift_start THEN
                v_temp_end := ((target_date + 1)::text || ' ' || v_shift_end::text || '+03')::timestamptz;
            ELSE
                v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamptz;
            END IF;
        ELSE
            IF COALESCE(v_has_second_shift, FALSE) = FALSE OR v_second_start IS NULL OR v_second_end IS NULL THEN
                CONTINUE;
            END IF;
            v_temp_start := (target_date::text || ' ' || v_second_start::text || '+03')::timestamptz;
            IF v_second_end <= v_second_start THEN
                v_temp_end := ((target_date + 1)::text || ' ' || v_second_end::text || '+03')::timestamptz;
            ELSE
                v_temp_end := (target_date::text || ' ' || v_second_end::text || '+03')::timestamptz;
            END IF;
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

-- Overload for backwards compatibility with 3-arg callers
CREATE OR REPLACE FUNCTION public.get_available_slots(
    target_employee_id UUID,
    target_date DATE,
    service_duration_minutes INT
)
RETURNS TABLE (slot_start TIMESTAMP WITH TIME ZONE)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT slot_start
    FROM public.get_available_slots(target_employee_id, target_date, service_duration_minutes, NULL, NULL);
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(UUID, DATE, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INT) TO authenticated;

-- ============================================================================
-- 2. PER-PROVIDER CANCELLATION & NO-SHOW POLICY (G10)
-- ============================================================================

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS free_cancellation_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS late_cancellation_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS no_show_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS deposit_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;

-- Enhanced cancel_booking enforcing provider cancellation window
CREATE OR REPLACE FUNCTION public.cancel_booking(
    target_booking_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by customer'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_provider public.providers;
    v_hours_until_booking NUMERIC;
    v_cancellation_fee DECIMAL(10,2) := 0.00;
    v_refund_amount DECIMAL(10,2) := 0.00;
    v_is_admin BOOLEAN := public.is_admin();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT b.* INTO v_booking
    FROM public.bookings b
    WHERE b.id = target_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller authority: booking owner, provider owner, or admin
    IF NOT v_is_admin AND v_booking.customer_id <> v_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.branches br
            JOIN public.providers p ON p.id = br.provider_id
            WHERE br.id = v_booking.branch_id AND p.owner_id = v_user_id
        ) THEN
            RAISE EXCEPTION 'Not authorized to cancel this booking.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_booking.status NOT IN ('pending_payment', 'confirmed') THEN
        RAISE EXCEPTION 'Booking cannot be cancelled in its current state (%s).', v_booking.status
            USING ERRCODE = '22023';
    END IF;

    -- Load provider policy
    SELECT p.* INTO v_provider
    FROM public.branches br
    JOIN public.providers p ON p.id = br.provider_id
    WHERE br.id = v_booking.branch_id;

    -- Calculate hours remaining until appointment
    v_hours_until_booking := EXTRACT(EPOCH FROM (v_booking.scheduled_at - CURRENT_TIMESTAMP)) / 3600.0;

    -- Enforce cancellation policy:
    -- If booking has already captured deposit/payment, determine penalty vs refund
    IF v_booking.status = 'confirmed' AND v_booking.deposit_required > 0 THEN
        IF v_hours_until_booking >= COALESCE(v_provider.free_cancellation_hours, 24) THEN
            -- Free cancellation window: 100% refund, 0 fee
            v_cancellation_fee := 0.00;
            v_refund_amount := v_booking.deposit_required;
        ELSE
            -- Late cancellation fee applied based on provider percentage
            v_cancellation_fee := ROUND(v_booking.deposit_required * (COALESCE(v_provider.late_cancellation_fee_percent, 50.00) / 100.0), 2);
            v_refund_amount := GREATEST(0.00, v_booking.deposit_required - v_cancellation_fee);
        END IF;
    ELSE
        -- Pending payment: no captured money to refund
        v_cancellation_fee := 0.00;
        v_refund_amount := 0.00;
    END IF;

    UPDATE public.bookings
    SET status = 'cancelled',
        cancelled_at = CURRENT_TIMESTAMP,
        cancellation_reason = COALESCE(p_reason, 'Cancelled'),
        cancellation_fee = v_cancellation_fee,
        refund_amount = v_refund_amount
    WHERE id = target_booking_id
    RETURNING * INTO v_booking;

    -- Log to admin audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        payload
    )
    VALUES (
        v_user_id,
        'cancel_booking',
        'bookings',
        target_booking_id,
        jsonb_build_object(
            'cancelled_by', v_user_id,
            'is_admin', v_is_admin,
            'hours_until_booking', v_hours_until_booking,
            'cancellation_fee', v_cancellation_fee,
            'refund_amount', v_refund_amount,
            'reason', p_reason
        )
    );

    RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(UUID, TEXT) TO authenticated;

-- Mark booking as no-show
CREATE OR REPLACE FUNCTION public.mark_booking_no_show(
    target_booking_id UUID,
    p_reason TEXT DEFAULT 'Customer did not show up'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_provider public.providers;
    v_no_show_fee DECIMAL(10,2);
    v_refund_amount DECIMAL(10,2);
    v_is_admin BOOLEAN := public.is_admin();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    SELECT b.* INTO v_booking
    FROM public.bookings b
    WHERE b.id = target_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller authority: provider owner/staff or admin
    IF NOT v_is_admin THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.branches br
            JOIN public.providers p ON p.id = br.provider_id
            WHERE br.id = v_booking.branch_id AND p.owner_id = v_user_id
        ) THEN
            RAISE EXCEPTION 'Not authorized to mark no-show for this booking.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_booking.status <> 'confirmed' THEN
        RAISE EXCEPTION 'Only confirmed bookings can be marked as no-show.' USING ERRCODE = '22023';
    END IF;

    -- Load provider policy
    SELECT p.* INTO v_provider
    FROM public.branches br
    JOIN public.providers p ON p.id = br.provider_id
    WHERE br.id = v_booking.branch_id;

    -- No-show fee retains full deposit or defined percentage
    v_no_show_fee := ROUND(v_booking.deposit_required * (COALESCE(v_provider.no_show_fee_percent, 100.00) / 100.0), 2);
    v_refund_amount := GREATEST(0.00, v_booking.deposit_required - v_no_show_fee);

    UPDATE public.bookings
    SET status = 'no_show',
        no_show_at = CURRENT_TIMESTAMP,
        cancellation_reason = COALESCE(p_reason, 'No-show'),
        cancellation_fee = v_no_show_fee,
        refund_amount = v_refund_amount
    WHERE id = target_booking_id
    RETURNING * INTO v_booking;

    -- Log to admin audit log
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        payload
    )
    VALUES (
        v_user_id,
        'mark_no_show',
        'bookings',
        target_booking_id,
        jsonb_build_object(
            'marked_by', v_user_id,
            'is_admin', v_is_admin,
            'no_show_fee', v_no_show_fee,
            'refund_amount', v_refund_amount,
            'reason', p_reason
        )
    );

    RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_no_show(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_booking_no_show(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. DYNAMIC FEE-RULES TABLE & COMMISSION ENGINE (G02)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fee_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import')),
    is_first_visit BOOLEAN, -- NULL means applies to any visit type
    fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00 CHECK (fee_percentage >= 0.00 AND fee_percentage <= 100.00),
    min_fee_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    max_fee_sar DECIMAL(10,2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (channel, is_first_visit)
);

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fee rules readable by authenticated users"
  ON public.fee_rules
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Fee rules manageable by admins"
  ON public.fee_rules
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default fee rules:
-- Direct / Private Channels: 0% Platform Commission
INSERT INTO public.fee_rules (channel, is_first_visit, fee_percentage, min_fee_sar, max_fee_sar, description)
VALUES
  ('link', NULL, 0.00, 0.00, 0.00, 'Direct provider link booking - 0% platform commission guarantee'),
  ('qr', NULL, 0.00, 0.00, 0.00, 'Direct provider QR code scan - 0% platform commission guarantee'),
  ('whatsapp', NULL, 0.00, 0.00, 0.00, 'Direct provider WhatsApp channel - 0% platform commission guarantee'),
  ('instagram', NULL, 0.00, 0.00, 0.00, 'Direct provider Instagram bio link - 0% platform commission guarantee'),
  ('walk_in', NULL, 0.00, 0.00, 0.00, 'Walk-in client registered by salon staff - 0% platform commission'),
  ('import', NULL, 0.00, 0.00, 0.00, 'Imported client list booking - 0% platform commission'),
  -- Marketplace: First visit customer acquisition hypothesis (Report 14: 20%, min SAR 10, max SAR 40)
  ('marketplace', TRUE, 20.00, 10.00, 40.00, 'Marketplace customer acquisition (first visit) - Subject to commercial confirmation'),
  -- Marketplace: Repeat visits
  ('marketplace', FALSE, 10.00, 0.00, 30.00, 'Marketplace repeat booking - Subject to commercial confirmation')
ON CONFLICT (channel, is_first_visit) DO UPDATE
SET fee_percentage = EXCLUDED.fee_percentage,
    min_fee_sar = EXCLUDED.min_fee_sar,
    max_fee_sar = EXCLUDED.max_fee_sar;

-- Helper function to calculate platform commission from fee rules
CREATE OR REPLACE FUNCTION public.calculate_booking_platform_commission(
    p_channel VARCHAR,
    p_is_first_visit BOOLEAN,
    p_price DECIMAL,
    p_provider_id UUID DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_rule public.fee_rules;
    v_raw_fee DECIMAL(10,2);
    v_final_fee DECIMAL(10,2);
BEGIN
    -- Direct provider sources are always 0% commission
    IF p_channel IN ('link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import') THEN
        RETURN 0.00;
    END IF;

    -- Lookup specific rule matching channel and first_visit
    SELECT * INTO v_rule
    FROM public.fee_rules
    WHERE channel = p_channel
      AND is_active = TRUE
      AND (is_first_visit = p_is_first_visit OR is_first_visit IS NULL)
    ORDER BY is_first_visit NULLS LAST
    LIMIT 1;

    IF v_rule.id IS NULL THEN
        -- Fallback default 15% if no rule matches
        v_raw_fee := ROUND(p_price * 0.15, 2);
        RETURN v_raw_fee;
    END IF;

    v_raw_fee := ROUND(p_price * (v_rule.fee_percentage / 100.0), 2);
    v_final_fee := GREATEST(v_rule.min_fee_sar, v_raw_fee);

    IF v_rule.max_fee_sar IS NOT NULL THEN
        v_final_fee := LEAST(v_rule.max_fee_sar, v_final_fee);
    END IF;

    RETURN v_final_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_booking_platform_commission(VARCHAR, BOOLEAN, DECIMAL, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_booking_platform_commission(VARCHAR, BOOLEAN, DECIMAL, UUID) TO authenticated;

-- Replace protect_provider_control_fields to remove hardcoded 15.00 override
CREATE OR REPLACE FUNCTION public.protect_provider_control_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := auth.uid();
    NEW.is_verified := FALSE;
    -- Do not force commission_percentage to 15.00; allow custom provider setting or default
    NEW.commission_percentage := COALESCE(NEW.commission_percentage, 15.00);
  ELSE
    NEW.owner_id := OLD.owner_id;
    NEW.is_verified := OLD.is_verified;
    NEW.commission_percentage := OLD.commission_percentage;
  END IF;

  RETURN NEW;
END;
$$;

-- Upgrade create_booking to use fee_rules and provider deposit percentage
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
  WHERE es.employee_id = target_employee_id
    AND es.service_id = target_service_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Employee and service combination is unavailable'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_provider
  FROM public.providers
  WHERE id = v_provider_id AND is_verified = TRUE;

  IF v_provider.id IS NULL THEN
    RAISE EXCEPTION 'Service provider is not currently active or verified.'
      USING ERRCODE = '22023';
  END IF;

  IF request_home_service AND NOT v_home_eligible THEN
    RAISE EXCEPTION 'This service is not available as a home service'
      USING ERRCODE = '22023';
  END IF;

  IF request_home_service
     AND (request_home_address_lat IS NULL OR request_home_address_lng IS NULL) THEN
    RAISE EXCEPTION 'Home-service coordinates are required'
      USING ERRCODE = '22023';
  END IF;

  IF request_client_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.id = request_client_profile_id
      AND cp.client_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Client profile does not belong to the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_available_slots(
      target_employee_id,
      (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
      v_duration
    ) slots
    WHERE slots.slot_start = target_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Selected time is no longer available'
      USING ERRCODE = '23P01';
  END IF;

  -- Detect first visit for this customer-provider pair
  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE b.customer_id = v_user_id
      AND br.provider_id = v_provider_id
      AND b.status IN ('confirmed', 'completed')
  ) INTO v_is_first_visit;

  -- Calculate dynamic platform commission from fee rules table
  v_commission := public.calculate_booking_platform_commission(v_source, v_is_first_visit, v_price, v_provider_id);

  -- Deposit based on provider policy (default 20%)
  v_deposit_amount := ROUND(v_price * (COALESCE(v_provider.deposit_percentage, 20.00) / 100.0), 2);

  -- Ensure commission is capped at captured deposit
  v_commission := LEAST(v_commission, v_deposit_amount);

  INSERT INTO public.bookings (
    customer_id,
    branch_id,
    employee_id,
    service_id,
    status,
    is_home_service,
    home_address_lat,
    home_address_lng,
    scheduled_at,
    duration_minutes,
    total_price,
    deposit_required,
    tax_amount,
    platform_commission,
    client_profile_id,
    source,
    is_first_visit
  )
  VALUES (
    v_user_id,
    v_branch_id,
    target_employee_id,
    target_service_id,
    'pending_payment',
    request_home_service,
    request_home_address_lat,
    request_home_address_lng,
    target_scheduled_at,
    v_duration,
    v_price,
    v_deposit_amount,
    ROUND(v_price * 0.15, 2), -- 15% Saudi VAT
    v_commission,
    request_client_profile_id,
    v_source,
    v_is_first_visit
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Selected time is no longer available'
      USING ERRCODE = '23P01';
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) TO authenticated;

-- ============================================================================
-- 4. ATOMIC SERVER-SIDE PAYOUT RELEASE WITH AUDIT LOG & IDEMPOTENCY (G14, G12)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_release_payout(
    p_payout_request_id UUID,
    p_idempotency_key TEXT,
    p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_request RECORD;
    v_target_amount DECIMAL(10,2);
    v_covered_amount DECIMAL(10,2) := 0.00;
    v_ledger_entry RECORD;
    v_ledger_ids UUID[] := '{}';
    v_existing_audit RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only administrators can release payouts.' USING ERRCODE = '42501';
    END IF;

    IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
        RAISE EXCEPTION 'Idempotency key is required for payout release.' USING ERRCODE = '22023';
    END IF;

    -- Check for idempotency replay
    SELECT payload INTO v_existing_audit
    FROM public.admin_audit_logs
    WHERE action = 'admin_release_payout'
      AND payload->>'idempotency_key' = p_idempotency_key
    LIMIT 1;

    IF v_existing_audit.payload IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'already_processed',
            'idempotent', true,
            'details', v_existing_audit.payload
        );
    END IF;

    -- Lock the payout request
    SELECT * INTO v_request
    FROM public.payout_requests
    WHERE id = p_payout_request_id
    FOR UPDATE;

    IF v_request.id IS NULL THEN
        RAISE EXCEPTION 'Payout request not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_request.status = 'paid' THEN
        RAISE EXCEPTION 'Payout request is already marked as paid.' USING ERRCODE = '23505';
    END IF;

    v_target_amount := v_request.amount;

    -- Lock and gather eligible pending ledger entries for this provider
    FOR v_ledger_entry IN
        SELECT tl.id, tl.provider_share
        FROM public.transactional_ledger tl
        JOIN public.bookings b ON b.id = tl.booking_id
        JOIN public.branches br ON br.id = b.branch_id
        WHERE br.provider_id = v_request.provider_id
          AND tl.payout_status = 'pending'
        ORDER BY tl.created_at ASC
        FOR UPDATE OF tl
    LOOP
        IF v_covered_amount >= v_target_amount THEN
            EXIT;
        END IF;

        v_ledger_ids := array_append(v_ledger_ids, v_ledger_entry.id);
        v_covered_amount := v_covered_amount + v_ledger_entry.provider_share;
    END LOOP;

    IF array_length(v_ledger_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'No pending ledger coverage available for this provider.' USING ERRCODE = '22023';
    END IF;

    -- 1. Update transactional ledger rows to released
    UPDATE public.transactional_ledger
    SET payout_status = 'released'
    WHERE id = ANY(v_ledger_ids);

    -- 2. Update payout request to paid
    UPDATE public.payout_requests
    SET status = 'paid',
        processed_at = CURRENT_TIMESTAMP,
        admin_note = COALESCE(p_admin_note, 'Released ' || v_covered_amount::text || ' SAR across ' || array_length(v_ledger_ids, 1)::text || ' ledger rows.')
    WHERE id = p_payout_request_id;

    -- 3. Write immutable admin audit log in the same transaction
    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        payload
    )
    VALUES (
        v_admin_id,
        'admin_release_payout',
        'payout_requests',
        p_payout_request_id,
        jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'payout_request_id', p_payout_request_id,
            'provider_id', v_request.provider_id,
            'requested_amount', v_target_amount,
            'released_amount', v_covered_amount,
            'ledger_rows_count', array_length(v_ledger_ids, 1),
            'ledger_ids', v_ledger_ids,
            'admin_note', p_admin_note
        )
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'payout_request_id', p_payout_request_id,
        'released_amount', v_covered_amount,
        'ledger_rows_count', array_length(v_ledger_ids, 1)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_release_payout(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_payout(UUID, TEXT, TEXT) TO authenticated;

-- Server RPC for provider payout requests (replacing direct browser inserts)
CREATE OR REPLACE FUNCTION public.request_provider_payout(
    p_provider_id UUID,
    p_amount DECIMAL,
    p_bank_name TEXT,
    p_iban TEXT
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_iban TEXT;
    v_available_balance DECIMAL(10,2);
    v_request public.payout_requests;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '28000';
    END IF;

    -- Verify caller owns the provider
    IF NOT EXISTS (
        SELECT 1 FROM public.providers
        WHERE id = p_provider_id AND owner_id = v_user_id
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Not authorized to request payouts for this provider.' USING ERRCODE = '42501';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payout amount must be greater than zero.' USING ERRCODE = '22023';
    END IF;

    v_clean_iban := UPPER(regexp_replace(COALESCE(p_iban, ''), '\s+', '', 'g'));
    IF length(v_clean_iban) <> 24 OR NOT (v_clean_iban ~ '^SA[0-9]{22}$') THEN
        RAISE EXCEPTION 'Invalid Saudi IBAN format. Must start with SA followed by 22 digits.' USING ERRCODE = '22023';
    END IF;

    -- Verify sufficient pending balance
    SELECT COALESCE(SUM(tl.provider_share), 0.00) INTO v_available_balance
    FROM public.transactional_ledger tl
    JOIN public.bookings b ON b.id = tl.booking_id
    JOIN public.branches br ON br.id = b.branch_id
    WHERE br.provider_id = p_provider_id
      AND tl.payout_status = 'pending';

    IF v_available_balance < p_amount THEN
        RAISE EXCEPTION 'Requested amount (%s SAR) exceeds pending available balance (%s SAR).', p_amount, v_available_balance
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.payout_requests (
        provider_id,
        requested_by,
        amount,
        bank_name,
        iban,
        status
    )
    VALUES (
        p_provider_id,
        v_user_id,
        p_amount,
        trim(p_bank_name),
        v_clean_iban,
        'requested'
    )
    RETURNING * INTO v_request;

    RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.request_provider_payout(UUID, DECIMAL, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_provider_payout(UUID, DECIMAL, TEXT, TEXT) TO authenticated;

-- Single ledger row payout release with admin audit logging
CREATE OR REPLACE FUNCTION public.admin_release_ledger_item(
    p_ledger_id UUID,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_ledger public.transactional_ledger;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only administrators can release ledger payouts.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_ledger
    FROM public.transactional_ledger
    WHERE id = p_ledger_id
    FOR UPDATE;

    IF v_ledger.id IS NULL THEN
        RAISE EXCEPTION 'Ledger entry not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_ledger.payout_status = 'released' THEN
        RETURN jsonb_build_object('status', 'already_released', 'id', p_ledger_id);
    END IF;

    UPDATE public.transactional_ledger
    SET payout_status = 'released'
    WHERE id = p_ledger_id;

    INSERT INTO public.admin_audit_logs (
        actor_id,
        action,
        entity_name,
        entity_id,
        payload
    )
    VALUES (
        v_admin_id,
        'admin_release_ledger_item',
        'transactional_ledger',
        p_ledger_id,
        jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'ledger_id', p_ledger_id,
            'provider_share', v_ledger.provider_share
        )
    );

    RETURN jsonb_build_object('status', 'success', 'id', p_ledger_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_release_ledger_item(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_ledger_item(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 5. FEATURE FLAGS TABLE (payments_marketplace_split = false per Report 15)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_feature_flags (
    flag_key VARCHAR(100) PRIMARY KEY,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Feature flags readable by authenticated users"
  ON public.platform_feature_flags
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Feature flags manageable by admins"
  ON public.platform_feature_flags
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.platform_feature_flags (flag_key, is_enabled, description)
VALUES
  ('payments_marketplace_split', FALSE, 'Tap Marketplace sub-merchant onboarding and split at capture (OFF until owner confirms legal opinion on fund custody)')
ON CONFLICT (flag_key) DO NOTHING;
