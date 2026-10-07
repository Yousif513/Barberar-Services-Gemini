import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// D-13: a reminder is never delivered after the appointment began, and reminder_2h is not held back by quiet hours.

const EMPLOYEE4 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
let db;
let recipient;
let phone;

const riyadhHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", hour12: false }).format(new Date()));
const quietNow = () => riyadhHour() >= 22 || riyadhHour() < 9;

async function booking(employeeId, startsAt, status = "confirmed") {
  const svc = await serviceFor(db, employeeId);
  const id = (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes,
      subtotal_price, total_price, tax_amount, deposit_required, platform_commission)
    select $1, e.branch_id, e.id, $3, $4::booking_status, ${startsAt}, 30, 100, 100, 0, 0, 0 from employees e where e.id = $2 returning id`,
    [recipient, employeeId, svc.id, status]))[0].id;
  await sys(db, `delete from message_queue where booking_id = $1`, [id]);
  return id;
}
const enqueue = async (bookingId, template) => (await sys(db, `insert into message_queue (booking_id, recipient_phone, recipient_id, channel, template_name, locale, variables, scheduled_for, status)
  values ($1, $2, $3, 'whatsapp', $4, 'en', '{"customer_name":"Sara","provider_name":"Elite","time":"10:00"}'::jsonb, now() - interval '1 minute', 'pending') returning id`,
  [bookingId, phone, recipient, template]))[0].id;
const status = async (id) => (await sys(db, `select status from message_queue where id = $1`, [id]))[0].status;

before(async () => {
  db = await createMigratedDb();
  phone = "+966509991234";
  recipient = await createUser(db, { phone, verified: true });
  await as(db, ROLES.user(recipient), `select record_consent('whatsapp')`);
});

describe("D-13: reminders and the start of the visit", () => {
  it("expires a reminder whose visit starts within 15 minutes or has begun, instead of sending it late", async () => {
    const soon = await booking(SEED.employee1, `now() + interval '10 minutes'`);
    const begun = await booking(SEED.employee2, `now() - interval '1 hour'`);
    const a = await enqueue(soon, "reminder_2h");
    const b = await enqueue(soon, "reminder_24h");
    const c = await enqueue(begun, "reminder_24h");
    await sys(db, `update message_queue set status = 'cancelled' where status in ('pending', 'deferred_quiet_hours') and id not in ($1, $2, $3)`, [a, b, c]);
    const batch = (await as(db, ROLES.service, `select claim_message_batch(100) r`))[0].r;
    for (const id of [a, b, c]) {
      assert.equal(await status(id), "expired");
      assert.ok(!batch.messages.some((m) => m.queue_id === id), "an expired reminder is not handed to the dispatcher");
    }
  });

  it("still sends a reminder_2h for a visit that is hours away, whatever the Riyadh clock says", async () => {
    const later = await booking(EMPLOYEE4, `now() + interval '3 hours'`);
    const id = await enqueue(later, "reminder_2h");
    await sys(db, `update message_queue set status = 'cancelled' where status in ('pending', 'deferred_quiet_hours') and id <> $1`, [id]);
    const batch = (await as(db, ROLES.service, `select claim_message_batch(100) r`))[0].r;
    assert.ok(batch.messages.some((m) => m.queue_id === id), "reminder_2h is claimed even during quiet hours");
    assert.equal(await status(id), "processing");
  });

  it("keeps deferring the other reminders during quiet hours, to a time before the visit", async () => {
    const later = await booking(SEED.employee1, `now() + interval '30 hours'`);
    const id = await enqueue(later, "reminder_24h");
    await sys(db, `update message_queue set status = 'cancelled' where status in ('pending', 'deferred_quiet_hours') and id <> $1`, [id]);
    await as(db, ROLES.service, `select claim_message_batch(100) r`);
    assert.equal(await status(id), quietNow() ? "deferred_quiet_hours" : "processing");
    const { scheduled_for, scheduled_at } = (await sys(db, `select q.scheduled_for, b.scheduled_at from message_queue q join bookings b on b.id = q.booking_id where q.id = $1`, [id]))[0];
    if (quietNow()) assert.ok(scheduled_for < scheduled_at, "the deferred reminder is due before the appointment");
  });

  it("refuses every other role the batch", async () => {
    for (const role of [ROLES.anon, ROLES.user(SEED.customer), ROLES.user(SEED.owner1)]) {
      await assert.rejects(as(db, role, `select claim_message_batch(10)`), /permission denied|Service role required/);
    }
  });
});
