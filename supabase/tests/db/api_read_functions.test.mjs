import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// G69 part 3: the SQL functions behind the read API. Isolation is proven here, in the database, because the Edge
// Function only passes along the provider, branch and scopes that authenticate_api_key returned.

let db;
let admin;
let svc1;
let svc2;
let branch2;
let extraBranch1;
const owner1 = ROLES.user(SEED.owner1);
// The seed gives provider one three professionals (employee1 and employee2 among them); provider two's are these.
const EMP_P2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const customer = ROLES.user(SEED.customer);
const ALL = "{services:read,employees:read,availability:read,bookings:read}";
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const failure = (promise) => promise.then(() => null, (error) => ({ code: error.code, message: error.message }));
const call = (sql, params) => as(db, ROLES.service, sql, params).then((rows) => rows[0].r);

const services = (provider, over = {}) => call(`select api_list_services($1, $2, $3::text[], $4, $5) r`, [provider, over.branch ?? null, ("scopes" in over ? over.scopes : ALL), over.after ?? null, over.limit ?? 101]);
const employees = (provider, over = {}) => call(`select api_list_employees($1, $2, $3::text[], $4, $5) r`, [provider, over.branch ?? null, ("scopes" in over ? over.scopes : ALL), over.after ?? null, over.limit ?? 101]);
const availability = (provider, service, date, over = {}) => call(`select api_get_availability($1, $2, $3::text[], $4, $5::date) r`, [provider, over.branch ?? null, ("scopes" in over ? over.scopes : ALL), service, date]);
const bookings = (provider, over = {}) => call(`select api_list_bookings($1, $2, $3::text[], $4, $5, $6, $7::timestamptz, $8, $9) r`,
  [provider, over.branch ?? null, ("scopes" in over ? over.scopes : ALL), over.from ?? null, over.to ?? null, over.status ?? null, over.afterAt ?? null, over.afterId ?? null, over.limit ?? 101]);

let minute = 0;
async function insertBooking(over = {}) {
  minute += 1;
  const a = { branch: SEED.branch1, employee: SEED.employee1, service: svc1.id, status: "confirmed", at: `now() + interval '${30 + minute} days'`, ...over };
  return (await sys(db,
    `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
     values ($1, $2, $3, $4, $5, ${a.at}, 30, 100, 115, 15, 0, 0, 'link') returning *`,
    [SEED.customer, a.branch, a.employee, a.service, a.status]))[0];
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
  svc1 = await serviceFor(db, SEED.employee1);
  svc2 = await serviceFor(db, EMP_P2);
  branch2 = (await sys(db, `select id from branches where provider_id = $1 limit 1`, [SEED.provider2]))[0].id;
  extraBranch1 = (await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude)
                                 values ($1, 'Second branch', 'الفرع الثاني', 'Riyadh', 'الرياض', 24.7, 46.7) returning id`, [SEED.provider1]))[0].id;
  await sys(db, `update employees set phone = '+966500001111', email = 'staff.private@example.test' where id = $1`, [SEED.employee1]);
  await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani', email = 'zainab.q@example.test' where id = $1`, [SEED.customer]);
});

describe("who can call the data functions", () => {
  const probes = () => [
    `select api_list_services('${SEED.provider1}', null, '${ALL}'::text[], null, 10)`,
    `select api_list_employees('${SEED.provider1}', null, '${ALL}'::text[], null, 10)`,
    `select api_get_availability('${SEED.provider1}', null, '${ALL}'::text[], '${svc1.id}', '2026-12-01')`,
    `select api_list_bookings('${SEED.provider1}', null, '${ALL}'::text[], null, null, null, null, null, 10)`,
    `select api_assert_service_caller('${SEED.provider1}', null)`,
  ];

  it("refuses every role except the service role", async () => {
    for (const [name, user] of [["anonymous", ROLES.anon], ["customer", customer], ["provider owner", owner1], ["administrator", admin]]) {
      for (const sql of probes()) assert.equal(await outcome(as(db, user, sql)), "42501", `${name}: ${sql.slice(0, 40)}`);
    }
  });

  it("checks the JWT role itself, so a widened grant would not open them", async () => {
    for (const sql of probes()) {
      const refused = await failure(db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', '{"role":"authenticated","sub":"${SEED.owner1}"}', true)`);
        return (await tx.query(sql)).rows;
      }));
      assert.match(refused.message, /Service role required/, sql.slice(0, 40));
    }
  });

  it("answers not found for a missing provider and for a branch of another provider", async () => {
    assert.equal(await outcome(services(null)), "P0002");
    assert.equal(await outcome(services(SEED.provider1, { branch: branch2 })), "P0002");
    assert.equal(await outcome(bookings(SEED.provider2, { branch: SEED.branch1 })), "P0002");
  });
});

describe("scopes", () => {
  it("are required by every function", async () => {
    const without = (scope) => `{${ALL.slice(1, -1).split(",").filter((s) => s !== scope).join(",")}}`;
    assert.equal(await outcome(services(SEED.provider1, { scopes: without("services:read") })), "42501");
    assert.equal(await outcome(employees(SEED.provider1, { scopes: without("employees:read") })), "42501");
    assert.equal(await outcome(availability(SEED.provider1, svc1.id, "2026-12-01", { scopes: without("availability:read") })), "42501");
    assert.equal(await outcome(bookings(SEED.provider1, { scopes: without("bookings:read") })), "42501");
    assert.equal(await outcome(bookings(SEED.provider1, { scopes: "{}" })), "42501");
    assert.equal(await outcome(bookings(SEED.provider1, { scopes: null })), "42501");
    assert.equal(await outcome(bookings(SEED.provider1, { scopes: "{services:read,employees:read,availability:read}" })), "42501", "another scope does not help");
  });
});

describe("services", () => {
  it("lists the provider's own services with the documented fields only", async () => {
    const own = await services(SEED.provider1);
    const expected = await sys(db, `select id from services where provider_id = $1 order by id`, [SEED.provider1]);
    assert.deepEqual(own.map((s) => s.id), expected.map((s) => s.id));
    assert.ok(own.length > 0);
    assert.deepEqual(Object.keys(own[0]).sort(), ["category_id", "created_at", "currency", "description_ar", "description_en", "duration_minutes",
      "id", "is_active", "is_home_service_eligible", "name_ar", "name_en", "price", "updated_at"]);
    assert.equal(own[0].currency, "SAR");
    const row = (await sys(db, `select base_price, base_duration_minutes from services where id = $1`, [own[0].id]))[0];
    assert.equal(Number(own[0].price), Number(row.base_price));
    assert.equal(own[0].duration_minutes, row.base_duration_minutes);
  });

  it("never returns another provider's services", async () => {
    const one = (await services(SEED.provider1)).map((s) => s.id);
    const two = (await services(SEED.provider2)).map((s) => s.id);
    assert.ok(two.length > 0);
    assert.deepEqual(one.filter((id) => two.includes(id)), []);
    const foreign = (await sys(db, `select id from services where provider_id <> $1`, [SEED.provider1])).map((r) => r.id);
    assert.deepEqual(one.filter((id) => foreign.includes(id)), []);
  });

  it("pages by id without gaps or repeats", async () => {
    for (let i = 0; i < 4; i += 1) {
      await sys(db, `insert into services (provider_id, category_id, name_en, name_ar, base_price, base_duration_minutes)
                     select provider_id, category_id, 'Extra ' || $2::text, 'إضافي', 50, 20 from services where provider_id = $1 limit 1`, [SEED.provider1, i]);
    }
    const all = (await services(SEED.provider1)).map((s) => s.id);
    assert.ok(all.length >= 5);
    const walked = [];
    let after = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await services(SEED.provider1, { after, limit: 3 });
      walked.push(...page.map((s) => s.id));
      if (page.length < 3) break;
      after = page.at(-1).id;
    }
    assert.deepEqual(walked, all);
    assert.equal((await services(SEED.provider1, { limit: 9999 })).length, all.length, "the limit is clamped, not an error");
    assert.equal((await services(SEED.provider1, { limit: 0 })).length, 1);
  });

  it("narrows to the services a branch's active staff perform", async () => {
    assert.ok((await services(SEED.provider1, { branch: SEED.branch1 })).length > 0);
    assert.deepEqual(await services(SEED.provider1, { branch: extraBranch1 }), [], "a branch without staff offers nothing");
  });
});

describe("employees", () => {
  it("lists the provider's staff without contact details", async () => {
    const own = await employees(SEED.provider1);
    assert.ok(own.some((e) => e.id === SEED.employee1));
    assert.ok(!own.some((e) => e.id === EMP_P2));
    assert.deepEqual(Object.keys(own[0]).sort(), ["branch_id", "id", "is_active", "name_ar", "name_en", "service_ids", "title_ar", "title_en"]);
    const text = JSON.stringify(own);
    for (const secret of ["+966500001111", "staff.private", "phone", "email"]) assert.ok(!text.includes(secret), secret);
    assert.ok(own.find((e) => e.id === SEED.employee1).service_ids.includes(svc1.id));
  });

  it("keeps each provider's staff and service ids apart", async () => {
    const two = await employees(SEED.provider2);
    assert.ok(two.some((e) => e.id === EMP_P2) && !two.some((e) => e.id === SEED.employee1));
    for (const e of two) assert.ok(!e.service_ids.includes(svc1.id));
  });

  it("filters by branch and pages by id", async () => {
    assert.deepEqual(await employees(SEED.provider1, { branch: extraBranch1 }), []);
    const all = (await employees(SEED.provider1)).map((e) => e.id);
    const first = await employees(SEED.provider1, { limit: 1 });
    assert.equal(first.length, 1);
    const rest = await employees(SEED.provider1, { after: first[0].id });
    assert.deepEqual([first[0].id, ...rest.map((e) => e.id)], all);
  });
});

describe("availability", () => {
  let date;
  before(async () => {
    date = await nextWorkingDate(db, SEED.employee1);
  });

  it("matches the booking engine's own slots for each professional who performs the service", async () => {
    const result = await availability(SEED.provider1, svc1.id, date);
    const mine = result.find((r) => r.employee_id === SEED.employee1);
    assert.ok(mine, "the professional is listed");
    assert.equal(mine.service_id, svc1.id);
    assert.equal(mine.date, date);
    const engine = await sys(db, `select slot_start from get_available_slots($1, $2::date, $3) order by 1`, [SEED.employee1, date, svc1.duration]);
    assert.ok(engine.length > 0, "the fixture has open slots");
    assert.deepEqual(mine.slots.map((s) => new Date(s.start).getTime()), engine.map((s) => new Date(s.slot_start).getTime()));
    for (const slot of mine.slots) assert.equal(new Date(slot.end).getTime() - new Date(slot.start).getTime(), svc1.duration * 60000);
  });

  it("stops offering a slot once it is booked", async () => {
    const before = (await availability(SEED.provider1, svc1.id, date)).find((r) => r.employee_id === SEED.employee1).slots;
    const taken = before[0].start;
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
                   values ($1, $2, $3, $4, 'confirmed', $5, $6, 100, 115, 15, 0, 0, 'link')`, [SEED.customer, SEED.branch1, SEED.employee1, svc1.id, taken, svc1.duration]);
    const after = (await availability(SEED.provider1, svc1.id, date)).find((r) => r.employee_id === SEED.employee1).slots;
    assert.ok(!after.some((s) => new Date(s.start).getTime() === new Date(taken).getTime()));
  });

  it("does not answer for another provider's service, and does not list another provider's staff", async () => {
    assert.equal(await outcome(availability(SEED.provider1, svc2.id, date)), "P0002");
    assert.equal(await outcome(availability(SEED.provider2, svc1.id, date)), "P0002");
    const two = await availability(SEED.provider2, svc2.id, date);
    assert.ok(two.every((r) => r.employee_id !== SEED.employee1));
    assert.equal(await outcome(availability(SEED.provider1, "00000000-0000-4000-8000-0000000000aa", date)), "P0002");
    assert.equal(await outcome(call(`select api_get_availability($1, null, $2::text[], null, '2026-12-01') r`, [SEED.provider1, ALL])), "22023");
  });

  it("honours a key narrowed to a branch and omits inactive staff", async () => {
    assert.deepEqual(await availability(SEED.provider1, svc1.id, date, { branch: extraBranch1 }), []);
    await sys(db, `update employees set is_active = false where id = $1`, [SEED.employee1]);
    assert.ok(!(await availability(SEED.provider1, svc1.id, date)).some((r) => r.employee_id === SEED.employee1));
    await sys(db, `update employees set is_active = true where id = $1`, [SEED.employee1]);
  });
});

describe("bookings", () => {
  let mine;
  let theirs;
  before(async () => {
    mine = [];
    for (let i = 0; i < 5; i += 1) mine.push(await insertBooking());
    mine.push(await insertBooking({ status: "cancelled" }));
    // Two bookings at the very same instant for different professionals: the id is the tie-breaker of the cursor.
    const twin = (await sys(db, `select now() + interval '120 days' as at`))[0].at;
    mine.push(await insertBooking({ at: `'${new Date(twin).toISOString()}'::timestamptz` }));
    mine.push(await insertBooking({ at: `'${new Date(twin).toISOString()}'::timestamptz`, employee: (await sys(db, `select id from employees where branch_id = $1 and id <> $2 limit 1`, [SEED.branch1, SEED.employee1]))[0]?.id ?? SEED.employee1 }).catch(() => null));
    theirs = await insertBooking({ branch: branch2, employee: EMP_P2, service: svc2.id });
  });

  it("lists only the provider's bookings, in start order, with booking facts and no customer data", async () => {
    const list = await bookings(SEED.provider1);
    const ids = list.map((b) => b.id);
    for (const b of mine.filter(Boolean)) assert.ok(ids.includes(b.id));
    assert.ok(!ids.includes(theirs.id), "another provider's booking is never returned");
    const times = list.map((b) => new Date(b.scheduled_at).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.deepEqual(Object.keys(list[0]).sort(), ["branch_id", "created_at", "currency", "discount_amount", "duration_minutes", "employee_id", "id",
      "is_home_service", "scheduled_at", "service_id", "service_name_ar", "service_name_en", "source", "status", "tax_amount", "total_price"]);
    const text = JSON.stringify(list);
    for (const secret of ["Zainab", "Qahtani", "zainab.q", SEED.customer, "customer_id", "phone", "email", "walk_in", "notes"]) assert.ok(!text.includes(secret), secret);
    assert.deepEqual((await bookings(SEED.provider2)).map((b) => b.id).filter((id) => mine.some((m) => m && m.id === id)), []);
    assert.ok((await bookings(SEED.provider2)).some((b) => b.id === theirs.id));
  });

  it("filters by status and by branch", async () => {
    assert.ok((await bookings(SEED.provider1, { status: "cancelled" })).every((b) => b.status === "cancelled"));
    assert.ok((await bookings(SEED.provider1, { status: "cancelled" })).length >= 1);
    assert.deepEqual(await bookings(SEED.provider1, { branch: extraBranch1 }), []);
    assert.equal(await outcome(bookings(SEED.provider1, { status: "done" })), "22023");
  });

  it("walks every page by cursor without a gap or a repeat, including rows that start at the same instant", async () => {
    const all = (await bookings(SEED.provider1)).map((b) => b.id);
    assert.ok(all.length >= 7);
    const walked = [];
    let cursor = { at: null, id: null };
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await bookings(SEED.provider1, { limit: 3, afterAt: cursor.at, afterId: cursor.id });
      walked.push(...page.map((b) => b.id));
      if (page.length < 3) break;
      cursor = { at: page.at(-1).scheduled_at, id: page.at(-1).id };
    }
    assert.deepEqual(walked, all);
    assert.equal(new Set(walked).size, walked.length);
    assert.equal(await outcome(bookings(SEED.provider1, { afterAt: "2026-12-01T00:00:00Z" })), "22023", "half a cursor is refused");
    assert.equal(await outcome(bookings(SEED.provider1, { afterId: SEED.customer })), "22023");
  });

  it("reads date-only filters as Riyadh calendar days, from inclusive and to exclusive", async () => {
    // 21:30 UTC on 14 Dec is 00:30 on 15 Dec in Riyadh.
    const late = await insertBooking({ at: `'2031-12-14T21:30:00Z'::timestamptz` });
    const early = await insertBooking({ at: `'2031-12-14T20:30:00Z'::timestamptz` });
    const on14 = (await bookings(SEED.provider1, { from: "2031-12-14", to: "2031-12-15" })).map((b) => b.id);
    assert.ok(on14.includes(early.id) && !on14.includes(late.id), "00:30 on the 15th is not part of the 14th");
    const on15 = (await bookings(SEED.provider1, { from: "2031-12-15", to: "2031-12-16" })).map((b) => b.id);
    assert.ok(on15.includes(late.id) && !on15.includes(early.id));
    const exact = (await bookings(SEED.provider1, { from: "2031-12-14T21:30:00Z", to: "2031-12-14T21:30:01Z" })).map((b) => b.id);
    assert.deepEqual(exact, [late.id], "from is inclusive, to is exclusive, offsets are honoured");
    const offset = (await bookings(SEED.provider1, { from: "2031-12-15T00:30:00+03:00", to: "2031-12-15T00:31:00+03:00" })).map((b) => b.id);
    assert.deepEqual(offset, [late.id]);
    assert.equal(await outcome(bookings(SEED.provider1, { from: "tomorrow" })), "22007");
  });

  it("honours a key narrowed to one branch", async () => {
    const inBranch = await insertBooking({ branch: extraBranch1, employee: SEED.employee1 }).catch(() => null);
    const onlyOne = await bookings(SEED.provider1, { branch: SEED.branch1 });
    assert.ok(onlyOne.every((b) => b.branch_id === SEED.branch1));
    if (inBranch) assert.ok(!onlyOne.some((b) => b.id === inBranch.id));
  });
});

describe("catalog invariants of the read functions", () => {
  it("are elevated, pinned and executable by the service role alone", async () => {
    const rows = await sys(db, `
      select p.proname, p.prosecdef, exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as pinned,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_x
      from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('api_list_services', 'api_list_employees', 'api_get_availability', 'api_list_bookings', 'api_assert_service_caller')`);
    assert.equal(rows.length, 5);
    for (const row of rows) assert.deepEqual([row.prosecdef, row.pinned, row.anon_x, row.auth_x, row.service_x], [true, true, false, false, true], row.proname);
  });

  it("match the function names and argument names the router sends", async () => {
    const { ROUTE_RPCS } = await import("../../functions/_shared/api-router.ts");
    for (const rpc of ROUTE_RPCS) {
      const args = (await sys(db, `select pg_get_function_arguments(p.oid) a from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [rpc]))[0].a;
      for (const name of ["p_provider_id", "p_branch_id", "p_scopes"]) assert.ok(args.includes(name), `${rpc} takes ${name}`);
    }
  });
});
