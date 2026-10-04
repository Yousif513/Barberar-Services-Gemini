"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Disputes Arbitrator Console",
    subtitle: "Review flagged client ratings (1-2 stars), refund appeals, and safety violations.",
    loading: "Loading flagged dispute logs...",
    success: "Success",
    error: "Error",
    disputedAmount: "Disputed Amount",
    bookingId: "Booking ID",
    flaggedRating: "Flagged Review Rating",
    disputeDetail: "Dispute Detail / Reason",
    selectAction: "Refund the customer or reject the dispute",
    declineRefund: "Decline Refund",
    approveRefund: "Approve Full Refund",
    statusRefunded: "REFUNDED",
    statusDeclined: "DECLINED",
    statusOpen: "OPEN",
    noDetail: "No detail provided.",
    independent: "Independent",
    successMsg: "Dispute successfully resolved as ",
    errorMsg: "Failed to process dispute decision."
  },
  ar: {
    title: "منصة التحكيم في النزاعات",
    subtitle: "مراجعة تقييمات العملاء المعلمة (1-2 نجوم)، وطلبات استرداد المبالغ، والانتهاكات الأمنية.",
    loading: "جاري تحميل سجل النزاعات المعلمة...",
    success: "نجاح",
    error: "خطأ",
    disputedAmount: "المبلغ المتنازع عليه",
    bookingId: "رقم الحجز",
    flaggedRating: "التقييم المعلم",
    disputeDetail: "تفاصيل / سبب النزاع",
    selectAction: "اختر إجراءً لتحرير مبلغ الضمان أو رفض بلاغ المخالفة",
    declineRefund: "رفض الاسترجاع",
    approveRefund: "موافقة على استرداد كامل",
    statusRefunded: "تم الاسترجاع",
    statusDeclined: "تم الرفض",
    statusOpen: "مفتوح",
    noDetail: "لم يتم تقديم تفاصيل.",
    independent: "مستقل",
    successMsg: "تم تسوية النزاع بنجاح كـ ",
    errorMsg: "فشلت معالجة قرار النزاع."
  }
};

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<any[]>([]);
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
    totalDisputes: lang === "ar" ? "إجمالي النزاعات" : "Total Disputes",
    pendingDisputes: lang === "ar" ? "النزاعات المعلقة" : "Pending Disputes",
    refundedTotal: lang === "ar" ? "إجمالي المبالغ المستردة" : "Refunded Total",
  };

  const loadDisputes = async () => {
    try {
      setLoading(true);
      setError("");
      // Try payment_disputes table first
      const { data, error: dbError } = await supabase
        .from("payment_disputes")
        .select(`
          id,
          disputed_amount_sar,
          reason,
          status,
          created_at,
          customer:profiles(first_name, last_name),
          provider:providers(business_name_en, business_name_ar),
          booking:bookings(id, status, scheduled_at)
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setDisputes(data.map(d => {
          const cust = d.customer as any;
          const prov = d.provider as any;
          const bk = d.booking as any;
          return {
            id: d.id,
            bookingId: bk?.id || "N/A",
            customer: cust ? `${cust.first_name || ""} ${cust.last_name || ""}`.trim() : "Verified Client",
            provider: (lang === "ar" ? prov?.business_name_ar : prov?.business_name_en) || prov?.business_name_en || t.independent,
            amount: `${d.disputed_amount_sar || 0} ${lang === "ar" ? "ريال" : "SAR"}`,
            reason: d.reason || t.noDetail,
            rating: 1,
            status: d.status === "resolved_refund" ? "REFUNDED" : d.status === "resolved_rejected" ? "DECLINED" : "OPEN"
          };
        }));
      } else {
        setDisputes([]);
      }
    } catch (err: any) {
      console.warn("Failed to load live disputes:", err);
      setError(err?.message || t.errorMsg);
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDisputes();
  }, [lang]);

  const handleResolveDispute = async (disputeId: string, action: "REFUNDED" | "RESOLVED" | "DECLINED") => {
    try {
      setSuccess("");
      setError("");

      // A decision moves money, so it needs a recorded reason; the server issues any refund request.
      const reason = window.prompt(lang === "ar" ? "سبب القرار (يُحفظ في سجل التدقيق):" : "Reason for this decision (kept in the audit log):");
      if (!reason || !reason.trim()) return;
      const resolution = action === "REFUNDED" ? "resolved_refund" : "resolved_rejected";
      const { error: rpcError } = await supabase.rpc("resolve_booking_dispute", {
        p_dispute_id: disputeId,
        p_resolution: resolution,
        p_admin_notes: reason.trim()
      });
      if (rpcError) throw rpcError;

      setDisputes((prev) =>
        prev.map((d) => (d.id === disputeId ? { ...d, status: action } : d))
      );

      setSuccess(`${t.successMsg} ${action}!`);
    } catch (err: any) {
      setError(err?.message || t.errorMsg);
    }
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Summary KPI values
  const totalDisputes = disputes.length;
  const pendingDisputes = disputes.filter(d => d.status === "OPEN" || d.status === "DISPUTED" || d.status === "confirmed").length;
  const refundedTotal = disputes.filter(d => d.status === "REFUNDED").reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {t.title}
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.subtitle}
          </p>
        </div>
      </div>

      {success && (
        <div className={`bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Total Disputes */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalDisputes}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
              #
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalDisputes.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        {/* KPI 2: Pending Disputes */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.pendingDisputes}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-amber-700 font-serif text-xs font-black">
              !
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">
            {pendingDisputes.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        {/* KPI 3: Refunded Total */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.refundedTotal}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#101828]">
              <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {refundedTotal.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>
      </div>

      {/* Disputes List */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="bg-white border border-[#ECECEC] rounded-2xl p-8 text-center text-gray-400 text-xs font-bold shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            {t.loading}
          </div>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="bg-white border border-[#ECECEC] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-6 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] transition-all duration-300">
              {/* Header Info */}
              <div className={`flex flex-col sm:flex-row justify-between items-start gap-4 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : "text-left"}>
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <h3 className="font-extrabold text-sm text-gray-900">{d.customer} vs {d.provider}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      d.status === "REFUNDED"
                        ? "bg-[#ECFDF3] text-[#16A34A]"
                        : d.status === "DECLINED"
                        ? "bg-[#FEF3F2] text-[#D92D20]"
                        : "bg-[#FFFAEB] text-[#F59E0B]"
                    }`}>
                      {d.status === "REFUNDED" ? t.statusRefunded : d.status === "DECLINED" ? t.statusDeclined : t.statusOpen}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 font-semibold mt-2.5 uppercase tracking-widest">
                    {t.bookingId}: <span className="font-mono text-gray-900 font-bold">{d.bookingId.substring(0, 8)}...</span> | {t.flaggedRating}: {" "}
                    <span className="text-[#D1AF47] font-bold tracking-widest">
                      {"★".repeat(d.rating)}{"☆".repeat(5 - d.rating)}
                    </span>
                  </p>
                </div>
                
                <div className={isRTL ? "text-right" : "text-left"}>
                  <span className="text-[10px] text-[#667085] block font-extrabold uppercase tracking-widest">{t.disputedAmount}</span>
                  <span className="text-xl font-serif font-black text-gray-900 mt-1 block">{d.amount}</span>
                </div>
              </div>

              {/* Dispute Reason details */}
              <div className={`p-4 bg-gray-50 border border-[#ECECEC] rounded-xl text-xs text-gray-700 leading-relaxed font-semibold ${isRTL ? "text-right" : "text-left"}`}>
                <p className="font-extrabold text-gray-900 mb-1">{t.disputeDetail}:</p>
                "{d.reason}"
              </div>

              {/* Actions */}
              <div className={`flex flex-wrap gap-3 pt-4 border-t border-[#F5F5F5] items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="text-[10px] text-[#667085] font-extrabold uppercase tracking-widest">
                  {t.selectAction}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveDispute(d.id, "DECLINED")}
                    disabled={d.status === "REFUNDED" || d.status === "DECLINED"}
                    className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50 disabled:text-gray-400 text-[10px] font-black uppercase tracking-wider rounded-lg border border-[#ECECEC] transition duration-150"
                  >
                    {t.declineRefund}
                  </button>
                  <button
                    onClick={() => handleResolveDispute(d.id, "REFUNDED")}
                    disabled={d.status === "REFUNDED" || d.status === "DECLINED"}
                    className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 disabled:bg-gray-50 disabled:text-gray-400 text-[10px] font-black uppercase tracking-wider rounded-lg border border-[#ECECEC] disabled:border-[#ECECEC] transition duration-150"
                  >
                    {t.approveRefund}
                  </button>
                </div>
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
}
