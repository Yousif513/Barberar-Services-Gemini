// Vercel "Ignored Build Step" for production deploys: build only commits whose CI checks passed.
//
// Vercel builds every push to the production branch on its own, whether or not the GitHub workflow passed. This script is
// run by Vercel before a build (see vercel.json `ignoreCommand`). Vercel reads the exit code:
//   exit 1  -> go ahead and build
//   exit 0  -> skip this build (the previous production deployment stays live)
//
// Preview deployments are never gated. For production it waits for the required checks of the commit, builds only when
// every one of them succeeded, and skips otherwise (failure, cancellation, still running at the deadline, or checks that
// cannot be read). A skipped production build can be redeployed from the Vercel dashboard once CI is green.
//
// The check names must match the job names in .github/workflows/deploy.yml; VERCEL_REQUIRED_CHECKS (comma separated)
// overrides them. VERCEL_CI_WAIT_SECONDS bounds the wait. GITHUB_TOKEN is optional (it raises the API rate limit and is
// needed for a private repository).

import process from "node:process";

export const DEFAULT_REQUIRED_CHECKS = ["Verify Web Platform", "Verify Mobile App", "Verify Database & Edge Functions"];

// verdict: "build" | "skip" | "wait"
export function evaluateChecks(checkRuns, required) {
  const reasons = [];
  let waiting = false;
  for (const name of required) {
    // A re-run leaves older runs of the same name behind; the newest one decides.
    const runs = checkRuns
      .filter((run) => run.name === name)
      .sort((a, b) => String(b.started_at ?? b.created_at ?? "").localeCompare(String(a.started_at ?? a.created_at ?? "")));
    const run = runs[0];
    if (!run) {
      waiting = true;
      reasons.push(`${name}: not reported yet`);
    } else if (run.status !== "completed") {
      waiting = true;
      reasons.push(`${name}: ${run.status}`);
    } else if (run.conclusion !== "success") {
      return { verdict: "skip", reasons: [`${name}: ${run.conclusion}`] };
    }
  }
  if (waiting) return { verdict: "wait", reasons };
  return { verdict: "build", reasons: [] };
}

export async function fetchCheckRuns({ owner, repo, sha, token, fetchImpl = fetch }) {
  const runs = [];
  for (let page = 1; page <= 5; page += 1) {
    const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "primora-vercel-ignore-build",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for the check runs of ${sha}`);
    const body = await response.json();
    runs.push(...(body.check_runs ?? []));
    if ((body.check_runs ?? []).length < 100) break;
  }
  return runs;
}

export async function decide({ env, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = () => Date.now(), log = console.log }) {
  if (env.VERCEL_ENV !== "production") {
    log(`Not a production deployment (${env.VERCEL_ENV ?? "unknown"}): building.`);
    return "build";
  }
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  if (!owner || !repo || !sha) {
    log("The Git details of this deployment are missing, so CI cannot be checked: skipping the production build.");
    return "skip";
  }
  const required = (env.VERCEL_REQUIRED_CHECKS ? env.VERCEL_REQUIRED_CHECKS.split(",") : DEFAULT_REQUIRED_CHECKS).map((name) => name.trim()).filter(Boolean);
  const waitSeconds = Number(env.VERCEL_CI_WAIT_SECONDS);
  const deadline = now() + (Number.isFinite(waitSeconds) && waitSeconds >= 0 ? waitSeconds : 900) * 1000;

  for (;;) {
    let result;
    try {
      result = evaluateChecks(await fetchCheckRuns({ owner, repo, sha, token: env.GITHUB_TOKEN, fetchImpl }), required);
    } catch (error) {
      log(`CI status could not be read (${error.message}): skipping the production build.`);
      return "skip";
    }
    if (result.verdict === "build") {
      log(`All required checks passed for ${sha.slice(0, 7)}: building.`);
      return "build";
    }
    if (result.verdict === "skip") {
      log(`A required check did not pass (${result.reasons.join("; ")}): skipping the production build.`);
      return "skip";
    }
    if (now() >= deadline) {
      log(`Required checks were still not complete at the deadline (${result.reasons.join("; ")}): skipping the production build. Redeploy once CI is green.`);
      return "skip";
    }
    log(`Waiting for CI: ${result.reasons.join("; ")}`);
    await sleep(20_000);
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href || process.argv[1]?.endsWith("vercel-ignore-build.mjs")) {
  decide({ env: process.env }).then((verdict) => {
    process.exit(verdict === "build" ? 1 : 0);
  });
}
