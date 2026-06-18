"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Global Platform Settings",
    subtitle: "Configure platform metadata, support emails, and general maintenance modes.",
    platName: "Platform Brand Name",
    supportEmail: "Support Center Email",
    maintenance: "Maintenance Mode",
    activeStatus: "Status: Online",
    saveBtn: "Save Preferences",
    successMsg: "Global settings successfully updated!"
  },
  ar: {
    title: "إعدادات المنصة العامة",
    subtitle: "تعديل العلامة التجارية للمنصة، البريد الإلكتروني للمساعدة، وتعديل حالات الصيانة.",
    platName: "اسم العلامة التجارية للمنصة",
    supportEmail: "بريد الدعم والمساعدة الفنية",
    maintenance: "حالة وضع الصيانة",
    activeStatus: "حالة المنصة: نشطة حالياً",
    saveBtn: "حفظ الإعدادات",
    successMsg: "تم تحديث إعدادات المنصة بنجاح!"
  }
};

export default function AdminSettings() {
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

  const handleSave = () => {
    setSuccess("");
    setTimeout(() => setSuccess(translations[lang].successMsg), 100);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className={`${cardBase} max-w-2xl space-y-5`}>
        <div className="space-y-1">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.platName}</label>
          <input type="text" defaultValue="PRIMORA" className={`w-full bg-gray-50 border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-gray-900 outline-none focus:border-[#D1AF47] ${isRTL ? "text-right" : "text-left"}`} />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.supportEmail}</label>
          <input type="email" defaultValue="support@primora.sa" className={`w-full bg-gray-50 border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-gray-900 outline-none focus:border-[#D1AF47] ${isRTL ? "text-right" : "text-left"}`} />
        </div>

        <div className={`flex items-center justify-between py-2 border-t border-[#F5F5F5] ${flip}`}>
          <div>
            <span className="text-xs font-bold text-gray-950 block">{t.maintenance}</span>
            <span className="text-[10px] text-gray-400 font-semibold mt-0.5 block">{t.activeStatus}</span>
          </div>
          <div className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D1AF47]" />
          </div>
        </div>

        <div className={`flex ${isRTL ? "justify-start" : "justify-end"} pt-2`}>
          <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition">{t.saveBtn}</button>
        </div>
      </div>
    </div>
  );
}
