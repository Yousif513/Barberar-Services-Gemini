-- F3 (docs/reviews/2026-10-16-security-final-recheck.md): the real retention purge irreversibly deletes data, and one privacy.approve
-- holder could run it after step-up, while every other irreversible privacy action takes two people. Now:
--   * a dry run is unchanged (privacy.approve after step-up, or the service key; rolled back, exact counts, audited);
--   * a real run from a console session is a 'privacy_retention_purge' approval request: the requester (privacy.approve, step-up,
--     a reason of at least 10 characters) gets a dry run whose counts the approver sees; a different privacy.approve holder decides
--     after step-up (admin_decide_approval), and only that approved execution deletes. Break-glass never applies to this kind;
--   * the service key (the future scheduler, gap retention-purge-not-scheduled) still runs it directly, as the review allows;
--   * the audit entry of a real run names the approval and the reason.

-- The approved execution of a purge request in this transaction (the token is set by governance_execute and cannot be forged).
CREATE OR REPLACE FUNCTION public.privacy_retention_purge_approved() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_approval_requests r
     WHERE r.kind = 'privacy_retention_purge' AND r.status = 'executing' AND r.execution_token IS NOT NULL
       AND r.execution_token::text = NULLIF(current_setting('primora.governance_token', true), ''));
$$;
REVOKE ALL ON FUNCTION public.privacy_retention_purge_approved() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear',
  'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge'));

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
    WHEN 'privacy_retention_purge' THEN 'privacy.approve'
  END;
$$;

DO $migrate$
DECLARE
  v_def TEXT := replace(pg_get_functiondef('public.governance_execute(uuid)'::regprocedure), E'\r\n', E'\n');
  v_from TEXT := $f$'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction') THEN$f$;
BEGIN
  IF position(v_from IN v_def) = 0 THEN RAISE EXCEPTION 'governance_execute: pattern not found'; END IF;
  EXECUTE replace(v_def, v_from,
    $t$'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge') THEN$t$);
END $migrate$;

-- The purge takes the reason of a real run, and a real run from the console only asks.
DO $migrate$
DECLARE
  v_def TEXT := replace(pg_get_functiondef('public.privacy_purge_expired_retention(boolean)'::regprocedure), E'\r\n', E'\n');
  v_head_from TEXT := 'public.privacy_purge_expired_retention(p_dry_run boolean DEFAULT true)';
  v_auth_from TEXT := $f$  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    PERFORM public.privacy_require_console('privacy.approve');
  END IF;$f$;
  v_auth_to TEXT := $t$  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    PERFORM public.require_recent_mfa();
    PERFORM public.privacy_require_console('privacy.approve');
    -- F3: a real run from the console is decided by a second privacy.approve holder.
    IF NOT COALESCE(p_dry_run, TRUE) AND NOT public.privacy_retention_purge_approved() THEN
      RETURN public.privacy_request_retention_purge(p_reason);
    END IF;
  END IF;$t$;
  v_audit_from TEXT := $f$  PERFORM public.write_audit_log('privacy.retention_purged', 'privacy_retention_purge_runs', v_run, v_counts);$f$;
  v_audit_to TEXT := $t$  PERFORM public.write_audit_log('privacy.retention_purged', 'privacy_retention_purge_runs', v_run,
    v_counts || jsonb_build_object('approval_request_id', NULLIF(current_setting('primora.governance_approval', true), ''),
                                   'reason', NULLIF(btrim(COALESCE(p_reason, '')), '')));$t$;
BEGIN
  IF position(v_head_from IN v_def) = 0 OR position(v_auth_from IN v_def) = 0 OR position(v_audit_from IN v_def) = 0 THEN
    RAISE EXCEPTION 'privacy_purge_expired_retention: pattern not found';
  END IF;
  v_def := replace(v_def, v_head_from, 'public.privacy_purge_expired_retention(p_dry_run boolean DEFAULT true, p_reason text DEFAULT NULL)');
  v_def := replace(v_def, v_auth_from, v_auth_to);
  v_def := replace(v_def, v_audit_from, v_audit_to);
  -- The request helper is referenced by name only, so the new overload can be created before it.
  EXECUTE v_def;
END $migrate$;
DROP FUNCTION IF EXISTS public.privacy_purge_expired_retention(BOOLEAN);
REVOKE ALL ON FUNCTION public.privacy_purge_expired_retention(BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_purge_expired_retention(BOOLEAN, TEXT) TO authenticated, service_role;

-- Asked by a privacy.approve holder after step-up (checked by the caller). One request waits at a time; the approver sees the
-- dry run's counts taken when it was asked (the approved run counts again and reports what it actually did).
CREATE OR REPLACE FUNCTION public.privacy_request_retention_purge(p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_existing public.admin_approval_requests;
  v_preview JSONB;
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Record why the purge should run (at least 10 characters)' USING ERRCODE = '22023', HINT = 'reason_required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('privacy_retention_purge_request'));
  SELECT * INTO v_existing FROM public.admin_approval_requests WHERE kind = 'privacy_retention_purge' AND status = 'pending'
   ORDER BY requested_at LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'pending_approval', 'approval_id', v_existing.id, 'kind', 'privacy_retention_purge',
                              'existing', TRUE, 'requested_by', v_existing.requested_by, 'preview', v_existing.summary);
  END IF;
  v_preview := public.privacy_purge_expired_retention(TRUE, NULL);
  RETURN public.governance_request('privacy_retention_purge', 'privacy_retention_purge_runs', (v_preview->>'run_id')::uuid, NULL,
      jsonb_build_object('reason', v_reason), v_reason,
      jsonb_build_object('cutoff', v_preview->'cutoff', 'sub_records', v_preview->'sub_records',
                         'bookings_deleted', v_preview->'bookings_deleted', 'bookings_anonymised', v_preview->'bookings_anonymised',
                         'preview_run_id', v_preview->'run_id'))
    || jsonb_build_object('preview', v_preview);
END $$;
REVOKE ALL ON FUNCTION public.privacy_request_retention_purge(TEXT) FROM PUBLIC, anon, authenticated;

-- Runs in the approver's session (admin_decide_approval: step-up, privacy.approve, not the requester).
CREATE OR REPLACE FUNCTION public.gov_exec_privacy_retention_purge(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.governance_execution_active('privacy_retention_purge', p_req.target_id) THEN
    RAISE EXCEPTION 'A real retention purge runs from the console only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() = p_req.requested_by THEN
    RAISE EXCEPTION 'A different person approves the retention purge' USING ERRCODE = '42501';
  END IF;
  RETURN public.privacy_purge_expired_retention(FALSE, p_req.payload->>'reason');
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_retention_purge(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;
