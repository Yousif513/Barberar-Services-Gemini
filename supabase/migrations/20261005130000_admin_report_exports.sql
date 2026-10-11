-- Migration: 20261005130000_admin_report_exports.sql
-- The Reports screen showed three "READY" cards whose buttons answered "export initiated, check your downloads
-- folder" and produced nothing. Exports are now built in the browser from rows the operator can already read
-- (so row policy applies unchanged), and each file handed out is recorded here first. If this call fails, no
-- file is delivered.

CREATE OR REPLACE FUNCTION public.admin_record_export(
  p_report TEXT,
  p_from DATE,
  p_to DATE,
  p_row_count INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_report NOT IN ('payments_ledger', 'vat_summary', 'provider_settlements') THEN
    RAISE EXCEPTION 'Unknown report %', p_report USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_to - p_from > 400 THEN
    RAISE EXCEPTION 'The export period must be a valid range of at most 400 days' USING ERRCODE = '22023';
  END IF;
  IF p_row_count IS NULL OR p_row_count < 1 THEN
    RAISE EXCEPTION 'Only exports that contain rows are recorded' USING ERRCODE = '22023';
  END IF;

  PERFORM public.write_audit_log('report.exported', 'reports', NULL,
    jsonb_build_object('report', p_report, 'from', p_from, 'to', p_to, 'rows', p_row_count));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_export(TEXT, DATE, DATE, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_export(TEXT, DATE, DATE, INTEGER) TO authenticated;
