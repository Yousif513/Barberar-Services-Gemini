"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Rooms & Physical Resources",
    subtitle: "Manage physical lounge limits, therapy rooms, and chair capacities.",
    totalRooms: "Total Rooms",
    avgCapacity: "Capacity Utilization",
    activeEquip: "Active Chairs",
    roomName: "Room / Resource",
    branchName: "Branch Outlet",
    capacityLimit: "Chair Capacity",
    utilization: "Utilization Rate",
    actions: "Actions"
  },
  ar: {
    title: "الغرف والموارد المادية",
    subtitle: "إدارة الطاقة الاستيعابية للغرف العلاجية، كراسي التزيين، وصالات الانتظار.",
    totalRooms: "إجمالي الغرف والموارد",
    avgCapacity: "معدل استغلال الموارد",
    activeEquip: "الكراسي النشطة",
    roomName: "الغرفة / المورد المادي",
    branchName: "الفرع",
    capacityLimit: "السعة الاستيعابية",
    utilization: "نسبة الإشغال",
    actions: "الإجراءات"
  }
};

export default function AdminRooms() {
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalRooms}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">24 Rooms</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.avgCapacity}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">68%</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeEquip}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">148 Chairs</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.roomName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.branchName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.capacityLimit}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.utilization}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {[
                { name: lang === "ar" ? "غرفة مساج حار 1" : "Massage Suite A", branch: "Olaya Main Branch", chairs: 2, util: "75%" },
                { name: lang === "ar" ? "منطقة تصفيف الشعر الرئيسية" : "Main Styling Area", branch: "Corniche Suite", chairs: 8, util: "62%" },
                { name: lang === "ar" ? "غرفة عناية بالبشرة" : "Facial Care Lounge", branch: "Al-Malqa Suite", chairs: 3, util: "48%" }
              ].map((r, idx) => (
                <tr key={idx} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{r.name}</td>
                  <td className="py-4 px-6">{r.branch}</td>
                  <td className="py-4 px-6 font-serif font-black">{r.chairs} Chairs</td>
                  <td className="py-4 px-6 font-serif font-black text-amber-700">{r.util}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
