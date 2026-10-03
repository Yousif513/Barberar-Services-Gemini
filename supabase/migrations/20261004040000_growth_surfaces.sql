-- ============================================================================
-- PRIMORA P1-E MIGRATION: GROWTH SURFACES (G27, G28, G29, G35, G41, G43, G37)
-- 1. G29: Server search with Arabic normalization & distance calculation
-- 2. G35: Client directory import with Saudi PDPL consent validation
-- 3. G41: Post-visit automated review & rebook loop trigger
-- 4. G43: Monthly "PRIMORA brought you..." value summary RPC
-- 5. G37: Home-service address privacy & secure reveal model
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. G29: SERVER SEARCH WITH ARABIC NORMALIZATION & DISTANCE CALCULATION
-- ----------------------------------------------------------------------------

-- Helper: Normalize Arabic string for robust fuzzy matching
CREATE OR REPLACE FUNCTION public.normalize_arabic(p_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_norm TEXT;
BEGIN
    IF p_text IS NULL THEN
        RETURN '';
    END IF;

    v_norm := lower(trim(p_text));
    
    -- Replace all forms of Alef with bare Alef
    v_norm := regexp_replace(v_norm, '[إأآآ]', 'ا', 'g');
    -- Replace Taa Marbuta with Haa
    v_norm := regexp_replace(v_norm, 'ة', 'ه', 'g');
    -- Replace Alef Maqsura with Yaa
    v_norm := regexp_replace(v_norm, 'ى', 'ي', 'g');
    -- Strip Arabic diacritics / tashkeel and tatweel
    v_norm := regexp_replace(v_norm, '[ًٌٍَُِّْـ]', '', 'g');

    RETURN v_norm;
END;
$$;

-- RPC: Marketplace server search
CREATE OR REPLACE FUNCTION public.search_marketplace_providers(
    p_query TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'all',
    p_city TEXT DEFAULT 'Riyadh',
    p_district TEXT DEFAULT 'all',
    p_user_lat DOUBLE PRECISION DEFAULT NULL,
    p_user_lng DOUBLE PRECISION DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_norm_query TEXT := '';
    v_results JSONB;
    v_total_count INT := 0;
BEGIN
    IF p_query IS NOT NULL AND trim(p_query) <> '' THEN
        v_norm_query := public.normalize_arabic(p_query);
    END IF;

    WITH filtered_branches AS (
        SELECT 
            b.id AS branch_id,
            b.provider_id,
            b.name_en AS branch_name_en,
            b.name_ar AS branch_name_ar,
            b.city,
            b.district,
            b.latitude,
            b.longitude,
            p.business_name_en,
            p.business_name_ar,
            p.verified_business,
            p.cr_verification_status,
            p.rating AS provider_rating,
            p.review_count,
            CASE 
                WHEN p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN
                    ROUND((
                        6371 * acos(
                            least(1.0, greatest(-1.0,
                                cos(radians(p_user_lat)) * cos(radians(b.latitude)) *
                                cos(radians(b.longitude) - radians(p_user_lng)) +
                                sin(radians(p_user_lat)) * sin(radians(b.latitude))
                            ))
                        )
                    )::numeric, 1)
                ELSE NULL
            END AS distance_km
        FROM public.branches b
        JOIN public.providers p ON p.id = b.provider_id
        WHERE p.status = 'approved'
          AND (p_city IS NULL OR p_city = 'all' OR lower(b.city) = lower(p_city))
          AND (p_district IS NULL OR p_district = 'all' OR lower(b.district) = lower(p_district))
          AND (
              v_norm_query = ''
              OR public.normalize_arabic(p.business_name_ar) ILIKE '%' || v_norm_query || '%'
              OR lower(p.business_name_en) ILIKE '%' || v_norm_query || '%'
              OR public.normalize_arabic(b.district) ILIKE '%' || v_norm_query || '%'
              OR lower(b.district) ILIKE '%' || v_norm_query || '%'
              OR EXISTS (
                  SELECT 1 FROM public.services s
                  WHERE s.branch_id = b.id
                    AND (
                        public.normalize_arabic(s.name_ar) ILIKE '%' || v_norm_query || '%'
                        OR lower(s.name_en) ILIKE '%' || v_norm_query || '%'
                    )
              )
          )
          AND (
              p_category IS NULL OR p_category = 'all'
              OR EXISTS (
                  SELECT 1 FROM public.services s
                  WHERE s.branch_id = b.id
                    AND (lower(s.category) = lower(p_category) OR s.category IS NULL)
              )
          )
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered_branches
    )
    SELECT total INTO v_total_count FROM counted;

    SELECT jsonb_agg(row_to_json(r))
    INTO v_results
    FROM (
        SELECT 
            fb.branch_id,
            fb.provider_id,
            fb.business_name_en,
            fb.business_name_ar,
            fb.branch_name_en,
            fb.branch_name_ar,
            fb.city,
            fb.district,
            fb.latitude,
            fb.longitude,
            fb.distance_km,
            fb.verified_business,
            fb.cr_verification_status,
            COALESCE(fb.provider_rating, 5.0) AS rating,
            COALESCE(fb.review_count, 0) AS reviews,
            (
                SELECT jsonb_agg(jsonb_build_object(
                    'id', s.id,
                    'name_en', s.name_en,
                    'name_ar', s.name_ar,
                    'price', s.price,
                    'duration_minutes', s.duration_minutes
                ))
                FROM (
                    SELECT * FROM public.services
                    WHERE branch_id = fb.branch_id
                    LIMIT 3
                ) s
            ) AS sample_services
        FROM filtered_branches fb
        ORDER BY 
            fb.distance_km ASC NULLS LAST,
            fb.provider_rating DESC NULLS LAST,
            fb.review_count DESC
        LIMIT p_limit
        OFFSET p_offset
    ) r;

    RETURN jsonb_build_object(
        'success', TRUE,
        'total_count', v_total_count,
        'providers', COALESCE(v_results, '[]'::jsonb),
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_marketplace_providers(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_marketplace_providers(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INT, INT) TO authenticated, anon;


-- ----------------------------------------------------------------------------
-- 2. G35: CLIENT DIRECTORY IMPORT WITH SAUDI PDPL CONSENT VALIDATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_client_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    imported_by UUID NOT NULL REFERENCES public.profiles(id),
    total_rows INT NOT NULL DEFAULT 0,
    successful_rows INT NOT NULL DEFAULT 0,
    consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_client_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers view own client imports" ON public.provider_client_imports;
CREATE POLICY "Providers view own client imports"
    ON public.provider_client_imports
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_client_imports.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- RPC: Import provider clients
CREATE OR REPLACE FUNCTION public.import_provider_clients(
    p_provider_id UUID,
    p_clients JSONB,
    p_consent_confirmed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_import_id UUID;
    v_row JSONB;
    v_count INT := 0;
    v_success INT := 0;
    v_phone TEXT;
    v_name TEXT;
    v_notes TEXT;
    v_client_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    -- Strict PDPL Consent Check
    IF NOT p_consent_confirmed THEN
        RAISE EXCEPTION 'PDPL Consent Required: You must certify that imported clients consented to booking communications' USING ERRCODE = '22023';
    END IF;

    SELECT (owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
    INTO v_is_authorized
    FROM public.providers
    WHERE id = p_provider_id;

    IF NOT (v_is_authorized OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: not authorized to import clients for this provider' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(p_clients) <> 'array' THEN
        RAISE EXCEPTION 'Invalid clients payload: must be a JSON array' USING ERRCODE = '22023';
    END IF;

    v_count := jsonb_array_length(p_clients);

    INSERT INTO public.provider_client_imports (
        provider_id,
        imported_by,
        total_rows,
        consent_confirmed
    ) VALUES (
        p_provider_id,
        v_user_id,
        v_count,
        p_consent_confirmed
    ) RETURNING id INTO v_import_id;

    FOR v_row IN SELECT * FROM jsonb_array_elements(p_clients)
    LOOP
        v_phone := TRIM(COALESCE(v_row->>'phone', ''));
        v_name := TRIM(COALESCE(v_row->>'name', ''));
        v_notes := TRIM(COALESCE(v_row->>'notes', ''));

        IF v_phone <> '' OR v_name <> '' THEN
            -- Check or find existing customer profile
            SELECT id INTO v_client_id
            FROM public.profiles
            WHERE phone = v_phone
            LIMIT 1;

            -- If no profile exists, generate guest placeholder id for notes
            IF v_client_id IS NULL THEN
                v_client_id := gen_random_uuid();
            END IF;

            -- Record client intake notes in provider_customer_notes
            INSERT INTO public.provider_customer_notes (
                provider_id,
                customer_id,
                notes,
                tags,
                is_vip
            ) VALUES (
                p_provider_id,
                v_client_id,
                COALESCE(v_notes, 'Imported client: ' || v_name),
                ARRAY['imported'],
                COALESCE((v_row->>'is_vip')::boolean, FALSE)
            )
            ON CONFLICT (provider_id, customer_id) DO UPDATE
            SET notes = EXCLUDED.notes,
                tags = array_cat(provider_customer_notes.tags, ARRAY['imported']);

            v_success := v_success + 1;
        END IF;
    END LOOP;

    UPDATE public.provider_client_imports
    SET successful_rows = v_success
    WHERE id = v_import_id;

    INSERT INTO public.admin_audit_log (
        admin_id,
        action,
        target_entity,
        target_id,
        payload
    ) VALUES (
        v_user_id,
        'provider.clients_imported',
        'provider_client_imports',
        v_import_id,
        jsonb_build_object(
            'provider_id', p_provider_id,
            'total', v_count,
            'successful', v_success
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'import_id', v_import_id,
        'total_rows', v_count,
        'successful_rows', v_success
    );
END;
$$;

REVOKE ALL ON FUNCTION public.import_provider_clients(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_provider_clients(UUID, JSONB, BOOLEAN) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. G41: POST-VISIT AUTOMATED REVIEW & REBOOK LOOP TRIGGER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_post_visit_rebook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_consent BOOLEAN := FALSE;
    v_phone TEXT;
    v_branch public.branches;
    v_provider public.providers;
    v_service public.services;
    v_emp public.employees;
    v_customer public.profiles;
BEGIN
    -- Only trigger when booking status transitions to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        SELECT * INTO v_customer FROM public.profiles WHERE id = NEW.client_id;
        v_phone := v_customer.phone;

        -- Verify customer phone and WhatsApp consent
        IF v_phone IS NOT NULL AND v_phone <> '' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.consents
                WHERE user_id = NEW.client_id
                  AND purpose = 'whatsapp_notifications'
                  AND granted = TRUE
            ) INTO v_has_consent;

            IF v_has_consent THEN
                SELECT * INTO v_branch FROM public.branches WHERE id = NEW.branch_id;
                SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;
                SELECT * INTO v_service FROM public.services WHERE id = NEW.service_id;
                SELECT * INTO v_emp FROM public.employees WHERE id = NEW.employee_id;

                -- Enqueue post-visit review and rebook message in message_queue
                INSERT INTO public.message_queue (
                    booking_id,
                    recipient_phone,
                    channel,
                    template_key,
                    payload,
                    status,
                    scheduled_for
                ) VALUES (
                    NEW.id,
                    v_phone,
                    'whatsapp',
                    'post_visit_review_rebook',
                    jsonb_build_object(
                        'customer_name', COALESCE(v_customer.first_name, 'Client'),
                        'provider_name', COALESCE(v_provider.business_name_ar, v_provider.business_name_en),
                        'service_name', COALESCE(v_service.name_ar, v_service.name_en),
                        'stylist_name', COALESCE(v_emp.name_ar, v_emp.name_en),
                        'review_url', 'https://primora.sa/customer/reviews?booking_id=' || NEW.id,
                        'rebook_url', 'https://primora.sa/shop/' || v_provider.id
                    ),
                    'pending',
                    NOW() + interval '2 hours'
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enqueue_post_visit_rebook ON public.bookings;
CREATE TRIGGER trigger_enqueue_post_visit_rebook
    AFTER UPDATE OF status ON public.bookings
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION public.enqueue_post_visit_rebook();


-- ----------------------------------------------------------------------------
-- 4. G43: MONTHLY "PRIMORA BROUGHT YOU..." VALUE SUMMARY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.provider_value_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    month_date DATE NOT NULL,
    new_clients_acquired INT NOT NULL DEFAULT 0,
    marketplace_bookings INT NOT NULL DEFAULT 0,
    direct_link_bookings INT NOT NULL DEFAULT 0,
    total_gmv_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    direct_commission_saved_sar DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, month_date)
);

ALTER TABLE public.provider_value_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Providers view own value summaries" ON public.provider_value_summaries;
CREATE POLICY "Providers view own value summaries"
    ON public.provider_value_summaries
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.providers p
            WHERE p.id = provider_value_summaries.provider_id
              AND (p.owner_id = auth.uid() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
        )
    );

-- RPC: Get or generate provider monthly value summary
CREATE OR REPLACE FUNCTION public.get_provider_monthly_value_summary(
    p_provider_id UUID,
    p_month_date DATE DEFAULT CURRENT_DATE
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
    v_new_clients INT := 0;
    v_mkt_bookings INT := 0;
    v_direct_bookings INT := 0;
    v_gmv DECIMAL(10,2) := 0.00;
    v_direct_gmv DECIMAL(10,2) := 0.00;
    v_saved_commission DECIMAL(10,2) := 0.00;
BEGIN
    IF v_user_id IS NOT NULL THEN
        SELECT (owner_id = v_user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin'))
        INTO v_is_authorized
        FROM public.providers
        WHERE id = p_provider_id;
    END IF;

    IF NOT (v_is_authorized OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
        RAISE EXCEPTION 'Forbidden: not authorized to view value summary for this provider' USING ERRCODE = '42501';
    END IF;

    -- Aggregate completed bookings in month
    SELECT 
        COUNT(CASE WHEN b.is_first_visit THEN 1 END),
        COUNT(CASE WHEN b.source = 'marketplace' THEN 1 END),
        COUNT(CASE WHEN b.source <> 'marketplace' THEN 1 END),
        COALESCE(SUM(b.total_price), 0.00),
        COALESCE(SUM(CASE WHEN b.source <> 'marketplace' THEN b.total_price ELSE 0 END), 0.00)
    INTO v_new_clients, v_mkt_bookings, v_direct_bookings, v_gmv, v_direct_gmv
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE br.provider_id = p_provider_id
      AND b.status = 'completed'
      AND DATE(b.scheduled_at AT TIME ZONE 'Asia/Riyadh') BETWEEN v_start_date AND v_end_date;

    -- Calculate saved commission on own-channel bookings (15% saved)
    v_saved_commission := ROUND(v_direct_gmv * 0.15, 2);

    INSERT INTO public.provider_value_summaries (
        provider_id,
        month_date,
        new_clients_acquired,
        marketplace_bookings,
        direct_link_bookings,
        total_gmv_sar,
        direct_commission_saved_sar
    ) VALUES (
        p_provider_id,
        v_start_date,
        v_new_clients,
        v_mkt_bookings,
        v_direct_bookings,
        v_gmv,
        v_saved_commission
    )
    ON CONFLICT (provider_id, month_date) DO UPDATE
    SET new_clients_acquired = EXCLUDED.new_clients_acquired,
        marketplace_bookings = EXCLUDED.marketplace_bookings,
        direct_link_bookings = EXCLUDED.direct_link_bookings,
        total_gmv_sar = EXCLUDED.total_gmv_sar,
        direct_commission_saved_sar = EXCLUDED.direct_commission_saved_sar;

    RETURN jsonb_build_object(
        'success', TRUE,
        'provider_id', p_provider_id,
        'month', to_char(v_start_date, 'YYYY-MM'),
        'new_clients_acquired', v_new_clients,
        'marketplace_bookings', v_mkt_bookings,
        'direct_link_bookings', v_direct_bookings,
        'total_gmv_sar', v_gmv,
        'commission_saved_sar', v_saved_commission
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_provider_monthly_value_summary(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_monthly_value_summary(UUID, DATE) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. G37: HOME SERVICE ADDRESS PRIVACY & REVEAL MODEL
-- ----------------------------------------------------------------------------

-- Add home-service privacy columns to bookings if not existing
ALTER TABLE public.bookings 
    ADD COLUMN IF NOT EXISTS is_home_service BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS home_address_text TEXT,
    ADD COLUMN IF NOT EXISTS address_revealed_at TIMESTAMPTZ;

-- RPC: Secure address reveal (G37)
CREATE OR REPLACE FUNCTION public.get_booking_address_secure(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_booking public.bookings;
    v_is_authorized BOOLEAN := FALSE;
    v_branch public.branches;
    v_provider public.providers;
    v_revealed_address TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_branch FROM public.branches WHERE id = v_booking.branch_id;
    SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;

    -- Check if caller is client, assigned specialist, or provider owner/admin
    IF v_booking.client_id = v_user_id 
       OR v_booking.employee_id IN (SELECT id FROM public.employees WHERE user_id = v_user_id)
       OR v_provider.owner_id = v_user_id 
       OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin')
       OR COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Forbidden: not authorized to view booking address' USING ERRCODE = '42501';
    END IF;

    -- Address privacy rule: reveal only after booking is confirmed or completed
    IF v_booking.is_home_service THEN
        IF v_booking.status IN ('confirmed', 'in_service', 'completed') THEN
            v_revealed_address := v_booking.home_address_text;
            -- Record audit timestamp for address reveal
            IF v_booking.address_revealed_at IS NULL THEN
                UPDATE public.bookings
                SET address_revealed_at = NOW()
                WHERE id = p_booking_id;
            END IF;
        ELSE
            -- Masked before confirmation
            v_revealed_address := 'Address hidden until booking confirmation (محجوب حتى تأكيد الحجز)';
        END IF;
    ELSE
        -- Salon branch address
        v_revealed_address := COALESCE(v_branch.address_ar, v_branch.address_en, 'Salon location');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'is_home_service', v_booking.is_home_service,
        'status', v_booking.status,
        'address', v_revealed_address
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_booking_address_secure(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_address_secure(UUID) TO authenticated;
