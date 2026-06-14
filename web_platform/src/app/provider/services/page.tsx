"use client";

import React, { useState, useEffect } from "react";

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
    homeServicesCount: "Home Dispatch Eligible"
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
    homeServicesCount: "متاح للخدمة المنزلية"
  }
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

  // Mock service list
  const servicesList = [
    {
      id: "1",
      name_en: "Classic Mens Haircut & Wash",
      name_ar: "قص شعر رجالي كلاسيكي مع غسيل",
      category_en: "Haircuts & Styling",
      category_ar: "قص وتصفيف الشعر",
      price: "120 SAR",
      duration: "40 min",
      isHomeService: false,
      isActive: true
    },
    {
      id: "2",
      name_en: "Premium Beard Grooming & Shave",
      name_ar: "حلاقة وتحديد اللحية الممتازة",
      category_en: "Beard Care",
      category_ar: "العناية باللحية",
      price: "90 SAR",
      duration: "30 min",
      isHomeService: true,
      isActive: true
    },
    {
      id: "3",
      name_en: "Full Hair Coloring & Balayage",
      name_ar: "صبغ الشعر بالكامل وبلاياج",
      category_en: "Hair Coloring",
      category_ar: "صبغ الشعر",
      price: "450 SAR",
      duration: "120 min",
      isHomeService: true,
      isActive: true
    },
    {
      id: "4",
      name_en: "Luxury Facial Charcoal Mask",
      name_ar: "ماسك الفحم الفاخر للوجه",
      category_en: "Skincare",
      category_ar: "العناية بالبشرة",
      price: "180 SAR",
      duration: "45 min",
      isHomeService: false,
      isActive: false
    }
  ];

  return (
    <div 
      className="relative space-y-8 min-h-screen pb-12 transition-all duration-300"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      {/* Decorative top-right gold glow */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[radial-gradient(circle_800px_at_100%_0px,#D1AF47,transparent)] opacity-[0.03] pointer-events-none -z-10"></div>

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-[rgba(255,255,255,0.06)] pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span className="w-1.5 h-8 bg-[#D1AF47] rounded-full shadow-[0_0_15px_rgba(209,175,71,0.6)]"></span>
            {t.servicesTitle}
          </h2>
          <p className="text-sm text-[#7B859C] max-w-xl leading-relaxed">{t.subtitle}</p>
        </div>
        
        <button className="relative group overflow-hidden bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] px-6 py-3 rounded-[16px] text-sm font-bold shadow-[0_4px_20px_rgba(209,175,71,0.25)] hover:shadow-[0_0_30px_rgba(209,175,71,0.4)] transition-all duration-300 flex items-center gap-2 cursor-pointer active:scale-95">
          <span className="text-lg font-light leading-none transition-transform duration-300 group-hover:rotate-90">+</span>
          <span>{t.addService}</span>
          <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Services */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#172033] to-[#0D1422] border border-[rgba(255,255,255,0.06)] rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-[#D1AF47]/30 hover:shadow-[0_0_30px_rgba(209,175,71,0.05)] group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#7B859C] font-semibold">{t.totalServices}</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">{servicesList.length}</h3>
            </div>
            <div className="p-3 bg-gradient-to-br from-[#1A2236] to-[#0D1422] rounded-[16px] border border-white/5 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#D1AF47]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 2: Active Services */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#172033] to-[#0D1422] border border-[rgba(255,255,255,0.06)] rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-[#3DDC84]/30 hover:shadow-[0_0_30px_rgba(61,220,132,0.05)] group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#7B859C] font-semibold">{t.activeServices}</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {servicesList.filter((s) => s.isActive).length}
              </h3>
            </div>
            <div className="p-3 bg-gradient-to-br from-[#1A2236] to-[#0D1422] rounded-[16px] border border-white/5 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#3DDC84]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Card 3: Home Services */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#172033] to-[#0D1422] border border-[rgba(255,255,255,0.06)] rounded-[24px] p-6 shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:border-[#F5B041]/30 hover:shadow-[0_0_30px_rgba(245,176,65,0.05)] group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none"></div>
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#7B859C] font-semibold">{t.homeServicesCount}</p>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {servicesList.filter((s) => s.isHomeService).length}
              </h3>
            </div>
            <div className="p-3 bg-gradient-to-br from-[#1A2236] to-[#0D1422] rounded-[16px] border border-white/5 shadow-inner group-hover:scale-110 transition-transform duration-300">
              <svg className="w-6 h-6 text-[#F5B041]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Services Table Card (Desktop) */}
      <div className="hidden md:block relative bg-[#111827]/80 backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-[28px] shadow-2xl p-6 md:p-8 overflow-hidden">
        {/* Inner top glow */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.06)] text-[#7B859C] text-xs uppercase tracking-wider">
                <th className="py-5 px-6 text-start font-semibold">{t.serviceName}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.category}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.price}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.duration}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.homeService}</th>
                <th className="py-5 px-6 text-start font-semibold">{t.status}</th>
                <th className="py-5 px-6 text-center font-semibold">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.04)]">
              {servicesList.map((service) => (
                <tr 
                  key={service.id} 
                  className="group hover:bg-white/[0.01] transition-all duration-300"
                >
                  {/* Name */}
                  <td className="py-5 px-6 font-medium text-white transition-colors duration-300 group-hover:text-[#D1AF47]">
                    {lang === "ar" ? service.name_ar : service.name_en}
                  </td>
                  
                  {/* Category */}
                  <td className="py-5 px-6">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#172033] text-[#B8C0D4] border border-white/5">
                      {lang === "ar" ? service.category_ar : service.category_en}
                    </span>
                  </td>
                  
                  {/* Price */}
                  <td className="py-5 px-6 font-semibold text-[#D1AF47] tracking-wide">
                    {service.price}
                  </td>
                  
                  {/* Duration */}
                  <td className="py-5 px-6 text-[#B8C0D4]">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        : "bg-white/5 text-[#7B859C] border border-white/5"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${service.isHomeService ? 'bg-[#D1AF47]' : 'bg-[#7B859C]'}`}></span>
                      {service.isHomeService ? t.eligible : t.inStoreOnly}
                    </span>
                  </td>
                  
                  {/* Status Toggle */}
                  <td className="py-5 px-6">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
                      service.isActive 
                        ? "bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20 shadow-[0_0_12px_rgba(61,220,132,0.1)]" 
                        : "bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20"
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
                      <button className="flex items-center gap-1 text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300 text-xs font-semibold bg-[#D1AF47]/5 hover:bg-[#D1AF47]/10 px-3 py-1.5 rounded-lg border border-[#D1AF47]/10 hover:border-[#D1AF47]/30 cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                        {t.edit}
                      </button>
                      
                      <button className="flex items-center gap-1 text-[#FF5D73] hover:text-[#FF8093] transition-colors duration-300 text-xs font-semibold bg-[#FF5D73]/5 hover:bg-[#FF5D73]/10 px-3 py-1.5 rounded-lg border border-[#FF5D73]/10 hover:border-[#FF5D73]/30 cursor-pointer">
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
        {servicesList.map((service) => (
          <div 
            key={service.id} 
            className="relative overflow-hidden bg-[#111827]/90 backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-[24px] p-5 shadow-lg flex flex-col gap-4"
          >
            {/* Top Header */}
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#172033] text-[#B8C0D4] border border-white/5">
                  {lang === "ar" ? service.category_ar : service.category_en}
                </span>
                <h4 className="text-base font-semibold text-white">
                  {lang === "ar" ? service.name_ar : service.name_en}
                </h4>
              </div>
              
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                service.isActive 
                  ? "bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20" 
                  : "bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20"
              }`}>
                <span className={`w-1 h-1 rounded-full ${service.isActive ? 'bg-[#3DDC84]' : 'bg-[#FF5D73]'}`}></span>
                {service.isActive ? t.active : t.inactive}
              </span>
            </div>

            {/* Details (Price, Duration, Home service) */}
            <div className="grid grid-cols-3 gap-2 py-3 border-y border-[rgba(255,255,255,0.04)] text-xs">
              <div>
                <p className="text-[#7B859C] mb-1 text-[10px] uppercase tracking-wider">{t.price}</p>
                <p className="font-bold text-[#D1AF47]">{service.price}</p>
              </div>
              <div>
                <p className="text-[#7B859C] mb-1 text-[10px] uppercase tracking-wider">{t.duration}</p>
                <p className="text-[#B8C0D4] font-medium">{service.duration}</p>
              </div>
              <div>
                <p className="text-[#7B859C] mb-1 text-[10px] uppercase tracking-wider">{t.homeService}</p>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  service.isHomeService ? "text-[#D1AF47]" : "text-[#7B859C]"
                }`}>
                  {service.isHomeService ? t.eligible : t.inStoreOnly}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button className="flex items-center gap-1 text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300 text-xs font-semibold bg-[#D1AF47]/5 px-3 py-1.5 rounded-lg border border-[#D1AF47]/10 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                {t.edit}
              </button>
              <button className="flex items-center gap-1 text-[#FF5D73] hover:text-[#FF8093] transition-colors duration-300 text-xs font-semibold bg-[#FF5D73]/5 px-3 py-1.5 rounded-lg border border-[#FF5D73]/10 cursor-pointer">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                {t.delete}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
