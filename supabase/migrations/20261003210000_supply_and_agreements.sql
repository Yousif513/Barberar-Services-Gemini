-- Migration: 20261003210000_supply_and_agreements.sql
-- Description: G01 Provider onboarding application review queue and audited server-side approval RPC;
--              G18 Versioned legal agreements & acceptance tracking;
--              G03 Booking source attribution ('marketplace', 'link', 'qr', etc.) and first-visit detection.

-- 1. ADMIN AUDIT LOGS (G14 / G01)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON public.admin_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins read audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 2. PROVIDER APPLICATIONS TABLE (G01)
CREATE TABLE IF NOT EXISTS public.provider_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name_en VARCHAR(150) NOT NULL,
  business_name_ar VARCHAR(150) NOT NULL,
  business_type public.provider_type NOT NULL DEFAULT 'salon',
  cr_number VARCHAR(50),
  tax_number VARCHAR(50),
  contact_email VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  city VARCHAR(50) NOT NULL DEFAULT 'Riyadh',
  district VARCHAR(100) NOT NULL,
  address_text TEXT NOT NULL,
  latitude DECIMAL(9,6) DEFAULT 24.7136,
  longitude DECIMAL(9,6) DEFAULT 46.6753,
  trade_license_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  rejection_reason TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prov_apps_user ON public.provider_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_prov_apps_status ON public.provider_applications (status, created_at DESC);

ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own provider applications" ON public.provider_applications;
CREATE POLICY "Users read own provider applications"
  ON public.provider_applications
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own provider applications" ON public.provider_applications;
CREATE POLICY "Users insert own provider applications"
  ON public.provider_applications
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins read all provider applications" ON public.provider_applications;
CREATE POLICY "Admins read all provider applications"
  ON public.provider_applications
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update provider applications" ON public.provider_applications;
CREATE POLICY "Admins update provider applications"
  ON public.provider_applications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. AUDITED SERVER-SIDE PROVIDER APPROVAL (G01)
CREATE OR REPLACE FUNCTION public.approve_provider_application(
  p_application_id UUID,
  p_commission_percentage DECIMAL DEFAULT 15.00
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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required to approve provider applications.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app
  FROM public.provider_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'Provider application not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_app.status = 'approved' THEN
    RAISE EXCEPTION 'Application is already approved.' USING ERRCODE = '23505';
  END IF;

  -- 1. Create providers row
  INSERT INTO public.providers (
    owner_id,
    type,
    business_name_en,
    business_name_ar,
    description_en,
    description_ar,
    trade_license_url,
    is_verified,
    commission_percentage
  )
  VALUES (
    v_app.user_id,
    v_app.business_type,
    v_app.business_name_en,
    v_app.business_name_ar,
    v_app.business_name_en || ' - Premier Salon in ' || v_app.district,
    v_app.business_name_ar || ' - صالون متميز في ' || v_app.district,
    v_app.trade_license_url,
    TRUE,
    COALESCE(p_commission_percentage, 15.00)
  )
  RETURNING id INTO v_provider_id;

  -- 2. Create primary branch
  INSERT INTO public.branches (
    provider_id,
    name_en,
    name_ar,
    address_text_en,
    address_text_ar,
    latitude,
    longitude
  )
  VALUES (
    v_provider_id,
    v_app.business_name_en || ' - Main Branch',
    v_app.business_name_ar || ' - الفرع الرئيسي',
    v_app.address_text,
    v_app.address_text,
    COALESCE(v_app.latitude, 24.7136),
    COALESCE(v_app.longitude, 46.6753)
  )
  RETURNING id INTO v_branch_id;

  -- 3. Upgrade user role to provider_owner
  UPDATE public.profiles
  SET role = 'provider_owner'::public.user_role
  WHERE id = v_app.user_id;

  -- 4. Mark application as approved
  UPDATE public.provider_applications
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_app.id;

  -- 5. Write audit log entry
  INSERT INTO public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    details
  )
  VALUES (
    auth.uid(),
    'approve_provider_application',
    'provider_application',
    v_app.id,
    jsonb_build_object(
      'provider_id', v_provider_id,
      'branch_id', v_branch_id,
      'owner_id', v_app.user_id,
      'commission_percentage', p_commission_percentage
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'provider_id', v_provider_id,
    'branch_id', v_branch_id,
    'application_id', v_app.id,
    'status', 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_provider_application(UUID, DECIMAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_provider_application(UUID, DECIMAL) TO authenticated;

-- Reject application procedure
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

  UPDATE public.provider_applications
  SET
    status = 'rejected',
    rejection_reason = p_reason,
    reviewed_by = auth.uid(),
    reviewed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_application_id;

  INSERT INTO public.admin_audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    details
  )
  VALUES (
    auth.uid(),
    'reject_provider_application',
    'provider_application',
    p_application_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'application_id', p_application_id,
    'status', 'rejected'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_provider_application(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_provider_application(UUID, TEXT) TO authenticated;

-- 4. VERSIONED LEGAL AGREEMENTS & ACCEPTANCE TRACKING (G18)
CREATE TABLE IF NOT EXISTS public.legal_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_key VARCHAR(50) NOT NULL, -- 'customer_terms', 'provider_agreement', 'privacy_notice'
  title_en VARCHAR(150) NOT NULL,
  title_ar VARCHAR(150) NOT NULL,
  version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  requires_reacceptance BOOLEAN NOT NULL DEFAULT FALSE,
  summary_en TEXT,
  summary_ar TEXT,
  content_en TEXT NOT NULL,
  content_ar TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (agreement_key, version)
);

CREATE TABLE IF NOT EXISTS public.agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL REFERENCES public.legal_agreements(id) ON DELETE RESTRICT,
  agreement_key VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  method VARCHAR(50) NOT NULL DEFAULT 'web_form',
  ip_address VARCHAR(45),
  user_agent TEXT,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agr_acc_user_key ON public.agreement_acceptances (user_id, agreement_key, version);

ALTER TABLE public.legal_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on published agreements" ON public.legal_agreements;
CREATE POLICY "Public read on published agreements"
  ON public.legal_agreements
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins manage all legal agreements" ON public.legal_agreements;
CREATE POLICY "Admins manage all legal agreements"
  ON public.legal_agreements
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own agreement acceptances" ON public.agreement_acceptances;
CREATE POLICY "Users read own agreement acceptances"
  ON public.agreement_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users record agreement acceptances" ON public.agreement_acceptances;
CREATE POLICY "Users record agreement acceptances"
  ON public.agreement_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins read all agreement acceptances" ON public.agreement_acceptances;
CREATE POLICY "Admins read all agreement acceptances"
  ON public.agreement_acceptances
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Record agreement acceptance helper
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
  v_agreement_id UUID;
  v_acceptance_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record acceptance.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_agreement_id
  FROM public.legal_agreements
  WHERE agreement_key = p_agreement_key
    AND version = p_version
  LIMIT 1;

  IF v_agreement_id IS NULL THEN
    RAISE EXCEPTION 'Agreement version not found.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.agreement_acceptances (
    user_id,
    agreement_id,
    agreement_key,
    version,
    method
  )
  VALUES (
    v_user_id,
    v_agreement_id,
    p_agreement_key,
    p_version,
    COALESCE(p_method, 'web_form')
  )
  RETURNING id INTO v_acceptance_id;

  RETURN v_acceptance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_agreement_acceptance(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_agreement_acceptance(TEXT, TEXT, TEXT) TO authenticated;

-- Seed default legal agreements
INSERT INTO public.legal_agreements (agreement_key, title_en, title_ar, version, status, requires_reacceptance, summary_en, summary_ar, content_en, content_ar, published_at)
VALUES
(
  'customer_terms',
  'Customer Terms of Service',
  'شروط وأحكام العميل',
  'v1.0',
  'published',
  FALSE,
  'Governs customer booking, cancellation policies, and marketplace use.',
  'تنظم شروط حجز العملاء، وسياسات الإلغاء، واستخدام المنصة.',
  'Primora operates as a verified technology intermediary. All service bookings and cancellation rules are specified by licensed service providers.',
  'تعمل منصة بريمورا كوسيط تقني مرخص. تخضع حجوزات الخدمات وسياسات الإلغاء للسياسات المحددة من مزودي الخدمة المرخصين.',
  CURRENT_TIMESTAMP
),
(
  'provider_agreement',
  'Provider & Merchant Agreement',
  'اتفاقية مزود الخدمة والتاجر',
  'v1.0',
  'draft', -- Draft until Saudi legal counsel review is confirmed by owner
  FALSE,
  'Draft provider agreement covering commissions, client attribution, cancellation policies, and Saudi commercial regulations.',
  'مسودة اتفاقية مزودي الخدمة تغطي العمولات، ونسب الاستحواذ، وسياسات الإلغاء، والأنظمة التجارية السعودية.',
  'Draft Agreement: Provider acknowledges independent contractor status, agrees to verified CR licensing, and confirms commission attribution schedules.',
  'مسودة الاتفاقية: يقر مزود الخدمة بصفته المستقلة والترخيص التجاري، ويوافق على جدول العمولات والاستحواذ المعتمد.',
  NULL
),
(
  'privacy_notice',
  'Privacy Notice & PDPL Rights',
  'سياسة الخصوصية وحقوق حماية البيانات الشخصية',
  'v1.0',
  'published',
  FALSE,
  'Saudi PDPL compliant privacy notice with 30-day statutory response timelines.',
  'سياسة الخصوصية المتوافقة مع نظام حماية البيانات الشخصية السعودي (PDPL) مع مهلة استجابة نظامية 30 يوماً.',
  'Personal data is processed strictly with explicit consent and for legitimate service fulfillment.',
  'تتم معالجة البيانات الشخصية بموجب الموافقة الصريحة ولأغراض تقديم الخدمة فقط.',
  CURRENT_TIMESTAMP
)
ON CONFLICT (agreement_key, version) DO NOTHING;

-- 5. BOOKING SOURCE ATTRIBUTION & FIRST-VISIT DETECTION (G03)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'marketplace'
  CHECK (source IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_first_visit BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.handle_booking_first_visit_detection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_prior_bookings_count INT;
BEGIN
  -- Determine provider_id from branch
  SELECT provider_id INTO v_provider_id
  FROM public.branches
  WHERE id = NEW.branch_id;

  IF v_provider_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_prior_bookings_count
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE b.customer_id = NEW.customer_id
      AND br.provider_id = v_provider_id
      AND b.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND b.status IN ('confirmed', 'completed');

    NEW.is_first_visit := (v_prior_bookings_count = 0);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_first_visit ON public.bookings;
CREATE TRIGGER trg_booking_first_visit
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_first_visit_detection();

-- Recreate create_booking with request_source parameter
CREATE OR REPLACE FUNCTION public.create_booking(
  target_employee_id UUID,
  target_service_id UUID,
  target_scheduled_at TIMESTAMP WITH TIME ZONE,
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
  v_commission_rate DECIMAL(5,2);
  v_deposit_pct DECIMAL(5,2);
  v_home_eligible BOOLEAN;
  v_booking public.bookings;
  v_source VARCHAR(30);
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
    p.commission_percentage,
    COALESCE(p.deposit_percentage, 20.00),
    s.is_home_service_eligible
  INTO
    v_branch_id,
    v_provider_id,
    v_duration,
    v_price,
    v_commission_rate,
    v_deposit_pct,
    v_home_eligible
  FROM public.employee_services es
  JOIN public.employees e ON e.id = es.employee_id
  JOIN public.services s ON s.id = es.service_id
  JOIN public.providers p ON p.id = s.provider_id
  WHERE es.employee_id = target_employee_id
    AND es.service_id = target_service_id
    AND e.is_active = TRUE
    AND s.is_active = TRUE;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Selected specialist does not offer this active service' USING ERRCODE = 'P0002';
  END IF;

  IF request_home_service AND NOT v_home_eligible THEN
    RAISE EXCEPTION 'Selected service is not eligible for home visits' USING ERRCODE = '22023';
  END IF;

  -- Insert booking
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
    source
  )
  VALUES (
    v_user_id,
    v_branch_id,
    target_employee_id,
    target_service_id,
    'pending_payment',
    request_home_service,
    CASE WHEN request_home_service THEN request_home_address_lat ELSE NULL END,
    CASE WHEN request_home_service THEN request_home_address_lng ELSE NULL END,
    target_scheduled_at,
    v_duration,
    v_price,
    ROUND((v_price * (v_deposit_pct / 100.0)), 2),
    ROUND(v_price - (v_price / 1.15), 2),
    ROUND((v_price * (v_commission_rate / 100.0)), 2),
    v_source
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMP WITH TIME ZONE, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, UUID, TIMESTAMP WITH TIME ZONE, BOOLEAN, DECIMAL, DECIMAL, UUID, VARCHAR) TO authenticated;

-- 6. VIEWS WITH security_invoker = true PER DELIVERY RULES
DROP VIEW IF EXISTS public.admin_provider_applications_view;
CREATE VIEW public.admin_provider_applications_view
WITH (security_invoker = true)
AS
SELECT
  pa.id,
  pa.user_id,
  p.first_name,
  p.last_name,
  pa.business_name_en,
  pa.business_name_ar,
  pa.business_type,
  pa.cr_number,
  pa.tax_number,
  pa.contact_email,
  pa.contact_phone,
  pa.city,
  pa.district,
  pa.address_text,
  pa.trade_license_url,
  pa.status,
  pa.rejection_reason,
  pa.admin_notes,
  pa.reviewed_by,
  pa.reviewed_at,
  pa.created_at,
  pa.updated_at
FROM public.provider_applications pa
JOIN public.profiles p ON p.id = pa.user_id;

GRANT SELECT ON public.admin_provider_applications_view TO authenticated;
