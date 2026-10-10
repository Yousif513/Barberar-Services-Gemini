-- MONEY part 6: tap_refund_state (a pure status mapping used by the refund commands) is internal; anonymous visitors and
-- clients do not call it (the anonymous function allowlist in the DB tests stays closed).
REVOKE ALL ON FUNCTION public.tap_refund_state(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tap_refund_state(TEXT) TO service_role;
