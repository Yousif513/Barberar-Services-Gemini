import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { as, createMigratedDb, createUser, expectError, ROLES, sys } from "./harness.mjs";

// ADM1: the admin screen for the five api.* settings sends whole numbers through admin_set_api_setting and reads them back from
// platform_settings. The command and the settings come from the developer API migrations (branch wp/api); on a branch that does
// not carry them yet this file skips itself and runs after the merge.
let db;
let admin;
let present = false;
const KEYS = ["api.max_requests_per_minute", "api.max_key_lifetime_days", "api.webhook_max_attempts", "api.webhook_retry_base_seconds", "api.webhook_disable_after_failures"];

before(async () => {
  db = await createMigratedDb();
  present = (await sys(db, `select to_regprocedure('public.admin_set_api_setting(text, jsonb, text)') is not null as p`))[0].p;
  admin = ROLES.user(await createUser(db, { role: "admin" }));
});

describe("api settings screen contract", () => {
  it("lists the five settings to administrators and changes one with a reason", async (t) => {
    if (!present) return t.skip("admin_set_api_setting is not in this branch's migrations");
    const rows = await as(db, admin, `select key, value from platform_settings where key = any($1::text[]) order by key`, [KEYS]);
    assert.equal(rows.length, 5);
    assert.ok(rows.every((row) => row.value === null || typeof row.value === "number"), "unset reads as JSON null");
    await as(db, admin, `select admin_set_api_setting($1, $2::jsonb, $3)`, ["api.max_requests_per_minute", "600", "Owner decision recorded"]);
    assert.equal(Number((await as(db, admin, `select value from platform_settings where key = 'api.max_requests_per_minute'`))[0].value), 600);
    await expectError(as(db, admin, `select admin_set_api_setting($1, $2::jsonb, $3)`, ["api.max_requests_per_minute", "0", "Too low"]), /between 1 and 1000000/);
  });
});
