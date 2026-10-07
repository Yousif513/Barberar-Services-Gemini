// FIX-BOOKING item 1 (D-21 / R3): slot validation uses the windows the customer was shown, never a fallback read in the session time zone.
// The harness database runs in UTC, like a hosted Supabase project, which is exactly where the hard-coded 03:45-20:35 fallback failed.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let svc2;
let date;
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
const arr = (xs) => `{${xs.map((x) => `"${x}"`).join(",")}}`;
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

const slots = (employee, duration, windows = null) => as(db, customer,
  `select slot_start from get_available_slots($1, $2::date, $3, $4::timestamptz[], $5::timestamptz[]) order by 1`,
  [employee, date, duration, windows ? arr(windows.map((w) => w[0])) : null, windows ? arr(windows.map((w) => w[1])) : null])
  .then((rows) => rows.map((r) => clock(r.slot_start)));

const book = (slot, windows = null, extra = {}) => as(db, customer,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
     prayer_window_starts => $4::timestamptz[], prayer_window_ends => $5::timestamptz[])`,
  [extra.employee === undefined ? SEED.employee1 : extra.employee, svc.id, slot,
   windows ? arr(windows.map((w) => w[0])) : null, windows ? arr(windows.map((w) => w[1])) : null]).then((r) => r[0]);

const cancel = (b) => as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  svc2 = await serviceFor(db, SEED.employee1, 1);
  date = await nextWorkingDate(db, SEED.employee1);
  // A long single shift, in Riyadh local time, on the test date.
  await sys(db, `update employee_availability set start_time = '06:00', end_time = '23:30', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null
                 where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
});

describe("prayer windows and the Riyadh clock (D-21 / R3)", () => {
  it("runs in a UTC session, like production", async () => {
    const tz = await sys(db, `show timezone`);
    assert.equal(tz[0].TimeZone ?? tz[0].timezone, "UTC");
  });

  it("applies NO prayer exclusion when the client passes no windows", async () => {
    const list = await slots(SEED.employee1, svc.duration);
    // The old fallback removed slots around 03:45, 12:00, 15:30, 18:45 and 20:15 read in UTC (06:30, 07:00, 15:00, 18:30, 21:30 ... Riyadh).
    for (const t of ["06:30", "07:00", "15:00", "18:30", "21:30"]) assert.ok(list.includes(t), `${t} should be listed, got ${list.join(" ")}`);
    const fallbackSource = (await sys(db, `select pg_get_functiondef('public.get_available_slots(uuid,date,integer,timestamptz[],timestamptz[])'::regprocedure) d`))[0].d;
    assert.ok(!/v_slot_time::time|v_slot_end::time|'12:20:00'/.test(fallbackSource), "no clock comparison in the session time zone may remain");
  });

  it("lists the same slots whatever the session time zone is", async () => {
    const inZone = async (zone) => db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL TIME ZONE '${zone}'`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
      return (await tx.query(`select slot_start from get_available_slots($1, $2::date, $3) order by 1`, [SEED.employee1, date, svc.duration]))
        .rows.map((r) => new Date(r.slot_start).toISOString());
    });
    const utc = await inZone("UTC");
    assert.ok(utc.length > 10);
    assert.deepEqual(await inZone("Asia/Riyadh"), utc);
    assert.deepEqual(await inZone("America/New_York"), utc);
  });

  it("books the slot the customer was shown at 15:00 Riyadh (the server used to refuse it under UTC)", async () => {
    const b = await book(riyadh("15:00"));
    assert.equal(b.status, "pending_payment");
    assert.equal(clock(b.scheduled_at), "15:00");
    await cancel(b);
  });

  it("books each of the slots the reviewer probed (06:30 07:00 15:00 18:30 21:30 22:00 23:00 where they fit the shift)", async () => {
    for (const t of ["06:30", "07:00", "18:30", "21:30"]) {
      const b = await book(riyadh(t));
      assert.equal(clock(b.scheduled_at), t);
      await cancel(b);
    }
  });

  it("resolves an any-professional booking at 15:00 Riyadh without windows", async () => {
    const b = await book(riyadh("15:00"), null, { employee: null });
    assert.ok(b.employee_id);
    await cancel(b);
  });

  it("excludes exactly the windows the client passes, in listing and in validation", async () => {
    const windows = [[riyadh("15:00"), riyadh("15:20")]];
    const list = await slots(SEED.employee1, svc.duration, windows);
    assert.ok(!list.includes("15:00"), "15:00 overlaps the window");
    assert.ok(list.includes("17:00"));
    await expectError(book(riyadh("15:00"), windows), /no longer available/);
    const ok = await book(riyadh("17:00"), windows);
    assert.equal(clock(ok.scheduled_at), "17:00");
    await cancel(ok);
    // With no windows the very same slot is bookable: pauses are a presentation rule of the client.
    const free = await book(riyadh("15:00"));
    await cancel(free);
  });

  it("passes the windows through create_multi_service_booking", async () => {
    assert.ok(svc2, "the seed employee offers a second service");
    const windows = [[riyadh("15:00"), riyadh("15:20")]];
    const payload = JSON.stringify([{ service_id: svc.id }, { service_id: svc2.id }]);
    const call = (slot, w) => as(db, customer,
      `select create_multi_service_booking(target_branch_id => $1, target_employee_id => $2, target_scheduled_at => $3,
         services_payload => $4::jsonb, prayer_window_starts => $5::timestamptz[], prayer_window_ends => $6::timestamptz[]) r`,
      [SEED.branch1, SEED.employee1, slot, payload, w ? arr(w.map((x) => x[0])) : null, w ? arr(w.map((x) => x[1])) : null]).then((r) => r[0].r);
    await expectError(call(riyadh("15:00"), windows), /no longer available/);
    const ok = await call(riyadh("15:00"), null);
    assert.equal(ok.success, true);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [ok.booking_id]);
    const ok2 = await call(riyadh("17:00"), windows);
    assert.equal(ok2.services_count, 2);
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [ok2.booking_id]);
  });

  it("passes the windows through reschedule_booking", async () => {
    const windows = [[riyadh("15:00"), riyadh("15:20")]];
    const b = await book(riyadh("12:00"));
    const move = (slot, w) => as(db, customer,
      `select reschedule_booking(target_booking_id => $1, new_scheduled_at => $2, prayer_window_starts => $3::timestamptz[], prayer_window_ends => $4::timestamptz[]) r`,
      [b.id, slot, w ? arr(w.map((x) => x[0])) : null, w ? arr(w.map((x) => x[1])) : null]).then((r) => r[0].r);
    await expectError(move(riyadh("15:00"), windows), /not available/);
    const r1 = await move(riyadh("17:00"), windows);
    assert.equal(r1.success, true);
    const r2 = await move(riyadh("15:00"), null);
    assert.equal(clock(r2.new_scheduled_at), "15:00");
    await cancel(b);
  });

  it("refuses malformed window lists on every entry point", async () => {
    const bad = [
      [`{"${riyadh("15:00")}"}`, null],
      [`{"${riyadh("15:00")}"}`, `{"${riyadh("15:20")}","${riyadh("16:00")}"}`],
      [`{"${riyadh("15:20")}"}`, `{"${riyadh("15:00")}"}`],
    ];
    for (const [s, e] of bad) {
      await expectError(as(db, customer,
        `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
           prayer_window_starts => $4::timestamptz[], prayer_window_ends => $5::timestamptz[])`,
        [SEED.employee1, svc.id, riyadh("17:00"), s, e]), /Prayer window|prayer window/);
    }
    const tooMany = Array.from({ length: 13 }, (_, i) => [`${date}T0${i % 10}:00:00+03:00`, `${date}T0${i % 10}:10:00+03:00`]);
    await expectError(as(db, customer,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
         prayer_window_starts => $4::timestamptz[], prayer_window_ends => $5::timestamptz[])`,
      [SEED.employee1, svc.id, riyadh("17:00"), arr(tooMany.map((w) => w[0])), arr(tooMany.map((w) => w[1]))]), /At most 12/);
  });

  it("keeps one version of each entry point and the same privileges as before", async () => {
    const rows = await sys(db, `select proname, count(*)::int n,
        bool_and(has_function_privilege('authenticated', oid, 'EXECUTE')) auth,
        bool_or(has_function_privilege('anon', oid, 'EXECUTE')) anon
      from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('create_booking','create_multi_service_booking','reschedule_booking','booking_create_internal') group by 1 order by 1`);
    const by = Object.fromEntries(rows.map((r) => [r.proname, r]));
    for (const name of Object.keys(by)) assert.equal(by[name].n, 1, `${name} must not keep an old overload`);
    for (const name of ["create_booking", "create_multi_service_booking", "reschedule_booking"]) {
      assert.equal(by[name].auth, true, `${name} stays callable by signed-in users`);
      assert.equal(by[name].anon, false, `${name} stays closed to anonymous callers`);
    }
    assert.equal(by.booking_create_internal.auth, false);
    assert.equal(by.booking_create_internal.anon, false);
    await expectError(as(db, ROLES.anon, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, riyadh("17:00")]), /permission denied/);
  });
});
