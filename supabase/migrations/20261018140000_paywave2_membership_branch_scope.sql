-- PAY-WAVE2, the money-related remainder of P-14 (docs/reviews/2026-10-08-security-privacy.md; re-check in
-- docs/reviews/2026-10-17-redteam-whole-stack.md): memberships_read, membership_plans_read, membership_redemptions_read and
-- is_membership_staff asked can_access_provider_operation(provider, NULL, 'bookings'), which admits a delegate scoped to one branch
-- because no branch is named. Memberships are provider-wide prepaid products that name the customer, the price and the visits,
-- so their member data is read by the provider owner, a provider-wide bookings delegate and the provider's staff only.
--   * can_access_provider_wide_operation: the owner, or an active delegate who is an active employee, holds the permission and has
--     no branch scope (can_access_provider_operation without the "no branch named" pass).
--   * The member list (list_provider_memberships) stays open to the provider's active employees at any branch: a membership is
--     redeemable at every branch, so counter staff verify it (owner decision paywave2-membership-member-list-staff).
--   * The three read policies use it, and is_membership_staff uses it in place of the branch-blind check. Plans on sale stay public, but only while the
--     provider is selling (provider_is_selling, RT-M3); drafts are the owner's and provider-wide delegates'.
--   * get_provider_chain_operations keeps its gate: it already rolls up only the branches the caller may read (tested).

CREATE OR REPLACE FUNCTION public.can_access_provider_wide_operation(p_provider_id UUID, p_operation TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_operation IN ('inventory', 'bookings', 'staff', 'reports')
    AND (EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.provider_memberships m
         WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active
           AND m.role IN ('manager', 'branch_manager', 'inventory_manager', 'receptionist')
           AND m.permissions -> p_operation = 'true'::jsonb
           AND EXISTS (SELECT 1 FROM public.employees e JOIN public.branches eb ON eb.id = e.branch_id
                        WHERE eb.provider_id = p_provider_id AND e.profile_id = m.user_id AND e.is_active)
           AND m.branch_id IS NULL));
$$;
REVOKE ALL ON FUNCTION public.can_access_provider_wide_operation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_provider_wide_operation(UUID, TEXT) TO authenticated, service_role;

DROP POLICY IF EXISTS "memberships_read" ON public.memberships;
CREATE POLICY "memberships_read" ON public.memberships FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()) OR public.can_access_provider_wide_operation(provider_id, 'bookings'));

DROP POLICY IF EXISTS "membership_redemptions_read" ON public.membership_redemptions;
CREATE POLICY "membership_redemptions_read" ON public.membership_redemptions FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()) OR public.can_access_provider_wide_operation(provider_id, 'bookings'));

DROP POLICY IF EXISTS "membership_plans_read" ON public.membership_plans;
CREATE POLICY "membership_plans_read" ON public.membership_plans FOR SELECT TO authenticated
  USING ((is_active AND public.provider_is_selling(provider_id)) OR public.is_admin()
         OR public.can_access_provider_wide_operation(provider_id, 'bookings'));

CREATE OR REPLACE FUNCTION public.is_membership_staff(p_provider_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.is_provider_staff(p_provider_id, auth.uid())
    OR public.can_access_provider_wide_operation(p_provider_id, 'bookings')
  );
$$;
REVOKE ALL ON FUNCTION public.is_membership_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_membership_staff(UUID) TO authenticated;
