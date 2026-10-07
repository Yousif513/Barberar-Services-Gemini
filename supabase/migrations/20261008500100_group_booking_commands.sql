-- G52 Group booking commands: preview (writes nothing), create (one transaction, all-or-nothing), cancel the group, cancel one guest.
--
-- Each guest is booked by calling public.create_booking (one service) or public.create_multi_service_booking (several services, the same
-- engine behind create_booking) AS THE HOST: inside a SECURITY DEFINER function auth.uid() still reads the caller's JWT claims, so every
-- availability check, hold, rule, block, consent and notification is the one an ordinary booking gets. The command is one statement of
-- one transaction: any guest that fails raises, which rolls back every booking made before it and the group itself.
-- Payment stays per booking through the existing flow; the host reads the sum of deposits due from group_booking_payment_summary.

-- ---------------------------------------------------------------------------
-- 1. Guest list parsing (shared by preview and create). Touches no table.
--    Each guest: {label?, client_profile_id?, services: [{service_id, variant_id?}], employee_id?, scheduled_at?}
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_booking_parse_guests(p_guests JSONB, p_require_time BOOLEAN)
RETURNS TABLE (seq INTEGER, label TEXT, client_profile_id UUID, service_ids UUID[], variant_ids UUID[], employee_id UUID, scheduled_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_svc JSONB;
  n INTEGER := 0;
  v_ids UUID[];
  v_vars UUID[];
  v_sid UUID;
BEGIN
  IF p_guests IS NULL OR jsonb_typeof(p_guests) <> 'array' OR jsonb_array_length(p_guests) = 0 THEN
    RAISE EXCEPTION 'The guest list must be a non-empty array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_guests) > 30 THEN
    RAISE EXCEPTION 'A group has at most 30 guests' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_guests) LOOP
    n := n + 1;
    BEGIN
      IF jsonb_typeof(v_item) <> 'object' THEN
        RAISE EXCEPTION 'Guest % must be an object', n USING ERRCODE = '22023';
      END IF;
      seq := n;
      label := NULLIF(btrim(COALESCE(v_item->>'label', '')), '');
      IF label IS NOT NULL AND char_length(label) > 80 THEN
        RAISE EXCEPTION 'The name of guest % is longer than 80 characters', n USING ERRCODE = '22023';
      END IF;
      client_profile_id := NULLIF(v_item->>'client_profile_id', '')::uuid;
      employee_id := NULLIF(v_item->>'employee_id', '')::uuid;
      scheduled_at := NULLIF(v_item->>'scheduled_at', '')::timestamptz;
      IF p_require_time AND scheduled_at IS NULL THEN
        RAISE EXCEPTION 'Guest % needs a start time', n USING ERRCODE = '22023';
      END IF;

      IF jsonb_typeof(v_item->'services') IS DISTINCT FROM 'array'
         OR jsonb_array_length(v_item->'services') NOT BETWEEN 1 AND 6 THEN
        RAISE EXCEPTION 'Guest % needs between 1 and 6 services', n USING ERRCODE = '22023';
      END IF;
      v_ids := ARRAY[]::uuid[];
      v_vars := ARRAY[]::uuid[];
      FOR v_svc IN SELECT value FROM jsonb_array_elements(v_item->'services') LOOP
        IF jsonb_typeof(v_svc) <> 'object' THEN
          RAISE EXCEPTION 'Guest % has a service that is not an object', n USING ERRCODE = '22023';
        END IF;
        v_sid := (v_svc->>'service_id')::uuid;
        IF v_sid IS NULL THEN
          RAISE EXCEPTION 'Guest % has a service without an id', n USING ERRCODE = '22023';
        END IF;
        v_ids := array_append(v_ids, v_sid);
        v_vars := array_append(v_vars, NULLIF(v_svc->>'variant_id', '')::uuid);
      END LOOP;
      IF (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) x) <> array_length(v_ids, 1) THEN
        RAISE EXCEPTION 'Guest % lists the same service twice', n USING ERRCODE = '22023';
      END IF;
      service_ids := v_ids;
      variant_ids := v_vars;
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Guest % has a value that is not valid', n USING ERRCODE = '22023';
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.group_booking_parse_guests(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Shared guard: the branch, the provider's opt-in and the size limit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_booking_check_request(
  p_branch_id UUID, p_event_date DATE, p_guest_count INTEGER,
  OUT o_provider_id UUID, OUT o_max_size INTEGER, OUT o_hold_hours INTEGER, OUT o_requires_full_prepayment BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_settings public.provider_group_settings;
  v_elig JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'The event date is required' USING ERRCODE = '22023';
  END IF;
  IF p_event_date < (now() AT TIME ZONE 'Asia/Riyadh')::date THEN
    RAISE EXCEPTION 'The event date cannot be in the past' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = p_branch_id AND COALESCE(br.is_active, TRUE);
  IF v_provider.id IS NULL THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE(v_provider.is_verified, FALSE) THEN
    RAISE EXCEPTION 'This provider is not accepting bookings' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings FROM public.provider_group_settings WHERE provider_id = v_provider.id;
  IF v_settings.provider_id IS NULL OR NOT v_settings.enabled THEN
    RAISE EXCEPTION 'This provider does not offer group bookings' USING ERRCODE = '22023';
  END IF;
  IF p_guest_count < 2 THEN
    RAISE EXCEPTION 'A group needs at least 2 guests' USING ERRCODE = '22023';
  END IF;
  IF p_guest_count > v_settings.max_group_size THEN
    RAISE EXCEPTION 'This provider allows at most % guests in a group', v_settings.max_group_size USING ERRCODE = '22023';
  END IF;

  v_elig := public.check_customer_booking_eligibility(v_provider.id, v_uid);
  IF (v_elig->>'is_blocked')::boolean THEN
    RAISE EXCEPTION 'You cannot book with this provider. Please contact the provider directly.' USING ERRCODE = '42501';
  END IF;

  o_provider_id := v_provider.id;
  o_max_size := v_settings.max_group_size;
  o_hold_hours := v_settings.payment_hold_hours;
  o_requires_full_prepayment := COALESCE((v_elig->>'requires_full_prepayment')::boolean, FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.group_booking_check_request(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Summary of one group (used by create, replay and the screens that want one answer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_booking_summary(p_group_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'group_id', g.id, 'status', g.status, 'provider_id', g.provider_id, 'branch_id', g.branch_id,
    'event_date', g.event_date, 'occasion', g.occasion, 'headcount', g.headcount, 'payment_due_at', g.payment_due_at,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sequence', m.sequence, 'guest_label', m.guest_label, 'booking_id', b.id, 'booking_status', b.status,
        'scheduled_at', b.scheduled_at, 'employee_id', b.employee_id, 'deposit_required', b.deposit_required,
        'total_price', b.total_price, 'tax_amount', b.tax_amount) ORDER BY m.sequence)
      FROM public.group_booking_members m JOIN public.bookings b ON b.id = m.booking_id
      WHERE m.group_id = g.id), '[]'::jsonb),
    'payment', (
      SELECT jsonb_build_object(
        'deposit_due', COALESCE(SUM(b.deposit_required) FILTER (WHERE b.status = 'pending_payment'), 0),
        'awaiting_payment', COUNT(*) FILTER (WHERE b.status = 'pending_payment'),
        'confirmed', COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'completed')),
        'cancelled', COUNT(*) FILTER (WHERE b.status = 'cancelled'))
      FROM public.group_booking_members m JOIN public.bookings b ON b.id = m.booking_id
      WHERE m.group_id = g.id))
  FROM public.group_bookings g WHERE g.id = p_group_id;
$$;
REVOKE ALL ON FUNCTION public.group_booking_summary(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Preview: suggests an assignment from real availability and writes nothing.
--    Guests are placed in order. A guest with a preferred time gets it when a professional is free, otherwise the nearest free
--    slot; a guest without one gets the earliest free slot. A professional is never placed twice in overlapping windows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_group_booking(
  p_branch_id UUID, p_event_date DATE, p_guests JSONB,
  p_prayer_window_starts TIMESTAMPTZ[] DEFAULT NULL, p_prayer_window_ends TIMESTAMPTZ[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chk RECORD;
  v_g RECORD;
  v_pick RECORD;
  v_n INTEGER;
  v_items JSONB := '[]'::jsonb;
  v_busy_emp UUID[] := ARRAY[]::uuid[];
  v_busy_rng TSTZRANGE[] := ARRAY[]::tstzrange[];
  v_all BOOLEAN := TRUE;
  v_subtotal NUMERIC(10,2) := 0;
  v_available BOOLEAN;
  v_reason TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT COUNT(*)::integer INTO v_n FROM public.group_booking_parse_guests(p_guests, FALSE);
  SELECT * INTO v_chk FROM public.group_booking_check_request(p_branch_id, p_event_date, v_n);

  FOR v_g IN SELECT * FROM public.group_booking_parse_guests(p_guests, FALSE) ORDER BY seq LOOP
    SELECT s.slot_start AS slot, c.emp_id, c.dur, vp.blocked_before_minutes AS bb, vp.blocked_after_minutes AS ba, vp.total_price AS price
    INTO v_pick
    FROM public.get_branch_available_slots(p_branch_id, v_g.service_ids[1], p_event_date, p_prayer_window_starts,
                                           p_prayer_window_ends, v_g.service_ids, v_g.variant_ids, NULL) s
    CROSS JOIN LATERAL unnest(s.candidate_employee_ids, s.candidate_duration_minutes) AS c(emp_id, dur)
    CROSS JOIN LATERAL public.booking_visit_profile(c.emp_id, v_g.service_ids, v_g.variant_ids) vp
    WHERE vp.is_valid
      AND (v_g.employee_id IS NULL OR c.emp_id = v_g.employee_id)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(v_busy_emp, v_busy_rng) AS b(e, r)
        WHERE b.e = c.emp_id
          AND b.r && tstzrange(s.slot_start - make_interval(mins => vp.blocked_before_minutes),
                               s.slot_start + make_interval(mins => c.dur + vp.blocked_after_minutes), '[)'))
    ORDER BY CASE WHEN v_g.scheduled_at IS NULL THEN 0 ELSE ABS(EXTRACT(EPOCH FROM (s.slot_start - v_g.scheduled_at))) END,
             s.slot_start,
             (SELECT COUNT(*) FROM unnest(v_busy_emp) x WHERE x = c.emp_id),
             c.emp_id
    LIMIT 1;

    v_available := v_pick.emp_id IS NOT NULL;
    IF v_available THEN
      v_busy_emp := array_append(v_busy_emp, v_pick.emp_id);
      v_busy_rng := array_append(v_busy_rng, tstzrange(v_pick.slot - make_interval(mins => v_pick.bb),
                                                      v_pick.slot + make_interval(mins => v_pick.dur + v_pick.ba), '[)'));
      v_subtotal := v_subtotal + COALESCE(v_pick.price, 0);
      v_reason := CASE WHEN v_g.scheduled_at IS NOT NULL AND v_pick.slot <> v_g.scheduled_at THEN 'preferred_time_unavailable' END;
    ELSE
      v_all := FALSE;
      v_reason := 'no_availability';
    END IF;

    v_items := v_items || jsonb_build_object(
      'sequence', v_g.seq, 'label', v_g.label, 'client_profile_id', v_g.client_profile_id,
      'employee_id', v_pick.emp_id, 'scheduled_at', v_pick.slot, 'duration_minutes', v_pick.dur,
      'subtotal_sar', v_pick.price, 'available', v_available,
      'matched_preference', v_available AND (v_g.scheduled_at IS NULL OR v_pick.slot = v_g.scheduled_at),
      'reason', v_reason);
  END LOOP;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id, 'provider_id', v_chk.o_provider_id, 'event_date', p_event_date,
    'guest_count', v_n, 'guests', v_items, 'all_available', v_all, 'can_create', v_all,
    'max_group_size', v_chk.o_max_size, 'payment_hold_hours', v_chk.o_hold_hours,
    'standard_hold_minutes', COALESCE((public.platform_setting('booking_hold_minutes'))::text::int, 15),
    'requires_full_prepayment', v_chk.o_requires_full_prepayment, 'subtotal_sar', v_subtotal);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_group_booking(UUID, DATE, JSONB, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_group_booking(UUID, DATE, JSONB, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Create the group. One transaction: the group, then every guest through create_booking as the host, then the members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_booking(
  p_branch_id UUID, p_event_date DATE, p_occasion public.group_occasion, p_notes TEXT, p_guests JSONB,
  p_idempotency_key TEXT,
  p_prayer_window_starts TIMESTAMPTZ[] DEFAULT NULL, p_prayer_window_ends TIMESTAMPTZ[] DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_notes TEXT := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_fingerprint TEXT;
  v_group public.group_bookings;
  v_chk RECORD;
  v_g RECORD;
  v_n INTEGER;
  v_label TEXT;
  v_booking public.bookings;
  v_json JSONB;
  v_state TEXT;
  v_msg TEXT;
  v_unpaid INTEGER := 0;
  v_confirmed INTEGER := 0;
  v_first_pending TIMESTAMPTZ;
  v_due TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'An idempotency key of 8 to 128 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_occasion IS NULL THEN
    RAISE EXCEPTION 'The occasion is required' USING ERRCODE = '22023';
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'The notes are longer than 1000 characters' USING ERRCODE = '22023';
  END IF;

  -- Two requests with the same key wait for each other, so the second one finds the first one's group.
  PERFORM pg_advisory_xact_lock(hashtextextended('group_booking:' || v_uid::text || ':' || p_idempotency_key, 0));

  v_fingerprint := md5(concat_ws('|', p_branch_id::text, p_event_date::text, p_occasion::text, COALESCE(v_notes, ''), COALESCE(p_guests::text, '')));
  SELECT * INTO v_group FROM public.group_bookings WHERE host_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_group.id IS NOT NULL THEN
    IF v_group.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'This idempotency key was already used for a different group' USING ERRCODE = '23505';
    END IF;
    RETURN public.group_booking_summary(v_group.id) || jsonb_build_object('replayed', TRUE);
  END IF;

  SELECT COUNT(*)::integer INTO v_n FROM public.group_booking_parse_guests(p_guests, TRUE);
  SELECT * INTO v_chk FROM public.group_booking_check_request(p_branch_id, p_event_date, v_n);

  INSERT INTO public.group_bookings (host_id, provider_id, branch_id, event_date, occasion, headcount, notes,
                                     request_fingerprint, idempotency_key)
  VALUES (v_uid, v_chk.o_provider_id, p_branch_id, p_event_date, p_occasion, v_n, v_notes, v_fingerprint, p_idempotency_key)
  RETURNING * INTO v_group;

  FOR v_g IN SELECT * FROM public.group_booking_parse_guests(p_guests, TRUE) ORDER BY seq LOOP
    IF (v_g.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date <> p_event_date THEN
      RAISE EXCEPTION 'Guest % must be booked on the event date', v_g.seq USING ERRCODE = '22023';
    END IF;

    v_label := v_g.label;
    IF v_g.client_profile_id IS NOT NULL THEN
      SELECT COALESCE(v_g.label, cp.name::text) INTO v_label
      FROM public.client_profiles cp WHERE cp.id = v_g.client_profile_id AND cp.client_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Guest % uses a saved profile that was not found', v_g.seq USING ERRCODE = 'P0002';
      END IF;
    END IF;
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Guest % needs a name or a saved profile', v_g.seq USING ERRCODE = '22023';
    END IF;

    BEGIN
      IF array_length(v_g.service_ids, 1) = 1 THEN
        v_booking := public.create_booking(
          target_employee_id := v_g.employee_id, target_service_id := v_g.service_ids[1],
          target_scheduled_at := v_g.scheduled_at, request_client_profile_id := v_g.client_profile_id,
          request_branch_id := p_branch_id, prayer_window_starts := p_prayer_window_starts,
          prayer_window_ends := p_prayer_window_ends, request_variant_id := v_g.variant_ids[1]);
      ELSE
        v_json := public.create_multi_service_booking(
          target_branch_id := p_branch_id, target_employee_id := v_g.employee_id, target_scheduled_at := v_g.scheduled_at,
          services_payload := (SELECT jsonb_agg(jsonb_build_object('service_id', sid, 'variant_id', vid) ORDER BY n)
                               FROM unnest(v_g.service_ids, v_g.variant_ids) WITH ORDINALITY AS t(sid, vid, n)),
          request_client_profile_id := v_g.client_profile_id, prayer_window_starts := p_prayer_window_starts,
          prayer_window_ends := p_prayer_window_ends);
        SELECT * INTO v_booking FROM public.bookings WHERE id = (v_json->>'booking_id')::uuid;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      RAISE EXCEPTION 'Guest % could not be booked: %', v_g.seq, v_msg USING ERRCODE = v_state;
    END;

    INSERT INTO public.group_booking_members (group_id, booking_id, guest_label, sequence)
    VALUES (v_group.id, v_booking.id, v_label, v_g.seq);

    IF v_booking.status = 'pending_payment' THEN
      v_unpaid := v_unpaid + 1;
      v_first_pending := LEAST(COALESCE(v_first_pending, v_booking.scheduled_at), v_booking.scheduled_at);
    ELSE
      v_confirmed := v_confirmed + 1;
    END IF;
  END LOOP;

  -- With a provider-chosen hold the unpaid guest bookings are kept until the deadline (the hold sweeper reads payment_due_at);
  -- without one the platform's standard hold window applies to each of them.
  IF v_unpaid > 0 AND v_chk.o_hold_hours IS NOT NULL THEN
    v_due := LEAST(now() + make_interval(hours => v_chk.o_hold_hours), v_first_pending - interval '1 hour');
    UPDATE public.group_bookings SET payment_due_at = v_due WHERE id = v_group.id;
  END IF;

  IF v_unpaid > 0 THEN
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (v_uid, 'Pay the deposits for your group booking', 'ادفع عربون حجزك الجماعي',
            'Each guest booking needs its own deposit. Unpaid guest bookings are released when their payment time runs out.',
            'يحتاج كل حجز لضيف إلى عربون خاص به. يتم إلغاء الحجوزات غير المدفوعة عند انتهاء مهلة الدفع.',
            'booking', jsonb_build_object('group_id', v_group.id, 'payment_due_at', v_due));
  END IF;

  PERFORM public.write_audit_log('group_booking.created', 'group_bookings', v_group.id,
    jsonb_build_object('headcount', v_n, 'occasion', p_occasion, 'event_date', p_event_date,
                       'awaiting_payment', v_unpaid, 'confirmed', v_confirmed));
  RETURN public.group_booking_summary(v_group.id) || jsonb_build_object('replayed', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.create_group_booking(UUID, DATE, public.group_occasion, TEXT, JSONB, TEXT, TIMESTAMPTZ[], TIMESTAMPTZ[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_booking(UUID, DATE, public.group_occasion, TEXT, JSONB, TEXT, TIMESTAMPTZ[], TIMESTAMPTZ[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Cancelling goes through cancel_booking for every guest, so the cancellation policy, refunds and audit apply to each.
--    A failure on one guest does not stop the others; the answer lists each guest's outcome.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_booking_cancel_members(p_group_id UUID, p_only_booking_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m RECORD;
  v_results JSONB := '[]'::jsonb;
  v_cancelled INTEGER := 0;
  v_failed INTEGER := 0;
  v_outcome TEXT;
  v_error TEXT;
BEGIN
  FOR v_m IN
    SELECT m.sequence, m.booking_id, b.status, b.scheduled_at
    FROM public.group_booking_members m JOIN public.bookings b ON b.id = m.booking_id
    WHERE m.group_id = p_group_id AND (p_only_booking_id IS NULL OR m.booking_id = p_only_booking_id)
    ORDER BY m.sequence
  LOOP
    v_error := NULL;
    IF v_m.status = 'cancelled' THEN
      v_outcome := 'already_cancelled';
    ELSIF v_m.status NOT IN ('pending_payment', 'confirmed') THEN
      v_outcome := 'not_cancellable';
    ELSIF p_only_booking_id IS NULL AND v_m.scheduled_at <= now() THEN
      v_outcome := 'not_cancellable';
    ELSE
      BEGIN
        PERFORM public.cancel_booking(v_m.booking_id, COALESCE(NULLIF(btrim(p_reason), ''), 'Group booking cancelled'));
        v_outcome := 'cancelled';
        v_cancelled := v_cancelled + 1;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
        v_outcome := 'failed';
        v_failed := v_failed + 1;
      END;
    END IF;
    v_results := v_results || jsonb_build_object('sequence', v_m.sequence, 'booking_id', v_m.booking_id,
                                                 'scheduled_at', v_m.scheduled_at, 'outcome', v_outcome, 'error', v_error);
  END LOOP;

  -- The group is over once none of its guest bookings is still alive.
  IF v_cancelled > 0 AND NOT EXISTS (
    SELECT 1 FROM public.group_booking_members m JOIN public.bookings b ON b.id = m.booking_id
    WHERE m.group_id = p_group_id AND b.status <> 'cancelled'
  ) THEN
    UPDATE public.group_bookings SET status = 'cancelled', cancelled_at = now(),
      cancel_reason = COALESCE(NULLIF(btrim(p_reason), ''), cancel_reason)
    WHERE id = p_group_id AND status = 'active';
  END IF;

  RETURN jsonb_build_object('group_id', p_group_id, 'cancelled', v_cancelled, 'failed', v_failed, 'results', v_results);
END;
$$;
REVOKE ALL ON FUNCTION public.group_booking_cancel_members(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_group_booking(p_group_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group public.group_bookings;
  v_is_host BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_group FROM public.group_bookings WHERE id = p_group_id FOR UPDATE;
  v_is_host := v_group.id IS NOT NULL AND v_group.host_id = v_uid;
  IF v_group.id IS NULL OR NOT (v_is_host OR public.group_booking_provider_access(v_group.provider_id)) THEN
    RAISE EXCEPTION 'Group booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_host AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  v_result := public.group_booking_cancel_members(v_group.id, NULL, p_reason);

  PERFORM public.write_audit_log('group_booking.cancelled', 'group_bookings', v_group.id,
    jsonb_build_object('cancelled', v_result->'cancelled', 'failed', v_result->'failed', 'by_provider', NOT v_is_host,
                       'reason', p_reason));
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_group_booking(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_group_booking(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_group_member(p_booking_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_group public.group_bookings;
  v_is_host BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT g.* INTO v_group
  FROM public.group_booking_members m JOIN public.group_bookings g ON g.id = m.group_id
  WHERE m.booking_id = p_booking_id
  FOR UPDATE OF g;
  v_is_host := v_group.id IS NOT NULL AND v_group.host_id = v_uid;
  IF v_group.id IS NULL OR NOT (v_is_host OR public.group_booking_provider_access(v_group.provider_id)) THEN
    RAISE EXCEPTION 'Group booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_host AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  v_result := public.group_booking_cancel_members(v_group.id, p_booking_id, p_reason);

  PERFORM public.write_audit_log('group_booking.member_cancelled', 'group_bookings', v_group.id,
    jsonb_build_object('booking_id', p_booking_id, 'cancelled', v_result->'cancelled', 'failed', v_result->'failed',
                       'by_provider', NOT v_is_host, 'reason', p_reason));
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_group_member(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_group_member(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Administrators count groups; they do not read them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_group_booking_counts()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'groups_total', COUNT(*),
    'groups_active', COUNT(*) FILTER (WHERE status = 'active'),
    'groups_cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
    'guests_total', COALESCE(SUM(headcount), 0),
    'by_occasion', jsonb_build_object(
      'wedding', COUNT(*) FILTER (WHERE occasion = 'wedding'),
      'family', COUNT(*) FILTER (WHERE occasion = 'family'),
      'party', COUNT(*) FILTER (WHERE occasion = 'party'),
      'other', COUNT(*) FILTER (WHERE occasion = 'other')),
    'providers_enabled', (SELECT COUNT(*) FROM public.provider_group_settings WHERE enabled))
  INTO v_result FROM public.group_bookings;
  PERFORM public.write_audit_log('admin.group_booking_counts.viewed', 'group_bookings', NULL, '{}'::jsonb);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_group_booking_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_group_booking_counts() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. The hold sweeper leaves a guest booking alone until its group's payment deadline (patched in place, not replaced)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
BEGIN
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

DO $do$
BEGIN
  -- Applied once: a second run finds the clause already in place and leaves the function alone.
  IF position('group_booking_members' IN pg_get_functiondef('public.expire_stale_booking_holds(integer)'::regprocedure)) = 0 THEN
    PERFORM pg_temp.patch_function('public.expire_stale_booking_holds(integer)'::regprocedure,
      $q$AND created_at < now() - make_interval(mins => v_minutes)$q$,
      $q$AND created_at < now() - make_interval(mins => v_minutes)
      AND NOT EXISTS (SELECT 1 FROM public.group_booking_members gm JOIN public.group_bookings gb ON gb.id = gm.group_id
                      WHERE gm.booking_id = bookings.id AND gb.payment_due_at > now())$q$);
  END IF;
END
$do$;
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
