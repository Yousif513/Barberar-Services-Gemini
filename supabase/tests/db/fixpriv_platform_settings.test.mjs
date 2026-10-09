import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, ROLES, SEED, sys } from "./harness.mjs";

// FIX-PRIV P-09: platform_settings is public only for an allow-list of keys.
let db;
let customer;
let admin;
const owner = ROLES.user(SEED.owner1);

before(async () => {
  db = await createMigratedDb();
  customer = ROLES.user(await createUser(db, { role: "customer" }));
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

const keys = async (user) => (await as(db, user, `select key from platform_settings`)).map((r) => r.key);

describe("P-09 platform_settings", () => {
  it("defaults a new key to private", async () => {
    await sys(db, `insert into platform_settings (key, value) values ('future.secret', '{"token": "x"}')`);
    assert.equal((await sys(db, `select is_public from platform_settings where key = 'future.secret'`))[0].is_public, false);
    for (const user of [ROLES.anon, customer, owner]) assert.ok(!(await keys(user)).includes("future.secret"));
    assert.ok((await keys(admin)).includes("future.secret"));
  });
  it("keeps the keys the screens read public for visitors and signed-in users", async () => {
    for (const user of [ROLES.anon, customer, owner]) {
      const got = await keys(user);
      for (const k of ["loyalty_program", "whatsapp.session_window_hours", "api.max_requests_per_minute"]) assert.ok(got.includes(k), k);
    }
  });
  it("hides policy and retention keys from everyone but administrators", async () => {
    for (const user of [ROLES.anon, customer, owner]) {
      const got = await keys(user);
      for (const k of ["no_show_strike_policy", "intake.retention_days", "whatsapp.message_retention_days", "sponsored.enabled"]) assert.ok(!got.includes(k), k);
    }
    const all = await keys(admin);
    for (const k of ["no_show_strike_policy", "intake.retention_days"]) assert.ok(all.includes(k), k);
  });
  it("still lets the database functions read private keys (no_show policy drives eligibility)", async () => {
    const r = (await as(db, customer, `select check_customer_booking_eligibility($1, $2) r`, [SEED.provider1, customer.sub]))[0].r;
    assert.equal(typeof r.requires_full_prepayment, "boolean");
  });
});
