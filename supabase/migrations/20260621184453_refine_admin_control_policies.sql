-- Refine admin control policies after advisor review.
DROP POLICY IF EXISTS "Admins manage promotional codes" ON public.promotional_codes;
DROP POLICY IF EXISTS "Authenticated users read currently active promotional codes" ON public.promotional_codes;

CREATE POLICY "Promotional codes readable by admins or when active"
ON public.promotional_codes
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    is_active = TRUE
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())
  )
);

CREATE POLICY "Admins insert promotional codes"
ON public.promotional_codes
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins update promotional codes"
ON public.promotional_codes
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete promotional codes"
ON public.promotional_codes
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins insert branches"
ON public.branches
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins update branches"
ON public.branches
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete branches"
ON public.branches
FOR DELETE
TO authenticated
USING (public.is_admin());
