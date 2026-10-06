// CSV files that open correctly in spreadsheet programs. Rows end in CRLF, cells containing a comma, quote or
// line break are quoted, the file starts with a byte-order mark so Arabic text survives Excel, and a text cell
// that begins like a formula is kept as text so a provider's business name cannot run as one when the file is
// opened (formula injection).
//
// Plain ES module with JSDoc types so the web tests run it directly on any Node version.

/** @typedef {string | number | boolean | null | undefined} CsvValue */

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * @param {CsvValue} value
 * @returns {string}
 */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text;
  if (typeof value === "number") {
    // Numbers are written as numbers (a negative amount stays -5); NaN and infinities are left empty.
    if (!Number.isFinite(value)) return "";
    text = String(value);
  } else {
    text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
  }
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {readonly string[]} headers
 * @param {readonly (readonly CsvValue[])[]} rows
 * @returns {string}
 */
export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Hands the file to the browser as a download. Browser only.
 * @param {string} filename
 * @param {string} csv
 */
export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
