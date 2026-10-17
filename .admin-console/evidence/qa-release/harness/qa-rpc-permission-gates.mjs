// QA release-gate: which console role passes each command's permission gate (qa-release-claude, 2026-10-17).
// Calls every TARGETED console command (it names a uuid target) through local PostgREST as the finance, operations and
// owner console roles (aal2) with a target id that does not exist. A role refused for authority answers 42501; a role that
// passes the gate reaches the lookup and answers 'not found' or a validation error, so nothing is changed. Commands that
// take no target are not called here (they would act). Output: permission-gates.txt.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const API = "http://127.0.0.1:54321", PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const accounts = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", sql], { encoding: "utf8" }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, path, { token, body } = {}) { const r = await fetch(`${API}${path}`, { method, headers: { apikey: PUB, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; } return { status: r.status, json: j }; }
function totp(secret, now = Date.now()) { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(ch).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(now / 30000))); const h = createHmac("sha1", key).update(c).digest(); const o = h[h.length - 1] & 15; return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0"); }
async function aal2(acct) { const s = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: acct.email, password: acct.password } })).json; const [fid, sec] = psql(`select id, secret from auth.mfa_factors where user_id='${acct.id}' and factor_type='totp' order by (status='verified') desc, created_at desc limit 1`).split("\t"); for (let i = 0; i < 3; i++) { const c = await http("POST", `/auth/v1/factors/${fid}/challenge`, { token: s.access_token, body: {} }); const v = await http("POST", `/auth/v1/factors/${fid}/verify`, { token: s.access_token, body: { challenge_id: c.json.id, code: totp(sec) } }); if (v.status === 200) return v.json.access_token; await sleep(31000 - (Date.now() % 30000)); } throw new Error("totp"); }
const ZERO = "00000000-0000-0000-0000-0000000000a1";
const val = (t, n) => t.endsWith("[]") ? (t.startsWith("uuid") ? [ZERO] : ["qa"]) : t === "uuid" ? ZERO : /^(integer|bigint|numeric|smallint)$/.test(t) ? 1 : t === "boolean" ? false : t === "date" ? "2026-10-01" : t.startsWith("timestamp") ? "2026-10-01T00:00:00Z" : t === "jsonb" ? {} : n.includes("decision") ? "approve" : n.includes("purpose") ? "audit_review" : "QA permission-gate probe (qa-release-claude)";
const fns = psql(`select p.proname, pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'admin\_%' or p.proname like 'privacy\_admin%' or p.proname like 'reveal\_%') and has_function_privilege('authenticated', p.oid, 'execute') order by 1`).split("\n").map((l) => { const [name, args] = l.split("\t"); return { name, params: (args || "").split(", ").filter(Boolean).map((a) => { const m = a.match(/^(\w+) (.+)$/); return { name: m[1], type: m[2] }; }) }; }).filter((f) => f.params.some((p) => p.type === "uuid" || p.type === "uuid[]"));
const roles = { finance: await aal2(accounts["qa-finance"]), operations: await aal2(accounts["qa-operations"]), owner: await aal2(accounts["qa-owner-a"]) };
const lines = [`permission gates of targeted console commands, non-existent target ${ZERO}, ${new Date().toISOString()}`, "fn | finance | operations | owner"];
for (const f of fns) {
  const body = Object.fromEntries(f.params.map((p) => [p.name, val(p.type, p.name)]));
  const cells = [];
  for (const [who, token] of Object.entries(roles)) { const r = await http("POST", `/rest/v1/rpc/${f.name}`, { token, body }); const code = r.json?.code ?? ""; cells.push(r.status < 400 ? `OK(${r.status})` : code === "42501" ? `DENY:${String(r.json?.message).slice(0, 60)}` : `pass-gate:${code} ${String(r.json?.message).slice(0, 50)}`); }
  lines.push(`${f.name} | ${cells.join(" | ")}`);
}
writeFileSync(`${ROOT}/.admin-console/evidence/qa-release/permission-gates.txt`, lines.join("\n") + "\n");
console.log(lines.length - 2, "targeted commands probed");
