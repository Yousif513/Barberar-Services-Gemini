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
  // Copy must match how money actually moves: no escrow, no "licensed" claims, no flat 15% commission.
  { pattern: /"[^"\n]*\b[Ee]scrow\b[^"\n]*\s[^"\n]*"/, why: "escrow claims in user-facing copy" },
  { pattern: /licensed (payment )?gateway|المرخصة/i, why: "unverified licensing claims" },
  { pattern: /flat 15% commission|standard 15% commission|عمولة ثابتة/i, why: "a commission rate the fee rules do not apply" },
  { pattern: /ZATCA & Payments|PRIMORA15/, why: "implied endorsements or non-existent offers" },
  { pattern: /demoEmployees|export initiated|check downloads folder/i, why: "invented staff or an export that produces no file" },
  { pattern: /Fulfilled per customer request|Rejected per statutory exceptions|PDPL Data Portability Export/, why: "canned data-request notes or a partial file presented as a PDPL export" },
  // The platform settles in SAR only; a formatted dollar amount is invented data.
  { pattern: /["'>\s]\$\d{1,3}(,\d{3})+(\.\d{2})?|["'>\s]\$\d+\.\d{2}\b/, why: "US-dollar amounts" },
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

  it("portal shells show the signed-in account and really sign out", () => {
    for (const path of ["web_platform/src/app/provider/layout.tsx", "web_platform/src/app/customer/layout.tsx", "web_platform/src/app/admin/layout.tsx"]) {
      const code = files.find((f) => f.path === path).code;
      assert.ok(!/>\s*(Elite Barbershop|Yousif|Gold Member|EB|AR)\s*</.test(code), `${path} must not hard-code an account identity`);
      assert.ok(!/Admin Root/.test(code), `${path} must not hard-code an operator identity`);
      assert.ok(code.includes('supabase.auth.signOut({ scope: "local" })'), `${path} logout must end this device's session without ending the person's other sessions`);
    }
  });

  it("inventory hides figures and empty states when its data failed to load", () => {
    const code = files.find((f) => f.path === "web_platform/src/app/provider/inventory/page.tsx").code;
    assert.ok(code.includes("setDataLoaded(true)") && code.includes("{dataLoaded && (<>"), "failed loads must not render zeros as facts");
  });

  it("navigation icons have complete path data", () => {
    // A path ending mid-arc (e.g. "a1.724 1.724 0 002.573") throws in the browser and renders a fragment.
    const truncated = files.filter((f) => /d="[^"]*a[\d.]+ [\d.]+ 0 00[\d.]+"/.test(f.code)).map((f) => f.path);
    assert.deepEqual(truncated, [], `truncated SVG paths in: ${truncated.join(", ")}`);
  });

  it("Arabic text is stored as Arabic, not mis-decoded bytes", () => {
    const garbled = files.filter((f) => /[ØÙ][\u0080-¿Œ-ƒˆ-˜–-›€™]/.test(f.code)).map((f) => f.path);
    assert.deepEqual(garbled, [], `mojibake in: ${garbled.join(", ")}`);
  });

  // Screen-to-command wiring for the admin console lives in admin-console-guards.test.mjs.
  it("operator commands never write invented values", () => {
    const adminFiles = files.filter((f) => f.path.startsWith("web_platform/src/app/admin/"));
    const random = adminFiles.filter((f) => f.code.includes("Math.random")).map((f) => f.path);
    assert.deepEqual(random, [], `random values in operator screens: ${random.join(", ")}`);
  });

  it("bid acceptance is a server command on every client", () => {
    for (const path of ["web_platform/src/app/customer/jobs/page.tsx", "mobile_app/src/app/service-board.tsx"]) {
      const code = files.find((f) => f.path === path).code;
      assert.ok(code.includes('rpc("accept_job_bid"'), `${path} must accept bids through accept_job_bid`);
      assert.ok(!/from\("job_bids"\)\s*\.update\(\{ status: "accepted" \}\)/.test(code), `${path} must not write bid status directly`);
    }
  });
});
