-- Admin shop management: give providers a real business lifecycle status,
-- admin notes, and a last-activity stamp, plus a per-provider performance
-- rollup view. Extends the existing providers table (does NOT create a
-- duplicate shop/provider model) — the UI already treats providers as shops.
-- is_verified is kept for backward compatibility and derived from status.

-- ── 1. Provider business status + admin notes + activity ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_status') THEN
    CREATE TYPE public.provider_status AS ENUM ('pending', 'approved', 'rejected', 'suspended', 'active');
  END IF;
END $$;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS status public.provider_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

-- Backfill: previously verified providers are considered active.
UPDATE public.providers SET status = 'active'  WHERE is_verified = TRUE  AND status = 'pending';

-- Keep the legacy is_verified flag in sync with the new status so older
-- readers and RLS keep working (approved/active => verified).
CREATE OR REPLACE FUNCTION public.sync_provider_status_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_verified := (NEW.status IN ('approved', 'active'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_provider_status_verified_before_write ON public.providers;
CREATE TRIGGER sync_provider_status_verified_before_write
BEFORE INSERT OR UPDATE OF status ON public.providers
FOR EACH ROW
EXECUTE FUNCTION public.sync_provider_status_verified();

-- NOTE: status / admin_notes are admin-managed. The admin dashboard writes
-- through an authenticated admin session; the existing
-- "Admins manage own providers" + service-role policies (public.is_admin())
-- already authorize these writes. No public/anon access is granted here.

-- ── 2. Admin-facing shop performance rollup (safe aggregation) ─────────────
-- Per-provider booking/revenue/rating metrics from existing tables. bookings
-- and employees reach a provider through branches; reviews and services carry
-- provider_id directly. security_invoker => the caller's RLS on the base
-- tables applies (admins only, via is_admin() policies).
CREATE OR REPLACE VIEW public.admin_provider_performance
WITH (security_invoker = true) AS
SELECT
  p.id AS provider_id,
  p.business_name_en,
  p.business_name_ar,
  p.status,
  p.commission_percentage,
  p.last_activity_at,
  COALESCE(b.total_bookings, 0)      AS total_bookings,
  COALESCE(b.completed_bookings, 0)  AS completed_bookings,
  COALESCE(b.cancelled_bookings, 0)  AS cancelled_bookings,
  COALESCE(b.no_show_bookings, 0)    AS no_show_bookings,
  COALESCE(b.gross_revenue, 0)       AS gross_revenue,
  COALESCE(b.commission_amount, 0)   AS commission_amount,
  COALESCE(r.avg_rating, 0)          AS avg_rating,
  COALESCE(r.review_count, 0)        AS review_count,
  COALESCE(e.employee_count, 0)      AS employee_count,
  COALESCE(s.service_count, 0)       AS service_count
FROM public.providers p
LEFT JOIN (
  SELECT br.provider_id,
         COUNT(*) AS total_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'completed') AS completed_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled') AS cancelled_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'no_show')   AS no_show_bookings,
         SUM(bk.total_price)         FILTER (WHERE bk.status = 'completed') AS gross_revenue,
         SUM(bk.platform_commission) FILTER (WHERE bk.status = 'completed') AS commission_amount
  FROM public.bookings bk
  JOIN public.branches br ON br.id = bk.branch_id
  GROUP BY br.provider_id
) b ON b.provider_id = p.id
LEFT JOIN (
  SELECT rv.provider_id, AVG(rv.rating) AS avg_rating, COUNT(*) AS review_count
  FROM public.reviews rv
  GROUP BY rv.provider_id
) r ON r.provider_id = p.id
LEFT JOIN (
  SELECT br.provider_id, COUNT(*) AS employee_count
  FROM public.employees em
  JOIN public.branches br ON br.id = em.branch_id
  GROUP BY br.provider_id
) e ON e.provider_id = p.id
LEFT JOIN (
  SELECT sv.provider_id, COUNT(*) AS service_count
  FROM public.services sv
  WHERE sv.provider_id IS NOT NULL
  GROUP BY sv.provider_id
) s ON s.provider_id = p.id;

COMMENT ON VIEW public.admin_provider_performance IS
  'Per-provider (shop) booking/revenue/rating rollup for the admin dashboard. security_invoker so admin RLS on base tables applies.';
