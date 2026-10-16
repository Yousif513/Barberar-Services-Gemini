-- UXFIX (ux1-ledger-psp-tab-contradicts-reconciliation-screen): reconciliation has one truth. The Tap reconciliation
-- (tap_reconciliation_runs, run by run_tap_reconciliation and shown on /admin/reconciliation) is the source; the dashboard's
-- reconciliation card read the older ledger-only psp_reconciliation_runs and could say "never ran" while a run existed. The
-- card now reads the same runs as the reconciliation screen. psp_reconciliation_runs keeps its history; nothing is deleted.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.admin_dashboard_overview()'::regprocedure,
$from$    'latest', (SELECT jsonb_build_object('run_date', run_date, 'status', status,
                                         'discrepancy_amount_sar', discrepancy_amount_sar, 'created_at', created_at)
                 FROM psp_reconciliation_runs ORDER BY run_date DESC, created_at DESC LIMIT 1),
    'discrepant_30d', (SELECT count(*) FROM psp_reconciliation_runs
                        WHERE status = 'discrepant' AND run_date >= v_today - 30)$from$,
$to$    'latest', (SELECT jsonb_build_object('run_date', business_day, 'status', status,
                                         'open_breaks', COALESCE((counts->>'open_breaks')::int, 0), 'created_at', ran_at)
                 FROM tap_reconciliation_runs ORDER BY business_day DESC, ran_at DESC LIMIT 1),
    'discrepant_30d', (SELECT count(*) FROM tap_reconciliation_runs
                        WHERE status = 'breaks' AND business_day >= v_today - 30)$to$);
