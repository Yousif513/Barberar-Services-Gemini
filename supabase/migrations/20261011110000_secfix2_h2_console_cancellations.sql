-- SECFIX-2 R2-H2 (docs/reviews/2026-10-11-security-round2.md; D-Q5 final decision text).
--
-- cancel_booking treated any operations.write session as actor 'admin' and refunded the full captured amount, with no step-up,
-- no refund threshold, no daily cumulative cap and no second person, labelled 'provider_cancellation'. mark_booking_no_show
-- let the same session queue the remainder refund. Operations holds no money permission (D-Q5).
--   * Console cancellations and no-shows have their own commands, admin_cancel_booking and admin_mark_booking_no_show: step-up,
--     operations.write, a reason of at least 10 characters. When the booking has money to give back, the refund follows the
--     same rules as admin_create_refund_request: a caller without money.refund, a refund of SAR 1,000 or more, or one that takes
--     the caller past SAR 5,000 today becomes a 'booking_cancellation' approval request for a different money.refund holder,
--     which runs the cancellation in the approver's session. Owner break-glass applies as for refunds (cap, review, notice).
--   * cancel_booking, mark_booking_no_show (and employee_update_booking_status, which calls them) refuse a console session that
--     is not the booking's own customer unless the call comes from those commands. Customer and provider self-service keep
--     their policy-based refund exactly as before; the service role keeps its system path.
--   * The refund row records source 'admin_cancellation' or 'admin_no_show' and the person whose session created it; the daily
--     cumulative cap counts those sources and pending booking_cancellation requests.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_source_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_source_check CHECK (source IN (
  'customer_cancellation', 'provider_cancellation', 'no_show_remainder', 'dispute', 'admin', 'late_payment_conflict',
  'admin_cancellation', 'admin_no_show'));

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation'));

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
    WHEN 'fee_rule_change' THEN 'money.config'
    WHEN 'payout_hold' THEN 'money.payout'
    WHEN 'reward_program' THEN 'rewards.approve'
    WHEN 'role_change' THEN 'roles.manage'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$  ELSIF v_req.kind IN ('ledger_settlement', 'ledger_adjustment', 'fee_rule_change', 'payout_hold', 'reward_program', 'role_change') THEN$from$,
$to$  ELSIF v_req.kind IN ('ledger_settlement', 'ledger_adjustment', 'fee_rule_change', 'payout_hold', 'reward_program', 'role_change',
                       'booking_cancellation') THEN$to$);

SELECT pg_temp.patch_function('public.admin_break_glass_execute(uuid,text)'::regprocedure,
$from$  IF v_req.kind NOT IN ('payout_release', 'refund', 'ledger_adjustment') THEN$from$,
$to$  IF v_req.kind NOT IN ('payout_release', 'refund', 'ledger_adjustment', 'booking_cancellation') THEN$to$);

-- The daily cumulative cap counts console cancellations and no-shows, and the ones waiting for a second person.
SELECT pg_temp.patch_function('public.refund_needs_approval(numeric)'::regprocedure,
$from$WHERE rr.requested_by = auth.uid() AND rr.source IN ('admin', 'dispute')$from$,
$to$WHERE rr.requested_by = auth.uid() AND rr.source IN ('admin', 'dispute', 'admin_cancellation', 'admin_no_show')$to$);
SELECT pg_temp.patch_function('public.refund_needs_approval(numeric)'::regprocedure,
$from$ar.kind = 'refund' AND ar.status IN ('pending', 'executing')$from$,
$to$ar.kind IN ('refund', 'booking_cancellation') AND ar.status IN ('pending', 'executing')$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. The self-service commands no longer act for a console session
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.cancel_booking(uuid,text)'::regprocedure,
$from$  IF v_booking.id IS NOT NULL AND (public.admin_can('operations.write') OR COALESCE(auth.jwt()->>'role', '') = 'service_role') THEN
    v_actor := 'admin';$from$,
$to$  IF v_booking.id IS NOT NULL AND (COALESCE(auth.jwt()->>'role', '') = 'service_role'
       OR COALESCE(current_setting('primora.console_cancellation', true), '') = v_booking.id::text) THEN
    v_actor := 'admin';
  ELSIF v_booking.id IS NOT NULL AND public.is_admin() AND v_booking.customer_id IS DISTINCT FROM v_user_id THEN
    -- SECFIX-2 R2-H2: a console session cancels through admin_cancel_booking (step-up, reason, refund approval rules).
    RAISE EXCEPTION 'A console cancellation goes through admin_cancel_booking, which applies the refund approval rules'
      USING ERRCODE = '42501', HINT = 'use_admin_cancel_booking';$to$);

SELECT pg_temp.patch_function('public.cancel_booking(uuid,text)'::regprocedure,
$from$CASE WHEN v_actor = 'customer' THEN 'customer_cancellation' ELSE 'provider_cancellation' END,$from$,
$to$CASE WHEN v_actor = 'customer' THEN 'customer_cancellation'
           WHEN COALESCE(current_setting('primora.console_cancellation', true), '') = v_booking.id::text THEN 'admin_cancellation'
           ELSE 'provider_cancellation' END,$to$);

SELECT pg_temp.patch_function('public.mark_booking_no_show(uuid,text)'::regprocedure,
$from$  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;$from$,
$to$  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  -- SECFIX-2 R2-H2: a console session marks a no-show through admin_mark_booking_no_show (the remainder refund is approved
  -- like any console refund).
  IF v_booking.id IS NOT NULL AND public.is_admin() AND COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND NULLIF(current_setting('primora.console_no_show', true), '') IS DISTINCT FROM v_booking.id::text THEN
    RAISE EXCEPTION 'A console no-show goes through admin_mark_booking_no_show, which applies the refund approval rules'
      USING ERRCODE = '42501', HINT = 'use_admin_mark_booking_no_show';
  END IF;$to$);

SELECT pg_temp.patch_function('public.mark_booking_no_show(uuid,text)'::regprocedure,
$from$    PERFORM public.create_refund_request_internal(v_booking.id, v_refund, 'no_show_remainder',$from$,
$to$    PERFORM public.create_refund_request_internal(v_booking.id, v_refund,
      CASE WHEN COALESCE(current_setting('primora.console_no_show', true), '') = v_booking.id::text THEN 'admin_no_show' ELSE 'no_show_remainder' END,$to$);

-- A console session cancels a series booking by booking, each through admin_cancel_booking.
SELECT pg_temp.patch_function('public.cancel_booking_series(uuid,text,timestamp with time zone)'::regprocedure,
$from$  IF v_series.customer_id <> v_uid AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN$from$,
$to$  IF v_series.customer_id <> v_uid AND v_is_admin THEN
    RAISE EXCEPTION 'A console session cancels each booking of the series with admin_cancel_booking (refund approval rules)'
      USING ERRCODE = '42501', HINT = 'use_admin_cancel_booking';
  END IF;
  IF v_series.customer_id <> v_uid AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN$to$);

-- The approver of a console no-show holds money.refund, not operations.write.
SELECT pg_temp.patch_function('public.mark_booking_no_show(uuid,text)'::regprocedure,
$from$  IF v_booking.id IS NULL OR NOT (public.is_booking_staff(v_booking.id, v_user_id) OR public.admin_can('operations.write')) THEN$from$,
$to$  IF v_booking.id IS NULL OR NOT (public.is_booking_staff(v_booking.id, v_user_id) OR public.admin_can('operations.write')
                                   OR COALESCE(current_setting('primora.console_no_show', true), '') = v_booking.id::text) THEN$to$);

-- The approver of a console cancellation holds money.refund, not operations.write: the status change is allowed while that
-- approved request runs.
SELECT pg_temp.patch_function('public.validate_booking_status_transition()'::regprocedure,
$from$  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.admin_can('operations.write') THEN RETURN NEW; END IF;$from$,
$to$  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.admin_can('operations.write') THEN RETURN NEW; END IF;
  IF public.governance_execution_active('booking_cancellation', NEW.id) THEN RETURN NEW; END IF;$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The console commands
-- ---------------------------------------------------------------------------------------------------------------------

-- What the customer gets back if the console runs the command now: everything captured for a cancellation, the remainder
-- above the provider's no-show fee for a no-show.
CREATE OR REPLACE FUNCTION public.console_booking_refund_amount(p_booking public.bookings, p_action TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_captured NUMERIC(10,2) := public.booking_captured_amount(p_booking.id);
  v_fee_percent NUMERIC;
BEGIN
  IF p_action = 'no_show' THEN
    SELECT p.no_show_fee_percent INTO v_fee_percent FROM public.branches br JOIN public.providers p ON p.id = br.provider_id WHERE br.id = p_booking.branch_id;
    RETURN GREATEST(v_captured - LEAST(ROUND(v_captured * COALESCE(v_fee_percent, 0) / 100.0, 2), v_captured), 0);
  END IF;
  RETURN GREATEST(v_captured, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.console_booking_refund_amount(public.bookings, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.console_booking_command(p_booking_id UUID, p_action TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_booking public.bookings;
  v_refund NUMERIC(10,2);
  v_executing BOOLEAN := public.governance_execution_active('booking_cancellation', p_booking_id);
  v_approved_amount NUMERIC;
  v_approval UUID := NULLIF(current_setting('primora.governance_approval', true), '')::uuid;
  v_after public.bookings;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT v_executing AND NOT public.admin_can('operations.write') THEN
    RAISE EXCEPTION 'Your console role cannot change bookings' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_action = 'cancel' AND v_booking.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'A % booking cannot be cancelled', v_booking.status USING ERRCODE = '22023';
  END IF;
  IF p_action = 'no_show' AND v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be marked as no-show' USING ERRCODE = '22023';
  END IF;
  v_refund := public.console_booking_refund_amount(v_booking, p_action);

  IF v_refund > 0 AND NOT v_executing
     AND (NOT public.admin_can('money.refund') OR public.refund_needs_approval(v_refund)) THEN
    RETURN public.governance_request('booking_cancellation', 'bookings', v_booking.id, v_refund,
      jsonb_build_object('action', p_action, 'reason', v_reason, 'refund_amount', v_refund),
      v_reason,
      jsonb_build_object('booking_id', v_booking.id, 'action', p_action,
                         'provider_id', (SELECT br.provider_id FROM public.branches br WHERE br.id = v_booking.branch_id), 'refund_amount', v_refund, 'invoice_number', v_booking.invoice_number,
                         'scheduled_at', v_booking.scheduled_at, 'status_before', v_booking.status))
      || jsonb_build_object('refund_amount', v_refund, 'action', p_action);
  END IF;
  IF v_executing THEN
    SELECT amount_sar INTO v_approved_amount FROM public.admin_approval_requests WHERE id = v_approval;
    IF v_refund > COALESCE(v_approved_amount, 0) THEN
      RAISE EXCEPTION 'The refund grew to SAR % since SAR % was approved; ask again', v_refund, v_approved_amount USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  IF p_action = 'cancel' THEN
    PERFORM set_config('primora.console_cancellation', v_booking.id::text, true);
    PERFORM public.cancel_booking(v_booking.id, v_reason);
    PERFORM set_config('primora.console_cancellation', '', true);
  ELSE
    PERFORM set_config('primora.console_no_show', v_booking.id::text, true);
    PERFORM public.mark_booking_no_show(v_booking.id, v_reason);
    PERFORM set_config('primora.console_no_show', '', true);
  END IF;
  SELECT * INTO v_after FROM public.bookings WHERE id = v_booking.id;
  PERFORM public.write_audit_log(CASE WHEN p_action = 'cancel' THEN 'booking.console_cancelled' ELSE 'booking.console_no_show' END,
    'bookings', v_booking.id,
    jsonb_build_object('reason', v_reason, 'refund_amount', v_after.refund_amount, 'approval_request_id', v_approval,
                       'console_role', public.admin_role()) || public.request_client_info());
  RETURN jsonb_build_object('status', v_after.status, 'booking_id', v_booking.id, 'refund_amount', v_after.refund_amount,
                            'approval_request_id', v_approval);
END;
$$;
REVOKE ALL ON FUNCTION public.console_booking_command(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_booking(p_booking_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN public.console_booking_command(p_booking_id, 'cancel', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_booking_no_show(p_booking_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN public.console_booking_command(p_booking_id, 'no_show', p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_booking(UUID, TEXT), public.admin_mark_booking_no_show(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking(UUID, TEXT), public.admin_mark_booking_no_show(UUID, TEXT) TO authenticated;

-- The approved request runs the command in the approver's session.
CREATE OR REPLACE FUNCTION public.gov_exec_booking_cancellation(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.governance_execution_active('booking_cancellation', p_req.target_id) THEN
    RAISE EXCEPTION 'A console cancellation with a refund runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  RETURN public.console_booking_command(p_req.target_id, COALESCE(p_req.payload->>'action', 'cancel'), p_req.payload->>'reason');
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_booking_cancellation(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;
