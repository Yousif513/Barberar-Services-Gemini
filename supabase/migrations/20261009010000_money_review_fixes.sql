-- Fixes from the independent money review (docs/reviews/2026-10-08-security-money.md): M-01, M-02, M-03.
--
-- M-03 (critical). A booking paid partly with wallet credit whose hold expired had its credit restored by booking_release_discounts. If the
-- customer then paid the remaining deposit through the still-open checkout, confirm_booking_payment did not see a conflict (wallet credit
-- was missing from the list of released discounts), resurrected the booking, and the customer kept the restored credit while the platform
-- settled the same credit to the provider again at completion: a repeatable gain. Wallet credit now counts as a released discount, so the
-- late payment is a conflict: the capture is recorded and refunded, the booking stays cancelled.
--
-- M-01. A membership payment that arrives for a membership that is no longer awaiting payment (cancelled by the customer first, or paid
-- twice) raised an error, so the webhook failed and Tap retried for ever while the money sat captured with no ledger row and no refund.
-- It now records the capture and queues the refund, exactly as a late booking payment does, and a replay is answered as already handled.
--
-- M-02. A membership visit could be redeemed against a booking scheduled after the membership period had ended (the period was checked
-- against now(), not against the visit). The visit must fall inside the period it is taken from.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- M-03
SELECT pg_temp.patch_function('public.confirm_booking_payment(uuid, text, numeric)'::regprocedure,
$from$AND (v_booking.discount_amount > 0 OR v_booking.gift_card_amount > 0 OR v_booking.loyalty_points_redeemed > 0);$from$,
$to$AND (v_booking.discount_amount > 0 OR v_booking.gift_card_amount > 0 OR v_booking.loyalty_points_redeemed > 0 OR COALESCE(v_booking.wallet_credit_amount, 0) > 0);$to$);

-- M-01: declare the ledger id, answer a replay of the conflict, record and refund a capture the membership can no longer use
SELECT pg_temp.patch_function('public.confirm_membership_payment(uuid, text, numeric)'::regprocedure,
$from$  v_start TIMESTAMPTZ;
BEGIN$from$,
$to$  v_start TIMESTAMPTZ;
  v_conflict_ledger UUID;
  v_conflict_refund UUID;
BEGIN$to$);

SELECT pg_temp.patch_function('public.confirm_membership_payment(uuid, text, numeric)'::regprocedure,
$from$    RAISE EXCEPTION 'This payment was already used for another purchase' USING ERRCODE = '23505';$from$,
$to$    -- The same capture that was already recorded as a conflict (its refund is queued) is answered as handled, not retried for ever.
    SELECT id INTO v_conflict_refund FROM public.refund_requests WHERE idempotency_key = 'late:' || p_payment_intent_id;
    IF v_conflict_refund IS NOT NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE, 'membership_id', v_row.id,
                                'refund_request_id', v_conflict_refund, 'replay', TRUE);
    END IF;
    RAISE EXCEPTION 'This payment was already used for another purchase' USING ERRCODE = '23505';$to$);

SELECT pg_temp.patch_function('public.confirm_membership_payment(uuid, text, numeric)'::regprocedure,
$from$  IF v_row.status <> 'pending_payment' THEN
    RAISE EXCEPTION 'Membership is not awaiting payment' USING ERRCODE = '22023';
  END IF;$from$,
$to$  IF v_row.status <> 'pending_payment' THEN
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NULL, v_row.provider_id, 'package_sale', p_payment_intent_id, p_amount, 0, p_amount, 'refund_pending')
    RETURNING id INTO v_conflict_ledger;
    INSERT INTO public.refund_requests (ledger_id, payment_intent_id, amount, reason, source, status, idempotency_key)
    VALUES (v_conflict_ledger, p_payment_intent_id, p_amount,
            'Payment arrived for a membership that was no longer awaiting payment', 'late_payment_conflict', 'pending',
            'late:' || p_payment_intent_id)
    RETURNING id INTO v_conflict_refund;
    RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE, 'membership_id', v_row.id,
                              'refund_request_id', v_conflict_refund);
  END IF;$to$);

-- M-02
SELECT pg_temp.patch_function('public.redeem_membership_visit(uuid, uuid, text)'::regprocedure,
$from$  IF v_booking.user_package_id IS NOT NULL THEN$from$,
$to$  IF v_booking.scheduled_at < v_row.period_start OR v_booking.scheduled_at >= v_row.period_end THEN
    RAISE EXCEPTION 'The visit is outside the period of this membership' USING ERRCODE = '22023';
  END IF;
  IF v_booking.user_package_id IS NOT NULL THEN$to$);
