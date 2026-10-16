-- FINAL-3: review N3 and the renewal note (docs/reviews/2026-10-11-security-priv-recheck.md).
--   N3  Releasing a hold from the console before it ends on its own is irreversible (the deferred erasure runs at once, and an
--       account kept for a court case is erased with its login). It is now a 'privacy_legal_hold_release' approval request: asked
--       after step-up by a privacy.approve holder, decided after step-up by a different privacy.approve holder (four eyes, the
--       maker never decides their own request). The hold stays active until then. The scheduler's release of a dispute hold 30 days
--       after the dispute closed (privacy_release_due_holds) is unchanged.
--   Renewal note: two people alternating could keep a hold for ever. The first PRIVACY_HOLD_RENEWALS_BEFORE_REAPPROVAL (3) renewals
--       follow the existing rule (a reviewer who is neither the proposer nor whoever last approved or renewed it). From the 4th, a
--       renewal is a 'privacy_legal_hold_renewal' approval request decided by an owner who has never proposed, approved or renewed
--       this hold. Chosen over a hard cap on total duration because a cap would release (and so erase) records a court still
--       needs, which cannot be undone; an unrenewed hold stays visible as overdue for review.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- Everyone who renewed the hold, in order (the existing last_reviewed_by keeps only the latest).
ALTER TABLE public.privacy_legal_holds ADD COLUMN IF NOT EXISTS renewed_by UUID[] NOT NULL DEFAULT '{}';
UPDATE public.privacy_legal_holds SET renewed_by = ARRAY[last_reviewed_by]
 WHERE renewals > 0 AND last_reviewed_by IS NOT NULL AND renewed_by = '{}';

CREATE OR REPLACE FUNCTION public.privacy_hold_renewals_before_reapproval() RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 3 $$;
REVOKE ALL ON FUNCTION public.privacy_hold_renewals_before_reapproval() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear',
  'privacy_legal_hold_release', 'privacy_legal_hold_renewal'));

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
  END;
$$;

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$                       'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear') THEN$from$,
$to$                       'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear',
                       'privacy_legal_hold_release', 'privacy_legal_hold_renewal') THEN$to$);

-- What the approver sees: the hold's basis, reference and scope (never the pseudonym, never the person's contact details).
CREATE OR REPLACE FUNCTION public.privacy_hold_approval_summary(h public.privacy_legal_holds, p_note TEXT) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('basis', h.basis, 'case_reference', h.case_reference, 'categories', to_jsonb(h.categories),
    'account_held', 'account' = ANY (h.categories), 'renewals', h.renewals, 'review_due_at', h.review_due_at,
    'customer_erased', EXISTS (SELECT 1 FROM public.deletion_ledger l WHERE l.subject_id = h.subject_id), 'note', p_note);
$$;
REVOKE ALL ON FUNCTION public.privacy_hold_approval_summary(public.privacy_legal_holds, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.privacy_renew_hold_internal(h public.privacy_legal_holds, p_note TEXT, p_renewer UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.privacy_legal_holds;
BEGIN
  UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = p_renewer, last_review_note = p_note,
         review_due_at = now() + INTERVAL '90 days', renewals = renewals + 1, renewed_by = renewed_by || p_renewer
   WHERE id = h.id AND status = 'active' RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Active hold not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.write_audit_log('privacy.legal_hold_reviewed', 'privacy_legal_holds', r.id,
    jsonb_build_object('kept', TRUE, 'note', p_note, 'review_due_at', r.review_due_at, 'renewals', r.renewals,
                       'approval_request_id', NULLIF(current_setting('primora.governance_approval', true), '')));
  RETURN jsonb_build_object('hold_id', r.id, 'status', 'active', 'review_due_at', r.review_due_at, 'renewals', r.renewals);
END $$;
REVOKE ALL ON FUNCTION public.privacy_renew_hold_internal(public.privacy_legal_holds, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- The 90-day review. Keeping: the existing new-reviewer rule, and from the 4th renewal an approval by a fresh owner. Releasing early:
-- always an approval request decided by a second person.
CREATE OR REPLACE FUNCTION public.admin_privacy_review_legal_hold(p_hold_id UUID, p_keep BOOLEAN, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  h public.privacy_legal_holds;
  v_result JSONB;
BEGIN
  PERFORM public.require_recent_mfa();
  PERFORM public.privacy_require_console('privacy.approve');
  IF v_note IS NULL OR char_length(v_note) < 20 THEN
    RAISE EXCEPTION 'Record the outcome of the review (at least 20 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO h FROM public.privacy_legal_holds WHERE id = p_hold_id AND status = 'active' FOR UPDATE;
  IF h.id IS NULL THEN RAISE EXCEPTION 'Active hold not found' USING ERRCODE = 'P0002'; END IF;
  IF p_keep THEN
    IF auth.uid() = h.created_by OR auth.uid() = COALESCE(h.last_reviewed_by, h.approved_by) THEN
      RAISE EXCEPTION 'A hold is kept only by a new approver: not the person who proposed it or who last approved or renewed it'
        USING ERRCODE = '42501', HINT = 'new_approver_required';
    END IF;
    IF h.basis = 'payment_dispute' AND h.dispute_closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'The dispute closed; this hold ends 30 days after and is not renewed' USING ERRCODE = '22023';
    END IF;
    IF h.renewals < public.privacy_hold_renewals_before_reapproval() THEN
      RETURN public.privacy_renew_hold_internal(h, v_note, auth.uid());
    END IF;
    v_result := public.governance_request('privacy_legal_hold_renewal', 'privacy_legal_holds', h.id, NULL,
      jsonb_build_object('note', v_note), v_note, public.privacy_hold_approval_summary(h, v_note));
    RETURN v_result || jsonb_build_object('hold_id', h.id, 'hold_status', 'active', 'renewal_needs_approval', TRUE);
  END IF;
  v_result := public.governance_request('privacy_legal_hold_release', 'privacy_legal_holds', h.id, NULL,
    jsonb_build_object('note', v_note), v_note, public.privacy_hold_approval_summary(h, v_note));
  RETURN v_result || jsonb_build_object('hold_id', h.id, 'hold_status', 'active', 'release_needs_approval', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_review_legal_hold(UUID, BOOLEAN, TEXT) TO authenticated;

-- Runs in the approver's session (admin_decide_approval: step-up, privacy.approve, not the requester).
CREATE OR REPLACE FUNCTION public.gov_exec_privacy_legal_hold_release(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.privacy_legal_holds;
BEGIN
  IF NOT public.governance_execution_active('privacy_legal_hold_release', p_req.target_id) THEN
    RAISE EXCEPTION 'A hold is released early only as an approved request' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NULL OR auth.uid() = p_req.requested_by THEN
    RAISE EXCEPTION 'A different person decides the release' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM public.privacy_legal_holds WHERE id = p_req.target_id AND status = 'active' FOR UPDATE;
  IF h.id IS NULL THEN RAISE EXCEPTION 'The hold is no longer active' USING ERRCODE = '22023'; END IF;
  UPDATE public.privacy_legal_holds SET last_reviewed_at = now(), last_reviewed_by = p_req.requested_by, last_review_note = p_req.payload->>'note'
   WHERE id = h.id;
  RETURN public.privacy_release_hold_internal(h.id, p_req.payload->>'note');
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_legal_hold_release(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_privacy_legal_hold_renewal(p_req public.admin_approval_requests)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.privacy_legal_holds;
BEGIN
  IF NOT public.governance_execution_active('privacy_legal_hold_renewal', p_req.target_id) THEN
    RAISE EXCEPTION 'This renewal runs only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM public.privacy_legal_holds WHERE id = p_req.target_id AND status = 'active' FOR UPDATE;
  IF h.id IS NULL THEN RAISE EXCEPTION 'The hold is no longer active' USING ERRCODE = '22023'; END IF;
  IF COALESCE(public.admin_role(), '') <> 'owner' THEN
    RAISE EXCEPTION 'A hold renewed % times is kept only with an owner''s approval', h.renewals USING ERRCODE = '42501', HINT = 'owner_required';
  END IF;
  IF auth.uid() = p_req.requested_by OR auth.uid() = h.created_by OR auth.uid() = h.approved_by OR auth.uid() = ANY (h.renewed_by) THEN
    RAISE EXCEPTION 'A hold renewed % times is kept only with an owner who has never proposed, approved or renewed it', h.renewals
      USING ERRCODE = '42501', HINT = 'fresh_owner_required';
  END IF;
  IF h.basis = 'payment_dispute' AND h.dispute_closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'The dispute closed; this hold ends 30 days after and is not renewed' USING ERRCODE = '22023';
  END IF;
  -- The requester did the review; the owner's approval is what lets the renewal stand.
  PERFORM public.privacy_renew_hold_internal(h, p_req.payload->>'note', p_req.requested_by);
  UPDATE public.privacy_legal_holds SET renewed_by = renewed_by || auth.uid() WHERE id = h.id RETURNING * INTO h;
  RETURN jsonb_build_object('hold_id', h.id, 'status', 'active', 'review_due_at', h.review_due_at, 'renewals', h.renewals);
END $$;
REVOKE ALL ON FUNCTION public.gov_exec_privacy_legal_hold_renewal(public.admin_approval_requests) FROM PUBLIC, anon, authenticated;

-- A pending release or renewal ends with the hold: the scheduler's release closes it.
SELECT pg_temp.patch_function('public.privacy_release_hold_internal(uuid,text)'::regprocedure,
$from$  PERFORM public.write_audit_log('privacy.legal_hold_released', 'privacy_legal_holds', h.id, jsonb_build_object('reason', p_reason));$from$,
$to$  PERFORM public.write_audit_log('privacy.legal_hold_released', 'privacy_legal_holds', h.id, jsonb_build_object('reason', p_reason));
  UPDATE public.admin_approval_requests SET status = 'cancelled', decided_at = now(), decision_reason = 'The hold ended'
   WHERE kind IN ('privacy_legal_hold_release', 'privacy_legal_hold_renewal') AND target_id = h.id AND status = 'pending';$to$);
