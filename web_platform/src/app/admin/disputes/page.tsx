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
    selectAction: "Select Action to Release Escrow or Dismiss Flag",
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

  const t = translations[lang];

  const loadDisputes = async () => {
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          comment,
          created_at,
          booking:bookings(
            id,
            total_price,
            status,
            customer:profiles( first_name, last_name ),
            branches( name_en, providers( business_name_en ) )
          )
        `)
        .lte("rating", 2);

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setDisputes(data.map(d => {
          const bookingObj = d.booking as any;
          return {
            id: d.id,
            bookingId: bookingObj?.id || "N/A",
            customer: `${bookingObj?.customer?.first_name || "Guest"} ${bookingObj?.customer?.last_name || ""}`,
            provider: bookingObj?.branches?.providers?.business_name_en || t.independent,
            amount: `${bookingObj?.total_price || 0} ${lang === "ar" ? "ريال" : "SAR"}`,
            reason: d.comment || t.noDetail,
            rating: d.rating,
            status: bookingObj?.status || "confirmed"
          };
        }));
      } else {
        // Fallback mock disputes
        setDisputes([
          {
            id: "d-mock-1",
            bookingId: "b-mock-901",
            customer: lang === "ar" ? "يوسف" : "Yousif PC",
            provider: lang === "ar" ? "قصر الحلاقة بجدة" : "Jeddah Grooming Palace",
            amount: lang === "ar" ? "120.00 ريال" : "120.00 SAR",
            reason: lang === "ar" ? "تأخر المصفف 45 دقيقة وقام بقص الشعر بطول خاطئ." : "Stylist arrived 45 minutes late and cut hair incorrect length.",
            rating: 1,
            status: "DISPUTED"
          },
          {
            id: "d-mock-2",
            bookingId: "b-mock-902",
            customer: lang === "ar" ? "أمل سالم" : "Amal Salem",
            provider: lang === "ar" ? "صالون مها للتجميل" : "Maha Stylist & Artist",
            amount: lang === "ar" ? "350.00 ريال" : "350.00 SAR",
            reason: lang === "ar" ? "مخاوف تتعلق بالنظافة. لم يتم تعقيم الفراشي بين العملاء." : "Hygiene concern. Brushes were not sanitized between clients.",
            rating: 2,
            status: "OPEN"
          }
        ]);
      }
    } catch (err) {
      console.warn("Offline disputes loader warning:", err);
      setError(t.errorMsg);
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

      const dispute = disputes.find(d => d.id === disputeId);
      if (dispute && !disputeId.startsWith("d-mock-")) {
        const newBookingStatus = action === "REFUNDED" ? "refunded" : "completed";
        const { error: patchError } = await supabase
          .from("bookings")
          .update({ status: newBookingStatus })
          .eq("id", dispute.bookingId);

        if (patchError) throw patchError;
      }

      setDisputes((prev) =>
        prev.map((d) => (d.id === disputeId ? { ...d, status: action } : d))
      );

      setSuccess(`${t.successMsg} ${action}!`);
    } catch (err: any) {
      setError(t.errorMsg);
      console.warn("Offline dispute resolution warning:", err.message);
    }
  };

  const isRTL = lang === "ar";

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className={isRTL ? "text-right" : "text-left"}>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">{t.title}</h2>
        <p className="text-sm text-stone-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className={`bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

      {/* Disputes List */}
      <div className="grid grid-cols-1 gap-6">
        {loading ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-stone-400 text-xs font-semibold">
            {t.loading}
          </div>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
              {/* Header Info */}
              <div className={`flex flex-col sm:flex-row justify-between items-start gap-4 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : "text-left"}>
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <h3 className="font-extrabold text-sm text-stone-900">{d.customer} vs {d.provider}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                      d.status === "REFUNDED" || d.status === "REFUNDED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : d.status === "DECLINED" || d.status === "DECLINED"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {d.status === "REFUNDED" ? t.statusRefunded : d.status === "DECLINED" ? t.statusDeclined : t.statusOpen}
                    </span>
                  </div>
                  <p className="text-[9px] text-stone-400 font-bold mt-1 uppercase tracking-wider">
                    {t.bookingId}: {d.bookingId} | {t.flaggedRating}: {d.rating} ★
                  </p>
                </div>
                
                <div className={isRTL ? "text-right" : "text-left"}>
                  <span className="text-[9px] text-stone-400 block font-bold uppercase tracking-wider">{t.disputedAmount}</span>
                  <span className="text-base font-black text-stone-900">{d.amount}</span>
                </div>
              </div>

              {/* Dispute Reason details */}
              <div className={`p-4 bg-stone-50 border border-stone-100 rounded-xl text-xs text-stone-600 leading-relaxed font-light ${isRTL ? "text-right" : "text-left"}`}>
                <p className="font-bold text-stone-800 mb-1">{t.disputeDetail}:</p>
                "{d.reason}"
              </div>

              {/* Actions */}
              <div className={`flex flex-wrap gap-3 pt-2 border-t border-stone-100 items-center justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                  {t.selectAction}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveDispute(d.id, "DECLINED")}
                    disabled={d.status === "REFUNDED" || d.status === "DECLINED"}
                    className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
                  >
                    {t.declineRefund}
                  </button>
                  <button
                    onClick={() => handleResolveDispute(d.id, "REFUNDED")}
                    disabled={d.status === "REFUNDED" || d.status === "DECLINED"}
                    className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white disabled:opacity-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition"
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
