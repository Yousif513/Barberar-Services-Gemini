// Saudi mobile numbers as people actually type and paste them: Arabic-Indic digits, spaces and dashes, a leading 05, 5,
// 966, 00966 or +966. Everything that is a Saudi mobile becomes +9665XXXXXXXX (the form the database stores and matches on);
// anything else comes back as null so a screen can say which row it rejected.
//
// Plain ES module with JSDoc types so the web tests run it directly.

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/**
 * @param {string} text
 * @returns {string}
 */
export function toAsciiDigits(text) {
  let out = "";
  for (const char of String(text ?? "")) {
    const a = ARABIC_INDIC.indexOf(char);
    const b = EXTENDED_ARABIC_INDIC.indexOf(char);
    out += a >= 0 ? String(a) : b >= 0 ? String(b) : char;
  }
  return out;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function normalizeSaudiMobile(input) {
  const typed = toAsciiDigits(String(input ?? ""))
    .replace(/[\s\-().‎‏‪-‮]/g, "");
  if (!typed) return null;
  let digits;
  if (typed.startsWith("+")) digits = typed.slice(1);
  else if (typed.startsWith("00")) digits = typed.slice(2);
  else if (typed.startsWith("05") && typed.length === 10) digits = `966${typed.slice(1)}`;
  else if (typed.startsWith("5") && typed.length === 9) digits = `966${typed}`;
  else digits = typed;
  return /^9665\d{8}$/.test(digits) ? `+${digits}` : null;
}
