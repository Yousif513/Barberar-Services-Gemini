-- Harden authentication, authorization, and the booking transaction.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- New accounts always start as customers. Privileged roles must be assigned by
-- an administrator through a trusted server-side operation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    role,
    first_name,
    last_name,
    email,
    phone_number,
    language_preference
  )
  VALUES (
    NEW.id,
    'customer'::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.phone, '+9665' || floor(random() * 900000000 + 100000000)::text),
    COALESCE(NEW.raw_user_meta_data->>'language_preference', 'ar')
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Profiles contain private contact information and must never be public.
DROP POLICY IF EXISTS "Public read on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own expo_push_token" ON public.profiles;
DROP POLICY IF EXISTS "Customers create own bookings" ON public.bookings;

CREATE POLICY "Users read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  first_name,
  last_name,
  email,
  phone_number,
  language_preference,
  expo_push_token
) ON public.profiles TO authenticated;

CREATE POLICY "Admins read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Providers read booked customer profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    JOIN public.providers p ON p.id = br.provider_id
    LEFT JOIN public.employees e ON e.id = b.employee_id
    WHERE b.customer_id = profiles.id
      AND (p.owner_id = (SELECT auth.uid()) OR e.profile_id = (SELECT auth.uid()))
  )
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active categories"
ON public.categories
FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

CREATE POLICY "Admins manage categories"
ON public.categories
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage providers"
ON public.providers
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

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
    NEW.is_verified := FALSE;
    NEW.commission_percentage := 15.00;
  ELSE
    NEW.owner_id := OLD.owner_id;
    NEW.is_verified := OLD.is_verified;
    NEW.commission_percentage := OLD.commission_percentage;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_provider_control_fields()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_provider_control_fields_before_write
BEFORE INSERT OR UPDATE ON public.providers
FOR EACH ROW
EXECUTE FUNCTION public.protect_provider_control_fields();

CREATE OR REPLACE FUNCTION public.set_user_role(
  target_user_id UUID,
  target_role public.user_role
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET role = target_role
  WHERE id = target_user_id
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_role(UUID, public.user_role)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, public.user_role)
TO authenticated;

CREATE POLICY "Admins manage bookings"
ON public.bookings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage ledger"
ON public.transactional_ledger
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage reviews"
ON public.reviews
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Public catalog reads are intentionally limited to catalog data. Ownership
-- policies cover provider maintenance while staff can read their own records.
CREATE POLICY "Public read on active employees"
ON public.employees
FOR SELECT
TO anon, authenticated
USING (is_active = TRUE);

CREATE POLICY "Owners manage employees"
ON public.employees
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.id = employees.branch_id
      AND p.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.id = employees.branch_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Public read on employee services"
ON public.employee_services
FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Owners manage employee services"
ON public.employee_services
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE e.id = employee_services.employee_id
      AND p.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE e.id = employee_services.employee_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Public read on employee availability"
ON public.employee_availability
FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Owners manage employee availability"
ON public.employee_availability
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE e.id = employee_availability.employee_id
      AND p.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.providers p ON p.id = b.provider_id
    WHERE e.id = employee_availability.employee_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Public read on service resource requirements"
ON public.service_resources
FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Owners manage service resource requirements"
ON public.service_resources
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.services s
    JOIN public.providers p ON p.id = s.provider_id
    WHERE s.id = service_resources.service_id
      AND p.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.services s
    JOIN public.providers p ON p.id = s.provider_id
    WHERE s.id = service_resources.service_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Providers update branch bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.id = bookings.branch_id
      AND p.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.providers p ON p.id = b.provider_id
    WHERE b.id = bookings.branch_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Customers create reviews for completed bookings"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = reviews.booking_id
      AND b.customer_id = (SELECT auth.uid())
      AND b.status = 'completed'
  )
);

CREATE POLICY "Public read reviews"
ON public.reviews
FOR SELECT
TO anon, authenticated
USING (TRUE);

CREATE POLICY "Providers read own ledger"
ON public.transactional_ledger
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
    JOIN public.providers p ON p.id = br.provider_id
    WHERE b.id = transactional_ledger.booking_id
      AND p.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Customers read own ledger"
ON public.transactional_ledger
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = transactional_ledger.booking_id
      AND b.customer_id = (SELECT auth.uid())
  )
);

-- The stored range keeps the exclusion index simple and immutable. The
-- exclusion constraint is the final concurrency guard, so simultaneous
-- requests cannot reserve overlapping time for the same employee.
ALTER TABLE public.bookings
ADD COLUMN booking_window TSTZRANGE;

CREATE OR REPLACE FUNCTION public.set_booking_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.booking_window := tstzrange(
    NEW.scheduled_at,
    NEW.scheduled_at + make_interval(mins => NEW.duration_minutes),
    '[)'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_booking_window() FROM PUBLIC, anon, authenticated;

UPDATE public.bookings
SET booking_window = tstzrange(
  scheduled_at,
  scheduled_at + make_interval(mins => duration_minutes),
  '[)'
);

ALTER TABLE public.bookings
ALTER COLUMN booking_window SET NOT NULL;

CREATE TRIGGER set_booking_window_before_write
BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_window();

CREATE OR REPLACE FUNCTION public.protect_booking_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.customer_id,
    NEW.branch_id,
    NEW.employee_id,
    NEW.service_id,
    NEW.is_home_service,
    NEW.home_address_lat,
    NEW.home_address_lng,
    NEW.scheduled_at,
    NEW.duration_minutes,
    NEW.total_price,
    NEW.deposit_required,
    NEW.tax_amount,
    NEW.platform_commission,
    NEW.client_profile_id
  ) IS DISTINCT FROM ROW(
    OLD.customer_id,
    OLD.branch_id,
    OLD.employee_id,
    OLD.service_id,
    OLD.is_home_service,
    OLD.home_address_lat,
    OLD.home_address_lng,
    OLD.scheduled_at,
    OLD.duration_minutes,
    OLD.total_price,
    OLD.deposit_required,
    OLD.tax_amount,
    OLD.platform_commission,
    OLD.client_profile_id
  ) THEN
    RAISE EXCEPTION 'Booking commercial fields are immutable after creation'
      USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_booking_immutable_fields()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_booking_immutable_fields_before_update
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.protect_booking_immutable_fields();

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

  IF NEW.status = 'cancelled' AND OLD.customer_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'confirmed'
     AND NEW.status IN ('completed', 'no_show', 'cancelled')
     AND (
       EXISTS (
         SELECT 1
         FROM public.branches b
         JOIN public.providers p ON p.id = b.provider_id
         WHERE b.id = OLD.branch_id
           AND p.owner_id = auth.uid()
       )
       OR EXISTS (
         SELECT 1
         FROM public.employees e
         WHERE e.id = OLD.employee_id
           AND e.profile_id = auth.uid()
       )
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid booking status transition'
    USING ERRCODE = '22000';
END;
$$;

REVOKE ALL ON FUNCTION public.validate_booking_status_transition()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER validate_booking_status_transition_before_update
BEFORE UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.validate_booking_status_transition();

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_no_employee_overlap
EXCLUDE USING gist (
  employee_id WITH =,
  booking_window WITH &&
)
WHERE (status IN ('pending_payment', 'confirmed'));

ALTER TABLE public.transactional_ledger
ADD CONSTRAINT transactional_ledger_payment_intent_unique
UNIQUE (payment_intent_id);

CREATE OR REPLACE FUNCTION public.create_booking(
  target_employee_id UUID,
  target_service_id UUID,
  target_scheduled_at TIMESTAMP WITH TIME ZONE,
  request_home_service BOOLEAN DEFAULT FALSE,
  request_home_address_lat DECIMAL DEFAULT NULL,
  request_home_address_lng DECIMAL DEFAULT NULL,
  request_client_profile_id UUID DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_branch_id UUID;
  v_provider_id UUID;
  v_duration INT;
  v_price DECIMAL(10,2);
  v_commission_rate DECIMAL(5,2);
  v_home_eligible BOOLEAN;
  v_booking public.bookings;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF target_scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'Booking time must be in the future' USING ERRCODE = '22007';
  END IF;

  SELECT
    e.branch_id,
    s.provider_id,
    COALESCE(es.custom_duration_minutes, s.base_duration_minutes),
    COALESCE(es.custom_price, s.base_price),
    p.commission_percentage,
    s.is_home_service_eligible
  INTO
    v_branch_id,
    v_provider_id,
    v_duration,
    v_price,
    v_commission_rate,
    v_home_eligible
  FROM public.employee_services es
  JOIN public.employees e ON e.id = es.employee_id AND e.is_active = TRUE
  JOIN public.branches br ON br.id = e.branch_id
  JOIN public.services s
    ON s.id = es.service_id
   AND s.provider_id = br.provider_id
   AND s.is_active = TRUE
  JOIN public.providers p ON p.id = s.provider_id AND p.is_verified = TRUE
  WHERE es.employee_id = target_employee_id
    AND es.service_id = target_service_id;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Employee and service combination is unavailable'
      USING ERRCODE = '22023';
  END IF;

  IF request_home_service AND NOT v_home_eligible THEN
    RAISE EXCEPTION 'This service is not available as a home service'
      USING ERRCODE = '22023';
  END IF;

  IF request_home_service
     AND (request_home_address_lat IS NULL OR request_home_address_lng IS NULL) THEN
    RAISE EXCEPTION 'Home-service coordinates are required'
      USING ERRCODE = '22023';
  END IF;

  IF request_client_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.id = request_client_profile_id
      AND cp.client_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Client profile does not belong to the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_available_slots(
      target_employee_id,
      (target_scheduled_at AT TIME ZONE 'Asia/Riyadh')::date,
      v_duration
    ) slots
    WHERE slots.slot_start = target_scheduled_at
  ) THEN
    RAISE EXCEPTION 'Selected time is no longer available'
      USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.bookings (
    customer_id,
    branch_id,
    employee_id,
    service_id,
    status,
    is_home_service,
    home_address_lat,
    home_address_lng,
    scheduled_at,
    duration_minutes,
    total_price,
    deposit_required,
    tax_amount,
    platform_commission,
    client_profile_id
  )
  VALUES (
    v_user_id,
    v_branch_id,
    target_employee_id,
    target_service_id,
    'pending_payment',
    request_home_service,
    request_home_address_lat,
    request_home_address_lng,
    target_scheduled_at,
    v_duration,
    v_price,
    ROUND(v_price * 0.15, 2),
    ROUND(v_price * 0.15, 2),
    ROUND(v_price * v_commission_rate / 100, 2),
    request_client_profile_id
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Selected time is no longer available'
      USING ERRCODE = '23P01';
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(
  UUID,
  UUID,
  TIMESTAMP WITH TIME ZONE,
  BOOLEAN,
  DECIMAL,
  DECIMAL,
  UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_booking(
  UUID,
  UUID,
  TIMESTAMP WITH TIME ZONE,
  BOOLEAN,
  DECIMAL,
  DECIMAL,
  UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_booking(target_booking_id UUID)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled'
  WHERE id = target_booking_id
    AND customer_id = auth.uid()
    AND status IN ('pending_payment', 'confirmed')
  RETURNING * INTO v_booking;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking cannot be cancelled' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_booking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_review_relationships()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_provider_id UUID;
BEGIN
  SELECT b, br.provider_id
  INTO v_booking, v_provider_id
  FROM public.bookings b
  JOIN public.branches br ON br.id = b.branch_id
  WHERE b.id = NEW.booking_id;

  IF v_booking.id IS NULL
     OR v_booking.customer_id <> auth.uid()
     OR v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Only the customer may review a completed booking'
      USING ERRCODE = '42501';
  END IF;

  NEW.customer_id := v_booking.customer_id;
  NEW.provider_id := v_provider_id;
  NEW.employee_id := v_booking.employee_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_review_relationships()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER set_review_relationships_before_insert
BEFORE INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_review_relationships();

CREATE OR REPLACE FUNCTION public.confirm_booking_payment(
  target_booking_id UUID,
  target_payment_intent_id TEXT,
  target_total_captured DECIMAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_platform_share DECIMAL(10,2);
  v_provider_share DECIMAL(10,2);
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

  IF EXISTS (
    SELECT 1
    FROM public.transactional_ledger
    WHERE payment_intent_id = target_payment_intent_id
      AND booking_id <> target_booking_id
  ) THEN
    RAISE EXCEPTION 'Payment intent is already assigned to another booking'
      USING ERRCODE = '23505';
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

  UPDATE public.bookings
  SET status = 'confirmed'
  WHERE id = v_booking.id
    AND status = 'pending_payment';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_payment(UUID, TEXT, DECIMAL)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(UUID, TEXT, DECIMAL)
TO service_role;
