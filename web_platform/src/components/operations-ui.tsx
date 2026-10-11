"use client";

import { useEffect, useSyncExternalStore } from "react";

export type OperationsLocale = "en" | "ar";
const subscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
};
export function useOperationsLocale(): OperationsLocale {
  return useSyncExternalStore(subscribe, () => document.documentElement.lang === "ar" ? "ar" : "en", () => "en");
}
export const operationsButton = "rounded-xl border border-[#D1AF47]/50 bg-[#F8F3E4] px-4 py-2 text-sm font-semibold text-[#725517] transition hover:bg-[#F4E7B6] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
export const operationsInput = "w-full rounded-xl border border-[#D8D2C5] bg-white px-3 py-2.5 text-sm text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50";
export function OperationsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[24px] border border-[#D1AF47]/35 bg-white/90 p-5 shadow-[0_8px_24px_rgba(56,44,16,0.06)]"><h2 className="mb-4 font-serif text-xl font-bold text-[#101828]">{title}</h2>{children}</section>;
}
export function OperationsField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{label}</span>{children}</label>;
}
export function OperationsNotice({ error, success }: { error?: string; success?: string }) {
  return <>{error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}{success && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</div>}</>;
}
// True when the server refused the signed-in account (missing access), as opposed to being unreachable or failing.
// Postgres raises 42501 (insufficient privilege) and PostgREST answers 401/403 or PGRST301 for a rejected session.
export function isForbidden(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, status, message } = error as { code?: unknown; status?: unknown; message?: unknown };
  return code === "42501" || code === "PGRST301" || status === 401 || status === 403 || (typeof message === "string" && /permission denied|row-level security|administrator access required/i.test(message));
}
const forbiddenCopy = {
  en: { title: "You do not have access to this screen", body: "Your account is signed in, but the server refused this request. Ask an owner of the console to give your account the administrator role, then sign in again. Trying again will not help until access is granted.", home: "Back to the dashboard" },
  ar: { title: "ليس لديك صلاحية الوصول إلى هذه الشاشة", body: "حسابك مسجّل الدخول لكن الخادم رفض هذا الطلب. اطلب من مالك المنصة منح حسابك دور المسؤول ثم سجّل الدخول من جديد. إعادة المحاولة لن تفيد قبل منح الصلاحية.", home: "العودة إلى لوحة المتابعة" },
};
export function ForbiddenNotice({ locale }: { locale: OperationsLocale }) {
  const t = forbiddenCopy[locale];
  return (
    <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
      <p className="font-black">{t.title}</p>
      <p className="mt-1 leading-6">{t.body}</p>
      <a href="/admin" className="mt-3 inline-block rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-black text-amber-900 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.home}</a>
    </div>
  );
}
export const signOutFailedText: Record<OperationsLocale, string> = {
  en: "Signing out failed, so you are still signed in on this device. Check your connection and try again.",
  ar: "تعذّر تسجيل الخروج، لذا ما زلت مسجلاً على هذا الجهاز. تحقق من الاتصال وحاول مجدداً.",
};
// A command's result, pinned to the bottom of the viewport so it is seen wherever the operator was working in a long
// table. A refusal stays until dismissed; a success clears itself.
export function CommandResult({ error, success, locale, onDismiss }: { error?: string; success?: string; locale: OperationsLocale; onDismiss: () => void }) {
  useEffect(() => {
    if (!success || error) return;
    const timer = window.setTimeout(onDismiss, 9000);
    return () => window.clearTimeout(timer);
  }, [success, error, onDismiss]);
  if (!error && !success) return null;
  const failed = Boolean(error);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[9000] flex justify-center">
      <div
        role={failed ? "alert" : "status"}
        className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-2xl ${failed ? "border-red-300 bg-red-50 text-red-900" : "border-green-300 bg-green-50 text-green-900"}`}
      >
        <p className="min-w-0 flex-1 break-words">{error || success}</p>
        <button type="button" onClick={onDismiss} className="shrink-0 rounded-lg border border-current px-2.5 py-1 text-xs font-black focus-visible:outline-2 focus-visible:outline-[#9B7928]">{locale === "ar" ? "إغلاق" : "Dismiss"}</button>
      </div>
    </div>
  );
}
export function operationError(error: unknown): string {
  return error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
}
export function sar(value: number, locale: OperationsLocale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(Number(value));
}
export function operationsDate(value: string, locale: OperationsLocale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
}
