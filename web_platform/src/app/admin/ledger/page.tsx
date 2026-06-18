"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Transactions Splits Ledger",
    subtitle: "Audit Tap Connect escrow splits, captured funds, and release pending payouts to bank profiles.",
    loading: "Loading captured splits ledger...",
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
    errorLoad: "Failed to load platform splits ledger."
  },
  ar: {
    title: "سجل تقسيم المعاملات المالية",
    subtitle: "تدقيق تقسيمات الضمان المالي لمزودي الخدمة عبر Tap Connect، وتحرير المبالغ المعلقة لحساباتهم البنكية.",
    loading: "جاري تحميل سجل المعاملات المالية الموزعة...",
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
    errorLoad: "فشل تحميل سجل المعاملات المالية الموزعة."
  }
};

export default function AdminLedger() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

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
    totalGrossTitle: lang === "ar" ? "إجمالي الحجم الإجمالي" : "Total Gross Volume",
    totalPlatformTitle: lang === "ar" ? "إجمالي عمولات المنصة" : "Total Platform Revenue",
    totalProviderTitle: lang === "ar" ? "إجمالي مستحقات المزودين" : "Total Providers Share"
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

      if (data && data.length > 0) {
        setLedger(data);
      } else {
        // Mock splits ledger
        setLedger([
          {
            id: "tl-mock-1",
            booking_id: "b-mock-1",
            payment_intent_id: "ch_tap_981240182",
            total_captured: 120.00,
            platform_share: 18.00,
            provider_share: 102.00,
            payout_status: "pending",
            created_at: new Date().toISOString()
          },
          {
            id: "tl-mock-2",
            booking_id: "b-mock-2",
            payment_intent_id: "ch_tap_981240183",
            total_captured: 250.00,
            platform_share: 37.50,
            provider_share: 212.50,
            payout_status: "released",
            created_at: new Date().toISOString()
          },
          {
            id: "tl-mock-3",
            booking_id: "b-mock-3",
            payment_intent_id: "ch_tap_981240184",
            total_captured: 300.00,
            platform_share: 45.00,
            provider_share: 255.00,
            payout_status: "pending",
            created_at: new Date().toISOString()
          }
        ]);
      }
    } catch (err) {
      setError(t.errorLoad);
      console.warn("Offline splits ledger warning:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, [lang]);

  const handleReleasePayout = async (id: string) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("tl-mock-")) {
        setLedger((prev) =>
          prev.map((t) => (t.id === id ? { ...t, payout_status: "released" } : t))
        );
        setSuccess(t.successMsg);
        return;
      }

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
      <div>
        <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
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
  );
}
