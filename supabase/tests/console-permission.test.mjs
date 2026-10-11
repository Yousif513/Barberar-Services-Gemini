import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../functions/_shared/console-permission.ts";

// GOV-FIX H-1: a service-key Edge Function lets a console caller act only with the permission its action needs. Before the fix,
// wathq-verify, dispatch-messages and deliver-webhooks accepted any console role (analyst included).

// The database's answer for a session holding exactly these permissions (stands in for admin_can over PostgREST).
const session = (...held) => {
  const asked = [];
  const permitted = async (permission) => { asked.push(permission); return held.includes(permission); };
  return { permitted, asked };
};

describe("consoleCallerDecision", () => {
  it("refuses an analyst or finance console session for wathq-verify and lets operations through", async () => {
    const permission = FUNCTION_PERMISSIONS["wathq-verify"];
    assert.equal(permission, "operations.write");
    const analyst = session();
    const decision = await consoleCallerDecision("admin", false, permission, analyst.permitted);
    assert.deepEqual([decision.allowed, decision.status], [false, 403]);
    assert.deepEqual(analyst.asked, ["operations.write"], "the database is asked for the exact permission");
    assert.equal((await consoleCallerDecision("admin", false, permission, session("money.payout", "money.ledger").permitted)).allowed, false);
    assert.equal((await consoleCallerDecision("admin", false, permission, session("operations.write").permitted)).allowed, true);
  });

  it("never lets the scheduler run wathq-verify, but lets it run the queue functions", async () => {
    const never = async () => { throw new Error("the service key is decided without asking the database"); };
    assert.deepEqual(await consoleCallerDecision("service", false, "operations.write", never), { allowed: false, status: 403, error: "Administrative access required." });
    assert.deepEqual(await consoleCallerDecision("service", true, "operations.write", never), { allowed: true });
  });

  it("refuses signed-in non-administrators (403) and missing credentials (401) without asking the database", async () => {
    const never = async () => { throw new Error("not asked"); };
    assert.equal((await consoleCallerDecision("user", true, "settings.manage", never)).status, 403);
    assert.equal((await consoleCallerDecision(null, true, "settings.manage", never)).status, 401);
  });

  it("deliver-webhooks needs settings.manage: operations alone is refused", async () => {
    const permission = FUNCTION_PERMISSIONS["deliver-webhooks"];
    assert.equal(permission, "settings.manage");
    assert.equal((await consoleCallerDecision("admin", true, permission, session("operations.write").permitted)).allowed, false);
    assert.equal((await consoleCallerDecision("admin", true, permission, session("settings.manage").permitted)).allowed, true);
  });

  it("each guarded function routes its caller through the decision with its own permission", () => {
    for (const [name, allowService] of [["wathq-verify", false], ["dispatch-messages", true], ["deliver-webhooks", true]]) {
      const code = readFileSync(new URL(`../functions/${name}/index.ts`, import.meta.url), "utf8");
      assert.ok(code.includes(`consoleCallerDecision(caller?.kind ?? null, ${allowService}, FUNCTION_PERMISSIONS["${name}"]`), `${name} uses its permission`);
      assert.ok(code.includes("adminSessionAllows(bearerToken(req), permission)"), `${name} asks the database with the caller's token`);
      assert.ok(!/caller\.kind (!==|===) "(admin|user)"\)? return/.test(code), `${name} has no bare console-role check left`);
    }
  });
});
