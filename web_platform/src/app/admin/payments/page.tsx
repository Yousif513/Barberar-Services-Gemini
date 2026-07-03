"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Global Payments & Transactions",
    subtitle: "Audit incoming payments capture states, payment gateways, and chargebacks.",
    totalCaptured: "Gross Captured",
    activeFees: "Platform Share",
    netPlatform: "Provider Share",
    txnId: "Transaction ID",
    method: "Booking",
    gateway: "Source",
    amount: "Captured Value",
    status: "Payment Status",
    actions: "Actions",
    refundBtn: "Manual Review",
    loading: "Loading captured payment ledger...",
    noPayments: "No captured payment records yet.",
    error: "Error",
    info: "Info",
    errorLoad: "Failed to load captured payment ledger.",
    refundUnavailable: "Gateway refunds are not configured in this dashboard yet. Review this payment in the Tap/Moyasar merchant console before refunding funds.",
    refundQueued: "Refund review request created for gateway processing.",
    refundDuplicate: "A refund review request already exists for this payment.",
    refundError: "Failed to create refund review request."
  },
  ar: {
    title: "سجل المدفوعات والعمليات المالية",
    subtitle: "تدقيق عمليات الدفع الواردة، قنوات الدفع المستخدمة، وعمليات استرجاع الأموال.",
    totalCaptured: "إجمالي المبالغ المحصلة",
    activeFees: "حصة المنصة",
    netPlatform: "حصة المزود",
    txnId: "رقم المعاملة",
    method: "الحجز",
    gateway: "المصدر",
    amount: "القيمة المقبوضة",
    status: "حالة العملية",
    actions: "الإجراءات",
    refundBtn: "مراجعة يدوية",
    successMsg: "تم استرداد مبلغ المعاملة بنجاح!",
    loading: "جاري تحميل سجل المدفوعات المقبوضة...",
    noPayments: "لا توجد سجلات مدفوعات مقبوضة بعد.",
    error: "خطأ",
    info: "معلومة",
    errorLoad: "فشل تحميل سجل المدفوعات.",
    refundUnavailable: "استرجاع المبالغ عبر بوابة الدفع غير مربوط داخل لوحة التحكم بعد. راجع الدفعة في لوحة Tap/Moyasar قبل رد أي مبلغ."
  }
};

// ── Payment methods registry (KSA) ─────────────────────────────────────────
// The single source of truth for which methods appear at customer checkout
// and on provider payout screens. Reads/writes public.payment_methods.
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
};

const FALLBACK_METHODS: PayMethod[] = [
  { id: "m1", key: "mada", label_en: "mada", label_ar: "مدى", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: true, env: "test", sort_order: 1 },
  { id: "m2", key: "apple_pay", label_en: "Apple Pay", label_ar: "أبل باي", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 2 },
  { id: "m3", key: "visa", label_en: "Visa", label_ar: "فيزا", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 3 },
  { id: "m4", key: "stc_pay", label_en: "STC Pay", label_ar: "إس تي سي باي", gateway_key: "tap", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 5 },
  { id: "m5", key: "cash", label_en: "Cash on service", label_ar: "نقداً عند الخدمة", gateway_key: "internal", enabled: true, enabled_for_roles: ["customer"], is_default: false, env: "test", sort_order: 10 },
];

function PaymentMethodsRegistry({ lang, cardBase }: { lang: "en" | "ar"; cardBase: string }) {
  const isRTL = lang === "ar";
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [note, setNote] = useState("");
  const L = lang === "ar"
    ? { title: "طرق الدفع (السوق السعودي)", subtitle: "فعّل أو عطّل الطرق وحدد الافتراضية — تنعكس فوراً على صفحة الدفع لدى العميل وشاشة مستحقات المزود.", enabled: "مفعلة", disabled: "معطلة", makeDefault: "افتراضية", isDefault: "★ الافتراضية", roles: "متاحة لـ", customer: "العميل", provider: "المزود", gateway: "البوابة", saved: "تم حفظ إعدادات طرق الدفع.", empty: "لا توجد طرق دفع — طبّق ترحيل قاعدة البيانات ثم أعد التحميل." }
    : { title: "Payment Methods (KSA)", subtitle: "Enable, disable and set the default — changes reflect instantly at customer checkout and provider payout screens.", enabled: "Enabled", disabled: "Disabled", makeDefault: "Make default", isDefault: "★ Default", roles: "Available to", customer: "Customer", provider: "Provider", gateway: "Gateway", saved: "Payment method settings saved.", empty: "No payment methods yet — apply the database migration and reload." };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("payment_methods").select("*").order("sort_order");
        setMethods(data?.length ? data : FALLBACK_METHODS);
      } catch {
        setMethods(FALLBACK_METHODS);
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

  return (
    <div className={cardBase}>
      <div className="mb-4">
        <h3 className="text-sm font-serif font-black text-gray-900">{L.title}</h3>
        <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{L.subtitle}</p>
      </div>
      {note && <div className="mb-3 rounded-xl bg-[#ECFDF3] border border-[#D1FADF] px-3 py-2 text-[11px] font-bold text-[#027A48]">{note}</div>}
      {methods.length === 0 ? (
        <p className="py-6 text-center text-xs font-semibold text-gray-400">{L.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {methods.map((m) => (
            <div key={m.id} className={`rounded-xl border p-3.5 transition ${m.enabled ? "border-[#D1AF47]/25 bg-[#FFFDF7]" : "border-[#ECECEC] bg-gray-50/60 opacity-80"}`}>
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
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingRefundId, setProcessingRefundId] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) setLang(currentLang);
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = { ...translations.en, ...translations[lang] };

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

  const loadPayments = async () => {
    try {
      setLoading(true);
      setError("");
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
      setPayments(data || []);
    } catch (err) {
      setPayments([]);
      setError(t.errorLoad);
      console.warn("Admin payments load warning:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [lang]);

  const handleRefund = async (payment: any) => {
    try {
      setSuccess("");
      setError("");
      setProcessingRefundId(payment.id);

      const { error: dbError } = await supabase
        .from("payment_refund_requests")
        .insert({
          ledger_id: payment.id,
          payment_intent_id: payment.payment_intent_id || payment.id,
          amount: Number(payment.total_captured || 0),
          status: "requested",
          admin_note: "Created from admin payment ledger manual review."
        });

      if (dbError) {
        if (dbError.code === "23505") {
          setError(t.refundDuplicate);
          return;
        }
        throw dbError;
      }

      setSuccess(`${t.refundQueued} ${t.refundUnavailable}`);
    } catch (err) {
      setError(t.refundError);
      console.warn("Admin refund request warning:", err);
    } finally {
      setProcessingRefundId("");
    }
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const currency = "SAR";
  const totalCaptured = payments.reduce((sum, item) => sum + (Number(item.total_captured) || 0), 0);
  const platformShare = payments.reduce((sum, item) => sum + (Number(item.platform_share) || 0), 0);
  const providerShare = payments.reduce((sum, item) => sum + (Number(item.provider_share) || 0), 0);
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{t.info}: {success}</div>}
      {error && <div className="bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] text-xs rounded-xl p-4 font-bold">{t.error}: {error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalCaptured}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{formatMoney(totalCaptured)} {currency}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeFees}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">{formatMoney(platformShare)} {currency}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.netPlatform}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{formatMoney(providerShare)} {currency}</strong>
        </div>
      </div>

      <PaymentMethodsRegistry lang={lang} cardBase={cardBase} />

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.txnId}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.method}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.gateway}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.amount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.noPayments}</td>
                </tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/40 transition duration-150">
                    <td className="py-4 px-6 font-mono font-bold text-gray-900">{p.payment_intent_id || p.id}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono text-[11px]">{p.booking_id}</span>
                    </td>
                    <td className="py-4 px-6">Transactional Ledger</td>
                    <td className="py-4 px-6 font-serif font-black text-gray-900">{formatMoney(p.total_captured)} {currency}</td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block bg-[#ECFDF3] text-[#16A34A]">
                        captured
                      </span>
                      <span className="mt-1 block text-[10px] font-bold text-gray-400">{formatDate(p.created_at)} - {p.payout_status}</span>
                    </td>
                    <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                      <button onClick={() => handleRefund(p)} disabled={processingRefundId === p.id} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition disabled:opacity-50">{t.refundBtn}</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
