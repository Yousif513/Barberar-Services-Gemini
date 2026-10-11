-- PRIVFIX-2: identity and the copy, from docs/reviews/2026-10-11-security-priv.md (M1, M2, L1, L2, L5).
--   M1  Downloading the copy needs a fresh one-time code (10 minutes), like submitting; at most 5 downloads per file.
--   M2  The code must go to a contact the account already had: a verified e-mail or phone changed in the last 30 days refuses the
--       code check, and a change within 30 days before the request (or since) blocks proposing, approving and releasing it.
--   L1  The multiple-requests extension counts only earlier requests the customer made or confirmed; extending needs step-up; a
--       "repetitive" refusal needs an earlier completed request of the same type.
--   L2  Redaction of the other party's text covers Arabic-Indic digits and the provider's staff names.
--   L5  Withdrawing a request and choosing what happens to reviews need a fresh code.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- M2: the code check refuses a contact that changed in the last 30 days
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.privacy_require_contact_otp()'::regprocedure,
$from$  v_latest := public.session_amr_latest(ARRAY['otp', 'magiclink', 'sms', 'email']);$from$,
$to$  -- Review M2: a code to a contact added or changed in the last 30 days does not prove who made the request.
  IF public.privacy_contact_changed_recently(auth.uid(), now()) THEN
    RAISE EXCEPTION 'Your e-mail or phone changed in the last 30 days. For your protection, privacy requests and downloads open again 30 days after the change; we have told your previous contact.'
      USING ERRCODE = '42501', HINT = 'contact_changed_recently';
  END IF;
  v_latest := public.session_amr_latest(ARRAY['otp', 'magiclink', 'sms', 'email']);$to$);

SELECT pg_temp.patch_function('public.admin_privacy_propose_execution(uuid,text)'::regprocedure,
$from$  IF r.request_type = 'deletion' AND r.review_choice IS NULL THEN$from$,
$to$  PERFORM public.privacy_require_unchanged_contacts(r);
  IF r.request_type = 'deletion' AND r.review_choice IS NULL THEN$to$);

SELECT pg_temp.patch_function('public.gov_exec_privacy_export(public.admin_approval_requests)'::regprocedure,
$from$  UPDATE public.privacy_requests SET status = 'executing', execution_state = 'awaiting_build'$from$,
$to$  PERFORM public.privacy_require_unchanged_contacts(r);
  UPDATE public.privacy_requests SET status = 'executing', execution_state = 'awaiting_build'$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- M1: the download needs a fresh code; at most 5 downloads of each file
-- ---------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.privacy_exports
  ADD COLUMN IF NOT EXISTS json_downloads INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_downloads INTEGER NOT NULL DEFAULT 0;

-- Declared static (manifest declaredStatic): downloads allowed per file of a copy.
CREATE OR REPLACE FUNCTION public.privacy_export_download_limit() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;
REVOKE ALL ON FUNCTION public.privacy_export_download_limit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_export_authorize_download(p_request_id UUID, p_file TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.privacy_exports;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to download your data' USING ERRCODE = '28000'; END IF;
  IF p_file IS NULL OR p_file NOT IN ('json', 'pdf') THEN RAISE EXCEPTION 'The file must be json or pdf' USING ERRCODE = '22023'; END IF;
  SELECT * INTO e FROM public.privacy_exports WHERE request_id = p_request_id AND subject_id = auth.uid() FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Copy not found' USING ERRCODE = 'P0002'; END IF;
  IF e.status = 'expired' OR (e.status = 'built' AND now() >= e.expires_at) THEN
    RAISE EXCEPTION 'This download expired 7 days after it was ready; make a new copy request' USING ERRCODE = '42501', HINT = 'export_expired';
  END IF;
  IF e.status <> 'built' THEN RAISE EXCEPTION 'The copy is not ready yet' USING ERRCODE = '22023'; END IF;
  -- Review M1: releasing the data needs the same fresh one-time code as asking for it.
  PERFORM public.privacy_require_contact_otp();
  IF (CASE WHEN p_file = 'json' THEN e.json_downloads ELSE e.pdf_downloads END) >= public.privacy_export_download_limit() THEN
    RAISE EXCEPTION 'This file was downloaded % times already; make a new copy request if you need it again', public.privacy_export_download_limit()
      USING ERRCODE = '42501', HINT = 'download_limit_reached';
  END IF;
  UPDATE public.privacy_exports SET downloads = downloads + 1, last_downloaded_at = now(),
         json_downloads = json_downloads + CASE WHEN p_file = 'json' THEN 1 ELSE 0 END,
         pdf_downloads = pdf_downloads + CASE WHEN p_file = 'pdf' THEN 1 ELSE 0 END
   WHERE id = e.id;
  PERFORM public.privacy_log_event(p_request_id, 'copy_downloaded', jsonb_build_object('file', p_file));
  PERFORM public.write_audit_log('privacy.export_downloaded', 'privacy_requests', p_request_id,
    jsonb_build_object('file', p_file) || public.request_client_info());
  RETURN jsonb_build_object('path', CASE WHEN p_file = 'json' THEN e.json_path ELSE e.pdf_path END,
    'content_type', CASE WHEN p_file = 'json' THEN 'application/json' ELSE 'application/pdf' END, 'expires_at', e.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.privacy_export_authorize_download(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_export_authorize_download(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- L5: withdrawing, and the review choice, need a fresh code
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.privacy_withdraw_request(uuid)'::regprocedure,
$from$  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id AND subject_id = auth.uid() FOR UPDATE;$from$,
$to$  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  -- Review L5: a stolen session cannot quietly withdraw the customer's request.
  PERFORM public.privacy_require_contact_otp();
  SELECT * INTO r FROM public.privacy_requests WHERE id = p_request_id AND subject_id = auth.uid() FOR UPDATE;$to$);

SELECT pg_temp.patch_function('public.privacy_set_review_choice(uuid,text)'::regprocedure,
$from$  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;$from$,
$to$  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  PERFORM public.privacy_require_contact_otp();$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- L1: extension and refusal grounds
-- ---------------------------------------------------------------------------------------------------------------------
SELECT pg_temp.patch_function('public.admin_privacy_extend_request(uuid,text,text)'::regprocedure,
$from$  PERFORM public.privacy_require_console('privacy.manage');
  IF p_code IS NULL OR p_code NOT IN ('disproportionate_effort', 'multiple_requests') THEN$from$,
$to$  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.manage');
  IF p_code IS NULL OR p_code NOT IN ('disproportionate_effort', 'multiple_requests') THEN$to$);
SELECT pg_temp.patch_function('public.admin_privacy_extend_request(uuid,text,text)'::regprocedure,
$from$       SELECT 1 FROM public.privacy_requests o WHERE o.subject_id = r.subject_id AND o.id <> r.id AND o.received_at > r.received_at - INTERVAL '12 months') THEN
    RAISE EXCEPTION 'Multiple requests: this customer has no other request in the last 12 months' USING ERRCODE = '22023';$from$,
$to$       SELECT 1 FROM public.privacy_requests o WHERE o.subject_id = r.subject_id AND o.id <> r.id AND o.received_at > r.received_at - INTERVAL '12 months'
          -- Review L1: only requests the customer made in the app or confirmed with a code count, not one staff logged themselves.
          AND o.verified_at IS NOT NULL AND o.verification_method IN ('in_app_otp_at_submission', 'in_app_otp_confirmation')) THEN
    RAISE EXCEPTION 'Multiple requests: this customer has made or confirmed no other request in the last 12 months' USING ERRCODE = '22023';$to$);

SELECT pg_temp.patch_function('public.admin_privacy_refuse_request(uuid,text,text)'::regprocedure,
$from$  IF r.status NOT IN ('awaiting_verification', 'open', 'awaiting_approval') THEN
    RAISE EXCEPTION 'This request is % and can no longer be refused', r.status USING ERRCODE = '22023';
  END IF;$from$,
$to$  IF r.status NOT IN ('awaiting_verification', 'open', 'awaiting_approval') THEN
    RAISE EXCEPTION 'This request is % and can no longer be refused', r.status USING ERRCODE = '22023';
  END IF;
  -- Review L1: "repetitive" needs an earlier request of the same type that was answered.
  IF p_code = 'repetitive' AND NOT EXISTS (
       SELECT 1 FROM public.privacy_requests o WHERE o.subject_id = r.subject_id AND o.id <> r.id AND o.request_type = r.request_type
          AND o.status = 'completed' AND o.received_at < r.received_at AND o.received_at > r.received_at - INTERVAL '12 months') THEN
    RAISE EXCEPTION 'Repetitive: this customer has no earlier completed % request in the last 12 months', r.request_type
      USING ERRCODE = '22023', HINT = 'no_earlier_request';
  END IF;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- L2: redaction of the other party's text
-- ---------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.privacy_redact_text(p_text TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(p_text,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[redacted e-mail]', 'g'),
    '(\+?[0-9٠-٩۰-۹][0-9٠-٩۰-۹ ()-]{7,}[0-9٠-٩۰-۹])', '[redacted number]', 'g');
$$;
REVOKE ALL ON FUNCTION public.privacy_redact_text(TEXT) FROM PUBLIC, anon, authenticated;

-- The names of a provider's staff (full names and first names, Arabic and English) removed from text written by that provider.
CREATE OR REPLACE FUNCTION public.privacy_redact_provider_text(p_text TEXT, p_provider_id UUID) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v TEXT := public.privacy_redact_text(p_text);
  n TEXT;
BEGIN
  IF v IS NULL OR p_provider_id IS NULL THEN RETURN v; END IF;
  FOR n IN
    SELECT d.x FROM (SELECT DISTINCT x FROM (
      SELECT btrim(e.name_en) AS x FROM public.employees e JOIN public.branches b ON b.id = e.branch_id WHERE b.provider_id = p_provider_id
      UNION ALL SELECT btrim(e.name_ar) FROM public.employees e JOIN public.branches b ON b.id = e.branch_id WHERE b.provider_id = p_provider_id
      UNION ALL SELECT split_part(btrim(e.name_en), ' ', 1) FROM public.employees e JOIN public.branches b ON b.id = e.branch_id WHERE b.provider_id = p_provider_id
      UNION ALL SELECT split_part(btrim(e.name_ar), ' ', 1) FROM public.employees e JOIN public.branches b ON b.id = e.branch_id WHERE b.provider_id = p_provider_id
      UNION ALL SELECT btrim(concat_ws(' ', pr.first_name, pr.last_name)) FROM public.providers p JOIN public.profiles pr ON pr.id = p.owner_id WHERE p.id = p_provider_id
      UNION ALL SELECT btrim(pr.first_name) FROM public.providers p JOIN public.profiles pr ON pr.id = p.owner_id WHERE p.id = p_provider_id
    ) s WHERE x IS NOT NULL AND char_length(x) >= 2) d
    ORDER BY char_length(d.x) DESC, d.x
  LOOP
    -- Longest names first, so a full name is replaced before its first name; whole words only.
    v := regexp_replace(v, '(^|[^[:alnum:]])' || regexp_replace(n, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '($|[^[:alnum:]])',
                        '\1[redacted name]\2', 'gi');
  END LOOP;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.privacy_redact_provider_text(TEXT, UUID) FROM PUBLIC, anon, authenticated;

SELECT pg_temp.patch_function('public.privacy_export_payload(uuid)'::regprocedure,
$from$'text', CASE WHEN m.sender_id = s THEN m.body ELSE public.privacy_redact_text(m.body) END,$from$,
$to$'text', CASE WHEN m.sender_id = s THEN m.body ELSE public.privacy_redact_provider_text(m.body, c.provider_id) END,$to$);
SELECT pg_temp.patch_function('public.privacy_export_payload(uuid)'::regprocedure,
$from$'business_reply', public.privacy_redact_text(rv.reply_comment),$from$,
$to$'business_reply', public.privacy_redact_provider_text(rv.reply_comment, rv.provider_id),$to$);
