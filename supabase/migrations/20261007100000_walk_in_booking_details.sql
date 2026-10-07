-- FIX-PROV C-D15: a counter booking keeps the payment method the staff chose and a private note.
--
-- create_walk_in_booking already took p_payment_method but only wrote it to the audit log, accepted any text, and had no
-- notes at all. The function is patched in place from its current definition (one new parameter, a payment method check
-- against payment_methods, and a write of both values to a staff-only table). Notes stay out of `bookings` on purpose: the
-- customer a visitor is linked to by phone can read their own booking row, and a provider's private note is not theirs to read.

CREATE TABLE IF NOT EXISTS public.walk_in_booking_details (
  booking_id UUID PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_walk_in_details_provider ON public.walk_in_booking_details (provider_id);
ALTER TABLE public.walk_in_booking_details ENABLE ROW LEVEL SECURITY;

-- is_provider_staff() is for commands only (clients cannot execute it), so policies ask through this answer-only wrapper.
CREATE OR REPLACE FUNCTION public.caller_is_provider_staff(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$ SELECT COALESCE(public.is_provider_staff(p_provider_id, auth.uid()), FALSE) $fn$;
REVOKE ALL ON FUNCTION public.caller_is_provider_staff(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caller_is_provider_staff(UUID) TO authenticated, service_role;

-- Read-only for the provider's staff and administrators; rows are written only by create_walk_in_booking.
DROP POLICY IF EXISTS "Provider staff read walk-in details" ON public.walk_in_booking_details;
CREATE POLICY "Provider staff read walk-in details"
  ON public.walk_in_booking_details FOR SELECT TO authenticated
  USING (public.is_admin() OR public.caller_is_provider_staff(provider_id));

DO $migrate$
DECLARE
  v_old regprocedure := 'public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric, timestamp with time zone)'::regprocedure;
  v_def text := replace(pg_get_functiondef(v_old), chr(13) || chr(10), chr(10));
  v_new text := v_def;
  v_header_from text := 'p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone)';
  v_check_anchor text := $q$  SELECT s.id, COALESCE(es.custom_duration_minutes, s.base_duration_minutes) AS duration,$q$;
  v_audit_anchor text := $q$  PERFORM public.write_audit_log('provider.walk_in_created',$q$;
BEGIN
  IF position(v_header_from IN v_new) = 0 THEN RAISE EXCEPTION 'create_walk_in_booking: parameter list not recognised'; END IF;
  IF position(v_check_anchor IN v_new) = 0 THEN RAISE EXCEPTION 'create_walk_in_booking: service lookup not found'; END IF;
  IF position(v_audit_anchor IN v_new) = 0 THEN RAISE EXCEPTION 'create_walk_in_booking: audit call not found'; END IF;

  v_new := replace(v_new, v_header_from,
    'p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)');

  v_new := replace(v_new, v_check_anchor,
$chk$  IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
    RAISE EXCEPTION 'A note is at most 500 characters' USING ERRCODE = '22023';
  END IF;
  -- Counter payments: a method the platform offers to customers and has switched on (not the wallet balance, which only the customer can spend).
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_methods pm
    WHERE pm.key = p_payment_method AND pm.enabled AND 'customer' = ANY (pm.enabled_for_roles) AND pm.key <> 'wallet'
  ) THEN
    RAISE EXCEPTION 'Choose an available payment method' USING ERRCODE = '22023';
  END IF;

$chk$ || v_check_anchor);

  v_new := replace(v_new, v_audit_anchor,
$ins$  INSERT INTO public.walk_in_booking_details (booking_id, provider_id, payment_method, notes, created_by)
  VALUES (v_booking.id, v_provider_id, p_payment_method, NULLIF(TRIM(COALESCE(p_notes, '')), ''), v_user_id);

$ins$ || v_audit_anchor);

  DROP FUNCTION public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric, timestamp with time zone);
  EXECUTE v_new;
END
$migrate$;

REVOKE ALL ON FUNCTION public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric, timestamp with time zone, text) TO authenticated, service_role;

SELECT public.grant_data_api_access('public.walk_in_booking_details');
SELECT public.attach_admin_audit_trigger('public.walk_in_booking_details');
