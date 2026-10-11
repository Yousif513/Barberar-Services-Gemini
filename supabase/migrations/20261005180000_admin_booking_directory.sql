-- Migration: 20261005180000_admin_booking_directory.sql
-- The Bookings screen listed the newest 500 bookings for one status and nothing else: a dispute, refund or data
-- request about a booking from four months ago could not be found without engineering. This command is the
-- screen's source: search by booking ID, invoice number, customer or provider, a status filter, a date range
-- (Riyadh calendar dates), clamped pages, and totals over every matching booking (not only the listed page).
-- Every call is recorded as a privileged read, without the search text, which can itself be a phone number or email.

CREATE OR REPLACE FUNCTION public.admin_booking_directory(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
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
  v_pattern TEXT;
  v_id UUID;
  v_invoice BIGINT;
  v_matching BIGINT;
  v_value NUMERIC;
  v_commission NUMERIC;
  v_active BIGINT;
  v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Unknown booking status' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'The start date is after the end date' USING ERRCODE = '22023';
  END IF;

  IF v_search IS NOT NULL THEN
    -- LIKE wildcards typed by the operator are searched for literally.
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
            OR COALESCE(c.first_name, '') ILIKE v_pattern
            OR COALESCE(c.last_name, '') ILIKE v_pattern
            OR (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) ILIKE v_pattern
            OR COALESCE(c.email, '') ILIKE v_pattern
            OR COALESCE(c.phone_number, '') ILIKE v_pattern
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
                   'customer', jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name),
                   'branches', jsonb_build_object('name_en', p.name_en, 'name_ar', p.name_ar,
                     'providers', jsonb_build_object('business_name_en', p.business_name_en, 'business_name_ar', p.business_name_ar))
                 ) ORDER BY p.scheduled_at DESC, p.id), '[]'::jsonb) FROM page p)
    INTO v_matching, v_value, v_commission, v_active, v_rows;

  PERFORM public.write_audit_log('bookings.listed', 'bookings', NULL,
    jsonb_build_object('searched', v_search IS NOT NULL, 'status', v_status, 'from', p_from, 'to', p_to,
                       'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_rows)));

  RETURN jsonb_build_object('matching', v_matching, 'total_value', v_value, 'total_commission', v_commission,
                            'active', v_active, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_booking_directory(TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_directory(TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;
