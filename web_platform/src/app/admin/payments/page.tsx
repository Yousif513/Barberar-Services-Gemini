"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Global Payments & Transactions",
    subtitle: "Audit incoming payments capture states, payment gateways, and chargebacks.",
    totalCaptured: "Gross Captured",
    activeFees: "Gateway Fees Paid",
    netPlatform: "Net Revenue",
    txnId: "Transaction ID",
    method: "Method",
    gateway: "Gateway",
    amount: "Captured Value",
    status: "Payment Status",
    actions: "Actions",
    refundBtn: "Refund",
    successMsg: "Payment successfully refunded!"
  },
  ar: {
    title: "سجل المدفوعات والعمليات المالية",
    subtitle: "تدقيق عمليات الدفع الواردة، قنوات الدفع المستخدمة، وعمليات استرجاع الأموال.",
    totalCaptured: "إجمالي المبالغ المحصلة",
    activeFees: "رسوم بوابة الدفع",
    netPlatform: "صافي الإيرادات",
    txnId: "رقم المعاملة",
    method: "طريقة الدفع",
    gateway: "بوابة الدفع",
    amount: "القيمة المقبوضة",
    status: "حالة العملية",
    actions: "الإجراءات",
    refundBtn: "استرجاع المبلغ",
    successMsg: "تم استرداد مبلغ المعاملة بنجاح!"
  }
};

export default function AdminPayments() {
  const [payments, setPayments] = useState<any[]>([]);
  const [success, setSuccess] = useState("");
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

  useEffect(() => {
    setPayments([
      { id: "ch_9A2F48B", method: "Mada", gateway: "HyperPay", amount: 240, status: "captured" },
      { id: "ch_9A2F48C", method: "Apple Pay", gateway: "Checkout.com", amount: 450, status: "captured" },
      { id: "ch_9A2F48D", method: "Visa", gateway: "Stripe", amount: 120, status: "refunded" }
    ]);
  }, []);

  const handleRefund = (id: string) => {
    setSuccess("");
    setPayments(prev => prev.map(p => p.id === id ? { ...p, status: "refunded" } : p));
    setSuccess(translations[lang].successMsg);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalCaptured}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">14,240 {lang === "ar" ? "ريال" : "SAR"}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeFees}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">384.50 {lang === "ar" ? "ريال" : "SAR"}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.netPlatform}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">13,855.50 {lang === "ar" ? "ريال" : "SAR"}</strong>
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
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-mono font-bold text-gray-900">{p.id}</td>
                  <td className="py-4 px-6">{p.method}</td>
                  <td className="py-4 px-6">{p.gateway}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{p.amount} {lang === "ar" ? "ريال" : "SAR"}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      p.status === "captured" ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{p.status}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    {p.status === "captured" && <button onClick={() => handleRefund(p.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.refundBtn}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
