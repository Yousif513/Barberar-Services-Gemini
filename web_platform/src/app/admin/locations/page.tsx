"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Zoning & Operating Mappings",
    subtitle: "Configure district zones parameters, geofenced boundaries, and delivery radius metrics.",
    totalZones: "Total Zones",
    activeRadius: "Active Radius Limit",
    districtName: "District Name",
    status: "State",
    actions: "Actions",
    active: "ACTIVE",
    inactive: "INACTIVE"
  },
  ar: {
    title: "المواقع والمناطق الجغرافية",
    subtitle: "تهيئة حدود التغطية الجغرافية للأحياء، النطاق التشغيلي، وحدود التوصيل.",
    totalZones: "إجمالي المناطق",
    activeRadius: "نطاق التوصيل الأقصى",
    districtName: "اسم الحي",
    status: "حالة التغطية",
    actions: "الإجراءات",
    active: "مغطى حالياً",
    inactive: "غير نشط"
  }
};

export default function AdminLocations() {
  const [zones, setZones] = useState<any[]>([]);
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
    setZones([
      { id: 1, nameEn: "Al-Olaya District", nameAr: "حي العليا", active: true },
      { id: 2, nameEn: "Al-Malqa District", nameAr: "حي الملقا", active: true },
      { id: 3, nameEn: "Al-Sulaimaniyah", nameAr: "حي السليمانية", active: false }
    ]);
  }, []);

  const handleToggle = (id: number) => {
    setZones(prev => prev.map(z => z.id === id ? { ...z, active: !z.active } : z));
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalZones}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{zones.length} Zones</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeRadius}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">25 KM</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">Operating Cities</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">Riyadh, Jeddah</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.districtName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {zones.map(z => (
                <tr key={z.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{lang === "ar" ? z.nameAr : z.nameEn}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      z.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{z.active ? t.active : t.inactive}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(z.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">Toggle</button>
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
