"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Taxes & Platform Fees",
    subtitle: "Configure ZATCA standard VAT rates, municipality charges, and system commissions.",
    activeVat: "VAT Rate (ZATCA)",
    municipalityFee: "Municipality Fee",
    platFee: "Baseline Platform Fee",
    taxName: "Tax Rule / Fee",
    defaultRate: "Default Percentage",
    status: "State",
    actions: "Actions",
    active: "ACTIVE",
    inactive: "INACTIVE",
    saveBtn: "Save Settings"
  },
  ar: {
    title: "الضرائب والرسوم المالية",
    subtitle: "تهيئة نسب ضريبة القيمة المضافة ZATCA، الرسوم البلدية، والرسوم التشغيلية للمنصة.",
    activeVat: "ضريبة القيمة المضافة (ZATCA)",
    municipalityFee: "الرسوم البلدية",
    platFee: "رسوم الخدمة للمنصة",
    taxName: "الضريبة / الرسم المالي",
    defaultRate: "النسبة الافتراضية",
    status: "الحالة",
    actions: "الإجراءات",
    active: "نشط",
    inactive: "معطل",
    saveBtn: "حفظ الإعدادات"
  }
};

export default function AdminTaxes() {
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
    setTimeout(() => setSuccess(translations[lang].saveBtn + " completed successfully!"), 300);
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeVat}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={15} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">%</span>
          </div>
        </div>

        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.municipalityFee}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={2.5} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">%</span>
          </div>
        </div>

        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.platFee}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={5} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">SAR</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className={`flex ${isRTL ? "justify-start" : "justify-end"} pt-4`}>
          <button onClick={handleSave} className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition">{t.saveBtn}</button>
        </div>
      </div>
    </div>
  );
}
