-- Migration: 20261005100000_admin_refund_retry.sql
-- Refunds owed to customers had no operator path. process-refund retries 'pending' and 'failed'
-- refund_requests until the fifth attempt, after which claim_refund_request refuses them, so a refund
-- the gateway kept rejecting stayed unpaid with nobody able to see or move it.
--
-- admin_retry_refund_request records an operator's decision to try again, with a reason, and re-opens a
-- refund that ran out of attempts for exactly one more attempt. The money still moves only through
-- process-refund (claim -> Tap with the request's idempotency key -> complete_refund_request), so a
-- repeated click cannot refund twice.

CREATE OR REPLACE FUNCTION public.admin_retry_refund_request(p_refund_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refund_requests;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_reopened BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_refund FROM public.refund_requests WHERE id = p_refund_id FOR UPDATE;
  IF v_refund.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_refund.status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'A % refund cannot be retried', v_refund.status USING ERRCODE = '22023';
  END IF;

  -- One more attempt, not five: if the gateway refuses again the operator decides again.
  IF v_refund.attempts >= 5 THEN
    UPDATE public.refund_requests SET attempts = 4 WHERE id = v_refund.id;
    v_reopened := TRUE;
  END IF;

  PERFORM public.write_audit_log('refund.retry_requested', 'refund_requests', v_refund.id,
    jsonb_build_object('reason', v_reason, 'status', v_refund.status, 'attempts', v_refund.attempts,
                       'reopened', v_reopened, 'amount', v_refund.amount));

  RETURN jsonb_build_object('refund_id', v_refund.id, 'status', v_refund.status, 'reopened', v_reopened);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_retry_refund_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_refund_request(UUID, TEXT) TO authenticated;
