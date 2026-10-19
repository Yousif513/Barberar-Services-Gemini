import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { isTransientSessionError, loadSessionStateWithRetry } from "../src/lib/session-state-retry.mjs";

// E2E observation: the first admin_session_state call right after sign-in could be refused with PGRST303 ("JWT issued at
// future") and the console then hid role-gated actions without a word.
const root = fileURLToPath(new URL("../..", import.meta.url));
const noSleep = async () => {};
const issuedAtFuture = { code: "PGRST303", message: "JWT issued at future" };

describe("loadSessionStateWithRetry", () => {
  it("retries the token-issued-in-the-future refusal and returns the state once PostgREST accepts the token", async () => {
    const answers = [{ error: issuedAtFuture }, { error: issuedAtFuture }, { data: { signed_in: true, console_role: "finance" } }];
    let refreshed = 0;
    const r = await loadSessionStateWithRetry(async () => answers.shift(), { sleep: noSleep, beforeRetry: async () => { refreshed += 1; } });
    assert.deepEqual([r.error, r.data.console_role, r.attempts, refreshed], [undefined, "finance", 3, 2]);
  });
  it("does not retry a real refusal, and reports it", async () => {
    let calls = 0;
    const r = await loadSessionStateWithRetry(async () => { calls += 1; return { error: { code: "42501", message: "permission denied" } }; }, { sleep: noSleep });
    assert.deepEqual([calls, r.error.code], [1, "42501"]);
  });
  it("gives up after the last delay and reports the failure", async () => {
    let calls = 0;
    const r = await loadSessionStateWithRetry(async () => { calls += 1; return { error: issuedAtFuture }; }, { sleep: noSleep, delays: [1, 1, 1] });
    assert.deepEqual([calls, r.error.code], [4, "PGRST303"]);
  });
  it("treats a thrown network failure as transient", async () => {
    const answers = [() => { throw new TypeError("Failed to fetch"); }, () => ({ data: { signed_in: true } })];
    const r = await loadSessionStateWithRetry(async () => answers.shift()(), { sleep: noSleep });
    assert.equal(r.attempts, 2);
    assert.ok(isTransientSessionError({ message: "JWT expired" }));
    assert.ok(!isTransientSessionError({ code: "P0001", message: "Administrator access required" }));
  });
  it("stops when the screen is gone", async () => {
    let calls = 0;
    const r = await loadSessionStateWithRetry(async () => { calls += 1; return { error: issuedAtFuture }; }, { sleep: noSleep, isCancelled: () => true });
    assert.equal(calls, 1);
    assert.ok(r.error);
  });
});

describe("the console layout", () => {
  const code = readFileSync(join(root, "web_platform/src/app/admin/layout.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("loads the session state through the retry and tells the operator when it still failed", () => {
    assert.match(code, /loadSessionStateWithRetry\(\(\) => supabase\.rpc\("admin_session_state"\)/);
    assert.match(code, /\{sessionStateFailed && \(\n\s*<div role="alert"/);
    assert.match(code, /onClick=\{\(\) => setSessionStateAttempt\(\(n\) => n \+ 1\)\}/);
    assert.match(code, /sessionStateFailed: "تعذّر تحميل صلاحياتك/);
  });
});
