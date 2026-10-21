import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Execute the real Edge handler with an isolated database/gateway boundary. No network or credentials are used.
const source = readFileSync(new URL("../functions/payment-checkout/index.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(source.replace(/^import .+\r?\n/gm, ""));

function setup(overrides = {}) {
  const calls = [];
  const gateway = [];
  const booking = { id: "booking-one", customer_id: "customer-one", branch_id: "branch-one", deposit_required: 25, status: "pending_payment" };
  const results = {
    bookings: { data: booking, error: null },
    branches: { data: { provider_id: "salon-one" }, error: null },
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
    async rpc(name, args) { calls.push({ rpc: name, args }); return overrides.selling ?? { data: true, error: null }; },
  };
  let handler;
  const headers = () => ({ "Access-Control-Allow-Origin": "https://primora.sa" });
  const json = (req, body, status = 200) => Response.json(body, { status });
  class MissingConfigError extends Error {}
  new Function("serve", "corsHeaders", "json", "MissingConfigError", "resolveCaller", "serviceClient", "buildRedirectUrl", "Deno", "fetch", executable)(
    (callback) => { handler = callback; }, headers, json, MissingConfigError,
    async () => overrides.caller === undefined ? { kind: "user", userId: "customer-one" } : overrides.caller,
    () => db, (base, path) => new URL(path, base).href,
    { env: { get: (name) => ({ TAP_SECRET_KEY: "local-fixture-key", SUPABASE_URL: "https://local.invalid", ...overrides.env })[name] } },
    async (url, init) => { gateway.push({ url, body: JSON.parse(init.body) }); return Response.json({ id: "chg_local", transaction: { url: "https://checkout.local.invalid/one" } }); },
  );
  return { calls, gateway, async run(body = { bookingId: booking.id }, method = "POST") {
    const response = await handler(new Request("https://local.invalid/checkout", { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  } };
}

describe("booking checkout refuses unsafe dispatch", () => {
  it("uses the owned booking's database amount and verifies the seller before dispatch", async () => {
    const h = setup();
    assert.equal((await h.run({ bookingId: "booking-one", amount: 1 })).status, 200);
    assert.equal(h.gateway.length, 1);
    assert.equal(h.gateway[0].body.amount, 25);
    assert.equal(h.gateway[0].body.currency, "SAR");
    assert.deepEqual(h.calls.find((q) => q.table === "bookings").filters, [["id", "booking-one"], ["customer_id", "customer-one"]]);
    assert.deepEqual(h.calls.find((q) => q.table === "branches").filters, [["id", "branch-one"]]);
    assert.deepEqual(h.calls.find((q) => q.rpc), { rpc: "provider_is_selling", args: { p_provider_id: "salon-one" } });
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
    const h = setup({ results: { bookings: { data: { id: "booking-one", branch_id: "branch-one", status: "pending_payment", deposit_required: "Infinity" }, error: null } } });
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
