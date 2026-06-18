"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Service Packages",
    subtitle: "Manage bundled discount offers, wellness passes, and multi-session vouchers.",
    loading: "Loading wellness packages...",
    totalPackages: "Total Packages",
    activeVouchers: "Active Vouchers",
    redeemedRatio: "Redemption Rate",
    packageName: "Package Name",
    includedServices: "Included Services",
    packagePrice: "Package Price",
    redemptionCount: "Redeemed Vouchers",
    status: "Status",
    active: "Active",
    inactive: "Inactive",
    verifyBtn: "Toggle Status",
    successMsg: "Package status updated successfully!"
  },
  ar: {
    title: "باقات الخدمات وعروض التوفير",
    subtitle: "إدارة باقات الخدمات المجمعة، بطاقات جلسات العناية المتعددة، وقسائم الخصم.",
    loading: "جاري تحميل الباقات والاشتراكات...",
    totalPackages: "إجمالي الباقات",
    activeVouchers: "القسائم النشطة",
    redeemedRatio: "معدل استخدام القسائم",
    packageName: "اسم الباقة",
    includedServices: "الخدمات المشمولة",
    packagePrice: "سعر الباقة",
    redemptionCount: "القسائم المستخدمة",
    status: "الحالة",
    active: "نشط",
    inactive: "غير نشط",
    verifyBtn: "تعديل الحالة",
    successMsg: "تم تحديث حالة الباقة بنجاح!"
  }
};

export default function AdminPackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    // Offline fallback simulator
    setPackages([
      { id: "pkg-1", nameEn: "Bridal Splendor Pack", nameAr: "باقة العروس الملكية", servicesEn: "Hairstyle, Bridal Makeup, Spa Pedicure", servicesAr: "تسريحة شعر، مكياج عروس، سبا باديكير", price: 1500, redemptions: 48, is_active: true },
      { id: "pkg-2", nameEn: "Groom Signature Grooming", nameAr: "باقة العريس الخاصة", servicesEn: "Premium Haircut, Beard Trim, Charcoal Facial", servicesAr: "قصة شعر فاخرة، تحديد لحية، فيشيل بالفحم", price: 350, redemptions: 112, is_active: true },
      { id: "pkg-3", nameEn: "Weekend Relaxation Ritual", nameAr: "طقوس الاسترخاء الأسبوعية", servicesEn: "Hot Stone Massage, Facial Glow, Hand Care", servicesAr: "مساج الأحجار الحارة، نضارة البشرة، عناية باليدين", price: 500, redemptions: 84, is_active: true }
    ]);
    setLoading(false);
  }, []);

  const handleToggle = (id: string) => {
    setSuccess("");
    setPackages(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
    setSuccess(translations[lang].successMsg);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalPackages}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{packages.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeVouchers}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">244</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.redeemedRatio}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">88.5%</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packageName}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.includedServices}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packagePrice}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.redemptionCount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className="py-4 px-6 text-right"></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {packages.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-bold text-gray-900">{lang === "ar" ? p.nameAr : p.nameEn}</td>
                  <td className="py-4 px-6">{lang === "ar" ? p.servicesAr : p.servicesEn}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{p.price} {lang === "ar" ? "ريال" : "SAR"}</td>
                  <td className="py-4 px-6 font-serif font-black">{p.redemptions}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${p.is_active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"}`}>{p.is_active ? t.active : t.inactive}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <button onClick={() => handleToggle(p.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.verifyBtn}</button>
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
