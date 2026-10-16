import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// F1, F2 and F3 of docs/reviews/2026-10-16-security-final-recheck.md: what the console says when the server refuses or defers.
const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src", path), "utf8");

describe("F1: a profile clear under a legal hold", () => {
  it("the customers screen names the hold refusal in English and Arabic", () => {
    const src = read("app/admin/customers/page.tsx");
    assert.match(src, /errorHint\(error\) === "legal_hold_active" \? t\.clearHeld/);
    assert.equal((src.match(/clearHeld: "/g) ?? []).length, 2);
  });

  it("the approvals inbox shows the approver the hold on a pending profile clear", () => {
    const src = read("app/admin/approvals/page.tsx");
    assert.match(src, /legal_hold\?: \{/);
    assert.match(src, /row\.legal_hold \? t\.profileClearHeld/);
    assert.equal((src.match(/profileClearHeld: "/g) ?? []).length, 2);
  });
});

describe("F2: the customer lookup contract", () => {
  const src = read("app/admin/privacy/customer-picker.tsx");
  it("uses the last-name initial, never a full last name", () => {
    assert.match(src, /last_initial: string \| null/);
    assert.doesNotMatch(src, /last_name/);
  });
  it("explains a partial e-mail or phone and the rate limit in English and Arabic", () => {
    for (const key of ["emailIncomplete", "phoneIncomplete", "limited"]) {
      assert.equal((src.match(new RegExp(`${key}: "`, "g")) ?? []).length, 2, key);
    }
    assert.match(src, /hint === "email_incomplete" \? t\.emailIncomplete/);
    assert.match(src, /hint === "phone_incomplete" \? t\.phoneIncomplete/);
    assert.match(src, /if \(result\.refused\)/);
  });
  it("names the lookup-limit alert in the approvals inbox in both languages", () => {
    const inbox = read("app/admin/approvals/page.tsx");
    assert.equal((inbox.match(/privacy_lookup_limit_reached: "/g) ?? []).length, 2);
  });
});
