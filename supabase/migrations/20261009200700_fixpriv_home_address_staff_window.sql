-- P-08 (privacy review 2026-10-08): the owner and the assigned employee could read a customer's home address 400 days after the visit, and an
-- administrator's reveal stamped booking_home_addresses.revealed_at, which is the switch that exposes the address to provider staff.
--
-- 1. Staff read a home address only while the visit is upcoming or recent: until the end of the appointment plus one day plus the number of days the
--    owner sets in platform_settings key address.staff_read_days. The key is unset (null) until the owner decides, which means one day after the visit.
--    The customer, an administrator (audited) and the service role are not limited. The same window applies to the table policy and to
--    get_booking_address_secure.
-- 2. Only a staff member's reveal stamps revealed_at; an administrator or the service role reading the address no longer does.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

INSERT INTO public.platform_settings (key, value, description, requires_owner_approval) VALUES
  ('address.staff_read_days', 'null'::jsonb,
   'Extra days (a whole number, 0 or more) after the day following a home-service appointment during which the salon staff may still read the customer''s home address. Unset until the owner decides: staff then lose access one day after the appointment.', TRUE)
ON CONFLICT (key) DO NOTHING;

-- The configured number of extra days; 0 while unset or malformed. Not sensitive, so signed-in users may call it (the table policy needs it).
CREATE OR REPLACE FUNCTION public.address_staff_read_days()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT CASE WHEN jsonb_typeof(value) = 'number' AND (value #>> '{}') ~ '^[0-9]{1,4}$' THEN (value #>> '{}')::integer END
                     FROM public.platform_settings
                    WHERE key = 'address.staff_read_days'
                      AND (auth.uid() IS NOT NULL OR COALESCE(auth.jwt()->>'role', '') = 'service_role')), 0);
$$;
REVOKE ALL ON FUNCTION public.address_staff_read_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.address_staff_read_days() TO authenticated, service_role;

-- Whether staff may still read the address of a booking (as the caller sees the booking: invoker rights, so it adds no visibility).
CREATE OR REPLACE FUNCTION public.home_address_staff_window_open(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.id = p_booking_id
       AND b.status IN ('confirmed', 'completed')
       AND now() <= b.scheduled_at + make_interval(mins => COALESCE(b.duration_minutes, 0)) + interval '1 day'
                    + make_interval(days => public.address_staff_read_days()));
$$;
REVOKE ALL ON FUNCTION public.home_address_staff_window_open(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.home_address_staff_window_open(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Staff read revealed home addresses" ON public.booking_home_addresses;
CREATE POLICY "Staff read revealed home addresses" ON public.booking_home_addresses
  FOR SELECT TO authenticated
  USING (revealed_at IS NOT NULL AND NOT public.is_admin() AND public.home_address_staff_window_open(booking_id));

SELECT pg_temp.patch_function('public.get_booking_address_secure(uuid)'::regprocedure,
$from$      v_revealed_address := v_home.address_text;
      IF v_home.booking_id IS NOT NULL AND v_home.revealed_at IS NULL AND v_booking.customer_id IS DISTINCT FROM v_user_id THEN$from$,
$to$      IF v_booking.customer_id = v_user_id OR public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
         OR public.home_address_staff_window_open(v_booking.id) THEN
        v_revealed_address := v_home.address_text;
      ELSE
        v_revealed_address := 'Address no longer available (العنوان لم يعد متاحاً)';
        v_home := NULL;
      END IF;
      IF v_home.booking_id IS NOT NULL AND v_home.revealed_at IS NULL AND v_booking.customer_id IS DISTINCT FROM v_user_id
         AND v_user_id IS NOT NULL AND NOT public.is_admin() THEN$to$);
