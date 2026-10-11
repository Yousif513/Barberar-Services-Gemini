-- P-10 (privacy review 2026-10-08): the SELECT policies of branches, employee_availability and provider_closures were USING (true) for visitors, so the
-- address and coordinates of pending, rejected or suspended providers (including home-based ones) and their staff schedules were public, while
-- providers itself is public only when is_verified. The three tables now follow the provider: visitors read rows of verified providers only.
-- Signed-in users additionally read what they legitimately need: the provider's own staff and delegates, administrators, and a customer who has a
-- booking at that branch (their history keeps showing the place after a provider is suspended). Writes are untouched.

CREATE OR REPLACE FUNCTION public.can_read_provider_place(p_provider_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.is_verified)
    OR public.is_provider_staff(p_provider_id, auth.uid())
    OR public.is_admin()
    OR (p_branch_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.branch_id = p_branch_id AND b.customer_id = auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_provider_place(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_provider_place(UUID, UUID) TO authenticated, service_role;

-- branches
DROP POLICY IF EXISTS "Public read on branches" ON public.branches;
DROP POLICY IF EXISTS "Visitors read branches of verified providers" ON public.branches;
CREATE POLICY "Visitors read branches of verified providers" ON public.branches
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = branches.provider_id AND p.is_verified));
DROP POLICY IF EXISTS "Signed-in users read branches they may see" ON public.branches;
CREATE POLICY "Signed-in users read branches they may see" ON public.branches
  FOR SELECT TO authenticated
  USING (public.can_read_provider_place(provider_id, id));

-- employee_availability (weekly schedule of a staff member)
DROP POLICY IF EXISTS "Public read on employee availability" ON public.employee_availability;
DROP POLICY IF EXISTS "Visitors read availability of verified providers" ON public.employee_availability;
CREATE POLICY "Visitors read availability of verified providers" ON public.employee_availability
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id JOIN public.providers p ON p.id = b.provider_id
                  WHERE e.id = employee_availability.employee_id AND p.is_verified));
DROP POLICY IF EXISTS "Signed-in users read availability they may see" ON public.employee_availability;
CREATE POLICY "Signed-in users read availability they may see" ON public.employee_availability
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.branches b ON b.id = e.branch_id
                  WHERE e.id = employee_availability.employee_id AND public.can_read_provider_place(b.provider_id, b.id)));

-- provider_closures
DROP POLICY IF EXISTS "Public can view closures" ON public.provider_closures;
DROP POLICY IF EXISTS "Visitors read closures of verified providers" ON public.provider_closures;
CREATE POLICY "Visitors read closures of verified providers" ON public.provider_closures
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = provider_closures.provider_id AND p.is_verified));
DROP POLICY IF EXISTS "Signed-in users read closures they may see" ON public.provider_closures;
CREATE POLICY "Signed-in users read closures they may see" ON public.provider_closures
  FOR SELECT TO authenticated
  USING (public.can_read_provider_place(provider_id, NULL));
