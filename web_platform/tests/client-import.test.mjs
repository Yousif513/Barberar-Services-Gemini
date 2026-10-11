import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_ROWS, parseClientCsv, parseCsvRecords } from "../src/lib/client-import.mjs";

describe("parseCsvRecords (R36)", () => {
  it("handles quotes, doubled quotes, commas and line breaks inside quotes", () => {
    const records = parseCsvRecords('"Al-Harbi, Sara","+966501234567","Likes ""organic"" oil\nand quiet"\nFahad,0551234567,');
    assert.deepEqual(records.map((r) => r.fields), [
      ["Al-Harbi, Sara", "+966501234567", 'Likes "organic" oil\nand quiet'],
      ["Fahad", "0551234567", ""],
    ]);
    assert.equal(records[1].line, 3, "line numbers follow the file, including lines inside quotes");
  });
  it("accepts CRLF, a missing final newline and blank lines", () => {
    const records = parseCsvRecords("a,b\r\n\r\nc,d");
    assert.deepEqual(records.map((r) => r.fields), [["a", "b"], ["c", "d"]]);
  });
});

describe("parseClientCsv (R36)", () => {
  it("skips an English header row and reads the rest", () => {
    const parsed = parseClientCsv("Name,Phone,Notes\nSara Al-Harbi,0501234567,Prefers oil\nFahad,+966551234567,");
    assert.equal(parsed.headerSkipped, true);
    assert.deepEqual(parsed.rows.map((r) => [r.name, r.phone, r.notes]), [
      ["Sara Al-Harbi", "+966501234567", "Prefers oil"],
      ["Fahad", "+966551234567", ""],
    ]);
    assert.deepEqual(parsed.rejected, []);
  });
  it("skips an Arabic header row", () => {
    const parsed = parseClientCsv("الاسم,الجوال,ملاحظات\nسارة الحربي,٠٥٠١٢٣٤٥٦٧,تفضل الزيوت");
    assert.equal(parsed.headerSkipped, true);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].phone, "+966501234567");
    assert.equal(parsed.rows[0].notes, "تفضل الزيوت");
  });
  it("does not mistake a first client for a header", () => {
    const parsed = parseClientCsv("Sara,0501234567,Name of her salon\nFahad,0551234567,");
    assert.equal(parsed.headerSkipped, false);
    assert.equal(parsed.rows.length, 2);
  });
  it("normalizes 966, 00966, 5xxxxxxxx and Arabic-Indic numbers", () => {
    const parsed = parseClientCsv("A,966501234561\nB,00966501234562\nC,501234563\nD,٠٥٠١٢٣٤٥٦٤\nE,+966 50 123 4565\nF,(050) 123-4566");
    assert.deepEqual(parsed.rows.map((r) => r.phone), ["+966501234561", "+966501234562", "+966501234563", "+966501234564", "+966501234565", "+966501234566"]);
  });
  it("rejects rows without a phone, with a bad phone, without a name, and duplicates, each with a reason and its line", () => {
    const parsed = parseClientCsv("Sara,0501234567\nNo Phone,\nBad Phone,12345\n,0551234567\nSara Again,966501234567\nOk,0551234568");
    assert.deepEqual(parsed.rows.map((r) => r.name), ["Sara", "Ok"]);
    assert.deepEqual(parsed.rejected.map((r) => [r.line, r.reason]), [[2, "noPhone"], [3, "badPhone"], [4, "noName"], [5, "duplicate"]]);
  });
  it("detects semicolons and tabs", () => {
    assert.equal(parseClientCsv("Name;Phone\nSara;0501234567").rows[0].phone, "+966501234567");
    assert.equal(parseClientCsv("Sara\t0501234567\tnote").rows[0].notes, "note");
  });
  it("keeps notes that contain the delimiter when they were not quoted", () => {
    const parsed = parseClientCsv("Sara,0501234567,likes oil, low fade, quiet room");
    assert.equal(parsed.rows[0].notes, "likes oil, low fade, quiet room");
  });
  it("strips a byte-order mark and ignores an empty file", () => {
    assert.equal(parseClientCsv("﻿Sara,0501234567").rows.length, 1);
    assert.deepEqual(parseClientCsv("").rows, []);
    assert.deepEqual(parseClientCsv("   \n\n").rejected, []);
  });
  it("refuses names and notes longer than the database keeps", () => {
    const parsed = parseClientCsv(`${"x".repeat(121)},0501234567\nOk,0551234567,${"y".repeat(501)}`);
    assert.deepEqual(parsed.rejected.map((r) => r.reason), ["tooLong", "tooLong"]);
  });
  it("caps one import at the server limit and says so", () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 3 }, (_, i) => `Client ${i},+9665${String(10000000 + i)}`);
    const parsed = parseClientCsv(lines.join("\n"));
    assert.equal(parsed.rows.length, MAX_IMPORT_ROWS);
    assert.equal(parsed.tooMany, true);
  });
});
