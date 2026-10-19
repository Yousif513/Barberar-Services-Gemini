-- PAY-WAVE2 follow-up: provider_is_selling stays a server helper. The public package policy and the plan policy needed visitors and
-- customers to execute it, which widened the anonymous function surface (trust, inventory and QA allow-lists). The policies now ask
-- the providers table directly, which visitors and customers read for verified providers only (status and is_verified are public
-- columns), and the helper is executable by the service role (payment-checkout) and the definer commands only.

DROP POLICY IF EXISTS "Public read on packages" ON public.packages;
CREATE POLICY "Public read on packages" ON public.packages FOR SELECT
  USING (is_active = true AND EXISTS (
    SELECT 1 FROM public.providers p WHERE p.id = packages.provider_id AND p.status = 'active' AND p.is_verified));

DROP POLICY IF EXISTS "membership_plans_read" ON public.membership_plans;
CREATE POLICY "membership_plans_read" ON public.membership_plans FOR SELECT TO authenticated
  USING ((is_active AND EXISTS (
            SELECT 1 FROM public.providers p WHERE p.id = membership_plans.provider_id AND p.status = 'active' AND p.is_verified))
         OR public.is_admin()
         OR public.can_access_provider_wide_operation(provider_id, 'bookings'));

REVOKE ALL ON FUNCTION public.provider_is_selling(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_is_selling(UUID) TO service_role;
