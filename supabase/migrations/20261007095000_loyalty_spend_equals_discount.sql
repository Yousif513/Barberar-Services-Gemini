-- FIX-BOOKING item 7d (D12 / C-D12): the loyalty points a booking spends are the points that pay for its discount.
--
-- Defect (reviewer probe): 1,000 points (worth 500 SAR at sar_per_point 0.5) redeemed on an 85.00 service gave a discount of 85.00 and set the balance to 0.
-- booking_create_internal capped the discount to what is still payable but deducted the REQUESTED points, so 830 points were burned for nothing.
--
-- Fix: after the cap, v_loyalty_points := LEAST(requested, CEIL(discount / sar_per_point)); the balance deduction, the ledger row, bookings.loyalty_points_redeemed
-- and the release on cancellation all use that number. A programme without a positive sar_per_point cannot be redeemed (it used to give a 0.00 discount for
-- real points).

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
    E'    IF NOT COALESCE((v_loyalty->>''enabled'')::boolean, FALSE) THEN',
    E'    v_loyalty_discount := LEAST(\n      ROUND(v_loyalty_points * COALESCE((v_loyalty->>''sar_per_point'')::numeric, 0), 2),\n      v_subtotal - v_package_discount - v_coupon_discount\n    );\n'
  ],
  ARRAY[
    E'    IF COALESCE((v_loyalty->>''sar_per_point'')::numeric, 0) <= 0 THEN\n      RAISE EXCEPTION ''Loyalty redemption is not available'' USING ERRCODE = ''22023'';\n    END IF;\n    IF NOT COALESCE((v_loyalty->>''enabled'')::boolean, FALSE) THEN',
    E'    v_loyalty_discount := LEAST(\n      ROUND(v_loyalty_points * (v_loyalty->>''sar_per_point'')::numeric, 2),\n      GREATEST(v_subtotal - v_package_discount - v_coupon_discount, 0)\n    );\n    -- Only the points that pay for the discount are spent (the discount is capped at what is still payable).\n    v_loyalty_points := LEAST(v_loyalty_points, CEIL(v_loyalty_discount / (v_loyalty->>''sar_per_point'')::numeric)::int);\n'
  ]);

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text[], text[]);
