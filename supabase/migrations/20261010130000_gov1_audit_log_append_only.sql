-- GOV-1 part 4: the administrator audit log is append-only and kept 5 years (Q4 items 5 and 6, Q6).
--
--   * No role can update or delete admin_audit_logs rows: the privileges are revoked from every client role and the service
--     role, and a trigger refuses UPDATE, DELETE and TRUNCATE for everyone else too (the table owner included).
--   * The only exception is purge_expired_audit_logs(), which deletes rows older than 5 years and records that it ran.
--     It is NOT scheduled by this migration: the owner decides when the retention job starts (pg_cron or an Edge Function
--     running as service_role). The 5-year period is the business choice adopted in Q4.
--   * The actor reference stops being a foreign key: deleting a profile (PDPL erasure) used to rewrite actor_id to NULL in old
--     audit rows, which an append-only log cannot allow. The id stays as an identifier, not a copy of personal data.

ALTER TABLE public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_id_fkey;

REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_logs FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('primora.audit_retention_purge', true) = 'on'
     AND OLD.created_at < now() - INTERVAL '5 years' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'The audit log is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_audit_log_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON public.admin_audit_logs;
CREATE TRIGGER trg_audit_log_append_only BEFORE UPDATE OR DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.guard_audit_log_append_only();
DROP TRIGGER IF EXISTS trg_audit_log_no_truncate ON public.admin_audit_logs;
CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON public.admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_audit_log_append_only();

CREATE OR REPLACE FUNCTION public.purge_expired_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'The audit retention purge runs only as a server job' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('primora.audit_retention_purge', 'on', true);
  DELETE FROM public.admin_audit_logs WHERE created_at < now() - INTERVAL '5 years';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('primora.audit_retention_purge', '', true);
  INSERT INTO public.admin_audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (NULL, 'audit.retention_purged', 'admin_audit_logs', NULL,
          jsonb_build_object('deleted', v_count, 'older_than', now() - INTERVAL '5 years', 'actor_role', 'service_role'));
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_audit_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_audit_logs() TO service_role;
