// FIX-BOOKING item 4 (R15 / G23): buffers, processing time and service variants take part in slot generation and conflict checks.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svcA;
let svcB;
let date;
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

const setBuffers = (id, before = 0, after = 0, processing = 0) =>
  sys(db, `update services set buffer_before_minutes = $2, buffer_after_minutes = $3, processing_time_minutes = $4 where id = $1`, [id, before, after, processing]);

const book = (service, hhmm, { employee = SEED.employee1, variant = null } = {}) => as(db, customer,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_variant_id => $4)`,
  [employee, service.id, riyadh(hhmm), variant]).then((r) => r[0]);

const list = (duration = 30, before = 0, after = 0) => as(db, customer,
  `select slot_start from get_available_slots($1, $2::date, $3, null, null, $4, $5) order by 1`,
  [SEED.employee1, date, duration, before, after]).then((rows) => rows.map((r) => clock(r.slot_start)));

const windowOf = async (b) => {
  const r = (await sys(db, `select lower(booking_window) lo, upper(booking_window) hi, blocked_before_minutes bb, blocked_after_minutes ba, duration_minutes d
                            from bookings where id = $1`, [b.id]))[0];
  return { lo: clock(r.lo), hi: clock(r.hi), before: r.bb, after: r.ba, duration: r.d };
};

before(async () => {
  db = await createMigratedDb();
  svcA = await serviceFor(db, SEED.employee1, 0);
  svcB = await serviceFor(db, SEED.employee1, 1);
  date = await nextWorkingDate(db, SEED.employee1);
  for (const s of [svcA, svcB]) {
    await sys(db, `update services set base_duration_minutes = 30 where id = $1`, [s.id]);
    await sys(db, `update employee_services set custom_duration_minutes = null, custom_price = null where service_id = $1`, [s.id]);
  }
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null
                 where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where employee_id = $1 and status in ('pending_payment', 'confirmed')`, [SEED.employee1]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  await setBuffers(svcA.id);
  await setBuffers(svcB.id);
  await sys(db, `update service_variants set is_active = false where service_id in ($1, $2)`, [svcA.id, svcB.id]);
});

describe("buffers, processing time and variants (R15 / G23)", () => {
  it("baseline: without a buffer the next slot follows the booking immediately", async () => {
    const b = await book(svcA, "09:00");
    assert.deepEqual(await windowOf(b), { lo: "09:00", hi: "09:30", before: 0, after: 0, duration: 30 });
    assert.ok((await list()).includes("09:30"));
  });

  it("buffer after 60: the next slot opens only after the buffer (reproduced: it used to follow at 09:30)", async () => {
    await setBuffers(svcA.id, 0, 60);
    const b = await book(svcA, "09:00");
    assert.deepEqual(await windowOf(b), { lo: "09:00", hi: "10:30", before: 0, after: 60, duration: 30 });
    const slots = await list();
    assert.ok(!slots.includes("09:30") && !slots.includes("10:00"), `still offering ${slots.slice(0, 4)}`);
    assert.equal(slots[0], "10:30");
    await expectError(book(svcA, "09:30"), /no longer available/);
    await expectError(book(svcA, "10:00"), /no longer available/);
    const next = await book(svcA, "10:30");
    assert.equal(next.status, "pending_payment");
  });

  it("the slot before an existing booking leaves room for its own buffer after", async () => {
    await setBuffers(svcA.id, 0, 60);
    await book(svcA, "11:00");
    await expectError(book(svcA, "10:00"), /no longer available/);   // 10:00-10:30 + 60 would run into 11:00
    const ok = await book(svcA, "09:30");                             // 09:30-10:00 + 60 ends exactly at 11:00
    assert.equal((await windowOf(ok)).hi, "11:00");
  });

  it("the candidate list for a buffered service agrees with booking validation", async () => {
    await setBuffers(svcA.id, 0, 60);
    await book(svcA, "11:00");
    const slots = await list(30, 0, 60);
    assert.ok(!slots.includes("10:00") && slots.includes("09:30"));
    for (const t of slots.slice(0, 6)) {
      const b = await book(svcA, t);
      await as(db, customer, `select cancel_booking($1, 'probe')`, [b.id]);
    }
  });

  it("buffer before 30 blocks the half hour ahead of the visit", async () => {
    await setBuffers(svcA.id, 30, 0);
    const b = await book(svcA, "10:00");
    assert.deepEqual(await windowOf(b), { lo: "09:30", hi: "10:30", before: 30, after: 0, duration: 30 });
    await expectError(book(svcA, "09:30"), /no longer available/);    // its own window 09:00-10:00 runs into 09:30
    const ok = await book(svcA, "09:00");                              // window 08:30-09:30 touches, does not overlap
    assert.equal(ok.status, "pending_payment");
  });

  it("processing time keeps the professional occupied after the visit", async () => {
    await setBuffers(svcA.id, 0, 0, 30);
    const b = await book(svcA, "09:00");
    assert.deepEqual(await windowOf(b), { lo: "09:00", hi: "10:00", before: 0, after: 30, duration: 30 });
    await expectError(book(svcA, "09:30"), /no longer available/);
  });

  it("a multi-service visit blocks the first buffer before and everything else after", async () => {
    await setBuffers(svcA.id, 15, 10, 0);
    await setBuffers(svcB.id, 5, 20, 10);
    const slot = riyadh("11:00");
    const payload = JSON.stringify([{ service_id: svcA.id }, { service_id: svcB.id }]);
    const r = (await as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, slot, payload]))[0].r;
    const w = await windowOf({ id: r.booking_id });
    // before: A 15 | after: A 10 + A 0 + B before 5 + B 20 + B 10 = 45; the visit itself is 60 minutes
    assert.deepEqual(w, { lo: "10:45", hi: "12:45", before: 15, after: 45, duration: 60 });
    const profile = (await sys(db, `select * from booking_visit_profile($1, $2::uuid[], null)`, [SEED.employee1, `{${svcA.id},${svcB.id}}`]))[0];
    assert.deepEqual([profile.is_valid, profile.total_duration_minutes, profile.blocked_before_minutes, profile.blocked_after_minutes], [true, 60, 15, 45]);
  });

  it("books a variant: its duration and price replace the service's, and the slot must fit", async () => {
    const v = (await sys(db, `insert into service_variants (service_id, name_en, name_ar, duration_minutes, price_sar) values ($1, 'Long', 'طويل', 90, 200) returning id`, [svcA.id]))[0];
    await expectError(book(svcA, "16:00", { variant: v.id }), /no longer available/);   // 16:00 + 90 minutes leaves the 17:00 shift end
    const b = await book(svcA, "15:30", { variant: v.id });
    assert.equal(b.duration_minutes, 90);
    assert.equal(Number(b.subtotal_price), 200);
    const row = (await sys(db, `select variant_id, duration_minutes, price from booking_services where booking_id = $1`, [b.id]))[0];
    assert.deepEqual([row.variant_id, row.duration_minutes, Number(row.price)], [v.id, 90, 200]);
  });

  it("refuses a variant of another service, an inactive variant and more options than services", async () => {
    const other = (await sys(db, `insert into service_variants (service_id, name_en, name_ar, duration_minutes, price_sar) values ($1, 'B-long', 'ب', 60, 120) returning id`, [svcB.id]))[0];
    await expectError(book(svcA, "09:00", { variant: other.id }), /option is not available/);
    const off = (await sys(db, `insert into service_variants (service_id, name_en, name_ar, duration_minutes, price_sar, is_active) values ($1, 'Old', 'قديم', 45, 90, false) returning id`, [svcA.id]))[0];
    await expectError(book(svcA, "09:00", { variant: off.id }), /option is not available/);
    await expectError(as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, riyadh("09:00"), JSON.stringify([{ service_id: svcA.id, variant_id: other.id }])]), /option is not available/);
  });

  it("books variants through the multi-service payload", async () => {
    const v = (await sys(db, `insert into service_variants (service_id, name_en, name_ar, duration_minutes, price_sar) values ($1, 'Long', 'طويل', 60, 150) returning id`, [svcB.id]))[0];
    const r = (await as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3, services_payload => $4::jsonb) r`,
      [SEED.branch1, SEED.employee1, riyadh("13:00"), JSON.stringify([{ service_id: svcA.id }, { service_id: svcB.id, variant_id: v.id }])]))[0].r;
    assert.equal(r.total_duration_minutes, 90);
    const rows = await sys(db, `select service_id, variant_id from booking_services where booking_id = $1 order by sequence_order`, [r.booking_id]);
    assert.deepEqual(rows.map((x) => x.variant_id), [null, v.id]);
  });

  it("the any-professional path uses the same blocked window", async () => {
    await setBuffers(svcA.id, 0, 60);
    await book(svcA, "09:00");
    await expectError(book(svcA, "09:30", { employee: null }), /No professional is available/);
    const ok = await book(svcA, "10:30", { employee: null });
    assert.equal(ok.employee_id, SEED.employee1);
  });

  it("reschedule honours buffers, may overlap its own old window, and cannot leave the working hours", async () => {
    await setBuffers(svcA.id, 0, 60);
    const mine = await book(svcA, "09:00");
    const theirs = await book(svcA, "12:00");                          // window 12:00-13:30
    const move = (to) => as(db, customer, `select reschedule_booking(target_booking_id => $1, new_scheduled_at => $2) r`, [mine.id, riyadh(to)]).then((r) => r[0].r);
    const r1 = await move("09:30");                                    // overlaps its own old window: allowed
    assert.equal(clock(r1.new_scheduled_at), "09:30");
    assert.equal((await windowOf(mine)).hi, "11:00", "the window follows the move");
    await expectError(move("11:30"), /not available/);                 // 11:30 + 30 + 60 runs into 12:00
    await expectError(move("13:00"), /not available/);                 // inside the other booking's buffer
    await expectError(move("08:30"), /not available/);                 // before the shift starts (the old overlap exception allowed this)
    const r2 = await move("10:30");                                    // 10:30-11:00 + 60 ends at 12:00
    assert.equal(clock(r2.new_scheduled_at), "10:30");
    assert.ok(theirs.id);
  });

  it("the stored window follows the blocked minutes and the exclusion constraint guards it", async () => {
    await setBuffers(svcA.id, 0, 60);
    const b = await book(svcA, "09:00");
    await sys(db, `update bookings set blocked_after_minutes = 90 where id = $1`, [b.id]);
    assert.equal((await windowOf(b)).hi, "11:00");
    await sys(db, `update bookings set blocked_after_minutes = 60 where id = $1`, [b.id]);
    // a direct write that ignores availability still cannot overlap the buffered window
    await expectError(sys(db,
      `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price,
                             tax_amount, deposit_required, platform_commission, source)
       values ($1, $2, $3, $4, 'pending_payment', $5, 30, 50, 50, 7.5, 10, 0, 'link')`,
      [SEED.customer, SEED.branch1, SEED.employee1, svcA.id, riyadh("10:00")]), /conflicting key value|exclusion|violates/i);
  });

  it("rejects negative buffers", async () => {
    await expectError(sys(db, `update services set buffer_after_minutes = -5 where id = $1`, [svcA.id]), /services_buffers_non_negative|check constraint/);
    await expectError(sys(db, `update bookings set blocked_after_minutes = -1 where id is not null`), /check constraint|violates/);
  });

  it("keeps one version of each function and its privileges", async () => {
    const rows = await sys(db, `select proname, count(*)::int n, bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth,
        bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('create_booking','create_multi_service_booking','reschedule_booking','booking_create_internal','get_available_slots','booking_visit_profile') group by 1`);
    const by = Object.fromEntries(rows.map((r) => [r.proname, r]));
    for (const r of rows) assert.equal(r.n, 1, `${r.proname} overloads`);
    for (const name of ["create_booking", "create_multi_service_booking", "reschedule_booking"]) assert.equal(by[name].anon, false, name);
    for (const name of ["booking_create_internal", "booking_visit_profile"]) assert.equal(by[name].auth, false, `${name} is internal`);
  });
});
