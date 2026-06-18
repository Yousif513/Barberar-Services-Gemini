"use client";
import React, { useState, useEffect } from "react";

const translations = {
  en: {
    title: "Super Admin Team Management",
    subtitle: "Configure administration profiles, system logs access, and staff roles allocation.",
    totalMembers: "Total Admin Staff",
    activeAdmin: "Active Admins",
    staffName: "Staff Member",
    email: "Email Address",
    role: "System Role",
    status: "State",
    actions: "Actions",
    active: "ACTIVE",
    suspended: "SUSPENDED",
    toggleBtn: "Toggle Status",
    successMsg: "Staff member status updated successfully!"
  },
  ar: {
    title: "إدارة فريق المشرفين والنظام",
    subtitle: "إدارة حسابات طاقم الإدارة العام، تحديد صلاحيات الموظفين، ومراقبة حسابات النظام.",
    totalMembers: "إجمالي المشرفين",
    activeAdmin: "نشط حالياً",
    staffName: "الموظف",
    email: "البريد الإلكتروني",
    role: "الدور في النظام",
    status: "حالة الحساب",
    actions: "الإجراءات",
    active: "نشط",
    suspended: "موقوف",
    toggleBtn: "تعديل الصلاحية",
    successMsg: "تم تحديث حالة العضو بنجاح!"
  }
};

export default function AdminTeams() {
  const [members, setMembers] = useState<any[]>([]);
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

  useEffect(() => {
    setMembers([
      { id: 1, name: "يوسف الحربي", email: "yousef@primora.sa", role: "Super Admin", is_active: true },
      { id: 2, name: "Amal Salem", email: "amal@primora.sa", role: "Financial Editor", is_active: true },
      { id: 3, name: "خالد بن محمد", email: "khaled@primora.sa", role: "Support Analyst", is_active: false }
    ]);
  }, []);

  const handleToggle = (id: number) => {
    setSuccess("");
    setMembers(prev => prev.map(m => m.id === id ? { ...m, is_active: !m.is_active } : m));
    setSuccess(translations[lang].successMsg);
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
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalMembers}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{members.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeAdmin}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{members.filter(m => m.is_active).length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">Access Gateways</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">Active</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.staffName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.email}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.role}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{m.name}</td>
                  <td className="py-4 px-6 font-semibold">{m.email}</td>
                  <td className="py-4 px-6 font-bold">{m.role}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      m.is_active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{m.is_active ? t.active : t.suspended}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(m.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.toggleBtn}</button>
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
