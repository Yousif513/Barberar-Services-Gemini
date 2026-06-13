"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    title: "Specialist & Staff Management",
    subtitle: "Roster settings, shift allocations, and performance indicators for salon employees",
    introTitle: "Empower Your Styling Roster",
    introDesc: "Manage independent stylists, master barbers, and therapists from a single dashboard. Assign services, monitor availability, and track client reviews for each team member.",
    feature1Title: "Interactive Shift Calendar",
    feature1Desc: "Configure working hours, breaks, and holiday schedules. Our scheduling engine locks time slots automatically during prayer-time buffers.",
    feature2Title: "Style & Service Mapping",
    feature2Desc: "Control which specialist can perform which treatments. Optimize calendar utilization by matching client requests with active, verified skills.",
    feature3Title: "Performance Tracking & Reviews",
    feature3Desc: "Clients rate their specialist directly post-service. View star ratings and feedback for each staff member to maintain premium standards.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    title: "إدارة الموظفين والأخصائيين",
    subtitle: "إعدادات القوائم، تخصيص النوبات، ومؤشرات الأداء لموظفي الصالون",
    introTitle: "مكّن فريق عملك الفني",
    introDesc: "قم بإدارة المصممين والحلاقين والمعالجين من لوحة تحكم واحدة. عيّن الخدمات، وتابع أوقات الدوام، واطلع على تقييمات العملاء لكل عضو في الفريق.",
    feature1Title: "تقويم نوبات تفاعلي",
    feature1Desc: "اضبط ساعات العمل، أوقات الاستراحة، وجداول الإجازات. يقوم محرك الجدولة بقفل الفترات تلقائياً خلال أوقات الصلاة بالرياض.",
    feature2Title: "تخصيص وتعيين الخدمات للموظف",
    feature2Desc: "حدد الخدمات التي يمكن لكل أخصائي تقديمها. حسّن إنتاجية الموظفين من خلال مطابقة مهاراتهم مع طلبات العملاء النشطة.",
    feature3Title: "متابعة الأداء وتقييمات العملاء",
    feature3Desc: "يقوم العملاء بتقييم الأخصائيين مباشرة بعد الخدمة. اطلع على متوسط النجوم وملاحظات العملاء لكل موظف للحفاظ على المعايير الراقية.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function StaffManagementPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const interval = setInterval(handleLangSync, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased flex flex-col justify-between">
      
      {/* Mini Header */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-serif font-black tracking-widest text-stone-900">
          PRIMORA
        </Link>
        <Link href="/" className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-950 transition">
          {t.backHome}
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-16 px-6 sm:px-8 space-y-12 flex-1">
        
        {/* Title Section */}
        <div className="space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">For Partners</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight">{t.title}</h1>
          <p className="text-xs sm:text-sm text-stone-500 leading-relaxed font-light">
            {t.subtitle}
          </p>
        </div>

        <hr className="border-stone-200" />

        {/* Intro */}
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-bold text-stone-950">{t.introTitle}</h2>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.introDesc}</p>
        </div>

        {/* Features List */}
        <div className="space-y-6 pt-4">
          <div className="bg-white border border-stone-200 p-6 rounded-2xl space-y-2 shadow-sm">
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.feature1Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.feature1Desc}</p>
          </div>

          <div className="bg-white border border-stone-200 p-6 rounded-2xl space-y-2 shadow-sm">
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.feature2Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.feature2Desc}</p>
          </div>

          <div className="bg-white border border-stone-200 p-6 rounded-2xl space-y-2 shadow-sm">
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.feature3Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.feature3Desc}</p>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
