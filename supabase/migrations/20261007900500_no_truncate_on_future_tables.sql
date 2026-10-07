-- No client role holds TRUNCATE, REFERENCES or TRIGGER on any table, including the ones created after the explicit-grants migration.
--
-- 20261006220000 revoked these from every table that existed then. Supabase hands them out again by default privilege to each new
-- table (anon, authenticated and service_role get TRUNCATE, REFERENCES and TRIGGER), and TRUNCATE is not limited by row-level
-- security. The real-stack smoke test (scripts/smoke-local-supabase.mjs) found tables created later still holding them. This
-- removes the default for future tables and revokes the three from every table again.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated, service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
