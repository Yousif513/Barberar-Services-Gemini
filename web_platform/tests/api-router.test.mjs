import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest, normalizePath, extractBearer, ROUTE_SCOPES, ROUTE_RPCS } from "../../supabase/functions/_shared/api-router.ts";
import { decodeCursor } from "../../supabase/functions/_shared/api-pagination.ts";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "../../supabase/functions/_shared/api-contract.ts";

// The whole request pipeline of the public API, run in Node against a fake backend. The Deno entry point only
// adapts Request/Response and the database client, so what is proven here is the behaviour integrators see.

const KEY = `prm_live_${"ab12cd34".repeat(8)}`;
const PROVIDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BRANCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const SERVICE = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const NOW_MS = Date.UTC(2026, 9, 7, 9, 30, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const RESET = NOW_S + 30;

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const allScopes = ["services:read", "employees:read", "availability:read", "bookings:read"];

function auth(over = {}) {
  return {
    key_id: uuid(900), provider_id: PROVIDER, branch_id: null, scopes: allScopes,
    rate_limit: { limit: 60, remaining: 59, reset_at: RESET, exceeded: false }, ...over,
  };
}

// A backend that records every call. `handlers` maps an rpc name to a function of its arguments.
function backend(handlers = {}) {
  const calls = [];
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      const handler = handlers[fn] ?? (() => ({ data: [], error: null }));
      return handler(args);
    },
  };
}

const req = (path, { method = "GET", token = KEY, headers = {} } = {}) => ({
  method,
  url: `https://abc.supabase.co${path}`,
  headers: { get: (name) => ({ ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers })[name.toLowerCase()] ?? null },
});
const run = (path, be, opts = {}, ro = {}) => handleApiRequest(req(path, opts), be, { now: () => NOW_MS, ...ro });
const ok = (data) => ({ data, error: null });
const dbError = (code, message = "database detail that must not leak") => ({ data: null, error: { code, message } });

const bookingRow = (n, scheduled = "2026-10-08T07:00:00+00:00") => ({
  id: uuid(n), status: "confirmed", scheduled_at: scheduled, duration_minutes: 45, branch_id: BRANCH, employee_id: uuid(50),
  service_id: SERVICE, service_name_en: "Haircut", service_name_ar: "قص شعر", is_home_service: false, source: "app",
  total_price: 150, tax_amount: 19.57, discount_amount: 0, currency: "SAR", created_at: "2026-10-01T10:00:00+00:00",
});

describe("routing", () => {
  it("answers unknown paths 404 without touching the database", async () => {
    const be = backend();
    for (const path of ["/", "/v1", "/v2/services", "/v1/customers", "/v1/services/extra", "/v1//services", "/admin"]) {
      const res = await run(path, be);
      assert.equal(res.status, 404, path);
      assert.equal(res.body.error.code, "not_found");
    }
    assert.equal(be.calls.length, 0);
  });

  it("accepts the function prefixes and a trailing slash", () => {
    for (const p of ["/functions/v1/public-api/v1/services", "/public-api/v1/services", "/v1/services", "/v1/services/", "/functions/v1/public-api/v1/services/"]) {
      assert.equal(normalizePath(p), "/v1/services", p);
    }
    assert.equal(normalizePath("/public-apix/v1/services"), "/public-apix/v1/services");
  });

  it("allows GET only, with an Allow header, for every route", async () => {
    const be = backend();
    for (const path of ["/v1/services", "/v1/employees", "/v1/availability", "/v1/bookings"]) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
        const res = await run(path, be, { method });
        assert.equal(res.status, 405, `${method} ${path}`);
        assert.equal(res.headers.Allow, "GET");
        assert.equal(res.body.error.code, "method_not_allowed");
      }
    }
    assert.equal(be.calls.length, 0, "no key is looked at for a method that is not allowed");
  });

  it("exposes the route table the data functions and scopes are defined by", () => {
    assert.deepEqual(ROUTE_SCOPES, {
      "/v1/services": "services:read", "/v1/employees": "employees:read",
      "/v1/availability": "availability:read", "/v1/bookings": "bookings:read",
    });
    assert.deepEqual(ROUTE_RPCS, ["api_list_services", "api_list_employees", "api_get_availability", "api_list_bookings"]);
  });
});

describe("authentication", () => {
  it("refuses a missing, malformed or misplaced key with one message and no database call", async () => {
    const be = backend();
    const cases = [
      ["no header", req("/v1/services", { token: null })],
      ["basic scheme", req("/v1/services", { token: null, headers: { authorization: `Basic ${KEY}` } })],
      ["bare token", req("/v1/services", { token: null, headers: { authorization: KEY } })],
      ["two tokens", req("/v1/services", { token: null, headers: { authorization: `Bearer ${KEY} ${KEY}` } })],
      ["short token", req("/v1/services", { token: "prm_live_abc" })],
      ["wrong prefix", req("/v1/services", { token: KEY.replace("prm_live_", "pk_live__") })],
      ["upper-case digest", req("/v1/services", { token: KEY.toUpperCase().replace("PRM_LIVE_", "prm_live_") })],
      ["key in the query string only", { ...req("/v1/services?api_key=" + KEY, { token: null }) }],
    ];
    for (const [label, request] of cases) {
      const res = await handleApiRequest(request, be, { now: () => NOW_MS });
      assert.equal(res.status, 401, label);
      assert.equal(res.body.error.message, "Invalid or missing API key.", label);
      assert.match(res.headers["WWW-Authenticate"], /^Bearer/);
    }
    assert.equal(be.calls.length, 0);
  });

  it("treats a bearer scheme case-insensitively", () => {
    assert.equal(extractBearer(`bearer ${KEY}`), KEY);
    assert.equal(extractBearer(`BEARER   ${KEY}`), KEY);
    assert.equal(extractBearer(null), null);
  });

  it("answers every database refusal of a key as the same 401", async () => {
    const res = await run("/v1/services", backend({ authenticate_api_key: () => dbError("28000", "Invalid API key") }));
    assert.equal(res.status, 401);
    assert.deepEqual(Object.keys(res.body.error).sort(), ["code", "message", "request_id"]);
    assert.equal(res.body.error.message, "Invalid or missing API key.");
  });

  it("does not leak database errors, and survives a backend that throws", async () => {
    const broken = await run("/v1/services", backend({ authenticate_api_key: () => dbError("XX000", "relation api_key_hashes is corrupt") }));
    assert.equal(broken.status, 500);
    assert.ok(!JSON.stringify(broken.body).includes("corrupt"));
    const thrown = await run("/v1/services", backend({ authenticate_api_key: () => { throw new Error("connect ECONNREFUSED 10.0.0.4:5432"); } }));
    assert.equal(thrown.status, 500);
    assert.ok(!JSON.stringify(thrown).includes("ECONNREFUSED"));
    const shape = await run("/v1/services", backend({ authenticate_api_key: () => ok({ provider_id: PROVIDER }) }));
    assert.equal(shape.status, 500, "an authentication result without a key id or rate limit is not trusted");
  });

  it("passes the key to the database only as an argument and never logs it", async () => {
    const events = [];
    const be = backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => ok([]) });
    await run("/v1/services", be, {}, { log: (e) => events.push(e) });
    assert.deepEqual(be.calls[0], { fn: "authenticate_api_key", args: { p_key: KEY } });
    assert.ok(events.length === 1 && !JSON.stringify(events).includes(KEY.slice(9)));
    assert.equal(events[0].key_id, uuid(900));
  });
});

describe("rate limiting and scopes", () => {
  it("adds the rate-limit headers to a successful response", async () => {
    const res = await run("/v1/services", backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => ok([]) }));
    assert.equal(res.status, 200);
    assert.equal(res.headers["X-RateLimit-Limit"], "60");
    assert.equal(res.headers["X-RateLimit-Remaining"], "59");
    assert.equal(res.headers["X-RateLimit-Reset"], String(RESET));
    assert.equal(res.headers["Retry-After"], undefined);
  });

  it("answers 429 with Retry-After once the limit is used, and reads no data", async () => {
    const be = backend({ authenticate_api_key: () => ok(auth({ rate_limit: { limit: 60, remaining: 0, reset_at: RESET, exceeded: true } })) });
    const res = await run("/v1/bookings", be);
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, "rate_limited");
    assert.equal(res.headers["Retry-After"], "30");
    assert.equal(res.headers["X-RateLimit-Remaining"], "0");
    assert.equal(res.headers["X-RateLimit-Limit"], "60");
    assert.deepEqual(be.calls.map((c) => c.fn), ["authenticate_api_key"]);
  });

  it("answers 403 naming the missing scope, before looking at parameters", async () => {
    const be = backend({ authenticate_api_key: () => ok(auth({ scopes: ["services:read"] })) });
    const res = await run("/v1/bookings?limit=9999", be);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "forbidden");
    assert.match(res.body.error.message, /bookings:read/);
    assert.equal(res.headers["X-RateLimit-Limit"], "60", "rate-limit headers accompany every authenticated answer");
    assert.deepEqual(be.calls.map((c) => c.fn), ["authenticate_api_key"]);
  });

  it("maps a database scope refusal to 403", async () => {
    const be = backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => dbError("42501") });
    assert.equal((await run("/v1/services", be)).status, 403);
  });
});

describe("parameters", () => {
  const be = () => backend({ authenticate_api_key: () => ok(auth()) });
  const rejected = async (path) => {
    const b = be();
    const res = await run(path, b);
    assert.equal(res.status, 400, path);
    assert.equal(res.body.error.code, "invalid_request");
    assert.deepEqual(b.calls.map((c) => c.fn), ["authenticate_api_key"], `${path} must not reach a data function`);
    return res.body.error.message;
  };

  it("rejects what each endpoint does not define, and repeated parameters", async () => {
    assert.match(await rejected("/v1/services?provider_id=" + PROVIDER), /Unknown parameter: provider_id/);
    assert.match(await rejected("/v1/bookings?branch_id=" + BRANCH), /Unknown parameter/);
    assert.match(await rejected("/v1/bookings?staus=cancelled"), /Unknown parameter: staus/);
    assert.match(await rejected("/v1/services?limit=1&limit=2"), /more than once/);
    assert.match(await rejected("/v1/availability?service_id=" + SERVICE + "&date=2026-10-07&employee_id=x"), /Unknown parameter/);
  });

  it("holds the page size to the contract", async () => {
    for (const limit of ["0", "-1", "abc", "1.5", String(PAGE_SIZE_MAX + 1), "99999999", ""]) {
      assert.match(await rejected(`/v1/services?limit=${limit}`), /limit parameter/, `limit=${limit}`);
    }
  });

  it("validates cursors, dates, status and the date range", async () => {
    assert.match(await rejected("/v1/services?cursor=not-a-cursor!"), /cursor/);
    assert.match(await rejected("/v1/bookings?cursor=" + Buffer.from('{"v":2,"t":null,"i":"x"}').toString("base64url")), /cursor/);
    assert.match(await rejected("/v1/bookings?from=2026-02-30"), /from parameter/);
    assert.match(await rejected("/v1/bookings?to=yesterday"), /to parameter/);
    assert.match(await rejected("/v1/bookings?from=2026-10-07T09:30:00"), /from parameter/, "an instant must state its offset");
    assert.match(await rejected("/v1/bookings?status=done"), /status parameter/);
    assert.match(await rejected("/v1/bookings?from=2026-10-08&to=2026-10-07"), /earlier/);
    assert.match(await rejected("/v1/bookings?from=2026-10-07&to=2026-10-07"), /earlier/);
    assert.match(await rejected("/v1/availability"), /service_id parameter is required/);
    assert.match(await rejected("/v1/availability?service_id=" + SERVICE), /date parameter is required/);
    assert.match(await rejected("/v1/availability?service_id=nope&date=2026-10-07"), /service_id parameter must be a UUID/);
    assert.match(await rejected("/v1/availability?service_id=" + SERVICE + "&date=2026-13-01"), /calendar date/);
  });

  it("accepts the documented forms", async () => {
    const b = backend({ authenticate_api_key: () => ok(auth()), api_list_bookings: () => ok([]) });
    const res = await run("/v1/bookings?from=2026-10-01&to=2026-10-31T21:00:00%2B03:00&status=confirmed&limit=10", b);
    assert.equal(res.status, 200);
    const args = b.calls[1].args;
    assert.equal(args.p_from, "2026-10-01");
    assert.equal(args.p_to, "2026-10-31T21:00:00+03:00");
    assert.equal(args.p_status, "confirmed");
    assert.equal(args.p_limit, 11, "one extra row is requested to learn whether another page exists");
  });
});

describe("data access", () => {
  it("takes provider, branch and scopes from the authenticated key, never from the request", async () => {
    const be = backend({
      authenticate_api_key: () => ok(auth({ branch_id: BRANCH, scopes: ["services:read"] })),
      api_list_services: () => ok([]),
    });
    await run("/v1/services", be);
    assert.deepEqual(be.calls[1], {
      fn: "api_list_services",
      args: { p_provider_id: PROVIDER, p_branch_id: BRANCH, p_scopes: ["services:read"], p_after_id: null, p_limit: PAGE_SIZE_DEFAULT + 1 },
    });
  });

  it("returns only the documented fields of every endpoint", async () => {
    const leaky = { ...bookingRow(1), customer_id: uuid(7), customer_phone: "+966500000000", customer_email: "a@b.sa", notes: "allergic", payment_intent_id: "chg_1", walk_in_name: "Sara" };
    const be = backend({ authenticate_api_key: () => ok(auth()), api_list_bookings: () => ok([leaky]) });
    const res = await run("/v1/bookings", be);
    assert.equal(res.status, 200);
    const row = res.body.data[0];
    assert.deepEqual(Object.keys(row).sort(), Object.keys(bookingRow(1)).sort());
    const text = JSON.stringify(res.body);
    for (const secret of ["+966500000000", "a@b.sa", "allergic", "chg_1", "Sara", "customer_"]) assert.ok(!text.includes(secret), secret);
  });

  it("returns availability as one document and checks the slot shape", async () => {
    const slots = [{ start: "2026-10-07T06:00:00+00:00", end: "2026-10-07T06:45:00+00:00", internal_note: "x" }];
    const be = backend({
      authenticate_api_key: () => ok(auth()),
      api_get_availability: (args) => ok([{ employee_id: uuid(50), branch_id: BRANCH, service_id: args.p_service_id, date: args.p_date, slots, secret: "z" }]),
    });
    const res = await run(`/v1/availability?service_id=${SERVICE.toUpperCase()}&date=2026-10-07`, be);
    assert.equal(res.status, 200);
    assert.equal(res.body.pagination, undefined);
    assert.deepEqual(res.body.data[0].slots, [{ start: slots[0].start, end: slots[0].end }]);
    assert.equal(res.body.data[0].secret, undefined);
    assert.equal(be.calls[1].args.p_service_id, SERVICE, "the id is lower-cased before it is used");
    const bad = backend({ authenticate_api_key: () => ok(auth()), api_get_availability: () => ok([{ employee_id: uuid(50), slots: "nope" }]) });
    assert.equal((await run(`/v1/availability?service_id=${SERVICE}&date=2026-10-07`, bad)).status, 500);
  });

  it("maps database answers to the error taxonomy", async () => {
    const answer = async (error) => run("/v1/services", backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => error }));
    assert.equal((await answer(dbError("P0002"))).status, 404);
    assert.equal((await answer(dbError("22023"))).status, 400);
    const internal = await answer(dbError("57014", "canceling statement due to statement timeout"));
    assert.equal(internal.status, 500);
    assert.ok(!JSON.stringify(internal.body).includes("statement timeout"));
    assert.equal((await answer({ data: { not: "an array" }, error: null })).status, 500);
    assert.equal((await answer(ok([null]))).status, 500);
    assert.equal((await answer(ok([{ name_en: "no id" }]))).status, 500, "a list row without an id cannot be paged");
  });
});

describe("pagination", () => {
  it("returns a page, a cursor for the next one, and no cursor on the last page", async () => {
    const all = [1, 2, 3, 4, 5].map((n) => bookingRow(n, `2026-10-0${n}T07:00:00.${n}23456+00:00`));
    const be = backend({
      authenticate_api_key: () => ok(auth()),
      api_list_bookings: (args) => {
        const after = args.p_after_id;
        const start = after ? all.findIndex((r) => r.id === after) + 1 : 0;
        return ok(all.slice(start, start + args.p_limit));
      },
    });
    const first = await run("/v1/bookings?limit=2", be);
    assert.deepEqual(first.body.data.map((r) => r.id), [uuid(1), uuid(2)]);
    assert.equal(first.body.pagination.limit, 2);
    assert.equal(first.body.pagination.has_more, true);
    const cursor = decodeCursor(first.body.pagination.next_cursor).value;
    assert.deepEqual(cursor, { t: "2026-10-02T07:00:00.223456+00:00", i: uuid(2) }, "microseconds survive the cursor");

    const second = await run(`/v1/bookings?limit=2&cursor=${first.body.pagination.next_cursor}`, be);
    assert.deepEqual(second.body.data.map((r) => r.id), [uuid(3), uuid(4)]);
    assert.equal(be.calls.at(-1).args.p_after_scheduled_at, "2026-10-02T07:00:00.223456+00:00");
    assert.equal(be.calls.at(-1).args.p_after_id, uuid(2));

    const third = await run(`/v1/bookings?limit=2&cursor=${second.body.pagination.next_cursor}`, be);
    assert.deepEqual(third.body.data.map((r) => r.id), [uuid(5)]);
    assert.deepEqual(third.body.pagination, { limit: 2, has_more: false, next_cursor: null });
  });

  it("returns an empty list as an empty page, not an error", async () => {
    const res = await run("/v1/employees", backend({ authenticate_api_key: () => ok(auth()), api_list_employees: () => ok([]) }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { data: [], pagination: { limit: PAGE_SIZE_DEFAULT, has_more: false, next_cursor: null } });
  });

  it("uses the contract page size by default and never asks for more than the maximum plus one", async () => {
    const be = backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => ok([]) });
    await run(`/v1/services?limit=${PAGE_SIZE_MAX}`, be);
    assert.equal(be.calls[1].args.p_limit, PAGE_SIZE_MAX + 1);
  });
});

describe("every response", () => {
  it("carries a request id in the header and, for errors, the body, and never any CORS header", async () => {
    const ids = new Set();
    const be = backend({ authenticate_api_key: () => ok(auth()), api_list_services: () => ok([]) });
    const responses = [
      await run("/nope", be), await run("/v1/services", be, { method: "POST" }), await run("/v1/services", be, { token: null }),
      await run("/v1/services?x=1", be), await run("/v1/services", be),
      await run("/v1/services", backend({ authenticate_api_key: () => ok(auth({ rate_limit: { limit: 1, remaining: 0, reset_at: RESET, exceeded: true } })) })),
    ];
    for (const res of responses) {
      assert.match(res.headers["X-Request-Id"], /^req_[0-9a-f]{32}$/);
      ids.add(res.headers["X-Request-Id"]);
      assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
      for (const name of Object.keys(res.headers)) assert.ok(!/^access-control-/i.test(name), `no CORS header: ${name}`);
      if (res.status >= 400) {
        assert.deepEqual(Object.keys(res.body), ["error"]);
        assert.equal(res.body.error.request_id, res.headers["X-Request-Id"]);
        assert.ok(["invalid_request", "unauthorized", "forbidden", "not_found", "method_not_allowed", "rate_limited", "internal_error"].includes(res.body.error.code));
      }
    }
    assert.equal(ids.size, responses.length, "request ids are unique");
  });

  it("ignores a request id supplied by the caller", async () => {
    const res = await run("/nope", backend(), { headers: { "x-request-id": "attacker\ninjected" } });
    assert.ok(!res.headers["X-Request-Id"].includes("attacker"));
  });
});
