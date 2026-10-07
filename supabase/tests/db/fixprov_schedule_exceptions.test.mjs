import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PROV R16: the screens for closures, seasons and leave rely on the existing tables and their policies.
// These tests pin the rules the screens depend on, for every role.
let db;
let stylist;
let colleague;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const day = async (n) => (await sys(db, `select (current_date + ${n})::text d`))[0].d;

before(async () => {
  db = await createMigratedDb();
  stylist = ROLES.user(await createUser(db, { role: "provider_employee" }));
  colleague = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [stylist.sub, SEED.employee1]);
  await sys(db, `update employees set profile_id = $1 where id = $2`, [colleague.sub, SEED.employee2]);
});

describe("closures (R16)", () => {
  const closure = (user, provider, start, end) => as(db, user,
    `insert into provider_closures (provider_id, start_date, end_date, closure_type, reason_en, reason_ar) values ($1, $2::date, $3::date, 'holiday', 'Eid', 'العيد') returning id`,
    [provider, start, end]);

  it("lets the owner close for a holiday and everybody read it", async () => {
    const id = (await closure(owner1, SEED.provider1, await day(40), await day(43)))[0].id;
    assert.equal((await as(db, customer, `select id from provider_closures where id = $1`, [id])).length, 1);
    assert.equal((await as(db, ROLES.anon, `select id from provider_closures where id = $1`, [id])).length, 1);
  });
  it("refuses a closure that ends before it starts", async () => {
    await assert.rejects(closure(owner1, SEED.provider1, await day(50), await day(48)), /valid_closure_dates|violates check/);
  });
  it("refuses anonymous visitors, customers, an employee and another provider's owner", async () => {
    const start = await day(60);
    const end = await day(61);
    await assert.rejects(closure(ROLES.anon, SEED.provider1, start, end), /permission denied/);
    await assert.rejects(closure(customer, SEED.provider1, start, end), /row-level security|permission denied/);
    await assert.rejects(closure(owner2, SEED.provider1, start, end), /row-level security/);
    await assert.rejects(closure(stylist, SEED.provider1, start, end), /row-level security/);
  });
  it("lets only the owner delete one", async () => {
    const id = (await closure(owner1, SEED.provider1, await day(70), await day(71)))[0].id;
    assert.equal((await as(db, owner2, `delete from provider_closures where id = $1 returning id`, [id])).length, 0);
    assert.equal((await as(db, stylist, `delete from provider_closures where id = $1 returning id`, [id])).length, 0);
    assert.equal((await as(db, owner1, `delete from provider_closures where id = $1 returning id`, [id])).length, 1);
  });
});

describe("seasonal schedules (R16)", () => {
  const season = (user, provider, start, end, from = "21:00", to = "02:00") => as(db, user,
    `insert into seasonal_schedules (provider_id, season_name, start_date, end_date, start_time, end_time, is_active) values ($1, 'Ramadan', $2::date, $3::date, $4::time, $5::time, true) returning id, start_time, end_time`,
    [provider, start, end, from, to]);

  it("stores an overnight shift, 21:00 to 02:00", async () => {
    const row = (await season(owner1, SEED.provider1, await day(100), await day(129)))[0];
    assert.equal(row.start_time, "21:00:00");
    assert.equal(row.end_time, "02:00:00");
  });
  it("shows active seasons to everyone and paused ones only to the owner", async () => {
    const id = (await season(owner1, SEED.provider1, await day(140), await day(141)))[0].id;
    await as(db, owner1, `update seasonal_schedules set is_active = false where id = $1`, [id]);
    assert.equal((await as(db, owner1, `select id from seasonal_schedules where id = $1`, [id])).length, 1);
    assert.equal((await as(db, customer, `select id from seasonal_schedules where id = $1`, [id])).length, 0);
  });
  it("refuses everyone but the owner", async () => {
    const start = await day(150);
    const end = await day(151);
    await assert.rejects(season(ROLES.anon, SEED.provider1, start, end), /permission denied/);
    await assert.rejects(season(customer, SEED.provider1, start, end), /row-level security|permission denied/);
    await assert.rejects(season(owner2, SEED.provider1, start, end), /row-level security/);
    await assert.rejects(season(stylist, SEED.provider1, start, end), /row-level security/);
  });
});

describe("leave requests (R16)", () => {
  it("lets a professional ask for leave for themselves, as pending", async () => {
    const rows = await as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, $2::date, $3::date, 'Family', 'pending') returning id, status`,
      [SEED.employee1, await day(20), await day(22)]);
    assert.equal(rows[0].status, "pending");
  });
  it("refuses a request that does not say pending (the column defaults to approved) and a self-approval", async () => {
    await expectError(as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, reason) values ($1, $2::date, $3::date, 'Sneaky')`,
      [SEED.employee1, await day(25), await day(26)]), /not by the staff member/);
    const id = (await as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2::date, $2::date, 'pending') returning id`, [SEED.employee1, await day(27)]))[0].id;
    await expectError(as(db, stylist, `update employee_time_off set status = 'approved' where id = $1`, [id]), /not by the staff member/);
  });
  it("refuses a request on behalf of a colleague", async () => {
    await assert.rejects(as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2::date, $2::date, 'pending')`, [SEED.employee2, await day(28)]), /row-level security/);
  });
  it("lets the owner approve or reject, and no one else", async () => {
    const id = (await as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2::date, $2::date, 'pending') returning id`, [SEED.employee1, await day(30)]))[0].id;
    assert.equal((await as(db, owner2, `update employee_time_off set status = 'approved' where id = $1 returning id`, [id])).length, 0);
    assert.equal((await as(db, colleague, `update employee_time_off set status = 'approved' where id = $1 returning id`, [id])).length, 0);
    assert.equal((await as(db, owner1, `update employee_time_off set status = 'approved' where id = $1 returning status`, [id]))[0].status, "approved");
  });
  it("lets the owner record approved leave directly", async () => {
    const rows = await as(db, owner1, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, $2::date, $2::date, 'Hajj', 'approved') returning status`, [SEED.employee2, await day(35)]);
    assert.equal(rows[0].status, "approved");
  });
  it("keeps one person's leave from another provider's owner, a customer and a visitor", async () => {
    const id = (await as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, $2::date, $2::date, 'Private reason', 'pending') returning id`, [SEED.employee1, await day(36)]))[0].id;
    for (const user of [owner2, customer, colleague]) {
      assert.equal((await as(db, user, `select id from employee_time_off where id = $1`, [id])).length, 0);
    }
    await assert.rejects(as(db, ROLES.anon, `select id from employee_time_off`), /permission denied/);
    assert.equal((await as(db, stylist, `select id from employee_time_off where id = $1`, [id])).length, 1);
    assert.equal((await as(db, owner1, `select id from employee_time_off where id = $1`, [id])).length, 1);
  });
  it("lets a professional withdraw their own pending request but not delete an approved one for someone else", async () => {
    const id = (await as(db, stylist, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, $2::date, $2::date, 'pending') returning id`, [SEED.employee1, await day(37)]))[0].id;
    assert.equal((await as(db, colleague, `delete from employee_time_off where id = $1 returning id`, [id])).length, 0);
    assert.equal((await as(db, stylist, `delete from employee_time_off where id = $1 and status = 'pending' returning id`, [id])).length, 1);
  });
});
