"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Client Reviews Audit",
    subtitle: "Moderate reviews scoreboards, client comments, and flag abusive reports.",
    totalReviews: "Total Reviews",
    avgRating: "Average Rating",
    flaggedReviews: "Flagged Reviews",
    client: "Client Name",
    rating: "Score",
    comment: "Comment Detail",
    status: "Moderation State",
    actions: "Actions",
    approveBtn: "Approve Review",
    flagBtn: "Flag Review",
    approved: "APPROVED",
    flagged: "FLAGGED"
  },
  ar: {
    title: "تدقيق ومراجعة التقييمات",
    subtitle: "إدارة ومراقبة تقييمات العملاء، وحجب التعليقات المخالفة لسياسات المنصة.",
    totalReviews: "إجمالي التقييمات",
    avgRating: "متوسط التقييم العام",
    flaggedReviews: "التقييمات المبلّغ عنها",
    client: "اسم العميل",
    rating: "التقييم",
    comment: "تفاصيل التعليق",
    status: "حالة التقييم",
    actions: "الإجراءات",
    approveBtn: "قبول التقييم",
    flagBtn: "بلاغ مخالفة",
    approved: "مقبول",
    flagged: "مخالفة"
  }
};

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
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
    setReviews([
      { id: 1, customer: "سارة القحطاني", rating: 5, comment: lang === "ar" ? "خدمة استثنائية ونظافة فائقة، شكراً جزيلاً!" : "Exceptional service and clean tools!", status: "APPROVED" },
      { id: 2, customer: "Bandar Al-Otaibi", rating: 1, comment: lang === "ar" ? "تأخر الأخصائي نصف ساعة كاملة دون اعتذار." : "Stylist arrived 30 mins late without warning.", status: "FLAGGED" },
      { id: 3, customer: "مها الودعاني", rating: 4, comment: lang === "ar" ? "قصة ممتازة وتنسيق رائع، سأكرر الزيارة." : "Very good haircut and friendly staff.", status: "APPROVED" }
    ]);
  }, [lang]);

  const handleStatus = (id: number, status: string) => {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, status } : r));
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalReviews}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">1,248</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.avgRating}</span>
          <strong className="block text-2xl font-serif font-black text-[#D1AF47] mt-2.5">4.8 / 5.0</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.flaggedReviews}</span>
          <strong className="block text-2xl font-serif font-black text-red-700 mt-2.5">{reviews.filter(r => r.status === "FLAGGED").length}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {reviews.map(r => (
          <div key={r.id} className="bg-white border border-[#ECECEC] rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
            <div className={`flex justify-between items-start gap-4 ${flip}`}>
              <div>
                <p className="font-bold text-gray-900 text-sm">{r.customer}</p>
                <div className={`flex items-center gap-1 mt-1 ${flip}`}>
                  <span className="text-[#D1AF47] font-bold text-xs">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                </div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                r.status === "APPROVED" ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
              }`}>{r.status === "APPROVED" ? t.approved : t.flagged}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed font-semibold">"{r.comment}"</p>
            <div className={`flex gap-2 pt-2 border-t border-[#F5F5F5] ${isRTL ? "justify-start" : "justify-end"}`}>
              <button onClick={() => handleStatus(r.id, "FLAGGED")} className="px-3.5 py-1.5 bg-white text-gray-700 border border-[#ECECEC] rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-50 transition">{t.flagBtn}</button>
              <button onClick={() => handleStatus(r.id, "APPROVED")} className="px-3.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.approveBtn}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
