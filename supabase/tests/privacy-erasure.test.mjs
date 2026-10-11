import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAuthDelete, planAuthErasures, whatsappChannelKeys, whatsappWaId } from "../functions/_shared/privacy-erasure.ts";
import { consoleCallerDecision, FUNCTION_PERMISSIONS } from "../functions/_shared/console-permission.ts";
import { renderNotice } from "../functions/_shared/governance-notice-delivery.ts";

// PRIV-3 (Q2.1, Q2.7, Q2.8): the pure logic of privacy-erase-account and the customer notices of the privacy workflow.
const A = "c0000000-0000-4000-8000-000000000001";
const B = "c0000000-0000-4000-8000-000000000002";
const R = "6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11";

describe("planAuthErasures", () => {
  it("validates identifiers, puts approved deletions first and never lists one account twice", () => {
    const tasks = planAuthErasures({
      requests: [{ request_id: R, subject_id: A, phone: "+966500000111" }, { request_id: "nope", subject_id: B }],
      restored: [{ subject_id: A }, { subject_id: B }, { subject_id: "../etc" }],
    });
    assert.deepEqual(tasks, [{ kind: "request", requestId: R, subjectId: A, waId: "966500000111" }, { kind: "restored", subjectId: B }]);
    assert.deepEqual(planAuthErasures({}), []);
  });

  it("derives the WhatsApp id from a verified E.164 number and keeps only well-formed channel keys", () => {
    assert.equal(whatsappWaId("+966 50"), null);
    assert.equal(whatsappWaId(null), null);
    assert.deepEqual(whatsappChannelKeys({ whatsapp_channels: ["123456789012345", "x", null] }), ["123456789012345"]);
  });

  it("treats an account already gone as done and anything else as a retry", () => {
    assert.equal(classifyAuthDelete(null), "deleted");
    assert.equal(classifyAuthDelete({ status: 404, message: "User not found" }), "already_gone");
    assert.equal(classifyAuthDelete({ status: 500, message: "upstream" }), "retry");
  });
});

describe("who may run the privacy functions", () => {
  it("needs privacy.approve from a console caller; the scheduler may run both", async () => {
    for (const name of ["privacy-export", "privacy-erase-account"]) {
      const permission = FUNCTION_PERMISSIONS[name];
      assert.equal(permission, "privacy.approve");
      assert.equal((await consoleCallerDecision("admin", true, permission, async (p) => p === "privacy.manage")).allowed, false);
      assert.equal((await consoleCallerDecision("admin", true, permission, async (p) => p === "privacy.approve")).allowed, true);
      assert.equal((await consoleCallerDecision("user", true, permission, async () => true)).allowed, false);
      assert.equal((await consoleCallerDecision("service", true, permission, async () => false)).allowed, true);
    }
  });

  it("the download checks the customer's own token in the database and the 7-day expiry, never trusting the body", () => {
    const src = readFileSync(new URL("../functions/privacy-export-download/index.ts", import.meta.url), "utf8");
    assert.match(src, /privacy_export_authorize_download/);
    assert.match(src, /Authorization: `Bearer \$\{token\}`/);
    assert.match(src, /export_expired/);
    assert.doesNotMatch(src, /Access-Control-Allow-Origin": "\*"/);
  });
});

describe("privacy notices", () => {
  it("send the refusal reason with the right to complain to SDAIA, in Arabic and English", () => {
    const m = renderNotice("privacy_request_refused", { request_type: "copy", reason: "Answered last week in full" });
    assert.match(m.text, /Answered last week in full/);
    assert.match(m.text, /SDAIA/);
    assert.match(m.text, /سدايا/);
  });

  it("list what was deleted and what was kept, with the legal basis, retention end and complaint right (Q2.8)", () => {
    const m = renderNotice("privacy_deletion_completed", {
      retained: [{ category: "tax_invoices", count: 2, basis: "Commercial Books Law Art. 8", until: "2036-12-31" },
                 { category: "bookings_pseudonymised", count: 0, basis: "x", until: null }],
    });
    assert.match(m.text, /tax invoices \(2; Commercial Books Law Art\. 8; until 2036-12-31\)/);
    assert.doesNotMatch(m.text, /bookings pseudonymised/, "an empty category is not listed");
    assert.match(m.text, /within 90 days/);
    assert.match(renderNotice("privacy_request_extended", { request_type: "copy", reason: "Ten years of bookings", extended_due_at: "2026-11-30T09:00:00Z" }).text, /Ten years of bookings/);
  });
});
