import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";

// P-05 / RT-L1 (red team 2026-10-17): an unverified WhatsApp claim no longer holds a number, verification evicts squatters,
// and providers cannot register reserved platform promo-code names.
let db;
let operations;
const real = ROLES.user(SEED.owner1);
const squatter = ROLES.user(SEED.owner2);
const PNID = "109876543210987";
const save = (user, provider, pnid = PNID, enabled = true) =>
  as(db, user, `select provider_save_whatsapp_channel($1, $2, '+966 50 000 0000', $3, false, true) r`, [provider, pnid, enabled]).then((r) => r[0].r);
const verify = (id) => as(db, operations, `select admin_set_whatsapp_channel_verified($1, true, 'checked in Meta Business Manager') r`, [id]).then((r) => r[0].r);
const one = async (sql, params = []) => (await sys(db, sql, params))[0];
const hashOf = (wa) => createHash("sha256").update(`pepper:${wa}`).digest("hex");

before(async () => {
  db = await createMigratedDb();
  operations = ROLES.user(await createUser(db, { role: "admin", adminRole: "operations" }));
});

describe("P-05 WhatsApp number squatting", () => {
  let squat;
  let mine;
  it("an unverified squat does not stop the real business from saving its number", async () => {
    squat = await save(squatter, SEED.provider2);
    mine = await save(real, SEED.provider1);
    assert.equal(squat.verified_at, null);
    assert.equal(mine.verified_at, null);
  });

  it("an unverified channel is never routed, even with several claims on the number", async () => {
    const r = (await as(db, ROLES.service, `select whatsapp_ingest_message($1, $2, '966501234567', 'wamid.p05.1', 'hi', 'text', null) r`,
      [PNID, hashOf("966501234567")]))[0].r;
    assert.equal(r.routed, false);
  });

  it("verifying the real business evicts the squatter, tells its owner, and routes to the verified channel", async () => {
    const v = await verify(mine.id);
    assert.ok(v.verified_at);
    const s = await one(`select enabled, ai_enabled, verified_at from whatsapp_channels where id = $1`, [squat.id]);
    assert.deepEqual([s.enabled, s.ai_enabled, s.verified_at], [false, false, null]);
    assert.ok((await one(`select count(*)::int n from notifications where user_id = $1 and data->>'reason' = 'whatsapp_number_verified_elsewhere'`, [SEED.owner2])).n >= 1);
    const audit = await one(`select details from admin_audit_logs where action = 'whatsapp.channel_verification' and target_id = $1 order by created_at desc limit 1`, [mine.id]);
    assert.equal(audit.details.unverified_claims_evicted, 1);
    const r = (await as(db, ROLES.service, `select whatsapp_ingest_message($1, $2, '966501234567', 'wamid.p05.2', 'hi', 'text', null) r`,
      [PNID, hashOf("966501234567")]))[0].r;
    assert.equal(r.routed, true);
    assert.equal((await one(`select provider_id from whatsapp_conversations where id = $1`, [r.conversation_id])).provider_id, SEED.provider1);
  });

  it("once verified, the number is refused to every other business, and cannot be verified twice", async () => {
    await expectError(save(squatter, SEED.provider2), /already connected to another business/);
    await expectError(verify(squat.id), /already holds this number verified/);
    await expectError(sys(db, `update whatsapp_channels set verified_at = now() where id = $1`, [squat.id]), /unique|duplicate/);
  });

  it("the owner of the verified channel keeps it when saving again", async () => {
    const again = await save(real, SEED.provider1);
    assert.ok(again.verified_at, "same number, verification kept");
  });
});

describe("RT-L1 reserved promo-code names", () => {
  const create = (code) => as(db, real, `select create_provider_promo_code($1, $2, 'percentage', 10) r`, [SEED.provider1, code]).then((r) => r[0].r);
  it("refuses reserved names and the platform prefix with the same answer as a taken code", async () => {
    for (const code of ["RAMADAN", "ramadan", "EID2026", "PRIMORA", "PRIMORA50", "primora-vip", "NATIONALDAY"]) {
      await expectError(create(code), /This code cannot be used\. Choose another/);
    }
    assert.equal((await one(`select count(*)::int n from promotional_codes where provider_id = $1`, [SEED.provider1])).n, 0);
  });
  it("accepts an ordinary provider code, and the platform can still create a reserved one", async () => {
    assert.equal((await create("ELITE20")).code, "ELITE20");
    await sys(db, `insert into promotional_codes (code, discount_type, discount_value, is_active, funding_source) values ('RAMADAN', 'percentage', 10, true, 'platform')`);
  });
  it("the reserved-name check is not a client endpoint", async () => {
    await expectError(as(db, real, `select promo_code_reserved_for_platform('RAMADAN')`), /permission denied/);
  });
});
