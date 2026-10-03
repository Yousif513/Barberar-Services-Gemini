-- Migration: 20261003190000_booking_hold_expiry.sql
-- Implements booking hold expiry (E2) and late webhook handling with slot availability check / auto-refund (E3-E5)

-- 1. Function to expire stale pending_payment booking holds
CREATE OR REPLACE FUNCTION public.expire_stale_booking_holds(
  hold_interval_minutes INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INT := 0;
BEGIN
  -- Expire pending_payment bookings created older than the hold window
  WITH expired_rows AS (
    UPDATE public.bookings
    SET status = 'cancelled'
    WHERE status = 'pending_payment'
      AND created_at < NOW() - (hold_interval_minutes || ' minutes')::INTERVAL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired_rows;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_booking_holds(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_booking_holds(INT) TO authenticated, service_role;

-- 2. Update confirm_booking_payment to handle holds, late webhooks, and slot conflicts
DROP FUNCTION IF EXISTS public.confirm_booking_payment(UUID, TEXT, DECIMAL);

CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  target_booking_id UUID,
  target_payment_intent_id TEXT,
  target_total_captured DECIMAL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_platform_share DECIMAL(10,2);
  v_provider_share DECIMAL(10,2);
  v_conflict_exists BOOLEAN := FALSE;
  v_existing_ledger public.transactional_ledger;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = target_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF target_total_captured <> v_booking.deposit_required THEN
    RAISE EXCEPTION 'Captured amount does not match the required deposit'
      USING ERRCODE = '22003';
  END IF;

  -- Verify payment intent uniqueness across bookings
  SELECT *
  INTO v_existing_ledger
  FROM public.transactional_ledger
  WHERE payment_intent_id = target_payment_intent_id;

  IF v_existing_ledger.id IS NOT NULL AND v_existing_ledger.booking_id <> target_booking_id THEN
    RAISE EXCEPTION 'Payment intent is already assigned to another booking'
      USING ERRCODE = '23505';
  END IF;

  -- Idempotency: if already confirmed and ledger row matches
  IF v_booking.status = 'confirmed' AND v_existing_ledger.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'already_confirmed',
      'conflict', false,
      'booking_id', v_booking.id
    );
  END IF;

  -- Check if booking was cancelled (e.g. hold expired before payment landed)
  IF v_booking.status = 'cancelled' THEN
    -- Check if another confirmed or completed booking took the specialist slot
    SELECT EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.employee_id = v_booking.employee_id
        AND b.id <> v_booking.id
        AND b.status IN ('confirmed', 'completed')
        AND tstzrange(b.scheduled_at, b.scheduled_at + (b.duration_minutes || ' minutes')::INTERVAL) &&
            tstzrange(v_booking.scheduled_at, v_booking.scheduled_at + (v_booking.duration_minutes || ' minutes')::INTERVAL)
    ) INTO v_conflict_exists;

    IF v_conflict_exists THEN
      -- Slot conflict! We cannot double-book the professional.
      -- Record ledger entry marked for refund
      INSERT INTO public.transactional_ledger (
        booking_id,
        payment_intent_id,
        total_captured,
        platform_share,
        provider_share,
        payout_status
      )
      VALUES (
        v_booking.id,
        target_payment_intent_id,
        target_total_captured,
        0.00,
        0.00,
        'pending_refund'
      )
      ON CONFLICT (payment_intent_id) DO NOTHING;

      RETURN jsonb_build_object(
        'success', false,
        'status', 'slot_taken_refund_required',
        'conflict', true,
        'customer_id', v_booking.customer_id,
        'booking_id', v_booking.id
      );
    END IF;

    -- Slot is still free! Re-confirm booking despite hold timeout.
    UPDATE public.bookings
    SET status = 'confirmed'
    WHERE id = v_booking.id;
  ELSIF v_booking.status = 'pending_payment' THEN
    UPDATE public.bookings
    SET status = 'confirmed'
    WHERE id = v_booking.id;
  END IF;

  v_platform_share := LEAST(v_booking.platform_commission, target_total_captured);
  v_provider_share := target_total_captured - v_platform_share;

  INSERT INTO public.transactional_ledger (
    booking_id,
    payment_intent_id,
    total_captured,
    platform_share,
    provider_share,
    payout_status
  )
  VALUES (
    v_booking.id,
    target_payment_intent_id,
    target_total_captured,
    v_platform_share,
    v_provider_share,
    'pending'
  )
  ON CONFLICT (payment_intent_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'confirmed',
    'conflict', false,
    'booking_id', v_booking.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_payment(UUID, TEXT, DECIMAL)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, DECIMAL)
TO service_role;
