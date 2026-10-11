-- Migration: 20261005110000_admin_clear_customer_profile.sql
-- The customers screen "anonymized" a customer from the browser by writing a made-up +966500000xxx phone
-- number (UNIQUE, so erasures collided with each other and could take a real person's number), discarded
-- the operator's reason, and reported a completed PDPL erasure while only touching four profile fields.
--
-- admin_clear_customer_profile clears the personal details held on the customer's profile in one
-- audited transaction, with the reason recorded. It deliberately does not touch the sign-in identity
-- (auth.users), bookings, invoices or messages: what PDPL erasure must remove and what ZATCA retention
-- must keep is an owner/legal decision recorded as an open gap, so this command does exactly what it
-- says and nothing more.

CREATE OR REPLACE FUNCTION public.admin_clear_customer_profile(p_customer_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_customer_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.role <> 'customer' THEN
    RAISE EXCEPTION 'Only customer profiles can be cleared here' USING ERRCODE = '22023';
  END IF;

  -- The row-level audit trigger picks the reason up for the profiles.update entry.
  PERFORM set_config('primora.audit_reason', v_reason, true);

  UPDATE public.profiles
  SET first_name = NULL,
      last_name = NULL,
      email = NULL,
      phone_number = NULL,
      phone_verified = FALSE,
      phone_verified_at = NULL,
      gender = NULL,
      expo_push_token = NULL
  WHERE id = v_profile.id;

  PERFORM public.write_audit_log('customer.profile_cleared', 'profiles', v_profile.id,
    jsonb_build_object('reason', v_reason,
                       'cleared', jsonb_build_array('first_name', 'last_name', 'email', 'phone_number', 'gender', 'expo_push_token'),
                       'kept', jsonb_build_array('sign_in_identity', 'bookings', 'invoices', 'messages')));

  RETURN jsonb_build_object('customer_id', v_profile.id, 'cleared', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_customer_profile(UUID, TEXT) TO authenticated;
