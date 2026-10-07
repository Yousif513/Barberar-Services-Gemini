-- FIX-BOOKING item 7a (D10 / C-D10): the waitlist "exclusive claim" becomes real.
--
-- Defects reproduced on the base commit:
--   * after a cancellation the first waitlister became `notified`, then a stranger booked the freed slot straight away (create_booking returned
--     pending_payment): nothing held the slot;
--   * after the window passed, claim_waitlist_slot raised "Claim window has expired" and the `UPDATE ... 'expired'` before the RAISE was rolled back, so the row
--     stayed `notified`, the next waitlister stayed `active`, and the first customer could not re-join that service and date;
--   * claim_waitlist_slot only flipped a flag; no booking was ever tied to the claim;
--   * the offer is a WhatsApp message, but joining did not require a verified phone or WhatsApp consent (the message is then skipped).
--
-- Rules implemented:
--   * When a waitlister is notified, the freed window of the cancelled booking (professional + blocked window) is HELD for them. get_available_slots does not
--     offer a held window to anyone else (and booking validation uses get_available_slots, so create_booking, the any-professional pick and reschedule agree).
--   * A held offer is used up by the holder's own booking of that window (or by passing the offer id: p_waitlist_claim_id / request_waitlist_claim_id, which
--     must be the caller's own, open, unexpired offer for the same professional, service and exact time). The entry becomes `claimed` with claimed_booking_id.
--   * claim_waitlist_slot(offer) validates the offer and returns what the screen needs to book it (slot, professional, expiry); an expired offer is swept and
--     RETURNED as {success:false, status:'expired'} (a RAISE would roll the sweep back).
--   * expire_waitlist_claims() (scheduler / service role) marks overdue offers `expired` and offers the same slot to the next `active` entry, if the slot is still
--     free and in the future; it is scheduled every minute where pg_cron exists.
--   * The claim window is platform_settings key `waitlist_claim_minutes`; UNSET keeps the existing 15 minutes (the value the customer copy already promises).
--   * join_waitlist requires a verified phone number and an active WhatsApp consent, and compares the date on the Riyadh calendar.

ALTER TABLE public.waitlists
  ADD COLUMN IF NOT EXISTS held_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS held_window TSTZRANGE,
  ADD COLUMN IF NOT EXISTS held_slot_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS held_from_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_waitlists_holds ON public.waitlists(held_employee_id, expires_at) WHERE status = 'notified';

CREATE OR REPLACE FUNCTION public.waitlist_claim_minutes()
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(COALESCE((public.platform_setting('waitlist_claim_minutes'))::text::int, 15), 1);
$$;
REVOKE ALL ON FUNCTION public.waitlist_claim_minutes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_claim_minutes() TO service_role;

-- ---------------------------------------------------------------------------
-- Sweeper: expire overdue offers, offer the slot to the next in line
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waitlist_sweep()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.waitlists;
  v_next public.waitlists;
  v_customer RECORD;
  v_vars JSONB;
  v_count INT := 0;
BEGIN
  FOR v_old IN
    SELECT * FROM public.waitlists
    WHERE status = 'notified' AND expires_at IS NOT NULL AND expires_at <= now()
    ORDER BY expires_at
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.waitlists SET status = 'expired' WHERE id = v_old.id;
    v_count := v_count + 1;

    -- Offer the same slot onward only while it is still in the future and still free.
    IF v_old.held_window IS NULL OR v_old.held_slot_start IS NULL OR v_old.held_slot_start <= now() THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = v_old.held_employee_id AND b.status IN ('confirmed', 'pending_payment')
        AND b.booking_window && v_old.held_window
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_next
    FROM public.waitlists n
    WHERE n.status = 'active'
      AND n.branch_id = v_old.branch_id
      AND n.preferred_date = v_old.preferred_date
      AND n.service_id = v_old.service_id
      AND n.preferred_time_start <= (v_old.held_slot_start AT TIME ZONE 'Asia/Riyadh')::time
      AND n.preferred_time_end >= (v_old.held_slot_start AT TIME ZONE 'Asia/Riyadh')::time
      AND (n.employee_id IS NULL OR n.employee_id = v_old.held_employee_id)
      AND n.customer_id <> v_old.customer_id
    ORDER BY n.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_next.id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.waitlists
    SET status = 'notified', notified_at = now(), expires_at = now() + make_interval(mins => public.waitlist_claim_minutes()),
        held_employee_id = v_old.held_employee_id, held_window = v_old.held_window,
        held_slot_start = v_old.held_slot_start, held_from_booking_id = v_old.held_from_booking_id
    WHERE id = v_next.id;

    SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
    INTO v_customer FROM public.profiles WHERE id = v_next.customer_id;

    IF v_customer.phone_number IS NOT NULL AND v_old.held_from_booking_id IS NOT NULL THEN
      v_vars := public.booking_message_variables(v_old.held_from_booking_id, v_customer.lang)
        || jsonb_build_object(
             'claim_url', 'https://primora.sa/shop/' ||
               (SELECT provider_id FROM public.branches WHERE id = v_old.branch_id)::text ||
               '?claim_waitlist=' || v_next.id::text,
             'expires_minutes', public.waitlist_claim_minutes()::text);
      INSERT INTO public.message_queue (recipient_phone, recipient_id, channel, template_name, locale,
                                        variables, scheduled_for, status)
      VALUES (v_customer.phone_number, v_customer.id, 'whatsapp', 'waitlist_slot_opened', v_customer.lang,
              v_vars, now(), 'pending');
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.waitlist_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_sweep() TO service_role;

CREATE OR REPLACE FUNCTION public.expire_waitlist_claims()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the scheduler can expire waitlist offers' USING ERRCODE = '42501';
  END IF;
  RETURN public.waitlist_sweep();
END;
$$;
REVOKE ALL ON FUNCTION public.expire_waitlist_claims() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_claims() TO service_role;

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'primora-expire-waitlist-claims';
    PERFORM cron.schedule('primora-expire-waitlist-claims', '* * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.expire_waitlist_claims(); $job$);
  ELSE
    RAISE NOTICE 'pg_cron not available: run public.expire_waitlist_claims() every minute from an external scheduler.';
  END IF;
END
$outer$;

-- ---------------------------------------------------------------------------
-- claim_waitlist_slot: validate the offer and hand the screen what it needs; expiry is persisted, not rolled back
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_waitlist_slot(p_waitlist_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_wl public.waitlists;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_wl FROM public.waitlists WHERE id = p_waitlist_id FOR UPDATE;
  IF v_wl.id IS NULL OR v_wl.customer_id <> v_user_id THEN
    RAISE EXCEPTION 'Waitlist entry not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_wl.status = 'claimed' THEN
    RETURN jsonb_build_object('success', TRUE, 'waitlist_id', v_wl.id, 'status', 'claimed', 'booking_id', v_wl.claimed_booking_id);
  END IF;
  IF v_wl.status <> 'notified' THEN
    RAISE EXCEPTION 'This waitlist offer is no longer open (current: %)', v_wl.status USING ERRCODE = '22023';
  END IF;

  IF v_wl.expires_at IS NULL OR v_wl.expires_at <= now() THEN
    PERFORM public.waitlist_sweep();   -- persisted: the function returns instead of raising
    RETURN jsonb_build_object('success', FALSE, 'waitlist_id', v_wl.id, 'status', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'waitlist_id', v_wl.id,
    'status', 'notified',
    'branch_id', v_wl.branch_id,
    'service_id', v_wl.service_id,
    'employee_id', v_wl.held_employee_id,
    'preferred_date', v_wl.preferred_date,
    'slot_start', v_wl.held_slot_start,
    'expires_at', v_wl.expires_at,
    'seconds_left', GREATEST(floor(extract(epoch FROM (v_wl.expires_at - now())))::int, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Function evolution helper (session scoped)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
CREATE FUNCTION pg_temp.evolve_function(p_old regprocedure, p_new_signature text, p_from text[], p_to text[])
RETURNS void LANGUAGE plpgsql AS $helper$
DECLARE
  v_def text := replace(pg_get_functiondef(p_old), $e$
$e$, $e$
$e$);
  v_new regprocedure;
  v_grantee text;
  i int;
BEGIN
  FOR i IN 1 .. COALESCE(array_length(p_from, 1), 0) LOOP
    IF position(replace(p_from[i], $e$
$e$, $e$
$e$) IN v_def) = 0 THEN
      RAISE EXCEPTION 'evolve_function: pattern % not found in %', i, p_old;
    END IF;
    v_def := replace(v_def, replace(p_from[i], $e$
$e$, $e$
$e$), p_to[i]);
  END LOOP;
  EXECUTE v_def;
  v_new := to_regprocedure(p_new_signature);
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'evolve_function: % was not created', p_new_signature;
  END IF;
  IF v_new <> p_old THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_new);
    FOR v_grantee IN
      SELECT DISTINCT r.rolname
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE p.oid = p_old::oid AND a.privilege_type = 'EXECUTE'
        AND r.rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_new, v_grantee);
    END LOOP;
    EXECUTE format('DROP FUNCTION %s', p_old);
  END IF;
END
$helper$;

-- Cancellation backfill: record what is held, use the configurable window
SELECT pg_temp.evolve_function(
  'public.backfill_waitlist_on_cancellation()'::regprocedure,
  'public.backfill_waitlist_on_cancellation()',
  ARRAY[
    $e$  SET status = 'notified', notified_at = now(), expires_at = now() + interval '15 minutes'
  WHERE id = v_candidate.id;$e$,
    $e$'expires_minutes', '15');$e$
  ],
  ARRAY[
    $e$  SET status = 'notified', notified_at = now(), expires_at = now() + make_interval(mins => public.waitlist_claim_minutes()),
      held_employee_id = OLD.employee_id, held_window = OLD.booking_window, held_slot_start = OLD.scheduled_at,
      held_from_booking_id = OLD.id
  WHERE id = v_candidate.id;$e$,
    $e$'expires_minutes', public.waitlist_claim_minutes()::text);$e$
  ]);

-- join_waitlist: a verified phone and WhatsApp consent, Riyadh calendar date
SELECT pg_temp.evolve_function(
  'public.join_waitlist(uuid, uuid, uuid, date, time, time)'::regprocedure,
  'public.join_waitlist(uuid, uuid, uuid, date, time, time)',
  ARRAY[
    $e$    IF p_preferred_date < CURRENT_DATE THEN$e$
  ],
  ARRAY[
    $e$    IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_user_id AND pr.phone_verified AND pr.phone_number IS NOT NULL) THEN
        RAISE EXCEPTION 'Verify your phone number to join a waitlist, so that we can message you when a slot opens' USING ERRCODE = '22023';
    END IF;
    IF NOT public.has_active_consent(v_user_id, 'whatsapp') THEN
        RAISE EXCEPTION 'Allow WhatsApp messages to join a waitlist: the offer is sent by message' USING ERRCODE = '22023';
    END IF;

    IF p_preferred_date < (now() AT TIME ZONE 'Asia/Riyadh')::date THEN$e$
  ]);

-- get_available_slots: a window held for another customer's waitlist offer is not available
SELECT pg_temp.evolve_function(
  'public.get_available_slots(uuid, date, integer, timestamptz[], timestamptz[], integer, integer, uuid)'::regprocedure,
  'public.get_available_slots(uuid, date, integer, timestamptz[], timestamptz[], integer, integer, uuid)',
  ARRAY[
    $e$            AND b.id IS DISTINCT FROM p_ignore_booking_id
        ) THEN$e$
  ],
  ARRAY[
    $e$            AND b.id IS DISTINCT FROM p_ignore_booking_id
        ) AND NOT EXISTS (
          SELECT 1 FROM public.waitlists w
          WHERE w.status = 'notified' AND w.expires_at > now()
            AND w.held_employee_id = target_employee_id
            AND w.held_window && tstzrange(v_slot_time - v_before, v_slot_end + v_after, '[)')
            AND w.customer_id IS DISTINCT FROM auth.uid()
        ) THEN$e$
  ]);

-- booking_create_internal: the offer id, validation, and using the offer up
SELECT pg_temp.evolve_function(
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[])'::regprocedure,
  'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer, timestamptz[], timestamptz[], text, uuid[], uuid)',
  ARRAY[
    $e$p_variant_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS bookings$e$,
    $e$  v_blocked_after INT := 0;
BEGIN$e$,
    $e$  PERFORM public.assert_prayer_windows(p_prayer_window_starts, p_prayer_window_ends);
$e$,
    $e$  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
$e$,
    $e$  IF v_coupon.id IS NOT NULL AND v_coupon_discount > 0 THEN
    UPDATE public.promotional_codes SET redeemed_count$e$
  ],
  ARRAY[
    $e$p_variant_ids uuid[] DEFAULT NULL::uuid[], p_waitlist_claim_id uuid DEFAULT NULL::uuid)
 RETURNS bookings$e$,
    $e$  v_blocked_after INT := 0;
  v_claim public.waitlists;
BEGIN$e$,
    $e$  PERFORM public.assert_prayer_windows(p_prayer_window_starts, p_prayer_window_ends);
  IF p_waitlist_claim_id IS NOT NULL AND v_employee_id IS NULL THEN
    -- a claimed offer is for the professional whose slot was freed
    SELECT w.held_employee_id INTO v_employee_id FROM public.waitlists w WHERE w.id = p_waitlist_claim_id AND w.customer_id = p_customer_id;
  END IF;
$e$,
    $e$  IF p_waitlist_claim_id IS NOT NULL THEN
    SELECT * INTO v_claim FROM public.waitlists w WHERE w.id = p_waitlist_claim_id AND w.customer_id = p_customer_id FOR UPDATE;
    IF v_claim.id IS NULL OR v_claim.status <> 'notified' OR v_claim.expires_at IS NULL OR v_claim.expires_at <= now() THEN
      RAISE EXCEPTION 'This waitlist offer is no longer open' USING ERRCODE = '22023';
    END IF;
    IF v_claim.held_employee_id IS DISTINCT FROM v_employee_id OR v_claim.held_slot_start IS DISTINCT FROM p_scheduled_at
       OR NOT (v_claim.service_id = ANY(p_service_ids)) THEN
      RAISE EXCEPTION 'This waitlist offer is for a different professional, service or time' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
$e$,
    $e$  -- A waitlist offer held for this customer is used up by the booking of its slot (with or without the offer id).
  UPDATE public.waitlists w SET status = 'claimed', claimed_booking_id = v_booking.id
  WHERE w.customer_id = p_customer_id AND w.status = 'notified' AND w.expires_at > now()
    AND w.held_employee_id = v_employee_id AND w.held_window && v_booking.booking_window
    AND (p_waitlist_claim_id IS NULL OR w.id = p_waitlist_claim_id);

  IF v_coupon.id IS NOT NULL AND v_coupon_discount > 0 THEN
    UPDATE public.promotional_codes SET redeemed_count$e$
  ]);

SELECT pg_temp.evolve_function(
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid)'::regprocedure,
  'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text, timestamptz[], timestamptz[], text, uuid, uuid)',
  ARRAY[
    $e$request_variant_id uuid DEFAULT NULL::uuid)
 RETURNS bookings$e$,
    $e$CASE WHEN request_variant_id IS NULL THEN NULL ELSE ARRAY[request_variant_id] END
  );$e$
  ],
  ARRAY[
    $e$request_variant_id uuid DEFAULT NULL::uuid, request_waitlist_claim_id uuid DEFAULT NULL::uuid)
 RETURNS bookings$e$,
    $e$CASE WHEN request_variant_id IS NULL THEN NULL ELSE ARRAY[request_variant_id] END,
    request_waitlist_claim_id
  );$e$
  ]);

SELECT pg_temp.evolve_function(
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text)'::regprocedure,
  'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid, timestamptz[], timestamptz[], text, uuid)',
  ARRAY[
    $e$request_source_token text DEFAULT NULL::text)
 RETURNS jsonb$e$,
    $e$request_source_token, v_variants
  );$e$
  ],
  ARRAY[
    $e$request_source_token text DEFAULT NULL::text, request_waitlist_claim_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb$e$,
    $e$request_source_token, v_variants,
    request_waitlist_claim_id
  );$e$
  ]);

DROP FUNCTION IF EXISTS pg_temp.evolve_function(regprocedure, text, text[], text[]);
