-- Deposit Enforcer: make the booking deposit a per-provider setting instead of
-- a hardcoded 15%. Owners configure it; create_booking reads it.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS deposit_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00
  CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100);

-- Recreate create_booking so the deposit uses the provider's deposit_percentage.
-- Only the deposit line changes; tax stays at 15% VAT and commission stays
-- provider-configured. Everything else is byte-for-byte the hardened version.
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
  v_deposit_pct DECIMAL(5,2);
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
    p.deposit_percentage,
    s.is_home_service_eligible
  INTO
    v_branch_id,
    v_provider_id,
    v_duration,
    v_price,
    v_commission_rate,
    v_deposit_pct,
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
    ROUND(v_price * COALESCE(v_deposit_pct, 20) / 100, 2),
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
