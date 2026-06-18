"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Roles & System Permissions",
    subtitle: "Define authorization matrices, secure console operations, and restrict access tags.",
    roleName: "Role / Tag",
    activePermissions: "Active Permissions Count",
    restrictedScopes: "Restricted Scopes",
    actions: "Actions",
    configBtn: "Configure Permissions",
    successMsg: "Permission matrix saved successfully!"
  },
  ar: {
    title: "الأدوار وصلاحيات النظام",
    subtitle: "تحديد أدوار المجموعات والمسؤولين، إدارة كشوفات الصلاحيات للتحكم بالبوابة الأمنية.",
    roleName: "الدور / الصفة",
    activePermissions: "الصلاحيات المفعلة",
    restrictedScopes: "المجالات المقيدة والمحظورة",
    actions: "الإجراءات",
    configBtn: "تعديل الصلاحيات",
    successMsg: "تم حفظ جدول الصلاحيات بنجاح!"
  }
};

export default function AdminRoles() {
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

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.roleName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.activePermissions}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.restrictedScopes}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {[
                { name: "Super Administrator", count: 42, scopes: "None (Full Root Root Bypass)" },
                { name: "Financial Auditor", count: 12, scopes: "system-logs:write, settings:write" },
                { name: "Support Agent", count: 8, scopes: "ledger:*, settings:*, api:*" }
              ].map((role, idx) => (
                <tr key={idx} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{role.name}</td>
                  <td className="py-4 px-6 font-serif font-black">{role.count} Scopes</td>
                  <td className="py-4 px-6 font-mono text-red-700 text-[10px]">{role.scopes}</td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={handleUpdate} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.configBtn}</button>
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
