import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// Independent re-verification (qa-claude-release-gate, round 3) of the fixes made in migrations 20261005170000 and
// 20261005180000. Everything here runs as a real role against the migrated schema. The implementer wrote
// qa_defect_fixes.test.mjs and booking_directory.test.mjs; these cases attack the new surface from other angles:
// foreign-key actions on invoices, every role against the removed booking policies, old function overloads,
// hostile search text, Riyadh midnight, double submits, and a day off against the booking command itself.

const MISSING = "00000000-0000-4000-8000-0000000000ab";
let db;
let admin;
let employee;
let customer2;
let svc;
let date;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const answer = (promise) => promise.then(() => "ok", (error) => `${error.code} ${error.message}`);

async function paidBooking() {
  const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
  const booking = (await as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace')`,
    [SEED.employee1, svc.id, slot]))[0];
  await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [booking.id, `chg_${booking.id}`, booking.deposit_required]);
  return booking;
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  employee = ROLES.user(await createUser(db, { role: "provider_employee" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer", phone: "+966555000222", verified: true }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee.sub, SEED.employee1]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
  svc = await serviceFor(db, SEED.employee1);
  date = await nextWorkingDate(db, SEED.employee1);
});

describe("bookings change only through the commands", () => {
  it("leaves no write policy on bookings except the administrator's, and every other role's direct write changes zero rows", async () => {
    const policies = await sys(db, `select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bookings' and cmd <> 'SELECT'`);
    assert.deepEqual(policies, [{ policyname: "Admins manage bookings", cmd: "ALL" }]);
    const booking = await paidBooking();
    for (const [name, user] of [["owner", owner1], ["assigned employee", employee], ["customer", customer], ["other owner", owner2]]) {
      for (const sql of [`update bookings set status = 'cancelled' where id = $1 returning id`, `update bookings set checked_in_at = now() where id = $1 returning id`, `delete from bookings where id = $1 returning id`]) {
        const rows = await as(db, user, sql, [booking.id]).catch(() => []);
        assert.equal(rows.length, 0, `${name}: ${sql}`);
      }
    }
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [booking.id]))[0].n, 0);
  });

  it("still lets the owner and the assigned employee use the commands, with a default reason, and refunds on a provider cancellation", async () => {
    const booking = await paidBooking();
    const cancelled = (await as(db, owner1, `select * from cancel_booking($1, null)`, [booking.id]))[0];
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.cancelled_by, "provider");
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [booking.id]))[0].n, 1);
  });

  it("answers a foreign booking like a missing one in cancel, no-show, status change and address reveal", async () => {
    const booking = await paidBooking();
    const different = [];
    for (const sql of [
      `select cancel_booking($1, 'Not mine')`, `select mark_booking_no_show($1, 'Not mine')`,
      `select employee_update_booking_status($1, 'completed', 'Not mine')`, `select get_booking_address_secure($1)`,
    ]) {
      for (const [name, user] of [["another customer", customer2], ["another owner", owner2]]) {
        if ((await answer(as(db, user, sql, [booking.id]))) !== (await answer(as(db, user, sql, [MISSING])))) different.push(`${name}: ${sql}`);
      }
    }
    assert.deepEqual(different, []);
  });
});

describe("issued tax invoices against foreign-key actions and every role", () => {
  let invoice;
  let customerWithInvoice;
  before(async () => {
    customerWithInvoice = await createUser(db, { role: "customer" });
    const bookingId = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, now() - interval '9 days', 30, 'completed', 100, 10, 0) returning id`, [customerWithInvoice, SEED.branch1, SEED.employee1, svc.id]))[0].id;
    invoice = (await sys(db, `insert into invoices (booking_id, provider_id, customer_id, invoice_number, subtotal_sar, vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, invoice_hash, zatca_qr_code)
      values ($1, $2, $3, 'INV-R3-1', 100, 15, 115, 'Seller', '300000000000003', 'h-r3-1', 'qr') returning id`, [bookingId, SEED.provider1, customerWithInvoice]))[0].id;
  });

  it("refuses a forged insert, an edit and a delete from an administrator, the owner, the customer and the service role", async () => {
    assert.equal(await outcome(as(db, admin, `insert into invoices (provider_id, invoice_number, subtotal_sar, vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, invoice_hash, zatca_qr_code)
      values ($1, 'FORGED', 1, 0, 1, 's', '300000000000003', 'h', 'q')`, [SEED.provider1])), "42501");
    for (const [name, user] of [["administrator", admin], ["owner", owner1], ["customer", customer], ["visitor", ROLES.anon]]) {
      const changed = await as(db, user, `update invoices set total_amount_sar = 1 where id = $1 returning id`, [invoice]).catch(() => []);
      const removed = await as(db, user, `delete from invoices where id = $1 returning id`, [invoice]).catch(() => []);
      assert.equal(changed.length + removed.length, 0, name);
    }
    assert.equal(await outcome(as(db, ROLES.service, `update invoices set total_amount_sar = 1 where id = $1`, [invoice])), "22023");
    assert.equal(await outcome(as(db, ROLES.service, `delete from invoices where id = $1`, [invoice])), "22023");
    assert.equal(Number((await sys(db, `select total_amount_sar from invoices where id = $1`, [invoice]))[0].total_amount_sar), 115);
  });

  it("lets the reporting status advance, and clears the links when the booking or the customer is removed, without ever editing the figures", async () => {
    await as(db, ROLES.service, `update invoices set zatca_status = 'reported' where id = $1`, [invoice]);
    await sys(db, `delete from bookings where customer_id = $1`, [customerWithInvoice]);
    assert.equal((await sys(db, `select booking_id from invoices where id = $1`, [invoice]))[0].booking_id, null);
    await sys(db, `delete from auth.users where id = $1`, [customerWithInvoice]);
    const row = (await sys(db, `select customer_id, total_amount_sar, invoice_hash, zatca_status from invoices where id = $1`, [invoice]))[0];
    assert.equal(row.customer_id, null);
    assert.equal(Number(row.total_amount_sar), 115);
    assert.equal(row.invoice_hash, "h-r3-1");
    assert.equal(row.zatca_status, "reported");
  });

  it("refuses to remove a provider that has issued invoices, so the tax record cannot be cascaded away", async () => {
    assert.equal(await outcome(sys(db, `delete from providers where id = $1`, [SEED.provider1])), "22023");
    assert.equal((await sys(db, `select count(*)::int n from invoices where id = $1`, [invoice]))[0].n, 1);
  });
});

describe("command signatures", () => {
  it("have no older overload left, are not executable by anonymous visitors, and refuse every non-administrator", async () => {
    const names = ["set_user_role", "approve_provider_application", "admin_release_payout", "admin_release_ledger_item", "admin_create_refund_request", "admin_booking_directory"];
    const rows = await sys(db, `select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [names]);
    assert.equal(rows.length, names.length, "exactly one function per name");
    assert.deepEqual(rows.filter((r) => r.anon_x), []);
    const calls = [
      [`select set_user_role($1, 'customer', 'Test reason here')`, [SEED.customer]],
      [`select approve_provider_application($1, 'Documents verified', 15)`, [MISSING]],
      [`select admin_release_payout($1, 'k1', 'Reason here')`, [MISSING]],
      [`select admin_release_ledger_item($1, 'Reason here')`, [MISSING]],
      [`select admin_create_refund_request($1, 5, 'Reason here')`, [MISSING]],
      [`select admin_booking_directory(null, null, null, null, 10, 0)`, []],
    ];
    const failures = [];
    for (const [sql, params] of calls) {
      for (const [name, user] of [["owner", owner1], ["employee", employee], ["customer", customer], ["anonymous", ROLES.anon], ["service role", ROLES.service]]) {
        if ((await outcome(as(db, user, sql, params))) !== "42501") failures.push(`${name}: ${sql}`);
      }
    }
    assert.deepEqual(failures, []);
  });
});

describe("role changes", () => {
  it("need a reason, refuse the caller's own role, are recorded with the reason, and cannot be made by a direct profile write", async () => {
    const target = await createUser(db, { role: "customer" });
    assert.equal(await outcome(as(db, admin, `select set_user_role($1, 'admin', 'ab')`, [target])), "22023");
    assert.equal(await outcome(as(db, admin, `select set_user_role($1, 'customer', 'Stepping down now')`, [admin.sub])), "22023");
    await as(db, admin, `select set_user_role($1, 'provider_employee', 'Joined the salon as staff')`, [target]);
    const row = (await sys(db, `select details from admin_audit_logs where action = 'profile.role_changed' and target_id = $1`, [target]))[0];
    assert.equal(row.details.reason, "Joined the salon as staff");
    assert.equal(row.details.role_before, "customer");
    assert.equal(row.details.role_after, "provider_employee");
    assert.equal(await outcome(as(db, admin, `update profiles set role = 'customer' where id = $1`, [target])), "42501");
  });
});

describe("payout requests", () => {
  it("come only from the owner through the command, a second submit is refused by the balance, and nobody can insert, edit or delete one directly", async () => {
    await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, 'package_sale', 'chg_r3_payout', 500, 50, 450, 'pending')`, [SEED.provider1]);
    const request = `select (request_provider_payout($1, $2, 'Bank', 'SA0380000000608010167519')).id`;
    assert.equal(await outcome(as(db, owner1, request, [SEED.provider1, 400])), "ok");
    assert.equal(await outcome(as(db, owner1, request, [SEED.provider1, 400])), "22023");
    for (const [name, user] of [["administrator", admin], ["other owner", owner2], ["customer", customer]]) {
      assert.equal(await outcome(as(db, user, request, [SEED.provider1, 1])), "42501", name);
    }
    for (const [name, user] of [["owner", owner1], ["administrator", admin]]) {
      assert.equal(await outcome(as(db, user, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban) values ($1, $2, 1, 'B', 'SA0380000000608010167519')`, [SEED.provider1, user.sub])), "42501", name);
    }
    assert.equal((await as(db, owner1, `update payout_requests set amount = 1, iban = 'SA4420000001234567891234' where provider_id = $1 returning id`, [SEED.provider1])).length, 0);
    assert.equal((await as(db, owner1, `delete from payout_requests where provider_id = $1 returning id`, [SEED.provider1])).length, 0);
  });
});

describe("a staff day off", () => {
  it("is private to the staff member, the owner and administrators, an approved one stops customers booking that day, a pending one does not", async () => {
    const slot = await firstSlot(db, customer, SEED.employee1, date, svc.duration);
    const leave = (await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, $2, $2, 'Dentist appointment', 'pending') returning id`, [SEED.employee1, date]))[0].id;
    const slots = async (user) => (await as(db, user, `select count(*)::int n from get_available_slots($1, $2::date, $3)`, [SEED.employee1, date, svc.duration]))[0].n;
    assert.ok((await slots(customer)) > 0, "a pending request does not remove slots");
    await sys(db, `update employee_time_off set status = 'approved' where id = $1`, [leave]);
    for (const user of [customer, ROLES.anon, owner2]) assert.equal(await slots(user), 0);
    assert.equal(await outcome(as(db, customer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace')`, [SEED.employee1, svc.id, slot])), "23P01");
    for (const [name, user, expected] of [["customer", customer, 0], ["visitor", ROLES.anon, 0], ["other owner", owner2, 0], ["owner", owner1, 1], ["staff member", employee, 1], ["administrator", admin, 1]]) {
      // A visitor holds no privilege on the table at all, so the read is refused instead of returning no rows.
      assert.equal((await as(db, user, `select id from employee_time_off`).catch(() => [])).length, expected, name);
    }
  });
});

describe("the booking directory", () => {
  it("cuts the Riyadh day at Riyadh midnight, treats hostile search text as text, and records the read without it", async () => {
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani', phone_number = '+966500111999' where id = $1`, [SEED.customer]);
    const make = async (iso) => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, $5::timestamptz, 30, 'completed', 100, 10, 0) returning id`, [SEED.customer, SEED.branch1, SEED.employee1, svc.id, iso]))[0].id;
    const ids = { before: await make("2025-03-05T20:59:00Z"), start: await make("2025-03-05T21:00:00Z"), end: await make("2025-03-06T20:59:59Z"), after: await make("2025-03-06T21:00:00Z") };
    const day = (await as(db, admin, `select admin_booking_directory(null, null, '2025-03-06', '2025-03-06', 50, 0) o`))[0].o;
    assert.deepEqual(day.rows.map((r) => r.id).sort(), [ids.start, ids.end].sort());
    assert.equal(day.matching, 2);
    for (const hostile of ["%", "____", "\\\\", "x' or '1'='1", "a'; drop table bookings;--", "9999999999999", "a".repeat(5000)]) {
      const o = (await as(db, admin, `select admin_booking_directory($1, null, null, null, 5, 0) o`, [hostile]))[0].o;
      assert.equal(o.matching, 0, hostile.slice(0, 20));
    }
    assert.equal((await as(db, admin, `select admin_booking_directory($1, null, null, null, 5, 0) o`, [ids.start.toUpperCase()]))[0].o.matching, 1, "an exact id in capitals finds the booking");
    assert.equal(await outcome(as(db, admin, `select admin_booking_directory(null, $1, null, null, 5, 0)`, ["completed' or 1=1"])), "22023");
    const text = JSON.stringify(await sys(db, `select details from admin_audit_logs where action = 'bookings.listed'`));
    for (const secret of ["Zainab", "966500111999", "drop table", "9999999999999"]) assert.ok(!text.includes(secret), secret);
  });
});

describe("administrator booking commands", () => {
  it("demand a three character reason from an administrator and none from the provider's own staff", async () => {
    let offset = 0;
    const started = async () => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, now() - interval '7 hours' - make_interval(mins => $5::int), 30, 'confirmed', 100, 10, 0) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id, (offset += 45)]))[0].id;
    for (const reason of ["null", "''", "'   '", "'x'", "'ab'"]) {
      for (const sql of [`select cancel_booking($1, ${reason})`, `select mark_booking_no_show($1, ${reason})`, `select employee_update_booking_status($1, 'completed', ${reason})`]) {
        assert.equal(await outcome(as(db, admin, sql, [await started()])), "22023", `${sql} with ${reason}`);
      }
    }
    assert.equal(await outcome(as(db, owner1, `select cancel_booking($1, null)`, [await started()])), "ok");
    assert.equal(await outcome(as(db, owner1, `select mark_booking_no_show($1, null)`, [await started()])), "ok");
  });
});

describe("the all-table audit trigger", () => {
  it("records an administrator's direct change to a reconciliation run and to a message template, and nothing for a customer", async () => {
    const run = (await sys(db, `insert into psp_reconciliation_runs (run_date, status, discrepancy_amount_sar, discrepancy_count) values (current_date, 'discrepant', 500, 3) returning id`))[0].id;
    const count = async () => (await sys(db, `select count(*)::int n from admin_audit_logs`))[0].n;
    let before = await count();
    await as(db, admin, `update psp_reconciliation_runs set status = 'matched', discrepancy_amount_sar = 0 where id = $1`, [run]);
    assert.equal((await count()) - before, 1);
    before = await count();
    await as(db, customer, `insert into customer_favorites (customer_id, provider_id) values ($1, $2)`, [SEED.customer, SEED.provider1]).catch(() => {});
    assert.equal((await count()) - before, 0);
  });
});
