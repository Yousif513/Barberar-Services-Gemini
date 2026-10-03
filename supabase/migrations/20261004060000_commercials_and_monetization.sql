-- ==============================================================================
-- MILESTONE P2-B: Commercials & Monetization
-- Items:
--   G45: Purchasable packages & bundle redemption tracking
--   G46: Coupons & promo codes redeemed at booking with funding rules (platform vs provider)
--   G47: Post-visit staff tipping flow (100% to professional, 0% platform commission)
--   G48: Customer gift cards & appointment gifting ledger
--   G49: Customer referral credits & CAC reduction rewards
--   G50: Loyalty points program, tier multipliers & repeat visit reward ledger
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. G45: PURCHASABLE PACKAGES & REDEMPTION TRACKING
-- ------------------------------------------------------------------------------

-- Ensure packages table has optional service_id reference
ALTER TABLE public.packages
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packages_provider_active
ON public.packages (provider_id, is_active);

-- Package redemptions tracking table
CREATE TABLE IF NOT EXISTS public.package_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_package_id UUID NOT NULL REFERENCES public.user_packages(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_package_redemptions_user_pkg
ON public.package_redemptions (user_package_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_package_redemptions_customer
ON public.package_redemptions (customer_id);

ALTER TABLE public.package_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage package redemptions" ON public.package_redemptions;
CREATE POLICY "Admins manage package redemptions"
ON public.package_redemptions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own package redemptions" ON public.package_redemptions;
CREATE POLICY "Customers view own package redemptions"
ON public.package_redemptions
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers view redemptions for their packages" ON public.package_redemptions;
CREATE POLICY "Providers view redemptions for their packages"
ON public.package_redemptions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.user_packages up
        JOIN public.packages p ON up.package_id = p.id
        JOIN public.providers pr ON p.provider_id = pr.id
        WHERE up.id = package_redemptions.user_package_id
          AND pr.owner_id = auth.uid()
    )
);

GRANT SELECT, INSERT ON public.package_redemptions TO authenticated;

-- RPC: Purchase a package
CREATE OR REPLACE FUNCTION public.purchase_service_package(
    p_package_id UUID,
    p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_pkg public.packages%ROWTYPE;
    v_user_pkg_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to purchase packages' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_pkg
    FROM public.packages
    WHERE id = p_package_id AND is_active = TRUE;

    IF v_pkg.id IS NULL THEN
        RAISE EXCEPTION 'Package not found or inactive' USING ERRCODE = 'P0002';
    END IF;

    v_expires_at := CURRENT_TIMESTAMP + (INTERVAL '1 day' * COALESCE(v_pkg.expires_in_days, 365));

    INSERT INTO public.user_packages (
        customer_id,
        package_id,
        remaining_sessions,
        expires_at
    ) VALUES (
        v_user_id,
        v_pkg.id,
        v_pkg.session_count,
        v_expires_at
    ) RETURNING id INTO v_user_pkg_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'customer.package_purchased',
        'user_packages',
        v_user_pkg_id,
        jsonb_build_object(
            'package_id', v_pkg.id,
            'package_name_en', v_pkg.name_en,
            'package_name_ar', v_pkg.name_ar,
            'price_sar', v_pkg.price,
            'session_count', v_pkg.session_count,
            'payment_method', p_payment_method,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_package_id', v_user_pkg_id,
        'package_id', v_pkg.id,
        'remaining_sessions', v_pkg.session_count,
        'price_sar', v_pkg.price,
        'expires_at', v_expires_at
    );
END;
$$;

-- RPC: Redeem a package session
CREATE OR REPLACE FUNCTION public.redeem_package_session(
    p_user_package_id UUID,
    p_booking_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_pkg public.user_packages%ROWTYPE;
    v_pkg public.packages%ROWTYPE;
    v_is_authorized BOOLEAN := FALSE;
    v_redemption_id UUID;
    v_new_remaining INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to redeem package session' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_user_pkg
    FROM public.user_packages
    WHERE id = p_user_package_id;

    IF v_user_pkg.id IS NULL THEN
        RAISE EXCEPTION 'Purchased package record not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_pkg
    FROM public.packages
    WHERE id = v_user_pkg.package_id;

    -- Check authorization: customer themselves, package provider owner, or platform admin
    IF v_user_pkg.customer_id = v_user_id OR public.is_admin() THEN
        v_is_authorized := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.providers pr
            WHERE pr.id = v_pkg.provider_id AND pr.owner_id = v_user_id
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Not authorized to redeem sessions from this package' USING ERRCODE = '42501';
    END IF;

    -- Validate session count and expiry
    IF v_user_pkg.remaining_sessions <= 0 THEN
        RAISE EXCEPTION 'No remaining sessions in this package' USING ERRCODE = '22023';
    END IF;

    IF v_user_pkg.expires_at IS NOT NULL AND v_user_pkg.expires_at < CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'This package has expired' USING ERRCODE = '22023';
    END IF;

    v_new_remaining := v_user_pkg.remaining_sessions - 1;

    UPDATE public.user_packages
    SET remaining_sessions = v_new_remaining
    WHERE id = p_user_package_id;

    INSERT INTO public.package_redemptions (
        user_package_id,
        booking_id,
        customer_id,
        notes
    ) VALUES (
        p_user_package_id,
        p_booking_id,
        v_user_pkg.customer_id,
        p_notes
    ) RETURNING id INTO v_redemption_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'customer.package_session_redeemed',
        'package_redemptions',
        v_redemption_id,
        jsonb_build_object(
            'user_package_id', p_user_package_id,
            'package_id', v_pkg.id,
            'booking_id', p_booking_id,
            'remaining_sessions', v_new_remaining
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'redemption_id', v_redemption_id,
        'remaining_sessions', v_new_remaining,
        'package_name_en', v_pkg.name_en,
        'package_name_ar', v_pkg.name_ar
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_service_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_package_session TO authenticated;


-- ------------------------------------------------------------------------------
-- 2. G46: COUPONS REDEEMED AT BOOKING WITH FUNDING RULES
-- ------------------------------------------------------------------------------

-- Add funding and scoping columns to promotional_codes
ALTER TABLE public.promotional_codes
ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'platform'
    CHECK (funding_source IN ('platform', 'provider')),
ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (min_order_amount >= 0),
ADD COLUMN IF NOT EXISTS max_discount_cap DECIMAL(10,2) CHECK (max_discount_cap IS NULL OR max_discount_cap > 0);

CREATE INDEX IF NOT EXISTS idx_promotional_codes_provider
ON public.promotional_codes (provider_id);

-- Coupon redemptions table
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.promotional_codes(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    discount_amount DECIMAL(10,2) NOT NULL CHECK (discount_amount > 0),
    funding_source TEXT NOT NULL CHECK (funding_source IN ('platform', 'provider')),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (coupon_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer
ON public.coupon_redemptions (customer_id);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_booking
ON public.coupon_redemptions (booking_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage coupon redemptions" ON public.coupon_redemptions;
CREATE POLICY "Admins manage coupon redemptions"
ON public.coupon_redemptions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own coupon redemptions" ON public.coupon_redemptions;
CREATE POLICY "Customers view own coupon redemptions"
ON public.coupon_redemptions
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers view redemptions for their bookings" ON public.coupon_redemptions;
CREATE POLICY "Providers view redemptions for their bookings"
ON public.coupon_redemptions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.branches br ON b.branch_id = br.id
        JOIN public.providers pr ON br.provider_id = pr.id
        WHERE b.id = coupon_redemptions.booking_id
          AND pr.owner_id = auth.uid()
    )
);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;

-- RPC: Validate and calculate coupon discount
CREATE OR REPLACE FUNCTION public.validate_and_apply_coupon(
    p_code TEXT,
    p_provider_id UUID,
    p_order_amount DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_coupon public.promotional_codes%ROWTYPE;
    v_discount DECIMAL(10,2) := 0.00;
    v_final DECIMAL(10,2);
BEGIN
    IF p_code IS NULL OR TRIM(p_code) = '' THEN
        RAISE EXCEPTION 'Coupon code is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_coupon
    FROM public.promotional_codes
    WHERE UPPER(code) = UPPER(TRIM(p_code))
      AND is_active = TRUE
      AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
      AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP);

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'Invalid or expired promotional code'
        );
    END IF;

    -- Check redemption limit
    IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'Promotional code has reached maximum usage limit'
        );
    END IF;

    -- Check provider scoping
    IF v_coupon.provider_id IS NOT NULL AND v_coupon.provider_id <> p_provider_id THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', 'Promotional code is not valid for this provider'
        );
    END IF;

    -- Check minimum order amount
    IF p_order_amount < v_coupon.min_order_amount THEN
        RETURN jsonb_build_object(
            'valid', false,
            'reason', format('Order amount must be at least %s SAR to use this coupon', v_coupon.min_order_amount)
        );
    END IF;

    -- Calculate discount
    IF v_coupon.discount_type = 'percentage' THEN
        v_discount := ROUND((p_order_amount * v_coupon.discount_value / 100.0), 2);
        IF v_coupon.max_discount_cap IS NOT NULL AND v_discount > v_coupon.max_discount_cap THEN
            v_discount := v_coupon.max_discount_cap;
        END IF;
    ELSE
        v_discount := LEAST(v_coupon.discount_value, p_order_amount);
    END IF;

    v_final := GREATEST(0.00, p_order_amount - v_discount);

    RETURN jsonb_build_object(
        'valid', true,
        'coupon_id', v_coupon.id,
        'code', v_coupon.code,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value,
        'discount_amount', v_discount,
        'funding_source', v_coupon.funding_source,
        'original_amount', p_order_amount,
        'final_amount', v_final
    );
END;
$$;

-- RPC: Redeem coupon for a booking
CREATE OR REPLACE FUNCTION public.apply_coupon_to_booking(
    p_booking_id UUID,
    p_coupon_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings%ROWTYPE;
    v_provider_id UUID;
    v_eval JSONB;
    v_coupon_id UUID;
    v_discount DECIMAL(10,2);
    v_funding TEXT;
    v_new_total DECIMAL(10,2);
    v_new_deposit DECIMAL(10,2);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.customer_id <> v_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Not authorized to apply coupon to this booking' USING ERRCODE = '42501';
    END IF;

    IF v_booking.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Cannot apply coupon to an already paid booking' USING ERRCODE = '22023';
    END IF;

    SELECT provider_id INTO v_provider_id
    FROM public.branches
    WHERE id = v_booking.branch_id;

    v_eval := public.validate_and_apply_coupon(p_coupon_code, v_provider_id, v_booking.total_price);

    IF (v_eval->>'valid')::boolean <> TRUE THEN
        RAISE EXCEPTION 'Coupon invalid: %', (v_eval->>'reason') USING ERRCODE = '22023';
    END IF;

    v_coupon_id := (v_eval->>'coupon_id')::UUID;
    v_discount := (v_eval->>'discount_amount')::DECIMAL;
    v_funding := v_eval->>'funding_source';
    v_new_total := (v_eval->>'final_amount')::DECIMAL;
    v_new_deposit := ROUND(v_new_total * 0.20, 2);

    -- Insert redemption
    INSERT INTO public.coupon_redemptions (
        coupon_id,
        customer_id,
        booking_id,
        discount_amount,
        funding_source
    ) VALUES (
        v_coupon_id,
        v_booking.customer_id,
        p_booking_id,
        v_discount,
        v_funding
    );

    -- Increment coupon redeemed count
    UPDATE public.promotional_codes
    SET redeemed_count = redeemed_count + 1
    WHERE id = v_coupon_id;

    -- Update booking price and deposit
    UPDATE public.bookings
    SET total_price = v_new_total,
        deposit_required = v_new_deposit
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'booking.coupon_redeemed',
        'bookings',
        p_booking_id,
        jsonb_build_object(
            'coupon_id', v_coupon_id,
            'coupon_code', p_coupon_code,
            'discount_amount', v_discount,
            'funding_source', v_funding,
            'original_price', v_booking.total_price,
            'new_total_price', v_new_total
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'discount_amount', v_discount,
        'new_total_price', v_new_total,
        'new_deposit_required', v_new_deposit,
        'funding_source', v_funding
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_and_apply_coupon TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_coupon_to_booking TO authenticated;


-- ------------------------------------------------------------------------------
-- 3. G47: POST-VISIT STAFF TIPPING (100% to Professional)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.booking_tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 5.00), -- minimum 5 SAR
    payment_method TEXT NOT NULL DEFAULT 'card'
        CHECK (payment_method IN ('card', 'apple_pay', 'mada', 'wallet')),
    status TEXT NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'paid_out', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_tips_employee
ON public.booking_tips (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_tips_provider
ON public.booking_tips (provider_id, created_at DESC);

ALTER TABLE public.booking_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage booking tips" ON public.booking_tips;
CREATE POLICY "Admins manage booking tips"
ON public.booking_tips
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own booking tips" ON public.booking_tips;
CREATE POLICY "Customers view own booking tips"
ON public.booking_tips
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers view tips for their salon" ON public.booking_tips;
CREATE POLICY "Providers view tips for their salon"
ON public.booking_tips
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.providers pr
        WHERE pr.id = booking_tips.provider_id AND pr.owner_id = auth.uid()
    )
);

GRANT SELECT, INSERT ON public.booking_tips TO authenticated;

-- RPC: Add tip to a booking
CREATE OR REPLACE FUNCTION public.add_booking_tip(
    p_booking_id UUID,
    p_amount DECIMAL,
    p_payment_method TEXT DEFAULT 'card'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings%ROWTYPE;
    v_provider_id UUID;
    v_tip_id UUID;
    v_emp_name TEXT;
    v_msg_payload JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to send tips' USING ERRCODE = '28000';
    END IF;

    IF p_amount < 5.00 THEN
        RAISE EXCEPTION 'Minimum tip amount is 5.00 SAR' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.customer_id <> v_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the booking customer can send a tip' USING ERRCODE = '42501';
    END IF;

    IF v_booking.employee_id IS NULL THEN
        RAISE EXCEPTION 'Cannot tip a booking with no assigned professional' USING ERRCODE = '22023';
    END IF;

    -- Resolve provider_id
    SELECT provider_id INTO v_provider_id
    FROM public.branches
    WHERE id = v_booking.branch_id;

    -- Fetch employee name
    SELECT name_en INTO v_emp_name
    FROM public.employees
    WHERE id = v_booking.employee_id;

    -- Record tip (100% to employee)
    INSERT INTO public.booking_tips (
        booking_id,
        customer_id,
        employee_id,
        provider_id,
        amount,
        payment_method,
        status
    ) VALUES (
        p_booking_id,
        v_user_id,
        v_booking.employee_id,
        v_provider_id,
        p_amount,
        p_payment_method,
        'completed'
    ) RETURNING id INTO v_tip_id;

    -- Record ledger entry (100% to pro, 0% platform fee)
    INSERT INTO public.transactional_ledger (
        booking_id,
        total_captured,
        platform_fee,
        tax_collected,
        net_provider_payout,
        payout_status,
        provider_id
    ) VALUES (
        p_booking_id,
        p_amount,
        0.00, -- 0% platform commission on tips
        0.00,
        p_amount,
        'pending',
        v_provider_id
    );

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'customer.tip_submitted',
        'booking_tips',
        v_tip_id,
        jsonb_build_object(
            'booking_id', p_booking_id,
            'employee_id', v_booking.employee_id,
            'provider_id', v_provider_id,
            'amount_sar', p_amount,
            'pro_received_sar', p_amount,
            'platform_fee_sar', 0.00,
            'payment_method', p_payment_method
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'tip_id', v_tip_id,
        'amount_sar', p_amount,
        'employee_name', v_emp_name,
        'net_pro_amount_sar', p_amount,
        'platform_fee_sar', 0.00
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_booking_tip TO authenticated;


-- ------------------------------------------------------------------------------
-- 4. G48: GIFT CARDS & APPOINTMENT GIFTING
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    purchaser_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    recipient_email TEXT,
    message TEXT,
    original_amount DECIMAL(10,2) NOT NULL CHECK (original_amount > 0),
    remaining_balance DECIMAL(10,2) NOT NULL CHECK (remaining_balance >= 0),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '365 days'),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'partially_redeemed', 'redeemed', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code
ON public.gift_cards (code);

CREATE INDEX IF NOT EXISTS idx_gift_cards_purchaser
ON public.gift_cards (purchaser_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gift_cards_recipient
ON public.gift_cards (recipient_phone);

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage gift cards" ON public.gift_cards;
CREATE POLICY "Admins manage gift cards"
ON public.gift_cards
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Purchasers view own gift cards" ON public.gift_cards;
CREATE POLICY "Purchasers view own gift cards"
ON public.gift_cards
FOR SELECT
TO authenticated
USING (purchaser_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.gift_card_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gift_card_id UUID NOT NULL REFERENCES public.gift_cards(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (gift_card_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_gift_card_redemptions_customer
ON public.gift_card_redemptions (customer_id);

ALTER TABLE public.gift_card_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage gift card redemptions" ON public.gift_card_redemptions;
CREATE POLICY "Admins manage gift card redemptions"
ON public.gift_card_redemptions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own gift card redemptions" ON public.gift_card_redemptions;
CREATE POLICY "Customers view own gift card redemptions"
ON public.gift_card_redemptions
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

GRANT SELECT, INSERT ON public.gift_cards TO authenticated;
GRANT SELECT, INSERT ON public.gift_card_redemptions TO authenticated;

-- RPC: Purchase a gift card
CREATE OR REPLACE FUNCTION public.purchase_gift_card(
    p_recipient_name TEXT,
    p_recipient_phone TEXT,
    p_recipient_email TEXT,
    p_amount DECIMAL,
    p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_code TEXT;
    v_card_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to purchase gift cards' USING ERRCODE = '28000';
    END IF;

    IF p_amount < 50.00 THEN
        RAISE EXCEPTION 'Minimum gift card amount is 50.00 SAR' USING ERRCODE = '22023';
    END IF;

    IF p_recipient_name IS NULL OR TRIM(p_recipient_name) = '' THEN
        RAISE EXCEPTION 'Recipient name is required' USING ERRCODE = '22023';
    END IF;

    IF p_recipient_phone IS NULL OR TRIM(p_recipient_phone) = '' THEN
        RAISE EXCEPTION 'Recipient phone number is required' USING ERRCODE = '22023';
    END IF;

    -- Generate random unique code (PRM-GIFT-XXXXXX)
    v_code := 'PRM-' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text), 1, 8));
    v_expires_at := CURRENT_TIMESTAMP + INTERVAL '365 days';

    INSERT INTO public.gift_cards (
        code,
        purchaser_id,
        recipient_name,
        recipient_phone,
        recipient_email,
        message,
        original_amount,
        remaining_balance,
        expires_at,
        status
    ) VALUES (
        v_code,
        v_user_id,
        TRIM(p_recipient_name),
        TRIM(p_recipient_phone),
        TRIM(p_recipient_email),
        p_message,
        p_amount,
        p_amount,
        v_expires_at,
        'active'
    ) RETURNING id INTO v_card_id;

    -- Enqueue WhatsApp gift notification
    INSERT INTO public.message_queue (
        recipient_phone,
        channel,
        template_name,
        variables,
        scheduled_for
    ) VALUES (
        TRIM(p_recipient_phone),
        'whatsapp',
        'gift_card_received',
        jsonb_build_object(
            'recipient_name', TRIM(p_recipient_name),
            'amount_sar', p_amount,
            'gift_code', v_code,
            'message', COALESCE(p_message, 'هدية عناية وتدليل مميزة من بريمورا!'),
            'redeem_url', format('https://primora.sa/customer/wallet?gift=%s', v_code)
        ),
        CURRENT_TIMESTAMP
    );

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'gift_card.purchased',
        'gift_cards',
        v_card_id,
        jsonb_build_object(
            'code', v_code,
            'amount_sar', p_amount,
            'recipient_name', TRIM(p_recipient_name),
            'recipient_phone', TRIM(p_recipient_phone)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'gift_card_id', v_card_id,
        'code', v_code,
        'amount_sar', p_amount,
        'expires_at', v_expires_at,
        'recipient_name', TRIM(p_recipient_name)
    );
END;
$$;

-- RPC: Check and redeem gift card towards a booking
CREATE OR REPLACE FUNCTION public.redeem_gift_card(
    p_code TEXT,
    p_booking_id UUID,
    p_amount DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_card public.gift_cards%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_actual_redeem DECIMAL(10,2);
    v_new_balance DECIMAL(10,2);
    v_new_status TEXT;
    v_redemption_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_card
    FROM public.gift_cards
    WHERE UPPER(code) = UPPER(TRIM(p_code))
      AND status IN ('active', 'partially_redeemed');

    IF v_card.id IS NULL THEN
        RAISE EXCEPTION 'Invalid or already fully redeemed gift card' USING ERRCODE = 'P0002';
    END IF;

    IF v_card.expires_at < CURRENT_TIMESTAMP THEN
        UPDATE public.gift_cards SET status = 'expired' WHERE id = v_card.id;
        RAISE EXCEPTION 'This gift card has expired' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_booking.customer_id <> v_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Not authorized to redeem gift card for this booking' USING ERRCODE = '42501';
    END IF;

    v_actual_redeem := LEAST(v_card.remaining_balance, p_amount, v_booking.deposit_required);
    IF v_actual_redeem <= 0 THEN
        RAISE EXCEPTION 'Redemption amount must be greater than 0' USING ERRCODE = '22023';
    END IF;

    v_new_balance := v_card.remaining_balance - v_actual_redeem;
    IF v_new_balance = 0 THEN
        v_new_status := 'redeemed';
    ELSE
        v_new_status := 'partially_redeemed';
    END IF;

    UPDATE public.gift_cards
    SET remaining_balance = v_new_balance,
        status = v_new_status
    WHERE id = v_card.id;

    INSERT INTO public.gift_card_redemptions (
        gift_card_id,
        customer_id,
        booking_id,
        amount
    ) VALUES (
        v_card.id,
        v_user_id,
        p_booking_id,
        v_actual_redeem
    ) RETURNING id INTO v_redemption_id;

    -- Reduce deposit required on booking
    UPDATE public.bookings
    SET deposit_required = GREATEST(0.00, deposit_required - v_actual_redeem)
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'gift_card.redeemed',
        'gift_card_redemptions',
        v_redemption_id,
        jsonb_build_object(
            'gift_card_id', v_card.id,
            'code', v_card.code,
            'booking_id', p_booking_id,
            'redeemed_amount', v_actual_redeem,
            'remaining_balance', v_new_balance
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'redeemed_amount', v_actual_redeem,
        'remaining_card_balance', v_new_balance,
        'status', v_new_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_gift_card TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card TO authenticated;


-- ------------------------------------------------------------------------------
-- 5. G49: CUSTOMER REFERRAL CREDITS & CAC REDUCTION
-- ------------------------------------------------------------------------------

-- Ensure profiles has unique referral_code
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Create customer referrals table
CREATE TABLE IF NOT EXISTS public.customer_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    reward_amount DECIMAL(10,2) NOT NULL DEFAULT 25.00 CHECK (reward_amount > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'qualified', 'rewarded', 'disqualified')),
    qualifying_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    rewarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (referee_id),
    CONSTRAINT referrals_distinct_users CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_referrals_referrer
ON public.customer_referrals (referrer_id, status);

ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage referrals" ON public.customer_referrals;
CREATE POLICY "Admins manage referrals"
ON public.customer_referrals
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users view their referrals" ON public.customer_referrals;
CREATE POLICY "Users view their referrals"
ON public.customer_referrals
FOR SELECT
TO authenticated
USING (referrer_id = auth.uid() OR referee_id = auth.uid());

-- Wallet credits table for referrals, promos, and compensations
CREATE TABLE IF NOT EXISTS public.wallet_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    reason TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('referral', 'loyalty', 'promotion', 'admin_adjustment', 'compensation')),
    is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_credits_customer
ON public.wallet_credits (customer_id, is_spent);

ALTER TABLE public.wallet_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage wallet credits" ON public.wallet_credits;
CREATE POLICY "Admins manage wallet credits"
ON public.wallet_credits
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own wallet credits" ON public.wallet_credits;
CREATE POLICY "Customers view own wallet credits"
ON public.wallet_credits
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

GRANT SELECT, INSERT ON public.customer_referrals TO authenticated;
GRANT SELECT, INSERT ON public.wallet_credits TO authenticated;

-- RPC: Get or create user referral code
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_code TEXT;
    v_invited_count INT;
    v_earned_sar DECIMAL(10,2);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT referral_code INTO v_code
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_code IS NULL OR TRIM(v_code) = '' THEN
        v_code := 'REF-' || UPPER(SUBSTRING(MD5(v_user_id::text), 1, 6));
        UPDATE public.profiles
        SET referral_code = v_code
        WHERE id = v_user_id;
    END IF;

    -- Aggregate referral stats
    SELECT 
        COUNT(*),
        COALESCE(SUM(CASE WHEN status = 'rewarded' THEN reward_amount ELSE 0 END), 0.00)
    INTO v_invited_count, v_earned_sar
    FROM public.customer_referrals
    WHERE referrer_id = v_user_id;

    RETURN jsonb_build_object(
        'referral_code', v_code,
        'share_url', format('https://primora.sa/login?ref=%s', v_code),
        'reward_per_friend_sar', 25.00,
        'invited_friends_count', v_invited_count,
        'total_earned_credits_sar', v_earned_sar
    );
END;
$$;

-- RPC: Apply referral code for new customer
CREATE OR REPLACE FUNCTION public.apply_referral_code(
    p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_referrer_id UUID;
    v_clean_code TEXT := UPPER(TRIM(p_referral_code));
    v_existing_referral UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF v_clean_code IS NULL OR v_clean_code = '' THEN
        RAISE EXCEPTION 'Referral code is required' USING ERRCODE = '22023';
    END IF;

    -- Find referrer
    SELECT id INTO v_referrer_id
    FROM public.profiles
    WHERE UPPER(referral_code) = v_clean_code;

    IF v_referrer_id IS NULL THEN
        RAISE EXCEPTION 'Invalid referral code' USING ERRCODE = 'P0002';
    END IF;

    IF v_referrer_id = v_user_id THEN
        RAISE EXCEPTION 'You cannot refer yourself' USING ERRCODE = '22023';
    END IF;

    -- Check if referee already was referred
    SELECT id INTO v_existing_referral
    FROM public.customer_referrals
    WHERE referee_id = v_user_id;

    IF v_existing_referral IS NOT NULL THEN
        RAISE EXCEPTION 'A referral code has already been applied for your account' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.customer_referrals (
        referrer_id,
        referee_id,
        referral_code,
        reward_amount,
        status
    ) VALUES (
        v_referrer_id,
        v_user_id,
        v_clean_code,
        25.00,
        'pending'
    );

    RETURN jsonb_build_object(
        'success', true,
        'reward_amount_sar', 25.00,
        'message', 'Referral code activated! Both you and your friend will receive 25 SAR wallet credits upon your first completed booking.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code TO authenticated;


-- ------------------------------------------------------------------------------
-- 6. G50: LOYALTY POINTS PROGRAM & REPEAT REWARDS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_loyalty (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    lifetime_points INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
    tier TEXT NOT NULL DEFAULT 'bronze'
        CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_customer
ON public.customer_loyalty (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_loyalty_provider
ON public.customer_loyalty (provider_id);

CREATE TABLE IF NOT EXISTS public.loyalty_points_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loyalty_id UUID NOT NULL REFERENCES public.customer_loyalty(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    points_change INTEGER NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN ('booking_completed', 'manual_adjustment', 'redemption', 'tier_bonus', 'referral_bonus')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_loyalty
ON public.loyalty_points_ledger (loyalty_id, created_at DESC);

ALTER TABLE public.customer_loyalty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer loyalty" ON public.customer_loyalty;
CREATE POLICY "Admins manage customer loyalty"
ON public.customer_loyalty
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own loyalty accounts" ON public.customer_loyalty;
CREATE POLICY "Customers view own loyalty accounts"
ON public.customer_loyalty
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Providers view loyalty accounts for their salon" ON public.customer_loyalty;
CREATE POLICY "Providers view loyalty accounts for their salon"
ON public.customer_loyalty
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.providers pr
        WHERE pr.id = customer_loyalty.provider_id AND pr.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Admins manage loyalty ledger" ON public.loyalty_points_ledger;
CREATE POLICY "Admins manage loyalty ledger"
ON public.loyalty_points_ledger
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers view own loyalty ledger" ON public.loyalty_points_ledger;
CREATE POLICY "Customers view own loyalty ledger"
ON public.loyalty_points_ledger
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.customer_loyalty cl
        WHERE cl.id = loyalty_points_ledger.loyalty_id AND cl.customer_id = auth.uid()
    )
);

GRANT SELECT, INSERT ON public.customer_loyalty TO authenticated;
GRANT SELECT, INSERT ON public.loyalty_points_ledger TO authenticated;

-- RPC: Redeem loyalty points for SAR discount
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
    p_provider_id UUID,
    p_points_to_redeem INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_loyalty public.customer_loyalty%ROWTYPE;
    v_discount_sar DECIMAL(10,2);
    v_new_balance INT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_points_to_redeem < 100 THEN
        RAISE EXCEPTION 'Minimum points redemption threshold is 100 points' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_loyalty
    FROM public.customer_loyalty
    WHERE customer_id = v_user_id AND provider_id = p_provider_id;

    IF v_loyalty.id IS NULL OR v_loyalty.points_balance < p_points_to_redeem THEN
        RAISE EXCEPTION 'Insufficient loyalty points balance' USING ERRCODE = '22023';
    END IF;

    -- 100 points = 10.00 SAR
    v_discount_sar := ROUND((p_points_to_redeem / 10.0), 2);
    v_new_balance := v_loyalty.points_balance - p_points_to_redeem;

    UPDATE public.customer_loyalty
    SET points_balance = v_new_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_loyalty.id;

    INSERT INTO public.loyalty_points_ledger (
        loyalty_id,
        points_change,
        event_type,
        description
    ) VALUES (
        v_loyalty.id,
        -p_points_to_redeem,
        'redemption',
        format('Redeemed %s points for %s SAR discount', p_points_to_redeem, v_discount_sar)
    );

    -- Audit log
    INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'loyalty.points_redeemed',
        'customer_loyalty',
        v_loyalty.id,
        jsonb_build_object(
            'customer_id', v_user_id,
            'provider_id', p_provider_id,
            'points_redeemed', p_points_to_redeem,
            'discount_amount_sar', v_discount_sar,
            'remaining_balance', v_new_balance
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'points_redeemed', p_points_to_redeem,
        'discount_amount_sar', v_discount_sar,
        'remaining_points', v_new_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_loyalty_points TO authenticated;


-- ------------------------------------------------------------------------------
-- 7. TRIGGER: BOOKING COMPLETED REWARDS (LOYALTY ACCRUAL & REFERRAL QUALIFICATION)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trigger_on_booking_completed_rewards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_provider_id UUID;
    v_earned_points INT;
    v_multiplier DECIMAL(3,2) := 1.00;
    v_loyalty_id UUID;
    v_cur_lifetime INT := 0;
    v_cur_balance INT := 0;
    v_cur_tier TEXT := 'bronze';
    v_new_tier TEXT;
    v_ref_record public.customer_referrals%ROWTYPE;
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        -- Resolve provider_id
        SELECT provider_id INTO v_provider_id
        FROM public.branches
        WHERE id = NEW.branch_id;

        IF v_provider_id IS NOT NULL AND NEW.customer_id IS NOT NULL THEN
            -- 1. LOYALTY POINTS ACCRUAL
            SELECT id, points_balance, lifetime_points, tier
            INTO v_loyalty_id, v_cur_balance, v_cur_lifetime, v_cur_tier
            FROM public.customer_loyalty
            WHERE customer_id = NEW.customer_id AND provider_id = v_provider_id;

            IF v_cur_tier = 'silver' THEN
                v_multiplier := 1.25;
            ELSIF v_cur_tier = 'gold' THEN
                v_multiplier := 1.50;
            ELSIF v_cur_tier = 'platinum' THEN
                v_multiplier := 2.00;
            END IF;

            v_earned_points := GREATEST(1, FLOOR(COALESCE(NEW.total_price, 0) * v_multiplier));
            v_cur_lifetime := v_cur_lifetime + v_earned_points;
            v_cur_balance := v_cur_balance + v_earned_points;

            -- Calculate tier
            IF v_cur_lifetime >= 3000 THEN
                v_new_tier := 'platinum';
            ELSIF v_cur_lifetime >= 1500 THEN
                v_new_tier := 'gold';
            ELSIF v_cur_lifetime >= 500 THEN
                v_new_tier := 'silver';
            ELSE
                v_new_tier := 'bronze';
            END IF;

            IF v_loyalty_id IS NULL THEN
                INSERT INTO public.customer_loyalty (
                    customer_id,
                    provider_id,
                    points_balance,
                    lifetime_points,
                    tier
                ) VALUES (
                    NEW.customer_id,
                    v_provider_id,
                    v_cur_balance,
                    v_cur_lifetime,
                    v_new_tier
                ) RETURNING id INTO v_loyalty_id;
            ELSE
                UPDATE public.customer_loyalty
                SET points_balance = v_cur_balance,
                    lifetime_points = v_cur_lifetime,
                    tier = v_new_tier,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = v_loyalty_id;
            END IF;

            INSERT INTO public.loyalty_points_ledger (
                loyalty_id,
                booking_id,
                points_change,
                event_type,
                description
            ) VALUES (
                v_loyalty_id,
                NEW.id,
                v_earned_points,
                'booking_completed',
                format('Earned %s points on booking completion (%s tier, %sx multiplier)', v_earned_points, v_cur_tier, v_multiplier)
            );

            -- 2. REFERRAL QUALIFICATION (First visit qualification)
            SELECT * INTO v_ref_record
            FROM public.customer_referrals
            WHERE referee_id = NEW.customer_id AND status = 'pending'
            LIMIT 1;

            IF v_ref_record.id IS NOT NULL THEN
                UPDATE public.customer_referrals
                SET status = 'rewarded',
                    qualifying_booking_id = NEW.id,
                    rewarded_at = CURRENT_TIMESTAMP
                WHERE id = v_ref_record.id;

                -- Reward referee (25 SAR)
                INSERT INTO public.wallet_credits (
                    customer_id,
                    amount,
                    reason,
                    source
                ) VALUES (
                    v_ref_record.referee_id,
                    v_ref_record.reward_amount,
                    'مكافأة الانضمام عبر رابط صديق (Referral Bonus)',
                    'referral'
                );

                -- Reward referrer (25 SAR)
                INSERT INTO public.wallet_credits (
                    customer_id,
                    amount,
                    reason,
                    source
                ) VALUES (
                    v_ref_record.referrer_id,
                    v_ref_record.reward_amount,
                    'مكافأة دعوة صديق مكتمل الحجز (Referral Reward)',
                    'referral'
                );

                -- Enqueue notification to referrer
                INSERT INTO public.message_queue (
                    recipient_phone,
                    channel,
                    template_name,
                    variables,
                    scheduled_for
                )
                SELECT 
                    phone_number,
                    'whatsapp',
                    'referral_reward_earned',
                    jsonb_build_object(
                        'reward_amount_sar', v_ref_record.reward_amount,
                        'message', 'مبروك! أكمل صديقك حجزه الأول وتمت إضافة 25 ريال إلى محفظتك في بريمورا.'
                    ),
                    CURRENT_TIMESTAMP
                FROM public.profiles
                WHERE id = v_ref_record.referrer_id AND phone_number IS NOT NULL;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_booking_completed_rewards ON public.bookings;
CREATE TRIGGER trigger_booking_completed_rewards
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.trigger_on_booking_completed_rewards();
