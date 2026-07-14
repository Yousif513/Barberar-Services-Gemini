"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Financial Ledger & Statements",
    subtitle: "Audit Tap Connect escrow splits, manage provider payout requests, and view accountant summaries.",
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
    successMsg: "Escrow split payout released successfully!",
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
    
    // Statements Tab
    vatReportTitle: "Monthly VAT Collection Report",
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
    
    // Statements Tab
    vatReportTitle: "تقرير ضريبة القيمة المضافة الشهري",
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

const FALLBACK_METHODS: PayMethod[] = [
  { id: "m1", key: "mada", label_en: "mada", label_ar: "مدى", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: true, env: "test", sort_order: 1 },
  { id: "m2", key: "apple_pay", label_en: "Apple Pay", label_ar: "أبل باي", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 2 },
  { id: "m3", key: "visa", label_en: "Visa", label_ar: "فيزا", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 3 },
  { id: "m4", key: "stc_pay", label_en: "STC Pay", label_ar: "إس تي سي باي", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 5 },
  { id: "m5", key: "cash", label_en: "Cash on service", label_ar: "نقداً عند الخدمة", gateway_key: "internal", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 10 },
];

const FALLBACK_PAYMENT_INTEGRATIONS: PaymentIntegration[] = [
  { id: "pi1", key: "tap", name: "Tap Payments", category: "payments", status: "connected", enabled: true, env: "test", supported_payment_method_keys: ["mada", "apple_pay", "visa", "mastercard", "stc_pay"] },
  { id: "pi2", key: "moyasar", name: "Moyasar", category: "payments", status: "disconnected", enabled: false, env: "test", supported_payment_method_keys: ["mada", "apple_pay", "visa", "mastercard", "stc_pay"] },
  { id: "pi3", key: "paytabs", name: "PayTabs", category: "payments", status: "disconnected", enabled: false, env: "test", supported_payment_method_keys: ["mada", "apple_pay", "visa", "mastercard", "stc_pay"] },
  { id: "pi4", key: "myfatoorah", name: "MyFatoorah", category: "payments", status: "disconnected", enabled: false, env: "test", supported_payment_method_keys: ["mada", "apple_pay", "visa", "mastercard", "stc_pay"] },
  { id: "pi5", key: "tamara", name: "Tamara", category: "payments", status: "disconnected", enabled: false, env: "test", supported_payment_method_keys: ["tamara"] },
  { id: "pi6", key: "tabby", name: "Tabby", category: "payments", status: "disconnected", enabled: false, env: "test", supported_payment_method_keys: ["tabby"] }
];

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
  const L = lang === "ar"
    ? { title: "طرق الدفع (السوق السعودي)", subtitle: "فعّل أو عطّل الطرق وحدد الافتراضية — تنعكس فوراً على صفحة الدفع لدى العميل وشاشة مستحقات المزود.", enabled: "مفعلة", disabled: "معطلة", makeDefault: "افتراضية", isDefault: "★ الافتراضية", roles: "متاحة لـ", customer: "العميل", provider: "المزود", gateway: "البوابة", saved: "تم حفظ إعدادات طرق الدفع.", empty: "لا توجد طرق دفع — طبّق ترحيل قاعدة البيانات ثم أعد التحميل." }
    : { title: "Payment Methods (KSA)", subtitle: "Enable, disable and set the default — changes reflect instantly at customer checkout and provider payout screens.", enabled: "Enabled", disabled: "Disabled", makeDefault: "Make default", isDefault: "★ Default", roles: "Available to", customer: "Customer", provider: "Provider", gateway: "Gateway", saved: "Payment method settings saved.", empty: "No payment methods yet — apply the database migration and reload." };

  const P = lang === "ar"
    ? { activeApi: "API Ù…ØªØµÙ„", blocked: "Ù…Ø­Ø¬ÙˆØ¨: Ø§Ø®ØªØ± API Ø¯ÙØ¹ Ù…ØªØµÙ„", noGateway: "Ù„Ø§ ÙŠØ­ØªØ§Ø¬ API", selectGateway: "Ø§Ø®ØªÙŠØ§Ø± Ù…Ø²ÙˆØ¯ Ø§Ù„Ø¯ÙØ¹", activeApis: "APIs Ø§Ù„Ù…ÙØ¹Ù„Ø©" }
    : { activeApi: "Connected API", blocked: "Blocked: choose a connected payment API", noGateway: "No API required", selectGateway: "Select gateway provider", activeApis: "Active payment APIs" };

  useEffect(() => {
    (async () => {
      try {
        const [{ data: methodRows }, { data: integrationRows }] = await Promise.all([
          supabase.from("payment_methods").select("*").order("sort_order"),
          supabase.from("integrations").select("id, key, name, category, status, enabled, env, supported_payment_method_keys").eq("category", "payments").order("name")
        ]);
        setMethods((methodRows?.length ? methodRows : FALLBACK_METHODS).map(normalizePayMethod));
        setPaymentIntegrations((integrationRows?.length ? integrationRows : FALLBACK_PAYMENT_INTEGRATIONS) as PaymentIntegration[]);
      } catch {
        setMethods(FALLBACK_METHODS.map(normalizePayMethod));
        setPaymentIntegrations(FALLBACK_PAYMENT_INTEGRATIONS);
      }
    })();
  }, []);

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(""), 3000); };

  const toggleEnabled = async (m: PayMethod) => {
    setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, enabled: !m.enabled } : x)));
    try {
      await supabase.from("payment_methods").update({ enabled: !m.enabled }).eq("key", m.key);
    } catch { /* fallback rows (no DB yet) still toggle locally */ }
    flash(L.saved);
  };

  const makeDefault = async (m: PayMethod) => {
    setMethods((prev) => prev.map((x) => ({ ...x, is_default: x.id === m.id })));
    try {
      await supabase.from("payment_methods").update({ is_default: false }).neq("id", m.id);
      await supabase.from("payment_methods").update({ is_default: true, enabled: true }).eq("id", m.id);
    } catch { /* fallback rows */ }
    flash(L.saved);
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
    const nextFields = { gateway_key: gateway.key, env: gateway.env };
    setMethods((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...nextFields } : x)));
    try {
      await supabase.from("payment_methods").update(nextFields).eq("id", m.id);
    } catch {
      /* fallback rows still update locally */
    }
    flash(L.saved);
  };

  return (
    <div className={cardBase}>
      <div className="mb-4">
        <h3 className="text-sm font-serif font-black text-gray-900">{L.title}</h3>
        <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{L.subtitle}</p>
      </div>
      {note && <div className="mb-3 rounded-xl bg-[#ECFDF3] border border-[#D1FADF] px-3 py-2 text-[11px] font-bold text-[#027A48]">{note}</div>}
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
                    className="w-full rounded-xl border border-[#ECECEC] bg-white px-2.5 py-2 text-[10px] font-black text-gray-700 outline-none focus:border-[#D1AF47]"
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

export default function AdminLedger() {
  const [activeTab, setActiveTab] = useState<"methods" | "splits" | "requests" | "statements">("methods");
  const [ledger, setLedger] = useState<any[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  // Accountant Report States
  const [vatSummary, setVatSummary] = useState<any[]>([]);
  const [settlementSummary, setSettlementSummary] = useState<any[]>([]);
  const [earningsSummary, setEarningsSummary] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

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
      
      const [vatResult, settlementResult, earningsResult] = await Promise.all([
        supabase.from("monthly_vat_summary").select("*").order("month_start", { ascending: false }),
        supabase.from("provider_settlement_summary").select("*, providers(business_name_en, business_name_ar)").order("month_start", { ascending: false }),
        supabase.from("employee_earnings_summary").select("*, employees(name_en, name_ar)").order("month_start", { ascending: false })
      ]);

      if (vatResult.data && vatResult.data.length > 0) {
        setVatSummary(vatResult.data);
      } else {
        setVatSummary([
          { month_start: "2026-07-01", total_bookings: 48, total_vat_collected: 862.50, total_sales: 6612.50 },
          { month_start: "2026-06-01", total_bookings: 112, total_vat_collected: 2185.00, total_sales: 16750.00 }
        ]);
      }

      if (settlementResult.data && settlementResult.data.length > 0) {
        setSettlementSummary(settlementResult.data);
      } else {
        setSettlementSummary([
          { month_start: "2026-07-01", provider_id: "demo-p1", providers: { business_name_en: "Elite Barber Lounge", business_name_ar: "صالون إيليت الرجالي" }, total_transactions: 34, gross_captured_volume: 4850.00, platform_share_collected: 727.50, provider_share_expected: 4122.50, provider_share_released: 3500.00 },
          { month_start: "2026-07-01", provider_id: "demo-p2", providers: { business_name_en: "Sara Beauty Salon", business_name_ar: "صالون وسبا سارة للتجميل" }, total_transactions: 14, gross_captured_volume: 1762.50, platform_share_collected: 264.38, provider_share_expected: 1498.12, provider_share_released: 1498.12 }
        ]);
      }

      if (earningsResult.data && earningsResult.data.length > 0) {
        setEarningsSummary(earningsResult.data);
      } else {
        setEarningsSummary([
          { month_start: "2026-07-01", employee_id: "demo-e1", employees: { name_en: "Omar Khaled", name_ar: "عمر خالد" }, total_completed_bookings: 18, total_employee_earnings: 1250.00 },
          { month_start: "2026-07-01", employee_id: "demo-e2", employees: { name_en: "Yousef Adel", name_ar: "يوسف عادل" }, total_completed_bookings: 12, total_employee_earnings: 820.00 }
        ]);
      }
    } catch (err) {
      console.warn("Accountant report views loading fallback:", err);
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
    loadPayoutRequests();
    loadReports();
  }, [lang]);

  const handleReleasePayout = async (id: string) => {
    try {
      setSuccess("");
      setError("");

      const { error: patchError } = await supabase
        .from("transactional_ledger")
        .update({ payout_status: "released" })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(t.successMsg);
      loadLedger();
    } catch (err) {
      setError(t.errorMsg);
      console.warn("Offline split release warning:", err);
    }
  };

  const updatePayoutRequestStatus = async (request: any, status: "processing" | "rejected") => {
    try {
      setSuccess("");
      setError("");
      setProcessingRequestId(request.id);

      const { error: patchError } = await supabase
        .from("payout_requests")
        .update({
          status,
          processed_at: status === "rejected" ? new Date().toISOString() : null,
          admin_note: status === "rejected" ? "Rejected by admin review." : "Approved for payout processing."
        })
        .eq("id", request.id);

      if (patchError) throw patchError;

      setSuccess(status === "rejected" ? t.requestRejectedMsg : t.requestProcessingMsg);
      await loadPayoutRequests();
    } catch (err) {
      setError(t.requestActionError);
      console.warn("Payout request status warning:", err);
    } finally {
      setProcessingRequestId("");
    }
  };

  const markPayoutRequestPaid = async (request: any) => {
    try {
      setSuccess("");
      setError("");
      setProcessingRequestId(request.id);

      const { data: pendingLedger, error: ledgerError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          provider_share,
          created_at,
          bookings!inner (
            branches!inner (
              provider_id
            )
          )
        `)
        .eq("payout_status", "pending")
        .eq("bookings.branches.provider_id", request.provider_id)
        .order("created_at", { ascending: true });

      if (ledgerError) throw ledgerError;
      if (!pendingLedger || pendingLedger.length === 0) {
        setError(t.noLedgerCoverage);
        return;
      }

      const targetAmount = Number(request.amount || 0);
      let coveredAmount = 0;
      const ledgerIdsToRelease: string[] = [];

      for (const entry of pendingLedger) {
        if (coveredAmount >= targetAmount) break;
        ledgerIdsToRelease.push(entry.id);
        coveredAmount += Number(entry.provider_share || 0);
      }

      if (ledgerIdsToRelease.length === 0) {
        setError(t.noLedgerCoverage);
        return;
      }

      const { error: releaseError } = await supabase
        .from("transactional_ledger")
        .update({ payout_status: "released" })
        .in("id", ledgerIdsToRelease);

      if (releaseError) throw releaseError;

      const { error: requestError } = await supabase
        .from("payout_requests")
        .update({
          status: "paid",
          processed_at: new Date().toISOString(),
          admin_note: `Released ${coveredAmount.toFixed(2)} SAR across ${ledgerIdsToRelease.length} ledger rows.`
        })
        .eq("id", request.id);

      if (requestError) throw requestError;

      setSuccess(t.requestPaidMsg);
      await Promise.all([loadLedger(), loadPayoutRequests()]);
    } catch (err) {
      setError(t.requestActionError);
      console.warn("Payout request paid warning:", err);
    } finally {
      setProcessingRequestId("");
    }
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
        </div>
      </div>

      {success && (
        <div className={`bg-[#ECFDF3] border border-[#22C55E]/20 text-[#16A34A] text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-[#FEF3F2] border border-[#EF4444]/20 text-[#EF4444] text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

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
                  $
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
                            onClick={() => handleReleasePayout(item.id)}
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
                                onClick={() => updatePayoutRequestStatus(request, "processing")}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-white text-gray-700 border border-[#ECECEC] hover:bg-gray-50 disabled:opacity-50 text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                              >
                                {t.markProcessing}
                              </button>
                            )}
                            {!isClosed && (
                              <button
                                onClick={() => markPayoutRequestPaid(request)}
                                disabled={isBusy}
                                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                              >
                                {t.markPaid}
                              </button>
                            )}
                            {!isClosed && (
                              <button
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
    </div>
  );
}
