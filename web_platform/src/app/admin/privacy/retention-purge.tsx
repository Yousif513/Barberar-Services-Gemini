"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import { operationsButton } from "@/components/operations-ui";
import { describeConsoleError } from "@/lib/console-errors.mjs";
import { commandOutcome } from "@/lib/write-result.mjs";
import { knownToHold, useConsoleSession } from "@/lib/console-session";

// The console entry for the retention purge (gap retention-purge-console-entry-missing). privacy_purge_expired_retention
// already does the work: a dry run counts what has passed its retention date and changes nothing; a real run from the console
// becomes a privacy_retention_purge approval request that a different privacy.approve holder decides on Approvals, after a
// fresh authenticator code (F3). This panel offers both; it decides nothing itself.

type Summary = {
  dry_run?: boolean;
  cutoff?: string;
  sub_records?: Record<string, number>;
  bookings_deleted?: number;
  bookings_anonymised?: number;
};
type RequestAnswer = { status?: string; approval_id?: string; existing?: boolean; preview?: Summary };

const copy = {
  en: {
    title: "Retention purge",
    intro: "Records of erased customers are kept only until their retention date. A dry run counts what has passed that date and changes nothing. The real purge is deleted for good, so it waits for a second privacy approver.",
    noRight: "Only a console role with privacy approvals (privacy.approve) runs the dry run or asks for the purge.",
    dryRun: "Dry run",
    running: "Counting…",
    request: "Ask for the real purge",
    resultTitle: "Dry run on {date} (Riyadh)",
    nothing: "Nothing has passed its retention date: a purge would change nothing.",
    bookingsDeleted: "Bookings deleted",
    bookingsAnonymised: "Bookings kept as anonymous accounting records",
    subRecords: "Linked records deleted",
    dialogTitle: "Ask for the retention purge",
    dialogIntro: "A different privacy approver decides it on Approvals. Until then nothing is deleted.",
    effectsTitle: "If it is approved",
    effects: ["The counted records are deleted and cannot be restored.", "Records the ledger still needs are kept as anonymous accounting records.", "The run, the reason and both people are written to the audit log."],
    reasonLabel: "Why the purge should run now (at least 10 characters, recorded in the audit log)",
    confirm: "Ask for approval",
    asked: "Purge requested: a second privacy approver decides it on Approvals.",
    alreadyAsked: "A purge request is already waiting for a second privacy approver on Approvals.",
    openApprovals: "Open Approvals",
    factCutoff: "Cutoff",
    factDeleted: "Bookings deleted",
    factLinked: "Linked records deleted",
    tables: {
      booking_tips: "Tips", wallet_credit_redemptions: "Wallet credit uses", coupon_redemptions: "Coupon uses",
      gift_card_redemptions: "Gift card uses", package_redemptions: "Package session uses", wallet_credits: "Wallet credits",
      customer_loyalty: "Loyalty balances",
    } as Record<string, string>,
  },
  ar: {
    title: "الحذف بعد انتهاء مدة الحفظ",
    intro: "تُحفظ سجلات العملاء المحذوفين حتى تاريخ انتهاء مدة حفظها فقط. التجربة تعدّ ما تجاوز هذا التاريخ ولا تغيّر شيئاً. الحذف الفعلي نهائي، لذا ينتظر موافقة معتمد خصوصية ثانٍ.",
    noRight: "لا يشغّل التجربة أو يطلب الحذف إلا دور يملك اعتماد طلبات الخصوصية (privacy.approve).",
    dryRun: "تجربة",
    running: "جارٍ العدّ…",
    request: "طلب الحذف الفعلي",
    resultTitle: "تجربة بتاريخ {date} (توقيت الرياض)",
    nothing: "لا يوجد ما تجاوز تاريخ انتهاء حفظه: الحذف لن يغيّر شيئاً.",
    bookingsDeleted: "حجوزات تُحذف",
    bookingsAnonymised: "حجوزات تبقى سجلات محاسبية مجهولة الهوية",
    subRecords: "سجلات مرتبطة تُحذف",
    dialogTitle: "طلب الحذف بعد انتهاء مدة الحفظ",
    dialogIntro: "يبت فيه معتمد خصوصية آخر من شاشة الموافقات. لا يُحذف شيء قبل ذلك.",
    effectsTitle: "إذا اعتُمد",
    effects: ["تُحذف السجلات المعدودة ولا يمكن استرجاعها.", "تبقى السجلات التي يحتاجها دفتر الحسابات سجلاتٍ محاسبية مجهولة الهوية.", "يُسجَّل التشغيل والسبب والشخصان في سجل التدقيق."],
    reasonLabel: "لماذا يجب تشغيل الحذف الآن (١٠ أحرف على الأقل، يُسجَّل في سجل التدقيق)",
    confirm: "طلب الموافقة",
    asked: "طُلب الحذف: يبت فيه معتمد خصوصية ثانٍ من شاشة الموافقات.",
    alreadyAsked: "يوجد طلب حذف ينتظر موافقة معتمد خصوصية ثانٍ في شاشة الموافقات.",
    openApprovals: "فتح الموافقات",
    factCutoff: "تاريخ القطع",
    factDeleted: "حجوزات تُحذف",
    factLinked: "سجلات مرتبطة تُحذف",
    tables: {
      booking_tips: "الإكراميات", wallet_credit_redemptions: "استخدامات رصيد المحفظة", coupon_redemptions: "استخدامات القسائم",
      gift_card_redemptions: "استخدامات بطاقات الهدايا", package_redemptions: "استخدامات جلسات الباقات", wallet_credits: "أرصدة المحفظة",
      customer_loyalty: "أرصدة الولاء",
    } as Record<string, string>,
  },
};

export function RetentionPurgePanel({ lang, onNotice }: { lang: "en" | "ar"; onNotice: (notice: { error?: string; success?: string }) => void }) {
  const t = copy[lang];
  const canApprove = knownToHold(useConsoleSession(), ["privacy.approve"]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<RequestAnswer | null>(null);
  const n = (value: unknown) => new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US").format(Number(value ?? 0) || 0);
  const day = (value?: string) => (value
    ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
    : "—");
  const linked = (s: Summary | null) => Object.values(s?.sub_records ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);

  const dryRun = async () => {
    if (busy) return;
    setBusy(true);
    onNotice({});
    const outcome = commandOutcome(await supabase.rpc("privacy_purge_expired_retention", { p_dry_run: true, p_reason: null }));
    setBusy(false);
    if (!outcome.ok) { onNotice({ error: describeConsoleError(outcome.error, lang) }); return; }
    setSummary(outcome.data as Summary);
  };

  const requestPurge = async (reason: string): Promise<string | null> => {
    const outcome = commandOutcome(await supabase.rpc("privacy_purge_expired_retention", { p_dry_run: false, p_reason: reason }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    const answer = outcome.data as RequestAnswer;
    if (answer?.status !== "pending_approval") return describeConsoleError({ message: "The server did not open an approval request" }, lang);
    setAsked(answer);
    if (answer.preview) setSummary(answer.preview);
    onNotice({ success: answer.existing ? t.alreadyAsked : t.asked });
    return null;
  };

  const total = linked(summary);
  return (
    <section aria-labelledby="retention-purge-title" className="space-y-3 rounded-2xl border border-[#ECECEC] bg-white p-5">
      <h2 id="retention-purge-title" className="font-serif text-lg font-black text-gray-900">{t.title}</h2>
      <p className="text-xs leading-5 text-gray-600">{t.intro}</p>
      {!canApprove ? (
        <p className="text-xs font-semibold text-gray-700">{t.noRight}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void dryRun()} aria-disabled={busy} className={operationsButton}>{busy ? t.running : t.dryRun}</button>
            {summary && !asked && (
              <button type="button" onClick={() => setAsking(true)} className={`${operationsButton} !border-[#B42318]/40 !bg-[#FEF3F2] !text-[#B42318]`}>{t.request}</button>
            )}
            {asked && <Link href="/admin/approvals" className={operationsButton}>{t.openApprovals}</Link>}
          </div>
          {summary && (
            <div role="status" className="space-y-2 rounded-xl border border-[#ECECEC] bg-[#FAF9F6] p-4 text-xs text-gray-800">
              <p className="font-black">{t.resultTitle.replace("{date}", day(summary.cutoff))}</p>
              {total === 0 && !summary.bookings_deleted && !summary.bookings_anonymised ? <p>{t.nothing}</p> : (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <dt>{t.bookingsDeleted}</dt><dd className="font-black">{n(summary.bookings_deleted)}</dd>
                  <dt>{t.bookingsAnonymised}</dt><dd className="font-black">{n(summary.bookings_anonymised)}</dd>
                  <dt>{t.subRecords}</dt><dd className="font-black">{n(total)}</dd>
                  {Object.entries(summary.sub_records ?? {}).map(([table, count]) => (
                    <div key={table} className="contents"><dt className="ps-3 text-gray-600">{t.tables[table] ?? table}</dt><dd>{n(count)}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </>
      )}
      {asking && summary && (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={t.dialogTitle}
          intro={t.dialogIntro}
          facts={[
            { label: t.factCutoff, value: day(summary.cutoff) },
            { label: t.factDeleted, value: n(summary.bookings_deleted) },
            { label: t.factLinked, value: n(total) },
          ]}
          effectsTitle={t.effectsTitle}
          effects={t.effects}
          reasonLabel={t.reasonLabel}
          minReasonLength={10}
          confirmLabel={t.confirm}
          onConfirm={requestPurge}
          onClose={() => setAsking(false)}
        />
      )}
    </section>
  );
}
