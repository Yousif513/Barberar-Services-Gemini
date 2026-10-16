"use client";

import React from "react";
import { useOperationsLocale } from "@/components/operations-ui";
import { ROPA_MARKDOWN, ROPA_SHA256, ROPA_SOURCE } from "@/lib/ropa-document";

// X2 (docs/legal/2026-10-10-privacy-decision-memo.md): the Record of Processing Activities, read-only. The controlled source is the
// versioned document docs/privacy/ropa.md (copied into the bundle by scripts/build-ropa.mjs, checked by a test); changes are made
// there, reviewed, and rebuilt. The register itself is in English as maintained by the DPO; the frame of this screen is bilingual.

const copy = {
  en: { title: "Processing Register (RoPA)", subtitle: "Read-only. The controlled source is the versioned document; changes are made there and reviewed every quarter and on every schema change that adds personal data.", englishOnly: "", source: "Source", digest: "SHA-256", ownerFields: "{n} fields wait for the owner (marked OWNER MUST COMPLETE)." },
  ar: { title: "سجل أنشطة المعالجة", subtitle: "للقراءة فقط. المصدر المعتمد هو الوثيقة ذات الإصدارات؛ تُجرى التعديلات فيها وتُراجع كل ربع سنة وعند كل تغيير يضيف بيانات شخصية. ", englishOnly: "السجل المعتمد أدناه محفوظ باللغة الإنجليزية فقط كما يعتمده مسؤول حماية البيانات، ولا توجد له نسخة عربية معتمدة؛ لذلك يُعرض كما هو دون ترجمة.", source: "المصدر", digest: "SHA-256", ownerFields: "{n} حقول بانتظار المالك (موسومة OWNER MUST COMPLETE)." },
};

type Block = { kind: "h1" | "h2" | "p"; text: string } | { kind: "table"; rows: string[][] };

function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let table: string[][] | null = null;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue;
      if (!table) { table = []; blocks.push({ kind: "table", rows: table }); }
      table.push(cells);
      continue;
    }
    table = null;
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push({ kind: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ kind: "h1", text: line.slice(2) });
    else {
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "p") last.text += ` ${line}`;
      else blocks.push({ kind: "p", text: line });
    }
  }
  return blocks;
}

// **bold** and `code` only; everything else is plain text (no HTML is ever injected).
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) =>
    part.startsWith("**") ? <strong key={i} className={part.includes("OWNER MUST COMPLETE") ? "rounded bg-amber-100 px-1 text-amber-900" : undefined}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") ? <code key={i} className="rounded bg-gray-100 px-1 font-mono text-[11px]">{part.slice(1, -1)}</code> : <React.Fragment key={i}>{part}</React.Fragment>);
}

const blocks = parse(ROPA_MARKDOWN);
const ownerFields = (ROPA_MARKDOWN.match(/OWNER MUST COMPLETE/g) ?? []).length;

export default function AdminRopa() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-gray-500">{t.subtitle}</p>
        <p className="mt-2 text-[11px] text-gray-500">{t.source}: <bdi dir="ltr" className="font-mono">{ROPA_SOURCE}</bdi> · {t.digest} <bdi dir="ltr" className="font-mono">{ROPA_SHA256.slice(0, 16)}…</bdi></p>
        <p role="status" className="mt-2 inline-block rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{t.ownerFields.replace("{n}", ownerFields.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"))}</p>
        {t.englishOnly && <p role="note" className="mt-2 rounded-lg border border-[#D0D5DD] bg-[#F9FAFB] px-3 py-2 text-xs font-semibold text-[#344054]">{t.englishOnly}</p>}
      </div>
      <article dir="ltr" lang="en" className="space-y-4 rounded-2xl border border-[#ECECEC] bg-white p-5 text-start text-sm leading-6 text-gray-800">
        {blocks.map((b, i) => {
          if (b.kind === "h1") return <h2 key={i} className="font-serif text-xl font-black text-gray-900">{inline(b.text)}</h2>;
          if (b.kind === "h2") return <h3 key={i} className="pt-2 font-serif text-lg font-black text-gray-900">{inline(b.text)}</h3>;
          if (b.kind === "p") return <p key={i}>{inline(b.text)}</p>;
          if (b.kind !== "table") return null;
          const [head, ...body] = b.rows;
          return (
            <div key={i} role="region" aria-label={head.join(", ")} tabIndex={0} className="overflow-x-auto rounded-xl border border-[#ECECEC] focus-visible:outline-2 focus-visible:outline-[#9B7928]">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-[#FAFAF7] text-[11px] font-extrabold text-[#667085]"><tr>{head.map((h, j) => <th key={j} scope="col" className="px-3 py-2 text-start">{inline(h)}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#F2F4F7]">{body.map((row, r) => <tr key={r}>{row.map((c, j) => <td key={j} className="px-3 py-2 align-top">{inline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        })}
      </article>
    </div>
  );
}
