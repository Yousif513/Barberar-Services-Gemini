"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Commission Parameters",
    subtitle: "Override baseline platform commission shares and configure customized tier rules.",
    baseCommission: "Baseline Global Commission",
    tierA: "VIP Tier (> 50k SAR)",
    tierB: "Standard Tier (< 10k SAR)",
    verticalName: "Vertical / Provider Type",
    rate: "Default Percentage",
    action: "Update Configuration",
    successMsg: "Commission overrides configured successfully!"
  },
  ar: {
    title: "أبعاد ونسب العمولات",
    subtitle: "تعديل نسب عمولات المنصة الافتراضية، وتهيئة مصفوفة العمولات المخصصة للشركاء.",
    baseCommission: "نسبة عمولة المنصة العامة",
    tierA: "فئة كبار الشركاء (> 50k ريال)",
    tierB: "الفئة القياسية (< 10k ريال)",
    verticalName: "نوع النشاط / مزود الخدمة",
    rate: "النسبة الافتراضية",
    action: "تحديث الإعدادات",
    successMsg: "تم تحديث أبعاد نسب العمولات بنجاح!"
  }
};

export default function AdminCommissions() {
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

  const handleUpdate = () => {
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.baseCommission}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={15} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">%</span>
          </div>
        </div>

        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.tierA}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={10} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">%</span>
          </div>
        </div>

        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.tierB}</span>
          <div className={`flex items-center gap-2 mt-4 ${flip}`}>
            <input type="number" defaultValue={18} className="w-20 bg-gray-50 border border-[#ECECEC] rounded-lg p-2 text-center font-serif font-black text-gray-900 text-lg outline-none focus:border-[#D1AF47]" />
            <span className="font-serif font-black text-gray-400 text-lg">%</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
        <div className="space-y-4">
          {[
            { name: lang === "ar" ? "صالونات التجميل والصالونات الفاخرة" : "Premium Beauty Salons", rate: 15 },
            { name: lang === "ar" ? "أخصائيو المساج والاسترخاء المستقلون" : "Independent Spa Therapists", rate: 12 },
            { name: lang === "ar" ? "علاجات العناية بالوجه والجلد" : "Facial Skincare Clinics", rate: 14 }
          ].map((v, i) => (
            <div key={i} className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 py-2 border-b border-[#F5F5F5] last:border-0 ${flip}`}>
              <span className="font-bold text-gray-900 text-xs">{v.name}</span>
              <div className={`flex items-center gap-2 ${flip}`}>
                <input type="number" defaultValue={v.rate} className="w-16 bg-gray-50 border border-[#ECECEC] rounded-lg p-1.5 text-center font-bold text-gray-900 outline-none focus:border-[#D1AF47]" />
                <span className="font-bold text-gray-400 text-xs">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`flex ${isRTL ? "justify-start" : "justify-end"} pt-4`}>
          <button onClick={handleUpdate} className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition">{t.action}</button>
        </div>
      </div>
    </div>
  );
}
