-- FIX-BOOKING item 3 (D-02 / C-D8): the booking channel is derived on the server, never chosen by the caller.
--
-- Defect: create_booking / create_multi_service_booking passed the caller's `request_source` straight into bookings.source, and a provider-sourced
-- channel (link, qr, whatsapp, instagram, import) carries a 0% platform fee. Any customer could open /shop/<id>?source=link, or call the RPC
-- with request_source => 'import', and the marketplace fee (17.00 SAR in the reviewer's probe E4) became 0.00 with no client list behind it.
--
-- Fix:
--   * provider_share_tokens: per-provider, revocable attribution tokens. The owner (or an administrator) issues one per channel
--     (create_provider_share_token), the share kit puts it in the link / QR as `?ref=<token>`, and revoke_provider_share_token switches it off.
--   * booking_create_internal takes `p_source_token` (create_booking / create_multi_service_booking: `request_source_token`, default NULL) and asks
--     resolve_booking_source: a channel other than marketplace is granted only by a live token of THAT provider (the channel is the token's, whatever the
--     caller claims), or by `import` when the customer's verified phone / profile matches a client the provider imported with consent
--     (provider_client_contacts). Everything else, including a claimed walk_in, an unknown, revoked, expired or foreign token, is `marketplace`.
--   * bookings.source_token_id records which token produced a provider-sourced booking, so a provider cannot hide where free bookings came from.

CREATE TABLE IF NOT EXISTS public.provider_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('link', 'qr', 'whatsapp', 'instagram')),
  token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  label TEXT CHECK (label IS NULL OR char_length(label) <= 80),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_share_tokens_provider ON public.provider_share_tokens(provider_id, created_at DESC);

ALTER TABLE public.provider_share_tokens ENABLE ROW LEVEL SECURITY;
-- Reads: the owning provider and administrators. There is no write policy: tokens are issued and revoked only through the commands below.
DROP POLICY IF EXISTS "Owners and admins read share tokens" ON public.provider_share_tokens;
CREATE POLICY "Owners and admins read share tokens"
  ON public.provider_share_tokens FOR SELECT TO authenticated
  USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_share_tokens.provider_id AND p.owner_id = auth.uid()));

SELECT public.grant_data_api_access('public.provider_share_tokens');
SELECT public.attach_admin_audit_trigger('public.provider_share_tokens');

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source_token_id UUID REFERENCES public.provider_share_tokens(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Owner commands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_provider_share_token(
  p_provider_id UUID,
  p_source TEXT,
  p_label TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_source TEXT := LOWER(COALESCE(NULLIF(TRIM(p_source), ''), ''));
  v_label TEXT := NULLIF(TRIM(COALESCE(p_label, '')), '');
  v_row public.provider_share_tokens;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = v_user)) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_source NOT IN ('link', 'qr', 'whatsapp', 'instagram') THEN
    RAISE EXCEPTION 'The channel must be link, qr, whatsapp or instagram' USING ERRCODE = '22023';
  END IF;
  IF v_label IS NOT NULL AND char_length(v_label) > 80 THEN
    RAISE EXCEPTION 'The label can have at most 80 characters' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'The expiry must be in the future' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM public.provider_share_tokens t
      WHERE t.provider_id = p_provider_id AND t.revoked_at IS NULL) >= 50 THEN
    RAISE EXCEPTION 'At most 50 live share tokens per provider; revoke one first' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_share_tokens (provider_id, source, label, expires_at, created_by)
  VALUES (p_provider_id, v_source, v_label, p_expires_at, v_user)
  RETURNING * INTO v_row;

  PERFORM public.write_audit_log('provider.share_token_created', 'provider_share_tokens', v_row.id,
    jsonb_build_object('provider_id', p_provider_id, 'source', v_source, 'label', v_label, 'expires_at', p_expires_at));

  RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'provider_id', v_row.provider_id, 'source', v_row.source,
                            'token', v_row.token, 'label', v_row.label, 'expires_at', v_row.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_provider_share_token(p_token_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row public.provider_share_tokens;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_row FROM public.provider_share_tokens WHERE id = p_token_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT (public.is_admin()
     OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = v_row.provider_id AND p.owner_id = v_user)) THEN
    RAISE EXCEPTION 'Share token not found' USING ERRCODE = 'P0002';
  END IF;
  IF char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'already_revoked', TRUE, 'revoked_at', v_row.revoked_at);
  END IF;

  UPDATE public.provider_share_tokens
  SET revoked_at = now(), revoked_by = v_user, revoke_reason = TRIM(p_reason)
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  PERFORM public.write_audit_log('provider.share_token_revoked', 'provider_share_tokens', v_row.id,
    jsonb_build_object('provider_id', v_row.provider_id, 'source', v_row.source, 'reason', TRIM(p_reason)));

  RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'already_revoked', FALSE, 'revoked_at', v_row.revoked_at);
END;
$$;

-- ---------------------------------------------------------------------------
-- Source resolution (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_booking_source(
  p_provider_id UUID, p_customer_id UUID, p_claimed_source TEXT, p_token TEXT
)
RETURNS TABLE (source TEXT, token_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.provider_share_tokens;
BEGIN
  IF NULLIF(TRIM(COALESCE(p_token, '')), '') IS NOT NULL THEN
    SELECT * INTO v_token
    FROM public.provider_share_tokens t
    WHERE t.provider_id = p_provider_id AND t.token = TRIM(p_token)
      AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now());
    IF v_token.id IS NOT NULL THEN
      RETURN QUERY SELECT v_token.source, v_token.id;
      RETURN;
    END IF;
  END IF;

  -- A client the provider imported (with the client's consent recorded) is the provider's own client.
  IF LOWER(TRIM(COALESCE(p_claimed_source, ''))) = 'import' AND EXISTS (
    SELECT 1
    FROM public.provider_client_contacts c
    LEFT JOIN public.profiles pr ON pr.id = p_customer_id
    WHERE c.provider_id = p_provider_id
      AND (c.matched_profile_id = p_customer_id
           OR (COALESCE(pr.phone_verified, FALSE) AND pr.phone_number IS NOT NULL AND c.phone = pr.phone_number))
  ) THEN
    RETURN QUERY SELECT 'import'::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'marketplace'::text, NULL::uuid;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_provider_share_token(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_provider_share_token(uuid, text, text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_provider_share_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_provider_share_token(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_booking_source(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_booking_source(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- booking_create_internal / create_booking / create_multi_service_booking: derive the source from the token
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[])
RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_old), E'\r\n', E'\n');
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], E'\r\n', E'\n') IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], E'\r\n', E'\n'), p_to[i]);
  END LOOP;
  EXECUTE v_def;
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature;
  END IF;
  IF v_new <> p_old THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_new);
    FOR v_grantee IN
      SELECT DISTINCT r.rolname
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = p_old::oid AND a.privilege_type = 'EXECUTE'
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_new, v_grantee);
    END LOOP;
    EXECUTE format('DROP FUNCTION %s', p_old);
  END IF;
END
$helper$;

SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[])'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text)',
  ARRAY[
    E'p_prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])\n RETURNS bookings',
    E'  v_source TEXT;\n',
    E'  v_source := LOWER(COALESCE(NULLIF(TRIM(p_source), \'\'), \'marketplace\'));\n  IF v_source NOT IN (\'marketplace\', \'link\', \'qr\', \'whatsapp\', \'instagram\', \'import\') THEN\n    -- walk_in is created only by staff through create_walk_in_booking\n    v_source := \'marketplace\';\n  END IF;\n',
    E'  v_eligibility := public.check_customer_booking_eligibility(v_provider_id, p_customer_id);',
    E'      client_profile_id, source, is_first_visit\n    ) VALUES (',
    E'      p_client_profile_id, v_source, v_first_visit\n    )'
  ],
  ARRAY[
    E'p_prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], p_source_token text DEFAULT NULL::text)\n RETURNS bookings',
    E'  v_source TEXT;\n  v_source_token_id UUID;\n',
    E'  -- The channel is resolved below, once the provider is known (D-02): the caller can no longer pick a fee-free source.\n  v_source := \'marketplace\';\n',
    E'  SELECT rs.source, rs.token_id INTO v_source, v_source_token_id\n  FROM public.resolve_booking_source(v_provider_id, p_customer_id, p_source, p_source_token) rs;\n\n  v_eligibility := public.check_customer_booking_eligibility(v_provider_id, p_customer_id);',
    E'      client_profile_id, source, is_first_visit, source_token_id\n    ) VALUES (',
    E'      p_client_profile_id, v_source, v_first_visit, v_source_token_id\n    )'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[])'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text)',
  ARRAY[
    E'prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])\n RETURNS bookings',
    E'request_loyalty_points, prayer_window_starts, prayer_window_ends\n  );'
  ],
  ARRAY[
    E'prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], request_source_token text DEFAULT NULL::text)\n RETURNS bookings',
    E'request_loyalty_points, prayer_window_starts, prayer_window_ends, request_source_token\n  );'
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[])'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text)',
  ARRAY[
    E'prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[])\n RETURNS jsonb',
    E'request_loyalty_points, prayer_window_starts, prayer_window_ends\n  );'
  ],
  ARRAY[
    E'prayer_window_ends timestamp with time zone[] DEFAULT NULL::timestamp with time zone[], request_source_token text DEFAULT NULL::text)\n RETURNS jsonb',
    E'request_loyalty_points, prayer_window_starts, prayer_window_ends, request_source_token\n  );'
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
