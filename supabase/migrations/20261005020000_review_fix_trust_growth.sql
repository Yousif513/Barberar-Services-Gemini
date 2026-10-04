-- Migration: 20261005020000_review_fix_trust_growth.sql
-- Corrective pass for P0-C / P0-E / P1-C / P1-E / P2-C (review 2026-10-04):
--   * CR verification is recorded only by the Wathq integration (service role) or an admin's
--     manual review; owners can no longer mark themselves "Wathq verified"
--   * provider approval activates the provider (verification is derived from status)
--   * agreements: only published versions can be accepted; unapproved texts return to draft
--   * marketplace search, client import and value summary use real columns
--   * WhatsApp dispatch: the database claims and renders messages; the dispatch-messages Edge
--     Function sends them through the WhatsApp Cloud API and reports the real outcome
--   * guests can read availability; internal functions are not callable by anon
--   * pg_cron schedules hold expiry, message dispatch and refund processing when available

-- ---------------------------------------------------------------------------
-- 1. Availability is public (read-only); attendance confirmation needs the customer
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_available_slots(UUID, DATE, INTEGER, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_available_slots(UUID, UUID, DATE, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_schedule_with_prayer_pauses(UUID, DATE, INTEGER, UUID, TIMESTAMPTZ[], TIMESTAMPTZ[], TEXT[]) TO anon;

CREATE OR REPLACE FUNCTION public.customer_confirm_attendance(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_booking.customer_id = auth.uid() OR public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    RAISE EXCEPTION 'Not authorized to confirm this booking' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be acknowledged' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bookings SET customer_attendance_confirmed = TRUE, attendance_confirmed_at = now() WHERE id = p_booking_id;
  RETURN jsonb_build_object('success', TRUE, 'booking_id', p_booking_id, 'attendance_confirmed', TRUE);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. CR verification
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_provider_cr(UUID, CHARACTER VARYING);

-- Called only by the wathq-verify Edge Function after the Wathq API confirmed the CR.
CREATE OR REPLACE FUNCTION public.record_wathq_cr_verification(
  p_provider_id UUID,
  p_cr_number TEXT,
  p_is_active BOOLEAN,
  p_wathq_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.providers
  SET cr_number = p_cr_number,
      cr_verification_status = CASE WHEN p_is_active THEN 'verified' ELSE 'rejected' END,
      cr_verified_at = CASE WHEN p_is_active THEN now() ELSE NULL END,
      cr_wathq_data = jsonb_build_object('source', 'wathq_api', 'checked_at', now(), 'response', p_wathq_payload)
  WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log('provider.cr_wathq_checked', 'providers', p_provider_id,
    jsonb_build_object('cr_number', p_cr_number, 'active', p_is_active));
  RETURN jsonb_build_object('success', TRUE, 'status', CASE WHEN p_is_active THEN 'verified' ELSE 'rejected' END);
END;
$$;

-- An administrator who checked the CR certificate by hand. Never shown as "Wathq verified".
CREATE OR REPLACE FUNCTION public.admin_record_cr_review(
  p_provider_id UUID,
  p_cr_number TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cr TEXT := TRIM(COALESCE(p_cr_number, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF v_cr !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Commercial Registration number must be 10 digits' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_notes, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Record what was checked (document reviewed, expiry date)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.providers
  SET cr_number = v_cr, cr_verification_status = 'manually_reviewed', cr_verified_at = now(),
      cr_wathq_data = jsonb_build_object('source', 'manual_admin_review', 'reviewed_by', auth.uid(),
                                         'reviewed_at', now(), 'notes', TRIM(p_notes))
  WHERE id = p_provider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log('provider.cr_manually_reviewed', 'providers', p_provider_id,
    jsonb_build_object('cr_number', v_cr, 'notes', TRIM(p_notes)));
  RETURN jsonb_build_object('success', TRUE, 'status', 'manually_reviewed');
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Provider approval
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_provider_application(
  p_application_id UUID,
  p_commission_percentage NUMERIC DEFAULT 15.00
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.provider_applications;
  v_provider_id UUID;
  v_branch_id UUID;
  v_vat TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required to approve provider applications.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Provider application not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application is already %.', v_app.status USING ERRCODE = '23505';
  END IF;
  IF v_app.latitude IS NULL OR v_app.longitude IS NULL THEN
    RAISE EXCEPTION 'The branch location (latitude/longitude) is required before approval.' USING ERRCODE = '22023';
  END IF;

  v_vat := CASE WHEN COALESCE(v_app.tax_number, '') ~ '^3[0-9]{13}3$' THEN v_app.tax_number ELSE NULL END;

  INSERT INTO public.providers (owner_id, type, business_name_en, business_name_ar, trade_license_url,
                                commission_percentage, status, contact_email, contact_phone, cr_number, vat_number)
  VALUES (v_app.user_id, v_app.business_type, v_app.business_name_en, v_app.business_name_ar, v_app.trade_license_url,
          COALESCE(p_commission_percentage, 15.00), 'active', v_app.contact_email, v_app.contact_phone,
          NULLIF(v_app.cr_number, ''), v_vat)
  RETURNING id INTO v_provider_id;

  INSERT INTO public.branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude,
                               city, district)
  VALUES (v_provider_id, v_app.business_name_en, v_app.business_name_ar, v_app.address_text, v_app.address_text,
          v_app.latitude, v_app.longitude, COALESCE(NULLIF(v_app.city, ''), 'Riyadh'), v_app.district)
  RETURNING id INTO v_branch_id;

  UPDATE public.profiles SET role = 'provider_owner'::public.user_role
  WHERE id = v_app.user_id AND role = 'customer';

  UPDATE public.provider_applications
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = v_app.id;

  PERFORM public.write_audit_log('provider_application.approved', 'provider_applications', v_app.id,
    jsonb_build_object('provider_id', v_provider_id, 'branch_id', v_branch_id, 'owner_id', v_app.user_id));

  RETURN jsonb_build_object('success', TRUE, 'provider_id', v_provider_id, 'branch_id', v_branch_id,
                            'application_id', v_app.id, 'status', 'approved');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_provider_application(
  p_application_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required to reject provider applications.' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A rejection reason is required.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.provider_applications
  SET status = 'rejected', rejection_reason = TRIM(p_reason), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_application_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending application not found.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log('provider_application.rejected', 'provider_applications', p_application_id,
    jsonb_build_object('reason', TRIM(p_reason)));
  RETURN jsonb_build_object('success', TRUE, 'application_id', p_application_id, 'status', 'rejected');
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Agreements
-- ---------------------------------------------------------------------------
-- The seeded customer terms and privacy notice were published without owner approval and
-- contain a claim ("licensed intermediary") that is not backed. Return them to draft.
UPDATE public.legal_agreements
SET status = 'draft', published_at = NULL,
    content_ar = replace(content_ar, 'كوسيط تقني مرخص', 'كوسيط تقني'),
    content_en = replace(content_en, 'verified technology intermediary', 'technology intermediary')
WHERE agreement_key IN ('customer_terms', 'privacy_notice') AND version = 'v1.0';

CREATE OR REPLACE FUNCTION public.record_agreement_acceptance(
  p_agreement_key TEXT,
  p_version TEXT,
  p_method TEXT DEFAULT 'web_form'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_agreement public.legal_agreements;
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record acceptance.' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_agreement FROM public.legal_agreements WHERE agreement_key = p_agreement_key AND version = p_version;
  IF v_agreement.id IS NULL OR v_agreement.status <> 'published' THEN
    RAISE EXCEPTION 'Only a published agreement version can be accepted.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.agreement_acceptances (user_id, agreement_id, agreement_key, version, method)
  VALUES (v_user_id, v_agreement.id, p_agreement_key, p_version, COALESCE(p_method, 'web_form'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Admin publication of a reviewed version (archives the previous published version).
CREATE OR REPLACE FUNCTION public.admin_publish_agreement(p_agreement_id UUID, p_review_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agreement public.legal_agreements;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_review_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Record who reviewed this text (e.g. counsel name and date)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_agreement FROM public.legal_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF v_agreement.id IS NULL OR v_agreement.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft agreement can be published' USING ERRCODE = '22023';
  END IF;
  UPDATE public.legal_agreements SET status = 'archived'
  WHERE agreement_key = v_agreement.agreement_key AND status = 'published';
  UPDATE public.legal_agreements SET status = 'published', published_at = now() WHERE id = p_agreement_id;
  PERFORM public.write_audit_log('agreement.published', 'legal_agreements', p_agreement_id,
    jsonb_build_object('key', v_agreement.agreement_key, 'version', v_agreement.version, 'review_note', TRIM(p_review_note)));
  RETURN jsonb_build_object('success', TRUE, 'agreement_id', p_agreement_id, 'status', 'published');
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Marketplace search (real columns, normalized Arabic, distance)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.search_marketplace_providers(TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.search_marketplace_providers(
  p_query TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'all',
  p_city TEXT DEFAULT 'all',
  p_district TEXT DEFAULT 'all',
  p_user_lat DOUBLE PRECISION DEFAULT NULL,
  p_user_lng DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q TEXT := NULLIF(public.normalize_arabic(LOWER(TRIM(COALESCE(p_query, '')))), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
  v_total INT;
  v_rows JSONB;
BEGIN
  WITH base AS (
    SELECT b.id AS branch_id, b.provider_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar,
           b.city, b.district, b.latitude, b.longitude,
           p.business_name_en, p.business_name_ar, p.is_verified, p.cr_verification_status,
           CASE WHEN p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
             ROUND((6371 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_user_lat)) * cos(radians(b.latitude::float8)) * cos(radians(b.longitude::float8) - radians(p_user_lng))
               + sin(radians(p_user_lat)) * sin(radians(b.latitude::float8))))))::numeric, 1)
           END AS distance_km
    FROM public.branches b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE p.is_verified AND COALESCE(b.is_active, TRUE)
      AND (COALESCE(p_city, 'all') = 'all' OR LOWER(COALESCE(b.city, '')) = LOWER(p_city))
      AND (COALESCE(p_district, 'all') = 'all' OR LOWER(COALESCE(b.district, '')) = LOWER(p_district))
      AND (v_q IS NULL
           OR public.normalize_arabic(LOWER(COALESCE(p.business_name_ar, '') || ' ' || COALESCE(p.business_name_en, '') || ' '
                || COALESCE(b.name_ar, '') || ' ' || COALESCE(b.name_en, '') || ' ' || COALESCE(b.district, '') || ' '
                || COALESCE(b.address_text_ar, '') || ' ' || COALESCE(b.address_text_en, ''))) LIKE '%' || v_q || '%'
           OR EXISTS (SELECT 1 FROM public.services s
                      WHERE s.provider_id = p.id AND s.is_active
                        AND public.normalize_arabic(LOWER(COALESCE(s.name_ar, '') || ' ' || COALESCE(s.name_en, ''))) LIKE '%' || v_q || '%'))
      AND (COALESCE(p_category, 'all') = 'all' OR EXISTS (
            SELECT 1 FROM public.services s JOIN public.categories c ON c.id = s.category_id
            WHERE s.provider_id = p.id AND s.is_active AND (c.slug = p_category OR c.id::text = p_category)))
  ), rated AS (
    SELECT base.*,
           (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reviews r
             WHERE r.provider_id = base.provider_id AND COALESCE(r.moderation_status, 'published') = 'published') AS rating,
           (SELECT COUNT(*) FROM public.reviews r
             WHERE r.provider_id = base.provider_id AND COALESCE(r.moderation_status, 'published') = 'published') AS reviews
    FROM base
  )
  SELECT (SELECT COUNT(*) FROM rated),
         COALESCE(jsonb_agg(row_json ORDER BY sort_distance NULLS LAST, sort_rating DESC NULLS LAST, sort_reviews DESC), '[]'::jsonb)
  INTO v_total, v_rows
  FROM (
    SELECT jsonb_build_object(
             'branch_id', r.branch_id, 'provider_id', r.provider_id,
             'business_name_en', r.business_name_en, 'business_name_ar', r.business_name_ar,
             'branch_name_en', r.branch_name_en, 'branch_name_ar', r.branch_name_ar,
             'city', r.city, 'district', r.district, 'latitude', r.latitude, 'longitude', r.longitude,
             'distance_km', r.distance_km,
             'verified_business', r.is_verified,
             'cr_verification_status', r.cr_verification_status,
             'rating', r.rating, 'reviews', r.reviews,
             'sample_services', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name_en', s.name_en, 'name_ar', s.name_ar,
                                         'price', s.base_price, 'duration_minutes', s.base_duration_minutes) ORDER BY s.sort_order NULLS LAST, s.base_price), '[]'::jsonb)
                                 FROM (SELECT * FROM public.services s2 WHERE s2.provider_id = r.provider_id AND s2.is_active
                                       ORDER BY s2.sort_order NULLS LAST, s2.base_price LIMIT 3) s)
           ) AS row_json,
           r.distance_km AS sort_distance, r.rating AS sort_rating, r.reviews AS sort_reviews
    FROM rated r
    ORDER BY r.distance_km NULLS LAST, r.rating DESC NULLS LAST, r.reviews DESC
    LIMIT v_limit OFFSET v_offset
  ) page;

  RETURN jsonb_build_object('success', TRUE, 'total_count', v_total, 'providers', v_rows,
                            'limit', v_limit, 'offset', v_offset);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Client import: imported people are contacts of the provider, not invented profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  is_vip BOOLEAN NOT NULL DEFAULT FALSE,
  matched_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  import_id UUID REFERENCES public.provider_client_imports(id) ON DELETE SET NULL,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, phone)
);
ALTER TABLE public.provider_client_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider staff manage client contacts" ON public.provider_client_contacts;
CREATE POLICY "Provider staff manage client contacts"
  ON public.provider_client_contacts FOR ALL TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()))
  WITH CHECK (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_client_contacts.provider_id AND p.owner_id = auth.uid()));

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
  v_import_id UUID;
  v_row JSONB;
  v_name TEXT;
  v_phone TEXT;
  v_ok INT := 0;
  v_skipped INT := 0;
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the provider owner can import clients' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(p_consent_confirmed, FALSE) THEN
    RAISE EXCEPTION 'Confirm that these clients agreed to be contacted about their bookings (PDPL)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_clients) <> 'array' OR jsonb_array_length(p_clients) = 0 THEN
    RAISE EXCEPTION 'Provide at least one client row' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_clients) > 2000 THEN
    RAISE EXCEPTION 'Import at most 2000 clients at a time' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_client_imports (provider_id, imported_by, total_rows, consent_confirmed)
  VALUES (p_provider_id, v_user_id, jsonb_array_length(p_clients), TRUE)
  RETURNING id INTO v_import_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_clients) LOOP
    v_name := NULLIF(TRIM(COALESCE(v_row->>'name', '')), '');
    v_phone := NULLIF(regexp_replace(COALESCE(v_row->>'phone', ''), '[^0-9+]', '', 'g'), '');
    IF v_phone ~ '^05[0-9]{8}$' THEN
      v_phone := '+966' || substr(v_phone, 2);
    END IF;
    IF v_name IS NULL OR (v_phone IS NOT NULL AND v_phone !~ '^\+9665[0-9]{8}$') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    INSERT INTO public.provider_client_contacts (provider_id, full_name, phone, notes, is_vip, matched_profile_id,
                                                 import_id, consent_confirmed_at)
    VALUES (p_provider_id, v_name, v_phone, NULLIF(TRIM(COALESCE(v_row->>'notes', '')), ''),
            COALESCE((v_row->>'is_vip')::boolean, FALSE),
            (SELECT id FROM public.profiles WHERE phone_number = v_phone AND phone_verified LIMIT 1),
            v_import_id, now())
    ON CONFLICT (provider_id, phone) DO UPDATE
    SET full_name = EXCLUDED.full_name, notes = COALESCE(EXCLUDED.notes, provider_client_contacts.notes),
        is_vip = EXCLUDED.is_vip, import_id = EXCLUDED.import_id;
    v_ok := v_ok + 1;
  END LOOP;

  UPDATE public.provider_client_imports SET successful_rows = v_ok WHERE id = v_import_id;
  PERFORM public.write_audit_log('provider.clients_imported', 'provider_client_imports', v_import_id,
    jsonb_build_object('provider_id', p_provider_id, 'imported', v_ok, 'skipped', v_skipped));

  RETURN jsonb_build_object('success', TRUE, 'import_id', v_import_id, 'total_rows', jsonb_array_length(p_clients),
                            'successful_rows', v_ok, 'skipped_rows', v_skipped);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Value summary: "fee you would have paid" uses the real marketplace fee rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_provider_monthly_value_summary(
  p_provider_id UUID,
  p_month_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start DATE := date_trunc('month', p_month_date)::date;
  v_end DATE := (date_trunc('month', p_month_date) + interval '1 month')::date;
  v_result JSONB;
BEGIN
  IF NOT (public.is_provider_staff(p_provider_id, auth.uid()) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to view this provider''s summary' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'success', TRUE,
    'provider_id', p_provider_id,
    'month', to_char(v_start, 'YYYY-MM'),
    'completed_bookings', COUNT(*) FILTER (WHERE b.status = 'completed'),
    'new_clients_acquired', COUNT(*) FILTER (WHERE b.status = 'completed' AND b.source = 'marketplace' AND b.is_first_visit),
    'marketplace_bookings', COUNT(*) FILTER (WHERE b.status = 'completed' AND b.source = 'marketplace'),
    'direct_link_bookings', COUNT(*) FILTER (WHERE b.status = 'completed' AND b.source IN ('link', 'qr', 'whatsapp', 'instagram', 'import')),
    'total_gmv_sar', COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0),
    'platform_fees_sar', COALESCE(SUM(b.platform_commission) FILTER (WHERE b.status = 'completed'), 0),
    -- What the direct bookings would have cost at the marketplace first-visit rate.
    'commission_saved_sar', COALESCE(SUM(public.calculate_booking_platform_commission('marketplace', TRUE, b.total_price, p_provider_id))
                              FILTER (WHERE b.status = 'completed' AND b.source IN ('link', 'qr', 'whatsapp', 'instagram', 'import')), 0)
  )
  INTO v_result
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  WHERE br.provider_id = p_provider_id
    AND b.scheduled_at >= v_start AND b.scheduled_at < v_end;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Reviews: audit through the single writer
-- ---------------------------------------------------------------------------
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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can moderate reviews' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('published', 'flagged', 'hidden') THEN
    RAISE EXCEPTION 'Invalid moderation status: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_status = 'hidden' AND NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required to hide a review' USING ERRCODE = '22023';
  END IF;
  UPDATE public.reviews SET moderation_status = p_status, moderated_by = auth.uid() WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log('review.moderated', 'reviews', p_review_id,
    jsonb_build_object('status', p_status, 'reason', p_reason));
  RETURN jsonb_build_object('success', TRUE, 'review_id', p_review_id, 'status', p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_to_review(p_review_id UUID, p_reply TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_reply, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Reply text cannot be empty' USING ERRCODE = '22023';
  END IF;
  SELECT provider_id INTO v_provider_id FROM public.reviews WHERE id = p_review_id;
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Review not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.providers WHERE id = v_provider_id AND owner_id = auth.uid()) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the provider owner can reply to this review' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reviews SET reply_comment = TRIM(p_reply), reply_created_at = now() WHERE id = p_review_id;
  PERFORM public.write_audit_log('review.replied', 'reviews', p_review_id, jsonb_build_object('provider_id', v_provider_id));
  RETURN jsonb_build_object('success', TRUE, 'review_id', p_review_id, 'reply_created_at', now());
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. WhatsApp dispatch. The database decides eligibility (verified phone, consent, quiet
--    hours) and renders the template; the dispatch-messages Edge Function sends through the
--    WhatsApp Cloud API and reports the real result. Nothing is marked sent without an API id.
-- ---------------------------------------------------------------------------
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS provider_template_name TEXT,
  ADD COLUMN IF NOT EXISTS body_param_keys TEXT[],
  ADD COLUMN IF NOT EXISTS is_transactional BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.message_log ALTER COLUMN cost_sar DROP DEFAULT;
ALTER TABLE public.message_log ALTER COLUMN cost_sar DROP NOT NULL;

-- Correct the Arabic post-visit text: the loyalty programme is not enabled.
UPDATE public.message_templates
SET template_body = 'شكراً لزيارتك {{provider_name}}! نود سماع رأيك في خدمة {{service_name}}: {{review_url}} ولحجز موعدك القادم: {{rebook_url}}'
WHERE name = 'post_visit_review' AND locale = 'ar';

INSERT INTO public.message_templates (name, locale, category, template_body, variables)
VALUES
  ('waitlist_slot_opened', 'ar', 'utility',
   'أصبح موعد متاحاً في {{provider_name}} لخدمة {{service_name}} يوم {{booking_date}} الساعة {{booking_time}}. احجزه خلال {{expires_minutes}} دقيقة: {{claim_url}}',
   '["provider_name","service_name","booking_date","booking_time","expires_minutes","claim_url"]'::jsonb),
  ('waitlist_slot_opened', 'en', 'utility',
   'A slot opened at {{provider_name}} for {{service_name}} on {{booking_date}} at {{booking_time}}. Claim it within {{expires_minutes}} minutes: {{claim_url}}',
   '["provider_name","service_name","booking_date","booking_time","expires_minutes","claim_url"]'::jsonb)
ON CONFLICT DO NOTHING;

-- Body parameter order follows the {{placeholders}} in each body (WhatsApp templates are positional).
UPDATE public.message_templates t
SET body_param_keys = (
      SELECT array_agg(m[1] ORDER BY ord)
      FROM regexp_matches(t.template_body, '\{\{([a-z_]+)\}\}', 'g') WITH ORDINALITY AS x(m, ord)
    ),
    provider_template_name = COALESCE(t.provider_template_name, 'primora_' || t.name),
    is_transactional = t.name IN ('booking_confirmation', 'owner_new_booking', 'waitlist_slot_opened');

DROP FUNCTION IF EXISTS public.dispatch_message_queue_batch(INTEGER);

CREATE OR REPLACE FUNCTION public.claim_message_batch(p_batch_size INTEGER DEFAULT 25)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg RECORD;
  v_tpl public.message_templates;
  v_profile RECORD;
  v_local TIMESTAMP;
  v_body TEXT;
  v_key TEXT;
  v_val TEXT;
  v_params JSONB;
  v_out JSONB := '[]'::jsonb;
  v_deferred INT := 0;
  v_skipped INT := 0;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  FOR v_msg IN
    SELECT * FROM public.message_queue
    WHERE status IN ('pending', 'deferred_quiet_hours')
      AND scheduled_for <= now()
      AND attempts < COALESCE(max_attempts, 3)
    ORDER BY scheduled_for, created_at
    LIMIT LEAST(GREATEST(COALESCE(p_batch_size, 25), 1), 100)
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_tpl FROM public.message_templates
    WHERE name = v_msg.template_name AND locale = COALESCE(v_msg.locale, 'ar');

    IF v_tpl.name IS NULL THEN
      UPDATE public.message_queue SET status = 'failed', error_message = 'Template not found', updated_at = now() WHERE id = v_msg.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id, phone_number, phone_verified INTO v_profile FROM public.profiles WHERE id = v_msg.recipient_id;
    IF v_profile.id IS NULL OR NOT COALESCE(v_profile.phone_verified, FALSE) OR v_profile.phone_number IS DISTINCT FROM v_msg.recipient_phone THEN
      UPDATE public.message_queue SET status = 'skipped_unverified', updated_at = now() WHERE id = v_msg.id;
      INSERT INTO public.message_log (queue_id, booking_id, recipient_phone, recipient_id, channel, template_name, locale, message_body, status)
      VALUES (v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id, v_msg.channel, v_msg.template_name, v_msg.locale, '', 'skipped_unverified');
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF NOT public.has_active_consent(v_msg.recipient_id, 'whatsapp') THEN
      UPDATE public.message_queue SET status = 'skipped_no_consent', updated_at = now() WHERE id = v_msg.id;
      INSERT INTO public.message_log (queue_id, booking_id, recipient_phone, recipient_id, channel, template_name, locale, message_body, status)
      VALUES (v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id, v_msg.channel, v_msg.template_name, v_msg.locale, '', 'skipped_no_consent');
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Quiet hours 22:00–09:00 Riyadh for non-transactional messages.
    v_local := now() AT TIME ZONE 'Asia/Riyadh';
    IF NOT v_tpl.is_transactional AND (v_local::time >= '22:00' OR v_local::time < '09:00') THEN
      UPDATE public.message_queue
      SET status = 'deferred_quiet_hours',
          scheduled_for = ((CASE WHEN v_local::time >= '22:00' THEN v_local::date + 1 ELSE v_local::date END) + time '09:00')
                          AT TIME ZONE 'Asia/Riyadh',
          updated_at = now()
      WHERE id = v_msg.id;
      v_deferred := v_deferred + 1;
      CONTINUE;
    END IF;

    v_body := v_tpl.template_body;
    FOR v_key, v_val IN SELECT * FROM jsonb_each_text(COALESCE(v_msg.variables, '{}'::jsonb)) LOOP
      v_body := replace(v_body, '{{' || v_key || '}}', COALESCE(v_val, ''));
    END LOOP;
    SELECT COALESCE(jsonb_agg(COALESCE(v_msg.variables->>k, '') ORDER BY ord), '[]'::jsonb)
    INTO v_params
    FROM unnest(COALESCE(v_tpl.body_param_keys, '{}')) WITH ORDINALITY AS k(k, ord);

    UPDATE public.message_queue
    SET status = 'processing', attempts = attempts + 1, last_attempt_at = now(), updated_at = now()
    WHERE id = v_msg.id;

    v_out := v_out || jsonb_build_object(
      'queue_id', v_msg.id, 'to', v_msg.recipient_phone, 'channel', v_msg.channel,
      'template', v_tpl.provider_template_name, 'language', CASE WHEN v_tpl.locale = 'en' THEN 'en' ELSE 'ar' END,
      'body_params', v_params, 'rendered_body', v_body);
  END LOOP;

  RETURN jsonb_build_object('messages', v_out, 'deferred_quiet_hours', v_deferred, 'skipped', v_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_message_delivery(
  p_queue_id UUID,
  p_succeeded BOOLEAN,
  p_external_id TEXT,
  p_error TEXT DEFAULT NULL,
  p_rendered_body TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.message_queue;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_msg FROM public.message_queue WHERE id = p_queue_id FOR UPDATE;
  IF v_msg.id IS NULL OR v_msg.status <> 'processing' THEN
    RAISE EXCEPTION 'Message is not being processed' USING ERRCODE = '22023';
  END IF;
  IF p_succeeded AND NULLIF(TRIM(COALESCE(p_external_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A provider message id is required to mark a message as sent' USING ERRCODE = '22023';
  END IF;

  IF p_succeeded THEN
    UPDATE public.message_queue SET status = 'sent', error_message = NULL, updated_at = now() WHERE id = v_msg.id;
  ELSIF v_msg.attempts < COALESCE(v_msg.max_attempts, 3) THEN
    UPDATE public.message_queue
    SET status = 'pending', error_message = LEFT(p_error, 1000),
        scheduled_for = now() + make_interval(mins => 5 * v_msg.attempts), updated_at = now()
    WHERE id = v_msg.id;
  ELSE
    UPDATE public.message_queue SET status = 'failed', error_message = LEFT(p_error, 1000), updated_at = now() WHERE id = v_msg.id;
  END IF;

  INSERT INTO public.message_log (queue_id, booking_id, recipient_phone, recipient_id, channel, template_name, locale,
                                  message_body, status, cost_sar, external_id, error_details)
  VALUES (v_msg.id, v_msg.booking_id, v_msg.recipient_phone, v_msg.recipient_id, v_msg.channel, v_msg.template_name,
          v_msg.locale, COALESCE(p_rendered_body, ''), CASE WHEN p_succeeded THEN 'sent' ELSE 'failed' END, NULL,
          NULLIF(TRIM(COALESCE(p_external_id, '')), ''), LEFT(p_error, 1000));
END;
$$;

-- Messages left "processing" by a crashed dispatcher go back to the queue.
CREATE OR REPLACE FUNCTION public.release_stuck_messages()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    UPDATE public.message_queue SET status = 'pending', updated_at = now()
    WHERE status = 'processing' AND last_attempt_at < now() - interval '15 minutes'
    RETURNING 1
  ) SELECT COUNT(*)::int FROM r;
$$;

-- ---------------------------------------------------------------------------
-- 10. Scheduler (pg_cron + pg_net on Supabase). Skipped where the extensions are absent.
--     Requires two Vault secrets set by the owner: project_url and service_role_key.
-- ---------------------------------------------------------------------------
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;

    PERFORM cron.unschedule(jobname) FROM cron.job
    WHERE jobname IN ('primora-expire-holds', 'primora-dispatch-messages', 'primora-process-refunds', 'primora-release-stuck-messages');

    PERFORM cron.schedule('primora-expire-holds', '*/5 * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.expire_stale_booking_holds(); $job$);

    PERFORM cron.schedule('primora-release-stuck-messages', '*/10 * * * *',
      $job$ SELECT public.release_stuck_messages(); $job$);

    PERFORM cron.schedule('primora-dispatch-messages', '* * * * *',
      $job$ SELECT net.http_post(
              url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/dispatch-messages',
              headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                         'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
              body := '{}'::jsonb) $job$);

    PERFORM cron.schedule('primora-process-refunds', '*/10 * * * *',
      $job$ SELECT net.http_post(
              url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/process-refund',
              headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
                         'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
              body := '{"processPending": true}'::jsonb) $job$);
  ELSE
    RAISE NOTICE 'pg_cron/pg_net not available: schedule hold expiry, message dispatch and refund processing externally.';
  END IF;
END
$outer$;

-- ---------------------------------------------------------------------------
-- 10b. Provider analytics and payroll (P2-C) on real columns; no invented defaults
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_provider_detailed_analytics(
  p_provider_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals RECORD;
  v_clients RECORD;
BEGIN
  IF NOT (public.is_provider_staff(p_provider_id, auth.uid()) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to view reports for this provider' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE b.status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE b.status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE b.status = 'no_show') AS no_show,
         COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0) AS gross,
         COALESCE(SUM(b.platform_commission) FILTER (WHERE b.status = 'completed'), 0) AS fees,
         COUNT(DISTINCT b.customer_id) AS unique_clients
  INTO v_totals
  FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id
  WHERE br.provider_id = p_provider_id
    AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date;

  SELECT COUNT(*) FILTER (WHERE n = 1) AS first_time, COUNT(*) FILTER (WHERE n > 1) AS repeat
  INTO v_clients
  FROM (
    SELECT b.customer_id, COUNT(*) AS n
    FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id
    WHERE br.provider_id = p_provider_id AND b.customer_id IS NOT NULL AND b.status = 'completed'
    GROUP BY b.customer_id
  ) c;

  RETURN jsonb_build_object(
    'provider_id', p_provider_id, 'start_date', p_start_date, 'end_date', p_end_date,
    'gross_revenue_sar', v_totals.gross,
    'platform_fees_sar', v_totals.fees,
    'net_earnings_sar', v_totals.gross - v_totals.fees,
    'total_bookings', v_totals.total, 'completed_bookings', v_totals.completed,
    'cancelled_bookings', v_totals.cancelled, 'no_show_bookings', v_totals.no_show,
    'completion_rate_pct', CASE WHEN v_totals.total > 0 THEN ROUND(v_totals.completed::numeric / v_totals.total * 100, 1) ELSE 0 END,
    'no_show_rate_pct', CASE WHEN v_totals.total > 0 THEN ROUND(v_totals.no_show::numeric / v_totals.total * 100, 1) ELSE 0 END,
    'unique_clients', v_totals.unique_clients,
    'first_time_clients', v_clients.first_time, 'repeat_clients', v_clients.repeat,
    'repeat_rate_pct', CASE WHEN v_clients.first_time + v_clients.repeat > 0
                            THEN ROUND(v_clients.repeat::numeric / (v_clients.first_time + v_clients.repeat) * 100, 1) ELSE 0 END,
    'sources_distribution', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', src, 'bookings_count', n, 'revenue_sar', rev,
               'share_pct', CASE WHEN v_totals.total > 0 THEN ROUND(n::numeric / v_totals.total * 100, 1) ELSE 0 END) ORDER BY n DESC), '[]'::jsonb)
      FROM (SELECT COALESCE(b.source, 'marketplace') src, COUNT(*) n,
                   COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0) rev
            FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id
            WHERE br.provider_id = p_provider_id
              AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date
            GROUP BY 1) s),
    'staff_performance', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('employee_id', e.id, 'name_en', e.name_en, 'name_ar', e.name_ar,
               'title_en', e.title_en, 'title_ar', e.title_ar, 'completed_bookings', x.n, 'revenue_sar', x.rev) ORDER BY x.rev DESC), '[]'::jsonb)
      FROM public.employees e
      JOIN public.branches br ON br.id = e.branch_id
      CROSS JOIN LATERAL (
        SELECT COUNT(b.id) n, COALESCE(SUM(b.total_price), 0) rev FROM public.bookings b
        WHERE b.employee_id = e.id AND b.status = 'completed'
          AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) x
      WHERE br.provider_id = p_provider_id AND e.is_active),
    'popular_services', (
      SELECT COALESCE(jsonb_agg(t.row_json ORDER BY (t.row_json->>'bookings_count')::int DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('service_id', s.id, 'name_en', s.name_en, 'name_ar', s.name_ar,
                 'category', c.name_en, 'category_ar', c.name_ar, 'bookings_count', COUNT(b.id),
                 'revenue_sar', COALESCE(SUM(b.total_price), 0)) AS row_json
        FROM public.bookings b
        JOIN public.branches br ON br.id = b.branch_id
        JOIN public.services s ON s.id = b.service_id
        LEFT JOIN public.categories c ON c.id = s.category_id
        WHERE br.provider_id = p_provider_id AND b.status = 'completed'
          AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date
        GROUP BY s.id, s.name_en, s.name_ar, c.name_en, c.name_ar
        ORDER BY COUNT(b.id) DESC LIMIT 10) t)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_staff_payroll(
  p_provider_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to calculate payroll for this provider' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'provider_id', p_provider_id, 'start_date', p_start_date, 'end_date', p_end_date, 'currency', 'SAR',
    'payroll_entries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'name_en', e.name_en, 'name_ar', e.name_ar, 'title_en', e.title_en,
        'branch', br.name_en,
        'rule_configured', r.id IS NOT NULL,
        'wps_iban', r.wps_iban,
        'completed_bookings', w.n,
        'service_revenue_sar', w.rev,
        'commission_rate_pct', r.commission_rate,
        'commission_earned_sar', CASE WHEN r.id IS NULL THEN NULL ELSE ROUND(w.rev * COALESCE(r.commission_rate, 0) / 100.0, 2) END,
        'tips_earned_sar', t.tips,
        'base_salary_sar', r.base_salary_sar,
        'total_payout_sar', CASE WHEN r.id IS NULL THEN NULL
                                 ELSE COALESCE(r.base_salary_sar, 0) + ROUND(w.rev * COALESCE(r.commission_rate, 0) / 100.0, 2) + t.tips END
      ) ORDER BY e.name_en), '[]'::jsonb)
      FROM public.employees e
      JOIN public.branches br ON br.id = e.branch_id
      LEFT JOIN public.employee_commission_rules r ON r.employee_id = e.id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) n, COALESCE(SUM(b.total_price), 0) rev FROM public.bookings b
        WHERE b.employee_id = e.id AND b.status = 'completed'
          AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) w
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(bt.amount), 0) tips FROM public.booking_tips bt
        WHERE bt.employee_id = e.id AND bt.status = 'completed'
          AND (bt.paid_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p_start_date AND p_end_date) t
      WHERE br.provider_id = p_provider_id AND e.is_active)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_wathq_cr_verification(uuid, text, boolean, jsonb)',
    'public.claim_message_batch(integer)',
    'public.complete_message_delivery(uuid, boolean, text, text, text)',
    'public.release_stuck_messages()',
    'public.assign_booking_invoice_number()',
    'public.handle_profile_phone_update()',
    'public.sync_provider_status_verified()',
    'public.sync_service_status_fields()',
    'public.touch_conversation_from_message()',
    'public.touch_integrations_updated_at()',
    'public.zatca_tlv_tag(integer, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.customer_confirm_attendance(uuid)',
    'public.admin_record_cr_review(uuid, text, text)',
    'public.approve_provider_application(uuid, numeric)',
    'public.reject_provider_application(uuid, text)',
    'public.record_agreement_acceptance(text, text, text)',
    'public.admin_publish_agreement(uuid, text)',
    'public.import_provider_clients(uuid, jsonb, boolean)',
    'public.get_provider_monthly_value_summary(uuid, date)',
    'public.moderate_review(uuid, character varying, text)',
    'public.reply_to_review(uuid, text)',
    'public.enqueue_direct_message(character varying, uuid, character varying, character varying, jsonb, character varying, timestamptz)',
    'public.apply_referral_code(text)',
    'public.get_or_create_referral_code()',
    'public.toggle_customer_favorite(uuid)',
    'public.calculate_staff_payroll(uuid, date, date)',
    'public.get_provider_detailed_analytics(uuid, date, date)',
    'public.get_provider_multi_branch_summary(uuid, date, date)',
    'public.get_booking_address_secure(uuid)',
    'public.join_waitlist(uuid, uuid, uuid, date, time without time zone, time without time zone)',
    'public.claim_waitlist_slot(uuid)',
    'public.record_consent(text, text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- Read-only public discovery.
  GRANT EXECUTE ON FUNCTION public.search_marketplace_providers(text, text, text, text, double precision, double precision, integer, integer) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.normalize_arabic(text) TO anon, authenticated;
END $$;
