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
    refundUnavailable: "Gateway refunds are not configured in this dashboard yet. Review this payment in the Tap/Moyasar merchant console before refunding funds."
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

export default function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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

  const handleRefund = (_id?: string) => {
    setSuccess("");
    setError(t.refundUnavailable);
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
                      <button onClick={() => handleRefund()} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.refundBtn}</button>
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
