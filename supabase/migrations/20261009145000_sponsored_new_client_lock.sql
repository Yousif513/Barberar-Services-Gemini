-- M-13 of docs/reviews/2026-10-08-security-money.md.
--
-- "New client" is a property of (provider, customer), but the lock that serialises sponsored accruals is on the CAMPAIGN row. A customer who clicked
-- two campaigns of one provider and whose two bookings complete at the same moment could be accrued twice (each transaction holds a different
-- campaign lock and sees no other completed booking). The accrual now also takes an advisory lock on (provider, customer) before it decides.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

SELECT pg_temp.patch_function('public.sponsored_attribute_completed_booking()'::regprocedure,
$from$  v_new := NOT EXISTS ($from$,
$to$  PERFORM pg_advisory_xact_lock(hashtextextended('sponsored-new-client:' || v_provider::text || ':' || NEW.customer_id::text, 0));
  v_new := NOT EXISTS ($to$);
