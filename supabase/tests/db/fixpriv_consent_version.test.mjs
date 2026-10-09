import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, sys } from "./harness.mjs";

// FIX-PRIV P-11: the notice version on a consent row is the published one, never the client's claim.
let db;
let alice;
const stored = async (purpose) => (await sys(db, `select document_version v from consents where user_id = $1 and purpose = $2 order by created_at desc, id desc limit 1`, [alice.sub, purpose]))[0].v;

before(async () => {
  db = await createMigratedDb();
  alice = ROLES.user(await createUser(db, { role: "customer" }));
});

describe("P-11 consent notice version", () => {
  it("records 'unpublished' while no notice is published, ignoring what the client claims", async () => {
    await as(db, alice, `select record_consent('marketing', 'granted', 'v9.9', 'web_form')`);
    assert.equal(await stored("marketing"), "unpublished");
    await as(db, alice, `select record_consent('terms_privacy', 'granted', 'v9.9', 'web_form')`);
    assert.equal(await stored("terms_privacy"), "unpublished");
  });
  it("records the published privacy notice for every purpose but the terms, and the published terms for terms_privacy", async () => {
    await sys(db, `update legal_agreements set version = 'v2.1', status = 'published', published_at = now() where agreement_key = 'privacy_notice'`);
    await sys(db, `update legal_agreements set version = 'v3.0', status = 'published', published_at = now() where agreement_key = 'customer_terms'`);
    for (const purpose of ["whatsapp", "marketing", "photos_portfolio", "data_processing", "health_data"]) {
      await as(db, alice, `select record_consent($1, 'granted', 'v0.1', 'settings_toggle')`, [purpose]);
      assert.equal(await stored(purpose), "v2.1", purpose);
    }
    await as(db, alice, `select record_consent('terms_privacy', 'granted', 'v0.1', 'web_form')`);
    assert.equal(await stored("terms_privacy"), "v3.0");
  });
  it("applies to withdrawals and to the batch command too", async () => {
    await as(db, alice, `select record_consent('marketing', 'withdrawn', 'v0.1', 'settings_toggle')`);
    assert.equal(await stored("marketing"), "v2.1");
    await as(db, alice, `select record_consents(array['whatsapp'], 'granted', 'v0.1', 'web_auth_form')`);
    assert.equal(await stored("whatsapp"), "v2.1");
  });
  it("still refuses a bad purpose, an anonymous caller, and a malformed version or method", async () => {
    await assert.rejects(as(db, alice, `select record_consent('nonsense', 'granted', 'v1.0', 'web_form')`), /Invalid consent purpose/);
    await assert.rejects(as(db, ROLES.anon, `select record_consent('marketing', 'granted', 'v1.0', 'web_form')`), /permission denied/);
    await assert.rejects(as(db, alice, `select record_consent('marketing', 'granted', 'bad version!', 'web_form')`), /Invalid document version/);
    await assert.rejects(as(db, alice, `select record_consent('marketing', 'granted', 'v1.0', 'Bad Method')`), /Invalid consent method/);
  });
});
