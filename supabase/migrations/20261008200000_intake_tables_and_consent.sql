-- G72 Intake forms and patch tests: tables, row-level security and the health-data consent purpose.
--
-- Health answers are sensitive personal data under the Saudi PDPL. The design:
--   * intake_answers holds the answers and is readable ONLY by the customer who gave them. Staff, delegates and administrators have
--     no policy on it: staff read answers through read_booking_intake_answers(), which writes an audit row for every read.
--   * intake_submissions is the non-sensitive tombstone/status record (which version, when, whether removed). It never holds answers.
--   * patch_test_results holds the result of a skin test for one client and one service (negative / positive). Staff of that
--     provider and the client can read it; administrators cannot.
--   * every write goes through a command in the next migration; no client role has INSERT, UPDATE or DELETE on any of these tables.
-- Every number (validity, minimum hours, retention) is the provider's or the owner's own setting and is NULL / off until set.

-- 1. A consent purpose for health data. The purpose list lives in the table check and in record_consent(); both are extended here.
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.consents'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%photos_portfolio%'
  LOOP
    EXECUTE format('ALTER TABLE public.consents DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $do$;
ALTER TABLE public.consents ADD CONSTRAINT consents_purpose_check
  CHECK (purpose IN ('whatsapp', 'marketing', 'photos_portfolio', 'terms_privacy', 'data_processing', 'health_data'));

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

SELECT pg_temp.patch_function('public.record_consent(text, text, text, text)'::regprocedure,
  $from$'terms_privacy', 'data_processing')$from$,
  $to$'terms_privacy', 'data_processing', 'health_data')$to$);

-- 2. Provider setting: enforcement is a choice the provider makes; it is off until they switch it on.
CREATE TABLE IF NOT EXISTS public.provider_intake_settings (
  provider_id UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  enforce_requirements BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Provider-owned, versioned templates. A version is immutable: a change publishes a new version.
CREATE TABLE IF NOT EXISTS public.intake_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name_en VARCHAR(120) NOT NULL CHECK (length(btrim(name_en)) > 0),
  name_ar VARCHAR(120) NOT NULL CHECK (length(btrim(name_ar)) > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intake_templates_provider ON public.intake_form_templates (provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.intake_form_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.intake_form_templates(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  fields JSONB NOT NULL CHECK (jsonb_typeof(fields) = 'array'),
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE OR REPLACE FUNCTION public.intake_version_is_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A published form version cannot be changed; publish a new version' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.intake_version_is_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_intake_version_immutable ON public.intake_form_template_versions;
CREATE TRIGGER trg_intake_version_immutable BEFORE UPDATE ON public.intake_form_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.intake_version_is_immutable();

-- 4. One requirement per service: a form before the appointment (default) and / or a patch test.
CREATE TABLE IF NOT EXISTS public.intake_service_requirements (
  service_id UUID PRIMARY KEY REFERENCES public.services(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.intake_form_templates(id) ON DELETE RESTRICT,
  form_required BOOLEAN NOT NULL DEFAULT TRUE,
  patch_test_required BOOLEAN NOT NULL DEFAULT FALSE,
  patch_validity_days INTEGER CHECK (patch_validity_days IS NULL OR patch_validity_days BETWEEN 1 AND 3650),
  patch_min_hours_before INTEGER CHECK (patch_min_hours_before IS NULL OR patch_min_hours_before BETWEEN 0 AND 720),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intake_form_needs_template CHECK (NOT form_required OR template_id IS NOT NULL),
  CONSTRAINT intake_patch_needs_validity CHECK (NOT patch_test_required OR patch_validity_days IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_intake_requirements_provider ON public.intake_service_requirements (provider_id);

-- 5. Submissions: status and tombstone here, the answers in their own table.
CREATE TABLE IF NOT EXISTS public.intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_profile_id UUID REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES public.intake_form_templates(id) ON DELETE RESTRICT,
  template_version_id UUID NOT NULL REFERENCES public.intake_form_template_versions(id) ON DELETE RESTRICT,
  template_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'withdrawn', 'deleted', 'purged')),
  consent_id UUID REFERENCES public.consents(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answers_removed_at TIMESTAMPTZ,
  removal_reason TEXT CHECK (removal_reason IN ('consent_withdrawn', 'customer_deleted', 'retention')),
  read_count INTEGER NOT NULL DEFAULT 0,
  last_read_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intake_removed_has_reason CHECK ((status = 'submitted') = (answers_removed_at IS NULL AND removal_reason IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_customer ON public.intake_submissions (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_provider ON public.intake_submissions (provider_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.intake_answers (
  submission_id UUID PRIMARY KEY REFERENCES public.intake_submissions(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers JSONB NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intake_answers_customer ON public.intake_answers (customer_id);

-- 6. Patch tests. A positive result blocks that service for that client until the owner clears it with a reason.
CREATE TABLE IF NOT EXISTS public.patch_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_profile_id UUID REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  result TEXT NOT NULL CHECK (result IN ('negative', 'positive')),
  tested_at TIMESTAMPTZ NOT NULL,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_key UUID UNIQUE,
  cleared_at TIMESTAMPTZ,
  cleared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  clear_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patch_cleared_only_when_positive CHECK (cleared_at IS NULL OR result = 'positive'),
  CONSTRAINT patch_clear_has_reason CHECK (cleared_at IS NULL OR char_length(btrim(COALESCE(clear_reason, ''))) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_patch_tests_subject ON public.patch_test_results (provider_id, customer_id, service_id, tested_at DESC);

-- 7. Row-level security: default deny, then the narrow reads.
ALTER TABLE public.provider_intake_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_form_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_service_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patch_test_results ENABLE ROW LEVEL SECURITY;

-- Who manages a provider's intake configuration (read side): the owner and a provider-wide delegate with the bookings permission.
CREATE OR REPLACE FUNCTION public.can_read_intake_config(p_provider_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
    EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())
    OR public.can_access_provider_wide(p_provider_id, 'bookings'));
$$;
REVOKE ALL ON FUNCTION public.can_read_intake_config(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_intake_config(UUID) TO authenticated, service_role;

-- Staff that may see a patch-test result: the owner, an active employee of the provider, a delegate with the bookings permission.
-- Never an administrator.
CREATE OR REPLACE FUNCTION public.can_read_patch_tests(p_provider_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
    public.is_provider_staff(p_provider_id, auth.uid())
    OR public.can_access_provider_operation(p_provider_id, NULL, 'bookings'));
$$;
REVOKE ALL ON FUNCTION public.can_read_patch_tests(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_patch_tests(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Provider reads intake settings" ON public.provider_intake_settings;
CREATE POLICY "Provider reads intake settings" ON public.provider_intake_settings
  FOR SELECT TO authenticated USING (public.can_read_intake_config(provider_id));
DROP POLICY IF EXISTS "Provider reads intake templates" ON public.intake_form_templates;
CREATE POLICY "Provider reads intake templates" ON public.intake_form_templates
  FOR SELECT TO authenticated USING (public.can_read_intake_config(provider_id));
DROP POLICY IF EXISTS "Provider reads intake template versions" ON public.intake_form_template_versions;
CREATE POLICY "Provider reads intake template versions" ON public.intake_form_template_versions
  FOR SELECT TO authenticated USING (public.can_read_intake_config(provider_id));
DROP POLICY IF EXISTS "Provider reads intake requirements" ON public.intake_service_requirements;
CREATE POLICY "Provider reads intake requirements" ON public.intake_service_requirements
  FOR SELECT TO authenticated USING (public.can_read_intake_config(provider_id));

-- Status rows: the customer, and the staff who serve the booking. No administrator.
DROP POLICY IF EXISTS "Customer and booking staff read intake status" ON public.intake_submissions;
CREATE POLICY "Customer and booking staff read intake status" ON public.intake_submissions
  FOR SELECT TO authenticated USING (
    customer_id = (SELECT auth.uid())
    OR (NOT public.is_admin() AND public.is_booking_staff(booking_id, (SELECT auth.uid()))));

-- Answers: only the customer who gave them. Staff go through read_booking_intake_answers().
DROP POLICY IF EXISTS "Customer reads own intake answers" ON public.intake_answers;
CREATE POLICY "Customer reads own intake answers" ON public.intake_answers
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Client and provider staff read patch tests" ON public.patch_test_results;
CREATE POLICY "Client and provider staff read patch tests" ON public.patch_test_results
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()) OR public.can_read_patch_tests(provider_id));

SELECT public.grant_data_api_access('public.provider_intake_settings');
SELECT public.grant_data_api_access('public.intake_form_templates');
SELECT public.grant_data_api_access('public.intake_form_template_versions');
SELECT public.grant_data_api_access('public.intake_service_requirements');
SELECT public.grant_data_api_access('public.intake_submissions');
SELECT public.grant_data_api_access('public.intake_answers');
SELECT public.grant_data_api_access('public.patch_test_results');

SELECT public.attach_admin_audit_trigger('public.provider_intake_settings');
SELECT public.attach_admin_audit_trigger('public.intake_form_templates');
SELECT public.attach_admin_audit_trigger('public.intake_form_template_versions');
SELECT public.attach_admin_audit_trigger('public.intake_service_requirements');
SELECT public.attach_admin_audit_trigger('public.intake_submissions');
SELECT public.attach_admin_audit_trigger('public.intake_answers');
SELECT public.attach_admin_audit_trigger('public.patch_test_results');
