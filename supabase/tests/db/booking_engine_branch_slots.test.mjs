// FIX-BOOKING item 5 (R24 / C-D16): the "any professional" listing agrees with what booking_create_internal accepts.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svcA;
let svcB;
let date;
let e2; // offers A only
let e3; // offers A and B, with a custom 60-minute B
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
const arr = (xs) => `{${xs.join(",")}}`;

const branchSlots = (user, services, variants = null, windows = null) => as(db, user,
  `select slot_start, available_employee_count n, candidate_employee_ids ids, candidate_duration_minutes durs
   from get_branch_available_slots(target_branch_id => $1, target_service_id => $2, target_date => $3::date,
        prayer_window_starts => $4::timestamptz[], prayer_window_ends => $5::timestamptz[], p_service_ids => $6::uuid[], p_variant_ids => $7::uuid[])
   order by 1`,
  [SEED.branch1, services[0], date, windows ? arr(windows.map((w) => `"${w[0]}"`)) : null, windows ? arr(windows.map((w) => `"${w[1]}"`)) : null,
   arr(services), variants ? arr(variants.map((v) => v ?? "NULL")) : null])
  .then((rows) => rows.map((r) => ({ at: clock(r.slot_start), n: r.n, ids: r.ids, durs: r.durs })));

const bookWith = (employee, hhmm, services, variants = null) => as(db, customer,
  `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3,
     services_payload => $4::jsonb) r`,
  [SEED.branch1, employee, riyadh(hhmm), JSON.stringify(services.map((id, i) => ({ service_id: id, variant_id: variants?.[i] ?? null })))]).then((r) => r[0].r);

const setBuffers = (id, before = 0, after = 0) =>
  sys(db, `update services set buffer_before_minutes = $2, buffer_after_minutes = $3 where id = $1`, [id, before, after]);

before(async () => {
  db = await createMigratedDb();
  svcA = await serviceFor(db, SEED.employee1, 0);
  svcB = await serviceFor(db, SEED.employee1, 1);
  date = await nextWorkingDate(db, SEED.employee1);
  for (const s of [svcA, svcB]) await sys(db, `update services set base_duration_minutes = 30 where id = $1`, [s.id]);
  await sys(db, `update employee_services set custom_duration_minutes = null, custom_price = null where service_id in ($1, $2)`, [svcA.id, svcB.id]);
  const mk = async (name) => (await sys(db, `insert into employees (branch_id, name_en, name_ar) values ($1, $2, $2) returning id`, [SEED.branch1, name]))[0].id;
  e2 = await mk("Only A");
  e3 = await mk("Slow B");
  await sys(db, `insert into employee_services (employee_id, service_id) values ($1, $2)`, [e2, svcA.id]);
  await sys(db, `insert into employee_services (employee_id, service_id) values ($1, $2)`, [e3, svcA.id]);
  await sys(db, `insert into employee_services (employee_id, service_id, custom_duration_minutes) values ($1, $2, 60)`, [e3, svcB.id]);
  for (const e of [SEED.employee1, e2, e3]) {
    await sys(db, `insert into employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
                   values ($1, extract(dow from $2::date)::int, '09:00', '17:00', true)
                   on conflict (employee_id, day_of_week) do update set start_time = '09:00', end_time = '17:00', is_working_day = true,
                     has_second_shift = false, second_start_time = null, second_end_time = null`, [e, date]);
  }
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where branch_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.branch1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  await setBuffers(svcA.id);
  await setBuffers(svcB.id);
});

describe("any-professional slots agree with booking (R24 / C-D16)", () => {
  it("lists only professionals who offer every selected service", async () => {
    const one = await branchSlots(customer, [svcA.id]);
    assert.deepEqual(one.find((s) => s.at === "10:00").ids.slice().sort(), [SEED.employee1, e2, e3].sort());
    const both = await branchSlots(customer, [svcA.id, svcB.id]);
    const at10 = both.find((s) => s.at === "10:00");
    assert.deepEqual(at10.ids.slice().sort(), [SEED.employee1, e3].sort(), "the professional who does not offer B is not a candidate");
  });

  it("uses each professional's combined duration, not the first service's base duration", async () => {
    const both = await branchSlots(customer, [svcA.id, svcB.id]);
    const slot1530 = both.find((s) => s.at === "15:30");   // e1: 60 minutes -> 16:30, e3: 30 + 60 -> 17:00
    assert.equal(slot1530.n, 2);
    const byId = Object.fromEntries(slot1530.ids.map((id, i) => [id, slot1530.durs[i]]));
    assert.equal(byId[SEED.employee1], 60);
    assert.equal(byId[e3], 90);
    const slot1600 = both.find((s) => s.at === "16:00");   // e1 fits (-> 17:00), e3 does not (90 minutes)
    assert.deepEqual(slot1600.ids, [SEED.employee1]);
    assert.ok(!both.some((s) => s.at === "16:30"), "nobody can take 30 + 30 starting at 16:30");
  });

  it("every listed (slot, professional) pair can be booked and every unlisted one is refused", async () => {
    const both = await branchSlots(customer, [svcA.id, svcB.id]);
    for (const slot of both) {
      for (const emp of slot.ids) {
        const r = await bookWith(emp, slot.at, [svcA.id, svcB.id]);
        assert.equal(r.employee_id, emp);
        await as(db, customer, `select cancel_booking($1, 'probe')`, [r.booking_id]);
      }
    }
    // e3 at 16:00 (90 minutes does not fit), e2 anywhere (does not offer B)
    await expectError(bookWith(e3, "16:00", [svcA.id, svcB.id]), /no longer available/);
    await expectError(bookWith(e2, "10:00", [svcA.id, svcB.id]), /does not offer every selected service/);
  });

  it("any-professional booking at a listed slot resolves to one of its candidates", async () => {
    const both = await branchSlots(customer, [svcA.id, svcB.id]);
    const slot = both.find((s) => s.at === "16:00");
    const r = (await as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => null, target_scheduled_at => $2, services_payload => $3::jsonb) r`,
      [SEED.branch1, riyadh("16:00"), JSON.stringify([{ service_id: svcA.id }, { service_id: svcB.id }])]))[0].r;
    assert.ok(slot.ids.includes(r.employee_id));
  });

  it("buffers of an existing booking remove only that professional", async () => {
    await setBuffers(svcA.id, 0, 60);
    await bookWith(SEED.employee1, "09:00", [svcA.id]);          // e1 blocked 09:00-10:30
    const slots = await branchSlots(customer, [svcA.id]);
    const at0930 = slots.find((s) => s.at === "09:30");
    assert.deepEqual(at0930.ids.slice().sort(), [e2, e3].sort());
    assert.ok(slots.find((s) => s.at === "10:30").ids.includes(SEED.employee1));
  });

  it("variants change the duration shown for each professional", async () => {
    const v = (await sys(db, `insert into service_variants (service_id, name_en, name_ar, duration_minutes, price_sar) values ($1, 'Quick', 'سريع', 45, 80) returning id`, [svcB.id]))[0];
    const slots = await branchSlots(customer, [svcA.id, svcB.id], [null, v.id]);
    const at10 = slots.find((s) => s.at === "10:00");
    assert.deepEqual(at10.durs, [75, 75]);
    const r = await bookWith(SEED.employee1, "10:00", [svcA.id, svcB.id], [null, v.id]);
    assert.equal(r.total_duration_minutes, 75);
    assert.deepEqual(await branchSlots(customer, [svcA.id, svcB.id], [v.id, null]), [], "a variant of another service lists nobody");
  });

  it("passes prayer windows through", async () => {
    const windows = [[riyadh("12:00"), riyadh("12:20")]];
    const slots = await branchSlots(customer, [svcA.id], null, windows);
    assert.ok(!slots.some((s) => s.at === "12:00"));
    assert.ok(slots.some((s) => s.at === "12:30"));
    assert.ok((await branchSlots(customer, [svcA.id])).some((s) => s.at === "12:00"));
  });

  it("keeps the old four-argument call working and open to visitors", async () => {
    for (const user of [ROLES.anon, customer]) {
      const rows = await as(db, user, `select count(*)::int n from get_branch_available_slots($1, $2, $3::date, null, null)`, [SEED.branch1, svcA.id, date]);
      assert.ok(rows[0].n > 0);
    }
    const multi = await as(db, ROLES.anon, `select count(*)::int n from get_branch_available_slots($1, $2, $3::date, null, null, $4::uuid[])`,
      [SEED.branch1, svcA.id, date, arr([svcA.id, svcB.id])]);
    assert.ok(multi[0].n > 0);
  });

  it("validates the service list and returns nothing for unknown or other providers' services", async () => {
    await expectError(branchSlots(customer, [svcA.id, svcA.id]), /once/);
    const seven = Array.from({ length: 7 }, (_, i) => `c0000000-0000-4000-8000-00000000000${i}`);
    await expectError(branchSlots(customer, seven), /at most 6/);
    assert.deepEqual(await branchSlots(customer, ["c0000000-0000-4000-8000-0000000000aa"]), []);
    const foreign = (await sys(db, `select id from services where provider_id = $1 limit 1`, [SEED.provider2]))[0];
    assert.deepEqual(await branchSlots(customer, [foreign.id]), []);
    await expectError(as(db, customer,
      `select * from get_branch_available_slots($1, $2, $3::date, $4::timestamptz[], null)`,
      [SEED.branch1, svcA.id, date, `{"${riyadh("12:00")}"}`]), /matching start and end/);
  });

  it("keeps one version and the client privileges", async () => {
    const rows = await sys(db, `select count(*)::int n, bool_and(has_function_privilege('anon', oid, 'EXECUTE')) anon,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth
      from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_branch_available_slots'`);
    assert.deepEqual(rows[0], { n: 1, anon: true, auth: true });
  });
});
