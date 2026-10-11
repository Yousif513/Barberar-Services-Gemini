-- PRIVFIX-5: follow-ups to PRIVFIX-1 found by the full test run.
--   * A money record of a customer whose account is removed outside the engine (an Auth admin deletion) is kept with its customer
--     link cleared by the foreign key (ON DELETE SET NULL), never blocked and never deleted (review M3). Only that foreign-key
--     action, or a recorded erasure run, may clear the link; a direct UPDATE still cannot.
--   * The worker table privacy_erasure_pending is reachable by the service role like every other working table.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.guard_money_append_only()'::regprocedure,
$from$    IF v_col = 'customer_id' AND v_new->v_col = 'null'::jsonb AND public.privacy_erasure_active() THEN$from$,
$to$    IF v_col = 'customer_id' AND v_new->v_col = 'null'::jsonb
       AND (public.privacy_erasure_active() OR (v_mode = 'no_delete_allow_cascade' AND pg_trigger_depth() > 1)) THEN$to$);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.privacy_erasure_pending TO service_role;
