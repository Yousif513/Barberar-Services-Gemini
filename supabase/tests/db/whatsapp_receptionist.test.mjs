import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as adhan from "adhan";
import { as, createMigratedDb, createUser, expectError, nextWorkingDate, ROLES, SEED, sys } from "./harness.mjs";
import { respond } from "../../functions/_shared/whatsapp-engine.ts";
import { toEngineContext } from "../../functions/_shared/whatsapp-context.ts";
import { makeAdhanClock } from "../../functions/_shared/whatsapp-prayer.ts";
import { riyadhMinutes, riyadhYmd } from "../../functions/_shared/whatsapp-intent.ts";

// G60 WhatsApp receptionist against the full migrated schema (UTC session, no default table privileges):
// the channel, idempotent ingest, opt-out, the reply window and retention settings, hand-off, the queue hand-over to the dispatcher,
// row level security and the guarantee that no returned column carries the customer's number or its hash.
let db;
let admin;
let customer;
let stranger; // an employee of nobody
let delegate; // provider-wide delegate with the bookings permission
let inventoryOnly; // delegate without the bookings permission
const owner = ROLES.user(SEED.owner1);
const otherOwner = ROLES.user(SEED.owner2);
const service = ROLES.service;
const anon = ROLES.anon;

const PNID = "109876543210987";
const OTHER_PNID = "209876543210987";
const PEPPER = "test-pepper";
const waOf = (n) => `96650${String(1000000 + n)}`;
const hashOf = (wa) => createHash("sha256").update(`${PEPPER}:${wa}`).digest("hex");
let counter = 0;
const wamid = () => `wamid.test.${(counter += 1)}`;

const ingest = (id, body, { pnid = PNID, wa = waOf(1), type = "text", at = null } = {}) =>
  as(db, service, `select whatsapp_ingest_message($1, $2, $3, $4, $5, $6, $7::timestamptz) r`, [pnid, hashOf(wa), wa, id, body, type, at]).then((r) => r[0].r);
const turn = (conversation, inbound, { state = {}, status = "bot", intent = "booking", locale = "ar", reply = null, reason = null } = {}) =>
  as(db, service, `select whatsapp_record_turn($1, $2, $3::jsonb, $4, $5, $6, $7, $8) r`,
    [conversation, inbound, JSON.stringify(state), status, intent, locale, reply, reason]).then((r) => r[0].r);
const saveChannel = (user, provider = SEED.provider1, { pnid = PNID, display = "+966 50 000 0000", enabled = true, ai = true, handoff = true } = {}) =>
  as(db, user, `select provider_save_whatsapp_channel($1, $2, $3, $4, $5, $6) r`, [provider, pnid, display, enabled, ai, handoff]).then((r) => r[0].r);
const setSetting = (key, value) =>
  sys(db, `update platform_settings set value = $2::jsonb where key = $1`, [key, JSON.stringify(value)]);
const count = async (table, where = "true", params = []) => (await sys(db, `select count(*)::int n from ${table} where ${where}`, params))[0].n;
const conversationOf = async (wa) => (await sys(db, `select * from whatsapp_conversations where customer_hash = $1`, [hashOf(wa)]))[0];

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  customer = ROLES.user(await createUser(db));
  stranger = ROLES.user(await createUser(db, { role: "provider_employee" }));
  delegate = ROLES.user(await createUser(db, { role: "provider_employee" }));
  inventoryOnly = ROLES.user(await createUser(db, { role: "provider_employee" }));
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Front Desk', 'الاستقبال')`, [SEED.branch1, delegate.sub]);
  await sys(db, `insert into employees (branch_id, profile_id, name_en, name_ar) values ($1, $2, 'Stock Clerk', 'المخزن')`, [SEED.branch1, inventoryOnly.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'manager', '{"bookings":true}', true)`,
    [SEED.provider1, delegate.sub]);
  await sys(db, `insert into provider_memberships (provider_id, user_id, role, permissions, is_active) values ($1, $2, 'manager', '{"inventory":true}', true)`,
    [SEED.provider1, inventoryOnly.sub]);
});

describe("environment", () => {
  it("runs in UTC like a hosted session, and the settings start unset", async () => {
    assert.equal((await sys(db, `show timezone`))[0].TimeZone, "UTC");
    const rows = await sys(db, `select key, value from platform_settings where key like 'whatsapp.%' order by key`);
    assert.deepEqual(rows.map((r) => [r.key, r.value]), [["whatsapp.message_retention_days", null], ["whatsapp.session_window_hours", null]]);
  });
});

describe("channel configuration", () => {
  it("only the provider owner can save it; everyone else is told the provider does not exist", async () => {
    await expectError(saveChannel(otherOwner), /Provider not found/);
    await expectError(saveChannel(customer), /Provider not found/);
    await expectError(saveChannel(stranger), /Provider not found/);
    await expectError(saveChannel(delegate), /Provider not found/);
    await expectError(saveChannel(admin), /Provider not found/);
    await expectError(saveChannel(anon), /permission denied/);
    await expectError(saveChannel(service), /Authentication required/);
    assert.equal(await count("whatsapp_channels"), 0);
  });
  it("validates the numeric id, the display number and the switches", async () => {
    await expectError(saveChannel(owner, SEED.provider1, { pnid: "abc" }), /numeric id/);
    await expectError(saveChannel(owner, SEED.provider1, { pnid: "1234" }), /numeric id/);
    await expectError(saveChannel(owner, SEED.provider1, { display: "call me" }), /display number/);
    await expectError(saveChannel(owner, SEED.provider1, { enabled: false, ai: true }), /Switch the channel on/);
    await expectError(as(db, owner, `select provider_save_whatsapp_channel($1, $2, null, null, true, true) r`, [SEED.provider1, PNID]), /switches are required/);
  });
  it("starts switched off and unverified; saving again is idempotent; a new number needs verification again", async () => {
    const saved = await saveChannel(owner, SEED.provider1, { enabled: false, ai: false, handoff: true });
    assert.equal(saved.enabled, false);
    assert.equal(saved.ai_enabled, false);
    assert.equal(saved.verified_at, null);
    const again = await saveChannel(owner, SEED.provider1, { enabled: false, ai: false, handoff: true });
    assert.equal(again.id, saved.id);
    assert.equal(await count("whatsapp_channels"), 1);
  });
  it("one phone number id cannot be connected to two businesses", async () => {
    await expectError(saveChannel(otherOwner, SEED.provider2, { pnid: PNID }), /already connected/);
  });
  it("direct writes are refused: the table has no client write privilege", async () => {
    await expectError(as(db, owner, `insert into whatsapp_channels (provider_id, phone_number_id) values ($1, '999999999')`, [SEED.provider1]), /permission denied/);
    await expectError(as(db, owner, `update whatsapp_channels set verified_at = now()`), /permission denied/);
    await expectError(as(db, owner, `delete from whatsapp_channels`), /permission denied/);
  });
});

describe("platform verification of the number", () => {
  it("only an administrator can confirm it, with a reason", async () => {
    const [{ id }] = await sys(db, `select id from whatsapp_channels`);
    for (const user of [owner, otherOwner, customer, stranger, delegate, anon, service]) {
      await expectError(as(db, user, `select admin_set_whatsapp_channel_verified($1, true, 'checked in Meta business manager') r`, [id]), /Administrator access required|permission denied/);
    }
    await expectError(as(db, admin, `select admin_set_whatsapp_channel_verified($1, true, 'x') r`, [id]), /reason is required/);
    await expectError(as(db, admin, `select admin_set_whatsapp_channel_verified($1, null, 'checked') r`, [id]), /verified flag/);
    await expectError(as(db, admin, `select admin_set_whatsapp_channel_verified('00000000-0000-4000-8000-000000000000', true, 'checked') r`), /Channel not found/);
    assert.equal((await sys(db, `select verified_at from whatsapp_channels`))[0].verified_at, null);
  });
  it("nothing is routed until the channel is on and verified", async () => {
    const [{ id }] = await sys(db, `select id from whatsapp_channels`);
    assert.deepEqual(await ingest(wamid(), "hello", { wa: waOf(90) }), { routed: false, reason: "channel_disabled" });
    await saveChannel(owner, SEED.provider1, { enabled: true, ai: true, handoff: true });
    assert.deepEqual(await ingest(wamid(), "hello", { wa: waOf(90) }), { routed: false, reason: "channel_unverified" });
    assert.deepEqual(await ingest(wamid(), "hello", { pnid: OTHER_PNID }), { routed: false, reason: "unknown_channel" });
    assert.equal(await count("whatsapp_conversations"), 0);
    await as(db, admin, `select admin_set_whatsapp_channel_verified($1, true, 'checked in Meta business manager') r`, [id]);
    assert.notEqual((await sys(db, `select verified_at from whatsapp_channels`))[0].verified_at, null);
    const audit = await sys(db, `select details from admin_audit_logs where action = 'whatsapp.channel_verification'`);
    assert.equal(audit.length, 1);
  });
  it("changing the phone number id withdraws the verification", async () => {
    await saveChannel(owner, SEED.provider1, { pnid: "309876543210987" });
    assert.equal((await sys(db, `select verified_at from whatsapp_channels`))[0].verified_at, null);
    await saveChannel(owner, SEED.provider1, { pnid: PNID });
    const [{ id }] = await sys(db, `select id from whatsapp_channels`);
    await as(db, admin, `select admin_set_whatsapp_channel_verified($1, true, 'checked again after the change') r`, [id]);
  });
});

describe("ingest", () => {
  it("is for the service role only", async () => {
    const args = [PNID, hashOf(waOf(2)), waOf(2), "wamid.denied", "hello", "text", null];
    for (const user of [owner, customer, stranger, delegate, admin, anon]) {
      await expectError(as(db, user, `select whatsapp_ingest_message($1, $2, $3, $4, $5, $6, $7::timestamptz) r`, args), /Service role required|permission denied/);
    }
    assert.equal(await count("whatsapp_messages"), 0);
  });
  it("rejects malformed input", async () => {
    await expectError(ingest(wamid(), "hi", { pnid: "x" }), /phone number id is not valid/);
    await expectError(as(db, service, `select whatsapp_ingest_message($1, 'abc', $2, 'w1', 'hi') r`, [PNID, waOf(1)]), /64 hexadecimal/);
    await expectError(as(db, service, `select whatsapp_ingest_message($1, $2, '12ab', 'w1', 'hi') r`, [PNID, hashOf(waOf(1))]), /WhatsApp id is not valid/);
    await expectError(as(db, service, `select whatsapp_ingest_message($1, $2, $3, '', 'hi') r`, [PNID, hashOf(waOf(1)), waOf(1)]), /message id is not valid/);
    await expectError(ingest(wamid(), "hi", { type: "Text!" }), /message type is not valid/);
  });
  it("creates the conversation, keeps only the hash and the last four digits on it, and stores the address apart", async () => {
    const id = wamid();
    const r = await ingest(id, "أبغى حجز قص شعر بكرة العصر", { wa: waOf(1) });
    assert.equal(r.routed, true);
    assert.equal(r.duplicate, false);
    assert.equal(r.run_engine, true);
    const conv = await conversationOf(waOf(1));
    assert.equal(conv.customer_last4, waOf(1).slice(-4));
    assert.equal(conv.status, "bot");
    assert.equal(conv.customer_hash.length, 64);
    assert.equal((await sys(db, `select recipient_wa_id from whatsapp_contact_addresses where conversation_id = $1`, [conv.id]))[0].recipient_wa_id, waOf(1));
    assert.equal(await count("whatsapp_messages", "conversation_id = $1", [conv.id]), 1);
  });
  it("is idempotent on Meta's message id", async () => {
    const wa = waOf(3);
    const id = wamid();
    const first = await ingest(id, "مواعيد اليوم؟", { wa });
    assert.equal(first.duplicate, false);
    // The caller crashed before answering: the same message is processed once more, but stored once.
    const retry = await ingest(id, "مواعيد اليوم؟", { wa });
    assert.equal(retry.duplicate, false);
    assert.equal(retry.inbound_message_id, first.inbound_message_id);
    assert.equal(await count("whatsapp_messages", "wa_message_id = $1", [id]), 1);
    await turn(first.conversation_id, id, { reply: null, intent: "availability" });
    const replay = await ingest(id, "مواعيد اليوم؟", { wa });
    assert.equal(replay.duplicate, true);
    assert.equal(replay.run_engine, false);
    assert.equal(await count("whatsapp_messages", "conversation_id = $1", [first.conversation_id]), 1);
  });
  it("a message id cannot be replayed into another customer's conversation", async () => {
    const id = wamid();
    await ingest(id, "hello", { wa: waOf(4) });
    await expectError(ingest(id, "hello", { wa: waOf(5) }), /belongs to another conversation/);
  });
  it("a replay of an old message does not reopen a resolved conversation", async () => {
    const wa = waOf(6);
    const id = wamid();
    const first = await ingest(id, "hello", { wa });
    await turn(first.conversation_id, id, { reply: null, intent: "greeting" });
    await as(db, owner, `select provider_resolve_whatsapp_conversation($1) r`, [first.conversation_id]);
    await ingest(id, "hello", { wa });
    assert.equal((await conversationOf(wa)).status, "closed");
    // A genuinely new message reopens it.
    const next = await ingest(wamid(), "hello again", { wa });
    assert.equal(next.status, "bot");
    assert.equal((await conversationOf(wa)).resolved_at, null);
  });
});

describe("opt-out", () => {
  const wa = waOf(10);
  it("STOP, إيقاف and الغاء الاشتراك unsubscribe, erase the address and silence the receptionist", async () => {
    for (const [n, word] of [[11, "STOP"], [12, "إيقاف"], [13, "الغاء الاشتراك"], [14, " stop. "]]) {
      const r = await ingest(wamid(), word, { wa: waOf(n) });
      assert.equal(r.opted_out, true, word);
      assert.equal(r.kind, "opt_out");
      assert.equal(r.run_engine, false);
      assert.equal(r.reply_allowed, false);
      const conv = await conversationOf(waOf(n));
      assert.notEqual(conv.opted_out_at, null);
      assert.equal(await count("whatsapp_contact_addresses", "conversation_id = $1", [conv.id]), 0);
    }
  });
  it("a sentence that merely contains a stop word is not an opt-out", async () => {
    const r = await ingest(wamid(), "please do not stop the booking", { wa: waOf(15) });
    assert.equal(r.opted_out, false);
    assert.equal(r.run_engine, true);
  });
  it("after an opt-out the bot never replies, even when everything else allows it", async () => {
    await setSetting("whatsapp.session_window_hours", 24);
    const first = await ingest(wamid(), "hello", { wa });
    await turn(first.conversation_id, (await sys(db, `select wa_message_id from whatsapp_messages where id = $1`, [first.inbound_message_id]))[0].wa_message_id, { reply: "hi" });
    const queued = await count("message_queue", "conversation_id = $1", [first.conversation_id]);
    assert.equal(queued, 1);
    const stop = await ingest(wamid(), "STOP", { wa });
    assert.equal(stop.opted_out, true);
    // The queued reply is cancelled at claim time, and new messages are stored but never answered.
    const claimed = await as(db, service, `select claim_whatsapp_session_batch(10) r`).then((r) => r[0].r);
    assert.equal(claimed.messages.length, 0);
    assert.equal((await sys(db, `select status from message_queue where conversation_id = $1`, [first.conversation_id]))[0].status, "cancelled");
    const later = await ingest(wamid(), "أبغى حجز", { wa });
    assert.equal(later.opted_out, true);
    assert.equal(later.run_engine, false);
    assert.equal(later.reply_blocked_reason, "opted_out");
    assert.equal(await count("message_queue", "conversation_id = $1", [first.conversation_id]), 1);
    await setSetting("whatsapp.session_window_hours", null);
  });
  it("record_turn refuses to queue a reply for an unsubscribed conversation", async () => {
    const id = wamid();
    const first = await ingest(id, "hello", { wa: waOf(16) });
    await ingest(wamid(), "STOP", { wa: waOf(16) });
    const r = await turn(first.conversation_id, id, { reply: "still here?" });
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "opted_out");
  });
  it("a start word resubscribes and restores the address", async () => {
    const r = await ingest(wamid(), "ابدأ", { wa });
    assert.equal(r.kind, "opt_in");
    assert.equal(r.opted_out, false);
    assert.equal(r.run_engine, true);
    const conv = await conversationOf(wa);
    assert.equal(conv.opted_out_at, null);
    assert.equal(await count("whatsapp_contact_addresses", "conversation_id = $1", [conv.id]), 1);
  });
});

describe("reply window and retention settings", () => {
  const wa = waOf(20);
  it("with the window unset nothing is sent: the conversation goes to a person", async () => {
    await setSetting("whatsapp.session_window_hours", null);
    const id = wamid();
    const first = await ingest(id, "مواعيد اليوم؟", { wa });
    assert.equal(first.reply_allowed, false);
    assert.equal(first.reply_blocked_reason, "window_unset");
    const r = await turn(first.conversation_id, id, { reply: "اليوم عندنا مواعيد", intent: "availability" });
    assert.equal(r.enqueued, false);
    assert.equal(r.reason, "window_unset");
    assert.equal(r.status, "awaiting_human");
    assert.equal(r.handoff_reason, "window_unset");
    assert.equal(await count("message_queue", "conversation_id = $1", [first.conversation_id]), 0);
  });
  it("the console validates both settings", async () => {
    for (const bad of ["0", "25", "1.5", "\"24\"", "true"]) {
      await expectError(as(db, admin, `select admin_update_platform_setting('whatsapp.session_window_hours', $1::jsonb, 'set the window') r`, [bad]), /whole number of hours/);
    }
    for (const bad of ["0", "3651", "2.5", "\"30\""]) {
      await expectError(as(db, admin, `select admin_update_platform_setting('whatsapp.message_retention_days', $1::jsonb, 'set retention') r`, [bad]), /whole number of days/);
    }
    await expectError(as(db, owner, `select admin_update_platform_setting('whatsapp.session_window_hours', '24'::jsonb, 'owner tries') r`), /Administrator access required/);
    const ok = await as(db, admin, `select admin_update_platform_setting('whatsapp.session_window_hours', '24'::jsonb, 'Meta allows 24 hours') r`);
    assert.equal(ok[0].r.value, 24);
  });
  it("inside the window the reply is queued without its text or the customer's number, then handed to the dispatcher", async () => {
    const id = wamid();
    const first = await ingest(id, "أبغى حجز قص شعر بكرة العصر", { wa: waOf(21) });
    assert.equal(first.reply_allowed, true);
    const r = await turn(first.conversation_id, id, { reply: "عندنا اليوم 4:30 م", intent: "booking", state: { stage: "offered" } });
    assert.equal(r.enqueued, true);
    const [queue] = await sys(db, `select * from message_queue where conversation_id = $1`, [first.conversation_id]);
    assert.equal(queue.status, "pending");
    assert.equal(queue.template_name, "whatsapp_session_text");
    assert.equal(queue.recipient_phone, `****${waOf(21).slice(-4)}`);
    assert.deepEqual(queue.variables, {});
    assert.equal(JSON.stringify(queue).includes(waOf(21)), false);
    assert.equal(JSON.stringify(queue).includes("عندنا"), false);

    // The template dispatcher must not touch it.
    const templates = await as(db, service, `select claim_message_batch(50) r`).then((x) => x[0].r);
    assert.equal(templates.messages.some((m) => m.queue_id === queue.id), false);
    assert.equal((await sys(db, `select status from message_queue where id = $1`, [queue.id]))[0].status, "pending");

    const claimed = await as(db, service, `select claim_whatsapp_session_batch(10) r`).then((x) => x[0].r);
    const mine = claimed.messages.find((m) => m.queue_id === queue.id);
    assert.equal(mine.to, waOf(21));
    assert.equal(mine.phone_number_id, PNID);
    assert.equal(mine.type, "text");
    assert.equal(mine.text, "عندنا اليوم 4:30 م");

    await as(db, service, `select complete_whatsapp_session_delivery($1, true, 'wamid.out.1', null) r`, [queue.id]);
    assert.equal((await sys(db, `select status from message_queue where id = $1`, [queue.id]))[0].status, "sent");
    const [out] = await sys(db, `select delivery_status, wa_message_id from whatsapp_messages where id = $1`, [queue.outbound_message_id]);
    assert.deepEqual([out.delivery_status, out.wa_message_id], ["sent", "wamid.out.1"]);
    const [log] = await sys(db, `select * from message_log where queue_id = $1`, [queue.id]);
    assert.equal(log.message_body, "");
    assert.equal(log.recipient_phone, `****${waOf(21).slice(-4)}`);
    assert.equal(log.external_id, "wamid.out.1");
    await expectError(as(db, service, `select complete_whatsapp_session_delivery($1, true, 'wamid.out.2', null) r`, [queue.id]), /not being processed/);
  });
  it("recording the same turn twice queues one reply", async () => {
    const id = wamid();
    const first = await ingest(id, "hello", { wa: waOf(22) });
    const a = await turn(first.conversation_id, id, { reply: "hi there" });
    const b = await turn(first.conversation_id, id, { reply: "hi there" });
    assert.equal(a.enqueued, true);
    assert.equal(b.replay, true);
    assert.equal(await count("message_queue", "conversation_id = $1", [first.conversation_id]), 1);
  });
  it("a failed send is retried and finally recorded as failed without text", async () => {
    const id = wamid();
    const first = await ingest(id, "hello", { wa: waOf(23) });
    await turn(first.conversation_id, id, { reply: "hi" });
    const [{ id: queueId }] = await sys(db, `select id from message_queue where conversation_id = $1`, [first.conversation_id]);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sys(db, `update message_queue set scheduled_for = now() - interval '1 minute' where id = $1`, [queueId]);
      const claimed = await as(db, service, `select claim_whatsapp_session_batch(50) r`).then((x) => x[0].r);
      assert.ok(claimed.messages.some((m) => m.queue_id === queueId), `attempt ${attempt} is claimed`);
      await as(db, service, `select complete_whatsapp_session_delivery($1, false, null, 'WhatsApp API 131047') r`, [queueId]);
    }
    assert.equal((await sys(db, `select status from message_queue where id = $1`, [queueId]))[0].status, "failed");
    assert.equal((await sys(db, `select delivery_status from whatsapp_messages where conversation_id = $1 and direction = 'outbound'`, [first.conversation_id]))[0].delivery_status, "failed");
    assert.equal(await count("message_log", "queue_id = $1 and status = 'failed' and message_body = ''", [queueId]), 1);
  });
  it("a reply queued before the window closed is cancelled at send time", async () => {
    const id = wamid();
    const first = await ingest(id, "hello", { wa: waOf(24) });
    await turn(first.conversation_id, id, { reply: "hi" });
    await sys(db, `update whatsapp_conversations set last_inbound_at = now() - interval '25 hours' where id = $1`, [first.conversation_id]);
    const claimed = await as(db, service, `select claim_whatsapp_session_batch(50) r`).then((x) => x[0].r);
    assert.equal(claimed.messages.some((m) => m.text === "hi"), false);
    assert.equal((await sys(db, `select status, error_message from message_queue where conversation_id = $1`, [first.conversation_id]))[0].status, "cancelled");
    assert.equal((await sys(db, `select delivery_status from whatsapp_messages where conversation_id = $1 and direction = 'outbound'`, [first.conversation_id]))[0].delivery_status, "cancelled");
  });
  it("the service-only send commands refuse every other role", async () => {
    for (const user of [owner, customer, stranger, delegate, admin, anon]) {
      await expectError(as(db, user, `select claim_whatsapp_session_batch(5) r`), /Service role required|permission denied/);
      await expectError(as(db, user, `select complete_whatsapp_session_delivery('00000000-0000-4000-8000-000000000000', true, 'w', null) r`), /Service role required|permission denied/);
      await expectError(as(db, user, `select whatsapp_purge_expired_messages() r`), /Service role required|permission denied/);
      await expectError(as(db, user, `select whatsapp_provider_context('00000000-0000-4000-8000-000000000000', current_date) r`), /Service role required|permission denied/);
    }
  });
  it("record_turn is service-only too", async () => {
    for (const user of [owner, customer, stranger, delegate, admin, anon]) {
      await expectError(as(db, user, `select whatsapp_record_turn('00000000-0000-4000-8000-000000000000', 'w', '{}'::jsonb, 'bot', null, 'ar', null, null) r`), /Service role required|permission denied/);
    }
  });
});

describe("retention", () => {
  it("with retention unset the purge command does nothing", async () => {
    const before = await count("whatsapp_messages", "body is not null");
    await sys(db, `update whatsapp_messages set created_at = now() - interval '400 days'`);
    const r = await as(db, service, `select whatsapp_purge_expired_messages() r`).then((x) => x[0].r);
    assert.deepEqual(r, { purged: 0, reason: "retention_unset" });
    assert.equal(await count("whatsapp_messages", "body is not null"), before);
  });
  it("with retention set old bodies are blanked and the rows kept", async () => {
    await setSetting("whatsapp.message_retention_days", 30);
    const total = await count("whatsapp_messages");
    const r = await as(db, service, `select whatsapp_purge_expired_messages() r`).then((x) => x[0].r);
    assert.ok(r.purged > 0);
    // The only bodies left are replies still waiting to be sent: they are needed until the dispatcher has them.
    assert.equal(await count("whatsapp_messages", "body is not null"),
      await count("whatsapp_messages m", "m.body is not null and exists (select 1 from message_queue q where q.outbound_message_id = m.id and q.status in ('pending', 'processing'))"));
    assert.equal(await count("whatsapp_messages", "body is not null and direction = 'inbound'"), 0);
    assert.equal(await count("whatsapp_messages"), total);
    await setSetting("whatsapp.message_retention_days", null);
  });
});

describe("hand-off", () => {
  it("with the receptionist off every message waits for a person", async () => {
    await saveChannel(owner, SEED.provider1, { enabled: true, ai: false, handoff: true });
    const r = await ingest(wamid(), "أبغى حجز", { wa: waOf(30) });
    assert.equal(r.run_engine, false);
    assert.equal(r.status, "awaiting_human");
    const conv = await conversationOf(waOf(30));
    assert.equal(conv.handoff_reason, "ai_disabled");
  });
  it("with hand-off off too, the conversation stays with the bot and is not listed for a person", async () => {
    await saveChannel(owner, SEED.provider1, { enabled: true, ai: false, handoff: false });
    await ingest(wamid(), "أبغى حجز", { wa: waOf(31) });
    assert.equal((await conversationOf(waOf(31))).status, "bot");
  });
  it("the engine can ask for a person; the database honours the provider's hand-off switch", async () => {
    await saveChannel(owner, SEED.provider1, { enabled: true, ai: true, handoff: true });
    const id = wamid();
    const first = await ingest(id, "ابغى اكلم موظف", { wa: waOf(32) });
    const r = await turn(first.conversation_id, id, { status: "awaiting_human", intent: "human", reason: "human_requested", reply: null });
    assert.equal(r.status, "awaiting_human");
    assert.equal((await conversationOf(waOf(32))).handoff_reason, "human_requested");
    // Once a person has it, the receptionist stays silent on new messages.
    const next = await ingest(wamid(), "هل من أحد؟", { wa: waOf(32) });
    assert.equal(next.run_engine, false);
    assert.equal(next.status, "awaiting_human");

    await saveChannel(owner, SEED.provider1, { enabled: true, ai: true, handoff: false });
    const id2 = wamid();
    const second = await ingest(id2, "ابغى اكلم موظف", { wa: waOf(33) });
    const r2 = await turn(second.conversation_id, id2, { status: "awaiting_human", intent: "human", reason: "human_requested" });
    assert.equal(r2.status, "bot");
    await saveChannel(owner, SEED.provider1, { enabled: true, ai: true, handoff: true });
  });
  it("record_turn validates the state, status, locale and codes", async () => {
    const id = wamid();
    const first = await ingest(id, "hello", { wa: waOf(34) });
    await expectError(turn(first.conversation_id, id, { status: "closed" }), /bot or awaiting_human/);
    await expectError(turn(first.conversation_id, id, { locale: "fr" }), /locale must be ar or en/);
    await expectError(turn(first.conversation_id, id, { reason: "Not A Code" }), /short code/);
    await expectError(turn(first.conversation_id, id, { reply: "x".repeat(1501) }), /at most 1500/);
    await expectError(turn(first.conversation_id, id, { state: { blob: "x".repeat(4100) } }), /JSON object of at most 4000/);
    await expectError(turn(first.conversation_id, "wamid.unknown", {}), /Inbound message not found/);
    await expectError(turn("00000000-0000-4000-8000-000000000000", id, {}), /Conversation not found/);
  });
});

describe("row level security", () => {
  let conversationId;
  before(async () => {
    const id = wamid();
    const first = await ingest(id, "مواعيد اليوم؟", { wa: waOf(40) });
    conversationId = first.conversation_id;
    await turn(conversationId, id, { status: "awaiting_human", reason: "human_requested", intent: "human" });
  });
  const visible = (user) => as(db, user, `select id from whatsapp_conversations where id = $1`, [conversationId]).then((r) => r.length);
  const channels = (user) => as(db, user, `select id from whatsapp_channels`).then((r) => r.length);

  it("the owner and a delegate with the bookings permission read their conversations and channel", async () => {
    assert.equal(await visible(owner), 1);
    assert.equal(await visible(delegate), 1);
    assert.equal(await channels(owner), 1);
    assert.equal(await channels(delegate), 1);
  });
  it("a stranger, another provider's owner, a delegate without the permission, an administrator, a customer and anonymous see nothing", async () => {
    for (const user of [stranger, otherOwner, inventoryOnly, admin, customer]) {
      assert.equal(await visible(user), 0);
      assert.equal(await channels(user), 0);
    }
    await expectError(as(db, anon, `select id from whatsapp_conversations`), /permission denied/);
    await expectError(as(db, anon, `select id from whatsapp_channels`), /permission denied/);
  });
  it("the hash, the state and the stored address are not readable by any client, and messages are not readable directly", async () => {
    for (const user of [owner, delegate, admin]) {
      await expectError(as(db, user, `select customer_hash from whatsapp_conversations`), /permission denied/);
      await expectError(as(db, user, `select state from whatsapp_conversations`), /permission denied/);
      await expectError(as(db, user, `select * from whatsapp_conversations`), /permission denied/);
      await expectError(as(db, user, `select * from whatsapp_messages`), /permission denied/);
      await expectError(as(db, user, `select * from whatsapp_contact_addresses`), /permission denied/);
    }
    await expectError(as(db, owner, `insert into whatsapp_conversations (provider_id, channel_id, customer_hash, customer_last4) select provider_id, id, repeat('a', 64), '1234' from whatsapp_channels`), /permission denied/);
    await expectError(as(db, owner, `update whatsapp_conversations set status = 'closed'`), /permission denied/);
  });
  it("no column a provider can read reveals the customer's number or its hash", async () => {
    const wa = waOf(40);
    const rows = await as(db, owner, `select id, provider_id, channel_id, customer_last4, status, handoff_reason, locale, last_inbound_at, opted_out_at, resolved_at, created_at, updated_at
                                       from whatsapp_conversations where id = $1`, [conversationId]);
    const text = JSON.stringify(rows);
    assert.equal(text.includes(wa), false);
    assert.equal(text.includes(hashOf(wa)), false);
    assert.equal(rows[0].customer_last4, wa.slice(-4));
    const channel = JSON.stringify(await as(db, owner, `select id, provider_id, phone_number_id, display_number, enabled, ai_enabled, handoff_enabled, verified_at, last_inbound_at from whatsapp_channels`));
    assert.equal(channel.includes(hashOf(wa)), false);
    // The stored hash is a keyed digest: it is not the plain digest of the number, so it cannot be looked up in a table of numbers.
    assert.notEqual(hashOf(wa), createHash("sha256").update(wa).digest("hex"));
  });
});

describe("transcripts, manual replies and resolving", () => {
  let conv;
  before(async () => {
    await setSetting("whatsapp.session_window_hours", 24);
    const id = wamid();
    const first = await ingest(id, "ابغى اكلم موظف عن العروسة", { wa: waOf(50) });
    conv = first.conversation_id;
    await turn(conv, id, { status: "awaiting_human", reason: "human_requested", intent: "human" });
  });
  const open = (user, id = conv) => as(db, user, `select provider_open_whatsapp_conversation($1) r`, [id]).then((r) => r[0].r);
  const reply = (user, text, key, id = conv) => as(db, user, `select provider_send_whatsapp_reply($1, $2, $3) r`, [id, text, key]).then((r) => r[0].r);

  it("opening a transcript is an audited read, allowed to the owner and the delegate", async () => {
    const before = await count("admin_audit_logs", "action = 'whatsapp.transcript_read'");
    const result = await open(owner);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].body, "ابغى اكلم موظف عن العروسة");
    assert.equal(result.conversation.customer_last4, waOf(50).slice(-4));
    assert.equal(result.can_reply, true);
    const text = JSON.stringify(result);
    assert.equal(text.includes(waOf(50)), false);
    assert.equal(text.includes(hashOf(waOf(50))), false);
    await open(delegate);
    assert.equal(await count("admin_audit_logs", "action = 'whatsapp.transcript_read'"), before + 2);
    const audit = await sys(db, `select details from admin_audit_logs where action = 'whatsapp.transcript_read' order by created_at desc limit 1`);
    assert.equal(JSON.stringify(audit).includes("موظف"), false, "the audit entry carries no message text");
  });
  it("everyone else is told the conversation does not exist", async () => {
    for (const user of [stranger, otherOwner, inventoryOnly, admin, customer]) {
      await expectError(open(user), /Conversation not found/);
      await expectError(reply(user, "hello", "key-12345678"), /Conversation not found/);
      await expectError(as(db, user, `select provider_resolve_whatsapp_conversation($1) r`, [conv]), /Conversation not found/);
    }
    await expectError(open(anon), /permission denied/);
    await expectError(reply(anon, "hello", "key-12345678"), /permission denied/);
    await expectError(as(db, anon, `select provider_resolve_whatsapp_conversation($1) r`, [conv]), /permission denied/);
    await expectError(open(owner, "00000000-0000-4000-8000-000000000000"), /Conversation not found/);
  });
  it("a manual reply goes through the queue, once per idempotency key", async () => {
    const first = await reply(delegate, "أهلا، موعدك مؤكد", "manual-key-0001");
    assert.equal(first.enqueued, true);
    const second = await reply(delegate, "أهلا، موعدك مؤكد", "manual-key-0001");
    assert.equal(second.replay, true);
    assert.equal(await count("message_queue", "conversation_id = $1", [conv]), 1);
    assert.equal((await sys(db, `select status from whatsapp_conversations where id = $1`, [conv]))[0].status, "awaiting_human");
    const transcript = await open(owner);
    assert.equal(transcript.messages.at(-1).sender, "provider");
    assert.equal(await count("admin_audit_logs", "action = 'whatsapp.manual_reply'"), 1);
  });
  it("validates the text and the key", async () => {
    await expectError(reply(owner, "   ", "key-12345678"), /between 1 and 1000/);
    await expectError(reply(owner, "x".repeat(1001), "key-12345678"), /between 1 and 1000/);
    await expectError(reply(owner, "hello", "short"), /idempotency key/);
  });
  it("refuses to reply outside the window or after an opt-out", async () => {
    await sys(db, `update whatsapp_conversations set last_inbound_at = now() - interval '30 hours' where id = $1`, [conv]);
    await expectError(reply(owner, "hello", "key-window-0001"), /window_closed/);
    assert.equal((await open(owner)).can_reply, false);
    await sys(db, `update whatsapp_conversations set last_inbound_at = now() where id = $1`, [conv]);
    await ingest(wamid(), "STOP", { wa: waOf(50) });
    await expectError(reply(owner, "hello", "key-optout-0001"), /opted_out/);
    await ingest(wamid(), "START", { wa: waOf(50) });
  });
  it("resolving closes the conversation, erases the address, and repeating it is harmless", async () => {
    const result = await as(db, delegate, `select provider_resolve_whatsapp_conversation($1) r`, [conv]).then((r) => r[0].r);
    assert.equal(result.status, "closed");
    assert.equal(await count("whatsapp_contact_addresses", "conversation_id = $1", [conv]), 0);
    const again = await as(db, owner, `select provider_resolve_whatsapp_conversation($1) r`, [conv]).then((r) => r[0].r);
    assert.equal(again.replay, true);
    assert.equal(await count("admin_audit_logs", "action = 'whatsapp.conversation_resolved' and target_id = $1", [conv]), 1);
    await expectError(reply(owner, "hello", "key-closed-0001"), /no_address/);
    await setSetting("whatsapp.session_window_hours", null);
  });
});

describe("administrator overview", () => {
  it("returns counts and pending channels only, never customer data", async () => {
    const overview = await as(db, admin, `select admin_whatsapp_overview() r`).then((r) => r[0].r);
    assert.ok(overview.conversations.total > 0);
    assert.ok(overview.channels.total === 1);
    const text = JSON.stringify(overview);
    assert.equal(text.includes("customer"), false);
    assert.equal(text.includes(hashOf(waOf(1))), false);
    assert.deepEqual(Object.keys(overview).sort(), ["channels", "conversations", "messages_7d", "pending_channels", "settings"]);
  });
  it("is refused to every other role", async () => {
    for (const user of [owner, otherOwner, customer, stranger, delegate, service]) {
      await expectError(as(db, user, `select admin_whatsapp_overview() r`), /Administrator access required/);
    }
    await expectError(as(db, anon, `select admin_whatsapp_overview() r`), /permission denied/);
  });
});

describe("the receptionist's view of the business", () => {
  it("lists active services, branches and the next seven days of hours from the database", async () => {
    const [{ id }] = await sys(db, `select id from whatsapp_channels`);
    const ctx = await as(db, service, `select whatsapp_provider_context($1, current_date) r`, [id]).then((r) => r[0].r);
    assert.equal(ctx.provider.id, SEED.provider1);
    assert.ok(ctx.services.length > 0);
    assert.ok(ctx.services.every((s) => s.id && s.name_ar && s.name_en && typeof s.price === "number" || typeof s.price === "string"));
    assert.ok(ctx.branches.length > 0);
    assert.equal(ctx.branches[0].hours.length, 7);
    assert.equal(ctx.public_app_url, null, "no base URL until the owner sets public_app_url");
    await expectError(as(db, service, `select whatsapp_provider_context('00000000-0000-4000-8000-000000000000', current_date) r`), /Channel not found/);
    await sys(db, `update platform_settings set value = '"https://primora.example"'::jsonb where key = 'public_app_url'`);
    const withUrl = await as(db, service, `select whatsapp_provider_context($1, current_date) r`, [id]).then((r) => r[0].r);
    assert.equal(withUrl.public_app_url, "https://primora.example");
    await sys(db, `update platform_settings set value = 'null'::jsonb where key = 'public_app_url'`);
  });
});

describe("end to end: the real rules engine on the migrated schema", () => {
  it("answers an Arabic booking request with real free times and the booking link, then hands the reply to the dispatcher", async () => {
    await setSetting("whatsapp.session_window_hours", 24);
    await sys(db, `update platform_settings set value = '"https://primora.example"'::jsonb where key = 'public_app_url'`);
    const date = await nextWorkingDate(db, SEED.employee1, 3);
    const [svc] = await sys(db, `select s.id, s.name_ar from services s join employee_services es on es.service_id = s.id
                                  where es.employee_id = $1 and s.provider_id = $2 and s.is_active order by s.id limit 1`, [SEED.employee1, SEED.provider1]);
    const text = `أبغى حجز ${svc.name_ar} ${date}`;
    const wa = waOf(77);
    const id = wamid();
    const ingested = await ingest(id, text, { wa });
    assert.equal(ingested.run_engine, true);

    const raw = await as(db, service, `select whatsapp_provider_context($1, $2::date) r`, [ingested.channel_id, riyadhYmd(new Date())]).then((r) => r[0].r);
    const context = toEngineContext(raw);
    const calls = [];
    const port = {
      async slots(q) {
        calls.push(q);
        const rows = await as(db, service, `select slot_start from get_branch_available_slots($1, $2, $3::date, $4::timestamptz[], $5::timestamptz[])`,
          [q.branchId, q.serviceId, q.ymd, q.prayerWindows.starts, q.prayerWindows.ends]);
        return rows.map((r) => new Date(r.slot_start).toISOString());
      },
    };
    const result = await respond({ text, now: new Date(), state: ingested.state, previousLocale: "ar", context }, port, makeAdhanClock(adhan));

    assert.equal(result.intent, "booking");
    assert.equal(result.status, "bot");
    assert.equal(result.state.service_id, svc.id);
    assert.ok(calls.length > 0 && calls.every((c) => c.prayerWindows.starts.length === 6), "every lookup carried the shop's six prayer windows");
    const offered = result.state.date;
    assert.ok(result.reply.includes(`https://primora.example/shop/${SEED.provider1}?service=${svc.id}&date=${offered}&src=whatsapp`), result.reply);
    const lines = result.reply.split("\n").filter((l) => l.startsWith("• "));
    assert.ok(lines.length >= 1 && lines.length <= 3, result.reply);

    // Every option is a start time the database itself lists for that day (so it is bookable and outside the prayer pauses).
    const listed = new Set((await port.slots({ branchId: context.branches[0].id, serviceId: svc.id, ymd: offered,
      prayerWindows: calls.find((c) => c.ymd === offered).prayerWindows })).map((iso) => riyadhMinutes(new Date(iso))));
    for (const line of lines) {
      const m = /(\d{1,2}):(\d{2}) (ص|م)/.exec(line);
      assert.ok(m, line);
      const minutes = ((Number(m[1]) % 12) + (m[3] === "م" ? 12 : 0)) * 60 + Number(m[2]);
      assert.ok(listed.has(minutes), `${line} is a time the database lists`);
    }
    const bookingsBefore = await count("bookings");

    const turned = await turn(ingested.conversation_id, id, { state: result.state, status: result.status, intent: result.intent, locale: result.locale, reply: result.reply });
    assert.equal(turned.enqueued, true);
    const claimed = await as(db, service, `select claim_whatsapp_session_batch(50) r`).then((r) => r[0].r);
    const mine = claimed.messages.find((m) => m.conversation_id === ingested.conversation_id);
    assert.equal(mine.text, result.reply);
    assert.equal(mine.to, wa);
    await as(db, service, `select complete_whatsapp_session_delivery($1, true, 'wamid.e2e.1', null) r`, [mine.queue_id]);

    // The receptionist never books and never takes payment.
    assert.equal(await count("bookings"), bookingsBefore);
    await sys(db, `update platform_settings set value = 'null'::jsonb where key = 'public_app_url'`);
    await setSetting("whatsapp.session_window_hours", null);
  });
});
