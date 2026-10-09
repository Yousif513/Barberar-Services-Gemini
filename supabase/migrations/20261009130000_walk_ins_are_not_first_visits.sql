-- M-08 and M-14 of docs/reviews/2026-10-08-security-money.md.
--
-- M-08. The marketplace commission is charged on a customer's first confirmed or completed visit to a provider. A provider's staff can create
-- a counter booking (create_walk_in_booking) at any price, including 0, linked to a registered customer by verified phone, and that booking
-- counted as the customer's "first visit": the customer's later real marketplace booking was then a repeat visit with no commission. A walk-in
-- (source walk_in) and a booking with no value (total_price = 0) are no longer visits that use up the first-visit rule.
--
-- M-14. For the same reason a counter walk-in is not a sponsored acquisition: it is neither attributed to a sponsored click nor does it make
-- the customer "not new" for a real booking made after the click.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n');
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n');
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

-- M-08
SELECT pg_temp.patch_function(
  (SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'booking_create_internal'),
$from$      AND br.provider_id = v_provider_id
      AND b.status IN ('confirmed', 'completed')
  ) INTO v_first_visit;$from$,
$to$      AND br.provider_id = v_provider_id
      AND b.status IN ('confirmed', 'completed')
      AND COALESCE(b.source, 'marketplace') <> 'walk_in' AND b.total_price > 0
  ) INTO v_first_visit;$to$);

SELECT pg_temp.patch_function('public.handle_booking_first_visit_detection()'::regprocedure,
$from$        AND b.status IN ('confirmed', 'completed')
    );$from$,
$to$        AND b.status IN ('confirmed', 'completed')
        AND COALESCE(b.source, 'marketplace') <> 'walk_in' AND b.total_price > 0
    );$to$);

-- M-14
SELECT pg_temp.patch_function('public.sponsored_attribute_completed_booking()'::regprocedure,
$from$  IF NEW.customer_id IS NULL OR NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN$from$,
$to$  IF NEW.customer_id IS NULL OR COALESCE(NEW.source, 'marketplace') = 'walk_in' OR NOT COALESCE((v_cfg ->> 'configured')::boolean, FALSE) THEN$to$);

SELECT pg_temp.patch_function('public.sponsored_attribute_completed_booking()'::regprocedure,
$from$AND b2.status = 'completed' AND b2.id <> NEW.id);$from$,
$to$AND b2.status = 'completed' AND b2.id <> NEW.id
       AND COALESCE(b2.source, 'marketplace') <> 'walk_in' AND b2.total_price > 0);$to$);
