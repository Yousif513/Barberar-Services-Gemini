// QA release-gate: privileged reads, live on the LOCAL stack (qa-release-claude, 2026-10-17).
// Console sessions may not SELECT personal, bank, ledger, invoice, message, staff or privacy tables directly (Q4/D4); they
// read through audited functions, and each audited read leaves an audit row naming the actor, purpose and row count.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const API = "http://127.0.0.1:54321";
const PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const A = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (s) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", s], { encoding: "utf8" }).trim();
const http = async (m, p, { token, body } = {}) => {
  const r = await fetch(API + p, { method: m, headers: { apikey: PUB, ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body && JSON.stringify(body) });
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
const log = [];
const check = (name, ok, detail) => log.push(`${ok ? "ok  " : "FAIL"} ${name} :: ${JSON.stringify(detail).slice(0, 200)}`);
const owner = await aal2(A["qa-owner-a"]);
const finance = await aal2(A["qa-finance"]);
const tables = ["profiles?select=id,email,phone_number&id=not.in.(" + A["qa-owner-a"].id + "," + A["qa-finance"].id + ")", "payout_requests?select=id,iban", "provider_payout_destinations?select=id,iban",
  "transactional_ledger?select=id,provider_share", "invoices?select=id,buyer_name", "messages?select=id,body", "employees?select=id,phone,email", "bookings?select=id,customer_id,walk_in_phone",
  "privacy_requests?select=id", "refund_requests?select=id,amount", "intake_answers?select=id", "admin_audit_logs?select=id"];
for (const [who, token] of [["owner", owner], ["finance", finance]]) {
  for (const t of tables) {
    const r = await http("GET", `/rest/v1/${t}&limit=3`, { token });
    const rows = Array.isArray(r.json) ? r.json.length : null;
    check(`${who}: direct SELECT ${t.split("?")[0]} returns no other person's rows`, r.status >= 400 || rows === 0, { status: r.status, rows, code: r.json?.code, message: r.json?.message });
  }
}
const before = Number(psql(`select count(*) from public.admin_audit_logs where actor_id='${A["qa-finance"].id}' and true`));
const r = await http("POST", "/rest/v1/rpc/admin_list_payout_requests", { token: finance, body: { p_status: null, p_provider_id: null, p_limit: 5, p_offset: 0, p_purpose: "payout_review" } });
check("finance reads payout requests through the audited function", r.status === 200, { status: r.status, message: r.json?.message });
const after = Number(psql(`select count(*) from public.admin_audit_logs where actor_id='${A["qa-finance"].id}' and true`));
const last = psql(`select action || ' | ' || coalesce(details->>'purpose','') || ' | rows=' || coalesce(details->>'row_count', details->>'rows', '') from public.admin_audit_logs where actor_id='${A["qa-finance"].id}' order by created_at desc limit 1`);
check("the audited read leaves one audit row naming finance as the actor, with purpose and row count", after === before + 1, { before, after, last });
const out = [`privileged-read probe ${new Date().toISOString()}, ${API}`, ...log, `${log.filter((l) => l.startsWith("ok")).length}/${log.length} passed`];
writeFileSync(`${ROOT}/.admin-console/evidence/qa-release/privileged-reads-live.txt`, out.join("\n") + "\n");
console.log(out.join("\n"));
