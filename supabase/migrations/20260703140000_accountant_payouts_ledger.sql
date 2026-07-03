-- Migration to add contact info columns and accountant helper rollup views
-- Date: 2026-07-03

-- 1. Add contact info columns to providers if they do not exist
ALTER TABLE public.providers
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 2. Create monthly_vat_summary view
CREATE OR REPLACE VIEW public.monthly_vat_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', b.scheduled_at)::date AS month_start,
    br.provider_id,
    b.branch_id,
    COUNT(b.id) AS total_bookings,
    COALESCE(SUM(b.tax_amount), 0.00) AS total_vat_collected,
    COALESCE(SUM(b.total_price), 0.00) AS total_sales
FROM public.bookings b
JOIN public.branches br ON b.branch_id = br.id
WHERE b.status = 'completed'
GROUP BY 1, 2, 3;

-- 3. Create provider_settlement_summary view
CREATE OR REPLACE VIEW public.provider_settlement_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', tl.created_at)::date AS month_start,
    br.provider_id,
    COUNT(tl.id) AS total_transactions,
    COALESCE(SUM(tl.total_captured), 0.00) AS gross_captured_volume,
    COALESCE(SUM(tl.platform_share), 0.00) AS platform_share_collected,
    COALESCE(SUM(tl.provider_share), 0.00) AS provider_share_expected,
    COALESCE(SUM(CASE WHEN tl.payout_status = 'released' THEN tl.provider_share ELSE 0.00 END), 0.00) AS provider_share_released
FROM public.transactional_ledger tl
JOIN public.bookings b ON tl.booking_id = b.id
JOIN public.branches br ON b.branch_id = br.id
GROUP BY 1, 2;

-- 4. Create employee_earnings_summary view
CREATE OR REPLACE VIEW public.employee_earnings_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', tl.created_at)::date AS month_start,
    b.employee_id,
    COUNT(tl.id) AS total_completed_bookings,
    COALESCE(SUM(tl.employee_share), 0.00) AS total_employee_earnings
FROM public.transactional_ledger tl
JOIN public.bookings b ON tl.booking_id = b.id
WHERE b.status = 'completed'
GROUP BY 1, 2;

-- 5. Enable grants for authenticated users (RLS and policies don't directly apply to SQL views unless security_invoker is set, but views are readable by default if granted)
GRANT SELECT ON public.monthly_vat_summary TO authenticated;
GRANT SELECT ON public.provider_settlement_summary TO authenticated;
GRANT SELECT ON public.employee_earnings_summary TO authenticated;
