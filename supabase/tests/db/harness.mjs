// Database test harness: a Supabase-shaped Postgres (PGlite) with every migration applied.
// Mirrors the Supabase details that matter for authorization: extensions live in the
// "extensions" schema, anon/authenticated/service_role exist, functions are executable by default
// (as on Supabase), and auth.uid()/auth.jwt() read request.jwt.claims.
// Tables, views and sequences are NOT granted to the client roles by default: current Supabase
// projects start with no Data API privileges, so every table must carry explicit grants
// (see 20261006220000_explicit_data_api_grants.sql). Granting them here would hide a missing grant.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = resolve(here, "../../migrations");

const BOOTSTRAP = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT anon, authenticated, service_role TO postgres;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aud text, role text,
  email text, phone text, encrypted_password text, email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb, raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $f$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT NULLIF(auth.jwt()->>'sub', '')::uuid $f$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $f$
  SELECT auth.jwt()->>'role' $f$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

// Applies every migration in its own transaction, as `supabase db push` does, and stops at
// the first failure so a broken chain is reported exactly as the CLI would report it.
export async function createMigratedDb() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto, uuid_ossp } });
  await db.exec(BOOTSTRAP);
  await db.exec(`ALTER DATABASE postgres SET search_path TO "$user", public, extensions; SET search_path TO "$user", public, extensions;`);
  // A hosted Supabase session runs in UTC. The tests must too, so a time of day compared in the session time zone instead of
  // Asia/Riyadh fails here the way it fails in production (it used to pass on a developer machine set to UTC+3).
  await db.exec(`ALTER DATABASE postgres SET timezone TO 'UTC'; SET TIME ZONE 'UTC';`);
  for (const m of migrationFiles()) {
    try {
      await db.exec("BEGIN;");
      await db.exec(m.sql);
      await db.exec("COMMIT;");
    } catch (error) {
      await db.exec("ROLLBACK;").catch(() => {});
      throw new Error(`Migration ${m.name} failed: ${error.message}`);
    }
  }
  return db;
}

// Runs SQL inside a transaction as a given Supabase role with JWT claims.
export async function as(db, user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${user.role}`);
    const claims = { role: user.role };
    if (user.sub) claims.sub = user.sub;
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return (await tx.query(sql, params)).rows;
  });
}

// Runs SQL as the database owner with service_role claims (fixture setup only).
export async function sys(db, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    return (await tx.query(sql, params)).rows;
  });
}

export const ROLES = {
  anon: { sub: null, role: "anon" },
  service: { sub: null, role: "service_role" },
  user: (sub) => ({ sub, role: "authenticated" }),
};

// Fixture ids from the demo seed migration (20260704082805_live_demo_seed_messages.sql).
export const SEED = {
  owner1: "11111111-1111-4111-8111-111111111111",
  owner2: "22222222-2222-4222-8222-222222222222",
  customer: "44444444-4444-4444-8444-444444444444",
  provider1: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  provider2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  branch1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  employee1: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  employee2: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
};

let counter = 0;
export async function createUser(db, { role = "customer", phone = null, verified = false } = {}) {
  counter += 1;
  const id = `c0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  await sys(db, `insert into auth.users (id, email) values ($1, $2)`, [id, `user${counter}@test.local`]);
  await sys(db, `update profiles set role = $2::user_role, phone_number = $3, phone_verified = $4 where id = $1`,
    [id, role, phone, verified]);
  return id;
}

// A future date (Riyadh) on which the given employee has working hours.
export async function nextWorkingDate(db, employeeId, minDaysAhead = 3) {
  const rows = await sys(db, `select distinct day_of_week from employee_availability where employee_id = $1`, [employeeId]);
  const days = rows.map((r) => r.day_of_week);
  let d = new Date(Date.now() + minDaysAhead * 86400000);
  for (let i = 0; i < 14 && !days.includes(d.getUTCDay()); i += 1) d = new Date(d.getTime() + 86400000);
  return d.toISOString().slice(0, 10);
}

export async function firstSlot(db, user, employeeId, date, duration) {
  const rows = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`,
    [employeeId, date, duration]);
  return rows[0]?.slot_start;
}

export async function serviceFor(db, employeeId, offset = 0) {
  const rows = await sys(db,
    `select es.service_id as id, coalesce(es.custom_price, s.base_price)::numeric as price,
            coalesce(es.custom_duration_minutes, s.base_duration_minutes) as duration
     from employee_services es join services s on s.id = es.service_id
     where es.employee_id = $1 order by es.service_id offset $2 limit 1`, [employeeId, offset]);
  return rows[0];
}

export function expectError(promise, pattern) {
  return promise.then(
    () => { throw new Error(`Expected an error matching ${pattern}, but the call succeeded`); },
    (e) => { if (!pattern.test(e.message)) throw new Error(`Expected ${pattern}, got: ${e.message}`); return e; },
  );
}
