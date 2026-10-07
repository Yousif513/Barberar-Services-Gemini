import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PROV D-28 / R27: dashboard figures come from the server, the checklist from rows, and the share-kit use is remembered once.
let db;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const summary = async (user, provider = SEED.provider1) => (await as(db, user, `select get_provider_dashboard_summary($1) s`, [provider]))[0].s;
const riyadhDow = async () => (await sys(db, `select extract(dow from (now() at time zone 'Asia/Riyadh'))::int d`))[0].d;

before(async () => {
  db = await createMigratedDb();
});

describe("get_provider_dashboard_summary (R27, D-28)", () => {
  it("counts walk-ins by source, not by 'not a home visit'", async () => {
    const before = await summary(owner1);
    const svc = await serviceFor(db, SEED.employee2);
    await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'Counter customer', null, 'cash', null, (now() + interval '9 days')::timestamptz)`, [SEED.branch1, SEED.employee2, svc.id]);
    const after = await summary(owner1);
    assert.equal(after.bookings.walk_ins, before.bookings.walk_ins + 1);
    assert.equal(after.bookings.bookings, before.bookings.bookings + 1);
    const direct = (await sys(db, `select count(*)::int n from bookings b join branches br on br.id = b.branch_id where br.provider_id = $1 and b.source = 'walk_in'`, [SEED.provider1]))[0].n;
    assert.equal(after.bookings.walk_ins, direct);
  });

  it("sums revenue over completed bookings only, in the database", async () => {
    const s = await summary(owner1);
    const expected = (await sys(db, `select coalesce(sum(b.total_price) filter (where b.status = 'completed'), 0)::numeric r, count(*)::int n from bookings b join branches br on br.id = b.branch_id where br.provider_id = $1`, [SEED.provider1]))[0];
    assert.equal(Number(s.bookings.revenue), Number(expected.r));
    assert.equal(s.bookings.bookings, expected.n);
  });

  it("derives the checklist figures from rows: services, staff, hours, policy", async () => {
    const s = await summary(owner1);
    const services = (await sys(db, `select count(*)::int n from services where provider_id = $1 and is_active`, [SEED.provider1]))[0].n;
    assert.equal(s.services_count, services);
    assert.ok(s.staff.total >= s.staff.active);
    assert.equal(s.policy_confirmed_at, null, "nothing is confirmed until the owner saves the policy");
    assert.equal(s.share_kit_used_at, null);
    await sys(db, `delete from employee_availability where employee_id in (select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id = $1)`, [SEED.provider1]);
    assert.equal((await summary(owner1)).staff.with_hours, 0, "no schedule rows means no hours are claimed");
  });

  it("computes occupancy from today's scheduled minutes, counting an overnight shift past midnight", async () => {
    const dow = await riyadhDow();
    await sys(db, `delete from employee_availability where employee_id in (select e.id from employees e join branches b on b.id = e.branch_id where b.provider_id = $1)`, [SEED.provider1]);
    await sys(db, `delete from employee_time_off`);
    await sys(db, `delete from provider_closures`);
    await sys(db, `insert into employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day) values ($1, $2, '21:00', '02:00', true)`, [SEED.employee1, dow]);
    let s = await summary(owner1);
    assert.equal(Number(s.today_scheduled_minutes), 300, "21:00 to 02:00 is five hours");
    await sys(db, `update employee_availability set has_second_shift = true, second_start_time = '10:00', second_end_time = '12:00' where employee_id = $1 and day_of_week = $2`, [SEED.employee1, dow]);
    s = await summary(owner1);
    assert.equal(Number(s.today_scheduled_minutes), 420, "a second shift adds its own minutes");
    assert.equal(s.occupancy_percent === null || Number(s.occupancy_percent) <= 100, true);
    await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, status) values ($1, (now() at time zone 'Asia/Riyadh')::date, (now() at time zone 'Asia/Riyadh')::date, 'approved')`, [SEED.employee1]);
    s = await summary(owner1);
    assert.equal(Number(s.today_scheduled_minutes), 0, "approved leave removes the minutes");
    assert.equal(s.occupancy_percent, null, "no one scheduled means no percentage, not a made-up one");
  });

  it("is refused to a stranger, a customer, another provider's owner and an anonymous visitor, and open to an administrator", async () => {
    await expectError(as(db, owner2, `select get_provider_dashboard_summary($1)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, customer, `select get_provider_dashboard_summary($1)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, owner1, `select get_provider_dashboard_summary($1)`, ["00000000-0000-4000-8000-000000000000"]), /Provider not found/);
    await assert.rejects(as(db, ROLES.anon, `select get_provider_dashboard_summary($1)`, [SEED.provider1]), (e) => e.code === "42501");
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    assert.equal((await summary(admin)).provider_id, SEED.provider1);
  });
});

describe("record_share_kit_use (D-28)", () => {
  it("remembers the first use, answers a replay without changing it, and shows in the summary", async () => {
    const first = (await as(db, owner1, `select record_share_kit_use($1) r`, [SEED.provider1]))[0].r;
    assert.equal(first.recorded, true);
    const again = (await as(db, owner1, `select record_share_kit_use($1) r`, [SEED.provider1]))[0].r;
    assert.equal(again.recorded, false);
    assert.equal(again.share_kit_used_at, first.share_kit_used_at);
    assert.ok((await summary(owner1)).share_kit_used_at);
  });
  it("is refused to another provider's owner, a customer, an anonymous visitor, and leaves the audit trail", async () => {
    await expectError(as(db, owner2, `select record_share_kit_use($1)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, customer, `select record_share_kit_use($1)`, [SEED.provider1]), /Provider not found/);
    await assert.rejects(as(db, ROLES.anon, `select record_share_kit_use($1)`, [SEED.provider1]), (e) => e.code === "42501");
    const logged = await sys(db, `select 1 from admin_audit_logs where action = 'provider.share_kit_used' and target_id = $1`, [SEED.provider1]);
    assert.equal(logged.length, 1, "the first use is audited once");
  });
});
