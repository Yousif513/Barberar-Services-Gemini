import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { consentsToRecord, grantedPurposes } from "../src/lib/consent.ts";

describe("consents recorded at sign-in", () => {
  it("records terms for a new customer, and WhatsApp only when chosen", () => {
    assert.deepEqual(consentsToRecord([], false), ["terms_privacy"]);
    assert.deepEqual(consentsToRecord([], true), ["terms_privacy", "whatsapp"]);
  });
  it("does not repeat a purpose that is already granted", () => {
    const rows = [{ purpose: "terms_privacy", status: "granted", created_at: "2026-10-01T00:00:00Z" }];
    assert.deepEqual(consentsToRecord(rows, false), []);
    assert.deepEqual(consentsToRecord(rows, true), ["whatsapp"]);
  });
  it("asks again when the newest row withdrew the consent", () => {
    const rows = [
      { purpose: "whatsapp", status: "granted", created_at: "2026-10-01T00:00:00Z" },
      { purpose: "whatsapp", status: "withdrawn", created_at: "2026-10-02T00:00:00Z" },
    ];
    assert.equal(grantedPurposes(rows).has("whatsapp"), false);
    assert.deepEqual(consentsToRecord(rows, true), ["terms_privacy", "whatsapp"]);
  });
});
