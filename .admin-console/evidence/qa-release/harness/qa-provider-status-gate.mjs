// Re-probe of admin_set_provider_status with a valid status value (the sweep's text value failed the enum cast first).
import { execFileSync } from "node:child_process"; import { readFileSync, appendFileSync } from "node:fs"; import { createHmac } from "node:crypto";
const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix", API = "http://127.0.0.1:54321", PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const accounts = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (s) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", s], { encoding: "utf8" }).trim();
const http = async (m, p, { token, body } = {}) => { const r = await fetch(API + p, { method: m, headers: { apikey: PUB, ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body && JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };
const totp = (s) => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let b = ""; for (const c of s.toUpperCase()) b += a.indexOf(c).toString(2).padStart(5, "0"); const k = Buffer.from(b.match(/.{8}/g).map((x) => parseInt(x, 2))); const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", k).update(c).digest(); const o = h[19] & 15; return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0"); };
const aal2 = async (a) => { const s = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: a.email, password: a.password } })).json; const [f, sec] = psql(`select id, secret from auth.mfa_factors where user_id='${a.id}' order by (status='verified') desc, created_at desc limit 1`).split("\t"); const c = await http("POST", `/auth/v1/factors/${f}/challenge`, { token: s.access_token, body: {} }); return (await http("POST", `/auth/v1/factors/${f}/verify`, { token: s.access_token, body: { challenge_id: c.json.id, code: totp(sec) } })).json.access_token; };
const out = [];
for (const [who, key] of [["finance", "qa-finance"], ["operations", "qa-operations"], ["analyst", "qa-analyst"], ["owner", "qa-owner-a"]]) {
  const r = await http("POST", "/rest/v1/rpc/admin_set_provider_status", { token: await aal2(accounts[key]), body: { p_provider_id: "00000000-0000-0000-0000-0000000000a1", p_status: "suspended", p_reason: "QA permission-gate probe (qa-release-claude)" } });
  out.push(`admin_set_provider_status(suspended, missing provider) as ${who}: ${r.status} ${r.json?.code} ${r.json?.message}`);
}
appendFileSync(`${ROOT}/.admin-console/evidence/qa-release/permission-gates.txt`, "\nre-probe with a valid status value:\n" + out.join("\n") + "\n");
console.log(out.join("\n"));
