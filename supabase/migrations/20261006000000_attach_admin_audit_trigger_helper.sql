-- A migration that adds tables attaches the administrator audit trigger to them with one call.
--
-- The trigger was attached to every table that existed when it was introduced (20261005170000). Tables created
-- afterwards do not get it automatically, and two catalog tests (security_hardening, qa_defect_fixes) fail when a
-- base table in public lacks it. Calling this helper at the end of a migration keeps that rule in one place.
--
--   SELECT public.attach_admin_audit_trigger('public.my_new_table');
--
-- It is not callable from a client session: it only runs inside a migration, as the table owner.

CREATE OR REPLACE FUNCTION public.attach_admin_audit_trigger(p_table REGCLASS)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_schema TEXT;
  v_name TEXT;
BEGIN
  SELECT n.nspname, c.relname
    INTO v_schema, v_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.oid = p_table;

  IF v_schema IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'The administrator audit trigger is only attached to tables in the public schema' USING ERRCODE = '22023';
  END IF;

  -- The two logs are the destination of the trigger, not a subject of it.
  IF v_name IN ('admin_audit_logs', 'integration_audit_log') THEN
    RETURN;
  END IF;

  EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_admin_write ON public.%I', v_name);
  EXECUTE format(
    'CREATE TRIGGER trg_audit_admin_write AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_admin_write()',
    v_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_admin_audit_trigger(REGCLASS) FROM PUBLIC, anon, authenticated;
