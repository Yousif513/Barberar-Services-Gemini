// FIX-BOOKING item 7f (D14 / C-D14): activating a gift card queues the "gift card received" message for a reachable recipient.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

let db;
let buyer;
let friend;
let loner;
let intent = 0;

const purchase = (user, phone, { name = "Noura", message = "Happy birthday!", amount = 200 } = {}) =>
  as(db, user, `select purchase_gift_card($1, $2, null, $3, $4) r`, [name, phone, amount, message]).then((r) => r[0].r);
const pay = (card) => as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, $2, $3) r`,
  [card.purchase_id, `pi_gift_${(intent += 1)}`, card.amount_sar]).then((r) => r[0].r);
const cardRow = async (id) => (await sys(db, `select * from gift_cards where id = $1`, [id]))[0];
const queued = (recipientId) => sys(db, `select * from message_queue where recipient_id = $1 and template_name = 'gift_card_received' order by created_at`, [recipientId]);

before(async () => {
  db = await createMigratedDb();
  buyer = ROLES.user(await createUser(db, { phone: "+966500300001", verified: true }));
  await sys(db, `update profiles set first_name = 'Salem', last_name = 'Al-Otaibi' where id = $1`, [buyer.sub]);
  friend = ROLES.user(await createUser(db, { phone: "+966500300002", verified: true }));
  await sys(db, `update profiles set language_preference = 'en' where id = $1`, [friend.sub]);
  loner = ROLES.user(await createUser(db));
});

describe("gift card received message (D14 / C-D14)", () => {
  it("has bilingual transactional templates whose parameters follow their placeholders", async () => {
    const rows = await sys(db, `select locale, is_transactional, provider_template_name, body_param_keys, template_body from message_templates where name = 'gift_card_received' order by locale`);
    assert.deepEqual(rows.map((r) => r.locale), ["ar", "en"]);
    for (const r of rows) {
      assert.equal(r.is_transactional, true);
      assert.equal(r.provider_template_name, "primora_gift_card_received");
      const placeholders = [...r.template_body.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]);
      assert.deepEqual(r.body_param_keys, placeholders);
    }
  });

  it("queues nothing while the card is unpaid, and the message once the payment activates it (reproduced: nothing was ever queued)", async () => {
    const card = await purchase(buyer, "0500300002");
    assert.equal((await queued(friend.sub)).length, 0, "an unpaid card sends nothing");
    assert.equal((await cardRow(card.purchase_id)).recipient_notice_status, null);
    await pay(card);
    const msgs = await queued(friend.sub);
    assert.equal(msgs.length, 1);
    const m = msgs[0];
    assert.deepEqual([m.channel, m.status, m.locale, m.recipient_phone], ["whatsapp", "pending", "en", "+966500300002"]);
    const code = (await cardRow(card.purchase_id)).code;
    assert.deepEqual(m.variables, {
      recipient_name: "Noura", sender_name: "Salem Al-Otaibi", amount: "200.00", gift_code: code,
      expires_date: m.variables.expires_date, gift_message: "Happy birthday!",
    });
    assert.match(m.variables.expires_date, /^\d{4}-\d{2}-\d{2}$/);
    const row = await cardRow(card.purchase_id);
    assert.deepEqual([row.recipient_notice_status, row.recipient_notice_queue_id], ["queued", m.id]);
    assert.ok(row.recipient_notice_queued_at);
  });

  it("is queued once: a second confirmation of the same payment adds nothing", async () => {
    const card = await purchase(buyer, "+966500300002", { message: "" });
    const first = await pay(card);
    assert.equal(first.status, "activated");
    const again = await as(db, ROLES.service, `select confirm_purchase_payment('gift_card', $1, $2, $3) r`, [card.purchase_id, `pi_gift_${intent}`, card.amount_sar]).then((r) => r[0].r);
    assert.equal(again.status, "already_recorded");
    const msgs = (await queued(friend.sub)).filter((x) => x.variables.amount === "200.00");
    assert.equal(msgs.length, 2, "one message per paid card (this test and the previous one)");
    assert.equal(msgs.at(-1).variables.gift_message, "-", "an empty sender message becomes a dash");
  });

  it("marks a recipient who has no verified account as not reachable and queues nothing", async () => {
    const card = await purchase(buyer, "0555999888");
    await pay(card);
    const row = await cardRow(card.purchase_id);
    assert.equal(row.recipient_notice_status, "not_reachable");
    assert.equal(row.recipient_notice_queue_id, null);
    assert.equal((await sys(db, `select count(*)::int n from message_queue where template_name = 'gift_card_received' and recipient_phone like '%555999888'`))[0].n, 0);
  });

  it("an unverified phone does not count as the recipient", async () => {
    await sys(db, `update profiles set phone_number = '+966500300003', phone_verified = false where id = $1`, [loner.sub]);
    const card = await purchase(buyer, "+966500300003");
    await pay(card);
    assert.equal((await cardRow(card.purchase_id)).recipient_notice_status, "not_reachable");
  });

  it("truncates a very long sender message", async () => {
    const card = await purchase(buyer, "+966500300002", { message: "x".repeat(1000), amount: 100 });
    await pay(card);
    const m = (await queued(friend.sub)).find((x) => x.variables.amount === "100.00");
    assert.equal(m.variables.gift_message.length, 300);
  });

  it("the trigger function is internal", async () => {
    const r = await sys(db, `select has_function_privilege('authenticated', 'public.enqueue_gift_card_received()'::regprocedure, 'EXECUTE') a,
                                    has_function_privilege('anon', 'public.enqueue_gift_card_received()'::regprocedure, 'EXECUTE') b`);
    assert.deepEqual([r[0].a, r[0].b], [false, false]);
    await expectError(as(db, buyer, `select enqueue_gift_card_received()`), /permission denied/);
  });
});
