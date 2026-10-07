import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeSaudiMobile, toAsciiDigits } from "../src/lib/phone.mjs";
import { parseSlotLabel, slotIso } from "../src/lib/calendar-slots.mjs";

describe("normalizeSaudiMobile (R36, C-D15)", () => {
  const expected = "+966501234567";
  for (const input of [
    "0501234567", "050 123 4567", "050-123-4567", "501234567", "966501234567", "+966501234567",
    "+966 50 123 4567", "00966501234567", "(+966) 50-123-4567", " 0501234567 ",
    "٠٥٠١٢٣٤٥٦٧", "+٩٦٦٥٠١٢٣٤٥٦٧", "٠٠٩٦٦٥٠١٢٣٤٥٦٧", "۰۵۰۱۲۳۴۵۶۷",
  ]) {
    it(`reads ${JSON.stringify(input)}`, () => assert.equal(normalizeSaudiMobile(input), expected));
  }
  for (const input of ["", "   ", null, undefined, "12345", "0401234567", "+971501234567", "05012345678", "966401234567", "abc", "+966 5012"]) {
    it(`rejects ${JSON.stringify(input)}`, () => assert.equal(normalizeSaudiMobile(input), null));
  }
  it("converts Arabic-Indic and extended digits only", () => {
    assert.equal(toAsciiDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹ abc 5"), "0123456789 0123456789 abc 5");
  });
});

describe("calendar slot labels (R4, C-D15)", () => {
  it("reads twelve-hour labels including noon and midnight", () => {
    assert.deepEqual(parseSlotLabel("12:00 PM"), { hours: 12, minutes: 0 });
    assert.deepEqual(parseSlotLabel("12:30 AM"), { hours: 0, minutes: 30 });
    assert.deepEqual(parseSlotLabel("03:30 PM"), { hours: 15, minutes: 30 });
    assert.deepEqual(parseSlotLabel("09:00 PM"), { hours: 21, minutes: 0 });
    assert.equal(parseSlotLabel("25:00 PM"), null);
    assert.equal(parseSlotLabel("noon"), null);
  });
  it("builds a Riyadh instant that does not depend on the browser's time zone", () => {
    assert.equal(slotIso("2026-10-08", "03:30 PM"), "2026-10-08T15:30:00+03:00");
    assert.equal(slotIso("2026-10-08", "08:00 AM"), "2026-10-08T08:00:00+03:00");
    assert.equal(new Date(slotIso("2026-10-08", "12:00 AM")).toISOString(), "2026-10-07T21:00:00.000Z");
    assert.equal(slotIso("08/10/2026", "08:00 AM"), null);
    assert.equal(slotIso("2026-10-08", "later"), null);
  });
});
