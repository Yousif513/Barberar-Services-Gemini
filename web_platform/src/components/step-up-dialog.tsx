"use client";

import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { registerStepUpHandler, type StepUpPrompt } from "@/lib/step-up";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { useOperationsLocale } from "@/components/operations-ui";

// Asks for a fresh authenticator code when the database refused a sensitive command for lack of a recent one (GOV-1 / Q6).
// Mounted once by the admin console; lib/supabase.ts repeats the refused request after a successful verification.

const copy = {
  en: {
    title: "Confirm it is you",
    intro: "This action moves money, reveals bank details or changes access, so it needs a code from your authenticator app from the last 5 minutes.",
    codeLabel: "6-digit code from your authenticator app",
    confirm: "Confirm",
    cancel: "Cancel",
    working: "Checking…",
    badCode: "Enter the 6 digits shown in your authenticator app.",
    noFactor: "This account has no verified authenticator app. Enrol one first.",
    enrol: "Set up the authenticator app",
    lockWarning: "After 10 wrong codes the account locks until another owner resets it.",
  },
  ar: {
    title: "تأكيد هويتك",
    intro: "هذا الإجراء ينقل أموالاً أو يكشف بيانات بنكية أو يغيّر الصلاحيات، لذا يحتاج رمزاً من تطبيق المصادقة خلال آخر 5 دقائق.",
    codeLabel: "الرمز المكوّن من 6 أرقام من تطبيق المصادقة",
    confirm: "تأكيد",
    cancel: "إلغاء",
    working: "جارٍ التحقق…",
    badCode: "أدخل الأرقام الستة الظاهرة في تطبيق المصادقة.",
    noFactor: "لا يوجد تطبيق مصادقة موثّق لهذا الحساب. أضِف واحداً أولاً.",
    enrol: "إعداد تطبيق المصادقة",
    lockWarning: "بعد 10 رموز خاطئة يُقفل الحساب حتى يعيد مالك آخر ضبطه.",
  },
};

export function StepUpDialog() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const [prompt, setPrompt] = useState<StepUpPrompt | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [noFactor, setNoFactor] = useState(false);
  const titleId = useId();
  const codeId = useId();

  useEffect(() => registerStepUpHandler((next) => {
    setCode("");
    setFailure("");
    setNoFactor(false);
    setPrompt(next);
  }), []);

  if (!prompt) return null;

  const close = (verified: boolean) => {
    prompt.resolve(verified);
    setPrompt(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = code.replace(/\s+/g, "");
    if (!/^[0-9]{6}$/.test(digits)) {
      setFailure(t.badCode);
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const factor = factors?.totp?.[0];
      if (!factor) {
        setNoFactor(true);
        return;
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: digits });
      if (error) throw error;
      close(true);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  // Same layer as CommandDialog: the prompt opens after the dialog that triggered it, so it stacks above it.
  return (
    <ModalPortal>
      <ModalOverlay onClose={() => close(false)} canClose={!busy} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/60 px-4 py-8 backdrop-blur-sm">
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} onSubmit={(event) => void submit(event)}
          className="w-full max-w-md rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 text-start shadow-2xl">
          <h2 id={titleId} className="font-serif text-xl font-black text-[#101828]">{t.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#475467]">{t.intro}</p>
          <label htmlFor={codeId} className="mt-4 block text-xs font-black text-[#344054]">{t.codeLabel}</label>
          <input id={codeId} data-autofocus dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code}
            onChange={(event) => setCode(event.target.value)} disabled={busy}
            className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928]" />
          <p className="mt-1 text-xs text-[#667085]">{t.lockWarning}</p>
          {noFactor && (
            <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              {t.noFactor} <a className="underline" href="/login/mfa?next=/admin">{t.enrol}</a>
            </p>
          )}
          {failure && <p role="alert" className="mt-3 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-sm font-semibold text-[#B42318]">{failure}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => close(false)} disabled={busy} className="rounded-xl border border-[#D0D5DD] bg-white px-4 py-2.5 text-sm font-bold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50">{t.cancel}</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-60">{busy ? t.working : t.confirm}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}
