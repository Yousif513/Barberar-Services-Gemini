// FIX-BOOKING item 2 (D-16 / R21): after-midnight slots of single and split overnight shifts, seasonal overnight schedules,
// and seasons that must not override days off. The employee's weekdays are set explicitly, so the test does not depend on the seed.
import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let P; // the evening a shift starts
let D; // the morning it spills into
const customer = ROLES.user(SEED.customer);
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });

const setDay = (date, { start = "09:00", end = "17:00", working = true, second = null } = {}) => sys(db,
  `insert into employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day, has_second_shift, second_start_time, second_end_time)
   values ($1, $2, $3, $4, $5, $6, $7, $8)
   on conflict (employee_id, day_of_week) do update set start_time = excluded.start_time, end_time = excluded.end_time,
     is_working_day = excluded.is_working_day, has_second_shift = excluded.has_second_shift,
     second_start_time = excluded.second_start_time, second_end_time = excluded.second_end_time`,
  [SEED.employee1, dow(date), start, end, working, Boolean(second), second?.[0] ?? null, second?.[1] ?? null]);

const list = (date, duration = 30) => as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1`,
  [SEED.employee1, date, duration]).then((rows) => rows.map((r) => clock(r.slot_start)));

const season = (from, to, start, end, extra = {}) => sys(db,
  `insert into seasonal_schedules (provider_id, branch_id, season_name, start_date, end_date, start_time, end_time, has_second_shift, second_start_time, second_end_time, is_active)
   values ($1, $2, 'test season', $3, $4, $5, $6, $7, $8, $9, $10)`,
  [SEED.provider1, extra.branch ?? null, from, to, start, end, Boolean(extra.second), extra.second?.[0] ?? null, extra.second?.[1] ?? null, extra.active ?? true]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  // Far enough ahead that nothing is in the past; any weekday works because both days are set explicitly.
  P = addDays(new Date().toISOString().slice(0, 10), 10);
  D = addDays(P, 1);
});

beforeEach(async () => {
  await sys(db, `delete from seasonal_schedules where provider_id = $1`, [SEED.provider1]);
  await sys(db, `delete from employee_time_off where employee_id = $1`, [SEED.employee1]);
  await sys(db, `delete from provider_closures where provider_id = $1`, [SEED.provider1]);
  await setDay(P, { start: "09:00", end: "17:00" });
  await setDay(D, { working: false });
});

describe("overnight shifts and seasonal schedules (D-16 / R21)", () => {
  it("keeps an ordinary shift exactly as before", async () => {
    const slots = await list(P);
    assert.equal(slots[0], "09:00");
    assert.equal(slots.at(-1), "16:30");
    assert.equal(slots.length, 16);
  });

  it("single overnight shift 21:00-02:00 offers 00:00-01:30 the next morning (E13a)", async () => {
    await setDay(P, { start: "21:00", end: "02:00" });
    assert.deepEqual(await list(D), ["00:00", "00:30", "01:00", "01:30"]);
    const evening = await list(P);
    assert.equal(evening[0], "21:00");
    assert.equal(evening.at(-1), "23:30", "the evening list holds only slots that start on that calendar day");
  });

  it("split shift 09:00-13:00 and 21:00-02:00 offers the second shift's after-midnight slots (E13b)", async () => {
    await setDay(P, { start: "09:00", end: "13:00", second: ["21:00", "02:00"] });
    assert.deepEqual(await list(D), ["00:00", "00:30", "01:00", "01:30"]);
    const day = await list(P);
    assert.deepEqual(day.slice(0, 8), ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
    assert.deepEqual(day.slice(8), ["21:00", "21:30", "22:00", "22:30", "23:00", "23:30"]);
  });

  it("a longer service only starts where it ends inside the shift", async () => {
    await setDay(P, { start: "09:00", end: "13:00", second: ["21:00", "02:00"] });
    assert.deepEqual(await list(D, 60), ["00:00", "00:30", "01:00"]);
  });

  it("an after-midnight slot can really be booked, and is then taken", async () => {
    await setDay(P, { start: "09:00", end: "13:00", second: ["21:00", "02:00"] });
    const at = `${D}T00:30:00+03:00`;
    const b = await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`,
      [SEED.employee1, svc.id, at]).then((r) => r[0]);
    assert.equal(clock(b.scheduled_at), "00:30");
    assert.ok(!(await list(D, svc.duration)).includes("00:30"));
    await as(db, customer, `select cancel_booking($1, 'test cleanup')`, [b.id]);
  });

  it("the spill-over continues the grid of the shift (a 21:15 start continues at 00:15)", async () => {
    await setDay(P, { start: "21:15", end: "02:00" });
    assert.deepEqual(await list(D), ["00:15", "00:45", "01:15"]);
  });

  it("seasonal overnight 21:00-02:00 spills over from the seasonal row, not the weekly one", async () => {
    await season(P, P, "21:00", "02:00");
    assert.deepEqual(await list(D), ["00:00", "00:30", "01:00", "01:30"]);
    const evening = await list(P);
    assert.equal(evening[0], "21:00", "the season replaces the weekly 09:00-17:00 hours on its days");
    assert.ok(!evening.includes("09:00"));
  });

  it("a seasonal split shift spills over its second shift too", async () => {
    await season(P, P, "09:00", "13:00", { second: ["21:00", "02:00"] });
    assert.deepEqual(await list(D), ["00:00", "00:30", "01:00", "01:30"]);
  });

  it("a season does not override the employee's day off", async () => {
    await season(D, D, "10:00", "20:00");
    assert.deepEqual(await list(D), [], "D is a weekly day off; the season only changes hours");
    await setDay(D, { start: "08:00", end: "12:00" });
    assert.equal((await list(D))[0], "10:00", "on a working day the season's hours apply");
  });

  it("an overnight season starting on a day off does not spill into the next morning", async () => {
    await setDay(P, { working: false });
    await season(P, P, "21:00", "02:00");
    assert.deepEqual(await list(P), []);
    assert.deepEqual(await list(D), []);
  });

  it("a branch-specific season wins over a provider-wide one", async () => {
    await season(P, P, "10:00", "12:00");
    await season(P, P, "14:00", "16:00", { branch: SEED.branch1 });
    assert.deepEqual(await list(P), ["14:00", "14:30", "15:00", "15:30"]);
  });

  it("an inactive season is ignored", async () => {
    await season(P, P, "21:00", "02:00", { active: false });
    assert.equal((await list(P))[0], "09:00");
  });

  it("no spill-over from a day the employee was on leave or the provider was closed", async () => {
    await setDay(P, { start: "21:00", end: "02:00" });
    assert.equal((await list(D)).length, 4);
    await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2, $2, 'approved')`, [SEED.employee1, P]);
    assert.deepEqual(await list(D), [], "leave on the evening cancels the overnight shift");
    await sys(db, `delete from employee_time_off where employee_id = $1`, [SEED.employee1]);
    await sys(db, `insert into provider_closures (provider_id, start_date, end_date) values ($1, $2, $2)`, [SEED.provider1, P]);
    assert.deepEqual(await list(D), [], "a closure on the evening cancels the overnight shift");
  });

  it("nothing is offered on a day of leave or closure, whatever the schedule says", async () => {
    await setDay(P, { start: "21:00", end: "02:00" });
    await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2, $2, 'approved')`, [SEED.employee1, D]);
    assert.deepEqual(await list(D), []);
  });

  it("refuses a booking in the last half hour before the overnight shift ends", async () => {
    await setDay(P, { start: "21:00", end: "02:00" });
    await expectError(as(db, customer,
      `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`,
      [SEED.employee1, svc.id, `${D}T02:00:00+03:00`]), /no longer available/);
  });
});
