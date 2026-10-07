import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { handleApiRequest } from "../../functions/_shared/api-router.ts";
import { decodeCursor } from "../../functions/_shared/api-pagination.ts";
import { API_KEY_COLUMNS, DELIVERY_COLUMNS, ENDPOINT_COLUMNS } from "../../../web_platform/src/lib/developer-api.ts";

// The real request pipeline (the same module the Edge Function runs) against the real migrated database: only the
// transport is replaced, by a backend that calls the SQL functions as the service role, which is what supabase-js does.

let db;
let admin;
let svc;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const EMP_P2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

const backend = {
  async rpc(fn, args) {
    const names = Object.keys(args);
    const sql = `select ${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
    try {
      const rows = await as(db, ROLES.service, sql, names.map((n) => args[n]));
      return { data: rows[0].r, error: null };
    } catch (error) {
      return { data: null, error: { code: error.code, message: error.message } };
    }
  },
};
const get = (path, key) => handleApiRequest(
  { method: "GET", url: `https://project.supabase.co/functions/v1/public-api${path}`, headers: { get: (n) => (n.toLowerCase() === "authorization" && key ? `Bearer ${key}` : null) } },
  backend,
);
const newKey = async (user, provider, over = {}) => (await as(db, user, `select create_api_key($1, $2, $3, $4::text[], $5::timestamptz, $6) r`,
  [provider, over.branch ?? null, over.name ?? `Key ${Math.random().toString(36).slice(2, 8)}`, over.scopes ?? "{services:read,employees:read,availability:read,bookings:read}",
   new Date(Date.now() + 30 * 86400000).toISOString(), over.rpm ?? 600]))[0].r;

let n = 0;
async function booking(over = {}) {
  n += 1;
  return (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, $5, now() + make_interval(days => $6::int), 30, 100, 115, 15, 0, 0, 'link') returning *`,
    [SEED.customer, over.branch ?? SEED.branch1, over.employee ?? SEED.employee1, over.service ?? svc.id, over.status ?? "confirmed", 40 + n]))[0];
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
  await as(db, admin, `select admin_set_api_setting('api.max_requests_per_minute', '600'::jsonb, 'End to end test setup')`);
  svc = await serviceFor(db, SEED.employee1);
});

describe("a provider's key reads that provider's data through the real pipeline", () => {
  let key1;
  let key2;
  let mine;
  let theirs;
  before(async () => {
    key1 = await newKey(owner1, SEED.provider1, { name: "Integration one" });
    key2 = await newKey(owner2, SEED.provider2, { name: "Integration two" });
    mine = [];
    for (let i = 0; i < 5; i += 1) mine.push(await booking());
    mine.push(await booking({ status: "cancelled" }));
    const svc2 = await serviceFor(db, EMP_P2);
    const branch2 = (await sys(db, `select id from branches where provider_id = $1 limit 1`, [SEED.provider2]))[0].id;
    theirs = await booking({ branch: branch2, employee: EMP_P2, service: svc2.id });
  });

  it("lists services, employees and bookings of the key's provider only", async () => {
    const services = await get("/v1/services", key1.key);
    assert.equal(services.status, 200);
    const expected = (await sys(db, `select id from services where provider_id = $1 order by id`, [SEED.provider1])).map((r) => r.id);
    assert.deepEqual(services.body.data.map((s) => s.id), expected);
    assert.equal(services.headers["X-RateLimit-Limit"], "600");

    const staff = await get("/v1/employees", key1.key);
    assert.ok(staff.body.data.some((e) => e.id === SEED.employee1) && !staff.body.data.some((e) => e.id === EMP_P2));

    const bookings = await get("/v1/bookings", key1.key);
    const ids = bookings.body.data.map((b) => b.id);
    for (const b of mine) assert.ok(ids.includes(b.id));
    assert.ok(!ids.includes(theirs.id));
    assert.ok(JSON.stringify(bookings.body).indexOf(SEED.customer) === -1, "no customer id leaves the API");

    const other = await get("/v1/bookings", key2.key);
    assert.deepEqual(other.body.data.map((b) => b.id), [theirs.id]);
  });

  it("pages through every booking by cursor, with no gap and no repeat", async () => {
    const all = (await get("/v1/bookings?limit=100", key1.key)).body.data.map((b) => b.id);
    const walked = [];
    let path = "/v1/bookings?limit=2";
    for (let guard = 0; guard < 10; guard += 1) {
      const res = await get(path, key1.key);
      assert.equal(res.status, 200);
      walked.push(...res.body.data.map((b) => b.id));
      if (!res.body.pagination.has_more) {
        assert.equal(res.body.pagination.next_cursor, null);
        break;
      }
      assert.equal(res.body.data.length, 2);
      assert.ok(decodeCursor(res.body.pagination.next_cursor).ok);
      path = `/v1/bookings?limit=2&cursor=${res.body.pagination.next_cursor}`;
    }
    assert.deepEqual(walked, all);
  });

  it("filters by status and by a date range", async () => {
    const cancelled = await get("/v1/bookings?status=cancelled", key1.key);
    assert.ok(cancelled.body.data.length >= 1 && cancelled.body.data.every((b) => b.status === "cancelled"));
    // from is inclusive, to is exclusive: a one-second window opened at (the millisecond before) a booking's start holds exactly it.
    const first = mine[0];
    const start = new Date(first.scheduled_at);
    const from = new Date(start.getTime()).toISOString();
    const to = new Date(start.getTime() + 1000).toISOString();
    const hit = await get(`/v1/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, key1.key);
    assert.deepEqual(hit.body.data.map((b) => b.id), [first.id]);
    const miss = await get(`/v1/bookings?from=${encodeURIComponent(new Date(start.getTime() + 1000).toISOString())}&to=${encodeURIComponent(new Date(start.getTime() + 2000).toISOString())}`, key1.key);
    assert.ok(!miss.body.data.some((b) => b.id === first.id));
  });

  it("answers availability for a service and refuses another provider's service", async () => {
    const date = await nextWorkingDate(db, SEED.employee1);
    const ok = await get(`/v1/availability?service_id=${svc.id}&date=${date}`, key1.key);
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.some((r) => r.employee_id === SEED.employee1 && r.slots.length > 0));
    const foreign = await get(`/v1/availability?service_id=${svc.id}&date=${date}`, key2.key);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.error.code, "not_found");
  });

  it("enforces scopes: a key without bookings:read gets 403 on bookings and 200 on services", async () => {
    const narrow = await newKey(owner1, SEED.provider1, { scopes: "{services:read}" });
    assert.equal((await get("/v1/bookings", narrow.key)).status, 403);
    assert.equal((await get("/v1/services", narrow.key)).status, 200);
    assert.equal((await get("/v1/employees", narrow.key)).status, 403);
  });

  it("honours a branch-limited key", async () => {
    const extra = (await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
                                  values ($1, 'Other branch', 'فرع آخر', 'Riyadh', 'الرياض', 24.7, 46.7) returning id`, [SEED.provider1]))[0].id;
    const limited = await newKey(owner1, SEED.provider1, { branch: extra });
    assert.deepEqual((await get("/v1/bookings", limited.key)).body.data, []);
    assert.deepEqual((await get("/v1/employees", limited.key)).body.data, []);
  });

  it("answers revoked, unknown and malformed keys with the same 401", async () => {
    const doomed = await newKey(owner1, SEED.provider1);
    assert.equal((await get("/v1/services", doomed.key)).status, 200);
    await as(db, owner1, `select revoke_api_key($1, 'End to end revoke')`, [doomed.id]);
    const unknown = `prm_live_${"ab".repeat(32)}`;
    const answers = [await get("/v1/services", doomed.key), await get("/v1/services", unknown), await get("/v1/services", "nonsense"), await get("/v1/services", null)];
    for (const a of answers) {
      assert.equal(a.status, 401);
      assert.equal(a.body.error.message, "Invalid or missing API key.");
    }
  });

  it("rate-limits from the limit stored on the key and recovers in the next window", async () => {
    const tight = await newKey(owner1, SEED.provider1, { rpm: 2 });
    const second = new Date().getUTCSeconds();
    if (second >= 55) await new Promise((r) => setTimeout(r, (61 - second) * 1000));
    assert.equal((await get("/v1/services", tight.key)).status, 200);
    assert.equal((await get("/v1/services", tight.key)).status, 200);
    const limited = await get("/v1/services", tight.key);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "rate_limited");
    assert.ok(Number(limited.headers["Retry-After"]) >= 1);
    assert.equal(limited.headers["X-RateLimit-Remaining"], "0");
    await sys(db, `update api_rate_counters set window_start = window_start - interval '1 minute' where key_id = $1`, [tight.id]);
    assert.equal((await get("/v1/services", tight.key)).status, 200);
  });

  it("never sends customer, payment or staff contact data, whatever the database holds", async () => {
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani', email = 'zainab.q@example.test', phone_number = '+966511119999' where id = $1`, [SEED.customer]);
    await sys(db, `update employees set phone = '+966500002222', email = 'staff.contact@example.test' where id = $1`, [SEED.employee1]);
    await sys(db, `update bookings set walk_in_name = 'Walk In Person', walk_in_phone = '+966522223333', cancellation_reason = 'private reason' where id = $1`, [mine[0].id]);
    const bodies = [];
    for (const path of ["/v1/services", "/v1/employees", "/v1/bookings?limit=100"]) bodies.push(JSON.stringify((await get(path, key1.key)).body));
    const text = bodies.join("\n");
    for (const secret of ["Zainab", "Qahtani", "zainab.q", "+966511119999", "+966500002222", "staff.contact", "Walk In Person", "+966522223333", "private reason", SEED.customer, "payment_intent"]) {
      assert.ok(!text.includes(secret), `the API must not expose ${secret}`);
    }
  });
});

describe("what the console selects exists in the schema", () => {
  it("lets the owner select exactly the console's columns from the three tables", async () => {
    for (const [table, columns] of [["api_keys", API_KEY_COLUMNS], ["webhook_subscriptions", ENDPOINT_COLUMNS], ["webhook_deliveries", DELIVERY_COLUMNS]]) {
      await as(db, owner1, `select ${columns} from ${table} where provider_id = $1 order by created_at desc limit 1`, [SEED.provider1]);
    }
    await as(db, owner1, `select key, value from platform_settings where key in ('api.max_requests_per_minute')`);
    await as(db, owner1, `select id, name_en, name_ar from branches where provider_id = $1 order by created_at`, [SEED.provider1]);
  });
});
