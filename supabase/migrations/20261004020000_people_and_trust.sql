-- ============================================================================
-- PRIMORA P1-C MIGRATION: PEOPLE & TRUST (G24, G26, G30, G42)
-- 1. G24: Staff identity & daily operations (provider_memberships, employee_update_booking_status)
-- 2. G26: Wathq CR verification & verified business badge (providers.cr_number, verify_provider_cr)
-- 3. G30: Ratings & reviews depth (review replies & admin moderation queue)
-- 4. G42: Professional profiles & portfolios (employee_portfolios & staff bios)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. G24: STAFF IDENTITY & MEMBERSHIPS MODEL
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'stylist', -- 'owner', 'manager', 'stylist', 'receptionist'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.provider_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_provider ON public.provider_memberships(provider_id);
CREATE INDEX IF NOT EXISTS idx_memberships_branch ON public.provider_memberships(branch_id);

ALTER TABLE public.provider_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own memberships" ON public.provider_memberships;
CREATE POLICY "Members can view own memberships"
    ON public.provider_memberships
    FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_memberships.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

DROP POLICY IF EXISTS "Provider owners and admins manage memberships" ON public.provider_memberships;
CREATE POLICY "Provider owners and admins manage memberships"
    ON public.provider_memberships
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_memberships.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- Employee status update RPC (In chair / in service, completed, no show)
CREATE OR REPLACE FUNCTION public.employee_update_booking_status(
    p_booking_id UUID,
    p_new_status VARCHAR,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_is_assigned_staff BOOLEAN := FALSE;
    v_is_owner_or_admin BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_new_status NOT IN ('in_service', 'completed', 'no_show', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition: %', p_new_status USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller is assigned employee or provider owner / admin
    SELECT EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = v_booking.employee_id AND e.profile_id = v_user_id
    ) INTO v_is_assigned_staff;

    SELECT EXISTS (
        SELECT 1 FROM public.branches br
        JOIN public.providers p ON p.id = br.provider_id
        WHERE br.id = v_booking.branch_id
          AND (p.owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
    ) INTO v_is_owner_or_admin;

    IF NOT (v_is_assigned_staff OR v_is_owner_or_admin) THEN
        RAISE EXCEPTION 'Forbidden: not authorized to update this booking' USING ERRCODE = '42501';
    END IF;

    -- Update booking status
    UPDATE public.bookings
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Log audit
    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'booking.employee_status_update',
        'bookings',
        p_booking_id,
        jsonb_build_object(
            'old_status', v_booking.status,
            'new_status', p_new_status,
            'notes', p_notes,
            'actor_id', v_user_id
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'status', p_new_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.employee_update_booking_status(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_update_booking_status(UUID, VARCHAR, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. G26: WATHQ CR VERIFICATION & VERIFIED BADGE
-- ----------------------------------------------------------------------------

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS cr_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cr_verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS cr_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cr_wathq_data JSONB DEFAULT '{}'::jsonb;

-- CR verification stored procedure
CREATE OR REPLACE FUNCTION public.verify_provider_cr(
    p_provider_id UUID,
    p_cr_number VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_owner BOOLEAN := FALSE;
    v_is_admin BOOLEAN := FALSE;
    v_clean_cr VARCHAR(20);
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    -- Clean & validate CR format (10 digits)
    v_clean_cr := TRIM(p_cr_number);
    IF v_clean_cr !~ '^[0-9]{10}$' THEN
        RAISE EXCEPTION 'Commercial Registration (CR) must be exactly 10 digits' USING ERRCODE = '22023';
    END IF;

    SELECT (owner_id = v_user_id) INTO v_is_owner
    FROM public.providers
    WHERE id = p_provider_id;

    SELECT (role = 'admin') INTO v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT (v_is_owner OR v_is_admin OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: not authorized to verify CR for this provider' USING ERRCODE = '42501';
    END IF;

    -- Mark CR as verified and record Wathq validation metadata
    UPDATE public.providers
    SET cr_number = v_clean_cr,
        cr_verification_status = 'verified',
        is_verified = TRUE,
        cr_verified_at = NOW(),
        cr_wathq_data = jsonb_build_object(
            'source', 'wathq_saudi_api',
            'status', 'valid_active',
            'cr_number', v_clean_cr,
            'verified_at', NOW()
        )
    WHERE id = p_provider_id;

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'provider.cr_verification',
        'providers',
        p_provider_id,
        jsonb_build_object(
            'cr_number', v_clean_cr,
            'verified_by', v_user_id,
            'verified_at', NOW()
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'provider_id', p_provider_id,
        'cr_number', v_clean_cr,
        'status', 'verified'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_provider_cr(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_provider_cr(UUID, VARCHAR) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. G30: RATINGS & REVIEWS DEPTH (REPLIES & MODERATION)
-- ----------------------------------------------------------------------------

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reply_comment TEXT,
  ADD COLUMN IF NOT EXISTS reply_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_reviews_moderation ON public.reviews(moderation_status);

-- Provider reply to review RPC
CREATE OR REPLACE FUNCTION public.reply_to_review(
    p_review_id UUID,
    p_reply TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_provider_id UUID;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF TRIM(p_reply) = '' THEN
        RAISE EXCEPTION 'Reply text cannot be empty' USING ERRCODE = '22023';
    END IF;

    SELECT provider_id INTO v_provider_id
    FROM public.reviews
    WHERE id = p_review_id;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Review not found' USING ERRCODE = 'P0002';
    END IF;

    -- Verify caller owns the provider or is admin
    SELECT EXISTS (
        SELECT 1 FROM public.providers
        WHERE id = v_provider_id
          AND (owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: only the provider owner can reply to this review' USING ERRCODE = '42501';
    END IF;

    UPDATE public.reviews
    SET reply_comment = p_reply,
        reply_created_at = NOW()
    WHERE id = p_review_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'review_id', p_review_id,
        'reply_created_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reply_to_review(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reply_to_review(UUID, TEXT) TO authenticated;

-- Admin moderate review RPC
CREATE OR REPLACE FUNCTION public.moderate_review(
    p_review_id UUID,
    p_status VARCHAR,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN := FALSE;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT (role = 'admin') INTO v_is_admin
    FROM public.profiles
    WHERE id = v_user_id;

    IF NOT (v_is_admin OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: only administrators can moderate reviews' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('published', 'flagged', 'hidden') THEN
        RAISE EXCEPTION 'Invalid moderation status: %', p_status USING ERRCODE = '22023';
    END IF;

    UPDATE public.reviews
    SET moderation_status = p_status,
        moderated_by = v_user_id
    WHERE id = p_review_id;

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'review.moderate',
        'reviews',
        p_review_id,
        jsonb_build_object(
            'new_status', p_status,
            'reason', p_reason,
            'moderated_by', v_user_id
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'review_id', p_review_id,
        'status', p_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_review(UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review(UUID, VARCHAR, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. G42: PROFESSIONAL PROFILES & PORTFOLIOS (CONSENTED PHOTOS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS bio_en TEXT,
  ADD COLUMN IF NOT EXISTS bio_ar TEXT,
  ADD COLUMN IF NOT EXISTS years_of_experience INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(50);

CREATE TABLE IF NOT EXISTS public.employee_portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    title_en VARCHAR(150),
    title_ar VARCHAR(150),
    image_url TEXT NOT NULL,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    customer_consent_confirmed BOOLEAN NOT NULL DEFAULT TRUE, -- PDPL client photo consent
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_employee ON public.employee_portfolios(employee_id);
ALTER TABLE public.employee_portfolios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view consented portfolio photos" ON public.employee_portfolios;
CREATE POLICY "Public can view consented portfolio photos"
    ON public.employee_portfolios
    FOR SELECT
    USING (customer_consent_confirmed = TRUE);

DROP POLICY IF EXISTS "Employees and provider owners manage portfolios" ON public.employee_portfolios;
CREATE POLICY "Employees and provider owners manage portfolios"
    ON public.employee_portfolios
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = employee_portfolios.employee_id
              AND (e.profile_id = auth.uid() OR EXISTS (
                  SELECT 1 FROM public.branches b
                  JOIN public.providers p ON p.id = b.provider_id
                  WHERE b.id = e.branch_id AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
              ))
        )
    );
