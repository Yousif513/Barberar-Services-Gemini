-- A booking may have multiple captured charges when two checkout links are paid.
-- The rejected capture must refund its own ledger row, never the booking's earliest payment.
-- Preserve all later booking/payment fixes by changing only these two verified blocks.
DO $migration$
DECLARE
  v_definition TEXT := replace(
    pg_get_functiondef('public.confirm_booking_payment(uuid,text,numeric)'::regprocedure),
    E'\r\n', E'\n'
  );
  v_old_replay TEXT := $old$
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded', 'conflict', FALSE, 'booking_id', v_booking.id);$old$;
  v_new_replay TEXT := $new$
    SELECT id INTO v_refund_id
    FROM public.refund_requests
    WHERE ledger_id = v_existing.id
      AND payment_intent_id = target_payment_intent_id
      AND idempotency_key = 'late:' || target_payment_intent_id
      AND source = 'late_payment_conflict';
    IF v_refund_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE,
                                'booking_id', v_booking.id, 'refund_request_id', v_refund_id, 'replay', TRUE);
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded', 'conflict', FALSE, 'booking_id', v_booking.id);$new$;
  v_old_refund TEXT := $old$
    v_refund_id := public.create_refund_request_internal(v_booking.id, target_total_captured, 'late_payment_conflict',
      'Payment arrived after the booking hold was released', 'late:' || target_payment_intent_id);$old$;
  v_new_refund TEXT := $new$
    -- This row was inserted above in this transaction under the booking row lock.
    -- Its whole capture is refundable; no other refund can already reserve this new ledger row.
    INSERT INTO public.refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source,
                                        idempotency_key, requested_by)
    VALUES (v_booking.id, v_ledger_id, target_payment_intent_id, target_total_captured,
            'Payment arrived after the booking hold was released', 'late_payment_conflict',
            'late:' || target_payment_intent_id, auth.uid())
    RETURNING id INTO v_refund_id;

    PERFORM public.write_audit_log('refund.requested', 'refund_requests', v_refund_id,
      jsonb_build_object('booking_id', v_booking.id, 'amount', target_total_captured, 'source', 'late_payment_conflict'));$new$;
BEGIN
  v_old_replay := replace(v_old_replay, E'\r\n', E'\n');
  v_new_replay := replace(v_new_replay, E'\r\n', E'\n');
  v_old_refund := replace(v_old_refund, E'\r\n', E'\n');
  v_new_refund := replace(v_new_refund, E'\r\n', E'\n');

  IF (length(v_definition) - length(replace(v_definition, v_old_replay, ''))) / length(v_old_replay) <> 1 THEN
    RAISE EXCEPTION 'Booking capture refund migration expected one canonical replay block';
  END IF;
  IF (length(v_definition) - length(replace(v_definition, v_old_refund, ''))) / length(v_old_refund) <> 1 THEN
    RAISE EXCEPTION 'Booking capture refund migration expected one canonical conflict refund block';
  END IF;

  EXECUTE replace(replace(v_definition, v_old_replay, v_new_replay), v_old_refund, v_new_refund);
END
$migration$;

-- CREATE OR REPLACE retains the existing function's grants; state the service-only contract explicitly.
REVOKE ALL ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, NUMERIC) TO service_role;


-- A rejected capture never becomes booking consideration, including while its refund
-- is failed or unknown. Ordinary cancellation/no-show/admin refunds keep their existing treatment.
DO $migration$
DECLARE
  v_definition TEXT := replace(
    pg_get_functiondef('public.booking_captured_amount(uuid)'::regprocedure),
    E'\r\n', E'\n'
  );
  v_old TEXT := $old$    AND COALESCE(tl.entry_type, 'booking_payment') = 'booking_payment';$old$;
  v_new TEXT := $new$    AND COALESCE(tl.entry_type, 'booking_payment') = 'booking_payment'
    AND NOT EXISTS (
      SELECT 1
      FROM public.refund_requests r
      WHERE r.ledger_id = tl.id
        AND r.source = 'late_payment_conflict'
    );$new$;
BEGIN
  v_old := replace(v_old, E'\r\n', E'\n');
  v_new := replace(v_new, E'\r\n', E'\n');
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Booking capture refund migration expected one canonical captured-amount filter';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END
$migration$;
