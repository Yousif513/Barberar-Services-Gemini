import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// FINAL N3, N5 and the renewal note: an early hold release, a hold renewal after 3 renewals and an incident awareness-time
// correction are approval requests decided by a second person. The screens say so instead of reporting the change as done.
const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src", path), "utf8");
const KINDS = ["privacy_legal_hold_release", "privacy_legal_hold_renewal", "incident_aware_at_correction"];

describe("second-person requests in the console", () => {
  it("the approvals inbox names each new kind in English and Arabic and describes it", () => {
    const src = read("app/admin/approvals/page.tsx");
    for (const kind of KINDS) {
      assert.equal((src.match(new RegExp(`${kind}: "`, "g")) ?? []).length, 2, `${kind} has an English and an Arabic label`);
      assert.match(src, new RegExp(`row\\.kind === "${kind}"`), `${kind} has a summary line`);
    }
  });

  it("the hold review says a release or a 4th renewal waits for approval", () => {
    const src = read("app/admin/privacy/page.tsx");
    assert.match(src, /status === "pending_approval"/);
    assert.match(src, /release_needs_approval \? t\.releaseAsked : t\.renewalAsked/);
    assert.equal((src.match(/releaseAsked: "/g) ?? []).length, 2);
    assert.equal((src.match(/renewalAsked: "/g) ?? []).length, 2);
  });

  it("the incident correction says the clock moves only after approval", () => {
    const src = read("app/admin/incidents/page.tsx");
    assert.match(src, /status === "pending_approval" \? t\.correctionAsked : t\.done/);
    assert.equal((src.match(/correctionAsked: "/g) ?? []).length, 2);
  });
});
