"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { ForbiddenNotice, isForbidden, operationsDate, type OperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";

// Out-of-band governance notices (SECFIX-2 R2-H4). The deliver-governance-notices Edge Function sends them through the
// provider configured by environment variables; until one is configured they are marked "undeliverable: no sender
// configured" and this panel says so. A changed payout account is not paid until its change notice was delivered or a second
// person (iban.approve, not the requester or approver of the change) waives it here (admin_waive_payout_account_notice).
// The console never sees the address a notice goes to.

type NoticeRow = {
  id: string; channel: "email" | "sms"; template_key: string; status: string; created_at: string; sent_at: string | null; attempts: number;
  next_attempt_at: string | null; error_message: string | null; destination_id: string | null; provider_id: string | null;
};
type NoticeView = { rows: NoticeRow[]; counts: Record<string, number>; no_sender: boolean; can_waive: boolean };

const copy = {
  en: {
    title: "Out-of-band notices",
    intro: "Security notices sent by email or SMS to verified contacts: bank account changes, break-glass, console roles, sign-in verification and escalated reconciliation breaks.",
    noSender: "No sender is configured, so these notices are not being delivered. The owner must choose an email and SMS provider and set its environment variables; until then changed bank accounts are not paid unless a second person waives the notice.",
    empty: "No notices yet.",
    loadFailed: "The notices could not be loaded: {reason}",
    retry: "Retry",
    channels: { email: "Email", sms: "SMS" } as Record<string, string>,
    statuses: { pending: "Waiting to send", sending: "Sending", sent: "Sent", failed: "Failed", skipped: "No verified contact", undeliverable: "Not delivered", waived: "Waived by a second person" } as Record<string, string>,
    templates: {
      payout_account_change_requested: "Payout account change requested", payout_account_change_approved: "Payout account change approved",
      payout_account_change_rejected: "Payout account change rejected", break_glass_used: "Break-glass used", health_break_glass_used: "Health answers opened (break-glass)",
      console_role_change_requested: "Console role change requested", console_role_changed: "Console role changed", mfa_factor_added: "Verification method added",
      mfa_locked: "Console account locked", mfa_reset: "Verification reset", reconciliation_break_escalated: "Reconciliation break escalated",
    } as Record<string, string>,
    attempts: "{n} attempts",
    nextTry: "next try {when}",
    waive: "Waive (second person)",
    waiveTitle: "Waive the bank account change notice",
    waiveIntro: "The provider has not received the notice about this bank account change. Waive it only after confirming the change with the provider through another channel. You cannot waive a change you requested or approved.",
    waiveReason: "How the change was confirmed (at least 20 characters)",
    waiveConfirm: "Waive notice",
    waived: "The notice was waived; payouts to the account are no longer held for it.",
  },
  ar: {
    title: "الإشعارات خارج المنصة",
    intro: "إشعارات أمنية تُرسل بالبريد أو الرسائل النصية إلى جهات الاتصال الموثقة: تغيير الحساب البنكي، وإجراء الطوارئ، وأدوار لوحة الإدارة، والتحقق من الدخول، وفروق التسوية المصعّدة.",
    noSender: "لم يُضبط أي مزود للإرسال، لذلك لا تُسلَّم هذه الإشعارات. يجب أن يختار المالك مزود بريد ورسائل نصية ويضبط متغيرات البيئة الخاصة به، وحتى ذلك الحين لا تُحوَّل مبالغ إلى حساب بنكي مُغيَّر إلا إذا تنازل شخص ثانٍ عن الإشعار.",
    empty: "لا توجد إشعارات بعد.",
    loadFailed: "تعذّر تحميل الإشعارات: {reason}",
    retry: "إعادة المحاولة",
    channels: { email: "البريد", sms: "رسالة نصية" } as Record<string, string>,
    statuses: { pending: "بانتظار الإرسال", sending: "قيد الإرسال", sent: "أُرسل", failed: "فشل", skipped: "لا توجد جهة اتصال موثقة", undeliverable: "لم يُسلَّم", waived: "تنازل عنه شخص ثانٍ" } as Record<string, string>,
    templates: {
      payout_account_change_requested: "طلب تغيير حساب التحويل", payout_account_change_approved: "اعتماد تغيير حساب التحويل",
      payout_account_change_rejected: "رفض تغيير حساب التحويل", break_glass_used: "استخدام إجراء الطوارئ", health_break_glass_used: "فتح الإجابات الصحية (طوارئ)",
      console_role_change_requested: "طلب تغيير دور في لوحة الإدارة", console_role_changed: "تغيّر دور في لوحة الإدارة", mfa_factor_added: "إضافة طريقة تحقق",
      mfa_locked: "قفل حساب إداري", mfa_reset: "إعادة ضبط التحقق", reconciliation_break_escalated: "تصعيد فرق تسوية",
    } as Record<string, string>,
    attempts: "{n} محاولات",
    nextTry: "المحاولة التالية {when}",
    waive: "تنازل (شخص ثانٍ)",
    waiveTitle: "التنازل عن إشعار تغيير الحساب البنكي",
    waiveIntro: "لم يصل إلى المزود إشعار تغيير هذا الحساب البنكي. لا تتنازل عنه إلا بعد تأكيد التغيير مع المزود عبر قناة أخرى. لا يمكنك التنازل عن تغيير طلبته أو اعتمدته.",
    waiveReason: "كيف تأكد التغيير (20 حرفاً على الأقل)",
    waiveConfirm: "التنازل عن الإشعار",
    waived: "تم التنازل عن الإشعار، ولم تعد التحويلات إلى الحساب موقوفة بسببه.",
  },
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), template);

export function GovernanceNotices({ locale, panelClass, buttonClass, onDone }: {
  locale: OperationsLocale; panelClass: string; buttonClass: string; onDone: (message: string) => void;
}) {
  const t = copy[locale];
  const [view, setView] = useState<NoticeView | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [waiving, setWaiving] = useState<NoticeRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("admin_list_governance_notices", { p_status: null, p_limit: 25, p_offset: 0 });
    if (loadError) {
      setView(null);
      setError(errorMessage(loadError));
      setForbidden(isForbidden(loadError));
      return;
    }
    setError("");
    setForbidden(false);
    setView(data as NoticeView);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  const undelivered = (row: NoticeRow) =>
    row.template_key === "payout_account_change_requested" && Boolean(row.destination_id) && !["sent", "waived"].includes(row.status);

  return (
    <section className={panelClass} aria-labelledby="gov-notices">
      <h3 id="gov-notices" className="font-serif text-lg font-black text-gray-900">{t.title}</h3>
      <p className="mt-1 text-xs text-gray-500">{t.intro}</p>
      {forbidden ? <ForbiddenNotice locale={locale} /> : error ? (
        <p role="alert" className="mt-3 text-xs font-bold text-[#B42318]">
          {fill(t.loadFailed, { reason: error })}{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
        </p>
      ) : !view ? null : (
        <>
          {view.no_sender ? <p role="status" className="mt-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-bold text-[#93370D]">{t.noSender}</p> : null}
          {view.rows.length === 0 ? <p className="mt-3 text-xs text-gray-500">{t.empty}</p> : (
            <ul className="mt-3 space-y-2 text-xs">
              {view.rows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
                  <span className="min-w-0">
                    <span className="block font-bold text-gray-900">{t.templates[row.template_key] ?? row.template_key} · {t.channels[row.channel] ?? row.channel}</span>
                    <span className={`block text-[11px] font-bold ${row.status === "sent" ? "text-[#027A48]" : row.status === "waived" ? "text-gray-600" : "text-[#B54708]"}`}>
                      {t.statuses[row.status] ?? row.status}
                      {row.error_message ? ` · ${row.error_message}` : ""}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {operationsDate(row.created_at, locale)}
                      {row.attempts > 0 ? ` · ${fill(t.attempts, { n: row.attempts })}` : ""}
                      {row.status === "pending" && row.next_attempt_at ? ` · ${fill(t.nextTry, { when: operationsDate(row.next_attempt_at, locale) })}` : ""}
                    </span>
                  </span>
                  {view.can_waive && undelivered(row) ? (
                    <button type="button" className={buttonClass} onClick={() => setWaiving(row)}>{t.waive}</button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {waiving ? (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={t.waiveTitle}
          intro={t.waiveIntro}
          reasonLabel={t.waiveReason}
          minReasonLength={20}
          confirmLabel={t.waiveConfirm}
          onConfirm={async (reason) => {
            const { error: waiveError } = await supabase.rpc("admin_waive_payout_account_notice", { p_destination_id: waiving.destination_id, p_reason: reason });
            if (waiveError) return errorMessage(waiveError);
            setWaiving(null);
            onDone(t.waived);
            setReloadKey((k) => k + 1);
            return null;
          }}
          onClose={() => setWaiving(null)}
        />
      ) : null}
    </section>
  );
}
