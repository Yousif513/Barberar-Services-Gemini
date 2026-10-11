-- Migration: 20261005140000_admin_customer_directory.sql
-- The customer screen asked bookings for a column that does not exist (client_id), ignored the error and showed
-- every customer with zero bookings and zero spend; it also loaded every customer's name, email and phone into
-- the browser on each visit with no record that anyone looked, cut off at the 1,000-row API limit. Data requests
-- were closed with a canned note ("Fulfilled per customer request") nobody wrote, and a customer's phone could
-- be marked verified without a code and without a reason. This migration gives each of those a server command:
--   * admin_customer_overview: one page of customers (found by name, email, phone or ID) with booking figures
--     computed in SQL, plus totals; every call is recorded (customers.listed) without the search text, which can itself be a phone number or email;
--   * admin_update_data_request: moves a PDPL request through start / complete / reject with the operator's own
--     note, recording who reviewed it and when;
--   * admin_set_phone_verified: a manual override of phone verification that needs a reason.

-- ---------------------------------------------------------------------------
-- 1. Customer directory page
-- ---------------------------------------------------------------------------
-- bookings counts visits that were confirmed, completed, missed or cancelled by a person; unpaid holds and holds
-- the system released are not visits. spend is what completed bookings were worth, VAT included.
CREATE OR REPLACE FUNCTION public.admin_customer_overview(
  p_search TEXT DEFAULT NULL,
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
  v_pattern TEXT;
  v_id UUID;
  v_total BIGINT;
  v_verified BIGINT;
  v_matching BIGINT;
  v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  -- LIKE wildcards typed by the operator are searched for literally.
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- A pasted customer ID finds that one customer; part of an ID is not searched, so a phone-number fragment
    -- never matches an unrelated account by chance.
    IF v_search ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_id := v_search::uuid;
    END IF;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE phone_verified)
    INTO v_total, v_verified
    FROM public.profiles WHERE role = 'customer';

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

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC, r.id), '[]'::jsonb)
    INTO v_rows
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

  PERFORM public.write_audit_log('customers.listed', 'profiles', NULL,
    jsonb_build_object('searched', v_search IS NOT NULL, 'limit', v_limit, 'offset', v_offset, 'rows', jsonb_array_length(v_rows)));

  RETURN jsonb_build_object('total_customers', v_total, 'verified_customers', v_verified, 'matching', v_matching, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_customer_overview(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_overview(TEXT, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Data-subject requests (PDPL)
-- ---------------------------------------------------------------------------
-- pending -> in_progress | completed | rejected, and in_progress -> completed | rejected. Completed and rejected
-- are final. The note is the operator's own account of what was done or why the request was refused.
CREATE OR REPLACE FUNCTION public.admin_update_data_request(
  p_request_id UUID,
  p_status TEXT,
  p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.data_subject_requests;
  v_note TEXT := NULLIF(TRIM(COALESCE(p_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('in_progress', 'completed', 'rejected') THEN
    RAISE EXCEPTION 'A request can be started, completed or rejected' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL OR length(v_note) < 3 THEN
    RAISE EXCEPTION 'A note of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.data_subject_requests WHERE id = p_request_id FOR UPDATE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.status IN ('completed', 'rejected') THEN
    RAISE EXCEPTION 'A % request is closed and cannot change', v_request.status USING ERRCODE = '22023';
  END IF;
  IF v_request.status = p_status THEN
    RAISE EXCEPTION 'The request is already %', p_status USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('primora.audit_reason', v_note, true);
  UPDATE public.data_subject_requests
     SET status = p_status, admin_notes = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = v_request.id;

  RETURN jsonb_build_object('request_id', v_request.id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_data_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_data_request(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Manual phone verification
-- ---------------------------------------------------------------------------
-- Phone verification normally comes from a one-time code. This override exists for an operator who has
-- confirmed the number with the customer another way, so it needs a reason and a number to verify.
CREATE OR REPLACE FUNCTION public.admin_set_phone_verified(
  p_customer_id UUID,
  p_verified BOOLEAN,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_verified IS NULL THEN
    RAISE EXCEPTION 'Say whether the phone number is verified' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_customer_id FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_profile.role <> 'customer' THEN
    RAISE EXCEPTION 'Only customer profiles can be changed here' USING ERRCODE = '22023';
  END IF;
  IF p_verified AND v_profile.phone_number IS NULL THEN
    RAISE EXCEPTION 'There is no phone number to verify' USING ERRCODE = '22023';
  END IF;
  IF v_profile.phone_verified = p_verified THEN
    RETURN jsonb_build_object('customer_id', v_profile.id, 'phone_verified', p_verified, 'unchanged', TRUE);
  END IF;

  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.profiles
     SET phone_verified = p_verified, phone_verified_at = CASE WHEN p_verified THEN now() ELSE NULL END
   WHERE id = v_profile.id;

  RETURN jsonb_build_object('customer_id', v_profile.id, 'phone_verified', p_verified, 'unchanged', FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_phone_verified(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_phone_verified(UUID, BOOLEAN, TEXT) TO authenticated;
