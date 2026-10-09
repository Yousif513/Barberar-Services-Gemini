-- P-11 (privacy review 2026-10-08): record_consent trusted the client's document_version for every purpose except terms_privacy, so the evidence of
-- which notice a person agreed to could be forged or simply wrong. The version on record is now always the one published on the server: the customer
-- terms for terms_privacy, the privacy notice for every other purpose. While nothing is published the row says 'unpublished' (honest evidence that no
-- version existed), never the text the client sent. The client's version argument is still accepted and validated so existing screens keep working.
-- record_consents (plural) calls record_consent and inherits this.
-- ip_address / user_agent stay empty on purpose: a SECURITY DEFINER function behind PostgREST cannot read them reliably (owner decision, see the report).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.record_consent(text, text, text, text)'::regprocedure,
$from$        ORDER BY published_at DESC NULLS LAST LIMIT 1) END,
    p_document_version, 'v1.0');$from$,
$to$        ORDER BY published_at DESC NULLS LAST LIMIT 1)
    ELSE
      (SELECT version FROM public.legal_agreements WHERE agreement_key = 'privacy_notice' AND status = 'published'
        ORDER BY published_at DESC NULLS LAST LIMIT 1) END,
    'unpublished');$to$);
