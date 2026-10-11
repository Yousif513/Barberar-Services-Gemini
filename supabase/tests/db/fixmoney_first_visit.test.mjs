// FIX-MONEY: M-08 (a zero-value counter walk-in must not consume the first-visit commission rule) and M-14 (walk-ins are not sponsored acquisitions).
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";
import { setPlatformSetting } from "./gov1_fixtures.mjs";

const owner1 = ROLES.user(SEED.owner1);
let db;

before(async () => {
  db = await createMigratedDb();
});

const freshCustomer = async (opts) => ROLES.user(await createUser(db, opts));
const lastSlot = async (user, employee, svc, date) =>
  (await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 desc limit 1`, [employee, date, svc.duration]))[0].slot_start;
const firstSlotOf = async (user, employee, svc, date) =>
  (await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [employee, date, svc.duration]))[0].slot_start;
const book = async (user, employee, svc, slot) =>
  (await as(db, user, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3)`, [employee, svc.id, slot]))[0];

describe("M-08: a counter walk-in is not a first visit", () => {
  it("a zero-price walk-in linked to a customer's verified phone does not remove the first-visit commission", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 3);
    const phone = "+966500000123";
    const target = await freshCustomer({ phone, verified: true });
    const control = await freshCustomer();
    const controlBooking = await book(control, SEED.employee1, svc, await firstSlotOf(control, SEED.employee1, svc, date));
    await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'x', $4, 'cash', 0) r`, [SEED.branch1, SEED.employee1, svc.id, phone]);
    const targetBooking = await book(target, SEED.employee1, svc, await lastSlot(target, SEED.employee1, svc, date));
    assert.equal(targetBooking.is_first_visit, true);
    assert.equal(Number(targetBooking.platform_commission), Number(controlBooking.platform_commission));
    assert.ok(Number(targetBooking.platform_commission) > 0);
  });

  it("a PAID walk-in does not use up the rule either (the counter visit is not the marketplace's acquisition)", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 5);
    const phone = "+966500000124";
    const target = await freshCustomer({ phone, verified: true });
    await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'x', $4, 'cash', 80, now() + interval '2 hours') r`, [SEED.branch1, SEED.employee1, svc.id, phone]);
    const b = await book(target, SEED.employee1, svc, await lastSlot(target, SEED.employee1, svc, date));
    assert.equal(b.is_first_visit, true);
  });

  it("a real earlier marketplace visit still makes the next one a repeat visit (no regression)", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const date = await nextWorkingDate(db, SEED.employee1, 7);
    const customer = await freshCustomer();
    const first = await book(customer, SEED.employee1, svc, await firstSlotOf(customer, SEED.employee1, svc, date));
    assert.equal(first.is_first_visit, true);
    await sys(db, `update bookings set status = 'confirmed' where id = $1`, [first.id]);
    const second = await book(customer, SEED.employee1, svc, await lastSlot(customer, SEED.employee1, svc, date));
    assert.equal(second.is_first_visit, false);
    assert.equal(Number(second.platform_commission), 0);
  });
});

describe("M-14: walk-ins are not sponsored acquisitions", () => {
  it("a walk-in linked to a customer who clicked a sponsored placement accrues nothing, and the real booking is the new client", async () => {
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    const set = (key, value) => setPlatformSetting(db, admin, key, value, "fixmoney sponsored setup");
    await set("sponsored.price_per_new_client_sar", 25.5);
    await set("sponsored.max_slots_per_search", 3);
    await set("sponsored.attribution_window_days", 14);
    await set("sponsored.enabled", true);
    const { campaign_id } = (await as(db, owner1, `select create_sponsored_campaign($1, null, null, null, 100, null, null, 'launch the campaign') r`, [SEED.provider1]))[0].r;
    await as(db, owner1, `select set_sponsored_campaign_status($1, 'active', 'go live') r`, [campaign_id]);
    const customer = await freshCustomer({ phone: "+966500000321", verified: true });
    await as(db, customer, `select record_sponsored_click($1) r`, [campaign_id]);

    const svc = await serviceFor(db, SEED.employee1);
    const walkIn = (await as(db, owner1, `select create_walk_in_booking($1, $2, $3, 'x', '+966500000321', 'cash', 60, now() + interval '4 hours') r`, [SEED.branch1, SEED.employee1, svc.id]))[0].r;
    await sys(db, `update bookings set status = 'completed' where id = $1`, [walkIn.booking_id]);
    assert.equal((await sys(db, `select count(*)::int n from sponsored_attributions where booking_id = $1`, [walkIn.booking_id]))[0].n, 0, "a counter walk-in is not billed as a sponsored acquisition");

    const date = await nextWorkingDate(db, SEED.employee1, 4);
    const real = await book(customer, SEED.employee1, svc, await firstSlotOf(customer, SEED.employee1, svc, date));
    await sys(db, `update bookings set status = 'completed' where id = $1`, [real.id]);
    const a = (await sys(db, `select is_new_client, status, fee_amount_sar::float8 f from sponsored_attributions where booking_id = $1`, [real.id]))[0];
    assert.equal(a.is_new_client, true);
    assert.equal(a.status, "accrued");
    assert.equal(a.f, 25.5);
  });
});
