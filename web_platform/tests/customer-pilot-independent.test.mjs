import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import { PilotStore } from "../src/lib/customer-pilot/server/store.mjs";
import { handlePilot } from "../src/lib/customer-pilot/server/handler.mjs";

const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = () => { outbound++; throw Error("EXTERNAL_NETWORK_FORBIDDEN_IN_INDEPENDENT_TEST"); };
after(() => { globalThis.fetch = originalFetch; assert.equal(outbound, 0); });
const FIXED = new Date("2026-10-22T10:00:00Z");
const source = () => ({ sourceTitle: "Independent public fixture", sourceReference: "https://example.org/catalog", observedAt: "2026-10-22T09:00:00Z", providerId: "salon-actual-id", providerName: "Public fixture salon", services: [{ id: "service-actual-id", name: "Public fixture service", durationMinutes: 30, priceCents: 125075, staff: [{ id: "staff-actual-id", name: "Public fixture professional" }] }] });
const command = (type, payload, locale = "bn-BD", commandId = randomUUID()) => ({ commandId, type, payload, locale });
const requestPayload = catalog => ({ sourceId: catalog.id, catalogHash: catalog.versionHash, serviceId: catalog.services[0].id, staffId: catalog.services[0].staff[0].id, requestedDate: "2026-10-23", requestedTime: "09:30", notes: "" });
async function fixture(options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "primora-pilot-independent-"));
  const filePath = path.join(directory, "pilot.sqlite");
  let now = new Date(FIXED), store = new PilotStore({ filePath, clock: () => now });
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = `http://${options.normalized ? "localhost" : "127.0.0.1"}:${server.address().port}${incoming.url}`;
      const input = new Request(url, { method: incoming.method, headers: incoming.headers, ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: "half" }) });
      const result = await handlePilot(input, { store, env: options.env || { PRIMORA_PILOT_LOCAL_MODE: "enabled" } });
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch { outgoing.writeHead(500); outgoing.end("independent adapter failure"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port, origin = `http://127.0.0.1:${port}`;
  async function send(route = "/session", { method = "POST", value = {}, headers = {}, seat, chunks } = {}) {
    const baseHeaders = { origin, "content-type": "application/json", ...(seat ? { cookie: seat.cookie, "x-pilot-csrf": seat.session.csrf } : {}), ...headers };
    for (const name of Object.keys(baseHeaders)) if (baseHeaders[name] === null) delete baseHeaders[name];
    return new Promise((resolve, reject) => {
      const client = http.request({ hostname: "127.0.0.1", port, path: `/api/pilot${route}`, method, headers: baseHeaders }, response => {
        const pieces = [];
        response.on("data", bytes => pieces.push(bytes));
        response.on("end", () => { const text = Buffer.concat(pieces).toString("utf8"); let body; try { body = JSON.parse(text); } catch { body = { adapterBody: text }; } resolve({ status: response.statusCode, headers: response.headers, body }); });
      });
      client.on("error", reject);
      if (method === "GET" || method === "HEAD") client.end();
      else if (chunks) { for (const chunk of chunks) client.write(chunk); client.end(); }
      else client.end(JSON.stringify(value));
    });
  }
  async function seat() { const result = await send(); assert.equal(result.status, 200); const cookie = result.headers["set-cookie"][0].split(";", 1)[0]; return { cookie, session: result.body.session }; }
  async function execute(who, type, payload, extra = {}) { return send("/commands", { seat: who, value: { ...command(type, payload), ...extra } }); }
  async function catalog(who) { const result = await execute(who, "import-source", source()); assert.equal(result.status, 200); return store.state(store.getSession(who.cookie.split("=")[1])).catalogs.find(x => x.id === result.body.receipt.entityId); }
  return { filePath, directory, port, origin, send, seat, execute, catalog, get store() { return store; }, advance(date) { now = new Date(date); }, restart() { store.close(); store = new PilotStore({ filePath, clock: () => now }); }, async close() { await new Promise(resolve => server.close(resolve)); store.close(); const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith("primora-pilot-independent-")); rmSync(resolved, { recursive: true, force: true }); } };
}
const withFixture = (name, run, options) => test(name, async () => { const f = await fixture(options); try { await run(f); } finally { await f.close(); } });
const errorCode = result => result.body.error?.code;

withFixture("P-ID1 actual HTTP normalizes an authorized uppercase request UUID before persisting case linkage", async f => {
  const seat = await f.seat(), catalog = await f.catalog(seat);
  const request = await f.execute(seat, "record-request", requestPayload(catalog)); assert.equal(request.status, 200);
  const requestId = request.body.receipt.entityId;
  const result = await f.execute(seat, "open-case", { requestId: requestId.toUpperCase(), kind: "refund", reason: "Fixture review only", evidence: "" });
  assert.equal(result.status, 200);
  const state = await f.send("/state", { method: "GET", seat });
  assert.equal(state.body.data.cases[0].requestId, requestId);
  assert.equal(state.body.data.cases.filter(c => c.requestId === state.body.data.requests[0].id).length, 1);
});
withFixture("real HTTP accepts Next internal localhost only with matching actual loopback Host/Origin and port", async f => {
  const seat = await f.seat(); assert.ok(seat.session.workspaceId);
  for (const headers of [{ host: "foreign.example" }, { origin: "http://foreign.example" }, { host: "localhost:9999" }, { host: `127.0.0.1:${f.port}/path` }, { host: `127.0.0.1:${f.port}?query=1` }, { host: `127.0.0.1:${f.port}#fragment` }, { host: `user@localhost:${f.port}` }, { origin: null }, { "sec-fetch-site": "cross-site" }]) {
    const result = await f.send("/session", { headers }); assert.equal(result.status, 403); assert.equal(errorCode(result), "origin_forbidden");
  }
}, { normalized: true });
withFixture("real HTTP cookie purpose, CSRF binding and expiry cannot be replaced by another local seat or HQ bearer", async f => {
  const a = await f.seat(), b = await f.seat(), c = command("import-source", source());
  for (const headers of [{ "x-pilot-csrf": b.session.csrf }, { "x-pilot-csrf": null }, { cookie: `${a.cookie}; ${a.cookie}` }, { cookie: `volabi_session=${a.cookie.split("=")[1]}`, authorization: "Bearer public-marketplace-fixture" }]) {
    const result = await f.send("/commands", { seat: a, value: c, headers }); assert.ok([401, 403].includes(result.status));
  }
  assert.equal((await f.send("/state", { method: "GET", seat: a })).body.data.events.length, 0);
  f.advance("2026-11-22T10:00:01Z");
  assert.equal((await f.send("/state", { method: "GET", seat: a })).status, 401);
});
withFixture("real HTTP foreign sources, requests, cases and receipts stay scoped without financial dispatch", async f => {
  const a = await f.seat(), b = await f.seat(), catalog = await f.catalog(a);
  const created = await f.execute(a, "record-request", requestPayload(catalog)), requestId = created.body.receipt.entityId;
  const opened = await f.execute(a, "open-case", { requestId, kind: "complaint", reason: "Fixture", evidence: "" });
  for (const [type, payload] of [["record-request", requestPayload(catalog)], ["open-case", { requestId, kind: "refund", reason: "Fixture", evidence: "" }], ["append-case-note", { caseId: opened.body.receipt.entityId, expectedRevision: 1, kind: "appeal", text: "Fixture" }]]) assert.equal((await f.execute(b, type, payload)).status, 404);
  assert.equal((await f.send(`/commands/${created.body.receipt.commandId}`, { method: "GET", seat: b })).status, 404);
  for (const type of ["execute-refund", "capture-payment", "send-message", "activate-agent"]) assert.equal((await f.execute(a, type, { requestId })).status, 400);
  const state = (await f.send("/state", { method: "GET", seat: b })).body.data; assert.deepEqual(state.catalogs, []); assert.deepEqual(state.requests, []); assert.deepEqual(state.cases, []); assert.deepEqual(state.events, []);
});
withFixture("durable receipt survives database restart and locale change with exactly one material effect", async f => {
  const seat = await f.seat(), c = command("import-source", source(), "ur-PK");
  const first = await f.send("/commands", { seat, value: c }); assert.equal(first.status, 200); f.restart();
  const replay = await f.send("/commands", { seat, value: { ...c, locale: "hi-IN", payload: Object.fromEntries(Object.entries(c.payload).reverse()) } });
  assert.deepEqual(replay.body.receipt, first.body.receipt);
  assert.deepEqual((await f.send(`/commands/${c.commandId}`, { method: "GET", seat })).body.receipt, first.body.receipt);
  const conflict = await f.send("/commands", { seat, value: { ...c, payload: { ...c.payload, sourceTitle: "Changed material" } } }); assert.equal(conflict.status, 409); assert.equal(errorCode(conflict), "command_conflict");
  const state = (await f.send("/state", { method: "GET", seat })).body.data; assert.equal(state.catalogs.length, 1); assert.equal(state.events.length, 1);
});
withFixture("current source metadata change invalidates old review while historical local request remains exact", async f => {
  const seat = await f.seat(), old = await f.catalog(seat);
  const created = await f.execute(seat, "record-request", requestPayload(old)); assert.equal(created.status, 200);
  const before = (await f.send("/state", { method: "GET", seat })).body.data.requests[0];
  const revised = { ...source(), sourceTitle: "New observation provenance only", observedAt: "2026-10-22T09:30:00Z" };
  assert.equal((await f.execute(seat, "import-source", revised)).status, 200);
  const stale = await f.execute(seat, "record-request", requestPayload(old)); assert.equal(stale.status, 409); assert.equal(errorCode(stale), "stale_source");
  const state = (await f.send("/state", { method: "GET", seat })).body.data; assert.deepEqual(state.requests[0], before); assert.equal(state.catalogs.filter(c => c.current).length, 1); assert.equal(state.catalogs.find(c => c.id === old.id).current, false);
});
withFixture("invalid imports and impossible/future/past requests have no receipt or audit side effects", async f => {
  const seat = await f.seat();
  for (const change of [{ observedAt: "2026-02-30T09:00:00Z" }, { observedAt: "2026-10-22T10:06:00Z" }, { sourceReference: "https://user:pass@example.org/" }, { sourceReference: "https://example.org/?token=fixture" }, { services: [{ ...source().services[0], priceCents: -1 }] }, { services: [source().services[0], source().services[0]] }]) assert.equal((await f.execute(seat, "import-source", { ...source(), ...change })).status, 400);
  assert.equal((await f.send("/state", { method: "GET", seat })).body.data.events.length, 0);
  const catalog = await f.catalog(seat), base = requestPayload(catalog);
  for (const change of [{ requestedDate: "2027-02-29" }, { requestedDate: "2027-10-24" }, { requestedDate: "2026-10-22", requestedTime: "13:00" }, { requestedTime: "24:00" }, { requestedTime: "10:60" }, { staffId: "foreign-staff" }, { currency: "USD" }, { priceCents: 1 }, { paymentStatus: "captured" }]) {
    const c = command("record-request", { ...base, ...change }); const result = await f.send("/commands", { seat, value: c }); assert.equal(result.status, 400); assert.equal((await f.send(`/commands/${c.commandId}`, { method: "GET", seat })).status, 404);
  }
  const state = (await f.send("/state", { method: "GET", seat })).body.data; assert.equal(state.requests.length, 0); assert.equal(state.events.length, 1);
});
withFixture("actual chunked HTTP body limit applies without declared length and leaves no local command effect", async f => {
  const result = await f.send("/session", { chunks: [Buffer.from('{"padding":"'), Buffer.alloc(70000, 97), Buffer.alloc(70000, 98), Buffer.from('"}')] });
  assert.equal(result.status, 413); assert.equal(errorCode(result), "request_too_large"); assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM pilot_sessions").get().n, 0);
  assert.match(result.headers["cache-control"], /no-store/); assert.equal(result.headers["access-control-allow-origin"], undefined);
});
withFixture("case revision conflicts preserve input-independent history and minimize audit text", async f => {
  const seat = await f.seat(), catalog = await f.catalog(seat), request = await f.execute(seat, "record-request", requestPayload(catalog));
  const opened = await f.execute(seat, "open-case", { requestId: request.body.receipt.entityId, kind: "refund", reason: "PRIVATE_FIXTURE_REASON_SENTINEL", evidence: "PRIVATE_FIXTURE_EVIDENCE_SENTINEL" });
  const payload = { caseId: opened.body.receipt.entityId, expectedRevision: 1, kind: "appeal", text: "PRIVATE_FIXTURE_NOTE_SENTINEL" };
  const first = await f.execute(seat, "append-case-note", payload); assert.equal(first.status, 200);
  const stale = await f.execute(seat, "append-case-note", payload); assert.equal(stale.status, 409); assert.equal(errorCode(stale), "stale_revision");
  const state = (await f.send("/state", { method: "GET", seat })).body.data; assert.equal(state.cases[0].revision, 2); assert.equal(state.cases[0].followUps.length, 1); assert.ok(!JSON.stringify(state.events).includes("PRIVATE_FIXTURE_")); assert.equal(state.requests[0].paymentStatus, "not_dispatched");
});
withFixture("receipt failure rolls back source currentness, entity versions and event together", async f => {
  const seat = await f.seat(); await f.catalog(seat); const s = f.store.getSession(seat.cookie.split("=")[1]); const before = f.store.state(s);
  f.store.db.exec("CREATE TRIGGER independent_reject_receipt BEFORE INSERT ON pilot_commands BEGIN SELECT RAISE(ABORT,'forced fixture receipt failure'); END;");
  const c = command("import-source", { ...source(), providerName: "Changed source revision" });
  const result = await f.send("/commands", { seat, value: c }); assert.equal(result.status, 503); assert.equal(errorCode(result), "storage_unavailable");
  assert.deepEqual(f.store.state(s), before); assert.equal((await f.send(`/commands/${c.commandId}`, { method: "GET", seat })).status, 404); f.store.db.exec("DROP TRIGGER independent_reject_receipt;");
});
withFixture("two actual SQLite processes compete for one remaining workspace request quota atomically", async f => {
  const seat = await f.seat(), catalog = await f.catalog(seat), s = f.store.getSession(seat.cookie.split("=")[1]), payload = requestPayload(catalog);
  for (let i = 0; i < 99; i++) f.store.command(s, command("record-request", payload));
  const code = `(async()=>{const{parentPort,workerData}=await import('node:worker_threads');globalThis.fetch=()=>{throw Error('LIVE_NETWORK_FORBIDDEN')};const{PilotStore}=await import(workerData.module);const store=new PilotStore({filePath:workerData.file,clock:()=>new Date(workerData.now)});const gate=new Int32Array(workerData.gate);parentPort.postMessage('ready');Atomics.wait(gate,0,0);try{const result=store.command(store.getSession(workerData.token),workerData.command);parentPort.postMessage({ok:true,result});}catch(e){parentPort.postMessage({ok:false,code:e.code});}finally{store.close();}})().catch(()=>process.exit(9));`;
  const gate = new SharedArrayBuffer(4), workers = [0, 1].map(() => new Worker(code, { eval: true, workerData: { module: new URL("../src/lib/customer-pilot/server/store.mjs", import.meta.url).href, file: f.filePath, now: FIXED.toISOString(), token: seat.cookie.split("=")[1], gate, command: command("record-request", payload) } }));
  const exits = workers.map(worker => new Promise(resolve => worker.on("exit", resolve)));
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.on("message", message => { if (message !== "ready") resolve(message); }); worker.on("error", reject); worker.on("exit", code => { if (code) reject(Error(`worker exit ${code}`)); }); }));
  await Promise.all(workers.map(worker => new Promise(resolve => worker.on("message", message => { if (message === "ready") resolve(); })))); Atomics.store(new Int32Array(gate), 0, 1); Atomics.notify(new Int32Array(gate), 0, 2);
  const outcomes = await Promise.all(results); await Promise.all(exits);
  assert.equal(outcomes.filter(x => x.ok).length, 1); assert.equal(outcomes.find(x => !x.ok).code, "workspace_limit"); const state = f.store.state(s); assert.equal(state.requests.length, 100); assert.equal(state.events.length, 101);
});
