// A real QR code drawn locally. The encoder is `toqr` (MIT, a small QR encoder that was already in the lockfile through Expo); this
// module turns its modules into an SVG path and into a printable page. Nothing is sent to a third party, and every text that reaches
// the printable HTML is escaped (a business name is typed by its owner).
//
// Plain ES module with JSDoc types so the web tests run it directly.
import { toQR } from "toqr";

/**
 * @param {string} text what the code opens, for example a booking link
 * @returns {{ size: number, dark: (x: number, y: number) => boolean }}
 */
export function qrMatrix(text) {
  const flat = toQR(String(text), 0);
  const size = Math.round(Math.sqrt(flat.length));
  if (size * size !== flat.length || size < 21 || (size - 17) % 4 !== 0) throw new Error("The QR encoder returned an unexpected shape");
  return { size, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && flat[y * size + x] === 1 };
}

/**
 * The dark modules as one SVG path (runs of modules per row), with the four-module quiet zone scanners need.
 * @param {string} text
 * @param {number} [quiet]
 * @returns {{ size: number, d: string }}
 */
export function qrSvgPath(text, quiet = 4) {
  const { size, dark } = qrMatrix(text);
  let d = "";
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!dark(x, y)) { x += 1; continue; }
      let run = 1;
      while (x + run < size && dark(x + run, y)) run += 1;
      d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size: size + quiet * 2, d };
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/**
 * A page a salon can print and put on the counter.
 * @param {{ title: string, caption: string, url: string, printLabel: string, lang: "en" | "ar" }} input
 */
export function printableQrHtml({ title, caption, url, printLabel, lang }) {
  const { size, d } = qrSvgPath(url);
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${lang === "ar" ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif;text-align:center}` +
    `svg{width:320px;height:320px}p{max-width:340px;word-break:break-all;font-size:12px;color:#444}button{margin-top:16px;padding:8px 18px;font-size:14px}@media print{button{display:none}}</style></head>` +
    `<body><h2>${escapeHtml(title)}</h2><p style="font-size:16px;color:#111">${escapeHtml(caption)}</p>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(caption)}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>` +
    `<p>${escapeHtml(url)}</p><button type="button" onclick="window.print()">${escapeHtml(printLabel)}</button></body></html>`;
}
