-- RT-M1 (red team 2026-10-17): one account could hold every free slot of a professional, because unpaid (pending_payment)
-- booking holds were unlimited, and every hold consumed a promo-code redemption at once, so holds that were never paid could
-- exhaust a limited code.
--
-- 1. Hold limits per customer (platform_settings 'booking_hold_limits', owner-confirmable): at most 2 open unpaid holds with
--    one business and 3 across the marketplace. A group booking or a series of regular appointments counts as ONE hold (it is
--    one checkout); its guest or occurrence bookings are not counted one by one. The limit is checked after the booking is
--    written, under a per-customer advisory lock, so two parallel requests cannot both pass.
-- 2. Expired holds are released: before counting, the customer's own holds whose payment window has passed are cancelled and
--    their discounts returned, exactly as the 5-minute sweeper (expire_stale_booking_holds) does, so a lapsed hold never
--    blocks the customer and never keeps a slot.
-- 3. A promo-code redemption is consumed (promotional_codes.redeemed_count) only when the booking is paid or needs no payment.
--    An unpaid hold reserves the redemption while the hold is live: the code's availability counts consumed redemptions plus
--    live reservations, so a code is never over-redeemed, and a lapsed hold frees its reservation without touching the count.
--    coupon_redemptions.counted_at records when a redemption was consumed; a release decrements the count only for consumed ones.

CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval)
VALUES ('booking_hold_limits', '{"per_provider": 2, "overall": 3}'::jsonb,
        'Most unpaid booking holds (awaiting the deposit) one customer may keep open at once: per business and across the marketplace. A group booking or a series of regular appointments counts as one hold. Conservative defaults (RT-M1); the owner confirms the values.',
        TRUE)
ON CONFLICT (key) DO NOTHING;

-- Hold counts and the sweep read one customer's unpaid bookings.
CREATE INDEX IF NOT EXISTS idx_bookings_customer_pending ON public.bookings (customer_id, created_at)
  WHERE status = 'pending_payment';

ALTER TABLE public.coupon_redemptions ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ;
-- Every existing redemption was counted when it was recorded.
UPDATE public.coupon_redemptions SET counted_at = redeemed_at WHERE counted_at IS NULL;

CREATE OR REPLACE FUNCTION public.booking_hold_minutes()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.platform_setting('booking_hold_minutes'))::text::int, 15);
$$;
REVOKE ALL ON FUNCTION public.booking_hold_minutes() FROM PUBLIC, anon, authenticated;

-- Open unpaid holds of one customer, counted as checkouts: a group or a series is one hold.
CREATE OR REPLACE FUNCTION public.customer_open_hold_count(p_customer_id UUID, p_provider_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT COALESCE('g:' || gm.group_id::text, 's:' || o.series_id::text, 'b:' || b.id::text))::int
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  LEFT JOIN public.group_booking_members gm ON gm.booking_id = b.id
  LEFT JOIN public.group_bookings gb ON gb.id = gm.group_id
  LEFT JOIN public.booking_series_occurrences o ON o.booking_id = b.id
  WHERE b.customer_id = p_customer_id
    AND b.status = 'pending_payment'
    AND (p_provider_id IS NULL OR br.provider_id = p_provider_id)
    AND (b.created_at >= now() - make_interval(mins => public.booking_hold_minutes())
         OR gb.payment_due_at > now() OR o.payment_due_at > now());
$$;
REVOKE ALL ON FUNCTION public.customer_open_hold_count(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Releases one customer's lapsed holds, with the same rule and effects as expire_stale_booking_holds.
CREATE OR REPLACE FUNCTION public.release_customer_expired_holds(p_customer_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_booking IN
    SELECT b.id FROM public.bookings b
    WHERE b.customer_id = p_customer_id
      AND b.status = 'pending_payment'
      AND b.created_at < now() - make_interval(mins => public.booking_hold_minutes())
      AND NOT EXISTS (SELECT 1 FROM public.group_booking_members gm JOIN public.group_bookings gb ON gb.id = gm.group_id
                      WHERE gm.booking_id = b.id AND gb.payment_due_at > now())
      AND NOT EXISTS (SELECT 1 FROM public.booking_series_occurrences o
                      WHERE o.booking_id = b.id AND o.payment_due_at > now())
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'system', cancellation_reason = 'Payment hold expired'
    WHERE id = v_booking.id;
    PERFORM public.booking_release_discounts(v_booking.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.release_customer_expired_holds(UUID) FROM PUBLIC, anon, authenticated;

-- Refuses the operation when, after it, the customer would keep more open holds than allowed. p_bundle_end: called by a group
-- or series command once all its bookings are written (inside a bundle the single-booking check is skipped).
CREATE OR REPLACE FUNCTION public.assert_booking_hold_capacity(p_customer_id UUID, p_provider_id UUID, p_bundle_end BOOLEAN DEFAULT FALSE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limits JSONB := public.platform_setting('booking_hold_limits');
  v_per_provider INTEGER;
  v_overall INTEGER;
BEGIN
  IF NOT p_bundle_end AND COALESCE(current_setting('primora.hold_bundle', true), '') = 'on' THEN
    RETURN;
  END IF;
  IF p_customer_id IS NULL THEN
    RETURN;
  END IF;
  v_per_provider := CASE WHEN jsonb_typeof(v_limits -> 'per_provider') = 'number' THEN GREATEST((v_limits ->> 'per_provider')::int, 1) ELSE 2 END;
  v_overall := CASE WHEN jsonb_typeof(v_limits -> 'overall') = 'number' THEN GREATEST((v_limits ->> 'overall')::int, 1) ELSE 3 END;

  PERFORM pg_advisory_xact_lock(hashtextextended('booking_holds:' || p_customer_id::text, 0));
  PERFORM public.release_customer_expired_holds(p_customer_id);

  IF public.customer_open_hold_count(p_customer_id, p_provider_id) > v_per_provider THEN
    RAISE EXCEPTION 'You already have % unpaid bookings with this business. Pay the deposit for one of them or cancel it, then book again', v_per_provider
      USING ERRCODE = 'P0001', HINT = 'booking_hold_limit';
  END IF;
  IF public.customer_open_hold_count(p_customer_id, NULL) > v_overall THEN
    RAISE EXCEPTION 'You already have % unpaid bookings. Pay the deposit for one of them or cancel it, then book again', v_overall
      USING ERRCODE = 'P0001', HINT = 'booking_hold_limit';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_booking_hold_capacity(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Live (unpaid, not lapsed) reservations of a promo code.
CREATE OR REPLACE FUNCTION public.coupon_live_reservations(p_coupon_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.coupon_redemptions cr
  JOIN public.bookings b ON b.id = cr.booking_id
  LEFT JOIN public.group_booking_members gm ON gm.booking_id = b.id
  LEFT JOIN public.group_bookings gb ON gb.id = gm.group_id
  LEFT JOIN public.booking_series_occurrences o ON o.booking_id = b.id
  WHERE cr.coupon_id = p_coupon_id AND cr.reversed_at IS NULL AND cr.counted_at IS NULL
    AND b.status = 'pending_payment'
    AND (b.created_at >= now() - make_interval(mins => public.booking_hold_minutes())
         OR gb.payment_due_at > now() OR o.payment_due_at > now());
$$;
REVOKE ALL ON FUNCTION public.coupon_live_reservations(UUID) FROM PUBLIC, anon, authenticated;

-- Consumes a redemption once its booking is paid or needs no payment.
CREATE OR REPLACE FUNCTION public.count_coupon_redemption_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.counted_at IS NULL AND NEW.reversed_at IS NULL
     AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = NEW.booking_id AND b.status IN ('confirmed', 'completed')) THEN
    NEW.counted_at := now();
    UPDATE public.promotional_codes SET redeemed_count = redeemed_count + 1, updated_at = now() WHERE id = NEW.coupon_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.count_coupon_redemption_on_insert() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_count_coupon_redemption_on_insert ON public.coupon_redemptions;
CREATE TRIGGER trg_count_coupon_redemption_on_insert
  BEFORE INSERT ON public.coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.count_coupon_redemption_on_insert();

CREATE OR REPLACE FUNCTION public.count_coupon_redemptions_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_coupon UUID;
BEGIN
  FOR v_coupon IN
    UPDATE public.coupon_redemptions SET counted_at = now()
     WHERE booking_id = NEW.id AND counted_at IS NULL AND reversed_at IS NULL
    RETURNING coupon_id
  LOOP
    UPDATE public.promotional_codes SET redeemed_count = redeemed_count + 1, updated_at = now() WHERE id = v_coupon;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.count_coupon_redemptions_on_payment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_count_coupon_redemptions_on_payment ON public.bookings;
CREATE TRIGGER trg_count_coupon_redemptions_on_payment
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending_payment' AND NEW.status IN ('confirmed', 'completed'))
  EXECUTE FUNCTION public.count_coupon_redemptions_on_payment();

-- booking_create_internal: availability counts live reservations; no consumption at hold time; the hold limit after the write.
SELECT pg_temp.patch_function('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions)$from$,
$to$OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count + public.coupon_live_reservations(v_coupon.id) >= v_coupon.max_redemptions)$to$);
SELECT pg_temp.patch_function('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$    UPDATE public.promotional_codes SET redeemed_count = redeemed_count + 1, updated_at = now()
    WHERE id = v_coupon.id;
$from$,
$to$    -- RT-M1: consumed when the booking is paid or needs no payment (trg_count_coupon_redemption_on_insert and
    -- trg_count_coupon_redemptions_on_payment); an unpaid hold only reserves it.
$to$);
SELECT pg_temp.patch_function('public.booking_create_internal(uuid,uuid,uuid,uuid[],timestamp with time zone,boolean,numeric,numeric,text,uuid,text,text,text,integer,timestamp with time zone[],timestamp with time zone[],text,uuid[],uuid,uuid,numeric)'::regprocedure,
$from$    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Selected time is no longer available' USING ERRCODE = '23P01';
  END;
$from$,
$to$    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Selected time is no longer available' USING ERRCODE = '23P01';
  END;
  -- RT-M1: an unpaid hold must stay within the customer's hold limits (a group or series checks once, at its end).
  IF v_booking.status = 'pending_payment' THEN
    PERFORM public.assert_booking_hold_capacity(p_customer_id, v_provider_id);
  END IF;
$to$);

-- The coupon preview answers with the same availability rule.
SELECT pg_temp.patch_function('public.validate_and_apply_coupon(text,uuid,numeric)'::regprocedure,
$from$OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions)$from$,
$to$OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count + public.coupon_live_reservations(v_coupon.id) >= v_coupon.max_redemptions)$to$);

-- A release returns the count only for a consumed redemption.
SELECT pg_temp.patch_function('public.booking_release_discounts(uuid)'::regprocedure,
$from$    UPDATE public.promotional_codes
    SET redeemed_count = GREATEST(redeemed_count - 1, 0)
    WHERE id = v_redemption.coupon_id;$from$,
$to$    UPDATE public.promotional_codes
    SET redeemed_count = GREATEST(redeemed_count - 1, 0)
    WHERE id = v_redemption.coupon_id AND v_redemption.counted_at IS NOT NULL;$to$);

-- Group bookings and series: the whole checkout is one hold, checked once all its bookings exist.
SELECT pg_temp.patch_function('public.create_group_booking(uuid,date,group_occasion,text,jsonb,text,timestamp with time zone[],timestamp with time zone[])'::regprocedure,
$from$  SELECT * INTO v_chk FROM public.group_booking_check_request(p_branch_id, p_event_date, v_n);
$from$,
$to$  SELECT * INTO v_chk FROM public.group_booking_check_request(p_branch_id, p_event_date, v_n);
  PERFORM set_config('primora.hold_bundle', 'on', true);
$to$);
SELECT pg_temp.patch_function('public.create_group_booking(uuid,date,group_occasion,text,jsonb,text,timestamp with time zone[],timestamp with time zone[])'::regprocedure,
$from$  RETURN public.group_booking_summary(v_group.id) || jsonb_build_object('replayed', FALSE);$from$,
$to$  PERFORM set_config('primora.hold_bundle', '', true);
  PERFORM public.assert_booking_hold_capacity(v_uid, v_chk.o_provider_id, TRUE);
  RETURN public.group_booking_summary(v_group.id) || jsonb_build_object('replayed', FALSE);$to$);
SELECT pg_temp.patch_function('public.create_booking_series_from_booking(uuid,integer,integer,boolean,text)'::regprocedure,
$from$  v_a := v_chk.o_booking;
$from$,
$to$  v_a := v_chk.o_booking;
  PERFORM set_config('primora.hold_bundle', 'on', true);
$to$);
SELECT pg_temp.patch_function('public.create_booking_series_from_booking(uuid,integer,integer,boolean,text)'::regprocedure,
$from$  RETURN public.booking_series_summary(v_series.id) || jsonb_build_object('replayed', FALSE);$from$,
$to$  PERFORM set_config('primora.hold_bundle', '', true);
  PERFORM public.assert_booking_hold_capacity(v_uid, v_chk.o_provider_id, TRUE);
  RETURN public.booking_series_summary(v_series.id) || jsonb_build_object('replayed', FALSE);$to$);

-- Chat rate limits (20261018200000) answer 400 like every other refusal, not 500 (PostgREST maps class 54 to 500).
SELECT pg_temp.patch_function('public.start_conversation(uuid,text)'::regprocedure,
$from$USING ERRCODE = '54000', HINT = 'chat_rate_limited'$from$, $to$USING ERRCODE = 'P0001', HINT = 'chat_rate_limited'$to$);
SELECT pg_temp.patch_function('public.send_message(uuid,text)'::regprocedure,
$from$USING ERRCODE = '54000', HINT = 'chat_rate_limited'$from$, $to$USING ERRCODE = 'P0001', HINT = 'chat_rate_limited'$to$);
