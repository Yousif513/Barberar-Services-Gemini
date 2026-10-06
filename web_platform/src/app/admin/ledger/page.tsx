"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";

const translations = {
  en: {
    title: "Financial Ledger & Statements",
    subtitle: "Audit ledger entries, manage provider payout requests, and view accountant summaries.",
    loading: "Loading ledger details...",
    success: "Success",
    error: "Error",
    paymentIntent: "Payment Intent",
    grossCaptured: "Gross Captured",
    platformShare: "Platform Share (15%)",
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
    requestActionError: "Failed to update payout request.",
    noLedgerCoverage: "No pending ledger rows were found for this provider.",
    noLedgerRows: "No captured ledger rows yet.",
    
    // Tabs
    tabMethods: "Payment Methods",
    tabSplits: "Transaction Splits",
    tabPayoutRequests: "Payout Requests",
    tabStatements: "Accountant Statements",
    tabReconciliation: "PSP Reconciliation",

    // Reconciliation Tab
    reconTitle: "Daily Payment Gateway Reconciliation",
    reconSubtitle: "Audit automated daily balance matching between Tap Payments gateway and transactional ledger records.",
    runRecon: "Run Daily Reconciliation",
    reconciling: "Reconciling...",
    reconDate: "Reconciliation Date",
    reconGateway: "Gateway",
    reconCaptured: "Captured (Gateway)",
    reconRefunded: "Refunded (Gateway)",
    reconLedger: "Ledger Gross",
    reconDiscrepancy: "Discrepancy",
    reconStatus: "Status",
    reconNotes: "Notes",
    noReconRuns: "No reconciliation runs recorded yet.",
    reconSuccess: "Daily reconciliation completed successfully.",
    reconStatusMatched: "Matched",
    reconStatusDiscrepant: "Discrepancy",
    reconStatusResolved: "Resolved",
    
    // Statements Tab
    vatReportTitle: "Monthly VAT Collection Report",
    reportsFailed: "These statements could not be loaded, so the tables below are incomplete: {reason}",
    vatReportSubtitle: "Value-Added Tax (15% VAT) collected from completed bookings.",
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
    noRecords: "No records found."
  },
  ar: {
    title: "السجل والتقارير المالية",
    subtitle: "تدقيق سجلات تقسيم الضمان المالي لمزودي الخدمة، وإدارة طلبات سحب الأرباح، والاطلاع على التقارير المحاسبية.",
    loading: "جاري تحميل تفاصيل السجل المالي...",
    success: "نجاح",
    error: "خطأ",
    paymentIntent: "معرف الدفع",
    grossCaptured: "المبلغ المقبوض",
    platformShare: "حصة المنصة (15%)",
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
    requestActionError: "فشل تحديث طلب التحويل.",
    noLedgerCoverage: "لم يتم العثور على سجلات دفعات معلقة لهذا المزود.",
    noLedgerRows: "لا توجد سجلات مالية مقبوضة بعد.",
    
    // Tabs
    tabMethods: "طرق الدفع",
    tabSplits: "تقسيم المعاملات",
    tabPayoutRequests: "طلبات سحب الأرباح",
    tabStatements: "القوائم المحاسبية والضريبة",
    tabReconciliation: "مطابقة بوابة الدفع",

    // Reconciliation Tab
    reconTitle: "المطابقة اليومية لبوابة الدفع (Tap Payments)",
    reconSubtitle: "تدقيق يومي آلي يطابق المبالغ المقبوضة والمسترجعة عبر بوابة Tap مع سجلات العمليات المالية.",
    runRecon: "تشغيل المطابقة اليومية",
    reconciling: "جاري المطابقة...",
    reconDate: "التاريخ",
    reconGateway: "البوابة",
    reconCaptured: "المقبوض (البوابة)",
    reconRefunded: "المسترجع (البوابة)",
    reconLedger: "إجمالي السجل",
    reconDiscrepancy: "الفارق",
    reconStatus: "الحالة",
    reconNotes: "الملاحظات",
    noReconRuns: "لا توجد عمليات مطابقة مسجلة بعد.",
    reconSuccess: "تمت المطابقة اليومية بنجاح.",
    reconStatusMatched: "مطابق",
    reconStatusDiscrepant: "يوجد فارق",
    reconStatusResolved: "تمت التسوية",
    
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
    noRecords: "لا توجد سجلات حالياً."
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
  // Turning a payment method off or changing the default is confirmed in a dialog that names the method.
  const [methodConfirm, setMethodConfirm] = useState<{ kind: "toggle" | "default"; method: PayMethod } | null>(null);
  const L = lang === "ar"
    ? { title: "طرق الدفع (السوق السعودي)", subtitle: "فعّل أو عطّل الطرق وحدد الافتراضية — تنعكس فوراً على صفحة الدفع لدى العميل وشاشة مستحقات المزود.", enabled: "مفعلة", disabled: "معطلة", makeDefault: "افتراضية", isDefault: "★ الافتراضية", roles: "متاحة لـ", customer: "العميل", provider: "المزود", gateway: "البوابة", saved: "تم حفظ إعدادات طرق الدفع.", empty: "لا توجد طرق دفع — طبّق ترحيل قاعدة البيانات ثم أعد التحميل." }
    : { title: "Payment Methods (KSA)", subtitle: "Enable, disable and set the default — changes reflect instantly at customer checkout and provider payout screens.", enabled: "Enabled", disabled: "Disabled", makeDefault: "Make default", isDefault: "★ Default", roles: "Available to", customer: "Customer", provider: "Provider", gateway: "Gateway", saved: "Payment method settings saved.", empty: "No payment methods yet — apply the database migration and reload." };

  const P = lang === "ar"
    ? { activeApi: "API متصل", blocked: "محجوب: اختر API دفع متصل", noGateway: "لا يحتاج API", selectGateway: "اختيار مزود الدفع", activeApis: "APIs المفعلة" }
    : { activeApi: "Connected API", blocked: "Blocked: choose a connected payment API", noGateway: "No API required", selectGateway: "Select gateway provider", activeApis: "Active payment APIs" };

  useEffect(() => {
    (async () => {
      try {
        const [{ data: methodRows, error: methodLoadError }, { data: integrationRows, error: integrationLoadError }] = await Promise.all([
          supabase.from("payment_methods").select("*").order("sort_order"),
          supabase.from("integrations").select("id, key, name, category, status, enabled, env, supported_payment_method_keys").eq("category", "payments").order("name")
        ]);
        if (methodLoadError) throw methodLoadError;
        if (integrationLoadError) throw integrationLoadError;
        setMethods(((methodRows ?? []) as PayMethod[]).map(normalizePayMethod));
        setPaymentIntegrations((integrationRows ?? []) as PaymentIntegration[]);
        setMethodError("");
      } catch {
        setMethods([]);
        setPaymentIntegrations([]);
        setMethodError(lang === "ar"
          ? "فشل تحميل طرق الدفع الحقيقية. طبّق ترحيلات Supabase وتأكد من صلاحيات المشرف."
          : "Failed to load real payment methods. Apply the Supabase migrations and verify admin permissions.");
      }
    })();
  }, [lang]);

  const flash = (msg: string) => { setMethodError(""); setNote(msg); setTimeout(() => setNote(""), 3000); };
  const fail = (previous: PayMethod[]) => {
    setMethods(previous);
    setNote("");
    setMethodError(lang === "ar"
      ? "لم يتم حفظ تغيير طريقة الدفع. تأكد من الترحيلات وصلاحيات المشرف."
      : "Payment method change was not saved. Check the migrations and admin permissions.");
  };

  const toggleEnabled = (m: PayMethod) => setMethodConfirm({ kind: "toggle", method: m });

  const applyToggle = async (m: PayMethod) => {
    const previous = methods;
    setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: !m.enabled } : x)));
    try {
      const { error: updateError } = await supabase.from("payment_methods").update({ enabled: !m.enabled }).eq("key", m.key);
      if (updateError) throw updateError;
      flash(L.saved);
    } catch {
      fail(previous);
    }
  };

  const makeDefault = (m: PayMethod) => {
    if (m.requires_gateway && !isOperational(m)) {
      setMethodError(P.blocked);
      return;
    }
    setMethodConfirm({ kind: "default", method: m });
  };

  const applyDefault = async (m: PayMethod) => {
    const previous = methods;
    setMethods((prev) => prev.map((x) => ({ ...x, is_default: x.id === m.id })));
    try {
      const { error: resetError } = await supabase.from("payment_methods").update({ is_default: false }).neq("id", m.id);
      if (resetError) throw resetError;
      const { error: updateError } = await supabase.from("payment_methods").update({ is_default: true, enabled: true }).eq("id", m.id);
      if (updateError) throw updateError;
      flash(L.saved);
    } catch {
      fail(previous);
    }
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

  const changeGateway = async (m: PayMethod, gatewayKey: string) => {
    const gateway = paymentIntegrations.find((integration) => integration.key === gatewayKey);
    if (!gateway) return;
    const previous = methods;
    const nextFields = { gateway_key: gateway.key, env: gateway.env };
    setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...nextFields } : x)));
    try {
      const { error: updateError } = await supabase.from("payment_methods").update(nextFields).eq("id", m.id);
      if (updateError) throw updateError;
      flash(L.saved);
    } catch {
      fail(previous);
    }
  };

  const renderMethodConfirm = () => {
    if (!methodConfirm) return null;
    const { kind, method } = methodConfirm;
    const name = lang === "ar" ? method.label_ar : method.label_en;
    const disabling = kind === "toggle" && method.enabled;
    const ar = lang === "ar";
    return (
      <CommandDialog
        locale={lang}
        tone={disabling ? "danger" : "default"}
        title={kind === "default" ? (ar ? "تعيين طريقة الدفع الافتراضية" : "Set the default payment method") : disabling ? (ar ? "إيقاف طريقة الدفع" : "Disable this payment method") : (ar ? "تفعيل طريقة الدفع" : "Enable this payment method")}
        intro={kind === "default"
          ? (ar ? "تصبح هذه الطريقة الخيار الأول عند الدفع وتُفعَّل إن كانت معطلة." : "This becomes the first choice at checkout, and is enabled if it was off.")
          : disabling
            ? (ar ? "لن تظهر هذه الطريقة للعملاء عند الدفع." : "Customers will no longer see this method at checkout.")
            : (ar ? "ستظهر هذه الطريقة للعملاء عند الدفع." : "Customers will see this method at checkout.")}
        facts={[
          { label: ar ? "طريقة الدفع" : "Payment method", value: name },
          { label: ar ? "البوابة" : "Gateway", value: `${method.gateway_key ?? "—"} · ${method.env}` },
        ]}
        reasonLabel=""
        reasonRequired={false}
        confirmLabel={kind === "default" ? (ar ? "تعيين كافتراضية" : "Make default") : disabling ? (ar ? "إيقاف" : "Disable") : (ar ? "تفعيل" : "Enable")}
        onConfirm={async () => {
          await (kind === "default" ? applyDefault(method) : applyToggle(method));
          return null;
        }}
        onClose={() => setMethodConfirm(null)}
      />
    );
  };

  return (
    <div className={cardBase}>
      {renderMethodConfirm()}
      <div className="mb-4">
        <h3 className="text-sm font-serif font-black text-gray-900">{L.title}</h3>
        <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{L.subtitle}</p>
      </div>
      {note && <div className="mb-3 rounded-xl bg-[#ECFDF3] border border-[#D1FADF] px-3 py-2 text-[11px] font-bold text-[#027A48]">{note}</div>}
      {methodError && <div className="mb-3 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] px-3 py-2 text-[11px] font-bold text-[#B42318]">{methodError}</div>}
      <div className={`mb-3 flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">{P.activeApis}</span>
        {paymentIntegrations.filter((api) => api.enabled && api.status === "connected").length === 0 ? (
          <span className="rounded-full border border-[#FECDCA] bg-[#FEF3F2] px-2.5 py-1 text-[9px] font-black uppercase text-[#B42318]">{P.blocked}</span>
        ) : (
          paymentIntegrations.filter((api) => api.enabled && api.status === "connected").map((api) => (
            <span key={api.key} className="rounded-full border border-[#D1FADF] bg-[#ECFDF3] px-2.5 py-1 text-[9px] font-black uppercase text-[#027A48]">
              {api.name} · {api.env}
            </span>
          ))
        )}
      </div>
      {methods.length === 0 ? (
        <p className="py-6 text-center text-xs font-semibold text-gray-400">{L.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {methods.map((m) => {
            const candidates = activeGatewaysFor(m);
            const selectedGateway = selectedGatewayFor(m);
            const operational = isOperational(m);
            return (
            <div key={m.id} className={`rounded-xl border p-3.5 transition ${m.enabled && operational ? "border-[#D1AF47]/25 bg-[#FFFDF7]" : "border-[#ECECEC] bg-gray-50/60 opacity-80"}`}>
              <div className={`flex items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : "text-left"}>
                  <strong className="block text-xs font-black text-gray-900">{lang === "ar" ? m.label_ar : m.label_en}</strong>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-gray-400">{L.gateway}: {m.gateway_key ?? "—"} · {m.env}</span>
                </div>
                <button
                  onClick={() => toggleEnabled(m)}
                  aria-label={m.enabled ? L.disabled : L.enabled}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition ${m.enabled ? "bg-[#D1AF47]" : "bg-gray-300"}`}
                >
                  <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: m.enabled ? "translateX(18px)" : "translateX(2px)" }} />
                </button>
              </div>
              <div className={`mt-2 rounded-xl border px-2.5 py-2 text-[9px] font-black uppercase tracking-wider ${
                operational ? "border-[#D1FADF] bg-[#ECFDF3] text-[#027A48]" : "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]"
              }`}>
                {operational ? `${P.activeApi}: ${m.requires_gateway ? selectedGateway?.name || m.gateway_key : P.noGateway}` : P.blocked}
              </div>
              {m.requires_gateway && (
                <label className="mt-2 block space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">{P.selectGateway}</span>
                  <select
                    value={operational ? (m.gateway_key || "") : ""}
                    onChange={(event) => changeGateway(m, event.target.value)}
                    className="w-full rounded-xl border border-[#ECECEC] bg-white px-2.5 py-2 text-[10px] font-black text-gray-700 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]"
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
                  <span key={r} className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[8px] font-black uppercase text-[#3B82F6]">{r === "customer" ? L.customer : r === "provider" ? L.provider : r}</span>
                ))}
                {m.is_default ? (
                  <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[8px] font-black uppercase text-[#B8952E]">{L.isDefault}</span>
                ) : (
                  <button onClick={() => makeDefault(m)} className="rounded-full border border-[#ECECEC] bg-white px-2 py-0.5 text-[8px] font-black uppercase text-gray-400 transition hover:border-[#D1AF47]/40 hover:text-[#B8952E]">{L.makeDefault}</button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Copy for the commands that settle provider money. Each opens a dialog that names the target, states what happens,
// captures the operator's reason (recorded in the audit log) and keeps it if the server refuses.
const commandCopy = {
  en: {
    reasonLabel: "Reason (recorded in the audit log)",
    payReasonLabel: "Bank transfer reference or note (recorded in the audit log)",
    releaseTitle: "Release this ledger entry",
    releaseIntro: "The provider's share of this payment is marked released. A release cannot be undone from the console.",
    releaseConfirm: "Release share",
    processingTitle: "Move this payout request to processing",
    processingIntro: "The request is accepted for processing. No money moves at this step.",
    processingConfirm: "Move to processing",
    rejectTitle: "Reject this payout request",
    rejectIntro: "The request is closed as rejected; the provider has to make a new request.",
    rejectConfirm: "Reject request",
    payTitle: "Mark this payout as paid",
    payIntro: "Confirm the bank transfer was made. The provider's pending ledger shares are allocated to this request and released; this cannot be undone from the console.",
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
  },
  ar: {
    reasonLabel: "السبب (يُسجل في سجل التدقيق)",
    payReasonLabel: "مرجع التحويل البنكي أو ملاحظة (تُسجل في سجل التدقيق)",
    releaseTitle: "صرف هذا القيد",
    releaseIntro: "تُسجَّل حصة مقدم الخدمة من هذه الدفعة كمصروفة. لا يمكن التراجع عن الصرف من لوحة الإدارة.",
    releaseConfirm: "صرف الحصة",
    processingTitle: "نقل طلب الصرف إلى المعالجة",
    processingIntro: "يُقبل الطلب للمعالجة. لا تنتقل أي أموال في هذه الخطوة.",
    processingConfirm: "نقل إلى المعالجة",
    rejectTitle: "رفض طلب الصرف",
    rejectIntro: "يُغلق الطلب كمرفوض، وعلى مقدم الخدمة تقديم طلب جديد.",
    rejectConfirm: "رفض الطلب",
    payTitle: "تسجيل هذا الطلب كمدفوع",
    payIntro: "أكّد أن التحويل البنكي تم. تُخصَّص حصص مقدم الخدمة المعلّقة في الدفتر لهذا الطلب وتُصرف؛ ولا يمكن التراجع عن ذلك من لوحة الإدارة.",
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
  },
};
type MoneyAction =
  | { kind: "release"; item: any }
  | { kind: "review"; request: any; decision: "processing" | "rejected" }
  | { kind: "pay"; request: any };

export default function AdminLedger() {
  const [activeTab, setActiveTab] = useState<"methods" | "splits" | "requests" | "statements" | "reconciliation">("methods");
  const [ledger, setLedger] = useState<any[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [money, setMoney] = useState<MoneyAction | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  // Accountant Report States
  const [vatSummary, setVatSummary] = useState<any[]>([]);
  const [settlementSummary, setSettlementSummary] = useState<any[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  // A failed statement query must read as a failure, not as a month with no VAT or settlements.
  const [reportsError, setReportsError] = useState("");

  // Daily PSP Reconciliation & Fee Invoices States (G33, G34)
  const [reconciliationRuns, setReconciliationRuns] = useState<any[]>([]);
  const [reconLoading, setReconLoading] = useState(false);
  const [runningRecon, setRunningRecon] = useState(false);
  const [reconDateInput, setReconDateInput] = useState(new Date().toISOString().split("T")[0]);
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

  const formatDateMonth = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      month: "long",
      year: "numeric"
    });

  const maskIban = (iban: string) => {
    const clean = (iban || "").replace(/\s/g, "").toUpperCase();
    if (clean.length <= 8) return clean;
    return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
  };

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
      const { data, error: dbError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          booking_id,
          payment_intent_id,
          total_captured,
          platform_share,
          provider_share,
          payout_status,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;
      setLedger(data || []);
    } catch (err) {
      setError(t.errorLoad);
      console.warn("Offline splits ledger warning:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadPayoutRequests = async () => {
    try {
      setRequestsLoading(true);
      const { data, error: dbError } = await supabase
        .from("payout_requests")
        .select(`
          id,
          provider_id,
          amount,
          bank_name,
          iban,
          status,
          admin_note,
          requested_at,
          processed_at,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("requested_at", { ascending: false });

      if (dbError) throw dbError;
      setPayoutRequests(data || []);
    } catch (err) {
      setPayoutRequests([]);
      console.warn("Payout request load warning:", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setReportsLoading(true);
      setReportsError("");

      const [vatResult, settlementResult, earningsResult] = await Promise.all([
        supabase.from("monthly_vat_summary").select("*").order("month_start", { ascending: false }),
        supabase.from("provider_settlement_summary").select("*, providers(business_name_en, business_name_ar)").order("month_start", { ascending: false }),
        supabase.from("employee_earnings_summary").select("*, employees(name_en, name_ar)").order("month_start", { ascending: false })
      ]);

      if (vatResult.error) {
        console.error("Failed to load monthly_vat_summary:", vatResult.error);
        setVatSummary([]);
      } else {
        setVatSummary(vatResult.data || []);
      }

      if (settlementResult.error) {
        console.error("Failed to load provider_settlement_summary:", settlementResult.error);
        setSettlementSummary([]);
      } else {
        setSettlementSummary(settlementResult.data || []);
      }

      if (earningsResult.error) {
        console.error("Failed to load employee_earnings_summary:", earningsResult.error);
        setEarningsSummary([]);
      } else {
        setEarningsSummary(earningsResult.data || []);
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
      const { data, error: dbError } = await supabase
        .from("psp_reconciliation_runs")
        .select("*")
        .order("run_date", { ascending: false });
      if (dbError) throw dbError;
      setReconciliationRuns(data || []);
    } catch (err) {
      console.warn("Reconciliation runs load warning:", err);
      setReconciliationRuns([]);
    } finally {
      setReconLoading(false);
    }
  };

  const loadFeeInvoices = async () => {
    try {
      setFeeInvoicesLoading(true);
      const { data, error: dbError } = await supabase
        .from("provider_fee_invoices")
        .select(`
          id,
          provider_id,
          invoice_number,
          period_start,
          period_end,
          total_bookings_count,
          gross_gmv_sar,
          deposit_captured_sar,
          platform_commission_sar,
          net_fee_receivable_sar,
          vat_on_commission_sar,
          total_invoice_due_sar,
          status,
          created_at,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("created_at", { ascending: false });
      if (dbError) throw dbError;
      setProviderFeeInvoices(data || []);
    } catch (err) {
      console.warn("Fee invoices load warning:", err);
      setProviderFeeInvoices([]);
    } finally {
      setFeeInvoicesLoading(false);
    }
  };

  const handleRunReconciliation = async () => {
    try {
      setRunningRecon(true);
      setError("");
      setSuccess("");
      // Pulls the day's captured charges and refunds from Tap (reconcile-psp) and compares them with the ledger.
      const { data, error: fnErr } = await supabase.functions.invoke("reconcile-psp", {
        body: { date: reconDateInput }
      });
      if (fnErr) {
        let detail = fnErr.message;
        try {
          const body = await (fnErr as { context?: Response }).context?.json();
          if (body?.error) detail = body.error;
        } catch {
          // keep the generic message
        }
        // Without Tap access, record ledger totals only; the run is marked "awaiting PSP data", never "matched".
        const { error: rpcErr } = await supabase.rpc("run_daily_psp_reconciliation", { p_date: reconDateInput });
        if (rpcErr) throw rpcErr;
        setError(`${detail}. ${lang === "ar" ? "تم تسجيل أرصدة السجل فقط بانتظار بيانات Tap." : "Ledger totals were recorded; the run is awaiting Tap data."}`);
        await loadReconciliationRuns();
        return;
      }
      setSuccess(data?.status === "matched" ? t.reconSuccess : (lang === "ar" ? "توجد فروقات بين Tap والسجل" : "Tap totals differ from the ledger"));
      await loadReconciliationRuns();
    } catch (err: any) {
      console.error("Reconciliation execution error:", err);
      setError(err?.message || "Failed to run daily PSP reconciliation.");
    } finally {
      setRunningRecon(false);
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

  const runReleaseItem = async (item: any, reason: string): Promise<string | null> => {
    // Stable per entry, so a retry after a lost response cannot release twice.
    const idempotencyKey = `ledger_release_${item.id}`;
    const { error: rpcError } = await supabase.rpc("admin_release_ledger_item", {
      p_ledger_id: item.id,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (rpcError) return errorMessage(rpcError) || t.errorMsg;
    setError("");
    setSuccess(t.successMsg);
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
    const { error: rpcError } = await supabase.rpc("admin_release_payout", {
      p_payout_request_id: request.id,
      p_idempotency_key: idempotencyKey,
      p_reason: reason,
    });
    if (rpcError) return errorMessage(rpcError) || t.requestActionError;
    setError("");
    setSuccess(t.requestPaidMsg);
    await Promise.all([loadLedger(), loadPayoutRequests()]);
    return null;
  };

  const renderMoneyDialog = () => {
    if (!money) return null;
    const c = commandCopy[lang];
    const close = () => setMoney(null);
    const sarText = (value: unknown) => `${formatMoney(value as number)} ${lang === "ar" ? "ريال" : "SAR"}`;
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
          confirmLabel={c.releaseConfirm}
          onConfirm={(reason) => runReleaseItem(item, reason)}
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
      { label: c.factBank, value: `${request.bank_name} · ${maskIban(request.iban)}` },
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

  // Calculate split summaries
  const totalGross = ledger.reduce((sum, item) => sum + (parseFloat(item.total_captured) || 0), 0);
  const platformTotal = ledger.reduce((sum, item) => sum + (parseFloat(item.platform_share) || 0), 0);
  const providerTotal = ledger.reduce((sum, item) => sum + (parseFloat(item.provider_share) || 0), 0);

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${flip}`}>
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className={`flex items-center gap-1 rounded-full bg-gray-100/80 border border-[#ECECEC] p-1 shadow-sm ${flip}`}>
          <button 
            onClick={() => setActiveTab("methods")}
            className={`rounded-full px-4 py-2 text-[10px] font-black transition-all duration-300 ${activeTab === "methods" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
          >
            {t.tabMethods}
          </button>
          <button 
            onClick={() => setActiveTab("splits")}
            className={`rounded-full px-4 py-2 text-[10px] font-black transition-all duration-300 ${activeTab === "splits" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
          >
            {t.tabSplits}
          </button>
          <button 
            onClick={() => setActiveTab("requests")}
            className={`rounded-full px-4 py-2 text-[10px] font-black transition-all duration-300 ${activeTab === "requests" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
          >
            {t.tabPayoutRequests}
          </button>
          <button 
            onClick={() => setActiveTab("statements")}
            className={`rounded-full px-4 py-2 text-[10px] font-black transition-all duration-300 ${activeTab === "statements" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
          >
            {t.tabStatements}
          </button>
          <button 
            onClick={() => setActiveTab("reconciliation")}
            className={`rounded-full px-4 py-2 text-[10px] font-black transition-all duration-300 ${activeTab === "reconciliation" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
          >
            {t.tabReconciliation}
          </button>
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

      {/* ──────────────────────────────────────────────────────── */}
      {/* 0. PAYMENT METHODS REGISTRY TAB                          */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "methods" && (
        <div className="space-y-6 animate-fadeIn">
          <PaymentMethodsRegistry lang={lang} cardBase={cardBase} />
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 1. TRANSACTION SPLITS TAB                              */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "splits" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Split summary widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Gross Captured */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalGrossTitle}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
                  ﷼
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
                {totalGross.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
              </strong>
            </div>

            {/* Platform Share */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalPlatformTitle}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-amber-700 font-serif text-xs font-black">
                  %
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">
                {platformTotal.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
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
                {providerTotal.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
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
                          {item.total_captured} {lang === "ar" ? "ريال" : "SAR"}
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-amber-700">
                          {item.platform_share} {lang === "ar" ? "ريال" : "SAR"}
                        </td>
                        <td className="py-4 px-6 font-serif font-black text-gray-700">
                          {item.provider_share} {lang === "ar" ? "ريال" : "SAR"}
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
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 2. PAYOUT REQUESTS TAB                                 */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "requests" && (
        <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)] animate-fadeIn">
          <div className={`flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-gray-50/50 p-5 ${flip}`}>
            <div>
              <h3 className="font-serif text-lg font-black text-gray-900">{t.payoutRequestsTitle}</h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">{t.payoutRequestsSubtitle}</p>
            </div>
            <span className="rounded-full border border-[#D1AF47]/25 bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9A7211]">
              {payoutRequests.length}
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
                          {formatMoney(request.amount)} {lang === "ar" ? "ريال" : "SAR"}
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-bold text-gray-900">{request.bank_name}</p>
                          <p className="mt-1 font-mono text-[9px] text-gray-400">{maskIban(request.iban)}</p>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${requestStatusClass(request.status)}`}>
                            {requestStatusLabel(request.status)}
                          </span>
                        </td>
                        <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                          <div className={`flex flex-wrap gap-2 ${isRTL ? "justify-start" : "justify-end"}`}>
                            {request.status === "requested" && (
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
                            {!isClosed && (
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
                            {!isClosed && (
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
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 3. ACCOUNTANT STATEMENTS TAB                            */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "statements" && (
        <div className="space-y-6 animate-fadeIn">
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
                        <td className="py-4 px-6 font-serif font-black text-amber-700">{formatMoney(v.total_vat_collected)} SAR</td>
                        <td className="py-4 px-6 font-serif font-black text-gray-900">{formatMoney(v.total_sales)} SAR</td>
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
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{formatMoney(s.gross_captured_volume)} SAR</td>
                          <td className="py-4 px-6 font-serif font-black text-amber-700">{formatMoney(s.platform_share_collected)} SAR</td>
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{formatMoney(s.provider_share_expected)} SAR</td>
                          <td className="py-4 px-6 font-serif font-black text-[#22C55E]">{formatMoney(s.provider_share_released)} SAR</td>
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
                          <td className="py-4 px-6 font-serif font-black text-amber-700">{formatMoney(e.total_employee_earnings)} SAR</td>
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
      {/* 4. PSP RECONCILIATION & FEE INVOICES TAB (G33, G34)     */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Action & Run Header */}
          <div className={cardBase}>
            <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${flip}`}>
              <div>
                <h3 className="font-serif text-lg font-black text-gray-900">{t.reconTitle}</h3>
                <p className="mt-1 text-xs font-semibold text-gray-500">{t.reconSubtitle}</p>
              </div>
              <div className={`flex flex-wrap items-center gap-3 ${flip}`}>
                <input
                  type="date"
                  value={reconDateInput}
                  onChange={(e) => setReconDateInput(e.target.value)}
                  className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-xs font-bold text-gray-800 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]"
                />
                <button
                  type="button"
                  disabled={runningRecon}
                  onClick={handleRunReconciliation}
                  className="rounded-xl bg-[#D1AF47] hover:bg-[#b89837] px-4 py-2 text-xs font-black text-white transition disabled:opacity-50 shadow-sm"
                >
                  {runningRecon ? t.reconciling : t.runRecon}
                </button>
              </div>
            </div>
          </div>

          {/* Daily Reconciliation Runs Table */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h3 className="font-serif text-base font-black text-gray-900">{isRTL ? "سجلات مطابقة بوابة Tap اليومية" : "Daily Tap Gateway Reconciliation Runs"}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className="py-4 px-6">{t.reconDate}</th>
                    <th className="py-4 px-6">{t.reconGateway}</th>
                    <th className="py-4 px-6">{t.reconCaptured}</th>
                    <th className="py-4 px-6">{t.reconRefunded}</th>
                    <th className="py-4 px-6">{t.reconLedger}</th>
                    <th className="py-4 px-6">{t.reconDiscrepancy}</th>
                    <th className="py-4 px-6">{t.reconStatus}</th>
                    <th className="py-4 px-6">{t.reconNotes}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {reconLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                    </tr>
                  ) : reconciliationRuns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">{t.noReconRuns}</td>
                    </tr>
                  ) : (
                    reconciliationRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50/40">
                        <td className="py-4 px-6 font-bold text-gray-900 font-mono">{run.run_date}</td>
                        <td className="py-4 px-6 font-bold uppercase tracking-wider text-xs">{run.gateway}</td>
                        <td className="py-4 px-6 font-mono text-emerald-700 font-bold">{run.total_captured_sar === null ? "—" : `${formatMoney(run.total_captured_sar)} SAR`}</td>
                        <td className="py-4 px-6 font-mono text-rose-700 font-bold">{run.total_refunded_sar === null ? "—" : `${formatMoney(run.total_refunded_sar)} SAR`}</td>
                        <td className="py-4 px-6 font-mono font-bold">{formatMoney(run.total_ledger_gross_sar)} SAR</td>
                        <td className="py-4 px-6 font-mono font-bold">{formatMoney(run.discrepancy_amount_sar)} SAR</td>
                        <td className="py-4 px-6">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                            run.status === "matched"
                              ? "bg-[#ECFDF3] text-[#027A48] border border-[#D1FADF]"
                              : run.status === "awaiting_psp_data"
                              ? "bg-[#F2F4F7] text-[#344054] border border-[#EAECF0]"
                              : "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]"
                          }`}>
                            {run.status === "matched" ? t.reconStatusMatched : run.status === "awaiting_psp_data" ? (lang === "ar" ? "بانتظار بيانات Tap" : "Awaiting Tap data") : t.reconStatusDiscrepant}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-gray-500 text-[11px] max-w-xs truncate">{run.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Provider Monthly Fee Invoices (G34) */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="border-b border-[#ECECEC] bg-gray-50/50 p-5">
              <h3 className="font-serif text-base font-black text-gray-900">
                {isRTL ? "فواتير رسوم عمولات المزودين الشهرية (G34)" : "Monthly Provider Fee & Commission Invoices (G34)"}
              </h3>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {isRTL 
                  ? "فواتير عمولة المنصة الشهرية المحسوبة بعد خصم العربون المقبوض وضريبة القيمة المضافة." 
                  : "Platform commission fee statements after captured deposit offsets and 15% VAT."}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/30 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className="py-4 px-6">{isRTL ? "رقم الفاتورة" : "Invoice No."}</th>
                    <th className="py-4 px-6">{isRTL ? "مزود الخدمة" : "Provider"}</th>
                    <th className="py-4 px-6">{isRTL ? "الفترة" : "Period"}</th>
                    <th className="py-4 px-6">{isRTL ? "الحجوزات" : "Bookings"}</th>
                    <th className="py-4 px-6">{isRTL ? "حجم المبيعات (GMV)" : "Gross GMV"}</th>
                    <th className="py-4 px-6">{isRTL ? "عمولة المنصة (15%)" : "Commission"}</th>
                    <th className="py-4 px-6">{isRTL ? "المبلغ المستحق" : "Total Due (Inc. VAT)"}</th>
                    <th className="py-4 px-6">{isRTL ? "الحالة" : "Status"}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {feeInvoicesLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
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
                          <td className="py-4 px-6 font-mono">{inv.total_bookings_count}</td>
                          <td className="py-4 px-6 font-mono">{formatMoney(inv.gross_gmv_sar)} SAR</td>
                          <td className="py-4 px-6 font-mono text-amber-700">{formatMoney(inv.platform_commission_sar)} SAR</td>
                          <td className="py-4 px-6 font-serif font-black text-gray-900">{formatMoney(inv.total_invoice_due_sar)} SAR</td>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
