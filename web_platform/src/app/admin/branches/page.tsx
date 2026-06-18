"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Branches & Outlets Matrix",
    subtitle: "Monitor provider outlet locations, active schedules, and verification statuses.",
    totalBranches: "Total Branches",
    onlineOutlets: "Online Outlets",
    avgCapacity: "Average Capacity",
    branchName: "Branch Name",
    providerName: "Provider / Salon",
    location: "Location / City",
    status: "State",
    actions: "Actions",
    active: "ONLINE",
    inactive: "MAINTENANCE"
  },
  ar: {
    title: "سجل وإدارة فروع الشركاء",
    subtitle: "متابعة مواقع فروع مقدمي الخدمة المعتمدة، جداول المواعيد النشطة، وحالتها التشغيلية.",
    totalBranches: "إجمالي الفروع",
    onlineOutlets: "الفروع النشطة",
    avgCapacity: "متوسط السعة الاستيعابية",
    branchName: "اسم الفرع",
    providerName: "مزود الخدمة / الصالون",
    location: "الموقع / المدينة",
    status: "الحالة التشغيلية",
    actions: "الإجراءات",
    active: "نشط حالياً",
    inactive: "صيانة / مغلق"
  }
};

export default function AdminBranches() {
  const [branches, setBranches] = useState<any[]>([]);
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
    setBranches([
      { id: 1, nameEn: "Olaya Main Branch", nameAr: "فرع العليا الرئيسي", provider: "Sara Salon & Spa", city: "Riyadh", active: true },
      { id: 2, nameEn: "Corniche Suite", nameAr: "جناح الكورنيش", provider: "Jeddah Grooming Palace", city: "Jeddah", active: true },
      { id: 3, nameEn: "Al-Malqa Suite", nameAr: "أجنحة الملقا الفاخرة", provider: "Elite Grooming", city: "Riyadh", active: false }
    ]);
  }, []);

  const handleToggle = (id: number) => {
    setBranches(prev => prev.map(b => b.id === id ? { ...b, active: !b.active } : b));
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalBranches}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{branches.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.onlineOutlets}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{branches.filter(b => b.active).length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.avgCapacity}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">14 Chairs</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.branchName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.location}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {branches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{lang === "ar" ? b.nameAr : b.nameEn}</td>
                  <td className="py-4 px-6 font-bold text-gray-700">{b.provider}</td>
                  <td className="py-4 px-6">{b.city}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      b.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{b.active ? t.active : t.inactive}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(b.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">Toggle</button>
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
