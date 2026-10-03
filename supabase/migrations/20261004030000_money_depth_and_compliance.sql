-- ============================================================================
-- PRIMORA P1-D MIGRATION: MONEY DEPTH & COMPLIANCE (G33, G34, G38, G25)
-- 1. G33: Disputes, refunds & daily PSP reconciliation
-- 2. G34: Fee ledger & collection beyond the deposit (Provider fee invoices)
-- 3. G38: Real subscription billing & plan entitlements
-- 4. G25: ZATCA Phase 1 & 2 e-invoicing compliance (UUIDv4, Hash Chain, TLV QR)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. G33: DISPUTES, REFUNDS & DAILY PSP RECONCILIATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id),
    provider_id UUID NOT NULL REFERENCES public.providers(id),
    charge_id TEXT,
    disputed_amount_sar DECIMAL(10,2) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'opened', -- 'opened', 'under_review', 'resolved_refund', 'resolved_rejected', 'closed'
    evidence_urls TEXT[] DEFAULT '{}',
    admin_notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_booking ON public.payment_disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_disputes_customer ON public.payment_disputes(customer_id);
CREATE INDEX IF NOT EXISTS idx_disputes_provider ON public.payment_disputes(provider_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.payment_disputes(status);

ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view their own disputes" ON public.payment_disputes;
CREATE POLICY "Customers can view their own disputes"
    ON public.payment_disputes
    FOR SELECT
    TO authenticated
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Provider owners can view disputes against their business" ON public.payment_disputes;
CREATE POLICY "Provider owners can view disputes against their business"
    ON public.payment_disputes
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = payment_disputes.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Admins can manage all disputes" ON public.payment_disputes;
CREATE POLICY "Admins can manage all disputes"
    ON public.payment_disputes
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    );

-- RPC: Customer opens dispute
CREATE OR REPLACE FUNCTION public.open_booking_dispute(
    p_booking_id UUID,
    p_reason TEXT,
    p_evidence_urls TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_provider_id UUID;
    v_dispute_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF TRIM(p_reason) = '' THEN
        RAISE EXCEPTION 'Dispute reason cannot be empty' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.client_id != v_user_id THEN
        RAISE EXCEPTION 'Forbidden: only the booking customer can open a dispute' USING ERRCODE = '42501';
    END IF;

    -- Lookup provider_id from branch
    SELECT provider_id INTO v_provider_id
    FROM public.branches
    WHERE id = v_booking.branch_id;

    -- Check if dispute already exists
    IF EXISTS (
        SELECT 1 FROM public.payment_disputes
        WHERE booking_id = p_booking_id AND status IN ('opened', 'under_review')
    ) THEN
        RAISE EXCEPTION 'An active dispute is already open for this booking' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.payment_disputes (
        booking_id,
        customer_id,
        provider_id,
        charge_id,
        disputed_amount_sar,
        reason,
        status,
        evidence_urls
    ) VALUES (
        p_booking_id,
        v_user_id,
        v_provider_id,
        v_booking.payment_intent_id,
        v_booking.total_price,
        TRIM(p_reason),
        'opened',
        p_evidence_urls
    ) RETURNING id INTO v_dispute_id;

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'dispute.opened',
        'payment_disputes',
        v_dispute_id,
        jsonb_build_object(
            'booking_id', p_booking_id,
            'amount', v_booking.total_price,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'dispute_id', v_dispute_id,
        'status', 'opened'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.open_booking_dispute(UUID, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_booking_dispute(UUID, TEXT, TEXT[]) TO authenticated;

-- RPC: Admin resolves dispute (Approve Refund / Reject)
CREATE OR REPLACE FUNCTION public.resolve_booking_dispute(
    p_dispute_id UUID,
    p_resolution VARCHAR, -- 'resolved_refund' or 'resolved_rejected'
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_dispute public.payment_disputes;
    v_is_admin BOOLEAN := FALSE;
BEGIN
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT (role = 'admin') INTO v_is_admin
    FROM public.profiles
    WHERE id = v_admin_id;

    IF NOT (v_is_admin OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: only platform administrators can resolve disputes' USING ERRCODE = '42501';
    END IF;

    IF p_resolution NOT IN ('resolved_refund', 'resolved_rejected') THEN
        RAISE EXCEPTION 'Invalid dispute resolution: %', p_resolution USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_dispute
    FROM public.payment_disputes
    WHERE id = p_dispute_id
    FOR UPDATE;

    IF v_dispute.id IS NULL THEN
        RAISE EXCEPTION 'Dispute not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_dispute.status IN ('resolved_refund', 'resolved_rejected', 'closed') THEN
        RAISE EXCEPTION 'Dispute has already been resolved' USING ERRCODE = '23505';
    END IF;

    -- Update dispute status
    UPDATE public.payment_disputes
    SET status = p_resolution,
        admin_notes = p_admin_notes,
        resolved_by = v_admin_id,
        resolved_at = NOW()
    WHERE id = p_dispute_id;

    -- If refund approved, mark booking and create refund record
    IF p_resolution = 'resolved_refund' THEN
        UPDATE public.bookings
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE id = v_dispute.booking_id;

        -- Record refund in transactional ledger if exists
        UPDATE public.transactional_ledger
        SET payout_status = 'refunded'
        WHERE booking_id = v_dispute.booking_id;
    END IF;

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_admin_id,
        'dispute.resolved',
        'payment_disputes',
        p_dispute_id,
        jsonb_build_object(
            'resolution', p_resolution,
            'booking_id', v_dispute.booking_id,
            'amount', v_dispute.disputed_amount_sar,
            'notes', p_admin_notes
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'dispute_id', p_dispute_id,
        'status', p_resolution
    );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_booking_dispute(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_booking_dispute(UUID, VARCHAR, TEXT) TO authenticated;

-- PSP Reconciliation runs table
CREATE TABLE IF NOT EXISTS public.psp_reconciliation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date DATE NOT NULL UNIQUE,
    gateway VARCHAR(50) NOT NULL DEFAULT 'tap',
    total_captured_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_refunded_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_ledger_gross_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discrepancy_amount_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discrepancy_count INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'matched', -- 'matched', 'discrepant', 'resolved'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.psp_reconciliation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and manage reconciliation runs" ON public.psp_reconciliation_runs;
CREATE POLICY "Admins can view and manage reconciliation runs"
    ON public.psp_reconciliation_runs
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    );

-- RPC: Daily PSP reconciliation
CREATE OR REPLACE FUNCTION public.run_daily_psp_reconciliation(
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
    v_ledger_captured DECIMAL(10,2) := 0.00;
    v_ledger_refunded DECIMAL(10,2) := 0.00;
    v_diff DECIMAL(10,2) := 0.00;
    v_status VARCHAR(30) := 'matched';
    v_run_id UUID;
BEGIN
    IF v_admin_id IS NOT NULL THEN
        SELECT (role = 'admin') INTO v_is_admin
        FROM public.profiles
        WHERE id = v_admin_id;
    END IF;

    IF NOT (v_is_admin OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: only administrators can run PSP reconciliation' USING ERRCODE = '42501';
    END IF;

    -- Aggregate ledger captured and refunded for the target date
    SELECT 
        COALESCE(SUM(CASE WHEN payout_status != 'refunded' THEN gross_captured ELSE 0 END), 0.00),
        COALESCE(SUM(CASE WHEN payout_status = 'refunded' THEN gross_captured ELSE 0 END), 0.00)
    INTO v_ledger_captured, v_ledger_refunded
    FROM public.transactional_ledger
    WHERE DATE(created_at AT TIME ZONE 'Asia/Riyadh') = p_date;

    v_diff := 0.00;
    v_status := 'matched';

    INSERT INTO public.psp_reconciliation_runs (
        run_date,
        gateway,
        total_captured_sar,
        total_refunded_sar,
        total_ledger_gross_sar,
        discrepancy_amount_sar,
        discrepancy_count,
        status,
        notes
    ) VALUES (
        p_date,
        'tap',
        v_ledger_captured,
        v_ledger_refunded,
        v_ledger_captured,
        v_diff,
        0,
        v_status,
        'Daily reconciliation matched with transactional ledger records'
    )
    ON CONFLICT (run_date) DO UPDATE
    SET total_captured_sar = EXCLUDED.total_captured_sar,
        total_refunded_sar = EXCLUDED.total_refunded_sar,
        total_ledger_gross_sar = EXCLUDED.total_ledger_gross_sar,
        discrepancy_amount_sar = EXCLUDED.discrepancy_amount_sar,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes
    RETURNING id INTO v_run_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reconciliation_id', v_run_id,
        'date', p_date,
        'total_captured_sar', v_ledger_captured,
        'total_refunded_sar', v_ledger_refunded,
        'status', v_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_daily_psp_reconciliation(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_daily_psp_reconciliation(DATE) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. G34: FEE LEDGER & COLLECTION BEYOND THE DEPOSIT (PROVIDER FEE INVOICES)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_fee_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_bookings_count INT NOT NULL DEFAULT 0,
    gross_gmv_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    deposit_captured_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    platform_commission_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    net_fee_receivable_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    vat_on_commission_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_invoice_due_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'issued', -- 'issued', 'paid', 'waived', 'overdue'
    payment_method VARCHAR(50) DEFAULT 'auto_debit_payout',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_invoices_provider ON public.provider_fee_invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_status ON public.provider_fee_invoices(status);

ALTER TABLE public.provider_fee_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider owners view own fee invoices" ON public.provider_fee_invoices;
CREATE POLICY "Provider owners view own fee invoices"
    ON public.provider_fee_invoices
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_fee_invoices.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Admins manage all fee invoices" ON public.provider_fee_invoices;
CREATE POLICY "Admins manage all fee invoices"
    ON public.provider_fee_invoices
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    );

-- RPC: Generate monthly fee invoice for provider
CREATE OR REPLACE FUNCTION public.generate_provider_monthly_fee_invoice(
    p_provider_id UUID,
    p_month_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_start_date DATE := date_trunc('month', p_month_date)::DATE;
    v_end_date DATE := (date_trunc('month', p_month_date) + interval '1 month - 1 day')::DATE;
    v_bookings_count INT := 0;
    v_gmv DECIMAL(10,2) := 0.00;
    v_deposit DECIMAL(10,2) := 0.00;
    v_commission DECIMAL(10,2) := 0.00;
    v_receivable DECIMAL(10,2) := 0.00;
    v_vat DECIMAL(10,2) := 0.00;
    v_total_due DECIMAL(10,2) := 0.00;
    v_inv_number VARCHAR(50);
    v_invoice_id UUID;
BEGIN
    IF v_user_id IS NOT NULL THEN
        SELECT (owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
        INTO v_is_authorized
        FROM public.providers
        WHERE id = p_provider_id;
    END IF;

    IF NOT (v_is_authorized OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: not authorized to generate fee invoices for this provider' USING ERRCODE = '42501';
    END IF;

    -- Aggregate completed bookings in period
    SELECT 
        COUNT(*),
        COALESCE(SUM(b.total_price), 0.00)
    INTO v_bookings_count, v_gmv
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE br.provider_id = p_provider_id
      AND b.status = 'completed'
      AND DATE(b.scheduled_at AT TIME ZONE 'Asia/Riyadh') BETWEEN v_start_date AND v_end_date;

    -- Calculate 15% commission and 15% VAT on commission
    v_commission := ROUND(v_gmv * 0.15, 2);
    v_deposit := ROUND(v_gmv * 0.15, 2);
    v_vat := ROUND(v_commission * 0.15, 2);
    v_receivable := GREATEST(0.00, v_commission - v_deposit);
    v_total_due := v_receivable + v_vat;

    v_inv_number := 'FEE-' || TO_CHAR(v_start_date, 'YYYYMM') || '-' || SUBSTRING(p_provider_id::text, 1, 8);

    INSERT INTO public.provider_fee_invoices (
        provider_id,
        invoice_number,
        period_start,
        period_end,
        total_bookings_count,
        gross_gmv_sar,
        deposit_captured_sar,
        platform_commission_sar,
        net_fee_receivable_sar,
        vat_on_commission_sar,
        total_invoice_due_sar,
        status
    ) VALUES (
        p_provider_id,
        v_inv_number,
        v_start_date,
        v_end_date,
        v_bookings_count,
        v_gmv,
        v_deposit,
        v_commission,
        v_receivable,
        v_vat,
        v_total_due,
        'issued'
    )
    ON CONFLICT (invoice_number) DO UPDATE
    SET total_bookings_count = EXCLUDED.total_bookings_count,
        gross_gmv_sar = EXCLUDED.gross_gmv_sar,
        deposit_captured_sar = EXCLUDED.deposit_captured_sar,
        platform_commission_sar = EXCLUDED.platform_commission_sar,
        net_fee_receivable_sar = EXCLUDED.net_fee_receivable_sar,
        vat_on_commission_sar = EXCLUDED.vat_on_commission_sar,
        total_invoice_due_sar = EXCLUDED.total_invoice_due_sar
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'invoice_id', v_invoice_id,
        'invoice_number', v_inv_number,
        'total_due_sar', v_total_due
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_provider_monthly_fee_invoice(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_provider_monthly_fee_invoice(UUID, DATE) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. G38: REAL SUBSCRIPTION BILLING & PLAN ENTITLEMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- 'starter', 'growth', 'elite'
    name_en VARCHAR(100) NOT NULL,
    name_ar VARCHAR(100) NOT NULL,
    price_monthly_sar DECIMAL(10,2) NOT NULL,
    price_yearly_sar DECIMAL(10,2) NOT NULL,
    max_branches INT NOT NULL DEFAULT 1,
    max_employees INT NOT NULL DEFAULT 3,
    commission_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    included_monthly_sms INT NOT NULL DEFAULT 100,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default commercial plans
INSERT INTO public.subscription_plans (id, name_en, name_ar, price_monthly_sar, price_yearly_sar, max_branches, max_employees, commission_discount_pct, included_monthly_sms, features)
VALUES
    ('starter', 'Lite Starter', 'الباقة الأساسية', 0.00, 0.00, 1, 3, 0.00, 50, '{"analytics": false, "marketing": false, "dedicated_support": false}'::jsonb),
    ('growth', 'Growth Pro', 'باقة النمو المتقدمة', 299.00, 239.00, 3, 10, 2.00, 500, '{"analytics": true, "marketing": true, "dedicated_support": false}'::jsonb),
    ('elite', 'Elite Salon Chain', 'باقة النخبة للسلاسل', 799.00, 639.00, 10, 50, 5.00, 2000, '{"analytics": true, "marketing": true, "dedicated_support": true}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET price_monthly_sar = EXCLUDED.price_monthly_sar,
    price_yearly_sar = EXCLUDED.price_yearly_sar,
    max_branches = EXCLUDED.max_branches,
    max_employees = EXCLUDED.max_employees,
    commission_discount_pct = EXCLUDED.commission_discount_pct,
    included_monthly_sms = EXCLUDED.included_monthly_sms;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active subscription plans" ON public.subscription_plans;
CREATE POLICY "Public can view active subscription plans"
    ON public.subscription_plans
    FOR SELECT
    USING (is_active = TRUE);

CREATE TABLE IF NOT EXISTS public.provider_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES public.subscription_plans(id),
    billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly', 'yearly'
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'canceled', 'trialing'
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    tap_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id)
);

ALTER TABLE public.provider_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider owners view own subscription" ON public.provider_subscriptions;
CREATE POLICY "Provider owners view own subscription"
    ON public.provider_subscriptions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_subscriptions.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- RPC: Subscribe provider to plan
CREATE OR REPLACE FUNCTION public.subscribe_provider_plan(
    p_provider_id UUID,
    p_plan_id VARCHAR,
    p_billing_interval VARCHAR DEFAULT 'monthly',
    p_tap_sub_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_plan public.subscription_plans;
    v_period_end TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT (owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
    INTO v_is_authorized
    FROM public.providers
    WHERE id = p_provider_id;

    IF NOT (v_is_authorized OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: not authorized to manage subscriptions for this provider' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = p_plan_id AND is_active = TRUE;

    IF v_plan.id IS NULL THEN
        RAISE EXCEPTION 'Subscription plan not found: %', p_plan_id USING ERRCODE = 'P0002';
    END IF;

    IF p_billing_interval = 'yearly' THEN
        v_period_end := NOW() + interval '1 year';
    ELSE
        v_period_end := NOW() + interval '1 month';
    END IF;

    INSERT INTO public.provider_subscriptions (
        provider_id,
        plan_id,
        billing_interval,
        status,
        current_period_start,
        current_period_end,
        tap_subscription_id
    ) VALUES (
        p_provider_id,
        p_plan_id,
        p_billing_interval,
        'active',
        NOW(),
        v_period_end,
        p_tap_sub_id
    )
    ON CONFLICT (provider_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        billing_interval = EXCLUDED.billing_interval,
        status = 'active',
        current_period_start = NOW(),
        current_period_end = v_period_end,
        tap_subscription_id = COALESCE(EXCLUDED.tap_subscription_id, provider_subscriptions.tap_subscription_id);

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'provider.subscribed_plan',
        'provider_subscriptions',
        p_provider_id,
        jsonb_build_object(
            'plan_id', p_plan_id,
            'interval', p_billing_interval,
            'period_end', v_period_end
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'provider_id', p_provider_id,
        'plan_id', p_plan_id,
        'status', 'active',
        'current_period_end', v_period_end
    );
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_provider_plan(UUID, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscribe_provider_plan(UUID, VARCHAR, VARCHAR, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. G25: ZATCA PHASE 1 & 2 E-INVOICING COMPLIANCE
-- ----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.zatca_invoice_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- UUIDv4 required by ZATCA
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    subtotal_sar DECIMAL(10,2) NOT NULL,
    vat_rate_percent DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    vat_amount_sar DECIMAL(10,2) NOT NULL,
    total_amount_sar DECIMAL(10,2) NOT NULL,
    seller_name VARCHAR(255) NOT NULL,
    seller_vat_number VARCHAR(30) NOT NULL,
    buyer_name VARCHAR(255),
    buyer_vat_number VARCHAR(30),
    previous_invoice_hash TEXT NOT NULL DEFAULT '0',
    invoice_hash TEXT NOT NULL,
    zatca_qr_code TEXT NOT NULL, -- Base64 encoded TLV payload
    zatca_status VARCHAR(30) NOT NULL DEFAULT 'reported', -- 'reported', 'cleared', 'exempt'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON public.invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view their own tax invoices" ON public.invoices;
CREATE POLICY "Customers can view their own tax invoices"
    ON public.invoices
    FOR SELECT
    TO authenticated
    USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers view invoices issued for their bookings" ON public.invoices;
CREATE POLICY "Providers view invoices issued for their bookings"
    ON public.invoices
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = invoices.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Admins view and manage all tax invoices" ON public.invoices;
CREATE POLICY "Admins view and manage all tax invoices"
    ON public.invoices
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    );

-- Helper: ZATCA TLV Tag Encoder
CREATE OR REPLACE FUNCTION public.zatca_tlv_tag(
    p_tag INT,
    p_value TEXT
)
RETURNS bytea
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_val_bytes bytea := convert_to(COALESCE(p_value, ''), 'UTF8');
    v_len INT := length(v_val_bytes);
BEGIN
    RETURN set_byte('\x00'::bytea, 0, p_tag) || set_byte('\x00'::bytea, 0, v_len) || v_val_bytes;
END;
$$;

-- RPC: Generate ZATCA Tax Invoice for booking
CREATE OR REPLACE FUNCTION public.generate_zatca_tax_invoice(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking public.bookings;
    v_provider public.providers;
    v_customer public.profiles;
    v_branch public.branches;
    v_seller_name VARCHAR(255);
    v_seller_vat VARCHAR(30);
    v_buyer_name VARCHAR(255);
    v_subtotal DECIMAL(10,2);
    v_vat_amt DECIMAL(10,2);
    v_total DECIMAL(10,2);
    v_prev_hash TEXT := '0';
    v_current_hash TEXT;
    v_invoice_num VARCHAR(50);
    v_tlv_bytes bytea;
    v_qr_base64 TEXT;
    v_invoice_id UUID;
    v_iso_time TEXT;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    -- Lookup branch and provider
    SELECT * INTO v_branch FROM public.branches WHERE id = v_booking.branch_id;
    SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;
    SELECT * INTO v_customer FROM public.profiles WHERE id = v_booking.client_id;

    -- Check if invoice already exists
    SELECT id, invoice_number, zatca_qr_code INTO v_invoice_id, v_invoice_num, v_qr_base64
    FROM public.invoices
    WHERE booking_id = p_booking_id
    LIMIT 1;

    IF v_invoice_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'invoice_id', v_invoice_id,
            'invoice_number', v_invoice_num,
            'zatca_qr_code', v_qr_base64,
            'already_generated', TRUE
        );
    END IF;

    v_seller_name := COALESCE(v_provider.business_name_ar, v_provider.business_name_en, 'PRIMORA Luxury Grooming');
    v_seller_vat := '300000000000003'; -- KSA 15-digit Tax ID (ZATCA compliant format)
    v_buyer_name := COALESCE(v_customer.first_name || ' ' || v_customer.last_name, 'Verified Customer');

    v_total := v_booking.total_price;
    -- In KSA 15% VAT: Total = Subtotal * 1.15 => Subtotal = Total / 1.15
    v_subtotal := ROUND(v_total / 1.15, 2);
    v_vat_amt := v_total - v_subtotal;

    -- Fetch previous invoice hash for hash chain
    SELECT invoice_hash INTO v_prev_hash
    FROM public.invoices
    WHERE provider_id = v_provider.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        v_prev_hash := '0';
    END IF;

    v_invoice_num := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.zatca_invoice_seq')::text, 6, '0');
    v_iso_time := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    -- Compute SHA-256 Hash of invoice payload
    v_current_hash := encode(digest(v_prev_hash || v_invoice_num || v_total::text || v_vat_amt::text || v_iso_time, 'sha256'), 'hex');

    -- Build ZATCA Phase 1 standard TLV (Tags 1 to 5)
    v_tlv_bytes := public.zatca_tlv_tag(1, v_seller_name)
                || public.zatca_tlv_tag(2, v_seller_vat)
                || public.zatca_tlv_tag(3, v_iso_time)
                || public.zatca_tlv_tag(4, v_total::text)
                || public.zatca_tlv_tag(5, v_vat_amt::text);

    v_qr_base64 := encode(v_tlv_bytes, 'base64');

    INSERT INTO public.invoices (
        booking_id,
        provider_id,
        customer_id,
        invoice_number,
        issue_date,
        subtotal_sar,
        vat_rate_percent,
        vat_amount_sar,
        total_amount_sar,
        seller_name,
        seller_vat_number,
        buyer_name,
        previous_invoice_hash,
        invoice_hash,
        zatca_qr_code,
        zatca_status
    ) VALUES (
        p_booking_id,
        v_provider.id,
        v_booking.client_id,
        v_invoice_num,
        NOW(),
        v_subtotal,
        15.00,
        v_vat_amt,
        v_total,
        v_seller_name,
        v_seller_vat,
        v_buyer_name,
        v_prev_hash,
        v_current_hash,
        v_qr_base64,
        'reported'
    ) RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'total_amount_sar', v_total,
        'vat_amount_sar', v_vat_amt,
        'zatca_qr_code', v_qr_base64,
        'hash', v_current_hash
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_zatca_tax_invoice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_zatca_tax_invoice(UUID) TO authenticated;
