-- SECFIX-2 lows (docs/reviews/2026-10-11-security-round2.md):
--   R2-L1 reconcile-psp ran step-up-protected reconciliation RPCs through the service key: a stale console session ran them
--         and ran_by/actor stayed NULL. The console caller now opens the run in their own session (admin_begin_reconciliation_run:
--         step-up, money.ledger, recorded), and the service RPC runs it only for that recorded request, under the caller's id.
--   R2-L3 rewards (disabled until rewards-counsel-and-tax-before-enablement clears): the referral and loyalty caps are decided
--         under a lock per programme; loyalty points from a booking are taken back in proportion when the booking is refunded;
--         a customer with any non-cancelled booking is not a new customer for a referral code. (Tap chargebacks have no data
--         source in PRIMORA yet: gap tap-chargebacks-not-ingested.)
--   R2-L7 the sponsored price per new client changes only with a step-up and a different owner's approval
--         ('sponsored_price_change').

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L1
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_begin_reconciliation_run(p_business_day DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.ledger') THEN
    RAISE EXCEPTION 'Your console role cannot run reconciliation' USING ERRCODE = '42501';
  END IF;
  IF p_business_day IS NULL OR p_business_day >= (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'Reconcile a business day that has ended (before today in Riyadh)' USING ERRCODE = '22023';
  END IF;
  PERFORM public.write_audit_log('reconciliation.run_requested', 'tap_reconciliation_runs', NULL,
    jsonb_build_object('business_day', p_business_day) || public.request_client_info());
  RETURN jsonb_build_object('business_day', p_business_day, 'actor_id', auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.admin_begin_reconciliation_run(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_begin_reconciliation_run(DATE) TO authenticated;

-- The Edge Function (service role) runs the day for the administrator who opened it in the last 5 minutes. The three RPCs run
-- under that administrator's id, so ran_by and the audit actor name them (the step-up was checked when the run was opened).
CREATE OR REPLACE FUNCTION public.service_reconcile_day_for_actor(p_actor UUID, p_date DATE, p_psp_captured NUMERIC, p_psp_refunded NUMERIC,
                                                                  p_psp_count INTEGER, p_events JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals JSONB;
  v_itemised JSONB;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.admin_role_permissions rp ON rp.admin_role = a.admin_role
                  WHERE a.user_id = p_actor AND rp.permission = 'money.ledger') THEN
    RAISE EXCEPTION 'The requesting administrator cannot run reconciliation' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_audit_logs
                  WHERE action = 'reconciliation.run_requested' AND actor_id = p_actor AND details->>'business_day' = p_date::text
                    AND created_at > now() - INTERVAL '5 minutes') THEN
    RAISE EXCEPTION 'No reconciliation run was opened by this administrator for % in the last 5 minutes', p_date USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', p_actor)::text, true);
  v_totals := to_jsonb(public.run_daily_psp_reconciliation(p_date, p_psp_captured, p_psp_refunded, p_psp_count));
  PERFORM public.record_tap_reconciliation_import(p_date, p_events);
  v_itemised := public.run_tap_reconciliation(p_date);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  RETURN jsonb_build_object('totals', v_totals, 'itemised', v_itemised, 'actor_id', p_actor);
END;
$$;
REVOKE ALL ON FUNCTION public.service_reconcile_day_for_actor(UUID, DATE, NUMERIC, NUMERIC, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_reconcile_day_for_actor(UUID, DATE, NUMERIC, NUMERIC, INTEGER, JSONB) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L3
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.reward_vest_referral(uuid)'::regprocedure,
$from$  FOR v_role, v_party IN SELECT * FROM (VALUES ('referee', v_ref.referee_id), ('referrer', v_ref.referrer_id)) AS t(role, party) LOOP$from$,
$to$  -- Concurrent completions are decided one after the other, so the per-customer cap and the programme budget hold.
  PERFORM pg_advisory_xact_lock(hashtext('reward:referral'));
  FOR v_role, v_party IN SELECT * FROM (VALUES ('referee', v_ref.referee_id), ('referrer', v_ref.referrer_id)) AS t(role, party) LOOP$to$);

CREATE OR REPLACE FUNCTION public.reward_cap_loyalty_points(p_customer UUID, p_points INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value NUMERIC := (SELECT reward_value_sar FROM public.reward_programs WHERE program = 'loyalty');
BEGIN
  IF COALESCE(p_points, 0) <= 0 OR v_value IS NULL OR v_value <= 0 THEN
    RETURN 0;
  END IF;
  -- Held to the end of the transaction that awards the points: the cap and the budget are counted one award at a time.
  PERFORM pg_advisory_xact_lock(hashtext('reward:loyalty'));
  RETURN LEAST(p_points, FLOOR(public.reward_capacity_sar('loyalty', p_customer) / v_value)::int);
END;
$$;
REVOKE ALL ON FUNCTION public.reward_cap_loyalty_points(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.loyalty_points_ledger DROP CONSTRAINT IF EXISTS loyalty_points_ledger_event_type_check;
ALTER TABLE public.loyalty_points_ledger ADD CONSTRAINT loyalty_points_ledger_event_type_check CHECK (event_type IN
  ('booking_completed', 'manual_adjustment', 'redemption', 'tier_bonus', 'referral_bonus', 'expiry', 'refund_reversal'));

-- A refund that succeeded takes back the booking's points in proportion to the money returned (never below a zero balance;
-- points already spent stay spent, as with referral credits).
CREATE OR REPLACE FUNCTION public.reverse_loyalty_on_refund()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_captured NUMERIC;
  v_refunded NUMERIC;
  v_due INTEGER;
  v_taken INTEGER;
  v_take INTEGER;
BEGIN
  IF NOT (NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM 'succeeded') OR NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(SUM(tl.total_captured), 0) INTO v_captured FROM public.transactional_ledger tl
   WHERE tl.booking_id = NEW.booking_id AND tl.entry_type = 'booking_payment';
  SELECT COALESCE(SUM(rr.amount), 0) INTO v_refunded FROM public.refund_requests rr WHERE rr.booking_id = NEW.booking_id AND rr.status = 'succeeded';
  IF v_captured <= 0 THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT l.loyalty_id, SUM(l.points_change) FILTER (WHERE l.event_type = 'booking_completed' AND l.points_change > 0) AS earned,
           -COALESCE(SUM(l.points_change) FILTER (WHERE l.event_type = 'refund_reversal'), 0) AS reversed
      FROM public.loyalty_points_ledger l
     WHERE l.booking_id = NEW.booking_id
     GROUP BY l.loyalty_id
  LOOP
    CONTINUE WHEN COALESCE(r.earned, 0) <= 0;
    v_due := CEIL(r.earned * LEAST(v_refunded / v_captured, 1))::int;
    v_taken := COALESCE(r.reversed, 0);
    PERFORM 1 FROM public.customer_loyalty WHERE id = r.loyalty_id FOR UPDATE;
    v_take := LEAST(GREATEST(v_due - v_taken, 0), (SELECT points_balance FROM public.customer_loyalty WHERE id = r.loyalty_id));
    IF v_take > 0 THEN
      UPDATE public.customer_loyalty SET points_balance = points_balance - v_take, updated_at = now() WHERE id = r.loyalty_id;
      INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description)
      VALUES (r.loyalty_id, NEW.booking_id, -v_take, 'refund_reversal', format('%s points taken back after a refund', v_take));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_loyalty_on_refund() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reverse_loyalty_on_refund ON public.refund_requests;
CREATE TRIGGER trg_reverse_loyalty_on_refund AFTER UPDATE OF status ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.reverse_loyalty_on_refund();

SELECT pg_temp.patch_function('public.apply_referral_code(text)'::regprocedure,
$from$  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = v_user_id AND status IN ('confirmed', 'completed')) THEN$from$,
$to$  -- Any booking that was not cancelled (awaiting payment, confirmed, completed or a no-show) makes the customer not new.
  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = v_user_id AND status <> 'cancelled') THEN$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L7
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change'));

CREATE OR REPLACE FUNCTION public.governance_approver_permission(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'payout_release' THEN 'money.payout'
    WHEN 'refund' THEN 'money.refund'
    WHEN 'booking_cancellation' THEN 'money.refund'
    WHEN 'iban_change' THEN 'iban.approve'
    WHEN 'setting_change' THEN 'money.config'
    WHEN 'ledger_settlement' THEN 'money.payout'
    WHEN 'ledger_adjustment' THEN 'money.ledger'
    WHEN 'reconciliation_import' THEN 'money.ledger'
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'
    WHEN 'role_change' THEN 'roles.manage'
    WHEN 'sponsored_price_change' THEN 'settings.manage'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'booking_cancellation', 'reconciliation_import') THEN$from$,
$to$                       'booking_cancellation', 'reconciliation_import', 'sponsored_price_change') THEN$to$);

SELECT pg_temp.patch_function('public.admin_update_platform_setting(text,jsonb,text)'::regprocedure,
$from$        RAISE EXCEPTION 'The sponsored price must be above 0 SAR with at most two decimals' USING ERRCODE = '22023';
      END IF;
    END IF;$from$,
$to$        RAISE EXCEPTION 'The sponsored price must be above 0 SAR with at most two decimals' USING ERRCODE = '22023';
      END IF;
    END IF;
    -- SECFIX-2 R2-L7: what businesses pay per new client changes only with a step-up and a different owner's approval.
    IF NOT public.governance_execution_active('sponsored_price_change', md5('platform_setting:sponsored.price_per_new_client_sar')::uuid) THEN
      PERFORM public.require_recent_mfa();
      RETURN public.governance_request('sponsored_price_change', 'platform_settings', md5('platform_setting:sponsored.price_per_new_client_sar')::uuid,
        CASE WHEN jsonb_typeof(p_value) = 'number' THEN (p_value #>> '{}')::numeric END,
        jsonb_build_object('key', p_key, 'value', p_value, 'reason', btrim(p_reason), 'value_before', v_row.value),
        btrim(p_reason),
        jsonb_build_object('key', p_key, 'value', p_value, 'value_before', v_row.value));
    END IF;$to$);

CREATE OR REPLACE FUNCTION public.gov_exec_sponsored_price_change(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.governance_execution_active('sponsored_price_change', p_req.target_id) THEN
    RAISE EXCEPTION 'The sponsored price changes only as an approved request' USING ERRCODE = '42501';
  END IF;
  RETURN to_jsonb(public.admin_update_platform_setting(p_req.payload->>'key', p_req.payload->'value', p_req.payload->>'reason'));
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_sponsored_price_change(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;
