"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { OperationsField as Field, OperationsPanel as Panel, operationsButton as button, operationsInput as input, type OperationsLocale } from "@/components/operations-ui";
import type { ConfirmOptions } from "@/components/modal";
import { describeProfessionalError, identityCopy, pick, type OwnPortfolioItem } from "@/lib/professional-identity";

const primary = "rounded-xl bg-[#D1AF47] px-5 py-2.5 text-sm font-black text-[#070B12] transition hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-60";

// The https links a professional shows as portfolio. Adding keeps what was typed when the server refuses the link.
export function PortfolioPanel({ locale, items, onChanged, ask }: {
  locale: OperationsLocale;
  items: OwnPortfolioItem[];
  onChanged: (message: string) => void;
  ask: (options: ConfirmOptions) => Promise<boolean>;
}) {
  const t = identityCopy[locale];
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!/^https:\/\/\S+$/.test(url.trim())) { setError(t.portfolioInvalid); return; }
    setBusy("add");
    setError("");
    const { error: failure } = await supabase.rpc("add_professional_portfolio_item", { p_title_en: titleEn || null, p_title_ar: titleAr || null, p_url: url.trim() });
    setBusy("");
    if (failure) { setError(`${t.commandFailed}${describeProfessionalError(failure, locale)}`); return; }
    setTitleEn(""); setTitleAr(""); setUrl("");
    onChanged(t.portfolioAdded);
  };

  const remove = async (item: OwnPortfolioItem) => {
    const ok = await ask({
      title: t.portfolioRemoveTitle,
      intro: t.portfolioRemoveIntro,
      facts: [{ label: t.portfolioUrl, value: item.url }],
      confirmLabel: t.portfolioRemove,
      tone: "danger",
    });
    if (!ok) return;
    setBusy(item.id);
    setError("");
    const { error: failure } = await supabase.rpc("remove_professional_portfolio_item", { p_item_id: item.id });
    setBusy("");
    if (failure) { setError(`${t.commandFailed}${describeProfessionalError(failure, locale)}`); return; }
    onChanged(t.portfolioRemoved);
  };

  return (
    <Panel title={t.portfolio}>
      <p className="mb-4 text-sm text-[#667085]">{t.portfolioHint}</p>
      {items.length === 0 ? (
        <p className="mb-4 text-sm text-[#667085]">{t.portfolioEmpty}</p>
      ) : (
        <ul className="mb-5 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#101828]">{pick(locale, item.title_en, item.title_ar) || item.url}</p>
                <p className="break-all text-xs text-[#667085]" dir="ltr">{item.url}</p>
              </div>
              <button type="button" className={button} disabled={busy === item.id} onClick={() => void remove(item)}
                aria-label={`${t.portfolioRemove}: ${pick(locale, item.title_en, item.title_ar) || item.url}`}>
                {t.portfolioRemove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void add(event)} className="grid gap-4 md:grid-cols-2" noValidate>
        <Field label={t.portfolioTitleEn}><input className={input} dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={100} disabled={busy === "add"} /></Field>
        <Field label={t.portfolioTitleAr}><input className={input} dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={100} disabled={busy === "add"} /></Field>
        <div className="md:col-span-2">
          <Field label={t.portfolioUrl}><input className={input} dir="ltr" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} placeholder="https://" disabled={busy === "add"} /></Field>
        </div>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 md:col-span-2">{error}</div>}
        <div className="flex justify-end md:col-span-2">
          <button type="submit" className={primary} disabled={busy === "add"}>{busy === "add" ? t.saving : t.portfolioAdd}</button>
        </div>
      </form>
    </Panel>
  );
}
