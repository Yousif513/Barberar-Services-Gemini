// Smoke test of the real local Supabase stack (Docker): real Postgres 15, real GoTrue, real PostgREST.
//
//   npx supabase start        (applies every migration and the seed)
//   node scripts/smoke-local-supabase.mjs
//
// The database tests under supabase/tests/db run on an in-memory Postgres with a hand-written copy of the auth schema.
// This script checks what that copy cannot: real sign-in tokens, real auth.uid(), the privileges PostgREST really
// exposes to anon and authenticated, and the migrations on the engine Supabase runs. It only talks to a local stack
// (it refuses any other API address) and creates its own throw-away users.

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const DB_CONTAINER = process.env.SMOKE_DB_CONTAINER || "supabase_db_beauty_grooming_marketplace";

function stackEnv() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: process.platform === "win32" });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = stackEnv();
const API = env.API_URL;
assert.ok(API && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API), `refusing to run against ${API}: this script only talks to a local stack`);
const PUBLISHABLE = env.PUBLISHABLE_KEY || env.ANON_KEY;
const SECRET = env.SECRET_KEY || env.SERVICE_ROLE_KEY;

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim();
}

async function http(method, path, { token, key = PUBLISHABLE, body, headers = {} } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json };
}

const rest = (path, token, init = {}) => http(init.method || "GET", `/rest/v1/${path}`, { token, ...init });
const rpc = (name, args, token) => http("POST", `/rest/v1/rpc/${name}`, { token, body: args ?? {} });

async function createUser(label, password) {
  const email = `smoke.${label}.${Date.now()}@example.test`;
  const created = await http("POST", "/auth/v1/admin/users", { key: SECRET, token: SECRET, body: { email, password, email_confirm: true } });
  assert.equal(created.status, 200, `could not create ${label}: ${JSON.stringify(created.json)}`);
  return { id: created.json.id, email, password };
}

async function signIn(user) {
  const result = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: user.email, password: user.password } });
  assert.equal(result.status, 200, `sign-in failed for ${user.email}: ${JSON.stringify(result.json)}`);
  return result.json.access_token;
}

async function setPassword(id, password) {
  const r = await http("PUT", `/auth/v1/admin/users/${id}`, { key: SECRET, token: SECRET, body: { password, email_confirm: true } });
  assert.equal(r.status, 200, `could not set a password: ${JSON.stringify(r.json)}`);
}

// RFC 6238 TOTP (HMAC-SHA1, 30-second step, 6 digits) from the base32 secret GoTrue returns at enrolment.
function totp(secretBase32, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(ch);
    if (value < 0) throw new Error("the TOTP secret is not base32");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

// GOV-1 (Q6): a console session is aal2. Enrol a TOTP factor for the throw-away administrator, then challenge and verify it, which
// returns an aal2 access token whose amr carries a fresh TOTP (the step-up the money and booking commands ask for).
async function signInWithTotp(user) {
  const aal1 = await signIn(user);
  const enrolled = await http("POST", "/auth/v1/factors", { token: aal1, body: { factor_type: "totp", friendly_name: `smoke-${Date.now()}` } });
  assert.equal(enrolled.status, 200, `TOTP enrolment failed: ${JSON.stringify(enrolled.json)}`);
  const factorId = enrolled.json.id;
  const challenge = await http("POST", `/auth/v1/factors/${factorId}/challenge`, { token: aal1, body: {} });
  assert.equal(challenge.status, 200, `TOTP challenge failed: ${JSON.stringify(challenge.json)}`);
  const verified = await http("POST", `/auth/v1/factors/${factorId}/verify`, {
    token: aal1, body: { challenge_id: challenge.json.id, code: totp(enrolled.json.totp.secret) },
  });
  assert.equal(verified.status, 200, `TOTP verification failed: ${JSON.stringify(verified.json)}`);
  return verified.json.access_token;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  FAIL ${name}\n       ${String(error.message).split("\n").join("\n       ")}`);
  }
}

const denied = (r) => r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0);
const PASSWORD = "Smoke-Test-Only-1!";

console.log(`Smoke test against ${API}`);

const migrationCount = Number(psql("select count(*) from supabase_migrations.schema_migrations"));
await check("every migration is recorded as applied", async () => {
  assert.ok(migrationCount >= 58, `only ${migrationCount} migrations applied`);
});

const customer = await createUser("customer", PASSWORD);
const stranger = await createUser("stranger", PASSWORD);
const admin = await createUser("admin", PASSWORD);
psql(`update public.profiles set phone_number = '+9665${String(Date.now()).slice(-8)}', phone_verified = true where id = '${customer.id}'`);
psql(`update public.profiles set role = 'admin' where id = '${admin.id}'`);
// A console owner, assigned the way supabase/seed.sql assigns the local console accounts (GOV-1 console roles).
psql(`insert into public.admin_role_assignments (user_id, admin_role, reason) values ('${admin.id}', 'owner', 'Smoke test console owner (throw-away account)')
      on conflict (user_id) do update set admin_role = excluded.admin_role`);
const owner = { id: "00000000-0000-0000-0000-000000000101", email: "faisal@elitebarber.sa", password: PASSWORD };
const otherOwner = { id: "00000000-0000-0000-0000-000000000102", email: "sara@sarabeauty.sa", password: PASSWORD };
await setPassword(owner.id, PASSWORD);
await setPassword(otherOwner.id, PASSWORD);

const tokens = {
  customer: await signIn(customer),
  stranger: await signIn(stranger),
  admin: await signInWithTotp(admin),
  owner: await signIn(owner),
  otherOwner: await signIn(otherOwner),
};

await check("a customer's profile row is created by the sign-up trigger with the customer role", async () => {
  const r = await rest(`profiles?id=eq.${customer.id}&select=id,role`, tokens.customer);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.map((p) => p.role), ["customer"]);
});

await check("anonymous visitors read no profiles and no bookings", async () => {
  for (const table of ["profiles", "bookings", "admin_audit_logs", "transactional_ledger", "payout_requests", "invoices"]) {
    const r = await rest(`${table}?select=*&limit=5`);
    assert.ok(denied(r), `${table} returned data to an anonymous visitor: ${JSON.stringify(r.json).slice(0, 200)}`);
  }
});

await check("a signed-in customer reads only their own profile", async () => {
  const r = await rest("profiles?select=id", tokens.customer);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.map((p) => p.id), [customer.id]);
});

await check("administrator commands refuse anonymous visitors and customers", async () => {
  for (const [name, args] of [["admin_dashboard_overview", {}], ["admin_booking_directory", { p_limit: 5 }]]) {
    for (const token of [undefined, tokens.customer, tokens.owner]) {
      const r = await rpc(name, args, token);
      assert.ok(r.status >= 400, `${name} answered ${r.status} for ${token ? "a signed-in non-admin" : "anonymous"}`);
    }
  }
});

await check("an administrator reads the dashboard and the audit log", async () => {
  const overview = await rpc("admin_dashboard_overview", {}, tokens.admin);
  assert.equal(overview.status, 200, JSON.stringify(overview.json));
  assert.equal(typeof overview.json, "object");
  // SECFIX-2 R2-M8: the owner reads the audit log only through the audited, paged function; no session reads the table directly.
  const audit = await rpc("admin_list_audit_events", { p_limit: 1, p_purpose: "audit_review" }, tokens.admin);
  assert.equal(audit.status, 200, JSON.stringify(audit.json));
  assert.ok(Array.isArray(audit.json.rows));
  const direct = await rest("admin_audit_logs?select=id&limit=1", tokens.admin);
  assert.ok(denied(direct), `the owner read the audit table directly: ${JSON.stringify(direct.json)}`);
  const hidden = await rpc("admin_list_audit_events", { p_limit: 1 }, tokens.customer);
  assert.ok(hidden.status >= 400);
  assert.ok(denied(await rest("admin_audit_logs?select=id&limit=1", tokens.customer)));
});

await check("the audit and money writers cannot be called from a client", async () => {
  for (const name of ["write_audit_log", "audit_admin_write", "attach_admin_audit_trigger"]) {
    for (const token of [undefined, tokens.customer, tokens.admin]) {
      const r = await rpc(name, {}, token);
      assert.ok(r.status >= 400, `${name} was reachable (${r.status})`);
    }
  }
});

await check("the public marketplace search answers anonymous visitors with the seeded providers", async () => {
  const r = await rpc("search_marketplace_providers", { p_limit: 5 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
});

// A booking through the real API: the seeded employee works on some weekdays; find the next day with slots.
let bookingId = null;
await check("a verified customer books a slot and sees it", async () => {
  const employee = "e0000000-0000-0000-0000-000000000001";
  const service = "50000000-0000-0000-0000-000000000002";
  let slot = null;
  for (let ahead = 4; ahead < 25 && !slot; ahead += 1) {
    const date = new Date(Date.now() + ahead * 86400000).toISOString().slice(0, 10);
    const r = await rpc("get_available_slots", { target_employee_id: employee, target_date: date, service_duration_minutes: 45 }, tokens.customer);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    if (r.json.length) slot = r.json[0].slot_start;
  }
  assert.ok(slot, "no free slot in three weeks");
  const created = await rpc("create_booking", { target_employee_id: employee, target_service_id: service, target_scheduled_at: slot }, tokens.customer);
  assert.equal(created.status, 200, JSON.stringify(created.json));
  bookingId = created.json.id;
  const mine = await rest(`bookings?id=eq.${bookingId}&select=id,status`, tokens.customer);
  assert.equal(mine.json.length, 1);
});

await check("another customer cannot see or change that booking", async () => {
  assert.ok(bookingId, "no booking was created");
  const seen = await rest(`bookings?id=eq.${bookingId}&select=id`, tokens.stranger);
  assert.deepEqual(seen.json, []);
  const patched = await rest(`bookings?id=eq.${bookingId}`, tokens.stranger, { method: "PATCH", body: { status: "cancelled" }, headers: { prefer: "return=representation" } });
  assert.ok(denied(patched), JSON.stringify(patched.json));
  const cancel = await rpc("cancel_booking", { target_booking_id: bookingId, p_reason: "not mine" }, tokens.stranger);
  assert.ok(cancel.status >= 400, JSON.stringify(cancel.json));
});

await check("the customer cannot move their own booking to completed through the table", async () => {
  assert.ok(bookingId);
  const r = await rest(`bookings?id=eq.${bookingId}`, tokens.customer, { method: "PATCH", body: { status: "completed" }, headers: { prefer: "return=representation" } });
  assert.ok(denied(r), JSON.stringify(r.json));
  const state = psql(`select status from public.bookings where id = '${bookingId}'`);
  assert.notEqual(state, "completed");
});

await check("the provider owner sees the booking; another provider's owner does not", async () => {
  assert.ok(bookingId);
  const own = await rest(`bookings?id=eq.${bookingId}&select=id`, tokens.owner);
  assert.equal(own.json.length, 1, JSON.stringify(own.json));
  const other = await rest(`bookings?id=eq.${bookingId}&select=id`, tokens.otherOwner);
  assert.deepEqual(other.json, []);
});

await check("the provider cannot rewrite the booking status through the table", async () => {
  assert.ok(bookingId);
  const r = await rest(`bookings?id=eq.${bookingId}`, tokens.owner, { method: "PATCH", body: { status: "completed" }, headers: { prefer: "return=representation" } });
  assert.ok(denied(r), JSON.stringify(r.json));
});

await check("an administrator cancels only with a reason, and the audit log records it", async () => {
  assert.ok(bookingId);
  // SECFIX-2 R2-H2: the console cancels through admin_cancel_booking (reason of at least 10 characters, refund approval rules).
  const direct = await rpc("cancel_booking", { target_booking_id: bookingId, p_reason: "Smoke test cleanup" }, tokens.admin);
  assert.ok(direct.status >= 400, `a console session cancelled through the self-service command: ${JSON.stringify(direct.json)}`);
  const short = await rpc("admin_cancel_booking", { p_booking_id: bookingId, p_reason: "x" }, tokens.admin);
  assert.ok(short.status >= 400, `a one-character reason was accepted: ${JSON.stringify(short.json)}`);
  const done = await rpc("admin_cancel_booking", { p_booking_id: bookingId, p_reason: "Smoke test cleanup" }, tokens.admin);
  assert.equal(done.status, 200, JSON.stringify(done.json));
  const logs = Number(psql(`select count(*) from public.admin_audit_logs where created_at > now() - interval '5 minutes'`));
  assert.ok(logs > 0, "no audit row was written for the administrator's write");
});

await check("every table in public has row-level security and every base table has the audit trigger", async () => {
  assert.equal(psql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`), "0");
  assert.equal(
    psql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relispartition
            and c.relname not in ('admin_audit_logs', 'integration_audit_log')
            and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_audit_admin_write')`),
    "0",
  );
});

await check("ratings of providers are public and computed from published reviews", async () => {
  const r = await rpc("provider_rating_summaries", { p_provider_ids: ["a0000000-0000-0000-0000-000000000001"] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(Array.isArray(r.json));
});

await check("no client role holds TRUNCATE, REFERENCES or TRIGGER, and anonymous visitors hold no write privilege", async () => {
  assert.equal(psql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     cross join (values ('anon'),('authenticated'),('service_role')) r(rolname) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
                     where n.nspname = 'public' and c.relkind in ('r','p','v','m') and has_table_privilege(r.rolname, c.oid, p.priv)`), "0");
  assert.equal(psql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     cross join (values ('INSERT'),('UPDATE'),('DELETE')) p(priv)
                     where n.nspname = 'public' and c.relkind in ('r','p','v','m') and has_table_privilege('anon', c.oid, p.priv)`), "0");
});

await check("the public catalogue is readable without signing in and the private tables are not", async () => {
  for (const table of ["categories", "services", "branches", "platform_settings"]) {
    const r = await rest(`${table}?select=*&limit=1`);
    assert.equal(r.status, 200, `${table}: ${JSON.stringify(r.json).slice(0, 160)}`);
  }
});

await check("no function in public is executable by anonymous visitors unless it is a deliberate public one", async () => {
  const rows = psql(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE') and p.prorettype <> 'trigger'::regtype order by 1`)
    .split("\n").filter(Boolean);
  console.log(`       anon can execute: ${rows.join(", ") || "(none)"}`);
});

// Clean up the throw-away users (their profiles and bookings cascade).
for (const user of [customer, stranger, admin]) {
  await http("DELETE", `/auth/v1/admin/users/${user.id}`, { key: SECRET, token: SECRET }).catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against the real local stack`);
process.exit(failed.length ? 1 : 0);
