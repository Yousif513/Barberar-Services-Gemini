-- FIX-PROV R9: a provider's promo code can be redeemed.
--
-- The promotions screen wrote `provider_promos`, which nothing reads; checkout (create_booking -> booking_create_internal and
-- validate_and_apply_coupon) reads `promotional_codes`, scoped by provider_id and funded by `funding_source`. So a code published
-- from the portal answered "not valid for this booking" at checkout. These three commands give the owner one audited way to write
-- and read their own codes in the table checkout uses:
--
--   create_provider_promo_code(...)         the owner of the business, provider-funded, "all customers" (checkout has no segment rule;
--                                           booking_create_internal is untouched, so no "new clients only" or "VIP only" code is offered)
--   list_provider_promo_codes(provider)     the owner's codes with their redemption counts (clients cannot read the table)
--   set_provider_promo_code_active(code, on) switch one of their codes off or on again
--
-- `provider_promos` is left in place and unread: whether to drop it or migrate its rows into promotional_codes is the owner's decision.

CREATE OR REPLACE FUNCTION public.create_provider_promo_code(
  p_provider_id UUID,
  p_code TEXT,
  p_discount_type TEXT,
  p_discount_value NUMERIC,
  p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_max_redemptions INTEGER DEFAULT NULL,
  p_min_order_amount NUMERIC DEFAULT 0,
  p_max_discount_cap NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT := UPPER(BTRIM(COALESCE(p_code, '')));
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_code !~ '^[A-Z0-9_-]{4,20}$' THEN
    RAISE EXCEPTION 'A code is 4 to 20 letters, digits, dashes or underscores' USING ERRCODE = '22023';
  END IF;
  IF p_discount_type NOT IN ('percentage', 'flat') THEN
    RAISE EXCEPTION 'The discount is a percentage or a flat amount' USING ERRCODE = '22023';
  END IF;
  IF p_discount_value IS NULL OR p_discount_value <= 0
     OR (p_discount_type = 'percentage' AND p_discount_value > 100)
     OR (p_discount_type = 'flat' AND p_discount_value > 10000) THEN
    RAISE EXCEPTION 'The discount value is outside what a code can give' USING ERRCODE = '22023';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= now() THEN
    RAISE EXCEPTION 'The end date must be in the future' USING ERRCODE = '22023';
  END IF;
  IF p_max_redemptions IS NOT NULL AND (p_max_redemptions < 1 OR p_max_redemptions > 100000) THEN
    RAISE EXCEPTION 'The redemption limit must be at least 1' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_min_order_amount, 0) < 0 OR (p_max_discount_cap IS NOT NULL AND p_max_discount_cap <= 0) THEN
    RAISE EXCEPTION 'Minimum order and discount cap must be positive amounts' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM public.promotional_codes WHERE provider_id = p_provider_id AND is_active
        AND (ends_at IS NULL OR ends_at > now())) >= 50 THEN
    RAISE EXCEPTION 'At most 50 codes can be active at once; switch one off first' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.promotional_codes (code, discount_type, discount_value, max_redemptions, starts_at, ends_at, is_active,
                                          funding_source, provider_id, min_order_amount, max_discount_cap)
    VALUES (v_code, p_discount_type, ROUND(p_discount_value, 2), p_max_redemptions, now(), p_ends_at, TRUE,
            'provider', p_provider_id, ROUND(COALESCE(p_min_order_amount, 0), 2), ROUND(p_max_discount_cap, 2))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Codes are unique across the platform; the answer does not say who holds the code.
    RAISE EXCEPTION 'This code cannot be used. Choose another' USING ERRCODE = '23505';
  END;

  PERFORM public.write_audit_log('provider.promo_code_created', 'promotional_codes', v_id,
    jsonb_build_object('provider_id', p_provider_id, 'code', v_code, 'discount_type', p_discount_type,
                       'discount_value', ROUND(p_discount_value, 2), 'ends_at', p_ends_at, 'max_redemptions', p_max_redemptions));
  RETURN jsonb_build_object('success', TRUE, 'id', v_id, 'code', v_code);
END;
$$;
REVOKE ALL ON FUNCTION public.create_provider_promo_code(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, INTEGER, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_provider_promo_code(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, INTEGER, NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_provider_promo_codes(p_provider_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'code', c.code, 'discount_type', c.discount_type, 'discount_value', c.discount_value,
        'starts_at', c.starts_at, 'ends_at', c.ends_at, 'is_active', c.is_active, 'redeemed_count', c.redeemed_count,
        'max_redemptions', c.max_redemptions, 'min_order_amount', c.min_order_amount, 'max_discount_cap', c.max_discount_cap,
        'created_at', c.created_at) ORDER BY c.created_at DESC)
      FROM public.promotional_codes c
     WHERE c.provider_id = p_provider_id), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_provider_promo_codes(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_provider_promo_codes(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_provider_promo_code_active(p_code_id UUID, p_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code public.promotional_codes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_active IS NULL THEN
    RAISE EXCEPTION 'Say whether the code is on or off' USING ERRCODE = '22023';
  END IF;
  SELECT c.* INTO v_code
    FROM public.promotional_codes c
    JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = p_code_id AND p.owner_id = v_uid AND c.funding_source = 'provider'
   FOR UPDATE OF c;
  IF v_code.id IS NULL THEN
    RAISE EXCEPTION 'Code not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_code.is_active = p_active THEN
    RETURN jsonb_build_object('success', TRUE, 'changed', FALSE, 'is_active', v_code.is_active);
  END IF;
  UPDATE public.promotional_codes SET is_active = p_active, updated_at = now() WHERE id = p_code_id;
  PERFORM public.write_audit_log(CASE WHEN p_active THEN 'provider.promo_code_enabled' ELSE 'provider.promo_code_disabled' END,
    'promotional_codes', p_code_id, jsonb_build_object('provider_id', v_code.provider_id, 'code', v_code.code));
  RETURN jsonb_build_object('success', TRUE, 'changed', TRUE, 'is_active', p_active);
END;
$$;
REVOKE ALL ON FUNCTION public.set_provider_promo_code_active(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_promo_code_active(UUID, BOOLEAN) TO authenticated;
