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
  const [locale, setLocale] = useState<"en" | "ar">("ar");
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
    <div 
      className="min-h-screen bg-transparent text-[#FFFFFF] font-sans antialiased flex flex-col justify-between selection:bg-[#D1AF47]/20 selection:text-[#D1AF47]"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      
      {/* Mini Header */}
      <header className="bg-[#0B0F17]/90 backdrop-blur-md border-b border-white/[0.06] py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link 
          href="/" 
          className="text-xl font-bold tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-all duration-300"
        >
          PRIMORA
        </Link>
        <Link 
          href="/" 
          className="text-xs font-semibold uppercase tracking-wider text-[#B8C0D4] hover:text-[#F4E7B6] border border-white/[0.08] bg-white/[0.03] hover:bg-[#D1AF47]/10 hover:border-[#D1AF47]/30 px-4 py-2 rounded-full transition-all duration-300"
        >
          {t.backHome}
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-16 px-6 sm:px-8 space-y-12 flex-1 w-full">
        
        {/* Title Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111827] border border-white/5 text-[10px] tracking-widest uppercase font-extrabold text-[#D1AF47] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84] animate-pulse"></span>
            <span>For Partners</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#FFFFFF] tracking-tight">{t.title}</h1>
          <p className="text-sm text-[#B8C0D4] leading-relaxed font-light">
            {t.subtitle}
          </p>
        </div>

        <hr className="border-white/5" />

        {/* Intro Card */}
        <div className="bg-gradient-to-r from-[#111827] to-[#0D1422] p-8 rounded-[24px] border border-white/5 relative overflow-hidden shadow-xl">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#D1AF47]/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-lg font-bold text-[#FFFFFF] mb-3">{t.introTitle}</h2>
          <p className="text-xs sm:text-sm text-[#B8C0D4] leading-relaxed font-light">{t.introDesc}</p>
        </div>

        {/* Features List */}
        <div className="space-y-6 pt-4">
          {/* Feature 1 */}
          <div className="group bg-[#111827] border border-white/5 p-6 rounded-[24px] flex flex-col sm:flex-row gap-5 items-start hover:bg-[#172033] hover:border-[#D1AF47]/20 hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(7,11,18,0.5),0_0_20px_rgba(209,175,71,0.05)] transition-all duration-300">
            <div className="flex-shrink-0 w-12 h-12 rounded-[16px] bg-gradient-to-br from-[#D1AF47]/20 to-[#B8952E]/5 border border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-[#FFFFFF] uppercase tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">{t.feature1Title}</h3>
              <p className="text-xs sm:text-sm text-[#B8C0D4] leading-relaxed font-light">{t.feature1Desc}</p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="group bg-[#111827] border border-white/5 p-6 rounded-[24px] flex flex-col sm:flex-row gap-5 items-start hover:bg-[#172033] hover:border-[#D1AF47]/20 hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(7,11,18,0.5),0_0_20px_rgba(209,175,71,0.05)] transition-all duration-300">
            <div className="flex-shrink-0 w-12 h-12 rounded-[16px] bg-gradient-to-br from-[#D1AF47]/20 to-[#B8952E]/5 border border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7a1 1 0 11-2 0 1 1 0 012 0zm-5 4a5 5 0 100-10 5 5 0 000 10zm0 0L9 19m8.25-12a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-[#FFFFFF] uppercase tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">{t.feature2Title}</h3>
              <p className="text-xs sm:text-sm text-[#B8C0D4] leading-relaxed font-light">{t.feature2Desc}</p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="group bg-[#111827] border border-white/5 p-6 rounded-[24px] flex flex-col sm:flex-row gap-5 items-start hover:bg-[#172033] hover:border-[#D1AF47]/20 hover:scale-[1.01] hover:shadow-[0_10px_30px_rgba(7,11,18,0.5),0_0_20px_rgba(209,175,71,0.05)] transition-all duration-300">
            <div className="flex-shrink-0 w-12 h-12 rounded-[16px] bg-gradient-to-br from-[#D1AF47]/20 to-[#B8952E]/5 border border-[#D1AF47]/30 flex items-center justify-center text-[#D1AF47] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.367 1.243.583 1.83l-3.97 2.9a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.9a1 1 0 00-1.175 0l-3.97 2.9c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118l-3.97-2.9c-.784-.57-.378-1.83.582-1.83h4.907a1 1 0 00.95-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-xs text-[#FFFFFF] uppercase tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">{t.feature3Title}</h3>
              <p className="text-xs sm:text-sm text-[#B8C0D4] leading-relaxed font-light">{t.feature3Desc}</p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="pt-6 flex justify-center">
          <Link 
            href="/" 
            className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-semibold text-sm tracking-wide transition-all duration-300 shadow-[0_4px_20px_rgba(209,175,71,0.15)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.3)] hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>{t.backHome}</span>
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${locale === 'ar' ? 'rotate-180 group-hover:-translate-x-1' : 'group-hover:translate-x-1'}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={locale === 'ar' ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-[#0B0F17] border-t border-white/[0.06] py-8 text-center text-xs text-[#7B859C] font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
