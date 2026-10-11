-- ADM1 / item 5: role management, feature flags and platform fee rules.
--
--   admin_role_directory(...)      administrators and staff with their roles, searched and paged on the server; the read is audited.
--                                  (Changing a role stays the existing set_user_role command: reason, never your own, never the last administrator.)
--   admin_set_feature_flag(...)    switch one existing flag on or off, with a reason.
--   admin_save_fee_rule(...)       change one existing marketplace fee rule, or add the missing one, with a reason and bounds.
--
-- Both tables were written straight from the console by the "manageable by admins" FOR ALL policies. Those policies and the write
-- privileges are replaced by read-only administrator access, so the commands are the only way to change them.
--
-- What the commission engine really does (calculate_platform_commission, 20261003220000) decides the bounds below:
--   * link / qr / whatsapp / instagram / walk_in / import are ALWAYS 0 in the engine, whatever their row says, so those rows are not editable;
--   * a marketplace booking with no active matching rule is charged a built-in 15 percent, so a marketplace rule cannot be switched off;
--     it is set to 0 instead;
--   * the percentage ceiling of 50 is a safeguard, not a business rate (the table allows 100); the rate itself is the owner's decision.

CREATE OR REPLACE FUNCTION public.admin_role_directory(
  p_role TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_role TEXT := NULLIF(btrim(COALESCE(p_role, '')), '');
  v_search TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_pattern TEXT;
  v_id UUID;
  v_matching BIGINT;
  v_counts JSONB;
  v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_role IS NOT NULL AND v_role NOT IN ('admin', 'provider_owner', 'provider_employee', 'customer') THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
  -- Customers are many and are personal data: they are listed only when the operator searches for one to promote.
  IF v_role = 'customer' AND (v_search IS NULL OR char_length(v_search) < 3) THEN
    RAISE EXCEPTION 'Search by at least 3 characters to find a customer' USING ERRCODE = '22023';
  END IF;

  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_id := v_search::uuid;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_object_agg(role::text, n), '{}'::jsonb) INTO v_counts
    FROM (SELECT role, COUNT(*) AS n FROM public.profiles GROUP BY role) c;

  SELECT COUNT(*) INTO v_matching
    FROM public.profiles p
   WHERE (CASE WHEN v_role IS NULL THEN p.role <> 'customer' ELSE p.role::text = v_role END)
     AND (v_pattern IS NULL
          OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
          OR COALESCE(p.email, '') ILIKE v_pattern
          OR COALESCE(p.phone_number, '') ILIKE v_pattern
          OR p.id = v_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.role_rank, r.created_at DESC, r.id), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT p.id, p.first_name, p.last_name, p.email, p.role::text AS role, p.created_at,
             CASE p.role WHEN 'admin' THEN 0 WHEN 'provider_owner' THEN 1 WHEN 'provider_employee' THEN 2 ELSE 3 END AS role_rank,
             (SELECT pr.business_name_en FROM public.providers pr WHERE pr.owner_id = p.id ORDER BY pr.created_at LIMIT 1) AS provider_name_en,
             (SELECT pr.business_name_ar FROM public.providers pr WHERE pr.owner_id = p.id ORDER BY pr.created_at LIMIT 1) AS provider_name_ar
        FROM public.profiles p
       WHERE (CASE WHEN v_role IS NULL THEN p.role <> 'customer' ELSE p.role::text = v_role END)
         AND (v_pattern IS NULL
              OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
              OR COALESCE(p.email, '') ILIKE v_pattern
              OR COALESCE(p.phone_number, '') ILIKE v_pattern
              OR p.id = v_id)
       ORDER BY CASE p.role WHEN 'admin' THEN 0 WHEN 'provider_owner' THEN 1 WHEN 'provider_employee' THEN 2 ELSE 3 END, p.created_at DESC, p.id
       LIMIT v_limit OFFSET v_offset
    ) r;

  -- The search text can be a person's name, email or phone, so only the fact that one was used is recorded.
  PERFORM public.write_audit_log('roles.directory_read', 'profiles', NULL,
    jsonb_build_object('role', v_role, 'searched', v_search IS NOT NULL, 'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_rows)));

  RETURN jsonb_build_object('counts', v_counts, 'matching', v_matching, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(p_flag_key TEXT, p_enabled BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_flag public.platform_feature_flags;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Say whether the flag is on or off' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_flag FROM public.platform_feature_flags WHERE flag_key = btrim(COALESCE(p_flag_key, '')) FOR UPDATE;
  IF v_flag.flag_key IS NULL THEN
    RAISE EXCEPTION 'Feature flag not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_flag.is_enabled = p_enabled THEN
    RETURN jsonb_build_object('success', TRUE, 'flag_key', v_flag.flag_key, 'is_enabled', p_enabled, 'changed', FALSE);
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.platform_feature_flags SET is_enabled = p_enabled, updated_at = now() WHERE flag_key = v_flag.flag_key;
  PERFORM public.write_audit_log('feature_flag.changed', 'platform_feature_flags', NULL,
    jsonb_build_object('flag_key', v_flag.flag_key, 'enabled_before', v_flag.is_enabled, 'enabled_after', p_enabled, 'reason', v_reason));
  RETURN jsonb_build_object('success', TRUE, 'flag_key', v_flag.flag_key, 'is_enabled', p_enabled, 'changed', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_fee_rule(
  p_channel TEXT,
  p_is_first_visit BOOLEAN,
  p_fee_percentage NUMERIC,
  p_min_fee_sar NUMERIC,
  p_max_fee_sar NUMERIC,
  p_is_active BOOLEAN,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL,
  p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_description TEXT := NULLIF(btrim(COALESCE(p_description, '')), '');
  v_before public.fee_rules;
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'walk_in', 'import') THEN
    RAISE EXCEPTION 'Unknown booking channel' USING ERRCODE = '22023';
  END IF;
  IF p_channel <> 'marketplace' THEN
    RAISE EXCEPTION 'Bookings that come through the own channels of a provider carry no platform fee; only marketplace rules can be changed' USING ERRCODE = '22023';
  END IF;
  IF p_fee_percentage IS NULL OR p_fee_percentage < 0 OR p_fee_percentage > 50 THEN
    RAISE EXCEPTION 'The fee percentage is between 0 and 50' USING ERRCODE = '22023';
  END IF;
  IF p_min_fee_sar IS NULL OR p_min_fee_sar < 0 OR p_min_fee_sar > 1000 THEN
    RAISE EXCEPTION 'The minimum fee is between 0 and 1000 SAR' USING ERRCODE = '22023';
  END IF;
  IF p_max_fee_sar IS NOT NULL AND (p_max_fee_sar < p_min_fee_sar OR p_max_fee_sar > 1000) THEN
    RAISE EXCEPTION 'The maximum fee is between the minimum and 1000 SAR, or empty for none' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A marketplace rule cannot be switched off: without one the platform charges a built-in 15 percent. Set the percentage to 0 instead' USING ERRCODE = '22023';
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 300 THEN
    RAISE EXCEPTION 'The description is at most 300 characters' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.fee_rules WHERE channel = p_channel AND is_first_visit IS NOT DISTINCT FROM p_is_first_visit) THEN
      RAISE EXCEPTION 'A rule for this channel and visit type already exists; edit it' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.fee_rules (channel, is_first_visit, fee_percentage, min_fee_sar, max_fee_sar, is_active, description)
    VALUES (p_channel, p_is_first_visit, round(p_fee_percentage, 2), round(p_min_fee_sar, 2), round(p_max_fee_sar, 2), TRUE, v_description)
    RETURNING id INTO v_id;
    PERFORM public.write_audit_log('fee_rule.created', 'fee_rules', v_id,
      jsonb_build_object('channel', p_channel, 'is_first_visit', p_is_first_visit, 'fee_percentage', p_fee_percentage,
                         'min_fee_sar', p_min_fee_sar, 'max_fee_sar', p_max_fee_sar, 'reason', v_reason));
  ELSE
    SELECT * INTO v_before FROM public.fee_rules WHERE id = p_id FOR UPDATE;
    IF v_before.id IS NULL THEN
      RAISE EXCEPTION 'Fee rule not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_before.channel <> p_channel OR v_before.is_first_visit IS DISTINCT FROM p_is_first_visit THEN
      RAISE EXCEPTION 'A rule keeps its channel and visit type' USING ERRCODE = '22023';
    END IF;
    IF v_before.channel <> 'marketplace' THEN
      RAISE EXCEPTION 'Only marketplace rules can be changed' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('primora.audit_reason', v_reason, true);
    UPDATE public.fee_rules
       SET fee_percentage = round(p_fee_percentage, 2), min_fee_sar = round(p_min_fee_sar, 2), max_fee_sar = round(p_max_fee_sar, 2),
           is_active = TRUE, description = COALESCE(v_description, description), updated_at = now()
     WHERE id = p_id;
    v_id := p_id;
    PERFORM public.write_audit_log('fee_rule.updated', 'fee_rules', v_id,
      jsonb_build_object('channel', p_channel, 'is_first_visit', p_is_first_visit,
                         'fee_percentage_before', v_before.fee_percentage, 'fee_percentage_after', p_fee_percentage,
                         'min_fee_before', v_before.min_fee_sar, 'min_fee_after', p_min_fee_sar,
                         'max_fee_before', v_before.max_fee_sar, 'max_fee_after', p_max_fee_sar, 'reason', v_reason));
  END IF;
  RETURN jsonb_build_object('success', TRUE, 'id', v_id, 'created', p_id IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_role_directory(TEXT, TEXT, INTEGER, INTEGER),
                       public.admin_set_feature_flag(TEXT, BOOLEAN, TEXT),
                       public.admin_save_fee_rule(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_role_directory(TEXT, TEXT, INTEGER, INTEGER),
                          public.admin_set_feature_flag(TEXT, BOOLEAN, TEXT),
                          public.admin_save_fee_rule(TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, UUID) TO authenticated;

-- Read-only administrator access: the old FOR ALL policies let the console write both tables directly.
DROP POLICY IF EXISTS "Fee rules manageable by admins" ON public.fee_rules;
DROP POLICY IF EXISTS "Administrators read fee rules" ON public.fee_rules;
CREATE POLICY "Administrators read fee rules" ON public.fee_rules FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Feature flags manageable by admins" ON public.platform_feature_flags;
REVOKE INSERT, UPDATE, DELETE ON public.fee_rules, public.platform_feature_flags FROM anon, authenticated;
