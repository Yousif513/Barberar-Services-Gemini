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
    inStoreOnly: "In-store Only"
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
    inStoreOnly: "في الصالون فقط"
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
    <div className="space-y-8">
      
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[hsl(45,60%,55%)]">{t.servicesTitle}</h2>
          <p className="text-sm text-[hsl(210,8%,65%)] mt-1">{t.subtitle}</p>
        </div>
        
        <button className="bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] px-5 py-2.5 rounded-lg text-sm font-semibold shadow-[0_0_15px_hsla(45,60%,55%,0.2)] hover:scale-[1.02] transition-transform duration-200">
          + {t.addService}
        </button>
      </div>

      {/* Services Table Card */}
      <div className="bg-[hsl(220,12%,14%)] border border-[hsla(0,0%,100%,0.08)] rounded-xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-[hsla(0,0%,100%,0.08)] text-[hsl(210,8%,65%)] text-xs uppercase">
                <th className="py-4 px-4 text-start">{t.serviceName}</th>
                <th className="py-4 px-4 text-start">{t.category}</th>
                <th className="py-4 px-4 text-start">{t.price}</th>
                <th className="py-4 px-4 text-start">{t.duration}</th>
                <th className="py-4 px-4 text-start">{t.homeService}</th>
                <th className="py-4 px-4 text-start">{t.status}</th>
                <th className="py-4 px-4 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {servicesList.map((service) => (
                <tr key={service.id} className="border-b border-[hsla(0,0%,100%,0.03)] hover:bg-[hsla(0,0%,100%,0.01)] transition-colors duration-200">
                  {/* Name */}
                  <td className="py-4 px-4 font-medium">
                    {lang === "ar" ? service.name_ar : service.name_en}
                  </td>
                  {/* Category */}
                  <td className="py-4 px-4 text-[hsl(210,8%,65%)]">
                    {lang === "ar" ? service.category_ar : service.category_en}
                  </td>
                  {/* Price */}
                  <td className="py-4 px-4 font-semibold">{service.price}</td>
                  {/* Duration */}
                  <td className="py-4 px-4 text-[hsl(210,8%,65%)]">{service.duration}</td>
                  {/* Home Service Status */}
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      service.isHomeService 
                        ? "bg-[hsla(45,60%,55%,0.08)] text-[hsl(45,60%,55%)]" 
                        : "bg-[hsla(0,0%,100%,0.03)] text-[hsl(210,8%,65%)]"
                    }`}>
                      {service.isHomeService ? t.eligible : t.inStoreOnly}
                    </span>
                  </td>
                  {/* Status Toggle */}
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      service.isActive 
                        ? "bg-[hsla(150,60%,40%,0.08)] text-[hsl(150,60%,40%)]" 
                        : "bg-[hsla(355,75%,50%,0.08)] text-[hsl(355,75%,50%)]"
                    }`}>
                      {service.isActive ? t.active : t.inactive}
                    </span>
                  </td>
                  {/* Actions Buttons */}
                  <td className="py-4 px-4 text-center">
                    <div className="flex justify-center gap-3">
                      <button className="text-[hsl(45,60%,55%)] hover:underline text-xs font-semibold">
                        {t.edit}
                      </button>
                      <span className="text-[hsla(0,0%,100%,0.08)]">|</span>
                      <button className="text-[hsl(355,75%,50%)] hover:underline text-xs font-semibold">
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

    </div>
  );
}
