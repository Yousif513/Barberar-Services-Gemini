-- Migration: 20261005160000_report_months_in_riyadh_time.sql
-- The monthly rollups grouped with date_trunc('month', <timestamptz>), which cuts months in the database session
-- time zone (UTC on Supabase). A booking at 01:00 on the 1st in Riyadh therefore fell into the previous month, so
-- the VAT summary and provider settlement exports could misstate a ZATCA period boundary. The reports page, the
-- ledger and the provider wallet all promise Riyadh dates; the months are now cut in Asia/Riyadh (UTC+3, no daylight
-- saving). The columns, their types and the security_invoker setting are unchanged.

CREATE OR REPLACE VIEW public.monthly_vat_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', b.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date AS month_start,
    br.provider_id,
    b.branch_id,
    COUNT(b.id) AS total_bookings,
    COALESCE(SUM(b.tax_amount), 0.00) AS total_vat_collected,
    COALESCE(SUM(b.total_price), 0.00) AS total_sales
FROM public.bookings b
JOIN public.branches br ON b.branch_id = br.id
WHERE b.status = 'completed'
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.provider_settlement_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', tl.created_at AT TIME ZONE 'Asia/Riyadh')::date AS month_start,
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

CREATE OR REPLACE VIEW public.employee_earnings_summary
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', tl.created_at AT TIME ZONE 'Asia/Riyadh')::date AS month_start,
    b.employee_id,
    COUNT(tl.id) AS total_completed_bookings,
    COALESCE(SUM(tl.employee_share), 0.00) AS total_employee_earnings
FROM public.transactional_ledger tl
JOIN public.bookings b ON tl.booking_id = b.id
WHERE b.status = 'completed'
GROUP BY 1, 2;
