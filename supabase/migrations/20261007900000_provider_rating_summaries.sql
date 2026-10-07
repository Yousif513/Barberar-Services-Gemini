-- Public rating summary of a few providers at once (average of published reviews and their number).
--
-- Screens that list providers they did not search for (a customer's favourites, for example) used to default the
-- rating to 4.9 and the review count to 120 when they had no figure. This gives them the real figure, computed the same
-- way search_marketplace_providers computes it: published reviews only. Anyone may call it: ratings are public. It runs with
-- the caller's rights, so whatever the reviews policy hides from the caller stays hidden.

CREATE OR REPLACE FUNCTION public.provider_rating_summaries(p_provider_ids UUID[])
RETURNS TABLE (provider_id UUID, rating NUMERIC, reviews BIGINT)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT r.provider_id, ROUND(AVG(r.rating)::numeric, 1), COUNT(*)
    FROM public.reviews r
   WHERE r.provider_id = ANY (p_provider_ids[1:200])
     AND COALESCE(r.moderation_status, 'published') = 'published'
   GROUP BY r.provider_id;
$$;

REVOKE ALL ON FUNCTION public.provider_rating_summaries(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_rating_summaries(UUID[]) TO anon, authenticated;
