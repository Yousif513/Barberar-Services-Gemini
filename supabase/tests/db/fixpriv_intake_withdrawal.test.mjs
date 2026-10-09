import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// FIX-PRIV P-01 (moved from review_privacy_open.repro.mjs): withdrawing health-data consent blanks every answer, past and future.
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
  it("stops staff reading answers of past appointments after withdrawal, keeping a tombstone", async () => {
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
    assert.equal(read[0].r.answers, null);
    assert.equal((await sys(db, `select count(*)::int n from intake_answers where customer_id = $1`, [customer.sub]))[0].n, 0);
    const [tomb] = await sys(db, `select status, submitted_at, consent_id, answers_removed_at, removal_reason from intake_submissions where booking_id = $1`, [b.id]);
    assert.equal(tomb.status, "withdrawn");
    assert.ok(tomb.submitted_at && tomb.consent_id && tomb.answers_removed_at, "the acknowledgement time and the consent it was given under stay");
    assert.equal(tomb.removal_reason, "consent_withdrawn");
    for (const user of [owner, ROLES.user(SEED.owner2), customer]) {
      const rows = await as(db, user, `select submission_id from intake_answers where customer_id = $1`, [customer.sub]);
      assert.equal(rows.length, 0);
    }
  });
  it("refuses answers while the latest health consent is not granted, even if a row survived", async () => {
    const b = await makeBooking(customer2);
    await as(db, customer2, `select record_consent('health_data', 'granted', 'v1.0', 'web_form')`);
    await as(db, customer2, `select submit_booking_intake($1, $2::jsonb)`, [b.id, JSON.stringify({ a: "SECOND-SECRET" })]);
    await sys(db, `alter table consents disable trigger trg_consents_blank_intake`);
    await sys(db, `insert into consents (user_id, purpose, status, document_version, method) values ($1, 'health_data', 'withdrawn', 'v1', 'web_form')`, [customer2.sub]);
    await sys(db, `alter table consents enable trigger trg_consents_blank_intake`);
    const read = await as(db, owner, `select read_booking_intake_answers($1) r`, [b.id]);
    assert.equal(read[0].r.answers, null);
    assert.ok(!JSON.stringify(read[0].r).includes("SECOND-SECRET"));
  });
});
