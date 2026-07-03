"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Global Services Directory",
    subtitle: "Manage the master services catalog, configure baseline price metrics, and organize categories.",
    loading: "Loading master services catalog...",
    addService: "Add Service Model",
    searchPlaceholder: "Search services...",
    totalServices: "Total Services",
    activeCategories: "Active Categories",
    avgPrice: "Average Base Price",
    serviceName: "Service Name",
    category: "Category",
    baselinePrice: "Baseline Price",
    activeProviders: "Active Providers",
    status: "Status",
    actions: "Actions",
    active: "Active",
    inactive: "Inactive",
    saveBtn: "Save",
    cancelBtn: "Cancel",
    successMsg: "Service catalog updated successfully!",
    errorMsg: "Failed to update service catalog.",
    featured: "Featured",
    featLanding: "Landing",
    featServices: "Services",
    featuredHint: "Featured on the landing page rail / at the top of the Services page."
  },
  ar: {
    title: "سجل الخدمات العام",
    subtitle: "إدارة الدليل الشامل للخدمات، تحديد أسعار الحد الأدنى القياسية، وترتيب الفئات والنشاطات.",
    loading: "جاري تحميل دليل الخدمات...",
    addService: "إضافة نموذج خدمة",
    searchPlaceholder: "بحث عن خدمة...",
    totalServices: "إجمالي الخدمات",
    activeCategories: "الفئات النشطة",
    avgPrice: "متوسط السعر المرجعي",
    serviceName: "اسم الخدمة",
    category: "الفئة",
    baselinePrice: "السعر المرجعي",
    activeProviders: "المزودين النشطين",
    status: "الحالة",
    actions: "الإجراءات",
    active: "نشط",
    inactive: "معطل",
    saveBtn: "حفظ",
    cancelBtn: "إلغاء",
    successMsg: "تم تحديث سجل الخدمات بنجاح!",
    errorMsg: "فشل تحديث سجل الخدمات.",
    featured: "مميزة",
    featLanding: "الرئيسية",
    featServices: "الخدمات",
    featuredHint: "تظهر في شريط الصفحة الرئيسية / أعلى صفحة الخدمات."
  }
};

export default function AdminServices() {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const loadServices = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("services")
        .select("id, name_en, name_ar, base_price, base_duration_minutes, is_active, featured_on_landing, featured_in_services, categories(name_en, name_ar)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setServices(data.map((s, idx) => ({
          id: s.id,
          nameEn: s.name_en,
          nameAr: s.name_ar,
          category: (s.categories as any)?.name_en || (s.categories as any)?.name_ar || "Uncategorized",
          price: Number(s.base_price) || 0,
          duration: Number(s.base_duration_minutes) || 0,
          providersCount: 1,
          is_active: !!s.is_active,
          featured_on_landing: !!s.featured_on_landing,
          featured_in_services: !!s.featured_in_services
        })));
      } else {
        throw new Error("No data");
      }
    } catch (err) {
      setError(translations[lang].errorMsg);
      setServices([
        { id: "s-mock-1", nameEn: "Classic Beard Shave", nameAr: "حلاقة ذقن كلاسيكية", category: "Barber", price: 60, providersCount: 24, is_active: true, featured_on_landing: false, featured_in_services: false },
        { id: "s-mock-2", nameEn: "Royal Moroccan Bath", nameAr: "حمام مغربي ملكي", category: "Spa", price: 250, providersCount: 12, is_active: true, featured_on_landing: false, featured_in_services: false },
        { id: "s-mock-3", nameEn: "Executive Haircut", nameAr: "قص شعر فاخر", category: "Barber", price: 90, providersCount: 38, is_active: true, featured_on_landing: false, featured_in_services: false },
        { id: "s-mock-4", nameEn: "Hydrafacial Therapy", nameAr: "علاج هيدرافيشيل للبشرة", category: "Beauty", price: 450, providersCount: 8, is_active: true, featured_on_landing: false, featured_in_services: false },
        { id: "s-mock-5", nameEn: "Pedicure & Foot Spa", nameAr: "باديكير وسبا للقدمين", category: "Nails", price: 150, providersCount: 15, is_active: true, featured_on_landing: false, featured_in_services: false }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [lang]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    setSuccess("");
    setError("");
    const nextStatus = !currentStatus;
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: nextStatus } : s)));

    if (id.startsWith("s-mock-")) {
      setSuccess(translations[lang].successMsg);
      return;
    }

    const { error: updateError } = await supabase
      .from("services")
      .update({ is_active: nextStatus })
      .eq("id", id);

    if (updateError) {
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: currentStatus } : s)));
      setError(translations[lang].errorMsg);
      return;
    }

    setSuccess(translations[lang].successMsg);
  };

  const handleToggleFeatured = async (id: string, field: "featured_on_landing" | "featured_in_services", current: boolean) => {
    setSuccess("");
    setError("");
    const next = !current;
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: next } : s)));

    if (id.startsWith("s-mock-")) {
      setSuccess(translations[lang].successMsg);
      return;
    }

    const { error: updateError } = await supabase
      .from("services")
      .update({ [field]: next })
      .eq("id", id);

    if (updateError) {
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: current } : s)));
      setError(translations[lang].errorMsg);
      return;
    }

    setSuccess(translations[lang].successMsg);
  };

  const handlePriceChange = async (id: string, newPrice: number) => {
    setSuccess("");
    setError("");
    const previous = services.find((s) => s.id === id)?.price ?? 0;
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, price: newPrice } : s)));

    if (id.startsWith("s-mock-")) {
      setSuccess(translations[lang].successMsg);
      return;
    }

    const { error: updateError } = await supabase
      .from("services")
      .update({ base_price: newPrice })
      .eq("id", id);

    if (updateError) {
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, price: previous } : s)));
      setError(translations[lang].errorMsg);
      return;
    }

    setSuccess(translations[lang].successMsg);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  const filtered = services.filter((s) => {
    const term = search.toLowerCase();
    const name = (lang === "ar" ? s.nameAr : s.nameEn).toLowerCase();
    return name.includes(term) || s.category.toLowerCase().includes(term);
  });

  // KPI Calculations
  const totalServices = services.length;
  const activeCategoriesCount = new Set(services.map(s => s.category)).size;
  const avgServicePrice = services.length
    ? services.reduce((sum, s) => sum + s.price, 0) / services.length
    : 0;

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Header */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${flip}`}>
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
          {t.successMsg}
        </div>
      )}

      {error && (
        <div className={`bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs rounded-xl p-4 font-bold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalServices}</span>
            <span className="text-xs font-black text-[#D1AF47]">#</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalServices}
          </strong>
        </div>

        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.activeCategories}</span>
            <span className="text-xs font-black text-emerald-700">✓</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">
            {activeCategoriesCount}
          </strong>
        </div>

        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.avgPrice}</span>
            <span className="text-xs font-black text-amber-700">%</span>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {avgServicePrice.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>
      </div>

      {/* Controls Grid */}
      <div className={`flex items-center gap-4 ${flip}`}>
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full bg-white border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-gray-900 outline-none focus:border-[#D1AF47] transition duration-150 ${isRTL ? "text-right" : "text-left"}`}
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.serviceName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.category}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.baselinePrice}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.activeProviders}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`} title={t.featuredHint}>{t.featured}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/40 transition duration-150">
                    <td className="py-4 px-6">
                      <p className="font-bold text-gray-900">{lang === "ar" ? item.nameAr : item.nameEn}</p>
                      <p className="text-[9px] text-gray-400 font-semibold mt-1">ID: {item.id}</p>
                    </td>
                    <td className="py-4 px-6 capitalize">
                      {item.category}
                    </td>
                    <td className="py-4 px-6">
                      <div className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => handlePriceChange(item.id, parseFloat(e.target.value) || 0)}
                          className="w-16 bg-gray-50 border border-[#ECECEC] rounded-lg px-2 py-1 text-center font-bold text-gray-900 outline-none focus:border-[#D1AF47]"
                        />
                        <span className="font-bold text-gray-400">{lang === "ar" ? "ريال" : "SAR"}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-serif font-black">
                      {item.providersCount}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                        item.is_active 
                          ? "bg-[#ECFDF3] text-[#16A34A]" 
                          : "bg-[#FEF3F2] text-[#D92D20]"
                      }`}>
                        {item.is_active ? t.active : t.inactive}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className={`flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <button
                          onClick={() => handleToggleFeatured(item.id, "featured_on_landing", item.featured_on_landing)}
                          title={t.featuredHint}
                          className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition duration-150 ${
                            item.featured_on_landing
                              ? "bg-[#FFFAEB] text-[#B8952E] border-[#D1AF47]/40"
                              : "bg-white text-gray-400 border-[#ECECEC] hover:border-[#D1AF47]/30 hover:text-gray-600"
                          }`}
                        >
                          {item.featured_on_landing ? "★" : "☆"} {t.featLanding}
                        </button>
                        <button
                          onClick={() => handleToggleFeatured(item.id, "featured_in_services", item.featured_in_services)}
                          title={t.featuredHint}
                          className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition duration-150 ${
                            item.featured_in_services
                              ? "bg-[#FFFAEB] text-[#B8952E] border-[#D1AF47]/40"
                              : "bg-white text-gray-400 border-[#ECECEC] hover:border-[#D1AF47]/30 hover:text-gray-600"
                          }`}
                        >
                          {item.featured_in_services ? "★" : "☆"} {t.featServices}
                        </button>
                      </div>
                    </td>
                    <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                      <button
                        onClick={() => handleToggleActive(item.id, item.is_active)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border ${
                          item.is_active 
                            ? "bg-white hover:bg-gray-50 text-gray-700 border-[#ECECEC]" 
                            : "bg-gray-900 hover:bg-gray-800 text-white border-transparent"
                        }`}
                      >
                        {item.is_active ? t.inactive : t.active}
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
