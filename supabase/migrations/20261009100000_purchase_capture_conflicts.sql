-- M-01 (package, gift card, tip, subscription) and M-07 of docs/reviews/2026-10-08-security-money.md.
--
-- A capture for a purchase that is no longer payable (cancelled, superseded by a newer checkout, or paid twice) raised an error in
-- confirm_purchase_payment: the webhook answered HTTP 500 and Tap retried for ever while the money sat captured with no ledger row and no
-- refund request. It now records the capture in the ledger as refund_pending, queues the refund (the same shape as a late booking payment
-- and the membership fix of 20261009010000) and answers the call. A replay of the same charge is answered as handled (and still names the
-- queued refund so the caller can retry it), never failed.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

CREATE OR REPLACE FUNCTION public.queue_purchase_conflict_refund(
  p_purchase_type TEXT, p_purchase_id UUID, p_provider_id UUID, p_booking_id UUID, p_entry_type TEXT,
  p_payment_intent_id TEXT, p_amount NUMERIC, p_platform_share NUMERIC, p_provider_share NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ledger UUID;
  v_refund UUID;
BEGIN
  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                           total_captured, platform_share, provider_share, payout_status)
  VALUES (p_booking_id, p_provider_id, p_entry_type, p_payment_intent_id, p_amount, p_platform_share, p_provider_share, 'refund_pending')
  RETURNING id INTO v_ledger;
  INSERT INTO public.refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, idempotency_key)
  VALUES (v_ledger, p_payment_intent_id, p_amount,
          'Payment arrived for a ' || replace(p_purchase_type, '_', ' ') || ' that was no longer awaiting payment',
          'late_payment_conflict', 'pending', 'late:' || p_payment_intent_id)
  RETURNING id INTO v_refund;
  PERFORM public.write_audit_log('purchase.capture_conflict', p_purchase_type, p_purchase_id,
    jsonb_build_object('payment_intent_id', p_payment_intent_id, 'amount', p_amount, 'refund_request_id', v_refund));
  RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE, 'purchase_type', p_purchase_type,
                            'purchase_id', p_purchase_id, 'refund_request_id', v_refund);
END $fn$;
REVOKE ALL ON FUNCTION public.queue_purchase_conflict_refund(TEXT, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;

-- A replay of a charge whose capture was recorded as a conflict names the queued refund (replay = true) so a failed refund call can be retried.
SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$  v_start TIMESTAMPTZ;
BEGIN$from$,
$to$  v_start TIMESTAMPTZ;
  v_replay_refund UUID;
BEGIN$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$  IF EXISTS (SELECT 1 FROM public.transactional_ledger WHERE payment_intent_id = p_payment_intent_id) THEN
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded');$from$,
$to$  IF EXISTS (SELECT 1 FROM public.transactional_ledger WHERE payment_intent_id = p_payment_intent_id) THEN
    SELECT id INTO v_replay_refund FROM public.refund_requests WHERE idempotency_key = 'late:' || p_payment_intent_id;
    IF v_replay_refund IS NOT NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE, 'purchase_type', p_purchase_type,
                                'purchase_id', p_purchase_id, 'refund_request_id', v_replay_refund, 'replay', TRUE);
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded');$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$    IF v_card.id IS NULL OR v_card.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Gift card is not awaiting payment' USING ERRCODE = '22023';
    END IF;$from$,
$to$    IF v_card.id IS NULL THEN
      RAISE EXCEPTION 'Gift card is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF v_card.status <> 'pending_payment' THEN
      RETURN public.queue_purchase_conflict_refund('gift_card', v_card.id, NULL, NULL, 'gift_card_sale', p_payment_intent_id, p_amount, p_amount, 0);
    END IF;$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$    IF v_pack.id IS NULL OR v_pack.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Package is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_package FROM public.packages WHERE id = v_pack.package_id;$from$,
$to$    IF v_pack.id IS NULL THEN
      RAISE EXCEPTION 'Package is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_package FROM public.packages WHERE id = v_pack.package_id;
    IF v_pack.status <> 'pending_payment' THEN
      RETURN public.queue_purchase_conflict_refund('package', v_pack.id, v_package.provider_id, NULL, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount);
    END IF;$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$    IF v_tip.id IS NULL OR v_tip.status <> 'pending' THEN
      RAISE EXCEPTION 'Tip is not awaiting payment' USING ERRCODE = '22023';
    END IF;$from$,
$to$    IF v_tip.id IS NULL THEN
      RAISE EXCEPTION 'Tip is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF v_tip.status <> 'pending' THEN
      RETURN public.queue_purchase_conflict_refund('tip', v_tip.id, v_tip.provider_id, v_tip.booking_id, 'tip', p_payment_intent_id, p_amount, 0, p_amount);
    END IF;$to$);

SELECT pg_temp.patch_function('public.confirm_purchase_payment(text, uuid, text, numeric)'::regprocedure,
$from$    IF v_sub.id IS NULL OR v_sub.status <> 'pending_payment' THEN
      RAISE EXCEPTION 'Subscription payment is not awaiting payment' USING ERRCODE = '22023';
    END IF;$from$,
$to$    IF v_sub.id IS NULL THEN
      RAISE EXCEPTION 'Subscription payment is not awaiting payment' USING ERRCODE = '22023';
    END IF;
    IF v_sub.status <> 'pending_payment' THEN
      RETURN public.queue_purchase_conflict_refund('subscription', v_sub.id, v_sub.provider_id, NULL, 'subscription', p_payment_intent_id, p_amount, p_amount, 0);
    END IF;$to$);
