import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REQUIRED_CHECKS, decide, evaluateChecks, fetchCheckRuns } from "../scripts/vercel-ignore-build.mjs";

const pass = (name, at = "2026-10-07T10:00:00Z") => ({ name, status: "completed", conclusion: "success", started_at: at });
const allPass = () => DEFAULT_REQUIRED_CHECKS.map((name) => pass(name));

const productionEnv = { VERCEL_ENV: "production", VERCEL_GIT_REPO_OWNER: "o", VERCEL_GIT_REPO_SLUG: "r", VERCEL_GIT_COMMIT_SHA: "abcdef1234567890", VERCEL_CI_WAIT_SECONDS: "60" };

function fakeGitHub(responses) {
  let call = 0;
  return async () => {
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next instanceof Error) throw next;
    if (typeof next === "number") return { ok: false, status: next, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ check_runs: next }) };
  };
}

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

describe("evaluating the required checks of a commit", () => {
  it("builds when every required check succeeded", () => {
    assert.equal(evaluateChecks(allPass(), DEFAULT_REQUIRED_CHECKS).verdict, "build");
  });

  it("waits while a required check is missing or still running", () => {
    const runs = allPass().slice(0, 2);
    assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "wait");
    runs.push({ name: DEFAULT_REQUIRED_CHECKS[2], status: "in_progress", conclusion: null });
    assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "wait");
  });

  it("skips as soon as one required check failed, even while others still run", () => {
    const runs = [{ name: DEFAULT_REQUIRED_CHECKS[0], status: "completed", conclusion: "failure" }, { name: DEFAULT_REQUIRED_CHECKS[1], status: "queued", conclusion: null }];
    assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "skip");
  });

  it("treats cancelled, timed out and skipped checks as not passed", () => {
    for (const conclusion of ["cancelled", "timed_out", "skipped", "neutral", "action_required"]) {
      const runs = allPass();
      runs[1] = { name: DEFAULT_REQUIRED_CHECKS[1], status: "completed", conclusion };
      assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "skip", conclusion);
    }
  });

  it("lets the newest run of a re-run check decide", () => {
    const runs = allPass();
    runs.push({ name: DEFAULT_REQUIRED_CHECKS[0], status: "completed", conclusion: "failure", started_at: "2026-10-07T09:00:00Z" });
    assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "build");
    const failedLast = allPass();
    failedLast.push({ name: DEFAULT_REQUIRED_CHECKS[0], status: "completed", conclusion: "failure", started_at: "2026-10-07T11:00:00Z" });
    assert.equal(evaluateChecks(failedLast, DEFAULT_REQUIRED_CHECKS).verdict, "skip");
  });

  it("ignores checks that are not required", () => {
    const runs = [...allPass(), { name: "Some optional check", status: "completed", conclusion: "failure" }];
    assert.equal(evaluateChecks(runs, DEFAULT_REQUIRED_CHECKS).verdict, "build");
  });
});

describe("the production build decision", () => {
  it("always builds a preview deployment", async () => {
    assert.equal(await decide({ env: { VERCEL_ENV: "preview" }, fetchImpl: fakeGitHub([500]), log: () => {} }), "build");
  });

  it("builds production when CI is green", async () => {
    assert.equal(await decide({ env: productionEnv, fetchImpl: fakeGitHub([allPass()]), log: () => {}, ...clock() }), "build");
  });

  it("skips production when CI failed", async () => {
    const runs = allPass();
    runs[0] = { name: runs[0].name, status: "completed", conclusion: "failure" };
    assert.equal(await decide({ env: productionEnv, fetchImpl: fakeGitHub([runs]), log: () => {}, ...clock() }), "skip");
  });

  it("waits for CI that is still running and then builds when it turns green", async () => {
    const running = allPass().map((run, index) => (index === 2 ? { name: run.name, status: "in_progress", conclusion: null } : run));
    const verdict = await decide({ env: productionEnv, fetchImpl: fakeGitHub([running, running, allPass()]), log: () => {}, ...clock() });
    assert.equal(verdict, "build");
  });

  it("skips when CI is still not finished at the deadline", async () => {
    const running = [{ name: DEFAULT_REQUIRED_CHECKS[0], status: "in_progress", conclusion: null }];
    assert.equal(await decide({ env: productionEnv, fetchImpl: fakeGitHub([running]), log: () => {}, ...clock() }), "skip");
  });

  it("skips, never builds blind, when GitHub cannot be read", async () => {
    assert.equal(await decide({ env: productionEnv, fetchImpl: fakeGitHub([503]), log: () => {}, ...clock() }), "skip");
    assert.equal(await decide({ env: productionEnv, fetchImpl: fakeGitHub([new Error("network down")]), log: () => {}, ...clock() }), "skip");
  });

  it("skips when the deployment carries no Git details", async () => {
    assert.equal(await decide({ env: { VERCEL_ENV: "production" }, fetchImpl: fakeGitHub([allPass()]), log: () => {}, ...clock() }), "skip");
  });

  it("honours an override of the required checks", async () => {
    const env = { ...productionEnv, VERCEL_REQUIRED_CHECKS: "Only this one" };
    assert.equal(await decide({ env, fetchImpl: fakeGitHub([[pass("Only this one")]]), log: () => {}, ...clock() }), "build");
  });
});

describe("reading the check runs", () => {
  it("sends the token only when one is configured and asks for the commit's check runs", async () => {
    const seen = [];
    const fetchImpl = async (url, options) => {
      seen.push({ url, headers: options.headers });
      return { ok: true, status: 200, json: async () => ({ check_runs: [] }) };
    };
    await fetchCheckRuns({ owner: "o", repo: "r", sha: "abc", token: undefined, fetchImpl });
    await fetchCheckRuns({ owner: "o", repo: "r", sha: "abc", token: "t", fetchImpl });
    assert.match(seen[0].url, /repos\/o\/r\/commits\/abc\/check-runs/);
    assert.equal(seen[0].headers.authorization, undefined);
    assert.equal(seen[1].headers.authorization, "Bearer t");
  });
});
