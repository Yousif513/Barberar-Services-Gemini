"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { parseReconciliationRows, type ImportSource } from "@/lib/money-display";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";
import { ModalOverlay } from "@/components/modal";

// Tap reconciliation (D-Q9, docs/legal/2026-10-10-adopted-decisions.md). Tap is the record of whether, how much and when money
// moved; the ledger is the record of who is owed what. A daily run matches every Tap charge, refund and settlement and opens a
// break for anything unmatched (run_tap_reconciliation). A break is resolved only by a correction a different administrator
// approves, citing the Tap object (admin_propose_break_resolution); breaks open for more than 3 business days escalate to the
// owners. Refund timelines are shown here, with "Check with Tap" on refunds still processing at Tap after 2 business days.

type Break = {
  id: string; business_day: string; kind: string; tap_object_id: string | null; ledger_id: string | null; refund_request_id: string | null;
  tap_amount: number | null; ledger_amount: number | null; difference: number | null; status: string; opened_at: string; escalate_after: string;
  escalated_at: string | null; resolved_at: string | null; provider_name_en: string | null; provider_name_ar: string | null;
  business_days_open: number; correction_pending: boolean; corrected_amount: number | null;
};
type Import = {
  id: string; source: string; business_day: string; imported_at: string; object_count: number; status: string; file_sha256: string | null;
  approval_request_id: string | null; approved_at: string | null; reason: string | null;
};
type Run = { business_day: string; status: string; counts: Record<string, number>; ran_at: string; run_count: number };
type Refund = {
  id: string; booking_id: string | null; amount: number; status: string; gateway_refund_id: string | null; gateway_status: string | null;
  gateway_status_raw: string | null; gateway_succeeded_at: string | null; entitled_at: string; initiate_by: string; succeed_by: string;
  initiation_late: boolean; completion_late: boolean; tap_check_due: boolean; tap_checks: number; last_tap_check_at: string | null;
};
type Overview = { breaks: Break[]; counts: Record<string, number>; runs: Run[]; refunds: Refund[]; imports: Import[]; can_refund: boolean };

const PAGE = 25;
const STATUSES = ["open", "resolved", "auto_matched"] as const;

const copy = {
  en: {
    title: "Tap Reconciliation",
    subtitle: "Tap is the record of money movement and the ledger the record of what is owed. Every difference is a break, resolved only by a correction a second administrator approves.",
    runTitle: "Run a day",
    day: "Business day (Riyadh)",
    fetchAndRun: "Fetch from Tap and reconcile",
    runRecorded: "Reconcile recorded data",
    running: "Working...",
    runDone: "Reconciled {day}: {status}.",
    importTitle: "Import a file",
    importSource: "File",
    settlementFile: "Tap settlement report (settlement_id,amount)",
    bankStatement: "Bank statement (bank_line_id,amount,settlement_id)",
    importRows: "Paste the lines (CSV)",
    importReason: "Reason (at least 10 characters)",
    importButton: "Import",
    importBad: "Lines {lines} could not be read. Nothing was imported.",
    importEmpty: "Paste at least one line.",
    importDone: "The file was sent for approval (SHA-256 {sha}). A different finance administrator applies it in Approvals; until then it changes nothing.",
    importsTitle: "Imported files",
    importsIntro: "Console files carry only Tap settlements and bank-statement lines. Charges and refunds come only from Tap's API, and only Tap's API data closes a break by itself.",
    noImports: "No file has been imported.",
    importStatuses: { pending_approval: "Waiting for a second person", applied: "Applied", rejected: "Rejected", withdrawn: "Withdrawn" } as Record<string, string>,
    sources: { tap_api: "Tap API", tap_settlement_file: "Tap settlement file", bank_statement: "Bank statement" } as Record<string, string>,
    colSource: "Source",
    colRows: "Objects",
    colFile: "File SHA-256",
    breaksTitle: "Breaks",
    statusOpen: "Open and escalated",
    statusResolved: "Resolved by correction",
    statusAuto: "Matched later by Tap data",
    empty: "No breaks with this status.",
    loading: "Loading...",
    retry: "Retry",
    loadFailed: "Reconciliation could not be loaded: {reason}",
    colDay: "Day",
    colKind: "Difference",
    colObject: "Tap object",
    colProvider: "Provider",
    colTap: "Tap",
    colLedger: "Ledger",
    colOpen: "Open for",
    colStatus: "Status",
    colActions: "Actions",
    days: "{n} business days",
    escalated: "Escalated to owners",
    pendingCorrection: "Correction waiting for approval",
    propose: "Propose correction",
    kinds: {
      charge_missing_in_ledger: "Tap charge not in the ledger", ledger_missing_at_tap: "Ledger payment not at Tap", charge_amount_mismatch: "Charge amount differs",
      refund_missing_in_ledger: "Tap refund not recorded", refund_missing_at_tap: "Recorded refund not at Tap", refund_amount_mismatch: "Refund amount differs",
      refund_failed_at_tap: "Tap reports the refund failed", settlement_missing_in_bank: "Settlement not in the bank", settlement_amount_mismatch: "Settlement amount differs",
      evidence_conflict: "Two sources disagree about a Tap object",
    } as Record<string, string>,
    statuses: { open: "Open", escalated: "Escalated", resolved: "Resolved", auto_matched: "Auto-matched" } as Record<string, string>,
    correctionTitle: "Propose a correction",
    correctionIntro: "This records a linked adjustment entry citing the Tap object. Nothing changes until a different administrator approves it in Approvals. Corrections add up to the break's difference: a smaller one is recorded as partial and the break stays open.",
    breakDifference: "Break difference",
    correctedSoFar: "Corrected so far",
    remaining: "Still to correct",
    capturedDelta: "Change to the captured amount (SAR, + or -)",
    providerDelta: "Change to the provider's share (SAR, + or -)",
    platformDelta: "Change to the platform's share (SAR, + or -)",
    justification: "Justification (at least 10 characters)",
    send: "Send for approval",
    cancel: "Cancel",
    numberInvalid: "Enter amounts such as 5 or -12.50; at least one must not be zero.",
    partialBadge: "Partly corrected",
    sent: "The correction was sent for approval.",
    runsTitle: "Recent runs",
    noRuns: "No reconciliation has run yet.",
    runStatus: { matched: "Matched", breaks: "Breaks", no_tap_data: "No Tap data" } as Record<string, string>,
    refundsTitle: "Refund timelines",
    refundsIntro: "A refund starts at Tap within 3 business days of the customer becoming entitled and must succeed at Tap within 14 days of the cancellation notice.",
    noRefunds: "No refunds in the last 30 days.",
    colAmount: "Amount",
    colEntitled: "Entitled",
    colInitiate: "Start at Tap by",
    colSucceed: "Succeed by",
    colTapStatus: "At Tap",
    late: "Late",
    onTime: "On time",
    notSent: "Not sent to Tap",
    checkWithTap: "Check with Tap",
    checking: "Checking...",
    checked: "Tap says: {status}.",
    refundStates: { processing: "Processing", succeeded: "Succeeded", failed: "Failed", unknown: "Unknown" } as Record<string, string>,
    previous: "Previous",
    next: "Next",
  },
  ar: {
    title: "التسوية مع Tap",
    subtitle: "Tap هو سجل حركة الأموال ودفتر الحسابات هو سجل المستحقات. كل فرق يُسجَّل كفرق تسوية ولا يُغلق إلا بتصحيح يعتمده مسؤول آخر.",
    runTitle: "تسوية يوم",
    day: "يوم العمل (بتوقيت الرياض)",
    fetchAndRun: "جلب البيانات من Tap والتسوية",
    runRecorded: "تسوية البيانات المسجلة",
    running: "جارٍ العمل...",
    runDone: "تمت تسوية {day}: {status}.",
    importTitle: "استيراد ملف",
    importSource: "الملف",
    settlementFile: "تقرير تسويات Tap (settlement_id,amount)",
    bankStatement: "كشف الحساب البنكي (bank_line_id,amount,settlement_id)",
    importRows: "الصق الأسطر (CSV)",
    importReason: "السبب (10 أحرف على الأقل)",
    importButton: "استيراد",
    importBad: "تعذّرت قراءة الأسطر {lines}. لم يُستورد شيء.",
    importEmpty: "الصق سطراً واحداً على الأقل.",
    importDone: "أُرسل الملف للاعتماد (SHA-256 {sha}). يطبّقه مسؤول مالي آخر من صفحة الاعتمادات، ولا يغيّر شيئاً قبل ذلك.",
    importsTitle: "الملفات المستوردة",
    importsIntro: "لا تحمل ملفات لوحة الإدارة إلا تسويات Tap وأسطر كشف الحساب البنكي. عمليات الدفع والاسترداد تأتي من واجهة Tap فقط، ولا يُغلق فرقاً تلقائياً إلا بيانات واجهة Tap.",
    noImports: "لم يُستورد أي ملف.",
    importStatuses: { pending_approval: "بانتظار شخص ثانٍ", applied: "مطبّق", rejected: "مرفوض", withdrawn: "مسحوب" } as Record<string, string>,
    sources: { tap_api: "واجهة Tap", tap_settlement_file: "ملف تسويات Tap", bank_statement: "كشف الحساب البنكي" } as Record<string, string>,
    colSource: "المصدر",
    colRows: "العناصر",
    colFile: "بصمة الملف SHA-256",
    breaksTitle: "فروق التسوية",
    statusOpen: "المفتوحة والمصعّدة",
    statusResolved: "المغلقة بتصحيح",
    statusAuto: "المطابقة لاحقاً ببيانات Tap",
    empty: "لا توجد فروق بهذه الحالة.",
    loading: "جارٍ التحميل...",
    retry: "إعادة المحاولة",
    loadFailed: "تعذّر تحميل التسوية: {reason}",
    colDay: "اليوم",
    colKind: "الفرق",
    colObject: "عنصر Tap",
    colProvider: "المزود",
    colTap: "Tap",
    colLedger: "الدفتر",
    colOpen: "مفتوح منذ",
    colStatus: "الحالة",
    colActions: "الإجراءات",
    days: "{n} أيام عمل",
    escalated: "صُعّد إلى الملاك",
    pendingCorrection: "تصحيح بانتظار الاعتماد",
    propose: "اقتراح تصحيح",
    kinds: {
      charge_missing_in_ledger: "عملية دفع في Tap غير مسجلة في الدفتر", ledger_missing_at_tap: "دفعة في الدفتر غير موجودة في Tap", charge_amount_mismatch: "اختلاف مبلغ الدفع",
      refund_missing_in_ledger: "استرداد في Tap غير مسجل", refund_missing_at_tap: "استرداد مسجل غير موجود في Tap", refund_amount_mismatch: "اختلاف مبلغ الاسترداد",
      refund_failed_at_tap: "أفاد Tap بفشل الاسترداد", settlement_missing_in_bank: "تسوية لم تصل إلى البنك", settlement_amount_mismatch: "اختلاف مبلغ التسوية",
      evidence_conflict: "مصدران مختلفان حول عنصر في Tap",
    } as Record<string, string>,
    statuses: { open: "مفتوح", escalated: "مصعّد", resolved: "مغلق", auto_matched: "مطابق تلقائياً" } as Record<string, string>,
    correctionTitle: "اقتراح تصحيح",
    correctionIntro: "يُسجّل قيد تعديل مرتبط يذكر عنصر Tap. لا يتغير شيء حتى يعتمده مسؤول آخر من صفحة الاعتمادات. تُجمع التصحيحات حتى تساوي مبلغ الفرق، والتصحيح الأصغر يُسجَّل جزئياً ويبقى الفرق مفتوحاً.",
    breakDifference: "مبلغ الفرق",
    correctedSoFar: "المصحَّح حتى الآن",
    remaining: "المتبقي للتصحيح",
    capturedDelta: "التغيير في المبلغ المقبوض (ر.س، + أو -)",
    providerDelta: "التغيير في حصة المزود (ر.س، + أو -)",
    platformDelta: "التغيير في حصة المنصة (ر.س، + أو -)",
    justification: "المبرر (10 أحرف على الأقل)",
    send: "إرسال للاعتماد",
    cancel: "إلغاء",
    numberInvalid: "أدخل مبالغ مثل 5 أو -12.50؛ ويجب ألا تكون كلها صفراً.",
    partialBadge: "مصحَّح جزئياً",
    sent: "أُرسل التصحيح للاعتماد.",
    runsTitle: "آخر عمليات التسوية",
    noRuns: "لم تُجرَ أي تسوية بعد.",
    runStatus: { matched: "مطابقة", breaks: "توجد فروق", no_tap_data: "لا توجد بيانات Tap" } as Record<string, string>,
    refundsTitle: "مواعيد الاسترداد",
    refundsIntro: "يبدأ الاسترداد في Tap خلال 3 أيام عمل من استحقاق العميل، ويجب أن ينجح في Tap خلال 14 يوماً من إشعار الإلغاء.",
    noRefunds: "لا توجد مبالغ مستردة في آخر 30 يوماً.",
    colAmount: "المبلغ",
    colEntitled: "الاستحقاق",
    colInitiate: "البدء في Tap قبل",
    colSucceed: "النجاح قبل",
    colTapStatus: "في Tap",
    late: "متأخر",
    onTime: "في الموعد",
    notSent: "لم يُرسل إلى Tap",
    checkWithTap: "التحقق مع Tap",
    checking: "جارٍ التحقق...",
    checked: "حالة Tap: {status}.",
    refundStates: { processing: "قيد المعالجة", succeeded: "ناجح", failed: "فاشل", unknown: "غير معروف" } as Record<string, string>,
    previous: "السابق",
    next: "التالي",
  },
};

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, String(value)), text);
const yesterdayInRiyadh = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" })
  .format(new Date(Date.now() - 86400000));
const AMOUNT = /^-?\d+(\.\d{1,2})?$/;

export default function AdminReconciliation() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  const isRTL = lang === "ar";
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [day, setDay] = useState(yesterdayInRiyadh);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [importSource, setImportSource] = useState<ImportSource>("bank_statement");
  const [importText, setImportText] = useState("");
  const [importReason, setImportReason] = useState("");
  const [correction, setCorrection] = useState<{ brk: Break; provider: string; platform: string; captured: string; justification: string; error: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_reconciliation_overview", { p_status: status, p_limit: PAGE, p_offset: page * PAGE });
    if (error) {
      setLoadError(errorMessage(error));
      setForbidden(isForbidden(error));
      setView(null);
    } else {
      setLoadError("");
      setForbidden(false);
      setView(data as Overview);
    }
    setLoading(false);
  }, [status, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runDay = async (fetchFromTap: boolean) => {
    setBusy(fetchFromTap ? "fetch" : "run");
    setActionError("");
    type RunResult = { status?: string; itemised?: { status?: string } };
    let result: RunResult | null = null;
    if (fetchFromTap) {
      const { data, error } = await supabase.functions.invoke("reconcile-psp", { body: { date: day } });
      if (error) {
        let detail = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) detail = body.error;
        } catch {
          // keep the generic message
        }
        setActionError(detail);
        setBusy("");
        return;
      }
      result = data as RunResult;
    } else {
      const { data, error } = await supabase.rpc("run_tap_reconciliation", { p_business_day: day });
      if (error) {
        setActionError(errorMessage(error));
        setBusy("");
        return;
      }
      result = data as RunResult;
    }
    const outcome = result?.itemised?.status ?? result?.status ?? "";
    setSuccess(fill(t.runDone, { day, status: t.runStatus[outcome] ?? outcome }));
    setBusy("");
    await load();
  };

  const importFile = async () => {
    const parsed = parseReconciliationRows(importText, importSource);
    if (parsed.errors.length > 0) { setActionError(fill(t.importBad, { lines: parsed.errors.map((e) => e.line).join(", ") })); return; }
    if (parsed.rows.length === 0) { setActionError(t.importEmpty); return; }
    if (importReason.trim().length < 10) { setActionError(t.importReason); return; }
    setBusy("import");
    setActionError("");
    const { data, error } = await supabase.rpc("admin_import_reconciliation_file", {
      p_source: importSource, p_business_day: day, p_rows: parsed.rows, p_reason: importReason.trim(),
    });
    setBusy("");
    if (error) { setActionError(errorMessage(error)); return; }
    setImportText("");
    setImportReason("");
    // SECFIX-2 R2-H3: the file is staged for a second money.ledger holder; it is applied only when they approve it.
    setSuccess(fill(t.importDone, { sha: ((data as { file_sha256?: string })?.file_sha256 ?? "").slice(0, 12) }));
    await load();
  };

  const sendCorrection = async () => {
    if (!correction) return;
    const provider = correction.provider.trim() === "" ? "0" : correction.provider.trim();
    const platform = correction.platform.trim() === "" ? "0" : correction.platform.trim();
    const captured = correction.captured.trim() === "" ? "0" : correction.captured.trim();
    if (!AMOUNT.test(provider) || !AMOUNT.test(platform) || !AMOUNT.test(captured)
        || (Number(provider) === 0 && Number(platform) === 0 && Number(captured) === 0)) {
      setCorrection({ ...correction, error: t.numberInvalid });
      return;
    }
    if (correction.justification.trim().length < 10) { setCorrection({ ...correction, error: t.justification }); return; }
    setBusy("correction");
    // One proposal per break and amounts: a retry after a lost response finds the same request.
    const idempotencyKey = `break:${correction.brk.id}:${provider}:${platform}:${captured}:${Number(correction.brk.corrected_amount ?? 0)}`;
    const { error } = await supabase.rpc("admin_propose_break_resolution", {
      p_break_id: correction.brk.id,
      p_provider_share_delta: Number(provider),
      p_platform_share_delta: Number(platform),
      p_justification: correction.justification.trim(),
      p_idempotency_key: idempotencyKey,
      p_captured_delta: Number(captured),
    });
    setBusy("");
    if (error) { setCorrection({ ...correction, error: errorMessage(error) }); return; }
    setCorrection(null);
    setSuccess(t.sent);
    await load();
  };

  const checkWithTap = async (refund: Refund) => {
    setBusy(`check:${refund.id}`);
    setActionError("");
    const { data, error } = await supabase.functions.invoke("check-refund-status", { body: { refundRequestId: refund.id } });
    setBusy("");
    if (error) {
      let detail = error.message;
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) detail = body.error;
      } catch {
        // keep the generic message
      }
      setActionError(detail);
      return;
    }
    const state = (data as { state?: string })?.state ?? "unknown";
    setSuccess(fill(t.checked, { status: t.refundStates[state] ?? state }));
    await load();
  };

  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const card = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const button = `rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-black text-gray-900 hover:border-[#D1AF47] disabled:opacity-50 ${focusRing}`;
  const primary = `rounded-xl bg-gray-900 px-4 py-2 text-xs font-black text-white hover:bg-gray-800 disabled:opacity-50 ${focusRing}`;
  const cell = "px-3 py-2.5 align-top text-start";
  const money = (value: number | null) => (value === null || value === undefined ? "—" : sar(Number(value), lang));
  const providerName = (b: Break) => (isRTL ? b.provider_name_ar || b.provider_name_en : b.provider_name_en || b.provider_name_ar) || "—";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-6 text-start">
      <div>
        <h2 className="font-serif text-2xl font-black text-gray-900">{t.title}</h2>
        <p className="mt-1 max-w-4xl text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      {forbidden ? <ForbiddenNotice locale={lang} /> : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section aria-labelledby="run-title" className={`${card} space-y-3`}>
              <h3 id="run-title" className="text-sm font-black text-gray-900">{t.runTitle}</h3>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
                <span>{t.day}</span>
                <input type="date" dir="ltr" value={day} max={yesterdayInRiyadh()} onChange={(e) => setDay(e.target.value)} className={operationsInput} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy !== ""} onClick={() => void runDay(true)}>{busy === "fetch" ? t.running : t.fetchAndRun}</button>
                <button type="button" className={button} disabled={busy !== ""} onClick={() => void runDay(false)}>{busy === "run" ? t.running : t.runRecorded}</button>
              </div>
            </section>
            <section aria-labelledby="import-title" className={`${card} space-y-3`}>
              <h3 id="import-title" className="text-sm font-black text-gray-900">{t.importTitle}</h3>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
                <span>{t.importSource}</span>
                <select value={importSource} onChange={(e) => setImportSource(e.target.value as ImportSource)} className={operationsInput}>
                  <option value="bank_statement">{t.bankStatement}</option>
                  <option value="tap_settlement_file">{t.settlementFile}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
                <span>{t.importRows}</span>
                <textarea dir="ltr" rows={4} value={importText} onChange={(e) => setImportText(e.target.value)} className={`${operationsInput} font-mono`} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
                <span>{t.importReason}</span>
                <input value={importReason} maxLength={300} onChange={(e) => setImportReason(e.target.value)} className={operationsInput} />
              </label>
              <button type="button" className={primary} disabled={busy !== ""} onClick={() => void importFile()}>{busy === "import" ? t.running : t.importButton}</button>
            </section>
          </div>

          {actionError ? <p role="alert" className="rounded-xl border border-[#FEE4E2] bg-[#FEF3F2] p-3 text-xs font-bold text-[#B42318]">{actionError}</p> : null}

          <section aria-labelledby="breaks-title" className={`${card} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="breaks-title" className="text-sm font-black text-gray-900">{t.breaksTitle}</h3>
              <div role="group" aria-label={t.colStatus} className="flex flex-wrap gap-2">
                {STATUSES.map((value) => (
                  <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}
                    className={`${button} ${status === value ? "border-[#D1AF47] bg-[#FFFBEB]" : ""}`}>
                    {value === "open" ? t.statusOpen : value === "resolved" ? t.statusResolved : t.statusAuto}
                    {view?.counts ? ` (${value === "open" ? (view.counts.open ?? 0) + (view.counts.escalated ?? 0) : view.counts[value] ?? 0})` : ""}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <p role="status" className="text-xs font-bold text-gray-400">{t.loading}</p> : loadError ? (
              <p role="alert" className="text-xs font-bold text-[#B42318]">
                {fill(t.loadFailed, { reason: loadError })}{" "}
                <button type="button" onClick={() => void load()} className={`underline ${focusRing}`}>{t.retry}</button>
              </p>
            ) : !view || view.breaks.length === 0 ? <p className="text-xs font-semibold text-gray-500">{t.empty}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-xs">
                  <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>
                      {[t.colDay, t.colKind, t.colObject, t.colProvider, t.colTap, t.colLedger, t.colOpen, t.colStatus, t.colActions].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {view.breaks.map((b) => (
                      <tr key={b.id}>
                        <td className={cell}>{b.business_day}</td>
                        <td className={cell}>{t.kinds[b.kind] ?? b.kind}</td>
                        <td className={cell}><bdi dir="ltr" className="font-mono">{b.tap_object_id ?? "—"}</bdi></td>
                        <td className={cell}>{providerName(b)}</td>
                        <td className={cell}>{money(b.tap_amount)}</td>
                        <td className={cell}>{money(b.ledger_amount)}</td>
                        <td className={cell}>{fill(t.days, { n: b.business_days_open })}</td>
                        <td className={cell}>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${b.status === "escalated" ? "bg-[#FEF3F2] text-[#B42318]" : b.status === "open" ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#ECFDF3] text-[#027A48]"}`}>{t.statuses[b.status] ?? b.status}</span>
                          {b.status === "escalated" ? <span className="mt-1 block text-[10px] text-[#B42318]">{t.escalated}</span> : null}
                          {b.correction_pending ? <span className="mt-1 block text-[10px] text-[#B54708]">{t.pendingCorrection}</span> : null}
                          {Number(b.corrected_amount ?? 0) > 0 && b.status !== "resolved" ? <span className="mt-1 block text-[10px] text-[#B54708]">{t.partialBadge}: {money(b.corrected_amount)}</span> : null}
                        </td>
                        <td className={cell}>
                          {(b.status === "open" || b.status === "escalated") && !b.correction_pending ? (
                            <button type="button" className={button} aria-label={`${t.propose}: ${b.tap_object_id ?? b.id}`}
                              onClick={() => setCorrection({ brk: b, provider: "", platform: "", captured: "", justification: "", error: "" })}>{t.propose}</button>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-2">
                  <button type="button" className={button} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.previous}</button>
                  <button type="button" className={button} disabled={view.breaks.length < PAGE} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="refunds-title" className={`${card} space-y-3`}>
            <h3 id="refunds-title" className="text-sm font-black text-gray-900">{t.refundsTitle}</h3>
            <p className="text-xs font-semibold text-gray-500">{t.refundsIntro}</p>
            {!view ? null : view.refunds.length === 0 ? <p className="text-xs font-semibold text-gray-500">{t.noRefunds}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-xs">
                  <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>{[t.colAmount, t.colEntitled, t.colInitiate, t.colSucceed, t.colTapStatus, t.colActions].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {view.refunds.map((r) => (
                      <tr key={r.id}>
                        <td className={cell}>{money(r.amount)}</td>
                        <td className={cell}>{operationsDate(r.entitled_at, lang)}</td>
                        <td className={cell}>{operationsDate(r.initiate_by, lang)} <span className={r.initiation_late ? "text-[#B42318]" : "text-[#027A48]"}>· {r.initiation_late ? t.late : t.onTime}</span></td>
                        <td className={cell}>{operationsDate(r.succeed_by, lang)} <span className={r.completion_late ? "text-[#B42318]" : "text-[#027A48]"}>· {r.completion_late ? t.late : t.onTime}</span></td>
                        <td className={cell}>{r.gateway_refund_id ? (t.refundStates[r.gateway_status ?? "unknown"] ?? r.gateway_status) : t.notSent}</td>
                        <td className={cell}>
                          {r.tap_check_due && view.can_refund ? (
                            <button type="button" className={button} disabled={busy !== ""} onClick={() => void checkWithTap(r)} aria-label={`${t.checkWithTap}: ${r.gateway_refund_id}`}>
                              {busy === `check:${r.id}` ? t.checking : t.checkWithTap}
                            </button>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="imports-title" className={`${card} space-y-3`}>
            <h3 id="imports-title" className="text-sm font-black text-gray-900">{t.importsTitle}</h3>
            <p className="text-xs font-semibold text-gray-500">{t.importsIntro}</p>
            {!view ? null : (view.imports ?? []).length === 0 ? <p className="text-xs font-semibold text-gray-500">{t.noImports}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>{[t.colDay, t.colSource, t.colRows, t.colFile, t.colStatus].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {view.imports.map((imp) => (
                      <tr key={imp.id}>
                        <td className={cell}>{imp.business_day}</td>
                        <td className={cell}>{t.sources[imp.source] ?? imp.source}</td>
                        <td className={cell}>{imp.status === "applied" ? imp.object_count : "—"}</td>
                        <td className={cell}><bdi dir="ltr" className="font-mono">{imp.file_sha256 ? `${imp.file_sha256.slice(0, 12)}…` : "—"}</bdi></td>
                        <td className={cell}>{t.importStatuses[imp.status] ?? imp.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="runs-title" className={`${card} space-y-3`}>
            <h3 id="runs-title" className="text-sm font-black text-gray-900">{t.runsTitle}</h3>
            {!view ? null : view.runs.length === 0 ? <p className="text-xs font-semibold text-gray-500">{t.noRuns}</p> : (
              <ul className="divide-y divide-[#F5F5F5] text-xs font-semibold text-gray-700">
                {view.runs.map((run) => (
                  <li key={run.business_day} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{run.business_day}</span>
                    <span>{t.runStatus[run.status] ?? run.status}</span>
                    <span>{operationsDate(run.ran_at, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {correction ? (
        <ModalOverlay onClose={() => setCorrection(null)} canClose={busy !== "correction"} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="correction-title" tabIndex={-1} dir={isRTL ? "rtl" : "ltr"} className="w-full max-w-lg space-y-4 rounded-2xl border border-[#ECECEC] bg-white p-6 text-start">
            <h3 id="correction-title" className="font-serif text-xl font-black text-gray-900">{t.correctionTitle}</h3>
            <p className="text-xs font-semibold text-gray-500">{t.correctionIntro}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="font-bold text-gray-500">{t.colKind}</dt><dd>{t.kinds[correction.brk.kind] ?? correction.brk.kind}</dd>
              <dt className="font-bold text-gray-500">{t.colObject}</dt><dd><bdi dir="ltr" className="font-mono">{correction.brk.tap_object_id ?? "—"}</bdi></dd>
              <dt className="font-bold text-gray-500">{t.colTap}</dt><dd>{money(correction.brk.tap_amount)}</dd>
              <dt className="font-bold text-gray-500">{t.colLedger}</dt><dd>{money(correction.brk.ledger_amount)}</dd>
              <dt className="font-bold text-gray-500">{t.breakDifference}</dt><dd>{money(correction.brk.difference)}</dd>
              <dt className="font-bold text-gray-500">{t.correctedSoFar}</dt><dd>{money(Number(correction.brk.corrected_amount ?? 0))}</dd>
              <dt className="font-bold text-gray-500">{t.remaining}</dt><dd>{money(Math.abs(Number(correction.brk.difference ?? 0)) - Number(correction.brk.corrected_amount ?? 0))}</dd>
            </dl>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
              <span>{t.capturedDelta}</span>
              <input dir="ltr" inputMode="decimal" value={correction.captured} onChange={(e) => setCorrection({ ...correction, captured: e.target.value })} className={operationsInput} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
              <span>{t.providerDelta}</span>
              <input dir="ltr" inputMode="decimal" value={correction.provider} onChange={(e) => setCorrection({ ...correction, provider: e.target.value })} className={operationsInput} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
              <span>{t.platformDelta}</span>
              <input dir="ltr" inputMode="decimal" value={correction.platform} onChange={(e) => setCorrection({ ...correction, platform: e.target.value })} className={operationsInput} />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
              <span>{t.justification}</span>
              <textarea rows={3} value={correction.justification} onChange={(e) => setCorrection({ ...correction, justification: e.target.value })} className={operationsInput} />
            </label>
            {correction.error ? <p role="alert" className="rounded-xl border border-[#FEE4E2] bg-[#FEF3F2] p-3 text-xs font-bold text-[#B42318]">{correction.error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={button} disabled={busy === "correction"} onClick={() => setCorrection(null)}>{t.cancel}</button>
              <button type="button" className={primary} disabled={busy === "correction"} onClick={() => void sendCorrection()}>{busy === "correction" ? t.running : t.send}</button>
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      <CommandResult success={success} locale={lang} onDismiss={() => setSuccess("")} />
    </div>
  );
}
