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
    featuredHint: "Featured on the landing page rail / at the top of the Services page.",
    addBtn: "+ Add service",
    editBtn: "Edit",
    deleteBtn: "Delete",
    confirmDelete: "Delete service \"{name}\"? This cannot be undone.",
    newService: "New service",
    editService: "Edit service",
    nameEnLabel: "Name (EN)",
    nameArLabel: "Name (AR)",
    categorySel: "Category",
    priceLabel: "Price (SAR)",
    durationLabel: "Duration (min)",
    descEnLabel: "Description (EN)",
    descArLabel: "Description (AR)",
    imageLabel: "Image URL",
    assignProvider: "Assign to provider / shop",
    unassigned: "Unassigned (platform catalog)",
    statusLabel: "Status",
    activeOpt: "Active",
    draftOpt: "Draft / inactive",
    allCategories: "All categories",
    allStatuses: "All statuses",
    createdMsg: "Service created.",
    deletedMsg: "Service deleted.",
    saving: "Saving...",
    required: "Name and category are required.",
    filterBy: "Filter"
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
    featuredHint: "تظهر في شريط الصفحة الرئيسية / أعلى صفحة الخدمات.",
    addBtn: "+ إضافة خدمة",
    editBtn: "تعديل",
    deleteBtn: "حذف",
    confirmDelete: "حذف الخدمة \"{name}\"؟ لا يمكن التراجع.",
    newService: "خدمة جديدة",
    editService: "تعديل الخدمة",
    nameEnLabel: "الاسم (إنجليزي)",
    nameArLabel: "الاسم (عربي)",
    categorySel: "الفئة",
    priceLabel: "السعر (ريال)",
    durationLabel: "المدة (دقيقة)",
    descEnLabel: "الوصف (إنجليزي)",
    descArLabel: "الوصف (عربي)",
    imageLabel: "رابط الصورة",
    assignProvider: "إسناد لمزود / متجر",
    unassigned: "غير مُسند (كتالوج المنصة)",
    statusLabel: "الحالة",
    activeOpt: "نشط",
    draftOpt: "مسودة / غير نشط",
    allCategories: "كل الفئات",
    allStatuses: "كل الحالات",
    createdMsg: "تم إنشاء الخدمة.",
    deletedMsg: "تم حذف الخدمة.",
    saving: "جارٍ الحفظ...",
    required: "الاسم والفئة مطلوبان.",
    filterBy: "تصفية"
  }
};

type EditableService = {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryId: string;
  category: string;
  price: number;
  duration: number;
  descriptionEn: string;
  descriptionAr: string;
  image: string;
  providerId: string;
  providersCount: number;
  is_active: boolean;
  featured_on_landing: boolean;
  featured_in_services: boolean;
};

const blankService = (): EditableService => ({
  id: "", nameEn: "", nameAr: "", categoryId: "", category: "", price: 0, duration: 30,
  descriptionEn: "", descriptionAr: "", image: "", providerId: "", providersCount: 0,
  is_active: true, featured_on_landing: false, featured_in_services: false
});

export default function AdminServices() {
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [providersList, setProvidersList] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableService>(() => blankService());

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
        .select("id, name_en, name_ar, base_price, base_duration_minutes, description_en, description_ar, images, is_active, provider_id, category_id, featured_on_landing, featured_in_services, categories(name_en, name_ar)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setServices(data.map((s, idx) => ({
          id: s.id,
          nameEn: s.name_en,
          nameAr: s.name_ar,
          categoryId: (s as any).category_id || "",
          category: (s.categories as any)?.name_en || (s.categories as any)?.name_ar || "Uncategorized",
          price: Number(s.base_price) || 0,
          duration: Number(s.base_duration_minutes) || 0,
          descriptionEn: (s as any).description_en || "",
          descriptionAr: (s as any).description_ar || "",
          image: Array.isArray((s as any).images) && (s as any).images.length ? (s as any).images[0] : "",
          providerId: (s as any).provider_id || "",
          providersCount: (s as any).provider_id ? 1 : 0,
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

  // Load categories + providers for the create/edit form dropdowns.
  useEffect(() => {
    (async () => {
      try {
        const [{ data: cats }, { data: provs }] = await Promise.all([
          supabase.from("categories").select("id, name_en, name_ar").eq("is_active", true).order("sort_order"),
          supabase.from("providers").select("id, business_name_en, business_name_ar").order("created_at", { ascending: false }),
        ]);
        if (cats?.length) setCategories(cats);
        if (provs?.length) setProvidersList(provs.map((p: any) => ({ id: p.id, name_en: p.business_name_en, name_ar: p.business_name_ar })));
      } catch (err) {
        console.warn("Service form dropdowns using empty lists:", err);
      }
    })();
  }, []);

  const openNew = () => { setForm(blankService()); setModalOpen(true); };

  const openEdit = (item: any) => {
    setForm({
      id: item.id,
      nameEn: item.nameEn || "",
      nameAr: item.nameAr || "",
      categoryId: item.categoryId || "",
      category: item.category || "",
      price: Number(item.price) || 0,
      duration: Number(item.duration) || 30,
      descriptionEn: item.descriptionEn || "",
      descriptionAr: item.descriptionAr || "",
      image: item.image || "",
      providerId: item.providerId || "",
      providersCount: item.providersCount || 0,
      is_active: item.is_active !== false,
      featured_on_landing: !!item.featured_on_landing,
      featured_in_services: !!item.featured_in_services,
    });
    setModalOpen(true);
  };

  const saveService = async () => {
    setSuccess(""); setError("");
    if (!form.nameEn.trim() || !form.categoryId) { setError(translations[lang].required); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name_en: form.nameEn.trim(),
      name_ar: (form.nameAr || form.nameEn).trim(),
      category_id: form.categoryId,
      base_price: form.price,
      base_duration_minutes: form.duration,
      description_en: form.descriptionEn || null,
      description_ar: form.descriptionAr || null,
      images: form.image ? [form.image] : [],
      provider_id: form.providerId || null,
      status: form.is_active ? "active" : "draft",
      featured_on_landing: form.featured_on_landing,
      featured_in_services: form.featured_in_services,
    };
    try {
      if (form.id) {
        const { error: upErr } = await supabase.from("services").update(payload).eq("id", form.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase.from("services").insert(payload);
        if (insErr) throw insErr;
      }
      setModalOpen(false);
      setSuccess(form.id ? translations[lang].successMsg : translations[lang].createdMsg);
      await loadServices();
    } catch (err: any) {
      console.warn("Service save failed:", err?.message || err);
      setError(translations[lang].errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (item: any) => {
    const name = lang === "ar" ? item.nameAr : item.nameEn;
    if (!window.confirm(translations[lang].confirmDelete.replace("{name}", name))) return;
    setSuccess(""); setError("");
    // Optimistic removal from the list.
    setServices((prev) => prev.filter((s) => s.id !== item.id));
    if (String(item.id).startsWith("s-mock-")) { setSuccess(translations[lang].deletedMsg); return; }
    const { error: delErr } = await supabase.from("services").delete().eq("id", item.id);
    if (delErr) { setError(translations[lang].errorMsg); await loadServices(); return; }
    setSuccess(translations[lang].deletedMsg);
  };

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
    const matchesSearch = name.includes(term) || String(s.category).toLowerCase().includes(term);
    const matchesCat = catFilter === "all" || s.categoryId === catFilter || s.category === catFilter;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? s.is_active : !s.is_active);
    return matchesSearch && matchesCat && matchesStatus;
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
        <button onClick={openNew} className="rounded-2xl bg-[#D1AF47] px-5 py-3 text-sm font-black text-[#101828] shadow-[0_14px_34px_rgba(209,175,71,0.24)] hover:bg-[#E0C46A] transition">
          {t.addBtn}
        </button>
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
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${flip}`}>
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full bg-white border border-[#ECECEC] rounded-xl px-4 py-2.5 text-xs text-gray-900 outline-none focus:border-[#D1AF47] transition duration-150 ${isRTL ? "text-right" : "text-left"}`}
          />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-xs font-bold text-gray-700 outline-none focus:border-[#D1AF47]">
          <option value="all">{t.allCategories}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-xs font-bold text-gray-700 outline-none focus:border-[#D1AF47]">
          <option value="all">{t.allStatuses}</option>
          <option value="active">{t.active}</option>
          <option value="inactive">{t.inactive}</option>
        </select>
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400 font-bold">
                    {lang === "ar" ? "لا توجد خدمات مطابقة. أضف خدمة جديدة للبدء." : "No matching services. Add a new service to get started."}
                  </td>
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
                      <div className={`flex flex-wrap gap-1.5 ${isRTL ? "justify-start" : "justify-end"}`}>
                        <button
                          onClick={() => openEdit(item)}
                          className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border border-[#D1AF47]/30 bg-[#D1AF47]/10 text-[#9A741F] hover:border-[#D1AF47]/50"
                        >
                          {t.editBtn}
                        </button>
                        <button
                          onClick={() => handleToggleActive(item.id, item.is_active)}
                          className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border ${
                            item.is_active
                              ? "bg-white hover:bg-gray-50 text-gray-700 border-[#ECECEC]"
                              : "bg-gray-900 hover:bg-gray-800 text-white border-transparent"
                          }`}
                        >
                          {item.is_active ? t.inactive : t.active}
                        </button>
                        <button
                          onClick={() => deleteService(item)}
                          className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition duration-150 border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318] hover:border-[#F97066]"
                        >
                          {t.deleteBtn}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit service modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-[#101828]/55 px-4 py-8 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div dir={isRTL ? "rtl" : "ltr"} onClick={(e) => e.stopPropagation()} className={`w-full max-w-2xl rounded-[24px] border border-[#D1AF47]/25 bg-[#F9F7F1] p-6 shadow-2xl ${isRTL ? "text-right" : "text-left"}`}>
            <div className={`mb-5 flex items-center justify-between gap-4 ${flip}`}>
              <h3 className="font-serif text-xl font-black text-gray-900">{form.id ? t.editService : t.newService}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-black text-[#667085]">{t.cancelBtn}</button>
            </div>

            {error && <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-bold text-[#B42318]">{error}</div>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.nameEnLabel}
                <input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.nameArLabel}
                <input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} dir="rtl" className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.categorySel}
                <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="">{t.categorySel}…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.name_ar : c.name_en}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.assignProvider}
                <select value={form.providerId} onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="">{t.unassigned}</option>
                  {providersList.map((p) => <option key={p.id} value={p.id}>{lang === "ar" ? p.name_ar : p.name_en}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.priceLabel}
                <input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085]">{t.durationLabel}
                <input type="number" min={0} value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) || 0 }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085] sm:col-span-2">{t.imageLabel}
                <input value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="https://…" dir="ltr" className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085] sm:col-span-2">{t.descEnLabel}
                <textarea rows={2} value={form.descriptionEn} onChange={(e) => setForm((f) => ({ ...f, descriptionEn: e.target.value }))} className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-[#667085] sm:col-span-2">{t.descArLabel}
                <textarea rows={2} value={form.descriptionAr} onChange={(e) => setForm((f) => ({ ...f, descriptionAr: e.target.value }))} dir="rtl" className="w-full rounded-xl border border-[#ECECEC] bg-white px-3 py-2.5 text-sm normal-case tracking-normal text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
            </div>

            <div className={`mt-4 flex flex-wrap items-center gap-2 ${flip}`}>
              {([
                ["is_active", t.activeOpt],
                ["featured_on_landing", t.featLanding],
                ["featured_in_services", t.featServices],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, [key]: !f[key] }))}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                    form[key] ? "border-[#D1AF47]/40 bg-[#FFFAEB] text-[#B8952E]" : "border-[#ECECEC] bg-white text-gray-400 hover:border-[#D1AF47]/30"
                  }`}
                >
                  {form[key] ? "★" : "☆"} {label}
                </button>
              ))}
            </div>

            <div className={`mt-6 flex justify-end gap-3 ${flip}`}>
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-black text-[#667085]">{t.cancelBtn}</button>
              <button onClick={() => void saveService()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#101828] hover:bg-[#E0C46A] disabled:opacity-60">{saving ? t.saving : t.saveBtn}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
