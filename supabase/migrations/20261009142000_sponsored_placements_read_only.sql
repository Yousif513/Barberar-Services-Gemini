-- M-12 of docs/reviews/2026-10-08-security-money.md.
--
-- get_sponsored_placements is callable by anonymous visitors and UPDATEd sponsored_campaigns.last_shown_at on every call: unrated write
-- amplification, and anyone who can reach the API could steer the rotation. It is now a pure read. The rotation stamp moves to
--   * record_sponsored_click (a click that was recorded moves that campaign to the back of the rotation), and
--   * record_sponsored_impressions(campaign_ids), a service-role command for the trusted server-side caller that knows what was really shown
--     (the order of the array is the display order, consecutive microseconds, as before).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.get_sponsored_placements(text, text, integer)'::regprocedure,
$from$    UPDATE public.sponsored_campaigns u SET last_shown_at = v_now + (chosen.ord - 1) * interval '1 microsecond'
      FROM chosen WHERE u.id = chosen.campaign_id
    RETURNING u.id$from$,
$to$    SELECT chosen.campaign_id AS id FROM chosen$to$);

SELECT pg_temp.patch_function('public.record_sponsored_click(uuid)'::regprocedure,
$from$  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('recorded', v_rows = 1, 'rate_limited', v_rows = 0);$from$,
$to$  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 1 THEN
    UPDATE public.sponsored_campaigns SET last_shown_at = clock_timestamp() WHERE id = p_campaign_id;
  END IF;
  RETURN jsonb_build_object('recorded', v_rows = 1, 'rate_limited', v_rows = 0);$to$);

CREATE OR REPLACE FUNCTION public.record_sponsored_impressions(p_campaign_ids UUID[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_ids IS NULL OR cardinality(p_campaign_ids) = 0 OR cardinality(p_campaign_ids) > 50 THEN
    RAISE EXCEPTION 'Provide between 1 and 50 campaign ids' USING ERRCODE = '22023';
  END IF;
  WITH ordered AS (SELECT id, ord FROM unnest(p_campaign_ids) WITH ORDINALITY AS t(id, ord))
  UPDATE public.sponsored_campaigns u SET last_shown_at = v_now + (ordered.ord - 1) * interval '1 microsecond'
    FROM ordered WHERE u.id = ordered.id AND u.status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION public.record_sponsored_impressions(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sponsored_impressions(UUID[]) TO service_role;
