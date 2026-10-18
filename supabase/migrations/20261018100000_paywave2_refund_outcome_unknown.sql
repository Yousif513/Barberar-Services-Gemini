-- PAY-WAVE2, QA release gate item 4 (docs/reviews/2026-10-17-qa-release-gate.md; gap refund-outcomes-that-cannot-be-known-have-no-recovery).
--
-- A refund whose outcome at Tap cannot be known (the request timed out, the connection dropped, Tap answered 5xx or an answer
-- without a refund id, or the refund stayed in progress after the worker died) was recorded as a definite refusal ('failed') and
-- sent again by the scheduler and by "Retry now". If Tap had executed it, the customer could be refunded twice; the shared
-- idempotency key protects that only while Tap honours it, which is not confirmed.
--   * refund_requests gains the status 'unknown'. Nothing sends an unknown refund again: claim_refund_request takes only
--     'pending' and 'failed', the scheduler queue reads only those, and admin_retry_refund_request refuses 'unknown'.
--   * process-refund records an indeterminate answer with record_refund_outcome_unknown (service role). An operator who finds a
--     refund stuck in progress now marks it unknown (admin_reopen_stuck_refund), never 'failed'.
--   * An unknown refund is resolved only by
--       - "Check with Tap" (check-refund-status, finance or owner after step-up): Tap's own refund object, found by its id or by
--         the refund request id PRIMORA sends in the refund metadata, is applied by apply_tap_refund_lookup: issued at Tap means
--         succeeded (with the ledger effects of a success), failed at Tap means failed (retryable), not found changes nothing;
--       - or an approved decision (admin_request_refund_outcome_decision): a money.refund holder states what the Tap dashboard
--         shows, citing the Tap refund id when a refund exists (D-Q9), and a different money.refund holder approves it
--         (approval kind 'refund_outcome', never break-glass).
--   * An unknown refund counts as outstanding wherever open refunds are counted, so no second refund can be created for the
--     same money while its outcome is unknown. A failed refund also counts when a new refund request is created: it is still
--     owed and is retried.
--   * The refunds console lists unknown refunds under "Needs attention" and on their own filter.

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

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_status_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_status_check
  CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'unknown'));

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS outcome_unknown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_resolved_via TEXT;
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_outcome_resolved_via_check;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_outcome_resolved_via_check
  CHECK (outcome_resolved_via IS NULL OR outcome_resolved_via IN ('check_with_tap', 'approved_decision'));
-- An unknown refund always says since when.
ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_unknown_has_time;
ALTER TABLE public.refund_requests ADD CONSTRAINT refund_requests_unknown_has_time
  CHECK (status <> 'unknown' OR outcome_unknown_at IS NOT NULL);

ALTER TABLE public.admin_approval_requests DROP CONSTRAINT IF EXISTS admin_approval_requests_kind_check;
ALTER TABLE public.admin_approval_requests ADD CONSTRAINT admin_approval_requests_kind_check CHECK (kind IN (
  'payout_release', 'refund', 'iban_change', 'setting_change', 'ledger_settlement', 'ledger_adjustment', 'fee_rule_change',
  'payout_hold', 'reward_program', 'role_change', 'booking_cancellation', 'reconciliation_import', 'sponsored_price_change',
  'privacy_export', 'privacy_deletion', 'privacy_legal_hold', 'customer_profile_clear', 'privacy_legal_hold_release',
  'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge', 'refund_outcome'));

SELECT pg_temp.patch_function('public.governance_approver_permission(text)'::regprocedure,
$from$    WHEN 'privacy_retention_purge' THEN 'privacy.approve'$from$,
$to$    WHEN 'privacy_retention_purge' THEN 'privacy.approve'
    WHEN 'refund_outcome' THEN 'money.refund'$to$);

SELECT pg_temp.patch_function('public.governance_execute(uuid)'::regprocedure,
$from$'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge') THEN$from$,
$to$'privacy_legal_hold_release', 'privacy_legal_hold_renewal', 'incident_aware_at_correction', 'privacy_retention_purge',
                       'refund_outcome') THEN$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. An unknown outcome is open money: count it wherever open refunds are counted
-- ---------------------------------------------------------------------------------------------------------------------

-- A new refund can only take what is not already owed: pending, in progress, unknown at Tap, or failed and waiting to be retried.
SELECT pg_temp.patch_function('public.create_refund_request_internal(uuid,numeric,text,text,text)'::regprocedure,
$from$  WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing');$from$,
$to$  WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing', 'unknown', 'failed');$to$);

SELECT pg_temp.patch_function('public.ledger_settle_unperformed_booking(uuid)'::regprocedure,
$from$        - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                    WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing')), 0), 0),$from$,
$to$        - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                    WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing', 'unknown')), 0), 0),$to$);
SELECT pg_temp.patch_function('public.ledger_settle_unperformed_booking(uuid)'::regprocedure,
$from$             - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                         WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing')), 0) <= 0$from$,
$to$             - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                         WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing', 'unknown')), 0) <= 0$to$);

-- A referral does not vest on a booking whose refund may have been paid.
SELECT pg_temp.patch_function('public.reward_vest_referral(uuid)'::regprocedure,
$from$r.status IN ('pending', 'processing', 'succeeded')) THEN$from$,
$to$r.status IN ('pending', 'processing', 'succeeded', 'unknown')) THEN$to$);

-- The dashboard counts unknown refunds as needing attention, and on their own.
SELECT pg_temp.patch_function('public.admin_dashboard_overview()'::regprocedure,
$from$                               'stalled', count(*) FILTER (WHERE status = 'failed' AND attempts >= 5),$from$,
$to$                               'stalled', count(*) FILTER (WHERE status = 'failed' AND attempts >= 5),
                               'unknown', count(*) FILTER (WHERE status = 'unknown'),$to$);
SELECT pg_temp.patch_function('public.admin_dashboard_overview()'::regprocedure,
$from$       FROM refund_requests WHERE status IN ('pending', 'processing', 'failed')),$from$,
$to$       FROM refund_requests WHERE status IN ('pending', 'processing', 'failed', 'unknown')),$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Recording an unknown outcome (process-refund, service role)
-- ---------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_refund_outcome_unknown(p_refund_id UUID, p_detail TEXT, p_gateway_refund_id TEXT DEFAULT NULL,
                                                                p_tap_status TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_gateway TEXT := NULLIF(btrim(COALESCE(p_gateway_refund_id, '')), '');
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status = 'unknown' THEN
    RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'unknown', 'replayed', TRUE);
  END IF;
  IF v_refund.status <> 'processing' THEN
    RAISE EXCEPTION 'Only a refund being processed can have an unknown outcome; this one is %', v_refund.status USING ERRCODE = '22023';
  END IF;
  IF v_gateway IS NOT NULL AND v_gateway !~ '^[A-Za-z0-9_-]{3,128}$' THEN
    v_gateway := NULL;
  END IF;

  UPDATE public.refund_requests
     SET status = 'unknown', outcome_unknown_at = now(),
         gateway_refund_id = COALESCE(gateway_refund_id, v_gateway),
         gateway_status = CASE WHEN COALESCE(gateway_refund_id, v_gateway) IS NOT NULL THEN COALESCE(gateway_status, 'unknown') ELSE gateway_status END,
         gateway_status_raw = COALESCE(left(upper(NULLIF(btrim(COALESCE(p_tap_status, '')), '')), 40), gateway_status_raw),
         gateway_status_at = CASE WHEN p_tap_status IS NOT NULL THEN now() ELSE gateway_status_at END,
         error_message = left(COALESCE(NULLIF(btrim(COALESCE(p_detail, '')), ''), 'The payment gateway did not give a definite answer'), 1000)
   WHERE id = v_refund.id;
  PERFORM public.write_audit_log('refund.outcome_unknown', 'refund_requests', v_refund.id,
    jsonb_build_object('amount', v_refund.amount, 'attempts', v_refund.attempts, 'gateway_refund_id', COALESCE(v_refund.gateway_refund_id, v_gateway),
                       'tap_status', left(upper(COALESCE(p_tap_status, '')), 40), 'detail', left(COALESCE(p_detail, ''), 300)));
  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'unknown', 'replayed', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.record_refund_outcome_unknown(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_outcome_unknown(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Operator commands: no retry of an unknown refund; a stuck refund becomes unknown, never failed
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.admin_retry_refund_request(uuid,text)'::regprocedure,
$from$  IF v_refund.status NOT IN ('pending', 'failed') THEN$from$,
$to$  IF v_refund.status = 'unknown' THEN
    RAISE EXCEPTION 'Tap may already have paid this refund, so it is never sent again: check it with Tap, or ask a second person to record what Tap shows'
      USING ERRCODE = '22023', HINT = 'refund_outcome_unknown';
  END IF;
  IF v_refund.status NOT IN ('pending', 'failed') THEN$to$);

SELECT pg_temp.patch_function('public.admin_reopen_stuck_refund(uuid,text)'::regprocedure,
$from$  UPDATE public.refund_requests
     SET status = 'failed',
         error_message = 'Reopened by an operator after it stayed in progress; the gateway outcome was not recorded'
   WHERE id = v_refund.id;$from$,
$to$  -- QA item 4: the worker may have stopped after Tap accepted the refund, so the outcome is unknown, not a refusal. It is not sent
  -- again until Check with Tap or an approved decision says what happened.
  UPDATE public.refund_requests
     SET status = 'unknown', outcome_unknown_at = now(),
         error_message = 'Marked unknown by an operator after it stayed in progress; the gateway outcome was not recorded'
   WHERE id = v_refund.id;$to$);
SELECT pg_temp.patch_function('public.admin_reopen_stuck_refund(uuid,text)'::regprocedure,
$from$  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'failed');$from$,
$to$  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', 'unknown');$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Check with Tap for an unknown refund
-- ---------------------------------------------------------------------------------------------------------------------

-- Due at once for an unknown outcome (with or without a Tap refund id); otherwise, as before, for a refund still processing at
-- Tap after 2 business days.
CREATE OR REPLACE FUNCTION public.refund_tap_check_due(p_refund public.refund_requests)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_refund.status = 'unknown'
      OR (p_refund.gateway_refund_id IS NOT NULL
          AND COALESCE(p_refund.gateway_status, 'processing') IN ('processing', 'unknown')
          AND public.saudi_business_days_between(COALESCE(p_refund.processed_at, p_refund.created_at), now()) > 2);
$$;
REVOKE ALL ON FUNCTION public.refund_tap_check_due(public.refund_requests) FROM PUBLIC, anon, authenticated, service_role;

SELECT pg_temp.patch_function('public.admin_begin_tap_refund_check(uuid)'::regprocedure,
$from$    RAISE EXCEPTION 'Check with Tap opens for a refund still processing at Tap after 2 business days' USING ERRCODE = '22023', HINT = 'tap_check_not_due';$from$,
$to$    RAISE EXCEPTION 'Check with Tap opens for a refund whose outcome is unknown, or one still processing at Tap after 2 business days' USING ERRCODE = '22023', HINT = 'tap_check_not_due';$to$);
SELECT pg_temp.patch_function('public.admin_begin_tap_refund_check(uuid)'::regprocedure,
$from$  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'gateway_refund_id', v_refund.gateway_refund_id);$from$,
$to$  -- For an unknown refund without a Tap refund id the function searches Tap's refunds of the charge from shortly before the
  -- refund was first sent, matching the refund request id PRIMORA put in the metadata.
  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'gateway_refund_id', v_refund.gateway_refund_id,
                            'status', v_refund.status, 'charge_id', v_refund.payment_intent_id, 'amount', v_refund.amount,
                            'search_from', COALESCE(v_refund.claimed_at, v_refund.created_at) - INTERVAL '1 day');$to$);

-- Applies what Tap answered for an unknown refund. Service role only; the administrator's permission is checked again.
--   p_found false: Tap has no refund for this request (yet). Nothing changes except the check count; only an approved decision
--                  may conclude that no refund was issued.
--   issued (succeeded or processing at Tap): the refund was sent; it is completed as a success with the ledger effects of one,
--                  and Tap's status is recorded (a different amount opens a reconciliation break).
--   failed at Tap: a definite refusal; the refund becomes 'failed' and may be retried.
CREATE OR REPLACE FUNCTION public.apply_tap_refund_lookup(p_refund_id UUID, p_actor UUID, p_found BOOLEAN, p_tap_refund_id TEXT,
                                                          p_tap_status TEXT, p_tap_amount NUMERIC, p_tap_charge_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_state TEXT := public.tap_refund_state(p_tap_status);
  v_tap_id TEXT := NULLIF(btrim(COALESCE(p_tap_refund_id, '')), '');
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_role_assignments a JOIN public.admin_role_permissions rp ON rp.admin_role = a.admin_role
                  WHERE a.user_id = p_actor AND rp.permission = 'money.refund') THEN
    RAISE EXCEPTION 'The requesting administrator cannot check refunds' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status <> 'unknown' THEN
    RAISE EXCEPTION 'This refund is no longer of unknown outcome (it is %); nothing was changed', v_refund.status USING ERRCODE = '22023';
  END IF;

  IF NOT COALESCE(p_found, FALSE) THEN
    UPDATE public.refund_requests SET tap_checks = tap_checks + 1, last_tap_check_at = now() WHERE id = v_refund.id;
    PERFORM public.write_audit_log('refund.checked_with_tap', 'refund_requests', v_refund.id,
      jsonb_build_object('result', 'not_found', 'state_before', 'unknown', 'actor_id', p_actor, 'source', 'check_with_tap',
                         'gateway_refund_id', v_refund.gateway_refund_id));
    RETURN jsonb_build_object('refund_request_id', v_refund.id, 'found', FALSE, 'state', 'unknown', 'status', 'unknown');
  END IF;

  IF v_tap_id IS NULL OR v_tap_id !~ '^[A-Za-z0-9_-]{3,128}$' THEN
    RAISE EXCEPTION 'Tap did not name the refund' USING ERRCODE = '22023';
  END IF;
  IF p_tap_charge_id IS DISTINCT FROM v_refund.payment_intent_id THEN
    RAISE EXCEPTION 'Tap answered for a refund of a different charge' USING ERRCODE = '22023';
  END IF;
  IF v_refund.gateway_refund_id IS NOT NULL AND v_refund.gateway_refund_id <> v_tap_id THEN
    RAISE EXCEPTION 'Tap answered for a different refund' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.refund_requests o WHERE o.gateway_refund_id = v_tap_id AND o.id <> v_refund.id) THEN
    RAISE EXCEPTION 'This Tap refund is already recorded for another refund request' USING ERRCODE = '23505';
  END IF;

  IF v_state IN ('succeeded', 'processing') THEN
    UPDATE public.refund_requests SET status = 'processing', gateway_refund_id = v_tap_id, outcome_resolved_via = 'check_with_tap'
     WHERE id = v_refund.id;
    PERFORM public.complete_refund_request(v_refund.id, TRUE, v_tap_id, NULL);
    PERFORM public.refund_apply_gateway_status(v_refund.id, p_tap_status, p_tap_amount, 'check_with_tap', p_actor);
    RETURN jsonb_build_object('refund_request_id', v_refund.id, 'found', TRUE, 'state', v_state, 'status', 'succeeded');
  ELSIF v_state = 'failed' THEN
    UPDATE public.refund_requests
       SET status = 'failed', gateway_refund_id = v_tap_id, outcome_resolved_via = 'check_with_tap',
           error_message = left('Tap reports this refund as ' || upper(COALESCE(p_tap_status, '')) || ' (checked with Tap)', 1000)
     WHERE id = v_refund.id;
    PERFORM public.refund_apply_gateway_status(v_refund.id, p_tap_status, p_tap_amount, 'check_with_tap', p_actor);
    RETURN jsonb_build_object('refund_request_id', v_refund.id, 'found', TRUE, 'state', 'failed', 'status', 'failed');
  END IF;

  -- Tap named the refund with a status PRIMORA does not know: keep it unknown, but remember the refund id for the next check.
  UPDATE public.refund_requests SET gateway_refund_id = v_tap_id WHERE id = v_refund.id;
  PERFORM public.refund_apply_gateway_status(v_refund.id, p_tap_status, p_tap_amount, 'check_with_tap', p_actor);
  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'found', TRUE, 'state', 'unknown', 'status', 'unknown');
END;
$$;
REVOKE ALL ON FUNCTION public.apply_tap_refund_lookup(UUID, UUID, BOOLEAN, TEXT, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tap_refund_lookup(UUID, UUID, BOOLEAN, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. An approved decision on an unknown refund (maker-checker, D-Q9: cite the Tap object id)
-- ---------------------------------------------------------------------------------------------------------------------

-- An approved 'refund_outcome' execution may complete the refund it names (the approver's session is not the service role).
SELECT pg_temp.patch_function('public.complete_refund_request(uuid,boolean,text,text)'::regprocedure,
$from$  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;$from$,
$to$  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' AND NOT public.governance_execution_active('refund_outcome', p_refund_id) THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;$to$);

CREATE OR REPLACE FUNCTION public.admin_request_refund_outcome_decision(p_refund_id UUID, p_outcome TEXT, p_tap_refund_id TEXT, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_tap_id TEXT := NULLIF(btrim(COALESCE(p_tap_refund_id, '')), '');
  v_ledger public.transactional_ledger;
BEGIN
  PERFORM public.require_recent_mfa();
  IF NOT public.admin_can('money.refund') THEN
    RAISE EXCEPTION 'Your console role cannot decide refunds' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('refunded_at_tap', 'not_refunded_at_tap') THEN
    RAISE EXCEPTION 'Say whether Tap shows the refund as paid or shows no refund' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Describe what you saw at Tap in at least 10 characters' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status <> 'unknown' THEN
    RAISE EXCEPTION 'Only a refund whose outcome is unknown needs a decision; this one is %', v_refund.status USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'refunded_at_tap' THEN
    IF v_tap_id IS NULL OR v_tap_id !~ '^[A-Za-z0-9_-]{3,128}$' THEN
      RAISE EXCEPTION 'Give the Tap refund id that shows the refund was paid' USING ERRCODE = '22023', HINT = 'tap_refund_id_required';
    END IF;
    IF v_refund.gateway_refund_id IS NOT NULL AND v_refund.gateway_refund_id <> v_tap_id THEN
      RAISE EXCEPTION 'Tap already named refund % for this request; cite that one', v_refund.gateway_refund_id USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.refund_requests o WHERE o.gateway_refund_id = v_tap_id AND o.id <> v_refund.id) THEN
      RAISE EXCEPTION 'This Tap refund is already recorded for another refund request' USING ERRCODE = '23505';
    END IF;
  ELSIF v_tap_id IS NOT NULL THEN
    RAISE EXCEPTION 'A Tap refund id means a refund exists; choose "Tap shows the refund as paid"' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ledger FROM public.transactional_ledger WHERE id = v_refund.ledger_id;

  RETURN public.governance_request('refund_outcome', 'refund_requests', v_refund.id, v_refund.amount,
    jsonb_build_object('outcome', p_outcome, 'tap_refund_id', v_tap_id, 'reason', v_reason),
    v_reason,
    jsonb_build_object('refund_request_id', v_refund.id, 'outcome', p_outcome, 'tap_refund_id', v_tap_id, 'amount', v_refund.amount,
                       'charge_id', v_refund.payment_intent_id, 'source', v_refund.source, 'booking_id', v_refund.booking_id,
                       'provider_id', v_ledger.provider_id, 'outcome_unknown_at', v_refund.outcome_unknown_at,
                       'tap_checks', v_refund.tap_checks, 'last_tap_check_at', v_refund.last_tap_check_at));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_request_refund_outcome_decision(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_request_refund_outcome_decision(UUID, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.gov_exec_refund_outcome(p_req public.admin_approval_requests)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_tap_id TEXT := NULLIF(btrim(COALESCE(p_req.payload->>'tap_refund_id', '')), '');
  v_outcome TEXT := p_req.payload->>'outcome';
BEGIN
  IF NOT public.governance_execution_active('refund_outcome', p_req.target_id) THEN
    RAISE EXCEPTION 'A refund outcome is recorded only as an approved request' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_req.target_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status <> 'unknown' THEN
    RAISE EXCEPTION 'This refund is no longer of unknown outcome (it is %); nothing was changed', v_refund.status USING ERRCODE = '22023';
  END IF;

  IF v_outcome = 'refunded_at_tap' THEN
    IF v_tap_id IS NULL OR (v_refund.gateway_refund_id IS NOT NULL AND v_refund.gateway_refund_id <> v_tap_id)
       OR EXISTS (SELECT 1 FROM public.refund_requests o WHERE o.gateway_refund_id = v_tap_id AND o.id <> v_refund.id) THEN
      RAISE EXCEPTION 'The Tap refund id of this decision no longer fits the refund; ask again' USING ERRCODE = '22023';
    END IF;
    UPDATE public.refund_requests SET status = 'processing', gateway_refund_id = v_tap_id, outcome_resolved_via = 'approved_decision'
     WHERE id = v_refund.id;
    PERFORM public.complete_refund_request(v_refund.id, TRUE, v_tap_id, NULL);
    PERFORM public.refund_apply_gateway_status(v_refund.id, 'REFUNDED', NULL, 'approved_decision', auth.uid());
  ELSIF v_outcome = 'not_refunded_at_tap' THEN
    UPDATE public.refund_requests
       SET status = 'failed', outcome_resolved_via = 'approved_decision',
           error_message = 'Two people confirmed that Tap shows no refund for this request; it can be sent again'
     WHERE id = v_refund.id;
  ELSE
    RAISE EXCEPTION 'Unknown refund outcome %', v_outcome USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_audit_log('refund.outcome_decided', 'refund_requests', v_refund.id,
    jsonb_build_object('outcome', v_outcome, 'tap_refund_id', v_tap_id, 'amount', v_refund.amount, 'approval_request_id', p_req.id,
                       'requested_by', p_req.requested_by, 'approved_by', auth.uid(), 'reason', p_req.payload->>'reason'));
  RETURN jsonb_build_object('refund_request_id', v_refund.id, 'outcome', v_outcome,
                            'status', CASE WHEN v_outcome = 'refunded_at_tap' THEN 'succeeded' ELSE 'failed' END);
END;
$$;
REVOKE ALL ON FUNCTION public.gov_exec_refund_outcome(public.admin_approval_requests) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. The refunds console lists unknown refunds and what is needed to settle them
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.admin_list_refund_requests(text,integer,integer,text)'::regprocedure,
$from$    WHEN 'attention' THEN ARRAY['pending', 'processing', 'failed']$from$,
$to$    WHEN 'attention' THEN ARRAY['pending', 'processing', 'failed', 'unknown']$to$);
SELECT pg_temp.patch_function('public.admin_list_refund_requests(text,integer,integer,text)'::regprocedure,
$from$    WHEN 'failed' THEN ARRAY['failed'] WHEN 'succeeded' THEN ARRAY['succeeded']$from$,
$to$    WHEN 'failed' THEN ARRAY['failed'] WHEN 'succeeded' THEN ARRAY['succeeded'] WHEN 'unknown' THEN ARRAY['unknown']$to$);
SELECT pg_temp.patch_function('public.admin_list_refund_requests(text,integer,integer,text)'::regprocedure,
$from$             rr.claimed_at, rr.booking_id, jsonb_build_object('invoice_number', b.invoice_number) AS bookings$from$,
$to$             rr.claimed_at, rr.booking_id, jsonb_build_object('invoice_number', b.invoice_number) AS bookings,
             rr.gateway_refund_id, rr.gateway_status, rr.tap_checks, rr.last_tap_check_at, rr.outcome_unknown_at, rr.outcome_resolved_via,
             public.refund_tap_check_due(rr) AS tap_check_due,
             (SELECT ar.id FROM public.admin_approval_requests ar
               WHERE ar.kind = 'refund_outcome' AND ar.target_id = rr.id AND ar.status = 'pending' LIMIT 1) AS pending_decision_id$to$);
SELECT pg_temp.patch_function('public.admin_list_refund_requests(text,integer,integer,text)'::regprocedure,
$from$    ARRAY['amount', 'reason', 'source', 'status', 'attempts', 'error_message', 'invoice_number'], v_purpose,$from$,
$to$    ARRAY['amount', 'reason', 'source', 'status', 'attempts', 'error_message', 'invoice_number', 'gateway_refund_id', 'gateway_status'], v_purpose,$to$);
