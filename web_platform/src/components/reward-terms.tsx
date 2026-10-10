"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { sar, type OperationsLocale } from "@/components/operations-ui";

// D-Q7: a customer enrols in the referral or loyalty programme by accepting its published terms (Arabic and English). While a
// programme is not running (the owner has not set and a second owner approved its values) this says so and offers nothing.
type Status = {
  program: "referral" | "loyalty";
  enabled: boolean;
  reward_value_sar?: number;
  customer_monthly_cap_sar?: number;
  credit_expiry_days?: number;
  terms_version?: string;
  terms_en?: string;
  terms_ar?: string;
  accepted?: boolean;
};

const copy = {
  en: {
    title: { referral: "Referral programme terms", loyalty: "Loyalty programme terms" },
    off: "This programme is not running at the moment.",
    accepted: "You accepted these terms (version {v}).",
    accept: "I accept these terms",
    accepting: "Saving...",
    summary: "Value {value} · monthly limit {cap} · credits expire after {days} days. Credits cannot be withdrawn as cash, transferred or bought.",
    failed: "The programme could not be loaded: {reason}",
    retry: "Retry",
  },
  ar: {
    title: { referral: "شروط برنامج الإحالة", loyalty: "شروط برنامج الولاء" },
    off: "هذا البرنامج غير متاح حالياً.",
    accepted: "وافقت على هذه الشروط (النسخة {v}).",
    accept: "أوافق على هذه الشروط",
    accepting: "جارٍ الحفظ...",
    summary: "القيمة {value} · الحد الشهري {cap} · تنتهي صلاحية الرصيد بعد {days} يوماً. لا يمكن سحب الرصيد نقداً أو تحويله أو شراؤه.",
    failed: "تعذّر تحميل البرنامج: {reason}",
    retry: "إعادة المحاولة",
  },
};

export function RewardTerms({ program, locale, onAccepted }: { program: "referral" | "loyalty"; locale: OperationsLocale; onAccepted?: () => void }) {
  const t = copy[locale];
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("reward_program_status", { p_program: program });
    if (rpcError) { setError(errorMessage(rpcError)); return; }
    setError("");
    setStatus(data as Status);
  }, [program]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const accept = async () => {
    if (!status?.terms_version) return;
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("accept_reward_terms", { p_program: program, p_version: status.terms_version, p_locale: locale });
    setBusy(false);
    if (rpcError) { setError(errorMessage(rpcError)); return; }
    await load();
    onAccepted?.();
  };

  if (error) {
    return (
      <p role="alert" className="text-xs font-semibold text-red-700">
        {t.failed.replace("{reason}", error)}{" "}
        <button type="button" onClick={() => void load()} className="font-bold underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
      </p>
    );
  }
  if (!status) return null;
  return (
    <section aria-labelledby={`terms-${program}`} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-6 text-start">
      <h3 id={`terms-${program}`} className="text-sm font-bold text-gray-800">{t.title[program]}</h3>
      {!status.enabled ? (
        <p className="text-xs text-gray-500">{t.off}</p>
      ) : (
        <>
          <p className="text-xs text-gray-600">
            {t.summary
              .replace("{value}", sar(Number(status.reward_value_sar ?? 0), locale))
              .replace("{cap}", sar(Number(status.customer_monthly_cap_sar ?? 0), locale))
              .replace("{days}", String(status.credit_expiry_days ?? ""))}
          </p>
          <div dir={locale === "ar" ? "rtl" : "ltr"} className="max-h-56 overflow-y-auto whitespace-pre-line rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
            {locale === "ar" ? status.terms_ar : status.terms_en}
          </div>
          {status.accepted ? (
            <p role="status" className="text-xs font-bold text-green-800">{t.accepted.replace("{v}", status.terms_version ?? "")}</p>
          ) : (
            <button type="button" disabled={busy} onClick={() => void accept()} className="rounded-xl bg-gray-900 px-5 py-2 text-xs font-black text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50">
              {busy ? t.accepting : t.accept}
            </button>
          )}
        </>
      )}
    </section>
  );
}
