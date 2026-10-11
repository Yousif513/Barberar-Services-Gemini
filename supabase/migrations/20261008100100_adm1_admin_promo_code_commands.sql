-- ADM1 / item 4 (C-D26): the admin coupon screen wrote promotional_codes straight from the browser, with no reason and no bounds.
-- Two reasoned, audited commands replace those writes, and administrators lose the table-level write privilege:
--   admin_save_promo_code(...)        create or fully replace one code (reason required, bounded values, per-customer limit, first-booking rule)
--   admin_set_promo_code_active(...)  switch a code off or on (reason required)
-- Reading stays a plain query (administrators only, see 20261007010600). Checkout is untouched: it reads the same columns.

CREATE OR REPLACE FUNCTION public.admin_save_promo_code(
  p_code TEXT,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_reason TEXT,
  p_id UUID DEFAULT NULL,
  p_max_redemptions INTEGER DEFAULT NULL,
  p_funding_source TEXT DEFAULT 'platform',
  p_min_order_amount NUMERIC DEFAULT 0,
  p_max_discount_cap NUMERIC DEFAULT NULL,
  p_per_customer_limit INTEGER DEFAULT 1,
  p_first_booking_only BOOLEAN DEFAULT FALSE,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
  v_row public.promotional_codes;
  v_id UUID;
  v_new BOOLEAN := p_id IS NULL;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF v_code !~ '^[A-Z0-9_-]{4,20}$' THEN
    RAISE EXCEPTION 'A code is 4 to 20 letters, digits, dashes or underscores' USING ERRCODE = '22023';
  END IF;
  IF p_discount_type IS NULL OR p_discount_type NOT IN ('percentage', 'flat') THEN
    RAISE EXCEPTION 'The discount is a percentage or a flat amount' USING ERRCODE = '22023';
  END IF;
  IF p_discount_value IS NULL OR p_discount_value <= 0
     OR (p_discount_type = 'percentage' AND p_discount_value > 100)
     OR (p_discount_type = 'flat' AND p_discount_value > 10000) THEN
    RAISE EXCEPTION 'The discount value is outside what a code can give (a percentage up to 100, a flat amount up to 10000 SAR)' USING ERRCODE = '22023';
  END IF;
  IF p_funding_source IS NULL OR p_funding_source NOT IN ('platform', 'provider') THEN
    RAISE EXCEPTION 'The funding source is the platform or the provider' USING ERRCODE = '22023';
  END IF;
  IF p_max_redemptions IS NOT NULL AND (p_max_redemptions < 1 OR p_max_redemptions > 1000000) THEN
    RAISE EXCEPTION 'The redemption limit is between 1 and 1000000' USING ERRCODE = '22023';
  END IF;
  IF p_per_customer_limit IS NOT NULL AND (p_per_customer_limit < 1 OR p_per_customer_limit > 1000) THEN
    RAISE EXCEPTION 'The per-customer limit is between 1 and 1000, or empty for unlimited' USING ERRCODE = '22023';
  END IF;
  IF p_min_order_amount IS NULL OR p_min_order_amount < 0 OR p_min_order_amount > 100000 THEN
    RAISE EXCEPTION 'The minimum order is between 0 and 100000 SAR' USING ERRCODE = '22023';
  END IF;
  IF p_max_discount_cap IS NOT NULL AND (p_max_discount_cap <= 0 OR p_max_discount_cap > 10000) THEN
    RAISE EXCEPTION 'The discount cap is between 0 and 10000 SAR, or empty for none' USING ERRCODE = '22023';
  END IF;
  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'The code must end after it starts' USING ERRCODE = '22023';
  END IF;

  IF v_new THEN
    BEGIN
      INSERT INTO public.promotional_codes (code, discount_type, discount_value, max_redemptions, funding_source, min_order_amount,
                                            max_discount_cap, per_customer_limit, first_booking_only, is_active, starts_at, ends_at)
      VALUES (v_code, p_discount_type, round(p_discount_value, 2), p_max_redemptions, p_funding_source, round(p_min_order_amount, 2),
              round(p_max_discount_cap, 2), p_per_customer_limit, COALESCE(p_first_booking_only, FALSE), COALESCE(p_is_active, TRUE), p_starts_at, p_ends_at)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'A code with this name already exists' USING ERRCODE = '23505';
    END;
  ELSE
    SELECT * INTO v_row FROM public.promotional_codes WHERE id = p_id FOR UPDATE;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Promotion code not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_code <> v_row.code AND v_row.redeemed_count > 0 THEN
      RAISE EXCEPTION 'A code that customers have already used keeps its name; switch it off and create a new one' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider_id IS NOT NULL AND p_funding_source <> v_row.funding_source THEN
      RAISE EXCEPTION 'A code owned by a provider keeps the funding it was created with' USING ERRCODE = '22023';
    END IF;
    IF p_max_redemptions IS NOT NULL AND p_max_redemptions < v_row.redeemed_count THEN
      RAISE EXCEPTION 'The redemption limit cannot be lower than the % redemptions already used', v_row.redeemed_count USING ERRCODE = '22023';
    END IF;
    BEGIN
      UPDATE public.promotional_codes
      SET code = v_code, discount_type = p_discount_type, discount_value = round(p_discount_value, 2), max_redemptions = p_max_redemptions,
          funding_source = p_funding_source, min_order_amount = round(p_min_order_amount, 2), max_discount_cap = round(p_max_discount_cap, 2),
          per_customer_limit = p_per_customer_limit, first_booking_only = COALESCE(p_first_booking_only, FALSE),
          is_active = COALESCE(p_is_active, TRUE), starts_at = p_starts_at, ends_at = p_ends_at, updated_at = now()
      WHERE id = p_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'A code with this name already exists' USING ERRCODE = '23505';
    END;
    v_id := p_id;
  END IF;

  PERFORM public.write_audit_log(CASE WHEN v_new THEN 'promo_code.created' ELSE 'promo_code.updated' END, 'promotional_codes', v_id,
    jsonb_build_object('code', v_code, 'discount_type', p_discount_type, 'discount_value', p_discount_value,
                       'max_redemptions', p_max_redemptions, 'per_customer_limit', p_per_customer_limit,
                       'first_booking_only', COALESCE(p_first_booking_only, FALSE), 'funding_source', p_funding_source,
                       'is_active', COALESCE(p_is_active, TRUE), 'reason', v_reason));
  RETURN jsonb_build_object('success', TRUE, 'id', v_id, 'code', v_code, 'created', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_promo_code_active(p_id UUID, p_active BOOLEAN, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row public.promotional_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Say whether the code is on or off' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.promotional_codes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Promotion code not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.is_active = p_active THEN
    RETURN jsonb_build_object('success', TRUE, 'id', v_row.id, 'is_active', p_active, 'changed', FALSE);
  END IF;
  UPDATE public.promotional_codes SET is_active = p_active, updated_at = now() WHERE id = p_id;
  PERFORM public.write_audit_log(CASE WHEN p_active THEN 'promo_code.activated' ELSE 'promo_code.deactivated' END, 'promotional_codes', p_id,
    jsonb_build_object('code', v_row.code, 'reason', v_reason));
  RETURN jsonb_build_object('success', TRUE, 'id', p_id, 'is_active', p_active, 'changed', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_promo_code(TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, TEXT, NUMERIC, NUMERIC, INTEGER, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ),
                       public.admin_set_promo_code_active(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_promo_code(TEXT, TEXT, NUMERIC, TEXT, UUID, INTEGER, TEXT, NUMERIC, NUMERIC, INTEGER, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ),
                          public.admin_set_promo_code_active(UUID, BOOLEAN, TEXT) TO authenticated;

-- No client writes the table any more: only these commands (and the provider commands, which are SECURITY DEFINER) do.
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'public.promotional_codes'::regclass AND polcmd IN ('a', 'w', 'd', '*') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.promotional_codes', r.polname);
  END LOOP;
END
$do$;
REVOKE INSERT, UPDATE, DELETE ON public.promotional_codes FROM anon, authenticated;
