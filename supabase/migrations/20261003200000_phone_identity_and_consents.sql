-- Migration: 20261003200000_phone_identity_and_consents.sql
-- Description: G09 Real phone identity, remove fabricated random phone fallback;
--              G13 Saudi PDPL Consents table (WhatsApp, marketing, photos) and
--              Data-Subject Request (DSR) workflow with 30-day statutory due dates.

-- 1. PROFILES PHONE NUMBER NULLABLE & VERIFICATION COLUMNS
ALTER TABLE public.profiles ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP WITH TIME ZONE;

-- 2. UPDATE handle_new_user TO STOP FABRICATING RANDOM PHONE NUMBERS
-- Phone stays NULL until verified.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    role,
    first_name,
    last_name,
    email,
    phone_number,
    phone_verified,
    phone_verified_at,
    language_preference
  )
  VALUES (
    NEW.id,
    'customer'::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    NEW.phone,
    (NEW.phone IS NOT NULL AND NEW.phone <> '' AND NEW.phone_confirmed_at IS NOT NULL),
    CASE WHEN NEW.phone IS NOT NULL AND NEW.phone_confirmed_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
    COALESCE(NEW.raw_user_meta_data->>'language_preference', 'ar')
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. ENSURE UNVERIFIED PHONE RESET ON MANUAL PROFILE UPDATE
CREATE OR REPLACE FUNCTION public.handle_profile_phone_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If phone_number is modified directly, unverify unless done by service_role
  IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
    IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
      NEW.phone_verified := FALSE;
      NEW.phone_verified_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_phone_update ON public.profiles;
CREATE TRIGGER trg_profile_phone_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_profile_phone_update();

-- 4. CONSENTS TABLE (G13)
CREATE TABLE IF NOT EXISTS public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('whatsapp', 'marketing', 'photos_portfolio', 'terms_privacy', 'data_processing')),
  status VARCHAR(20) NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'withdrawn')),
  document_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
  method VARCHAR(50) NOT NULL DEFAULT 'web_form',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consents_user_purpose ON public.consents (user_id, purpose, created_at DESC);

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own consents" ON public.consents;
CREATE POLICY "Users read own consents"
  ON public.consents
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own consents" ON public.consents;
CREATE POLICY "Users insert own consents"
  ON public.consents
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins read all consents" ON public.consents;
CREATE POLICY "Admins read all consents"
  ON public.consents
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Helper: Record or withdraw user consent
CREATE OR REPLACE FUNCTION public.record_consent(
  p_purpose TEXT,
  p_status TEXT DEFAULT 'granted',
  p_document_version TEXT DEFAULT 'v1.0',
  p_method TEXT DEFAULT 'web_form'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_consent_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record consent.' USING ERRCODE = '42501';
  END IF;

  IF p_purpose NOT IN ('whatsapp', 'marketing', 'photos_portfolio', 'terms_privacy', 'data_processing') THEN
    RAISE EXCEPTION 'Invalid consent purpose: %', p_purpose USING ERRCODE = '22023';
  END IF;

  IF p_status NOT IN ('granted', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid consent status: %', p_status USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.consents (
    user_id,
    purpose,
    status,
    document_version,
    method
  )
  VALUES (
    v_user_id,
    p_purpose,
    p_status,
    COALESCE(p_document_version, 'v1.0'),
    COALESCE(p_method, 'web_form')
  )
  RETURNING id INTO v_consent_id;

  RETURN v_consent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_consent(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_consent(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Helper: Check active consent for user
CREATE OR REPLACE FUNCTION public.has_active_consent(
  p_user_id UUID,
  p_purpose TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT status
      FROM public.consents
      WHERE user_id = p_user_id
        AND purpose = p_purpose
      ORDER BY created_at DESC
      LIMIT 1
    ) latest
    WHERE latest.status = 'granted'
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_consent(UUID, TEXT) TO authenticated, service_role;

-- 5. DATA-SUBJECT REQUESTS (DSR) INTAKE & WORKFLOW (G13)
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('access', 'rectification', 'erasure', 'export')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  details TEXT,
  due_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dsr_user_id ON public.data_subject_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_dsr_status_due_date ON public.data_subject_requests (status, due_date);

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own DSR requests" ON public.data_subject_requests;
CREATE POLICY "Users read own DSR requests"
  ON public.data_subject_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users submit own DSR requests" ON public.data_subject_requests;
CREATE POLICY "Users submit own DSR requests"
  ON public.data_subject_requests
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins read all DSR requests" ON public.data_subject_requests;
CREATE POLICY "Admins read all DSR requests"
  ON public.data_subject_requests
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update DSR requests" ON public.data_subject_requests;
CREATE POLICY "Admins update DSR requests"
  ON public.data_subject_requests
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. ADMIN VIEW (WITH security_invoker = true PER DELIVERY RULES)
DROP VIEW IF EXISTS public.admin_data_subject_requests_view;
CREATE VIEW public.admin_data_subject_requests_view
WITH (security_invoker = true)
AS
SELECT
  dsr.id,
  dsr.user_id,
  p.first_name,
  p.last_name,
  p.email,
  p.phone_number,
  dsr.request_type,
  dsr.status,
  dsr.details,
  dsr.due_date,
  (dsr.due_date - CURRENT_DATE) AS days_remaining,
  dsr.admin_notes,
  dsr.reviewed_by,
  dsr.reviewed_at,
  dsr.created_at,
  dsr.updated_at
FROM public.data_subject_requests dsr
JOIN public.profiles p ON p.id = dsr.user_id;

GRANT SELECT ON public.admin_data_subject_requests_view TO authenticated;
