"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Spa Rooms & Resources",
    subtitle: "Manage physical resources, treatment beds, and rooms for service allocation.",
    addBtn: "Add New Resource",
    closeBtn: "Close Form",
    nameLabel: "Resource Name",
    categoryLabel: "Resource Category",
    capacityLabel: "Simultaneous Capacity",
    createBtn: "Create Resource",
    loading: "Loading resources...",
    active: "Active",
    inactive: "Inactive",
    deactivate: "Deactivate",
    activate: "Activate",
    successAdd: "Resource registered successfully!",
    errorName: "Please specify a resource name.",
    errorBranch: "No branch found. Please verify your provider account settings.",
    errorLoad: "Failed to load resources. Showing mock fallbacks.",
    people: "people",
    person: "person",
    capacityText: "Max Capacity:"
  },
  ar: {
    title: "غرف وموارد السبا والعلاج",
    subtitle: "إدارة الموارد المادية وغرف المساج والأسرة المخصصة لتقديم الخدمات.",
    addBtn: "إضافة مورد جديد",
    closeBtn: "إغلاق النموذج",
    nameLabel: "اسم المورد",
    categoryLabel: "فئة المورد",
    capacityLabel: "السعة الاستيعابية المتزامنة",
    createBtn: "إنشاء مورد جديد",
    loading: "جاري تحميل الموارد...",
    active: "نشط",
    inactive: "غير نشط",
    deactivate: "تعطيل",
    activate: "تفعيل",
    successAdd: "تم تسجيل المورد بنجاح!",
    errorName: "يرجى تحديد اسم المورد.",
    errorBranch: "لم يتم العثور على فرع. يرجى مراجعة إعدادات مزود الخدمة.",
    errorLoad: "فشل تحميل الموارد. يتم عرض بيانات محاكاة.",
    people: "أشخاص",
    person: "شخص واحد",
    capacityText: "الحد الأقصى للسعة:"
  }
};

interface Resource {
  id: string;
  name: string;
  category: string;
  capacity: number;
  is_active: boolean;
}

export default function ResourcesPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Massage Room");
  const [capacity, setCapacity] = useState(1);
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const categories = ["Massage Room", "Facial Room", "Sauna", "Jacuzzi", "Yoga Studio", "Grooming Station"];

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const observer = new MutationObserver(handleLangSync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const t = translations[locale];

  useEffect(() => {
    loadResources();
  }, [locale]);

  async function loadResources() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider profile owned by the user
      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        // Get branches of this provider
        const { data: branches } = await supabase
          .from("branches")
          .select("id")
          .eq("provider_id", providerInfo.id);

        const branchIds = branches?.map(b => b.id) || [];
        if (branchIds.length > 0) {
          setBranchId(branchIds[0]); // Default to first branch

          const { data: resourcesData, error: fetchError } = await supabase
            .from("resources")
            .select("*")
            .in("branch_id", branchIds)
            .order("created_at", { ascending: false });

          if (fetchError) throw fetchError;
          setResources(resourcesData || []);
        }
      }
    } catch (err: any) {
      console.error("Error loading resources:", err.message);
      setError(t.errorLoad);
      // Fallback mock items
      setResources([
        {
          id: "1",
          name: locale === "ar" ? "سرير مساج زن أ" : "Zen Massage Bed A",
          category: "Massage Room",
          capacity: 1,
          is_active: true
        },
        {
          id: "2",
          name: locale === "ar" ? "غرفة الساونا الملكية" : "Royal Spa Room",
          category: "Sauna",
          capacity: 4,
          is_active: true
        },
        {
          id: "3",
          name: locale === "ar" ? "طاولة حمام مغربي" : "Hammam Scrub Table",
          category: "Massage Room",
          capacity: 1,
          is_active: true
        },
        {
          id: "4",
          name: locale === "ar" ? "محطة العناية بالبشرة 1" : "Facial Care Station 1",
          category: "Facial Room",
          capacity: 2,
          is_active: true
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddResource(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError(t.errorName);
      return;
    }

    if (!branchId) {
      setError(t.errorBranch);
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from("resources")
        .insert({
          branch_id: branchId,
          name,
          category,
          capacity,
          is_active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setSuccess(t.successAdd);
      setName("");
      setCapacity(1);
      setShowAddForm(false);
      loadResources();
    } catch (err: any) {
      console.error("Error inserting resource:", err.message);
      setError(err.message || "Failed to create resource.");
    }
  }

  async function toggleResourceStatus(id: string, currentStatus: boolean) {
    try {
      const { error: updateError } = await supabase
        .from("resources")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (updateError) throw updateError;
      loadResources();
    } catch (err: any) {
      console.error("Error updating resource:", err.message);
    }
  }

  const isRTL = locale === "ar";

  const getTranslatedCategory = (cat: string) => {
    if (locale === "en") return cat;
    switch (cat) {
      case "Massage Room": return "غرفة مساج";
      case "Facial Room": return "غرفة علاجات الوجه";
      case "Sauna": return "ساونا";
      case "Jacuzzi": return "جاكوزي";
      case "Yoga Studio": return "استوديو يوجا";
      case "Grooming Station": return "منصة تزيين وحلاقة";
      default: return cat;
    }
  };

  const getCategoryIcon = (category: string) => {
    const baseClass = "w-4.5 h-4.5 text-[#D1AF47]";
    switch (category) {
      case "Massage Room":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5h14a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 19v-4a2 2 0 012-2h14a2 2 0 012 2v4M5 12V8m14 4V8" />
          </svg>
        );
      case "Facial Room":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        );
      case "Sauna":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5V3m-4 6v-3m8 3v-2M9 17a3 3 0 01-3-3V12h12v2a3 3 0 01-3 3H9z" />
          </svg>
        );
      case "Jacuzzi":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 13V9m8 4V9m-8 4h8M4 17c1.333-1 2.667-1 4 0s2.667 1 4 0 2.667-1 4 0 2.667 1 4 0" />
          </svg>
        );
      case "Yoga Studio":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.02 12.02l-.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        );
      case "Grooming Station":
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      default:
        return (
          <svg className={baseClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1" />
          </svg>
        );
    }
  };

  const renderCapacityMeter = (capacity: number) => {
    const maxScale = 6;
    const percentage = Math.min((capacity / maxScale) * 100, 100);
    return (
      <div className="space-y-2 mt-5">
        <div className={`flex justify-between items-center text-[10px] text-[#667085] font-semibold tracking-wide ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <span>{isRTL ? "مقياس السعة الاستيعابية" : "Capacity Scale"}</span>
          <span className="text-[#101828] font-bold">{capacity} {capacity === 1 ? t.person : t.people}</span>
        </div>
        <div className="h-1.5 w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-full overflow-hidden p-[1px] border border-[#ECECEC] relative">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-[#B8952E] via-[#D1AF47] to-[#E0C46A] shadow-[0_0_8px_rgba(209,175,71,0.4)] transition-all duration-500" 
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className={`flex items-center justify-between flex-wrap gap-4 ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#101828] font-serif">{t.title}</h2>
          <p className="text-sm text-[#667085] mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-300 flex items-center gap-2 hover:scale-[1.02] ${
            showAddForm 
              ? "bg-white/5 border border-[#ECECEC] hover:bg-white/10 text-[#344054] hover:text-[#101828]" 
              : "bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] text-[#070B12] shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_25px_rgba(209,175,71,0.25)]"
          }`}
        >
          {showAddForm ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t.closeBtn}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t.addBtn}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className={`bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-xs rounded-2xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {success && (
        <div className={`bg-[#3DDC84]/10 border border-[#3DDC84]/20 text-[#22C55E] text-xs rounded-2xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {success}
        </div>
      )}

      {/* ADD RESOURCE DIALOG */}
      {showAddForm && (
        <form onSubmit={handleAddResource} className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-[28px] p-6 shadow-2xl max-w-xl space-y-5 animate-slideDown relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#B8952E] via-[#D1AF47] to-[#E0C46A]" />
          
          <h3 className={`font-bold text-sm text-[#D1AF47] border-b border-[#ECECEC] pb-3 tracking-wide ${isRTL ? "text-right" : "text-left"}`}>
            {isRTL ? "تسجيل مورد مادي جديد" : "Register Physical Resource"}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className={`text-[10px] uppercase font-bold text-[#667085] block mb-2 tracking-wider ${isRTL ? "text-right" : "text-left"}`}>{t.nameLabel}</label>
              <input
                type="text"
                placeholder={isRTL ? "مثال: غرفة حمام مغربي أ" : "e.g. Moroccan Bath Room A"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#D1AF47]/40 focus:ring-1 focus:ring-[#D1AF47]/40 text-[#101828] font-medium transition-all duration-300 placeholder-white/20 ${isRTL ? "text-right" : "text-left"}`}
                required
              />
            </div>

            <div>
              <label className={`text-[10px] uppercase font-bold text-[#667085] block mb-2 tracking-wider ${isRTL ? "text-right" : "text-left"}`}>{t.categoryLabel}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#D1AF47]/40 focus:ring-1 focus:ring-[#D1AF47]/40 text-[#101828] font-bold transition-all duration-300 appearance-none cursor-pointer ${isRTL ? "text-right" : "text-left"}`}
              >
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat} className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] text-[#101828] font-medium">
                    {getTranslatedCategory(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-[10px] uppercase font-bold text-[#667085] block mb-2 tracking-wider ${isRTL ? "text-right" : "text-left"}`}>{t.capacityLabel}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                className={`w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border border-[#ECECEC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#D1AF47]/40 focus:ring-1 focus:ring-[#D1AF47]/40 text-[#101828] font-medium transition-all duration-300 ${isRTL ? "text-right" : "text-left"}`}
                required
              />
            </div>
          </div>

          <div className={`flex ${isRTL ? "justify-start" : "justify-end"} pt-3 border-t border-[#ECECEC]`}>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] hover:bg-gradient-to-r hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(209,175,71,0.15)]"
            >
              {t.createBtn}
            </button>
          </div>
        </form>
      )}

      {/* RESOURCES GRID */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 rounded-full border-2 border-[#ECECEC] border-t-[#D1AF47] animate-spin" />
          <span className="text-xs font-semibold text-[#667085]">{t.loading}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((res) => (
            <div
              key={res.id}
              className={`bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] border rounded-[24px] p-6 shadow-xl flex flex-col justify-between transition-all duration-300 relative group overflow-hidden ${
                res.is_active 
                  ? "border-[#ECECEC] hover:border-[#D1AF47]/30 hover:shadow-[0_0_30px_rgba(209,175,71,0.06)] hover:scale-[1.02]" 
                  : "border-[#ECECEC] opacity-50 grayscale"
              }`}
            >
              <div className={isRTL ? "text-right" : "text-left"}>
                <div className={`flex justify-between items-center mb-4 gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/10 flex items-center justify-center border border-[#D1AF47]/10 group-hover:bg-[#D1AF47]/20 transition-all duration-300">
                      {getCategoryIcon(res.category)}
                    </div>
                    <span className="text-[11px] font-bold text-[#667085] tracking-wide">{getTranslatedCategory(res.category)}</span>
                  </div>
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    res.is_active 
                      ? "bg-[#3DDC84]/10 text-[#22C55E] border border-[#3DDC84]/20" 
                      : "bg-[#FF5D73]/10 text-[#EF4444] border border-[#FF5D73]/20"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${res.is_active ? "bg-[#3DDC84]" : "bg-[#FF5D73]"}`} />
                    {res.is_active ? t.active : t.inactive}
                  </span>
                </div>
                <h4 className="font-bold text-base text-[#101828] tracking-wide mb-2 group-hover:text-[#D1AF47] transition-colors duration-300">{res.name}</h4>
                {renderCapacityMeter(res.capacity)}
              </div>

              <div className="flex gap-2 border-t border-[#ECECEC] pt-4 mt-6">
                <button
                  onClick={() => toggleResourceStatus(res.id, res.is_active)}
                  className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-300 ${
                    res.is_active 
                      ? "bg-white/5 hover:bg-[#FF5D73]/10 hover:text-[#EF4444] hover:border-[#FF5D73]/20 text-[#344054] border-[#ECECEC]" 
                      : "bg-[#3DDC84]/10 text-[#22C55E] hover:bg-[#3DDC84]/20 border border-[#3DDC84]/20"
                  }`}
                >
                  {res.is_active ? t.deactivate : t.activate}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
