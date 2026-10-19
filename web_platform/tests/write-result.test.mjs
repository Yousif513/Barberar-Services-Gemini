import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkedWrite, commandOutcome, optimisticWrite, requireRows, tableWriteOutcome } from "../src/lib/write-result.mjs";
import { describeConsoleError, unchangedText } from "../src/lib/console-errors.mjs";

// QAFIX (critical gap direct-table-updates-report-success-when-the-row-policy-refuses). These are the answers the database
// really gives a console role without the permission, replayed against the judgement every screen now uses: none of them
// may come out as a success, and the optimistic change on screen must be put back.

// What PostgREST answered the analyst in the QA reproduction: 200, no error, no row (the restrictive row policy matched nothing).
const REFUSED_BY_ROW_POLICY = { data: [], error: null, status: 200 };
// What a console command answers a role without the permission (console_require_permission).
const REFUSED_BY_COMMAND = {
  data: null,
  error: { code: "42501", message: "Your console role does not include the operations.write permission, so nothing was changed", hint: "missing_permission", details: "operations.write" },
};

describe("tableWriteOutcome: a direct write is a success only when it names the rows it changed", () => {
  it("treats the 200-with-no-row answer of a refusing row policy as a refusal, not a save", () => {
    const outcome = tableWriteOutcome(REFUSED_BY_ROW_POLICY, 1);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "no_rows");
    assert.match(describeConsoleError(outcome.error, "en"), /Nothing was changed/);
    assert.match(describeConsoleError(outcome.error, "ar"), /لم يتغير شيء/);
  });
  it("passes on the database error, and accepts the expected number of rows only", () => {
    const failed = tableWriteOutcome({ data: null, error: { code: "42501", message: "permission denied for table services" } });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "failed");
    assert.equal(tableWriteOutcome({ data: [{ id: "a" }], error: null }, 1).ok, true);
    assert.equal(tableWriteOutcome({ data: [{ id: "a" }], error: null }, 2).ok, false, "two branches asked, one changed");
    assert.equal(tableWriteOutcome({ data: { id: "a" }, error: null }).ok, true, "a .single() answer counts as one row");
    assert.equal(tableWriteOutcome(null).ok, false);
  });
  it("words the no-row refusal in the screen's language", () => {
    assert.match(tableWriteOutcome(REFUSED_BY_ROW_POLICY, 1, "ar").error.message, /لم يُحفظ شيء/);
    assert.match(tableWriteOutcome(REFUSED_BY_ROW_POLICY, 1, "en").error.message, /Nothing was saved/);
  });
  it("checkedWrite and requireRows give the existing error paths the refusal", () => {
    assert.equal(checkedWrite(REFUSED_BY_ROW_POLICY, { expected: 1, lang: "en" }).error.code, "no_rows");
    assert.equal(checkedWrite({ data: [{ id: "a" }], error: null }, { expected: 1 }).error, null);
    assert.throws(() => requireRows(REFUSED_BY_ROW_POLICY, { expected: 1, lang: "en" }), (error) => error.code === "no_rows");
    assert.deepEqual(requireRows({ data: [{ id: "a" }], error: null }), [{ id: "a" }]);
  });
});

describe("commandOutcome: a command is a success only when it answers one", () => {
  it("is a refusal on an error, and on an answer that says success: false", () => {
    assert.equal(commandOutcome(REFUSED_BY_COMMAND).ok, false);
    const rejected = commandOutcome({ data: { success: false, message: "Slot already taken" }, error: null });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, "rejected");
    assert.equal(rejected.error.message, "Slot already taken");
  });
  it("separates a change from an answer that nothing needed changing", () => {
    assert.deepEqual(commandOutcome({ data: { success: true, changed: true }, error: null }).changed, true);
    assert.deepEqual(commandOutcome({ data: { success: true, changed: false }, error: null }).changed, false);
    assert.match(unchangedText("en"), /Nothing changed/);
    assert.match(unchangedText("ar"), /لم يتغير شيء/);
  });
});

describe("optimisticWrite: the change on screen survives only a confirmed answer", () => {
  const screen = () => {
    const state = { active: true, applied: 0, rolledBack: 0 };
    return {
      state,
      apply: () => { state.active = false; state.applied += 1; },
      rollback: () => { state.active = true; state.rolledBack += 1; },
    };
  };

  it("puts the row back and reports the refusal when the command refuses the role", async () => {
    const s = screen();
    const outcome = await optimisticWrite({ apply: s.apply, rollback: s.rollback, send: async () => REFUSED_BY_COMMAND });
    assert.equal(outcome.ok, false);
    assert.deepEqual(s.state, { active: true, applied: 1, rolledBack: 1 });
    assert.match(describeConsoleError(outcome.error, "en"), /does not include operations changes \(operations\.write\), so nothing was changed/);
    assert.match(describeConsoleError(outcome.error, "ar"), /لا يشمل دورك/);
  });

  it("puts the row back when a direct write matched no row (the reproduction from the QA pass)", async () => {
    const s = screen();
    const outcome = await optimisticWrite({ apply: s.apply, rollback: s.rollback, send: async () => REFUSED_BY_ROW_POLICY, judge: (a) => tableWriteOutcome(a, 1) });
    assert.equal(outcome.ok, false);
    assert.equal(s.state.active, true);
  });

  it("puts the row back when the request never reached the server", async () => {
    const s = screen();
    const outcome = await optimisticWrite({ apply: s.apply, rollback: s.rollback, send: async () => { throw new TypeError("Failed to fetch"); } });
    assert.equal(outcome.ok, false);
    assert.equal(s.state.active, true);
    assert.match(describeConsoleError(outcome.error, "en"), /could not be reached/);
  });

  it("keeps the change only when the server confirms it", async () => {
    const s = screen();
    const outcome = await optimisticWrite({ apply: s.apply, rollback: s.rollback, send: async () => ({ data: { success: true, changed: true }, error: null }) });
    assert.equal(outcome.ok, true);
    assert.deepEqual(s.state, { active: false, applied: 1, rolledBack: 0 });
  });
});
