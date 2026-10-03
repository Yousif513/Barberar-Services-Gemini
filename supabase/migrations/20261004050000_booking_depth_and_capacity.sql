-- ============================================================================
-- Migration: 20261004050000_booking_depth_and_capacity.sql
-- Milestone: P2-A · Booking Depth & Capacity
-- Covers:
--   - G44: Waitlist System (Time-frame waitlist, backfill on cancellation, 15m claim)
--   - G51: Multi-Service Booking (Cart / sequential services, booking_services table)
--   - G53: Walk-In Quick Entry & Counter Checkout (no POS hardware required)
--   - G58: Customer-Facing Prayer Window Indicators on Booking Slots
--   - G57: Customer Block List & No-Show Strike Enforcement Rules
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. G44: WAITLIST SYSTEM & AUTOMATED CANCELLATION BACKFILL
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.waitlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    preferred_date DATE NOT NULL,
    preferred_time_start TIME NOT NULL,
    preferred_time_end TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'notified', 'claimed', 'expired', 'cancelled')),
    notified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT valid_preferred_time CHECK (preferred_time_end > preferred_time_start)
);

CREATE INDEX IF NOT EXISTS idx_waitlists_lookup 
    ON public.waitlists(branch_id, preferred_date, status);
CREATE INDEX IF NOT EXISTS idx_waitlists_customer 
    ON public.waitlists(customer_id, status);

ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own waitlist entries" ON public.waitlists;
CREATE POLICY "Customers view own waitlist entries"
    ON public.waitlists
    FOR SELECT
    TO authenticated
    USING (
        customer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.branches br
            JOIN public.providers p ON p.id = br.provider_id
            WHERE br.id = waitlists.branch_id
              AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Customers insert own waitlist requests" ON public.waitlists;
CREATE POLICY "Customers insert own waitlist requests"
    ON public.waitlists
    FOR INSERT
    TO authenticated
    WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Customers and providers cancel waitlist entries" ON public.waitlists;
CREATE POLICY "Customers and providers cancel waitlist entries"
    ON public.waitlists
    FOR UPDATE
    TO authenticated
    USING (
        customer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.branches br
            JOIN public.providers p ON p.id = br.provider_id
            WHERE br.id = waitlists.branch_id
              AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- RPC: Join Waitlist
CREATE OR REPLACE FUNCTION public.join_waitlist(
    p_branch_id UUID,
    p_service_id UUID,
    p_employee_id UUID,
    p_preferred_date DATE,
    p_preferred_time_start TIME,
    p_preferred_time_end TIME
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_waitlist_id UUID;
    v_position INT;
    v_actual_branch_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to join waitlist' USING ERRCODE = '28000';
    END IF;

    IF p_preferred_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'Waitlist date must be today or in the future' USING ERRCODE = '22023';
    END IF;

    IF p_preferred_time_end <= p_preferred_time_start THEN
        RAISE EXCEPTION 'End time must be after start time' USING ERRCODE = '22023';
    END IF;

    -- Resolve branch (accepts either branch_id or provider_id)
    SELECT id INTO v_actual_branch_id
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_actual_branch_id IS NULL THEN
        SELECT id INTO v_actual_branch_id
        FROM public.branches
        WHERE provider_id = p_branch_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_actual_branch_id IS NULL THEN
        RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
    END IF;

    -- Avoid duplicate active entries for same client, branch, and date
    IF EXISTS (
        SELECT 1 FROM public.waitlists
        WHERE customer_id = v_user_id
          AND branch_id = v_actual_branch_id
          AND service_id = p_service_id
          AND preferred_date = p_preferred_date
          AND status IN ('active', 'notified')
    ) THEN
        RAISE EXCEPTION 'Already on active waitlist for this service and date' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.waitlists (
        customer_id,
        branch_id,
        service_id,
        employee_id,
        preferred_date,
        preferred_time_start,
        preferred_time_end,
        status
    ) VALUES (
        v_user_id,
        v_actual_branch_id,
        p_service_id,
        p_employee_id,
        p_preferred_date,
        p_preferred_time_start,
        p_preferred_time_end,
        'active'
    ) RETURNING id INTO v_waitlist_id;

    -- Calculate position in queue
    SELECT COUNT(*) INTO v_position
    FROM public.waitlists
    WHERE branch_id = v_actual_branch_id
      AND preferred_date = p_preferred_date
      AND status = 'active'
      AND created_at <= (SELECT created_at FROM public.waitlists WHERE id = v_waitlist_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'waitlist_id', v_waitlist_id,
        'position', v_position,
        'status', 'active',
        'preferred_date', p_preferred_date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.join_waitlist(UUID, UUID, UUID, DATE, TIME, TIME) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_waitlist(UUID, UUID, UUID, DATE, TIME, TIME) TO authenticated;

-- RPC: Claim Waitlist Slot
CREATE OR REPLACE FUNCTION public.claim_waitlist_slot(p_waitlist_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_wl public.waitlists;
BEGIN
    SELECT * INTO v_wl
    FROM public.waitlists
    WHERE id = p_waitlist_id;

    IF v_wl.id IS NULL THEN
        RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_wl.customer_id <> v_user_id AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
        RAISE EXCEPTION 'Forbidden: not authorized to claim this waitlist slot' USING ERRCODE = '42501';
    END IF;

    IF v_wl.status <> 'notified' THEN
        RAISE EXCEPTION 'Waitlist slot is not in notified state (current: %)', v_wl.status USING ERRCODE = '22023';
    END IF;

    IF v_wl.expires_at IS NOT NULL AND v_wl.expires_at < NOW() THEN
        UPDATE public.waitlists SET status = 'expired' WHERE id = p_waitlist_id;
        RAISE EXCEPTION 'Claim window has expired' USING ERRCODE = '22023';
    END IF;

    UPDATE public.waitlists
    SET status = 'claimed'
    WHERE id = p_waitlist_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'waitlist_id', p_waitlist_id,
        'status', 'claimed',
        'branch_id', v_wl.branch_id,
        'service_id', v_wl.service_id,
        'preferred_date', v_wl.preferred_date
    );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_waitlist_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_slot(UUID) TO authenticated;

-- Trigger Function: Automatic Cancellation Backfill
CREATE OR REPLACE FUNCTION public.backfill_waitlist_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target_date DATE;
    v_target_time TIME;
    v_candidate public.waitlists;
    v_customer public.profiles;
    v_branch public.branches;
    v_provider public.providers;
    v_service public.services;
BEGIN
    v_target_date := (OLD.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;
    v_target_time := (OLD.scheduled_at AT TIME ZONE 'Asia/Riyadh')::time;

    -- Find earliest active waitlist entry matching this branch, service (or any service), and time window
    SELECT * INTO v_candidate
    FROM public.waitlists
    WHERE branch_id = OLD.branch_id
      AND preferred_date = v_target_date
      AND status = 'active'
      AND preferred_time_start <= v_target_time
      AND preferred_time_end >= v_target_time
      AND (service_id = OLD.service_id OR service_id IS NULL)
      AND (employee_id = OLD.employee_id OR employee_id IS NULL)
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_candidate.id IS NOT NULL THEN
        -- Mark as notified and grant 15-minute exclusive claim window
        UPDATE public.waitlists
        SET status = 'notified',
            notified_at = NOW(),
            expires_at = NOW() + interval '15 minutes'
        WHERE id = v_candidate.id;

        -- Fetch recipient and business details
        SELECT * INTO v_customer FROM public.profiles WHERE id = v_candidate.customer_id;
        SELECT * INTO v_branch FROM public.branches WHERE id = v_candidate.branch_id;
        SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;
        SELECT * INTO v_service FROM public.services WHERE id = v_candidate.service_id;

        -- Enqueue WhatsApp / SMS notification into message_queue
        IF v_customer.phone IS NOT NULL AND v_customer.phone <> '' THEN
            INSERT INTO public.message_queue (
                recipient_phone,
                recipient_user_id,
                channel,
                template_name,
                payload,
                status,
                scheduled_for
            ) VALUES (
                v_customer.phone,
                v_customer.id,
                'whatsapp',
                'waitlist_slot_opened',
                jsonb_build_object(
                    'customer_name', COALESCE(v_customer.first_name, 'Client'),
                    'provider_name', COALESCE(v_provider.business_name_ar, v_provider.business_name_en),
                    'service_name', COALESCE(v_service.name_ar, v_service.name_en),
                    'slot_date', v_target_date,
                    'slot_time', v_target_time,
                    'claim_url', 'https://primora.sa/shop/' || v_provider.id || '?claim_waitlist=' || v_candidate.id,
                    'expires_minutes', 15
                ),
                'pending',
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_backfill_waitlist_on_booking_cancellation ON public.bookings;
CREATE TRIGGER trigger_backfill_waitlist_on_booking_cancellation
    AFTER UPDATE OF status ON public.bookings
    FOR EACH ROW
    WHEN (NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'pending_payment'))
    EXECUTE FUNCTION public.backfill_waitlist_on_cancellation();


-- ----------------------------------------------------------------------------
-- 2. G51: MULTI-SERVICE SEQUENTIAL CART BOOKING
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    sequence_order INT NOT NULL DEFAULT 1,
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_services_booking 
    ON public.booking_services(booking_id, sequence_order);

ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own booking services" ON public.booking_services;
CREATE POLICY "Users can view own booking services"
    ON public.booking_services
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = booking_services.booking_id
              AND (
                  b.customer_id = auth.uid()
                  OR b.employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
                  OR EXISTS (
                      SELECT 1 FROM public.branches br
                      JOIN public.providers p ON p.id = br.provider_id
                      WHERE br.id = b.branch_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
                  )
              )
        )
    );

-- RPC: Create Multi-Service Booking
CREATE OR REPLACE FUNCTION public.create_multi_service_booking(
    target_branch_id UUID,
    target_employee_id UUID,
    target_scheduled_at TIMESTAMPTZ,
    services_payload JSONB,
    request_home_service BOOLEAN DEFAULT FALSE,
    request_home_address_text TEXT DEFAULT NULL,
    request_source VARCHAR DEFAULT 'marketplace'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_provider_id UUID;
    v_actual_branch_id UUID;
    v_total_duration INT := 0;
    v_total_price DECIMAL(10,2) := 0.00;
    v_first_service_id UUID := NULL;
    v_item JSONB;
    v_item_service_id UUID;
    v_item_duration INT;
    v_item_price DECIMAL(10,2);
    v_seq INT := 1;
    v_booking_id UUID;
    v_resolved_emp UUID := target_employee_id;
    v_booking public.bookings;
    v_is_eligible BOOLEAN;
    v_eligibility JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF jsonb_typeof(services_payload) <> 'array' OR jsonb_array_length(services_payload) = 0 THEN
        RAISE EXCEPTION 'services_payload must be a non-empty array' USING ERRCODE = '22023';
    END IF;

    IF target_scheduled_at <= NOW() THEN
        RAISE EXCEPTION 'Booking time must be in the future' USING ERRCODE = '22007';
    END IF;

    -- Resolve branch (accepts either branch_id or provider_id)
    SELECT provider_id, id INTO v_provider_id, v_actual_branch_id
    FROM public.branches
    WHERE id = target_branch_id;

    IF v_provider_id IS NULL THEN
        SELECT id, provider_id INTO v_actual_branch_id, v_provider_id
        FROM public.branches
        WHERE provider_id = target_branch_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
    END IF;

    -- Check customer block list & eligibility (G57)
    v_eligibility := public.check_customer_booking_eligibility(v_provider_id, v_user_id);
    IF (v_eligibility->>'is_blocked')::boolean = TRUE THEN
        RAISE EXCEPTION 'Customer is blocked by this provider (%s)', (v_eligibility->>'block_reason')
            USING ERRCODE = '42501';
    END IF;

    -- Calculate total duration and price across selected services
    FOR v_item IN SELECT * FROM jsonb_array_elements(services_payload)
    LOOP
        v_item_service_id := (v_item->>'service_id')::UUID;
        
        SELECT 
            COALESCE(base_duration_minutes, 30),
            COALESCE(base_price, 0.00)
        INTO v_item_duration, v_item_price
        FROM public.services
        WHERE id = v_item_service_id AND provider_id = v_provider_id AND is_active = TRUE;

        IF v_item_duration IS NULL THEN
            RAISE EXCEPTION 'Service % not found or inactive for this provider', v_item_service_id USING ERRCODE = 'P0002';
        END IF;

        IF v_first_service_id IS NULL THEN
            v_first_service_id := v_item_service_id;
        END IF;

        v_total_duration := v_total_duration + v_item_duration;
        v_total_price := v_total_price + v_item_price;
    END LOOP;

    -- Auto-resolve employee if target_employee_id IS NULL (any available professional)
    IF v_resolved_emp IS NULL THEN
        SELECT e.id INTO v_resolved_emp
        FROM public.employees e
        WHERE e.branch_id = v_actual_branch_id AND e.is_active = TRUE
          AND EXISTS (
              SELECT 1 FROM public.get_available_slots(
                  e.id,
                  (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
                  v_total_duration
              ) sl WHERE sl.slot_start = target_scheduled_at
          )
        ORDER BY e.created_at ASC
        LIMIT 1;

        IF v_resolved_emp IS NULL THEN
            RAISE EXCEPTION 'No professional available for the combined duration (% mins)', v_total_duration USING ERRCODE = '23P01';
        END IF;
    ELSE
        -- Validate slot for combined duration
        IF NOT EXISTS (
            SELECT 1 FROM public.get_available_slots(
                v_resolved_emp,
                (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
                v_total_duration
            ) sl WHERE sl.slot_start = target_scheduled_at
        ) THEN
            RAISE EXCEPTION 'Selected time cannot accommodate the full combined duration (% mins)', v_total_duration USING ERRCODE = '23P01';
        END IF;
    END IF;

    -- Create master booking
    INSERT INTO public.bookings (
        customer_id,
        branch_id,
        employee_id,
        service_id,
        scheduled_at,
        duration_minutes,
        total_price,
        deposit_required,
        status,
        payment_status,
        source,
        is_home_service,
        home_address_text
    ) VALUES (
        v_user_id,
        v_actual_branch_id,
        v_resolved_emp,
        v_first_service_id,
        target_scheduled_at,
        v_total_duration,
        v_total_price,
        CASE WHEN (v_eligibility->>'requires_full_prepayment')::boolean = TRUE THEN v_total_price ELSE ROUND(v_total_price * 0.20, 2) END,
        'pending_payment',
        'unpaid',
        COALESCE(request_source, 'marketplace'),
        COALESCE(request_home_service, FALSE),
        request_home_address_text
    ) RETURNING id INTO v_booking_id;

    -- Insert individual items into booking_services
    FOR v_item IN SELECT * FROM jsonb_array_elements(services_payload)
    LOOP
        v_item_service_id := (v_item->>'service_id')::UUID;
        SELECT base_duration_minutes, base_price INTO v_item_duration, v_item_price
        FROM public.services WHERE id = v_item_service_id;

        INSERT INTO public.booking_services (
            booking_id,
            service_id,
            employee_id,
            sequence_order,
            duration_minutes,
            price
        ) VALUES (
            v_booking_id,
            v_item_service_id,
            v_resolved_emp,
            v_seq,
            v_item_duration,
            v_item_price
        );
        v_seq := v_seq + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking_id,
        'total_duration_minutes', v_total_duration,
        'total_price_sar', v_total_price,
        'services_count', jsonb_array_length(services_payload)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_multi_service_booking(UUID, UUID, TIMESTAMPTZ, JSONB, BOOLEAN, TEXT, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_multi_service_booking(UUID, UUID, TIMESTAMPTZ, JSONB, BOOLEAN, TEXT, VARCHAR) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. G53: WALK-IN QUICK ENTRY & LIGHT COUNTER CHECKOUT
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_walk_in_booking(
    p_branch_id UUID,
    p_employee_id UUID,
    p_service_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_total_price DECIMAL DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_provider_id UUID;
    v_actual_branch_id UUID;
    v_service public.services;
    v_customer_id UUID;
    v_duration INT;
    v_price DECIMAL(10,2);
    v_booking_id UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    -- Resolve branch (accepts either branch_id or provider_id)
    SELECT provider_id, id INTO v_provider_id, v_actual_branch_id
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_provider_id IS NULL THEN
        SELECT id, provider_id INTO v_actual_branch_id, v_provider_id
        FROM public.branches
        WHERE provider_id = p_branch_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
    END IF;

    -- Authorize: must be employee of the branch or owner of provider or admin
    SELECT (
        p.owner_id = v_user_id 
        OR EXISTS (SELECT 1 FROM public.employees e WHERE e.branch_id = v_actual_branch_id AND e.user_id = v_user_id)
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    ) INTO v_is_authorized
    FROM public.providers p
    WHERE p.id = v_provider_id;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized to create walk-in for this branch' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_service
    FROM public.services
    WHERE id = p_service_id AND provider_id = v_provider_id;

    IF v_service.id IS NULL THEN
        RAISE EXCEPTION 'Service not found' USING ERRCODE = 'P0002';
    END IF;

    v_duration := COALESCE(v_service.base_duration_minutes, 30);
    v_price := COALESCE(p_total_price, v_service.base_price, 50.00);

    -- Find existing profile or generate guest walk-in profile
    IF p_customer_phone IS NOT NULL AND TRIM(p_customer_phone) <> '' THEN
        SELECT id INTO v_customer_id
        FROM public.profiles
        WHERE phone = TRIM(p_customer_phone)
        LIMIT 1;
    END IF;

    IF v_customer_id IS NULL THEN
        INSERT INTO public.profiles (
            id,
            first_name,
            last_name,
            phone,
            role
        ) VALUES (
            gen_random_uuid(),
            COALESCE(TRIM(p_customer_name), 'Walk-in Guest'),
            'Walk-in',
            COALESCE(TRIM(p_customer_phone), '+966500000000'),
            'customer'
        ) RETURNING id INTO v_customer_id;
    END IF;

    -- Create walk-in booking (0% platform commission per G03 / G34)
    INSERT INTO public.bookings (
        customer_id,
        branch_id,
        employee_id,
        service_id,
        scheduled_at,
        duration_minutes,
        total_price,
        deposit_required,
        platform_fee,
        status,
        payment_status,
        source,
        is_home_service
    ) VALUES (
        v_customer_id,
        p_branch_id,
        p_employee_id,
        p_service_id,
        NOW(),
        v_duration,
        v_price,
        0.00,
        0.00,
        'in_service',
        'paid',
        'walk_in',
        FALSE
    ) RETURNING id INTO v_booking_id;

    -- Log audit entry
    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'provider.walk_in_created',
        'bookings',
        v_booking_id,
        jsonb_build_object(
            'customer_name', p_customer_name,
            'payment_method', p_payment_method,
            'price', v_price
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking_id,
        'status', 'in_service',
        'source', 'walk_in',
        'total_price', v_price
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_walk_in_booking(UUID, UUID, UUID, TEXT, TEXT, TEXT, DECIMAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_walk_in_booking(UUID, UUID, UUID, TEXT, TEXT, TEXT, DECIMAL) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. G58: CUSTOMER-FACING PRAYER WINDOW INDICATORS ON BOOKING SLOTS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_branch_schedule_with_prayer_pauses(
    p_branch_id UUID,
    p_target_date DATE,
    p_service_duration INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actual_branch_id UUID;
    v_prayer_windows JSONB := '[]'::jsonb;
    v_slots JSONB := '[]'::jsonb;
    v_emp_id UUID;
    v_slot_rec RECORD;
BEGIN
    -- Resolve branch (accepts either branch_id or provider_id)
    SELECT id INTO v_actual_branch_id
    FROM public.branches
    WHERE id = p_branch_id;

    IF v_actual_branch_id IS NULL THEN
        SELECT id INTO v_actual_branch_id
        FROM public.branches
        WHERE provider_id = p_branch_id
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Riyadh prayer windows with standard 25-minute congregational pause buffer
    v_prayer_windows := jsonb_build_array(
        jsonb_build_object('prayer', 'Fajr', 'prayer_ar', 'الفجر', 'start_time', '03:45:00', 'end_time', '04:15:00'),
        jsonb_build_object('prayer', 'Dhuhr', 'prayer_ar', 'الظهر', 'start_time', '12:00:00', 'end_time', '12:30:00'),
        jsonb_build_object('prayer', 'Asr', 'prayer_ar', 'العصر', 'start_time', '15:25:00', 'end_time', '15:55:00'),
        jsonb_build_object('prayer', 'Maghrib', 'prayer_ar', 'المغرب', 'start_time', '18:40:00', 'end_time', '19:10:00'),
        jsonb_build_object('prayer', 'Isha', 'prayer_ar', 'العشاء', 'start_time', '20:10:00', 'end_time', '20:40:00')
    );

    -- Find first active employee of the branch to sample available schedule
    SELECT id INTO v_emp_id
    FROM public.employees
    WHERE branch_id = v_actual_branch_id AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_emp_id IS NOT NULL THEN
        FOR v_slot_rec IN 
            SELECT slot_start 
            FROM public.get_available_slots(v_emp_id, p_target_date, p_service_duration)
        LOOP
            v_slots := v_slots || jsonb_build_object(
                'time', to_char(v_slot_rec.slot_start AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
                'slot_start', v_slot_rec.slot_start,
                'is_available', TRUE
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'date', p_target_date,
        'branch_id', p_branch_id,
        'prayer_windows', v_prayer_windows,
        'available_slots', v_slots
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_schedule_with_prayer_pauses(UUID, DATE, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_branch_schedule_with_prayer_pauses(UUID, DATE, INT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. G57: CUSTOMER BLOCK LIST & NO-SHOW STRIKE ENFORCEMENT
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_customer_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_blocks_lookup 
    ON public.provider_customer_blocks(provider_id, customer_id);

ALTER TABLE public.provider_customer_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers view own blocked customers" ON public.provider_customer_blocks;
CREATE POLICY "Providers view own blocked customers"
    ON public.provider_customer_blocks
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_customer_blocks.provider_id
              AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Providers insert customer blocks" ON public.provider_customer_blocks;
CREATE POLICY "Providers insert customer blocks"
    ON public.provider_customer_blocks
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_customer_blocks.provider_id
              AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Providers remove customer blocks" ON public.provider_customer_blocks;
CREATE POLICY "Providers remove customer blocks"
    ON public.provider_customer_blocks
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_customer_blocks.provider_id
              AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- Stored Procedure: Check Customer Booking Eligibility & Strikes
CREATE OR REPLACE FUNCTION public.check_customer_booking_eligibility(
    p_provider_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_blocked BOOLEAN := FALSE;
    v_block_reason TEXT := NULL;
    v_no_show_strikes INT := 0;
    v_requires_full_prepayment BOOLEAN := FALSE;
BEGIN
    -- Check direct provider block list
    SELECT TRUE, reason INTO v_is_blocked, v_block_reason
    FROM public.provider_customer_blocks
    WHERE provider_id = p_provider_id AND customer_id = p_customer_id;

    -- Count no-shows in past 60 days across the platform
    SELECT COUNT(*) INTO v_no_show_strikes
    FROM public.bookings
    WHERE customer_id = p_customer_id
      AND status = 'no_show'
      AND no_show_at >= (NOW() - interval '60 days');

    -- If 3 or more no-shows, enforce mandatory full prepayment
    IF v_no_show_strikes >= 3 THEN
        v_requires_full_prepayment := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'is_eligible', NOT COALESCE(v_is_blocked, FALSE),
        'is_blocked', COALESCE(v_is_blocked, FALSE),
        'block_reason', v_block_reason,
        'no_show_strikes', v_no_show_strikes,
        'requires_full_prepayment', v_requires_full_prepayment
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_customer_booking_eligibility(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_customer_booking_eligibility(UUID, UUID) TO authenticated;

-- Stored Procedure: Toggle Customer Block
CREATE OR REPLACE FUNCTION public.toggle_customer_block(
    p_provider_id UUID,
    p_customer_id UUID,
    p_reason TEXT,
    p_block BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    SELECT (
        p.owner_id = v_user_id 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    ) INTO v_is_authorized
    FROM public.providers p
    WHERE p.id = p_provider_id;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized to manage blocklist for this provider' USING ERRCODE = '42501';
    END IF;

    IF p_block THEN
        INSERT INTO public.provider_customer_blocks (
            provider_id,
            customer_id,
            reason,
            created_by
        ) VALUES (
            p_provider_id,
            p_customer_id,
            COALESCE(TRIM(p_reason), 'Blocked by salon operator'),
            v_user_id
        )
        ON CONFLICT (provider_id, customer_id) DO UPDATE
        SET reason = EXCLUDED.reason;

        INSERT INTO public.admin_audit_log (
            admin_id, action, target_entity, target_id, payload
        ) VALUES (
            v_user_id, 'provider.customer_blocked', 'profiles', p_customer_id,
            jsonb_build_object('provider_id', p_provider_id, 'reason', p_reason)
        );
    ELSE
        DELETE FROM public.provider_customer_blocks
        WHERE provider_id = p_provider_id AND customer_id = p_customer_id;

        INSERT INTO public.admin_audit_log (
            admin_id, action, target_entity, target_id, payload
        ) VALUES (
            v_user_id, 'provider.customer_unblocked', 'profiles', p_customer_id,
            jsonb_build_object('provider_id', p_provider_id)
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'provider_id', p_provider_id,
        'customer_id', p_customer_id,
        'is_blocked', p_block
    );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_customer_block(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_customer_block(UUID, UUID, TEXT, BOOLEAN) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. G57: ENFORCE CUSTOMER ELIGIBILITY ON MASTER CREATE_BOOKING RPC
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
  v_eligibility JSONB;
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
      WHERE e.branch_id = v_branch_id AND e.is_active = TRUE
      GROUP BY e.id
      ORDER BY current_bookings ASC, e.created_at ASC
    ) ee
    LIMIT 1;

    IF v_resolved_employee_id IS NULL THEN
      RAISE EXCEPTION 'No active professional available for this service' USING ERRCODE = '23P01';
    END IF;
  ELSE
    SELECT e.branch_id, b.provider_id, s.base_duration_minutes, s.base_price, s.is_home_service_eligible
    INTO v_branch_id, v_provider_id, v_duration, v_price, v_home_eligible
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.services s ON s.id = target_service_id AND s.provider_id = b.provider_id
    WHERE e.id = v_resolved_employee_id AND e.is_active = TRUE AND s.is_active = TRUE;

    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'Invalid employee or service configuration' USING ERRCODE = '23503';
    END IF;
  END IF;

  -- 2. Check customer block list & no-show strike enforcement (G57)
  v_eligibility := public.check_customer_booking_eligibility(v_provider_id, v_user_id);
  IF (v_eligibility->>'is_blocked')::boolean = TRUE THEN
    RAISE EXCEPTION 'Customer is blocked by this provider (%s)', (v_eligibility->>'block_reason')
      USING ERRCODE = '42501';
  END IF;

  -- Check home-service constraints
  IF request_home_service THEN
    IF NOT COALESCE(v_home_eligible, FALSE) THEN
      RAISE EXCEPTION 'Selected service is not eligible for home visits' USING ERRCODE = '22023';
    END IF;
    IF request_home_address_lat IS NULL OR request_home_address_lng IS NULL THEN
      RAISE EXCEPTION 'Home service address coordinates are required' USING ERRCODE = '23502';
    END IF;
  END IF;

  -- Verify employee is not already double-booked
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.employee_id = v_resolved_employee_id
      AND b.status IN ('confirmed', 'pending_payment')
      AND tstzrange(b.scheduled_at, b.scheduled_at + (b.duration_minutes || ' minutes')::interval) &&
          tstzrange(target_scheduled_at, target_scheduled_at + (v_duration || ' minutes')::interval)
  ) THEN
    RAISE EXCEPTION 'Selected specialist is already booked for this timeframe' USING ERRCODE = '23P01';
  END IF;

  -- Determine first visit & commissions
  SELECT * INTO v_provider FROM public.providers WHERE id = v_provider_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.customer_id = v_user_id
      AND b.branch_id IN (SELECT br.id FROM public.branches br WHERE br.provider_id = v_provider_id)
      AND b.status = 'completed'
  ) INTO v_is_first_visit;

  IF v_source = 'marketplace' THEN
    IF v_is_first_visit THEN
      v_commission := ROUND(v_price * COALESCE(v_provider.commission_rate, 0.15), 2);
    ELSE
      v_commission := ROUND(v_price * COALESCE(v_provider.repeat_client_commission_rate, 0.05), 2);
    END IF;
  ELSE
    v_commission := 0.00;
  END IF;

  -- G57: If >= 3 no-show strikes, require 100% full prepayment; otherwise standard 20%
  IF (v_eligibility->>'requires_full_prepayment')::boolean = TRUE THEN
    v_deposit_amount := v_price;
  ELSE
    v_deposit_amount := ROUND(v_price * 0.20, 2);
  END IF;

  INSERT INTO public.bookings (
    customer_id,
    employee_id,
    service_id,
    branch_id,
    scheduled_at,
    duration_minutes,
    total_price,
    deposit_required,
    platform_fee,
    status,
    payment_status,
    source,
    is_first_visit,
    is_home_service,
    home_address_lat,
    home_address_lng,
    client_profile_id
  ) VALUES (
    v_user_id,
    v_resolved_employee_id,
    target_service_id,
    v_branch_id,
    target_scheduled_at,
    v_duration,
    v_price,
    v_deposit_amount,
    v_commission,
    'pending_payment',
    'unpaid',
    v_source,
    v_is_first_visit,
    COALESCE(request_home_service, FALSE),
    request_home_address_lat,
    request_home_address_lng,
    request_client_profile_id
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) TO authenticated;
