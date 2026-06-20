-- Allow platform admins to moderate provider-owned services from the admin catalog.
-- Provider owners remain constrained by the existing owner-scoped service policies.

DROP POLICY IF EXISTS "Admins manage services" ON public.services;

CREATE POLICY "Admins manage services"
ON public.services
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_availability TO authenticated;
