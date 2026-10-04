import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Release-path guard: client code must not invent records, replies, or success.
// Seeds and fixtures live in supabase/seed.sql and test files, never in app source.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SOURCE_ROOTS = ["web_platform/src", "mobile_app/src"];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)))
  .map((path) => ({ path: relative(repoRoot, path).replace(/\\/g, "/"), code: readFileSync(path, "utf8") }));

const FORBIDDEN = [
  { pattern: /simulated responder|getSimulatedReply|Simulate (Salon )?Auto|Simulate auto client/i, why: "fake chat replies" },
  { pattern: /demo fallback|falling back to mock|Showing mock|mock leads|initialMockPosts/i, why: "mock fallback on failed queries" },
  { pattern: /ExponentPushToken\[mock/, why: "fabricated push tokens" },
  { pattern: /running offline update/i, why: "catch-and-succeed writes" },
  { pattern: /constants\/mockData/, why: "mock catalogue imports" },
  { pattern: /00000000-0000-0000-0000-000000000000/, why: "placeholder ids written to the database" },
];

describe("release path contains no mock data", () => {
  for (const rule of FORBIDDEN) {
    it(`has no ${rule.why}`, () => {
      const hits = files.filter((f) => rule.pattern.test(f.code)).map((f) => f.path);
      assert.deepEqual(hits, [], `${rule.why} found in: ${hits.join(", ")}`);
    });
  }

  it("mobile screens read from Supabase", () => {
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.code]));
    assert.ok(byPath["mobile_app/src/lib/marketplace.ts"].includes("search_marketplace_providers"));
    assert.ok(byPath["mobile_app/src/components/shop-details-modal.tsx"].includes("loadAvailableSlots"));
    assert.ok(byPath["mobile_app/src/app/bookings.tsx"].includes('from("bookings")'));
    assert.ok(byPath["mobile_app/src/app/messages.tsx"].includes('from("messages")'));
    assert.ok(byPath["mobile_app/src/app/profile.tsx"].includes("signInWithOtp"));
    assert.ok(byPath["mobile_app/src/app/service-board.tsx"].includes("accept_job_bid"));
  });

  it("bid acceptance is a server command on every client", () => {
    for (const path of ["web_platform/src/app/customer/jobs/page.tsx", "mobile_app/src/app/service-board.tsx"]) {
      const code = files.find((f) => f.path === path).code;
      assert.ok(code.includes('rpc("accept_job_bid"'), `${path} must accept bids through accept_job_bid`);
      assert.ok(!/from\("job_bids"\)\s*\.update\(\{ status: "accepted" \}\)/.test(code), `${path} must not write bid status directly`);
    }
  });
});
