"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "System Logs & Metrics",
    subtitle: "Monitor server memory states, CPU allocations, and container network metrics.",
    cpuUsage: "CPU Usage",
    memUsage: "Memory Usage",
    networkIo: "Network I/O",
    logTime: "Timestamp",
    logType: "Log Type",
    message: "Message Description",
    successMsg: "System logs successfully cleared!"
  },
  ar: {
    title: "سجلات النظام ومؤشرات الأداء",
    subtitle: "مراقبة مستويات استهلاك المعالج، الذاكرة العشوائية للخوادم، وحجم تدفق شبكة البيانات حياً.",
    cpuUsage: "استهلاك المعالج CPU",
    memUsage: "استهلاك الذاكرة RAM",
    networkIo: "شبكة البيانات الواردة/الخارجية",
    logTime: "الطابع الزمني",
    logType: "النوع",
    message: "وصف رسالة النظام",
    successMsg: "تم مسح سجلات النظام بنجاح!"
  }
};

export default function AdminSystemLogs() {
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

  const handleClear = () => {
    setSuccess("");
    setTimeout(() => setSuccess(translations[lang].successMsg), 100);
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.cpuUsage}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">14.8%</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.memUsage}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">4.2 GB / 16 GB</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.networkIo}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">12 MB/s</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.logTime}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.logType}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.message}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-mono font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {[
                { time: "2026-06-18 14:35:20", type: "INFO", msg: "Supabase connection verified active." },
                { time: "2026-06-18 14:32:15", type: "WARN", msg: "Slow queries detected in bookings index lookup." },
                { time: "2026-06-18 14:28:10", type: "ERROR", msg: "SMS dispatch gateway timed out (HyperSMS)." }
              ].map((log, idx) => (
                <tr key={idx} className="hover:bg-gray-50/40 transition duration-150 text-[10px]">
                  <td className="py-4 px-6 text-gray-400">{log.time}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase inline-block ${
                      log.type === "INFO" ? "bg-[#ECFDF3] text-[#16A34A]" : log.type === "WARN" ? "bg-[#FFFAEB] text-[#F59E0B]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{log.type}</span>
                  </td>
                  <td className="py-4 px-6 text-gray-900 font-semibold">{log.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
