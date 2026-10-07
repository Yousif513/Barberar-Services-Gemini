// Reads a client list the way salons actually have one: a file exported from a spreadsheet or a paste from one. Handles quoted
// fields (a comma, a line break or a doubled quote inside quotes), CRLF and a byte-order mark, a header row in English or Arabic,
// commas, semicolons (Excel in Arabic locales) or tabs, Arabic-Indic digits and the 05 / 5 / 966 / 00966 / +966 forms of a Saudi
// mobile number. A row without a usable phone number is rejected with a reason instead of being sent to the server.
//
// Plain ES module with JSDoc types so the web tests run it directly.
import { normalizeSaudiMobile } from "./phone.mjs";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_NAME_LENGTH = 120;
export const MAX_NOTES_LENGTH = 500;

/**
 * @typedef {{ line: number, name: string, phone: string, notes: string }} ImportRow
 * @typedef {{ line: number, reason: "noName" | "noPhone" | "badPhone" | "duplicate" | "tooLong", raw: string }} RejectedRow
 * @typedef {{ rows: ImportRow[], rejected: RejectedRow[], headerSkipped: boolean, delimiter: string, tooMany: boolean }} ParsedClients
 */

/** @param {string} text @returns {string} */
function pickDelimiter(text) {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    let inQuotes = false;
    let count = 0;
    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return best;
}

/**
 * Splits text into records of fields (RFC 4180 quoting).
 * @param {string} text
 * @param {string} delimiter
 * @returns {{ fields: string[], line: number }[]}
 */
export function parseCsvRecords(text, delimiter = ",") {
  const records = [];
  let fields = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  let touched = false;
  const endField = () => { fields.push(field); field = ""; };
  const endRecord = () => {
    endField();
    if (touched || fields.some((value) => value.trim() !== "")) records.push({ fields, line: startLine });
    fields = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") { inQuotes = true; touched = true; continue; }
    if (char === delimiter) { touched = true; endField(); continue; }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      line += 1;
      startLine = line;
      continue;
    }
    field += char;
    touched = true;
  }
  if (field !== "" || fields.length > 0 || touched) endRecord();
  return records;
}

const HEADER_WORD = /^(name|full name|client|client name|customer|phone|mobile|tel|telephone|notes?|note|الاسم|اسم العميل|العميل|الجوال|الهاتف|رقم الجوال|رقم الهاتف|ملاحظات|ملاحظة)$/i;

/** A header row names its columns and holds no phone number. @param {string[]} fields */
function looksLikeHeader(fields) {
  const cells = fields.map((value) => value.trim()).filter(Boolean);
  if (cells.length === 0) return false;
  if (cells.some((cell) => normalizeSaudiMobile(cell))) return false;
  return cells.filter((cell) => HEADER_WORD.test(cell)).length >= Math.min(2, cells.length);
}

/**
 * @param {string} input the file's text or the pasted text
 * @returns {ParsedClients}
 */
export function parseClientCsv(input) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const delimiter = pickDelimiter(text);
  const records = parseCsvRecords(text, delimiter);
  /** @type {ImportRow[]} */
  const rows = [];
  /** @type {RejectedRow[]} */
  const rejected = [];
  const seen = new Set();
  let headerSkipped = false;
  let tooMany = false;
  records.forEach((record, index) => {
    if (index === 0 && looksLikeHeader(record.fields)) { headerSkipped = true; return; }
    const [rawName = "", rawPhone = "", ...rest] = record.fields.map((value) => value.trim());
    const notes = rest.join(delimiter === "," ? ", " : `${delimiter} `).trim();
    const raw = record.fields.join(delimiter).slice(0, 200);
    if (rawName === "" && rawPhone === "") return;
    if (rawName === "") { rejected.push({ line: record.line, reason: "noName", raw }); return; }
    if (rawPhone === "") { rejected.push({ line: record.line, reason: "noPhone", raw }); return; }
    const phone = normalizeSaudiMobile(rawPhone);
    if (!phone) { rejected.push({ line: record.line, reason: "badPhone", raw }); return; }
    if (rawName.length > MAX_NAME_LENGTH || notes.length > MAX_NOTES_LENGTH) { rejected.push({ line: record.line, reason: "tooLong", raw }); return; }
    if (seen.has(phone)) { rejected.push({ line: record.line, reason: "duplicate", raw }); return; }
    if (rows.length >= MAX_IMPORT_ROWS) { tooMany = true; return; }
    seen.add(phone);
    rows.push({ line: record.line, name: rawName, phone, notes });
  });
  return { rows, rejected, headerSkipped, delimiter, tooMany };
}
