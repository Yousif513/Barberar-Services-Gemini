import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// RT-H1 (red team 2026-10-17): chat is written only by the server. Neither party can change, backdate, move or delete a
// message, and nobody can re-point a conversation to another customer or provider. P-03: a provider can no longer
// manufacture the customer "relationship" by re-pointing a conversation.
let db;
let conv;
let other;
let customer;
const owner = ROLES.user(SEED.owner1);
const owner2 = ROLES.user(SEED.owner2);
const call = (user, sql, params = []) => as(db, user, sql, params).then((r) => r[0]?.r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db));
  conv = (await call(customer, `select start_conversation($1, 'Beard trim') r`, [SEED.provider1])).conversation_id;
  await call(customer, `select send_message($1, 'Can I come at 5?') r`, [conv]);
  await call(owner, `select send_message($1, 'Yes, see you at 5.') r`, [conv]);
  other = await createUser(db);
});

describe("RT-H1 chat is written only through the server commands", () => {
  it("sets sender, role and time on the server and keeps the text as sent", async () => {
    const rows = await sys(db, `select sender_id, sender_role, body, created_at, read_at from messages where conversation_id = $1 order by created_at, id`, [conv]);
    assert.deepEqual(rows.map((r) => [r.sender_id, r.sender_role, r.body]),
      [[customer.sub, "customer", "Can I come at 5?"], [SEED.owner1, "provider", "Yes, see you at 5."]]);
    assert.ok(rows.every((r) => r.read_at === null));
    const c = await one(`select last_message_preview, unread_for_customer, unread_for_provider from conversations where id = $1`, [conv]);
    assert.deepEqual([c.last_message_preview, c.unread_for_customer, c.unread_for_provider], ["Yes, see you at 5.", true, true]);
  });

  it("refuses every direct write to messages from both parties", async () => {
    const msgOf = async (role) => (await one(`select id from messages where conversation_id = $1 and sender_role = $2 limit 1`, [conv, role])).id;
    const providerMsg = await msgOf("provider");
    const customerMsg = await msgOf("customer");
    // The customer rewrites or backdates the provider's message, or moves it to another thread.
    for (const set of ["body = 'Full refund promised'", "created_at = now() - interval '30 days'", `sender_id = '${SEED.customer}'`,
      "sender_role = 'customer'", "conversation_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'", "read_at = now()"]) {
      await expectError(as(db, customer, `update messages set ${set} where id = $1`, [providerMsg]), /permission denied/);
      await expectError(as(db, owner, `update messages set ${set} where id = $1`, [customerMsg]), /permission denied/);
    }
    await expectError(as(db, customer, `delete from messages where id = $1`, [providerMsg]), /permission denied/);
    await expectError(as(db, owner, `delete from messages where id = $1`, [customerMsg]), /permission denied/);
    // A message with a forged sender, role or time cannot be inserted directly.
    await expectError(as(db, customer, `insert into messages (conversation_id, sender_id, sender_role, body, created_at)
      values ($1, $2, 'provider', 'We agree to refund', now() - interval '3 days')`, [conv, SEED.owner1]), /permission denied/);
    await expectError(as(db, owner, `insert into messages (conversation_id, sender_id, sender_role, body) values ($1, $2, 'provider', 'x')`,
      [conv, SEED.owner1]), /permission denied/);
    const body = (await one(`select body from messages where id = $1`, [providerMsg])).body;
    assert.equal(body, "Yes, see you at 5.");
  });

  it("refuses every direct write to conversations, so participants never change", async () => {
    for (const set of [`provider_id = '${SEED.provider2}'`, `customer_id = '${other}'`, "created_at = now() - interval '1 year'",
      "unread_for_customer = false", "last_message_preview = 'forged'", "customer_deleted_at = now()"]) {
      await expectError(as(db, customer, `update conversations set ${set} where id = $1`, [conv]), /permission denied/);
      await expectError(as(db, owner, `update conversations set ${set} where id = $1`, [conv]), /permission denied/);
    }
    await expectError(as(db, owner, `insert into conversations (customer_id, provider_id) values ($1, $2)`, [other, SEED.provider1]), /permission denied/);
    await expectError(as(db, customer, `insert into conversations (customer_id, provider_id) values ($1, $2)`, [other, SEED.provider2]), /permission denied/);
    await expectError(as(db, customer, `delete from conversations where id = $1`, [conv]), /permission denied/);
    const c = await one(`select customer_id, provider_id from conversations where id = $1`, [conv]);
    assert.deepEqual([c.customer_id, c.provider_id], [customer.sub, SEED.provider1]);
  });

  it("freezes message text, time and participants for every caller, including definer code", async () => {
    const msg = (await one(`select id from messages where conversation_id = $1 limit 1`, [conv])).id;
    await expectError(sys(db, `update messages set body = 'changed' where id = $1`, [msg]), /never changes/);
    await expectError(sys(db, `update messages set created_at = now() - interval '1 day' where id = $1`, [msg]), /never changes/);
    await expectError(sys(db, `update messages set sender_id = $2 where id = $1`, [msg, other]), /never changes/);
    await expectError(sys(db, `update conversations set provider_id = $2 where id = $1`, [conv, SEED.provider2]), /participants/);
    await expectError(sys(db, `update conversations set customer_id = $2 where id = $1`, [conv, other]), /participants/);
  });

  it("lets only a participant send, and never into a foreign conversation", async () => {
    await expectError(call(owner2, `select send_message($1, 'Come to us instead') r`, [conv]), /Conversation not found/);
    await expectError(call(ROLES.user(other), `select send_message($1, 'hi') r`, [conv]), /Conversation not found/);
    await expectError(call(customer, `select send_message($1, 'hi') r`, ["00000000-0000-4000-8000-0000000000aa"]), /Conversation not found/);
    await expectError(call(customer, `select send_message($1, '   ') r`, [conv]), /Write a message/);
    await expectError(call(customer, `select send_message($1, $2) r`, [conv, "x".repeat(2001)]), /at most 2000/);
    await expectError(as(db, ROLES.anon, `select send_message($1, 'hi')`, [conv]), /permission denied/);
  });

  it("rate-limits one sender in one conversation", async () => {
    const c = (await call(ROLES.user(other), `select start_conversation($1) r`, [SEED.provider2])).conversation_id;
    for (let i = 0; i < 20; i += 1) await call(ROLES.user(other), `select send_message($1, $2) r`, [c, `m${i}`]);
    await expectError(call(ROLES.user(other), `select send_message($1, 'one more') r`, [c]), /too quickly/);
  });

  it("marks only the other side's messages read, for the caller's side only", async () => {
    const r = await call(owner, `select mark_conversation_read($1) r`, [conv]);
    assert.deepEqual([r.side, r.messages_marked], ["provider", 1]);
    const rows = await sys(db, `select sender_role, read_at from messages where conversation_id = $1`, [conv]);
    assert.ok(rows.find((m) => m.sender_role === "customer").read_at !== null);
    assert.equal(rows.find((m) => m.sender_role === "provider").read_at, null, "the provider cannot mark its own message as read by the customer");
    const c = await one(`select unread_for_customer, unread_for_provider from conversations where id = $1`, [conv]);
    assert.deepEqual([c.unread_for_customer, c.unread_for_provider], [true, false]);
    await expectError(call(owner2, `select mark_conversation_read($1) r`, [conv]), /Conversation not found/);
  });

  it("opens one conversation per customer and business, only with an active verified business, never by staff for itself", async () => {
    const again = await call(customer, `select start_conversation($1) r`, [SEED.provider1]);
    assert.deepEqual([again.conversation_id, again.created], [conv, false]);
    await expectError(call(owner, `select start_conversation($1) r`, [SEED.provider1]), /You work at this business/);
    await sys(db, `update providers set status = 'suspended' where id = $1`, [SEED.provider2]);
    await expectError(call(ROLES.user(await createUser(db)), `select start_conversation($1) r`, [SEED.provider2]), /not taking messages/);
    await sys(db, `update providers set status = 'active' where id = $1`, [SEED.provider2]);
    const admin = ROLES.user(await createUser(db, { role: "admin" }));
    await expectError(call(admin, `select start_conversation($1) r`, [SEED.provider1]), /Console sessions/);
  });

  it("P-03: a provider cannot manufacture a relationship with a customer who never contacted it", async () => {
    const stranger = await createUser(db);
    const rel = async () => (await one(`select customer_has_provider_relationship($1, $2) r`, [SEED.provider1, stranger])).r;
    assert.equal(await rel(), false);
    await expectError(as(db, owner, `insert into conversations (customer_id, provider_id) values ($1, $2)`, [stranger, SEED.provider1]), /permission denied/);
    await expectError(as(db, owner, `update conversations set customer_id = $2 where id = $1`, [conv, stranger]), /permission denied/);
    await expectError(as(db, owner, `select toggle_customer_block($1, $2, 'spam', true)`, [SEED.provider1, stranger]), /relationship|not found|42501|permission/i);
    assert.equal(await rel(), false);
  });

  it("still lets the privacy engine erase a customer's messages and tombstone the thread", async () => {
    const leaver = await createUser(db);
    const c = (await call(ROLES.user(leaver), `select start_conversation($1) r`, [SEED.provider1])).conversation_id;
    await call(ROLES.user(leaver), `select send_message($1, 'my phone is 0500000000') r`, [c]);
    await call(owner, `select send_message($1, 'noted') r`, [c]);
    await sys(db, `select privacy_erase_subject_internal($1, null, 'delete_text', 'request')`, [leaver]);
    assert.equal((await one(`select count(*)::int n from messages where conversation_id = $1`, [c])).n, 0);
    const t = await one(`select customer_id, customer_deleted_at from conversations where id = $1`, [c]);
    assert.equal(t.customer_id, null);
    assert.ok(t.customer_deleted_at !== null);
    await expectError(call(owner, `select send_message($1, 'are you there?') r`, [c]), /closed/);
  });
});
