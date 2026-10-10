-- GOV-1 part 2: maker-checker approvals, owner break-glass and governance thresholds (D-Q5, final decision text).
--
--   * admin_approval_requests holds every action that needs a second person: payout releases (every payout), refunds of
--     SAR 1,000 or more, refunds that take an administrator past SAR 5,000 in one Riyadh day, provider IBAN creation or change
--     (added by part 3) and changes to these thresholds. The approver must be a different person: the server refuses
--     self-approval for every role, owner included.
--   * The action itself is still performed by the existing command (admin_release_payout, admin_create_refund_request,
--     resolve_booking_dispute). Without an approval in progress it records a pending request instead of acting; the approval
--     runs the same command in the approver's session under a one-time execution token, so every existing guard (balance,
--     idempotency, step-up, audit) still applies, to the approver.
--   * Break-glass: when no second eligible administrator exists, an owner may execute a payout or refund request alone, with
--     step-up, a justification of at least 20 characters and a daily cap (SAR 10,000 by default). It queues an out-of-band
--     notice to every owner, raises a security alert and opens an independent review due within 7 days. Never for IBAN changes
--     and never for threshold changes (those always wait for a second person).
--   * The thresholds are rows of governance_settings and change only through an approved setting_change request.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.governance_settings (
  key TEXT PRIMARY KEY CHECK (key IN ('refund_single_approval_sar', 'refund_daily_cumulative_sar', 'break_glass_daily_cap_sar')),
  value NUMERIC(12,2) NOT NULL CHECK (value > 0),
  description_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  approval_request_id UUID
);

-- The adopted defaults (D-Q5): business choices the owner can change later through an approved request.
INSERT INTO public.governance_settings (key, value, description_en, description_ar) VALUES
  ('refund_single_approval_sar', 1000, 'A single refund of this amount or more needs a second administrator', 'يحتاج الاسترداد الواحد بهذا المبلغ أو أكثر إلى اعتماد مسؤول ثانٍ'),
  ('refund_daily_cumulative_sar', 5000, 'Refunds by one administrator above this total in one Riyadh day need a second administrator', 'تحتاج المبالغ المستردة من مسؤول واحد فوق هذا الإجمالي في يوم واحد (بتوقيت الرياض) إلى اعتماد مسؤول ثانٍ'),
  ('break_glass_daily_cap_sar', 10000, 'Most an owner may execute alone through break-glass in one Riyadh day', 'الحد الأعلى لما ينفذه المالك منفرداً عبر إجراء الطوارئ في يوم واحد (بتوقيت الرياض)')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('payout_release', 'refund', 'iban_change', 'setting_change')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'approved', 'rejected', 'cancelled')),
  target_type TEXT NOT NULL,
  target_id UUID,
  amount_sar NUMERIC(12,2),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID NOT NULL,
  requested_role TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_reason TEXT NOT NULL,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  break_glass BOOLEAN NOT NULL DEFAULT FALSE,
  execution_token UUID,
  execution_result JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_approval_pending_target
  ON public.admin_approval_requests (kind, target_id) WHERE status IN ('pending', 'executing');
CREATE INDEX IF NOT EXISTS idx_admin_approval_status ON public.admin_approval_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_approval_requester_day ON public.admin_approval_requests (requested_by, kind, requested_at);

CREATE TABLE IF NOT EXISTS public.break_glass_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL UNIQUE REFERENCES public.admin_approval_requests(id),
  actor_id UUID NOT NULL,
  amount_sar NUMERIC(12,2),
  justification TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ NOT NULL,
  signed_off_at TIMESTAMPTZ,
  signed_off_by UUID,
  reviewer_name TEXT,
  document_reference TEXT,
  review_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_break_glass_reviews_open ON public.break_glass_reviews (due_at) WHERE signed_off_at IS NULL;

ALTER TABLE public.governance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_glass_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Administrators read governance settings" ON public.governance_settings;
CREATE POLICY "Administrators read governance settings" ON public.governance_settings FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Administrators read approval requests" ON public.admin_approval_requests;
CREATE POLICY "Administrators read approval requests" ON public.admin_approval_requests FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Administrators read break-glass reviews" ON public.break_glass_reviews;
CREATE POLICY "Administrators read break-glass reviews" ON public.break_glass_reviews FOR SELECT TO authenticated USING (public.is_admin());

SELECT public.grant_data_api_access('public.governance_settings');
SELECT public.grant_data_api_access('public.admin_approval_requests');
SELECT public.grant_data_api_access('public.break_glass_reviews');
SELECT public.attach_admin_audit_trigger('public.governance_settings');
SELECT public.attach_admin_audit_trigger('public.admin_approval_requests');
SELECT public.attach_admin_audit_trigger('public.break_glass_reviews');
-- The execution token never leaves the database.
REVOKE SELECT ON public.admin_approval_requests FROM authenticated;
GRANT SELECT (id, kind, status, target_type, target_id, amount_sar, summary, requested_by, requested_role, requested_at, request_reason,
  decided_by, decided_at, decision_reason, break_glass, execution_result) ON public.admin_approval_requests TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Internal helpers
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.riyadh_day_start(p_at TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT date_trunc('day', p_at AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh';
$$;

CREATE OR REPLACE FUNCTION public.governance_setting(p_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.governance_settings WHERE key = p_key;
$$;

-- The permission an approver of this kind of request must hold.
CREATE OR REPLACE FUNCTION public.governance_approver_permission(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_kind
    WHEN 'payout_release' THEN 'money.payout'
    WHEN 'refund' THEN 'money.refund'
    WHEN 'iban_change' THEN 'iban.approve'
    WHEN 'setting_change' THEN 'money.config'
  END;
$$;

-- TRUE while an approved request of this kind for this target is being executed in the current transaction.
CREATE OR REPLACE FUNCTION public.governance_execution_active(p_kind TEXT, p_target UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_approval_requests r
     WHERE r.kind = p_kind AND r.target_id = p_target AND r.status = 'executing'
       AND r.execution_token IS NOT NULL
       AND r.execution_token::text = NULLIF(current_setting('primora.governance_token', true), '')
  );
$$;

-- Records (or finds) the pending request for an action that needs a second person, and answers with it.
CREATE OR REPLACE FUNCTION public.governance_request(p_kind TEXT, p_target_type TEXT, p_target_id UUID, p_amount NUMERIC,
  p_payload JSONB, p_reason TEXT, p_summary JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.admin_approval_requests;
  v_id UUID;
BEGIN
  SELECT * INTO v_existing FROM public.admin_approval_requests
   WHERE kind = p_kind AND target_id IS NOT DISTINCT FROM p_target_id AND status = 'pending'
   ORDER BY requested_at LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'pending_approval', 'approval_id', v_existing.id, 'kind', p_kind, 'existing', TRUE,
                              'requested_by', v_existing.requested_by, 'amount', v_existing.amount_sar);
  END IF;
  INSERT INTO public.admin_approval_requests (kind, target_type, target_id, amount_sar, payload, summary, requested_by, requested_role, request_reason)
  VALUES (p_kind, p_target_type, p_target_id, p_amount, COALESCE(p_payload, '{}'::jsonb), COALESCE(p_summary, '{}'::jsonb),
          auth.uid(), COALESCE(public.admin_role(), CASE WHEN auth.uid() IS NOT NULL THEN 'provider' END), p_reason)
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('approval.requested', 'admin_approval_requests', v_id,
    jsonb_build_object('kind', p_kind, 'target_type', p_target_type, 'target_id', p_target_id, 'amount', p_amount, 'reason', p_reason));
  RETURN jsonb_build_object('status', 'pending_approval', 'approval_id', v_id, 'kind', p_kind, 'existing', FALSE, 'amount', p_amount);
END;
$$;

-- Whether a refund of this amount by the calling administrator needs a second person.
CREATE OR REPLACE FUNCTION public.refund_needs_approval(p_amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today NUMERIC;
BEGIN
  IF COALESCE(p_amount, 0) >= public.governance_setting('refund_single_approval_sar') THEN
    RETURN TRUE;
  END IF;
  SELECT COALESCE((SELECT SUM(rr.amount) FROM public.refund_requests rr
                    WHERE rr.requested_by = auth.uid() AND rr.source IN ('admin', 'dispute') AND rr.created_at >= public.riyadh_day_start()), 0)
       + COALESCE((SELECT SUM(ar.amount_sar) FROM public.admin_approval_requests ar
                    WHERE ar.requested_by = auth.uid() AND ar.kind = 'refund' AND ar.status IN ('pending', 'executing')
                      AND ar.requested_at >= public.riyadh_day_start()), 0)
    INTO v_today;
  RETURN v_today + COALESCE(p_amount, 0) > public.governance_setting('refund_daily_cumulative_sar');
END;
$$;

-- Runs an approved request in the approver's session under a one-time token; any error rolls the whole decision back.
CREATE OR REPLACE FUNCTION public.governance_execute(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_approval_requests;
  v_token UUID := gen_random_uuid();
  v_result JSONB;
  v_refund UUID;
BEGIN
  UPDATE public.admin_approval_requests SET status = 'executing', execution_token = v_token
   WHERE id = p_request_id AND status = 'pending'
  RETURNING * INTO v_req;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'This request is no longer pending' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('primora.governance_token', v_token::text, true);
  PERFORM set_config('primora.governance_approval', v_req.id::text, true);

  IF v_req.kind = 'payout_release' THEN
    v_result := public.admin_release_payout(v_req.target_id, v_req.payload->>'idempotency_key', v_req.payload->>'reason', v_req.payload->>'admin_note');
  ELSIF v_req.kind = 'refund' AND v_req.payload->>'mode' = 'dispute' THEN
    v_result := public.resolve_booking_dispute(v_req.target_id, 'resolved_refund', v_req.payload->>'notes', (v_req.payload->>'amount')::numeric);
  ELSIF v_req.kind = 'refund' THEN
    v_refund := public.admin_create_refund_request(v_req.target_id, (v_req.payload->>'amount')::numeric, v_req.payload->>'reason', v_req.payload->>'idempotency_key');
    v_result := jsonb_build_object('refund_request_id', v_refund);
  ELSIF v_req.kind = 'iban_change' THEN
    v_result := public.gov_activate_payout_destination(v_req.target_id);
  ELSIF v_req.kind = 'setting_change' THEN
    UPDATE public.governance_settings
       SET value = (v_req.payload->>'value')::numeric, updated_at = now(), updated_by = auth.uid(), approval_request_id = v_req.id
     WHERE key = v_req.payload->>'key';
    v_result := jsonb_build_object('key', v_req.payload->>'key', 'value', (v_req.payload->>'value')::numeric, 'value_before', v_req.payload->'value_before');
  ELSE
    RAISE EXCEPTION 'Unknown approval kind %', v_req.kind USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.governance_token', '', true);
  PERFORM set_config('primora.governance_approval', '', true);
  UPDATE public.admin_approval_requests SET status = 'approved', execution_token = NULL, execution_result = v_result WHERE id = v_req.id;
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.riyadh_day_start(TIMESTAMPTZ), public.governance_setting(TEXT), public.governance_approver_permission(TEXT),
  public.governance_execution_active(TEXT, UUID), public.governance_request(TEXT, TEXT, UUID, NUMERIC, JSONB, TEXT, JSONB),
  public.refund_needs_approval(NUMERIC), public.governance_execute(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.riyadh_day_start(TIMESTAMPTZ) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The existing money commands now ask for a second person
-- ---------------------------------------------------------------------------------------------------------------------

-- Every payout release (D-Q5: all payouts are dual, per batch; a batch is the set released together from the inbox).
SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$  IF v_request.status NOT IN ('requested', 'processing') THEN
    RAISE EXCEPTION 'Payout request is %', v_request.status USING ERRCODE = '23505';
  END IF;$from$,
$to$  IF v_request.status NOT IN ('requested', 'processing') THEN
    RAISE EXCEPTION 'Payout request is %', v_request.status USING ERRCODE = '23505';
  END IF;
  -- Maker-checker (D-Q5): without an approved request being executed, this records the request for a second administrator.
  IF NOT public.governance_execution_active('payout_release', v_request.id) THEN
    RETURN public.governance_request('payout_release', 'payout_requests', v_request.id, v_request.amount,
      jsonb_build_object('idempotency_key', p_idempotency_key, 'reason', v_reason, 'admin_note', p_admin_note),
      v_reason, jsonb_build_object('provider_id', v_request.provider_id, 'amount', v_request.amount, 'requested_at', v_request.requested_at));
  END IF;$to$);

SELECT pg_temp.patch_function('public.admin_release_payout(uuid,text,text,text)'::regprocedure,
$from$'amount', v_request.amount, 'ledger_rows', v_rows, 'note', p_admin_note, 'reason', v_reason)$from$,
$to$'amount', v_request.amount, 'ledger_rows', v_rows, 'note', p_admin_note, 'reason', v_reason,
                       'approval_request_id', NULLIF(current_setting('primora.governance_approval', true), ''))$to$);

-- A direct status change to paid outside the command is refused too (the console used to update payout_requests directly).
CREATE OR REPLACE FUNCTION public.guard_payout_request_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NOT public.governance_execution_active('payout_release', NEW.id) THEN
    RAISE EXCEPTION 'A payout is marked paid only by an approved release (a second administrator approves it)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_payout_request_paid() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_payout_request_paid ON public.payout_requests;
CREATE TRIGGER trg_guard_payout_request_paid BEFORE UPDATE OF status ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_request_paid();

-- Refunds at or above the single threshold, or past the daily total of the requesting administrator.
SELECT pg_temp.patch_function('public.admin_create_refund_request(uuid,numeric,text,text)'::regprocedure,
$from$  PERFORM set_config('primora.audit_reason', v_reason, true);
  v_id := public.create_refund_request_internal(p_booking_id, p_amount, 'admin', v_reason, v_key);$from$,
$to$  IF NOT public.governance_execution_active('refund', p_booking_id) AND public.refund_needs_approval(p_amount) THEN
    RAISE EXCEPTION 'This refund needs a second administrator: SAR % is at or above the single-refund threshold or takes you past the daily total; request it with admin_request_refund', ROUND(p_amount, 2)
      USING ERRCODE = '42501', HINT = 'approval_required';
  END IF;
  PERFORM set_config('primora.audit_reason', v_reason, true);
  v_id := public.create_refund_request_internal(p_booking_id, p_amount, 'admin', v_reason, v_key);$to$);

SELECT pg_temp.patch_function('public.resolve_booking_dispute(uuid,character varying,text,numeric)'::regprocedure,
$from$  IF p_resolution = 'resolved_refund' THEN
    v_refund_id$from$,
$to$  IF p_resolution = 'resolved_refund'
     AND NOT public.governance_execution_active('refund', v_dispute.id)
     AND public.refund_needs_approval(COALESCE(p_refund_amount, v_dispute.disputed_amount_sar)) THEN
    RETURN public.governance_request('refund', 'payment_disputes', v_dispute.id, COALESCE(p_refund_amount, v_dispute.disputed_amount_sar),
      jsonb_build_object('mode', 'dispute', 'notes', TRIM(p_admin_notes), 'amount', COALESCE(p_refund_amount, v_dispute.disputed_amount_sar)),
      TRIM(p_admin_notes), jsonb_build_object('booking_id', v_dispute.booking_id, 'dispute_id', v_dispute.id));
  END IF;

  IF p_resolution = 'resolved_refund' THEN
    v_refund_id$to$);

-- The console's refund command: refunds below the thresholds run at once, the rest wait for a second administrator.
CREATE OR REPLACE FUNCTION public.admin_request_refund(p_booking_id UUID, p_amount NUMERIC, p_reason TEXT, p_idempotency_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_id UUID;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.refund') THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'The refund amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF public.refund_needs_approval(p_amount) THEN
    RETURN public.governance_request('refund', 'bookings', p_booking_id, ROUND(p_amount, 2),
      jsonb_build_object('mode', 'booking', 'amount', ROUND(p_amount, 2), 'reason', v_reason, 'idempotency_key', p_idempotency_key),
      v_reason, jsonb_build_object('booking_id', p_booking_id));
  END IF;
  v_id := public.admin_create_refund_request(p_booking_id, p_amount, v_reason, p_idempotency_key);
  RETURN jsonb_build_object('status', 'executed', 'refund_request_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_request_refund(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_request_refund(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Deciding, cancelling and break-glass
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_decide_approval(p_request_id UUID, p_decision TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_approval_requests;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_result JSONB;
BEGIN
  IF p_decision = 'approve' THEN
    PERFORM public.require_recent_mfa();
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.admin_approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('id', v_req.id, 'status', v_req.status, 'unchanged', TRUE);
  END IF;
  -- Four eyes, for every role including owner.
  IF v_req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve or reject your own request; a different administrator decides it' USING ERRCODE = '42501';
  END IF;
  IF NOT public.admin_can(public.governance_approver_permission(v_req.kind)) THEN
    RAISE EXCEPTION 'Your console role cannot decide % requests', v_req.kind USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.admin_approval_requests SET status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason
     WHERE id = v_req.id;
    IF v_req.kind = 'iban_change' THEN
      PERFORM public.gov_reject_payout_destination(v_req.target_id);
    END IF;
    PERFORM public.write_audit_log('approval.rejected', 'admin_approval_requests', v_req.id,
      jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id, 'amount', v_req.amount_sar, 'requested_by', v_req.requested_by, 'reason', v_reason));
    RETURN jsonb_build_object('id', v_req.id, 'status', 'rejected');
  END IF;

  UPDATE public.admin_approval_requests SET decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason WHERE id = v_req.id;
  v_result := public.governance_execute(v_req.id);
  PERFORM public.write_audit_log('approval.approved', 'admin_approval_requests', v_req.id,
    jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id, 'amount', v_req.amount_sar, 'requested_by', v_req.requested_by,
                       'reason', v_reason, 'result', v_result) || public.request_client_info());
  RETURN jsonb_build_object('id', v_req.id, 'status', 'approved', 'result', v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_decide_approval(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_approval(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_cancel_approval(p_request_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_approval_requests;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_req FROM public.admin_approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'Only the administrator who made the request can withdraw it; anyone else rejects it' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('id', v_req.id, 'status', v_req.status, 'unchanged', TRUE);
  END IF;
  UPDATE public.admin_approval_requests SET status = 'cancelled', decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason
   WHERE id = v_req.id;
  PERFORM public.write_audit_log('approval.cancelled', 'admin_approval_requests', v_req.id,
    jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id, 'reason', v_reason));
  RETURN jsonb_build_object('id', v_req.id, 'status', 'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_cancel_approval(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_approval(UUID, TEXT) TO authenticated;

-- Another administrator (not the requester) who could approve a request of this kind.
CREATE OR REPLACE FUNCTION public.governance_second_approver_exists(p_kind TEXT, p_requester UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.admin_role_assignments a
      JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin'
      JOIN public.admin_role_permissions rp ON rp.admin_role = a.admin_role AND rp.permission = public.governance_approver_permission(p_kind)
     WHERE a.user_id <> p_requester
       AND NOT EXISTS (SELECT 1 FROM public.mfa_verification_failures l WHERE l.user_id = a.user_id AND l.locked_at IS NOT NULL)
  );
$$;
REVOKE ALL ON FUNCTION public.governance_second_approver_exists(TEXT, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_break_glass_execute(p_request_id UUID, p_justification TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.admin_approval_requests;
  v_justification TEXT := NULLIF(btrim(COALESCE(p_justification, '')), '');
  v_used NUMERIC;
  v_cap NUMERIC := public.governance_setting('break_glass_daily_cap_sar');
  v_result JSONB;
  v_owner RECORD;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('break_glass.use') THEN
    RAISE EXCEPTION 'Only an owner can use break-glass' USING ERRCODE = '42501';
  END IF;
  IF v_justification IS NULL OR char_length(v_justification) < 20 THEN
    RAISE EXCEPTION 'A written justification of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.admin_approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_req.status USING ERRCODE = '22023';
  END IF;
  IF v_req.kind NOT IN ('payout_release', 'refund') THEN
    RAISE EXCEPTION 'Break-glass is never available for % requests; they always wait for a second person', v_req.kind USING ERRCODE = '42501';
  END IF;
  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'You are a second administrator for this request: approve or reject it instead of using break-glass' USING ERRCODE = '22023';
  END IF;
  IF public.governance_second_approver_exists(v_req.kind, v_req.requested_by) THEN
    RAISE EXCEPTION 'Another eligible administrator exists; this request waits for their approval' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('primora.break_glass_cap'));
  SELECT COALESCE(SUM(amount_sar), 0) INTO v_used FROM public.admin_approval_requests
   WHERE break_glass AND status = 'approved' AND decided_at >= public.riyadh_day_start();
  IF v_used + COALESCE(v_req.amount_sar, 0) > v_cap THEN
    RAISE EXCEPTION 'Break-glass daily cap reached: SAR % used of SAR % today; this request waits for a second person', v_used, v_cap USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_approval_requests
     SET decided_by = auth.uid(), decided_at = now(), decision_reason = v_justification, break_glass = TRUE
   WHERE id = v_req.id;
  v_result := public.governance_execute(v_req.id);

  INSERT INTO public.break_glass_reviews (approval_request_id, actor_id, amount_sar, justification, due_at)
  VALUES (v_req.id, auth.uid(), v_req.amount_sar, v_justification, now() + INTERVAL '7 days');
  INSERT INTO public.security_alerts (kind, user_id, details)
  VALUES ('break_glass_used', auth.uid(), jsonb_build_object('approval_request_id', v_req.id, 'kind', v_req.kind, 'amount', v_req.amount_sar));
  FOR v_owner IN
    SELECT a.user_id FROM public.admin_role_assignments a JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin' WHERE a.admin_role = 'owner'
  LOOP
    PERFORM public.queue_governance_notice(v_owner.user_id, 'break_glass_used',
      jsonb_build_object('approval_request_id', v_req.id, 'kind', v_req.kind, 'amount', v_req.amount_sar, 'actor_id', auth.uid()));
  END LOOP;
  PERFORM public.write_audit_log('approval.break_glass', 'admin_approval_requests', v_req.id,
    jsonb_build_object('kind', v_req.kind, 'target_id', v_req.target_id, 'amount', v_req.amount_sar, 'justification', v_justification,
                       'cap', v_cap, 'used_before', v_used, 'result', v_result) || public.request_client_info());
  RETURN jsonb_build_object('id', v_req.id, 'status', 'approved', 'break_glass', TRUE, 'result', v_result,
                            'review_due_at', now() + INTERVAL '7 days');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_break_glass_execute(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_break_glass_execute(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_sign_off_break_glass(p_review_id UUID, p_reviewer_name TEXT, p_document_reference TEXT, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review public.break_glass_reviews;
  v_name TEXT := NULLIF(btrim(COALESCE(p_reviewer_name, '')), '');
  v_ref TEXT := NULLIF(btrim(COALESCE(p_document_reference, '')), '');
BEGIN
  IF NOT public.admin_can('break_glass.review') THEN
    RAISE EXCEPTION 'Your console role cannot record a break-glass review' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR char_length(v_name) < 3 THEN
    RAISE EXCEPTION 'Name the independent reviewer (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF v_ref IS NULL OR char_length(v_ref) < 3 THEN
    RAISE EXCEPTION 'A document reference for the review is required (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_review FROM public.break_glass_reviews WHERE id = p_review_id FOR UPDATE;
  IF v_review.id IS NULL THEN
    RAISE EXCEPTION 'Break-glass review not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_review.signed_off_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_review.id, 'unchanged', TRUE);
  END IF;
  UPDATE public.break_glass_reviews
     SET signed_off_at = now(), signed_off_by = auth.uid(), reviewer_name = v_name, document_reference = v_ref,
         review_notes = NULLIF(btrim(COALESCE(p_notes, '')), '')
   WHERE id = v_review.id;
  PERFORM public.write_audit_log('break_glass.reviewed', 'break_glass_reviews', v_review.id,
    jsonb_build_object('approval_request_id', v_review.approval_request_id, 'reviewer_name', v_name, 'document_reference', v_ref,
                       'late', now() > v_review.due_at, 'recorded_by_actor', v_review.actor_id = auth.uid()));
  RETURN jsonb_build_object('id', v_review.id, 'signed_off', TRUE, 'late', now() > v_review.due_at);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sign_off_break_glass(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sign_off_break_glass(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- Changing a threshold is itself a request for a second person (D-Q8 for refund thresholds).
CREATE OR REPLACE FUNCTION public.admin_request_setting_change(p_key TEXT, p_value NUMERIC, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting public.governance_settings;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_id UUID;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('settings.manage') THEN
    RAISE EXCEPTION 'Only an owner can propose a governance threshold change' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_setting FROM public.governance_settings WHERE key = p_key;
  IF v_setting.key IS NULL THEN
    RAISE EXCEPTION 'Unknown governance setting' USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL OR p_value <= 0 OR p_value > 10000000 THEN
    RAISE EXCEPTION 'The value must be a positive amount in SAR' USING ERRCODE = '22023';
  END IF;
  IF ROUND(p_value, 2) = v_setting.value THEN
    RAISE EXCEPTION 'The value is already SAR %', v_setting.value USING ERRCODE = '22023';
  END IF;
  -- The target is a fixed id per key, so one change per setting waits at a time.
  v_id := md5('governance_setting:' || p_key)::uuid;
  RETURN public.governance_request('setting_change', 'governance_settings', v_id, NULL,
    jsonb_build_object('key', p_key, 'value', ROUND(p_value, 2), 'value_before', v_setting.value), v_reason,
    jsonb_build_object('key', p_key, 'value', ROUND(p_value, 2), 'value_before', v_setting.value));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_request_setting_change(TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_request_setting_change(TEXT, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. The approvals inbox
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_approval_inbox(p_status TEXT DEFAULT 'pending', p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_me UUID := auth.uid();
  v_rows JSONB;
  v_counts JSONB;
  v_matching BIGINT;
  v_reviews JSONB;
  v_settings JSONB;
  v_alerts JSONB;
  v_used NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_counts
    FROM (SELECT status, COUNT(*) AS n FROM public.admin_approval_requests GROUP BY status) c;
  SELECT COUNT(*) INTO v_matching FROM public.admin_approval_requests WHERE v_status IS NULL OR status = v_status;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC, x.id), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT r.id, r.kind, r.status, r.target_type, r.target_id, r.amount_sar, r.summary, r.requested_by, r.requested_role,
             r.requested_at, r.request_reason, r.decided_by, r.decided_at, r.decision_reason, r.break_glass, r.execution_result,
             NULLIF(btrim(COALESCE(rp.first_name, '') || ' ' || COALESCE(rp.last_name, '')), '') AS requested_by_name,
             NULLIF(btrim(COALESCE(dp.first_name, '') || ' ' || COALESCE(dp.last_name, '')), '') AS decided_by_name,
             (SELECT pr.business_name_en FROM public.providers pr WHERE pr.id = (r.summary->>'provider_id')::uuid) AS provider_name_en,
             (SELECT pr.business_name_ar FROM public.providers pr WHERE pr.id = (r.summary->>'provider_id')::uuid) AS provider_name_ar,
             (r.status = 'pending' AND r.requested_by <> v_me AND public.admin_can(public.governance_approver_permission(r.kind))) AS can_decide,
             (r.status = 'pending' AND r.requested_by = v_me) AS can_cancel,
             (r.status = 'pending' AND r.requested_by = v_me AND r.kind IN ('payout_release', 'refund') AND public.admin_can('break_glass.use')
              AND NOT public.governance_second_approver_exists(r.kind, r.requested_by)) AS can_break_glass
        FROM public.admin_approval_requests r
        LEFT JOIN public.profiles rp ON rp.id = r.requested_by
        LEFT JOIN public.profiles dp ON dp.id = r.decided_by
       WHERE v_status IS NULL OR r.status = v_status
       ORDER BY r.requested_at DESC, r.id
       LIMIT v_limit OFFSET v_offset
    ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.due_at), '[]'::jsonb) INTO v_reviews
    FROM (SELECT g.id, g.approval_request_id, g.actor_id, g.amount_sar, g.justification, g.executed_at, g.due_at, g.signed_off_at,
                 g.reviewer_name, g.document_reference, now() > g.due_at AS overdue
            FROM public.break_glass_reviews g WHERE g.signed_off_at IS NULL OR g.signed_off_at > now() - INTERVAL '30 days'
            ORDER BY g.due_at LIMIT 50) b;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.key), '[]'::jsonb) INTO v_settings
    FROM (SELECT key, value, description_en, description_ar, updated_at FROM public.governance_settings) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_alerts
    FROM (SELECT id, kind, user_id, details, created_at FROM public.security_alerts WHERE acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 50) a;
  SELECT COALESCE(SUM(amount_sar), 0) INTO v_used FROM public.admin_approval_requests
   WHERE break_glass AND status = 'approved' AND decided_at >= public.riyadh_day_start();

  PERFORM public.write_audit_log('approvals.inbox_read', 'admin_approval_requests', NULL,
    jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_rows)));

  RETURN jsonb_build_object('counts', v_counts, 'matching', v_matching, 'rows', v_rows, 'break_glass_reviews', v_reviews,
                            'settings', v_settings, 'open_alerts', v_alerts, 'break_glass_used_today', v_used,
                            'can_acknowledge_alerts', public.admin_can('alerts.acknowledge'),
                            'can_review_break_glass', public.admin_can('break_glass.review'),
                            'can_propose_settings', public.admin_can('settings.manage'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_approval_inbox(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approval_inbox(TEXT, INTEGER, INTEGER) TO authenticated;
