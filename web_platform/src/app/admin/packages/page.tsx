"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Service Packages & Passes",
    subtitle: "Manage bundled discount offers, wellness passes, and multi-session vouchers.",
    loading: "Loading wellness packages...",
    totalPackages: "Total Packages",
    activeVouchers: "Active Sold Passes",
    redeemedRatio: "Total Redemptions",
    packageName: "Package Name",
    providerName: "Provider / Salon",
    sessionCount: "Sessions Included",
    packagePrice: "Package Price",
    status: "Status",
    active: "Active",
    inactive: "Inactive",
    verifyBtn: "Toggle Status",
    successMsg: "Package status updated successfully!",
    errorLoad: "Failed to load packages from database.",
    noPackages: "No service packages found in database."
  },
  ar: {
    title: "باقات الخدمات وعروض التوفير",
    subtitle: "إدارة باقات الخدمات المجمعة، بطاقات جلسات العناية المتعددة، وقسائم الخصم.",
    loading: "جاري تحميل الباقات والاشتراكات...",
    totalPackages: "إجمالي الباقات",
    activeVouchers: "البطاقات المباعة النشطة",
    redeemedRatio: "إجمالي الجلسات المستخدمة",
    packageName: "اسم الباقة",
    providerName: "مقدم الخدمة / الصالون",
    sessionCount: "عدد الجلسات المشمولة",
    packagePrice: "سعر الباقة",
    status: "الحالة",
    active: "نشط",
    inactive: "غير نشط",
    verifyBtn: "تعديل الحالة",
    successMsg: "تم تحديث حالة الباقة بنجاح!",
    errorLoad: "تعذر تحميل الباقات من قاعدة البيانات.",
    noPackages: "لا توجد باقات خدمات مسجلة في قاعدة البيانات."
  }
};

export default function AdminPackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [activeVouchersCount, setActiveVouchersCount] = useState<number>(0);
  const [totalRedemptionsCount, setTotalRedemptionsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    loadPackagesData();
  }, []);

  async function loadPackagesData() {
    try {
      setLoading(true);
      setError("");

      const { data: pkgData, error: pkgErr } = await supabase
        .from("packages")
        .select(`
          id,
          name_en,
          name_ar,
          description_en,
          description_ar,
          price,
          session_count,
          expires_in_days,
          is_active,
          created_at,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("created_at", { ascending: false });

      if (pkgErr) throw pkgErr;
      setPackages(pkgData || []);

      // Count active sold vouchers and redemptions
      const { data: userPkgData } = await supabase
        .from("user_packages")
        .select("id, remaining_sessions");

      if (userPkgData) {
        setActiveVouchersCount(userPkgData.filter(u => u.remaining_sessions > 0).length);
      }

      const { count: redemptionsCount } = await supabase
        .from("package_redemptions")
        .select("id", { count: "exact", head: true });

      setTotalRedemptionsCount(redemptionsCount || 0);
    } catch (err: any) {
      console.error("Error loading admin packages:", err.message);
      setError(translations[lang].errorLoad);
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      setSuccess("");
      setError("");

      const { error: updateErr } = await supabase
        .from("packages")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (updateErr) throw updateErr;

      setPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
      setSuccess(translations[lang].successMsg);
    } catch (err: any) {
      console.error("Error toggling package:", err.message);
      setError(err.message || "Failed to update package status.");
    }
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}
      {error && <div className="bg-[#FEF3F2] border border-[#FECDCA] text-[#B91C1C] text-xs rounded-xl p-4 font-bold">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalPackages}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{packages.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeVouchers}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{activeVouchersCount}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.redeemedRatio}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">{totalRedemptionsCount}</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        {loading ? (
          <div className="py-16 text-center text-xs text-gray-400 font-bold">{t.loading}</div>
        ) : packages.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-500 font-bold">{t.noPackages}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packageName}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerName}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.sessionCount}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packagePrice}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                  <th className="py-4 px-6 text-right"></th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                {packages.map(p => {
                  const pkgName = lang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar;
                  const provName = lang === "ar" ? p.providers?.business_name_ar || p.providers?.business_name_en : p.providers?.business_name_en || p.providers?.business_name_ar;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/40 transition duration-150">
                      <td className="py-4 px-6 font-bold text-gray-900">{pkgName}</td>
                      <td className="py-4 px-6 text-gray-600 font-medium">{provName || "—"}</td>
                      <td className="py-4 px-6">{p.session_count}</td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">{p.price} {lang === "ar" ? "ريال" : "SAR"}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${p.is_active ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FEF3F2] text-[#B91C1C]"}`}>
                          {p.is_active ? t.active : t.inactive}
                        </span>
                      </td>
                      <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                        <button
                          onClick={() => handleToggle(p.id, p.is_active)}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition"
                        >
                          {t.verifyBtn}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
