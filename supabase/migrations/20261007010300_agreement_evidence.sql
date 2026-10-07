-- D-24 + D-12 (approval side): agreement acceptance is evidence, so it can only be written by record_agreement_acceptance and
-- never changed afterwards; a published agreement version is immutable; a provider cannot be approved without having accepted the
-- agreement that is currently published.
--
--   * The INSERT policy on agreement_acceptances let any user insert a row with any accepted_at, for an unpublished version. Gone.
--   * An administrator could rewrite content_en of a published, already-accepted version. A trigger now allows only the
--     status move published -> archived (what admin_publish_agreement does); a new text needs a new version.
--   * approve_provider_application approved a provider with no acceptance row. It now refuses while no provider agreement is
--     published, and until the applicant has accepted the published version.

DROP POLICY IF EXISTS "Users record agreement acceptances" ON public.agreement_acceptances;
REVOKE INSERT, UPDATE, DELETE ON public.agreement_acceptances FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.protect_agreement_acceptances()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'An agreement acceptance is evidence and cannot be changed' USING ERRCODE = '22023';
END;
$$;
DROP TRIGGER IF EXISTS agreement_acceptances_immutable ON public.agreement_acceptances;
CREATE TRIGGER agreement_acceptances_immutable
  BEFORE UPDATE ON public.agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.protect_agreement_acceptances();

CREATE OR REPLACE FUNCTION public.protect_published_agreements()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A published or archived agreement version cannot be deleted' USING ERRCODE = '22023';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('published', 'archived') THEN
    IF NEW.agreement_key IS DISTINCT FROM OLD.agreement_key OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.title_en IS DISTINCT FROM OLD.title_en OR NEW.title_ar IS DISTINCT FROM OLD.title_ar
       OR NEW.summary_en IS DISTINCT FROM OLD.summary_en OR NEW.summary_ar IS DISTINCT FROM OLD.summary_ar
       OR NEW.content_en IS DISTINCT FROM OLD.content_en OR NEW.content_ar IS DISTINCT FROM OLD.content_ar
       OR NEW.requires_reacceptance IS DISTINCT FROM OLD.requires_reacceptance
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NOT (NEW.status = OLD.status OR (OLD.status = 'published' AND NEW.status = 'archived')) THEN
      RAISE EXCEPTION 'A published agreement version cannot be edited; publish a new version instead' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS legal_agreements_published_immutable ON public.legal_agreements;
CREATE TRIGGER legal_agreements_published_immutable
  BEFORE UPDATE OR DELETE ON public.legal_agreements
  FOR EACH ROW EXECUTE FUNCTION public.protect_published_agreements();

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
  v_from text := replace(p_from, chr(13) || chr(10), chr(10));
  v_to text := replace(p_to, chr(13) || chr(10), chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, v_to);
END $$;

-- record_agreement_acceptance: stamp the applicant's open provider application when the provider agreement is accepted.
SELECT pg_temp.patch_function('public.record_agreement_acceptance(text, text, text)'::regprocedure,
  $from$  RETURN v_id;$from$,
  $to$  IF p_agreement_key = 'provider_agreement' THEN
    UPDATE public.provider_applications SET agreed_at = now(), updated_at = now()
     WHERE user_id = v_user_id AND status IN ('pending', 'under_review') AND agreement_id = v_agreement.id AND agreed_at IS NULL;
  END IF;
  RETURN v_id;$to$);
-- ... and make it safe to repeat: the same user accepting the same version again returns the existing evidence row.
SELECT pg_temp.patch_function('public.record_agreement_acceptance(text, text, text)'::regprocedure,
  $from$  INSERT INTO public.agreement_acceptances (user_id, agreement_id, agreement_key, version, method)$from$,
  $to$  IF p_method IS NOT NULL AND p_method !~ '^[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid acceptance method' USING ERRCODE = '22023';
  END IF;
  SELECT a.id INTO v_id FROM public.agreement_acceptances a
   WHERE a.user_id = v_user_id AND a.agreement_id = v_agreement.id ORDER BY a.accepted_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.agreement_acceptances (user_id, agreement_id, agreement_key, version, method)$to$);

-- approve_provider_application: an acceptance of the published provider agreement is a precondition.
SELECT pg_temp.patch_function('public.approve_provider_application(uuid, text, numeric)'::regprocedure,
  $from$  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');$from$,
  $to$  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_agreement public.legal_agreements;$to$);
SELECT pg_temp.patch_function('public.approve_provider_application(uuid, text, numeric)'::regprocedure,
  $from$  IF v_app.latitude IS NULL OR v_app.longitude IS NULL THEN$from$,
  $to$  SELECT * INTO v_agreement FROM public.legal_agreements
   WHERE agreement_key = 'provider_agreement' AND status = 'published'
   ORDER BY published_at DESC NULLS LAST LIMIT 1;
  IF v_agreement.id IS NULL THEN
    RAISE EXCEPTION 'No provider agreement is published, so applications cannot be approved.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agreement_acceptances a
                  WHERE a.user_id = v_app.user_id AND a.agreement_id = v_agreement.id) THEN
    RAISE EXCEPTION 'The applicant has not accepted the current provider agreement (version %).', v_agreement.version USING ERRCODE = '22023';
  END IF;
  IF v_app.latitude IS NULL OR v_app.longitude IS NULL THEN$to$);
