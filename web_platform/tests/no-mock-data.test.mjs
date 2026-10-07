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

// ---- public pages: nothing the platform does not implement may be promised -------------------------------------------------
// The landing, about, security, privacy, terms, provider-application, login, discover, services and booking pages are what a
// stranger reads before trusting the platform with money and personal data. Nothing in the repository implements a booking
// guarantee, a hygiene certification, escrow, or a PCI/PDPL certification of PRIMORA itself (a hosted payment page makes the
// gateway, not PRIMORA, PCI-scoped), so those words stay out of the copy in both languages. Reword to what happens instead
// ("deposit paid through Tap's hosted page").
const PUBLIC_PAGE = /^web_platform\/src\/(app\/(page|layout)\.tsx|app\/(about|security|privacy|terms|become-provider|login|discover|services|shop|categories)\/|components\/category-providers\.tsx)/;
const publicFiles = files.filter((f) => PUBLIC_PAGE.test(f.path));

const UNBACKED_CLAIMS = [
  { pattern: /ضمان|تضمن\b|نضمن|الضمان/, why: "an Arabic guarantee (الضمان) claim" },
  { pattern: /شهادة النظافة|شهادة اعتماد|شهادة معتمدة/, why: "an Arabic hygiene-certificate (شهادة النظافة) claim" },
  { pattern: /متوافق|معتمد/, why: "an Arabic compliant/approved (متوافق، معتمد) claim" },
  { pattern: /\bguarantee[sd]?\b|\bguaranteeing\b/i, why: "a guarantee claim" },
  { pattern: /\bcertified\b|\bcertification\b/i, why: "a certification claim" },
  { pattern: /\bcompliant\b|\bcompliance\b/i, why: "a compliance claim" },
  { pattern: /bank[- ]grade/i, why: "a bank-grade security claim" },
  { pattern: /\bPCI(-| )?DSS\b/i, why: "a PCI-DSS statement about PRIMORA" },
  { pattern: /\bvetted\b|top 1%|أفضل 1%|نخبة مصفاة/i, why: "a vetting claim the review process does not back" },
  { pattern: /\b24\/7\b|thousands of /i, why: "an availability or scale claim nothing measures" },
  { pattern: /\bTLS 1\.3\b/i, why: "a protocol version the platform does not control" },
];

describe("public pages promise only what the platform does", () => {
  for (const rule of UNBACKED_CLAIMS) {
    it(`have no ${rule.why}`, () => {
      const hits = publicFiles.filter((f) => rule.pattern.test(f.code)).map((f) => f.path);
      assert.deepEqual(hits, [], `${rule.why} found in: ${hits.join(", ")}`);
    });
  }

  it("quote no commission rate or plan price that is typed into the page", () => {
    // Fee rates and plan prices come from fee_rules / subscription_plans (or the signed agreement), never from page copy.
    const marketing = publicFiles.filter((f) => /^web_platform\/src\/app\/(page\.tsx|about\/|become-provider\/)/.test(f.path));
    const hits = marketing.filter((f) => /\d+(\.\d+)?\s*%\s*(platform\s*)?commission|commission[^"\n]{0,30}\d+\s*%|\b\d{2,4}\s*(SAR|ريال)\s*\/\s*(month|شهر)/i.test(f.code)).map((f) => f.path);
    assert.deepEqual(hits, [], `typed fee or price in: ${hits.join(", ")}`);
  });

  it("show no featured listing or price that is written into the landing page", () => {
    const code = files.find((f) => f.path === "web_platform/src/app/page.tsx").code;
    assert.ok(!/Starting from \d+ SAR|تبدأ من \d+ ريال|Riyadh Apothecary/.test(code), "the landing page must not invent a featured space or a price");
  });
});

describe("consent and data requests are written through their commands", () => {
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.code]));

  it("login, the booking dialog and the privacy page never insert into the evidence tables", () => {
    for (const path of ["web_platform/src/app/login/page.tsx", "web_platform/src/app/shop/[id]/page.tsx", "web_platform/src/app/privacy/page.tsx", "web_platform/src/app/become-provider/page.tsx"]) {
      assert.ok(!/from\("consents"\)\s*\.(insert|upsert|update)/.test(byPath[path]), `${path} must record consent through record_consents`);
      assert.ok(!/from\("data_subject_requests"\)\s*\.(insert|upsert|update)/.test(byPath[path]), `${path} must file requests through submit_data_request`);
      assert.ok(!/from\("agreement_acceptances"\)\s*\.(insert|upsert|update)/.test(byPath[path]), `${path} must record acceptance through record_agreement_acceptance`);
      assert.ok(!/document_version:\s*["']v1\.0["']/.test(byPath[path]), `${path} must send the published agreement version, not a typed one`);
    }
    assert.ok(byPath["web_platform/src/app/login/page.tsx"].includes('rpc("record_consents"'));
    assert.ok(byPath["web_platform/src/app/shop/[id]/page.tsx"].includes('rpc("record_consents"'));
    assert.ok(byPath["web_platform/src/app/privacy/page.tsx"].includes('rpc("submit_data_request"'));
    assert.ok(byPath["web_platform/src/app/become-provider/page.tsx"].includes('rpc("record_agreement_acceptance"'));
  });

  it("a failed consent write is surfaced, not swallowed", () => {
    for (const path of ["web_platform/src/app/login/page.tsx", "web_platform/src/app/shop/[id]/page.tsx"]) {
      assert.ok(!/Consent registration notice/.test(byPath[path]), `${path} must not log-and-continue on a failed consent`);
      assert.ok(/consentError/.test(byPath[path]), `${path} must read the error of the consent command`);
    }
  });

  it("the booking dialog asks for the terms with a required, linked checkbox", () => {
    const code = byPath["web_platform/src/app/shop/[id]/page.tsx"];
    assert.ok(code.includes('href="/terms"') && code.includes('href="/privacy"') && code.includes("authConsentTerms"), "terms and privacy links with a terms checkbox");
    assert.ok(/authConsentTerms[\s\S]{0,400}required/.test(code), "the terms checkbox is required");
  });
});

describe("the booking page is operable by keyboard and screen reader", () => {
  const code = files.find((f) => f.path === "web_platform/src/app/shop/[id]/page.tsx").code;

  it("has no clickable div cards and no hand-made overlay", () => {
    assert.ok(!/<div[^>]*onClick=/.test(code), "an element with a click handler must be a button");
    assert.ok(!code.includes("fixed inset-0"), "dialogs go through PublicDialog (ModalOverlay)");
    assert.ok(code.includes("<PublicDialog"), "the waitlist and phone dialogs use the shared dialog");
  });

  it("names its controls", () => {
    assert.ok(code.includes('htmlFor="shop-date"') && code.includes("min={todayKey}"), "the date input is labelled and has a minimum");
    assert.ok((code.match(/aria-pressed=/g) || []).length >= 4, "service, specialist and slot choices expose their state");
    assert.ok(code.includes("aria-label={t.closeDialog}"), "dialog close buttons are named");
  });

  it("formats times and money through the shared formatters", () => {
    assert.ok(!code.includes('toLocaleTimeString("en-US"'), "slot times follow the page language and Riyadh time");
    assert.ok(!/\} SAR\b/.test(code), "amounts go through sar()");
  });
});
