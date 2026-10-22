import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { as, createMigratedDb, createUser, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor } from "./harness.mjs";

globalThis.fetch = async () => { throw new Error("External network forbidden in migrated checkout tests"); };
const recovery = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(new URL("../../functions/_shared/checkout-attempts.ts", import.meta.url), "utf8"))).toString("base64")}`);

let db;
let customer;
let booking;
before(async () => {
  db = await createMigratedDb();
  customer = await createUser(db);
  const service = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1);
  const slot = await firstSlot(db, ROLES.user(customer), SEED.employee1, date, service.duration);
  booking = (await as(db, ROLES.user(customer),
    "select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)",
    [SEED.employee1, service.id, slot]))[0];
});
after(async () => { await db?.close(); });

function handlerFor(userId) {
  let handler;
  const charges = [];
  const failures = [];
  const client = {
    from(table) {
      assert.ok(["bookings", "branches", "profiles", "platform_feature_flags"].includes(table));
      let fields;
      const filters = [];
      async function execute() {
        assert.match(fields, /^[a-z_,\s]+$/);
        for (const [column] of filters) assert.match(column, /^[a-z_]+$/);
        const where = filters.map(([column], i) => `${column} = $${i + 1}`).join(" and ");
        try {
          const data = await as(db, ROLES.service, `select ${fields} from public.${table} where ${where}`, filters.map(([, value]) => value));
          return { data: data[0] ?? null, error: null };
        } catch (error) {
          failures.push(error.message);
          return { data: null, error };
        }
      }
      const query = { select(value) { fields = value; return query; }, eq(column, value) { filters.push([column, value]); return query; }, maybeSingle: execute, single: execute };
      return query;
    },
    async rpc(name, args) {
      assert.ok(["provider_is_selling", "read_checkout_attempt", "claim_checkout_attempt", "record_checkout_attempt", "mark_checkout_attempt_unknown", "confirm_booking_payment"].includes(name));
      const entries = Object.entries(args);
      for (const [key] of entries) assert.match(key, /^[a-z_]+$/);
      try {
        const result = await as(db, ROLES.service, `select public.${name}(${entries.map(([key], i) => `${key} => $${i+1}`).join(", ")}) r`, entries.map(([, v]) => v && typeof v === "object" ? JSON.stringify(v) : v));
        return { data: result[0].r, error: null };
      } catch(error) {
        if (error.code !== "P0002") failures.push(error.message);
        return {data:null,error};
      }
    },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL("../../functions/payment-checkout/index.ts", import.meta.url), "utf8").replace(/^import .+\r?\n/gm, ""));
  new Function("serve", "corsHeaders", "json", "MissingConfigError", "resolveCaller", "serviceClient", "buildRedirectUrl", "Deno", "fetch", "checkoutGatewayContext", "dispatchCheckoutAttempt", "recoverCheckoutAttempt", source)(
    (fn) => { handler = fn; }, () => ({}), (req, body, status = 200) => Response.json(body, { status }), class extends Error {},
    async () => ({ kind: "user", userId }), () => client, (base, pathname) => new URL(pathname, base).href,
    { env: { get: (name) => ({ TAP_SECRET_KEY: "local-fixture", SUPABASE_URL: "https://local.invalid" })[name] } },
    async (url, init = {}) => {
      if (url.endsWith("/list")) return Response.json({charges:[],has_more:false});
      if (!init.method || init.method === "GET") {
        const r = (await db.query("select request_text from payment_checkout_attempts where actor_id=$1 order by created_at desc limit 1", [userId])).rows[0];
        return Response.json({ ...JSON.parse(r.request_text), id: "chg_schema_fixture", status: "INITIATED", transaction: {url:"https://local.invalid/checkout"} });
      }
      const payload=JSON.parse(init.body);charges.push(payload);
      return Response.json({ ...payload, id: "chg_schema_fixture", status: "INITIATED", transaction: {url:"https://local.invalid/checkout"} });
    }, recovery.checkoutGatewayContext, recovery.dispatchCheckoutAttempt, recovery.recoverCheckoutAttempt,
  );
  return { charges, failures, run: () => handler(new Request("https://local.invalid/payment", { method: "POST", body: JSON.stringify({ bookingId: booking.id }) })) };
}

describe("checkout handler against the real migrated booking schema", () => {
  it("resolves the actual booking's branch/provider and dispatches the stored deposit", async () => {
    const h = handlerFor(customer);
    const response = await h.run();
    assert.deepEqual(h.failures, [], "every actual handler select must work on the migrated schema");
    assert.equal(response.status, 200);
    assert.equal(h.charges.length, 1);
    assert.equal(h.charges[0].amount, Number(booking.deposit_required));
    assert.equal(h.charges[0].currency, "SAR");
    assert.equal(h.charges[0].metadata.booking_id, booking.id);
  });
  it("recovers the persisted charge after recreating the handler without posting another", async () => {
    const h = handlerFor(customer);
    const response = await h.run();
    assert.equal(response.status, 200);
    assert.equal(h.charges.length, 0);
    assert.equal((await response.json()).chargeId, "chg_schema_fixture");
    assert.deepEqual(h.failures, []);
  });
  it("does not expose or charge another customer's actual booking", async () => {
    const h = handlerFor(await createUser(db));
    assert.equal((await h.run()).status, 404);
    assert.equal(h.charges.length, 0);
    assert.deepEqual(h.failures, []);
  });
  it("uses the real seller eligibility rule for an unverified provider", async () => {
    await as(db, ROLES.service, "update providers set is_verified = false where id = $1", [SEED.provider1]);
    const h = handlerFor(customer);
    assert.equal((await h.run()).status, 409);
    assert.equal(h.charges.length, 0);
    assert.deepEqual(h.failures, []);
  });
});
