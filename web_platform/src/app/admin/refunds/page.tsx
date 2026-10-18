"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";

// Refunds owed to customers (refund_requests). Money moves only through the process-refund function,
// for exactly the recorded amount, with the request's idempotency key; this screen shows where each
// refund stands and lets an operator ask for another attempt with a recorded reason.
// QA item 4: a refund whose outcome at Tap is unknown is never sent again. It is settled by Check with Tap
// (check-refund-status) or by a decision a second money.refund holder approves (admin_request_refund_outcome_decision).

const PAGE_SIZE = 25;
const MAX_AUTOMATIC_ATTEMPTS = 5;

type RefundRow = {
  id: string;
  amount: number | string;
  reason: string;
  source: string;
  status: "pending" | "processing" | "succeeded" | "failed" | "unknown";
  attempts: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  claimed_at: string | null;
  booking_id: string | null;
  bookings: { invoice_number: number | null } | null;
  gateway_refund_id?: string | null;
  tap_check_due?: boolean;
  tap_checks?: number;
  last_tap_check_at?: string | null;
  outcome_unknown_at?: string | null;
  pending_decision_id?: string | null;
  purchase_type?: string | null;
};

type Filter = "attention" | "unknown" | "failed" | "pending" | "processing" | "succeeded" | "all";
type Outcome = { status?: string; error?: string };
type Pending = { kind: "retry" | "reopen" | "paidAtTap" | "notPaidAtTap"; row: RefundRow };
const TAP_REFUND_ID = /^[A-Za-z0-9_-]{3,128}$/;

const translations = {
  en: {
    title: "Refunds",
    subtitle: "Refunds owed to customers. Money is returned only through the payment gateway, for exactly the recorded amount.",
    filterLabel: "Show",
    filters: { attention: "Needs attention", unknown: "Outcome unknown", failed: "Failed", pending: "Waiting", processing: "In progress", succeeded: "Returned", all: "All" } as Record<Filter, string>,
    requested: "Requested",
    amount: "Amount",
    source: "Source",
    reason: "Reason",
    status: "Status",
    booking: "Booking",
    action: "Action",
    sources: {
      customer_cancellation: "Customer cancellation",
      provider_cancellation: "Provider cancellation",
      no_show_remainder: "No-show remainder",
      dispute: "Dispute",
      admin: "Operator",
      late_payment_conflict: "Late payment for a released slot",
      admin_cancellation: "Console cancellation",
      admin_no_show: "Console no-show",
      customer_membership_cancellation: "Membership cancelled by the customer",
      provider_membership_cancellation: "Membership cancelled by the provider",
      admin_membership_cancellation: "Membership cancelled from the console",
    } as Record<string, string>,
    purchases: { membership: "Membership", package: "Package" } as Record<string, string>,
    statuses: { pending: "Waiting", processing: "In progress", succeeded: "Returned", failed: "Failed", unknown: "Outcome unknown" } as Record<string, string>,
    attempt: "Attempt {n} of {max}",
    stalled: "No longer retried automatically",
    returnedOn: "Returned {date}",
    inProgress: "The gateway is processing this refund",
    stuck: "Stuck in progress since {date}",
    stuckUnknown: "Stuck in progress (the time it was picked up was not recorded)",
    reopen: "Mark outcome unknown",
    reopenTitle: "Mark a refund stuck in progress as unknown",
    reopenIntro: "Its outcome was never recorded, so the console cannot tell whether Tap issued it. Marking it unknown stops it from being sent again; you then settle it with Check with Tap or with a decision a second person approves.",
    reopenAck: "I understand the refund will not be sent again until its outcome is confirmed.",
    reopenConfirm: "Mark unknown",
    reopenDone: "The refund is marked unknown. Check it with Tap or record what Tap shows.",
    unknownExplain: "Tap may already have paid this refund, so it is never sent again automatically.",
    unknownSince: "Unknown since {date}",
    tapChecks: "Checked with Tap {n} times",
    checkWithTap: "Check with Tap",
    checking: "Checking…",
    checkFor: "Check refund {ref} with Tap",
    checkedFound: "Tap's answer was recorded: {status}.",
    checkedNotFound: "Tap shows no refund for this request yet. Nothing was changed; check again later or record what the Tap dashboard shows.",
    paidAtTap: "Tap shows it paid",
    notPaidAtTap: "Tap shows no refund",
    paidAtTapFor: "Record that Tap paid refund {ref}",
    notPaidAtTapFor: "Record that Tap shows no refund for {ref}",
    paidTitle: "Record that Tap paid this refund",
    paidIntro: "Use this when the Tap dashboard shows this refund as paid. A different finance or owner account must approve it; only then is the refund recorded as returned.",
    tapIdLabel: "Tap refund id (from the Tap dashboard)",
    tapIdError: "Enter the Tap refund id exactly as Tap shows it (letters, digits, - and _).",
    notPaidTitle: "Record that Tap shows no refund",
    notPaidIntro: "Use this when the Tap dashboard shows no refund for this charge and reference. A different finance or owner account must approve it; only then can the refund be sent again.",
    notPaidAck: "I searched the Tap dashboard for this charge and found no refund for this request.",
    decisionReason: "What you saw at Tap (at least 10 characters, recorded in the audit log)",
    decisionConfirm: "Ask for approval",
    decisionAsked: "Sent for approval. A different finance or owner account decides it in Approvals.",
    decisionWaiting: "Waiting for a second person in Approvals",
    unknownOutcome: "Tap did not give a definite answer. The refund is marked unknown and will not be sent again until its outcome is confirmed.",
    retry: "Retry now",
    retrying: "Retrying…",
    retryTitle: "Retry this refund",
    retryIntro: "The refund is sent to the payment gateway again, for exactly the recorded amount and under this refund's own reference.",
    retryConfirm: "Retry refund",
    reasonLabel: "Reason (recorded in the audit log)",
    factAmount: "Amount",
    factBooking: "Booking",
    factRequested: "Requested",
    factStatus: "Status",
    factSince: "In progress since",
    factUnknown: "not recorded",
    factReference: "Refund reference",
    retryFor: "Retry refund {ref}, {amount}",
    reopenFor: "Reopen refund {ref}, {amount}",
    resetView: "Show refunds that need attention",
    swipeHint: "Swipe sideways to see every column.",
    retrySucceeded: "The gateway accepted the refund.",
    retryFailed: "The gateway refused the refund again: {reason}",
    retrySkipped: "The refund was not attempted: {reason}",
    noOutcome: "The refund service did not report a result. Check this refund again shortly.",
    factTapId: "Tap refund id",
    factUnknownSince: "Unknown since",
    refundHeading: "Refund",
    loading: "Loading refunds…",
    loadFailed: "Refunds could not be loaded: {reason}",
    tryAgain: "Try again",
    empty: "No refunds are waiting.",
    filteredEmpty: "No refunds match this view.",
    total: "{n} refunds",
    page: "Page {page} of {pages}",
    previous: "Previous",
    next: "Next",
  },
  ar: {
    title: "المبالغ المستردة",
    subtitle: "المبالغ المستحقة للعملاء. تُعاد الأموال عبر بوابة الدفع فقط وبالمبلغ المسجل تماماً.",
    filterLabel: "عرض",
    filters: { attention: "تحتاج إلى إجراء", unknown: "النتيجة غير معروفة", failed: "فشلت", pending: "بالانتظار", processing: "قيد المعالجة", succeeded: "أُعيدت", all: "الكل" } as Record<Filter, string>,
    requested: "تاريخ الطلب",
    amount: "المبلغ",
    source: "المصدر",
    reason: "السبب",
    status: "الحالة",
    booking: "الحجز",
    action: "الإجراء",
    sources: {
      customer_cancellation: "إلغاء من العميل",
      provider_cancellation: "إلغاء من مقدم الخدمة",
      no_show_remainder: "المتبقي بعد عدم الحضور",
      dispute: "نزاع",
      admin: "المشرف",
      late_payment_conflict: "دفع متأخر لموعد أُطلق",
      admin_cancellation: "إلغاء من لوحة الإدارة",
      admin_no_show: "عدم حضور مسجل من لوحة الإدارة",
      customer_membership_cancellation: "عضوية ألغاها العميل",
      provider_membership_cancellation: "عضوية ألغاها مقدم الخدمة",
      admin_membership_cancellation: "عضوية أُلغيت من لوحة الإدارة",
    } as Record<string, string>,
    purchases: { membership: "عضوية", package: "باقة" } as Record<string, string>,
    statuses: { pending: "بالانتظار", processing: "قيد المعالجة", succeeded: "أُعيدت", failed: "فشلت", unknown: "النتيجة غير معروفة" } as Record<string, string>,
    attempt: "المحاولة {n} من {max}",
    stalled: "لم تعد تُعاد محاولتها تلقائياً",
    returnedOn: "أُعيدت في {date}",
    inProgress: "بوابة الدفع تعالج هذا الاسترداد",
    stuck: "عالق قيد المعالجة منذ {date}",
    stuckUnknown: "عالق قيد المعالجة (لم يُسجَّل وقت بدء معالجته)",
    reopen: "اعتبار النتيجة غير معروفة",
    reopenTitle: "اعتبار نتيجة استرداد عالق قيد المعالجة غير معروفة",
    reopenIntro: "لم تُسجَّل نتيجة هذا الاسترداد، فلا تعرف لوحة الإدارة إن كانت Tap قد أصدرته. اعتباره غير معروف يمنع إرساله مرة أخرى، ثم تحسم أمره بالتحقق لدى Tap أو بقرار يعتمده شخص آخر.",
    reopenAck: "أفهم أن الاسترداد لن يُرسَل مرة أخرى حتى تتأكد نتيجته.",
    reopenConfirm: "اعتبارها غير معروفة",
    reopenDone: "اعتُبرت نتيجة الاسترداد غير معروفة. تحقق منه لدى Tap أو سجّل ما تظهره Tap.",
    unknownExplain: "ربما دفعت Tap هذا الاسترداد فعلاً، لذلك لا يُرسَل مرة أخرى تلقائياً.",
    unknownSince: "غير معروفة منذ {date}",
    tapChecks: "عدد مرات التحقق لدى Tap: {n}",
    checkWithTap: "التحقق لدى Tap",
    checking: "جارٍ التحقق…",
    checkFor: "التحقق من الاسترداد {ref} لدى Tap",
    checkedFound: "سُجّل رد Tap: {status}.",
    checkedNotFound: "لا تظهر لدى Tap عملية استرداد لهذا الطلب حتى الآن. لم يتغير شيء؛ تحقق لاحقاً أو سجّل ما تظهره لوحة Tap.",
    paidAtTap: "تظهر Tap أنه دُفع",
    notPaidAtTap: "لا تظهر Tap أي استرداد",
    paidAtTapFor: "تسجيل أن Tap دفعت الاسترداد {ref}",
    notPaidAtTapFor: "تسجيل أن Tap لا تظهر استرداداً للطلب {ref}",
    paidTitle: "تسجيل أن Tap دفعت هذا الاسترداد",
    paidIntro: "استخدم هذا عندما تظهر لوحة Tap أن هذا الاسترداد دُفع. يجب أن يعتمده حساب مالية أو مالك آخر، وعندها فقط يُسجَّل الاسترداد على أنه أُعيد.",
    tapIdLabel: "رقم الاسترداد لدى Tap (من لوحة Tap)",
    tapIdError: "أدخل رقم الاسترداد كما يظهر في Tap تماماً (حروف وأرقام و - و _).",
    notPaidTitle: "تسجيل أن Tap لا تظهر أي استرداد",
    notPaidIntro: "استخدم هذا عندما لا تظهر لوحة Tap أي استرداد لهذه العملية وهذا المرجع. يجب أن يعتمده حساب مالية أو مالك آخر، وعندها فقط يمكن إرسال الاسترداد مرة أخرى.",
    notPaidAck: "بحثتُ في لوحة Tap عن هذه العملية ولم أجد استرداداً لهذا الطلب.",
    decisionReason: "ما رأيته في Tap (10 أحرف على الأقل، يُسجَّل في سجل التدقيق)",
    decisionConfirm: "طلب الاعتماد",
    decisionAsked: "أُرسل للاعتماد. يقرره حساب مالية أو مالك آخر من صفحة الاعتمادات.",
    decisionWaiting: "بانتظار شخص آخر في صفحة الاعتمادات",
    unknownOutcome: "لم تعطِ Tap رداً حاسماً. اعتُبرت نتيجة الاسترداد غير معروفة ولن يُرسَل مرة أخرى حتى تتأكد نتيجته.",
    retry: "إعادة المحاولة الآن",
    retrying: "جارٍ إعادة المحاولة…",
    retryTitle: "إعادة محاولة هذا الاسترداد",
    retryIntro: "يُرسَل الاسترداد إلى بوابة الدفع مجدداً بالمبلغ المسجل تماماً وتحت مرجع هذا الاسترداد نفسه.",
    retryConfirm: "إعادة محاولة الاسترداد",
    reasonLabel: "السبب (يُسجل في سجل التدقيق)",
    factAmount: "المبلغ",
    factBooking: "الحجز",
    factRequested: "تاريخ الطلب",
    factStatus: "الحالة",
    factSince: "قيد المعالجة منذ",
    factUnknown: "غير مسجَّل",
    factReference: "مرجع الاسترداد",
    retryFor: "إعادة محاولة الاسترداد {ref}، {amount}",
    reopenFor: "إعادة فتح الاسترداد {ref}، {amount}",
    resetView: "عرض المبالغ التي تحتاج إلى إجراء",
    swipeHint: "اسحب جانبياً لرؤية كل الأعمدة.",
    retrySucceeded: "قبلت بوابة الدفع عملية الاسترداد.",
    retryFailed: "رفضت بوابة الدفع الاسترداد مرة أخرى: {reason}",
    retrySkipped: "لم تتم محاولة الاسترداد: {reason}",
    noOutcome: "لم تُرجع خدمة الاسترداد نتيجة. تحقق من هذا الاسترداد مرة أخرى بعد قليل.",
    factTapId: "رقم الاسترداد لدى Tap",
    factUnknownSince: "غير معروفة منذ",
    refundHeading: "الاسترداد",
    loading: "جارٍ تحميل المبالغ المستردة…",
    loadFailed: "تعذّر تحميل المبالغ المستردة: {reason}",
    tryAgain: "إعادة المحاولة",
    empty: "لا توجد مبالغ مستردة بالانتظار.",
    filteredEmpty: "لا توجد مبالغ مستردة في هذا العرض.",
    total: "عدد عمليات الاسترداد: {n}",
    page: "الصفحة {page} من {pages}",
    previous: "السابق",
    next: "التالي",
  },
};

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

// process-refund answers 409 when it skipped the request and 502 when the gateway refused it; the
// outcome is in the response body either way.
async function readOutcome(error: unknown): Promise<Outcome | null> {
  const context = error && typeof error === "object" && "context" in error ? (error as { context: unknown }).context : null;
  if (context instanceof Response) {
    try {
      return (await context.clone().json()) as Outcome;
    } catch {
      return null;
    }
  }
  return null;
}

export default function AdminRefundsPage() {
  const locale = useOperationsLocale();
  const t = translations[locale];
  const isRTL = locale === "ar";

  const [filter, setFilter] = useState<Filter>("attention");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // When the list was read; a refund's age is measured against it, so rendering stays free of the clock.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [checking, setChecking] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      // GOV-FIX (Q4): the refunds queue is read through the audited, server-paged admin_list_refund_requests.
      const { data: result, error } = await supabase.rpc("admin_list_refund_requests", {
        p_filter: filter, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE, p_purpose: "finance_operations",
      });
      const listed = result as { total?: number | string; rows?: RefundRow[] } | null;
      const data = listed?.rows ?? [];
      const count = Number(listed?.total ?? 0);
      if (cancelled) return;
      if (error) {
        setRows([]);
        setTotal(0);
        setLoadError(errorMessage(error));
        setLoadForbidden(isForbidden(error));
      } else {
        setLoadForbidden(false);
        setRows((data ?? []) as unknown as RefundRow[]);
        setLoadedAt(Date.now());
        setTotal(count ?? 0);
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [filter, page, reloadKey]);

  const STUCK_AFTER_MS = 15 * 60 * 1000;
  const isStuck = (row: RefundRow) => row.status === "processing" && (!row.claimed_at || loadedAt - new Date(row.claimed_at).getTime() > STUCK_AFTER_MS);
  const refundRef = (row: RefundRow) => row.id.slice(0, 8);
  const bookingRef = (row: RefundRow) => (row.bookings?.invoice_number ? `#${row.bookings.invoice_number}` : row.booking_id ? row.booking_id.slice(0, 8) : "—");

  // The retry is two steps: the audited command puts the refund back in the queue, then the refund service sends it
  // to the gateway. A refusal of the first step stays in the dialog; the gateway's answer is shown as the result,
  // because by then the refund has been re-queued whatever the gateway says.
  const retryRefund = async (row: RefundRow, reason: string): Promise<string | null> => {
    const { error: retryError } = await supabase.rpc("admin_retry_refund_request", { p_refund_id: row.id, p_reason: reason });
    if (retryError) return errorMessage(retryError);
    const { data, error: invokeError } = await supabase.functions.invoke("process-refund", { body: { refundRequestId: row.id } });
    const outcome = invokeError ? await readOutcome(invokeError) : (data as Outcome | null);
    if (outcome?.status === "succeeded") setNotice({ success: t.retrySucceeded });
    else if (outcome?.status === "unknown") setNotice({ error: t.unknownOutcome });
    else if (outcome?.status === "failed") setNotice({ error: fill(t.retryFailed, { reason: outcome.error || "" }) });
    else if (outcome?.status === "skipped") setNotice({ error: fill(t.retrySkipped, { reason: outcome.error || "" }) });
    else setNotice({ error: invokeError ? errorMessage(invokeError) : t.noOutcome });
    setReloadKey((key) => key + 1);
    return null;
  };

  const reopenRefund = async (row: RefundRow, reason: string): Promise<string | null> => {
    const { error: reopenError } = await supabase.rpc("admin_reopen_stuck_refund", { p_refund_id: row.id, p_reason: reason });
    if (reopenError) return errorMessage(reopenError);
    setNotice({ success: t.reopenDone });
    setReloadKey((key) => key + 1);
    return null;
  };

  // Check with Tap reads Tap's own refund (never creates one); the database records the answer.
  const checkWithTap = async (row: RefundRow) => {
    if (checking) return;
    setChecking(row.id);
    setNotice({});
    const { data, error: invokeError } = await supabase.functions.invoke("check-refund-status", { body: { refundRequestId: row.id } });
    setChecking(null);
    if (invokeError) {
      const body = (await readOutcome(invokeError)) as { error?: string } | null;
      setNotice({ error: body?.error || errorMessage(invokeError) });
      return;
    }
    const answer = data as { found?: boolean; status?: string } | null;
    if (answer?.found === false) setNotice({ error: t.checkedNotFound });
    else setNotice({ success: fill(t.checkedFound, { status: t.statuses[answer?.status ?? ""] ?? answer?.status ?? "" }) });
    setReloadKey((key) => key + 1);
  };

  // The decision is a request: nothing changes until a different money.refund holder approves it.
  const askDecision = async (row: RefundRow, outcome: "refunded_at_tap" | "not_refunded_at_tap", reason: string, tapId: string): Promise<string | null> => {
    const { data, error: askError } = await supabase.rpc("admin_request_refund_outcome_decision", {
      p_refund_id: row.id, p_outcome: outcome, p_tap_refund_id: outcome === "refunded_at_tap" ? tapId.trim() : null, p_reason: reason,
    });
    if (askError) return errorMessage(askError);
    if ((data as { status?: string } | null)?.status !== "pending_approval") return t.noOutcome;
    setNotice({ success: t.decisionAsked });
    setReloadKey((key) => key + 1);
    return null;
  };

  const renderDialog = () => {
    if (!pending) return null;
    const { kind, row } = pending;
    const facts = [
      { label: t.factReference, value: refundRef(row) },
      { label: t.factAmount, value: sar(Number(row.amount), locale) },
      { label: t.factBooking, value: bookingRef(row) },
      { label: t.factRequested, value: operationsDate(row.created_at, locale) },
      { label: t.factStatus, value: t.statuses[row.status] ?? row.status },
    ];
    if (kind === "reopen") facts.push({ label: t.factSince, value: row.claimed_at ? operationsDate(row.claimed_at, locale) : t.factUnknown });
    if (kind === "paidAtTap" || kind === "notPaidAtTap") {
      facts.push({ label: t.factUnknownSince, value: row.outcome_unknown_at ? operationsDate(row.outcome_unknown_at, locale) : t.factUnknown });
      if (row.gateway_refund_id) facts.push({ label: t.factTapId, value: row.gateway_refund_id });
      const paid = kind === "paidAtTap";
      return (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={paid ? t.paidTitle : t.notPaidTitle}
          intro={paid ? t.paidIntro : t.notPaidIntro}
          facts={facts}
          reasonLabel={t.decisionReason}
          minReasonLength={10}
          acknowledgement={paid ? undefined : t.notPaidAck}
          field={paid ? { label: t.tapIdLabel, initial: row.gateway_refund_id ?? "", pattern: TAP_REFUND_ID, error: t.tapIdError, ltr: true } : undefined}
          confirmLabel={t.decisionConfirm}
          onConfirm={(reason, extra) => askDecision(row, paid ? "refunded_at_tap" : "not_refunded_at_tap", reason, extra)}
          onClose={() => setPending(null)}
        />
      );
    }
    return (
      <CommandDialog
        locale={locale}
        tone={kind === "reopen" ? "danger" : "default"}
        title={kind === "retry" ? t.retryTitle : t.reopenTitle}
        intro={kind === "retry" ? t.retryIntro : t.reopenIntro}
        facts={facts}
        reasonLabel={t.reasonLabel}
        acknowledgement={kind === "reopen" ? t.reopenAck : undefined}
        confirmLabel={kind === "retry" ? t.retryConfirm : t.reopenConfirm}
        onConfirm={(reason) => (kind === "retry" ? retryRefund(row, reason) : reopenRefund(row, reason))}
        onClose={() => setPending(null)}
      />
    );
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const number = (value: number) => value.toLocaleString(isRTL ? "ar-SA" : "en-US");
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-5 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="font-serif text-2xl font-black leading-tight text-gray-900">{t.title}</h1>
        <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.filterLabel}</span>
          <select
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as Filter);
              setPage(1);
              setNotice({});
            }}
            className={`rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-xs text-gray-900 ${focusRing}`}
          >
            {(Object.keys(t.filters) as Filter[]).map((key) => (
              <option key={key} value={key}>{t.filters[key]}</option>
            ))}
          </select>
        </label>
        {!loading && !loadError && <div className="text-[11px] font-semibold text-gray-600">{fill(t.total, { n: number(total) })}</div>}
      </div>

      <CommandResult error={notice.error} success={notice.success} locale={locale} onDismiss={() => setNotice({})} />
      {renderDialog()}

      {loadError && loadForbidden ? (
        <ForbiddenNotice locale={locale} />
      ) : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{fill(t.loadFailed, { reason: loadError })}</span>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 ${focusRing}`}>
            {t.tryAgain}
          </button>
        </div>
      ) : loading ? (
        <div role="status" className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">{t.loading}</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">
          <span>{filter === "attention" ? t.empty : t.filteredEmpty}</span>
          {filter !== "attention" && (
            <button type="button" onClick={() => { setFilter("attention"); setPage(1); setNotice({}); }} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 text-xs font-black text-gray-700 ${focusRing}`}>{t.resetView}</button>
          )}
        </div>
      ) : (
        <>
        <p className="text-[11px] font-semibold text-gray-500 md:hidden">{t.swipeHint}</p>
        <div role="region" aria-label={t.title} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
              <tr>
                <th scope="col" className={`${cell} text-start`}>{t.refundHeading}</th>
                <th scope="col" className={`${cell} text-start`}>{t.status}</th>
                <th scope="col" className={`${cell} text-start`}>{t.action}</th>
                <th scope="col" className={`${cell} text-start`}>{t.source}</th>
                <th scope="col" className={`${cell} text-start`}>{t.reason}</th>
                <th scope="col" className={`${cell} text-start`}>{t.booking}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2F4F7]">
              {rows.map((row) => {
                const stalled = row.status === "failed" && row.attempts >= MAX_AUTOMATIC_ATTEMPTS;
                const canRetry = row.status === "pending" || row.status === "failed";
                const amountText = sar(Number(row.amount), locale);
                return (
                  <tr key={row.id}>
                    <td className={`${cell} whitespace-nowrap`}>
                      <div className="font-black text-gray-900">{amountText}</div>
                      <div className="text-[11px] font-semibold text-gray-600">{operationsDate(row.created_at, locale)}</div>
                      <div dir="ltr" className="text-start font-mono text-[11px] text-gray-600">{refundRef(row)}</div>
                    </td>
                    <td className={`${cell} text-xs`}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${
                          row.status === "failed" || row.status === "unknown" ? "bg-red-50 text-red-700" : row.status === "succeeded" ? "bg-green-50 text-green-800" : "bg-[#FFFAEB] text-[#7A5B12]"
                        }`}
                      >
                        {t.statuses[row.status] ?? row.status}
                      </span>
                      {row.status === "unknown" && (
                        <span className="mt-1 block max-w-[240px] text-[11px] font-semibold text-red-700">
                          {t.unknownExplain}
                          {row.outcome_unknown_at && <span className="block">{fill(t.unknownSince, { date: operationsDate(row.outcome_unknown_at, locale) })}</span>}
                          {Number(row.tap_checks ?? 0) > 0 && <span className="block text-gray-600">{fill(t.tapChecks, { n: number(Number(row.tap_checks)) })}</span>}
                        </span>
                      )}
                      {row.status !== "succeeded" && row.attempts > 0 && (
                        <span className="mt-1 block text-[11px] font-semibold text-gray-600">{fill(t.attempt, { n: number(row.attempts), max: number(MAX_AUTOMATIC_ATTEMPTS) })}</span>
                      )}
                      {stalled && <span className="mt-1 block text-[11px] font-bold text-red-700">{t.stalled}</span>}
                      {(row.status === "failed" || row.status === "unknown") && row.error_message && (
                        <span className="mt-1 block max-w-[240px] break-words text-[11px] text-red-700">{row.error_message}</span>
                      )}
                    </td>
                    <td className={`${cell} text-xs`}>
                      {row.status === "unknown" ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <button
                            type="button"
                            aria-label={fill(t.checkFor, { ref: refundRef(row) })}
                            aria-disabled={checking !== null}
                            onClick={() => void checkWithTap(row)}
                            className={`whitespace-nowrap rounded-lg border border-[#D1AF47]/50 bg-[#FFFAEB] px-3 py-1.5 text-[11px] font-black text-[#7A5B12] ${focusRing}`}
                          >
                            {checking === row.id ? t.checking : t.checkWithTap}
                          </button>
                          {row.pending_decision_id ? (
                            <span className="text-[11px] font-semibold text-gray-600">{t.decisionWaiting}</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                aria-label={fill(t.paidAtTapFor, { ref: refundRef(row) })}
                                onClick={() => setPending({ kind: "paidAtTap", row })}
                                className={`whitespace-nowrap rounded-lg border border-[#ECECEC] bg-white px-3 py-1.5 text-[11px] font-black text-gray-800 ${focusRing}`}
                              >
                                {t.paidAtTap}
                              </button>
                              <button
                                type="button"
                                aria-label={fill(t.notPaidAtTapFor, { ref: refundRef(row) })}
                                onClick={() => setPending({ kind: "notPaidAtTap", row })}
                                className={`whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black text-red-700 ${focusRing}`}
                              >
                                {t.notPaidAtTap}
                              </button>
                            </>
                          )}
                        </div>
                      ) : canRetry ? (
                        <button
                          type="button"
                          aria-label={fill(t.retryFor, { ref: refundRef(row), amount: amountText })}
                          onClick={() => setPending({ kind: "retry", row })}
                          className={`whitespace-nowrap rounded-lg border border-[#D1AF47]/50 bg-[#FFFAEB] px-3 py-1.5 text-[11px] font-black text-[#7A5B12] ${focusRing}`}
                        >
                          {t.retry}
                        </button>
                      ) : isStuck(row) ? (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-red-700">{row.claimed_at ? fill(t.stuck, { date: operationsDate(row.claimed_at, locale) }) : t.stuckUnknown}</div>
                          <button
                            type="button"
                            aria-label={fill(t.reopenFor, { ref: refundRef(row), amount: amountText })}
                            onClick={() => setPending({ kind: "reopen", row })}
                            className={`whitespace-nowrap rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-black text-red-700 ${focusRing}`}
                          >
                            {t.reopen}
                          </button>
                        </div>
                      ) : row.status === "processing" ? (
                        <span className="text-[11px] font-semibold text-gray-600">{t.inProgress}</span>
                      ) : row.processed_at ? (
                        <span className="text-[11px] font-semibold text-gray-600">{fill(t.returnedOn, { date: operationsDate(row.processed_at, locale) })}</span>
                      ) : null}
                    </td>
                    <td className={`${cell} text-xs text-gray-700`}>{t.sources[row.source] ?? row.source}</td>
                    <td className={`${cell} max-w-[220px] text-xs text-gray-700`}>
                      <span className="line-clamp-2" title={row.reason}>{row.reason}</span>
                    </td>
                    <td className={`${cell} whitespace-nowrap text-xs text-gray-700`}>
                      {row.bookings?.invoice_number ? `#${row.bookings.invoice_number}` : row.booking_id ? <span dir="ltr" className="font-mono">{row.booking_id.slice(0, 8)}</span> : row.purchase_type ? (t.purchases[row.purchase_type] ?? row.purchase_type) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {!loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-gray-500">{fill(t.page, { page: number(page), pages: number(pages) })}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>
              {t.previous}
            </button>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => Math.min(pages, p + 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>
              {t.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
