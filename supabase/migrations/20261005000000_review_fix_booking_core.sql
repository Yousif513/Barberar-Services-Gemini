-- Migration: 20261005000000_review_fix_booking_core.sql
-- Corrective pass after the 2026-10-04 review of P0–P2 (see docs/reviews/2026-10-04-gemini-p0-p2-review.md).
-- Replaces the booking engine functions that failed at runtime with one internally consistent core:
--   * one audit writer over public.admin_audit_logs (the singular admin_audit_log table never existed)
--   * one create_booking (no overloads) that applies source fees, VAT, provider deposit policy,
--     block/no-show rules, and coupon / loyalty / gift-card discounts server-side
--   * cancel / no-show / reschedule / staff status with policy, refunds and audit
--   * messaging, rewards and waitlist triggers that reference real columns
--   * hold expiry restricted to service_role/admin
--   * provider control fields (status, verification) protected from owners

-- ---------------------------------------------------------------------------
-- 0. Platform settings (business values that need owner approval live here, not in code)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  requires_owner_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads platform settings" ON public.platform_settings;
CREATE POLICY "Anyone reads platform settings"
  ON public.platform_settings FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "Admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins manage platform settings"
  ON public.platform_settings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('booking_hold_minutes', '15'::jsonb,
   'Minutes an unpaid pending_payment booking holds its slot before it is released.', FALSE),
  ('loyalty_program',
   '{"enabled": false, "points_per_sar": 0.1, "sar_per_point": 0.1, "min_redeem_points": 100,
     "tiers": {"silver": 500, "gold": 1500, "platinum": 3000},
     "multipliers": {"bronze": 1.0, "silver": 1.25, "gold": 1.5, "platinum": 2.0}}'::jsonb,
   'Provider-scoped loyalty points. Redemption is a provider-funded discount, so it stays disabled until the owner approves the values.', TRUE),
  ('referral_program', '{"enabled": false, "reward_sar": 25}'::jsonb,
   'Platform-funded referral wallet credit for referrer and referee after the referee''s first completed visit. Disabled until the owner approves the amount.', TRUE)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_setting(p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.platform_settings WHERE key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- 1. Audit writer (single table, single column set)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    p_action,
    p_target_type,
    p_target_id,
    COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('actor_role', COALESCE(auth.jwt()->>'role', 'unknown'))
  );
$$;

-- Audit rows are written only by server functions; direct inserts from any client role are removed.
DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_logs;

-- ---------------------------------------------------------------------------
-- 2. Schema additions
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS subtotal_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.promotional_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gift_card_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discounts_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_name TEXT,
  ADD COLUMN IF NOT EXISTS walk_in_phone TEXT;

-- Walk-in visitors may have no PRIMORA account; every other booking still needs a customer.
ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_customer_required_unless_walk_in;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_customer_required_unless_walk_in
  CHECK (customer_id IS NOT NULL OR source = 'walk_in');

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_cancelled_by_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'provider', 'admin', 'system'));

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT;

ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE public.gift_card_redemptions
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE public.transactional_ledger
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'booking_payment',
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.transactional_ledger ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_entry_type_check;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_entry_type_check
  CHECK (entry_type IN ('booking_payment', 'tip', 'package_sale', 'gift_card_sale', 'subscription',
                        'gift_card_settlement', 'platform_discount_settlement'));
ALTER TABLE public.transactional_ledger DROP CONSTRAINT IF EXISTS transactional_ledger_booking_required;
ALTER TABLE public.transactional_ledger ADD CONSTRAINT transactional_ledger_booking_required
  CHECK (booking_id IS NOT NULL OR entry_type IN ('package_sale', 'gift_card_sale', 'subscription'));

UPDATE public.transactional_ledger tl
SET provider_id = br.provider_id
FROM public.bookings b
JOIN public.branches br ON br.id = b.branch_id
WHERE tl.booking_id = b.id AND tl.provider_id IS NULL;


-- ---------------------------------------------------------------------------
-- 3. Provider control fields: owners can edit their profile and policies,
--    never their approval status, verification, commission or CR verification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_provider_control_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := auth.uid();
    NEW.status := 'pending';
    NEW.is_verified := FALSE;
    NEW.commission_percentage := 15.00;
    NEW.admin_notes := NULL;
    NEW.cr_verification_status := NULL;
    NEW.cr_verified_at := NULL;
    NEW.cr_wathq_data := NULL;
  ELSE
    NEW.owner_id := OLD.owner_id;
    NEW.status := OLD.status;
    NEW.is_verified := OLD.is_verified;
    NEW.commission_percentage := OLD.commission_percentage;
    NEW.admin_notes := OLD.admin_notes;
    NEW.cr_verification_status := OLD.cr_verification_status;
    NEW.cr_verified_at := OLD.cr_verified_at;
    NEW.cr_wathq_data := OLD.cr_wathq_data;
    -- A changed CR number must be verified again.
    IF NEW.cr_number IS DISTINCT FROM OLD.cr_number THEN
      NEW.cr_verification_status := NULL;
      NEW.cr_verified_at := NULL;
      NEW.cr_wathq_data := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Booking immutability: commercial fields stay fixed; scheduling fields may only
--    change inside reschedule_booking (which sets a transaction-local flag).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_booking_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.customer_id, NEW.branch_id, NEW.service_id, NEW.is_home_service,
    NEW.home_address_lat, NEW.home_address_lng, NEW.duration_minutes,
    NEW.total_price, NEW.deposit_required, NEW.tax_amount, NEW.platform_commission,
    NEW.client_profile_id, NEW.subtotal_price, NEW.discount_amount, NEW.coupon_id,
    NEW.gift_card_amount, NEW.loyalty_points_redeemed, NEW.source
  ) IS DISTINCT FROM ROW(
    OLD.customer_id, OLD.branch_id, OLD.service_id, OLD.is_home_service,
    OLD.home_address_lat, OLD.home_address_lng, OLD.duration_minutes,
    OLD.total_price, OLD.deposit_required, OLD.tax_amount, OLD.platform_commission,
    OLD.client_profile_id, OLD.subtotal_price, OLD.discount_amount, OLD.coupon_id,
    OLD.gift_card_amount, OLD.loyalty_points_redeemed, OLD.source
  ) THEN
    RAISE EXCEPTION 'Booking commercial fields are immutable after creation'
      USING ERRCODE = '22000';
  END IF;

  IF (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.employee_id IS DISTINCT FROM OLD.employee_id)
     AND COALESCE(current_setting('primora.reschedule_in_progress', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Booking time and professional can only change through reschedule_booking'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

-- Owners and assigned staff may cancel pending holds as well as confirmed bookings.
CREATE OR REPLACE FUNCTION public.validate_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.customer_id = auth.uid()
     AND OLD.status IN ('pending_payment', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF (
       (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'no_show', 'cancelled'))
       OR (OLD.status = 'pending_payment' AND NEW.status = 'cancelled')
     )
     AND public.is_booking_staff(OLD.id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid booking status transition' USING ERRCODE = '22000';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Shared helpers
-- ---------------------------------------------------------------------------
-- Owner, active provider member, or the assigned professional of a booking.
CREATE OR REPLACE FUNCTION public.is_booking_staff(p_booking_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    JOIN public.providers p ON p.id = br.provider_id
    LEFT JOIN public.employees e ON e.id = b.employee_id
    WHERE b.id = p_booking_id
      AND p_user_id IS NOT NULL
      AND (
        p.owner_id = p_user_id
        OR e.profile_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.provider_memberships m
          WHERE m.provider_id = p.id
            AND m.user_id = p_user_id
            AND COALESCE(m.is_active, TRUE)
            AND (m.branch_id IS NULL OR m.branch_id = b.branch_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_provider_staff(p_provider_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.branches br ON br.id = e.branch_id
      WHERE br.provider_id = p_provider_id AND e.profile_id = p_user_id AND e.is_active
    )
    OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = p_user_id AND COALESCE(m.is_active, TRUE)
    )
  );
$$;

-- Captured, not-yet-refunded online money for a booking (booking payments only).
CREATE OR REPLACE FUNCTION public.booking_captured_amount(p_booking_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(tl.total_captured - COALESCE(tl.refunded_amount, 0)), 0)
  FROM public.transactional_ledger tl
  WHERE tl.booking_id = p_booking_id
    AND COALESCE(tl.entry_type, 'booking_payment') = 'booking_payment';
$$;

-- ---------------------------------------------------------------------------
-- 6. Remove stale overloads that made every call ambiguous
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_available_slots(UUID, DATE, INTEGER);
DROP FUNCTION IF EXISTS public.cancel_booking(UUID);
DROP FUNCTION IF EXISTS public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, NUMERIC, NUMERIC, UUID);
DROP FUNCTION IF EXISTS public.create_booking(UUID, UUID, TIMESTAMPTZ, BOOLEAN, NUMERIC, NUMERIC, UUID, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.create_multi_service_booking(UUID, UUID, TIMESTAMPTZ, JSONB, BOOLEAN, TEXT, CHARACTER VARYING);
DROP FUNCTION IF EXISTS public.create_walk_in_booking(UUID, UUID, UUID, TEXT, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.get_branch_schedule_with_prayer_pauses(UUID, DATE, INTEGER);
DROP FUNCTION IF EXISTS public.calculate_booking_commission(UUID, CHARACTER VARYING, BOOLEAN, NUMERIC);

-- Duplicate post-visit message trigger (the lifecycle trigger already sends review + rebook).
DROP TRIGGER IF EXISTS trigger_enqueue_post_visit_rebook ON public.bookings;
DROP FUNCTION IF EXISTS public.enqueue_post_visit_rebook();

-- ---------------------------------------------------------------------------
-- 7. Customer eligibility (blocks / no-show strikes). Callable by the customer,
--    provider staff, admins and service_role only. Block reasons are never shown to customers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_customer_booking_eligibility(
  p_provider_id UUID,
  p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_staff BOOLEAN;
  v_block public.provider_customer_blocks;
  v_strikes INT := 0;
BEGIN
  v_is_staff := public.is_provider_staff(p_provider_id, v_caller)
                OR public.is_admin()
                OR COALESCE(auth.jwt()->>'role', '') = 'service_role';

  IF NOT v_is_staff AND (v_caller IS NULL OR v_caller <> p_customer_id) THEN
    RAISE EXCEPTION 'Not authorized to view this customer''s booking eligibility' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_block
  FROM public.provider_customer_blocks
  WHERE provider_id = p_provider_id AND customer_id = p_customer_id;

  SELECT COUNT(*) INTO v_strikes
  FROM public.bookings
  WHERE customer_id = p_customer_id
    AND status = 'no_show'
    AND no_show_at >= now() - interval '60 days';

  RETURN jsonb_build_object(
    'is_eligible', v_block.id IS NULL,
    'is_blocked', v_block.id IS NOT NULL,
    'block_reason', CASE WHEN v_is_staff THEN v_block.reason ELSE NULL END,
    'no_show_strikes', v_strikes,
    'requires_full_prepayment', v_strikes >= 3
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_customer_block(
  p_provider_id UUID,
  p_customer_id UUID,
  p_reason TEXT,
  p_block BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = v_user_id)
    OR public.is_admin()
  ) THEN
    RAISE EXCEPTION 'Only the provider owner or an administrator can manage the block list' USING ERRCODE = '42501';
  END IF;

  IF p_block THEN
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'A reason is required to block a customer' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.provider_customer_blocks (provider_id, customer_id, reason, created_by)
    VALUES (p_provider_id, p_customer_id, TRIM(p_reason), v_user_id)
    ON CONFLICT (provider_id, customer_id) DO UPDATE SET reason = EXCLUDED.reason;
    PERFORM public.write_audit_log('provider.customer_blocked', 'profiles', p_customer_id,
      jsonb_build_object('provider_id', p_provider_id, 'reason', TRIM(p_reason)));
  ELSE
    DELETE FROM public.provider_customer_blocks
    WHERE provider_id = p_provider_id AND customer_id = p_customer_id;
    PERFORM public.write_audit_log('provider.customer_unblocked', 'profiles', p_customer_id,
      jsonb_build_object('provider_id', p_provider_id));
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'provider_id', p_provider_id,
                            'customer_id', p_customer_id, 'is_blocked', p_block);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Discount release (gift card balance, loyalty points, coupon usage) — idempotent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_release_discounts(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_redemption RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL OR v_booking.discounts_released_at IS NOT NULL THEN
    RETURN;
  END IF;

  FOR v_redemption IN
    SELECT * FROM public.gift_card_redemptions
    WHERE booking_id = p_booking_id AND reversed_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.gift_cards
    SET remaining_balance = remaining_balance + v_redemption.amount,
        status = CASE WHEN remaining_balance + v_redemption.amount >= original_amount THEN 'active' ELSE 'partially_redeemed' END
    WHERE id = v_redemption.gift_card_id;
    UPDATE public.gift_card_redemptions SET reversed_at = now() WHERE id = v_redemption.id;
  END LOOP;

  FOR v_redemption IN
    SELECT * FROM public.coupon_redemptions
    WHERE booking_id = p_booking_id AND reversed_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.promotional_codes
    SET redeemed_count = GREATEST(redeemed_count - 1, 0)
    WHERE id = v_redemption.coupon_id;
    UPDATE public.coupon_redemptions SET reversed_at = now() WHERE id = v_redemption.id;
  END LOOP;

  IF v_booking.loyalty_points_redeemed > 0 THEN
    UPDATE public.customer_loyalty cl
    SET points_balance = cl.points_balance + v_booking.loyalty_points_redeemed,
        updated_at = now()
    FROM public.branches br
    WHERE br.id = v_booking.branch_id
      AND cl.provider_id = br.provider_id
      AND cl.customer_id = v_booking.customer_id;

    INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description)
    SELECT cl.id, p_booking_id, v_booking.loyalty_points_redeemed, 'manual_adjustment',
           'Points returned: booking was cancelled or expired'
    FROM public.customer_loyalty cl
    JOIN public.branches br ON br.provider_id = cl.provider_id
    WHERE br.id = v_booking.branch_id AND cl.customer_id = v_booking.customer_id;
  END IF;

  UPDATE public.bookings SET discounts_released_at = now() WHERE id = p_booking_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. The booking core. All customer booking entry points go through this function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_create_internal(
  p_customer_id UUID,
  p_employee_id UUID,
  p_branch_id UUID,
  p_service_ids UUID[],
  p_scheduled_at TIMESTAMPTZ,
  p_home_service BOOLEAN,
  p_home_lat NUMERIC,
  p_home_lng NUMERIC,
  p_home_address_text TEXT,
  p_client_profile_id UUID,
  p_source TEXT,
  p_coupon_code TEXT,
  p_gift_card_code TEXT,
  p_loyalty_points INTEGER
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source TEXT;
  v_provider public.providers;
  v_provider_id UUID;
  v_service_count INT;
  v_employee_id UUID := p_employee_id;
  v_branch_id UUID;
  v_duration INT := 0;
  v_subtotal NUMERIC(10,2) := 0;
  v_item RECORD;
  v_date DATE := (p_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;
  v_eligibility JSONB;
  v_full_prepayment BOOLEAN;
  v_home_ok BOOLEAN := TRUE;
  v_first_visit BOOLEAN;
  v_commission NUMERIC(10,2);
  v_coupon public.promotional_codes;
  v_coupon_discount NUMERIC(10,2) := 0;
  v_loyalty JSONB := public.platform_setting('loyalty_program');
  v_loyalty_row public.customer_loyalty;
  v_loyalty_points INT := COALESCE(p_loyalty_points, 0);
  v_loyalty_discount NUMERIC(10,2) := 0;
  v_gift public.gift_cards;
  v_gift_amount NUMERIC(10,2) := 0;
  v_taxable NUMERIC(10,2);
  v_tax NUMERIC(10,2);
  v_deposit NUMERIC(10,2);
  v_booking public.bookings;
  v_seq INT := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Booking time must be in the future' USING ERRCODE = '22007';
  END IF;
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one service is required' USING ERRCODE = '22023';
  END IF;
  IF array_length(p_service_ids, 1) > 6 THEN
    RAISE EXCEPTION 'A booking can contain at most 6 services' USING ERRCODE = '22023';
  END IF;

  v_source := LOWER(COALESCE(NULLIF(TRIM(p_source), ''), 'marketplace'));
  IF v_source NOT IN ('marketplace', 'link', 'qr', 'whatsapp', 'instagram', 'import') THEN
    -- walk_in is created only by staff through create_walk_in_booking
    v_source := 'marketplace';
  END IF;

  -- All services must be active and belong to one verified provider.
  SELECT MIN(s.provider_id::text)::uuid, COUNT(DISTINCT s.provider_id), COUNT(*)
  INTO v_provider_id, v_service_count, v_seq
  FROM public.services s
  WHERE s.id = ANY(p_service_ids) AND s.is_active = TRUE;

  IF v_seq <> (SELECT COUNT(DISTINCT x) FROM unnest(p_service_ids) x) OR v_service_count <> 1 THEN
    RAISE EXCEPTION 'Services must be active and offered by the same provider' USING ERRCODE = '22023';
  END IF;
  v_seq := 0;

  SELECT * INTO v_provider FROM public.providers WHERE id = v_provider_id;
  IF v_provider.id IS NULL OR NOT COALESCE(v_provider.is_verified, FALSE) THEN
    RAISE EXCEPTION 'This provider is not accepting bookings' USING ERRCODE = '22023';
  END IF;

  v_eligibility := public.check_customer_booking_eligibility(v_provider_id, p_customer_id);
  IF (v_eligibility->>'is_blocked')::boolean THEN
    RAISE EXCEPTION 'You cannot book with this provider. Please contact the provider directly.' USING ERRCODE = '42501';
  END IF;
  v_full_prepayment := (v_eligibility->>'requires_full_prepayment')::boolean;

  IF p_home_service THEN
    SELECT bool_and(COALESCE(s.is_home_service_eligible, FALSE)) INTO v_home_ok
    FROM public.services s WHERE s.id = ANY(p_service_ids);
    IF NOT v_home_ok THEN
      RAISE EXCEPTION 'One or more services are not available as home visits' USING ERRCODE = '22023';
    END IF;
    IF p_home_lat IS NULL OR p_home_lng IS NULL THEN
      RAISE EXCEPTION 'Home-service coordinates are required' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_client_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.client_profiles cp
    WHERE cp.id = p_client_profile_id AND cp.client_id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Client profile does not belong to the authenticated user' USING ERRCODE = '42501';
  END IF;

  -- Resolve the professional. A specific professional must offer every service;
  -- "any available" picks the least-loaded professional who can take the whole visit.
  IF v_employee_id IS NULL THEN
    SELECT e.id INTO v_employee_id
    FROM public.employees e
    JOIN public.branches br ON br.id = e.branch_id
    WHERE br.provider_id = v_provider_id
      AND COALESCE(br.is_active, TRUE)
      AND e.is_active
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      AND (SELECT COUNT(*) FROM public.employee_services es
           WHERE es.employee_id = e.id AND es.service_id = ANY(p_service_ids))
          = array_length(p_service_ids, 1)
      AND EXISTS (
        SELECT 1 FROM public.get_available_slots(
          e.id, v_date,
          (SELECT SUM(COALESCE(es.custom_duration_minutes, s.base_duration_minutes))::int
           FROM public.employee_services es JOIN public.services s ON s.id = es.service_id
           WHERE es.employee_id = e.id AND es.service_id = ANY(p_service_ids))
        ) sl
        WHERE sl.slot_start = p_scheduled_at
      )
    ORDER BY (
      SELECT COUNT(*) FROM public.bookings b
      WHERE b.employee_id = e.id
        AND b.status IN ('pending_payment', 'confirmed')
        AND (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = v_date
    ), e.created_at, e.id
    LIMIT 1;

    IF v_employee_id IS NULL THEN
      RAISE EXCEPTION 'No professional is available at the selected time' USING ERRCODE = '23P01';
    END IF;
  END IF;

  SELECT e.branch_id INTO v_branch_id
  FROM public.employees e
  JOIN public.branches br ON br.id = e.branch_id
  WHERE e.id = v_employee_id AND e.is_active AND br.provider_id = v_provider_id
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id);

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'The selected professional does not work at this provider' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT s.id, COALESCE(es.custom_duration_minutes, s.base_duration_minutes) AS duration,
           COALESCE(es.custom_price, s.base_price) AS price, ord.n
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(service_id, n)
    JOIN public.services s ON s.id = ord.service_id
    LEFT JOIN public.employee_services es ON es.service_id = s.id AND es.employee_id = v_employee_id
    ORDER BY ord.n
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.employee_services es
                   WHERE es.employee_id = v_employee_id AND es.service_id = v_item.id) THEN
      RAISE EXCEPTION 'The selected professional does not offer every selected service' USING ERRCODE = '22023';
    END IF;
    v_duration := v_duration + v_item.duration;
    v_subtotal := v_subtotal + v_item.price;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_available_slots(v_employee_id, v_date, v_duration) sl
    WHERE sl.slot_start = p_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Selected time is no longer available' USING ERRCODE = '23P01';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    WHERE b.customer_id = p_customer_id
      AND br.provider_id = v_provider_id
      AND b.status IN ('confirmed', 'completed')
  ) INTO v_first_visit;

  -- Platform fee on the pre-discount subtotal (fee_rules: 0% on provider-sourced bookings).
  v_commission := public.calculate_booking_platform_commission(v_source, v_first_visit, v_subtotal, v_provider_id);

  -- Coupon
  IF NULLIF(TRIM(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.promotional_codes
    WHERE UPPER(code) = UPPER(TRIM(p_coupon_code))
    FOR UPDATE;

    IF v_coupon.id IS NULL OR NOT COALESCE(v_coupon.is_active, FALSE)
       OR (v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now())
       OR (v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < now())
       OR (v_coupon.max_redemptions IS NOT NULL AND v_coupon.redeemed_count >= v_coupon.max_redemptions)
       OR (v_coupon.provider_id IS NOT NULL AND v_coupon.provider_id <> v_provider_id)
       OR v_subtotal < COALESCE(v_coupon.min_order_amount, 0) THEN
      RAISE EXCEPTION 'This promo code is not valid for this booking' USING ERRCODE = '22023';
    END IF;

    IF v_coupon.discount_type = 'percentage' THEN
      v_coupon_discount := ROUND(v_subtotal * LEAST(v_coupon.discount_value, 100) / 100.0, 2);
      IF v_coupon.max_discount_cap IS NOT NULL THEN
        v_coupon_discount := LEAST(v_coupon_discount, v_coupon.max_discount_cap);
      END IF;
    ELSE
      v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
    END IF;
  END IF;

  -- Loyalty points (provider-scoped, only when the programme is enabled)
  IF v_loyalty_points > 0 THEN
    IF NOT COALESCE((v_loyalty->>'enabled')::boolean, FALSE) THEN
      RAISE EXCEPTION 'Loyalty redemption is not available' USING ERRCODE = '22023';
    END IF;
    IF v_loyalty_points < COALESCE((v_loyalty->>'min_redeem_points')::int, 100) THEN
      RAISE EXCEPTION 'Minimum redemption is % points', (v_loyalty->>'min_redeem_points') USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_loyalty_row
    FROM public.customer_loyalty
    WHERE customer_id = p_customer_id AND provider_id = v_provider_id
    FOR UPDATE;
    IF v_loyalty_row.id IS NULL OR v_loyalty_row.points_balance < v_loyalty_points THEN
      RAISE EXCEPTION 'Insufficient loyalty points' USING ERRCODE = '22023';
    END IF;
    v_loyalty_discount := LEAST(
      ROUND(v_loyalty_points * COALESCE((v_loyalty->>'sar_per_point')::numeric, 0), 2),
      v_subtotal - v_coupon_discount
    );
  END IF;

  v_taxable := GREATEST(v_subtotal - v_coupon_discount - v_loyalty_discount, 0);
  v_tax := ROUND(v_taxable * 0.15, 2);

  -- Gift card is a payment instrument applied to the amount due (taxable + VAT).
  IF NULLIF(TRIM(COALESCE(p_gift_card_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_gift
    FROM public.gift_cards
    WHERE UPPER(code) = UPPER(TRIM(p_gift_card_code))
    FOR UPDATE;
    IF v_gift.id IS NULL OR v_gift.status NOT IN ('active', 'partially_redeemed')
       OR v_gift.remaining_balance <= 0
       OR (v_gift.expires_at IS NOT NULL AND v_gift.expires_at < now()) THEN
      RAISE EXCEPTION 'This gift card cannot be used' USING ERRCODE = '22023';
    END IF;
    v_gift_amount := LEAST(v_gift.remaining_balance, v_taxable + v_tax);
  END IF;

  IF v_full_prepayment THEN
    v_deposit := v_taxable + v_tax - v_gift_amount;
  ELSE
    v_deposit := LEAST(
      ROUND(v_taxable * COALESCE(v_provider.deposit_percentage, 20) / 100.0, 2),
      v_taxable + v_tax - v_gift_amount
    );
  END IF;
  v_deposit := GREATEST(v_deposit, 0);

  BEGIN
    INSERT INTO public.bookings (
      customer_id, branch_id, employee_id, service_id, status,
      is_home_service, home_address_lat, home_address_lng, home_address_text,
      scheduled_at, duration_minutes,
      subtotal_price, discount_amount, coupon_id, gift_card_amount, loyalty_points_redeemed,
      total_price, tax_amount, deposit_required, platform_commission,
      client_profile_id, source, is_first_visit
    ) VALUES (
      p_customer_id, v_branch_id, v_employee_id, p_service_ids[1],
      -- Nothing to collect online (0% deposit or fully covered by a gift card): confirm immediately.
      CASE WHEN v_deposit = 0 THEN 'confirmed'::public.booking_status ELSE 'pending_payment'::public.booking_status END,
      COALESCE(p_home_service, FALSE), p_home_lat, p_home_lng, p_home_address_text,
      p_scheduled_at, v_duration,
      v_subtotal, v_coupon_discount + v_loyalty_discount, v_coupon.id, v_gift_amount, v_loyalty_points,
      v_taxable, v_tax, v_deposit, v_commission,
      p_client_profile_id, v_source, v_first_visit
    )
    RETURNING * INTO v_booking;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Selected time is no longer available' USING ERRCODE = '23P01';
  END;

  FOR v_item IN
    SELECT s.id, COALESCE(es.custom_duration_minutes, s.base_duration_minutes) AS duration,
           COALESCE(es.custom_price, s.base_price) AS price, ord.n
    FROM unnest(p_service_ids) WITH ORDINALITY AS ord(service_id, n)
    JOIN public.services s ON s.id = ord.service_id
    JOIN public.employee_services es ON es.service_id = s.id AND es.employee_id = v_employee_id
    ORDER BY ord.n
  LOOP
    INSERT INTO public.booking_services (booking_id, service_id, employee_id, sequence_order, duration_minutes, price)
    VALUES (v_booking.id, v_item.id, v_employee_id, v_item.n, v_item.duration, v_item.price);
  END LOOP;

  IF v_coupon.id IS NOT NULL AND v_coupon_discount > 0 THEN
    UPDATE public.promotional_codes SET redeemed_count = redeemed_count + 1, updated_at = now()
    WHERE id = v_coupon.id;
    INSERT INTO public.coupon_redemptions (coupon_id, customer_id, booking_id, discount_amount, funding_source)
    VALUES (v_coupon.id, p_customer_id, v_booking.id, v_coupon_discount, COALESCE(v_coupon.funding_source, 'provider'));
  END IF;

  IF v_loyalty_points > 0 THEN
    UPDATE public.customer_loyalty
    SET points_balance = points_balance - v_loyalty_points, updated_at = now()
    WHERE id = v_loyalty_row.id;
    INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description)
    VALUES (v_loyalty_row.id, v_booking.id, -v_loyalty_points, 'redemption',
            format('Redeemed %s points for %s SAR off', v_loyalty_points, v_loyalty_discount));
  END IF;

  IF v_gift_amount > 0 THEN
    UPDATE public.gift_cards
    SET remaining_balance = remaining_balance - v_gift_amount,
        status = CASE WHEN remaining_balance - v_gift_amount <= 0 THEN 'redeemed' ELSE 'partially_redeemed' END
    WHERE id = v_gift.id;
    INSERT INTO public.gift_card_redemptions (gift_card_id, customer_id, booking_id, amount)
    VALUES (v_gift.id, p_customer_id, v_booking.id, v_gift_amount);
  END IF;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_booking(
  target_employee_id UUID,
  target_service_id UUID,
  target_scheduled_at TIMESTAMPTZ,
  request_home_service BOOLEAN DEFAULT FALSE,
  request_home_address_lat NUMERIC DEFAULT NULL,
  request_home_address_lng NUMERIC DEFAULT NULL,
  request_client_profile_id UUID DEFAULT NULL,
  request_source TEXT DEFAULT 'marketplace',
  request_coupon_code TEXT DEFAULT NULL,
  request_gift_card_code TEXT DEFAULT NULL,
  request_loyalty_points INTEGER DEFAULT 0,
  request_branch_id UUID DEFAULT NULL,
  request_home_address_text TEXT DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.booking_create_internal(
    auth.uid(), target_employee_id, request_branch_id, ARRAY[target_service_id], target_scheduled_at,
    request_home_service, request_home_address_lat, request_home_address_lng, request_home_address_text,
    request_client_profile_id, request_source, request_coupon_code, request_gift_card_code,
    request_loyalty_points
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_multi_service_booking(
  target_branch_id UUID,
  target_employee_id UUID,
  target_scheduled_at TIMESTAMPTZ,
  services_payload JSONB,
  request_home_service BOOLEAN DEFAULT FALSE,
  request_home_address_text TEXT DEFAULT NULL,
  request_source TEXT DEFAULT 'marketplace',
  request_coupon_code TEXT DEFAULT NULL,
  request_gift_card_code TEXT DEFAULT NULL,
  request_loyalty_points INTEGER DEFAULT 0,
  request_home_address_lat NUMERIC DEFAULT NULL,
  request_home_address_lng NUMERIC DEFAULT NULL,
  request_client_profile_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_booking public.bookings;
BEGIN
  IF jsonb_typeof(services_payload) <> 'array' OR jsonb_array_length(services_payload) = 0 THEN
    RAISE EXCEPTION 'services_payload must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg((item->>'service_id')::uuid ORDER BY n)
  INTO v_ids
  FROM jsonb_array_elements(services_payload) WITH ORDINALITY AS t(item, n);

  v_booking := public.booking_create_internal(
    auth.uid(), target_employee_id, target_branch_id, v_ids, target_scheduled_at,
    request_home_service, request_home_address_lat, request_home_address_lng, request_home_address_text,
    request_client_profile_id, request_source, request_coupon_code, request_gift_card_code,
    request_loyalty_points
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'employee_id', v_booking.employee_id,
    'total_duration_minutes', v_booking.duration_minutes,
    'subtotal_sar', v_booking.subtotal_price,
    'discount_sar', v_booking.discount_amount,
    'gift_card_sar', v_booking.gift_card_amount,
    'total_price_sar', v_booking.total_price,
    'vat_sar', v_booking.tax_amount,
    'deposit_sar', v_booking.deposit_required,
    'services_count', array_length(v_ids, 1)
  );
END;
$$;

-- Walk-ins: created by provider staff at the counter. No online payment, 0% platform fee
-- (fee_rules channel walk_in). The visitor is linked to an existing account only when the
-- phone number matches a verified profile; otherwise the name/phone stay on the booking.
CREATE OR REPLACE FUNCTION public.create_walk_in_booking(
  p_branch_id UUID,
  p_employee_id UUID,
  p_service_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash',
  p_total_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_provider_id UUID;
  v_service RECORD;
  v_customer_id UUID;
  v_phone TEXT := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '\s', '', 'g'), '');
  v_price NUMERIC(10,2);
  v_booking public.bookings;
BEGIN
  SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = p_branch_id;
  IF v_provider_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_provider_staff(v_provider_id, v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to create walk-ins for this branch' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(TRIM(COALESCE(p_customer_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Customer name is required' USING ERRCODE = '22023';
  END IF;
  IF p_total_price IS NOT NULL AND p_total_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, COALESCE(es.custom_duration_minutes, s.base_duration_minutes) AS duration,
         COALESCE(es.custom_price, s.base_price) AS price
  INTO v_service
  FROM public.employees e
  JOIN public.employee_services es ON es.employee_id = e.id AND es.service_id = p_service_id
  JOIN public.services s ON s.id = es.service_id AND s.provider_id = v_provider_id
  WHERE e.id = p_employee_id AND e.branch_id = p_branch_id AND e.is_active;

  IF v_service.id IS NULL THEN
    RAISE EXCEPTION 'This professional does not offer the selected service at this branch' USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.profiles
    WHERE phone_number = v_phone AND phone_verified
    LIMIT 1;
  END IF;

  v_price := COALESCE(p_total_price, v_service.price);

  BEGIN
    INSERT INTO public.bookings (
      customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission,
      source, is_first_visit, checked_in_at, walk_in_name, walk_in_phone
    ) VALUES (
      v_customer_id, p_branch_id, p_employee_id, p_service_id, 'confirmed',
      date_trunc('minute', now()), v_service.duration,
      v_price, v_price, ROUND(v_price * 0.15, 2), 0,
      public.calculate_booking_platform_commission('walk_in', FALSE, v_price, v_provider_id),
      'walk_in', FALSE, now(), TRIM(p_customer_name), v_phone
    )
    RETURNING * INTO v_booking;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'This professional already has a booking right now' USING ERRCODE = '23P01';
  END;

  INSERT INTO public.booking_services (booking_id, service_id, employee_id, sequence_order, duration_minutes, price)
  VALUES (v_booking.id, p_service_id, p_employee_id, 1, v_service.duration, v_price);

  PERFORM public.write_audit_log('provider.walk_in_created', 'bookings', v_booking.id,
    jsonb_build_object('provider_id', v_provider_id, 'payment_method', p_payment_method, 'price', v_price,
                       'linked_customer', v_customer_id IS NOT NULL));

  RETURN jsonb_build_object('success', TRUE, 'booking_id', v_booking.id, 'status', v_booking.status,
                            'source', 'walk_in', 'total_price', v_booking.total_price,
                            'vat', v_booking.tax_amount, 'linked_customer', v_customer_id IS NOT NULL);
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Refund requests (money leaves only through process-refund, after a recorded request)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE RESTRICT,
  ledger_id UUID NOT NULL REFERENCES public.transactional_ledger(id) ON DELETE RESTRICT,
  payment_intent_id TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('customer_cancellation', 'provider_cancellation', 'no_show_remainder',
                                         'dispute', 'admin', 'late_payment_conflict')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  gateway_refund_id TEXT,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON public.refund_requests (status, created_at);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read refund requests" ON public.refund_requests;
CREATE POLICY "Admins read refund requests"
  ON public.refund_requests FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Customers read own refund requests" ON public.refund_requests;
CREATE POLICY "Customers read own refund requests"
  ON public.refund_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = refund_requests.booking_id AND b.customer_id = auth.uid()));

-- Creates a refund request against the booking's captured payment. Returns NULL when nothing is refundable.
CREATE OR REPLACE FUNCTION public.create_refund_request_internal(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_source TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger public.transactional_ledger;
  v_pending NUMERIC;
  v_amount NUMERIC(10,2);
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.refund_requests WHERE idempotency_key = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_ledger
  FROM public.transactional_ledger
  WHERE booking_id = p_booking_id AND entry_type = 'booking_payment'
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF v_ledger.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.refund_requests
  WHERE ledger_id = v_ledger.id AND status IN ('pending', 'processing');

  v_amount := LEAST(COALESCE(p_amount, 0), v_ledger.total_captured - v_ledger.refunded_amount - v_pending);
  IF v_amount <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.refund_requests (booking_id, ledger_id, payment_intent_id, amount, reason, source,
                                      idempotency_key, requested_by)
  VALUES (p_booking_id, v_ledger.id, v_ledger.payment_intent_id, v_amount, p_reason, p_source,
          p_idempotency_key, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.write_audit_log('refund.requested', 'refund_requests', v_id,
    jsonb_build_object('booking_id', p_booking_id, 'amount', v_amount, 'source', p_source));

  RETURN v_id;
END;
$$;

-- Assigns the money a cancelled / no-show booking keeps: no platform commission on a visit
-- that did not happen; whatever is retained after refunds belongs to the provider.
CREATE OR REPLACE FUNCTION public.ledger_settle_unperformed_booking(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.transactional_ledger tl
  SET platform_share = 0,
      provider_share = GREATEST(tl.total_captured - tl.refunded_amount
        - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                    WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing')), 0), 0),
      payout_status = CASE
        WHEN tl.payout_status IN ('released', 'paid') THEN tl.payout_status
        WHEN tl.total_captured - tl.refunded_amount
             - COALESCE((SELECT SUM(r.amount) FROM public.refund_requests r
                         WHERE r.ledger_id = tl.id AND r.status IN ('pending', 'processing')), 0) <= 0
          THEN 'refund_pending'
        ELSE tl.payout_status
      END
  WHERE tl.booking_id = p_booking_id AND tl.entry_type = 'booking_payment';
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Cancel / no-show / staff status / reschedule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking(
  target_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_actor TEXT;
  v_captured NUMERIC(10,2);
  v_hours NUMERIC;
  v_fee NUMERIC(10,2) := 0;
  v_refund NUMERIC(10,2) := 0;
BEGIN
  IF v_user_id IS NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN
    v_actor := 'admin';
  ELSIF v_booking.customer_id = v_user_id THEN
    v_actor := 'customer';
  ELSIF public.is_booking_staff(v_booking.id, v_user_id) THEN
    v_actor := 'provider';
  ELSE
    RAISE EXCEPTION 'Not authorized to cancel this booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'A % booking cannot be cancelled', v_booking.status USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;

  v_captured := public.booking_captured_amount(v_booking.id);
  v_hours := EXTRACT(EPOCH FROM (v_booking.scheduled_at - now())) / 3600.0;

  IF v_captured > 0 THEN
    IF v_actor = 'customer' AND v_hours < COALESCE(v_provider.free_cancellation_hours, 24) THEN
      v_fee := LEAST(ROUND(v_captured * COALESCE(v_provider.late_cancellation_fee_percent, 0) / 100.0, 2), v_captured);
    END IF;
    -- Provider- or admin-initiated cancellations always refund the customer in full.
    v_refund := v_captured - v_fee;
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = COALESCE(NULLIF(TRIM(p_reason), ''), 'Cancelled by ' || v_actor),
      cancellation_fee = v_fee,
      refund_amount = v_refund
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.booking_release_discounts(v_booking.id);

  IF v_refund > 0 THEN
    PERFORM public.create_refund_request_internal(
      v_booking.id, v_refund,
      CASE WHEN v_actor = 'customer' THEN 'customer_cancellation' ELSE 'provider_cancellation' END,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Booking cancelled by ' || v_actor),
      'cancel:' || v_booking.id::text
    );
  END IF;
  PERFORM public.ledger_settle_unperformed_booking(v_booking.id);

  PERFORM public.write_audit_log('booking.cancelled', 'bookings', v_booking.id,
    jsonb_build_object('cancelled_by', v_actor, 'hours_before_start', ROUND(v_hours, 2),
                       'captured', v_captured, 'fee', v_fee, 'refund', v_refund, 'reason', p_reason));

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_booking_no_show(
  target_booking_id UUID,
  p_reason TEXT DEFAULT 'Customer did not show up'
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_captured NUMERIC(10,2);
  v_fee NUMERIC(10,2);
  v_refund NUMERIC(10,2);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_booking_staff(v_booking.id, v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to mark this booking as a no-show' USING ERRCODE = '42501';
  END IF;
  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed bookings can be marked as no-show' USING ERRCODE = '22023';
  END IF;
  IF v_booking.scheduled_at > now() THEN
    RAISE EXCEPTION 'A booking cannot be marked as a no-show before its start time' USING ERRCODE = '22023';
  END IF;
  IF v_booking.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'The customer was checked in; complete the booking instead' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;

  v_captured := public.booking_captured_amount(v_booking.id);
  v_fee := LEAST(ROUND(v_captured * COALESCE(v_provider.no_show_fee_percent, 0) / 100.0, 2), v_captured);
  v_refund := v_captured - v_fee;

  UPDATE public.bookings
  SET status = 'no_show',
      no_show_at = now(),
      cancellation_reason = p_reason,
      cancellation_fee = v_fee,
      refund_amount = v_refund
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  PERFORM public.booking_release_discounts(v_booking.id);

  IF v_refund > 0 THEN
    PERFORM public.create_refund_request_internal(v_booking.id, v_refund, 'no_show_remainder',
      'Deposit above the provider''s no-show fee', 'noshow:' || v_booking.id::text);
  END IF;
  PERFORM public.ledger_settle_unperformed_booking(v_booking.id);

  PERFORM public.write_audit_log('booking.no_show', 'bookings', v_booking.id,
    jsonb_build_object('captured', v_captured, 'fee', v_fee, 'refund', v_refund, 'reason', p_reason));

  RETURN v_booking;
END;
$$;

-- Staff actions. "in_service" records the check-in time; the booking stays confirmed so the
-- double-booking constraint keeps protecting the slot.
CREATE OR REPLACE FUNCTION public.employee_update_booking_status(
  p_booking_id UUID,
  p_new_status VARCHAR,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_booking_staff(p_booking_id, v_user_id) OR public.is_admin()) THEN
    RAISE EXCEPTION 'Not authorized to update this booking' USING ERRCODE = '42501';
  END IF;

  IF p_new_status = 'in_service' THEN
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be checked in' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bookings SET checked_in_at = COALESCE(checked_in_at, now()) WHERE id = p_booking_id;
    PERFORM public.write_audit_log('booking.checked_in', 'bookings', p_booking_id, jsonb_build_object('notes', p_notes));
  ELSIF p_new_status = 'completed' THEN
    IF v_booking.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be completed' USING ERRCODE = '22023';
    END IF;
    IF v_booking.scheduled_at > now() THEN
      RAISE EXCEPTION 'A booking cannot be completed before its start time' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bookings SET status = 'completed' WHERE id = p_booking_id;
    PERFORM public.write_audit_log('booking.completed', 'bookings', p_booking_id, jsonb_build_object('notes', p_notes));
  ELSIF p_new_status = 'no_show' THEN
    PERFORM public.mark_booking_no_show(p_booking_id, COALESCE(p_notes, 'Customer did not show up'));
  ELSIF p_new_status = 'cancelled' THEN
    PERFORM public.cancel_booking(p_booking_id, COALESCE(p_notes, 'Cancelled by provider'));
  ELSE
    RAISE EXCEPTION 'Unsupported status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN jsonb_build_object('success', TRUE, 'booking_id', p_booking_id, 'status', v_booking.status,
                            'checked_in_at', v_booking.checked_in_at);
END;
$$;

-- Reminder helper used by the lifecycle trigger and reschedule.
CREATE OR REPLACE FUNCTION public.enqueue_booking_reminders(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vars JSONB;
  v_booking public.bookings;
  v_customer RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.customer_id IS NULL THEN
    RETURN;
  END IF;
  SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
  INTO v_customer FROM public.profiles WHERE id = v_booking.customer_id;
  IF v_customer.phone_number IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.message_queue
  SET status = 'cancelled', updated_at = now()
  WHERE booking_id = p_booking_id
    AND template_name IN ('reminder_24h', 'reminder_2h')
    AND status IN ('pending', 'deferred_quiet_hours');

  v_vars := public.booking_message_variables(p_booking_id, v_customer.lang);

  IF v_booking.scheduled_at > now() + interval '12 hours' THEN
    INSERT INTO public.message_queue (booking_id, recipient_phone, recipient_id, channel, template_name,
                                      locale, variables, scheduled_for, status)
    VALUES (p_booking_id, v_customer.phone_number, v_customer.id, 'whatsapp', 'reminder_24h',
            v_customer.lang, v_vars, v_booking.scheduled_at - interval '24 hours', 'pending');
  END IF;
  IF v_booking.scheduled_at > now() + interval '2 hours' THEN
    INSERT INTO public.message_queue (booking_id, recipient_phone, recipient_id, channel, template_name,
                                      locale, variables, scheduled_for, status)
    VALUES (p_booking_id, v_customer.phone_number, v_customer.id, 'whatsapp', 'reminder_2h',
            v_customer.lang, v_vars, v_booking.scheduled_at - interval '2 hours', 'pending');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_message_variables(p_booking_id UUID, p_locale TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'customer_name', COALESCE(NULLIF(TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), ''),
                              b.walk_in_name, CASE WHEN p_locale = 'en' THEN 'Customer' ELSE 'العميل' END),
    'provider_name', CASE WHEN p_locale = 'en' THEN COALESCE(p.business_name_en, p.business_name_ar)
                          ELSE COALESCE(p.business_name_ar, p.business_name_en) END,
    'service_name', CASE WHEN p_locale = 'en' THEN COALESCE(s.name_en, s.name_ar) ELSE COALESCE(s.name_ar, s.name_en) END,
    'booking_date', to_char(b.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD'),
    'booking_time', to_char(b.scheduled_at AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
    'deposit_amount', b.deposit_required::text,
    'address', CASE WHEN p_locale = 'en' THEN COALESCE(br.address_text_en, br.address_text_ar)
                    ELSE COALESCE(br.address_text_ar, br.address_text_en) END,
    'action_url', 'https://primora.sa/customer/bookings/' || b.id::text,
    'dashboard_url', 'https://primora.sa/provider/bookings',
    'review_url', 'https://primora.sa/customer/reviews?booking=' || b.id::text,
    'rebook_url', 'https://primora.sa/shop/' || p.id::text || '?source=whatsapp'
  )
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  JOIN public.providers p ON p.id = br.provider_id
  JOIN public.services s ON s.id = b.service_id
  LEFT JOIN public.profiles pr ON pr.id = b.customer_id
  WHERE b.id = p_booking_id;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_booking(
  target_booking_id UUID,
  new_scheduled_at TIMESTAMPTZ,
  new_employee_id UUID DEFAULT NULL,
  reschedule_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.bookings;
  v_provider public.providers;
  v_actor TEXT;
  v_employee UUID;
  v_date DATE := (new_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;
  v_service_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF new_scheduled_at <= now() THEN
    RAISE EXCEPTION 'New booking time must be in the future' USING ERRCODE = '22007';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.status NOT IN ('confirmed', 'pending_payment') THEN
    RAISE EXCEPTION 'A % booking cannot be rescheduled', v_booking.status USING ERRCODE = '22023';
  END IF;

  IF public.is_admin() THEN
    v_actor := 'admin';
  ELSIF public.is_booking_staff(v_booking.id, v_user_id) THEN
    v_actor := 'provider';
  ELSIF v_booking.customer_id = v_user_id THEN
    v_actor := 'customer';
  ELSE
    RAISE EXCEPTION 'Not authorized to reschedule this booking' USING ERRCODE = '42501';
  END IF;

  SELECT p.* INTO v_provider
  FROM public.branches br JOIN public.providers p ON p.id = br.provider_id
  WHERE br.id = v_booking.branch_id;

  -- Customers reschedule under the same notice rule as free cancellation.
  IF v_actor = 'customer'
     AND v_booking.scheduled_at - now() < make_interval(hours => COALESCE(v_provider.free_cancellation_hours, 24)) THEN
    RAISE EXCEPTION 'Rescheduling closes % hours before the appointment; please contact the provider',
      COALESCE(v_provider.free_cancellation_hours, 24) USING ERRCODE = '22023';
  END IF;

  v_employee := COALESCE(new_employee_id, v_booking.employee_id);

  SELECT COUNT(*) INTO v_service_count
  FROM public.booking_services bs
  WHERE bs.booking_id = v_booking.id
    AND NOT EXISTS (SELECT 1 FROM public.employee_services es WHERE es.employee_id = v_employee AND es.service_id = bs.service_id);
  IF v_service_count > 0 OR NOT EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id = v_employee AND e.branch_id = v_booking.branch_id AND e.is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.employee_services es WHERE es.employee_id = v_employee AND es.service_id = v_booking.service_id
  ) THEN
    RAISE EXCEPTION 'The selected professional cannot take this booking' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.reschedule_in_progress', 'on', true);

  IF NOT EXISTS (
    SELECT 1 FROM public.get_available_slots(v_employee, v_date, v_booking.duration_minutes) sl
    WHERE sl.slot_start = new_scheduled_at
  ) AND NOT (
    -- The only thing occupying the new slot is this booking itself (same professional, overlapping move).
    v_employee = v_booking.employee_id
    AND tstzrange(v_booking.scheduled_at, v_booking.scheduled_at + make_interval(mins => v_booking.duration_minutes))
        && tstzrange(new_scheduled_at, new_scheduled_at + make_interval(mins => v_booking.duration_minutes))
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = v_employee AND b.id <> v_booking.id
        AND b.status IN ('pending_payment', 'confirmed')
        AND tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_minutes))
            && tstzrange(new_scheduled_at, new_scheduled_at + make_interval(mins => v_booking.duration_minutes))
    )
  ) THEN
    RAISE EXCEPTION 'The selected time is not available' USING ERRCODE = '23P01';
  END IF;

  BEGIN
    UPDATE public.bookings
    SET scheduled_at = new_scheduled_at, employee_id = v_employee
    WHERE id = v_booking.id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'The selected time is not available' USING ERRCODE = '23P01';
  END;

  UPDATE public.booking_services SET employee_id = v_employee WHERE booking_id = v_booking.id;
  PERFORM set_config('primora.reschedule_in_progress', 'off', true);

  IF v_booking.status = 'confirmed' THEN
    PERFORM public.enqueue_booking_reminders(v_booking.id);
  END IF;

  PERFORM public.write_audit_log('booking.rescheduled', 'bookings', v_booking.id,
    jsonb_build_object('old_scheduled_at', v_booking.scheduled_at, 'new_scheduled_at', new_scheduled_at,
                       'old_employee_id', v_booking.employee_id, 'new_employee_id', v_employee,
                       'actor', v_actor, 'reason', reschedule_reason));

  RETURN jsonb_build_object('success', TRUE, 'booking_id', v_booking.id,
                            'old_scheduled_at', v_booking.scheduled_at, 'new_scheduled_at', new_scheduled_at,
                            'employee_id', v_employee);
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Hold expiry (service_role / admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_booking_holds(hold_interval_minutes INTEGER DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes INT := COALESCE(hold_interval_minutes, (public.platform_setting('booking_hold_minutes'))::text::int, 15);
  v_booking RECORD;
  v_count INT := 0;
BEGIN
  IF NOT (COALESCE(auth.jwt()->>'role', '') = 'service_role' OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the scheduler or an administrator can expire booking holds' USING ERRCODE = '42501';
  END IF;
  IF v_minutes < 5 THEN
    RAISE EXCEPTION 'Hold window must be at least 5 minutes' USING ERRCODE = '22023';
  END IF;

  FOR v_booking IN
    SELECT id FROM public.bookings
    WHERE status = 'pending_payment'
      AND created_at < now() - make_interval(mins => v_minutes)
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'system',
        cancellation_reason = 'Payment hold expired'
    WHERE id = v_booking.id;
    PERFORM public.booking_release_discounts(v_booking.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Late payment for an expired hold: confirm only if the slot is still free and no
-- discount was consumed; otherwise record the capture and request a full refund.
CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  target_booking_id UUID,
  target_payment_intent_id TEXT,
  target_total_captured NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_existing public.transactional_ledger;
  v_provider_id UUID;
  v_platform NUMERIC(10,2);
  v_conflict BOOLEAN := FALSE;
  v_ledger_id UUID;
  v_refund_id UUID;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = target_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_total_captured <> v_booking.deposit_required THEN
    RAISE EXCEPTION 'Captured amount does not match the required deposit' USING ERRCODE = '22003';
  END IF;

  SELECT * INTO v_existing FROM public.transactional_ledger WHERE payment_intent_id = target_payment_intent_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.booking_id <> target_booking_id THEN
      RAISE EXCEPTION 'Payment intent is already assigned to another booking' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'status', 'already_recorded', 'conflict', FALSE, 'booking_id', v_booking.id);
  END IF;

  SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = v_booking.branch_id;

  IF v_booking.status = 'cancelled' THEN
    v_conflict := v_booking.discounts_released_at IS NOT NULL
      AND (v_booking.discount_amount > 0 OR v_booking.gift_card_amount > 0 OR v_booking.loyalty_points_redeemed > 0);
    v_conflict := v_conflict OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.employee_id = v_booking.employee_id AND b.id <> v_booking.id
        AND b.status IN ('pending_payment', 'confirmed', 'completed')
        AND b.booking_window && v_booking.booking_window
    );
    v_conflict := v_conflict OR v_booking.cancelled_by IS DISTINCT FROM 'system';
  ELSIF v_booking.status <> 'pending_payment' THEN
    v_conflict := TRUE;
  END IF;

  v_platform := CASE WHEN v_conflict THEN 0 ELSE LEAST(v_booking.platform_commission, target_total_captured) END;

  INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                           total_captured, platform_share, provider_share, payout_status)
  VALUES (v_booking.id, v_provider_id, 'booking_payment', target_payment_intent_id, target_total_captured,
          v_platform, target_total_captured - v_platform,
          CASE WHEN v_conflict THEN 'refund_pending' ELSE 'pending' END)
  RETURNING id INTO v_ledger_id;

  IF v_conflict THEN
    v_refund_id := public.create_refund_request_internal(v_booking.id, target_total_captured, 'late_payment_conflict',
      'Payment arrived after the booking hold was released', 'late:' || target_payment_intent_id);
    RETURN jsonb_build_object('success', FALSE, 'status', 'refund_required', 'conflict', TRUE,
                              'booking_id', v_booking.id, 'refund_request_id', v_refund_id);
  END IF;

  UPDATE public.bookings
  SET status = 'confirmed', cancelled_at = NULL, cancelled_by = NULL, cancellation_reason = NULL
  WHERE id = v_booking.id;

  RETURN jsonb_build_object('success', TRUE, 'status', 'confirmed', 'conflict', FALSE, 'booking_id', v_booking.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Triggers: messaging lifecycle, completion rewards & settlements, waitlist backfill
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_messaging_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_owner RECORD;
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed') THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
      INTO v_customer FROM public.profiles WHERE id = NEW.customer_id;
      IF v_customer.phone_number IS NOT NULL AND NEW.source <> 'walk_in' THEN
        INSERT INTO public.message_queue (booking_id, recipient_phone, recipient_id, channel, template_name,
                                          locale, variables, scheduled_for, status)
        VALUES (NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp', 'booking_confirmation',
                v_customer.lang, public.booking_message_variables(NEW.id, v_customer.lang), now(), 'pending');
      END IF;
    END IF;

    IF NEW.source <> 'walk_in' THEN
      SELECT pr.id, pr.phone_number, CASE WHEN pr.language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
      INTO v_owner
      FROM public.branches br
      JOIN public.providers p ON p.id = br.provider_id
      JOIN public.profiles pr ON pr.id = p.owner_id
      WHERE br.id = NEW.branch_id;
      IF v_owner.phone_number IS NOT NULL THEN
        INSERT INTO public.message_queue (booking_id, recipient_phone, recipient_id, channel, template_name,
                                          locale, variables, scheduled_for, status)
        VALUES (NEW.id, v_owner.phone_number, v_owner.id, 'whatsapp', 'owner_new_booking',
                v_owner.lang, public.booking_message_variables(NEW.id, v_owner.lang), now(), 'pending');
      END IF;
      PERFORM public.enqueue_booking_reminders(NEW.id);
    END IF;

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
        AND NEW.customer_id IS NOT NULL THEN
    SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
    INTO v_customer FROM public.profiles WHERE id = NEW.customer_id;
    IF v_customer.phone_number IS NOT NULL THEN
      INSERT INTO public.message_queue (booking_id, recipient_phone, recipient_id, channel, template_name,
                                        locale, variables, scheduled_for, status)
      VALUES (NEW.id, v_customer.phone_number, v_customer.id, 'whatsapp', 'post_visit_review',
              v_customer.lang, public.booking_message_variables(NEW.id, v_customer.lang),
              GREATEST(now(), NEW.scheduled_at + make_interval(mins => NEW.duration_minutes) + interval '1 hour'),
              'pending');
    END IF;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('cancelled', 'no_show')
        AND OLD.status NOT IN ('cancelled', 'no_show') THEN
    UPDATE public.message_queue
    SET status = 'cancelled', updated_at = now()
    WHERE booking_id = NEW.id AND status IN ('pending', 'deferred_quiet_hours');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_on_booking_completed_rewards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider_id UUID;
  v_loyalty JSONB := public.platform_setting('loyalty_program');
  v_referral JSONB := public.platform_setting('referral_program');
  v_row public.customer_loyalty;
  v_points INT;
  v_lifetime INT;
  v_tier TEXT;
  v_ref public.customer_referrals;
  v_platform_discount NUMERIC(10,2);
BEGIN
  IF NOT (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT provider_id INTO v_provider_id FROM public.branches WHERE id = NEW.branch_id;

  -- Settlements owed to the provider for value PRIMORA collected or funded:
  -- gift-card amounts (prepaid to PRIMORA) and platform-funded coupon discounts.
  IF NEW.gift_card_amount > 0 THEN
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NEW.id, v_provider_id, 'gift_card_settlement', 'gift-settlement:' || NEW.id::text,
            0, 0, NEW.gift_card_amount, 'pending')
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;

  SELECT COALESCE(SUM(cr.discount_amount), 0) INTO v_platform_discount
  FROM public.coupon_redemptions cr
  WHERE cr.booking_id = NEW.id AND cr.funding_source = 'platform' AND cr.reversed_at IS NULL;
  IF v_platform_discount > 0 THEN
    INSERT INTO public.transactional_ledger (booking_id, provider_id, entry_type, payment_intent_id,
                                             total_captured, platform_share, provider_share, payout_status)
    VALUES (NEW.id, v_provider_id, 'platform_discount_settlement', 'coupon-settlement:' || NEW.id::text,
            0, 0, v_platform_discount, 'pending')
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE((v_loyalty->>'enabled')::boolean, FALSE) THEN
    SELECT * INTO v_row FROM public.customer_loyalty
    WHERE customer_id = NEW.customer_id AND provider_id = v_provider_id FOR UPDATE;

    v_tier := COALESCE(v_row.tier, 'bronze');
    v_points := GREATEST(FLOOR(NEW.total_price * COALESCE((v_loyalty->>'points_per_sar')::numeric, 0)
                               * COALESCE((v_loyalty->'multipliers'->>v_tier)::numeric, 1))::int, 0);
    v_lifetime := COALESCE(v_row.lifetime_points, 0) + v_points;
    v_tier := CASE
      WHEN v_lifetime >= COALESCE((v_loyalty->'tiers'->>'platinum')::int, 2147483647) THEN 'platinum'
      WHEN v_lifetime >= COALESCE((v_loyalty->'tiers'->>'gold')::int, 2147483647) THEN 'gold'
      WHEN v_lifetime >= COALESCE((v_loyalty->'tiers'->>'silver')::int, 2147483647) THEN 'silver'
      ELSE 'bronze' END;

    IF v_points > 0 THEN
      IF v_row.id IS NULL THEN
        INSERT INTO public.customer_loyalty (customer_id, provider_id, points_balance, lifetime_points, tier)
        VALUES (NEW.customer_id, v_provider_id, v_points, v_lifetime, v_tier)
        RETURNING * INTO v_row;
      ELSE
        UPDATE public.customer_loyalty
        SET points_balance = points_balance + v_points, lifetime_points = v_lifetime, tier = v_tier, updated_at = now()
        WHERE id = v_row.id;
      END IF;
      INSERT INTO public.loyalty_points_ledger (loyalty_id, booking_id, points_change, event_type, description)
      VALUES (v_row.id, NEW.id, v_points, 'booking_completed', format('Earned %s points', v_points));
    END IF;
  END IF;

  IF COALESCE((v_referral->>'enabled')::boolean, FALSE) THEN
    SELECT * INTO v_ref FROM public.customer_referrals
    WHERE referee_id = NEW.customer_id AND status = 'pending'
    ORDER BY created_at LIMIT 1 FOR UPDATE;

    IF v_ref.id IS NOT NULL THEN
      UPDATE public.customer_referrals
      SET status = 'rewarded', qualifying_booking_id = NEW.id, rewarded_at = now(),
          reward_amount = COALESCE((v_referral->>'reward_sar')::numeric, reward_amount)
      WHERE id = v_ref.id;
      INSERT INTO public.wallet_credits (customer_id, amount, reason, source)
      VALUES (v_ref.referee_id, COALESCE((v_referral->>'reward_sar')::numeric, v_ref.reward_amount),
              'Referral bonus — first completed visit', 'referral'),
             (v_ref.referrer_id, COALESCE((v_referral->>'reward_sar')::numeric, v_ref.reward_amount),
              'Referral reward — invited friend completed a visit', 'referral');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_waitlist_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_time TIME;
  v_candidate public.waitlists;
  v_customer RECORD;
  v_vars JSONB;
BEGIN
  IF NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending_payment', 'confirmed')) THEN
    RETURN NEW;
  END IF;
  IF OLD.scheduled_at <= now() THEN
    RETURN NEW;
  END IF;

  v_date := (OLD.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date;
  v_time := (OLD.scheduled_at AT TIME ZONE 'Asia/Riyadh')::time;

  SELECT * INTO v_candidate
  FROM public.waitlists
  WHERE branch_id = OLD.branch_id
    AND preferred_date = v_date
    AND status = 'active'
    AND preferred_time_start <= v_time
    AND preferred_time_end >= v_time
    AND service_id = OLD.service_id
    AND (employee_id IS NULL OR employee_id = OLD.employee_id)
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_candidate.id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.waitlists
  SET status = 'notified', notified_at = now(), expires_at = now() + interval '15 minutes'
  WHERE id = v_candidate.id;

  SELECT id, phone_number, CASE WHEN language_preference = 'en' THEN 'en' ELSE 'ar' END AS lang
  INTO v_customer FROM public.profiles WHERE id = v_candidate.customer_id;

  IF v_customer.phone_number IS NOT NULL THEN
    v_vars := public.booking_message_variables(OLD.id, v_customer.lang)
      || jsonb_build_object(
           'claim_url', 'https://primora.sa/shop/' ||
             (SELECT provider_id FROM public.branches WHERE id = OLD.branch_id)::text ||
             '?claim_waitlist=' || v_candidate.id::text,
           'expires_minutes', '15');
    INSERT INTO public.message_queue (recipient_phone, recipient_id, channel, template_name, locale,
                                      variables, scheduled_for, status)
    VALUES (v_customer.phone_number, v_customer.id, 'whatsapp', 'waitlist_slot_opened', v_customer.lang,
            v_vars, now(), 'pending');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_backfill_waitlist_on_booking_cancellation ON public.bookings;
CREATE TRIGGER trigger_backfill_waitlist_on_booking_cancellation
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.backfill_waitlist_on_cancellation();

-- First-visit detection is decided inside booking_create_internal; walk-ins never count.
CREATE OR REPLACE FUNCTION public.handle_booking_first_visit_detection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_first_visit IS NULL THEN
    NEW.is_first_visit := NEW.customer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.branches br ON br.id = b.branch_id
      WHERE b.customer_id = NEW.customer_id
        AND br.provider_id = (SELECT provider_id FROM public.branches WHERE id = NEW.branch_id)
        AND b.status IN ('confirmed', 'completed')
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Prayer pauses come from the caller's Umm al-Qura calculation (adhan in the web app);
--     nothing is hard-coded here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_branch_schedule_with_prayer_pauses(
  p_branch_id UUID,
  p_target_date DATE,
  p_service_duration INTEGER DEFAULT 30,
  p_service_id UUID DEFAULT NULL,
  prayer_window_starts TIMESTAMPTZ[] DEFAULT NULL,
  prayer_window_ends TIMESTAMPTZ[] DEFAULT NULL,
  prayer_names TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_windows JSONB := '[]'::jsonb;
  v_slots JSONB;
  i INT;
BEGIN
  IF prayer_window_starts IS NOT NULL THEN
    FOR i IN 1 .. COALESCE(array_length(prayer_window_starts, 1), 0) LOOP
      v_windows := v_windows || jsonb_build_object(
        'prayer', COALESCE(prayer_names[i], 'prayer'),
        'start_time', to_char(prayer_window_starts[i] AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
        'end_time', to_char(prayer_window_ends[i] AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
        'starts_at', prayer_window_starts[i],
        'ends_at', prayer_window_ends[i]
      );
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'time', to_char(t.slot_start AT TIME ZONE 'Asia/Riyadh', 'HH24:MI'),
           'slot_start', t.slot_start,
           'available_professionals', t.n) ORDER BY t.slot_start), '[]'::jsonb)
  INTO v_slots
  FROM (
    SELECT sl.slot_start, COUNT(DISTINCT e.id) AS n
    FROM public.employees e
    CROSS JOIN LATERAL public.get_available_slots(
      e.id, p_target_date, COALESCE(p_service_duration, 30), prayer_window_starts, prayer_window_ends) sl
    WHERE e.branch_id = p_branch_id AND e.is_active
      AND (p_service_id IS NULL OR EXISTS (
        SELECT 1 FROM public.employee_services es WHERE es.employee_id = e.id AND es.service_id = p_service_id))
    GROUP BY sl.slot_start
  ) t;

  RETURN jsonb_build_object(
    'date', p_target_date,
    'branch_id', p_branch_id,
    'prayer_windows', v_windows,
    'prayer_windows_source', CASE WHEN prayer_window_starts IS NULL THEN 'not_provided' ELSE 'client_umm_al_qura' END,
    'available_slots', v_slots
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Execution grants. Supabase grants EXECUTE on new public functions to anon and
--     authenticated by default, so every function is set explicitly here.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f TEXT;
BEGIN
  -- Internal helpers: no client role may call them.
  FOREACH f IN ARRAY ARRAY[
    'public.platform_setting(text)',
    'public.write_audit_log(text, text, uuid, jsonb)',
    'public.is_booking_staff(uuid, uuid)',
    'public.is_provider_staff(uuid, uuid)',
    'public.booking_captured_amount(uuid)',
    'public.booking_release_discounts(uuid)',
    'public.booking_create_internal(uuid, uuid, uuid, uuid[], timestamptz, boolean, numeric, numeric, text, uuid, text, text, text, integer)',
    'public.create_refund_request_internal(uuid, numeric, text, text, text)',
    'public.ledger_settle_unperformed_booking(uuid)',
    'public.enqueue_booking_reminders(uuid)',
    'public.booking_message_variables(uuid, text)',
    'public.handle_booking_messaging_lifecycle()',
    'public.trigger_on_booking_completed_rewards()',
    'public.backfill_waitlist_on_cancellation()',
    'public.handle_booking_first_visit_detection()',
    'public.protect_provider_control_fields()',
    'public.protect_booking_immutable_fields()',
    'public.validate_booking_status_transition()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  -- Signed-in users only (each function authorizes the caller itself).
  FOREACH f IN ARRAY ARRAY[
    'public.check_customer_booking_eligibility(uuid, uuid)',
    'public.toggle_customer_block(uuid, uuid, text, boolean)',
    'public.create_booking(uuid, uuid, timestamptz, boolean, numeric, numeric, uuid, text, text, text, integer, uuid, text)',
    'public.create_multi_service_booking(uuid, uuid, timestamptz, jsonb, boolean, text, text, text, text, integer, numeric, numeric, uuid)',
    'public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric)',
    'public.cancel_booking(uuid, text)',
    'public.mark_booking_no_show(uuid, text)',
    'public.employee_update_booking_status(uuid, character varying, text)',
    'public.reschedule_booking(uuid, timestamptz, uuid, text)',
    'public.get_branch_schedule_with_prayer_pauses(uuid, date, integer, uuid, timestamptz[], timestamptz[], text[])'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;

  -- Scheduler / payment webhook only (admins are authorized inside the function).
  FOREACH f IN ARRAY ARRAY[
    'public.expire_stale_booking_holds(integer)',
    'public.confirm_booking_payment(uuid, text, numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
