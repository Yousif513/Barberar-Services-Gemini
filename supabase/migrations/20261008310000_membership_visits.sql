-- G65 Memberships, part 2: redeeming an included visit against a booking, voiding it, expiry, and the pre-expiry reminder.
--
-- Redemption follows redeem_package_session: the same permission test (provider owner, an active employee, an administrator, or a delegate with the
-- bookings permission), the booking must belong to the member at this provider and contain a covered service, and one booking carries one live redemption.
-- Unlike a package session a membership visit is always tied to a booking (no free-floating redemptions), and a booking already paid by a package session is refused.
-- Revenue was recognised at purchase; a redemption records delivery only and writes no ledger row.
--
-- Scheduling: expire_memberships() and send_membership_expiry_reminders(days) are plain functions for the service role or an administrator. No cron job
-- is created here (no earlier migration schedules jobs with pg_cron); the owner configures a schedule, see docs/work-packages/member-report.md.

-- ---------------------------------------------------------------------------
-- 1. Redeem a visit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_membership_visit(p_membership_id UUID, p_booking_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_row public.memberships;
  v_booking public.bookings;
  v_redemption_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_membership_staff(v_row.provider_id) THEN
    -- The member learns it is not theirs to redeem; everyone else is told the membership does not exist.
    IF v_row.customer_id = v_user THEN
      RAISE EXCEPTION 'Only the provider staff can record a membership visit' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
    RAISE EXCEPTION 'Notes are limited to 500 characters' USING ERRCODE = '22023';
  END IF;

  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'This membership is not active' USING ERRCODE = '22023';
  END IF;
  IF now() < v_row.period_start THEN
    RAISE EXCEPTION 'This membership period has not started yet' USING ERRCODE = '22023';
  END IF;
  IF now() >= v_row.period_end THEN
    RAISE EXCEPTION 'This membership has expired' USING ERRCODE = '22023';
  END IF;
  IF v_row.visits_remaining <= 0 THEN
    RAISE EXCEPTION 'No included visits remain on this membership' USING ERRCODE = '22023';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'A booking is required to redeem a membership visit' USING ERRCODE = '22023';
  END IF;
  SELECT b.* INTO v_booking FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
   WHERE b.id = p_booking_id AND br.provider_id = v_row.provider_id;
  IF v_booking.id IS NULL OR v_booking.customer_id IS DISTINCT FROM v_row.customer_id THEN
    RAISE EXCEPTION 'The booking does not belong to this member at this provider' USING ERRCODE = '22023';
  END IF;
  IF v_booking.status::TEXT NOT IN ('confirmed', 'completed') THEN
    RAISE EXCEPTION 'Only a confirmed or completed booking can use a membership visit' USING ERRCODE = '22023';
  END IF;
  IF v_booking.user_package_id IS NOT NULL THEN
    RAISE EXCEPTION 'This booking is already covered by a package session' USING ERRCODE = '22023';
  END IF;
  IF NOT v_row.covers_all_services AND NOT EXISTS (
    SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = p_booking_id AND bs.service_id = ANY (v_row.covered_service_ids)
  ) THEN
    RAISE EXCEPTION 'This membership does not cover the services of the booking' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.membership_redemptions (membership_id, booking_id, customer_id, provider_id, redeemed_by, notes)
    VALUES (v_row.id, p_booking_id, v_row.customer_id, v_row.provider_id, v_user, NULLIF(btrim(COALESCE(p_notes, '')), ''))
    RETURNING id INTO v_redemption_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A membership visit was already recorded for this booking' USING ERRCODE = '23505';
  END;
  UPDATE public.memberships SET visits_remaining = visits_remaining - 1, updated_at = now() WHERE id = v_row.id;
  PERFORM public.write_audit_log('membership.visit_redeemed', 'memberships', v_row.id,
    jsonb_build_object('booking_id', p_booking_id, 'redemption_id', v_redemption_id, 'remaining', v_row.visits_remaining - 1));

  RETURN jsonb_build_object('success', TRUE, 'membership_id', v_row.id, 'redemption_id', v_redemption_id,
                            'visits_remaining', v_row.visits_remaining - 1);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.void_membership_redemption(p_redemption_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user UUID := auth.uid();
  v_red public.membership_redemptions;
  v_row public.memberships;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_red FROM public.membership_redemptions WHERE id = p_redemption_id;
  IF v_red.id IS NULL THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = v_red.membership_id FOR UPDATE;
  IF NOT public.is_membership_staff(v_row.provider_id) THEN
    IF v_row.customer_id = v_user THEN
      RAISE EXCEPTION 'Only the provider staff can void a membership visit' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Redemption not found' USING ERRCODE = 'P0002';
  END IF;
  -- Re-read under the membership lock so two voids of the same visit cannot both restore it.
  SELECT * INTO v_red FROM public.membership_redemptions WHERE id = p_redemption_id;
  IF v_red.voided_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'redemption_id', v_red.id, 'visits_remaining', v_row.visits_remaining, 'replayed', TRUE);
  END IF;
  UPDATE public.membership_redemptions SET voided_at = now(), voided_by = v_user, void_reason = btrim(p_reason) WHERE id = v_red.id;
  -- The visit goes back only while the membership can still be used; on an ended membership it stays spent.
  IF v_row.status = 'active' THEN
    UPDATE public.memberships SET visits_remaining = LEAST(visits_per_period, visits_remaining + 1), updated_at = now() WHERE id = v_row.id;
  END IF;
  PERFORM public.write_audit_log('membership.visit_voided', 'memberships', v_row.id,
    jsonb_build_object('redemption_id', v_red.id, 'booking_id', v_red.booking_id, 'restored', v_row.status = 'active'));
  RETURN jsonb_build_object('success', TRUE, 'redemption_id', v_red.id,
                            'visits_remaining', CASE WHEN v_row.status = 'active' THEN LEAST(v_row.visits_per_period, v_row.visits_remaining + 1) ELSE v_row.visits_remaining END);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Expiry and reminders (service role or administrator; run on a schedule the owner configures)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_memberships()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'Service role or administrator required' USING ERRCODE = '42501';
  END IF;
  -- The end of the period is exclusive: at period_end the membership is over.
  WITH due AS (
    SELECT id FROM public.memberships WHERE status = 'active' AND period_end <= now() FOR UPDATE SKIP LOCKED
  )
  UPDATE public.memberships m SET status = 'expired', updated_at = now() FROM due WHERE m.id = due.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM public.write_audit_log('membership.expired_batch', 'memberships', NULL, jsonb_build_object('count', v_count));
  END IF;
  RETURN jsonb_build_object('success', TRUE, 'expired', v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.send_membership_expiry_reminders(p_days_ahead INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'Service role or administrator required' USING ERRCODE = '42501';
  END IF;
  -- The lead time is the owner's decision; there is no default.
  IF p_days_ahead IS NULL OR p_days_ahead NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'The reminder lead time must be between 1 and 60 days' USING ERRCODE = '22023';
  END IF;
  WITH due AS (
    SELECT m.id FROM public.memberships m
     WHERE m.status = 'active' AND m.reminder_sent_at IS NULL
       AND m.period_end > now() AND m.period_end <= now() + make_interval(days => p_days_ahead)
       -- Nothing to remind about when a paid renewal already follows this period.
       AND NOT EXISTS (SELECT 1 FROM public.memberships r WHERE r.renewal_of = m.id AND r.status = 'active')
     FOR UPDATE SKIP LOCKED
  ), marked AS (
    UPDATE public.memberships m SET reminder_sent_at = now() FROM due WHERE m.id = due.id
    RETURNING m.id, m.customer_id, m.plan_name_en, m.plan_name_ar, m.period_end, m.visits_remaining
  ), sent AS (
    INSERT INTO public.notifications (user_id, title_en, title_ar, body_en, body_ar, type, data)
    SELECT customer_id, 'Your membership ends soon', 'تنتهي عضويتك قريباً',
           'Your membership ' || plan_name_en || ' ends on ' || to_char(period_end AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') || '. Renew to keep your included visits.',
           'تنتهي عضويتك ' || plan_name_ar || ' بتاريخ ' || to_char(period_end AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') || '. جدد للاستمرار في زياراتك المشمولة.',
           'membership', jsonb_build_object('membership_id', id, 'kind', 'expiry_reminder')
      FROM marked
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_count FROM sent;
  IF v_count > 0 THEN
    PERFORM public.write_audit_log('membership.reminders_sent', 'memberships', NULL, jsonb_build_object('count', v_count, 'days_ahead', p_days_ahead));
  END IF;
  RETURN jsonb_build_object('success', TRUE, 'reminded', v_count);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Provider read models (members with names, bookings a visit can be redeemed against). Privileged reads are audited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_provider_memberships(p_provider_id UUID, p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS TABLE (
  membership_id UUID, customer_id UUID, customer_name TEXT, status TEXT, plan_name_en TEXT, plan_name_ar TEXT,
  visits_remaining INTEGER, visits_per_period INTEGER, period_start TIMESTAMPTZ, period_end TIMESTAMPTZ, amount_due NUMERIC,
  covers_all_services BOOLEAN, total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_membership_staff(p_provider_id) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending_payment', 'active', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown membership status' USING ERRCODE = '22023';
  END IF;
  -- Member names are personal data: every read of the member list is recorded.
  PERFORM public.write_audit_log('membership.members_listed', 'providers', p_provider_id,
    jsonb_build_object('status_filter', p_status, 'offset', COALESCE(p_offset, 0)));
  RETURN QUERY
  SELECT m.id, m.customer_id, NULLIF(btrim(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), ''), m.status,
         m.plan_name_en, m.plan_name_ar, m.visits_remaining, m.visits_per_period, m.period_start, m.period_end, m.amount_due,
         m.covers_all_services, count(*) OVER ()
    FROM public.memberships m
    LEFT JOIN public.profiles pr ON pr.id = m.customer_id
   WHERE m.provider_id = p_provider_id AND (p_status IS NULL OR m.status = p_status)
   ORDER BY (m.status = 'active') DESC, m.period_end DESC NULLS LAST, m.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_membership_redeemable_bookings(p_membership_id UUID)
RETURNS TABLE (booking_id UUID, scheduled_at TIMESTAMPTZ, status TEXT, service_names TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.memberships;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_row FROM public.memberships WHERE id = p_membership_id;
  IF v_row.id IS NULL OR NOT public.is_membership_staff(v_row.provider_id) THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT b.id, b.scheduled_at, b.status::TEXT,
         (SELECT string_agg(s.name_en, ', ' ORDER BY s.name_en) FROM public.booking_services bs JOIN public.services s ON s.id = bs.service_id WHERE bs.booking_id = b.id)
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
   WHERE br.provider_id = v_row.provider_id AND b.customer_id = v_row.customer_id
     AND b.status::TEXT IN ('confirmed', 'completed') AND b.user_package_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.membership_redemptions r WHERE r.booking_id = b.id AND r.voided_at IS NULL)
     AND (v_row.covers_all_services OR EXISTS (SELECT 1 FROM public.booking_services bs WHERE bs.booking_id = b.id AND bs.service_id = ANY (v_row.covered_service_ids)))
   ORDER BY b.scheduled_at DESC
   LIMIT 50;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.redeem_membership_visit(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_membership_redemption(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_memberships() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_membership_expiry_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_provider_memberships(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_membership_redeemable_bookings(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_membership_visit(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_membership_redemption(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_memberships() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_membership_expiry_reminders(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_provider_memberships(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_membership_redeemable_bookings(UUID) TO authenticated;
