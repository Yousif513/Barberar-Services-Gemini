import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PRIV P-06: message bodies are deleted after STOP and when the salon resolves a conversation.
let db;
let admin;
const owner = ROLES.user(SEED.owner1);
const PNID = "109876543210987";
const PEPPER = "test-pepper";
const waOf = (n) => `96650${String(1000000 + n)}`;
const hashOf = (wa) => createHash("sha256").update(`${PEPPER}:${wa}`).digest("hex");
let counter = 0;
const wamid = () => `wamid.fixpriv.${(counter += 1)}`;
const ingest = (body, wa) =>
  as(db, ROLES.service, `select whatsapp_ingest_message($1, $2, $3, $4, $5, 'text', null) r`, [PNID, hashOf(wa), wa, wamid(), body]).then((r) => r[0].r);
const bodies = async (conversation) => (await sys(db, `select body from whatsapp_messages where conversation_id = $1 order by created_at, id`, [conversation])).map((r) => r.body);

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  const channel = (await as(db, owner, `select provider_save_whatsapp_channel($1, $2, '+966 50 000 0000', true, true, true) r`, [SEED.provider1, PNID]))[0].r;
  await as(db, admin, `select admin_set_whatsapp_channel_verified($1, true, 'checked in the Meta business manager') r`, [channel.id]);
});

describe("P-06 message bodies", () => {
  it("are deleted after the customer writes STOP, and the owner then reads no text", async () => {
    const wa = waOf(11);
    const first = await ingest("I want to book a haircut", wa);
    assert.deepEqual(await bodies(first.conversation_id), ["I want to book a haircut"]);
    const stop = await ingest("STOP", wa);
    assert.equal(stop.opted_out, true);
    assert.deepEqual(await bodies(stop.conversation_id), [null, null]);
    const transcript = (await as(db, owner, `select provider_open_whatsapp_conversation($1) r`, [stop.conversation_id]))[0].r;
    assert.ok(!JSON.stringify(transcript).includes("haircut"));
    assert.equal(transcript.messages.length, 2, "the log of messages stays, without text");
    assert.equal((await sys(db, `select count(*)::int n from whatsapp_contact_addresses where conversation_id = $1`, [stop.conversation_id]))[0].n, 0);
  });
  it("are deleted when the salon resolves the conversation, and not before", async () => {
    const wa = waOf(12);
    const first = await ingest("Do you have time on Friday?", wa);
    assert.deepEqual(await bodies(first.conversation_id), ["Do you have time on Friday?"]);
    await as(db, owner, `select provider_resolve_whatsapp_conversation($1) r`, [first.conversation_id]);
    assert.deepEqual(await bodies(first.conversation_id), [null]);
  });
  it("leave other conversations alone", async () => {
    const other = await ingest("Another customer asks something", waOf(13));
    await ingest("STOP", waOf(14));
    assert.deepEqual(await bodies(other.conversation_id), ["Another customer asks something"]);
  });
  it("cannot be blanked by a client: the helper is internal", async () => {
    for (const user of [owner, admin, ROLES.anon]) {
      await assert.rejects(as(db, user, `select whatsapp_blank_conversation_bodies(gen_random_uuid())`), /permission denied/);
    }
  });
  it("keeps the retention setting unset", async () => {
    assert.equal((await sys(db, `select value from platform_settings where key = 'whatsapp.message_retention_days'`))[0].value, null);
  });
});
