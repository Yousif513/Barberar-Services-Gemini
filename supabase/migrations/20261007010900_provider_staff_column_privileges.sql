-- R10: a signed-in user could read the internals of every verified provider and of every active staff member.
--
-- The row policies make verified providers and active employees visible to everyone, and signed-in users held table-level SELECT,
-- so a customer with no booking could select vat_number, cr_number, admin_notes ("internal: slow payer"), contact details,
-- commission_percentage, trade_license_url and cr_wathq_data of any provider, and phone and email of any employee. The anonymous
-- role was fixed in 20261005150000; this does the same for signed-in users: SELECT is granted per column, without the internal ones.
--
-- Read paths for the people who may see the internals (the columns stay writable by the policies that already govern writes):
--   get_provider_private_profile(provider)      the owner, a business-wide manager holding the 'settings' permission, or an
--                                               administrator (audited unless the administrator owns the business)
--   admin_provider_private_directory()          administrators, every provider, audited
--   get_provider_staff_contacts(provider)       the owner, or a delegate holding the 'staff' permission, or an administrator (audited)
-- The security_invoker view admin_provider_performance used two hidden columns; it now takes them from functions that return a value
-- only to an administrator or the owner of that business.

DO $$
DECLARE
  v_spec TEXT[];
  v_table TEXT;
  v_hidden TEXT[];
  v_visible TEXT;
BEGIN
  FOREACH v_spec SLICE 1 IN ARRAY ARRAY[
    ARRAY['providers', 'admin_notes,cr_wathq_data,commission_percentage,last_activity_at,cr_number,vat_number,trade_license_url,contact_email,contact_phone,policy_confirmed_by'],
    -- profile_id stays: row policies on other tables (a staff member's own bookings) reference it.
    ARRAY['employees', 'phone,email']
  ]
  LOOP
    v_table := v_spec[1];
    v_hidden := string_to_array(v_spec[2], ',');
    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO v_visible
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_table AND NOT (column_name = ANY (v_hidden));
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM authenticated', v_table);
    EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO authenticated', v_visible, v_table);
  END LOOP;
END $$;

-- Values only an administrator or the owner of the business may see; everyone else gets NULL (used by admin_provider_performance).
CREATE OR REPLACE FUNCTION public.provider_commission_for_staff(p_provider_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.commission_percentage FROM public.providers p
   WHERE p.id = p_provider_id AND (public.is_admin() OR p.owner_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.provider_commission_for_staff(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_commission_for_staff(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.provider_last_activity_for_staff(p_provider_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.last_activity_at FROM public.providers p
   WHERE p.id = p_provider_id AND (public.is_admin() OR p.owner_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.provider_last_activity_for_staff(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_last_activity_for_staff(UUID) TO authenticated;

CREATE OR REPLACE VIEW public.admin_provider_performance
WITH (security_invoker = true) AS
SELECT
  p.id AS provider_id,
  p.business_name_en,
  p.business_name_ar,
  p.status,
  public.provider_commission_for_staff(p.id)::numeric(5,2) AS commission_percentage,
  public.provider_last_activity_for_staff(p.id) AS last_activity_at,
  COALESCE(b.total_bookings, 0)      AS total_bookings,
  COALESCE(b.completed_bookings, 0)  AS completed_bookings,
  COALESCE(b.cancelled_bookings, 0)  AS cancelled_bookings,
  COALESCE(b.no_show_bookings, 0)    AS no_show_bookings,
  COALESCE(b.gross_revenue, 0)       AS gross_revenue,
  COALESCE(b.commission_amount, 0)   AS commission_amount,
  COALESCE(r.avg_rating, 0)          AS avg_rating,
  COALESCE(r.review_count, 0)        AS review_count,
  COALESCE(e.employee_count, 0)      AS employee_count,
  COALESCE(s.service_count, 0)       AS service_count
FROM public.providers p
LEFT JOIN (
  SELECT br.provider_id,
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'completed') AS completed_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled') AS cancelled_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'no_show')   AS no_show_bookings,
         SUM(bk.total_price)         FILTER (WHERE bk.status = 'completed') AS gross_revenue,
         SUM(bk.platform_commission) FILTER (WHERE bk.status = 'completed') AS commission_amount
  FROM public.bookings bk
  JOIN public.branches br ON br.id = bk.branch_id
  GROUP BY br.provider_id
) b ON b.provider_id = p.id
LEFT JOIN (
  SELECT rv.provider_id, AVG(rv.rating) AS avg_rating, COUNT(*) AS review_count
  FROM public.reviews rv
  GROUP BY rv.provider_id
) r ON r.provider_id = p.id
LEFT JOIN (
  SELECT br.provider_id, COUNT(*) AS employee_count
  FROM public.employees em
  JOIN public.branches br ON br.id = em.branch_id
  GROUP BY br.provider_id
) e ON e.provider_id = p.id
LEFT JOIN (
  SELECT sv.provider_id, COUNT(*) AS service_count
  FROM public.services sv
  WHERE sv.provider_id IS NOT NULL
  GROUP BY sv.provider_id
) s ON s.provider_id = p.id;

CREATE OR REPLACE FUNCTION public.get_provider_private_profile(p_provider_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_is_admin BOOLEAN := FALSE;
  v_delegate BOOLEAN := FALSE;
  v_out JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_provider_id IS NULL THEN
    SELECT * INTO v_provider FROM public.providers WHERE owner_id = v_uid ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;
  END IF;
  IF v_provider.id IS NOT NULL THEN
    v_is_admin := public.is_admin();
    v_delegate := EXISTS (
      SELECT 1 FROM public.provider_memberships m
       WHERE m.provider_id = v_provider.id AND m.user_id = v_uid AND m.is_active AND m.branch_id IS NULL
         AND m.role IN ('manager', 'owner') AND m.permissions -> 'settings' = 'true'::jsonb);
  END IF;
  IF v_provider.id IS NULL OR NOT (v_provider.owner_id = v_uid OR v_delegate OR v_is_admin) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  v_out := jsonb_build_object(
    'provider_id', v_provider.id,
    'contact_phone', v_provider.contact_phone,
    'contact_email', v_provider.contact_email,
    'cr_number', v_provider.cr_number,
    'vat_number', v_provider.vat_number,
    'trade_license_url', v_provider.trade_license_url,
    'commission_percentage', v_provider.commission_percentage);
  IF v_is_admin THEN
    v_out := v_out || jsonb_build_object('last_activity_at', v_provider.last_activity_at, 'admin_notes', v_provider.admin_notes,
                                          'cr_wathq_data', v_provider.cr_wathq_data);
    IF v_provider.owner_id IS DISTINCT FROM v_uid THEN
      PERFORM public.write_audit_log('provider.private_profile_viewed', 'providers', v_provider.id, '{}'::jsonb);
    END IF;
  END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.get_provider_private_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_private_profile(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_provider_private_directory()
RETURNS TABLE (
  provider_id UUID, contact_email TEXT, contact_phone TEXT, cr_number TEXT, vat_number TEXT, trade_license_url TEXT,
  commission_percentage NUMERIC, admin_notes TEXT, last_activity_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator role required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.write_audit_log('provider.private_directory_viewed', 'providers', NULL,
    jsonb_build_object('providers', (SELECT count(*) FROM public.providers)));
  RETURN QUERY
    SELECT p.id, p.contact_email::text, p.contact_phone::text, p.cr_number::text, p.vat_number::text, p.trade_license_url::text,
           p.commission_percentage::numeric, p.admin_notes::text, p.last_activity_at
      FROM public.providers p
     ORDER BY p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_provider_private_directory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_provider_private_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_provider_staff_contacts(p_provider_id UUID DEFAULT NULL)
RETURNS TABLE (employee_id UUID, phone TEXT, email TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider_id UUID := p_provider_id;
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF v_provider_id IS NULL THEN
    SELECT id INTO v_provider_id FROM public.providers WHERE owner_id = v_uid ORDER BY created_at LIMIT 1;
  END IF;
  SELECT owner_id INTO v_owner FROM public.providers WHERE id = v_provider_id;
  IF v_provider_id IS NULL OR v_owner IS NULL OR NOT (v_owner = v_uid OR public.can_access_provider_operation(v_provider_id, NULL, 'staff')) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid AND public.is_admin() THEN
    PERFORM public.write_audit_log('provider.staff_contacts_viewed', 'providers', v_provider_id, '{}'::jsonb);
  END IF;
  RETURN QUERY
    SELECT e.id, e.phone, e.email
      FROM public.employees e JOIN public.branches br ON br.id = e.branch_id
     WHERE br.provider_id = v_provider_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_provider_staff_contacts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_staff_contacts(UUID) TO authenticated;
