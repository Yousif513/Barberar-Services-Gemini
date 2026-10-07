import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// Supabase no longer grants new tables to the client roles. Row-level security decides which rows a role may touch, but a
// role with no table privilege is refused before any policy is read. These tests read the catalog, so a new table, view or
// policy that forgets its privileges fails here instead of in a fresh environment.

let db;

before(async () => {
  db = await createMigratedDb();
});

// Commands that a policy describes but that the migrations withdrew from the client role on purpose.
const WITHHELD = ["inventory_products:DELETE", "inventory_suppliers:DELETE", "provider_memberships:DELETE", "provider_memberships:INSERT", "provider_memberships:UPDATE"];

// The public catalogue: relations an anonymous visitor may read at table level (rows are still limited by policy).
const ANONYMOUS_CATALOGUE = [
  "branches", "categories", "employee_availability", "employee_portfolios", "employee_services",
  "legal_agreements", "packages", "platform_settings", "provider_closures", "provider_promos", "resources", "reviews",
  "seasonal_schedules", "service_resources", "service_variants", "services", "subscription_plans",
];

describe("every policy is backed by a privilege", () => {
  it("lets signed-in users run each command a policy of theirs allows, except what was withheld on purpose", async () => {
    const rows = await sys(db, `
      select c.relname || ':' || cmd.name as item
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral (values ('r','SELECT'),('a','INSERT'),('w','UPDATE'),('d','DELETE')) as cmd(code, name) on (pol.polcmd = cmd.code or pol.polcmd = '*')
      where n.nspname = 'public' and c.relkind in ('r','p')
        and (pol.polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'authenticated') = any(pol.polroles))
        and not (has_table_privilege('authenticated', c.oid, cmd.name) or case when cmd.name = 'DELETE' then false else has_any_column_privilege('authenticated', c.oid, cmd.name) end)
      group by 1 order by 1`);
    assert.deepEqual(rows.map((r) => r.item), WITHHELD);
  });

  it("lets anonymous visitors read each table that a policy naming them covers", async () => {
    const rows = await sys(db, `
      select distinct c.relname
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p') and pol.polcmd in ('r','*')
        and (select oid from pg_roles where rolname = 'anon') = any(pol.polroles)
        and not (has_table_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('anon', c.oid, 'SELECT'))
      order by 1`);
    // message_templates carries a policy for anonymous visitors that nothing needs; it has no privilege behind it, so it grants nothing.
    assert.deepEqual(rows.map((r) => r.relname), ["message_templates"]);
  });

  it("never calls, from a policy, a function that one of the policy's roles cannot execute", async () => {
    const rows = await sys(db, `
      with pol as (
        select p.oid as poid, p.polrelid::regclass as tbl, p.polname,
               case when p.polroles = '{0}'::oid[] then array['anon','authenticated'] else (select array_agg(rolname::text) from pg_roles where oid = any(p.polroles)) end as roles
        from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public')
      select pol.tbl::text, pol.polname, r as role, f.oid::regprocedure::text as function
      from pol
      join pg_depend d on d.classid = 'pg_policy'::regclass and d.objid = pol.poid and d.refclassid = 'pg_proc'::regclass
      join pg_proc f on f.oid = d.refobjid
      cross join lateral unnest(pol.roles) r
      where f.pronamespace = 'public'::regnamespace and r in ('anon','authenticated') and not has_function_privilege(r, f.oid, 'EXECUTE')`);
    assert.deepEqual(rows, []);
  });
});

describe("client roles hold no more than they need", () => {
  it("gives anonymous visitors no write privilege on any table", async () => {
    const rows = await sys(db, `
      select c.relname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('INSERT'),('UPDATE'),('DELETE')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, p.priv) order by 1, 2`);
    assert.deepEqual(rows, []);
  });

  it("gives nobody TRUNCATE, REFERENCES or TRIGGER on a table", async () => {
    const rows = await sys(db, `
      select c.relname, r.rolname, p.priv from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'),('authenticated'),('service_role')) r(rolname)
      cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
      where n.nspname = 'public' and c.relkind in ('r','p','v','m') and has_table_privilege(r.rolname, c.oid, p.priv) order by 1, 2, 3`);
    assert.deepEqual(rows, []);
  });

  it("gives anonymous visitors table-level SELECT on exactly the public catalogue", async () => {
    const rows = await sys(db, `
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, 'SELECT') order by 1`);
    assert.deepEqual(rows.map((r) => r.relname), ANONYMOUS_CATALOGUE);
  });

  it("keeps the narrowings earlier migrations made on purpose", async () => {
    const check = async (sql) => (await sys(db, sql))[0].ok;
    assert.equal(await check(`select not has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as ok`), true, "profiles change through commands and column grants only");
    assert.equal(await check(`select has_column_privilege('authenticated', 'public.profiles', 'gender', 'UPDATE') as ok`), true);
    assert.equal(await check(`select not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as ok`), true, "a user cannot grant themselves a role");
    assert.equal(await check(`select not has_table_privilege('anon', 'public.providers', 'SELECT') and has_column_privilege('anon', 'public.providers', 'business_name_en', 'SELECT') as ok`), true, "visitors read public provider columns only");
    assert.equal(await check(`select not has_column_privilege('anon', 'public.providers', 'commission_percentage', 'SELECT') as ok`), true);
  });

  it("lets only the service role write the tables that clients may not touch at all", async () => {
    const rows = await sys(db, `
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not (has_table_privilege('service_role', c.oid, 'INSERT') and has_table_privilege('service_role', c.oid, 'UPDATE') and has_table_privilege('service_role', c.oid, 'DELETE') and has_table_privilege('service_role', c.oid, 'SELECT'))`);
    assert.deepEqual(rows, [], "the service role works on every table");
  });
});

describe("the helper keeps later migrations explicit", () => {
  it("refuses an object outside public and clients cannot call it", async () => {
    await assert.rejects(sys(db, `select public.grant_data_api_access('pg_class'::regclass)`), (error) => error.code === "22023");
    await assert.rejects(as(db, ROLES.user(SEED.customer), `select public.grant_data_api_access()`), (error) => error.code === "42501");
    await assert.rejects(as(db, ROLES.anon, `select public.grant_data_api_access()`), (error) => error.code === "42501");
  });

  it("grants a new table to signed-in users by its policies and to anonymous visitors only when asked", async () => {
    await sys(db, `create table public.zz_grants_probe (id uuid primary key default gen_random_uuid(), owner_id uuid not null, label text)`);
    await sys(db, `alter table public.zz_grants_probe enable row level security`);
    await sys(db, `create policy "own rows" on public.zz_grants_probe for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())`);
    await sys(db, `select public.grant_data_api_access('public.zz_grants_probe')`);
    const row = (await sys(db, `select has_table_privilege('authenticated','public.zz_grants_probe','INSERT') i, has_table_privilege('authenticated','public.zz_grants_probe','DELETE') d,
                                    has_table_privilege('anon','public.zz_grants_probe','SELECT') a, has_table_privilege('service_role','public.zz_grants_probe','UPDATE') s`))[0];
    assert.deepEqual(row, { i: true, d: true, a: false, s: true });
    await sys(db, `select public.grant_data_api_access('public.zz_grants_probe', true)`);
    assert.equal((await sys(db, `select has_table_privilege('anon','public.zz_grants_probe','SELECT') a`))[0].a, true);
    await sys(db, `drop table public.zz_grants_probe`);
  });
});

describe("the repaired environment works for each role", () => {
  it("lets a signed-in customer read their own profile and nobody else's", async () => {
    const stranger = ROLES.user(await createUser(db, { role: "customer" }));
    assert.deepEqual((await as(db, ROLES.user(SEED.customer), `select id from profiles`)).map((p) => p.id), [SEED.customer]);
    assert.deepEqual((await as(db, stranger, `select id from profiles`)).map((p) => p.id), [stranger.sub]);
  });

  it("refuses an anonymous visitor a table that is not part of the public catalogue", async () => {
    await assert.rejects(as(db, ROLES.anon, `select id from bookings`), (error) => error.code === "42501");
    await assert.rejects(as(db, ROLES.anon, `select id from profiles`), (error) => error.code === "42501");
    await assert.rejects(as(db, ROLES.anon, `select id from admin_audit_logs`), (error) => error.code === "42501");
  });

  it("answers an anonymous visitor on the public catalogue, including the job board policy that names a function", async () => {
    assert.ok((await as(db, ROLES.anon, `select count(*)::int n from categories`))[0].n > 0);
    assert.ok((await as(db, ROLES.anon, `select count(*)::int n from services`))[0].n >= 0);
    await assert.rejects(as(db, ROLES.anon, `select id from job_posts`), (error) => error.code === "42501");
    assert.ok((await as(db, ROLES.user(SEED.customer), `select count(*)::int n from job_posts`))[0].n >= 0);
  });
});
