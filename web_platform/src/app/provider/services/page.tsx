"use client";

import React, { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    servicesTitle: "Services Menu",
    subtitle: "Define and manage service listings, pricing overrides, and home dispatch tags",
    addService: "Add Service Item",
    serviceName: "Service Item",
    category: "Category",
    price: "Price",
    duration: "Duration",
    homeService: "Home Service",
    status: "Status",
    actions: "Actions",
    edit: "Edit",
    delete: "Delete",
    active: "Active",
    inactive: "Inactive",
    eligible: "Eligible",
    inStoreOnly: "In-store Only",
    totalServices: "Total Services",
    activeServices: "Active Services",
    homeServicesCount: "Home Dispatch Eligible",
    editService: "Edit Service",
    nameEnL: "Service name (English)",
    nameArL: "Service name (Arabic)",
    priceL: "Base price (SAR)",
    durationL: "Duration (minutes)",
    homeEligibleL: "Home service eligible",
    activeL: "Active (visible to customers)",
    save: "Save Service",
    saving: "Saving...",
    cancel: "Cancel",
    deleteConfirm: "Delete this service permanently?",
    noServices: "No services yet. Add your first service item.",
    selectCategory: "Select category",
    loadingServices: "Loading services..."
  },
  ar: {
    servicesTitle: "قائمة الخدمات",
    subtitle: "تحديد وإدارة الخدمات، وتعديل الأسعار المخصصة، وتفعيل ميزة الخدمة المنزلية",
    addService: "إضافة خدمة جديدة",
    serviceName: "اسم الخدمة",
    category: "التصنيف",
    price: "السعر",
    duration: "المدة",
    homeService: "خدمة منزلية",
    status: "الحالة",
    actions: "الإجراءات",
    edit: "تعديل",
    delete: "حذف",
    active: "نشط",
    inactive: "غير نشط",
    eligible: "متاح بالمنزل",
    inStoreOnly: "في الصالون فقط",
    totalServices: "إجمالي الخدمات",
    activeServices: "الخدمات النشطة",
    homeServicesCount: "متاح للخدمة المنزلية",
    editService: "تعديل الخدمة",
    nameEnL: "اسم الخدمة (إنجليزي)",
    nameArL: "اسم الخدمة (عربي)",
    priceL: "السعر الأساسي (ر.س)",
    durationL: "المدة (دقائق)",
    homeEligibleL: "متاحة كخدمة منزلية",
    activeL: "نشطة (مرئية للعملاء)",
    save: "حفظ الخدمة",
    saving: "جاري الحفظ...",
    cancel: "إلغاء",
    deleteConfirm: "حذف هذه الخدمة نهائيا؟",
    noServices: "لا توجد خدمات بعد. أضف أول خدمة.",
    selectCategory: "اختر التصنيف",
    loadingServices: "جاري تحميل الخدمات..."
  }
};

type ProviderServiceRow = {
  id: string;
  categoryId: string;
  name_en: string;
  name_ar: string;
  category_en: string;
  category_ar: string;
  price: string;
  duration: string;
  basePrice: number;
  durationMinutes: number;
  isHomeService: boolean;
  isActive: boolean;
};

type ServiceForm = {
  id: string;
  categoryId: string;
  nameEn: string;
  nameAr: string;
  basePrice: string;
  durationMinutes: string;
  isHomeService: boolean;
  isActive: boolean;
};

type CategoryOption = {
  id: string;
  name_en: string;
  name_ar: string;
};

export default function ProviderServicesPage() {
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

  const serviceCopy = lang === "ar" ? {
    loading: "جاري تحميل الخدمات...",
    providerMissing: "لم يتم العثور على ملف مزود مرتبط بحسابك.",
    categoriesMissing: "لا توجد تصنيفات نشطة. يجب أن يضيف المسؤول تصنيفا قبل إنشاء خدمة.",
    loadFailed: "تعذر تحميل الخدمات.",
    saveFailed: "تعذر حفظ الخدمة.",
    deleteFailed: "تعذر حذف الخدمة أو تعطيلها.",
    saved: "تم حفظ الخدمة.",
    deleted: "تم حذف الخدمة.",
    deactivated: "الخدمة مرتبطة بحجوزات، لذلك تم تعطيلها بدلا من الحذف.",
    required: "اسم الخدمة والتصنيف والسعر والمدة مطلوبة.",
    addTitle: "إضافة خدمة",
    editTitle: "تعديل خدمة",
    nameEn: "اسم الخدمة بالإنجليزية",
    nameAr: "اسم الخدمة بالعربية",
    price: "السعر بالريال",
    duration: "المدة بالدقائق",
    category: "التصنيف",
    cancel: "إلغاء",
    save: "حفظ",
    saving: "جاري الحفظ...",
    noServices: "لا توجد خدمات بعد. أضف أول خدمة لبدء استقبال الحجوزات.",
    confirmDelete: "هل تريد حذف خدمة {name}؟ إذا كانت لديها حجوزات سيتم تعطيلها بدلا من الحذف."
  } : {
    loading: "Loading services...",
    providerMissing: "No provider profile is linked to your account.",
    categoriesMissing: "No active categories are available. An admin must add a category before you can create a service.",
    loadFailed: "Failed to load services.",
    saveFailed: "Failed to save service.",
    deleteFailed: "Failed to delete or deactivate service.",
    saved: "Service saved.",
    deleted: "Service deleted.",
    deactivated: "This service has linked bookings, so it was deactivated instead of deleted.",
    required: "Service name, category, price, and duration are required.",
    addTitle: "Add Service",
    editTitle: "Edit Service",
    nameEn: "English service name",
    nameAr: "Arabic service name",
    price: "Price in SAR",
    duration: "Duration in minutes",
    category: "Category",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    noServices: "No services yet. Add your first service to start accepting bookings.",
    confirmDelete: "Delete {name}? If it has bookings, it will be deactivated instead."
  };

  const makeServiceForm = (categoryId = ""): ServiceForm => ({
    id: "",
    categoryId,
    nameEn: "",
    nameAr: "",
    basePrice: "",
    durationMinutes: "45",
    isHomeService: false,
    isActive: true
  });

  const [providerId, setProviderId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [servicesList, setServicesList] = useState<ProviderServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(() => makeServiceForm(""));

  const mapServiceRow = useCallback((service: any): ProviderServiceRow => {
    const categoryRecord = Array.isArray(service.categories)
      ? service.categories[0]
      : service.categories;
    const basePrice = Number(service.base_price || 0);
    const durationMinutes = Number(service.base_duration_minutes || 0);

    return {
      id: service.id,
      categoryId: service.category_id || "",
      name_en: service.name_en || "",
      name_ar: service.name_ar || service.name_en || "",
      category_en: categoryRecord?.name_en || "-",
      category_ar: categoryRecord?.name_ar || categoryRecord?.name_en || "-",
      price: `${basePrice} SAR`,
      duration: `${durationMinutes} min`,
      basePrice,
      durationMinutes,
      isHomeService: Boolean(service.is_home_service_eligible),
      isActive: Boolean(service.is_active)
    };
  }, []);

  const loadServicesData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        const message = userError.message || "";
        if (message.includes("Auth session missing")) {
          setProviderId("");
          setCategories([]);
          setServicesList([]);
          return;
        }
        throw userError;
      }
      if (!user) {
        setProviderId("");
        setCategories([]);
        setServicesList([]);
        return;
      }

      const { data: providerInfo, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerError) throw providerError;
      if (!providerInfo) {
        setProviderId("");
        setCategories([]);
        setServicesList([]);
        setError(serviceCopy.providerMissing);
        return;
      }

      setProviderId(providerInfo.id);

      const [categoriesResult, servicesResult] = await Promise.all([
        supabase
          .from("categories")
          .select("id, name_en, name_ar")
          .eq("is_active", true)
          .order("name_en", { ascending: true }),
        supabase
          .from("services")
          .select(`
            id,
            category_id,
            name_en,
            name_ar,
            base_price,
            base_duration_minutes,
            is_home_service_eligible,
            is_active,
            categories ( name_en, name_ar )
          `)
          .eq("provider_id", providerInfo.id)
          .order("created_at", { ascending: false })
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (servicesResult.error) throw servicesResult.error;

      setCategories(categoriesResult.data || []);
      setServicesList((servicesResult.data || []).map(mapServiceRow));
    } catch (err) {
      console.error("Error loading provider services:", err);
      setError(serviceCopy.loadFailed);
      setServicesList([]);
    } finally {
      setLoading(false);
    }
  }, [mapServiceRow, serviceCopy.loadFailed, serviceCopy.providerMissing]);

  useEffect(() => {
    void loadServicesData();
  }, [loadServicesData]);

  const openAddService = () => {
    setSuccess("");
    setError("");
    if (categories.length === 0) {
      setError(serviceCopy.categoriesMissing);
      return;
    }
    setServiceForm(makeServiceForm(categories[0].id));
    setServiceModalOpen(true);
  };

  const openEditService = (service: ProviderServiceRow) => {
    setSuccess("");
    setError("");
    setServiceForm({
      id: service.id,
      categoryId: service.categoryId,
      nameEn: service.name_en,
      nameAr: service.name_ar,
      basePrice: String(service.basePrice),
      durationMinutes: String(service.durationMinutes),
      isHomeService: service.isHomeService,
      isActive: service.isActive
    });
    setServiceModalOpen(true);
  };

  const saveService = async () => {
    const priceValue = Number(serviceForm.basePrice);
    const durationValue = Number(serviceForm.durationMinutes);
    if (
      !providerId ||
      !serviceForm.categoryId ||
      !serviceForm.nameEn.trim() ||
      !serviceForm.nameAr.trim() ||
      !Number.isFinite(priceValue) ||
      priceValue <= 0 ||
      !Number.isFinite(durationValue) ||
      durationValue <= 0
    ) {
      setError(serviceCopy.required);
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = {
        provider_id: providerId,
        category_id: serviceForm.categoryId,
        name_en: serviceForm.nameEn.trim(),
        name_ar: serviceForm.nameAr.trim(),
        base_price: priceValue,
        base_duration_minutes: durationValue,
        is_home_service_eligible: serviceForm.isHomeService,
        is_active: serviceForm.isActive
      };

      const result = serviceForm.id
        ? await supabase.from("services").update(payload).eq("id", serviceForm.id)
        : await supabase.from("services").insert(payload);

      if (result.error) throw result.error;
      setSuccess(serviceCopy.saved);
      setServiceModalOpen(false);
      await loadServicesData();
    } catch (err) {
      console.error("Error saving service:", err);
      setError(serviceCopy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (service: ProviderServiceRow) => {
    const label = lang === "ar" ? service.name_ar : service.name_en;
    const message = serviceCopy.confirmDelete.replace("{name}", label);
    if (typeof window !== "undefined" && !window.confirm(message)) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const { error: deleteError } = await supabase
        .from("services")
        .delete()
        .eq("id", service.id);

      if (deleteError) {
        const { error: deactivateError } = await supabase
          .from("services")
          .update({ is_active: false })
          .eq("id", service.id);
        if (deactivateError) throw deactivateError;
        setSuccess(serviceCopy.deactivated);
      } else {
        setSuccess(serviceCopy.deleted);
      }

      await loadServicesData();
    } catch (err) {
      console.error("Error deleting service:", err);
      setError(serviceCopy.deleteFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="relative space-y-8 pb-12 transition-all duration-300"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Decorative top-right gold glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[radial-gradient(circle_800px_at_100%_0px,#D1AF47,transparent)] opacity-[0.03] pointer-events-none -z-10"></div>

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-[rgba(255,255,255,0.06)] pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#101828] flex items-center gap-3">
            <span className="w-1.5 h-8 bg-[#D1AF47] rounded-full shadow-[0_0_15px_rgba(209,175,71,0.6)]"></span>
            {t.servicesTitle}
          </h2>
          <p className="text-sm text-[#667085] max-w-xl leading-relaxed">{t.subtitle}</p>
        </div>
        
        <button onClick={openAddService} className="relative group overflow-hidden bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] px-6 py-3 rounded-[16px] text-sm font-bold shadow-[0_4px_20px_rgba(209,175,71,0.25)] hover:shadow-[0_0_30px_rgba(209,175,71,0.4)] transition-all duration-300 flex items-center gap-2 cursor-pointer active:scale-95">
          <span className="text-lg font-light leading-none transition-transform duration-300 group-hover:rotate-90">+</span>
          <span>{t.addService}</span>
          <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
        </button>
      </div>

      {(loading || error || success) && (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
          error
            ? "border-[#FF5D73]/25 bg-[#FF5D73]/10 text-[#FFB3BF]"
            : success
              ? "border-[#3DDC84]/25 bg-[#3DDC84]/10 text-[#9AF0BE]"
              : "border-[#D1AF47]/20 bg-[#D1AF47]/10 text-[#D1AF47]"
        }`}>
          {error || success || serviceCopy.loading}
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Services */}
        <div className="relative overflow-hidden bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:scale-[1.02] hover:border-[#D1AF47]/30 hover:shadow-[0_0_30px_rgba(209,175,71,0.05)] group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#667085] font-semibold">{t.totalServices}</p>
              <h3 className="text-3xl font-extrabold text-[#101828] tracking-tight">{servicesList.length}</h3>
            </div>
            <div className="p-3 bg-[#FBFAF7] rounded-[16px] border border-[#ECECEC] text-[#D1AF47] group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 2: Active Services */}
        <div className="relative overflow-hidden bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:scale-[1.02] hover:border-[#3DDC84]/30 hover:shadow-[0_0_30px_rgba(61,220,132,0.05)] group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#667085] font-semibold">{t.activeServices}</p>
              <h3 className="text-3xl font-extrabold text-[#101828] tracking-tight">
                {servicesList.filter((s) => s.isActive).length}
              </h3>
            </div>
            <div className="p-3 bg-[#FBFAF7] rounded-[16px] border border-[#ECECEC] text-[#22C55E] group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#22C55E]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 3: Home Services */}
        <div className="relative overflow-hidden bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:scale-[1.02] hover:border-[#F5B041]/30 hover:shadow-[0_0_30px_rgba(245,176,65,0.05)] group">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#667085] font-semibold">{t.homeServicesCount}</p>
              <h3 className="text-3xl font-extrabold text-[#101828] tracking-tight">
                {servicesList.filter((s) => s.isHomeService).length}
              </h3>
            </div>
            <div className="p-3 bg-[#FBFAF7] rounded-[16px] border border-[#ECECEC] text-[#F5B041] group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#F5B041]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Services Table Card (Desktop) */}
      <div className="hidden md:block relative bg-white border border-[#ECECEC] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.015)] p-6 md:p-8 overflow-hidden">
        {/* Inner top glow */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[#ECECEC] text-[#667085] text-xs uppercase tracking-wider">
                <th className="py-5 px-6 text-start font-semibold">{t.serviceName}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.category}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.price}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.duration}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.homeService}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.status}</th>
                <th className="py-5 px-6 text-center font-semibold">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECECEC]">
              {!loading && servicesList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm font-semibold text-[#344054]">
                    {serviceCopy.noServices}
                  </td>
                </tr>
              )}
              {servicesList.map((service) => (
                <tr 
                  key={service.id} 
                  className="group hover:bg-gray-50/50 transition-all duration-300"
                >
                  {/* Name */}
                  <td className="py-5 px-6 font-medium text-[#101828] transition-colors duration-300 group-hover:text-[#D1AF47]">
                    {lang === "ar" ? service.name_ar : service.name_en}
                  </td>
                  
                  {/* Category */}
                  <td className="py-5 px-6">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white border border-[#ECECEC] text-[#344054] border border-[#ECECEC]">
                      {lang === "ar" ? service.category_ar : service.category_en}
                    </span>
                  </td>
                  
                  {/* Price */}
                  <td className="py-5 px-6 font-semibold text-[#D1AF47] tracking-wide">
                    {service.price}
                  </td>
                  
                  {/* Duration */}
                  <td className="py-5 px-6 text-[#344054]">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <span>{service.duration}</span>
                    </div>
                  </td>
                  
                  {/* Home Service Status */}
                  <td className="py-5 px-6">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
                      service.isHomeService 
                        ? "bg-[#D1AF47]/10 text-[#D1AF47] border border-[#D1AF47]/20 shadow-[0_0_10px_rgba(209,175,71,0.05)]" 
                        : "bg-white/5 text-[#667085] border border-[#ECECEC]"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${service.isHomeService ? 'bg-[#D1AF47]' : 'bg-[#7B859C]'}`}></span>
                      {service.isHomeService ? t.eligible : t.inStoreOnly}
                    </span>
                  </td>
                  
                  {/* Status Toggle */}
                  <td className="py-5 px-6">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
                      service.isActive 
                        ? "bg-[#3DDC84]/10 text-[#22C55E] border border-[#3DDC84]/20 shadow-[0_0_12px_rgba(61,220,132,0.1)]" 
                        : "bg-[#FF5D73]/10 text-[#EF4444] border border-[#FF5D73]/20"
                    }`}>
                      <span className="relative flex h-1.5 w-1.5">
                        {service.isActive && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${service.isActive ? 'bg-[#3DDC84]' : 'bg-[#FF5D73]'}`}></span>
                      </span>
                      {service.isActive ? t.active : t.inactive}
                    </span>
                  </td>
                  
                  {/* Actions Buttons */}
                  <td className="py-5 px-6 text-center">
                    <div className="flex justify-center items-center gap-3">
                      <button onClick={() => openEditService(service)} className="flex items-center gap-1 text-[#D1AF47] hover:text-[#D1AF47] transition-colors duration-300 text-xs font-semibold bg-[#D1AF47]/5 hover:bg-[#D1AF47]/10 px-3 py-1.5 rounded-lg border border-[#D1AF47]/10 hover:border-[#D1AF47]/30 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        {t.edit}
                      </button>
                      
                      <button onClick={() => void deleteService(service)} className="flex items-center gap-1 text-[#EF4444] hover:text-[#FF8093] transition-colors duration-300 text-xs font-semibold bg-[#FF5D73]/5 hover:bg-[#FF5D73]/10 px-3 py-1.5 rounded-lg border border-[#FEE4E2] hover:border-[#FF5D73]/30 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Services Grid Card (Mobile) */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {!loading && servicesList.length === 0 && (
          <div className="rounded-[24px] border border-[#D1AF47]/15 bg-white/90 p-6 text-center text-sm text-[#344054] shadow-[0_0_30px_rgba(209,175,71,0.08)]">
            {serviceCopy.noServices}
          </div>
        )}
        {servicesList.map((service) => (
          <div 
            key={service.id} 
            className="relative overflow-hidden bg-white border border-[#ECECEC] rounded-[24px] p-5 shadow-lg flex flex-col gap-4"
          >
            {/* Top Header */}
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white border border-[#ECECEC] text-[#344054] border border-[#ECECEC]">
                  {lang === "ar" ? service.category_ar : service.category_en}
                </span>
                <h4 className="text-base font-semibold text-[#101828]">
                  {lang === "ar" ? service.name_ar : service.name_en}
                </h4>
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                service.isActive 
                  ? "bg-[#3DDC84]/10 text-[#22C55E] border border-[#3DDC84]/20" 
                  : "bg-[#FF5D73]/10 text-[#EF4444] border border-[#FF5D73]/20"
              }`}>
                <span className={`w-1 h-1 rounded-full ${service.isActive ? 'bg-[#3DDC84]' : 'bg-[#FF5D73]'}`}></span>
                {service.isActive ? t.active : t.inactive}
              </span>
            </div>

            {/* Details (Price, Duration, Home service) */}
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-[rgba(255,255,255,0.04)] text-xs">
              <div>
                <p className="text-[#667085] mb-1 text-[10px] uppercase tracking-wider">{t.price}</p>
                <p className="font-bold text-[#D1AF47]">{service.price}</p>
              </div>
              <div>
                <p className="text-[#667085] mb-1 text-[10px] uppercase tracking-wider">{t.duration}</p>
                <p className="text-[#344054] font-medium">{service.duration}</p>
              </div>
              <div>
                <p className="text-[#667085] mb-1 text-[10px] uppercase tracking-wider">{t.homeService}</p>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  service.isHomeService ? "text-[#D1AF47]" : "text-[#667085]"
                }`}>
                  {service.isHomeService ? t.eligible : t.inStoreOnly}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => openEditService(service)} className="flex items-center gap-1 text-[#D1AF47] hover:text-[#D1AF47] transition-colors duration-300 text-xs font-semibold bg-[#D1AF47]/5 px-3 py-1.5 rounded-lg border border-[#D1AF47]/10 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                {t.edit}
              </button>
              <button onClick={() => void deleteService(service)} className="flex items-center gap-1 text-[#EF4444] hover:text-[#FF8093] transition-colors duration-300 text-xs font-semibold bg-[#FF5D73]/5 px-3 py-1.5 rounded-lg border border-[#FEE4E2] cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                {t.delete}
              </button>
            </div>
          </div>
        ))}
      </div>

      {serviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-[#ECECEC] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#101828]">
                  {serviceForm.id ? serviceCopy.editTitle : serviceCopy.addTitle}
                </h3>
                <p className="mt-1 text-xs text-[#667085]">{t.subtitle}</p>
              </div>
              <button onClick={() => setServiceModalOpen(false)} className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {serviceCopy.cancel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {serviceCopy.nameEn}
                <input value={serviceForm.nameEn} onChange={(event) => setServiceForm((form) => ({ ...form, nameEn: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {serviceCopy.nameAr}
                <input value={serviceForm.nameAr} onChange={(event) => setServiceForm((form) => ({ ...form, nameAr: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {serviceCopy.price}
                <input type="number" min="1" value={serviceForm.basePrice} onChange={(event) => setServiceForm((form) => ({ ...form, basePrice: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085]">
                {serviceCopy.duration}
                <input type="number" min="5" step="5" value={serviceForm.durationMinutes} onChange={(event) => setServiceForm((form) => ({ ...form, durationMinutes: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60" />
              </label>
              <label className="space-y-2 text-xs font-bold uppercase tracking-wider text-[#667085] sm:col-span-2">
                {serviceCopy.category}
                <select value={serviceForm.categoryId} onChange={(event) => setServiceForm((form) => ({ ...form, categoryId: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm normal-case tracking-normal text-[#101828] outline-none focus:border-[#D1AF47]/60">
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {lang === "ar" ? category.name_ar : category.name_en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-[#FBFAF7] px-4 py-3 text-sm font-bold text-[#344054]">
                {t.homeService}
                <input type="checkbox" checked={serviceForm.isHomeService} onChange={(event) => setServiceForm((form) => ({ ...form, isHomeService: event.target.checked }))} className="h-5 w-5 accent-[#D1AF47]" />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-[#ECECEC] bg-[#FBFAF7] px-4 py-3 text-sm font-bold text-[#344054]">
                {t.status}
                <input type="checkbox" checked={serviceForm.isActive} onChange={(event) => setServiceForm((form) => ({ ...form, isActive: event.target.checked }))} className="h-5 w-5 accent-[#D1AF47]" />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setServiceModalOpen(false)} className="rounded-xl border border-[#ECECEC] px-5 py-2.5 text-xs font-bold text-[#344054] hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">
                {serviceCopy.cancel}
              </button>
              <button onClick={() => void saveService()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2.5 text-xs font-black text-[#070B12] transition hover:bg-[#E0C46A] disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? serviceCopy.saving : serviceCopy.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
