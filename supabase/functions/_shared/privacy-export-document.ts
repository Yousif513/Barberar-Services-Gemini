// Q1.5 (docs/legal/2026-10-10-privacy-decision-memo.md): the copy of a customer's personal data, as a machine-readable JSON file
// and a human-readable PDF in Arabic and English. Pure module: the PDF library and the fonts are passed in, so the Edge Function
// (Deno, npm: imports) and the Node tests run the same code. Nothing here reads the database or the network.
//
// Arabic in the PDF: fontkit shapes an Arabic run (joining forms) and returns its glyphs in visual (right-to-left) order. A line
// that mixes Arabic with Latin letters or digits is split into runs; an Arabic paragraph places its runs from the right edge, a
// Latin paragraph from the left. Characters neither font has are replaced with "?" so the PDF is always produced.

export type Payload = Record<string, unknown>;
export type Fonts = { arabic: Uint8Array; latin: Uint8Array };
// The parts of pdf-lib this module uses (pdf-lib@1.17.1).
// deno-lint-ignore no-explicit-any
export type PdfLib = { PDFDocument: any; rgb: (r: number, g: number, b: number) => unknown };

export const SECTIONS: { key: string; en: string; ar: string }[] = [
  { key: "profile", en: "Profile", ar: "الملف الشخصي" },
  { key: "addresses", en: "Addresses", ar: "العناوين" },
  { key: "bookings", en: "Bookings", ar: "الحجوزات" },
  { key: "payments", en: "Payments", ar: "المدفوعات" },
  { key: "invoices", en: "Invoices", ar: "الفواتير" },
  { key: "messages", en: "Messages you sent and received", ar: "الرسائل المرسلة والمستلمة" },
  { key: "reviews", en: "Reviews", ar: "التقييمات" },
  { key: "consents", en: "Consents", ar: "الموافقات" },
  { key: "health_intake", en: "Health-intake answers", ar: "إجابات الاستبيان الصحي" },
  { key: "privacy_requests", en: "Privacy requests", ar: "طلبات الخصوصية" },
];

export const INTRO = {
  en: "This is a copy of the personal data PRIMORA holds about you. The JSON file delivered with it holds the same data in a machine-readable form. The other party's contact details in messages are removed. A printed copy is available on request. This copy is free of charge.",
  ar: "هذه نسخة من البيانات الشخصية التي تحتفظ بها بريمورا عنك. يحتوي ملف JSON المرفق على البيانات نفسها بصيغة قابلة للقراءة آلياً. حُذفت بيانات التواصل الخاصة بالطرف الآخر من الرسائل. تتوفر نسخة مطبوعة عند الطلب. هذه النسخة مجانية.",
};

export function exportPaths(subjectId: string, requestId: string): { json: string; pdf: string } {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(subjectId) || !uuid.test(requestId)) throw new Error("subject and request must be UUIDs");
  return { json: `${subjectId}/${requestId}/personal-data.json`, pdf: `${subjectId}/${requestId}/personal-data.pdf` };
}

export function buildExportJson(payload: Payload): string {
  return JSON.stringify(payload, null, 2);
}

// Rows of one section as text lines ("label: value"); an empty section says so in both languages.
export function sectionLines(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    value.forEach((item, i) => {
      if (item !== null && typeof item === "object") {
        out.push(`${prefix}#${i + 1}`);
        out.push(...sectionLines(item, prefix ? `${prefix}  ` : "  "));
      } else {
        out.push(`${prefix}${String(item)}`);
      }
    });
    return out;
  }
  if (typeof value === "object") {
    const out: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null || v === undefined || v === "") continue;
      if (typeof v === "object") {
        const nested = sectionLines(v, `${prefix}  `);
        if (nested.length) out.push(`${prefix}${k.replace(/_/g, " ")}:`, ...nested);
      } else {
        out.push(`${prefix}${k.replace(/_/g, " ")}: ${String(v)}`);
      }
    }
    return out;
  }
  return [`${prefix}${String(value)}`];
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function paragraphIsRtl(text: string): boolean {
  return ARABIC.test(text);
}

// Splits text into script runs. Spaces and punctuation stay with the run they follow, so word spacing survives the reordering.
export function splitRuns(text: string): { text: string; arabic: boolean }[] {
  const runs: { text: string; arabic: boolean }[] = [];
  for (const ch of Array.from(text)) {
    const neutral = /[\s.,:;!?()\-–"'/]/.test(ch);
    const arabic = ARABIC.test(ch);
    const last = runs[runs.length - 1];
    if (last && (neutral || last.arabic === arabic)) last.text += ch;
    else runs.push({ text: ch, arabic: neutral ? false : arabic });
  }
  return runs;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
export function fontsFromBase64(arabic: string, latin: string): Fonts {
  return { arabic: base64ToBytes(arabic), latin: base64ToBytes(latin) };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// deno-lint-ignore no-explicit-any
type Font = any;

export async function buildExportPdf(lib: PdfLib, fontkit: unknown, payload: Payload, fonts: Fonts): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.create();
  doc.registerFontkit(fontkit);
  const ar: Font = await doc.embedFont(fonts.arabic, { subset: true });
  const la: Font = await doc.embedFont(fonts.latin, { subset: true });
  const arSet = new Set<number>(ar.getCharacterSet());
  const laSet = new Set<number>(la.getCharacterSet());
  doc.setTitle("PRIMORA - personal data copy");
  doc.setCreator("PRIMORA");
  doc.setProducer("PRIMORA privacy export");

  const W = 595.28, H = 841.89, M = 40, LINE = 14;
  const black = lib.rgb(0.1, 0.1, 0.1), gold = lib.rgb(0.55, 0.42, 0.13), grey = lib.rgb(0.4, 0.4, 0.4);
  let page = doc.addPage([W, H]);
  let y = H - M;

  // A run is drawn with the font that has its characters; anything neither font has becomes "?".
  const clean = (text: string, arabic: boolean) =>
    Array.from(text).map((c) => {
      const cp = c.codePointAt(0) ?? 63;
      if (arabic ? arSet.has(cp) : laSet.has(cp)) return c;
      if (!arabic && arSet.has(cp)) return c;
      return /\s/.test(c) ? " " : "?";
    }).join("");
  const runFont = (run: { text: string; arabic: boolean }) => (run.arabic ? ar : (Array.from(run.text).every((c) => laSet.has(c.codePointAt(0) ?? 0)) ? la : ar));
  const runWidth = (run: { text: string; arabic: boolean }, size: number) => runFont(run).widthOfTextAtSize(clean(run.text, run.arabic), size);
  const lineWidth = (text: string, size: number) => splitRuns(text).reduce((w, r) => w + runWidth(r, size), 0);

  const newPageIfNeeded = (need: number) => {
    if (y - need < M) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const drawLine = (text: string, size: number, color: unknown, rtl: boolean, indent = 0) => {
    newPageIfNeeded(size + 4);
    const runs = splitRuns(text);
    if (rtl) {
      let x = W - M - indent;
      for (const raw of runs) {
        // A left-to-right run inside a right-to-left line keeps its trailing space on its left, next to the following word.
        const run = raw.arabic ? raw : { ...raw, text: raw.text.replace(/^(.*?)(\s+)$/, "$2$1") };
        const w = runWidth(run, size);
        x -= w;
        page.drawText(clean(run.text, run.arabic), { x, y, size, font: runFont(run), color });
      }
    } else {
      let x = M + indent;
      for (const run of runs) {
        page.drawText(clean(run.text, run.arabic), { x, y, size, font: runFont(run), color });
        x += runWidth(run, size);
      }
    }
    y -= size + 4;
  };
  // Greedy word wrap within the page width.
  const paragraph = (text: string, size: number, color: unknown, indent = 0) => {
    const rtl = paragraphIsRtl(text);
    const max = W - 2 * M - indent;
    const words = text.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (lineWidth(next, size) <= max || !line) {
        // A single word wider than the line is cut.
        if (!line && lineWidth(word, size) > max) {
          let piece = "";
          for (const ch of Array.from(word)) {
            if (lineWidth(piece + ch, size) > max) { drawLine(piece, size, color, rtl, indent); piece = ""; }
            piece += ch;
          }
          line = piece;
        } else {
          line = next;
        }
      } else {
        drawLine(line, size, color, rtl, indent);
        line = word;
      }
    }
    if (line) drawLine(line, size, color, rtl, indent);
  };

  const req = (payload.request ?? {}) as Record<string, unknown>;
  drawLine("PRIMORA - Copy of your personal data", 16, gold, false);
  y += 20;
  drawLine("نسخة من بياناتك الشخصية لدى بريمورا", 16, gold, true);
  y -= 6;
  paragraph(`Generated ${String(req.generated_at ?? "")}  ·  Request ${String(req.id ?? "")}`, 9, grey);
  paragraph(INTRO.en, 10, black);
  paragraph(INTRO.ar, 10, black);
  y -= LINE / 2;

  for (const s of SECTIONS) {
    newPageIfNeeded(40);
    y -= 6;
    drawLine(s.en, 12, gold, false);
    y += 16;
    drawLine(s.ar, 12, gold, true);
    const lines = sectionLines(payload[s.key]);
    if (lines.length === 0) {
      paragraph("Nothing held.", 9, grey);
      paragraph("لا توجد بيانات.", 9, grey);
      continue;
    }
    for (const l of lines) {
      const indent = (l.match(/^ */)?.[0].length ?? 0) * 4;
      paragraph(l.trim(), 9, black, indent);
    }
  }
  return await doc.save();
}
