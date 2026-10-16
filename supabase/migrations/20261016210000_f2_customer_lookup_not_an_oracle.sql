-- F2 (docs/reviews/2026-10-16-security-final-recheck.md): admin_privacy_find_customers was an unthrottled oracle. Substring
-- matching on phone digits and e-mails let an operator rebuild a full number or address one character at a time despite the
-- masking, and the audit row carried no trace of the query, so the probing could not be seen. Now:
--   * a phone lookup matches the whole number only (normalised: spaces, +, 00, the 966 country code and a leading 0 removed;
--     at least 9 digits), and an e-mail lookup the whole address only (case-insensitive equality, never a substring);
--   * a name lookup (at least 3 characters) matches the first and last name only, never the e-mail;
--   * results are masked: first name, last-name initial, e-mail as x***@domain, last 4 phone digits, join date;
--   * step-up (a fresh authenticator code) is required;
--   * per actor at most privacy_lookup_limit() (10) lookups in privacy_lookup_window() (10 minutes); the next one is refused,
--     recorded, and raises one 'privacy_lookup_limit_reached' security alert for the owners in the window;
--   * every lookup, refused or not, is audited with the kind, the length and an HMAC-SHA256 of the normalised query under a key
--     no client role can read, so repeated or stepwise probing shows in the log without the log holding the personal data.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);

-- The key of the query HMAC. No grant to any client role, no policy; generated once here, never returned by any function.
CREATE TABLE IF NOT EXISTS public.privacy_lookup_keys (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret BYTEA NOT NULL CHECK (octet_length(secret) >= 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.privacy_lookup_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_lookup_keys FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.privacy_lookup_keys (id, secret) VALUES (1, extensions.gen_random_bytes(32)) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.privacy_lookup_keys IS
  'HMAC key for the audited digest of privacy subject lookups (review F2). Readable by no client role; the column name keeps it redacted by the audit trigger.';
SELECT public.attach_admin_audit_trigger('public.privacy_lookup_keys');

CREATE OR REPLACE FUNCTION public.privacy_lookup_limit() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 10 $$;
CREATE OR REPLACE FUNCTION public.privacy_lookup_window() RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $$ SELECT INTERVAL '10 minutes' $$;
REVOKE ALL ON FUNCTION public.privacy_lookup_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.privacy_lookup_window() FROM PUBLIC, anon, authenticated;

-- A phone number reduced to the digits a person dials inside the country: 00 and the 966 code and a trunk 0 removed.
CREATE OR REPLACE FUNCTION public.privacy_phone_canonical(p_phone TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(regexp_replace(regexp_replace(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'),
           '^00', ''), '^966', ''), '^0+', ''), '');
$$;
REVOKE ALL ON FUNCTION public.privacy_phone_canonical(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_lookup_digest(p_kind TEXT, p_normalised TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT encode(extensions.hmac(convert_to(p_kind || ':' || COALESCE(p_normalised, ''), 'UTF8'), k.secret, 'sha256'), 'hex')
    FROM public.privacy_lookup_keys k WHERE k.id = 1;
$$;
REVOKE ALL ON FUNCTION public.privacy_lookup_digest(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_kind_check;
ALTER TABLE public.security_alerts ADD CONSTRAINT security_alerts_kind_check CHECK (kind IN (
  'mfa_lockout', 'mfa_reset', 'iban_reveal_volume', 'break_glass_used', 'console_role_changed', 'iban_change_requested',
  'health_break_glass', 'mfa_factor_added', 'iban_reveal_limit_reached', 'privacy_request_escalated', 'privacy_incident_deadline',
  'privacy_lookup_limit_reached'));

CREATE OR REPLACE FUNCTION public.admin_privacy_find_customers(p_query TEXT, p_purpose TEXT DEFAULT 'privacy_request')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_purpose TEXT;
  v_kind TEXT;
  v_norm TEXT;
  v_id UUID;
  v_pattern TEXT;
  v_digest TEXT;
  v_used INTEGER;
  v_first TIMESTAMPTZ;
  v_rows JSONB;
  v_ids UUID[];
  v_more BOOLEAN;
BEGIN
  PERFORM public.privacy_require_console('privacy.manage');
  PERFORM public.require_recent_mfa();
  v_purpose := public.gov2_read_purpose(p_purpose, 'privacy_request');
  IF v_query IS NULL OR char_length(v_query) < 3 THEN
    RAISE EXCEPTION 'Search by at least 3 characters of the name, or the whole e-mail or phone number' USING ERRCODE = '22023', HINT = 'query_too_short';
  END IF;
  IF char_length(v_query) > 120 THEN
    RAISE EXCEPTION 'The search is at most 120 characters' USING ERRCODE = '22023';
  END IF;

  IF v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_kind := 'account_id';
    v_id := v_query::uuid;
    v_norm := lower(v_query);
  ELSIF position('@' IN v_query) > 0 THEN
    v_kind := 'email';
    v_norm := lower(v_query);
    IF v_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'Enter the whole e-mail address; part of an address is not searched' USING ERRCODE = '22023', HINT = 'email_incomplete';
    END IF;
  ELSIF v_query ~ '^[0-9 +().-]+$' THEN
    v_kind := 'phone';
    v_norm := public.privacy_phone_canonical(v_query);
    IF v_norm IS NULL OR char_length(v_norm) < 9 OR char_length(v_norm) > 15 THEN
      RAISE EXCEPTION 'Enter the whole phone number; part of a number is not searched' USING ERRCODE = '22023', HINT = 'phone_incomplete';
    END IF;
  ELSE
    v_kind := 'name';
    v_norm := lower(regexp_replace(v_query, '\s+', ' ', 'g'));
    v_pattern := '%' || replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;
  v_digest := public.privacy_lookup_digest(v_kind, v_norm);

  -- Per-actor rate limit; serialised per actor so parallel calls cannot slip past it.
  PERFORM pg_advisory_xact_lock(hashtext('privacy_lookup:' || auth.uid()::text));
  SELECT count(*), min(created_at) INTO v_used, v_first FROM public.admin_audit_logs
   WHERE action = 'privacy.subject_lookup' AND actor_id = auth.uid() AND created_at > now() - public.privacy_lookup_window();
  IF v_used >= public.privacy_lookup_limit() THEN
    IF NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'privacy_lookup_limit_reached' AND user_id = auth.uid()
                    AND created_at > now() - public.privacy_lookup_window() AND acknowledged_at IS NULL) THEN
      INSERT INTO public.security_alerts (kind, user_id, details)
      VALUES ('privacy_lookup_limit_reached', auth.uid(), jsonb_build_object('lookups', v_used, 'limit', public.privacy_lookup_limit(),
              'window_minutes', EXTRACT(EPOCH FROM public.privacy_lookup_window())::integer / 60));
    END IF;
    PERFORM public.write_audit_log('privacy.subject_lookup_refused', 'profiles', NULL,
      jsonb_build_object('query_kind', v_kind, 'query_length', char_length(v_query), 'query_hmac', v_digest,
                         'lookups_in_window', v_used, 'limit', public.privacy_lookup_limit()) || public.request_client_info());
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'more', FALSE, 'refused', TRUE, 'refusal', 'lookup_limit_reached',
      'limit', public.privacy_lookup_limit(), 'window_minutes', EXTRACT(EPOCH FROM public.privacy_lookup_window())::integer / 60,
      'retry_after', v_first + public.privacy_lookup_window());
  END IF;

  WITH found AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.created_at
      FROM public.profiles p
     WHERE p.role = 'customer'
       AND CASE v_kind
             WHEN 'account_id' THEN p.id = v_id
             WHEN 'email' THEN lower(btrim(COALESCE(p.email, ''))) = v_norm
             WHEN 'phone' THEN public.privacy_phone_canonical(p.phone_number) = v_norm
             ELSE (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
           END
     ORDER BY p.created_at DESC, p.id
     LIMIT 11
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'first_name', f.first_name,
           'last_initial', NULLIF(upper(left(btrim(COALESCE(f.last_name, '')), 1)), ''),
           'email_masked', CASE WHEN f.email IS NULL OR position('@' IN f.email) = 0 THEN NULL
                                ELSE left(f.email, 1) || '***' || substring(f.email FROM position('@' IN f.email)) END,
           'phone_last4', CASE WHEN f.phone_number IS NULL THEN NULL ELSE right(regexp_replace(f.phone_number, '\D', '', 'g'), 4) END,
           'joined_at', f.created_at) ORDER BY f.created_at DESC, f.id) FILTER (WHERE f.rn <= 10), '[]'::jsonb),
         COALESCE(array_agg(f.id) FILTER (WHERE f.rn <= 10), '{}'::uuid[]),
         count(*) > 10
    INTO v_rows, v_ids, v_more
    FROM (SELECT found.*, row_number() OVER (ORDER BY found.created_at DESC, found.id) AS rn FROM found) f;

  PERFORM public.gov2_log_read('privacy.subject_lookup', 'profiles', v_ids,
    ARRAY['first_name', 'last_name', 'email', 'phone_number'], v_purpose,
    jsonb_build_object('query_kind', v_kind, 'query_length', char_length(v_query), 'query_hmac', v_digest),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('rows', v_rows, 'more', v_more, 'refused', FALSE,
    'remaining', public.privacy_lookup_limit() - v_used - 1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_privacy_find_customers(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_find_customers(TEXT, TEXT) TO authenticated;
