-- Consolidate branch mutation policies to avoid overlapping permissive RLS checks.
DROP POLICY IF EXISTS "Owners manage branch" ON public.branches;
DROP POLICY IF EXISTS "Admins insert branches" ON public.branches;
DROP POLICY IF EXISTS "Admins update branches" ON public.branches;
DROP POLICY IF EXISTS "Admins delete branches" ON public.branches;

CREATE POLICY "Owners or admins insert branches"
ON public.branches
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.providers
    WHERE providers.id = branches.provider_id
      AND providers.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners or admins update branches"
ON public.branches
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.providers
    WHERE providers.id = branches.provider_id
      AND providers.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.providers
    WHERE providers.id = branches.provider_id
      AND providers.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Owners or admins delete branches"
ON public.branches
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.providers
    WHERE providers.id = branches.provider_id
      AND providers.owner_id = (SELECT auth.uid())
  )
);
