-- Migration: 20261006090000_api_keys.sql
-- G69 "Real developer API", part 1: hashed, scoped, expiring, rate-limited API keys.
--
-- What this replaces. The earlier developer console generated a token in the browser and inserted it into
-- public.api_tokens straight from a React handler. The table was never consulted by anything (no API existed), the
-- stored value was whatever the browser sent (older builds sent the plaintext token), and the "developer profile
-- approval" it hung off has no administrator screen, while its row policy let the developer set is_approved on
-- themselves. Nothing in that design can be repaired in place, so:
--   * every existing api_tokens row is revoked and its token_hash is set to NULL. A CHECK constraint then forbids a
--     credential ever being written to that table again. Existing tokens stop working (they never worked against
--     anything) and nothing can be recovered, by design.
--   * developer_profiles keeps its rows but clients can no longer write to it (no self-approval, no new registrations);
--     the new keys belong to a provider and are created by the provider owner, so no approval step is needed.
--
-- The new model. A key belongs to one provider (optionally narrowed to one branch). Its plaintext
-- (prm_live_ + 64 hex characters = 256 bits from pgcrypto's CSPRNG) is returned once by create_api_key and is never
-- stored or logged. Only a SHA-256 digest is kept, in a table no client role can read at all, next to a non-secret
-- display prefix and last four characters. The public API (an Edge Function) authenticates through
-- authenticate_api_key, which only the service role can execute.
--
-- Business values are not invented here. The rate-limit ceiling, the optional key lifetime ceiling and the webhook
-- delivery settings live in platform_settings and are unset until the owner sets them (admin_set_api_setting).

-- ---------------------------------------------------------------------------
-- 1. Settings (all unset until the owner decides; JSON null means unset)
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('api.max_requests_per_minute', 'null'::jsonb,
   'Ceiling for the requests-per-minute limit a provider can give an API key. While unset, API keys cannot be created.', TRUE),
  ('api.max_key_lifetime_days', 'null'::jsonb,
   'Optional ceiling on how far in the future an API key may expire. While unset, any future expiry date is accepted.', TRUE),
  ('api.webhook_max_attempts', 'null'::jsonb,
   'How many delivery attempts a webhook event gets before it is marked failed. While unset, no webhook deliveries are attempted.', TRUE),
  ('api.webhook_retry_base_seconds', 'null'::jsonb,
   'Base delay in seconds of the exponential webhook retry back-off (delay = base * 2^(attempt-1)). While unset, no webhook deliveries are attempted.', TRUE),
  ('api.webhook_disable_after_failures', 'null'::jsonb,
   'Consecutive failed webhook events after which an endpoint is disabled automatically. While unset, endpoints are never disabled automatically.', TRUE)
ON CONFLICT (key) DO NOTHING;

-- A positive whole setting, or NULL when it is unset or malformed. Internal helper: no client role may run it.
CREATE OR REPLACE FUNCTION public.api_setting_int(p_key TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           WHEN jsonb_typeof(value) = 'number'
            AND (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric)
            AND (value #>> '{}')::numeric BETWEEN 1 AND 1000000
           THEN (value #>> '{}')::integer
         END
    FROM public.platform_settings
   WHERE key = p_key;
$$;
REVOKE ALL ON FUNCTION public.api_setting_int(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_setting_int(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_api_setting(p_key TEXT, p_value JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.platform_settings;
  v_num NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_key IS NULL OR p_key NOT IN ('api.max_requests_per_minute', 'api.max_key_lifetime_days', 'api.webhook_max_attempts',
                                    'api.webhook_retry_base_seconds', 'api.webhook_disable_after_failures') THEN
    RAISE EXCEPTION 'Setting % is not an API setting', p_key USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'A value is required (use JSON null to unset the setting)' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_value) <> 'null' THEN
    IF jsonb_typeof(p_value) <> 'number' THEN
      RAISE EXCEPTION 'The value must be a whole number' USING ERRCODE = '22023';
    END IF;
    v_num := (p_value #>> '{}')::numeric;
    IF v_num <> trunc(v_num) OR v_num < 1 OR v_num > 1000000 THEN
      RAISE EXCEPTION 'The value must be a whole number between 1 and 1000000' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.platform_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.platform_settings (key, value, description, requires_owner_approval)
    VALUES (p_key, 'null'::jsonb, 'API setting', TRUE);
  END IF;

  PERFORM set_config('primora.audit_reason', trim(p_reason), true);
  UPDATE public.platform_settings
     SET value = p_value, approved_by = auth.uid(), approved_at = now(), updated_at = now()
   WHERE key = p_key
   RETURNING * INTO v_row;
  PERFORM set_config('primora.audit_reason', '', true);

  RETURN jsonb_build_object('key', v_row.key, 'value', v_row.value);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_api_setting(TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_api_setting(TEXT, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Scopes: one enumerated list, shared by the table constraint and the commands
-- ---------------------------------------------------------------------------
-- webhooks:manage is deliberately not a key scope in v1: webhooks are managed in the console only.
-- Customer contact details are not a scope at all; they would need their own consent design first.
CREATE OR REPLACE FUNCTION public.api_allowed_scopes()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['services:read', 'employees:read', 'availability:read', 'bookings:read']::TEXT[];
$$;
REVOKE ALL ON FUNCTION public.api_allowed_scopes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_allowed_scopes() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 80),
  key_prefix TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0 AND scopes <@ public.api_allowed_scopes()),
  requests_per_minute INTEGER NOT NULL CHECK (requests_per_minute >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.api_keys IS
  'Metadata of provider API keys. Holds no credential: the digest lives in api_key_hashes, which no client role can read.';
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON public.api_keys (provider_id, created_at DESC);
-- A double submit of the create form must not mint two keys (the first plaintext is gone for good).
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_active_name
  ON public.api_keys (provider_id, lower(btrim(name))) WHERE revoked_at IS NULL;

-- The digest is a separate table so that "no client can read a credential" is a property of a whole table with no
-- grant and no policy, not of a column privilege that a later blanket GRANT could undo. The column is called
-- token_hash so the audit trigger's secret rule redacts it should it ever be logged.
CREATE TABLE IF NOT EXISTS public.api_key_hashes (
  key_id UUID PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
COMMENT ON TABLE public.api_key_hashes IS
  'SHA-256 digests of API keys. Service role and SECURITY DEFINER commands only. A plaintext key can never match the CHECK.';

-- One row per key per clock minute. Old windows of a key are removed when its next window opens.
CREATE TABLE IF NOT EXISTS public.api_rate_counters (
  key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (key_id, window_start)
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_hashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.api_keys, public.api_key_hashes, public.api_rate_counters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys, public.api_key_hashes, public.api_rate_counters TO service_role;

DROP POLICY IF EXISTS "Owners and administrators read API keys" ON public.api_keys;
CREATE POLICY "Owners and administrators read API keys" ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.providers p WHERE p.id = api_keys.provider_id AND p.owner_id = auth.uid()
  ));
-- api_key_hashes and api_rate_counters: RLS on, no policy, no client grant. Only the service role and the
-- SECURITY DEFINER commands below reach them.

-- ---------------------------------------------------------------------------
-- 4. Commands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_api_key(
  p_provider_id UUID,
  p_branch_id UUID,
  p_name TEXT,
  p_scopes TEXT[],
  p_expires_at TIMESTAMPTZ,
  p_requests_per_minute INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ceiling INTEGER;
  v_lifetime_days INTEGER;
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_scopes TEXT[];
  v_key TEXT;
  v_id UUID := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  -- Only the provider's owner creates keys. Anyone else is told the provider does not exist.
  IF p_provider_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;

  IF char_length(v_name) < 3 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'The key needs a name of 3 to 80 characters' USING ERRCODE = '22023';
  END IF;
  IF p_scopes IS NULL OR cardinality(p_scopes) = 0 OR EXISTS (SELECT 1 FROM unnest(p_scopes) s WHERE s IS NULL) THEN
    RAISE EXCEPTION 'Choose at least one scope' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT s ORDER BY s) INTO v_scopes FROM unnest(p_scopes) s;
  IF NOT (v_scopes <@ public.api_allowed_scopes()) THEN
    RAISE EXCEPTION 'Unknown scope requested' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'An expiry date in the future is required' USING ERRCODE = '22023';
  END IF;
  v_lifetime_days := public.api_setting_int('api.max_key_lifetime_days');
  IF v_lifetime_days IS NOT NULL AND p_expires_at > now() + make_interval(days => v_lifetime_days) THEN
    RAISE EXCEPTION 'A key can last at most % days', v_lifetime_days USING ERRCODE = '22023';
  END IF;

  v_ceiling := public.api_setting_int('api.max_requests_per_minute');
  IF v_ceiling IS NULL THEN
    RAISE EXCEPTION 'API keys are not available yet: the platform has not set api.max_requests_per_minute' USING ERRCODE = '55000';
  END IF;
  IF p_requests_per_minute IS NULL OR p_requests_per_minute < 1 THEN
    RAISE EXCEPTION 'The requests-per-minute limit must be at least 1' USING ERRCODE = '22023';
  END IF;
  IF p_requests_per_minute > v_ceiling THEN
    RAISE EXCEPTION 'The requests-per-minute limit cannot exceed %', v_ceiling USING ERRCODE = '22023';
  END IF;

  -- 256 bits from pgcrypto's CSPRNG (the extension lives in the extensions schema on Supabase).
  v_key := 'prm_live_' || encode(extensions.gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.api_keys (id, provider_id, branch_id, name, key_prefix, key_last4, scopes, requests_per_minute, expires_at, created_by)
    VALUES (v_id, p_provider_id, p_branch_id, v_name, left(v_key, 10), right(v_key, 4), v_scopes, p_requests_per_minute, p_expires_at, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'An active key with this name already exists' USING ERRCODE = '23505';
  END;
  INSERT INTO public.api_key_hashes (key_id, token_hash)
  VALUES (v_id, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'));

  -- The log row carries identifiers and limits only: no key, no digest, no prefix.
  PERFORM public.write_audit_log('api_key.created', 'api_keys', v_id,
    jsonb_build_object('provider_id', p_provider_id, 'branch_id', p_branch_id, 'scopes', to_jsonb(v_scopes),
                       'expires_at', p_expires_at, 'requests_per_minute', p_requests_per_minute));

  RETURN jsonb_build_object(
    'id', v_id, 'key', v_key, 'name', v_name, 'key_prefix', left(v_key, 10), 'key_last4', right(v_key, 4),
    'provider_id', p_provider_id, 'branch_id', p_branch_id, 'scopes', to_jsonb(v_scopes),
    'expires_at', p_expires_at, 'requests_per_minute', p_requests_per_minute);
END;
$$;
REVOKE ALL ON FUNCTION public.create_api_key(UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_api_key(UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, INTEGER) TO authenticated;

-- Revoking twice answers the same as revoking once and writes one audit row.
CREATE OR REPLACE FUNCTION public.revoke_api_key(p_key_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key public.api_keys;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT k.* INTO v_key
    FROM public.api_keys k
    JOIN public.providers p ON p.id = k.provider_id
   WHERE k.id = p_key_id AND p.owner_id = v_uid
   FOR UPDATE OF k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_key.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_key.id, 'revoked_at', v_key.revoked_at, 'already_revoked', TRUE);
  END IF;
  UPDATE public.api_keys SET revoked_at = now(), revoked_by = v_uid WHERE id = v_key.id RETURNING * INTO v_key;
  PERFORM public.write_audit_log('api_key.revoked', 'api_keys', v_key.id,
    jsonb_build_object('provider_id', v_key.provider_id, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('id', v_key.id, 'revoked_at', v_key.revoked_at, 'already_revoked', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_api_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(UUID, TEXT) TO authenticated;

-- The kill switch: an administrator can stop any key at once (incident response) but cannot create one, because a
-- key authenticates as the provider.
CREATE OR REPLACE FUNCTION public.admin_revoke_api_key(p_key_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key public.api_keys;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_key FROM public.api_keys WHERE id = p_key_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_key.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_key.id, 'revoked_at', v_key.revoked_at, 'already_revoked', TRUE);
  END IF;
  PERFORM set_config('primora.audit_reason', trim(p_reason), true);
  UPDATE public.api_keys SET revoked_at = now(), revoked_by = auth.uid() WHERE id = v_key.id RETURNING * INTO v_key;
  PERFORM set_config('primora.audit_reason', '', true);
  PERFORM public.write_audit_log('api_key.revoked', 'api_keys', v_key.id,
    jsonb_build_object('provider_id', v_key.provider_id, 'reason', trim(p_reason), 'by_administrator', TRUE));
  RETURN jsonb_build_object('id', v_key.id, 'revoked_at', v_key.revoked_at, 'already_revoked', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_revoke_api_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_api_key(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Authentication for the public API (service role only)
-- ---------------------------------------------------------------------------
-- Every refusal (malformed, unknown, revoked, expired, provider blocked) raises the same error so a caller cannot
-- tell which condition failed. A key whose rate limit is used up is not an authentication failure: the call
-- succeeds and says so, because the API needs the limit, remaining and reset values for its 429 response.
CREATE OR REPLACE FUNCTION public.authenticate_api_key(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key public.api_keys;
  v_window TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
  v_exceeded BOOLEAN := FALSE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_key IS NULL OR p_key !~ '^prm_live_[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid API key' USING ERRCODE = '28000';
  END IF;

  SELECT k.* INTO v_key
    FROM public.api_key_hashes h
    JOIN public.api_keys k ON k.id = h.key_id
    JOIN public.providers pr ON pr.id = k.provider_id
   WHERE h.token_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
     AND k.revoked_at IS NULL
     AND k.expires_at > now()
     AND pr.status NOT IN ('suspended', 'rejected');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid API key' USING ERRCODE = '28000';
  END IF;

  -- last_used_at moves at most once a minute so a busy key does not rewrite its row on every request.
  UPDATE public.api_keys SET last_used_at = now()
   WHERE id = v_key.id AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute');

  -- Fixed one-minute windows. A request over the limit does not raise the counter any further.
  INSERT INTO public.api_rate_counters AS c (key_id, window_start, request_count)
  VALUES (v_key.id, v_window, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE SET request_count = c.request_count + 1
    WHERE c.request_count < v_key.requests_per_minute
  RETURNING c.request_count INTO v_count;
  IF v_count IS NULL THEN
    v_exceeded := TRUE;
    v_count := v_key.requests_per_minute;
  ELSIF v_count = 1 THEN
    DELETE FROM public.api_rate_counters WHERE key_id = v_key.id AND window_start < v_window;
  END IF;

  RETURN jsonb_build_object(
    'key_id', v_key.id,
    'provider_id', v_key.provider_id,
    'branch_id', v_key.branch_id,
    'scopes', to_jsonb(v_key.scopes),
    'rate_limit', jsonb_build_object(
      'limit', v_key.requests_per_minute,
      'remaining', greatest(v_key.requests_per_minute - v_count, 0),
      'reset_at', extract(epoch FROM v_window + interval '1 minute')::bigint,
      'exceeded', v_exceeded));
END;
$$;
REVOKE ALL ON FUNCTION public.authenticate_api_key(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_api_key(TEXT) TO service_role;

-- Scope check for the data functions of the read API: the Edge Function enforces scopes too, this is the second wall.
CREATE OR REPLACE FUNCTION public.api_require_scope(p_scopes TEXT[], p_scope TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_scopes IS NULL OR p_scope IS NULL OR NOT (p_scope = ANY (p_scopes)) THEN
    RAISE EXCEPTION 'This key does not have the % scope', p_scope USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.api_require_scope(TEXT[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_require_scope(TEXT[], TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Retire the plaintext-era tables
-- ---------------------------------------------------------------------------
-- BEGIN legacy-token-retirement
ALTER TABLE public.api_tokens ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE public.api_tokens DROP CONSTRAINT IF EXISTS api_tokens_retired_no_credentials;
UPDATE public.api_tokens SET token_hash = NULL, status = 'revoked' WHERE token_hash IS NOT NULL OR status <> 'revoked';
ALTER TABLE public.api_tokens ADD CONSTRAINT api_tokens_retired_no_credentials CHECK (token_hash IS NULL);
-- END legacy-token-retirement
COMMENT ON TABLE public.api_tokens IS
  'RETIRED by 20261006090000_api_keys.sql. Rows are kept as history only: revoked, with no credential. Use api_keys.';
DROP INDEX IF EXISTS public.idx_api_tokens_hash;
DROP POLICY IF EXISTS "Developers manage own API tokens" ON public.api_tokens;
REVOKE ALL ON public.api_tokens FROM PUBLIC, anon, authenticated;

-- Developer profiles stay as data, but a developer can no longer write their own approval.
DROP POLICY IF EXISTS "Developers manage own profile" ON public.developer_profiles;
DROP POLICY IF EXISTS "Developers read own profile" ON public.developer_profiles;
CREATE POLICY "Developers read own profile" ON public.developer_profiles
  FOR SELECT TO authenticated USING (developer_id = auth.uid());
REVOKE ALL ON public.developer_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.developer_profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Administrator audit trigger on every new table
-- ---------------------------------------------------------------------------
SELECT public.attach_admin_audit_trigger('public.api_keys');
SELECT public.attach_admin_audit_trigger('public.api_key_hashes');
SELECT public.attach_admin_audit_trigger('public.api_rate_counters');
