-- Delegated access is limited to what was delegated, and ends when the person leaves.
--
-- Review findings C-D2, C-D3 and C-D23.
--
-- C-D2. is_provider_staff() was true for ANY active provider_memberships row, whatever its role or permissions, so a stockroom
-- clerk given inventory-only access could read the provider's revenue, platform fees and staff revenue, read the monthly
-- value summary, create walk-in bookings and see a customer's strike count. A membership is not staff by itself: it carries
-- explicit permissions (inventory, bookings, staff, reports) that can_access_provider_operation() checks. is_provider_staff()
-- is now the owner or an active employee, and the five functions that relied on it ask for the permission they need.
--
-- C-D23. The catalogue policies call can_manage_provider_operations(provider, NULL) for provider-wide records (products and
-- suppliers). A branch-scoped delegate passed because "no branch given" meant "any branch". A provider-wide record now needs
-- a provider-wide delegation (a membership with no branch), the owner or an administrator.
--
-- C-D3. A branch manager whose employee row was switched off kept managing stock and reading reports until someone remembered
-- the separate membership. Switching an employee off (or deleting the row) now switches off that person's delegations at the
-- provider, unless they still work at another of its branches.

-- Provider-wide access to one operation: the owner, an administrator, or a membership with no branch restriction.
CREATE OR REPLACE FUNCTION public.can_access_provider_wide(p_provider_id UUID, p_operation TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_operation IN ('inventory', 'bookings', 'staff', 'reports')
    AND (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active
        AND m.branch_id IS NULL
        AND m.role IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist')
        AND m.permissions -> p_operation = 'true'::jsonb
        AND EXISTS (
          SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
           WHERE b.provider_id = p_provider_id AND e.profile_id = m.user_id AND e.is_active
        )
    ));
$$;

REVOKE ALL ON FUNCTION public.can_access_provider_wide(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_provider_wide(UUID, TEXT) TO authenticated, service_role;

-- C-D23: provider-wide catalogue writes need a provider-wide delegation.
CREATE OR REPLACE FUNCTION public.can_manage_provider_operations(p_provider_id UUID, p_branch_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_branch_id IS NULL
              THEN public.can_access_provider_wide(p_provider_id, 'inventory')
              ELSE public.can_access_provider_operation(p_provider_id, p_branch_id, 'inventory') END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_provider_operations(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_provider_operations(UUID, UUID) TO authenticated, service_role;

-- C-D2: the five functions that used is_provider_staff() ask for the permission they need. Patched in place.
DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- Staff means the owner or an active employee: a delegation carries its own explicit permissions.
SELECT pg_temp.patch_function('public.is_provider_staff(uuid, uuid)'::regprocedure,
$from$
    OR EXISTS (
      SELECT 1 FROM public.provider_memberships m
      WHERE m.provider_id = p_provider_id AND m.user_id = p_user_id AND COALESCE(m.is_active, TRUE)
    )
$from$, $to$
$to$);

-- Revenue, platform fees and staff revenue: the reports permission, provider-wide (no employee, no branch-scoped delegate).
SELECT pg_temp.patch_function('public.get_provider_detailed_analytics(uuid, date, date)'::regprocedure,
  $from$IF NOT (public.is_provider_staff(p_provider_id, auth.uid()) OR public.is_admin()) THEN$from$,
  $to$IF NOT public.can_access_provider_wide(p_provider_id, 'reports') THEN$to$);

SELECT pg_temp.patch_function('public.get_provider_monthly_value_summary(uuid, date)'::regprocedure,
  $from$IF NOT (public.is_provider_staff(p_provider_id, auth.uid()) OR public.is_admin()) THEN$from$,
  $to$IF NOT public.can_access_provider_wide(p_provider_id, 'reports') THEN$to$);

-- Walk-in bookings and package sessions: the owner, an employee, an administrator, or a delegate with the bookings permission.
SELECT pg_temp.patch_function('public.create_walk_in_booking(uuid, uuid, uuid, text, text, text, numeric, timestamp with time zone, text)'::regprocedure,
  $from$IF NOT (public.is_provider_staff(v_provider_id, v_user_id) OR public.is_admin()) THEN$from$,
  $to$IF NOT (public.is_provider_staff(v_provider_id, v_user_id) OR public.is_admin() OR public.can_access_provider_operation(v_provider_id, NULL, 'bookings')) THEN$to$);

SELECT pg_temp.patch_function('public.redeem_package_session(uuid, uuid, text)'::regprocedure,
  $from$IF NOT (public.is_provider_staff(v_package.provider_id, v_user_id) OR public.is_admin()) THEN$from$,
  $to$IF NOT (public.is_provider_staff(v_package.provider_id, v_user_id) OR public.is_admin() OR public.can_access_provider_operation(v_package.provider_id, NULL, 'bookings')) THEN$to$);

-- A customer's strike count is for the provider's staff and delegates who handle bookings.
SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
  $from$v_is_staff := public.is_provider_staff(p_provider_id, v_caller)$from$,
  $to$v_is_staff := public.is_provider_staff(p_provider_id, v_caller) OR public.can_access_provider_operation(p_provider_id, NULL, 'bookings')$to$);

-- A delegation belongs to registered staff (save_provider_operation_membership only grants it to an employee of the provider):
-- a membership row whose person is not an active employee, however it got there, gives nothing.
SELECT pg_temp.patch_function('public.can_access_provider_operation(uuid, uuid, text)'::regprocedure,
$from$        AND m.permissions -> p_operation = 'true'::jsonb
$from$, $to$        AND m.permissions -> p_operation = 'true'::jsonb
        AND EXISTS (
          SELECT 1 FROM public.employees e JOIN public.branches eb ON eb.id = e.branch_id
           WHERE eb.provider_id = p_provider_id AND e.profile_id = m.user_id AND e.is_active
        )
$to$);

-- C-D3: offboarding an employee ends their delegations at that provider.
CREATE OR REPLACE FUNCTION public.end_delegations_of_offboarded_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile UUID;
  v_branch UUID;
  v_provider UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE) THEN
      RETURN NEW;
    END IF;
    v_profile := NEW.profile_id; v_branch := NEW.branch_id;
  ELSE
    v_profile := OLD.profile_id; v_branch := OLD.branch_id;
  END IF;
  IF v_profile IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT b.provider_id INTO v_provider FROM public.branches b WHERE b.id = v_branch;
  IF v_provider IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- (An employee row is unique per person, so nobody keeps working at another branch under a second row.)
  UPDATE public.provider_memberships SET is_active = FALSE
   WHERE provider_id = v_provider AND user_id = v_profile AND is_active;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.end_delegations_of_offboarded_employee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_end_delegations_of_offboarded_employee ON public.employees;
CREATE TRIGGER trg_end_delegations_of_offboarded_employee
  AFTER UPDATE OF is_active OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.end_delegations_of_offboarded_employee();
