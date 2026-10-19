import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// QAFIX item 5 (gaps axe-critical-unlabelled-controls-on-services-and-integrations and axe-contrast-and-scroll-region-failures).
// The axe runs in the browser are the proof; this keeps the fixes from being undone.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(repoRoot, "web_platform/src", path), "utf8");

describe("labels on the services and integrations controls", () => {
  it("names every inline price field after its service, and the filter controls", () => {
    const code = read("app/admin/services/page.tsx");
    assert.ok(code.includes("aria-label={lang === \"ar\" ? `السعر المرجعي لخدمة ${name} بالريال` : `Baseline price of ${name} in SAR`}"));
    assert.ok(code.includes("aria-label={t.searchPlaceholder}") && code.includes("aria-label={t.category}") && code.includes("aria-label={t.status}"));
  });
  it("names the integrations search, section filter and the switch of each card", () => {
    const code = read("app/admin/integrations/page.tsx");
    assert.ok(code.includes("aria-label={xt.search}") && code.includes("aria-label={xt.section}"));
    assert.ok(code.includes('role="switch"') && code.includes("aria-checked={item.enabled}"));
  });
});

describe("contrast and keyboard-reachable scroll regions", () => {
  it("draws small gold text in the dark gold that reaches 4.5:1, never the light gold", () => {
    for (const path of ["components/control-center.tsx", "components/dev-role-switcher.tsx"]) {
      assert.ok(!/text-\[#B8952E\]/.test(read(path)), `${path} uses #7A5B12 for text`);
    }
    assert.ok(!/text-\[#A57C32\]/.test(read("app/privacy/page.tsx")));
    assert.ok(!/text-\[#9B7928\]">PRIMORA/.test(read("app/login/mfa/page.tsx")));
    assert.ok(!/text-stone-(400|500)/.test(read("app/customer/privacy/page.tsx")));
  });
  it("lets the keyboard reach every horizontally scrolling table and the console's main panel", () => {
    assert.ok(read("app/admin/layout.tsx").includes('<main id="admin-main" tabIndex={0}'));
    for (const path of ["app/admin/reports/page.tsx", "app/admin/whatsapp/page.tsx", "app/provider/chain/page.tsx", "app/admin/coupons/page.tsx",
      "app/admin/services/page.tsx", "app/admin/branches/page.tsx", "app/admin/packages/page.tsx"]) {
      assert.ok(/overflow-x-auto[^>]*tabIndex=\{0\} role="region"|tabIndex=\{0\} role="region"[^>]*aria-label/.test(read(path)), `${path}: the scroll region is focusable and named`);
    }
  });
});
