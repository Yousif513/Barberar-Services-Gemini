import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// G71 recurring appointments against the full migrated schema: provider opt-in, creating, previewing and cancelling a series,
// the payment-deadline rule (a regular must never believe a slot is theirs while the system is about to release it), and every role.
let db;
let admin;
let employeeUser;
let delegate;
let stranger;
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
let scenario = 0;
// Not in SEED: the first professional of the second provider in the demo seed.
const PROVIDER2_EMPLOYEE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";

const newCustomer = async () => ROLES.user(await createUser(db));
const count = async (table, where = "true", params = []) =>
  (await sys(db, `select count(*)::int n from ${table} where ${where}`, params))[0].n;

// A confirmed, upcoming booking for the given customer: the anchor of a series. Each call uses its own date and slot so
// scenarios never collide with each other.
async function makeAnchor(customer, { employee = SEED.employee1 } = {}) {
  scenario += 1;
  const svc = await serviceFor(db, employee);
  const date = await nextWorkingDate(db, employee, 2 + (scenario % 6));
  const slots = await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`,
    [employee, date, svc.duration]);
  assert.ok(slots[0], "the fixture needs a free slot");
  const [b] = await as(db, customer, `select * from create_booking($1, $2, $3)`, [employee, svc.id, slots[0].slot_start]);
  if (b.status === "pending_payment") {
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [b.id, `chg_${b.id}`, b.deposit_required]);
  }
  return b;
}
const enable = (user = owner, provider = SEED.provider1, max = 6, hold = 48) =>
  as(db, user, `select set_provider_recurring_settings($1, true, $2, $3) r`, [provider, max, hold]);
const createSeries = (user, booking, weeks = 1, n = 4, skip = false, key = crypto.randomUUID()) =>
  as(db, user, `select create_booking_series_from_booking($1, $2, $3, $4, $5) r`, [booking, weeks, n, skip, key]).then((r) => r[0].r);
const previewSeries = (user, booking, weeks = 1, n = 4) =>
  as(db, user, `select preview_booking_series($1, $2, $3) r`, [booking, weeks, n]).then((r) => r[0].r);
const cancelSeries = (user, series, reason = "No longer needed", from = null) =>
  as(db, user, `select cancel_booking_series($1, $2, $3) r`, [series, reason, from]).then((r) => r[0].r);
const riyadhClock = (iso) => new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(11, 16);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
  employeeUser = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegate = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `update employees set profile_id = $1 where id = $2`, [employeeUser.sub, SEED.employee1]);
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Front Desk', 'الاستقبال')`,
    [SEED.branch1, delegate.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active)
                 values ($1, $2, 'manager', '{"bookings":true}', true)`, [SEED.provider1, delegate.sub]);
});

describe("provider opt-in", () => {
  it("is off for every provider until the owner enables it", async () => {
    assert.equal(await count("provider_recurring_settings"), 0);
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    await expectError(createSeries(customer, anchor.id), /does not offer recurring/);
    await expectError(previewSeries(customer, anchor.id), /does not offer recurring/);
    assert.equal(await count("booking_series"), 0);
  });

  it("lets only the owner (or an administrator with a reason) change it", async () => {
    await expectError(as(db, ROLES.anon, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /Authentication required|permission denied/);
    const customer = await newCustomer();
    await expectError(as(db, customer, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, otherOwner, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, stranger, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /Provider not found/);
    await expectError(as(db, delegate, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /Only the provider owner/);
    await expectError(as(db, admin, `select set_provider_recurring_settings($1, true, 6, 48)`, [SEED.provider1]), /reason of at least 3/);
    assert.equal(await count("provider_recurring_settings"), 0, "every refused call left nothing behind");
    const r = await as(db, admin, `select set_provider_recurring_settings($1, false, 4, null, 'Support request 4412') r`, [SEED.provider1]);
    assert.equal(r[0].r.enabled, false);
    assert.equal(await count("admin_audit_logs", `action = 'recurring_settings.updated'`), 1);
  });

  it("validates the numbers", async () => {
    for (const [max, hold, pattern] of [[1, 48, /between 2 and 26/], [27, 48, /between 2 and 26/], [6, 0, /between 1 and 168/], [6, 169, /between 1 and 168/]]) {
      await expectError(as(db, owner, `select set_provider_recurring_settings($1, true, $2, $3)`, [SEED.provider1, max, hold]), pattern);
    }
    await sys(db, `delete from provider_recurring_settings`);
    await expectError(as(db, owner, `select set_provider_recurring_settings($1, true, null, 48)`, [SEED.provider1]), /maximum number of appointments is required/);
  });

  it("is audited and keeps its settings visible only to the provider's own people", async () => {
    await enable(owner, SEED.provider1, 6, null);
    assert.equal((await as(db, owner, `select enabled, max_occurrences from provider_recurring_settings`)).length, 1);
    assert.equal((await as(db, delegate, `select 1 from provider_recurring_settings`)).length, 1);
    for (const who of [otherOwner, stranger, await newCustomer(), employeeUser]) {
      assert.equal((await as(db, who, `select 1 from provider_recurring_settings`)).length, 0);
    }
    assert.equal((await as(db, admin, `select 1 from provider_recurring_settings`)).length, 1);
    await expectError(as(db, ROLES.anon, `select 1 from provider_recurring_settings`), /permission denied/);
    await expectError(as(db, owner, `update provider_recurring_settings set max_occurrences = 26`), /permission denied|row-level/);
    await expectError(as(db, owner, `insert into provider_recurring_settings (provider_id, enabled, max_occurrences) values ($1, true, 26)`, [SEED.provider2]), /permission denied|row-level/);
  });
});

describe("creating a series", () => {
  it("refuses, and creates nothing, when an occurrence needs a deposit and the provider has not said how long to hold it", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const before = await count("bookings");
    const preview = await previewSeries(customer, anchor.id);
    assert.equal(preview.requires_online_payment, true);
    assert.equal(preview.can_create, false);
    await expectError(createSeries(customer, anchor.id), /released within minutes/);
    assert.equal(await count("bookings"), before, "no occurrence survives the refusal");
    assert.equal(await count("booking_series"), 0);
  });

  it("books the following dates through create_booking, keeps the Riyadh clock time and holds unpaid ones until their deadline", async () => {
    await enable(owner, SEED.provider1, 6, 48);
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 2, 4);
    assert.equal(result.replayed, false);
    assert.equal(result.occurrences.length, 4);
    const [first, ...rest] = result.occurrences;
    assert.equal(first.state, "anchor");
    assert.equal(first.booking_id, anchor.id);
    rest.forEach((o, i) => {
      assert.equal(o.state, "booked");
      assert.equal(new Date(o.target_at).getTime(), new Date(anchor.scheduled_at).getTime() + (i + 1) * 14 * 86400000);
      assert.equal(riyadhClock(o.target_at), riyadhClock(anchor.scheduled_at));
      assert.equal(o.booking_status, "pending_payment");
      const due = new Date(o.payment_due_at).getTime();
      assert.ok(due > Date.now() + 40 * 3600000 && due <= Date.now() + 48 * 3600000 + 60000, "held for the provider's 48 hours");
    });
    const rows = await sys(db, `select b.customer_id, b.employee_id, b.service_id, b.branch_id from booking_series_occurrences o
                                join bookings b on b.id = o.booking_id where o.series_id = $1`, [result.series_id]);
    assert.equal(rows.length, 4);
    rows.forEach((r) => {
      assert.equal(r.customer_id, customer.sub);
      assert.equal(r.employee_id, anchor.employee_id);
      assert.equal(r.service_id, anchor.service_id);
    });
    assert.equal(await count("booking_services", `booking_id in (select booking_id from booking_series_occurrences where series_id = $1)`, [result.series_id]), 4,
      "each occurrence is a full booking with its service line");
    assert.equal(await count("admin_audit_logs", `action = 'booking_series.created' and target_id = $1`, [result.series_id]), 1);
    assert.equal(await count("notifications", `user_id = $1 and data->>'series_id' = $2`, [customer.sub, result.series_id]), 1, "the customer is told the deadline");
    assert.equal((await as(db, customer, `show timezone`))[0].TimeZone, "UTC", "the session runs in UTC, as a hosted one does");
  });

  it("replays safely with the same key and rejects the key for anything else", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const key = crypto.randomUUID();
    const first = await createSeries(customer, anchor.id, 1, 3, false, key);
    const bookings = await count("bookings");
    const again = await createSeries(customer, anchor.id, 1, 3, false, key);
    assert.equal(again.replayed, true);
    assert.equal(again.series_id, first.series_id);
    assert.equal(await count("bookings"), bookings);
    assert.equal(await count("booking_series", `customer_id = $1`, [customer.sub]), 1);
    await expectError(createSeries(customer, anchor.id, 2, 3, false, key), /already used for a different series/);
    await expectError(createSeries(customer, anchor.id, 1, 3, false, crypto.randomUUID()), /already belongs to a series/);
    await expectError(createSeries(customer, anchor.id, 1, 3, false, "short"), /idempotency key/);
    await expectError(createSeries(customer, anchor.id, 1, 3, false, null), /idempotency key/);
    const stranger2 = await newCustomer();
    const taken = await createSeries(stranger2, (await makeAnchor(stranger2)).id, 1, 2, false, key);
    assert.notEqual(taken.series_id, first.series_id, "the same key from another customer is a different request");
  });

  it("rejects bad input", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    await expectError(createSeries(customer, anchor.id, 9, 3), /between 1 and 8 weeks/);
    await expectError(createSeries(customer, anchor.id, 0, 3), /between 1 and 8 weeks/);
    await expectError(createSeries(customer, anchor.id, 1, 1), /at least 2 appointments/);
    await expectError(createSeries(customer, anchor.id, 1, 7), /at most 6 appointments/);
    await expectError(previewSeries(customer, anchor.id, 1, 7), /at most 6 appointments/);
    assert.equal(await count("booking_series", `customer_id = $1`, [customer.sub]), 0);
  });

  it("refuses an unpaid, finished or foreign booking and every other role", async () => {
    const customer = await newCustomer();
    const other = await newCustomer();
    const svc = await serviceFor(db, SEED.employee2);
    const date = await nextWorkingDate(db, SEED.employee2, 9);
    const slot = (await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee2, date, svc.duration]))[0].slot_start;
    const [unpaid] = await as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee2, svc.id, slot]);
    await expectError(createSeries(customer, unpaid.id), /Only a confirmed booking/);

    const past = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
        subtotal_price, total_price, tax_amount, deposit_required, platform_commission, source)
      values ($1, $2, $3, $4, 'confirmed', now() - interval '2 days', 30, 100, 100, 15, 0, 0, 'link') returning id`,
      [customer.sub, SEED.branch1, SEED.employee1, svc.id]))[0];
    await expectError(createSeries(customer, past.id), /upcoming booking/);

    const anchor = await makeAnchor(customer);
    await expectError(createSeries(other, anchor.id), /Booking not found/);
    await expectError(previewSeries(other, anchor.id), /Booking not found/);
    await expectError(createSeries(customer, crypto.randomUUID()), /Booking not found/);
    await expectError(createSeries(ROLES.anon, anchor.id), /Authentication required|permission denied/);
    await expectError(previewSeries(ROLES.anon, anchor.id), /Authentication required|permission denied/);
    for (const who of [owner, otherOwner, employeeUser, delegate, admin, stranger]) {
      await expectError(createSeries(who, anchor.id), /Booking not found/);
    }
    await expectError(createSeries(ROLES.service, anchor.id), /Authentication required/);
    assert.equal(await count("booking_series", `anchor_booking_id = $1`, [anchor.id]), 0);
    await as(db, customer, `select cancel_booking($1, 'fixture cleanup')`, [unpaid.id]);
  });
});

describe("gaps in the calendar", () => {
  // Another customer takes the slot of the third appointment.
  async function withGap() {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const rival = await newCustomer();
    const target = new Date(new Date(anchor.scheduled_at).getTime() + 2 * 7 * 86400000).toISOString();
    await as(db, rival, `select * from create_booking($1, $2, $3)`, [anchor.employee_id, anchor.service_id, target]);
    return { customer, anchor, target };
  }

  it("previews availability date by date and writes nothing", async () => {
    const { customer, anchor } = await withGap();
    const bookings = await count("bookings");
    const preview = await previewSeries(customer, anchor.id, 1, 4);
    assert.deepEqual(preview.items.map((i) => i.available), [true, false, true]);
    assert.equal(preview.items[1].reason, "slot_unavailable");
    assert.equal(preview.all_available, false);
    assert.equal(preview.can_create, true);
    assert.equal(await count("bookings"), bookings);
    assert.equal(await count("booking_series", `customer_id = $1`, [customer.sub]), 0);
  });

  it("all-or-nothing by default: one taken date creates nothing", async () => {
    const { customer, anchor } = await withGap();
    const bookings = await count("bookings");
    await expectError(createSeries(customer, anchor.id, 1, 4), /Appointment 3 on .* could not be booked/);
    assert.equal(await count("bookings"), bookings, "the occurrence booked before the gap was rolled back");
    assert.equal(await count("booking_series", `customer_id = $1`, [customer.sub]), 0);
    assert.equal(await count("booking_series_occurrences", `series_id not in (select id from booking_series)`), 0);
  });

  it("with skipping, records the skipped date and its reason and books the rest", async () => {
    const { customer, anchor, target } = await withGap();
    const result = await createSeries(customer, anchor.id, 1, 4, true);
    const states = result.occurrences.map((o) => o.state);
    assert.deepEqual(states, ["anchor", "booked", "skipped", "booked"]);
    const skipped = result.occurrences[2];
    assert.equal(skipped.skip_reason, "slot_unavailable");
    assert.equal(skipped.booking_id, null);
    assert.equal(new Date(skipped.target_at).getTime(), new Date(target).getTime());
  });

  it("with skipping, still refuses when nothing at all could be booked", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const rival = await newCustomer();
    await as(db, rival, `select * from create_booking($1, $2, $3)`,
      [anchor.employee_id, anchor.service_id, new Date(new Date(anchor.scheduled_at).getTime() + 7 * 86400000).toISOString()]);
    await expectError(createSeries(customer, anchor.id, 1, 2, true), /None of the following appointments/);
    assert.equal(await count("booking_series", `customer_id = $1`, [customer.sub]), 0);
  });
});

describe("payment deadline", () => {
  it("does not release a held occurrence before its deadline, then releases it", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    const [, held, later] = result.occurrences;
    await sys(db, `update bookings set created_at = now() - interval '3 hours' where id = any ($1::uuid[])`, [[held.booking_id, later.booking_id]]);
    const control = await makeAnchorPending();
    await sys(db, `update bookings set created_at = now() - interval '3 hours' where id = $1`, [control.id]);

    await as(db, ROLES.service, `select expire_stale_booking_holds()`);
    const status = async (id) => (await sys(db, `select status from bookings where id = $1`, [id]))[0].status;
    assert.equal(await status(held.booking_id), "pending_payment", "inside its own deadline");
    assert.equal(await status(control.id), "cancelled", "an ordinary unpaid booking is still released after the hold window");

    await sys(db, `update booking_series_occurrences set payment_due_at = now() - interval '1 minute' where booking_id = $1`, [held.booking_id]);
    await as(db, ROLES.service, `select expire_stale_booking_holds()`);
    assert.equal(await status(held.booking_id), "cancelled", "past its deadline");
    assert.equal(await status(later.booking_id), "pending_payment");
    assert.equal(await status(anchor.id), "confirmed", "the paid anchor is never touched");
  });

  async function makeAnchorPending() {
    const customer = await newCustomer();
    const svc = await serviceFor(db, SEED.employee2);
    const date = await nextWorkingDate(db, SEED.employee2, 11);
    const slot = (await as(db, customer, `select slot_start from get_available_slots($1, $2::date, $3) order by 1 limit 1`, [SEED.employee2, date, svc.duration]))[0].slot_start;
    return (await as(db, customer, `select * from create_booking($1, $2, $3)`, [SEED.employee2, svc.id, slot]))[0];
  }

  it("a customer can pay a held occurrence through the normal payment confirmation", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 2);
    const occurrence = result.occurrences[1];
    const booking = (await sys(db, `select * from bookings where id = $1`, [occurrence.booking_id]))[0];
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [booking.id, `chg_${booking.id}`, booking.deposit_required]);
    assert.equal((await sys(db, `select status from bookings where id = $1`, [booking.id]))[0].status, "confirmed");
  });

  it("reminds the customer once before an occurrence lapses, for the scheduler or an administrator only", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    await sys(db, `update booking_series_occurrences set payment_due_at = now() + interval '5 hours' where series_id = $1 and occurrence_no = 2`, [result.series_id]);
    await expectError(as(db, customer, `select enqueue_series_payment_reminders(24)`), /scheduler or an administrator/);
    await expectError(as(db, owner, `select enqueue_series_payment_reminders(24)`), /scheduler or an administrator/);
    await expectError(as(db, ROLES.anon, `select enqueue_series_payment_reminders(24)`), /permission denied|scheduler/);
    await expectError(as(db, ROLES.service, `select enqueue_series_payment_reminders(0)`), /between 1 and 168/);
    const sent = (await as(db, ROLES.service, `select enqueue_series_payment_reminders(24) n`))[0].n;
    assert.equal(sent, 1);
    assert.equal((await as(db, admin, `select enqueue_series_payment_reminders(24) n`))[0].n, 0, "once only");
    assert.equal(await count("notifications", `user_id = $1 and data->>'series_id' = $2 and title_en like 'A regular appointment%'`, [customer.sub, result.series_id]), 1);
  });

  it("confirms occurrences at once, with no deadline, when there is no deposit to collect, with no hold needed", async () => {
    await enable(otherOwner, SEED.provider2, 6, null);
    // A provider cannot ask for a 0% deposit (check constraint), so the only no-payment occurrence is one whose deposit rounds to nothing.
    await sys(db, `update services set base_price = 0.01 where id in (select service_id from employee_services where employee_id = $1)`, [PROVIDER2_EMPLOYEE]);
    await sys(db, `update employee_services set custom_price = null where employee_id = $1`, [PROVIDER2_EMPLOYEE]);
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer, { employee: PROVIDER2_EMPLOYEE });
    const preview = await previewSeries(customer, anchor.id, 1, 3);
    assert.equal(preview.can_create, true, "the provider set no hold and needs none");
    const result = await createSeries(customer, anchor.id, 1, 3);
    result.occurrences.forEach((o) => {
      assert.equal(o.booking_status, "confirmed");
      assert.equal(o.payment_due_at, null);
    });
    assert.equal(await count("notifications", `data->>'series_id' = $1`, [result.series_id]), 0, "nothing to pay, nothing to announce");
  });
});

describe("cancelling the rest", () => {
  async function seriesWithPaidSecond() {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 4);
    const second = (await sys(db, `select * from bookings where id = $1`, [result.occurrences[1].booking_id]))[0];
    await as(db, ROLES.service, `select confirm_booking_payment($1, $2, $3)`, [second.id, `chg_${second.id}`, second.deposit_required]);
    return { customer, anchor, result, second };
  }

  it("cancels this and the following occurrences through cancel_booking, refunding what was paid, and reports each one", async () => {
    const { customer, anchor, result, second } = await seriesWithPaidSecond();
    const out = await cancelSeries(customer, result.series_id, "Moving away", result.occurrences[1].target_at);
    assert.equal(out.cancelled, 3);
    assert.equal(out.failed, 0);
    assert.deepEqual(out.results.map((r) => [r.occurrence_no, r.outcome]), [[2, "cancelled"], [3, "cancelled"], [4, "cancelled"]]);
    const cancelled = (await sys(db, `select status, cancelled_by, refund_amount from bookings where id = $1`, [second.id]))[0];
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.cancelled_by, "customer");
    assert.equal(Number(cancelled.refund_amount), Number(second.deposit_required), "the paid deposit is refunded under the normal policy");
    assert.equal((await sys(db, `select status from bookings where id = $1`, [anchor.id]))[0].status, "confirmed", "the occurrence before the cut stays");
    assert.equal((await sys(db, `select status from booking_series where id = $1`, [result.series_id]))[0].status, "active", "the anchor still stands");
    assert.equal(await count("admin_audit_logs", `action = 'booking_series.cancelled' and target_id = $1`, [result.series_id]), 1);

    const again = await cancelSeries(customer, result.series_id, "Moving away", result.occurrences[1].target_at);
    assert.equal(again.cancelled, 0, "a replay cancels nothing more");
    assert.deepEqual([...new Set(again.results.map((r) => r.outcome))], ["already_cancelled"]);
  });

  it("ends the series when everything upcoming is cancelled", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    const out = await cancelSeries(customer, result.series_id, null);
    assert.equal(out.cancelled, 3);
    const row = (await sys(db, `select status, cancelled_at from booking_series where id = $1`, [result.series_id]))[0];
    assert.equal(row.status, "cancelled");
    assert.ok(row.cancelled_at);
  });

  it("does not touch occurrences that already started or were cancelled", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    await as(db, customer, `select cancel_booking($1, 'one-off')`, [result.occurrences[1].booking_id]);
    const out = await cancelSeries(customer, result.series_id);
    assert.deepEqual(out.results.map((r) => r.outcome), ["cancelled", "already_cancelled", "cancelled"]);
  });

  it("answers 'not found' to anybody but the customer, and an administrator needs a reason", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    await expectError(cancelSeries(await newCustomer(), result.series_id), /Series not found/);
    for (const who of [owner, otherOwner, employeeUser, delegate, stranger]) {
      await expectError(cancelSeries(who, result.series_id), /Series not found/);
    }
    await expectError(cancelSeries(ROLES.anon, result.series_id), /Authentication required|permission denied/);
    await expectError(cancelSeries(customer, crypto.randomUUID()), /Series not found/);
    await expectError(cancelSeries(admin, result.series_id, null), /reason of at least 3/);
    assert.equal(await count("bookings", `id in (select booking_id from booking_series_occurrences where series_id = $1) and status = 'cancelled'`, [result.series_id]), 0);
    const out = await cancelSeries(admin, result.series_id, "Provider closed permanently");
    assert.equal(out.cancelled, 3);
    assert.equal((await sys(db, `select cancelled_by from bookings where id = $1`, [anchor.id]))[0].cancelled_by, "admin");
  });
});

describe("who can see a series", () => {
  it("shows it to its customer, the provider's owner, a delegate with bookings, the professional and an administrator", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 3);
    const visible = (user) => as(db, user, `select (select count(*)::int from booking_series where id = $1) s,
                                                  (select count(*)::int from booking_series_occurrences where series_id = $1) o`, [result.series_id]).then((r) => r[0]);
    for (const who of [customer, owner, delegate, admin]) assert.deepEqual(await visible(who), { s: 1, o: 3 });
    const professional = await visible(employeeUser);
    assert.deepEqual(professional, { s: 1, o: 3 }, "the professional who holds the appointments");
    for (const who of [await newCustomer(), otherOwner, stranger]) assert.deepEqual(await visible(who), { s: 0, o: 0 });
    await expectError(as(db, ROLES.anon, `select 1 from booking_series`), /permission denied/);
    await expectError(as(db, ROLES.anon, `select 1 from booking_series_occurrences`), /permission denied/);
  });

  it("is never writable directly", async () => {
    const customer = await newCustomer();
    const anchor = await makeAnchor(customer);
    const result = await createSeries(customer, anchor.id, 1, 2);
    await expectError(as(db, customer, `update booking_series set status = 'cancelled' where id = $1`, [result.series_id]), /permission denied|row-level/);
    await expectError(as(db, customer, `delete from booking_series where id = $1`, [result.series_id]), /permission denied|row-level/);
    await expectError(as(db, customer, `update booking_series_occurrences set state = 'skipped' where series_id = $1`, [result.series_id]), /permission denied|row-level/);
    await expectError(as(db, admin, `delete from booking_series_occurrences where series_id = $1`, [result.series_id]), /permission denied|row-level/);
    assert.equal(await count("booking_series_occurrences", `series_id = $1`, [result.series_id]), 2);
  });

  it("leaves the core booking functions exactly as they were", async () => {
    const rows = await sys(db, `select proname, count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('create_booking','cancel_booking','reschedule_booking','booking_create_internal','get_available_slots') group by 1`);
    rows.forEach((r) => assert.equal(r.n, 1, `${r.proname} has ${r.n} overloads`));
    assert.equal(rows.length, 5);
  });
});
