import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The UX round-2 browser findings (docs/reviews/2026-10-17-ux-browser-check.md) fixed in the QAFIX pass. The browser run is
// the proof; this keeps the fixes in place.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(repoRoot, "web_platform/src", path), "utf8");

describe("ux2-command-dialog-height-uncapped-confirm-unreachable", () => {
  it("caps the command dialog at the screen height, scrolls its body and keeps the actions in view", () => {
    const modal = read("components/modal.tsx");
    assert.ok(modal.includes('style={{ maxHeight: "calc(100dvh - 2rem)" }}'), "the height is an inline style, independent of the compiled CSS");
    assert.ok(modal.includes('<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">'), "the body scrolls");
    assert.ok(modal.includes('<div className="flex shrink-0 flex-wrap justify-end gap-2 border-t'), "the actions stay at the bottom");
    assert.ok(!modal.includes("max-h-full w-full max-w-lg"), "the class the compiled CSS lacked is gone");
  });
  it("caps every other modal dialog too, as a base-layer default its own utilities can override", () => {
    const css = read("app/globals.css");
    assert.ok(/@layer base \{\s*\[role="dialog"\]\[aria-modal="true"\]:not\(aside\) \{\s*max-height: calc\(100dvh - 2rem\);\s*overflow-y: auto;/.test(css));
  });
});

describe("ux2-approvals-actions-offscreen-at-375", () => {
  it("shows each request as a card with its actions below the md breakpoint and keeps the table above it", () => {
    const code = read("app/admin/approvals/page.tsx");
    assert.ok(code.includes('<ul className="divide-y divide-[#F5F5F5] md:hidden"'));
    assert.ok(code.includes('<div className="hidden overflow-x-auto md:block">'));
    assert.ok(code.includes("{rowActions(row, `${smallButton} min-h-11`)}"), "the phone card carries Approve and Reject at a 44 px target");
    assert.ok(code.includes("{rowActions(row, smallButton)}"), "the table uses the same actions");
  });
});

describe("ux2-arabic-console-shows-english-server-refusals", () => {
  for (const path of ["app/admin/approvals/page.tsx", "app/admin/approvals/governance-notices.tsx", "app/admin/incidents/page.tsx",
    "app/admin/privacy/page.tsx", "app/admin/privacy/customer-picker.tsx", "app/admin/customers/page.tsx"]) {
    it(`${path} words every refusal through describeConsoleError in the reader's language`, () => {
      const code = read(path);
      assert.ok(code.includes("describeConsoleError("), "uses the describer");
      assert.ok(!code.includes("errorMessage("), "never shows the server's English text as it is");
    });
  }
});

describe("ux2-customer-deletion-preview-latin-zero-reads-as-five", () => {
  it("writes the deletion and balance counts in the page's digits", () => {
    const code = read("app/customer/privacy/page.tsx");
    assert.ok(code.includes("p: count(preview.bookings_to_pseudonymise, lang), d: count(preview.bookings_to_delete, lang)"));
    assert.ok(code.includes("w: amount(preview.wallet_balance_sar, lang), s: count(preview.unused_package_sessions, lang)"));
  });
});

describe("retention-purge-console-entry-missing", () => {
  it("offers the dry run and the approval request on the Privacy ledger tab, to privacy approvers only", () => {
    const panel = read("app/admin/privacy/retention-purge.tsx");
    assert.ok(panel.includes('rpc("privacy_purge_expired_retention", { p_dry_run: true, p_reason: null })'));
    assert.ok(panel.includes('rpc("privacy_purge_expired_retention", { p_dry_run: false, p_reason: reason })'));
    assert.ok(panel.includes('knownToHold(useConsoleSession(), ["privacy.approve"])'));
    assert.ok(panel.includes("minReasonLength={10}"), "the server needs at least 10 characters");
    assert.ok(panel.includes('answer?.status !== "pending_approval"'), "a real run is reported only as a request waiting for a second person");
    assert.ok(read("app/admin/privacy/page.tsx").includes("<RetentionPurgePanel lang={lang} onNotice={setNotice} />"));
  });
});

describe("approvals never report a decision the server did not make", () => {
  it("treats the { unchanged: true } answer for a request decided or withdrawn meanwhile as a refusal", () => {
    const code = read("app/admin/approvals/page.tsx");
    assert.ok(code.includes('if (answer?.unchanged || answer?.status !== (decision === "approve" ? "approved" : "rejected"))'));
    assert.ok(code.includes("t.notPendingAnymore"));
  });
});
