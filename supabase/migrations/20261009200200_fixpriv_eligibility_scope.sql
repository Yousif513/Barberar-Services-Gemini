-- P-03 (privacy review 2026-10-08): check_customer_booking_eligibility(provider, customer) let any staff member of ANY provider pass a customer
-- uuid they had never dealt with and read that customer's platform-wide no-show strikes and prepayment flag.
-- A staff caller now gets an answer only for a customer who has a booking, a waitlist entry, a conversation or a block row with THAT provider;
-- anyone else is refused with the same "Not authorized" a stranger already got. Staff no longer receive the platform-wide strike COUNT (they get
-- the block state and the prepayment flag the booking flow needs); the customer and administrators still see it.
-- Blocking now needs the same relationship, otherwise an owner could create the relationship by blocking an arbitrary uuid.

DROP FUNCTION IF EXISTS pg_temp.patch_function(regprocedure, text, text);
CREATE OR REPLACE FUNCTION pg_temp.patch_function(p_sig regprocedure, p_from text, p_to text) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE v_def text := replace(pg_get_functiondef(p_sig), E'\r\n', E'\n'); -- a checkout with Windows line endings stores them in function bodies
BEGIN
  p_from := replace(p_from, E'\r\n', E'\n'); p_to := replace(p_to, E'\r\n', E'\n'); -- the migration file itself may have been checked out with CRLF
  IF position(p_from IN v_def) = 0 THEN RAISE EXCEPTION 'patch_function: pattern not found in %', p_sig; END IF;
  EXECUTE replace(v_def, p_from, p_to);
END $patch$;

CREATE OR REPLACE FUNCTION public.customer_has_provider_relationship(p_provider_id UUID, p_customer_id UUID, p_include_blocks BOOLEAN DEFAULT TRUE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_provider_id IS NOT NULL AND p_customer_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.bookings b JOIN public.branches br ON br.id = b.branch_id
            WHERE br.provider_id = p_provider_id AND b.customer_id = p_customer_id)
    OR EXISTS (SELECT 1 FROM public.waitlists w JOIN public.branches br ON br.id = w.branch_id
               WHERE br.provider_id = p_provider_id AND w.customer_id = p_customer_id)
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.provider_id = p_provider_id AND c.customer_id = p_customer_id)
    OR (p_include_blocks AND EXISTS (SELECT 1 FROM public.provider_customer_blocks k WHERE k.provider_id = p_provider_id AND k.customer_id = p_customer_id))
  );
$$;
REVOKE ALL ON FUNCTION public.customer_has_provider_relationship(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_has_provider_relationship(UUID, UUID, BOOLEAN) TO service_role;

SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
$from$  IF NOT v_is_staff AND (v_caller IS NULL OR v_caller <> p_customer_id) THEN$from$,
$to$  IF v_is_staff AND v_caller IS DISTINCT FROM p_customer_id
     AND NOT (public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role')
     AND NOT public.customer_has_provider_relationship(p_provider_id, p_customer_id) THEN
    RAISE EXCEPTION 'Not authorized to view this customer''s booking eligibility' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_staff AND (v_caller IS NULL OR v_caller <> p_customer_id) THEN$to$);

SELECT pg_temp.patch_function('public.check_customer_booking_eligibility(uuid, uuid)'::regprocedure,
$from$    'no_show_strikes', v_strikes,$from$,
$to$    'no_show_strikes', CASE WHEN v_caller = p_customer_id OR public.is_admin() OR COALESCE(auth.jwt()->>'role', '') = 'service_role' THEN v_strikes ELSE NULL END,$to$);

-- A block is made only against a customer who has dealt with this provider (blocks are excluded from the test, they are what is being made).
SELECT pg_temp.patch_function('public.toggle_customer_block(uuid, uuid, text, boolean)'::regprocedure,
$from$  IF p_block THEN
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN$from$,
$to$  IF p_block AND NOT public.is_admin() AND NOT public.customer_has_provider_relationship(p_provider_id, p_customer_id, FALSE) THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_block THEN
    IF NULLIF(TRIM(COALESCE(p_reason, '')), '') IS NULL THEN$to$);
