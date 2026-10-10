-- GOV-FIX: close GOV-2 gap gov2-remaining-direct-admin-reads (Q4 final decision text, the GOV-2 pattern of 20261010200000).
--
-- Console sessions still read customer-linked tables directly: bookings (dashboard and activity), refund_requests (refunds
-- screen), payment_disputes (disputes), reviews (moderation, with reviewer ids), user_packages and package_redemptions
-- (packages), and the loyalty, referral, coupon, tip and favourites tables through "Administrators read ..." policies.
-- admin_provider_private_directory (provider contacts, registration numbers, internal notes) was open to every console role.
--   * A RESTRICTIVE select policy on each table: a console session reads only its own rows directly (as the data subject).
--     Published reviews stay public for everyone, administrators included, as they are for visitors.
--   * The screens read through SECURITY DEFINER functions that check the console permission, page on the server and write one
--     audit event per read (gov2_log_read: ids and fields, never values). Customer names come back only to personal.read.
--   * Aggregates (package usage, branch performance) carry no personal data and are not logged; counts of 1 to 4 people are
--     suppressed (D4).
--   * admin_provider_private_directory needs personal.read and logs the providers and fields it returned.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. No direct console reads
-- ---------------------------------------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Administrators read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins read refund requests" ON public.refund_requests;
DROP POLICY IF EXISTS "Administrators read payment refund requests" ON public.payment_refund_requests;
DROP POLICY IF EXISTS "Administrators read payment disputes" ON public.payment_disputes;
DROP POLICY IF EXISTS "Administrators read customer loyalty" ON public.customer_loyalty;
DROP POLICY IF EXISTS "Administrators read loyalty points ledger" ON public.loyalty_points_ledger;
DROP POLICY IF EXISTS "Administrators read coupon redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "Administrators read package redemptions" ON public.package_redemptions;
DROP POLICY IF EXISTS "Administrators read booking tips" ON public.booking_tips;
DROP POLICY IF EXISTS "Administrators read customer referrals" ON public.customer_referrals;

-- The provider-owner dispute policy carried an administrator branch; providers keep theirs, the service role keeps its own.
DROP POLICY IF EXISTS "Provider owners can view disputes against their business" ON public.payment_disputes;
CREATE POLICY "Provider owners can view disputes against their business" ON public.payment_disputes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.providers p WHERE p.id = payment_disputes.provider_id
                   AND (p.owner_id = (SELECT auth.uid()) OR COALESCE(auth.jwt()->>'role', '') = 'service_role')));

DO $govfix$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('bookings', 'customer_id = (SELECT auth.uid())'),
      ('refund_requests', 'EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = refund_requests.booking_id AND b.customer_id = (SELECT auth.uid()))'),
      ('payment_refund_requests', 'FALSE'),
      ('payment_disputes', 'customer_id = (SELECT auth.uid())'),
      ('reviews', 'customer_id = (SELECT auth.uid()) OR moderation_status = ''published'''),
      ('customer_loyalty', 'customer_id = (SELECT auth.uid())'),
      ('loyalty_points_ledger', 'EXISTS (SELECT 1 FROM public.customer_loyalty cl WHERE cl.id = loyalty_points_ledger.loyalty_id AND cl.customer_id = (SELECT auth.uid()))'),
      ('customer_favorites', 'customer_id = (SELECT auth.uid())'),
      ('customer_referrals', 'referrer_id = (SELECT auth.uid()) OR referee_id = (SELECT auth.uid())'),
      ('coupon_redemptions', 'customer_id = (SELECT auth.uid())'),
      ('package_redemptions', 'customer_id = (SELECT auth.uid())'),
      ('user_packages', 'customer_id = (SELECT auth.uid())'),
      ('booking_tips', 'customer_id = (SELECT auth.uid())')
    ) AS t(tbl, own_rows)
  LOOP
    CONTINUE WHEN to_regclass('public.' || r.tbl) IS NULL;
    CONTINUE WHEN NOT has_any_column_privilege('authenticated', ('public.' || r.tbl)::regclass, 'SELECT');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Console sessions read only through audited functions', r.tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT (SELECT public.is_admin()) OR (%s))',
                   'Console sessions read only through audited functions', r.tbl, r.own_rows);
  END LOOP;
END $govfix$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Audited reads
-- ---------------------------------------------------------------------------------------------------------------------

-- The latest bookings for the dashboard and the activity feed: what was booked, where and when; nothing about the customer.
CREATE OR REPLACE FUNCTION public.admin_recent_bookings(p_limit INTEGER DEFAULT 5, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 25);
  v_purpose TEXT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  v_purpose := public.gov2_read_purpose(p_purpose, 'customer_support');
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT b.id, b.status, b.scheduled_at, b.created_at, b.total_price,
             jsonb_build_object('name_en', s.name_en, 'name_ar', s.name_ar) AS services,
             jsonb_build_object('name_en', br.name_en, 'name_ar', br.name_ar,
                                'providers', jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar)) AS branches
        FROM public.bookings b
        LEFT JOIN public.services s ON s.id = b.service_id
        LEFT JOIN public.branches br ON br.id = b.branch_id
        LEFT JOIN public.providers p ON p.id = br.provider_id
       ORDER BY b.created_at DESC, b.id
       LIMIT v_limit
    ) x;
  PERFORM public.gov2_log_read('bookings.recent_listed', 'bookings', v_ids,
    ARRAY['status', 'scheduled_at', 'total_price', 'service', 'branch', 'provider'], v_purpose,
    jsonb_build_object('limit', v_limit), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- The refunds queue (finance and owner).
CREATE OR REPLACE FUNCTION public.admin_list_refund_requests(p_filter TEXT DEFAULT 'attention', p_limit INTEGER DEFAULT 25,
                                                             p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_filter TEXT := COALESCE(NULLIF(btrim(COALESCE(p_filter, '')), ''), 'attention');
  v_statuses TEXT[];
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.refund', 'money.ledger'], 'refunds');
  v_purpose := public.gov2_read_purpose(p_purpose, 'finance_operations');
  v_statuses := CASE v_filter
    WHEN 'attention' THEN ARRAY['pending', 'processing', 'failed']
    WHEN 'all' THEN NULL
    WHEN 'pending' THEN ARRAY['pending'] WHEN 'processing' THEN ARRAY['processing']
    WHEN 'failed' THEN ARRAY['failed'] WHEN 'succeeded' THEN ARRAY['succeeded']
    ELSE ARRAY['__unknown__'] END;
  IF v_statuses = ARRAY['__unknown__'] THEN
    RAISE EXCEPTION 'Unknown filter %', v_filter USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_total FROM public.refund_requests rr WHERE v_statuses IS NULL OR rr.status = ANY (v_statuses);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT rr.id, rr.amount, rr.reason, rr.source, rr.status, rr.attempts, rr.error_message, rr.created_at, rr.processed_at,
             rr.claimed_at, rr.booking_id, jsonb_build_object('invoice_number', b.invoice_number) AS bookings
        FROM public.refund_requests rr
        LEFT JOIN public.bookings b ON b.id = rr.booking_id
       WHERE v_statuses IS NULL OR rr.status = ANY (v_statuses)
       ORDER BY rr.created_at DESC, rr.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('refunds.listed', 'refund_requests', v_ids,
    ARRAY['amount', 'reason', 'source', 'status', 'attempts', 'error_message', 'invoice_number'], v_purpose,
    jsonb_build_object('filter', v_filter, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;

-- Payment disputes for arbitration. The customer's name comes back only to personal.read; finance sees the id.
CREATE OR REPLACE FUNCTION public.admin_list_disputes(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50,
                                                      p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_names BOOLEAN;
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['money.refund', 'personal.read'], 'payment disputes');
  v_purpose := public.gov2_read_purpose(p_purpose, 'dispute_resolution');
  v_names := public.admin_can('personal.read');
  SELECT count(*) INTO v_total FROM public.payment_disputes d WHERE v_status IS NULL OR d.status = v_status;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.customer_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT d.id, d.disputed_amount_sar, d.reason, d.status, d.created_at, d.customer_id,
             CASE WHEN v_names THEN jsonb_build_object('first_name', cp.first_name, 'last_name', cp.last_name) END AS customer,
             jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar) AS provider,
             jsonb_build_object('id', b.id, 'status', b.status, 'scheduled_at', b.scheduled_at) AS booking
        FROM public.payment_disputes d
        LEFT JOIN public.providers p ON p.id = d.provider_id
        LEFT JOIN public.bookings b ON b.id = d.booking_id
        LEFT JOIN public.profiles cp ON cp.id = d.customer_id
       WHERE v_status IS NULL OR d.status = v_status
       ORDER BY d.created_at DESC, d.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('disputes.listed', 'payment_disputes', v_ids,
    ARRAY['disputed_amount_sar', 'reason', 'status', 'booking'] || CASE WHEN v_names THEN ARRAY['first_name', 'last_name'] ELSE ARRAY[]::text[] END,
    v_purpose, jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'names_included', v_names);
END;
$$;

-- Reviews for moderation (operations and owner), every moderation state. Reviewer names only with personal.read.
CREATE OR REPLACE FUNCTION public.admin_list_reviews(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 100,
                                                     p_offset INTEGER DEFAULT 0, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  v_names BOOLEAN;
  v_purpose TEXT;
  v_total BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['operations.write', 'personal.read'], 'reviews for moderation');
  v_purpose := public.gov2_read_purpose(p_purpose, 'review_moderation');
  v_names := public.admin_can('personal.read');
  SELECT count(*) INTO v_total FROM public.reviews r WHERE v_status IS NULL OR COALESCE(r.moderation_status, 'published') = v_status;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id), '[]'::jsonb), COALESCE(array_agg(x.customer_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT r.id, r.rating, r.comment, r.created_at, r.moderation_status, r.reply_comment, r.reply_created_at, r.customer_id,
             CASE WHEN v_names THEN jsonb_build_object('first_name', cp.first_name, 'last_name', cp.last_name) END AS customer,
             jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar) AS provider,
             CASE WHEN e.id IS NOT NULL THEN jsonb_build_object('name_en', e.name_en, 'name_ar', e.name_ar) END AS employee
        FROM public.reviews r
        LEFT JOIN public.providers p ON p.id = r.provider_id
        LEFT JOIN public.employees e ON e.id = r.employee_id
        LEFT JOIN public.profiles cp ON cp.id = r.customer_id
       WHERE v_status IS NULL OR COALESCE(r.moderation_status, 'published') = v_status
       ORDER BY r.created_at DESC, r.id
       LIMIT v_limit OFFSET v_offset
    ) x;
  PERFORM public.gov2_log_read('reviews.listed', 'reviews', v_ids,
    ARRAY['rating', 'comment', 'moderation_status', 'reply_comment'] || CASE WHEN v_names THEN ARRAY['first_name', 'last_name'] ELSE ARRAY[]::text[] END,
    v_purpose, jsonb_build_object('status', v_status, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows, 'names_included', v_names);
END;
$$;

-- Package usage on the packages screen: sold vouchers with sessions left and redemptions, as totals (D4: 1 to 4 suppressed).
CREATE OR REPLACE FUNCTION public.admin_package_usage_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active BIGINT;
  v_redemptions BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_active FROM public.user_packages WHERE remaining_sessions > 0;
  SELECT count(*) INTO v_redemptions FROM public.package_redemptions;
  RETURN jsonb_build_object(
    'active_vouchers', CASE WHEN public.d4_is_small_cell(v_active) THEN NULL ELSE v_active END,
    'active_vouchers_suppressed', public.d4_is_small_cell(v_active),
    'redemptions', CASE WHEN public.d4_is_small_cell(v_redemptions) THEN NULL ELSE v_redemptions END,
    'redemptions_suppressed', public.d4_is_small_cell(v_redemptions));
END;
$$;

-- Branch figures for the providers screen (what admin_branch_performance shows), now that console sessions read no bookings.
CREATE OR REPLACE FUNCTION public.admin_branch_performance_report()
RETURNS SETOF public.admin_branch_performance
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_branch_performance;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recent_bookings(INTEGER, TEXT), public.admin_list_refund_requests(TEXT, INTEGER, INTEGER, TEXT),
  public.admin_list_disputes(TEXT, INTEGER, INTEGER, TEXT), public.admin_list_reviews(TEXT, INTEGER, INTEGER, TEXT),
  public.admin_package_usage_summary(), public.admin_branch_performance_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recent_bookings(INTEGER, TEXT), public.admin_list_refund_requests(TEXT, INTEGER, INTEGER, TEXT),
  public.admin_list_disputes(TEXT, INTEGER, INTEGER, TEXT), public.admin_list_reviews(TEXT, INTEGER, INTEGER, TEXT),
  public.admin_package_usage_summary(), public.admin_branch_performance_report() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. The provider private directory needs personal.read and is logged per provider and field
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_provider_private_directory();
CREATE OR REPLACE FUNCTION public.admin_provider_private_directory(p_purpose TEXT DEFAULT NULL)
RETURNS TABLE(provider_id UUID, contact_email TEXT, contact_phone TEXT, cr_number TEXT, vat_number TEXT, trade_license_url TEXT,
              commission_percentage NUMERIC, admin_notes TEXT, last_activity_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose TEXT;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'provider contact details');
  v_purpose := public.gov2_read_purpose(p_purpose, 'provider_onboarding');
  SELECT COALESCE(array_agg(p.id), '{}'::uuid[]) INTO v_ids FROM public.providers p;
  PERFORM public.gov2_log_read('provider.private_directory_viewed', 'providers', v_ids,
    ARRAY['contact_email', 'contact_phone', 'cr_number', 'vat_number', 'trade_license_url', 'commission_percentage', 'admin_notes'],
    v_purpose, '{}'::jsonb, cardinality(v_ids));
  RETURN QUERY
    SELECT p.id, p.contact_email::text, p.contact_phone::text, p.cr_number::text, p.vat_number::text, p.trade_license_url::text,
           p.commission_percentage::numeric, p.admin_notes::text, p.last_activity_at
      FROM public.providers p
     ORDER BY p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_provider_private_directory(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_private_directory(TEXT) TO authenticated;
