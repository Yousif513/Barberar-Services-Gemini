import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// Read another branch's migration chain without checking out or modifying that branch.
const ref = process.argv[2] || 'origin/claude-code';
execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(p => p.endsWith('.sql')).sort();
const db = new PGlite({ extensions: { btree_gist, pgcrypto, uuid_ossp } });
try {
  await db.exec(`
    CREATE SCHEMA extensions;
    CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE EXTENSION btree_gist WITH SCHEMA extensions;
    CREATE ROLE anon NOLOGIN NOINHERIT; CREATE ROLE authenticated NOLOGIN NOINHERIT;
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    GRANT anon,authenticated,service_role TO postgres;
    GRANT USAGE ON SCHEMA public,extensions TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(instance_id uuid,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aud text,role text,email text,phone text,
      encrypted_password text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,raw_app_meta_data jsonb DEFAULT '{}',
      raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
      confirmation_token text,email_change text,email_change_token_new text,recovery_token text);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt()->>'sub','')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
    -- The Auth tables the governance commands touch (MFA factors and sessions), as in supabase/tests/db/harness.mjs.
    CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,friendly_name text,
      factor_type text NOT NULL DEFAULT 'totp',status text NOT NULL DEFAULT 'verified',created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),not_after timestamptz);
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
    ALTER DATABASE postgres SET search_path TO "$user",public,extensions;
    SET search_path TO "$user",public,extensions;
  `);
  const additions = ['20261005060000_enterprise_inventory_and_supply.sql', '20261005070000_inventory_controls_and_chain_operations.sql'];
  const migrations = paths.map(path => ({ path, sql: execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }) }));
  // Once the P3 migrations are part of the ref's own chain (they are on claude-code and master now), they are not applied twice.
  for (const name of additions.filter(name => !paths.some(path => path.endsWith(`/${name}`)))) migrations.push({ path: name, sql: readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8') });
  for (const migration of migrations) {
    try { await db.exec('BEGIN'); await db.exec(migration.sql); await db.exec('COMMIT'); }
    catch (error) { await db.exec('ROLLBACK'); throw new Error(`${migration.path}: ${error.message}`); }
  }
  console.log(`Applied ${paths.length} migrations from ${ref} and ${additions.length} P3 migrations in isolated Postgres.`);
  const { default: assert } = await import('node:assert/strict');
  const owner = '11111111-1111-4111-8111-111111111111';
  const provider = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  const branch = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  const actor = crypto.randomUUID(); const supplier = crypto.randomUUID(); const product = crypto.randomUUID();
  await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await db.query('insert into auth.users(id,email) values($1,$2)', [actor, 'p3-manager@fixture.local']);
  await db.query(`update profiles set role='provider_employee' where id=$1`, [actor]);
  await db.query(`insert into employees(branch_id,profile_id,name_en,name_ar) values($1,$2,'P3 Manager','مدير')`, [branch,actor]);
  const as = (user, sql, args = []) => db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated');
    await tx.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ role: 'authenticated', sub: user })]);
    return (await tx.query(sql,args)).rows;
  });
  await as(owner, `insert into inventory_suppliers(id,provider_id,name) values($1,$2,'P3 supplier')`, [supplier,provider]);
  await as(owner, `insert into inventory_products(id,provider_id,supplier_id,name_en,name_ar,unit_cost_sar) values($1,$2,$3,'P3 product','منتج',10)`, [product,provider,supplier]);
  const membership = (await as(owner, `select save_provider_operation_membership($1,$2,$3,'branch_manager','{"inventory":true,"bookings":true}',true,null,'Compatibility test') as result`, [provider,actor,branch]))[0].result.id;
  const request = crypto.randomUUID();
  const adjust = () => as(actor, `select adjust_branch_inventory_stock($1,$2,10,'Compatibility count','adjustment',$3)`, [branch,product,request]);
  await adjust(); await adjust();
  assert.equal(Number((await db.query('select quantity_on_hand from branch_inventory_stock where product_id=$1', [product])).rows[0].quantity_on_hand),10);
  await assert.rejects(as(actor, `select get_admin_supply_overview()`), /Administrator/);
  await as(owner, `select save_provider_operation_membership($1,$2,$3,'branch_manager','{}',true,$4,'Revoke test access')`, [provider,actor,branch,membership]);
  await assert.rejects(adjust(), /Forbidden/);
  console.log('Full-chain owner writes, scoped delegation, duplicate retry and revoked-permission denial passed.');
} finally { await db.close(); }
