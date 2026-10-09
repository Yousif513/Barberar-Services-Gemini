-- P-02 (privacy review 2026-10-08): anonymous visitors could list customer_id, booking_id and moderated_by of every published review, which
-- links one person's reviews across salons and hands out profile uuids. Visitors lose those three columns. The public reviewer display
-- (first name and last initial, as the screens already showed) is served by one anonymous-callable function that returns no identifier.
-- anon holds a table-wide SELECT, which a column revoke cannot narrow: drop it and grant back the public columns by name.
REVOKE SELECT ON public.reviews FROM anon;
GRANT SELECT (id, provider_id, employee_id, rating, comment, created_at, reply_comment, reply_created_at, moderation_status) ON public.reviews TO anon;

CREATE OR REPLACE FUNCTION public.public_provider_reviews(p_provider_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID, rating INTEGER, comment TEXT, created_at TIMESTAMPTZ, reply_comment TEXT, moderation_status TEXT,
  employee_id UUID, reviewer_first_name TEXT, reviewer_last_initial TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.rating::INTEGER, r.comment, r.created_at, r.reply_comment, r.moderation_status::TEXT, r.employee_id,
         p.first_name::TEXT, CASE WHEN COALESCE(p.last_name, '') <> '' THEN left(p.last_name, 1) || '.' ELSE NULL END
  FROM public.reviews r
  LEFT JOIN public.profiles p ON p.id = r.customer_id
  WHERE r.provider_id = p_provider_id
    AND r.moderation_status = 'published'
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.public_provider_reviews(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_provider_reviews(UUID, INTEGER) TO anon, authenticated, service_role;
