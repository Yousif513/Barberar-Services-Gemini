-- FINAL-5: review N7 (docs/reviews/2026-10-11-security-priv-recheck.md). The person who recorded a patch-test result kept read access
-- for as long as the row existed, even after leaving the business. The recorder now reads it only while they are still active staff
-- of that provider (its owner, an active employee of one of its branches, or an active member); the professional assigned to the
-- booking and the owner rule for an uncleared positive result are unchanged, and a console session never reads it.
CREATE OR REPLACE FUNCTION public.can_read_patch_test_result(p_provider_id UUID, p_booking_id UUID, p_recorded_by UUID, p_result TEXT,
  p_cleared_at TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
    (p_recorded_by = auth.uid()
      AND (public.is_provider_staff(p_provider_id, auth.uid())
           OR EXISTS (SELECT 1 FROM public.provider_memberships m
                       WHERE m.provider_id = p_provider_id AND m.user_id = auth.uid() AND m.is_active)))
    OR (p_booking_id IS NOT NULL AND public.intake_is_assigned_provider(p_booking_id))
    OR ((p_booking_id IS NULL OR (p_result = 'positive' AND p_cleared_at IS NULL))
        AND EXISTS (SELECT 1 FROM public.providers p WHERE p.id = p_provider_id AND p.owner_id = auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.can_read_patch_test_result(UUID, UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_patch_test_result(UUID, UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
