-- ==============================================================================
-- PRIMORA Milestone P2-C Migration: Multi-Branch, Operations & Analytics
-- G54: Real Provider Analytics & Reporting Aggregates (Zero Mock Data)
-- G55: Staff Commission Rules & WPS Payroll Calculation
-- G56: Multi-Branch Consolidated Chain Rollup & Branch Analytics
-- G64: Customer Favorites & 1-Tap Rebooking
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. G64: CUSTOMER FAVORITES & SAVED SALONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_customer
ON public.customer_favorites (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_favorites_provider
ON public.customer_favorites (provider_id);

ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own favorites" ON public.customer_favorites;
CREATE POLICY "Users view own favorites"
ON public.customer_favorites
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own favorites" ON public.customer_favorites;
CREATE POLICY "Users insert own favorites"
ON public.customer_favorites
FOR INSERT
TO authenticated
WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own favorites" ON public.customer_favorites;
CREATE POLICY "Users delete own favorites"
ON public.customer_favorites
FOR DELETE
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all favorites" ON public.customer_favorites;
CREATE POLICY "Admins manage all favorites"
ON public.customer_favorites
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, DELETE ON public.customer_favorites TO authenticated;

-- RPC: Toggle favorite status for a provider
CREATE OR REPLACE FUNCTION public.toggle_customer_favorite(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_exists BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to favorite salons' USING ERRCODE = '28000';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.customer_favorites
        WHERE customer_id = v_user_id AND provider_id = p_provider_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM public.customer_favorites
        WHERE customer_id = v_user_id AND provider_id = p_provider_id;

        RETURN jsonb_build_object(
            'success', true,
            'is_favorited', false,
            'provider_id', p_provider_id
        );
    ELSE
        INSERT INTO public.customer_favorites (customer_id, provider_id)
        VALUES (v_user_id, p_provider_id);

        RETURN jsonb_build_object(
            'success', true,
            'is_favorited', true,
            'provider_id', p_provider_id
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_customer_favorite TO authenticated;


-- ------------------------------------------------------------------------------
-- 2. G55: STAFF COMMISSION RULES & WPS PAYROLL
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    base_salary_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (base_salary_sar >= 0),
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 20.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    product_commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00 CHECK (product_commission_rate >= 0 AND product_commission_rate <= 100),
    wps_iban TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_commissions_provider
ON public.employee_commission_rules (provider_id);

ALTER TABLE public.employee_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage employee commissions" ON public.employee_commission_rules;
CREATE POLICY "Admins manage employee commissions"
ON public.employee_commission_rules
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Providers manage own employee commissions" ON public.employee_commission_rules;
CREATE POLICY "Providers manage own employee commissions"
ON public.employee_commission_rules
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.providers pr
        WHERE pr.id = employee_commission_rules.provider_id AND pr.owner_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.providers pr
        WHERE pr.id = employee_commission_rules.provider_id AND pr.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Employees view own commission rule" ON public.employee_commission_rules;
CREATE POLICY "Employees view own commission rule"
ON public.employee_commission_rules
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = employee_commission_rules.employee_id AND e.profile_id = auth.uid()
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_commission_rules TO authenticated;

-- RPC: Calculate Staff Payroll for a given provider and date window
CREATE OR REPLACE FUNCTION public.calculate_staff_payroll(
    p_provider_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_payroll_rows JSONB := '[]'::jsonb;
    v_emp RECORD;
    v_completed_count INT;
    v_service_revenue DECIMAL(10,2);
    v_tips_total DECIMAL(10,2);
    v_commission_amt DECIMAL(10,2);
    v_base_salary DECIMAL(10,2);
    v_net_payout DECIMAL(10,2);
    v_comm_rate DECIMAL(5,2);
    v_iban TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    -- Verify authorization (provider owner or platform admin)
    IF public.is_admin() THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.providers
            WHERE id = p_provider_id AND owner_id = v_user_id
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized to calculate payroll for this provider' USING ERRCODE = '42501';
    END IF;

    -- Iterate over each employee belonging to branches of this provider
    FOR v_emp IN
        SELECT 
            e.id AS emp_id,
            e.name_en,
            e.name_ar,
            e.role,
            b.name_en AS branch_name
        FROM public.employees e
        JOIN public.branches b ON b.id = e.branch_id
        WHERE b.provider_id = p_provider_id AND e.is_active = TRUE
        ORDER BY e.name_en ASC
    LOOP
        -- Read commission rule or use default 20%
        SELECT 
            COALESCE(r.commission_rate, 20.00),
            COALESCE(r.base_salary_sar, 0.00),
            COALESCE(r.wps_iban, 'SA0000000000000000000000')
        INTO v_comm_rate, v_base_salary, v_iban
        FROM public.employees e
        LEFT JOIN public.employee_commission_rules r ON r.employee_id = v_emp.emp_id
        WHERE e.id = v_emp.emp_id;

        -- Sum completed service bookings in window
        SELECT 
            COUNT(*),
            COALESCE(SUM(bk.total_price), 0.00)
        INTO v_completed_count, v_service_revenue
        FROM public.bookings bk
        WHERE bk.employee_id = v_emp.emp_id
          AND bk.status = 'completed'
          AND bk.scheduled_at::date >= p_start_date
          AND bk.scheduled_at::date <= p_end_date;

        -- Sum tips in window (100% to employee)
        SELECT COALESCE(SUM(bt.amount), 0.00)
        INTO v_tips_total
        FROM public.booking_tips bt
        WHERE bt.employee_id = v_emp.emp_id
          AND bt.status = 'completed'
          AND bt.created_at::date >= p_start_date
          AND bt.created_at::date <= p_end_date;

        -- Calculate commission and net
        v_commission_amt := ROUND(v_service_revenue * (v_comm_rate / 100.0), 2);
        v_net_payout := v_base_salary + v_commission_amt + v_tips_total;

        v_payroll_rows := v_payroll_rows || jsonb_build_object(
            'employee_id', v_emp.emp_id,
            'name_en', v_emp.name_en,
            'name_ar', v_emp.name_ar,
            'role', v_emp.role,
            'branch', v_emp.branch_name,
            'wps_iban', v_iban,
            'completed_bookings', v_completed_count,
            'service_revenue_sar', v_service_revenue,
            'commission_rate_pct', v_comm_rate,
            'commission_earned_sar', v_commission_amt,
            'tips_earned_sar', v_tips_total,
            'base_salary_sar', v_base_salary,
            'total_payout_sar', v_net_payout
        );
    END LOOP;

    RETURN jsonb_build_object(
        'provider_id', p_provider_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'currency', 'SAR',
        'payroll_entries', v_payroll_rows
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_staff_payroll TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. G56: MULTI-BRANCH CONSOLIDATED CHAIN ANALYTICS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_provider_multi_branch_summary(
    p_provider_id UUID,
    p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_branches_summary JSONB := '[]'::jsonb;
    v_br RECORD;
    v_br_revenue DECIMAL(10,2);
    v_br_bookings_total INT;
    v_br_completed_total INT;
    v_br_noshow_total INT;
    v_br_staff_count INT;
    v_chain_revenue DECIMAL(10,2) := 0.00;
    v_chain_bookings INT := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF public.is_admin() THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.providers
            WHERE id = p_provider_id AND owner_id = v_user_id
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized' USING ERRCODE = '42501';
    END IF;

    FOR v_br IN
        SELECT id, name_en, name_ar, city, district
        FROM public.branches
        WHERE provider_id = p_provider_id
        ORDER BY name_en ASC
    LOOP
        -- Revenue & bookings
        SELECT 
            COALESCE(SUM(CASE WHEN bk.status = 'completed' THEN bk.total_price ELSE 0 END), 0.00),
            COUNT(*),
            COALESCE(SUM(CASE WHEN bk.status = 'completed' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN bk.status = 'no_show' THEN 1 ELSE 0 END), 0)
        INTO v_br_revenue, v_br_bookings_total, v_br_completed_total, v_br_noshow_total
        FROM public.bookings bk
        WHERE bk.branch_id = v_br.id
          AND bk.scheduled_at::date >= p_start_date
          AND bk.scheduled_at::date <= p_end_date;

        -- Active staff count
        SELECT COUNT(*)
        INTO v_br_staff_count
        FROM public.employees
        WHERE branch_id = v_br.id AND is_active = TRUE;

        v_chain_revenue := v_chain_revenue + v_br_revenue;
        v_chain_bookings := v_chain_bookings + v_br_bookings_total;

        v_branches_summary := v_branches_summary || jsonb_build_object(
            'branch_id', v_br.id,
            'name_en', v_br.name_en,
            'name_ar', v_br.name_ar,
            'city', v_br.city,
            'district', v_br.district,
            'revenue_sar', v_br_revenue,
            'total_bookings', v_br_bookings_total,
            'completed_bookings', v_br_completed_total,
            'no_show_bookings', v_br_noshow_total,
            'no_show_rate_pct', CASE WHEN v_br_bookings_total > 0 THEN ROUND((v_br_noshow_total::numeric / v_br_bookings_total * 100.0), 1) ELSE 0.0 END,
            'active_staff', v_br_staff_count
        );
    END LOOP;

    RETURN jsonb_build_object(
        'provider_id', p_provider_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'chain_total_revenue_sar', v_chain_revenue,
        'chain_total_bookings', v_chain_bookings,
        'total_branches', jsonb_array_length(v_branches_summary),
        'branches', v_branches_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_provider_multi_branch_summary TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. G54: REAL PROVIDER DETAILED ANALYTICS (ZERO MOCK FALLBACKS)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_provider_detailed_analytics(
    p_provider_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    
    -- KPIs
    v_gross_revenue DECIMAL(10,2) := 0.00;
    v_platform_fees DECIMAL(10,2) := 0.00;
    v_net_earnings DECIMAL(10,2) := 0.00;
    v_total_bookings INT := 0;
    v_completed_bookings INT := 0;
    v_cancelled_bookings INT := 0;
    v_noshow_bookings INT := 0;
    v_unique_clients INT := 0;
    v_first_time_clients INT := 0;
    v_repeat_clients INT := 0;
    
    -- Sub-arrays
    v_staff_stats JSONB := '[]'::jsonb;
    v_sources_stats JSONB := '[]'::jsonb;
    v_services_stats JSONB := '[]'::jsonb;
    v_emp RECORD;
    v_src RECORD;
    v_srv RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF public.is_admin() THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.providers
            WHERE id = p_provider_id AND owner_id = v_user_id
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized to view reports for this provider' USING ERRCODE = '42501';
    END IF;

    -- 1. Financial & Volume aggregates from bookings & ledger
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN bk.status = 'completed' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN bk.status = 'cancelled' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN bk.status = 'no_show' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN bk.status = 'completed' THEN bk.total_price ELSE 0 END), 0.00)
    INTO 
        v_total_bookings,
        v_completed_bookings,
        v_cancelled_bookings,
        v_noshow_bookings,
        v_gross_revenue
    FROM public.bookings bk
    JOIN public.branches br ON br.id = bk.branch_id
    WHERE br.provider_id = p_provider_id
      AND bk.scheduled_at::date >= p_start_date
      AND bk.scheduled_at::date <= p_end_date;

    -- Ledger fees
    SELECT 
        COALESCE(SUM(tl.platform_fee), 0.00),
        COALESCE(SUM(tl.net_provider_payout), 0.00)
    INTO v_platform_fees, v_net_earnings
    FROM public.transactional_ledger tl
    WHERE tl.provider_id = p_provider_id
      AND tl.created_at::date >= p_start_date
      AND tl.created_at::date <= p_end_date;

    IF v_net_earnings = 0.00 AND v_gross_revenue > 0 THEN
        v_net_earnings := v_gross_revenue - v_platform_fees;
    END IF;

    -- 2. Client retention metrics
    SELECT COUNT(DISTINCT bk.customer_id)
    INTO v_unique_clients
    FROM public.bookings bk
    JOIN public.branches br ON br.id = bk.branch_id
    WHERE br.provider_id = p_provider_id
      AND bk.customer_id IS NOT NULL
      AND bk.scheduled_at::date >= p_start_date
      AND bk.scheduled_at::date <= p_end_date;

    -- Count clients with only 1 lifetime booking vs > 1 lifetime booking
    SELECT 
        COUNT(*) FILTER (WHERE visit_count = 1),
        COUNT(*) FILTER (WHERE visit_count > 1)
    INTO v_first_time_clients, v_repeat_clients
    FROM (
        SELECT bk.customer_id, COUNT(*) AS visit_count
        FROM public.bookings bk
        JOIN public.branches br ON br.id = bk.branch_id
        WHERE br.provider_id = p_provider_id
          AND bk.customer_id IS NOT NULL
          AND bk.status = 'completed'
        GROUP BY bk.customer_id
    ) c_stats;

    -- 3. Acquisition Source Split
    FOR v_src IN
        SELECT 
            COALESCE(bk.source, 'marketplace') AS src_name,
            COUNT(*) AS b_count,
            COALESCE(SUM(CASE WHEN bk.status = 'completed' THEN bk.total_price ELSE 0 END), 0.00) AS b_rev
        FROM public.bookings bk
        JOIN public.branches br ON br.id = bk.branch_id
        WHERE br.provider_id = p_provider_id
          AND bk.scheduled_at::date >= p_start_date
          AND bk.scheduled_at::date <= p_end_date
        GROUP BY COALESCE(bk.source, 'marketplace')
        ORDER BY b_count DESC
    LOOP
        v_sources_stats := v_sources_stats || jsonb_build_object(
            'source', v_src.src_name,
            'bookings_count', v_src.b_count,
            'revenue_sar', v_src.b_rev,
            'share_pct', CASE WHEN v_total_bookings > 0 THEN ROUND((v_src.b_count::numeric / v_total_bookings * 100.0), 1) ELSE 0.0 END
        );
    END LOOP;

    -- 4. Specialist Performance
    FOR v_emp IN
        SELECT 
            e.id,
            e.name_en,
            e.name_ar,
            e.role,
            COUNT(bk.id) AS completed_count,
            COALESCE(SUM(bk.total_price), 0.00) AS revenue_gen
        FROM public.employees e
        JOIN public.branches br ON br.id = e.branch_id
        LEFT JOIN public.bookings bk ON bk.employee_id = e.id 
            AND bk.status = 'completed'
            AND bk.scheduled_at::date >= p_start_date
            AND bk.scheduled_at::date <= p_end_date
        WHERE br.provider_id = p_provider_id AND e.is_active = TRUE
        GROUP BY e.id, e.name_en, e.name_ar, e.role
        ORDER BY revenue_gen DESC
    LOOP
        v_staff_stats := v_staff_stats || jsonb_build_object(
            'employee_id', v_emp.id,
            'name_en', v_emp.name_en,
            'name_ar', v_emp.name_ar,
            'role', v_emp.role,
            'completed_bookings', v_emp.completed_count,
            'revenue_sar', v_emp.revenue_gen
        );
    END LOOP;

    -- 5. Top Popular Services
    FOR v_srv IN
        SELECT 
            s.id,
            s.name_en,
            s.name_ar,
            s.category,
            COUNT(bk.id) AS service_bookings,
            COALESCE(SUM(bk.total_price), 0.00) AS service_revenue
        FROM public.services s
        JOIN public.bookings bk ON bk.service_id = s.id
        JOIN public.branches br ON br.id = bk.branch_id
        WHERE br.provider_id = p_provider_id
          AND bk.status = 'completed'
          AND bk.scheduled_at::date >= p_start_date
          AND bk.scheduled_at::date <= p_end_date
        GROUP BY s.id, s.name_en, s.name_ar, s.category
        ORDER BY service_bookings DESC
        LIMIT 10
    LOOP
        v_services_stats := v_services_stats || jsonb_build_object(
            'service_id', v_srv.id,
            'name_en', v_srv.name_en,
            'name_ar', v_srv.name_ar,
            'category', v_srv.category,
            'bookings_count', v_srv.service_bookings,
            'revenue_sar', v_srv.service_revenue
        );
    END LOOP;

    RETURN jsonb_build_object(
        'provider_id', p_provider_id,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'gross_revenue_sar', v_gross_revenue,
        'platform_fees_sar', v_platform_fees,
        'net_earnings_sar', v_net_earnings,
        'total_bookings', v_total_bookings,
        'completed_bookings', v_completed_bookings,
        'cancelled_bookings', v_cancelled_bookings,
        'no_show_bookings', v_noshow_bookings,
        'completion_rate_pct', CASE WHEN v_total_bookings > 0 THEN ROUND((v_completed_bookings::numeric / v_total_bookings * 100.0), 1) ELSE 0.0 END,
        'no_show_rate_pct', CASE WHEN v_total_bookings > 0 THEN ROUND((v_noshow_bookings::numeric / v_total_bookings * 100.0), 1) ELSE 0.0 END,
        'unique_clients', v_unique_clients,
        'first_time_clients', v_first_time_clients,
        'repeat_clients', v_repeat_clients,
        'repeat_rate_pct', CASE WHEN (v_first_time_clients + v_repeat_clients) > 0 THEN ROUND((v_repeat_clients::numeric / (v_first_time_clients + v_repeat_clients) * 100.0), 1) ELSE 0.0 END,
        'sources_distribution', v_sources_stats,
        'staff_performance', v_staff_stats,
        'popular_services', v_services_stats
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_provider_detailed_analytics TO authenticated;
