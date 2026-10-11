import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, serviceFor, sys } from "./harness.mjs";

// R33 (SQL part): token registration, booking notifications and the push queue.

let db;
let customer;
let other;
let svc;
const owner = ROLES.user(SEED.owner1);
const token = (n) => `ExponentPushToken[abcdefghijklmnopqrst${n}]`;
const register = (actor, value, platform = "ios") => as(db, actor, `select register_push_token($1, $2, 'Test phone') r`, [value, platform]).then((r) => r[0].r);
let slot = 0;
const booking = async (status = "confirmed") => (await sys(db, `insert into bookings (customer_id, branch_id, employee_id, service_id, status, scheduled_at, duration_minutes, subtotal_price, total_price, tax_amount, deposit_required)
  values ($1, $2, $3, $4, $5::booking_status, now() + interval '2 days' + make_interval(mins => $6::int), 30, 100, 100, 0, 0) returning id`, [customer.sub, SEED.branch1, SEED.employee1, svc.id, status, (slot += 45)]))[0].id;
const notifications = (user) => sys(db, `select title_en, title_ar, type, data from notifications where user_id = $1 order by created_at, id`, [user]);

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db));
  other = ROLES.user(await createUser(db));
  svc = await serviceFor(db, SEED.employee1);
});

describe("the Expo integration is honest", () => {
  it("is not shown as connected and carries no invented key", async () => {
    const [row] = await sys(db, `select status, enabled, key_masked from integrations where key = 'expo_push'`);
    assert.deepEqual(row, { status: "disconnected", enabled: false, key_masked: null });
  });
});

describe("token registration", () => {
  it("registers, is idempotent, hands a device to the next signed-in user, and deactivates on sign-out", async () => {
    const t = token("A");
    const first = await register(customer, t);
    assert.equal((await register(customer, t)).id, first.id);
    assert.equal((await sys(db, `select count(*)::int n from expo_push_tokens where token = $1`, [t]))[0].n, 1);
    await register(other, t, "android");
    assert.equal((await sys(db, `select user_id from expo_push_tokens where token = $1`, [t]))[0].user_id, other.sub);
    assert.deepEqual(await as(db, customer, `select unregister_push_token($1) r`, [t]).then((r) => r[0].r), { deactivated: 0 }, "cannot deactivate another user's device");
    assert.deepEqual(await as(db, other, `select unregister_push_token($1) r`, [t]).then((r) => r[0].r), { deactivated: 1 });
    assert.equal((await sys(db, `select is_active from expo_push_tokens where token = $1`, [t]))[0].is_active, false);
  });

  it("refuses malformed tokens, unknown platforms and anonymous callers", async () => {
    await expectError(register(customer, "not-a-token"), /Expo push token/);
    await expectError(register(customer, token("B"), "desktop"), /Platform/);
    await expectError(register(ROLES.anon, token("C")), /permission denied/i);
    await expectError(as(db, ROLES.anon, `select unregister_push_token($1)`, [token("C")]), /permission denied/i);
  });
});

describe("booking notifications and the queue", () => {
  it("creates bilingual in-app notifications for the customer and the salon owner, without personal text", async () => {
    const id = await booking("confirmed");
    const mine = (await notifications(customer.sub)).filter((n) => n.data.booking_id === id);
    const salon = (await notifications(SEED.owner1)).filter((n) => n.data.booking_id === id);
    assert.deepEqual([mine.length, salon.length], [1, 1]);
    assert.ok(mine[0].title_en && mine[0].title_ar && /[؀-ۿ]/.test(mine[0].title_ar));
    await as(db, owner, `select employee_update_booking_status($1, 'in_progress')`, [id]).catch(() => {});
    await sys(db, `update bookings set status = 'completed' where id = $1`, [id]);
    assert.equal((await notifications(customer.sub)).filter((n) => n.data.booking_id === id && n.data.status === "completed").length, 1);
  });

  it("queues a push only when Expo is switched on and the user has an active token", async () => {
    await register(customer, token("D"));
    const before = (await sys(db, `select count(*)::int n from push_notification_queue`))[0].n;
    await booking("confirmed");
    assert.equal((await sys(db, `select count(*)::int n from push_notification_queue`))[0].n, before, "integration disconnected: in-app only");
    await sys(db, `update integrations set status = 'connected', enabled = true where key = 'expo_push'`);
    const id = await booking("confirmed");
    const queued = await sys(db, `select q.id, q.status from push_notification_queue q join notifications n on n.id = q.notification_id where n.user_id = $1 and n.data->>'booking_id' = $2`, [customer.sub, id]);
    assert.equal(queued.length, 1);
    const batch = (await as(db, ROLES.service, `select claim_push_batch(10) r`))[0].r;
    const entry = batch.find((b) => b.queue_id === queued[0].id);
    assert.deepEqual([entry.tokens.includes(token("D")), entry.title_ar.length > 0], [true, true]);
    assert.equal((await as(db, ROLES.service, `select claim_push_batch(10) r`))[0].r.some((b) => b.queue_id === queued[0].id), false, "a claimed entry is not handed out twice");
    const done = (await as(db, ROLES.service, `select complete_push_delivery($1, false, 'DeviceNotRegistered', array[$2]::text[]) r`, [queued[0].id, token("D")]))[0].r;
    assert.equal(done.status, "pending");
    assert.equal((await sys(db, `select is_active from expo_push_tokens where token = $1`, [token("D")]))[0].is_active, false);
    assert.equal((await as(db, ROLES.service, `select complete_push_delivery($1, true) r`, [queued[0].id]))[0].r.status, "sent");
  });

  it("keeps the queue and its functions away from everybody but the service role", async () => {
    for (const actor of [ROLES.anon, customer, owner]) {
      await expectError(as(db, actor, `select claim_push_batch(5)`), /permission denied|Service role/i);
      await expectError(as(db, actor, `select complete_push_delivery($1, true)`, [SEED.provider1]), /permission denied|Service role/i);
    }
    await expectError(as(db, customer, `select * from push_notification_queue`), /permission denied/i);
    await expectError(as(db, ROLES.service, `select claim_push_batch(0)`), /Batch size/);
  });

  it("does not let a failing notification stop a booking", async () => {
    await sys(db, `alter table notifications add constraint fixdbb_break check (title_en <> 'Booking confirmed') not valid`);
    const id = await booking("confirmed");
    assert.ok(id, "the booking is written even though its notification was refused");
    await sys(db, `alter table notifications drop constraint fixdbb_break`);
  });
});
