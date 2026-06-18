"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Developer API & Integrations",
    subtitle: "Authorize client applications, inspect credentials, and audit active client authorizations.",
    totalClients: "Authorized Applications",
    activeRequests: "API Calls (24h)",
    clientId: "Client ID",
    company: "Company Name",
    status: "State",
    actions: "Actions",
    approved: "AUTHORIZED",
    revoked: "REVOKED",
    toggleBtn: "Toggle Auth"
  },
  ar: {
    title: "بوابة المطورين والربط الخارجي",
    subtitle: "اعتماد التطبيقات والشركات الخارجية، إصدار مفاتيح الربط البرمجي، وتدقيق استخدام الـ API.",
    totalClients: "التطبيقات المعتمدة",
    activeRequests: "طلبات الـ API (آخر 24 ساعة)",
    clientId: "معرّف المطور (Client ID)",
    company: "اسم الشركة / التطبيق",
    status: "حالة الترخيص",
    actions: "الإجراءات",
    approved: "نشط / معتمد",
    revoked: "ملغي الترخيص",
    toggleBtn: "تعديل الترخيص"
  }
};

export default function AdminIntegrations() {
  const [clients, setClients] = useState<any[]>([]);
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
    setClients([
      { id: "cli_892F4A1B", name: "Riyadh Salons aggregator", active: true },
      { id: "cli_892F4A1C", name: "HyperPay Settlement engine", active: true },
      { id: "cli_892F4A1D", name: "Abusive user detector mock", active: false }
    ]);
  }, []);

  const handleToggle = (id: string) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalClients}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{clients.length} Apps</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeRequests}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">42,850 Requests</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">Latency (99th)</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">142ms</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.clientId}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.company}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-mono font-bold text-gray-900">{c.id}</td>
                  <td className="py-4 px-6 font-bold">{c.name}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      c.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{c.active ? t.approved : t.revoked}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(c.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.toggleBtn}</button>
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
