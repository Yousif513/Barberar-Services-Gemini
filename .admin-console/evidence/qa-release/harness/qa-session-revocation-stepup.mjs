// QA release-gate: session revocation and step-up window, live on the LOCAL stack (qa-release-claude, 2026-10-17).
// 1. A console session that signs out loses console access at once, although its access token has not expired.
// 2. A console session whose last authenticator code is older than 5 minutes is refused a step-up command
//    (payout hold request) with hint step_up_required, while an aal2 read still works.
// 3. Removing a console role ends console access for an already-issued token (stale permission).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const API = "http://127.0.0.1:54321";
const PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const A = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));
const psql = (s) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-At", "-F", "\t", "-c", s], { encoding: "utf8" }).trim();
const http = async (m, p, { token, body, key = PUB } = {}) => {
  const r = await fetch(API + p, { method: m, headers: { apikey: key, ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body && JSON.stringify(body) });
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
const rpc = (n, b, t) => http("POST", `/rest/v1/rpc/${n}`, { token: t, body: b });
const log = [];
const check = (name, ok, detail) => log.push(`${ok ? "ok  " : "FAIL"} ${name} :: ${JSON.stringify(detail).slice(0, 240)}`);

// 1. sign-out revokes console access for the issued token
const t1 = await aal2(A["qa-analyst"]);
let r = await rpc("admin_dashboard_overview", {}, t1);
check("analyst aal2 token reads the dashboard", r.status === 200, r.status);
r = await http("POST", "/auth/v1/logout?scope=local", { token: t1 });
check("sign-out accepted", r.status === 204, r.status);
r = await rpc("admin_dashboard_overview", {}, t1);
check("the same unexpired token is refused console access after sign-out", r.status >= 400, r);

// 3. role removal takes effect on an issued token (stale permission)
const t3 = await aal2(A["qa-operations"]);
r = await rpc("admin_session_state", {}, t3);
check("operations token holds operations.write before removal", Array.isArray(r.json?.permissions) && r.json.permissions.includes("operations.write"), r.json?.permissions);
const keep = psql(`select admin_role from public.admin_role_assignments where user_id='${A["qa-operations"].id}'`);
psql(`delete from public.admin_role_assignments where user_id='${A["qa-operations"].id}'`);
r = await rpc("admin_cancel_booking", { p_booking_id: "00000000-0000-0000-0000-0000000000a1", p_reason: "QA stale permission probe" }, t3);
check("after the console role is removed, the issued token is refused a console command", r.status === 403, r);
psql(`insert into public.admin_role_assignments (user_id, admin_role, reason) values ('${A["qa-operations"].id}', '${keep}', 'QA release-gate throw-away console account (restored after the stale-permission probe)')`);
r = await rpc("admin_session_state", {}, t3);
check("restored for the remaining probes", r.json?.console_role === keep, r.json?.console_role);

// 2. step-up window: a token whose authenticator code is older than 5 minutes
const t2 = await aal2(A["qa-owner-a"]);
const minted = new Date().toISOString();
r = await rpc("admin_request_payout_hold", { p_provider_id: "00000000-0000-0000-0000-0000000000a1", p_action: "place", p_reason: "QA step-up window probe, fresh" }, t2);
check("fresh code: the step-up command passes the step-up check (reaches the provider lookup)", r.status !== 403 && r.json?.hint !== "step_up_required", r);
await sleep(5 * 60 * 1000 + 20000);
r = await rpc("admin_request_payout_hold", { p_provider_id: "00000000-0000-0000-0000-0000000000a1", p_action: "place", p_reason: "QA step-up window probe, stale" }, t2);
check("code older than 5 minutes: refused with hint step_up_required", r.status === 403 && r.json?.hint === "step_up_required", r);
r = await rpc("admin_dashboard_overview", {}, t2);
check("the same aal2 session still reads (step-up applies to sensitive commands only)", r.status === 200, r.status);

const out = [`session revocation, stale permission and step-up window probe, token minted ${minted}, finished ${new Date().toISOString()}, ${API}`, ...log,
  `${log.filter((l) => l.startsWith("ok")).length}/${log.length} passed`];
writeFileSync(`${ROOT}/.admin-console/evidence/qa-release/session-and-step-up-live.txt`, out.join("\n") + "\n");
console.log(out.join("\n"));
