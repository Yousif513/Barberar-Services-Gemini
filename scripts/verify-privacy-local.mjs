// Live check of the PRIV package on the real local Supabase stack (GoTrue, PostgREST, Storage, Edge Functions):
//
//   npx supabase start
//   npx supabase functions serve        (in another terminal; without it the Edge Function steps are reported as skipped)
//   node scripts/verify-privacy-local.mjs
//
// A throw-away customer signs in with an e-mail one-time code read from the local mail catcher (amr "otp"), files a copy request
// and a deletion request; two throw-away console owners with TOTP sessions propose and approve them; the Edge Functions build the
// copy (JSON + PDF in the private bucket), the customer downloads it with their own token, and the deletion removes the auth account.
// It only talks to a local stack and creates its own users.

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const DB_CONTAINER = process.env.SMOKE_DB_CONTAINER || "supabase_db_beauty_grooming_marketplace";
const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: process.platform === "win32" });
const env = Object.fromEntries(out.split(/\r?\n/).map((l) => l.match(/^([A-Z_0-9]+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const API = env.API_URL;
const MAIL = env.MAILPIT_URL || env.INBUCKET_URL;
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API ?? ""), `refusing to run against ${API}`);
const ANON = env.PUBLISHABLE_KEY || env.ANON_KEY;
const SECRET = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
const psql = (sql) => execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim();

async function http(method, path, { token, key = ANON, body, raw = false } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (raw) return { status: r.status, headers: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: r.status, json };
}
const rpc = (name, args, token) => http("POST", `/rest/v1/rpc/${name}`, { token, body: args ?? {} });
const PASSWORD = "Privacy-Check-Only-1!";
async function createUser(label) {
  const email = `privacy.${label}.${Date.now()}@example.test`;
  const r = await http("POST", "/auth/v1/admin/users", { key: SECRET, token: SECRET, body: { email, password: PASSWORD, email_confirm: true } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { id: r.json.id, email };
}
const signIn = async (u) => (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: PASSWORD } })).json.access_token;

function totp(secret, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()].map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  return (((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString()).padStart(6, "0");
}
async function consoleOwner(label) {
  const u = await createUser(label);
  psql(`update public.profiles set role = 'admin' where id = '${u.id}'; insert into public.admin_role_assignments (user_id, admin_role, reason)
        values ('${u.id}', 'owner', 'privacy live check') on conflict (user_id) do update set admin_role = 'owner', decisions_allowed_from = now() - interval '1 day'`);
  psql(`update public.admin_role_assignments set decisions_allowed_from = now() - interval '1 day' where user_id = '${u.id}'`);
  const aal1 = await signIn(u);
  const f = await http("POST", "/auth/v1/factors", { token: aal1, body: { factor_type: "totp", friendly_name: `privacy-${Date.now()}` } });
  const c = await http("POST", `/auth/v1/factors/${f.json.id}/challenge`, { token: aal1, body: {} });
  const v = await http("POST", `/auth/v1/factors/${f.json.id}/verify`, { token: aal1, body: { challenge_id: c.json.id, code: totp(f.json.totp.secret) } });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  return { ...u, token: v.json.access_token };
}
// The local mail catcher (Mailpit) holds the one-time code GoTrue sent.
async function otpSession(u) {
  const sent = await http("POST", "/auth/v1/otp", { body: { email: u.email, create_user: false } });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  let code = null;
  for (let i = 0; i < 20 && !code; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${u.email}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
      code = (msg.Text || msg.HTML || "").match(/\b(\d{6})\b/)?.[1] ?? null;
    }
  }
  assert.ok(code, "no one-time code arrived in the local mail catcher");
  const v = await http("POST", "/auth/v1/verify", { body: { type: "email", email: u.email, token: code } });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  return v.json.access_token;
}

const results = [];
async function check(name, fn) {
  try { const note = await fn(); results.push({ ok: true }); console.log(`  ok   ${name}${note ? ` (${note})` : ""}`); }
  catch (e) { results.push({ ok: false }); console.log(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`); }
}

console.log(`Privacy live check against ${API}`);
const customer = await createUser("customer");
const ownerA = await consoleOwner("ownerA");
const ownerB = await consoleOwner("ownerB");
let customerToken;
let copyRequest;
const functionsUp = (await fetch(`${API}/functions/v1/privacy-export`, { method: "OPTIONS" })).status === 200;

await check("a password session cannot file a request; a one-time-code sign-in can", async () => {
  const refused = await rpc("privacy_submit_request", { p_request_type: "copy", p_details: null, p_options: {} }, await signIn(customer));
  assert.equal(refused.status, 403);
  assert.equal(refused.json.hint, "contact_otp_required");
  customerToken = await otpSession(customer);
  const r = await rpc("privacy_submit_request", { p_request_type: "copy", p_details: "Live check", p_options: {} }, customerToken);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.status, "open");
  copyRequest = r.json.id;
});

await check("the proposer cannot approve; a different owner can", async () => {
  const p = await rpc("admin_privacy_propose_execution", { p_request_id: copyRequest, p_reason: "Identity confirmed by OTP" }, ownerA.token);
  assert.equal(p.status, 200, JSON.stringify(p.json));
  const self = await rpc("admin_decide_approval", { p_request_id: p.json.approval_id, p_decision: "approve", p_reason: "Self approval" }, ownerA.token);
  assert.equal(self.status, 403);
  const ok = await rpc("admin_decide_approval", { p_request_id: p.json.approval_id, p_decision: "approve", p_reason: "Second owner checked" }, ownerB.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(psql(`select execution_state from public.privacy_requests where id = '${copyRequest}'`), "awaiting_build");
});

await check("privacy-export builds the JSON and the Arabic/English PDF; only the customer downloads them", async () => {
  if (!functionsUp) return "skipped: Edge Functions are not served (npx supabase functions serve)";
  const analystLike = await http("POST", "/functions/v1/privacy-export", { token: customerToken, body: { request_id: copyRequest } });
  assert.equal(analystLike.status, 403, "a customer cannot run the builder");
  const built = await http("POST", "/functions/v1/privacy-export", { token: ownerB.token, body: { request_id: copyRequest } });
  assert.equal(built.status, 200, JSON.stringify(built.json));
  assert.equal(built.json.results[0].status, "built", JSON.stringify(built.json));
  const pdf = await http("POST", "/functions/v1/privacy-export-download", { token: customerToken, body: { request_id: copyRequest, file: "pdf" }, raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(new TextDecoder().decode(pdf.bytes.slice(0, 5)), "%PDF-");
  const other = await http("POST", "/functions/v1/privacy-export-download", { token: ownerA.token, body: { request_id: copyRequest, file: "pdf" } });
  assert.equal(other.status, 404, "nobody else downloads it");
  const json = await http("POST", "/functions/v1/privacy-export-download", { token: customerToken, body: { request_id: copyRequest, file: "json" }, raw: true });
  const parsed = JSON.parse(new TextDecoder().decode(json.bytes));
  assert.equal(parsed.profile.email, customer.email);
  return `${pdf.bytes.length} byte PDF`;
});

await check("a deletion erases the data on approval and the auth account through privacy-erase-account", async () => {
  const r = await rpc("privacy_submit_request", { p_request_type: "deletion", p_details: null, p_options: { review_choice: "delete_text" } }, customerToken);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const p = await rpc("admin_privacy_propose_execution", { p_request_id: r.json.id, p_reason: "Identity confirmed by OTP" }, ownerA.token);
  const ok = await rpc("admin_decide_approval", { p_request_id: p.json.approval_id, p_decision: "approve", p_reason: "Second owner checked" }, ownerB.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(psql(`select count(*) from public.profiles where id = '${customer.id}'`), "0");
  if (!functionsUp) return "auth step skipped: Edge Functions are not served";
  const erased = await http("POST", "/functions/v1/privacy-erase-account", { token: ownerB.token, body: {} });
  assert.equal(erased.status, 200, JSON.stringify(erased.json));
  assert.equal(psql(`select count(*) from auth.users where id = '${customer.id}'`), "0");
  assert.equal(psql(`select status from public.privacy_requests where id = '${r.json.id}'`), "completed");
  assert.ok(Number(psql(`select count(*) from public.governance_notifications where recipient_user_id = '${customer.id}' and template_key = 'privacy_deletion_completed'`)) >= 1);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
