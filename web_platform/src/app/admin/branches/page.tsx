"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Branches & Outlets Matrix",
    subtitle: "Monitor provider outlet locations, active schedules, and verification statuses.",
    totalBranches: "Total Branches",
    onlineOutlets: "Online Outlets",
    avgCapacity: "Average Service Radius",
    branchName: "Branch Name",
    providerName: "Provider / Salon",
    location: "Location / City",
    status: "State",
    actions: "Actions",
    active: "ONLINE",
    inactive: "MAINTENANCE",
    loading: "Loading branch matrix...",
    noBranches: "No branches found yet.",
    errorLoad: "Failed to load branches.",
    errorToggle: "Failed to update branch state.",
    toggle: "Toggle"
  },
  ar: {
    title: "سجل وإدارة فروع الشركاء",
    subtitle: "متابعة مواقع فروع مقدمي الخدمة، جداول المواعيد النشطة، وحالتها التشغيلية.",
    totalBranches: "إجمالي الفروع",
    onlineOutlets: "الفروع النشطة",
    avgCapacity: "متوسط نطاق الخدمة",
    branchName: "اسم الفرع",
    providerName: "مزود الخدمة / الصالون",
    location: "الموقع / المدينة",
    status: "الحالة التشغيلية",
    actions: "الإجراءات",
    active: "نشط حاليا",
    inactive: "صيانة / مغلق",
    loading: "جاري تحميل الفروع...",
    noBranches: "لا توجد فروع بعد.",
    errorLoad: "تعذر تحميل الفروع.",
    errorToggle: "تعذر تحديث حالة الفرع.",
    toggle: "تبديل"
  }
};

export default function AdminBranches() {
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const averageRadius = branches.length
    ? branches.reduce((sum, branch) => sum + Number(branch.radius || 0), 0) / branches.length
    : 0;

  const loadBranches = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbError } = await supabase
        .from("branches")
        .select(`
          id,
          name_en,
          name_ar,
          address_text_en,
          address_text_ar,
          geofence_radius_km,
          is_active,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      setBranches((data || []).map((branch: any) => {
        const provider = Array.isArray(branch.providers) ? branch.providers[0] : branch.providers;
        return {
          id: branch.id,
          nameEn: branch.name_en,
          nameAr: branch.name_ar,
          providerEn: provider?.business_name_en || "-",
          providerAr: provider?.business_name_ar || provider?.business_name_en || "-",
          locationEn: branch.address_text_en,
          locationAr: branch.address_text_ar || branch.address_text_en,
          radius: Number(branch.geofence_radius_km || 0),
          active: Boolean(branch.is_active)
        };
      }));
    } catch (err) {
      setBranches([]);
      setError(t.errorLoad);
      console.warn("Admin branches load warning:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, [lang]);

  const handleToggle = async (branch: any) => {
    try {
      setError("");
      const { error: dbError } = await supabase
        .from("branches")
        .update({ is_active: !branch.active })
        .eq("id", branch.id);

      if (dbError) throw dbError;
      setBranches(prev => prev.map(item => item.id === branch.id ? { ...item, active: !branch.active } : item));
    } catch (err) {
      setError(t.errorToggle);
      console.warn("Admin branch toggle warning:", err);
    }
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {error && <div className="bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] text-xs rounded-xl p-4 font-bold">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalBranches}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{branches.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.onlineOutlets}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{branches.filter(b => b.active).length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.avgCapacity}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{averageRadius.toFixed(1)} KM</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.branchName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.location}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : branches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 font-bold">{t.noBranches}</td>
                </tr>
              ) : branches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{lang === "ar" ? b.nameAr : b.nameEn}</td>
                  <td className="py-4 px-6 font-bold text-gray-700">{lang === "ar" ? b.providerAr : b.providerEn}</td>
                  <td className="py-4 px-6">{lang === "ar" ? b.locationAr : b.locationEn}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      b.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
                    }`}>{b.active ? t.active : t.inactive}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(b)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.toggle}</button>
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
