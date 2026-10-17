// QA release-gate browser harness (qa-release-claude, 2026-10-17).
//
// Drives a real headless Chrome over the DevTools protocol against the LOCAL app and the LOCAL Supabase stack only.
// It refuses to run if the app or API address is not local, and it records every request host so a request to any
// non-local host (the hosted Supabase project in particular) is reported as a failure.
//
//   node qa-browser-harness.mjs <phase> [routeFilter]
//   phases: a11y   axe-core (WCAG 2.0/2.1/2.2 A+AA tags) + horizontal-overflow + console errors, EN/AR x 1440/375
//           keys   keyboard: Tab order, visible focus, skip link, phone drawer open/Escape/focus return
//           states loading (held requests), empty (real responses emptied), error (503), refused (403/42501)
//           roles  real console roles (analyst, finance, operations) and a customer account on every admin route
//           perf   navigation timing, LCP and data-settled time (3 runs per route) against QA_APP
//
// Sessions: aal2 sessions are minted from GoTrue with the account password and a TOTP code computed from the factor
// secret stored in the local auth.mfa_factors table, then placed in the page's storage under the supabase-js key.
// Accounts: supabase/.temp/qa-release-accounts.json (gitignored), created by the QA account script.

import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";

const ROOT = "C:/Users/Yousif's PC/Desktop/Ai Projects/primora-fix";
const OUT = `${ROOT}/.admin-console/evidence/qa-release`;
const APP = process.env.QA_APP || "http://localhost:3100";
const API = "http://127.0.0.1:54321";
const PUB = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = process.env.QA_PROFILE_DIR;
const PORT = Number(process.env.QA_CDP_PORT || 9333);
const STORAGE_KEY = "sb-127-auth-token";
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;
if (!LOCAL.test(APP) || !LOCAL.test(API)) throw new Error(`refusing: ${APP} / ${API} is not local`);
if (!PROFILE) throw new Error("set QA_PROFILE_DIR to a scratch directory for the browser profile");

const phase = process.argv[2];
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const accounts = JSON.parse(readFileSync(`${ROOT}/supabase/.temp/qa-release-accounts.json`, "utf8"));

// ---------- screens under test (manifest screens[], route and the account that legitimately opens it) ----------
const ADMIN = ["/admin", "/admin/providers", "/admin/ledger", "/admin/services", "/admin/integrations", "/admin/coupons", "/admin/bookings",
  "/admin/customers", "/admin/branches", "/admin/disputes", "/admin/activity", "/admin/employees", "/admin/reviews", "/admin/taxes",
  "/admin/settings", "/admin/reports", "/admin/packages", "/admin/notifications", "/admin/help", "/admin/supply", "/admin/refunds",
  "/admin/audit-logs", "/admin/platform-rules", "/admin/roles", "/admin/sponsored", "/admin/whatsapp", "/admin/privacy",
  "/admin/incidents", "/admin/ropa", "/admin/approvals", "/admin/reconciliation"];
const SCREENS = [
  ...ADMIN.map((route) => ({ route, as: "owner" })),
  { route: "/provider/inventory", as: "provider" }, { route: "/provider/chain", as: "provider" }, { route: "/provider/pricing", as: "provider" },
  { route: "/customer/privacy", as: "customer" }, { route: "/become-provider", as: "customer" }, { route: "/privacy", as: "anon" },
  { route: "/login/mfa", as: "mfa-pending" },
].filter((s) => !filter || filter.test(s.route));

// ---------- GoTrue sessions ----------
async function http(method, path, { token, key = PUB, body } = {}) {
  const r = await fetch(`${API}${path}`, { method, headers: { apikey: key, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, json: j };
}
const psql = (sql) => execFileSync("docker", ["exec", "-i", "supabase_db_beauty_grooming_marketplace", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" }).trim();
function totp(secretBase32, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest(); const o = h[h.length - 1] & 0x0f;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
async function passwordSession(email, password) {
  const s = await http("POST", "/auth/v1/token?grant_type=password", { body: { email, password } });
  if (s.status !== 200) throw new Error(`sign-in ${email}: ${JSON.stringify(s.json)}`);
  return s.json;
}
async function aal2Session(acct) {
  const s = await passwordSession(acct.email, acct.password);
  const row = psql(`select id||'|'||secret from auth.mfa_factors where user_id='${acct.id}' and factor_type='totp' order by (status='verified') desc, created_at desc limit 1`);
  const [factorId, secret] = row.split("|");
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await http("POST", `/auth/v1/factors/${factorId}/challenge`, { token: s.access_token, body: {} });
    const v = await http("POST", `/auth/v1/factors/${factorId}/verify`, { token: s.access_token, body: { challenge_id: c.json.id, code: totp(secret) } });
    if (v.status === 200) return v.json;
    await sleep(31000 - (Date.now() % 30000));
  }
  throw new Error(`TOTP verify failed for ${acct.email}`);
}
async function sessionFor(as) {
  if (as === "anon") return null;
  if (as === "customer") return passwordSession(accounts["qa-customer"].email, accounts["qa-customer"].password);
  if (as === "provider") return passwordSession("faisal@elitebarber.sa", "Smoke-Test-Only-1!");
  if (as === "mfa-pending") return passwordSession(accounts["qa-operations"].email, accounts["qa-operations"].password);
  const map = { owner: "qa-owner-a", owner2: "qa-owner-b", finance: "qa-finance", operations: "qa-operations", analyst: "qa-analyst" };
  return aal2Session(accounts[map[as]]);
}

// ---------- DevTools protocol ----------
class Browser {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.listeners = new Set(); }
  open() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
      } else for (const l of this.listeners) l(msg);
    };
    return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}
async function launch() {
  mkdirSync(PROFILE, { recursive: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); const b = new Browser(v.webSocketDebuggerUrl); await b.open(); b.proc = proc; return b; } catch { await sleep(250); }
  }
  throw new Error("chrome did not start");
}
async function newPage(browser) {
  const { browserContextId } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true });
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const page = { sessionId, targetId, browserContextId, inflight: new Set(), hosts: new Set(), consoleErrors: [], failed: [], loaded: false, handlers: [] };
  page.send = (m, p) => browser.send(m, p, sessionId);
  browser.listeners.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params || {};
    switch (msg.method) {
      case "Network.requestWillBeSent": page.inflight.add(p.requestId); try { page.hosts.add(new URL(p.request.url).origin); } catch { /* data: urls */ } break;
      case "Network.loadingFinished": page.inflight.delete(p.requestId); break;
      case "Network.loadingFailed": page.inflight.delete(p.requestId); if (!p.canceled) page.failed.push(p.errorText); break;
      case "Page.loadEventFired": page.loaded = true; break;
      case "Runtime.consoleAPICalled": if (p.type === "error") page.consoleErrors.push("console.error: " + (p.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)); break;
      case "Runtime.exceptionThrown": page.consoleErrors.push("exception: " + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "").slice(0, 300)); break;
      case "Log.entryAdded": if (p.entry.level === "error") page.consoleErrors.push(`log(${p.entry.source}): ${p.entry.text.slice(0, 200)} ${p.entry.url || ""}`.slice(0, 400)); break;
    }
    for (const h of page.handlers) h(msg);
  });
  for (const d of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) await page.send(d);
  return page;
}
async function evaluate(page, expression, awaitPromise = true) {
  const r = await page.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error("evaluate: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}
async function viewport(page, width) {
  const mobile = width < 768;
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: mobile ? 812 : 900, deviceScaleFactor: 1, mobile });
}
async function go(page, url, { settle = 1000, max = 25000 } = {}) {
  page.loaded = false; page.consoleErrors = []; page.failed = []; page.inflight.clear();
  const t0 = Date.now();
  await page.send("Page.navigate", { url });
  while (!page.loaded && Date.now() - t0 < max) await sleep(50);
  let idleSince = Date.now();
  while (Date.now() - t0 < max) {
    if (page.inflight.size === 0) { if (Date.now() - idleSince >= settle) break; } else idleSince = Date.now();
    await sleep(100);
  }
  return Date.now() - t0;
}
async function prime(page, session, lang) {
  await go(page, `${APP}/file.svg`, { settle: 100 }); // a public static file: /robots.txt and /sitemap.xml break the webpack dev compiler on this path
  await evaluate(page, `(() => { localStorage.clear(); ${session ? `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(session))});` : ""} localStorage.setItem("primora_lang", ${JSON.stringify(lang)}); return true; })()`);
}
async function setLang(page, lang) { await evaluate(page, `localStorage.setItem("primora_lang", ${JSON.stringify(lang)}); true`); }
async function shot(page, file, quality = 45) {
  const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality });
  writeFileSync(file, Buffer.from(data, "base64"));
}
const AXE = readFileSync(`${ROOT}/node_modules/axe-core/axe.min.js`, "utf8");
const AXE_RUN = `axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] })
  .then((r) => ({ violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
    targets: v.nodes.slice(0, 4).map((n) => n.target.join(" ").slice(0, 140)), summary: (v.nodes[0]?.failureSummary || "").slice(0, 260) })),
    passes: r.passes.length, incomplete: r.incomplete.length, url: location.pathname }))`;
const LAYOUT = `(() => { const de = document.documentElement; const vw = window.innerWidth; const sw = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const offenders = [];
  if (sw > vw + 1) { for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) { let p = el.parentElement, clipped = false; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { clipped = true; break; } p = p.parentElement; }
      if (!clipped) offenders.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + " " + String(el.className || "").slice(0, 70) + " [" + Math.round(r.left) + "," + Math.round(r.right) + "]"); if (offenders.length > 6) break; } } }
  const main = document.querySelector("main") || document.body;
  return { vw, sw, overflow: sw > vw + 1, offenders, dir: de.dir, lang: de.lang, path: location.pathname, title: document.title,
    text: (main.innerText || "").replace(/\\s+/g, " ").slice(0, 600),
    alerts: [...document.querySelectorAll('[role="alert"],[role="status"],[aria-live]')].map((e) => (e.innerText || "").replace(/\\s+/g, " ").trim()).filter(Boolean).slice(0, 6).map((s) => s.slice(0, 220)),
    busy: document.querySelectorAll('[aria-busy="true"],[role="progressbar"],.animate-spin,.animate-pulse').length,
    latin: (() => { if (de.lang !== "ar") return null; const t = (main.innerText || ""); const words = t.match(/\\b[A-Za-z]{4,}\\b/g) || []; return words.slice(0, 40); })() }; })()`;
const nonLocalHosts = (page) => [...page.hosts].filter((h) => h.startsWith("http") && !LOCAL.test(h + "/"));

// ---------- request interception for state checks ----------
const KEEP = /rpc\/admin_session_state|profiles\?select=(role|first_name)|\/auth\/v1\//;
async function intercept(page, mode) {
  page.handlers = [];
  if (!mode) { await page.send("Fetch.disable"); return; }
  const stage = mode === "empty" ? "Response" : "Request";
  await page.send("Fetch.enable", { patterns: [{ urlPattern: `${API}/rest/v1/*`, requestStage: stage }] });
  page.handlers.push(async (msg) => {
    if (msg.method !== "Fetch.requestPaused") return;
    const p = msg.params; const url = p.request.url;
    const cors = [{ name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: "*" }, { name: "access-control-expose-headers", value: "content-range" }];
    try {
      if (p.request.method === "OPTIONS" || KEEP.test(url)) return void (await page.send("Fetch.continueRequest", { requestId: p.requestId }));
      if (mode === "loading") { await sleep(6000); return void (await page.send("Fetch.continueRequest", { requestId: p.requestId })); }
      if (mode === "error") return void (await page.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 503, responseHeaders: cors, body: Buffer.from(JSON.stringify({ code: "PGRST000", message: "service unavailable (QA injected)", details: null, hint: null })).toString("base64") }));
      if (mode === "refused") return void (await page.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 403, responseHeaders: cors, body: Buffer.from(JSON.stringify({ code: "42501", message: "permission denied (QA injected)", details: null, hint: null })).toString("base64") }));
      if (mode === "empty") {
        if ((p.responseStatusCode || 0) >= 300) return void (await page.send("Fetch.continueRequest", { requestId: p.requestId }));
        const { body, base64Encoded } = await page.send("Fetch.getResponseBody", { requestId: p.requestId });
        let json; try { json = JSON.parse(base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body); } catch { return void (await page.send("Fetch.continueRequest", { requestId: p.requestId })); }
        const empty = (v) => Array.isArray(v) ? [] : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? [] : (/^(total|count|total_count|row_count)$/.test(k) && typeof x === "number") ? 0 : x])) : v;
        const headers = (p.responseHeaders || []).filter((h) => !/^(content-length|content-range|content-encoding)$/i.test(h.name)).concat([{ name: "content-range", value: "*/0" }]);
        return void (await page.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: headers, body: Buffer.from(JSON.stringify(empty(json))).toString("base64") }));
      }
    } catch (e) { /* the page navigated away */ }
  });
}

// ---------- phases ----------
async function main() {
  const browser = await launch();
  const results = [];
  const started = new Date().toISOString();
  const pages = {};
  const pageFor = async (as, lang = "en") => {
    if (!pages[as]) { pages[as] = await newPage(browser); pages[as].session = await sessionFor(as); await prime(pages[as], pages[as].session, lang); }
    await setLang(pages[as], lang);
    return pages[as];
  };
  try {
    if (phase === "a11y") {
      mkdirSync(`${OUT}/a11y-shots`, { recursive: true });
      for (const s of SCREENS) for (const lang of ["en", "ar"]) for (const width of [1440, 375]) {
        const page = await pageFor(s.as, lang); await viewport(page, width);
        const ms = await go(page, APP + s.route);
        await evaluate(page, AXE + ";true", false);
        const axe = await evaluate(page, AXE_RUN);
        const layout = await evaluate(page, LAYOUT);
        const name = `${s.route.replace(/\//g, "_") || "_root"}-${lang}-${width}`;
        if (axe.violations.length || layout.overflow || layout.path !== s.route) await shot(page, `${OUT}/a11y-shots/${name}.jpg`, 35);
        results.push({ route: s.route, as: s.as, lang, width, loadMs: ms, landed: layout.path, axe, layout: { ...layout, text: layout.text.slice(0, 240) }, consoleErrors: page.consoleErrors, failed: page.failed, nonLocalHosts: nonLocalHosts(page) });
        console.log(`${s.route} ${lang} ${width}: axe ${axe.violations.map((v) => v.id + "(" + v.nodes + ")").join(",") || "clean"} overflow=${layout.overflow} landed=${layout.path} console=${page.consoleErrors.length}`);
      }
    }
    if (phase === "keys") {
      for (const s of SCREENS) {
        const page = await pageFor(s.as, "en"); await viewport(page, 1440);
        await go(page, APP + s.route);
        await evaluate(page, "document.activeElement && document.activeElement.blur(); window.scrollTo(0,0); true");
        const stops = [];
        const tab = async () => {
          await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
          await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
          await sleep(60);
          return evaluate(page, `(() => { const e = document.activeElement; if (!e || e === document.body) return { tag: "body" };
            const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
            const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
            return { tag: e.tagName.toLowerCase(), role: e.getAttribute("role"), inMain: !!e.closest("main,#admin-main"), name: (e.getAttribute("aria-label") || e.textContent || e.value || e.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 50),
              focusVisible: e.matches(":focus-visible"), ring, onScreen: r.bottom > 0 && r.top < innerHeight + 2000 && r.width > 0 }; })()`);
        };
        // Reach the skip link (the dev overlay may take the first stop), follow it, then walk the page content.
        let skip = null;
        for (let i = 0; i < 4 && !skip; i++) { const st = await tab(); if (/skip/i.test(st.name || "")) skip = st; }
        if (skip) {
          await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
          await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
          await sleep(200);
        }
        for (let i = 0; i < 30; i++) { const st = await tab(); if (st.tag !== "nextjs-portal") stops.push(st); }
        let drawer = null;
        if (s.route.startsWith("/admin")) {
          await viewport(page, 375); await go(page, APP + s.route);
          drawer = await evaluate(page, `(async () => { const t = document.querySelector('button[aria-label="Open navigation"]'); if (!t) return { toggle: false };
            t.focus(); return { toggle: true, expanded: t.getAttribute("aria-expanded") }; })()`);
          if (drawer.toggle) {
            await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: String.fromCharCode(13) });
            await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
            await sleep(400);
            drawer.afterOpen = await evaluate(page, `(() => { const e = document.activeElement; const t = document.querySelector('button[aria-label="Open navigation"]'); return { inDrawer: !!(e && e.closest('[role="dialog"],#admin-mobile-drawer,aside')), expanded: t && t.getAttribute("aria-expanded"), focused: (e && (e.textContent || e.getAttribute("aria-label") || e.tagName)).trim().slice(0, 40) }; })()`);
            await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
            await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
            await sleep(400);
            drawer.afterEscape = await evaluate(page, `(() => { const e = document.activeElement; return { focusedToggle: !!(e && e.getAttribute("aria-label") === "Open navigation"), dialogOpen: !!document.querySelector('[role="dialog"][aria-modal="true"]') }; })()`);
          }
        }
        const visible = stops.filter((x) => x.tag !== "body");
        const noRing = visible.filter((x) => !x.ring);
        const firstName = visible[0]?.name || "";
        const inMain = visible.filter((x) => x.inMain).length;
        results.push({ route: s.route, as: s.as, skipLink: !!skip, stops, firstAfterSkip: firstName, inMain, noVisibleRing: noRing.length, noRingNames: noRing.map((x) => `${x.tag}:${x.name}`).slice(0, 8), reached: visible.length, drawer });
        console.log(`${s.route}: skip=${!!skip} firstAfterSkip="${firstName}" reached=${visible.length} inMain=${inMain} noRing=${noRing.length} ${JSON.stringify(noRing.map((x) => x.name).slice(0, 4))} drawer=${JSON.stringify(drawer)}`);
      }
    }
    if (phase === "states") {
      mkdirSync(`${OUT}/state-shots`, { recursive: true });
      for (const s of SCREENS) {
        if (s.as === "anon" || s.as === "mfa-pending") continue;
        const page = await pageFor(s.as, "en"); await viewport(page, 1440);
        const entry = { route: s.route, as: s.as };
        for (const mode of ["loading", "empty", "error", "refused"]) {
          await intercept(page, mode);
          if (mode === "loading") {
            page.loaded = false; page.inflight.clear();
            await page.send("Page.navigate", { url: APP + s.route });
            const t0 = Date.now(); while (!page.loaded && Date.now() - t0 < 20000) await sleep(50);
            await sleep(1800);
            entry.loading = await evaluate(page, LAYOUT);
            await shot(page, `${OUT}/state-shots/${s.route.replace(/\//g, "_")}-loading.jpg`, 35);
            await sleep(6500);
          } else {
            await go(page, APP + s.route, { settle: 1200 });
            entry[mode] = await evaluate(page, LAYOUT);
            await shot(page, `${OUT}/state-shots/${s.route.replace(/\//g, "_")}-${mode}.jpg`, 35);
          }
          entry[mode].consoleErrors = page.consoleErrors.length;
          await intercept(page, null);
        }
        results.push(entry);
        console.log(`${s.route}: loading busy=${entry.loading.busy} | empty "${entry.empty.text.slice(0, 80)}" | error alerts=${entry.error.alerts.length} | refused alerts=${entry.refused.alerts.length}`);
      }
    }
    if (phase === "roles") {
      mkdirSync(`${OUT}/role-shots`, { recursive: true });
      for (const as of ["analyst", "finance", "operations", "customer"]) {
        for (const route of ADMIN.filter((r) => !filter || filter.test(r))) {
          const page = await pageFor(as, "en"); await viewport(page, 1440);
          await go(page, APP + route, { settle: 1200 });
          const layout = await evaluate(page, LAYOUT);
          const nav = await evaluate(page, `[...document.querySelectorAll('nav a[href^="/admin"]')].map((a) => a.getAttribute("href"))`);
          const buttons = await evaluate(page, `[...document.querySelectorAll("main button:not([disabled])")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 40)).filter(Boolean).slice(0, 30)`);
          results.push({ as, route, landed: layout.path, alerts: layout.alerts, text: layout.text.slice(0, 300), nav, enabledButtons: buttons, consoleErrors: page.consoleErrors });
          if (/forbidden|cannot open|not allowed|لا يمكن|غير مسموح/i.test(layout.text) || layout.path !== route) await shot(page, `${OUT}/role-shots/${as}${route.replace(/\//g, "_")}.jpg`, 35);
          console.log(`${as} ${route} -> ${layout.path} alerts=${JSON.stringify(layout.alerts).slice(0, 160)} buttons=${buttons.length}`);
        }
      }
    }
    if (phase === "workflow") {
      // Critical workflow through the real UI, two roles: sign in with password, pass /login/mfa with an authenticator code,
      // open Approvals, decide a pending payout-hold request made by another console account, and confirm the result after a
      // reload and in the database. Requests are created through the API by the other account (owner asks, finance decides;
      // then finance asks to lift, owner decides), so each decision is made by a different person than the request.
      mkdirSync(`${OUT}/workflow-shots`, { recursive: true });
      const PROVIDER = "a0000000-0000-0000-0000-000000000002";
      const rpcAs = async (key, name, body) => { const t = (await aal2Session(accounts[key])).access_token; return http("POST", `/rest/v1/rpc/${name}`, { token: t, body }); };
      const typeInto = async (page, selector, text) => {
        const ok = await evaluate(page, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.focus(); e.select && e.select(); return true; })()`);
        if (!ok) throw new Error("no field " + selector);
        await page.send("Input.insertText", { text });
      };
      const press = async (page, key, code, vk, text) => { await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); };
      const waitPath = async (page, re, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await evaluate(page, "location.pathname"); if (re.test(p)) return p; await sleep(250); } return evaluate(page, "location.pathname"); };
      const uiSignIn = async (key, label) => {
        const page = await newPage(browser); await viewport(page, 1440);
        await go(page, `${APP}/file.svg`, { settle: 100 });
        await evaluate(page, `localStorage.clear(); localStorage.setItem("primora_lang", "en"); true`);
        await go(page, `${APP}/login`, { settle: 800 });
        // The sign-in screen opens on the phone method; switch to e-mail the way an operator does.
        await evaluate(page, `(() => { const b = [...document.querySelectorAll("button[aria-pressed]")].find((x) => /mail/i.test(x.innerText)); if (b) b.click(); return !!b; })()`);
        await sleep(400);
        await typeInto(page, 'input[type="email"]', accounts[key].email);
        await typeInto(page, 'input[type="password"]', accounts[key].password);
        await press(page, "Enter", "Enter", 13, String.fromCharCode(13));
        const mfa = await waitPath(page, /^\/login\/mfa/);
        await sleep(800);
        const secret = psql(`select secret from auth.mfa_factors where user_id='${accounts[key].id}' and status='verified' order by created_at desc limit 1`);
        await typeInto(page, 'input[autocomplete="one-time-code"]', totp(secret));
        await press(page, "Enter", "Enter", 13, String.fromCharCode(13));
        const landed = await waitPath(page, /^\/admin/);
        await sleep(1500);
        await shot(page, `${OUT}/workflow-shots/${label}-signed-in.jpg`, 45);
        return { page, mfa, landed };
      };
      const decideInUi = async (page, label, reasonText, decisionReason) => {
        await go(page, `${APP}/admin/approvals`, { settle: 1500 });
        const opened = await evaluate(page, `(() => { const row = [...document.querySelectorAll("main tbody tr")].find((r) => r.innerText.includes(${JSON.stringify(reasonText)})); if (!row) return "no row";
          const b = [...row.querySelectorAll("button")].find((x) => x.innerText.trim() === "Approve"); if (!b) return "no approve button: " + row.innerText.replace(/\\s+/g, " ").slice(0, 200); b.click(); return "clicked"; })()`);
        await sleep(800);
        const dialog = await evaluate(page, `(() => { const d = document.querySelector('[role="dialog"],[role="alertdialog"]'); return d ? d.innerText.replace(/\\s+/g, " ").slice(0, 300) : null; })()`);
        await typeInto(page, '[role="dialog"] textarea, [role="alertdialog"] textarea', decisionReason);
        await shot(page, `${OUT}/workflow-shots/${label}-dialog.jpg`, 45);
        const confirm = await evaluate(page, `(() => { const d = document.querySelector('[role="dialog"],[role="alertdialog"]'); const b = [...d.querySelectorAll("button")].filter((x) => /^Approve/.test(x.innerText.trim())).pop(); if (!b) return "no confirm"; b.click(); return b.innerText.trim(); })()`);
        await sleep(3500);
        const after = await evaluate(page, LAYOUT);
        await shot(page, `${OUT}/workflow-shots/${label}-after-approve.jpg`, 45);
        await go(page, `${APP}/admin/approvals`, { settle: 1500 });
        const pendingRowLeft = await evaluate(page, `[...document.querySelectorAll("main tbody tr")].some((r) => r.innerText.includes(${JSON.stringify(reasonText)}))`);
        return { opened, dialog, confirm, alerts: after.alerts, consoleErrors: page.consoleErrors.slice(0, 5), pendingRowStillListed: pendingRowLeft };
      };
      const holdActive = () => psql(`select public.provider_payout_hold_active('${PROVIDER}')`);
      const placeReason = `QA UI workflow ${Date.now()}: place hold, ticket QA-1017`;
      const asked = await rpcAs("qa-owner-a", "admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "place", p_reason: placeReason });
      const placeShown = psql(`select request_reason from public.admin_approval_requests where id='${asked.json?.approval_id}'`); // a replayed request keeps its first reason
      const fin = await uiSignIn("qa-finance", "finance");
      const finDecision = await decideInUi(fin.page, "finance", placeShown, "Finance approves the QA hold in the UI");
      const placed = holdActive();
      const liftReason = `QA UI workflow ${Date.now()}: lift hold, ticket QA-1017`;
      const asked2 = await rpcAs("qa-finance", "admin_request_payout_hold", { p_provider_id: PROVIDER, p_action: "lift", p_reason: liftReason });
      const liftShown = psql(`select request_reason from public.admin_approval_requests where id='${asked2.json?.approval_id}'`);
      const own = await uiSignIn("qa-owner-a", "owner");
      const ownDecision = await decideInUi(own.page, "owner", liftShown, "Owner approves lifting the QA hold in the UI");
      const lifted = holdActive();
      const audit = psql(`select string_agg(action || ':' || coalesce(actor_id::text, ''), ' ; ' order by created_at) from public.admin_audit_logs where target_id in ('${asked.json?.approval_id}', '${asked2.json?.approval_id}') and action like 'approval.%'`);
      results.push({ asked: asked.json, finance: { ...fin, page: undefined, decision: finDecision }, holdAfterFinanceApproval: placed, asked2: asked2.json, owner: { ...own, page: undefined, decision: ownDecision }, holdAfterOwnerApproval: lifted, audit });
      console.log(JSON.stringify(results[results.length - 1], null, 1).slice(0, 3000));
    }
    if (phase === "focusring") {
      // Follow-up to the keys phase: the date and search inputs where no outline or shadow was read after Tab.
      mkdirSync(`${OUT}/focusring-shots`, { recursive: true });
      for (const route of ["/admin/reports", "/admin/bookings", "/admin/audit-logs"]) {
        const page = await pageFor("owner", "en"); await viewport(page, 1440);
        await go(page, APP + route, { settle: 1200 });
        await evaluate(page, "document.activeElement && document.activeElement.blur(); true");
        let found = null;
        for (let i = 0; i < 60 && !found; i++) {
          await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
          await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
          await sleep(120);
          found = await evaluate(page, `(() => { const e = document.activeElement; if (!e || e.tagName !== "INPUT" || !e.closest("main")) return null;
            const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
            return { type: e.type, focusVisible: e.matches(":focus-visible"), outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, border: cs.borderColor, shadow: cs.boxShadow, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; })()`);
        }
        if (found) {
          const [x, y, w, h] = found.box;
          const { data } = await page.send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, x - 12), y: Math.max(0, y - 12), width: w + 24, height: h + 24, scale: 2 } });
          writeFileSync(`${OUT}/focusring-shots/${route.replace(/\//g, "_")}-focused-input.png`, Buffer.from(data, "base64"));
        }
        results.push({ route, found });
        console.log(route, JSON.stringify(found));
      }
    }
    if (phase === "falsesuccess") {
      // A console role without the table's permission presses a write control. The row policy matches no row, PostgREST
      // answers 200 with nothing changed; the screen must say the change was refused, and a reload must agree with it.
      mkdirSync(`${OUT}/falsesuccess-shots`, { recursive: true });
      const cases = [
        { as: "analyst", route: "/admin/services", button: /^(INACTIVE|ACTIVE)$/i, confirm: null, read: `[...document.querySelectorAll("main tbody tr")][0]?.innerText.replace(/\\s+/g, " ").slice(0, 160)` },
        { as: "analyst", route: "/admin/branches", button: /^TOGGLE$/i, confirm: /^(Deactivate|Reactivate)$/i, read: `(document.querySelector("main")?.innerText || "").replace(/\\s+/g, " ").slice(0, 400)` },
        { as: "finance", route: "/admin/integrations", button: /^DISABLE$/i, confirm: /^(Disable|Confirm|DISABLE)$/i, read: `(document.querySelector("main")?.innerText || "").replace(/\\s+/g, " ").slice(0, 400)` },
      ];
      for (const c of cases) {
        const page = await pageFor(c.as, "en"); await viewport(page, 1440);
        await go(page, APP + c.route, { settle: 1200 });
        const before = await evaluate(page, c.read);
        const clicked = await evaluate(page, `(() => { const b = [...document.querySelectorAll("main button:not([disabled])")].find((x) => ${c.button}.test((x.innerText || "").trim())); if (!b) return null; b.click(); return (b.innerText || "").trim(); })()`);
        await sleep(900);
        let confirmed = null;
        if (c.confirm) confirmed = await evaluate(page, `(() => { const d = document.querySelector('[role="dialog"],[role="alertdialog"]'); if (!d) return "no dialog"; const b = [...d.querySelectorAll("button")].find((x) => ${c.confirm}.test((x.innerText || "").trim())); if (!b) return "no confirm: " + [...d.querySelectorAll("button")].map((x) => x.innerText.trim()).join("|"); b.click(); return b.innerText.trim(); })()`);
        await sleep(2500);
        const after = await evaluate(page, LAYOUT);
        const afterRow = await evaluate(page, c.read);
        await shot(page, `${OUT}/falsesuccess-shots/${c.as}${c.route.replace(/\//g, "_")}-after-click.jpg`, 45);
        await go(page, APP + c.route, { settle: 1200 });
        const reloaded = await evaluate(page, c.read);
        results.push({ ...c, button: String(c.button), confirm: String(c.confirm), clicked, confirmed, before, afterRow, alertsAfterClick: after.alerts, textAfterClick: after.text.slice(0, 300), reloaded });
        console.log(`${c.as} ${c.route}: clicked=${clicked} confirm=${confirmed} alerts=${JSON.stringify(after.alerts)}\n  before:   ${before}\n  after:    ${afterRow}\n  reloaded: ${reloaded}`);
      }
    }
    if (phase === "perf") {
      for (const s of SCREENS) {
        const runs = [];
        for (let i = 0; i < 3; i++) {
          const page = await pageFor(s.as, "en"); await viewport(page, 1440);
          await page.send("Network.setCacheDisabled", { cacheDisabled: i === 0 });
          const settled = await go(page, APP + s.route, { settle: 500 });
          const t = await evaluate(page, `new Promise((res) => { const n = performance.getEntriesByType("navigation")[0]; let lcp = 0;
            try { new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = Math.max(lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
            setTimeout(() => res({ ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), lcp: Math.round(lcp),
              requests: performance.getEntriesByType("resource").length, transferKB: Math.round(performance.getEntriesByType("resource").reduce((a, r) => a + (r.transferSize || 0), 0) / 1024) }), 300); })`);
          runs.push({ ...t, settledMs: settled - 500, cold: i === 0, consoleErrors: page.consoleErrors.length, landed: await evaluate(page, "location.pathname") });
        }
        const warm = runs.filter((r) => !r.cold);
        const med = (k) => Math.round(warm.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(warm.length / 2)]);
        results.push({ route: s.route, as: s.as, runs, warmMedian: { lcp: med("lcp"), load: med("load"), settledMs: med("settledMs") } });
        console.log(`${s.route}: warm LCP ${med("lcp")} ms, load ${med("load")} ms, data settled ${med("settledMs")} ms; cold LCP ${runs[0].lcp}`);
      }
    }
  } catch (e) {
    console.error("PHASE ERROR", e);
    results.push({ phaseError: String(e && e.stack || e).slice(0, 800) });
  } finally {
    const file = `${OUT}/browser-${phase}${filter ? "-" + process.argv[3].replace(/[^a-z0-9]+/gi, "_") : ""}${process.env.QA_SUFFIX || ""}.json`;
    writeFileSync(file, JSON.stringify({ phase, app: APP, api: API, started, ended: new Date().toISOString(), chrome: CHROME, axe: "axe-core 4.12.1 (node_modules)", results }, null, 1));
    console.log("wrote", file, results.length, "results");
    try { browser.proc.kill(); } catch { /* already gone */ }
    process.exit(0);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
