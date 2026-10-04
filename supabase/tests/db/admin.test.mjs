import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

let db;
let admin;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("admin broadcast", () => {
  it("is admin-only", async () => {
    const customer = ROLES.user(await createUser(db));
    await expectError(as(db, customer, `select admin_broadcast_notification('customers', 'T', 'ع', 'B', 'ن', true, false)`), /Only administrators/);
    await expectError(as(db, ROLES.anon, `select admin_broadcast_notification('customers', 'T', 'ع', 'B', 'ن', true, false)`), /permission denied/);
  });

  it("writes in-app notifications and queues WhatsApp only with WhatsApp and marketing consent", async () => {
    const consenting = await createUser(db, { phone: "+966551112233", verified: true });
    const whatsappOnly = await createUser(db, { phone: "+966551112244", verified: true });
    await sys(db, `insert into consents (user_id, purpose, status) values ($1, 'whatsapp', 'granted'), ($1, 'marketing', 'granted'), ($2, 'whatsapp', 'granted')`,
      [consenting, whatsappOnly]);

    const r = (await as(db, admin, `select admin_broadcast_notification('customers', 'Eid offer', 'عرض العيد', 'Hello', 'مرحبا', true, true) r`))[0].r;
    const customers = (await sys(db, `select count(*)::int n from profiles where role = 'customer'`))[0].n;
    assert.equal(r.in_app_created, customers);
    assert.equal(r.whatsapp_queued, 1);

    const queued = await sys(db, `select recipient_id from message_queue where template_name = 'broadcast_notice'`);
    assert.deepEqual(queued.map((q) => q.recipient_id), [consenting]);
    const audit = await sys(db, `select count(*)::int n from admin_audit_logs where action = 'notification.broadcast'`);
    assert.equal(audit[0].n, 1);
  });

  it("rejects an empty message or unknown audience", async () => {
    await expectError(as(db, admin, `select admin_broadcast_notification('customers', '', 'ع', 'B', 'ن', true, false)`), /required/);
    await expectError(as(db, admin, `select admin_broadcast_notification('everyone', 'T', 'ع', 'B', 'ن', true, false)`), /Unknown audience/);
  });
});
