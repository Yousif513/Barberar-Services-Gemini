// QA release-gate: live maker-checker, replay and role checks on the approvals framework (qa-release-claude, 2026-10-17).
// Local stack only. Places and then lifts a payout hold on one seeded provider through two different console accounts,
// and tries every shortcut on the way: self-approval, approval by roles without the approver permission, a blank reason,
// replays, and direct table writes on the approvals and audit tables.
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
const rpc = (n, b, t) => http("POST", `/rest/v1/rpc/${n}`, { token: t, body: b });
const PROVIDER = "a0000000-0000-0000-0000-000000000002";
const holdActive = () => psql(`select public.provider_payout_hold_active('${PROVIDER}')`);
const log = [];
const check = (name, ok, detail) => log.push(`${ok ? "ok  " : "FAIL"} ${name} :: ${JSON.stringify(detail).slice(0, 260)}`);

const owner = await aal2(A["qa-owner-a"]);
const finance = await aal2(A["qa-finance"]);
const ops = await aal2(A["qa-operations"]);
const analyst = await aal2(A["qa-analyst"]);
const reason = "QA maker-checker live probe, ticket QA-1017";

check("precondition: provider not on hold", holdActive() === "f", holdActive());
let r = await rpc("admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "place", p_reason: "short" }, owner);
check("a 5-character reason is refused (a hold needs 10)", r.status === 400 && r.json?.code === "22023", r);
r = await rpc("admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "place", p_reason: reason }, ops);
check("operations cannot request a payout hold", r.status === 403 && r.json?.code === "42501", r);
r = await rpc("admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "place", p_reason: reason }, owner);
check("the owner's request returns pending_approval, not an effect", r.status === 200 && r.json?.status === "pending_approval" && r.json?.existing === false, r);
const approval = r.json?.approval_id;
check("no hold yet: one person executed nothing", holdActive() === "f", holdActive());
r = await rpc("admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "place", p_reason: reason }, owner);
check("a replayed request returns the same pending approval", r.json?.approval_id === approval && r.json?.existing === true, r);
const pending = psql(`select count(*) from public.admin_approval_requests where kind='payout_hold' and status='pending' and payload->>'provider_id'='${PROVIDER}'`);
check("exactly one pending approval exists for the target", pending === "1", pending);
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "self approval attempt" }, owner);
check("the requester cannot approve their own request", r.status === 403 && /own request/.test(r.json?.message), r);
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "analyst approval attempt" }, analyst);
check("the analyst cannot approve", r.status === 403, r);
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "operations approval attempt" }, ops);
check("operations (no money.payout) cannot approve", r.status === 403 && /cannot decide/.test(r.json?.message), r);
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "" }, finance);
check("an approval without a reason is refused", r.status === 400, r);
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "finance approves QA probe hold" }, finance);
check("finance approves and the hold executes in the approver's session", r.status === 200 && r.json?.status === "approved", r);
check("the hold is active after approval", holdActive() === "t", holdActive());
r = await rpc("admin_decide_approval", { p_request_id: approval, p_decision: "approve", p_reason: "finance replays approval" }, finance);
check("a replayed approval changes nothing", r.status === 200 && r.json?.unchanged === true, r);
const audit = psql(`select action||'|'||coalesce(actor_id::text,'')||'|'||coalesce(details->>'reason','') from public.admin_audit_logs where target_id='${approval}' order by created_at`);
check("audit: approval.requested by the owner and approval.approved by finance, each with its reason",
  audit.includes(`approval.requested|${A["qa-owner-a"].id}|${reason}`) && audit.includes(`approval.approved|${A["qa-finance"].id}|finance approves QA probe hold`), audit.split("\n"));

// Clean-up through the same four-eyes flow, with the roles reversed.
r = await rpc("admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "lift", p_reason: "QA probe clean-up, lift the probe hold" }, finance);
const lift = r.json?.approval_id;
r = await rpc("admin_decide_approval", { p_request_id: lift, p_decision: "approve", p_reason: "owner approves QA probe lift" }, owner);
check("the lift is approved by a different person and the hold is gone", r.json?.status === "approved" && holdActive() === "f", r);

// Direct table writes on the approvals and audit tables are refused to every console role.
for (const [who, t] of [["owner", owner], ["finance", finance]]) {
  const w = await http("PATCH", `/rest/v1/admin_approval_requests?id=eq.${approval}`, { token: t, body: { status: "pending" } });
  check(`${who}: a direct PATCH of an approval row changes nothing`, w.status >= 400 || (Array.isArray(w.json) && w.json.length === 0), { status: w.status, body: w.json });
  const d = await http("DELETE", `/rest/v1/admin_audit_logs?target_id=eq.${approval}`, { token: t });
  check(`${who}: a direct DELETE of audit rows is refused`, d.status >= 400 || (Array.isArray(d.json) && d.json.length === 0), { status: d.status, body: d.json });
  const i = await http("POST", "/rest/v1/admin_audit_logs", { token: t, body: { action: "forged.entry", target_type: "x", actor_id: A["qa-owner-b"].id } });
  check(`${who}: a forged audit INSERT naming another actor is refused`, i.status >= 400, { status: i.status, body: i.json });
}
const left = psql(`select count(*) from public.admin_audit_logs where target_id='${approval}'`);
check("the approval's audit rows are still present after the delete attempts", Number(left) >= 2, left);
const status = psql(`select status from public.admin_approval_requests where id='${approval}'`);
check("the approval row is still approved after the PATCH attempts", status === "approved", status);

const out = [`live maker-checker probe ${new Date().toISOString()} on ${API}, provider ${PROVIDER}, approval ${approval}, lift ${lift}`, ...log,
  `${log.filter((l) => l.startsWith("ok")).length}/${log.length} passed`];
writeFileSync(`${ROOT}/.admin-console/evidence/qa-release/maker-checker-live.txt`, out.join("\n") + "\n");
console.log(out.join("\n"));
