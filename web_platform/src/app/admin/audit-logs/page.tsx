"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Operations Audit Logs",
    subtitle: "Security logging mapping all console overrides, settings changes, and admin auth actions.",
    totalAudits: "Total Audits Logged",
    securityAlerts: "Critical Security Alerts",
    adminActions: "Admin Actions",
    time: "Timestamp",
    admin: "Administrator",
    action: "Action Override",
    resource: "Resource ID"
  },
  ar: {
    title: "سجلات التدقيق العملياتي",
    subtitle: "سجلات أمان تتبع وحفظ كافة تعديلات النظام، تغييرات الإعدادات، وعمليات مشرفي البوابة.",
    totalAudits: "إجمالي السجلات المسجلة",
    securityAlerts: "تنبيهات أمنية حرجة",
    adminActions: "إجراءات المشرفين",
    time: "الطابع الزمني",
    admin: "المشرف المسؤول",
    action: "الإجراء المتخذ",
    resource: "رقم المورد"
  }
};

export default function AdminAuditLogs() {
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalAudits}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">14,850 Logs</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.securityAlerts}</span>
          <strong className="block text-2xl font-serif font-black text-red-700 mt-2.5">0 Alerts</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.adminActions}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">850 Actions</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.time}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.admin}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.action}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.resource}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {[
                { time: "2026-06-18 14:32:15", admin: "yousef@primora.sa", action: "Toggle verification status", res: "p-mock-3" },
                { time: "2026-06-18 14:15:20", admin: "amal@primora.sa", action: "Override commission percentage", res: "p-mock-1" },
                { time: "2026-06-18 13:58:10", admin: "yousef@primora.sa", action: "Release Provider Payout", res: "txn_89A2B" }
              ].map((audit, idx) => (
                <tr key={idx} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 text-gray-400 font-mono text-[10px]">{audit.time}</td>
                  <td className="py-4 px-6 font-bold text-gray-900">{audit.admin}</td>
                  <td className="py-4 px-6 font-bold">{audit.action}</td>
                  <td className="py-4 px-6 font-mono text-gray-400 text-[10px]">{audit.res}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
