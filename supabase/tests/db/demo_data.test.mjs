import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, firstSlot, ROLES, SEED, sys } from "./harness.mjs";

// The demo salons from an early migration must not be bookable by real customers, and removing them must be a
// deliberate, audited, refusable step.

let db;
let admin;
const customer = ROLES.user(SEED.customer);
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);

before(async () => {
  db = await createMigratedDb({ activateDemo: false });
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("the migrated demo salons are switched off", () => {
  it("are suspended and unverified, and are not listed to visitors", async () => {
    const rows = await sys(db, `select id, status, is_verified from providers where id = any (demo_provider_ids())`);
    assert.equal(rows.length, 3);
    for (const row of rows) assert.deepEqual([row.status, row.is_verified], ["suspended", false]);
    const listed = (await as(db, ROLES.anon, `select search_marketplace_providers() as r`))[0].r;
    assert.equal(listed.total_count, 0);
  });

  it("cannot be booked", async () => {
    const date = await nextWorkingDate(db, SEED.employee1);
    const svc = (await sys(db, `select es.service_id id, s.base_duration_minutes d from employee_services es join services s on s.id = es.service_id where es.employee_id = $1 limit 1`, [SEED.employee1]))[0];
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.d);
    assert.ok(slot, "the slot list itself is still computed");
    const result = await outcome(as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`, [SEED.employee1, svc.id, slot]));
    assert.notEqual(result, "ok", "a suspended salon must refuse bookings");
  });
});

describe("admin_purge_demo_data", () => {
  it("refuses everyone but an administrator, and an administrator without a reason", async () => {
    assert.equal(await outcome(as(db, ROLES.anon, `select admin_purge_demo_data('cleanup', 'DELETE DEMO DATA')`)), "42501");
    assert.equal(await outcome(as(db, customer, `select admin_purge_demo_data('cleanup', 'DELETE DEMO DATA')`)), "42501");
    assert.equal(await outcome(as(db, ROLES.user(SEED.owner1), `select admin_purge_demo_data('cleanup', 'DELETE DEMO DATA')`)), "42501");
    assert.equal(await outcome(as(db, admin, `select admin_purge_demo_data('x', 'DELETE DEMO DATA')`)), "22023");
    assert.equal(await outcome(as(db, admin, `select admin_purge_demo_data('A fine reason', 'yes')`)), "22023", "it must be confirmed in words");
    assert.equal((await sys(db, `select count(*)::int n from providers where id = any (demo_provider_ids())`))[0].n, 3);
  });

  it("refuses while a real account has booked a demo salon", async () => {
    const real = await createUser(db, { role: "customer", phone: "+966599900001", verified: true });
    const svc = (await sys(db, `select es.service_id id from employee_services es where es.employee_id = $1 limit 1`, [SEED.employee1]))[0];
    await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
                   values ($1, $2, $3, $4, now() + interval '5 days', 30, 'confirmed', 100, 0, 0)`, [real, SEED.branch1, SEED.employee1, svc.id]);
    assert.equal(await outcome(as(db, admin, `select admin_purge_demo_data('remove demo salons', 'DELETE DEMO DATA')`)), "23503");
    assert.equal((await sys(db, `select count(*)::int n from providers where id = any (demo_provider_ids())`))[0].n, 3, "nothing was removed");
    await sys(db, `delete from bookings where customer_id = $1`, [real]);
  });

  it("removes the demo salons and accounts, records the reason and leaves real salons alone", async () => {
    const realOwner = await createUser(db, { role: "provider_owner" });
    await sys(db, `insert into providers (id, owner_id, type, business_name_en, business_name_ar, status, is_verified)
                   values ('c1000000-0000-4000-8000-000000000001', $1, 'salon_barber_shop', 'Real Salon', 'صالون حقيقي', 'active', true)`, [realOwner]);
    await sys(db, `delete from bookings where branch_id in (select id from branches where provider_id = any (demo_provider_ids()))`);
    const result = (await as(db, admin, `select admin_purge_demo_data('Remove the demo salons before launch', 'DELETE DEMO DATA') as r`))[0].r;
    assert.equal(result.providers_removed, 3);
    assert.equal((await sys(db, `select count(*)::int n from providers where id = any (demo_provider_ids())`))[0].n, 0);
    assert.equal((await sys(db, `select count(*)::int n from providers where id = 'c1000000-0000-4000-8000-000000000001'`))[0].n, 1, "a real salon is untouched");
    const audit = await sys(db, `select details from admin_audit_logs where action = 'demo_data.purged'`);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].details.reason, "Remove the demo salons before launch");
  });
});
