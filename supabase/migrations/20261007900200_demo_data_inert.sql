-- The demo salons and demo accounts that an early migration created can no longer be booked or signed in to.
--
-- Review finding D-19 (critical). 20260704082805_live_demo_seed_messages.sql inserts four sign-in accounts and three verified,
-- active, bookable salons (with stock photographs) into every database that applies the migrations. A customer who found
-- "Elite Barbershop Riyadh" could book it and pay a real deposit to a salon that does not exist.
--
-- Nothing is deleted here. This migration only switches the demo rows off (the salons are suspended and unverified, the
-- accounts are banned), which any operator can reverse. Removing them for good is a separate, deliberate step: the
-- administrator command admin_purge_demo_data below, which refuses unless the rows are still the untouched demo rows and no
-- real person has booked them. Whether to run it on the hosted project is the owner's decision.
--
-- The demo rows are recognised by their fixed identifiers AND by the demo e-mail domain of their owners, so a real salon
-- that ever reuses an identifier is left alone.

CREATE OR REPLACE FUNCTION public.demo_provider_ids()
RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
  ]::UUID[];
$$;

REVOKE ALL ON FUNCTION public.demo_provider_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_provider_ids() TO service_role;

-- The demo accounts: the three owners and the customer, recognised by the reserved demo domain.
CREATE OR REPLACE FUNCTION public.demo_user_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.profiles
   WHERE id IN ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
                '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')
     AND email LIKE 'demo.%@primora.local';
$$;

REVOKE ALL ON FUNCTION public.demo_user_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_user_ids() TO service_role;

DO $$
BEGIN
  -- The provider control-field guard resets status and verification unless the service role writes.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  UPDATE public.providers p
     SET status = 'suspended', is_verified = FALSE
   WHERE p.id = ANY (public.demo_provider_ids())
     AND p.owner_id IN (SELECT public.demo_user_ids())
     AND (p.status IS DISTINCT FROM 'suspended' OR p.is_verified);

  -- Ban the demo accounts so nobody can sign in to them (the column exists on current Supabase Auth; skipped where it does not).
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'banned_until') THEN
    EXECUTE 'UPDATE auth.users SET banned_until = ''infinity''::timestamptz WHERE id IN (SELECT public.demo_user_ids()) AND banned_until IS DISTINCT FROM ''infinity''::timestamptz';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Deliberate removal, by an administrator, with a reason
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_demo_data(p_reason TEXT, p_confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_providers UUID[];
  v_users UUID[];
  v_real_bookings INTEGER;
  v_deleted_providers INTEGER;
  v_deleted_users INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can remove the demo data' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;
  -- This removes data for good and takes no target, so it must be confirmed in words (a blind call, such as the catalogue
  -- matrix that probes every administrator command, is refused).
  IF p_confirmation IS DISTINCT FROM 'DELETE DEMO DATA' THEN
    RAISE EXCEPTION 'Type DELETE DEMO DATA to confirm' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(array_agg(p.id), '{}') INTO v_providers
    FROM public.providers p
   WHERE p.id = ANY (public.demo_provider_ids()) AND p.owner_id IN (SELECT public.demo_user_ids());
  SELECT COALESCE(array_agg(u), '{}') INTO v_users FROM public.demo_user_ids() u;

  -- Refuse while anyone other than the demo customer has booked a demo salon: that would be a real person's record.
  SELECT count(*) INTO v_real_bookings
    FROM public.bookings b
    JOIN public.branches br ON br.id = b.branch_id
   WHERE br.provider_id = ANY (v_providers)
     AND b.customer_id NOT IN (SELECT public.demo_user_ids());
  IF v_real_bookings > 0 THEN
    RAISE EXCEPTION 'Refused: % booking(s) on the demo salons belong to real accounts', v_real_bookings USING ERRCODE = '23503';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', auth.uid())::text, true);

  DELETE FROM public.providers WHERE id = ANY (v_providers);
  GET DIAGNOSTICS v_deleted_providers = ROW_COUNT;

  IF cardinality(v_users) > 0 THEN
    DELETE FROM auth.users WHERE id = ANY (v_users);
    GET DIAGNOSTICS v_deleted_users = ROW_COUNT;
  END IF;

  PERFORM public.write_audit_log('demo_data.purged', 'providers', NULL,
    jsonb_build_object('reason', v_reason, 'providers_removed', v_deleted_providers, 'accounts_removed', v_deleted_users));

  RETURN jsonb_build_object('providers_removed', v_deleted_providers, 'accounts_removed', v_deleted_users);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_demo_data(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_demo_data(TEXT, TEXT) TO authenticated;
