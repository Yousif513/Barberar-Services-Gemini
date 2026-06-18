"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Provider Registry & Audits",
    subtitle: "Audit trade credentials, toggle verified badges, and customize commission parameters.",
    loading: "Loading provider records...",
    success: "Success",
    error: "Error",
    businessName: "Business Name",
    verticalScope: "Vertical Scope",
    verificationStatus: "Verification Status",
    commissionRate: "Commission Rate",
    tradeLicense: "Trade License",
    actions: "Actions",
    verified: "Verified",
    pendingAudit: "Pending Audit",
    revoke: "Revoke",
    verify: "Verify",
    successMsg: "Verification status updated successfully!",
    errorMsg: "Failed to toggle provider verification status.",
    successComm: "Commission percentage updated!",
    errorComm: "Failed to update commission rate.",
    salon: "Salon / Venue",
    freelancer: "Freelancer / Artist"
  },
  ar: {
    title: "سجل ومدقّق مزودي الخدمة",
    subtitle: "مراجعة أوراق السجلات التجارية لمقدمي الخدمة، تفعيل شارة الحساب الموثق، وتعديل نسب العمولات.",
    loading: "جاري تحميل سجلات مقدمي الخدمة...",
    success: "نجاح",
    error: "خطأ",
    businessName: "اسم النشاط التجاري",
    verticalScope: "الفئة / النوع",
    verificationStatus: "حالة التوثيق",
    commissionRate: "نسبة عمولة المنصة",
    tradeLicense: "السجل التجاري",
    actions: "الإجراءات",
    verified: "موثق",
    pendingAudit: "قيد المراجعة",
    revoke: "إلغاء التوثيق",
    verify: "توثيق الحساب",
    successMsg: "تم تحديث حالة توثيق الحساب بنجاح!",
    errorMsg: "فشل تحديث حالة توثيق مزود الخدمة.",
    successComm: "تم تحديث نسبة العمولة بنجاح!",
    errorComm: "فشل تحديث نسبة العمولة.",
    salon: "صالون / مركز",
    freelancer: "مستقل / أخصائي"
  }
};

export default function AdminProviders() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = {
    ...translations[lang],
    totalProviders: lang === "ar" ? "إجمالي المزودين" : "Total Providers",
    verifiedBusinesses: lang === "ar" ? "الأنشطة الموثقة" : "Verified Businesses",
    avgCommission: lang === "ar" ? "متوسط نسبة العمولة" : "Average Commission",
  };

  const loadProviders = async () => {
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from("providers")
        .select("id, business_name_en, type, is_verified, commission_percentage, trade_license_url, created_at")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setProviders(data);
      } else {
        // Fallback mock providers
        setProviders([
          { id: "p-mock-1", business_name_en: "Elite Grooming Salon", type: "salon", is_verified: true, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-2", business_name_en: "Sara Beauty Salon & Spa", type: "salon", is_verified: true, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-3", business_name_en: "Jeddah Grooming Palace", type: "salon", is_verified: false, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() },
          { id: "p-mock-4", business_name_en: "Maha Stylist & Artist", type: "freelancer", is_verified: false, commission_percentage: 15.00, trade_license_url: "#", created_at: new Date().toISOString() }
        ]);
      }
    } catch (err: any) {
      setError(t.errorMsg);
      console.warn("Offline fallback registry notice:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, [lang]);

  const handleToggleVerification = async (id: string, currentStatus: boolean) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("p-mock-")) {
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, is_verified: !currentStatus } : p))
        );
        setSuccess(t.successMsg);
        return;
      }

      const { error: patchError } = await supabase
        .from("providers")
        .update({ is_verified: !currentStatus })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(t.successMsg);
      loadProviders();
    } catch (err: any) {
      setError(t.errorMsg);
      console.warn("Offline verification update notice:", err);
    }
  };

  const handleUpdateCommission = async (id: string, newRate: number) => {
    try {
      setSuccess("");
      setError("");

      if (id.startsWith("p-mock-")) {
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, commission_percentage: newRate } : p))
        );
        setSuccess(t.successComm);
        return;
      }

      const { error: patchError } = await supabase
        .from("providers")
        .update({ commission_percentage: newRate })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(t.successComm);
      loadProviders();
    } catch (err: any) {
      setError(t.errorComm);
      console.warn("Offline commission update notice:", err);
    }
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Calculate summary metrics
  const totalProviders = providers.length;
  const verifiedCount = providers.filter(p => p.is_verified).length;
  const avgCommission = providers.length
    ? (providers.reduce((sum, p) => sum + (parseFloat(p.commission_percentage) || 0), 0) / providers.length)
    : 0;

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {t.title}
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.subtitle}
          </p>
        </div>
      </div>

      {success && (
        <div className={`bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Total Providers */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalProviders}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
              #
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalProviders.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        {/* KPI 2: Verified Businesses */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.verifiedBusinesses}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-emerald-700 font-serif text-xs font-black">
              ✓
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">
            {verifiedCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>

        {/* KPI 3: Average Commission */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.avgCommission}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#101828]">
              <span className="text-amber-700 font-serif text-xs font-black">%</span>
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {avgCommission.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </strong>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.businessName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.verticalScope}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.verificationStatus}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.commissionRate}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.tradeLicense}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : (
                providers.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/40 transition duration-150">
                    <td className="py-4 px-6">
                      <p className="font-bold text-gray-900">{item.business_name_en}</p>
                      <p className="text-[9px] text-gray-400 font-semibold mt-1">UUID: {item.id.substring(0, 8)}...</p>
                    </td>
                    <td className="py-4 px-6 capitalize">
                      {item.type === "salon" ? t.salon : t.freelancer}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                        item.is_verified 
                          ? "bg-[#ECFDF3] text-[#16A34A]" 
                          : "bg-[#FFFAEB] text-[#F59E0B]"
                      }`}>
                        {item.is_verified ? t.verified : t.pendingAudit}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="number"
                          value={item.commission_percentage}
                          onChange={(e) => handleUpdateCommission(item.id, parseFloat(e.target.value) || 0)}
                          className="w-14 bg-gray-50 border border-[#ECECEC] rounded-lg px-2 py-1 text-center font-bold text-gray-900 outline-none focus:border-[#D1AF47] transition duration-150"
                        />
                        <span className="font-bold text-gray-400">%</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <a 
                        href={item.trade_license_url || "#"} 
                        target="_blank" 
                        rel="noreferrer"
                        className={`text-gray-400 hover:text-gray-900 transition duration-150 flex items-center gap-1 font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}
                      >
                        <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>License.pdf</span>
                      </a>
                    </td>
                    <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                      <button
                        onClick={() => handleToggleVerification(item.id, item.is_verified)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border ${
                          item.is_verified 
                            ? "bg-white hover:bg-gray-50 text-gray-700 border-[#ECECEC]" 
                            : "bg-gray-900 hover:bg-gray-800 text-white border-transparent"
                        }`}
                      >
                        {item.is_verified ? t.revoke : t.verify}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
