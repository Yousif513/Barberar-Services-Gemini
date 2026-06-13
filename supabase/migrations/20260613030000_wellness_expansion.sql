-- Migration: 20260613030000_wellness_expansion.sql
-- Description: Implement resource allocation and multi-session package structures for spas, wellness, and fitness centers.

-- 1. PHYSICAL SPATIAL RESOURCES (e.g. Massage Room 1, Facial Bed, Sauna Room)
CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g. "Massage Bed A"
    category VARCHAR(100) NOT NULL, -- e.g. "Massage Bed" (used to map services)
    capacity INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SERVICE-RESOURCE CATEGORIES REQUIREMENT (e.g., Massage requires a "Massage Bed")
CREATE TABLE public.service_resources (
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    resource_category VARCHAR(100) NOT NULL, -- e.g. "Massage Bed"
    PRIMARY KEY (service_id, resource_category)
);

-- 3. LINK BOOKINGS TO SPECIFIC RESOURCES
ALTER TABLE public.bookings ADD COLUMN resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;

-- 4. MEMBERSHIP/MULTI-SESSION PACKAGES
CREATE TABLE public.packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    name_en VARCHAR(150) NOT NULL,
    name_ar VARCHAR(150) NOT NULL,
    description_en TEXT,
    description_ar TEXT,
    price DECIMAL(10,2) NOT NULL,
    session_count INT NOT NULL,
    expires_in_days INT DEFAULT 365,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CUSTOMER PURCHASED PACKAGES
CREATE TABLE public.user_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    remaining_sessions INT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for new tables
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_packages ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies
CREATE POLICY "Public read on active resources" ON public.resources FOR SELECT USING (is_active = true);
CREATE POLICY "Owners manage resources" ON public.resources FOR ALL USING (
  EXISTS (SELECT 1 FROM public.branches b JOIN public.providers p ON b.provider_id = p.id WHERE b.id = resources.branch_id AND p.owner_id = auth.uid())
);

CREATE POLICY "Public read on packages" ON public.packages FOR SELECT USING (is_active = true);
CREATE POLICY "Owners manage packages" ON public.packages FOR ALL USING (
  EXISTS (SELECT 1 FROM public.providers p WHERE p.id = packages.provider_id AND p.owner_id = auth.uid())
);

CREATE POLICY "Customers view own packages" ON public.user_packages FOR SELECT USING (customer_id = auth.uid());


-- 6. REDECLARE SLOT GENERATOR TO INCLUDE SPATIAL RESOURCE CHECK
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
    v_branch_id UUID;
    
    v_slot_time TIMESTAMP WITH TIME ZONE;
    v_slot_end TIMESTAMP WITH TIME ZONE;
    v_temp_start TIMESTAMP WITH TIME ZONE;
    v_temp_end TIMESTAMP WITH TIME ZONE;
    
    v_required_resource_category VARCHAR(100);
    v_service_id UUID;
BEGIN
    -- 1. Get Day of Week & Stylist Branch
    v_day_of_week := extract(dow from target_date)::int;
    
    SELECT branch_id INTO v_branch_id
    FROM public.employees
    WHERE id = target_employee_id;

    -- 2. Fetch employee availability shift
    SELECT start_time, end_time, is_working_day 
    INTO v_shift_start, v_shift_end, v_is_working
    FROM public.employee_availability
    WHERE employee_id = target_employee_id AND day_of_week = v_day_of_week;

    IF v_is_working = FALSE OR v_is_working IS NULL THEN
        RETURN;
    END IF;

    -- 3. Initialize loop boundaries
    v_temp_start := (target_date::text || ' ' || v_shift_start::text || '+03')::timestamp with time zone;
    v_temp_end := (target_date::text || ' ' || v_shift_end::text || '+03')::timestamp with time zone;

    v_slot_time := v_temp_start;

    -- 4. Generate slots in 15-minute increments
    WHILE v_slot_time + (service_duration_minutes || ' minutes')::interval <= v_temp_end LOOP
        v_slot_end := v_slot_time + (service_duration_minutes || ' minutes')::interval;

        -- 5. FILTER out Riyadh prayer times
        IF NOT (
            (v_slot_time::time < '04:05:00' AND v_slot_end::time > '03:45:00') OR
            (v_slot_time::time < '12:20:00' AND v_slot_end::time > '12:00:00') OR
            (v_slot_time::time < '15:50:00' AND v_slot_end::time > '15:30:00') OR
            (v_slot_time::time < '19:05:00' AND v_slot_end::time > '18:45:00') OR
            (v_slot_time::time < '20:35:00' AND v_slot_end::time > '20:15:00')
        ) THEN

            -- 6. FILTER out slots that overlap with existing staff bookings
            IF NOT EXISTS (
                SELECT 1 FROM public.bookings
                WHERE employee_id = target_employee_id
                  AND status IN ('confirmed', 'pending_payment')
                  AND scheduled_at < v_slot_end
                  AND (scheduled_at + (duration_minutes || ' minutes')::interval) > v_slot_time
            ) THEN
                
                -- 7. SPATIAL RESOURCE CHECK: Find if the service requires a resource category
                SELECT resource_category INTO v_required_resource_category
                FROM public.service_resources sr
                JOIN public.employee_services es ON es.service_id = sr.service_id
                WHERE es.employee_id = target_employee_id
                LIMIT 1;

                -- If a resource is required, check if at least one resource of that category is free in the branch
                IF v_required_resource_category IS NOT NULL THEN
                    IF EXISTS (
                        SELECT 1 FROM public.resources r
                        WHERE r.branch_id = v_branch_id
                          AND r.category = v_required_resource_category
                          AND r.is_active = TRUE
                          AND NOT EXISTS (
                              SELECT 1 FROM public.bookings b
                              WHERE b.resource_id = r.id
                                AND b.status IN ('confirmed', 'pending_payment')
                                AND b.scheduled_at < v_slot_end
                                AND (b.scheduled_at + (b.duration_minutes || ' minutes')::interval) > v_slot_time
                          )
                    ) THEN
                        slot_start := v_slot_time;
                        RETURN NEXT;
                    END IF;
                ELSE
                    -- No resource required, staff is free, slot is available
                    slot_start := v_slot_time;
                    RETURN NEXT;
                END IF;

            END IF;

        END IF;

        v_slot_time := v_slot_time + interval '15 minutes';
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
