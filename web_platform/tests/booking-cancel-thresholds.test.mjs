import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// FINAL-3: the bookings cancel dialog states the refund approval thresholds the server applies (governance_settings
// refund_single_approval_sar and refund_daily_cumulative_sar, the values admin_cancel_booking reads through governance_setting),
// never fixed figures that go stale the day an approved request changes them.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../src/app/admin/bookings/page.tsx"), "utf8");

describe("bookings cancel dialog thresholds", () => {
  it("writes no threshold amount into the copy", () => {
    for (const fixed of ["1,000", "5,000", "١٬٠٠٠", "٥٬٠٠٠", "SAR 1000", "SAR 5000"]) {
      assert.ok(!src.includes(fixed), `the dialog copy still states ${fixed}`);
    }
    assert.match(src, /cancelIntro: "[^"]*\{single\}[^"]*\{daily\}/, "the English copy takes both thresholds as values");
    assert.equal((src.match(/cancelIntro: "[^"]*\{single\}[^"]*\{daily\}/g) ?? []).length, 2, "and so does the Arabic copy");
  });

  it("reads both thresholds from the settings the server uses, each time the dialog opens", () => {
    assert.match(src, /\.from\("governance_settings"\)/);
    assert.match(src, /refund_single_approval_sar/);
    assert.match(src, /refund_daily_cumulative_sar/);
    assert.match(src, /\[cancelOpen\]/, "the read follows the dialog being opened");
  });

  it("says the thresholds could not be loaded instead of guessing them", () => {
    assert.match(src, /cancelIntroNoThresholds/);
    assert.match(src, /loadingThresholds/);
    assert.match(src, /intro=\{cancelling \? cancelIntro\(\) : t\.noShowIntro\}/);
  });
});
