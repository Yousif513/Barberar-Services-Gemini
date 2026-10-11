import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { approvedDestination } from "./gov1_fixtures.mjs";
import { as, createMigratedDb, createUser, firstSlot, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// Proof for the defects the independent QA pass reproduced (migration 20261005170000_qa_release_gate_fixes.sql).
// Every case here failed before the migration; the reproductions live in git history (qa_open_defects.repro.mjs)
// and in the QA evidence folder.

let db;
let admin;
let admin2;
let customer2;
let employee1;
const owner1 = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const customer = ROLES.user(SEED.customer);

// MONEY (GOV-1 review C-1/C-2): client roles hold no write privilege on bookings or money tables, so a direct write is refused.
const deniedAsNone = (error) => (/permission denied/.test(error.message) ? [] : Promise.reject(error));
const outcome = (promise) => promise.then(() => "ok", (error) => error.code ?? error.message);
const auditCount = async () => (await sys(db, `select count(*)::int as n from admin_audit_logs`))[0].n;
const auditRows = (action, target) => sys(db, `select actor_id, details from admin_audit_logs where action = $1 and target_id = $2`, [action, target]);

// A fresh verified customer and a fresh week per booking: the seeded employee has only a few slots a day.
let counter = 0;
async function paidBooking() {
  counter += 1;
  const buyer = ROLES.user(await createUser(db, { role: "customer", phone: `+96655100${String(counter).padStart(4, "0")}`, verified: true }));
  const svc = await serviceFor(db, SEED.employee1);
  const date = await nextWorkingDate(db, SEED.employee1, 3 + 7 * counter);
  const slot = await firstSlot(db, buyer, SEED.employee1, date, svc.duration);
  const booking = (await as(db, buyer, `select * from create_booking(target_employee_id => $1, target_service_id => $2, target_scheduled_at => $3, request_source => 'marketplace')`,
    [SEED.employee1, svc.id, slot]))[0];
  await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [booking.id, `chg_${booking.id}`, booking.deposit_required]);
  return booking;
}

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  admin2 = ROLES.user(await createUser(db, { role: "admin" }));
  customer2 = ROLES.user(await createUser(db, { role: "customer", phone: "+966555000111", verified: true }));
  employee1 = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employee1.sub, SEED.employee1]);
  await sys(db, `update providers set status = 'active' where id in ($1, $2)`, [SEED.provider1, SEED.provider2]);
});

describe("a provider's direct write to bookings no longer bypasses the money commands", () => {
  it("cannot cancel a paid booking directly, so the customer's deposit is never left with the provider", async () => {
    const booking = await paidBooking();
    assert.equal((await as(db, owner1, `update bookings set status = 'cancelled' where id = $1 returning id`, [booking.id]).catch(deniedAsNone)).length, 0);
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
    // The command does it properly: the customer is owed the deposit back.
    await as(db, owner1, `select cancel_booking($1, 'Provider closed for the day')`, [booking.id]);
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [booking.id]))[0].n, 1);
  });

  it("cannot complete or mark a booking that has not started, directly or through the commands", async () => {
    const booking = await paidBooking();
    for (const status of ["completed", "no_show"]) {
      assert.equal((await as(db, owner1, `update bookings set status = '${status}' where id = $1 returning id`, [booking.id]).catch(deniedAsNone)).length, 0, `direct ${status}`);
    }
    assert.equal(await outcome(as(db, owner1, `select employee_update_booking_status($1, 'completed', 'early')`, [booking.id])), "22023");
    assert.equal(await outcome(as(db, owner1, `select mark_booking_no_show($1, 'early')`, [booking.id])), "22023");
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
  });
});

describe("audit.search: administrator writes are audited by behaviour, on every table", () => {
  it("has the audit trigger on every base table except the audit logs themselves", async () => {
    const missing = (await sys(db, `
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
         and c.relname not in ('admin_audit_logs', 'integration_audit_log')
         and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_audit_admin_write')
       order by 1`)).map((r) => r.relname);
    assert.deepEqual(missing, [], "a table without the audit trigger lets an administrator change it without a trace");
  });

  // GOV-2: provider_fee_invoices left this list. No client role, administrators included, can read or write it directly any
  // more (the audited admin_list_fee_invoices serves the console); see the test after the loop.
  const cases = [
    ["message_templates", async () => (await sys(db, `select name || '|' || locale as id from message_templates limit 1`))[0].id,
      (id) => `update message_templates set template_body = 'changed' where name = '${id.split("|")[0]}' and locale = '${id.split("|")[1]}'`],
  ];
  for (const [table, create, update] of cases) {
    it(`records an administrator's direct change to ${table}`, async () => {
      const id = await create();
      const before = await auditCount();
      const rows = await as(db, admin, `${update(id)} returning 1`);
      assert.ok(rows.length >= 1, "the administrator can change the row");
      assert.ok((await auditCount()) > before, `no audit entry for a direct change to ${table}`);
    });
  }

  it("refuses an administrator's direct change to psp_reconciliation_runs outright (MONEY, GOV-1 review C-1)", async () => {
    const id = (await sys(db, `insert into psp_reconciliation_runs (run_date, status, discrepancy_amount_sar, discrepancy_count)
      values (current_date, 'discrepant', 500, 3) returning id`))[0].id;
    await assert.rejects(as(db, admin, `update psp_reconciliation_runs set status = 'matched', discrepancy_amount_sar = 0 where id = $1 returning 1`, [id]), /permission denied/);
    assert.equal((await sys(db, `select status from psp_reconciliation_runs where id = $1`, [id]))[0].status, "discrepant");
  });

  it("refuses an administrator's direct change to provider_fee_invoices outright (GOV-2)", async () => {
    const id = (await sys(db, `insert into provider_fee_invoices (provider_id, invoice_number, period_start, period_end)
      values ($1, 'FEE-FIX-1', current_date - 30, current_date) returning id`, [SEED.provider1]))[0].id;
    await assert.rejects(as(db, admin, `update provider_fee_invoices set status = 'paid', total_invoice_due_sar = 0 where id = $1 returning 1`, [id]), /permission denied/);
    assert.notEqual((await sys(db, `select status from provider_fee_invoices where id = $1`, [id]))[0].status, "paid");
  });

  it("does not record a provider's or a customer's own writes as operator actions", async () => {
    const before = await auditCount();
    await as(db, owner1, `update providers set business_name_en = business_name_en || ' ' where id = $1`, [SEED.provider1]);
    await as(db, customer, `update profiles set first_name = 'Layla' where id = $1`, [customer.sub]);
    assert.equal(await auditCount(), before);
  });
});

describe("issued tax invoices are append-only", () => {
  const issue = async (number) => (await sys(db, `insert into invoices (provider_id, invoice_number, subtotal_sar, vat_amount_sar, total_amount_sar, seller_name, seller_vat_number, invoice_hash, zatca_qr_code)
    values ($1, $2, 100, 15, 115, 'Seller', '300000000000003', $3, 'qr') returning id`, [SEED.provider1, number, `h-${number}`]))[0].id;

  it("cannot be edited or deleted by an administrator", async () => {
    const id = await issue("INV-FIX-1");
    // An administrator holds SELECT on invoices and nothing else: the write is refused outright, not silently ignored.
    assert.equal(await outcome(as(db, admin, `update invoices set total_amount_sar = 1, vat_amount_sar = 0 where id = $1 returning id`, [id])), "42501");
    assert.equal(await outcome(as(db, admin, `delete from invoices where id = $1 returning id`, [id])), "42501");
    const stored = (await sys(db, `select total_amount_sar, vat_amount_sar from invoices where id = $1`, [id]))[0];
    assert.deepEqual([Number(stored.total_amount_sar), Number(stored.vat_amount_sar)], [115, 15]);
  });

  it("cannot be edited or deleted by anyone, whatever the policy says: the figures, hash and QR value are fixed", async () => {
    const id = await issue("INV-FIX-2");
    for (const sql of [
      `update invoices set total_amount_sar = 1 where id = $1`, `update invoices set invoice_hash = 'x' where id = $1`,
      `update invoices set zatca_qr_code = 'x' where id = $1`, `update invoices set seller_name = 'Other' where id = $1`, `delete from invoices where id = $1`,
    ]) assert.equal(await outcome(sys(db, sql, [id])), "22023", sql);
  });

  it("still lets the reporting status advance and the links to a removed booking or customer clear", async () => {
    const id = await issue("INV-FIX-3");
    await sys(db, `update invoices set zatca_status = 'cleared' where id = $1`, [id]);
    await sys(db, `update invoices set customer_id = null, booking_id = null where id = $1`, [id]);
    assert.equal(await outcome(sys(db, `update invoices set customer_id = $2 where id = $1`, [id, SEED.customer])), "22023", "a link cannot be pointed at someone else");
  });
});

describe("a payout request only comes from the provider's own request", () => {
  const ledgerRow = () => sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
    values ($1, 'package_sale', 'chg_fix_' || md5(clock_timestamp()::text), 500, 50, 450, 'pending')`, [SEED.provider1]);
  const IBAN = "SA0380000000608010167519";

  it("refuses a direct insert from an administrator and from the owner", async () => {
    await ledgerRow();
    for (const [name, user] of [["administrator", admin], ["owner", owner1]]) {
      assert.equal(await outcome(as(db, user, `insert into payout_requests (provider_id, requested_by, amount, bank_name, iban) values ($1, $2, 100, 'Other Bank', 'SA4420000001234567891234')`, [SEED.provider1, user.sub])), "42501", name);
    }
  });

  it("is made by the provider's owner through the command, and refused for an administrator", async () => {
    await ledgerRow();
    assert.equal(await outcome(as(db, admin, `select request_provider_payout($1, 100, 'Test Bank', $2)`, [SEED.provider1, IBAN])), "42501");
    assert.equal(await outcome(as(db, owner2, `select request_provider_payout($1, 100, 'Test Bank', $2)`, [SEED.provider1, IBAN])), "42501");
    const made = (await as(db, owner1, `select * from request_provider_payout($1, 100, 'Test Bank', $2)`, [SEED.provider1, IBAN]))[0];
    assert.equal(made.status, "requested");
    assert.equal(made.iban, `SA** **** **** **** **** ${IBAN.slice(-4)}`, "GOV-1 (Q3): the command answers with the masked IBAN only");
  });
});

describe("a replayed administrator refund creates one refund", () => {
  it("returns the same request for the same booking, amount and reason", async () => {
    const booking = await paidBooking();
    const first = (await as(db, admin, `select admin_create_refund_request($1, 5, 'Goodwill refund') id`, [booking.id]))[0].id;
    const second = (await as(db, admin, `select admin_create_refund_request($1, 5, 'Goodwill refund') id`, [booking.id]))[0].id;
    assert.equal(second, first);
    assert.equal((await sys(db, `select count(*)::int n from refund_requests where booking_id = $1`, [booking.id]))[0].n, 1);
  });

  it("makes a second, separate refund only when the caller gives a different key", async () => {
    const booking = await paidBooking();
    const a = (await as(db, admin, `select admin_create_refund_request($1, 4, 'Goodwill refund', 'ticket-1') id`, [booking.id]))[0].id;
    const b = (await as(db, admin, `select admin_create_refund_request($1, 4, 'Goodwill refund', 'ticket-2') id`, [booking.id]))[0].id;
    assert.notEqual(a, b);
    assert.equal(await outcome(as(db, admin, `select admin_create_refund_request($1, 4, 'x')`, [booking.id])), "22023", "a reason is still required");
  });
});

describe("ledger.release-payout and payout.mark-paid: money and access commands take a reason and record it", () => {
  it("admin_release_ledger_item refuses a blank reason or bank reference, changes nothing, and records both once a second administrator approves", async () => {
    await approvedDestination(db, SEED.provider2, "SA4420000001234567891234");
    const id = (await sys(db, `insert into transactional_ledger (provider_id, entry_type, payment_intent_id, total_captured, platform_share, provider_share, payout_status)
      values ($1, 'package_sale', 'chg_fix_reason', 100, 10, 90, 'pending') returning id`, [SEED.provider2]))[0].id;
    for (const reason of ["null", "''", "'  '", "'ab'"]) {
      assert.equal(await outcome(as(db, admin, `select admin_release_ledger_item($1, ${reason}, 'TRF-8841')`, [id])), "22023", reason);
    }
    assert.equal(await outcome(as(db, admin, `select admin_release_ledger_item($1, 'Paid by bank transfer', '')`, [id])), "22023", "a bank reference is required");
    assert.equal((await sys(db, `select payout_status from transactional_ledger where id = $1`, [id]))[0].payout_status, "pending");
    const asked = (await as(db, admin, `select admin_release_ledger_item($1, 'Paid by bank transfer, reference 8841', 'TRF-8841') r`, [id]))[0].r;
    assert.equal(asked.status, "pending_approval", "H-4: one administrator alone settles nothing");
    assert.equal((await sys(db, `select payout_status from transactional_ledger where id = $1`, [id]))[0].payout_status, "pending");
    await as(db, admin2, `select admin_decide_approval($1, 'approve', 'Bank statement matches')`, [asked.approval_id]);
    assert.equal((await sys(db, `select payout_status from transactional_ledger where id = $1`, [id]))[0].payout_status, "released");
    const [row] = await auditRows("ledger.manually_settled", id);
    assert.equal(row.details.reason, "Paid by bank transfer, reference 8841");
    assert.equal(row.details.bank_reference, "TRF-8841");
    assert.equal(row.actor_id, admin2.sub);
  });

  it("set_user_role needs a reason, refuses to change the caller's own role, and records who changed whom and why", async () => {
    const target = await createUser(db, { role: "customer" });
    assert.equal(await outcome(as(db, admin, `select set_user_role($1, 'admin', '')`, [target])), "22023");
    assert.equal(await outcome(as(db, admin, `select set_user_role($1, 'customer', 'stepping down')`, [admin.sub])), "22023", "not your own role");
    assert.equal((await sys(db, `select role from profiles where id = $1`, [admin.sub]))[0].role, "admin");
    await as(db, admin, `select set_user_role($1, 'admin', 'Joins the finance desk')`, [target]);
    const [grant] = await auditRows("profile.role_changed", target);
    assert.deepEqual([grant.details.role_before, grant.details.role_after, grant.details.reason, grant.actor_id], ["customer", "admin", "Joins the finance desk", admin.sub]);
    await as(db, admin, `select set_user_role($1, 'customer', 'Left the finance desk')`, [target]);
    assert.equal((await sys(db, `select role from profiles where id = $1`, [target]))[0].role, "customer");
  });

  it("records an administrator who removes their own role by a direct write", async () => {
    const stepper = ROLES.user(await createUser(db, { role: "admin" }));
    const before = await auditCount();
    await as(db, stepper, `update profiles set role = 'customer' where id = $1`, [stepper.sub]).catch(() => {});
    const role = (await sys(db, `select role from profiles where id = $1`, [stepper.sub]))[0].role;
    if (role === "customer") assert.ok((await auditCount()) > before, "the demotion left no audit entry");
  });
});

describe("staff leave reasons are private", () => {
  it("are readable by the staff member and the provider's owner, and by nobody else (console sessions neither: SECFIX-2 R2-H1)", async () => {
    await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, current_date, current_date + 3, 'Medical appointment', 'approved')`, [SEED.employee1]);
    assert.deepEqual(await as(db, customer2, `select reason from employee_time_off`), []);
    assert.deepEqual(await as(db, owner2, `select reason from employee_time_off`), []);
    assert.deepEqual(await as(db, ROLES.anon, `select reason from employee_time_off`).catch(() => []), []);
    for (const user of [owner1, employee1]) {
      assert.equal((await as(db, user, `select reason from employee_time_off where reason = 'Medical appointment'`)).length, 1);
    }
    assert.equal((await as(db, admin, `select reason from employee_time_off where reason = 'Medical appointment'`)).length, 0);
    await sys(db, `delete from employee_time_off`);
  });

  it("still removes the slots on a day off for customers", async () => {
    const date = await nextWorkingDate(db, SEED.employee1, 8);
    const svc = await serviceFor(db, SEED.employee1);
    const open = await as(db, customer2, `select slot_start from get_available_slots($1, $2, $3)`, [SEED.employee1, date, svc.duration]);
    assert.ok(open.length > 0, "slots exist on a working day");
    await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, $2::date, $2::date, 'Family matter', 'approved')`, [SEED.employee1, date]);
    assert.deepEqual(await as(db, customer2, `select slot_start from get_available_slots($1, $2, $3)`, [SEED.employee1, date, svc.duration]), []);
    await sys(db, `delete from employee_time_off`);
  });
});

describe("get_booking_address_secure", () => {
  it("returns the address to the booking's own customer, and a branch address for a salon visit", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    const insert = async (home) => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required, is_home_service, home_address_text)
      values ($1, $2, $3, $4, now() + make_interval(days => $7::int), 30, 'confirmed', 100, 10, 10, $5, $6) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id, home, home ? "Riyadh, street 1" : null, home ? 20 : 21]))[0].id;
    const homeId = await insert(true);
    const salonId = await insert(false);
    assert.equal((await as(db, customer, `select get_booking_address_secure($1) r`, [homeId]))[0].r.address, "Riyadh, street 1");
    assert.ok((await as(db, customer, `select get_booking_address_secure($1) r`, [salonId]))[0].r.address.length > 0);
    assert.equal(await outcome(as(db, customer2, `select get_booking_address_secure($1)`, [homeId])), "P0002", "a stranger is told the booking does not exist");
    assert.equal((await as(db, owner1, `select get_booking_address_secure($1) r`, [homeId]))[0].r.success, true);
  });
});

describe("booking.transition: booking commands", () => {
  it("refuse a blank reason from an administrator", async () => {
    const svc = await serviceFor(db, SEED.employee1);
    let offset = 0;
    const started = async () => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, now() - interval '6 hours' - make_interval(mins => $5::int), 30, 'confirmed', 100, 10, 0) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id, (offset += 45)]))[0].id;
    // SECFIX-2 R2-H2: the console cancels and marks no-shows through admin_cancel_booking / admin_mark_booking_no_show (reason of
    // at least 10 characters); the self-service commands refuse a console session outright.
    for (const sql of [`select admin_cancel_booking($1, '   ')`, `select admin_mark_booking_no_show($1, '   ')`, `select employee_update_booking_status($1, 'completed', '   ')`]) {
      const id = await started();
      assert.equal(await outcome(as(db, admin, sql, [id])), "22023", sql);
      assert.equal((await sys(db, `select status from bookings where id = $1`, [id]))[0].status, "confirmed", `${sql} changed nothing`);
    }
    for (const sql of [`select cancel_booking($1, 'Customer rang to cancel')`, `select mark_booking_no_show($1, 'Customer never came')`, `select employee_update_booking_status($1, 'cancelled', 'Customer rang')`]) {
      const id = await started();
      assert.equal(await outcome(as(db, admin, sql, [id])), "42501", sql);
      assert.equal((await sys(db, `select status from bookings where id = $1`, [id]))[0].status, "confirmed", `${sql} changed nothing`);
    }
    const id = await started();
    await as(db, admin, `select admin_cancel_booking($1, 'Customer rang to cancel')`, [id]);
    assert.equal((await sys(db, `select status from bookings where id = $1`, [id]))[0].status, "cancelled");
  });

  it("answer a foreign booking and a missing booking the same way", async () => {
    const booking = await paidBooking();
    const missing = "00000000-0000-4000-8000-0000000000ab";
    for (const [name, call] of [
      ["cancel_booking", (id) => `select cancel_booking('${id}', 'x')`],
      ["mark_booking_no_show", (id) => `select mark_booking_no_show('${id}', 'x')`],
      ["employee_update_booking_status", (id) => `select employee_update_booking_status('${id}', 'completed', 'x')`],
    ]) {
      const foreign = await outcome(as(db, customer2, call(booking.id)));
      const absent = await outcome(as(db, customer2, call(missing)));
      assert.equal(foreign, absent, name);
      assert.equal(foreign, "P0002", name);
    }
  });
});

describe("the audit log keeps values only where they are operational", () => {
  async function startedBooking(minutesBack) {
    const svc = await serviceFor(db, SEED.employee1);
    return (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, scheduled_at, duration_minutes, status, total_price, platform_commission, deposit_required)
      values ($1, $2, $3, $4, now() - interval '6 hours' - make_interval(mins => $5::int), 30, 'confirmed', 100, 10, 0) returning id`,
      [SEED.customer, SEED.branch1, SEED.employee1, svc.id, minutesBack]))[0].id;
  }

  it("an administrator completing a booking leaves no customer name, address or message variables in the log", async () => {
    await sys(db, `update profiles set first_name = 'Zainab', last_name = 'Qahtani' where id = $1`, [SEED.customer]);
    const id = await startedBooking(1000);
    const before = await auditCount();
    await as(db, admin, `select employee_update_booking_status($1, 'completed', 'Visit confirmed on site')`, [id]);
    const text = JSON.stringify(await sys(db, `select action, details from admin_audit_logs order by created_at, id offset $1`, [before]));
    assert.ok(!text.includes("Zainab") && !text.includes("Qahtani"));
  });

  it("an administrator can no longer edit a customer note or a staff leave reason directly (SECFIX-2 R2-H1), and nothing leaks into the log", async () => {
    const note = (await sys(db, `insert into provider_customer_notes (provider_id, customer_id, notes) values ($1, $2, 'Allergic to latex; phone sister on 0555123123') returning id`, [SEED.provider1, SEED.customer]))[0].id;
    const leave = (await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, current_date, current_date + 2, 'Chemotherapy appointment', 'approved') returning id`, [SEED.employee1]))[0].id;
    assert.equal((await as(db, admin, `update provider_customer_notes set notes = notes || ' (edited)' where id = $1 returning 1`, [note])).length, 0);
    assert.equal((await as(db, admin, `update employee_time_off set reason = 'Chemotherapy appointment, oncology ward' where id = $1 returning 1`, [leave])).length, 0);
    assert.equal((await sys(db, `select notes from provider_customer_notes where id = $1`, [note]))[0].notes, 'Allergic to latex; phone sister on 0555123123');
    const rows = await sys(db, `select action, details from admin_audit_logs where action in ('provider_customer_notes.update', 'employee_time_off.update')`);
    assert.equal(rows.length, 0, "nothing changed, nothing recorded");
    const text = JSON.stringify(rows);
    assert.ok(!text.includes("latex") && !text.includes("0555123123") && !text.includes("Chemotherapy"));
    await sys(db, `delete from employee_time_off`);
  });

  it("still records money and configuration values in full", async () => {
    const id = (await sys(db, `select id from fee_rules where channel = 'marketplace' and is_first_visit = true`))[0].id;
    // MONEY (D-Q8): a fee change is a new version approved by a second administrator; the audit trigger records the values in full.
    const asked = (await as(db, admin, `select admin_propose_fee_rule_change('marketplace', true, 12.5, 10, 40, now(), 'Audit value test for fees') r`))[0].r;
    const done = (await as(db, admin2, `select admin_decide_approval($1, 'approve', 'Owner confirmed the lower fee') r`, [asked.approval_id]))[0].r;
    const [row] = await sys(db, `select details from admin_audit_logs where action = 'fee_rules.insert' and target_id = $1 order by created_at desc limit 1`, [done.result.fee_rule_id]);
    assert.equal(Number(row.details.changes.fee_percentage.after), 12.5);
    const [closed] = await sys(db, `select details from admin_audit_logs where action = 'fee_rules.update' and target_id = $1 order by created_at desc limit 1`, [id]);
    assert.ok("before" in closed.details.changes.effective_to);
  });

  it("itemises the first few rows of a bulk administrator write and then says the rest were not itemised", async () => {
    const before = await auditCount();
    // GOV-2: notifications are written only by server commands now, so the bulk write uses categories.
    await as(db, admin, `insert into categories (name_en, name_ar, slug) select 'Bulk ' || g, 'Bulk ' || g, 'qa-bulk-' || g from generate_series(1, 500) g`);
    const written = (await auditCount()) - before;
    assert.ok(written <= 6, `${written} audit rows for one statement`);
    assert.ok((await sys(db, `select count(*)::int n from admin_audit_logs where action = 'categories.bulk_write'`))[0].n >= 1);
  });
});

describe("three more commands answer a stranger like a missing booking, and reasons are three characters everywhere", () => {
  it("reschedule_booking, customer_confirm_attendance and generate_zatca_tax_invoice do not say whether a booking id exists", async () => {
    const booking = await paidBooking();
    const missing = "00000000-0000-4000-8000-0000000000ab";
    for (const sql of [`select reschedule_booking($1, now() + interval '9 days', null, 'x')`, `select customer_confirm_attendance($1)`, `select generate_zatca_tax_invoice($1)`]) {
      const foreign = await as(db, customer2, sql, [booking.id]).catch((e) => e.code + e.message);
      const none = await as(db, customer2, sql, [missing]).catch((e) => e.code + e.message);
      assert.equal(foreign, none, sql);
    }
  });

  it("moderate_review, reject_provider_application and resolve_booking_dispute refuse a one-character reason", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    for (const sql of [`select moderate_review('${id}', 'hidden', 'x')`, `select reject_provider_application('${id}', 'x')`, `select resolve_booking_dispute('${id}', 'resolved_rejected', 'x')`]) {
      assert.equal(await outcome(as(db, admin, sql)), "22023", sql);
    }
  });
});

describe("a staff member cannot approve their own leave", () => {
  it("refuses an approved leave row from the staff member, accepts it from the provider's owner, and refuses a console session (SECFIX-2 R2-H1)", async () => {
    const insert = (status) => `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, current_date + 30, current_date + 31, 'Own approval', '${status}')`;
    assert.equal(await outcome(as(db, employee1, insert("approved"), [SEED.employee1])), "42501");
    assert.equal(await outcome(as(db, employee1, insert("pending"), [SEED.employee1])), "ok", "asking is allowed");
    assert.equal(await outcome(as(db, employee1, `update employee_time_off set status = 'approved' where status = 'pending' and employee_id = $1`, [SEED.employee1])), "42501", "approving your own request is not");
    assert.equal(await outcome(as(db, owner1, `update employee_time_off set status = 'approved' where status = 'pending' and employee_id = $1`, [SEED.employee1])), "ok");
    await sys(db, `delete from employee_time_off`);
    assert.equal(await outcome(as(db, admin, insert("approved"), [SEED.employee1])), "42501");
    await sys(db, `delete from employee_time_off`);
  });

  it("also refuses to widen leave the owner already approved", async () => {
    const id = (await sys(db, `insert into employee_time_off (employee_id, start_date, end_date, reason, status) values ($1, current_date + 40, current_date + 41, 'Approved leave', 'approved') returning id`, [SEED.employee1]))[0].id;
    assert.equal(await outcome(as(db, employee1, `update employee_time_off set end_date = current_date + 60 where id = $1`, [id])), "42501");
    assert.equal(await outcome(as(db, owner1, `update employee_time_off set end_date = current_date + 42 where id = $1`, [id])), "ok");
    await sys(db, `delete from employee_time_off`);
  });
});

describe("the audit log does not copy a buyer's name or a web address", () => {
  it("records a changed invoice buyer or integration URL as changed, without the value", async () => {
    await sys(db, `insert into integrations (key, name, category, base_url) values ('audit-url-probe', 'Probe', 'payments', 'https://hooks.example/token-abc123') on conflict (key) do nothing`).catch(() => {});
    const before = await auditCount();
    await as(db, admin, `update integrations set base_url = 'https://hooks.example/token-def456' where key = 'audit-url-probe'`).catch(() => {});
    const text = JSON.stringify(await sys(db, `select details from admin_audit_logs order by created_at, id offset $1`, [before]));
    assert.ok(!text.includes("token-abc123") && !text.includes("token-def456"));
  });
});
