"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { describeConsoleError } from "@/lib/console-errors.mjs";
import { operationsInput } from "@/components/operations-ui";
import { errorHint } from "@/lib/step-up";

// Finds the customer of a privacy request received by e-mail, phone or in person (ux1-privacy-log-request-needs-full-customer-
// id-shown-nowhere). The search runs on the server (admin_privacy_find_customers, privacy.manage only), which records each
// lookup and answers at most 10 customer accounts with the e-mail and phone masked. The operator picks one; the form keeps its id.
// F2 (2026-10-16 re-check): an e-mail or phone is matched only whole, a name never matches inside an e-mail, the last name comes
// back as its initial, each search needs a fresh authenticator code, and an operator gets 10 searches per 10 minutes.

export type PickedCustomer = { id: string; first_name: string | null; last_initial: string | null; email_masked: string | null; phone_last4: string | null; joined_at: string };
type LookupResult = { rows: PickedCustomer[]; more: boolean; refused?: boolean; refusal?: string; limit?: number; window_minutes?: number; retry_after?: string };

const copy = {
  en: {
    label: "Customer", hint: "Search by at least 3 characters of the name, or the whole e-mail address or phone number. Each search is recorded in the audit log; 10 searches per 10 minutes.",
    search: "Find", searching: "Searching…", none: "No customer account matches. Check the spelling, or search by e-mail or phone.",
    more: "More than 10 accounts match. Add more of the name, or search by the whole e-mail or phone.", choose: "Choose", chosen: "Selected customer",
    change: "Choose another customer", tooShort: "Type at least 3 characters to search.", failed: "The search failed: {reason}",
    phone: "phone ending {d}", joined: "joined {date}", unnamed: "No name on the account", results: "Matching customers",
    emailIncomplete: "Type the whole e-mail address; part of an address is not searched.",
    phoneIncomplete: "Type the whole phone number; part of a number is not searched.",
    limited: "You have used your {n} searches for {m} minutes. Try again after {time}. The owners were alerted.",
  },
  ar: {
    label: "العميل", hint: "ابحث بثلاثة أحرف على الأقل من الاسم، أو بالبريد الإلكتروني أو رقم الهاتف كاملاً. يُسجَّل كل بحث في سجل التدقيق؛ ١٠ عمليات بحث كل ١٠ دقائق.",
    search: "بحث", searching: "جارٍ البحث…", none: "لا يوجد حساب عميل مطابق. تحقق من الكتابة أو ابحث بالبريد أو الهاتف.",
    more: "أكثر من ١٠ حسابات مطابقة. أضف جزءاً أكبر من الاسم، أو ابحث بالبريد أو الهاتف كاملاً.", choose: "اختيار", chosen: "العميل المختار",
    change: "اختيار عميل آخر", tooShort: "اكتب ٣ أحرف على الأقل للبحث.", failed: "تعذّر البحث: {reason}",
    phone: "هاتف ينتهي بـ {d}", joined: "انضم {date}", unnamed: "لا يوجد اسم في الحساب", results: "العملاء المطابقون",
    emailIncomplete: "اكتب البريد الإلكتروني كاملاً؛ لا يُبحث بجزء من العنوان.",
    phoneIncomplete: "اكتب رقم الهاتف كاملاً؛ لا يُبحث بجزء من الرقم.",
    limited: "استخدمت عمليات البحث المتاحة لك ({n} كل {m} دقائق). حاول مجدداً بعد {time}. تم تنبيه الملاك.",
  },
};

export function customerName(c: Pick<PickedCustomer, "first_name" | "last_initial">, fallback: string) {
  return [c.first_name, c.last_initial ? `${c.last_initial}.` : null].filter(Boolean).join(" ") || fallback;
}

export function CustomerPicker({ lang, value, onChange, error, inputId }: {
  lang: "en" | "ar"; value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; error?: string; inputId?: string;
}) {
  const t = copy[lang];
  const ownId = useId();
  const id = inputId ?? ownId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PickedCustomer[] | null>(null);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState("");
  const changeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = useRef(false);
  const date = (v: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(v));

  // Focus follows the choice: onto "choose another" after picking, back to the search after clearing.
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    if (value) changeRef.current?.focus(); else inputRef.current?.focus();
  }, [value]);

  const search = async () => {
    const q = query.trim();
    if (q.length < 3) { setProblem(t.tooShort); setRows(null); return; }
    setBusy(true); setProblem("");
    const { data, error: rpcError } = await supabase.rpc("admin_privacy_find_customers", { p_query: q, p_purpose: "privacy_request" });
    setBusy(false);
    if (rpcError) {
      setRows(null);
      const hint = errorHint(rpcError);
      setProblem(hint === "email_incomplete" ? t.emailIncomplete : hint === "phone_incomplete" ? t.phoneIncomplete
        : hint === "query_too_short" ? t.tooShort : t.failed.replace("{reason}", describeConsoleError(rpcError, lang)));
      return;
    }
    const result = data as LookupResult;
    if (result.refused) {
      setRows(null);
      const time = result.retry_after
        ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(result.retry_after))
        : "";
      setProblem(t.limited.replace("{n}", String(result.limit ?? "")).replace("{m}", String(result.window_minutes ?? "")).replace("{time}", time));
      return;
    }
    setRows(result.rows); setMore(Boolean(result.more));
  };

  if (value) {
    return (
      <div className="flex flex-col gap-1 text-xs font-bold text-[#667085]">
        <span>{t.chosen}</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D1AF47]/50 bg-[#FBF7EA] px-3 py-2.5 text-sm text-[#101828]">
          <span className="min-w-0">
            <span className="block font-black">{customerName(value, t.unnamed)}</span>
            <span className="block text-[11px] font-semibold text-[#667085]">
              {[value.email_masked ? <bdi key="e" dir="ltr">{value.email_masked}</bdi> : null, value.phone_last4 ? t.phone.replace("{d}", value.phone_last4) : null].filter(Boolean).map((x, i) => <React.Fragment key={i}>{i > 0 ? " · " : ""}{x}</React.Fragment>)}
            </span>
          </span>
          <button ref={changeRef} type="button" onClick={() => { picked.current = true; onChange(null); }}
            className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.change}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs font-bold text-[#667085]">
      <label htmlFor={id}>{t.label}</label>
      <div className="flex gap-2">
        <input id={id} ref={inputRef} type="search" value={query} autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
          aria-invalid={Boolean(error || problem)} aria-describedby={[hintId, error ? errorId : "", problem || rows ? statusId : ""].filter(Boolean).join(" ")}
          className={`${operationsInput} min-w-0 flex-1`} />
        <button type="button" onClick={() => void search()} aria-disabled={busy}
          className="shrink-0 rounded-xl border border-[#D1AF47]/50 bg-[#F8F3E4] px-4 py-2 text-sm font-semibold text-[#725517] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{busy ? t.searching : t.search}</button>
      </div>
      <span id={hintId} className="text-[11px] font-semibold">{t.hint}</span>
      {error && <span id={errorId} className="text-[11px] font-black text-[#B42318]">{error}</span>}
      <div id={statusId} role="status" aria-live="polite">
        {problem ? <span className="text-[11px] font-black text-[#B42318]">{problem}</span>
          : rows && rows.length === 0 ? <span className="text-[11px] font-semibold text-[#475467]">{t.none}</span> : null}
      </div>
      {rows && rows.length > 0 && (
        <ul aria-label={t.results} className="mt-1 divide-y divide-[#F2F4F7] rounded-xl border border-[#ECECEC] bg-white">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-[#101828]">
              <span className="min-w-0">
                <span className="block font-bold">{customerName(c, t.unnamed)}</span>
                <span className="block text-[11px] font-semibold text-[#667085]">
                  {c.email_masked && <bdi dir="ltr">{c.email_masked}</bdi>}{c.email_masked && c.phone_last4 ? " · " : ""}{c.phone_last4 ? t.phone.replace("{d}", c.phone_last4) : ""} · {t.joined.replace("{date}", date(c.joined_at))}
                </span>
              </span>
              <button type="button" onClick={() => { picked.current = true; setRows(null); setQuery(""); onChange(c); }}
                aria-label={`${t.choose}: ${customerName(c, t.unnamed)}`}
                className="rounded-lg border border-[#D1AF47] px-2.5 py-1.5 text-[11px] font-black text-[#725517] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.choose}</button>
            </li>
          ))}
          {more && <li className="px-3 py-2 text-[11px] font-semibold text-[#B54708]">{t.more}</li>}
        </ul>
      )}
    </div>
  );
}
