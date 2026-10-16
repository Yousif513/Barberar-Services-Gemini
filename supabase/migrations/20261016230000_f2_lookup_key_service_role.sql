-- F2 follow-up: the service role works on every table except the append-only audit log (data_api_grants convention, as for
-- api_key_hashes). The lookup key stays out of reach of anon and authenticated: no grant, no policy, RLS on.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.privacy_lookup_keys TO service_role;
