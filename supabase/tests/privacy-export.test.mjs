import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as pdfLib from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { buildExportJson, buildExportPdf, exportPaths, fontsFromBase64, paragraphIsRtl, SECTIONS, sectionLines, sha256Hex, splitRuns }
  from "../functions/_shared/privacy-export-document.ts";
import { FONT_BASE64 as ARABIC } from "../functions/_shared/fonts/ibm-plex-sans-arabic-regular-arabic.ts";
import { FONT_BASE64 as LATIN } from "../functions/_shared/fonts/ibm-plex-sans-arabic-regular-latin.ts";

// PRIV-2 (Q1.5): the copy is a JSON file plus an Arabic/English PDF, built on the server from the package the database returns.
// The payload below has the shape privacy_export_payload returns; every value is a test value.
const payload = {
  format: "primora-personal-data-copy/1",
  request: { id: "6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11", type: "copy", received_at: "2026-10-01T09:00:00Z", generated_at: "2026-10-11T09:00:00Z" },
  profile: { first_name: "سارة", last_name: "Ahmed", email: "sara@example.test", phone_number: "+966500000001", gender: "female" },
  addresses: [],
  bookings: [{ id: "b1", scheduled_at: "2026-09-01T10:00:00Z", status: "completed", service_en: "Haircut", service_ar: "قص الشعر", total_sar: 100 }],
  payments: { card_note: "Card details are never received by PRIMORA.", charges: [{ amount_sar: 115, payment_reference: "****1234" }] },
  invoices: [],
  messages: [{ business: "Salon One", messages: [{ direction: "sent", text: "هل الساعة 5 متاحة؟ 🙂", at: "2026-09-01T08:00:00Z" }] }],
  reviews: [],
  consents: [{ purpose: "marketing", status: "granted" }],
  health_intake: [{ form_en: "Skin", answers: { allergy: "latex" } }],
  privacy_requests: [],
};

describe("privacy export document", () => {
  it("names the files under the customer's and the request's identifiers only", () => {
    const p = exportPaths("c0000000-0000-4000-8000-000000000001", "6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11");
    assert.equal(p.json, "c0000000-0000-4000-8000-000000000001/6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11/personal-data.json");
    assert.throws(() => exportPaths("../x", "6f1c1a52-6b7e-4f0e-9a52-1f3f6b6f2b11"), /UUIDs/);
  });

  it("keeps the JSON identical to the package and covers every Q1.5 category in the PDF", () => {
    assert.deepEqual(JSON.parse(buildExportJson(payload)), payload);
    for (const key of ["profile", "addresses", "bookings", "payments", "invoices", "messages", "reviews", "consents", "health_intake"]) {
      assert.ok(SECTIONS.some((s) => s.key === key && s.en && s.ar), key);
    }
    assert.ok(sectionLines(payload.health_intake).some((l) => l.includes("allergy: latex")));
    assert.deepEqual(sectionLines([]), []);
  });

  it("splits mixed Arabic and Latin text into runs and detects the paragraph direction", () => {
    assert.equal(paragraphIsRtl("هل الساعة 5 متاحة"), true);
    assert.equal(paragraphIsRtl("Is 5pm free"), false);
    const runs = splitRuns("قص الشعر 100 SAR");
    assert.deepEqual(runs.map((r) => r.arabic), [true, false]);
    assert.equal(runs.map((r) => r.text).join(""), "قص الشعر 100 SAR");
  });

  it("renders a valid PDF with both fonts, replacing characters neither font has", async () => {
    const bytes = await buildExportPdf(pdfLib, fontkit, payload, fontsFromBase64(ARABIC, LATIN));
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const reread = await pdfLib.PDFDocument.load(bytes);
    assert.ok(reread.getPageCount() >= 1);
    assert.equal(reread.getTitle(), "PRIMORA - personal data copy");
    assert.match(await sha256Hex(bytes), /^[0-9a-f]{64}$/);
  });
});
