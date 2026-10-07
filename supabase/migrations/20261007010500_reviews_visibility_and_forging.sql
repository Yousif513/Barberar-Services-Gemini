-- R11 + R28: hidden reviews stay hidden, and a review is only what the customer wrote.
--
-- R11: the policy "Public read reviews" was USING (true), so a review an administrator had hidden (or flagged) was still returned to
--      anyone who asked the API; only the browser filtered it. Readers now see published reviews; the author, the staff of the
--      reviewed business and administrators also see the others. (Anonymous visitors cannot call is_admin()/is_provider_staff(),
--      so they get their own policy.)
-- R28: the INSERT check allowed every column, so a customer could write reply_comment ("Thank you - owner"), a moderation status or
--      a back-dated created_at on their own review. Customers may now write only the booking, themselves, the rating and the comment
--      (column privilege), and the policy also insists that the reply and moderation fields are empty.

DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
DROP POLICY IF EXISTS "Public read published reviews" ON public.reviews;
CREATE POLICY "Public read published reviews"
  ON public.reviews FOR SELECT TO anon, authenticated
  USING (moderation_status = 'published');

DROP POLICY IF EXISTS "Review parties read their reviews" ON public.reviews;
CREATE POLICY "Review parties read their reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR public.is_admin()
    -- The staff of the reviewed business (the same three relations is_provider_staff reads; that function is not executable by
    -- signed-in users, so a policy cannot call it).
    OR EXISTS (SELECT 1 FROM public.providers p WHERE p.id = reviews.provider_id AND p.owner_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.provider_memberships m
                WHERE m.provider_id = reviews.provider_id AND m.user_id = (SELECT auth.uid()) AND COALESCE(m.is_active, TRUE))
    OR EXISTS (SELECT 1 FROM public.employees e JOIN public.branches br ON br.id = e.branch_id
                WHERE br.provider_id = reviews.provider_id AND e.profile_id = (SELECT auth.uid()) AND e.is_active)
  );

DROP POLICY IF EXISTS "Customers create reviews for completed bookings" ON public.reviews;
CREATE POLICY "Customers create reviews for completed bookings"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = (SELECT auth.uid())
    AND reply_comment IS NULL AND reply_created_at IS NULL
    AND moderation_status = 'published' AND moderated_by IS NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id AND b.customer_id = (SELECT auth.uid()) AND b.status = 'completed'
    )
  );

REVOKE INSERT ON public.reviews FROM authenticated, anon;
GRANT INSERT (booking_id, customer_id, rating, comment) ON public.reviews TO authenticated;
