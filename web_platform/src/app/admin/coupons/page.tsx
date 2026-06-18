"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Coupons & Offers Builder",
    subtitle: "Generate platform promo codes, manage discount percentages, and schedule validity.",
    activeCoupons: "Active Coupons",
    totalRedeemed: "Total Redemptions",
    savedValue: "Saved by Customers",
    couponCode: "Promo Code",
    discountType: "Discount Type",
    discountVal: "Value",
    usageCount: "Redeemed Count",
    status: "Status",
    actions: "Actions",
    active: "ACTIVE",
    expired: "EXPIRED"
  },
  ar: {
    title: "منشئ الكوبونات والعروض",
    subtitle: "توليد أكواد الخصومات الترويجية، تحديد قيم التوفير، وتحديد أوقات الفعالية.",
    activeCoupons: "الكوبونات النشطة",
    totalRedeemed: "إجمالي الاستخدامات",
    savedValue: "إجمالي توفير العملاء",
    couponCode: "رمز الكوبون",
    discountType: "نوع الخصم",
    discountVal: "القيمة",
    usageCount: "مرات الاستخدام",
    status: "الحالة",
    actions: "الإجراءات",
    active: "نشط",
    expired: "منتهي"
  }
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
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
    setCoupons([
      { id: 1, code: "RAMADAN20", type: "Percentage", value: "20%", count: 342, active: true },
      { id: 2, code: "PRIMORA10", type: "Flat", value: "10 SAR", count: 850, active: true },
      { id: 3, code: "WELCOME50", type: "Percentage", value: "50%", count: 1240, active: false }
    ]);
  }, []);

  const handleToggle = (id: number) => {
    setCoupons(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeCoupons}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{coupons.filter(c => c.active).length} Codes</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalRedeemed}</span>
          <strong className="block text-2xl font-serif font-black text-[#D1AF47] mt-2.5">2,432</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.savedValue}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">24,320 {lang === "ar" ? "ريال" : "SAR"}</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.couponCode}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.discountType}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.discountVal}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.usageCount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {coupons.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-mono font-bold text-gray-900">{c.code}</td>
                  <td className="py-4 px-6">{c.type}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{c.value}</td>
                  <td className="py-4 px-6 font-serif font-black">{c.count}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      c.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{c.active ? t.active : t.expired}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(c.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">Toggle</button>
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
