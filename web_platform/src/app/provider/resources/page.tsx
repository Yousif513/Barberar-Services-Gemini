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

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className={`flex items-center justify-between flex-wrap gap-4 ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 font-serif">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2.5 bg-stone-900 text-white hover:bg-stone-800 rounded-xl text-xs font-bold transition duration-150 flex items-center gap-2 shadow-sm"
        >
          {showAddForm ? t.closeBtn : t.addBtn}
        </button>
      </div>

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {success && (
        <div className={`bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {success}
        </div>
      )}

      {/* ADD RESOURCE DIALOG */}
      {showAddForm && (
        <form onSubmit={handleAddResource} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm max-w-xl space-y-4 animate-slideDown">
          <h3 className={`font-bold text-sm text-stone-900 border-b border-stone-100 pb-2 ${isRTL ? "text-right" : "text-left"}`}>{isRTL ? "تسجيل مورد مادي جديد" : "Register Physical Resource"}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`text-[10px] uppercase font-bold text-stone-400 block mb-1 ${isRTL ? "text-right" : "text-left"}`}>{t.nameLabel}</label>
              <input
                type="text"
                placeholder={isRTL ? "مثال: غرفة حمام مغربي أ" : "e.g. Moroccan Bath Room A"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-stone-700 font-semibold ${isRTL ? "text-right" : "text-left"}`}
                required
              />
            </div>

            <div>
              <label className={`text-[10px] uppercase font-bold text-stone-400 block mb-1 ${isRTL ? "text-right" : "text-left"}`}>{t.categoryLabel}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-stone-700 font-bold ${isRTL ? "text-right" : "text-left"}`}
              >
                {categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{getTranslatedCategory(cat)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-[10px] uppercase font-bold text-stone-400 block mb-1 ${isRTL ? "text-right" : "text-left"}`}>{t.capacityLabel}</label>
              <input
                type="number"
                min="1"
                max="50"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-stone-700 font-semibold ${isRTL ? "text-right" : "text-left"}`}
                required
              />
            </div>
          </div>

          <div className={`flex ${isRTL ? "justify-start" : "justify-end"} pt-2`}>
            <button
              type="submit"
              className="px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition duration-150 shadow-sm"
            >
              {t.createBtn}
            </button>
          </div>
        </form>
      )}

      {/* RESOURCES GRID */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-xs font-semibold">{t.loading}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((res) => (
            <div
              key={res.id}
              className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between transition duration-200 ${
                res.is_active ? "border-stone-200 hover:border-[hsl(45,60%,55%)]" : "border-stone-100 opacity-60"
              }`}
            >
              <div className={isRTL ? "text-right" : "text-left"}>
                <div className={`flex justify-between items-start mb-3 gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">{getTranslatedCategory(res.category)}</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                    res.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {res.is_active ? t.active : t.inactive}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-stone-900 mb-1">{res.name}</h4>
                <p className="text-[10px] text-stone-500 font-semibold mb-6">
                  {t.capacityText} {res.capacity} {res.capacity === 1 ? t.person : t.people}
                </p>
              </div>

              <div className="flex gap-2 border-t border-stone-50 pt-4">
                <button
                  onClick={() => toggleResourceStatus(res.id, res.is_active)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition duration-150 ${
                    res.is_active 
                      ? "bg-stone-50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-stone-600 border-stone-200" 
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
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
