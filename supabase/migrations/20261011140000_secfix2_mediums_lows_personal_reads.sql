-- SECFIX-2 mediums and lows on console reads (docs/reviews/2026-10-11-security-round2.md; Q4 and D4 final decision texts):
--   R2-M1 get_provider_private_profile: a console session needs personal.read and a purpose; the read is logged per field.
--   R2-M2 calculate_staff_payroll: a console session needs money.ledger and personal.read and a purpose; logged per employee.
--   R2-M3 admin_branch_performance_report: a branch whose figures describe 1 to 4 customers is suppressed (D4); the read of the
--         unsuppressed rows is aggregate and unlogged as D4 allows.
--   R2-M6 admin_customer_overview and admin_booking_directory: purpose, target ids, fields and the search text's SHA-256 (never
--         the text) are logged; the booking directory returns customer names only to personal.read.
--   R2-M7 get_booking_address_secure: a console session needs personal.read and a purpose; logged with gov2_log_read.
--   R2-L2 reveal_employee_wps_iban: staff salary IBAN reveals share the provider IBAN reveal counter, ceiling and alert.
--   R2-L4 admin_provider_private_directory and admin_employee_performance_report: paged, at most 500 rows per read, so every
--         audit row names every target it returned.
--   R2-L5 provider_payout_destination_summary: a console session needs money.payout or money.ledger; logged.
-- Each console read that requires a purpose refuses a missing one (the screen states why it reads).

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- A purpose the console session must state (no default).
CREATE OR REPLACE FUNCTION public.gov2_required_purpose(p_purpose TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_purpose, '')), '') IS NULL THEN
    RAISE EXCEPTION 'State the purpose of this read' USING ERRCODE = '22023', HINT = 'purpose_required';
  END IF;
  RETURN public.gov2_read_purpose(p_purpose, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.gov2_required_purpose(TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-M1
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_provider_private_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_provider_private_profile(p_provider_id UUID DEFAULT NULL, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_provider public.providers;
  v_console BOOLEAN := FALSE;
  v_delegate BOOLEAN := FALSE;
  v_purpose TEXT;
  v_out JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_provider_id IS NULL THEN
    SELECT * INTO v_provider FROM public.providers WHERE owner_id = v_uid ORDER BY created_at LIMIT 1;
  ELSE
    SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id;
  END IF;
  IF v_provider.id IS NOT NULL THEN
    v_delegate := EXISTS (
      SELECT 1 FROM public.provider_memberships m
       WHERE m.provider_id = v_provider.id AND m.user_id = v_uid AND m.is_active AND m.branch_id IS NULL
         AND m.role IN ('manager', 'owner') AND m.permissions -> 'settings' = 'true'::jsonb);
    v_console := v_provider.owner_id IS DISTINCT FROM v_uid AND NOT v_delegate AND public.is_admin();
  END IF;
  IF v_provider.id IS NULL OR NOT (v_provider.owner_id = v_uid OR v_delegate OR v_console) THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_console THEN
    PERFORM public.gov2_require_read(ARRAY['personal.read'], 'provider contact details');
    v_purpose := public.gov2_required_purpose(p_purpose);
  END IF;

  v_out := jsonb_build_object(
    'provider_id', v_provider.id,
    'contact_phone', v_provider.contact_phone,
    'contact_email', v_provider.contact_email,
    'cr_number', v_provider.cr_number,
    'vat_number', v_provider.vat_number,
    'trade_license_url', v_provider.trade_license_url,
    'commission_percentage', v_provider.commission_percentage);
  IF v_console THEN
    v_out := v_out || jsonb_build_object('last_activity_at', v_provider.last_activity_at, 'admin_notes', v_provider.admin_notes,
                                          'cr_wathq_data', v_provider.cr_wathq_data);
    PERFORM public.gov2_log_read('provider.private_profile_viewed', 'providers', ARRAY[v_provider.id],
      ARRAY['contact_phone', 'contact_email', 'cr_number', 'vat_number', 'trade_license_url', 'commission_percentage', 'admin_notes', 'cr_wathq_data'],
      v_purpose, '{}'::jsonb, 1);
  END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.get_provider_private_profile(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_private_profile(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-M2
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.calculate_staff_payroll(UUID, DATE, DATE);
CREATE OR REPLACE FUNCTION public.calculate_staff_payroll(p_provider_id UUID, p_start_date DATE, p_end_date DATE, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner BOOLEAN := EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid());
  v_purpose TEXT;
  v_out JSONB;
  v_ids UUID[];
BEGIN
  IF NOT v_owner THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Not authorized to calculate payroll for this provider' USING ERRCODE = '42501';
    END IF;
    -- Staff pay is money and personal data: both permissions (D-Q5, Q4).
    PERFORM public.gov2_require_read(ARRAY['money.ledger'], 'staff pay');
    PERFORM public.gov2_require_read(ARRAY['personal.read'], 'staff pay');
    v_purpose := public.gov2_required_purpose(p_purpose);
  END IF;

  v_out := jsonb_build_object(
    'provider_id', p_provider_id, 'start_date', p_start_date, 'end_date', p_end_date, 'currency', 'SAR',
    'payroll_entries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'employee_id', e.id, 'name_en', e.name_en, 'name_ar', e.name_ar, 'title_en', e.title_en,
        'branch', br.name_en,
        'rule_configured', r.id IS NOT NULL,
        'wps_iban_masked', r.wps_iban_masked,
        'completed_bookings', w.n,
        'service_revenue_sar', w.rev,
        'commission_rate_pct', r.commission_rate,
        'commission_earned_sar', CASE WHEN r.id IS NULL THEN NULL ELSE ROUND(w.rev * COALESCE(r.commission_rate, 0) / 100.0, 2) END,
        'tips_earned_sar', t.tips,
        'base_salary_sar', r.base_salary_sar,
        'total_payout_sar', CASE WHEN r.id IS NULL THEN NULL
                                 ELSE COALESCE(r.base_salary_sar, 0) + ROUND(w.rev * COALESCE(r.commission_rate, 0) / 100.0, 2) + t.tips END
      ) ORDER BY e.name_en), '[]'::jsonb)
      FROM public.employees e
      JOIN public.branches br ON br.id = e.branch_id
      LEFT JOIN public.employee_commission_rules r ON r.employee_id = e.id
      CROSS JOIN LATERAL (
        SELECT COUNT(*) n, COALESCE(SUM(b.total_price), 0) rev FROM public.bookings b
        WHERE b.employee_id = e.id AND b.status = 'completed'
          AND (b.scheduled_at AT TIME ZONE (SELECT public.provider_timezone(p_provider_id)))::date BETWEEN p_start_date AND p_end_date) w
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(bt.amount), 0) tips FROM public.booking_tips bt
        WHERE bt.employee_id = e.id AND bt.status = 'completed'
          AND (bt.paid_at AT TIME ZONE (SELECT public.provider_timezone(p_provider_id)))::date BETWEEN p_start_date AND p_end_date) t
      WHERE br.provider_id = p_provider_id AND e.is_active)
  );
  IF NOT v_owner THEN
    SELECT COALESCE(array_agg((x->>'employee_id')::uuid), '{}'::uuid[]) INTO v_ids FROM jsonb_array_elements(v_out->'payroll_entries') x;
    PERFORM public.gov2_log_read('staff_payroll.viewed', 'employees', v_ids,
      ARRAY['base_salary_sar', 'commission_rate_pct', 'commission_earned_sar', 'tips_earned_sar', 'total_payout_sar', 'wps_iban_masked'],
      v_purpose, jsonb_build_object('provider_id', p_provider_id, 'start_date', p_start_date, 'end_date', p_end_date), cardinality(v_ids));
  END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_staff_payroll(UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_staff_payroll(UUID, DATE, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-M3
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_branch_performance_report();
CREATE OR REPLACE FUNCTION public.admin_branch_performance_report()
RETURNS TABLE(branch_id UUID, provider_id UUID, total_bookings BIGINT, completed_bookings BIGINT, cancelled_bookings BIGINT,
              no_show_bookings BIGINT, gross_revenue NUMERIC, commission_amount NUMERIC, revenue_30d NUMERIC, review_count BIGINT,
              rating_sum BIGINT, suppressed BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  -- D4: a branch whose figures describe 1 to 4 distinct customers would point at those people; its figures are withheld.
  RETURN QUERY
    SELECT p.branch_id, p.provider_id,
           CASE WHEN s.small THEN NULL ELSE p.total_bookings END,
           CASE WHEN s.small THEN NULL ELSE p.completed_bookings END,
           CASE WHEN s.small THEN NULL ELSE p.cancelled_bookings END,
           CASE WHEN s.small THEN NULL ELSE p.no_show_bookings END,
           CASE WHEN s.small THEN NULL ELSE p.gross_revenue END,
           CASE WHEN s.small THEN NULL ELSE p.commission_amount END,
           CASE WHEN s.small THEN NULL ELSE p.revenue_30d END,
           CASE WHEN s.small THEN NULL ELSE p.review_count END,
           CASE WHEN s.small THEN NULL ELSE p.rating_sum END,
           s.small
      FROM public.admin_branch_performance p
      CROSS JOIN LATERAL (
        SELECT public.d4_is_small_cell((SELECT COUNT(DISTINCT b.customer_id) FROM public.bookings b
                                          WHERE b.branch_id = p.branch_id AND b.customer_id IS NOT NULL)) AS small
      ) s;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_branch_performance_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_branch_performance_report() TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-M6
-- ---------------------------------------------------------------------------------------------------------------------

-- The search text is personal data in itself (a name, a phone number): the audit row keeps its SHA-256, never the text.
CREATE OR REPLACE FUNCTION public.gov2_search_digest(p_search TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN NULLIF(btrim(COALESCE(p_search, '')), '') IS NULL THEN NULL
              ELSE encode(extensions.digest(convert_to(lower(btrim(p_search)), 'UTF8'), 'sha256'), 'hex') END;
$$;
REVOKE ALL ON FUNCTION public.gov2_search_digest(TEXT) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_customer_overview(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_customer_overview(p_search TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0,
                                                          p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_pattern TEXT;
  v_id UUID;
  v_total BIGINT;
  v_verified BIGINT;
  v_matching BIGINT;
  v_rows JSONB;
  v_ids UUID[];
  v_purpose TEXT;
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'customer personal data');
  v_purpose := public.gov2_read_purpose(p_purpose, 'customer_support');
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_id := v_search::uuid;
    END IF;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE phone_verified) INTO v_total, v_verified FROM public.profiles WHERE role = 'customer';
  SELECT COUNT(*) INTO v_matching
    FROM public.profiles p
   WHERE p.role = 'customer'
     AND (v_pattern IS NULL
          OR COALESCE(p.first_name, '') ILIKE v_pattern
          OR COALESCE(p.last_name, '') ILIKE v_pattern
          OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
          OR COALESCE(p.email, '') ILIKE v_pattern
          OR COALESCE(p.phone_number, '') ILIKE v_pattern
          OR p.id = v_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id), '[]'::jsonb), COALESCE(array_agg(r.id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (
      SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.phone_verified, p.created_at,
             s.bookings, s.completed_bookings, s.spend
        FROM public.profiles p
        CROSS JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'completed', 'no_show')
                                    OR (b.status = 'cancelled' AND b.cancelled_by IS DISTINCT FROM 'system')) AS bookings,
                 COUNT(*) FILTER (WHERE b.status = 'completed') AS completed_bookings,
                 COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0) AS spend
            FROM public.bookings b
           WHERE b.customer_id = p.id
        ) s
       WHERE p.role = 'customer'
         AND (v_pattern IS NULL
              OR COALESCE(p.first_name, '') ILIKE v_pattern
              OR COALESCE(p.last_name, '') ILIKE v_pattern
              OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE v_pattern
              OR COALESCE(p.email, '') ILIKE v_pattern
              OR COALESCE(p.phone_number, '') ILIKE v_pattern
              OR p.id = v_id)
       ORDER BY p.created_at DESC, p.id
       LIMIT v_limit OFFSET v_offset
    ) r;

  PERFORM public.gov2_log_read('customers.listed', 'profiles', v_ids,
    ARRAY['first_name', 'last_name', 'email', 'phone_number', 'phone_verified', 'bookings', 'spend'], v_purpose,
    jsonb_build_object('search_sha256', public.gov2_search_digest(v_search), 'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('total_customers', v_total, 'verified_customers', v_verified, 'matching', v_matching, 'rows', v_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_customer_overview(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_overview(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_booking_directory(TEXT, TEXT, DATE, DATE, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_booking_directory(p_search TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL, p_from DATE DEFAULT NULL,
                                                          p_to DATE DEFAULT NULL, p_limit INTEGER DEFAULT 25, p_offset INTEGER DEFAULT 0,
                                                          p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_status TEXT := NULLIF(TRIM(COALESCE(p_status, '')), '');
  v_names BOOLEAN;
  v_purpose TEXT;
  v_pattern TEXT;
  v_id UUID;
  v_invoice BIGINT;
  v_matching BIGINT;
  v_value NUMERIC;
  v_commission NUMERIC;
  v_active BIGINT;
  v_rows JSONB;
  v_ids UUID[];
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read', 'money.ledger'], 'bookings');
  v_names := public.admin_can('personal.read');
  v_purpose := public.gov2_read_purpose(p_purpose, CASE WHEN v_names THEN 'customer_support' ELSE 'finance_operations' END);
  IF v_status IS NOT NULL AND v_status NOT IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Unknown booking status' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The start date is after the end date' USING ERRCODE = '22023';
  END IF;
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    IF v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_id := v_search::uuid;
    END IF;
    IF v_search ~ '^#?[0-9]{1,12}$' THEN
      v_invoice := regexp_replace(v_search, '^#', '')::bigint;
    END IF;
  END IF;

  WITH hits AS (
    SELECT b.id, b.invoice_number, b.created_at, b.scheduled_at, b.status, b.total_price, b.platform_commission, b.tax_amount,
           c.first_name, c.last_name, br.name_en, br.name_ar, pr.business_name_en, pr.business_name_ar
      FROM public.bookings b
      LEFT JOIN public.profiles c ON c.id = b.customer_id
      LEFT JOIN public.branches br ON br.id = b.branch_id
      LEFT JOIN public.providers pr ON pr.id = br.provider_id
     WHERE (v_status IS NULL OR b.status::text = v_status)
       AND (p_from IS NULL OR (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date >= p_from)
       AND (p_to IS NULL OR (b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date <= p_to)
       AND (v_pattern IS NULL
            OR b.id = v_id
            OR b.invoice_number = v_invoice
            -- Without personal.read the search does not reach customer names, emails or phone numbers either.
            OR (v_names AND (COALESCE(c.first_name, '') ILIKE v_pattern
                             OR COALESCE(c.last_name, '') ILIKE v_pattern
                             OR (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE v_pattern
                             OR COALESCE(c.email, '') ILIKE v_pattern
                             OR COALESCE(c.phone_number, '') ILIKE v_pattern))
            OR COALESCE(pr.business_name_en, '') ILIKE v_pattern
            OR COALESCE(pr.business_name_ar, '') ILIKE v_pattern)
  ),
  page AS (
    SELECT * FROM hits ORDER BY scheduled_at DESC, id LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT COUNT(*) FROM hits),
         (SELECT COALESCE(SUM(total_price), 0) FROM hits),
         (SELECT COALESCE(SUM(platform_commission), 0) FROM hits),
         (SELECT COUNT(*) FROM hits WHERE status IN ('confirmed', 'pending_payment')),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'invoice_number', p.invoice_number, 'created_at', p.created_at, 'scheduled_at', p.scheduled_at,
                   'status', p.status, 'total_price', p.total_price, 'platform_commission', p.platform_commission, 'tax_amount', p.tax_amount,
                   'customer', CASE WHEN v_names THEN jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) END,
                   'branches', jsonb_build_object('name_en', p.name_en, 'name_ar', p.name_ar,
                     'providers', jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar))
                 ) ORDER BY p.scheduled_at DESC, p.id), '[]'::jsonb) FROM page p),
         (SELECT COALESCE(array_agg(p.id), '{}'::uuid[]) FROM page p)
    INTO v_matching, v_value, v_commission, v_active, v_rows, v_ids;

  PERFORM public.gov2_log_read('bookings.listed', 'bookings', v_ids,
    ARRAY['status', 'scheduled_at', 'total_price', 'platform_commission', 'tax_amount', 'invoice_number', 'branch', 'provider']
      || CASE WHEN v_names THEN ARRAY['customer_first_name', 'customer_last_name'] ELSE ARRAY[]::text[] END,
    v_purpose,
    jsonb_build_object('search_sha256', public.gov2_search_digest(v_search), 'status', v_status, 'from', p_from, 'to', p_to,
                       'limit', v_limit, 'offset', v_offset),
    jsonb_array_length(v_rows));
  RETURN jsonb_build_object('matching', v_matching, 'total_value', v_value, 'total_commission', v_commission,
                            'active', v_active, 'rows', v_rows, 'names_included', v_names);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_booking_directory(TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_directory(TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-M7
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_booking_address_secure(UUID);
CREATE OR REPLACE FUNCTION public.get_booking_address_secure(p_booking_id UUID, p_purpose TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_service BOOLEAN := COALESCE(auth.jwt()->>'role', '') = 'service_role';
  v_booking public.bookings;
  v_branch public.branches;
  v_provider public.providers;
  v_console BOOLEAN;
  v_purpose TEXT;
  v_revealed_address TEXT;
  v_home public.booking_home_addresses;
BEGIN
  IF v_user_id IS NULL AND NOT v_service THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  SELECT * INTO v_branch FROM public.branches WHERE id = v_booking.branch_id;
  SELECT * INTO v_provider FROM public.providers WHERE id = v_branch.provider_id;

  -- A console session that is neither the customer nor the provider's owner reads only with personal.read and a purpose.
  v_console := v_booking.id IS NOT NULL AND NOT v_service AND v_booking.customer_id IS DISTINCT FROM v_user_id
               AND v_provider.owner_id IS DISTINCT FROM v_user_id AND public.is_admin();

  -- A booking the caller has no part in is answered like one that does not exist.
  IF v_booking.id IS NULL OR NOT (
       v_booking.customer_id = v_user_id
    OR v_provider.owner_id = v_user_id
    OR v_console
    OR v_service
    OR public.is_booking_staff(v_booking.id, v_user_id)
  ) THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_console THEN
    PERFORM public.gov2_require_read(ARRAY['personal.read'], 'customer addresses');
    v_purpose := public.gov2_required_purpose(p_purpose);
  END IF;

  IF v_booking.is_home_service THEN
    IF v_booking.status IN ('confirmed', 'completed') OR v_booking.customer_id = v_user_id THEN
      SELECT * INTO v_home FROM public.booking_home_addresses WHERE booking_id = p_booking_id;
      IF v_booking.customer_id = v_user_id OR v_console OR v_service OR public.home_address_staff_window_open(v_booking.id) THEN
        v_revealed_address := v_home.address_text;
      ELSE
        v_revealed_address := 'Address no longer available (العنوان لم يعد متاحاً)';
        v_home := NULL;
      END IF;
      IF v_home.booking_id IS NOT NULL AND v_home.revealed_at IS NULL AND v_booking.customer_id IS DISTINCT FROM v_user_id
         AND v_user_id IS NOT NULL AND NOT v_console THEN
        UPDATE public.booking_home_addresses SET revealed_at = now() WHERE booking_id = p_booking_id;
      END IF;
      IF v_booking.address_revealed_at IS NULL AND NOT v_console THEN
        UPDATE public.bookings SET address_revealed_at = NOW() WHERE id = p_booking_id;
      END IF;
      IF v_console AND v_home.booking_id IS NOT NULL THEN
        PERFORM public.gov2_log_read('booking.home_address_viewed', 'bookings', ARRAY[v_booking.id],
          ARRAY['address_text', 'latitude', 'longitude'], v_purpose, jsonb_build_object('customer_id', v_booking.customer_id), 1);
      END IF;
    ELSE
      v_revealed_address := 'Address hidden until booking confirmation (محجوب حتى تأكيد الحجز)';
    END IF;
  ELSE
    v_revealed_address := COALESCE(v_branch.address_text_ar, v_branch.address_text_en, 'Salon location');
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'booking_id', p_booking_id,
    'is_home_service', v_booking.is_home_service,
    'status', v_booking.status,
    'address', v_revealed_address,
    'latitude', v_home.latitude,
    'longitude', v_home.longitude
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_booking_address_secure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_address_secure(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L2: one reveal counter, ceiling and alert for provider and staff salary IBANs
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.reveal_provider_iban(uuid,text)'::regprocedure,
$from$   WHERE action = 'iban.revealed' AND actor_id = auth.uid() AND created_at > now() - INTERVAL '24 hours';$from$,
$to$   WHERE action IN ('iban.revealed', 'employee_wps_iban.revealed') AND actor_id = auth.uid() AND created_at > now() - INTERVAL '24 hours';$to$);

SELECT pg_temp.patch_function('public.reveal_employee_wps_iban(uuid,text)'::regprocedure,
$from$  v_is_owner BOOLEAN;$from$,
$to$  v_is_owner BOOLEAN;
  v_count INTEGER;
  v_ceiling INTEGER;$to$);
SELECT pg_temp.patch_function('public.reveal_employee_wps_iban(uuid,text)'::regprocedure,
$from$  IF v_rule.id IS NULL OR v_rule.wps_iban IS NULL THEN$from$,
$to$  -- SECFIX-2 R2-L2: a console reveal counts against the same 24-hour ceiling and volume alert as provider IBAN reveals.
  IF NOT v_is_owner THEN
    PERFORM pg_advisory_xact_lock(hashtext('iban_reveal:' || auth.uid()::text));
    SELECT COUNT(*) INTO v_count FROM public.admin_audit_logs
     WHERE action IN ('iban.revealed', 'employee_wps_iban.revealed') AND actor_id = auth.uid() AND created_at > now() - INTERVAL '24 hours';
    v_ceiling := public.iban_reveal_ceiling(auth.uid());
    IF v_count >= v_ceiling THEN
      IF NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'iban_reveal_limit_reached' AND user_id = auth.uid()
                      AND created_at > now() - INTERVAL '24 hours' AND acknowledged_at IS NULL) THEN
        INSERT INTO public.security_alerts (kind, user_id, details)
        VALUES ('iban_reveal_limit_reached', auth.uid(), jsonb_build_object('reveals_in_24h', v_count, 'ceiling', v_ceiling));
      END IF;
      PERFORM public.write_audit_log('employee_wps_iban.reveal_refused', 'employees', p_employee_id,
        jsonb_build_object('reason', v_reason, 'reveals_in_24h', v_count, 'ceiling', v_ceiling) || public.request_client_info());
      RETURN jsonb_build_object('employee_id', p_employee_id, 'refused', TRUE, 'refusal', 'reveal_limit_reached',
        'reveals_in_24h', v_count, 'ceiling', v_ceiling,
        'message', format('You have revealed %s bank accounts in 24 hours, the most allowed; another owner can allow more from Approvals', v_count));
    END IF;
    IF v_count + 1 > 10 AND NOT EXISTS (SELECT 1 FROM public.security_alerts WHERE kind = 'iban_reveal_volume' AND user_id = auth.uid()
                                          AND created_at > now() - INTERVAL '24 hours') THEN
      INSERT INTO public.security_alerts (kind, user_id, details) VALUES ('iban_reveal_volume', auth.uid(), jsonb_build_object('reveals_in_24h', v_count + 1));
    END IF;
  END IF;
  IF v_rule.id IS NULL OR v_rule.wps_iban IS NULL THEN$to$);

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L4: every audited directory read names every row it returned (at most 500 per page)
-- ---------------------------------------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_provider_private_directory(TEXT);
CREATE OR REPLACE FUNCTION public.admin_provider_private_directory(p_purpose TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 500, p_offset INTEGER DEFAULT 0)
RETURNS TABLE(provider_id UUID, contact_email TEXT, contact_phone TEXT, cr_number TEXT, vat_number TEXT, trade_license_url TEXT,
              commission_percentage NUMERIC, admin_notes TEXT, last_activity_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose TEXT;
  v_ids UUID[];
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read'], 'provider contact details');
  v_purpose := public.gov2_read_purpose(p_purpose, 'provider_onboarding');
  SELECT COALESCE(array_agg(x.id), '{}'::uuid[]) INTO v_ids
    FROM (SELECT p.id FROM public.providers p ORDER BY p.created_at DESC, p.id LIMIT v_limit OFFSET v_offset) x;
  PERFORM public.gov2_log_read('provider.private_directory_viewed', 'providers', v_ids,
    ARRAY['contact_email', 'contact_phone', 'cr_number', 'vat_number', 'trade_license_url', 'commission_percentage', 'admin_notes'],
    v_purpose, jsonb_build_object('limit', v_limit, 'offset', v_offset), cardinality(v_ids));
  RETURN QUERY
    SELECT p.id, p.contact_email::text, p.contact_phone::text, p.cr_number::text, p.vat_number::text, p.trade_license_url::text,
           p.commission_percentage::numeric, p.admin_notes::text, p.last_activity_at
      FROM public.providers p
     WHERE p.id = ANY (v_ids)
     ORDER BY p.created_at DESC, p.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_provider_private_directory(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provider_private_directory(TEXT, INTEGER, INTEGER) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_employee_performance_report(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_employee_performance_report(p_provider_id UUID DEFAULT NULL, p_purpose TEXT DEFAULT NULL,
                                                                    p_limit INTEGER DEFAULT 500, p_offset INTEGER DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_money BOOLEAN := public.admin_can('money.ledger');
  v_purpose TEXT;
  v_rows JSONB;
  v_ids UUID[];
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public.gov2_require_read(ARRAY['personal.read', 'money.ledger'], 'staff performance');
  v_purpose := public.gov2_read_purpose(p_purpose, 'provider_onboarding');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'employee_id', ep.employee_id, 'branch_id', ep.branch_id, 'provider_id', ep.provider_id,
           'completed_bookings', ep.completed_bookings, 'cancelled_bookings', ep.cancelled_bookings,
           'no_show_bookings', ep.no_show_bookings, 'gross_revenue', ep.gross_revenue, 'commission_amount', ep.commission_amount,
           'employee_earnings', CASE WHEN v_money THEN ep.employee_earnings END,
           'review_count', ep.review_count, 'rating_sum', ep.rating_sum, 'repeat_customers', ep.repeat_customers)
           ORDER BY ep.provider_id, ep.employee_id), '[]'::jsonb),
         COALESCE(array_agg(ep.employee_id), '{}'::uuid[])
    INTO v_rows, v_ids
    FROM (SELECT * FROM public.admin_employee_performance e
           WHERE p_provider_id IS NULL OR e.provider_id = p_provider_id
           ORDER BY e.provider_id, e.employee_id LIMIT v_limit OFFSET v_offset) ep;
  PERFORM public.gov2_log_read('employee_performance.viewed', 'employees', v_ids,
    CASE WHEN v_money THEN ARRAY['booking_counts', 'revenue', 'reviews', 'earnings'] ELSE ARRAY['booking_counts', 'revenue', 'reviews'] END,
    v_purpose, jsonb_build_object('provider_id', p_provider_id, 'limit', v_limit, 'offset', v_offset), jsonb_array_length(v_rows));
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_employee_performance_report(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_employee_performance_report(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- R2-L5
-- ---------------------------------------------------------------------------------------------------------------------

SELECT pg_temp.patch_function('public.provider_payout_destination_summary(uuid)'::regprocedure,
$from$  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized for this provider' USING ERRCODE = '42501';
  END IF;$from$,
$to$  IF NOT (public.is_admin() OR EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized for this provider' USING ERRCODE = '42501';
  END IF;
  -- SECFIX-2 R2-L5: bank name and account holder are bank data; a console session needs a money permission and is logged.
  IF NOT EXISTS (SELECT 1 FROM public.providers WHERE id = p_provider_id AND owner_id = auth.uid()) THEN
    PERFORM public.gov2_require_read(ARRAY['money.payout', 'money.ledger'], 'payout accounts');
    PERFORM public.gov2_log_read('payout_destination.summary_viewed', 'providers', ARRAY[p_provider_id],
      ARRAY['bank_name', 'account_holder_name', 'iban_masked'], 'payout_review', '{}'::jsonb, 1);
  END IF;$to$);
ALTER FUNCTION public.provider_payout_destination_summary(UUID) VOLATILE;
