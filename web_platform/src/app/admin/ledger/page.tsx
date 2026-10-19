"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import Link from "next/link";
import { CommandResult, sar } from "@/components/operations-ui";
import { CommandDialog, ModalPortal } from "@/components/modal";
import { knownToHold, useConsoleSession } from "@/lib/console-session";
import { canRevealRequest, revealOutcome, secondsLeft } from "@/lib/payout-display.mjs";
import { commandOutcome } from "@/lib/write-result.mjs";
import { describeConsoleError, unchangedText } from "@/lib/console-errors.mjs";
import { ReadFailure } from "@/components/read-failure";

// Rows per list read from the audited functions (the server caps a page at 500).
const LIST_LIMIT = 200;

const translations = {
  en: {
    title: "Financial Ledger & Statements",
    subtitle: "Audit ledger entries, manage provider payout requests, and view accountant summaries.",
    loading: "Loading ledger details...",
    success: "Success",
    error: "Error",
    paymentIntent: "Payment Intent",
    grossCaptured: "Gross Captured",
    platformShare: "Platform share",
    providerShare: "Provider Share (85%)",
    payoutStatus: "Payout Status",
    actions: "Actions",
    released: "Released",
    releasePayout: "Release Payout",
    bookingUuid: "Booking UUID",
    payoutStatusReleased: "released",
    payoutStatusPending: "pending",
    successMsg: "Payout released.",
    errorMsg: "Failed to release transaction payout split.",
    errorLoad: "Failed to load financial records.",
    ledgerShowing: "Showing the latest {shown} of {total} ledger entries. Totals cover all {total}.",
    listShowing: "Showing the latest {shown} of {total}.",
    payoutRequestsTitle: "Provider Payout Requests",
    payoutRequestsSubtitle: "Review withdrawal requests, move them into processing, reject them, or mark paid after releasing matched ledger rows.",
    requestId: "Request ID",
    provider: "Provider",
    requestedAt: "Requested",
    amount: "Amount",
    bank: "Bank",
    iban: "IBAN",
    requestStatus: "Request Status",
    markProcessing: "Mark Processing",
    markPaid: "Mark Paid",
    rejectRequest: "Reject",
    noPayoutRequests: "No payout requests yet.",
    statusRequested: "Requested",
    statusProcessing: "Processing",
    statusPaid: "Paid",
    statusRejected: "Rejected",
    requestProcessingMsg: "Payout request moved to processing.",
    requestRejectedMsg: "Payout request rejected.",
    requestPaidMsg: "Payout request marked paid and ledger rows released.",
    requestPendingApprovalMsg: "Payout recorded for approval: a second administrator approves it in Approvals, which pays it.",
    requestActionError: "Failed to update payout request.",
    noLedgerCoverage: "No pending ledger rows were found for this provider.",
    noLedgerRows: "No captured ledger rows yet.",
    
    // Tabs
    tabMethods: "Payment Methods",
    tabSplits: "Transaction Splits",
    tabPayoutRequests: "Payout Requests",
    tabStatements: "Accountant Statements",
    tabReconciliation: "Reconciliation & fee invoices",
    tabsLabel: "Ledger sections",

    // Reconciliation Tab: the same Tap reconciliation runs as the Tap Reconciliation screen
    reconTitle: "Tap reconciliation",
    reconSubtitle: "The days reconciled against Tap, as recorded on the Tap Reconciliation screen, where days are run and differences resolved.",
    openReconciliation: "Open Tap reconciliation",
    reconDay: "Business day",
    reconStatus: "Status",
    reconOpenBreaks: "Open differences",
    reconTapCharges: "Tap charges",
    reconRanAt: "Last run",
    noReconRuns: "No day has been reconciled against Tap yet.",
    reconStatuses: { matched: "Matched", breaks: "Differences found", no_tap_data: "Not reconciled: no Tap data" } as Record<string, string>,
    feeInvoicesTitle: "Monthly platform fee invoices",
    feeInvoicesSubtitle: "Platform fee statements per provider after captured deposit offsets, with VAT on the fee.",
    invoiceNo: "Invoice no.", invoiceProvider: "Provider", invoicePeriod: "Period", invoiceBookings: "Bookings", invoiceGmv: "Gross bookings value",
    invoiceCommission: "Platform fee", invoiceDue: "Total due (incl. VAT)", invoiceStatus: "Status",
    noAccountOnFile: "This provider has no payout account on file. Nothing was revealed; ask the provider to add their bank account.",
    noBankOnRequest: "No bank account on this request",
    payoutCount: "{n} requests",
    
    // Statements Tab
    vatReportTitle: "Monthly VAT Collection Report",
    reportsFailed: "These statements could not be loaded, so the tables below are incomplete: {reason}",
    vatReportSubtitle: "Value-added tax collected from completed bookings.",
    settlementTitle: "Provider Settlement Ledger",
    settlementSubtitle: "Gross captured volume, platform commission, and released payouts per provider.",
    earningsTitle: "Employee Earnings Summary",
    earningsSubtitle: "Total earnings and completed booking counts allocated to stylists.",
    month: "Month",
    totalBookings: "Bookings",
    vatCollected: "VAT Collected",
    salesVolume: "Sales Volume",
    expectedPayouts: "Expected Payout",
    releasedPayouts: "Released Payout",
    employee: "Stylist / Employee",
    totalEarnings: "Total Earnings",
    noRecords: "No records found.",
    listFailed: "This list could not be loaded, so an empty table would be wrong: {reason}",
    retry: "Retry"
  },
  ar: {
    title: "السجل والتقارير المالية",
    subtitle: "تدقيق سجلات تقسيم الضمان المالي لمزودي الخدمة، وإدارة طلبات سحب الأرباح، والاطلاع على التقارير المحاسبية.",
    loading: "جاري تحميل تفاصيل السجل المالي...",
    success: "نجاح",
    error: "خطأ",
    paymentIntent: "معرف الدفع",
    grossCaptured: "المبلغ المقبوض",
    platformShare: "حصة المنصة",
    providerShare: "حصة مزود الخدمة (85%)",
    payoutStatus: "حالة التحويل",
    actions: "الإجراءات",
    released: "تم التحرير",
    releasePayout: "تحرير المبلغ",
    bookingUuid: "رقم الحجز (UUID)",
    payoutStatusReleased: "تم التحويل",
    payoutStatusPending: "معلق",
    successMsg: "تم تحرير دفعة الضمان بنجاح!",
    errorMsg: "فشل تحرير دفعة الضمان المالي.",
    errorLoad: "فشل تحميل السجلات المالية.",
    ledgerShowing: "عرض أحدث {shown} من {total} قيداً. الإجماليات تشمل جميع القيود ({total}).",
    listShowing: "عرض أحدث {shown} من {total}.",
    payoutRequestsTitle: "طلبات تحويل المزودين",
    payoutRequestsSubtitle: "مراجعة طلبات السحب ونقلها للمعالجة أو رفضها أو تعليمها كمدفوعة بعد تحرير سجلات الدفعات المطابقة.",
    requestId: "رقم الطلب",
    provider: "المزود",
    requestedAt: "تاريخ الطلب",
    amount: "المبلغ",
    bank: "البنك",
    iban: "الآيبان",
    requestStatus: "حالة الطلب",
    markProcessing: "قيد المعالجة",
    markPaid: "تعليم كمدفوع",
    rejectRequest: "رفض",
    noPayoutRequests: "لا توجد طلبات تحويل بعد.",
    statusRequested: "تم الطلب",
    statusProcessing: "قيد المعالجة",
    statusPaid: "مدفوع",
    statusRejected: "مرفوض",
    requestProcessingMsg: "تم نقل طلب التحويل إلى قيد المعالجة.",
    requestRejectedMsg: "تم رفض طلب التحويل.",
    requestPaidMsg: "تم تعليم طلب التحويل كمدفوع وتحرير سجلات الدفعات.",
    requestPendingApprovalMsg: "سُجّل التحويل للاعتماد: يعتمده مسؤول ثانٍ من شاشة الاعتمادات، وعندها يُصرف.",
    requestActionError: "فشل تحديث طلب التحويل.",
    noLedgerCoverage: "لم يتم العثور على سجلات دفعات معلقة لهذا المزود.",
    noLedgerRows: "لا توجد سجلات مالية مقبوضة بعد.",
    
    // Tabs
    tabMethods: "طرق الدفع",
    tabSplits: "تقسيم المعاملات",
    tabPayoutRequests: "طلبات سحب الأرباح",
    tabStatements: "القوائم المحاسبية والضريبة",
    tabReconciliation: "المطابقة وفواتير الرسوم",
    tabsLabel: "أقسام السجل المالي",
    reconTitle: "مطابقة Tap",
    reconSubtitle: "الأيام التي طوبقت مع Tap كما هي مسجلة في شاشة مطابقة Tap، حيث تُشغَّل المطابقة وتُعالج الفروقات.",
    openReconciliation: "فتح مطابقة Tap",
    reconDay: "يوم العمل",
    reconStatus: "الحالة",
    reconOpenBreaks: "فروقات مفتوحة",
    reconTapCharges: "عمليات Tap",
    reconRanAt: "آخر تشغيل",
    noReconRuns: "لم يُطابَق أي يوم مع Tap بعد.",
    reconStatuses: { matched: "مطابقة", breaks: "توجد فروقات", no_tap_data: "لم تتم المطابقة: لا توجد بيانات Tap" } as Record<string, string>,
    feeInvoicesTitle: "فواتير رسوم المنصة الشهرية",
    feeInvoicesSubtitle: "كشوف رسوم المنصة لكل مقدم خدمة بعد خصم العربون المقبوض، مع ضريبة القيمة المضافة على الرسوم.",
    invoiceNo: "رقم الفاتورة", invoiceProvider: "مقدم الخدمة", invoicePeriod: "الفترة", invoiceBookings: "الحجوزات", invoiceGmv: "إجمالي قيمة الحجوزات",
    invoiceCommission: "رسوم المنصة", invoiceDue: "المستحق (شامل الضريبة)", invoiceStatus: "الحالة",
    noAccountOnFile: "لا يوجد حساب صرف مسجل لمقدم الخدمة هذا. لم يُكشف شيء؛ اطلب من مقدم الخدمة إضافة حسابه البنكي.",
    noBankOnRequest: "لا يوجد حساب بنكي في هذا الطلب",
    payoutCount: "{n} طلبات",
    
    // Statements Tab
    vatReportTitle: "تقرير ضريبة القيمة المضافة الشهري",
    reportsFailed: "تعذّر تحميل هذه الكشوف، لذا فالجداول أدناه غير مكتملة: {reason}",
    vatReportSubtitle: "ضريبة القيمة المضافة (١٥٪) المحصلة من الحجوزات المكتملة.",
    settlementTitle: "تسويات مبالغ المزودين",
    settlementSubtitle: "إجمالي الحجم المالي المقبوض، عمولة المنصة، والمبالغ المحولة لكل مزود.",
    earningsTitle: "ملخص مستحقات الموظفين",
    earningsSubtitle: "إجمالي الأرباح وأعداد الحجوزات المنجزة المخصصة للأخصائيين.",
    month: "الشهر",
    totalBookings: "الحجوزات",
    vatCollected: "الضريبة المحصلة",
    salesVolume: "حجم المبيعات",
    expectedPayouts: "المستحقات المتوقعة",
    releasedPayouts: "المبالغ المحولة فعلياً",
    employee: "الموظف / الأخصائي",
    totalEarnings: "إجمالي الأرباح",
    noRecords: "لا توجد سجلات حالياً.",
    listFailed: "تعذّر تحميل هذه القائمة، لذا فإظهار جدول فارغ سيكون مضللاً: {reason}",
    retry: "إعادة المحاولة"
  }
};

type PayMethod = {
  id: string;
  key: string;
  label_en: string;
  label_ar: string;
  gateway_key: string | null;
  enabled: boolean;
  enabled_for_roles: string[];
  is_default: boolean;
  env: string;
  sort_order: number;
  requires_gateway?: boolean;
  gateway_priority?: string[];
  admin_note?: string | null;
};

type PaymentIntegration = {
  id: string;
  key: string;
  name: string;
  category: string;
  status: "connected" | "disconnected";
  enabled: boolean;
  env: "test" | "live";
  supported_payment_method_keys?: string[] | null;
};

const normalizePayMethod = (method: PayMethod): PayMethod => ({
  ...method,
  requires_gateway: method.requires_gateway ?? !(method.gateway_key === "internal" || method.gateway_key === null),
  gateway_priority: method.gateway_priority ?? []
});

const supportsMethod = (integration: PaymentIntegration, methodKey: string) =>
  (integration.supported_payment_method_keys ?? []).includes(methodKey);

function PaymentMethodsRegistry({ lang, cardBase }: { lang: "en" | "ar"; cardBase: string }) {
  const isRTL = lang === "ar";
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [paymentIntegrations, setPaymentIntegrations] = useState<PaymentIntegration[]>([]);
  const [note, setNote] = useState("");
  const [methodError, setMethodError] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Every change is confirmed in a dialog that names the method, captures the reason and keeps it when the server refuses.
  const [methodConfirm, setMethodConfirm] = useState<{ kind: "toggle" | "default" | "gateway"; method: PayMethod; gatewayKey?: string } | null>(null);
  // Only a console role with settings.manage gets the controls (the server refuses every other role anyway).
  const canWrite = knownToHold(useConsoleSession(), ["settings.manage"]);
  const L = lang === "ar"
    ? { title: "طرق الدفع (السوق السعودي)", subtitle: "فعّل أو عطّل الطرق وحدد الافتراضية — تنعكس فوراً على صفحة الدفع لدى العميل وشاشة مستحقات المزود.", enabled: "مفعلة", disabled: "معطلة", makeDefault: "افتراضية", isDefault: "★ الافتراضية", roles: "متاحة لـ", customer: "العميل", provider: "المزود", gateway: "البوابة", saved: "تم حفظ إعدادات طرق الدفع.", empty: "لا توجد طرق دفع مسجلة بعد.", what: "طرق الدفع", reason: "سبب التغيير (يُسجَّل في سجل التدقيق)", gatewayTitle: "تغيير بوابة الدفع", gatewayIntro: "تمر مدفوعات هذه الطريقة عبر البوابة المختارة وفي بيئتها.", defaultCleared: "لم تعد هذه الطرق افتراضية: {keys}." }
    : { title: "Payment Methods (KSA)", subtitle: "Enable, disable and set the default — changes reflect instantly at customer checkout and provider payout screens.", enabled: "Enabled", disabled: "Disabled", makeDefault: "Make default", isDefault: "★ Default", roles: "Available to", customer: "Customer", provider: "Provider", gateway: "Gateway", saved: "Payment method settings saved.", empty: "No payment methods are registered yet.", what: "Payment methods", reason: "Reason for this change (recorded in the audit log)", gatewayTitle: "Change the payment gateway", gatewayIntro: "Payments with this method go through the chosen gateway, in its environment.", defaultCleared: "No longer the default: {keys}." };

  const P = lang === "ar"
    ? { activeApi: "API متصل", blocked: "محجوب: اختر API دفع متصل", noGateway: "لا يحتاج API", selectGateway: "اختيار مزود الدفع", activeApis: "APIs المفعلة" }
    : { activeApi: "Connected API", blocked: "Blocked: choose a connected payment API", noGateway: "No API required", selectGateway: "Select gateway provider", activeApis: "Active payment APIs" };

  useEffect(() => {
    (async () => {
      try {
        setLoadError(null);
        const [{ data: methodRows, error: methodLoadError }, { data: integrationRows, error: integrationLoadError }] = await Promise.all([
          supabase.from("payment_methods").select("*").order("sort_order"),
          supabase.from("integrations").select("id, key, name, category, status, enabled, env, supported_payment_method_keys").eq("category", "payments").order("name")
        ]);
        if (methodLoadError) throw methodLoadError;
        if (integrationLoadError) throw integrationLoadError;
        setMethods(((methodRows ?? []) as PayMethod[]).map(normalizePayMethod));
        setPaymentIntegrations((integrationRows ?? []) as PaymentIntegration[]);
        setMethodError("");
      } catch (err) {
        setMethods([]);
        setPaymentIntegrations([]);
        setLoadError(err);
      }
    })();
  }, [lang, reloadKey]);

  // One timer for the confirmation: a newer message is not cleared by the timer of the one before it.
  const noteTimer = React.useRef<number | undefined>(undefined);
  const flash = (msg: string) => {
    setMethodError("");
    setNote(msg);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(""), 6000);
  };
  const replaceMethod = (answer: PayMethod) => setMethods((prev) => prev.map((x) => (x.id === answer.id ? normalizePayMethod(answer) : x)));

  const toggleEnabled = (m: PayMethod) => { setNote(""); setMethodConfirm({ kind: "toggle", method: m }); };

  // admin_set_payment_method: settings.manage, a fresh code and a reason; the card changes only after the stored answer.
  const applyToggle = async (m: PayMethod, reason: string): Promise<string | null> => {
    const outcome = commandOutcome(await supabase.rpc("admin_set_payment_method", { p_method_id: m.id, p_changes: { enabled: !m.enabled }, p_reason: reason }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    replaceMethod(outcome.data.method as PayMethod);
    flash(outcome.changed ? L.saved : unchangedText(lang));
    return null;
  };

  const makeDefault = (m: PayMethod) => {
    if (m.requires_gateway && !isOperational(m)) {
      setMethodError(P.blocked);
      return;
    }
    setNote("");
    setMethodConfirm({ kind: "default", method: m });
  };

  // admin_set_default_payment_method: one step on the server, one default per audience (customer, provider).
  const applyDefault = async (m: PayMethod, reason: string): Promise<string | null> => {
    const outcome = commandOutcome(await supabase.rpc("admin_set_default_payment_method", { p_method_id: m.id, p_reason: reason }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    const stored = normalizePayMethod(outcome.data.method as PayMethod);
    const cleared: string[] = Array.isArray(outcome.data.cleared) ? outcome.data.cleared : [];
    setMethods((prev) => prev.map((x) => (x.id === stored.id ? stored : cleared.includes(x.key) ? { ...x, is_default: false } : x)));
    flash(!outcome.changed ? unchangedText(lang) : cleared.length > 0 ? `${L.saved} ${L.defaultCleared.replace("{keys}", cleared.join(isRTL ? "، " : ", "))}` : L.saved);
    return null;
  };

  const activeGatewaysFor = (m: PayMethod) =>
    paymentIntegrations.filter((integration) =>
      integration.category === "payments" &&
      integration.enabled &&
      integration.status === "connected" &&
      supportsMethod(integration, m.key)
    );

  const selectedGatewayFor = (m: PayMethod) =>
    paymentIntegrations.find((integration) => integration.key === m.gateway_key && supportsMethod(integration, m.key));

  const isOperational = (m: PayMethod) =>
    !m.requires_gateway || m.gateway_key === "internal" || activeGatewaysFor(m).some((integration) => integration.key === m.gateway_key && integration.env === m.env);

  const changeGateway = (m: PayMethod, gatewayKey: string) => {
    if (!gatewayKey || gatewayKey === m.gateway_key) return;
    setNote("");
    setMethodConfirm({ kind: "gateway", method: m, gatewayKey });
  };

  const applyGateway = async (m: PayMethod, gatewayKey: string, reason: string): Promise<string | null> => {
    const outcome = commandOutcome(await supabase.rpc("admin_set_payment_method", { p_method_id: m.id, p_changes: { gateway_key: gatewayKey }, p_reason: reason }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    replaceMethod(outcome.data.method as PayMethod);
    flash(outcome.changed ? L.saved : unchangedText(lang));
    return null;
  };

  const renderMethodConfirm = () => {
    if (!methodConfirm) return null;
    const { kind, method, gatewayKey } = methodConfirm;
    const name = lang === "ar" ? method.label_ar : method.label_en;
    const disabling = kind === "toggle" && method.enabled;
    const ar = lang === "ar";
    const gateway = gatewayKey ? paymentIntegrations.find((integration) => integration.key === gatewayKey) : undefined;
    const facts = [
      { label: ar ? "طريقة الدفع" : "Payment method", value: name },
      { label: ar ? "البوابة" : "Gateway", value: `${method.gateway_key ?? "—"} · ${method.env}` },
    ];
    if (kind === "gateway" && gateway) facts.push({ label: ar ? "البوابة الجديدة" : "New gateway", value: `${gateway.name} · ${gateway.env}` });
    return (
      <CommandDialog
        locale={lang}
        tone={disabling ? "danger" : "default"}
        title={kind === "default" ? (ar ? "تعيين طريقة الدفع الافتراضية" : "Set the default payment method") : kind === "gateway" ? L.gatewayTitle : disabling ? (ar ? "إيقاف طريقة الدفع" : "Disable this payment method") : (ar ? "تفعيل طريقة الدفع" : "Enable this payment method")}
        intro={kind === "default"
          ? (ar ? "تصبح هذه الطريقة الخيار الأول عند الدفع لجمهورها (العملاء أو المزودين) وتُفعَّل إن كانت معطلة." : "This becomes the first choice for its audience (customers or providers), and is enabled if it was off.")
          : kind === "gateway"
            ? L.gatewayIntro
            : disabling
              ? (ar ? "لن تظهر هذه الطريقة للعملاء عند الدفع." : "Customers will no longer see this method at checkout.")
              : (ar ? "ستظهر هذه الطريقة للعملاء عند الدفع." : "Customers will see this method at checkout.")}
        facts={facts}
        reasonLabel={L.reason}
        confirmLabel={kind === "default" ? (ar ? "تعيين كافتراضية" : "Make default") : kind === "gateway" ? (ar ? "تغيير البوابة" : "Change gateway") : disabling ? (ar ? "إيقاف" : "Disable") : (ar ? "تفعيل" : "Enable")}
        onConfirm={(reason) => (kind === "default" ? applyDefault(method, reason) : kind === "gateway" && gatewayKey ? applyGateway(method, gatewayKey, reason) : applyToggle(method, reason))}
        onClose={() => setMethodConfirm(null)}
      />
    );
  };

  return (
    <div className={cardBase}>
      {renderMethodConfirm()}
      <div className="mb-4">
        <h3 className="text-sm font-serif font-black text-gray-900">{L.title}</h3>
        <p className="text-[11px] text-gray-600 font-semibold mt-0.5">{L.subtitle}</p>
      </div>
      {note && <div role="status" className="mb-3 rounded-xl bg-[#ECFDF3] border border-[#D1FADF] px-3 py-2 text-[11px] font-bold text-[#027A48]">{note}</div>}
      {methodError && <div role="alert" className="mb-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-[11px] font-bold text-[#B42318]">{methodError}</div>}
      {loadError ? (
        <ReadFailure error={loadError} locale={lang} what={L.what} onRetry={() => setReloadKey((n) => n + 1)} />
      ) : (
      <>
      <div className={`mb-3 flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{P.activeApis}</span>
        {paymentIntegrations.filter((api) => api.enabled && api.status === "connected").length === 0 ? (
          <span className="rounded-full border border-[#FECDCA] bg-[#FEF3F2] px-2.5 py-1 text-[10px] font-black uppercase text-[#B42318]">{P.blocked}</span>
        ) : (
          paymentIntegrations.filter((api) => api.enabled && api.status === "connected").map((api) => (
            <span key={api.key} className="rounded-full border border-[#D1FADF] bg-[#ECFDF3] px-2.5 py-1 text-[10px] font-black uppercase text-[#027A48]">
              {api.name} · {api.env}
            </span>
          ))
        )}
      </div>
      {methods.length === 0 ? (
        <p className="py-6 text-center text-xs font-semibold text-gray-600">{L.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {methods.map((m) => {
            const candidates = activeGatewaysFor(m);
            const selectedGateway = selectedGatewayFor(m);
            const operational = isOperational(m);
            const name = lang === "ar" ? m.label_ar : m.label_en;
            return (
            <div key={m.id} className={`rounded-xl border p-3.5 transition ${m.enabled && operational ? "border-[#D1AF47]/25 bg-[#FFFDF7]" : "border-[#ECECEC] bg-gray-50/60"}`}>
              <div className={`flex items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : "text-left"}>
                  <strong className="block text-xs font-black text-gray-900">{name}</strong>
                  <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-gray-600">{L.gateway}: {m.gateway_key ?? "—"} · {m.env}</span>
                </div>
                {canWrite ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.enabled}
                    onClick={() => toggleEnabled(m)}
                    aria-label={`${L.enabled}: ${name}`}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] ${m.enabled ? "bg-[#D1AF47]" : "bg-gray-400"}`}
                  >
                    <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: m.enabled ? "translateX(18px)" : "translateX(2px)" }} />
                  </button>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-700">{m.enabled ? L.enabled : L.disabled}</span>
                )}
              </div>
              <div className={`mt-2 rounded-xl border px-2.5 py-2 text-[10px] font-black uppercase tracking-wider ${
                operational ? "border-[#D1FADF] bg-[#ECFDF3] text-[#027A48]" : "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
              }`}>
                {operational ? `${P.activeApi}: ${m.requires_gateway ? selectedGateway?.name || m.gateway_key : P.noGateway}` : P.blocked}
              </div>
              {m.requires_gateway && canWrite && (
                <label className="mt-2 block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{P.selectGateway}</span>
                  <select
                    value={operational ? (m.gateway_key || "") : ""}
                    onChange={(event) => changeGateway(m, event.target.value)}
                    className="w-full rounded-xl border border-[#ECECEC] bg-white px-2.5 py-2 text-[11px] font-black text-gray-700 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]"
                  >
                    <option value="" disabled>{candidates.length ? P.selectGateway : P.blocked}</option>
                    {candidates.map((gateway) => (
                      <option key={gateway.key} value={gateway.key}>{gateway.name} - {gateway.env}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className={`mt-2.5 flex flex-wrap items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                {(m.enabled_for_roles ?? []).map((r) => (
                  <span key={r} className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-black uppercase text-[#1D4ED8]">{r === "customer" ? L.customer : r === "provider" ? L.provider : r}</span>
                ))}
                {m.is_default ? (
                  <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[10px] font-black uppercase text-[#7A5B12]">{L.isDefault}</span>
                ) : canWrite ? (
                  <button type="button" onClick={() => makeDefault(m)} aria-label={`${L.makeDefault}: ${name}`} className="rounded-full border border-[#ECECEC] bg-white px-2 py-0.5 text-[10px] font-black uppercase text-gray-600 transition hover:border-[#D1AF47]/40 hover:text-[#7A5B12] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{L.makeDefault}</button>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// Copy for the commands that settle provider money. Each opens a dialog that names the target, states what happens,
// captures the operator's reason (recorded in the audit log) and keeps it if the server refuses.
const commandCopy = {
  en: {
    reasonLabel: "Reason (recorded in the audit log)",
    reconciliationHold: "Held until Tap reconciliation clears: {n} open differences, {amount}",
    payReasonLabel: "Bank transfer reference or note (recorded in the audit log)",
    releaseTitle: "Release this ledger entry",
    releaseIntro: "Record that the provider's share of this entry was paid outside the payout flow. A different administrator must approve it, the provider needs an approved bank account past its 48-hour hold, and the bank transfer reference is kept with the entry.",
    releaseReferenceLabel: "Bank transfer reference",
    releaseReferenceError: "Enter the bank transfer reference (4 to 64 letters, digits or dashes).",
    releasePendingMsg: "Sent for approval: a different administrator must approve this settlement.",
    releaseConfirm: "Release share",
    processingTitle: "Move this payout request to processing",
    processingIntro: "The request is accepted for processing. No money moves at this step.",
    processingConfirm: "Move to processing",
    rejectTitle: "Reject this payout request",
    rejectIntro: "The request is closed as rejected; the provider has to make a new request.",
    rejectConfirm: "Reject request",
    payTitle: "Mark this payout as paid",
    payIntro: "Every payout needs a second administrator: this records your release for approval, and the approval allocates the provider's pending ledger shares and marks it paid. Payouts to a bank account approved in the last 48 hours wait for the hold to end.",
    payConfirm: "Mark as paid",
    factEntry: "Ledger entry",
    factCaptured: "Captured",
    factPlatform: "Platform share",
    factProvider: "Provider share",
    factDate: "Date",
    factRequest: "Payout request",
    factPayee: "Provider",
    factAmount: "Amount",
    factBank: "Bank",
    factStatus: "Status",
    releaseFor: "Release ledger entry {id}",
    processingFor: "Move payout request {id} to processing",
    payFor: "Mark payout request {id} as paid",
    rejectFor: "Reject payout request {id}",
    revealFor: "Reveal the IBAN of {name}",
    reveal: "Reveal IBAN",
    revealTitle: "Reveal the full IBAN",
    revealIntro: "Finance and owners only. The IBAN is shown once for 60 seconds and is never stored in the console or the audit log; the reveal and your reason are audited. Needs a fresh authenticator code.",
    revealReason: "Reason with a ticket (PAY-1042, #5521) or this provider's payout request id (at least 15 characters)",
    revealedTitle: "IBAN of {name}",
    revealedNotApproved: "NOT APPROVED – do not pay. Shown masked until a second administrator approves it.",
    revealLimit: "You have reached the most IBAN reveals allowed in 24 hours ({n}). Another owner can allow more from Approvals.",
    revealedActive: "Approved account",
    revealedPending: "Account waiting for approval",
    revealedHolder: "Account holder",
    revealedBank: "Bank",
    revealedExpires: "Hidden in {n} s",
    hideNow: "Hide now",
    notProvided: "Not provided",
  },
  ar: {
    reasonLabel: "السبب (يُسجل في سجل التدقيق)",
    reconciliationHold: "موقوف حتى تكتمل التسوية مع Tap: {n} من فروق التسوية المفتوحة بقيمة {amount}",
    payReasonLabel: "مرجع التحويل البنكي أو ملاحظة (تُسجل في سجل التدقيق)",
    releaseTitle: "صرف هذا القيد",
    releaseIntro: "تسجيل أن حصة مقدم الخدمة من هذا القيد صُرفت خارج مسار التحويلات. يجب أن يعتمدها مسؤول آخر، وأن يكون لمقدم الخدمة حساب بنكي معتمد تجاوز فترة الانتظار (٤٨ ساعة)، ويُحفظ مرجع التحويل البنكي مع القيد.",
    releaseReferenceLabel: "مرجع التحويل البنكي",
    releaseReferenceError: "أدخل مرجع التحويل البنكي (من ٤ إلى ٦٤ حرفاً أو رقماً أو شرطة).",
    releasePendingMsg: "أُرسل للاعتماد: يجب أن يعتمد مسؤول آخر هذه التسوية.",
    releaseConfirm: "صرف الحصة",
    processingTitle: "نقل طلب الصرف إلى المعالجة",
    processingIntro: "يُقبل الطلب للمعالجة. لا تنتقل أي أموال في هذه الخطوة.",
    processingConfirm: "نقل إلى المعالجة",
    rejectTitle: "رفض طلب الصرف",
    rejectIntro: "يُغلق الطلب كمرفوض، وعلى مقدم الخدمة تقديم طلب جديد.",
    rejectConfirm: "رفض الطلب",
    payTitle: "تسجيل هذا الطلب كمدفوع",
    payIntro: "كل تحويل يحتاج مسؤولاً ثانياً: يُسجَّل صرفك للاعتماد، وعند الاعتماد تُخصَّص حصص مقدم الخدمة المعلّقة ويُسجَّل الطلب مدفوعاً. التحويل إلى حساب بنكي اعتُمد خلال آخر ٤٨ ساعة ينتظر انتهاء فترة التعليق.",
    payConfirm: "تسجيل كمدفوع",
    factEntry: "قيد الدفتر",
    factCaptured: "المبلغ المحصّل",
    factPlatform: "حصة المنصة",
    factProvider: "حصة مقدم الخدمة",
    factDate: "التاريخ",
    factRequest: "طلب الصرف",
    factPayee: "مقدم الخدمة",
    factAmount: "المبلغ",
    factBank: "البنك",
    factStatus: "الحالة",
    releaseFor: "صرف قيد الدفتر {id}",
    processingFor: "نقل طلب الصرف {id} إلى المعالجة",
    payFor: "تسجيل طلب الصرف {id} كمدفوع",
    rejectFor: "رفض طلب الصرف {id}",
    revealFor: "كشف آيبان {name}",
    reveal: "كشف الآيبان",
    revealTitle: "كشف الآيبان كاملاً",
    revealIntro: "للمالية والمالك فقط. يظهر الآيبان مرة واحدة لمدة ٦٠ ثانية ولا يُحفظ في اللوحة ولا في سجل التدقيق؛ ويُسجَّل الكشف وسببه. يحتاج رمزاً جديداً من تطبيق المصادقة.",
    revealReason: "السبب مع رقم تذكرة (PAY-1042 أو ‎#5521) أو معرّف طلب صرف لهذا المزود (١٥ حرفاً على الأقل)",
    revealedTitle: "آيبان {name}",
    revealedNotApproved: "غير معتمد – لا تحوّل إليه. يظهر مخفياً جزئياً حتى يعتمده مسؤول ثانٍ.",
    revealLimit: "بلغت الحد الأعلى لكشف الآيبان خلال ٢٤ ساعة ({n}). يمكن لمالك آخر السماح بالمزيد من صفحة الاعتمادات.",
    revealedActive: "الحساب المعتمد",
    revealedPending: "حساب بانتظار الاعتماد",
    revealedHolder: "اسم صاحب الحساب",
    revealedBank: "البنك",
    revealedExpires: "يختفي خلال {n} ث",
    hideNow: "إخفاء الآن",
    notProvided: "غير متوفر",
  },
};
// GOV-FIX L-3: an account waiting for approval comes back masked only (iban_masked, approved false); nobody may pay it.
type RevealedAccount = { iban?: string; iban_masked?: string; approved?: boolean; bank_name: string; account_holder_name: string | null };
type Revealed = { name: string; expiresAt: number; active: RevealedAccount | null; pending: RevealedAccount | null };
type MoneyAction =
  | { kind: "reveal"; request: any; providerName: string }
  | { kind: "release"; item: any }
  | { kind: "review"; request: any; decision: "processing" | "rejected" }
  | { kind: "pay"; request: any };

const LEDGER_TABS = ["methods", "splits", "requests", "statements", "reconciliation"] as const;
type LedgerTab = (typeof LEDGER_TABS)[number];

export default function AdminLedger() {
  const [activeTab, setActiveTab] = useState<LedgerTab>("methods");
  const [ledger, setLedger] = useState<any[]>([]);
  // GOV-2 (Q4): the ledger, payouts, statements and fee invoices come from audited, paged server functions; totals are the
  // server's figures for every matching row, not a sum of the page shown.
  const [ledgerTotals, setLedgerTotals] = useState<{ total: number; total_captured: number; platform_share: number; provider_share: number } | null>(null);
  const [listTotals, setListTotals] = useState<{ payouts: number; feeInvoices: number }>({ payouts: 0, feeInvoices: 0 });
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  // A failed query is an error with a retry; only a successful query with zero rows is an empty table.
  const [requestsError, setRequestsError] = useState("");
  const [reconError, setReconError] = useState("");
  const [feeInvoicesError, setFeeInvoicesError] = useState("");
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [money, setMoney] = useState<MoneyAction | null>(null);
  // Q3: a revealed IBAN lives only in this state, for at most 60 seconds, and is never written anywhere else.
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [revealClock, setRevealClock] = useState(0);
  useEffect(() => {
    if (!revealed) return;
    const tick = window.setInterval(() => {
      if (Date.now() >= revealed.expiresAt) setRevealed(null);
      else setRevealClock(Date.now());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [revealed]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");
  // The money commands are offered only to the roles that hold them; the server refuses everyone else regardless.
  const session = useConsoleSession();
  const canReveal = knownToHold(session, ["iban.reveal"]);
  const canDecidePayouts = knownToHold(session, ["money.payout"]);

  // Accountant Report States
  const [vatSummary, setVatSummary] = useState<any[]>([]);
  const [settlementSummary, setSettlementSummary] = useState<any[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  // A failed statement query must read as a failure, not as a month with no VAT or settlements.
  const [reportsError, setReportsError] = useState("");

  // Tap reconciliation runs (the same source as /admin/reconciliation) and the monthly fee invoices
  const [reconciliationRuns, setReconciliationRuns] = useState<{ business_day: string; status: string; counts: Record<string, number>; ran_at: string; run_count: number }[]>([]);
  const [reconLoading, setReconLoading] = useState(false);
  const [providerFeeInvoices, setProviderFeeInvoices] = useState<any[]>([]);
  const [feeInvoicesLoading, setFeeInvoicesLoading] = useState(false);

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = {
    ...translations[lang],
    totalGrossTitle: lang === "ar" ? "إجمالي الحجم المالي" : "Total Gross Volume",
    totalPlatformTitle: lang === "ar" ? "عمولات المنصة المحصلة" : "Total Platform Revenue",
    totalProviderTitle: lang === "ar" ? "مستحقات المزودين" : "Total Providers Share"
  };

  const formatMoney = (value: unknown) =>
    Number(value || 0).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

  const sarAmount = (value: unknown) => sar(Number(value ?? 0), lang);
  const count = (value: unknown) => Number(value ?? 0).toLocaleString(lang === "ar" ? "ar-SA" : "en-US");

  const formatDateMonth = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      month: "long",
      year: "numeric"
    });

  const requestStatusLabel = (status: string) => {
    if (status === "processing") return t.statusProcessing;
    if (status === "paid") return t.statusPaid;
    if (status === "rejected") return t.statusRejected;
    return t.statusRequested;
  };

  const requestStatusClass = (status: string) => {
    if (status === "paid") return "bg-[#ECFDF3] text-[#16A34A]";
    if (status === "rejected") return "bg-[#FEF3F2] text-[#D92D20]";
    if (status === "processing") return "bg-[#EEF4FF] text-[#3538CD]";
    return "bg-[#FFFAEB] text-[#F59E0B]";
  };

  const loadLedger = async () => {
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase.rpc("admin_list_ledger_entries", {
        p_from: null, p_to: null, p_provider_id: null, p_payout_status: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "finance_operations"
      });

      if (dbError) throw dbError;
      const page = data as { total: number; total_captured: number; platform_share: number; provider_share: number; rows: any[] };
      setLedger(page.rows ?? []);
      setLedgerTotals({ total: Number(page.total), total_captured: Number(page.total_captured), platform_share: Number(page.platform_share), provider_share: Number(page.provider_share) });
    } catch (err) {
      setLedger([]);
      setLedgerTotals(null);
      setError(`${t.errorLoad} ${errorMessage(err)}`.trim());
    } finally {
      setLoading(false);
    }
  };

  const loadPayoutRequests = async () => {
    try {
      setRequestsLoading(true);
      setRequestsError("");
      const { data, error: dbError } = await supabase.rpc("admin_list_payout_requests", {
        p_status: null, p_provider_id: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "payout_review"
      });

      if (dbError) throw dbError;
      const page = data as { total: number; rows: any[] };
      setPayoutRequests(page.rows ?? []);
      setListTotals((current) => ({ ...current, payouts: Number(page.total) }));
    } catch (err) {
      setPayoutRequests([]);
      setRequestsError(errorMessage(err));
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setReportsLoading(true);
      setReportsError("");

      const [vatResult, settlementResult, earningsResult] = await Promise.all([
        supabase.rpc("admin_finance_summary", { p_kind: "vat", p_from: null, p_to: null, p_provider_id: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "tax_reporting" }),
        supabase.rpc("admin_finance_summary", { p_kind: "settlement", p_from: null, p_to: null, p_provider_id: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "finance_operations" }),
        supabase.rpc("admin_finance_summary", { p_kind: "employee_earnings", p_from: null, p_to: null, p_provider_id: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "finance_operations" })
      ]);

      if (vatResult.error) {
        console.error("Failed to load monthly_vat_summary:", vatResult.error);
        setVatSummary([]);
      } else {
        setVatSummary((vatResult.data as { rows: any[] } | null)?.rows ?? []);
      }

      if (settlementResult.error) {
        console.error("Failed to load provider_settlement_summary:", settlementResult.error);
        setSettlementSummary([]);
      } else {
        setSettlementSummary((settlementResult.data as { rows: any[] } | null)?.rows ?? []);
      }

      if (earningsResult.error) {
        console.error("Failed to load employee_earnings_summary:", earningsResult.error);
        setEarningsSummary([]);
      } else {
        setEarningsSummary((earningsResult.data as { rows: any[] } | null)?.rows ?? []);
      }
      const failures = [vatResult.error, settlementResult.error, earningsResult.error].filter(Boolean).map((e) => errorMessage(e));
      if (failures.length > 0) setReportsError(failures.join(" · "));
    } catch (err) {
      setReportsError(errorMessage(err));
    } finally {
      setReportsLoading(false);
    }
  };

  const loadReconciliationRuns = async () => {
    try {
      setReconLoading(true);
      setReconError("");
      // One source for reconciliation: the Tap runs admin_reconciliation_overview answers to /admin/reconciliation too.
      const { data, error: dbError } = await supabase.rpc("admin_reconciliation_overview", { p_status: "open", p_limit: 25, p_offset: 0 });
      if (dbError) throw dbError;
      setReconciliationRuns(((data as { runs?: unknown[] } | null)?.runs ?? []) as typeof reconciliationRuns);
    } catch (err) {
      setReconError(errorMessage(err));
      setReconciliationRuns([]);
    } finally {
      setReconLoading(false);
    }
  };

  const loadFeeInvoices = async () => {
    try {
      setFeeInvoicesLoading(true);
      setFeeInvoicesError("");
      const { data, error: dbError } = await supabase.rpc("admin_list_fee_invoices", {
        p_status: null, p_provider_id: null, p_limit: LIST_LIMIT, p_offset: 0, p_purpose: "finance_operations"
      });
      if (dbError) throw dbError;
      const page = data as { total: number; rows: any[] };
      setProviderFeeInvoices(page.rows ?? []);
      setListTotals((current) => ({ ...current, feeInvoices: Number(page.total) }));
    } catch (err) {
      setFeeInvoicesError(errorMessage(err));
      setProviderFeeInvoices([]);
    } finally {
      setFeeInvoicesLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
    loadPayoutRequests();
    loadReports();
    loadReconciliationRuns();
    loadFeeInvoices();
  }, [lang]);

  // Every money command opens a dialog first (see renderMoneyDialog); these run the command once the operator has
  // confirmed and given a reason. A refusal is returned to the dialog, which stays open with what was typed.
  const handleReleasePayout = (item: any) => setMoney({ kind: "release", item });
  const updatePayoutRequestStatus = (request: any, decision: "processing" | "rejected") => setMoney({ kind: "review", request, decision });
  const markPayoutRequestPaid = (request: any) => setMoney({ kind: "pay", request });

  const runReleaseItem = async (item: any, reason: string, bankReference: string): Promise<string | null> => {
    // Stable per entry, so a retry after a lost response cannot release twice.
    const idempotencyKey = `ledger_release_${item.id}`;
    const { data: released, error: rpcError } = await supabase.rpc("admin_release_ledger_item", {
      p_ledger_id: item.id,
      p_reason: reason,
      p_bank_reference: bankReference.trim(),
      p_idempotency_key: idempotencyKey,
    });
    if (rpcError) return errorMessage(rpcError) || t.errorMsg;
    setError("");
    // GOV-1 review H-4: one administrator alone only records the request; a second one approves it in /admin/approvals.
    setSuccess((released as { status?: string } | null)?.status === "pending_approval" ? commandCopy[lang].releasePendingMsg : t.successMsg);
    void loadLedger();
    return null;
  };

  const runReviewRequest = async (request: any, decision: "processing" | "rejected", reason: string): Promise<string | null> => {
    const { error: rpcError } = await supabase.rpc("admin_review_payout_request", {
      p_payout_request_id: request.id,
      p_decision: decision,
      p_reason: reason,
    });
    if (rpcError) return errorMessage(rpcError) || t.requestActionError;
    setError("");
    setSuccess(decision === "rejected" ? t.requestRejectedMsg : t.requestProcessingMsg);
    await loadPayoutRequests();
    return null;
  };

  const runPayRequest = async (request: any, reason: string): Promise<string | null> => {
    // Stable per request, so a retry after a lost response cannot pay twice.
    const idempotencyKey = `payout_release_${request.id}`;
    const { data: released, error: rpcError } = await supabase.rpc("admin_release_payout", {
      p_payout_request_id: request.id,
      p_idempotency_key: idempotencyKey,
      p_reason: reason,
    });
    if (rpcError) return errorMessage(rpcError) || t.requestActionError;
    setError("");
    // D-Q5: the release waits for a second administrator unless this call executed an approved request.
    setSuccess((released as { status?: string } | null)?.status === "pending_approval" ? t.requestPendingApprovalMsg : t.requestPaidMsg);
    await Promise.all([loadLedger(), loadPayoutRequests()]);
    return null;
  };

  const runReveal = async (request: any, providerName: string, reason: string): Promise<string | null> => {
    const { data, error: rpcError } = await supabase.rpc("reveal_provider_iban", { p_provider_id: request.provider_id, p_reason: reason });
    if (rpcError) return errorMessage(rpcError);
    const shown = data as { expires_at: string; active: RevealedAccount | null; pending: RevealedAccount | null; refused?: boolean; ceiling?: number };
    // GOV-FIX L-2: past the 24-hour ceiling nothing is revealed (the server records the refusal and raises an alert).
    if (shown.refused) return commandCopy[lang].revealLimit.replace("{n}", count(shown.ceiling ?? 0));
    setRevealed({ name: providerName, expiresAt: Math.min(new Date(shown.expires_at).getTime(), Date.now() + 60000), active: shown.active, pending: shown.pending });
    setRevealClock(Date.now());
    return null;
  };

  const renderRevealed = () => {
    if (!revealed) return null;
    const c = commandCopy[lang];
    const seconds = secondsLeft(revealed.expiresAt, revealClock || Date.now());
    const outcome = revealOutcome(revealed);
    const account = (label: string, value: RevealedAccount | null) => value && (
      <div className="rounded-xl border border-[#ECECEC] bg-[#F9F7F1] p-3">
        <p className="text-[11px] font-black text-[#667085]">{label}</p>
        {value.iban ? (
          <p dir="ltr" className="mt-1 select-all break-all font-mono text-base font-black text-[#101828]">{value.iban.replace(/(.{4})/g, "$1 ").trim()}</p>
        ) : (
          <>
            <p dir="ltr" className="mt-1 break-all font-mono text-base font-black text-[#667085]">{value.iban_masked}</p>
            <p role="note" className="mt-1 text-xs font-black text-[#B42318]">{c.revealedNotApproved}</p>
          </>
        )}
        <p className="mt-1 text-xs text-[#475467]">{c.revealedBank}: {value.bank_name} · {c.revealedHolder}: {value.account_holder_name || c.notProvided}</p>
      </div>
    );
    // Portalled to <body>: inside the console's scrolling panel (its own stacking context) the payout table was painted over
    // it and took the pointer, so "Hide now" could not be pressed (e2e iban-reveal.spec.ts).
    return (
      <ModalPortal>
      <div role="dialog" aria-modal="false" aria-label={c.revealedTitle.replace("{name}", revealed.name)} dir={lang === "ar" ? "rtl" : "ltr"}
        className="fixed inset-x-4 bottom-4 z-[9500] mx-auto max-w-lg rounded-[24px] border border-[#D1AF47]/50 bg-white p-5 text-start shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="font-serif text-lg font-black text-[#101828]">{c.revealedTitle.replace("{name}", revealed.name)}</p>
          <span role="timer" aria-live="off" className="shrink-0 rounded-full bg-[#FFFAEB] px-2.5 py-1 text-[11px] font-black text-[#B54708]">{c.revealedExpires.replace("{n}", count(seconds))}</span>
        </div>
        <div className="mt-3 space-y-2">
          {outcome === "none" ? <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950">{t.noAccountOnFile}</p> : null}
          {account(c.revealedActive, revealed.active)}
          {account(c.revealedPending, revealed.pending)}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => setRevealed(null)} className="rounded-xl border border-[#D0D5DD] px-4 py-2 text-sm font-bold text-[#344054] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{c.hideNow}</button>
        </div>
      </div>
      </ModalPortal>
    );
  };

  const renderMoneyDialog = () => {
    if (!money) return null;
    const c = commandCopy[lang];
    const close = () => setMoney(null);
    if (money.kind === "reveal") {
      const { request, providerName } = money;
      return (
        <CommandDialog
          locale={lang}
          title={c.revealTitle}
          intro={c.revealIntro}
          facts={[
            { label: c.factPayee, value: providerName },
            { label: c.factBank, value: `${request.bank_name} · ${request.iban_masked ?? ""}` },
            { label: c.factRequest, value: String(request.id).slice(0, 8).toUpperCase() },
          ]}
          reasonLabel={c.revealReason}
          minReasonLength={15}
          confirmLabel={c.reveal}
          onConfirm={(reason) => runReveal(request, providerName, reason)}
          onClose={close}
        />
      );
    }
    const sarText = (value: unknown) => sarAmount(value);
    if (money.kind === "release") {
      const { item } = money;
      return (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={c.releaseTitle}
          intro={c.releaseIntro}
          facts={[
            { label: c.factEntry, value: String(item.id).slice(0, 8).toUpperCase() },
            { label: c.factCaptured, value: sarText(item.total_captured) },
            { label: c.factPlatform, value: sarText(item.platform_share) },
            { label: c.factProvider, value: sarText(item.provider_share) },
            { label: c.factDate, value: formatDate(item.created_at) },
          ]}
          reasonLabel={c.reasonLabel}
          field={{ label: c.releaseReferenceLabel, pattern: /^[A-Za-z0-9][A-Za-z0-9 \-\/]{3,63}$/, error: c.releaseReferenceError, ltr: true }}
          confirmLabel={c.releaseConfirm}
          onConfirm={(reason, reference) => runReleaseItem(item, reason, reference)}
          onClose={close}
        />
      );
    }
    const { request } = money;
    const provider = Array.isArray(request.providers) ? request.providers[0] : request.providers;
    const providerName = (lang === "ar" ? provider?.business_name_ar || provider?.business_name_en : provider?.business_name_en || provider?.business_name_ar) || String(request.provider_id).slice(0, 8);
    const facts = [
      { label: c.factRequest, value: String(request.id).slice(0, 8).toUpperCase() },
      { label: c.factPayee, value: providerName },
      { label: c.factAmount, value: sarText(request.amount) },
      { label: c.factBank, value: `${request.bank_name} · ${request.iban_masked ?? ""}` },
      { label: c.factStatus, value: requestStatusLabel(request.status) },
    ];
    if (money.kind === "pay") {
      return (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={c.payTitle}
          intro={c.payIntro}
          facts={facts}
          reasonLabel={c.payReasonLabel}
          confirmWord={Number(request.amount || 0).toFixed(2)}
          confirmLabel={c.payConfirm}
          onConfirm={(reason) => runPayRequest(request, reason)}
          onClose={close}
        />
      );
    }
    const rejecting = money.decision === "rejected";
    return (
      <CommandDialog
        locale={lang}
        tone={rejecting ? "danger" : "default"}
        title={rejecting ? c.rejectTitle : c.processingTitle}
        intro={rejecting ? c.rejectIntro : c.processingIntro}
        facts={facts}
        reasonLabel={c.reasonLabel}
        confirmLabel={rejecting ? c.rejectConfirm : c.processingConfirm}
        onConfirm={(reason) => runReviewRequest(request, money.decision, reason)}
        onClose={close}
      />
    );
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const tabLabels: Record<LedgerTab, string> = {
    methods: t.tabMethods, splits: t.tabSplits, requests: t.tabPayoutRequests, statements: t.tabStatements, reconciliation: t.tabReconciliation,
  };
  // Arrow keys move between tabs (reversed in Arabic), Home and End jump to the ends; the tab gets focus and opens.
  const onTabKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = isRTL ? { next: "ArrowLeft", prev: "ArrowRight" } : { next: "ArrowRight", prev: "ArrowLeft" };
    const at = LEDGER_TABS.indexOf(activeTab);
    let next = -1;
    if (event.key === keys.next) next = (at + 1) % LEDGER_TABS.length;
    else if (event.key === keys.prev) next = (at - 1 + LEDGER_TABS.length) % LEDGER_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = LEDGER_TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setActiveTab(LEDGER_TABS[next]);
    document.getElementById(`ledger-tab-${LEDGER_TABS[next]}`)?.focus();
  };

  // Calculate split summaries
  const totalGross = ledgerTotals?.total_captured ?? 0;
  const platformTotal = ledgerTotals?.platform_share ?? 0;
  const providerTotal = ledgerTotals?.provider_share ?? 0;
  const showing = (template: string, shown: number, total: number) =>
    template.replace(/\{shown\}/g, shown.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")).replace(/\{total\}/g, total.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"));

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${flip}`}>
        <div>
          <h1 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">{t.title}</h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
        </div>
        
        {/* Sections: an APG tab list that scrolls sideways at phone width, so every tab stays reachable */}
        <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
          <div role="tablist" aria-label={t.tabsLabel} onKeyDown={onTabKey} className="flex w-max items-center gap-1 rounded-full bg-gray-100/80 border border-[#ECECEC] p-1 shadow-sm">
            {LEDGER_TABS.map((key) => (
              <button
                key={key}
                id={`ledger-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`ledger-panel-${key}`}
                tabIndex={activeTab === key ? 0 : -1}
                onClick={() => setActiveTab(key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-black transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] ${activeTab === key ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
              >
                {tabLabels[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <CommandResult
        error={error ? `${t.error}: ${error}` : undefined}
        success={success && !error ? `${t.success}: ${success}` : undefined}
        locale={lang}
        onDismiss={() => {
          setError("");
          setSuccess("");
        }}
      />
      {renderMoneyDialog()}
      {renderRevealed()}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 0. PAYMENT METHODS REGISTRY TAB                          */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "methods" && (
        <div role="tabpanel" id="ledger-panel-methods" aria-labelledby="ledger-tab-methods" className="space-y-6 animate-fadeIn">
          <PaymentMethodsRegistry lang={lang} cardBase={cardBase} />
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 1. TRANSACTION SPLITS TAB                              */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "splits" && (
        <div role="tabpanel" id="ledger-panel-splits" aria-labelledby="ledger-tab-splits" className="space-y-6 animate-fadeIn">
          {/* Split summary widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Gross Captured */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalGrossTitle}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47]" aria-hidden="true">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
                {sarAmount(totalGross)}
              </strong>
            </div>

            {/* Platform Share */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalPlatformTitle}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-amber-700" aria-hidden="true">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">
                {sarAmount(platformTotal)}
              </strong>
            </div>

            {/* Provider Share */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalProviderTitle}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#101828]">
                  <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
                {sarAmount(providerTotal)}
              </strong>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.paymentIntent}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.grossCaptured}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.platformShare}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerShare}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.payoutStatus}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : ledger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.noLedgerRows}</td>
                    </tr>
                  ) : (
                    ledger.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50/40 transition duration-150">
                        <td className="py-4 px-6">
                          <p className="font-bold text-gray-900">{item.payment_intent_id}</p>
                          <p className="text-[9px] text-gray-400 font-semibold mt-1">{t.bookingUuid}: {item.booking_id.substring(0, 8)}...</p>
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-gray-900">
                          {sarAmount(item.total_captured)}
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-amber-700">
                          {sarAmount(item.platform_share)}
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-gray-700">
                          {sarAmount(item.provider_share)}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                            item.payout_status === "released"
                              ? "bg-[#ECFDF3] text-[#16A34A]"
                              : "bg-[#FFFAEB] text-[#F59E0B]"
                          }`}>
                            {item.payout_status === "released" ? t.released : t.payoutStatusPending}
                          </span>
                        </td>
                        <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                          <button
                            type="button"
                            aria-label={commandCopy[lang].releaseFor.replace("{id}", String(item.id).slice(0, 8).toUpperCase())}
                            onClick={() => handleReleasePayout(item)}
                            disabled={item.payout_status === "released"}
                            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-50 disabled:text-gray-400 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition border border-[#ECECEC] disabled:border-[#ECECEC]"
                          >
                            {item.payout_status === "released" ? t.released : t.releasePayout}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {ledgerTotals && ledgerTotals.total > ledger.length && (
                <p className="px-6 py-3 text-[11px] font-semibold text-gray-500">{showing(t.ledgerShowing, ledger.length, ledgerTotals.total)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 2. PAYOUT REQUESTS TAB                                 */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "requests" && (
        <div role="tabpanel" id="ledger-panel-requests" aria-labelledby="ledger-tab-requests" className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)] animate-fadeIn">
          <div className={`flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-gray-50/50 p-5 ${flip}`}>
            <div>
              <h3 className="font-serif text-lg font-black text-gray-900">{t.payoutRequestsTitle}</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.payoutRequestsSubtitle}</p>
            </div>
            <span className="rounded-full border border-[#D1AF47]/25 bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9A7211]">
              {t.payoutCount.replace("{n}", count(listTotals.payouts || payoutRequests.length))}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className={`border-b border-[#ECECEC] text-[#667085] uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestId}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.provider}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestedAt}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.amount}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bank}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestStatus}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                {requestsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                  </tr>
                ) : requestsError ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <p role="alert" className="font-bold text-[#B42318]">{t.listFailed.replace("{reason}", requestsError)}</p>
                      <button type="button" onClick={() => void loadPayoutRequests()} className="mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500">{t.retry}</button>
                    </td>
                  </tr>
                ) : payoutRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.noPayoutRequests}</td>
                  </tr>
                ) : (
                  payoutRequests.map((request) => {
                    const provider = Array.isArray(request.providers) ? request.providers[0] : request.providers;
                    const providerName = isRTL
                      ? provider?.business_name_ar || provider?.business_name_en || request.provider_id
                      : provider?.business_name_en || provider?.business_name_ar || request.provider_id;
                    const isBusy = processingRequestId === request.id;
                    const isClosed = request.status === "paid" || request.status === "rejected";

                    return (
                      <tr key={request.id} className="hover:bg-gray-50/40 transition duration-150">
                        <td className="py-4 px-6 font-mono font-bold text-gray-900">
                          {request.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-bold text-gray-900">{providerName}</p>
                          <p className="mt-1 font-mono text-[9px] text-gray-400">{request.provider_id.slice(0, 8)}...</p>
                        </td>
                        <td className="py-4 px-6 text-gray-500">{formatDate(request.requested_at)}</td>
                        <td className="py-4 px-6 font-serif font-black text-gray-900">
                          {sarAmount(request.amount)}
                        </td>
                        <td className="py-4 px-6">
                          {!canRevealRequest(request) ? <p className="text-[11px] font-semibold text-gray-500">{t.noBankOnRequest}</p> : <>
                          <p className="font-bold text-gray-900">{request.bank_name}</p>
                          <p dir="ltr" className="mt-1 font-mono text-[9px] text-gray-400">{request.iban_masked}</p>
                          {canReveal && <button
                            type="button"
                            aria-label={commandCopy[lang].revealFor.replace("{name}", String(providerName))}
                            onClick={() => setMoney({ kind: "reveal", request, providerName: String(providerName) })}
                            className="mt-1 text-[9px] font-black uppercase tracking-wider text-[#725517] underline focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                          >
                            {commandCopy[lang].reveal}
                          </button>}
                          </>}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${requestStatusClass(request.status)}`}>
                            {requestStatusLabel(request.status)}
                          </span>
                          {request.reconciliation_hold ? (
                            <p className="mt-1 max-w-[220px] text-[10px] font-bold text-[#B54708]">
                              {commandCopy[lang].reconciliationHold.replace("{n}", count(request.reconciliation_hold.open_breaks)).replace("{amount}", sarAmount(request.reconciliation_hold.amount_sar))}
                            </p>
                          ) : null}
                        </td>
                        <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                          <div className={`flex flex-wrap gap-2 ${isRTL ? "justify-start" : "justify-end"}`}>
                            {canDecidePayouts && request.status === "requested" && (
                              <button
                                type="button"
                                aria-label={commandCopy[lang].processingFor.replace("{id}", request.id.slice(0, 8).toUpperCase())}
                                onClick={() => updatePayoutRequestStatus(request, "processing")}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-white text-gray-700 border border-[#ECECEC] hover:bg-gray-50 disabled:opacity-50 text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                              >
                                {t.markProcessing}
                              </button>
                            )}
                            {canDecidePayouts && !isClosed && (
                              <button
                                type="button"
                                aria-label={commandCopy[lang].payFor.replace("{id}", request.id.slice(0, 8).toUpperCase())}
                                onClick={() => markPayoutRequestPaid(request)}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                              >
                                {t.markPaid}
                              </button>
                            )}
                            {canDecidePayouts && !isClosed && (
                              <button
                                type="button"
                                aria-label={commandCopy[lang].rejectFor.replace("{id}", request.id.slice(0, 8).toUpperCase())}
                                onClick={() => updatePayoutRequestStatus(request, "rejected")}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-[#FEF3F2] text-[#D92D20] hover:bg-[#FEE4E2] disabled:opacity-50 text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                              >
                                {t.rejectRequest}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {payoutRequests.length > 0 && listTotals.payouts > payoutRequests.length && (
              <p className="px-6 py-3 text-[11px] font-semibold text-gray-500">{showing(t.listShowing, payoutRequests.length, listTotals.payouts)}</p>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 3. ACCOUNTANT STATEMENTS TAB                            */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "statements" && (
        <div role="tabpanel" id="ledger-panel-statements" aria-labelledby="ledger-tab-statements" className="space-y-6 animate-fadeIn">
          {reportsError && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {t.reportsFailed.replace("{reason}", reportsError)}
            </div>
          )}
          {/* Monthly VAT Summary */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h3 className="font-serif text-lg font-black text-gray-900">{t.vatReportTitle}</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.vatReportSubtitle}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className="py-4 px-6">{t.month}</th>
                    <th className="py-4 px-6">{t.totalBookings}</th>
                    <th className="py-4 px-6">{t.vatCollected}</th>
                    <th className="py-4 px-6">{t.salesVolume}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {reportsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : vatSummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 font-bold">{t.noRecords}</td>
                    </tr>
                  ) : (
                    vatSummary.map((v, i) => (
                      <tr key={`vat-${v.month_start || "month"}-${i}`} className="hover:bg-gray-50/40">
                        <td className="py-4 px-6 font-bold text-gray-900">{formatDateMonth(v.month_start)}</td>
                        <td className="py-4 px-6 font-mono">{v.total_bookings}</td>
                        <td className="py-4 px-6 font-serif font-black text-amber-700">{sarAmount(v.total_vat_collected)}</td>
                        <td className="py-4 px-6 font-serif font-black text-gray-900">{sarAmount(v.total_sales)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Provider Settlement Ledger */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h3 className="font-serif text-lg font-black text-gray-900">{t.settlementTitle}</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.settlementSubtitle}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className="py-4 px-6">{t.month}</th>
                    <th className="py-4 px-6">{t.provider}</th>
                    <th className="py-4 px-6">{t.totalBookings}</th>
                    <th className="py-4 px-6">{t.salesVolume}</th>
                    <th className="py-4 px-6">{t.platformShare}</th>
                    <th className="py-4 px-6">{t.expectedPayouts}</th>
                    <th className="py-4 px-6">{t.releasedPayouts}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {reportsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : settlementSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.noRecords}</td>
                    </tr>
                  ) : (
                    settlementSummary.map((s, i) => {
                      const providerName = isRTL 
                        ? s.providers?.business_name_ar || s.providers?.business_name_en || s.provider_id
                        : s.providers?.business_name_en || s.providers?.business_name_ar || s.provider_id;
                      return (
                        <tr key={`settlement-${s.month_start || "month"}-${s.provider_id || i}`} className="hover:bg-gray-50/40">
                          <td className="py-4 px-6 font-bold text-gray-900">{formatDateMonth(s.month_start)}</td>
                          <td className="py-4 px-6 font-bold text-gray-900">{providerName}</td>
                          <td className="py-4 px-6 font-mono">{s.total_transactions}</td>
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{sarAmount(s.gross_captured_volume)}</td>
                          <td className="py-4 px-6 font-serif font-black text-amber-700">{sarAmount(s.platform_share_collected)}</td>
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{sarAmount(s.provider_share_expected)}</td>
                          <td className="py-4 px-6 font-serif font-black text-[#22C55E]">{sarAmount(s.provider_share_released)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Employee Earnings Summary */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h3 className="font-serif text-lg font-black text-gray-900">{t.earningsTitle}</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.earningsSubtitle}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className="py-4 px-6">{t.month}</th>
                    <th className="py-4 px-6">{t.employee}</th>
                    <th className="py-4 px-6">{t.totalBookings}</th>
                    <th className="py-4 px-6">{t.totalEarnings}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {reportsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : earningsSummary.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 font-bold">{t.noRecords}</td>
                    </tr>
                  ) : (
                    earningsSummary.map((e, i) => {
                      const empName = isRTL 
                        ? e.employees?.name_ar || e.employees?.name_en || e.employee_id
                        : e.employees?.name_en || e.employees?.name_ar || e.employee_id;
                      return (
                        <tr key={`earnings-${e.month_start || "month"}-${e.employee_id || i}`} className="hover:bg-gray-50/40">
                          <td className="py-4 px-6 font-bold text-gray-900">{formatDateMonth(e.month_start)}</td>
                          <td className="py-4 px-6 font-bold text-gray-900">{empName}</td>
                          <td className="py-4 px-6 font-mono">{e.total_completed_bookings}</td>
                          <td className="py-4 px-6 font-serif font-black text-amber-700">{sarAmount(e.total_employee_earnings)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 4. TAP RECONCILIATION RUNS AND MONTHLY FEE INVOICES TAB */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "reconciliation" && (
        <div role="tabpanel" id="ledger-panel-reconciliation" aria-labelledby="ledger-tab-reconciliation" className="space-y-6 animate-fadeIn">
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="flex flex-col gap-3 border-b border-[#ECECEC] bg-gray-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-lg font-black text-gray-900">{t.reconTitle}</h2>
                <p className="mt-1 text-xs font-semibold text-gray-500">{t.reconSubtitle}</p>
              </div>
              <Link href="/admin/reconciliation" className="shrink-0 rounded-xl bg-[#101828] px-4 py-2 text-xs font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]">{t.openReconciliation}</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px]">
                    <th scope="col" className="py-4 px-6 text-start">{t.reconDay}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.reconStatus}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.reconOpenBreaks}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.reconTapCharges}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.reconRanAt}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                  {reconLoading ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-400 font-bold" role="status">{t.loading}</td></tr>
                  ) : reconError ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center">
                        <p role="alert" className="font-bold text-[#B42318]">{t.listFailed.replace("{reason}", reconError)}</p>
                        <button type="button" onClick={() => void loadReconciliationRuns()} className="mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
                      </td>
                    </tr>
                  ) : reconciliationRuns.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-500 font-bold">{t.noReconRuns}</td></tr>
                  ) : (
                    reconciliationRuns.map((run) => (
                      <tr key={run.business_day} className="hover:bg-gray-50/40">
                        <td className="py-4 px-6 font-bold text-gray-900">{new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${run.business_day}T00:00:00Z`))}</td>
                        <td className="py-4 px-6">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-black ${run.status === "matched" ? "bg-[#ECFDF3] text-[#027A48]" : run.status === "breaks" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                            {t.reconStatuses[run.status] ?? run.status}
                          </span>
                        </td>
                        <td className="py-4 px-6">{count(run.counts?.open_breaks)}</td>
                        <td className="py-4 px-6">{count(run.counts?.tap_charges)}</td>
                        <td className="py-4 px-6 text-gray-500">{formatDate(run.ran_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly platform fee invoices */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h2 className="font-serif text-base font-black text-gray-900">{t.feeInvoicesTitle}</h2>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.feeInvoicesSubtitle}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceNo}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceProvider}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoicePeriod}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceBookings}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceGmv}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceCommission}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceDue}</th>
                    <th scope="col" className="py-4 px-6 text-start">{t.invoiceStatus}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {feeInvoicesLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : feeInvoicesError ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center">
                        <p role="alert" className="font-bold text-[#B42318]">{t.listFailed.replace("{reason}", feeInvoicesError)}</p>
                        <button type="button" onClick={() => void loadFeeInvoices()} className="mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500">{t.retry}</button>
                      </td>
                    </tr>
                  ) : providerFeeInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">{t.noRecords}</td>
                    </tr>
                  ) : (
                    providerFeeInvoices.map((inv) => {
                      const provName = isRTL 
                        ? inv.providers?.business_name_ar || inv.providers?.business_name_en || inv.provider_id
                        : inv.providers?.business_name_en || inv.providers?.business_name_ar || inv.provider_id;
                      return (
                        <tr key={inv.id} className="hover:bg-gray-50/40">
                          <td className="py-4 px-6 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                          <td className="py-4 px-6 font-bold">{provName}</td>
                          <td className="py-4 px-6 text-gray-500 font-mono text-[10px]">{inv.period_start} ~ {inv.period_end}</td>
                          <td className="py-4 px-6 font-mono">{count(inv.total_bookings_count)}</td>
                          <td className="py-4 px-6 font-mono">{sarAmount(inv.gross_gmv_sar)}</td>
                          <td className="py-4 px-6 font-mono text-amber-700">{sarAmount(inv.platform_commission_sar)}</td>
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{sarAmount(inv.total_invoice_due_sar)}</td>
                          <td className="py-4 px-6">
                            <span className="inline-block rounded-full bg-[#ECFDF3] border border-[#D1FADF] px-2.5 py-1 text-[9px] font-black uppercase text-[#027A48]">
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {providerFeeInvoices.length > 0 && listTotals.feeInvoices > providerFeeInvoices.length && (
                <p className="px-6 py-3 text-[11px] font-semibold text-gray-500">{showing(t.listShowing, providerFeeInvoices.length, listTotals.feeInvoices)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
