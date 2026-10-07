// FIX-BOOKING item 6 (R42 / G37): home-service bookings are accepted only inside the branch's geofence_radius_km.
import { afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

let db;
let svc;
let date;
let branch; // { latitude, longitude }
let farBranchId;
let farEmployeeId;
const customer = ROLES.user(SEED.customer);
const riyadh = (hhmm) => `${date}T${hhmm}:00+03:00`;
// 1 degree of latitude is about 111.19 km everywhere
const northOf = (km) => Number(branch.latitude) + km / 111.19;

const setRadius = (id, km) => sys(db, `update branches set geofence_radius_km = $2 where id = $1`, [id, km]);

const bookHome = (hhmm, { lat, lng = Number(branch.longitude), employee = SEED.employee1, home = true, branchId = null } = {}) => as(db, customer,
  `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3,
     request_home_service => $4, request_home_address_lat => $5, request_home_address_lng => $6,
     request_branch_id => $7, request_home_address_text => 'Test address')`,
  [employee, svc.id, riyadh(hhmm), home, lat ?? null, lng, branchId]).then((r) => r[0]);

before(async () => {
  db = await createMigratedDb();
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
  branch = (await sys(db, `select latitude, longitude from branches where id = $1`, [SEED.branch1]))[0];
  await sys(db, `update services set is_home_service_eligible = true, base_duration_minutes = 30 where id = $1`, [svc.id]);
  await sys(db, `update employee_services set custom_duration_minutes = null where service_id = $1`, [svc.id]);
  await sys(db, `update employee_availability set start_time = '09:00', end_time = '17:00', is_working_day = true, has_second_shift = false,
                   second_start_time = null, second_end_time = null
                 where employee_id = $1 and day_of_week = extract(dow from $2::date)::int`, [SEED.employee1, date]);
  // A second branch of the same provider, about 300 km away, with its own professional offering the same service.
  farBranchId = (await sys(db, `insert into branches (provider_id, name_en, name_ar, address_text_en, address_text_ar, latitude, longitude, geofence_radius_km)
                                values ($1, 'Far branch', 'فرع بعيد', 'Far', 'بعيد', $2, $3, 20) returning id`,
    [SEED.provider1, northOf(300), branch.longitude]))[0].id;
  farEmployeeId = (await sys(db, `insert into employees (branch_id, name_en, name_ar) values ($1, 'Far stylist', 'أخصائي') returning id`, [farBranchId]))[0].id;
  await sys(db, `insert into employee_services (employee_id, service_id) values ($1, $2)`, [farEmployeeId, svc.id]);
  await sys(db, `insert into employee_availability (employee_id, day_of_week, start_time, end_time, is_working_day)
                 values ($1, extract(dow from $2::date)::int, '09:00', '17:00', true)`, [farEmployeeId, date]);
});

afterEach(async () => {
  const open = await sys(db, `select id, customer_id from bookings where service_id = $1 and status in ('pending_payment', 'confirmed')`, [svc.id]);
  for (const b of open) await as(db, ROLES.user(b.customer_id), `select cancel_booking($1, 'test cleanup')`, [b.id]);
  await setRadius(SEED.branch1, 5);
});

describe("home-service radius (R42 / G37)", () => {
  it("measures great-circle distance (Riyadh to Jeddah is about 846 km)", async () => {
    const km = Number((await sys(db, `select haversine_km(24.7136, 46.6753, 21.4858, 39.1925) d`))[0].d);
    assert.ok(km > 840 && km < 856, `got ${km}`);
    assert.equal(Number((await sys(db, `select haversine_km(24.7, 46.7, 24.7, 46.7) d`))[0].d), 0);
  });

  it("accepts a home visit inside the radius and refuses one outside it (reproduced: 800 km away used to be accepted)", async () => {
    await setRadius(SEED.branch1, 5);
    const near = await bookHome("10:00", { lat: northOf(2) });
    assert.equal(near.is_home_service, true);
    const edge = await bookHome("11:00", { lat: northOf(4.9) });
    assert.ok(edge.id);
    await expectError(bookHome("12:00", { lat: northOf(5.5) }), /outside the branch home-visit area of 5\.00 km/);
    await expectError(bookHome("12:00", { lat: northOf(800) }), /outside the branch home-visit area/);
    const blocked = await sys(db, `select count(*)::int n from bookings where service_id = $1 and scheduled_at = $2 and status in ('pending_payment','confirmed')`, [svc.id, riyadh("12:00")]);
    assert.equal(blocked[0].n, 0, "a refused booking leaves nothing behind");
  });

  it("a radius of 0 or NULL means no service area is configured and is not enforced", async () => {
    await setRadius(SEED.branch1, 0);
    assert.ok((await bookHome("10:00", { lat: northOf(800) })).id);
    await setRadius(SEED.branch1, null);
    assert.ok((await bookHome("11:00", { lat: northOf(800) })).id);
  });

  it("does not apply to bookings at the salon", async () => {
    await setRadius(SEED.branch1, 5);
    const b = await bookHome("10:00", { lat: northOf(800), home: false });
    assert.equal(b.is_home_service, false);
  });

  it("refuses coordinates outside the earth, and missing ones", async () => {
    await expectError(bookHome("10:00", { lat: 95 }), /coordinates are not valid/);
    await expectError(bookHome("10:00", { lat: 24.7, lng: 200 }), /coordinates are not valid/);
    await expectError(bookHome("10:00", { lat: null }), /coordinates are required/);
  });

  it("uses the radius of the professional's own branch", async () => {
    await setRadius(SEED.branch1, 5);
    // the far branch (20 km radius) serves an address right next to it ...
    const ok = await bookHome("10:00", { lat: northOf(300 + 3), employee: farEmployeeId, branchId: farBranchId });
    assert.equal(ok.branch_id, farBranchId);
    // ... but not the address that is next to the first branch
    await expectError(bookHome("11:00", { lat: northOf(1), employee: farEmployeeId, branchId: farBranchId }), /outside the branch home-visit area of 20\.00 km/);
  });

  it("'any professional' only picks a professional of a branch that serves the address", async () => {
    await setRadius(SEED.branch1, 5);
    // The far professional is the busier one, so without the radius rule the least-loaded pick would be the first branch's professional.
    await bookHome("14:00", { lat: northOf(300 + 1), employee: farEmployeeId, branchId: farBranchId });
    await bookHome("15:00", { lat: northOf(300 + 1), employee: farEmployeeId, branchId: farBranchId });
    const nearFirst = await bookHome("10:00", { lat: northOf(1), employee: null });
    assert.equal(nearFirst.branch_id, SEED.branch1);
    const nearFar = await bookHome("11:00", { lat: northOf(300 + 2), employee: null });
    assert.equal(nearFar.branch_id, farBranchId);
    await expectError(bookHome("12:00", { lat: northOf(150), employee: null }), /No professional is available/);
  });

  it("keeps the helpers internal", async () => {
    const rows = await sys(db, `select proname, bool_or(has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE')) open
      from pg_proc where pronamespace = 'public'::regnamespace and proname in ('haversine_km', 'branch_serves_location') group by 1`);
    assert.equal(rows.length, 2);
    for (const r of rows) assert.equal(r.open, false, r.proname);
  });
});
