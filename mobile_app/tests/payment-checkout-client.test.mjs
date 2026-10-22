import { test, after } from "node:test";
import assert from "node:assert/strict";

let unexpectedNetwork = 0;
globalThis.fetch = async () => { unexpectedNetwork += 1; throw new Error("Unexpected network in checkout unit test"); };
after(() => assert.equal(unexpectedNetwork, 0));

const adapter = () => import("../src/lib/payment-checkout.js");
const target = { bookingId: "booking-one" };
const ready = { success: true, state: "ready", attemptId: "attempt-one", chargeId: "charge-one", checkoutUrl: "https://checkout.example/one" };
function client(replies) {
  const calls = [];
  return { calls, auth: { getSession: async () => ({ data: { session: { user: { id: "customer-one" } } } }) }, functions: {
    invoke: async (_name, options) => {
      calls.push(options.body);
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return typeof reply === "function" ? reply() : reply;
    },
  } };
}
const http = (status, body) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status }) } });
function memory() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}
function purchase(overrides = {}) {
  const rows = new Map();
  let creates = 0;
  const options = { actorId: "customer-one", scope: "package.package-one", locale: "en", storage: memory(),
    lookup: async () => [...rows.values()].filter((row) => row.status === "pending_payment"),
    inspect: async (id) => rows.get(id) ?? null,
    makeKey: () => "stable-intent-one",
    create: async () => { creates += 1; rows.set("purchase-one", { id: "purchase-one", status: "pending_payment", matches: true }); return "purchase-one"; },
    ...overrides };
  return { rows, options, creates: () => creates };
}

test("ready receipt returns its validated checkout URL", async () => {
  const { requestCheckout } = await adapter();
  const c = client([{ data: ready, error: null }]);
  assert.equal((await requestCheckout(c, target, "en", { recoverFirst: false })).checkoutUrl, ready.checkoutUrl);
  assert.deepEqual(c.calls, [target]);
});

for (const state of ["submitting", "unknown", "captured"]) {
  for (const locale of ["en", "ar"]) test(`${locale} ${state} is handled before a misleading URL and never starts another attempt`, async () => {
    const { requestCheckout } = await adapter();
    const c = client([{ data: { success: false, state, attemptId: "attempt-one", recoverable: true, checkoutUrl: "https://must-not-open.example" }, error: null }]);
    let refreshed = 0;
    await assert.rejects(requestCheckout(c, target, locale, { onCaptured: async () => { refreshed += 1; } }), (failure) => {
      assert.equal(failure.state, state);
      assert.ok(failure.message.length > 20);
      assert.doesNotMatch(failure.message, /nothing was charged|لم.*خصم/i);
      if (locale === "ar") assert.match(failure.message, /[\u0600-\u06ff]/);
      return true;
    });
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0].action, "recover");
    assert.equal(refreshed, state === "captured" ? 1 : 0);
  });
}

test("only recovery not-found or verified failed permits an explicit new start", async () => {
  const { requestCheckout } = await adapter();
  for (const outcome of [http(404, { code: "checkout_not_found" }), http(409, { code: "checkout_failed", state: "failed", attemptId: "old-attempt" })]) {
    const c = client([outcome, { data: ready, error: null }]);
    assert.equal((await requestCheckout(c, target, "en")).attemptId, ready.attemptId);
    assert.deepEqual(c.calls, [{ ...target, action: "recover" }, target]);
  }
});

test("transport loss is unknown, makes no second request and has truthful copy", async () => {
  const { requestCheckout } = await adapter();
  const c = client([new TypeError("network connection closed")]);
  await assert.rejects(requestCheckout(c, target, "en"), (failure) => failure.state === "unknown" && /check|confirm/i.test(failure.message));
  assert.equal(c.calls.length, 1);
});

test("double submissions share one in-flight request for the same account and target", async () => {
  const { requestCheckout } = await adapter();
  let release;
  const held = new Promise((done) => { release = done; });
  const c = client([() => held]);
  const first = requestCheckout(c, target, "en", { recoverFirst: false });
  const second = requestCheckout(c, target, "en", { recoverFirst: false });
  await new Promise((done) => setImmediate(done));
  assert.equal(c.calls.length, 1);
  release({ data: ready, error: null });
  assert.deepEqual(await first, await second);
});

test("a malformed ready receipt cannot authorize navigation", async () => {
  const { requestCheckout } = await adapter();
  for (const payload of [{ checkoutUrl: ready.checkoutUrl }, { ...ready, checkoutUrl: "javascript:alert(1)" }, { ...ready, checkoutUrl: "https://" }, { ...ready, checkoutUrl: "https://user:secret@example.test" }, { ...ready, attemptId: "" }]) {
    await assert.rejects(requestCheckout(client([{ data: payload, error: null }]), target, "en", { recoverFirst: false }), (failure) => failure.state === "unknown");
  }
});

test("purchase identity is persisted before creation and reused after reload", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase();
  const create = p.options.create;
  p.options.create = async (key) => {
    assert.equal(JSON.parse([...p.options.storage.values.values()][0]).phase, "creating");
    return create(key);
  };
  assert.deepEqual(await ensurePurchase(p.options), { id: "purchase-one", reused: false });
  assert.deepEqual(await ensurePurchase({ ...p.options }), { id: "purchase-one", reused: true });
  assert.equal(p.creates(), 1);
  assert.equal(JSON.parse([...p.options.storage.values.values()][0]).id, "purchase-one");
});

test("lost creation response is held across reload instead of creating a second business record", async () => {
  const { ensurePurchase } = await adapter();
  let calls = 0;
  const p = purchase({ create: async () => { calls += 1; throw new TypeError("connection lost"); } });
  await assert.rejects(ensurePurchase(p.options), (failure) => failure.state === "unknown");
  await assert.rejects(ensurePurchase({ ...p.options }), (failure) => failure.state === "unknown");
  assert.equal(calls, 1);
});

test("an exact owned pending record recovers a lost creation result", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase();
  p.options.create = async () => { p.rows.set("recovered", { id: "recovered", status: "pending_payment", matches: true }); throw new TypeError("response lost"); };
  await assert.rejects(ensurePurchase(p.options));
  assert.deepEqual(await ensurePurchase({ ...p.options }), { id: "recovered", reused: true });
});

test("multiple pending candidates and changed material values never guess or create", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase();
  p.rows.set("one", { id: "one", status: "pending_payment", matches: true });
  p.rows.set("two", { id: "two", status: "pending_payment", matches: true });
  await assert.rejects(ensurePurchase(p.options), (failure) => failure.state === "unknown");
  assert.equal(p.creates(), 0);
  p.rows.delete("two");
  await ensurePurchase(p.options);
  p.rows.set("one", { id: "one", status: "pending_payment", matches: false });
  await assert.rejects(ensurePurchase(p.options), (failure) => failure.state === "unknown");
  assert.equal(p.creates(), 0);
});

test("unavailable durable storage prevents the purchase creation command", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase({ storage: { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} } });
  await assert.rejects(ensurePurchase(p.options));
  assert.equal(p.creates(), 0);
});

test("a settled owned purchase refreshes product state without automatically buying another", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase();
  await ensurePurchase(p.options);
  p.rows.set("purchase-one", { id: "purchase-one", status: "active", matches: true, settled: true });
  let refreshed = 0;
  await assert.rejects(ensurePurchase({ ...p.options, onSettled: async () => { refreshed += 1; } }), (failure) => failure.state === "captured");
  assert.equal(refreshed, 1);
  assert.equal(p.creates(), 1);
  assert.equal(p.options.storage.values.size, 0);
});

test("an idempotent creation retry retains the original persisted command key", async () => {
  const { ensurePurchase } = await adapter();
  const keys = [];
  const p = purchase({ idempotent: true, create: async (key) => { keys.push(key); if (keys.length === 1) throw new TypeError("response lost"); return "membership-one"; } });
  await assert.rejects(ensurePurchase(p.options));
  assert.equal((await ensurePurchase({ ...p.options })).id, "membership-one");
  assert.deepEqual(keys, ["stable-intent-one", "stable-intent-one"]);
});


test("purchase recovery queries the owned table and validates the complete intended material", async () => {
  const { preparePurchase } = await adapter();
  const queried = [];
  let creates = 0;
  const c = client([]);
  c.from = (table) => {
    const filters = [];
    const q = {select: () => q, eq: (k,v) => { filters.push([k,v]); return q; }, is: (k,v) => { filters.push([k,v]); return q; }, limit: () => q,
      then: (resolve) => { queried.push({table,filters}); return Promise.resolve({data:[{id:"owned",status:"pending_payment",package_id:"package-one",paid_at:null}],error:null}).then(resolve); }};
    return q;
  };
  const options = {type:"package",actorId:"actor-one",scope:"package.package-one",material:{package_id:"package-one"},storage:memory(),create:async()=>{creates++;return "new";}};
  assert.deepEqual(await preparePurchase(c,options),{id:"owned",reused:true});
  assert.equal(creates,0);
  assert.deepEqual(queried[0],{table:"user_packages",filters:[["customer_id","actor-one"],["status","pending_payment"],["package_id","package-one"]]});
});

test("a different pending subscription is held instead of cancelling it through a new subscribe command", async () => {
  const { preparePurchase } = await adapter();
  let creates = 0;
  const filters=[];
  const c=client([]);
  c.from=()=>{const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},limit:()=>q,then:(resolve)=>Promise.resolve({data:[{id:"earlier",status:"pending_payment",plan_id:"old",billing_interval:"monthly"}],error:null}).then(resolve)};return q;};
  await assert.rejects(preparePurchase(c,{type:"subscription",actorId:"actor-one",ownerId:"provider-one",scope:"subscription.provider-one",material:{plan_id:"new",billing_interval:"monthly"},storage:memory(),create:async()=>{creates++;return "new";}}),f=>f.state==="unknown");
  assert.equal(creates,0);
  assert.deepEqual(filters,[["provider_id","provider-one"],["status","pending_payment"]]);
});


test("corrupt persisted creation identity never receives a replacement idempotency key", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase({ idempotent: true });
  // Use the actual configured scope so the corrupted command is read.
  const key = `primora.checkout.${p.options.actorId}.${p.options.scope}`;
  p.options.storage.values.set(key, JSON.stringify({ phase: "creating" }));
  await assert.rejects(ensurePurchase(p.options), (failure) => failure.state === "unknown");
  assert.equal(p.creates(), 0);
});

test("a captured receipt remains captured when refreshing the authoritative product fails", async () => {
  const { requestCheckout } = await adapter();
  const c = client([{ data: { success: false, state: "captured", checkoutUrl: ready.checkoutUrl, attemptId: "captured-one" }, error: null }]);
  await assert.rejects(requestCheckout(c, target, "ar", { onCaptured: async () => { throw new Error("read unavailable"); } }), (failure) => failure.state === "captured" && failure.attemptId === "captured-one");
  assert.equal(c.calls.length, 1);
});


test("completed prior purchase with changed material cannot be reported as payment for the new form", async () => {
  const { ensurePurchase } = await adapter();
  const p = purchase();
  await ensurePurchase(p.options);
  p.rows.set("purchase-one", { id: "purchase-one", status: "active", matches: false, settled: true });
  let refreshed = 0;
  await assert.rejects(ensurePurchase({ ...p.options, onSettled: async () => { refreshed++; } }), failure => {
    assert.equal(failure.state, "prior_settled");
    assert.match(failure.message, /earlier purchase/i);
    return true;
  });
  assert.equal(refreshed, 1);
  assert.equal(p.creates(), 1);
  assert.equal(p.options.storage.values.size, 0);
});
