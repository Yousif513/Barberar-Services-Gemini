// QA release-gate: executed role x operation matrix over the database command surface (qa-release-claude, 2026-10-17).
//
// Every console function the authenticated role may EXECUTE (admin_*, gov*, privacy_*, reveal_*) is called through the
// real PostgREST of the LOCAL stack as: anonymous, a customer, a provider owner, a console owner holding only a password
// session (aal1), and the read-only analyst console role (aal2). Each answer is recorded with HTTP status and error code,
// and classified. The owner (aal2) is then used as the positive control on the read functions only, so the sweep does not
// change data. Output: role-matrix-results.json and role-matrix-summary.txt next to this folder.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const OUT = `${ROOT}/.admin-console/evidence/qa-release`;
const API = "http://127.0.0.1:54321";
const PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
assert.match(API, /^http:\/\/127\.0\.0\.1:\d+$/);
const accounts = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, path, { token, body } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { apikey: PUB, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, json: j };
}
function totp(secret, now = Date.now()) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const h = createHmac("sha1", key).update(c).digest(); const o = h[h.length - 1] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
}
const signIn = async (email, password) => { const s = await http("POST", "/auth/v1/token?grant_type=password", { body: { email, password } }); assert.equal(s.status, 200, JSON.stringify(s.json)); return s.json; };
async function aal2(acct) {
  const s = await signIn(acct.email, acct.password);
  const [factorId, secret] = psql(`select id, secret from auth.mfa_factors where user_id='${acct.id}' and factor_type='totp' order by (status='verified') desc, created_at desc limit 1`).split("\t");
  for (let i = 0; i < 3; i++) {
    const c = await http("POST", `/auth/v1/factors/${factorId}/challenge`, { token: s.access_token, body: {} });
    const v = await http("POST", `/auth/v1/factors/${factorId}/verify`, { token: s.access_token, body: { challenge_id: c.json.id, code: totp(secret) } });
    if (v.status === 200) return v.json.access_token;
    await sleep(31000 - (Date.now() % 30000));
  }
  throw new Error("totp");
}

const ZERO = "00000000-0000-0000-0000-0000000000a1";
const valueFor = (type, name) => {
  if (type.endsWith("[]")) return type.startsWith("uuid") ? [ZERO] : ["qa"];
  if (type === "uuid") return ZERO;
  if (/^(integer|bigint|smallint|numeric|double precision|real)$/.test(type)) return 1;
  if (type === "boolean") return /dry/.test(name) ? true : false;
  if (type === "date") return "2026-10-01";
  if (type.startsWith("timestamp")) return "2026-10-01T00:00:00Z";
  if (type === "jsonb" || type === "json") return name.includes("rows") || name.includes("entries") || name.includes("windows") ? [] : {};
  if (name.includes("audience")) return "qa-none";
  if (name.includes("decision")) return "qa-none";
  if (name.includes("purpose")) return "audit_review";
  if (name.includes("email")) return "nobody@example.invalid";
  if (name.includes("phone")) return "+966500000999";
  return "QA role-matrix probe (qa-release-claude)";
};
const READ = /(_overview|_directory|_list|_inbox|_summary|_report|_counts|_versions|_state|_performance|_queue|_register|_search|_events|_status|_history|_view|_preview|_can|_lookup|_log)$|^admin_(get|list|read|fetch|session|can)_/;

const fns = psql(`select p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'admin\\_%' or p.proname like 'gov%' or p.proname like 'privacy\\_%' or p.proname like 'reveal\\_%' or p.proname like 'read\\_%break\\_glass%')
  and has_function_privilege('authenticated', p.oid, 'execute') order by 1, 2`).split("\n").filter(Boolean).map((l) => {
  const [name, args] = l.split("\t");
  const params = (args || "").split(", ").filter(Boolean).map((a) => { const m = a.match(/^(\w+) (.+)$/); return { name: m[1], type: m[2].replace(/ DEFAULT .*/, "") }; });
  return { name, params };
});

const tokens = {
  anon: null,
  customer: (await signIn(accounts["qa-customer"].email, accounts["qa-customer"].password)).access_token,
  provider: (await signIn("faisal@elitebarber.sa", "Smoke-Test-Only-1!")).access_token,
  "owner-aal1": (await signIn(accounts["qa-owner-b"].email, accounts["qa-owner-b"].password)).access_token,
  analyst: await aal2(accounts["qa-analyst"]),
};
const ownerAal2 = await aal2(accounts["qa-owner-a"]);

const isRefusal = (r) => r.status >= 400;
const authzWords = /permission|not allowed|not authori[sz]ed|administrator|admin|console role|step.?up|aal2|sign in|signed in|forbidden|denied|access|only (the|an|a) |requires/i;
const results = [];
for (const f of fns) {
  const body = Object.fromEntries(f.params.map((p) => [p.name, valueFor(p.type, p.name)]));
  const row = { fn: f.name, args: f.params.map((p) => `${p.name}:${p.type}`).join(", "), read: READ.test(f.name), answers: {} };
  for (const [who, token] of Object.entries(tokens)) {
    const r = await http("POST", `/rest/v1/rpc/${f.name}`, { token, body });
    const err = r.json && typeof r.json === "object" && !Array.isArray(r.json) ? r.json : {};
    row.answers[who] = { status: r.status, code: err.code ?? null, message: String(err.message ?? (r.status < 400 ? JSON.stringify(r.json).slice(0, 120) : "")).slice(0, 160), hint: err.hint ?? null,
      cls: r.status < 400 ? "ALLOWED" : (err.code === "42501" || authzWords.test(String(err.message)) ? "refused-authz" : "refused-other") };
  }
  if (row.read) {
    const r = await http("POST", `/rest/v1/rpc/${f.name}`, { token: ownerAal2, body });
    row.ownerControl = { status: r.status, code: r.json?.code ?? null, message: String(r.json?.message ?? "").slice(0, 160) };
  }
  results.push(row);
}

// Classification of what matters: any non-anonymous identity that is not a console aal2 session getting ALLOWED on an
// admin_/gov function is a finding; for the analyst, ALLOWED on a non-read function is a finding.
const lines = [];
const findings = [];
for (const r of results) {
  const consoleFn = /^(admin_|gov)/.test(r.fn);
  for (const who of ["anon", "customer", "provider", "owner-aal1", "analyst"]) {
    const a = r.answers[who];
    if (a.cls !== "ALLOWED") continue;
    if (consoleFn && who !== "analyst") findings.push(`${who} ALLOWED ${r.fn} -> ${a.status} ${a.message}`);
    if (consoleFn && who === "analyst" && !r.read) findings.push(`analyst ALLOWED non-read ${r.fn} -> ${a.status} ${a.message}`);
  }
}
const count = (who, cls) => results.filter((r) => r.answers[who].cls === cls).length;
lines.push(`QA role x operation matrix over the database command surface, ${new Date().toISOString()}, local stack ${API}`);
lines.push(`functions executable by the authenticated role and swept: ${results.length} (reads ${results.filter((r) => r.read).length}, commands ${results.filter((r) => !r.read).length})`);
for (const who of Object.keys(tokens)) lines.push(`${who.padEnd(11)} allowed ${String(count(who, "ALLOWED")).padStart(3)}  refused-authz ${String(count(who, "refused-authz")).padStart(3)}  refused-other ${String(count(who, "refused-other")).padStart(3)}`);
lines.push(`owner aal2 positive control on reads: ${results.filter((r) => r.read && r.ownerControl && r.ownerControl.status < 400).length} of ${results.filter((r) => r.read).length} answered 200`);
lines.push("", "findings (identity allowed where it must be refused):", ...(findings.length ? findings : ["none"]));
lines.push("", "every non-authz refusal for anon/customer/provider/owner-aal1 on a console function (read the message: a refusal that is not about authority may mean the check runs after the lookup):");
for (const r of results) for (const who of ["anon", "customer", "provider", "owner-aal1"]) { const a = r.answers[who]; if (/^(admin_|gov)/.test(r.fn) && a.cls === "refused-other") lines.push(`  ${who} ${r.fn}: ${a.status} ${a.code} ${a.message}`); }
lines.push("", "analyst answers on console functions that were ALLOWED (reads):");
for (const r of results) { const a = r.answers.analyst; if (/^(admin_|gov)/.test(r.fn) && a.cls === "ALLOWED") lines.push(`  ${r.fn} (${r.read ? "read" : "COMMAND"}): ${a.status} ${a.message.slice(0, 90)}`); }
writeFileSync(`${OUT}/role-matrix-results.json`, JSON.stringify(results, null, 1));
writeFileSync(`${OUT}/role-matrix-summary.txt`, lines.join("\n") + "\n");
console.log(lines.slice(0, 12).join("\n"));
console.log(`findings: ${findings.length}`);
