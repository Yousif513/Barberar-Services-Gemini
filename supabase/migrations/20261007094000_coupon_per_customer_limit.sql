-- FIX-BOOKING item 7c (D5 / C-D5): coupons have a per-customer limit and an optional "first booking only" rule.
--
-- Defect: booking_create_internal checked only the global max_redemptions; coupon_redemptions is unique on (coupon_id, booking_id) only. Reproduced by the
-- reviewer: one customer used the same unlimited 50 percent platform code on two separate bookings (42.50 off each). A "first booking" or influencer code
-- could be reused on every visit and drain a capped budget.
--
-- Rules:
--   * promotional_codes.per_customer_limit (default 1 for every code, NULL = unlimited): the customer's NON-REVERSED coupon_redemptions of that code must be
--     below it. The count runs under the FOR UPDATE lock booking_create_internal already holds on the coupon row, so two simultaneous bookings cannot both
--     pass. A cancelled or expired booking reverses its redemption (booking_release_discounts) and frees the use.
--   * promotional_codes.first_booking_only (default false): refused when the customer already has a confirmed or completed booking (with the coupon's provider
--     when the code belongs to one provider, anywhere on the platform otherwise).
--   * DECISION FOR THE OWNER: the default of 1 applies to every existing code on this migration; set per_customer_limit to NULL (unlimited) or a higher
--     number on the codes that must stay reusable.

ALTER TABLE public.promotional_codes
  ADD COLUMN IF NOT EXISTS per_customer_limit INTEGER DEFAULT 1 CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  ADD COLUMN IF NOT EXISTS first_booking_only BOOLEAN NOT NULL DEFAULT FALSE;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text[], p_to text[]) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], E'\r\n', E'\n') IN v_def) = 0 THEN
      RAISE EXCEPTION 'patch_function: pattern % not found in %', i, p_sig;
    END IF;
    v_def := replace(v_def, replace(p_from[i], E'\r\n', E'\n'), p_to[i]);
  END LOOP;
  EXECUTE v_def;
END
$helper$;

SELECT pg_temp.patch_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid, uuid)'::regprocedure,
  ARRAY[
    E'    IF v_coupon.discount_type = ''percentage'' THEN'
  ],
  ARRAY[
    E'    IF v_coupon.per_customer_limit IS NOT NULL AND (\n      SELECT COUNT(*) FROM public.coupon_redemptions cr\n      WHERE cr.coupon_id = v_coupon.id AND cr.customer_id = p_customer_id AND cr.reversed_at IS NULL\n    ) >= v_coupon.per_customer_limit THEN\n      RAISE EXCEPTION ''You have already used this promo code'' USING ERRCODE = ''22023'';\n    END IF;\n    IF v_coupon.first_booking_only AND EXISTS (\n      SELECT 1 FROM public.bookings fb\n      JOIN public.branches fbr ON fbr.id = fb.branch_id\n      WHERE fb.customer_id = p_customer_id AND fb.status IN (''confirmed'', ''completed'')\n        AND (v_coupon.provider_id IS NULL OR fbr.provider_id = v_coupon.provider_id)\n    ) THEN\n      RAISE EXCEPTION ''This promo code is for a first booking only'' USING ERRCODE = ''22023'';\n    END IF;\n\n    IF v_coupon.discount_type = ''percentage'' THEN'
  ]);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
