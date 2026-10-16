-- FINAL-7 follow-up: the purge run log carries the console write audit trigger like every other base table (the full test run
-- found it missing: qa_defect_fixes "has the audit trigger on every base table except the audit logs themselves").
SELECT public.attach_admin_audit_trigger('public.privacy_retention_purge_runs');
