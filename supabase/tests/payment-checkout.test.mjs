import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// These suites must never reach a network, including through an accidentally uninjected helper.
globalThis.fetch = async () => { throw new Error("External network forbidden in checkout tests"); };

// Execute the real Edge handler with an isolated database/gateway boundary. No network or credentials are used.
const source = readFileSync(new URL("../functions/payment-checkout/index.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(source.replace(/^import .+\r?\n/gm, ""));
const recovery = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(new URL("../functions/_shared/checkout-attempts.ts", import.meta.url), "utf8"))).toString("base64")}`);

function setup(overrides = {}) {
  const calls = [];
  const gateway = [];
  let attempt = overrides.attempt ?? null;
  let providerCharge;
  const booking = { id: "11111111-1111-4111-8111-111111111111", customer_id: "22222222-2222-4222-8222-222222222222", branch_id: "33333333-3333-4333-8333-333333333333", deposit_required: 25, status: "pending_payment" };
  const results = {
    bookings: { data: booking, error: null },
    branches: { data: { provider_id: "44444444-4444-4444-8444-444444444444" }, error: null },
    profiles: { data: { first_name: "Customer" }, error: null },
    platform_feature_flags: { data: { is_enabled: false }, error: null },
    ...overrides.results,
  };
  const db = {
    from(table) {
      const query = { table, filters: [] };
      calls.push(query);
      const chain = {
        select(fields) { query.fields = fields; return chain; },
        eq(field, value) { query.filters.push([field, value]); return chain; },
        maybeSingle: async () => results[table],
        single: async () => results[table],
      };
      return chain;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === "provider_is_selling") return overrides.selling ?? { data: true, error: null };
      if (name === "read_checkout_attempt") return overrides.readError ? { error: overrides.readError, data: null } : { data: attempt, error: null };
      if (name === "claim_checkout_attempt") {
        if (overrides.claimError) return { error: overrides.claimError, data: null };
        if (attempt && attempt.status !== "failed") {
          if (Number(attempt.amount_sar) !== Number(results.bookings.data?.deposit_required) || attempt.provider_id !== results.branches.data?.provider_id) return {data:null,error:{message:"payable changed"}};
          if (overrides.captureOnRevalidate) attempt = { ...attempt, status: "captured" };
          return { data: { ...attempt, dispatch: false }, error: null };
        }
        const request = JSON.parse(args.p_request);
        attempt = { id: args.p_attempt_id, actor_id: args.p_actor_id, purchase_type: args.p_purchase_type, target_id: args.p_target_id,
          provider_id: results.branches.data?.provider_id, amount_sar: request.amount, currency: "SAR", gateway_context: args.p_gateway_context, request_text: args.p_request,
          status: "submitting", created_at: new Date().toISOString() };
        return { data: { ...attempt, dispatch: true }, error: null };
      }
      if (name === "record_checkout_attempt") {
        if (overrides.recordError) return { error: overrides.recordError, data: null };
        attempt = { ...attempt, status: args.p_charge.status === "CAPTURED" ? "captured" : "ready", charge_id: args.p_charge.id, checkout_url: args.p_charge.transaction?.url };
        return { data: attempt, error: null };
      }
      if (name === "mark_checkout_attempt_unknown") { attempt = { ...attempt, status: "unknown" }; return { data: attempt, error: null }; }
      return { data: { success: true }, error: null };
    },
  };
  let handler;
  const headers = () => ({ "Access-Control-Allow-Origin": "https://primora.sa" });
  const json = (req, body, status = 200) => Response.json(body, { status });
  class MissingConfigError extends Error {}
  new Function("serve", "corsHeaders", "json", "MissingConfigError", "resolveCaller", "serviceClient", "buildRedirectUrl", "Deno", "fetch", "checkoutGatewayContext", "dispatchCheckoutAttempt", "recoverCheckoutAttempt", executable)(
    (callback) => { handler = callback; }, headers, json, MissingConfigError,
    async () => overrides.caller === undefined ? { kind: "user", userId: "22222222-2222-4222-8222-222222222222" } : overrides.caller,
    () => db, (base, path) => new URL(path, base).href,
    { env: { get: (name) => ({ TAP_SECRET_KEY: "local-fixture-key", SUPABASE_URL: "https://local.invalid", ...overrides.env })[name] } },
    async (url, init = {}) => {
      if (overrides.fetchImpl) return overrides.fetchImpl(url, init);
      if (url.endsWith("/list")) return Response.json({ charges: providerCharge ? [{ id: providerCharge.id }] : [], has_more: false });
      if (!init.method || init.method === "GET") return Response.json(providerCharge);
      const body = JSON.parse(init.body); gateway.push({ url, body });
      providerCharge = { ...body, id: "chg_local", status: "INITIATED", transaction: { url: "https://checkout.local.invalid/one" } };
      return Response.json(providerCharge);
    }, recovery.checkoutGatewayContext, recovery.dispatchCheckoutAttempt, recovery.recoverCheckoutAttempt,
  );
  return { calls, gateway, async run(body = { bookingId: booking.id }, method = "POST") {
    const response = await handler(new Request("https://local.invalid/checkout", { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  } };
}

describe("booking checkout refuses unsafe dispatch", () => {
  it("uses the owned booking's database amount and verifies the seller before dispatch", async () => {
    const h = setup();
    assert.equal((await h.run({ bookingId: "11111111-1111-4111-8111-111111111111", amount: 1 })).status, 200);
    assert.equal(h.gateway.length, 1);
    assert.equal(h.gateway[0].body.amount, 25);
    assert.equal(h.gateway[0].body.currency, "SAR");
    assert.deepEqual(h.calls.find((q) => q.table === "bookings").filters, [["id", "11111111-1111-4111-8111-111111111111"], ["customer_id", "22222222-2222-4222-8222-222222222222"]]);
    assert.deepEqual(h.calls.find((q) => q.table === "branches").filters, [["id", "33333333-3333-4333-8333-333333333333"]]);
    assert.deepEqual(h.calls.find((q) => q.rpc === "provider_is_selling"), { rpc: "provider_is_selling", args: { p_provider_id: "44444444-4444-4444-8444-444444444444" } });
  });
  for (const [label, flag] of Object.entries({ failed: { data: null, error: { message: "offline" } }, missing: { data: null, error: null }, malformed: { data: { is_enabled: null }, error: null } })) {
    it(`does not create a charge when routing configuration is ${label}`, async () => {
      const h = setup({ results: { platform_feature_flags: flag } });
      assert.equal((await h.run()).status, 503);
      assert.equal(h.gateway.length, 0);
    });
  }
  it("retains the hold on marketplace splits without destinations", async () => {
    const h = setup({ results: { platform_feature_flags: { data: { is_enabled: true }, error: null } } });
    assert.equal((await h.run()).status, 503);
    assert.equal(h.gateway.length, 0);
  });
  it("reports a failed booking read as unavailable without charging", async () => {
    const h = setup({ results: { bookings: { data: null, error: { message: "offline" } } } });
    assert.equal((await h.run()).status, 503);
    assert.equal(h.gateway.length, 0);
  });
  it("does not charge when the booking's branch lookup fails", async () => {
    const h = setup({ results: { branches: { data: null, error: { message: "offline" } } } });
    assert.equal((await h.run()).status, 503);
    assert.equal(h.gateway.length, 0);
  });
  it("does not charge when the booking's branch no longer exists", async () => {
    const h = setup({ results: { branches: { data: null, error: null } } });
    assert.equal((await h.run()).status, 409);
    assert.equal(h.gateway.length, 0);
  });
  it("does not charge a booking for a paused or unverified salon", async () => {
    const h = setup({ selling: { data: false, error: null } });
    assert.equal((await h.run()).status, 409);
    assert.equal(h.gateway.length, 0);
  });
  it("fails closed if seller eligibility cannot be checked", async () => {
    const h = setup({ selling: { data: null, error: new Error("seller lookup failed") } });
    assert.equal((await h.run()).status, 500);
    assert.equal(h.gateway.length, 0);
  });
  it("does not charge an inaccessible booking", async () => {
    const h = setup({ results: { bookings: { data: null, error: null } } });
    assert.equal((await h.run()).status, 404);
    assert.equal(h.gateway.length, 0);
  });
  it("rejects a non-finite database amount", async () => {
    const h = setup({ results: { bookings: { data: { id: "11111111-1111-4111-8111-111111111111", branch_id: "33333333-3333-4333-8333-333333333333", status: "pending_payment", deposit_required: "Infinity" }, error: null } } });
    assert.equal((await h.run()).status, 409);
    assert.equal(h.gateway.length, 0);
  });
  it("requires a signed-in human caller and gateway configuration", async () => {
    for (const caller of [null, { kind: "service" }]) {
      const h = setup({ caller });
      assert.equal((await h.run()).status, 401);
      assert.equal(h.gateway.length, 0);
    }
    const h = setup({ env: { TAP_SECRET_KEY: undefined } });
    assert.equal((await h.run()).status, 503);
    assert.equal(h.gateway.length, 0);
  });
});


describe("durable checkout handler integration", () => {
  it("persists a claim before dispatch and reuses one charge on repeated/concurrent requests", async () => {
    const h = setup();
    const results = await Promise.all([h.run(), h.run()]);
    assert.equal(h.gateway.length, 1);
    assert.ok(results.every(r => [200,202].includes(r.status)));
    assert.equal((await h.run()).status, 200);
    assert.equal(h.gateway.length, 1);
    const claim = h.calls.find(q => q.rpc === "claim_checkout_attempt");
    const payload = h.gateway[0].body;
    assert.equal(payload.reference.idempotent, claim.args.p_attempt_id);
    assert.equal(payload.reference.transaction, payload.metadata.checkout_attempt_id);
    assert.match(claim.args.p_gateway_context, /^[a-f0-9]{64}$/);
  });
  it("recovery with no existing attempt is read-only", async () => {
    const h = setup(); const r = await h.run({ bookingId: "11111111-1111-4111-8111-111111111111", action: "recover" });
    assert.equal(r.status, 404); assert.equal(r.body.code, "checkout_not_found"); assert.equal(h.gateway.length, 0);
    assert.equal(h.calls.filter(q => q.rpc === "claim_checkout_attempt").length, 0);
  });
  it("never sends a charge when the durable read or claim fails", async () => {
    for (const overrides of [{ readError: { message: "offline" } }, { claimError: { message: "offline" } }]) {
      const h = setup(overrides); assert.equal((await h.run()).status, 503); assert.equal(h.gateway.length, 0);
    }
  });
  it("a lost create response stays unknown and a second request only looks it up", async () => {
    let creates = 0; const h = setup({fetchImpl: async (url) => {
      if (url.endsWith("/charges")) { creates++; throw new Error("lost response"); }
      assert.ok(url.endsWith("/charges/list")); return Response.json({charges:[],has_more:false});
    }});
    for (let n=0;n<2;n++) { const r=await h.run(); assert.equal(r.status,202);assert.equal(r.body.code,"checkout_unknown"); }
    assert.equal(creates,1);
  });
  it("failed receipt persistence does not authorize another submission", async () => {
    const h=setup({recordError:{message:"offline"}});
    assert.equal((await h.run()).status,202); assert.equal((await h.run()).status,202); assert.equal(h.gateway.length,1);
  });
  it("rejects malformed or ambiguous targets before querying or dispatch", async () => {
    const h=setup();
    for(const body of [{bookingId:"invalid"},{bookingId:"11111111-1111-4111-8111-111111111111",purchaseType:"tip",purchaseId:"11111111-1111-4111-8111-111111111111"}])assert.equal((await h.run(body)).status,400);
    assert.equal(h.calls.length,0);assert.equal(h.gateway.length,0);
  });
});


describe("independent review regressions for ready recovery",()=>{
 for(const kind of ["amount","provider"]){it(`holds an existing checkout when its current ${kind} changed`,async()=>{
  const booking={id:"11111111-1111-4111-8111-111111111111",customer_id:"22222222-2222-4222-8222-222222222222",branch_id:"33333333-3333-4333-8333-333333333333",deposit_required:25,status:"pending_payment"};
  const branch={provider_id:"44444444-4444-4444-8444-444444444444"};const h=setup({results:{bookings:{data:booking,error:null},branches:{data:branch,error:null}}});
  assert.equal((await h.run()).status,200);
  if(kind==="amount")booking.deposit_required=50;else branch.provider_id="55555555-5555-4555-8555-555555555555";
  const r=await h.run();assert.equal(r.status,202);assert.equal(r.body.state,"unknown");assert.equal(r.body.checkoutUrl,undefined);assert.equal(h.gateway.length,1);
 });}
});


it("confirms a capture that races the locked ready revalidation",async()=>{
 const h=setup({captureOnRevalidate:true});await h.run();const r=await h.run();
 assert.equal(r.status,202);assert.equal(r.body.state,"captured");assert.equal(h.gateway.length,1);
 assert.equal(h.calls.at(-1).rpc,"confirm_booking_payment");
});
