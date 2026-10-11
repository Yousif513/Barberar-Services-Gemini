-- Migration: 20261005120000_admin_provider_operations.sql
-- Provider management showed figures nobody recorded: every employee's bookings, earnings, rating, reviews,
-- repeat clients and utilization came from a hash of the employee id, and per-shop commission was revenue x
-- providers.commission_percentage although fees follow fee_rules. This migration gives the screen real
-- sources and makes provider status changes a command with a recorded reason:
--   * admins can read every employee (inactive ones were invisible to them);
--   * admin_branch_performance / admin_employee_performance: per-branch and per-employee booking, revenue,
--     commission, earnings, review and repeat-client figures computed from bookings, ledger and reviews;
--   * admin_set_provider_status: the only operator path that changes a provider's status.

DROP POLICY IF EXISTS "Admins read employees" ON public.employees;
CREATE POLICY "Admins read employees"
  ON public.employees FOR SELECT TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 1. Branch figures
-- ---------------------------------------------------------------------------
-- cancelled_bookings leaves out holds the system released when payment never arrived: nobody cancelled
-- those. Ratings count published reviews only, the same rule marketplace search applies. rating_sum lets a
-- caller combine branches into an exact weighted average.
CREATE OR REPLACE VIEW public.admin_branch_performance
WITH (security_invoker = true) AS
SELECT
  br.id AS branch_id,
  br.provider_id,
  COALESCE(b.total_bookings, 0)     AS total_bookings,
  COALESCE(b.completed_bookings, 0) AS completed_bookings,
  COALESCE(b.cancelled_bookings, 0) AS cancelled_bookings,
  COALESCE(b.no_show_bookings, 0)   AS no_show_bookings,
  COALESCE(b.gross_revenue, 0)      AS gross_revenue,
  COALESCE(b.commission_amount, 0)  AS commission_amount,
  COALESCE(b.revenue_30d, 0)        AS revenue_30d,
  COALESCE(r.review_count, 0)       AS review_count,
  COALESCE(r.rating_sum, 0)         AS rating_sum
FROM public.branches br
LEFT JOIN (
  SELECT bk.branch_id,
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'completed') AS completed_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled' AND bk.cancelled_by IS DISTINCT FROM 'system') AS cancelled_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'no_show') AS no_show_bookings,
         SUM(bk.total_price) FILTER (WHERE bk.status = 'completed') AS gross_revenue,
         SUM(bk.platform_commission) FILTER (WHERE bk.status = 'completed') AS commission_amount,
         SUM(bk.total_price) FILTER (WHERE bk.status = 'completed' AND bk.scheduled_at >= now() - interval '30 days') AS revenue_30d
  FROM public.bookings bk
  GROUP BY bk.branch_id
) b ON b.branch_id = br.id
LEFT JOIN (
  SELECT bk.branch_id, COUNT(*) AS review_count, SUM(rv.rating) AS rating_sum
  FROM public.reviews rv
  JOIN public.bookings bk ON bk.id = rv.booking_id
  WHERE COALESCE(rv.moderation_status, 'published') = 'published'
  GROUP BY bk.branch_id
) r ON r.branch_id = br.id;

-- ---------------------------------------------------------------------------
-- 2. Employee figures
-- ---------------------------------------------------------------------------
-- employee_earnings is what the ledger credited to the employee (tips included) for completed bookings.
-- A repeat client is someone with two or more completed visits to the employee; walk-ins without any
-- client record cannot be recognised again and are not counted.
CREATE OR REPLACE VIEW public.admin_employee_performance
WITH (security_invoker = true) AS
SELECT
  e.id AS employee_id,
  e.branch_id,
  br.provider_id,
  COALESCE(b.completed_bookings, 0) AS completed_bookings,
  COALESCE(b.cancelled_bookings, 0) AS cancelled_bookings,
  COALESCE(b.no_show_bookings, 0)   AS no_show_bookings,
  COALESCE(b.gross_revenue, 0)      AS gross_revenue,
  COALESCE(b.commission_amount, 0)  AS commission_amount,
  COALESCE(l.employee_earnings, 0)  AS employee_earnings,
  COALESCE(r.review_count, 0)       AS review_count,
  COALESCE(r.rating_sum, 0)         AS rating_sum,
  COALESCE(c.repeat_customers, 0)   AS repeat_customers
FROM public.employees e
JOIN public.branches br ON br.id = e.branch_id
LEFT JOIN (
  SELECT bk.employee_id,
         COUNT(*) FILTER (WHERE bk.status = 'completed') AS completed_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled' AND bk.cancelled_by IS DISTINCT FROM 'system') AS cancelled_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'no_show') AS no_show_bookings,
         SUM(bk.total_price) FILTER (WHERE bk.status = 'completed') AS gross_revenue,
         SUM(bk.platform_commission) FILTER (WHERE bk.status = 'completed') AS commission_amount
  FROM public.bookings bk
  WHERE bk.employee_id IS NOT NULL
  GROUP BY bk.employee_id
) b ON b.employee_id = e.id
LEFT JOIN (
  SELECT bk.employee_id, SUM(tl.employee_share) AS employee_earnings
  FROM public.transactional_ledger tl
  JOIN public.bookings bk ON bk.id = tl.booking_id
  WHERE bk.status = 'completed' AND bk.employee_id IS NOT NULL
  GROUP BY bk.employee_id
) l ON l.employee_id = e.id
LEFT JOIN (
  SELECT rv.employee_id, COUNT(*) AS review_count, SUM(rv.rating) AS rating_sum
  FROM public.reviews rv
  WHERE rv.employee_id IS NOT NULL AND COALESCE(rv.moderation_status, 'published') = 'published'
  GROUP BY rv.employee_id
) r ON r.employee_id = e.id
LEFT JOIN (
  SELECT x.employee_id, COUNT(*) AS repeat_customers
  FROM (
    SELECT bk.employee_id, COALESCE(bk.customer_id::text, bk.client_profile_id::text) AS client_key
    FROM public.bookings bk
    WHERE bk.status = 'completed' AND bk.employee_id IS NOT NULL
      AND COALESCE(bk.customer_id::text, bk.client_profile_id::text) IS NOT NULL
    GROUP BY bk.employee_id, COALESCE(bk.customer_id::text, bk.client_profile_id::text)
    HAVING COUNT(*) > 1
  ) x
  GROUP BY x.employee_id
) c ON c.employee_id = e.id;

-- Read-only for signed-in users (their own RLS still decides which rows exist); no other privilege is left
-- over from the default grants a new view receives in the public schema.
REVOKE ALL ON public.admin_branch_performance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_employee_performance FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_branch_performance TO authenticated;
GRANT SELECT ON public.admin_employee_performance TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Provider status as a command
-- ---------------------------------------------------------------------------
-- A provider is visible and bookable exactly when status is 'approved' or 'active' (the
-- sync_provider_status_verified trigger derives is_verified from it), so the moves an operator can make are
-- the ones that change that: approve, reject, suspend, reactivate and reopen. Existing bookings are not
-- touched; the response says how many are still ahead so the operator can review them.
CREATE OR REPLACE FUNCTION public.admin_set_provider_status(
  p_provider_id UUID,
  p_status public.provider_status,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.providers;
  v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
  v_upcoming BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_provider FROM public.providers WHERE id = p_provider_id FOR UPDATE;
  IF v_provider.id IS NULL THEN
    RAISE EXCEPTION 'Provider not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*) INTO v_upcoming
  FROM public.bookings bk
  JOIN public.branches br ON br.id = bk.branch_id
  WHERE br.provider_id = v_provider.id
    AND bk.status IN ('confirmed', 'pending_payment')
    AND bk.scheduled_at > now();

  -- Repeating the decision that is already in force is a safe retry.
  IF v_provider.status = p_status THEN
    RETURN jsonb_build_object('provider_id', v_provider.id, 'status', v_provider.status, 'unchanged', TRUE,
                              'upcoming_bookings', v_upcoming);
  END IF;

  IF NOT (
    (v_provider.status = 'pending'   AND p_status IN ('active', 'rejected')) OR
    (v_provider.status = 'rejected'  AND p_status IN ('pending', 'active')) OR
    (v_provider.status IN ('approved', 'active') AND p_status = 'suspended') OR
    (v_provider.status = 'suspended' AND p_status = 'active')
  ) THEN
    RAISE EXCEPTION 'A % provider cannot move to %', v_provider.status, p_status USING ERRCODE = '22023';
  END IF;

  -- The row-level audit trigger records the change (status and the derived is_verified) with this reason.
  PERFORM set_config('primora.audit_reason', v_reason, true);
  UPDATE public.providers SET status = p_status, last_activity_at = now() WHERE id = v_provider.id;

  RETURN jsonb_build_object('provider_id', v_provider.id, 'status', p_status, 'unchanged', FALSE,
                            'upcoming_bookings', v_upcoming);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_provider_status(UUID, public.provider_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_provider_status(UUID, public.provider_status, TEXT) TO authenticated;
