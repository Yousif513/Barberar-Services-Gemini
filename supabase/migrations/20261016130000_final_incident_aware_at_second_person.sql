-- FINAL-4: review N5 (docs/reviews/2026-10-11-security-priv-recheck.md). One incident.manage holder could move aware_at, and so the
-- 72-hour SDAIA clock, by any amount (the probe moved it 99 hours and an overdue filing looked on time).
--   * A correction of the awareness time is an 'incident_aware_at_correction' approval request, asked after step-up and decided
--     after step-up by a different incident.manage holder. Nothing changes on the incident until it is approved.
--   * Every step is a new row of the append-only privacy_incident_events (requested, corrected or rejected, with from, to, reason,
--     who asked and who decided); the first recorded time stays in aware_at_original. A time is still corrected at most once.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear',
  'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction'));

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
    WHEN 'privacy_export' THEN 'privacy.approve'
    WHEN 'privacy_deletion' THEN 'privacy.approve'
    WHEN 'privacy_legal_hold' THEN 'privacy.approve'
    WHEN 'customer_profile_clear' THEN 'privacy.approve'
    WHEN 'privacy_legal_hold_release' THEN 'privacy.approve'
    WHEN 'privacy_legal_hold_renewal' THEN 'privacy.approve'
    WHEN 'incident_aware_at_correction' THEN 'incident.manage'
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'privacy_legal_hold_release', 'privacy_legal_hold_renewal') THEN$from$,
$to$                       'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction') THEN$to$);

-- The checks a correction must pass when it is asked for and again when it is approved.
CREATE OR REPLACE FUNCTION public.privacy_incident_check_aware_at(i public.privacy_incidents, p_aware_at TIMESTAMPTZ) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF i.id IS NULL THEN RAISE EXCEPTION 'Incident not found' USING ERRCODE = 'P0002'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'A closed incident is kept as recorded' USING ERRCODE = '22023'; END IF;
  IF i.aware_at_corrected_at IS NOT NULL THEN
    RAISE EXCEPTION 'The awareness time was already corrected once' USING ERRCODE = '22023', HINT = 'already_corrected';
  END IF;
  IF p_aware_at IS NULL OR p_aware_at > now() + INTERVAL '5 minutes' OR p_aware_at < i.discovered_at - INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'The awareness time must be after the discovery and not in the future' USING ERRCODE = '22023';
  END IF;
  IF i.sdaia_notified_at IS NOT NULL AND i.sdaia_notified_at > p_aware_at + INTERVAL '72 hours' AND char_length(COALESCE(i.sdaia_late_reason, '')) < 20 THEN
    RAISE EXCEPTION 'With this time the SDAIA filing would be late; record the late-filing reason first' USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.privacy_incident_check_aware_at(public.privacy_incidents, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_incident_correct_aware_at(p_incident_id UUID, p_aware_at TIMESTAMPTZ, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.privacy_incidents;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_result JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('incident.manage');
  IF v_reason IS NULL OR char_length(v_reason) < 20 THEN
    RAISE EXCEPTION 'Explain the correction (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_incident_id FOR UPDATE;
  PERFORM public.privacy_incident_check_aware_at(i, p_aware_at);
  IF EXISTS (SELECT 1 FROM public.admin_approval_requests WHERE kind = 'incident_aware_at_correction' AND target_id = i.id AND status = 'pending') THEN
    RAISE EXCEPTION 'A correction of this incident''s awareness time is already waiting for a second person' USING ERRCODE = '22023',
      HINT = 'correction_pending';
  END IF;
  v_result := public.governance_request('incident_aware_at_correction', 'privacy_incidents', i.id, NULL,
    jsonb_build_object('aware_at', p_aware_at, 'reason', v_reason), v_reason,
    jsonb_build_object('reference', i.reference, 'from', i.aware_at, 'to', p_aware_at, 'moves_deadline_hours',
                       round((EXTRACT(EPOCH FROM (p_aware_at - i.aware_at)) / 3600)::numeric, 1),
                       'deadline_from', i.aware_at + INTERVAL '72 hours', 'deadline_to', p_aware_at + INTERVAL '72 hours'));
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'aware_at_correction_requested', auth.uid(),
          jsonb_build_object('from', i.aware_at, 'to', p_aware_at, 'reason', v_reason, 'approval_request_id', v_result->>'approval_id'));
  RETURN v_result || jsonb_build_object('incident_id', i.id);
END $$;
REVOKE ALL ON FUNCTION public.admin_incident_correct_aware_at(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incident_correct_aware_at(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- Runs in the approver's session (admin_decide_approval: step-up, incident.manage, not the requester).
CREATE OR REPLACE FUNCTION public.gov_exec_incident_aware_at_correction(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.privacy_incidents;
  v_to TIMESTAMPTZ := (p_req.payload->>'aware_at')::timestamptz;
  v_reason TEXT := p_req.payload->>'reason';
  v_old TIMESTAMPTZ;
BEGIN
  IF NOT public.governance_execution_active('incident_aware_at_correction', p_req.target_id) THEN
    RAISE EXCEPTION 'An awareness time is corrected only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() = p_req.requested_by THEN
    RAISE EXCEPTION 'A different person decides the correction' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO i FROM public.privacy_incidents WHERE id = p_req.target_id FOR UPDATE;
  PERFORM public.privacy_incident_check_aware_at(i, v_to);
  v_old := i.aware_at;
  UPDATE public.privacy_incidents SET aware_at = v_to, aware_at_original = v_old, aware_at_corrected_at = now(),
         aware_at_correction_reason = v_reason, deadline_alerted_at = CASE WHEN v_to > v_old THEN NULL ELSE deadline_alerted_at END,
         updated_at = now()
   WHERE id = i.id RETURNING * INTO i;
  INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
  VALUES (i.id, 'aware_at_corrected', auth.uid(), jsonb_build_object('from', v_old, 'to', v_to, 'reason', v_reason,
          'requested_by', p_req.requested_by, 'approved_by', auth.uid(), 'approval_request_id', p_req.id));
  PERFORM public.write_audit_log('privacy.incident_aware_at_corrected', 'privacy_incidents', i.id,
    jsonb_build_object('from', v_old, 'to', v_to, 'reason', v_reason, 'requested_by', p_req.requested_by, 'approval_request_id', p_req.id)
      || public.request_client_info());
  RETURN public.privacy_incident_json(i);
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_incident_aware_at_correction(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- A rejected correction is part of the incident's history too.
SELECT pg_temp.patch_function('public.admin_decide_approval(uuid,text,text)'::regprocedure,
$from$    IF v_req.kind = 'privacy_legal_hold' THEN$from$,
$to$    IF v_req.kind = 'incident_aware_at_correction' THEN
      INSERT INTO public.privacy_incident_events (incident_id, event, actor_id, details)
      VALUES (v_req.target_id, 'aware_at_correction_rejected', auth.uid(),
              jsonb_build_object('to', v_req.payload->'aware_at', 'reason', v_reason, 'approval_request_id', v_req.id));
    END IF;
    IF v_req.kind = 'privacy_legal_hold' THEN$to$);
