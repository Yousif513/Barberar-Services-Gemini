import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// Independent privacy review 2026-10-08. Each test states the DESIRED behaviour and FAILS today (P-01, P-02, P-03, P-14).
// Named .repro.mjs so the suite glob ignores it; run with: node --test supabase/tests/db/review_privacy_open.repro.mjs
let db;
let customer;
let customer2;
let scenario = 0;
const owner = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const force = async (sql, params) => {
  await db.exec(`alter table bookings disable trigger user`);
  try { await db.query(sql, params); } finally { await db.exec(`alter table bookings enable trigger user`); }
};
async function makeBooking(user) {
  scenario += 1;
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 2 + (scenario % 6));
  const [slot] = await as(db, user, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee1, date, svc.duration]);
  const [b] = await as(db, user, `select * from create_booking($1, $2, $3)`, [SEED.employee1, svc.id, slot.slot_start]);
  if (b.status === "pending_payment") await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_${b.id}`, b.deposit_required]);
  return b;
}

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer" }));
});

describe("P-01 withdrawal of health-data consent", () => {
  it("stops staff reading answers of past appointments after withdrawal", async () => {
    const fields = [{ key: "a", type: "long_text", label_en: "A", label_ar: "ا", required: true, max_length: 100 }];
    const tpl = (await as(db, owner, `select save_intake_template($1, null, 'T', 'ت', $2::jsonb) r`, [SEED.provider1, JSON.stringify(fields)]))[0].r;
    const svc = await serviceFor(db, SEED.employee1);
    await as(db, owner, `select set_service_intake_requirement($1, $2, true, false, null, null) r`, [svc.id, tpl.id]);
    await as(db, customer, `select record_consent('health_data', 'granted', 'v1.0', 'web_form')`);
    const b = await makeBooking(customer);
    await as(db, customer, `select submit_booking_intake($1, $2::jsonb)`, [b.id, JSON.stringify({ a: "SECRET-ANSWER" })]);
    await force(`update bookings set scheduled_at = now() - interval '40 days', status = 'completed' where id = $1`, [b.id]);
    await as(db, customer, `select withdraw_health_data_consent()`);
    const read = await as(db, owner, `select read_booking_intake_answers($1) r`, [b.id]);
    assert.ok(!JSON.stringify(read[0].r).includes("SECRET-ANSWER"), "answers are still returned to the provider after the customer withdrew consent");
  });
});

describe("P-14 branch-scoped delegate", () => {
  it("does not return staff contacts of another branch", async () => {
    const sub = await createUser(db, { role: "provider_employee" });
    const scoped = ROLES.user(sub);
    const [br2] = await sys(db, `insert into branches (provider_id, name_en, name_ar, city, address_text_en, address_text_ar, latitude, longitude)
      values ($1, 'B', 'ب', 'Jeddah', 'a', 'ع', 21.5, 39.2) returning id`, [SEED.provider1]);
    await sys(db, `insert into employees (branch_id, name_en, name_ar, phone) values ($1, 'Other', 'ا', '+966599999999')`, [br2.id]);
    await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Me', 'أ')`, [SEED.branch1, sub]);
    await sys(db, `insert into provider_memberships (provider_id, user_id, role, branch_id, permissions, is_active)
      values ($1, $2, 'branch_manager', $3, '{"staff":true}', true)`, [SEED.provider1, sub, SEED.branch1]);
    const rows = await as(db, scoped, `select phone from get_provider_staff_contacts($1) where phone = '+966599999999'`, [SEED.provider1]);
    assert.equal(rows.length, 0, "a delegate scoped to one branch reads the phone of staff in another branch");
  });
});
