DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- P-14 (privacy review 2026-10-08): can_access_provider_operation(provider, NULL, op) treats a branch-scoped delegation as valid for a provider-wide
-- question, so a delegate scoped to branch A read the phone and email of staff in branch B (get_provider_staff_contacts) and the patch-test rows
-- of every branch. Rows are now filtered to the delegate's branch. provider_professional_links already filters per branch (verified, not changed).

SELECT pg_temp.patch_function('public.get_provider_staff_contacts(uuid)'::regprocedure,
$from$     WHERE br.provider_id = v_provider_id;$from$,
$to$     WHERE br.provider_id = v_provider_id
       AND (v_owner = v_uid OR public.can_access_provider_operation(v_provider_id, br.id, 'staff'));$to$);

CREATE OR REPLACE FUNCTION public.can_read_patch_test_row(p_provider_id UUID, p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_read_patch_tests(p_provider_id) AND (
    EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM public.provider_memberships m
                    WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active AND m.branch_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.bookings b JOIN public.provider_memberships m
                 ON m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active AND m.branch_id = b.branch_id
                WHERE b.id = p_booking_id)
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_patch_test_row(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_patch_test_row(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "Client and provider staff read patch tests" ON public.patch_test_results;
CREATE POLICY "Client and provider staff read patch tests" ON public.patch_test_results
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()) OR public.can_read_patch_test_row(provider_id, booking_id));
