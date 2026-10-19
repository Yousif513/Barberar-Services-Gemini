// QA release-gate: direct PostgREST table writes by console role (qa-release-claude, 2026-10-17). Local stack only.
// For each administrator-writable table the console screens write directly, every console role (and a customer) sends a
// PATCH that sets one column to the value it already holds, so an allowed write changes nothing; the answer shows whether
// the row policy let the role write. Expected: only the role holding the table's console permission gets the row back.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const API = "http://127.0.0.1:54321";
const PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const A = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (s) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", s], { encoding: "utf8" }).trim();
const http = async (m, p, { token, body } = {}) => {
  const r = await fetch(API + p, { method: m, headers: { apikey: PUB, ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json", prefer: "return=representation" }, body: body && JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, json: j };
};
const totp = (s) => {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let b = "";
  for (const c of s.toUpperCase()) b += a.indexOf(c).toString(2).padStart(5, "0");
  const k = Buffer.from(b.match(/.{8}/g).map((x) => parseInt(x, 2))); const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", k).update(c).digest(); const o = h[19] & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function aal2(a) {
  const s = (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: a.email, password: a.password } })).json;
  const [f, sec] = psql(`select id, secret from auth.mfa_factors where user_id='${a.id}' order by (status='verified') desc, created_at desc limit 1`).split("\t");
  for (let i = 0; i < 3; i++) {
    const c = await http("POST", `/auth/v1/factors/${f}/challenge`, { token: s.access_token, body: {} });
    const v = await http("POST", `/auth/v1/factors/${f}/verify`, { token: s.access_token, body: { challenge_id: c.json.id, code: totp(sec) } });
    if (v.status === 200) return v.json.access_token;
    await sleep(31000 - (Date.now() % 30000));
  }
  throw new Error("totp");
}
const tables = [
  { table: "services", key: "id", col: "is_active", needs: "operations.write" },
  { table: "integrations", key: "id", col: "enabled", needs: "settings.manage" },
  { table: "payment_methods", key: "id", col: "enabled", needs: "settings.manage" },
  { table: "branches", key: "id", col: "is_active", needs: "operations.write" },
  { table: "providers", key: "id", col: "status", needs: "operations.write (column grants: command only)" },
  { table: "categories", key: "id", col: "name_en", needs: "operations.write" },
  { table: "message_templates", key: "name", col: "is_transactional", needs: "settings.manage" },
  { table: "platform_settings", key: "key", col: "description", needs: "(expected: command only)" },
  { table: "platform_feature_flags", key: "flag_key", col: "description", needs: "(expected: command only)" },
  { table: "promotional_codes", key: "id", col: "is_active", needs: "(expected: command only)" },
  { table: "provider_promos", key: "id", col: "status", needs: "operations.write" },
];
const who = {
  analyst: await aal2(A["qa-analyst"]), finance: await aal2(A["qa-finance"]), operations: await aal2(A["qa-operations"]), owner: await aal2(A["qa-owner-a"]),
  customer: (await http("POST", "/auth/v1/token?grant_type=password", { body: { email: A["qa-customer"].email, password: A["qa-customer"].password } })).json.access_token,
};
const lines = [`direct table writes by console role, no-op PATCH (column set to its current value), ${new Date().toISOString()}, ${API}`];
for (const t of tables) {
  let row;
  try { row = psql(`select x.${t.key}::text || E'\\t' || coalesce(to_jsonb(x)->>'${t.col}', '') || E'\\t' || coalesce(jsonb_typeof(to_jsonb(x)->'${t.col}'), 'null') from public.${t.table} x order by x.${t.key} limit 1`); } catch (e) { lines.push(`${t.table}: not probed (${String(e.message).split("\n")[0].slice(0, 80)})`); continue; }
  if (!row) { lines.push(`${t.table}: no rows to probe`); continue; }
  const [id, raw, type] = row.split("\t");
  const value = type === "boolean" ? raw === "true" : type === "number" ? Number(raw) : type === "object" || type === "array" ? JSON.parse(raw) : raw;
  const cells = [];
  for (const [name, token] of Object.entries(who)) {
    const r = await http("PATCH", `/rest/v1/${t.table}?${t.key}=eq.${encodeURIComponent(id)}`, { token, body: { [t.col]: value } });
    cells.push(`${name}:${r.status >= 400 ? `refused ${r.status} ${r.json?.code ?? ""}` : Array.isArray(r.json) && r.json.length ? "WROTE" : "no row (RLS)"}`);
  }
  lines.push(`${t.table}.${t.col} (console permission ${t.needs}) | ${cells.join(" | ")}`);
}
writeFileSync(`${ROOT}/.admin-console/evidence/qa-release/direct-table-writes.txt`, lines.join("\n") + "\n");
console.log(lines.join("\n"));
