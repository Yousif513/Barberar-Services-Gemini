-- M-06 of docs/reviews/2026-10-08-security-money.md.
--
-- The seeded yearly price of a plan (growth 239, elite 639) is a PER-MONTH rate for annual billing (239 = 299 x 0.8). The provider pricing screen
-- quoted it that way (12 x 239 = 2,868) but subscribe_provider_plan charged price_yearly_sar once (239) for a whole year. There is now one
-- server-side quote, quote_provider_plan(plan, interval): monthly = price_monthly_sar x 1, yearly = price_yearly_sar x 12. The charge
-- and the screen both read it, so they cannot disagree.
--
-- OWNER DECISION (recorded in the report): this reads price_yearly_sar as a per-month rate. If the intended annual price is the stored number
-- itself, change the single multiplier below (months := 1 for yearly) and the screen follows. No VAT is added by the quote (VAT on platform
-- fees is the owner/legal item M-11).

CREATE OR REPLACE FUNCTION public.quote_provider_plan(p_plan_id VARCHAR, p_billing_interval VARCHAR DEFAULT 'monthly')
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE
  v_plan public.subscription_plans;
  v_months INTEGER;
  v_rate NUMERIC(10,2);
BEGIN
  IF p_billing_interval IS NULL OR p_billing_interval NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Billing interval must be monthly or yearly' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND COALESCE(is_active, TRUE);
  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'P0002';
  END IF;
  v_months := CASE WHEN p_billing_interval = 'yearly' THEN 12 ELSE 1 END;
  v_rate := CASE WHEN p_billing_interval = 'yearly' THEN v_plan.price_yearly_sar ELSE v_plan.price_monthly_sar END;
  RETURN jsonb_build_object('plan_id', v_plan.id, 'billing_interval', p_billing_interval, 'months', v_months,
                            'monthly_rate_sar', v_rate, 'total_sar', ROUND(v_rate * v_months, 2), 'currency', 'SAR');
END $fn$;
REVOKE ALL ON FUNCTION public.quote_provider_plan(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_provider_plan(VARCHAR, VARCHAR) TO authenticated, service_role;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.subscribe_provider_plan(uuid, character varying, character varying)'::regprocedure,
$from$  v_amount := CASE WHEN p_billing_interval = 'yearly' THEN v_plan.price_yearly_sar ELSE v_plan.price_monthly_sar END;$from$,
$to$  v_amount := (public.quote_provider_plan(v_plan.id, p_billing_interval) ->> 'total_sar')::NUMERIC;$to$);
