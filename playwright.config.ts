import { defineConfig, devices } from "@playwright/test";

// End-to-end suite (e2e/). It runs against the web app at E2E_BASE_URL (default http://localhost:3100) and the local
// Supabase stack; e2e/global-setup.ts refuses any address that is not on this machine. In CI the workflow builds the app,
// serves it with `next start` and shards the run (see .github/workflows/deploy.yml, job e2e).
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: ci,
  // A failure is a failure: no retries hide a flaky test. Traces of failed tests are kept for the CI artifact.
  retries: 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : ci ? 3 : 2,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: ci ? [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }], ["github"]] : [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Riyadh",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
