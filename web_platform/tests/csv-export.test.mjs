import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../src/lib/csv.mjs";

// Executes the CSV writer used by the report exports, so quoting, Arabic text and formula safety are proven by
// running the code rather than by reading it.
describe("csv writer", () => {
  it("quotes cells that contain commas, quotes or line breaks and doubles inner quotes", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
    assert.equal(csvCell(" padded "), '" padded "');
  });

  it("writes numbers as numbers, including negative amounts, and leaves gaps empty", () => {
    assert.equal(csvCell(1234.5), "1234.5");
    assert.equal(csvCell(-5), "-5");
    assert.equal(csvCell(0), "0");
    assert.equal(csvCell(Number.NaN), "");
    assert.equal(csvCell(Number.POSITIVE_INFINITY), "");
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(false), "false");
  });

  it("keeps text that starts like a formula as text", () => {
    for (const hostile of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      const cell = csvCell(hostile);
      assert.ok(cell.replace(/^"/, "").startsWith("'"), `${JSON.stringify(hostile)} must be prefixed, got ${JSON.stringify(cell)}`);
    }
    assert.equal(csvCell("Salon = best"), "Salon = best", "only a leading formula character is guarded");
  });

  it("starts with a byte-order mark, ends rows with CRLF and keeps Arabic intact", () => {
    const csv = toCsv(["المزود", "المبلغ"], [["صالون النخبة", 150.25], ["Cuts, Co", -3]]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.equal(csv, "﻿المزود,المبلغ\r\nصالون النخبة,150.25\r\n\"Cuts, Co\",-3\r\n");
  });

  it("produces a header-only file for no rows", () => {
    assert.equal(toCsv(["a", "b"], []), "﻿a,b\r\n");
  });
});
