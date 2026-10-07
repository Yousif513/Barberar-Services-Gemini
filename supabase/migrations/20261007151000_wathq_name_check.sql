-- Migration: 20261007151000_wathq_name_check.sql
-- FIX-DBB / R32 (SQL part): the Wathq check never tied the commercial registration to the applicant. wathq-verify ignored the registered
-- name and the badge said "CR verified via Wathq" for any active CR number. Now:
--   * cr_names_match() compares the registered name with the business name (normalised Arabic and English: diacritics, alef/ya/ta marbuta
--     forms, punctuation, legal-form words; equal, or one contained in the other when at least 4 characters).
--   * record_wathq_cr_verification (providers) stores the comparison in cr_wathq_data and sets the status: active and matching -> verified;
--     active but the name does not match or is missing from the response -> name_mismatch (needs an administrator); inactive -> rejected.
--     The administrator confirms a mismatch with the existing admin manual review (status manually_reviewed).
--   * applications get the same check before a provider exists: record_wathq_application_check (service role) and
--     admin_confirm_application_cr (administrator, with notes). approve_provider_application refuses an application that states a CR number
--     until its CR is verified or manually reviewed, and copies that result onto the new provider. Applicants cannot write the status.
-- The Edge Function must send the application id (or the provider id) and the response's registered name: that is a web/Deno change outside
-- this package and is listed in the report. Applications that state no CR number (freelancers) are not gated.

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

CREATE OR REPLACE FUNCTION public.normalize_business_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(string_agg(t, ' ' ORDER BY ord), '')
  FROM unnest(string_to_array(trim(regexp_replace(
         regexp_replace(
           translate(lower(COALESCE(p_name, '')), U&'\0623\0625\0622\0671\0649\0629', U&'\0627\0627\0627\0627\064A\0647'),
           U&'[\064B-\0652\0640]', '', 'g'),
         U&'[^a-z0-9\0621-\064A]+', ' ', 'g')), ' ')) WITH ORDINALITY AS u(t, ord)
  WHERE t <> '' AND t NOT IN ('est', 'establishment', 'company', 'co', 'llc', 'ltd', 'the', 'trading',
    U&'\0645\0624\0633\0633\0647', U&'\0634\0631\0643\0647');
$$;

CREATE OR REPLACE FUNCTION public.cr_names_match(p_registered TEXT, p_name_ar TEXT, p_name_en TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_reg TEXT := replace(public.normalize_business_name(p_registered), ' ', ''); v_candidate TEXT; v_norm TEXT;
BEGIN
  IF length(v_reg) < 2 THEN RETURN FALSE; END IF;
  FOREACH v_candidate IN ARRAY ARRAY[p_name_ar, p_name_en] LOOP
    v_norm := replace(public.normalize_business_name(v_candidate), ' ', '');
    IF length(v_norm) < 2 THEN CONTINUE; END IF;
    IF v_norm = v_reg THEN RETURN TRUE; END IF;
    IF least(length(v_norm), length(v_reg)) >= 4 AND (position(v_norm IN v_reg) > 0 OR position(v_reg IN v_norm) > 0) THEN RETURN TRUE; END IF;
  END LOOP;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_business_name(TEXT), public.cr_names_match(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_business_name(TEXT), public.cr_names_match(TEXT, TEXT, TEXT) TO service_role;

-- Providers: the comparison is part of the recorded check.
SELECT pg_temp.patch_function('public.record_wathq_cr_verification(uuid, text, boolean, jsonb)'::regprocedure,
  $q$AS $function$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN$q$,
  $q$AS $function$
DECLARE
  v_registered TEXT := COALESCE(NULLIF(p_wathq_payload ->> 'crName', ''), NULLIF(p_wathq_payload ->> 'name', ''));
  v_match BOOLEAN := FALSE;
  v_status TEXT;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN$q$);
SELECT pg_temp.patch_function('public.record_wathq_cr_verification(uuid, text, boolean, jsonb)'::regprocedure,
  $q$  UPDATE public.providers
  SET cr_number = p_cr_number,
      cr_verification_status = CASE WHEN p_is_active THEN 'verified' ELSE 'rejected' END,
      cr_verified_at = CASE WHEN p_is_active THEN now() ELSE NULL END,
      cr_wathq_data = jsonb_build_object('source', 'wathq_api', 'checked_at', now(), 'response', p_wathq_payload)
  WHERE id = p_provider_id;$q$,
  $q$  SELECT public.cr_names_match(v_registered, business_name_ar, business_name_en) INTO v_match
  FROM public.providers WHERE id = p_provider_id;
  v_status := CASE WHEN NOT p_is_active THEN 'rejected' WHEN v_match THEN 'verified' ELSE 'name_mismatch' END;
  UPDATE public.providers
  SET cr_number = p_cr_number,
      cr_verification_status = v_status,
      cr_verified_at = CASE WHEN v_status = 'verified' THEN now() ELSE NULL END,
      cr_wathq_data = jsonb_build_object('source', 'wathq_api', 'checked_at', now(), 'response', p_wathq_payload,
        'registered_name', v_registered, 'name_match', v_match)
  WHERE id = p_provider_id;$q$);
SELECT pg_temp.patch_function('public.record_wathq_cr_verification(uuid, text, boolean, jsonb)'::regprocedure,
  $q$jsonb_build_object('cr_number', p_cr_number, 'active', p_is_active));
  RETURN jsonb_build_object('success', TRUE, 'status', CASE WHEN p_is_active THEN 'verified' ELSE 'rejected' END);$q$,
  $q$jsonb_build_object('cr_number', p_cr_number, 'active', p_is_active, 'name_match', v_match, 'status', v_status));
  RETURN jsonb_build_object('success', TRUE, 'status', v_status, 'name_match', v_match, 'registered_name', v_registered);$q$);

-- Applications: the check before a provider exists.
ALTER TABLE public.provider_applications ADD COLUMN IF NOT EXISTS cr_verification_status VARCHAR(30) NOT NULL DEFAULT 'unchecked';
ALTER TABLE public.provider_applications ADD COLUMN IF NOT EXISTS cr_check_data JSONB;

CREATE OR REPLACE FUNCTION public.guard_application_cr_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('primora.application_cr_command', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.cr_verification_status := 'unchecked';
    NEW.cr_check_data := NULL;
  ELSE
    NEW.cr_verification_status := OLD.cr_verification_status;
    NEW.cr_check_data := OLD.cr_check_data;
    IF NEW.cr_number IS DISTINCT FROM OLD.cr_number OR NEW.business_name_en IS DISTINCT FROM OLD.business_name_en
       OR NEW.business_name_ar IS DISTINCT FROM OLD.business_name_ar THEN
      NEW.cr_verification_status := 'unchecked';
      NEW.cr_check_data := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_application_cr_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_application_cr_status ON public.provider_applications;
CREATE TRIGGER guard_application_cr_status BEFORE INSERT OR UPDATE ON public.provider_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_cr_status();

CREATE OR REPLACE FUNCTION public.record_wathq_application_check(p_application_id UUID, p_cr_number TEXT, p_is_active BOOLEAN, p_wathq_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.provider_applications;
  v_registered TEXT := COALESCE(NULLIF(p_wathq_payload ->> 'crName', ''), NULLIF(p_wathq_payload ->> 'name', ''));
  v_match BOOLEAN;
  v_status TEXT;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Provider application not found' USING ERRCODE = 'P0002'; END IF;
  IF p_cr_number IS NULL OR NULLIF(trim(v_app.cr_number), '') IS NULL OR trim(p_cr_number) <> trim(v_app.cr_number) THEN
    RAISE EXCEPTION 'The checked CR number is not the number on the application' USING ERRCODE = '22023'; END IF;
  v_match := public.cr_names_match(v_registered, v_app.business_name_ar, v_app.business_name_en);
  v_status := CASE WHEN NOT p_is_active THEN 'rejected' WHEN v_match THEN 'verified' ELSE 'name_mismatch' END;
  PERFORM set_config('primora.application_cr_command', 'on', true);
  UPDATE public.provider_applications
  SET cr_verification_status = v_status,
      cr_check_data = jsonb_build_object('source', 'wathq_api', 'checked_at', now(), 'registered_name', v_registered, 'name_match', v_match)
  WHERE id = p_application_id;
  PERFORM set_config('primora.application_cr_command', '', true);
  PERFORM public.write_audit_log('provider_application.cr_wathq_checked', 'provider_applications', p_application_id,
    jsonb_build_object('active', p_is_active, 'name_match', v_match, 'status', v_status));
  RETURN jsonb_build_object('success', TRUE, 'status', v_status, 'name_match', v_match, 'registered_name', v_registered);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_application_cr(p_application_id UUID, p_notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app public.provider_applications;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Provider application not found' USING ERRCODE = 'P0002'; END IF;
  IF v_app.cr_number IS NULL OR trim(v_app.cr_number) !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'The application needs a 10 digit commercial registration number' USING ERRCODE = '22023'; END IF;
  IF NULLIF(trim(COALESCE(p_notes, '')), '') IS NULL OR length(trim(p_notes)) < 3 THEN
    RAISE EXCEPTION 'Record what was checked (document reviewed, registered name, expiry date)' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('primora.application_cr_command', 'on', true);
  UPDATE public.provider_applications
  SET cr_verification_status = 'manually_reviewed',
      cr_check_data = jsonb_build_object('source', 'manual_admin_review', 'reviewed_by', auth.uid(), 'reviewed_at', now(), 'notes', trim(p_notes),
                                         'previous_status', v_app.cr_verification_status)
  WHERE id = p_application_id;
  PERFORM set_config('primora.application_cr_command', '', true);
  PERFORM public.write_audit_log('provider_application.cr_manually_reviewed', 'provider_applications', p_application_id,
    jsonb_build_object('previous_status', v_app.cr_verification_status, 'notes', trim(p_notes)));
  RETURN jsonb_build_object('success', TRUE, 'status', 'manually_reviewed');
END;
$$;
REVOKE ALL ON FUNCTION public.record_wathq_application_check(UUID, TEXT, BOOLEAN, JSONB), public.admin_confirm_application_cr(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wathq_application_check(UUID, TEXT, BOOLEAN, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_application_cr(UUID, TEXT) TO authenticated, service_role;

-- Approval requires a verified or manually reviewed CR when the application states one, and hands the result to the new provider.
SELECT pg_temp.patch_function('public.approve_provider_application(uuid, text, numeric)'::regprocedure,
  $q$  v_vat := CASE$q$,
  $q$  IF NULLIF(trim(COALESCE(v_app.cr_number, '')), '') IS NOT NULL AND v_app.cr_verification_status NOT IN ('verified', 'manually_reviewed') THEN
    RAISE EXCEPTION 'The commercial registration must be verified, or manually reviewed by an administrator, before approval (now: %).', v_app.cr_verification_status USING ERRCODE = '22023';
  END IF;

  v_vat := CASE$q$);
SELECT pg_temp.patch_function('public.approve_provider_application(uuid, text, numeric)'::regprocedure,
  $q$  RETURNING id INTO v_provider_id;$q$,
  $q$  RETURNING id INTO v_provider_id;

  IF v_app.cr_verification_status IN ('verified', 'manually_reviewed') THEN
    UPDATE public.providers
    SET cr_verification_status = v_app.cr_verification_status, cr_verified_at = now(), cr_wathq_data = v_app.cr_check_data
    WHERE id = v_provider_id;
  END IF;$q$);


DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
