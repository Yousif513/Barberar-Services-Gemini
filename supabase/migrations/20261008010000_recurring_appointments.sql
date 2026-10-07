-- G71 Recurring appointments: a customer turns a confirmed booking into a repeating series with the same professional and service.
--
-- Every occurrence is an ordinary booking made through public.create_booking, so availability, rules, blocks, consents, notifications,
-- payments, ledger and audit are exactly what they are for any other booking. This migration adds the series bookkeeping around it and
-- redefines none of create_booking, cancel_booking, reschedule_booking, booking_create_internal or get_available_slots.
--
-- Payment deadline (read this before changing anything): create_booking makes a booking `pending_payment` whenever a deposit is due, and
-- expire_stale_booking_holds cancels such a booking once the hold window (platform setting booking_hold_minutes, 15 minutes by default)
-- has passed. A regular's later occurrences would therefore vanish minutes after the customer was told they were booked. The rule here:
--   * an occurrence that needs no online payment is confirmed at once and nothing changes;
--   * an occurrence that needs a deposit is kept only when the provider has chosen how long to hold unpaid regular appointments
--     (provider_recurring_settings.payment_hold_hours, unset until the owner decides). The hold then lasts until payment_due_at
--     (the earlier of that many hours after booking and one hour before the visit), the customer is told the deadline when the series
--     is made and again before it lapses, and expire_stale_booking_holds leaves the occurrence alone until payment_due_at passes;
--   * with no hold chosen, the series command refuses (and creates nothing) rather than promising slots the system will release.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_recurring_settings (
  provider_id        UUID PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  max_occurrences    SMALLINT,
  payment_hold_hours SMALLINT,
  updated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recurring_max_occurrences_range CHECK (max_occurrences IS NULL OR max_occurrences BETWEEN 2 AND 26),
  CONSTRAINT recurring_enabled_needs_max CHECK (NOT enabled OR max_occurrences IS NOT NULL),
  CONSTRAINT recurring_payment_hold_range CHECK (payment_hold_hours IS NULL OR payment_hold_hours BETWEEN 1 AND 168)
);

CREATE TABLE IF NOT EXISTS public.booking_series (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           UUID NOT NULL REFERENCES public.profiles(id),
  provider_id           UUID NOT NULL REFERENCES public.providers(id),
  branch_id             UUID NOT NULL REFERENCES public.branches(id),
  employee_id           UUID NOT NULL REFERENCES public.employees(id),
  service_id            UUID NOT NULL REFERENCES public.services(id),
  anchor_booking_id     UUID NOT NULL UNIQUE REFERENCES public.bookings(id),
  interval_weeks        SMALLINT NOT NULL CHECK (interval_weeks BETWEEN 1 AND 8),
  occurrences_requested SMALLINT NOT NULL CHECK (occurrences_requested BETWEEN 2 AND 26),
  skip_unavailable      BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  idempotency_key       TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS booking_series_customer_idx ON public.booking_series (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS booking_series_provider_idx ON public.booking_series (provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.booking_series_occurrences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id           UUID NOT NULL REFERENCES public.booking_series(id) ON DELETE CASCADE,
  occurrence_no       SMALLINT NOT NULL CHECK (occurrence_no >= 1),
  target_at           TIMESTAMPTZ NOT NULL,
  booking_id          UUID UNIQUE REFERENCES public.bookings(id),
  state               TEXT NOT NULL CHECK (state IN ('anchor', 'booked', 'skipped')),
  skip_reason         TEXT,
  payment_due_at      TIMESTAMPTZ,
  payment_reminded_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, occurrence_no),
  CONSTRAINT series_occurrence_booking_matches_state CHECK ((state = 'skipped') = (booking_id IS NULL))
);
CREATE INDEX IF NOT EXISTS booking_series_occurrences_due_idx ON public.booking_series_occurrences (payment_due_at)
  WHERE payment_due_at IS NOT NULL;

ALTER TABLE public.provider_recurring_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_series_occurrences ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Read scope: the customer who owns the series, the provider's owner or a delegate with the bookings operation, the
--    professional who holds one of the occurrences, and administrators. Nobody writes these tables directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_booking_series(p_series_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.booking_series s
    WHERE s.id = p_series_id
      AND (s.customer_id = auth.uid()
           OR public.is_admin()
           OR public.can_access_provider_wide(s.provider_id, 'bookings')
           OR EXISTS (SELECT 1 FROM public.booking_series_occurrences o
                      WHERE o.series_id = s.id AND o.booking_id IS NOT NULL AND public.is_booking_staff(o.booking_id, auth.uid())))
  );
$$;
REVOKE ALL ON FUNCTION public.can_view_booking_series(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_booking_series(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS provider_recurring_settings_read ON public.provider_recurring_settings;
CREATE POLICY provider_recurring_settings_read ON public.provider_recurring_settings FOR SELECT TO authenticated
  USING (public.is_admin() OR public.can_access_provider_wide(provider_id, 'bookings'));

DROP POLICY IF EXISTS booking_series_read ON public.booking_series;
CREATE POLICY booking_series_read ON public.booking_series FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.can_view_booking_series(id));

DROP POLICY IF EXISTS booking_series_occurrences_read ON public.booking_series_occurrences;
CREATE POLICY booking_series_occurrences_read ON public.booking_series_occurrences FOR SELECT TO authenticated
  USING (public.can_view_booking_series(series_id));

-- ---------------------------------------------------------------------------
-- 3. Provider opt-in (owner, or an administrator with a reason). Nothing is enabled by default.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_provider_recurring_settings(
  p_provider_id UUID, p_enabled BOOLEAN, p_max_occurrences INTEGER DEFAULT NULL,
  p_payment_hold_hours INTEGER DEFAULT NULL, p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_is_owner BOOLEAN;
  v_row public.provider_recurring_settings;
  v_max SMALLINT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = p_provider_id;
  v_is_owner := v_owner IS NOT NULL AND v_owner = v_uid;
  IF NOT v_is_owner AND NOT public.is_admin() THEN
    IF v_owner IS NOT NULL AND public.can_access_provider_wide(p_provider_id, 'bookings') THEN
      RAISE EXCEPTION 'Only the provider owner can change recurring appointment settings' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_is_owner AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'The enabled flag is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_occurrences IS NOT NULL AND p_max_occurrences NOT BETWEEN 2 AND 26 THEN
    RAISE EXCEPTION 'The maximum number of appointments must be between 2 and 26' USING ERRCODE = '22023';
  END IF;
  IF p_payment_hold_hours IS NOT NULL AND p_payment_hold_hours NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'The payment hold must be between 1 and 168 hours' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.provider_recurring_settings WHERE provider_id = p_provider_id;
  v_max := COALESCE(p_max_occurrences, v_row.max_occurrences);
  IF p_enabled AND v_max IS NULL THEN
    RAISE EXCEPTION 'The maximum number of appointments is required to enable recurring appointments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_recurring_settings (provider_id, enabled, max_occurrences, payment_hold_hours, updated_by, updated_at)
  VALUES (p_provider_id, p_enabled, v_max, p_payment_hold_hours, v_uid, now())
  ON CONFLICT (provider_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, max_occurrences = EXCLUDED.max_occurrences,
        payment_hold_hours = EXCLUDED.payment_hold_hours, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  PERFORM public.write_audit_log('recurring_settings.updated', 'provider_recurring_settings', p_provider_id,
    jsonb_build_object('enabled', v_row.enabled, 'max_occurrences', v_row.max_occurrences,
                       'payment_hold_hours', v_row.payment_hold_hours, 'by_admin', NOT v_is_owner, 'reason', p_reason));
  RETURN jsonb_build_object('provider_id', v_row.provider_id, 'enabled', v_row.enabled,
                            'max_occurrences', v_row.max_occurrences, 'payment_hold_hours', v_row.payment_hold_hours);
END;
$$;
REVOKE ALL ON FUNCTION public.set_provider_recurring_settings(UUID, BOOLEAN, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_provider_recurring_settings(UUID, BOOLEAN, INTEGER, INTEGER, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Shared guard: who may repeat this booking, and may they
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_series_check_anchor(
  p_booking_id UUID, p_interval_weeks INTEGER, p_occurrences INTEGER,
  OUT o_booking public.bookings, OUT o_provider_id UUID, OUT o_hold_hours INTEGER, OUT o_requires_online_payment BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings public.provider_recurring_settings;
  v_provider public.providers;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_interval_weeks IS NULL OR p_interval_weeks NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'The interval must be between 1 and 8 weeks' USING ERRCODE = '22023';
  END IF;
  IF p_occurrences IS NULL OR p_occurrences < 2 THEN
    RAISE EXCEPTION 'A series needs at least 2 appointments' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO o_booking FROM public.bookings WHERE id = p_booking_id AND customer_id = v_uid;
  IF o_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF o_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only a confirmed booking can be repeated' USING ERRCODE = '22023';
  END IF;
  IF o_booking.scheduled_at <= now() THEN
    RAISE EXCEPTION 'Only an upcoming booking can be repeated' USING ERRCODE = '22023';
  END IF;
  IF o_booking.is_home_service THEN
    RAISE EXCEPTION 'Home visits cannot be repeated yet' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM public.booking_services WHERE booking_id = o_booking.id) > 1 THEN
    RAISE EXCEPTION 'A booking with several services cannot be repeated' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_series_occurrences WHERE booking_id = o_booking.id) THEN
    RAISE EXCEPTION 'This booking already belongs to a series' USING ERRCODE = '23505';
  END IF;

  SELECT p.* INTO v_provider FROM public.branches br JOIN public.providers p ON p.id = br.provider_id WHERE br.id = o_booking.branch_id;
  o_provider_id := v_provider.id;
  SELECT * INTO v_settings FROM public.provider_recurring_settings WHERE provider_id = o_provider_id;
  IF v_settings.provider_id IS NULL OR NOT v_settings.enabled THEN
    RAISE EXCEPTION 'This provider does not offer recurring appointments' USING ERRCODE = '22023';
  END IF;
  IF p_occurrences > v_settings.max_occurrences THEN
    RAISE EXCEPTION 'This provider allows at most % appointments in a series', v_settings.max_occurrences USING ERRCODE = '22023';
  END IF;
  o_hold_hours := v_settings.payment_hold_hours;
  -- The deposit create_booking will ask for, estimated from the anchor's price (discounts on the anchor are not carried over). A deposit
  -- above zero leaves the occurrence pending_payment until paid; a customer with repeated no-shows owes the full amount online.
  -- This is an estimate for the preview only: the create command reads what create_booking really returns.
  o_requires_online_payment := ROUND(o_booking.subtotal_price * COALESCE(v_provider.deposit_percentage, 20) / 100.0, 2) > 0
    OR COALESCE((public.check_customer_booking_eligibility(v_provider.id, v_uid)->>'requires_full_prepayment')::boolean, FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.booking_series_check_anchor(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.booking_series_summary(p_series_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'series_id', s.id, 'status', s.status, 'anchor_booking_id', s.anchor_booking_id,
    'interval_weeks', s.interval_weeks, 'occurrences_requested', s.occurrences_requested,
    'skip_unavailable', s.skip_unavailable,
    'occurrences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'occurrence_no', o.occurrence_no, 'target_at', o.target_at, 'state', o.state, 'booking_id', o.booking_id,
        'skip_reason', o.skip_reason, 'payment_due_at', o.payment_due_at, 'booking_status', b.status) ORDER BY o.occurrence_no)
      FROM public.booking_series_occurrences o LEFT JOIN public.bookings b ON b.id = o.booking_id
      WHERE o.series_id = s.id), '[]'::jsonb))
  FROM public.booking_series s WHERE s.id = p_series_id;
$$;
REVOKE ALL ON FUNCTION public.booking_series_summary(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Preview: writes nothing, tells the customer which dates can be booked and what paying them involves
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_booking_series(p_booking_id UUID, p_interval_weeks INTEGER, p_occurrences INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chk RECORD;
  v_a public.bookings;
  v_target TIMESTAMPTZ;
  v_items JSONB := '[]'::jsonb;
  v_ok BOOLEAN;
  v_all BOOLEAN := TRUE;
  n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_chk FROM public.booking_series_check_anchor(p_booking_id, p_interval_weeks, p_occurrences);
  v_a := v_chk.o_booking;

  FOR n IN 2 .. p_occurrences LOOP
    v_target := ((v_a.scheduled_at AT TIME ZONE 'Asia/Riyadh') + make_interval(days => 7 * p_interval_weeks * (n - 1))) AT TIME ZONE 'Asia/Riyadh';
    v_ok := EXISTS (
      SELECT 1 FROM public.get_available_slots(v_a.employee_id, (v_target AT TIME ZONE 'Asia/Riyadh')::date, v_a.duration_minutes, NULL, NULL,
                                               v_a.blocked_before_minutes, v_a.blocked_after_minutes, NULL) sl
      WHERE sl.slot_start = v_target);
    v_all := v_all AND v_ok;
    v_items := v_items || jsonb_build_object('occurrence_no', n, 'target_at', v_target, 'available', v_ok,
                                             'reason', CASE WHEN v_ok THEN NULL ELSE 'slot_unavailable' END);
  END LOOP;

  RETURN jsonb_build_object(
    'anchor_booking_id', v_a.id, 'interval_weeks', p_interval_weeks, 'occurrences', p_occurrences,
    'all_available', v_all, 'items', v_items,
    'requires_online_payment', v_chk.o_requires_online_payment,
    'payment_hold_hours', v_chk.o_hold_hours,
    'can_create', NOT v_chk.o_requires_online_payment OR v_chk.o_hold_hours IS NOT NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_booking_series(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_booking_series(UUID, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Create the series: the following occurrences, each through create_booking as the customer.
--    auth.uid() inside this definer function still reads the caller's JWT claims, so create_booking sees the customer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_series_from_booking(
  p_booking_id UUID, p_interval_weeks INTEGER, p_occurrences INTEGER,
  p_skip_unavailable BOOLEAN DEFAULT FALSE, p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_series public.booking_series;
  v_chk RECORD;
  v_a public.bookings;
  v_new public.bookings;
  v_target TIMESTAMPTZ;
  v_due TIMESTAMPTZ;
  v_state TEXT;
  v_msg TEXT;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_unpaid INTEGER := 0;
  v_first_due TIMESTAMPTZ;
  n INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'An idempotency key of 8 to 128 characters is required' USING ERRCODE = '22023';
  END IF;

  -- Serialises two requests for the same booking; a request for somebody else's booking locks nothing.
  PERFORM 1 FROM public.bookings WHERE id = p_booking_id AND customer_id = v_uid FOR UPDATE;

  SELECT * INTO v_series FROM public.booking_series WHERE customer_id = v_uid AND idempotency_key = p_idempotency_key;
  IF v_series.id IS NOT NULL THEN
    IF v_series.anchor_booking_id <> p_booking_id OR v_series.interval_weeks <> p_interval_weeks
       OR v_series.occurrences_requested <> p_occurrences THEN
      RAISE EXCEPTION 'This idempotency key was already used for a different series' USING ERRCODE = '23505';
    END IF;
    RETURN public.booking_series_summary(v_series.id) || jsonb_build_object('replayed', TRUE);
  END IF;

  SELECT * INTO v_chk FROM public.booking_series_check_anchor(p_booking_id, p_interval_weeks, p_occurrences);
  v_a := v_chk.o_booking;

  INSERT INTO public.booking_series (customer_id, provider_id, branch_id, employee_id, service_id, anchor_booking_id,
                                     interval_weeks, occurrences_requested, skip_unavailable, idempotency_key)
  VALUES (v_uid, v_chk.o_provider_id, v_a.branch_id, v_a.employee_id, v_a.service_id, v_a.id,
          p_interval_weeks, p_occurrences, COALESCE(p_skip_unavailable, FALSE), p_idempotency_key)
  RETURNING * INTO v_series;
  INSERT INTO public.booking_series_occurrences (series_id, occurrence_no, target_at, booking_id, state)
  VALUES (v_series.id, 1, v_a.scheduled_at, v_a.id, 'anchor');

  FOR n IN 2 .. p_occurrences LOOP
    v_target := ((v_a.scheduled_at AT TIME ZONE 'Asia/Riyadh') + make_interval(days => 7 * p_interval_weeks * (n - 1))) AT TIME ZONE 'Asia/Riyadh';
    BEGIN
      v_new := public.create_booking(
        v_a.employee_id, v_a.service_id, v_target, FALSE, NULL, NULL, v_a.client_profile_id, 'marketplace',
        NULL, NULL, 0, v_a.branch_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      IF v_state = '23P01' AND COALESCE(p_skip_unavailable, FALSE) THEN
        INSERT INTO public.booking_series_occurrences (series_id, occurrence_no, target_at, state, skip_reason)
        VALUES (v_series.id, n, v_target, 'skipped', 'slot_unavailable');
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'Appointment % on % could not be booked: %', n, to_char(v_target AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI'), v_msg
        USING ERRCODE = v_state;
    END;

    v_due := NULL;
    IF v_new.status = 'pending_payment' THEN
      IF v_chk.o_hold_hours IS NULL THEN
        RAISE EXCEPTION 'This provider has not set how long unpaid regular appointments are held, so these appointments would be released within minutes'
          USING ERRCODE = '22023';
      END IF;
      v_due := LEAST(now() + make_interval(hours => v_chk.o_hold_hours), v_target - interval '1 hour');
      v_unpaid := v_unpaid + 1;
      v_first_due := LEAST(COALESCE(v_first_due, v_due), v_due);
    END IF;
    INSERT INTO public.booking_series_occurrences (series_id, occurrence_no, target_at, booking_id, state, payment_due_at)
    VALUES (v_series.id, n, v_target, v_new.id, 'booked', v_due);
    v_created := v_created + 1;
  END LOOP;

  IF v_created = 0 THEN
    RAISE EXCEPTION 'None of the following appointments could be booked' USING ERRCODE = '22023';
  END IF;

  IF v_unpaid > 0 THEN
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (v_uid, 'Pay your regular appointments', 'ادفع مواعيدك المنتظمة',
            'Your regular appointments are held until their payment deadline. Pay each deposit before it, or the appointment is released.',
            'مواعيدك المنتظمة محجوزة حتى موعد الدفع المحدد لكل موعد. ادفع العربون قبله وإلا سيتم إلغاء الموعد.',
            'booking', jsonb_build_object('series_id', v_series.id, 'first_payment_due_at', v_first_due));
  END IF;

  PERFORM public.write_audit_log('booking_series.created', 'booking_series', v_series.id,
    jsonb_build_object('anchor_booking_id', v_a.id, 'interval_weeks', p_interval_weeks, 'occurrences', p_occurrences,
                       'created', v_created, 'skipped', v_skipped, 'awaiting_payment', v_unpaid,
                       'skip_unavailable', COALESCE(p_skip_unavailable, FALSE)));

  RETURN public.booking_series_summary(v_series.id) || jsonb_build_object('replayed', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.create_booking_series_from_booking(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_series_from_booking(UUID, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cancel the rest: this occurrence (p_from) and every later one that has not started, through cancel_booking so the
--    cancellation policy, refunds and audit apply to each. A failure on one occurrence does not stop the others.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_series(p_series_id UUID, p_reason TEXT DEFAULT NULL, p_from TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_series public.booking_series;
  v_from TIMESTAMPTZ := GREATEST(COALESCE(p_from, now()), now());
  v_occ RECORD;
  v_results JSONB := '[]'::jsonb;
  v_cancelled INTEGER := 0;
  v_failed INTEGER := 0;
  v_outcome TEXT;
  v_error TEXT;
  v_is_admin BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  v_is_admin := public.is_admin();
  SELECT * INTO v_series FROM public.booking_series WHERE id = p_series_id FOR UPDATE;
  IF v_series.id IS NULL OR NOT (v_series.customer_id = v_uid OR v_is_admin) THEN
    RAISE EXCEPTION 'Series not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_series.customer_id <> v_uid AND char_length(TRIM(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  FOR v_occ IN
    SELECT o.occurrence_no, o.booking_id, o.state, b.status, b.scheduled_at
    FROM public.booking_series_occurrences o JOIN public.bookings b ON b.id = o.booking_id
    WHERE o.series_id = v_series.id AND b.scheduled_at >= v_from
    ORDER BY o.occurrence_no
  LOOP
    v_error := NULL;
    IF v_occ.status NOT IN ('pending_payment', 'confirmed') THEN
      v_outcome := CASE WHEN v_occ.status = 'cancelled' THEN 'already_cancelled' ELSE 'not_cancellable' END;
    ELSE
      BEGIN
        PERFORM public.cancel_booking(v_occ.booking_id, COALESCE(NULLIF(TRIM(p_reason), ''), 'Regular appointments cancelled'));
        v_outcome := 'cancelled';
        v_cancelled := v_cancelled + 1;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
        v_outcome := 'failed';
        v_failed := v_failed + 1;
      END;
    END IF;
    v_results := v_results || jsonb_build_object('occurrence_no', v_occ.occurrence_no, 'booking_id', v_occ.booking_id,
                                                 'target_at', v_occ.scheduled_at, 'outcome', v_outcome, 'error', v_error);
  END LOOP;

  -- The series is over once nothing upcoming is still active.
  IF v_cancelled > 0 AND NOT EXISTS (
    SELECT 1 FROM public.booking_series_occurrences o JOIN public.bookings b ON b.id = o.booking_id
    WHERE o.series_id = v_series.id AND b.scheduled_at > now() AND b.status IN ('pending_payment', 'confirmed')
  ) THEN
    UPDATE public.booking_series SET status = 'cancelled', cancelled_at = now(),
      cancel_reason = COALESCE(NULLIF(TRIM(p_reason), ''), cancel_reason)
    WHERE id = v_series.id AND status = 'active';
  END IF;

  PERFORM public.write_audit_log('booking_series.cancelled', 'booking_series', v_series.id,
    jsonb_build_object('from', v_from, 'cancelled', v_cancelled, 'failed', v_failed, 'by_admin', v_series.customer_id <> v_uid,
                       'reason', p_reason));
  RETURN jsonb_build_object('series_id', v_series.id, 'cancelled', v_cancelled, 'failed', v_failed, 'results', v_results);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_booking_series(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_series(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Before a held occurrence lapses: tell the customer once. Scheduler or administrator only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_series_payment_reminders(p_within_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  IF NOT (COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the scheduler or an administrator can send payment reminders' USING ERRCODE = '42501';
  END IF;
  IF p_within_hours IS NULL OR p_within_hours NOT BETWEEN 1 AND 168 THEN
    RAISE EXCEPTION 'The reminder window must be between 1 and 168 hours' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN
    SELECT o.id, o.series_id, o.occurrence_no, o.payment_due_at, o.booking_id, s.customer_id
    FROM public.booking_series_occurrences o
    JOIN public.booking_series s ON s.id = o.series_id
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE o.payment_due_at > now() AND o.payment_due_at <= now() + make_interval(hours => p_within_hours)
      AND o.payment_reminded_at IS NULL AND b.status = 'pending_payment'
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    VALUES (v_row.customer_id, 'A regular appointment is about to be released', 'موعد منتظم على وشك الإلغاء',
            'Pay the deposit for your regular appointment before its deadline or it will be released.',
            'ادفع عربون موعدك المنتظم قبل الموعد النهائي وإلا سيتم إلغاؤه.',
            'booking', jsonb_build_object('series_id', v_row.series_id, 'booking_id', v_row.booking_id, 'payment_due_at', v_row.payment_due_at));
    UPDATE public.booking_series_occurrences SET payment_reminded_at = now() WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_series_payment_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_series_payment_reminders(INTEGER) TO authenticated, service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'primora-series-payment-reminders';
    PERFORM cron.schedule('primora-series-payment-reminders', '*/30 * * * *',
      $job$ SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true), public.enqueue_series_payment_reminders(24); $job$);
  END IF;
END
$cron$;

-- ---------------------------------------------------------------------------
-- 9. The hold sweeper leaves a regular's occurrence alone until its own payment deadline (patched in place, not replaced)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), chr(13) || chr(10), chr(10));
BEGIN
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.expire_stale_booking_holds(integer)'::regprocedure,
  $q$      AND created_at < now() - make_interval(mins => v_minutes)
    FOR UPDATE SKIP LOCKED$q$,
  $q$      AND created_at < now() - make_interval(mins => v_minutes)
      AND NOT EXISTS (SELECT 1 FROM public.booking_series_occurrences o
                      WHERE o.booking_id = bookings.id AND o.payment_due_at > now())
    FOR UPDATE SKIP LOCKED$q$);
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);

-- ---------------------------------------------------------------------------
-- 10. Data API privileges and the administrator audit trigger
-- ---------------------------------------------------------------------------
SELECT public.grant_data_api_access('public.provider_recurring_settings');
SELECT public.grant_data_api_access('public.booking_series');
SELECT public.grant_data_api_access('public.booking_series_occurrences');
SELECT public.attach_admin_audit_trigger('public.provider_recurring_settings');
SELECT public.attach_admin_audit_trigger('public.booking_series');
SELECT public.attach_admin_audit_trigger('public.booking_series_occurrences');
