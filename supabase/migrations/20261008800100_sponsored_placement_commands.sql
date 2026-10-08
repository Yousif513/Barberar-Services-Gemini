-- Migration: 20261008800100_sponsored_placement_commands.sql
-- G63 commands and reads for sponsored placement. Every command asks who is calling, validates input and object scope, requires a reason of
-- three or more characters where it changes state, and writes the audit log.
--
--   public (visitors)   get_sponsored_placements(city, category, limit)  eligible campaigns in fair rotation, ALWAYS is_sponsored = true
--                       record_sponsored_click(campaign)                  one click per campaign, customer and Riyadh day
--   provider owner      create_sponsored_campaign, update_sponsored_campaign, set_sponsored_campaign_status
--   owner / reports     sponsored_statement(provider, month)               stats and the statement of fees for a month
--   administrator       admin_void_sponsored_attribution, admin_sponsored_overview
--   admin / scheduler   sponsored_fees_for_month(provider, month)          the sum the invoice carries (used by the tests and reconciliation)

-- ---------------------------------------------------------------------------
-- Visitors
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sponsored_placements(p_city TEXT DEFAULT NULL, p_category TEXT DEFAULT NULL, p_limit INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg JSONB := public.sponsored_config();
  v_slots INTEGER;
  v_limit INTEGER;
  v_price NUMERIC;
  v_city TEXT := NULLIF(lower(trim(COALESCE(p_city, ''))), '');
  v_cat TEXT := NULLIF(lower(trim(COALESCE(p_category, ''))), '');
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_month DATE := date_trunc('month', (now() AT TIME ZONE 'Asia/Riyadh'))::date;
  v_rows JSONB;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN
    RETURN jsonb_build_object('configured', FALSE, 'placements', '[]'::jsonb);
  END IF;
  v_slots := (v_cfg ->> 'max_slots_per_search')::integer;
  v_price := (v_cfg ->> 'price_per_new_client_sar')::numeric;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, v_slots), 1), v_slots);
  IF v_city = 'all' THEN v_city := NULL; END IF;
  IF v_cat = 'all' THEN v_cat := NULL; END IF;

  WITH eligible AS (
    SELECT c.id AS campaign_id, c.provider_id, c.last_shown_at, c.created_at, br.id AS branch_id,
           br.name_en AS branch_name_en, br.name_ar AS branch_name_ar, br.city, br.district,
           p.business_name_en, p.business_name_ar, p.is_verified
      FROM public.sponsored_campaigns c
      JOIN public.providers p ON p.id = c.provider_id
      JOIN LATERAL (
        SELECT b.* FROM public.branches b
         WHERE b.provider_id = c.provider_id AND COALESCE(b.is_active, TRUE)
           AND (c.branch_id IS NULL OR b.id = c.branch_id)
           AND (v_city IS NULL OR lower(COALESCE(b.city, '')) = v_city)
         ORDER BY b.created_at, b.id
         LIMIT 1) br ON TRUE
     WHERE c.status = 'active' AND c.starts_on <= v_today AND (c.ends_on IS NULL OR c.ends_on >= v_today)
       AND p.status = 'active' AND p.is_verified
       AND (c.city IS NULL OR v_city IS NULL OR lower(c.city) = v_city)
       AND (c.category_slug IS NULL OR v_cat IS NULL OR lower(c.category_slug) = v_cat)
       -- Within this month's budget: one more new client at the price the provider accepted must still fit under the cap.
       AND (SELECT COALESCE(SUM(a.fee_amount_sar), 0) FROM public.sponsored_attributions a
             WHERE a.campaign_id = c.id AND a.period_month = v_month AND a.status = 'accrued')
           + LEAST(v_price, COALESCE(c.accepted_price_sar, v_price)) <= c.monthly_budget_cap_sar
  ), one_per_provider AS (
    SELECT e.*, row_number() OVER (PARTITION BY e.provider_id ORDER BY e.last_shown_at NULLS FIRST, e.created_at, e.campaign_id) AS rn
      FROM eligible e
  ), picked AS (
    SELECT * FROM one_per_provider WHERE rn = 1
     ORDER BY last_shown_at NULLS FIRST, created_at, campaign_id
     LIMIT v_limit
  ), chosen AS (
    SELECT picked.*, row_number() OVER (ORDER BY picked.last_shown_at NULLS FIRST, picked.created_at, picked.campaign_id) AS ord FROM picked
  ), shown AS (
    -- Places shown together get consecutive microseconds in their display order, so the next search continues the rotation
    -- after the last one shown instead of restarting from the oldest campaign.
    UPDATE public.sponsored_campaigns u SET last_shown_at = v_now + (chosen.ord - 1) * interval '1 microsecond'
      FROM chosen WHERE u.id = chosen.campaign_id
    RETURNING u.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'campaign_id', ch.campaign_id, 'provider_id', ch.provider_id, 'branch_id', ch.branch_id,
           'business_name_en', ch.business_name_en, 'business_name_ar', ch.business_name_ar,
           'branch_name_en', ch.branch_name_en, 'branch_name_ar', ch.branch_name_ar,
           'city', ch.city, 'district', ch.district, 'verified_business', ch.is_verified,
           'rating', (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reviews r
                       WHERE r.provider_id = ch.provider_id AND COALESCE(r.moderation_status, 'published') = 'published'),
           'reviews', (SELECT COUNT(*) FROM public.reviews r
                        WHERE r.provider_id = ch.provider_id AND COALESCE(r.moderation_status, 'published') = 'published'),
           'is_sponsored', TRUE)
         ORDER BY ch.ord), '[]'::jsonb)
    INTO v_rows
    FROM chosen ch JOIN shown s ON s.id = ch.campaign_id;

  RETURN jsonb_build_object('configured', TRUE, 'placements', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.get_sponsored_placements(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sponsored_placements(TEXT, TEXT, INTEGER) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_sponsored_click(p_campaign_id UUID) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg JSONB := public.sponsored_config();
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_provider UUID;
  v_rows INTEGER;
BEGIN
  IF p_campaign_id IS NULL OR NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT c.provider_id INTO v_provider
    FROM public.sponsored_campaigns c JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = p_campaign_id AND c.status = 'active' AND c.starts_on <= v_today AND (c.ends_on IS NULL OR c.ends_on >= v_today)
     AND p.status = 'active' AND p.is_verified;
  IF v_provider IS NULL THEN
    RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.sponsored_clicks (campaign_id, provider_id, customer_id, click_day)
  VALUES (p_campaign_id, v_provider, auth.uid(), v_today)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('recorded', v_rows = 1, 'rate_limited', v_rows = 0);
END $$;
REVOKE ALL ON FUNCTION public.record_sponsored_click(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sponsored_click(UUID) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provider owner commands
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sponsored_campaign(
  p_provider_id UUID, p_branch_id UUID, p_city TEXT, p_category_slug TEXT, p_monthly_budget_cap_sar NUMERIC,
  p_starts_on DATE, p_ends_on DATE, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_cfg JSONB := public.sponsored_config();
  v_provider public.providers;
  v_city TEXT := NULLIF(trim(COALESCE(p_city, '')), '');
  v_cat TEXT := NULLIF(lower(trim(COALESCE(p_category_slug, ''))), '');
  v_start DATE := COALESCE(p_starts_on, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  v_branch public.branches;
  v_id UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id AND owner_id = v_user;
  IF v_provider.id IS NULL THEN RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN
    RAISE EXCEPTION 'Sponsored placement is not available yet' USING ERRCODE = '55000';
  END IF;
  IF v_provider.status <> 'active' OR NOT COALESCE(v_provider.is_verified, FALSE) THEN
    RAISE EXCEPTION 'Only an active, verified business can promote itself' USING ERRCODE = '22023';
  END IF;
  IF p_monthly_budget_cap_sar IS NULL OR p_monthly_budget_cap_sar <= 0 OR p_monthly_budget_cap_sar > 1000000
     OR p_monthly_budget_cap_sar <> round(p_monthly_budget_cap_sar, 2) THEN
    RAISE EXCEPTION 'The monthly budget must be above 0 SAR with at most two decimals' USING ERRCODE = '22023';
  END IF;
  IF p_ends_on IS NOT NULL AND p_ends_on < v_start THEN RAISE EXCEPTION 'The end date is before the start date' USING ERRCODE = '22023'; END IF;
  IF v_city IS NOT NULL AND length(v_city) > 80 THEN RAISE EXCEPTION 'The city is too long' USING ERRCODE = '22023'; END IF;
  IF v_cat IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(c.slug) = v_cat AND COALESCE(c.is_active, TRUE)) THEN
    RAISE EXCEPTION 'Unknown category' USING ERRCODE = '22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    SELECT * INTO v_branch FROM public.branches WHERE id = p_branch_id AND provider_id = p_provider_id AND COALESCE(is_active, TRUE);
    IF v_branch.id IS NULL THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE = '22023'; END IF;
    IF v_city IS NOT NULL AND lower(COALESCE(v_branch.city, '')) <> lower(v_city) THEN
      RAISE EXCEPTION 'The branch is not in the chosen city' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.sponsored_campaigns (provider_id, branch_id, city, category_slug, monthly_budget_cap_sar, starts_on, ends_on, created_by, status_reason)
  VALUES (p_provider_id, p_branch_id, v_city, v_cat, p_monthly_budget_cap_sar, v_start, p_ends_on, v_user, trim(p_reason))
  RETURNING id INTO v_id;
  PERFORM public.write_audit_log('sponsored.campaign_created', 'sponsored_campaigns', v_id,
    jsonb_build_object('provider_id', p_provider_id, 'monthly_budget_cap_sar', p_monthly_budget_cap_sar, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('campaign_id', v_id, 'status', 'draft');
END $$;
REVOKE ALL ON FUNCTION public.create_sponsored_campaign(UUID, UUID, TEXT, TEXT, NUMERIC, DATE, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sponsored_campaign(UUID, UUID, TEXT, TEXT, NUMERIC, DATE, DATE, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_sponsored_campaign(
  p_campaign_id UUID, p_monthly_budget_cap_sar NUMERIC, p_ends_on DATE, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_campaign public.sponsored_campaigns;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT c.* INTO v_campaign FROM public.sponsored_campaigns c JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = p_campaign_id AND p.owner_id = v_user FOR UPDATE OF c;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF v_campaign.status = 'ended' THEN RAISE EXCEPTION 'An ended campaign cannot be changed' USING ERRCODE = '22023'; END IF;
  IF p_monthly_budget_cap_sar IS NULL OR p_monthly_budget_cap_sar <= 0 OR p_monthly_budget_cap_sar > 1000000
     OR p_monthly_budget_cap_sar <> round(p_monthly_budget_cap_sar, 2) THEN
    RAISE EXCEPTION 'The monthly budget must be above 0 SAR with at most two decimals' USING ERRCODE = '22023';
  END IF;
  IF p_ends_on IS NOT NULL AND p_ends_on < v_campaign.starts_on THEN RAISE EXCEPTION 'The end date is before the start date' USING ERRCODE = '22023'; END IF;
  UPDATE public.sponsored_campaigns
     SET monthly_budget_cap_sar = p_monthly_budget_cap_sar, ends_on = p_ends_on, status_reason = trim(p_reason), updated_at = now()
   WHERE id = p_campaign_id;
  PERFORM public.write_audit_log('sponsored.campaign_updated', 'sponsored_campaigns', p_campaign_id,
    jsonb_build_object('provider_id', v_campaign.provider_id, 'monthly_budget_cap_sar', p_monthly_budget_cap_sar,
                       'previous_cap_sar', v_campaign.monthly_budget_cap_sar, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'status', v_campaign.status, 'monthly_budget_cap_sar', p_monthly_budget_cap_sar);
END $$;
REVOKE ALL ON FUNCTION public.update_sponsored_campaign(UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_sponsored_campaign(UUID, NUMERIC, DATE, TEXT) TO authenticated, service_role;

-- draft or paused -> active (the provider accepts the CURRENT price here), active -> paused, draft/active/paused -> ended (final).
CREATE OR REPLACE FUNCTION public.set_sponsored_campaign_status(p_campaign_id UUID, p_status TEXT, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_cfg JSONB := public.sponsored_config();
  v_campaign public.sponsored_campaigns;
  v_provider public.providers;
  v_today DATE := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_price NUMERIC(12,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT c.* INTO v_campaign FROM public.sponsored_campaigns c JOIN public.providers p ON p.id = c.provider_id
   WHERE c.id = p_campaign_id AND p.owner_id = v_user FOR UPDATE OF c;
  IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'paused', 'ended') THEN
    RAISE EXCEPTION 'The status must be active, paused or ended' USING ERRCODE = '22023';
  END IF;
  IF v_campaign.status = p_status THEN
    RETURN jsonb_build_object('campaign_id', p_campaign_id, 'status', p_status, 'changed', FALSE);
  END IF;
  IF v_campaign.status = 'ended' THEN RAISE EXCEPTION 'An ended campaign cannot be changed' USING ERRCODE = '22023'; END IF;
  IF p_status = 'paused' AND v_campaign.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active campaign can be paused' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'active' THEN
    IF NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN
      RAISE EXCEPTION 'Sponsored placement is not available yet' USING ERRCODE = '55000';
    END IF;
    SELECT * INTO v_provider FROM public.providers WHERE id = v_campaign.provider_id;
    IF v_provider.status <> 'active' OR NOT COALESCE(v_provider.is_verified, FALSE) THEN
      RAISE EXCEPTION 'Only an active, verified business can promote itself' USING ERRCODE = '22023';
    END IF;
    IF v_campaign.ends_on IS NOT NULL AND v_campaign.ends_on < v_today THEN
      RAISE EXCEPTION 'The end date has passed: extend it before activating' USING ERRCODE = '22023';
    END IF;
    v_price := (v_cfg ->> 'price_per_new_client_sar')::numeric;
    UPDATE public.sponsored_campaigns
       SET status = 'active', accepted_price_sar = v_price, accepted_at = now(), status_reason = trim(p_reason), updated_at = now()
     WHERE id = p_campaign_id;
  ELSIF p_status = 'paused' THEN
    UPDATE public.sponsored_campaigns SET status = 'paused', status_reason = trim(p_reason), updated_at = now() WHERE id = p_campaign_id;
  ELSE
    UPDATE public.sponsored_campaigns SET status = 'ended', ended_at = now(), status_reason = trim(p_reason), updated_at = now() WHERE id = p_campaign_id;
  END IF;

  PERFORM public.write_audit_log('sponsored.campaign_' || p_status, 'sponsored_campaigns', p_campaign_id,
    jsonb_build_object('provider_id', v_campaign.provider_id, 'from', v_campaign.status, 'to', p_status,
                       'accepted_price_sar', v_price, 'reason', trim(p_reason)));
  RETURN jsonb_build_object('campaign_id', p_campaign_id, 'status', p_status, 'changed', TRUE, 'accepted_price_sar', v_price);
END $$;
REVOKE ALL ON FUNCTION public.set_sponsored_campaign_status(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_sponsored_campaign_status(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Statement (owner, delegate holding reports, administrator, scheduler)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sponsored_statement(p_provider_id UUID, p_month DATE DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
  v_start DATE := date_trunc('month', COALESCE(p_month, (now() AT TIME ZONE 'Asia/Riyadh')::date))::date;
  v_end DATE := (date_trunc('month', COALESCE(p_month, (now() AT TIME ZONE 'Asia/Riyadh')::date)) + interval '1 month - 1 day')::date;
  v_totals JSONB;
  v_campaigns JSONB;
  v_lines JSONB;
  v_clicks INTEGER;
BEGIN
  IF auth.uid() IS NULL AND v_role <> 'service_role' THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_provider_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id)
     OR NOT (v_role = 'service_role' OR public.can_access_provider_wide(p_provider_id, 'reports')) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)::integer INTO v_clicks FROM public.sponsored_clicks k
   WHERE k.provider_id = p_provider_id AND (k.clicked_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end;

  SELECT jsonb_build_object(
           'new_clients', COUNT(*) FILTER (WHERE a.status = 'accrued'),
           'accrued_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued'), 0),
           'billed_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued' AND a.billed_invoice_id IS NOT NULL), 0),
           'unbilled_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued' AND a.billed_invoice_id IS NULL), 0),
           'waived_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'waived'), 0),
           'void_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'void'), 0),
           'waived_for_cap', COUNT(*) FILTER (WHERE a.status = 'waived' AND a.status_reason = 'cap'),
           'returning_clients', COUNT(*) FILTER (WHERE a.status_reason = 'not_new_client'))
    INTO v_totals
    FROM public.sponsored_attributions a WHERE a.provider_id = p_provider_id AND a.period_month = v_start;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'campaign_id', c.id, 'status', c.status, 'city', c.city, 'category_slug', c.category_slug, 'branch_id', c.branch_id,
           'monthly_budget_cap_sar', c.monthly_budget_cap_sar,
           'spent_sar', COALESCE(s.accrued, 0), 'cap_remaining_sar', GREATEST(c.monthly_budget_cap_sar - COALESCE(s.accrued, 0), 0),
           'new_clients', COALESCE(s.new_clients, 0),
           'clicks', (SELECT COUNT(*) FROM public.sponsored_clicks k WHERE k.campaign_id = c.id
                       AND (k.clicked_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end))
         ORDER BY c.created_at, c.id), '[]'::jsonb)
    INTO v_campaigns
    FROM public.sponsored_campaigns c
    LEFT JOIN (SELECT a.campaign_id, SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued') AS accrued,
                      COUNT(*) FILTER (WHERE a.status = 'accrued') AS new_clients
                 FROM public.sponsored_attributions a WHERE a.period_month = v_start GROUP BY a.campaign_id) s ON s.campaign_id = c.id
   WHERE c.provider_id = p_provider_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'attribution_id', l.id, 'campaign_id', l.campaign_id, 'booking_id', l.booking_id, 'status', l.status,
           'status_reason', l.status_reason, 'is_new_client', l.is_new_client, 'fee_amount_sar', l.fee_amount_sar,
           'invoice_number', l.invoice_number, 'created_at', l.created_at) ORDER BY l.created_at DESC, l.id), '[]'::jsonb)
    INTO v_lines
    FROM (SELECT a.*, f.invoice_number FROM public.sponsored_attributions a
            LEFT JOIN public.provider_fee_invoices f ON f.id = a.billed_invoice_id
           WHERE a.provider_id = p_provider_id AND a.period_month = v_start
           ORDER BY a.created_at DESC, a.id LIMIT 500) l;

  RETURN jsonb_build_object('provider_id', p_provider_id, 'month', to_char(v_start, 'YYYY-MM'), 'currency', 'SAR',
                            'clicks', v_clicks, 'totals', v_totals, 'campaigns', v_campaigns, 'lines', v_lines);
END $$;
REVOKE ALL ON FUNCTION public.sponsored_statement(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsored_statement(UUID, DATE) TO authenticated, service_role;

-- The sum the monthly invoice carries for a provider and month (administrator and scheduler only: reconciliation and tests).
CREATE OR REPLACE FUNCTION public.sponsored_fees_for_month(p_provider_id UUID, p_month DATE) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start DATE := date_trunc('month', p_month)::date;
BEGIN
  IF NOT public.is_admin() AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only administrators or the scheduler can read sponsored fees' USING ERRCODE = '42501';
  END IF;
  IF p_provider_id IS NULL OR p_month IS NULL THEN RAISE EXCEPTION 'A provider and a month are required' USING ERRCODE = '22023'; END IF;
  RETURN (SELECT jsonb_build_object(
            'provider_id', p_provider_id, 'month', to_char(v_start, 'YYYY-MM'), 'lines', COUNT(*),
            'accrued_sar', COALESCE(SUM(a.fee_amount_sar), 0),
            'billed_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.billed_invoice_id IS NOT NULL), 0),
            'unbilled_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.billed_invoice_id IS NULL), 0))
          FROM public.sponsored_attributions a
         WHERE a.provider_id = p_provider_id AND a.period_month = v_start AND a.status = 'accrued');
END $$;
REVOKE ALL ON FUNCTION public.sponsored_fees_for_month(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sponsored_fees_for_month(UUID, DATE) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------
-- void: the attribution was wrong (fraud, error). waive: it was right and the platform forgives the fee. Both take it out of billing.
-- A fee already on an issued invoice is not touched here: the invoice is a record and is corrected by a credit, not by rewriting it.
CREATE OR REPLACE FUNCTION public.admin_void_sponsored_attribution(p_attribution_id UUID, p_action TEXT, p_reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.sponsored_attributions;
  v_target TEXT;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('void', 'waive') THEN RAISE EXCEPTION 'The action must be void or waive' USING ERRCODE = '22023'; END IF;
  v_target := CASE p_action WHEN 'void' THEN 'void' ELSE 'waived' END;
  SELECT * INTO v_row FROM public.sponsored_attributions WHERE id = p_attribution_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Attribution not found' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = v_target THEN
    RETURN jsonb_build_object('attribution_id', v_row.id, 'status', v_row.status, 'changed', FALSE);
  END IF;
  IF v_row.status <> 'accrued' THEN
    RAISE EXCEPTION 'Only an accrued fee can be voided or waived (this one is %)', v_row.status USING ERRCODE = '22023';
  END IF;
  IF v_row.billed_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'This fee is already on an issued invoice: correct it with a credit' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('primora.audit_reason', trim(p_reason), true);
  UPDATE public.sponsored_attributions
     SET status = v_target, status_reason = trim(p_reason), decided_by = auth.uid(), decided_at = now()
   WHERE id = p_attribution_id;
  PERFORM set_config('primora.audit_reason', '', true);
  PERFORM public.write_audit_log('sponsored.attribution_' || p_action, 'sponsored_attributions', p_attribution_id,
    jsonb_build_object('provider_id', v_row.provider_id, 'campaign_id', v_row.campaign_id, 'fee_sar', v_row.fee_amount_sar,
                       'reason', trim(p_reason)));
  RETURN jsonb_build_object('attribution_id', p_attribution_id, 'status', v_target, 'changed', TRUE);
END $$;
REVOKE ALL ON FUNCTION public.admin_void_sponsored_attribution(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_void_sponsored_attribution(UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_sponsored_overview(p_month DATE DEFAULT NULL) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start DATE := date_trunc('month', COALESCE(p_month, (now() AT TIME ZONE 'Asia/Riyadh')::date))::date;
  v_end DATE := (date_trunc('month', COALESCE(p_month, (now() AT TIME ZONE 'Asia/Riyadh')::date)) + interval '1 month - 1 day')::date;
  v_totals JSONB;
  v_campaigns JSONB;
  v_recent JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501'; END IF;

  SELECT jsonb_build_object(
           'clicks', (SELECT COUNT(*) FROM public.sponsored_clicks k WHERE (k.clicked_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN v_start AND v_end),
           'new_clients', COUNT(*) FILTER (WHERE a.status = 'accrued'),
           'accrued_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued'), 0),
           'billed_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued' AND a.billed_invoice_id IS NOT NULL), 0),
           'unbilled_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued' AND a.billed_invoice_id IS NULL), 0),
           'waived_count', COUNT(*) FILTER (WHERE a.status = 'waived'),
           'waived_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'waived'), 0),
           'void_count', COUNT(*) FILTER (WHERE a.status = 'void'),
           'void_sar', COALESCE(SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'void'), 0),
           'campaigns_active', (SELECT COUNT(*) FROM public.sponsored_campaigns WHERE status = 'active'),
           'campaigns_paused', (SELECT COUNT(*) FROM public.sponsored_campaigns WHERE status = 'paused'),
           'campaigns_draft', (SELECT COUNT(*) FROM public.sponsored_campaigns WHERE status = 'draft'),
           'campaigns_ended', (SELECT COUNT(*) FROM public.sponsored_campaigns WHERE status = 'ended'))
    INTO v_totals
    FROM public.sponsored_attributions a WHERE a.period_month = v_start;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY accrued DESC, created_at, campaign_id), '[]'::jsonb) INTO v_campaigns FROM (
    SELECT c.id AS campaign_id, c.created_at, COALESCE(s.accrued, 0) AS accrued,
           jsonb_build_object('campaign_id', c.id, 'provider_id', c.provider_id, 'business_name_en', p.business_name_en,
             'business_name_ar', p.business_name_ar, 'status', c.status, 'monthly_budget_cap_sar', c.monthly_budget_cap_sar,
             'accepted_price_sar', c.accepted_price_sar, 'spent_sar', COALESCE(s.accrued, 0), 'new_clients', COALESCE(s.new_clients, 0)) AS row_json
      FROM public.sponsored_campaigns c JOIN public.providers p ON p.id = c.provider_id
      LEFT JOIN (SELECT a.campaign_id, SUM(a.fee_amount_sar) FILTER (WHERE a.status = 'accrued') AS accrued,
                        COUNT(*) FILTER (WHERE a.status = 'accrued') AS new_clients
                   FROM public.sponsored_attributions a WHERE a.period_month = v_start GROUP BY a.campaign_id) s ON s.campaign_id = c.id
     ORDER BY COALESCE(s.accrued, 0) DESC, c.created_at, c.id LIMIT 200) t;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC, id), '[]'::jsonb) INTO v_recent FROM (
    SELECT a.id, a.created_at,
           jsonb_build_object('attribution_id', a.id, 'campaign_id', a.campaign_id, 'provider_id', a.provider_id,
             'business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar, 'booking_id', a.booking_id,
             'is_new_client', a.is_new_client, 'fee_amount_sar', a.fee_amount_sar, 'status', a.status, 'status_reason', a.status_reason,
             'billed', a.billed_invoice_id IS NOT NULL, 'created_at', a.created_at) AS row_json
      FROM public.sponsored_attributions a JOIN public.providers p ON p.id = a.provider_id
     WHERE a.period_month = v_start ORDER BY a.created_at DESC, a.id LIMIT 200) t;

  RETURN jsonb_build_object('month', to_char(v_start, 'YYYY-MM'), 'currency', 'SAR', 'config', public.sponsored_config(),
                            'totals', v_totals, 'campaigns', v_campaigns, 'attributions', v_recent);
END $$;
REVOKE ALL ON FUNCTION public.admin_sponsored_overview(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sponsored_overview(DATE) TO authenticated, service_role;
