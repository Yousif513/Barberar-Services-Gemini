import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// Reproductions of defects found by the independent QA pass (qa-claude-release-gate) that are still open.
// Each case asserts the behaviour the console NEEDS, so every case below FAILS today. They are kept out of
// `npm run test:db` (the file name does not end in .test.mjs) so the suite stays green while the defects are
// open. Run them with:   node --test supabase/tests/db/qa_open_defects.repro.mjs
// When a defect is fixed, move its case into a .test.mjs file (see qa_defect_fixes.test.mjs) and delete it here.
//
// Fixed in migration 20261005170000_qa_release_gate_fixes.sql and now proven in qa_defect_fixes.test.mjs:
// direct booking writes, audit coverage and invoice immutability, replayed administrator refunds, staff leave
// reasons, get_booking_address_secure, role changes, reasons on money commands, blank booking reasons, foreign vs
// missing booking answers, and an administrator-originated payout request.

let db;
let customer2;
const owner2 = ROLES.user(SEED.owner2);

before(async () => {
  db = await createMigratedDb();
  customer2 = ROLES.user(await createUser(db, { role: "customer", phone: "+966555000111", verified: true }));
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
});

describe("QA-4 internal provider and staff details are readable by every signed-in account", () => {
  it("a customer and a competing provider's owner cannot read operator notes, commission, registration or staff contact details", async () => {
    await sys(db, `update providers set admin_notes = 'internal: chargeback risk', contact_email = 'owner@p1.example', cr_number = '1010000001' where id = $1`, [SEED.provider1]);
    await sys(db, `update employees set phone = '+966500000123', email = 'staff@p1.example' where id = $1`, [SEED.employee1]);
    const leaked = [];
    for (const [name, user] of [["customer", customer2], ["competing owner", owner2]]) {
      for (const sql of [
        `select admin_notes from providers where id = $1`, `select commission_percentage from providers where id = $1`,
        `select cr_number, contact_email from providers where id = $1`,
      ]) if ((await as(db, user, sql, [SEED.provider1]).catch(() => [])).length) leaked.push(`${name}: ${sql}`);
      if ((await as(db, user, `select phone, email from employees where id = $1`, [SEED.employee1]).catch(() => [])).length) leaked.push(`${name}: employees.phone,email`);
    }
    assert.deepEqual(leaked, []);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Round 4: defects left after the allow-list migration (20261005190000)
// ---------------------------------------------------------------------------------------------------------------
describe("R4-1 the allow-list still logs a customer's name and integration secrets in clear", () => {
  it("an administrator generating a tax invoice does not copy the buyer's name into the audit log", async () => {
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani' where id = $1`, [SEED.customer]);
    await sys(db, `update providers set vat_number = '300000000000003' where id = $1`, [SEED.provider1]);
    const svc = (await sys(db, `select es.service_id id from employee_services es where es.employee_id = $1 limit 1`, [SEED.employee1]))[0];
    const booking = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required, subtotal_price, tax_amount)
      values ($1, $2, $3, $4, now() - interval '5 hours', 30, 'completed', 100, 10, 0, 86.96, 13.04) returning id`, [SEED.customer, SEED.branch1, SEED.employee1, svc.id]))[0].id;
    await as(db, admin, `select generate_zatca_tax_invoice($1)`, [booking]);
    const text = JSON.stringify(await sys(db, `select details from admin_audit_logs where action = 'invoices.insert'`));
    assert.ok(!text.includes("Zainab") && !text.includes("Qahtani"), "invoices.buyer_name is on the full-value list");
  });

  it("an administrator's change of a webhook or base URL does not put a token in the URL into the log", async () => {
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    const key = (await sys(db, `select key from integrations limit 1`))[0].key;
    await as(db, admin, `update integrations set webhook_url = 'https://hooks.example.test/h/abcSECRETtoken123', base_url = 'https://api.example.test/?apikey=zzSECRET999' where key = $1`, [key]);
    const text = JSON.stringify(await sys(db, `select details from admin_audit_logs where action = 'integrations.update'`));
    assert.ok(!text.includes("abcSECRETtoken123") && !text.includes("zzSECRET999"), "integrations is on the full-value list and its URL columns can carry secrets");
  });
});

describe("R4-2 a staff member can still widen leave the owner approved", () => {
  it("a provider employee cannot change the dates of a leave row that is already approved", async () => {
    const employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
    await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
    const id = (await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, current_date + 20, current_date + 20, 'approved by the owner', 'approved') returning id`, [SEED.employee1]))[0].id;
    const rows = await as(db, employee, `update employee_time_off set end_date = current_date + 50 where id = $1 returning id`, [id]).catch(() => []);
    assert.equal(rows.length, 0, "the trigger only looks at the status column, so editing dates of an approved row passes");
  });
});
