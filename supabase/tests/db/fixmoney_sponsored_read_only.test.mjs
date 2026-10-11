// FIX-MONEY: M-12 of docs/reviews/2026-10-08-security-money.md. The anonymous placement search writes nothing.
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, SEED, sys } from "./harness.mjs";
import { setPlatformSetting } from "./gov1_fixtures.mjs";

const owner1 = ROLES.user(SEED.owner1);
let db;
let admin;
let campaign;

before(async () => {
  db = await createMigratedDb();
  admin = ROLES.user(await createUser(db, { role: "admin" }));
  const set = (key, value) => setPlatformSetting(db, admin, key, value, "fixmoney sponsored setup");
  await set("sponsored.price_per_new_client_sar", 25.5);
  await set("sponsored.max_slots_per_search", 3);
  await set("sponsored.attribution_window_days", 14);
  await set("sponsored.enabled", true);
  campaign = (await as(db, owner1, `select create_sponsored_campaign($1, null, null, null, 100, null, null, 'launch the campaign') r`, [SEED.provider1]))[0].r.campaign_id;
  await as(db, owner1, `select set_sponsored_campaign_status($1, 'active', 'go live') r`, [campaign]);
});

const stamp = async () => (await sys(db, `select last_shown_at from sponsored_campaigns where id = $1`, [campaign]))[0].last_shown_at;

describe("M-12: sponsored placement reads", () => {
  it("get_sponsored_placements returns the campaign and writes nothing, for anonymous and signed-in callers", async () => {
    const versionBefore = (await sys(db, `select xmin::text x from sponsored_campaigns where id = $1`, [campaign]))[0].x;
    for (const who of [ROLES.anon, ROLES.user(SEED.customer), owner1]) {
      const r = (await as(db, who, `select get_sponsored_placements(null, null, 3) r`))[0].r;
      assert.equal(r.placements.length, 1);
    }
    assert.equal(await stamp(), null, "no rotation stamp from a read");
    assert.equal((await sys(db, `select xmin::text x from sponsored_campaigns where id = $1`, [campaign]))[0].x, versionBefore, "the row was not even rewritten");
  });

  it("a recorded click moves the campaign in the rotation; a rate-limited repeat does not", async () => {
    const customer = ROLES.user(SEED.customer);
    const first = (await as(db, customer, `select record_sponsored_click($1) r`, [campaign]))[0].r;
    assert.equal(first.recorded, true);
    const t1 = await stamp();
    assert.ok(t1);
    const again = (await as(db, customer, `select record_sponsored_click($1) r`, [campaign]))[0].r;
    assert.equal(again.recorded, false);
    assert.equal((await stamp()).toISOString(), t1.toISOString());
  });

  it("record_sponsored_impressions is for the service role only and validates its input", async () => {
    for (const who of [ROLES.anon, ROLES.user(SEED.customer), owner1, admin]) {
      await assert.rejects(as(db, who, `select record_sponsored_impressions(array[$1]::uuid[])`, [campaign]), /permission denied|Service role/, "caller must be refused");
    }
    await expectError(as(db, ROLES.service, `select record_sponsored_impressions(array[]::uuid[])`), /between 1 and 50/);
    assert.equal((await as(db, ROLES.service, `select record_sponsored_impressions(array[$1]::uuid[]) n`, [campaign]))[0].n, 1);
  });
});

describe("M-13: the sponsored new-client decision is serialised per (provider, customer)", () => {
  it("takes an advisory lock on provider and customer before deciding (a two-session race cannot be run on PGlite)", async () => {
    const def = (await sys(db, `select pg_get_functiondef('public.sponsored_attribute_completed_booking()'::regprocedure) d`))[0].d.replace(/\r/g, "");
    const lock = def.indexOf("sponsored-new-client:");
    assert.ok(lock > 0);
    assert.ok(lock < def.indexOf("v_new := NOT EXISTS"), "the lock precedes the decision");
  });
});
