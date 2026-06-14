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

  const t = translations[lang];

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

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className={isRTL ? "text-right" : "text-left"}>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">{t.title}</h2>
        <p className="text-sm text-stone-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className={`bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

      {/* Audit Table */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-stone-200 text-stone-400 bg-stone-50/50 uppercase tracking-wider font-extrabold text-[10px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : ""}`}>{t.businessName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : ""}`}>{t.verticalScope}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : ""}`}>{t.verificationStatus}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : ""}`}>{t.commissionRate}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : ""}`}>{t.tradeLicense}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-stone-100 font-medium text-stone-700 ${isRTL ? "text-right" : ""}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-stone-400">{t.loading}</td>
                </tr>
              ) : (
                providers.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50 transition">
                    <td className="py-4 px-6">
                      <p className="font-bold text-stone-900">{item.business_name_en}</p>
                      <p className="text-[9px] text-stone-400 font-semibold mt-0.5">UUID: {item.id}</p>
                    </td>
                    <td className="py-4 px-6 capitalize">
                      {item.type === "salon" ? t.salon : t.freelancer}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border ${
                        item.is_verified 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border-amber-200"
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
                          className="w-14 bg-stone-50 border border-stone-200 rounded px-1.5 py-1 text-center font-bold text-stone-900 outline-none focus:border-stone-400"
                        />
                        <span className="font-bold text-stone-400">%</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <a 
                        href={item.trade_license_url || "#"} 
                        target="_blank" 
                        rel="noreferrer"
                        className={`text-stone-400 hover:text-stone-900 transition flex items-center gap-1 font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>License.pdf</span>
                      </a>
                    </td>
                    <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                      <button
                        onClick={() => handleToggleVerification(item.id, item.is_verified)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                          item.is_verified 
                            ? "bg-stone-100 hover:bg-stone-200 text-stone-700" 
                            : "bg-stone-900 hover:bg-stone-800 text-white"
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
