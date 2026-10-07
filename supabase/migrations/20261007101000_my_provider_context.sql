-- FIX-PROV R18: which business does the signed-in person work for, and as what?
--
-- Every provider screen looked the business up by providers.owner_id = auth.uid(), so a stylist who signed in saw empty pages and no
-- business name although the database lets them read their own bookings. This is the one answer the portal asks first:
--   owner     the signed-in person owns a business
--   employee  they are an active professional of a business (employees.profile_id), possibly holding a delegation
--   none      neither
-- It returns the caller's own context only; it takes no argument, so there is no object to guess.

CREATE OR REPLACE FUNCTION public.my_provider_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_employee RECORD;
  v_membership RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_provider FROM public.providers WHERE owner_id = v_uid ORDER BY created_at, id LIMIT 1;
  IF v_provider.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'role', 'owner',
      'provider_id', v_provider.id,
      'business_name_en', v_provider.business_name_en,
      'business_name_ar', v_provider.business_name_ar,
      'employee_id', NULL, 'employee_name_en', NULL, 'employee_name_ar', NULL, 'branch_id', NULL,
      'membership_role', 'owner', 'permissions', '{}'::jsonb);
  END IF;

  SELECT e.id AS employee_id, e.name_en, e.name_ar, e.branch_id, b.provider_id, p.business_name_en, p.business_name_ar
    INTO v_employee
    FROM public.employees e
    JOIN public.branches b ON b.id = e.branch_id
    JOIN public.providers p ON p.id = b.provider_id
   WHERE e.profile_id = v_uid AND e.is_active
   ORDER BY e.created_at, e.id
   LIMIT 1;

  IF v_employee.employee_id IS NOT NULL THEN
    SELECT m.role, m.permissions INTO v_membership
      FROM public.provider_memberships m
     WHERE m.user_id = v_uid AND m.provider_id = v_employee.provider_id AND m.is_active
     ORDER BY (m.branch_id IS NULL) DESC, m.created_at
     LIMIT 1;
    RETURN jsonb_build_object(
      'role', 'employee',
      'provider_id', v_employee.provider_id,
      'business_name_en', v_employee.business_name_en,
      'business_name_ar', v_employee.business_name_ar,
      'employee_id', v_employee.employee_id,
      'employee_name_en', v_employee.name_en,
      'employee_name_ar', v_employee.name_ar,
      'branch_id', v_employee.branch_id,
      'membership_role', COALESCE(v_membership.role, 'stylist'),
      'permissions', COALESCE(v_membership.permissions, '{}'::jsonb));
  END IF;

  RETURN jsonb_build_object('role', 'none', 'provider_id', NULL, 'business_name_en', NULL, 'business_name_ar', NULL,
                            'employee_id', NULL, 'employee_name_en', NULL, 'employee_name_ar', NULL, 'branch_id', NULL,
                            'membership_role', NULL, 'permissions', '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.my_provider_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_provider_context() TO authenticated;
