-- Migration: 20261005080000_release_gap_controls.sql
-- Release-gap controls from the adminwright manifest (reassessed against current source on 2026-10-04):
--   * no-audit-trail: every admin write to the tables the console mutates is audited in the same
--     transaction, with changed fields only and sensitive values redacted;
--   * payout review was a direct browser UPDATE without a reason: now a server command;
--   * decorative settings: platform settings change only through a validated, audited command.

-- ---------------------------------------------------------------------------
-- 1. Database-level audit of admin writes
-- ---------------------------------------------------------------------------
-- Callers may attach a reason for the current transaction: set_config('primora.audit_reason', ..., true).
CREATE OR REPLACE FUNCTION public.audit_admin_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  v_new JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_sensitive TEXT[] := ARRAY['iban', 'api_key', 'phone_number', 'email', 'contact_phone', 'contact_email', 'national_id'];
  v_changes JSONB := '{}'::jsonb;
  v_key TEXT;
  v_target TEXT;
BEGIN
  -- Operator actions only: provider, customer and system writes are covered by their own commands.
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR NOT public.is_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_old || v_new) LOOP
    IF v_key IN ('updated_at') THEN CONTINUE; END IF;
    IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
      v_changes := v_changes || jsonb_build_object(v_key,
        CASE WHEN v_key = ANY (v_sensitive)
          THEN jsonb_build_object('changed', TRUE)
          ELSE jsonb_build_object('before', v_old -> v_key, 'after', v_new -> v_key) END);
    END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  v_target := COALESCE(v_new ->> 'id', v_old ->> 'id');
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    CASE WHEN v_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN v_target::uuid END,
    jsonb_build_object('changes', v_changes)
      || CASE WHEN v_new ? 'key' OR v_old ? 'key' THEN jsonb_build_object('key', COALESCE(v_new ->> 'key', v_old ->> 'key')) ELSE '{}'::jsonb END
      || CASE WHEN NULLIF(current_setting('primora.audit_reason', true), '') IS NOT NULL
           THEN jsonb_build_object('reason', current_setting('primora.audit_reason', true)) ELSE '{}'::jsonb END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.audit_admin_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['branches', 'data_subject_requests', 'integrations', 'packages', 'payment_methods',
    'payout_requests', 'profiles', 'promotional_codes', 'providers', 'services', 'platform_settings']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_admin_write ON public.%I', v_table);
    EXECUTE format('CREATE TRIGGER trg_audit_admin_write AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_admin_write()', v_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Payout request review (approve for processing / reject) as a server command
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_payout_request(
  p_payout_request_id UUID,
  p_decision TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.payout_requests;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('processing', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be processing or rejected' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_payout_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found' USING ERRCODE = 'P0002';
  END IF;
  -- A repeated identical decision is a safe retry.
  IF v_request.status = p_decision THEN
    RETURN jsonb_build_object('id', v_request.id, 'status', v_request.status, 'unchanged', TRUE);
  END IF;
  IF NOT ((v_request.status = 'requested' AND p_decision IN ('processing', 'rejected'))
          OR (v_request.status = 'processing' AND p_decision = 'rejected')) THEN
    RAISE EXCEPTION 'A % payout request cannot move to %', v_request.status, p_decision USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', trim(p_reason), true);
  UPDATE public.payout_requests
  SET status = p_decision,
      admin_note = trim(p_reason),
      processed_by = auth.uid(),
      processed_at = CASE WHEN p_decision = 'rejected' THEN now() ELSE processed_at END
  WHERE id = v_request.id;
  PERFORM set_config('primora.audit_reason', '', true);

  RETURN jsonb_build_object('id', v_request.id, 'status', p_decision);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_payout_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_payout_request(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Platform settings change only through a validated, audited command
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage platform settings" ON public.platform_settings;

CREATE OR REPLACE FUNCTION public.admin_update_platform_setting(
  p_key TEXT,
  p_value JSONB,
  p_reason TEXT
)
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
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.platform_settings WHERE key = p_key FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown setting %', p_key USING ERRCODE = 'P0002';
  END IF;

  IF p_key = 'booking_hold_minutes' THEN
    IF jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Hold minutes must be a number' USING ERRCODE = '22023'; END IF;
    v_num := (p_value #>> '{}')::numeric;
    IF v_num <> trunc(v_num) OR v_num < 5 OR v_num > 120 THEN
      RAISE EXCEPTION 'Hold minutes must be a whole number between 5 and 120' USING ERRCODE = '22023';
    END IF;
  ELSIF p_key = 'loyalty_program' THEN
    IF jsonb_typeof(p_value -> 'enabled') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(p_value -> 'points_per_sar') IS DISTINCT FROM 'number' OR COALESCE((p_value ->> 'points_per_sar')::numeric, -1) < 0
       OR jsonb_typeof(p_value -> 'sar_per_point') IS DISTINCT FROM 'number' OR (p_value ->> 'sar_per_point')::numeric < 0
       OR jsonb_typeof(p_value -> 'min_redeem_points') IS DISTINCT FROM 'number' OR (p_value ->> 'min_redeem_points')::numeric < 1 THEN
      RAISE EXCEPTION 'Loyalty settings need enabled, points_per_sar, sar_per_point and min_redeem_points' USING ERRCODE = '22023';
    END IF;
    p_value := v_row.value || p_value; -- keep tier tables that this command does not edit
  ELSIF p_key = 'referral_program' THEN
    IF jsonb_typeof(p_value -> 'enabled') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Referral settings need enabled' USING ERRCODE = '22023';
    END IF;
    p_value := v_row.value || p_value;
    IF EXISTS (SELECT 1 FROM jsonb_each(p_value) kv WHERE kv.key <> 'enabled'
               AND jsonb_typeof(kv.value) = 'number' AND (kv.value #>> '{}')::numeric < 0) THEN
      RAISE EXCEPTION 'Referral amounts cannot be negative' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Setting % is not editable from the console', p_key USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', trim(p_reason), true);
  UPDATE public.platform_settings
  SET value = p_value,
      approved_by = CASE WHEN requires_owner_approval THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN requires_owner_approval THEN now() ELSE approved_at END,
      updated_at = now()
  WHERE key = p_key
  RETURNING * INTO v_row;
  PERFORM set_config('primora.audit_reason', '', true);

  RETURN jsonb_build_object('key', v_row.key, 'value', v_row.value);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_platform_setting(TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_platform_setting(TEXT, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Operator release of unpaid booking holds (the scheduled job runs the same expiry unaudited
--    as the system; an operator-triggered run records who ran it, why and how many were released)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_release_expired_holds(p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  v_count := public.expire_stale_booking_holds();
  PERFORM public.write_audit_log('booking.holds_released', 'bookings', NULL,
    jsonb_build_object('released', v_count, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('released', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_release_expired_holds(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_expired_holds(TEXT) TO authenticated;
