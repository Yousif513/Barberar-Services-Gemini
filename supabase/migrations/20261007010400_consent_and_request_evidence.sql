-- D-15: consent and data-subject-request evidence is written only by commands.
--
-- The INSERT policies let any signed-in user write a consent row with any created_at, method and document_version (a future-dated
-- "granted" row defeats a later withdrawal, because the latest row wins) and a data request with any due_date, reviewed_by and
-- admin_notes (a ten-year deadline, a self-approved note). Now:
--   * "Users insert own consents" and "Users submit own DSR requests" are dropped and INSERT is withdrawn from the client roles;
--   * record_consent (patched in place) validates the purpose, the method and the document version, and for the terms it records
--     the version that is actually published;
--   * record_consents(...) records several purposes in one transaction (sign-up screens ask for two or three at once);
--   * submit_data_request(...) is the only way to open a request: the server sets the status, the 30-day due date (Riyadh date)
--     and the owner, and a repeat of the same open request returns the one already open.

DROP POLICY IF EXISTS "Users insert own consents" ON public.consents;
DROP POLICY IF EXISTS "Users submit own DSR requests" ON public.data_subject_requests;
REVOKE INSERT, UPDATE, DELETE ON public.consents FROM authenticated, anon;
REVOKE INSERT, DELETE ON public.data_subject_requests FROM authenticated, anon;

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

SELECT pg_temp.patch_function('public.record_consent(text, text, text, text)'::regprocedure,
  $from$  v_consent_id UUID;$from$,
  $to$  v_consent_id UUID;
  v_version TEXT;$to$);
SELECT pg_temp.patch_function('public.record_consent(text, text, text, text)'::regprocedure,
  $from$  INSERT INTO public.consents ($from$,
  $to$  IF p_method IS NOT NULL AND p_method !~ '^[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid consent method' USING ERRCODE = '22023';
  END IF;
  IF p_document_version IS NOT NULL AND p_document_version !~ '^[A-Za-z0-9._-]{1,20}$' THEN
    RAISE EXCEPTION 'Invalid document version' USING ERRCODE = '22023';
  END IF;
  -- The version on record is the one that is published, not the one the client says it showed.
  v_version := COALESCE(
    CASE WHEN p_purpose = 'terms_privacy' THEN
      (SELECT version FROM public.legal_agreements WHERE agreement_key = 'customer_terms' AND status = 'published'
        ORDER BY published_at DESC NULLS LAST LIMIT 1) END,
    p_document_version, 'v1.0');

  INSERT INTO public.consents ($to$);
SELECT pg_temp.patch_function('public.record_consent(text, text, text, text)'::regprocedure,
  $from$    COALESCE(p_document_version, 'v1.0'),$from$,
  $to$    v_version,$to$);

CREATE OR REPLACE FUNCTION public.record_consents(
  p_purposes TEXT[],
  p_status TEXT DEFAULT 'granted',
  p_document_version TEXT DEFAULT 'v1.0',
  p_method TEXT DEFAULT 'web_form'
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[] := '{}';
  v_purpose TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record consent.' USING ERRCODE = '28000';
  END IF;
  IF p_purposes IS NULL OR cardinality(p_purposes) = 0 OR cardinality(p_purposes) > 5 THEN
    RAISE EXCEPTION 'Give between one and five consent purposes' USING ERRCODE = '22023';
  END IF;
  FOREACH v_purpose IN ARRAY p_purposes LOOP
    v_ids := v_ids || public.record_consent(v_purpose, p_status, p_document_version, p_method);
  END LOOP;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.record_consents(TEXT[], TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consents(TEXT[], TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_data_request(p_request_type TEXT, p_details TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_details TEXT := NULLIF(btrim(COALESCE(p_details, '')), '');
  v_row public.data_subject_requests;
  v_created BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to submit a data request.' USING ERRCODE = '28000';
  END IF;
  IF p_request_type IS NULL OR p_request_type NOT IN ('access', 'rectification', 'erasure', 'export') THEN
    RAISE EXCEPTION 'Invalid request type' USING ERRCODE = '22023';
  END IF;
  IF v_details IS NOT NULL AND char_length(v_details) > 2000 THEN
    RAISE EXCEPTION 'Details are limited to 2000 characters' USING ERRCODE = '22023';
  END IF;

  -- A request of the same kind that is still open is returned instead of opening a second one (replay-safe).
  PERFORM pg_advisory_xact_lock(hashtextextended('dsr:' || v_uid::text || ':' || p_request_type, 0));
  SELECT * INTO v_row FROM public.data_subject_requests
   WHERE user_id = v_uid AND request_type = p_request_type AND status IN ('pending', 'in_progress')
   ORDER BY created_at LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.data_subject_requests (user_id, request_type, status, details, due_date)
    VALUES (v_uid, p_request_type, 'pending', v_details, (now() AT TIME ZONE 'Asia/Riyadh')::date + 30)
    RETURNING * INTO v_row;
    v_created := TRUE;
    PERFORM public.write_audit_log('data_request.submitted', 'data_subject_requests', v_row.id,
      jsonb_build_object('request_type', p_request_type, 'due_date', v_row.due_date));
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'created', v_created, 'id', v_row.id, 'request_type', v_row.request_type,
                            'status', v_row.status, 'due_date', v_row.due_date);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_data_request(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_data_request(TEXT, TEXT) TO authenticated;
