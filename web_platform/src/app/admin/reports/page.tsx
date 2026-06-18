"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Financial Reports & Exports",
    subtitle: "Generate and download platform audits, VAT reports, and provider payouts logs.",
    bookingsLedger: "Bookings Ledger Sheet",
    vatLedger: "VAT & ZATCA Audit XML/PDF",
    providerSummary: "Provider Payout Summaries",
    generateBtn: "Export Report (CSV)",
    downloadBtn: "Download PDF",
    statusReady: "READY",
    statusGenerating: "GENERATING..."
  },
  ar: {
    title: "التقارير المالية والتصدير",
    subtitle: "تصدير وتحميل الكشوفات المالية للحجوزات، إقرارات ضريبة القيمة المضافة، وملخصات العمولات.",
    bookingsLedger: "كشف معاملات سجل الحجوزات",
    vatLedger: "سجل ضريبة القيمة المضافة ZATCA",
    providerSummary: "ملخص مستحقات مقدمي الخدمة",
    generateBtn: "تصدير ملف (CSV)",
    downloadBtn: "تحميل التقرير (PDF)",
    statusReady: "جاهز للتحميل",
    statusGenerating: "جاري المعالجة..."
  }
};

export default function AdminReports() {
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

  const handleExport = (report: string) => {
    setSuccess("");
    setTimeout(() => setSuccess(`${report} export initiated! check downloads folder.`), 300);
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
        {[
          { title: t.bookingsLedger, ref: "bookings_ledger_Q2" },
          { title: t.vatLedger, ref: "zatca_vat_export" },
          { title: t.providerSummary, ref: "provider_settlements" }
        ].map((item, idx) => (
          <div key={idx} className={`${cardBase} flex flex-col justify-between h-52`}>
            <div>
              <span className="bg-[#ECFDF3] text-[#16A34A] text-[8px] font-black uppercase px-2 py-0.5 rounded inline-block tracking-wider">{t.statusReady}</span>
              <h3 className="font-bold text-gray-900 text-xs mt-3 leading-snug">{item.title}</h3>
            </div>
            <div className="space-y-2 pt-4">
              <button onClick={() => handleExport(item.ref)} className="w-full py-2 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.generateBtn}</button>
              <button onClick={() => handleExport(item.ref)} className="w-full py-2 bg-white text-gray-700 border border-[#ECECEC] rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-50 transition">{t.downloadBtn}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
