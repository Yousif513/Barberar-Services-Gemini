-- GOV-FIX H-1 (docs/reviews/2026-10-10-security-gov1.md): a read-only console role must not change provider-side data through a
-- SECURITY DEFINER command whose authorization helper lets every console session through.
--
-- GOV-2 (20261010200000) already moved can_access_provider_operation / can_access_provider_wide to admin_can('operations.write'),
-- which covers the inventory, purchase-order, walk-in, package, waitlist, group and recurring-settings commands of the finding.
-- The intake, professional-link and group-cancel helpers exclude administrators altogether. The one helper left that admits
-- any console role is is_membership_staff(): it gates both the membership reads and the two membership writes
-- (redeem_membership_visit, void_membership_redemption), so an analyst or finance session could record or void a visit.
-- The reads keep is_membership_staff(); the writes now use membership_staff_can_write(), whose administrator branch needs
-- operations.write.

CREATE OR REPLACE FUNCTION public.membership_staff_can_write(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.admin_can('operations.write')
    OR public.is_provider_staff(p_provider_id, auth.uid())
    OR public.can_access_provider_operation(p_provider_id, NULL, 'bookings')
  );
$$;
REVOKE ALL ON FUNCTION public.membership_staff_can_write(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.membership_staff_can_write(UUID) TO authenticated, service_role;

DO $govfix$
DECLARE
  f RECORD;
  v_def TEXT;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('redeem_membership_visit', 'void_membership_redemption')
  LOOP
    v_def := replace(pg_get_functiondef(f.oid), E'\r\n', E'\n');
    IF position('public.is_membership_staff(' IN v_def) = 0 THEN
      RAISE EXCEPTION 'GOV-FIX H-1: is_membership_staff not found in %', f.oid::regprocedure;
    END IF;
    EXECUTE replace(v_def, 'public.is_membership_staff(', 'public.membership_staff_can_write(');
  END LOOP;
END
$govfix$;
