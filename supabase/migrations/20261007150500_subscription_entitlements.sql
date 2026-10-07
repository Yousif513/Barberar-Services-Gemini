-- Migration: 20261007150500_subscription_entitlements.sql
-- FIX-DBB / R20: subscriptions were one charge with no consequences.
--  * A paid period is kept until current_period_end: choosing a free plan while a paid period runs schedules the change for the end of the
--    period (next_plan_id) instead of replacing the paid plan at once.
--  * expire_provider_subscriptions() (scheduler, hourly where pg_cron exists) applies a scheduled change or marks the subscription expired.
--  * max_branches and max_employees are enforced when a branch or an active employee is added, using the limits on the plan row.
--    A limit that is NULL is UNSET = no limit; the columns lose their invented NOT NULL/DEFAULT values (1 and 3). A provider without a
--    subscription row has no plan and therefore no limit; an EXPIRED subscription falls back to the single free plan when exactly one
--    exists, otherwise no limit.
-- No price is touched: the seeded prices and limits (299 / 799 SAR and 1/3, 3/10, 10/50) were chosen by an agent, not the owner. They are
-- reported for the owner to confirm; this migration only makes the mechanism read whatever the plan rows say.
-- commission_discount_pct and included_monthly_sms are still not read by any function (reported, no behaviour invented).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_crlf text := chr(13) || chr(10);
  v_def text := replace(pg_get_functiondef(p_sig), v_crlf, chr(10));
  v_from text := replace(p_from, v_crlf, chr(10));
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, v_from, replace(p_to, v_crlf, chr(10)));
END $helper$;

ALTER TABLE public.subscription_plans ALTER COLUMN max_branches DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN max_branches DROP DEFAULT;
ALTER TABLE public.subscription_plans ALTER COLUMN max_employees DROP NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN max_employees DROP DEFAULT;
ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_limits_positive;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_limits_positive
  CHECK ((max_branches IS NULL OR max_branches >= 1) AND (max_employees IS NULL OR max_employees >= 1));

ALTER TABLE public.provider_subscriptions ADD COLUMN IF NOT EXISTS next_plan_id VARCHAR(50) REFERENCES public.subscription_plans(id);
ALTER TABLE public.provider_subscriptions ADD COLUMN IF NOT EXISTS next_billing_interval VARCHAR(20);

-- The limits that apply to a provider right now (NULL column = unset = no limit; no row = no plan = no limit).
CREATE OR REPLACE FUNCTION public.provider_plan_limits(p_provider_id UUID)
RETURNS TABLE (plan_id VARCHAR, max_branches INT, max_employees INT, source TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.provider_subscriptions; v_plan public.subscription_plans; v_free_count INT;
BEGIN
  SELECT * INTO v_sub FROM public.provider_subscriptions WHERE provider_id = p_provider_id;
  IF v_sub.id IS NULL THEN
    RETURN QUERY SELECT NULL::VARCHAR, NULL::INT, NULL::INT, 'no_subscription'::TEXT; RETURN;
  END IF;
  IF v_sub.status IN ('active', 'trialing', 'past_due') AND v_sub.current_period_end > now() THEN
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
    RETURN QUERY SELECT v_plan.id, v_plan.max_branches, v_plan.max_employees, 'current_plan'::TEXT; RETURN;
  END IF;
  SELECT count(*) INTO v_free_count FROM public.subscription_plans WHERE is_active AND price_monthly_sar = 0 AND price_yearly_sar = 0;
  IF v_free_count = 1 THEN
    SELECT * INTO v_plan FROM public.subscription_plans WHERE is_active AND price_monthly_sar = 0 AND price_yearly_sar = 0;
    RETURN QUERY SELECT v_plan.id, v_plan.max_branches, v_plan.max_employees, 'free_plan_after_expiry'::TEXT; RETURN;
  END IF;
  RETURN QUERY SELECT NULL::VARCHAR, NULL::INT, NULL::INT, 'expired_no_free_plan'::TEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.provider_plan_limits(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_plan_limits(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_subscription_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider UUID; v_limits RECORD; v_count INT;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'branches' THEN
    v_provider := NEW.provider_id;
    SELECT * INTO v_limits FROM public.provider_plan_limits(v_provider);
    IF v_limits.max_branches IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('plan-limit:' || v_provider::text, 0));
      SELECT count(*) INTO v_count FROM public.branches WHERE provider_id = v_provider;
      IF v_count >= v_limits.max_branches THEN
        RAISE EXCEPTION 'Plan limit reached: the plan allows % branch(es)', v_limits.max_branches USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF NOT COALESCE(NEW.is_active, TRUE) OR (TG_OP = 'UPDATE' AND COALESCE(OLD.is_active, TRUE)) THEN RETURN NEW; END IF;
    SELECT provider_id INTO v_provider FROM public.branches WHERE id = NEW.branch_id;
    IF v_provider IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_limits FROM public.provider_plan_limits(v_provider);
    IF v_limits.max_employees IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('plan-limit:' || v_provider::text, 0));
      SELECT count(*) INTO v_count FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
      WHERE b.provider_id = v_provider AND COALESCE(e.is_active, TRUE) AND e.id IS DISTINCT FROM NEW.id;
      IF v_count >= v_limits.max_employees THEN
        RAISE EXCEPTION 'Plan limit reached: the plan allows % active employee(s)', v_limits.max_employees USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_subscription_limits() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enforce_branch_plan_limit ON public.branches;
CREATE TRIGGER enforce_branch_plan_limit BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_limits();
DROP TRIGGER IF EXISTS enforce_employee_plan_limit ON public.employees;
CREATE TRIGGER enforce_employee_plan_limit BEFORE INSERT OR UPDATE OF is_active ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_limits();

-- Choosing a free plan while a paid period is running schedules the change for the end of that period.
SELECT pg_temp.patch_function('public.subscribe_provider_plan(uuid, character varying, character varying)'::regprocedure,
  $q$  -- Free plans need no payment and activate immediately.$q$,
  $q$  IF v_amount = 0 AND EXISTS (
    SELECT 1 FROM public.provider_subscriptions s JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.provider_id = p_provider_id AND s.status = 'active' AND s.current_period_end > now() AND s.plan_id <> v_plan.id
      AND (sp.price_monthly_sar > 0 OR sp.price_yearly_sar > 0)) THEN
    UPDATE public.provider_subscriptions
    SET next_plan_id = v_plan.id, next_billing_interval = p_billing_interval, cancel_at_period_end = TRUE
    WHERE provider_id = p_provider_id;
    PERFORM public.write_audit_log('subscription.downgrade_scheduled', 'providers', p_provider_id,
      jsonb_build_object('plan_id', v_plan.id));
    RETURN jsonb_build_object('success', TRUE, 'purchase_type', 'subscription', 'purchase_id', v_payment.id,
      'plan_id', v_plan.id, 'billing_interval', p_billing_interval, 'amount_sar', v_amount, 'status', 'scheduled',
      'effective_at', (SELECT current_period_end FROM public.provider_subscriptions WHERE provider_id = p_provider_id));
  END IF;

  -- Free plans need no payment and activate immediately.$q$);

CREATE OR REPLACE FUNCTION public.expire_provider_subscriptions()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub public.provider_subscriptions; v_switched INT := 0; v_expired INT := 0;
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only administrators or the scheduler can expire subscriptions' USING ERRCODE = '42501';
  END IF;
  FOR v_sub IN SELECT * FROM public.provider_subscriptions
    WHERE status IN ('active', 'trialing', 'past_due') AND current_period_end <= now() ORDER BY id FOR UPDATE
  LOOP
    IF v_sub.next_plan_id IS NOT NULL THEN
      UPDATE public.provider_subscriptions
      SET plan_id = next_plan_id, billing_interval = COALESCE(next_billing_interval, billing_interval), status = 'active',
          current_period_start = now(),
          current_period_end = now() + CASE WHEN COALESCE(next_billing_interval, billing_interval) = 'yearly' THEN interval '1 year' ELSE interval '1 month' END,
          next_plan_id = NULL, next_billing_interval = NULL, cancel_at_period_end = FALSE
      WHERE id = v_sub.id;
      PERFORM public.write_audit_log('subscription.plan_changed_at_period_end', 'providers', v_sub.provider_id,
        jsonb_build_object('from_plan', v_sub.plan_id, 'to_plan', v_sub.next_plan_id));
      v_switched := v_switched + 1;
    ELSE
      UPDATE public.provider_subscriptions SET status = 'expired' WHERE id = v_sub.id;
      PERFORM public.write_audit_log('subscription.expired', 'providers', v_sub.provider_id,
        jsonb_build_object('plan_id', v_sub.plan_id, 'period_end', v_sub.current_period_end));
      v_expired := v_expired + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('switched', v_switched, 'expired', v_expired);
END;
$$;
REVOKE ALL ON FUNCTION public.expire_provider_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_provider_subscriptions() TO authenticated, service_role;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'primora-expire-subscriptions';
    PERFORM cron.schedule('primora-expire-subscriptions', '5 * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.expire_provider_subscriptions(); $job$);
  ELSE
    RAISE NOTICE 'pg_cron not available: call public.expire_provider_subscriptions() hourly from an external scheduler.';
  END IF;
END
$outer$;

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
