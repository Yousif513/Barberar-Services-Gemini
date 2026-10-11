-- Explicit Data API privileges for every table, view and sequence in public.
--
-- Supabase no longer grants new tables to anon, authenticated and service_role automatically (a project created after the
-- change, a preview branch and `supabase start` with a current CLI all start with no privileges). Row-level security
-- decides WHICH rows a role may touch, but a role with no table privilege is refused before any policy is read:
-- "permission denied for table bookings". Only the tables whose migration happened to carry its own GRANT worked, so a
-- fresh environment built from these migrations could not read bookings, profiles or most other tables.
--
-- This migration states the privileges explicitly:
--   * authenticated receives, per table, the commands that one of its policies allows, plus SELECT (row-level security
--     still filters it). A table with no policy for authenticated gets nothing.
--   * a privilege that the migrations deliberately limited to certain columns is not widened to the whole table
--     (profiles.UPDATE; SELECT on providers, employees and payment_methods for anonymous visitors).
--   * anon receives SELECT on a short, named list of public catalogue relations and nothing else. A policy that merely has no
--     TO clause (and checks auth.uid()) does not make a table public.
--   * service_role (Edge Functions) receives SELECT, INSERT, UPDATE, DELETE on tables.
--   * views are readable by signed-in users and the service role; sequences are usable by both.
--   * nobody holds TRUNCATE, REFERENCES or TRIGGER on a table.
-- It adds privileges, and withdraws only what is named below.
--
-- A later migration that creates a table calls the helper for that one table and then revokes whatever the table must not offer:
--   SELECT public.grant_data_api_access('public.my_new_table');               -- signed-in users and the service role
--   SELECT public.grant_data_api_access('public.my_public_table', TRUE);      -- ... and anonymous SELECT
-- The no-argument form repairs every table and is used once, here.

CREATE OR REPLACE FUNCTION public.grant_data_api_access(p_relation REGCLASS DEFAULT NULL, p_anonymous_read BOOLEAN DEFAULT FALSE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_grants TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_relation IS NOT NULL AND (SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.oid = p_relation) IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'Data API privileges are only managed for the public schema' USING ERRCODE = '22023';
  END IF;

  -- Tables: what a signed-in user may do is what the policies written for that role describe.
  FOR r IN
    SELECT c.oid AS rel_oid, c.oid::regclass AS rel,
           bool_or(pol.polcmd IN ('a', '*')) AS wants_insert,
           bool_or(pol.polcmd IN ('w', '*')) AS wants_update,
           bool_or(pol.polcmd IN ('d', '*')) AS wants_delete
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND (p_relation IS NULL OR c.oid = p_relation)
       AND (pol.polroles = '{0}'::oid[] OR (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') = ANY (pol.polroles))
     GROUP BY c.oid
  LOOP
    v_grants := NULL;
    -- A privilege held only at column level was limited on purpose; leave it that way.
    IF NOT (has_any_column_privilege('authenticated', r.rel_oid, 'SELECT') AND NOT has_table_privilege('authenticated', r.rel_oid, 'SELECT')) THEN
      v_grants := concat_ws(', ', v_grants, 'SELECT');
    END IF;
    IF r.wants_insert AND NOT (has_any_column_privilege('authenticated', r.rel_oid, 'INSERT') AND NOT has_table_privilege('authenticated', r.rel_oid, 'INSERT')) THEN
      v_grants := concat_ws(', ', v_grants, 'INSERT');
    END IF;
    IF r.wants_update AND NOT (has_any_column_privilege('authenticated', r.rel_oid, 'UPDATE') AND NOT has_table_privilege('authenticated', r.rel_oid, 'UPDATE')) THEN
      v_grants := concat_ws(', ', v_grants, 'UPDATE');
    END IF;
    IF r.wants_delete THEN
      v_grants := concat_ws(', ', v_grants, 'DELETE');
    END IF;
    IF v_grants IS NOT NULL THEN
      EXECUTE format('GRANT %s ON %s TO authenticated', v_grants, r.rel);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Server-side code (Edge Functions) runs as service_role, which bypasses row-level security but not table privileges.
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND (p_relation IS NULL OR c.oid = p_relation)
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO service_role', r.rel);
    v_count := v_count + 1;
  END LOOP;

  -- Views added since the console run with the caller's rights (security_invoker), so the tables underneath still decide.
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') AND (p_relation IS NULL OR c.oid = p_relation)
  LOOP
    EXECUTE format('GRANT SELECT ON %s TO authenticated, service_role', r.rel);
    v_count := v_count + 1;
  END LOOP;

  -- Sequences behind serial or identity columns and invoice numbering.
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S' AND (p_relation IS NULL OR c.oid = p_relation)
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', r.rel);
    v_count := v_count + 1;
  END LOOP;

  IF p_anonymous_read AND p_relation IS NOT NULL THEN
    EXECUTE format('GRANT SELECT ON %s TO anon', p_relation);
    v_count := v_count + 1;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_data_api_access(REGCLASS, BOOLEAN) FROM PUBLIC, anon, authenticated;

SELECT public.grant_data_api_access();

-- What an anonymous visitor can read: the public catalogue behind the marketing pages, the provider page and the booking flow.
-- Row-level security still limits the rows (active, verified, published). Providers, employees and payment methods are open
-- to anonymous visitors by column, as an earlier migration set them, and are not listed here.
GRANT SELECT ON
  public.accepted_payment_methods, public.branches, public.categories, public.employee_availability, public.employee_portfolios,
  public.employee_services, public.legal_agreements, public.packages, public.platform_settings, public.provider_closures,
  public.provider_promos, public.resources, public.reviews, public.seasonal_schedules, public.service_resources,
  public.service_variants, public.services, public.subscription_plans
TO anon;

-- Supabase's default for a table also hands anon, authenticated and service_role TRUNCATE, REFERENCES and TRIGGER. The Data
-- API never issues them and no client role needs them: TRUNCATE is not subject to row-level security at all.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;

-- Privileges that earlier migrations withdrew on purpose and that the policies alone would bring back.
-- Inventory records are never deleted by a client (stock history must stay); membership rows are written only by commands.
REVOKE DELETE ON public.inventory_products, public.inventory_suppliers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.provider_memberships FROM anon, authenticated;

-- A policy that every role evaluates must not call a function that one of those roles cannot execute: the query then fails
-- with "permission denied for function" instead of returning no rows. This policy is for signed-in users only.
DROP POLICY IF EXISTS "Providers select posts they bid on" ON public.job_posts;
CREATE POLICY "Providers select posts they bid on" ON public.job_posts
  FOR SELECT TO authenticated USING (public.caller_has_bid_on_job(id));
