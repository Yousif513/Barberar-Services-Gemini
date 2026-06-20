DROP POLICY IF EXISTS "Providers create own payout requests" ON public.payout_requests;
DROP POLICY IF EXISTS "Providers read own payout requests" ON public.payout_requests;
DROP POLICY IF EXISTS "Admins manage payout requests" ON public.payout_requests;

CREATE POLICY "Authenticated read authorized payout requests"
ON public.payout_requests
FOR SELECT
TO authenticated
USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.providers p
        WHERE p.id = payout_requests.provider_id
          AND p.owner_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Authenticated create authorized payout requests"
ON public.payout_requests
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_admin()
    OR (
        requested_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.providers p
            WHERE p.id = payout_requests.provider_id
              AND p.owner_id = (SELECT auth.uid())
        )
    )
);

CREATE POLICY "Admins update payout requests"
ON public.payout_requests
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete payout requests"
ON public.payout_requests
FOR DELETE
TO authenticated
USING (public.is_admin());
