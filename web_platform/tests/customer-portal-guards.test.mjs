import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Source-text guards for the customer portal repairs (FIX-CUST). They only check that a defect does not come back:
// the behaviour itself is executed in booking-display.test.mjs, prayer-windows.test.mjs and verify-ui-schema.mjs.
const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}
const read = (path) => readFileSync(join(webRoot, path), "utf8");
const customer = files(join(webRoot, "src/app/customer")).map((path) => ({
  path: relative(webRoot, path).split("\\").join("/"),
  code: readFileSync(path, "utf8"),
}));

describe("customer portal source guards", () => {
  it("the receipt prints the provider's policy and the real money, not literals (D-04, R17)", () => {
    const receipt = read("src/app/customer/bookings/[id]/confirmation/page.tsx");
    assert.doesNotMatch(receipt, /15%|85%|\*\s*15\s*\/\s*115|24 hours|24 ساعة|50%/, "no hard-coded split, VAT or policy");
    assert.match(receipt, /receiptAmounts\(booking\)/);
    assert.match(receipt, /policySentences\(policy, locale\)/);
    assert.match(receipt, /payment-checkout/);
    assert.match(receipt, /POLL_INTERVAL_MS = 3000/);
  });

  it("no customer page invents reschedule slots, saved cards, dependents or a referral code (D-29, R7, D-05)", () => {
    for (const { path, code } of customer) {
      assert.doesNotMatch(code, /T1[0-7]:00:00\+03:00/, `${path} fabricates slots`);
      assert.doesNotMatch(code, /REF-PRIMORA|\*{4} 4920|\*{4} 7701|Faisal Al-Saud|Sara Al-Saud/, `${path} renders invented data`);
      assert.doesNotMatch(code, /useState(<[^>]*>)?\(\s*\[\s*\{[^}]*\bname\s*:\s*["']/, `${path} seeds state with named records`);
      assert.doesNotMatch(code, /https:\/\/primora\.sa/, `${path} hard-codes the public domain`);
    }
  });

  it("wallet and tip copy does not claim escrow, direct-to-specialist tips or cross-provider points, in either language (C-D18)", () => {
    for (const { path, code } of customer) {
      assert.doesNotMatch(code, /escrow|الضمان|بالضمان|حالات الضمان/i, `${path} mentions escrow`);
      assert.doesNotMatch(code, /goes directly to your specialist|مباشرة للأخصائي|across salons|لدى الصالونات/, `${path} makes a payout or redemption claim the system does not keep`);
      assert.doesNotMatch(code, /Auto-applied as discount|يُخصم تلقائياً عند تأكيد/, `${path} claims wallet credit is auto-applied`);
    }
  });

  it("repaired pages use the shared dialog behaviour, not hand-made modal layers (R22)", () => {
    for (const path of ["src/app/customer/bookings/page.tsx", "src/app/customer/wallet/page.tsx"]) {
      assert.doesNotMatch(read(path), /fixed inset-0 z-50/, `${path} has a hand-made modal`);
      assert.match(read(path), /ModalOverlay/, `${path} should use ModalOverlay`);
    }
  });

  it("consent writes call record_consent and read the error (D-11)", () => {
    const settings = read("src/app/customer/settings/page.tsx");
    assert.match(settings, /rpc\("record_consent"/);
    assert.doesNotMatch(settings, /from\("consents"\)\s*\.insert|\.from\("consents"\)\.insert/);
    assert.match(settings, /if \(consentError\) throw consentError/);
  });

  it("customer pages show statuses and dates through the shared helpers, in the active language (R23)", () => {
    const bookings = read("src/app/customer/bookings/page.tsx");
    assert.doesNotMatch(bookings, /\.replace\("_", " "\)/, "raw status enum");
    assert.doesNotMatch(bookings, /toLocale(Date|Time)?String\("en-GB"/, "fixed en-GB dates");
    assert.doesNotMatch(bookings, /\/customer\/book\?service_id=/);
    assert.match(bookings, /bookAgainHref\(/);
  });

  it("the reviews page reads ?booking= inside a Suspense boundary (R43)", () => {
    const reviews = read("src/app/customer/reviews/page.tsx");
    assert.match(reviews, /useSearchParams\(\)\.get\("booking"\)/);
    assert.match(reviews, /<Suspense/);
  });
});
