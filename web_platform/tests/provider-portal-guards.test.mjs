import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Provider-portal guard (package FIX-PROV): the provider screens must not invent records, call a third party for
// something the page can do itself, or use native dialogs. These read the source because the screens are client pages.
const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const providerRoot = join(webRoot, "src", "app", "provider");

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = sourceFiles(providerRoot).map((path) => ({
  path: relative(webRoot, path).replace(/\\/g, "/"),
  code: readFileSync(path, "utf8"),
}));
const byPath = (suffix) => files.find((file) => file.path.endsWith(suffix));

describe("provider portal contains no invented records", () => {
  const rules = [
    { pattern: /demoStaffMembers|demoServiceOptions|demoProfileFor|\bdemo-(omar|yousef|karim|classic|beard|facial|spa|branch)\b/, why: "invented staff or services (R8)" },
    { pattern: /images\.unsplash\.com/, why: "stock photos presented as a person" },
    { pattern: /api\.qrserver\.com/, why: "a third-party QR service (D-09)" },
    { pattern: /elite-barbershop|Elite Barbershop/, why: "an invented business or share link (D-28)" },
    { pattern: /\b(window\.)?(confirm|prompt|alert)\(/, why: "native dialogs" },
  ];
  for (const rule of rules) {
    it(`has no ${rule.why}`, () => {
      const hits = files.filter((file) => rule.pattern.test(file.code)).map((file) => file.path);
      assert.deepEqual(hits, [], `${rule.why} found in: ${hits.join(", ")}`);
    });
  }
});

describe("employees screen (R8, R50, C-D13)", () => {
  const page = byPath("employees/page.tsx").code;
  it("renders an empty state with a call to add the first professional", () => {
    assert.match(page, /emptyHeading/);
    assert.match(page, /Add your first professional/);
    assert.match(page, /أضف أول أخصائي لديك/);
  });
  it("edits the profile columns the shop page needs", () => {
    for (const column of ["bio_en", "bio_ar", "years_of_experience", "specialties", "instagram_handle"]) {
      assert.ok(page.includes(column), `${column} is read and written`);
    }
  });
  it("reads earnings from the earnings view instead of computing them from nothing", () => {
    assert.ok(page.includes("employee_earnings_summary"));
  });
  it("has a pay-rules editor and a consented portfolio uploader", () => {
    const extras = byPath("_components/employee-extras.tsx").code;
    assert.ok(extras.includes("employee_commission_rules"));
    assert.ok(extras.includes("employee_portfolios"));
    assert.match(extras, /customer_consent_confirmed: true/);
    assert.match(extras, /consentRequired/);
  });
});

describe("provider dialogs", () => {
  it("share one accessible shell", () => {
    const dialog = byPath("_components/dialog.tsx").code;
    assert.match(dialog, /role="dialog"/);
    assert.match(dialog, /aria-modal="true"/);
    assert.ok(existsSync(join(webRoot, "src", "components", "modal.tsx")));
  });
});
