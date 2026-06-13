"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    become: "Grow Your Business",
    title: "Join Riyadh's Finest Beauty & Grooming Collective",
    subtitle: "List your salon, barbershop, or spa, and instantly accept secure bookings.",
    ctaRegister: "Register as Provider",
    value1Title: "Escrow Split Payouts",
    value1Desc: "Secure Tap Connect integrations process card splits automatically, depositing funds straight into your business ledger.",
    value2Title: "Riyadh Geofencing",
    value2Desc: "Efficient logistics dispatch controls for premium in-home or in-salon booking coordinates.",
    value3Title: "Staff & Availability Engine",
    value3Desc: "Customize specialist calendars, shifts, services, and block slots automatically during Riyadh prayer-time intervals.",
    planTitle: "SaaS Platform Tiers",
    planBasicName: "Primora Basic",
    planBasicPrice: "Free",
    planBasicDesc: "Core calendar management and basic bookings processing with a 15% platform commission split.",
    planProName: "Primora Growth & Pro",
    planProPrice: "299 SAR / month",
    planProDesc: "Advanced staff rosters, physical room resources allocation, geofenced travel limits, and client notes CRM.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    become: "نمّ تجارتك معنا",
    title: "انضم إلى نخبة صالونات ومحترفي التجميل بالرياض",
    subtitle: "قم بإدراج صالونك، أو محل الحلاقة، أو السبا الخاص بك وابدأ في استقبال حجوزات آمنة فوراً.",
    ctaRegister: "سجل كمزود خدمة الآن",
    value1Title: "مدفوعات الضمان المقسمة",
    value1Desc: "تكامل آمن مع Tap Connect لمعالجة وتقسيم المدفوعات آلياً وإيداعها مباشرة في حسابك التجاري.",
    value2Title: "نطاق الخدمة الجغرافي بالرياض",
    value2Desc: "تحكم مرن وبسيط في الخدمات اللوجستية وتعيين إحداثيات الخدمة المنزلية أو الحضور للصالون.",
    value3Title: "محرك جدولة الموظفين والأوقات",
    value3Desc: "خصص جداول موظفيك، نوبات العمل، والخدمات، مع قفل تلقائي للمواعيد خلال فترات الصلاة بالرياض.",
    planTitle: "باقات اشتراك المنصة (SaaS)",
    planBasicName: "بريمورا الأساسية",
    planBasicPrice: "مجانًا",
    planBasicDesc: "إدارة التقويم الأساسية ومعالجة الحجوزات مع اقتطاع عمولة المنصة القياسية بنسبة 15%.",
    planProName: "بريمورا للمحترفين والنمو",
    planProPrice: "299 ريال / شهريًا",
    planProDesc: "جداول نوبات الموظفين المتقدمة، توزيع موارد الغرف الفيزيائية، تحديد نطاقات السفر الجغرافية، ونظام CRM لملاحظات تفضيلات العملاء.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function BecomeProviderPage() {
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
      <main className="max-w-4xl mx-auto py-16 px-6 sm:px-8 space-y-16 flex-1">
        
        {/* Title Section */}
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.become}</span>
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-950 tracking-tight leading-tight max-w-3xl mx-auto">{t.title}</h1>
          <p className="text-sm sm:text-base text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
            {t.subtitle}
          </p>
          <div className="pt-4">
            <Link href="/login" className="px-8 py-3.5 bg-stone-900 text-stone-50 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-stone-800 transition shadow-md inline-block">
              {t.ctaRegister}
            </Link>
          </div>
        </div>

        {/* Hero visual */}
        <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden border border-stone-200 shadow-lg relative bg-stone-100">
          <img 
            src="https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?q=80&w=1200&auto=format&fit=crop" 
            alt="Luxury unisex salon and workspace" 
            className="w-full h-full object-cover" 
          />
          <div className="absolute inset-0 bg-stone-950/10" />
        </div>

        <hr className="border-stone-200" />

        {/* Core Value Prop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              $
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value1Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value1Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              L
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value2Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value2Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              C
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value3Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value3Desc}</p>
          </div>
        </div>

        <hr className="border-stone-200" />

        {/* Pricing Plan Grid */}
        <div className="space-y-8">
          <h2 className="text-xl font-serif font-bold text-stone-950 text-center">{t.planTitle}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Plan 1 */}
            <div className="bg-white border border-stone-200 p-8 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between hover:border-black transition">
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Standard Commission</span>
                <h3 className="font-bold text-base text-stone-950">{t.planBasicName}</h3>
                <h4 className="text-2xl font-black text-stone-900">{t.planBasicPrice}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-light">{t.planBasicDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-center font-bold text-xs rounded-xl block transition">
                  {t.ctaRegister}
                </Link>
              </div>
            </div>

            {/* Plan 2 */}
            <div className="bg-stone-950 text-white border border-stone-900 p-8 rounded-2xl space-y-4 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[hsla(45,60%,55%,0.04)] rounded-full blur-2xl" />
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-[hsl(45,60%,55%)] uppercase tracking-wider border border-stone-850 px-2 py-0.5 rounded bg-stone-900">Recommended</span>
                </div>
                <h3 className="font-bold text-base text-white">{t.planProName}</h3>
                <h4 className="text-2xl font-black text-[hsl(45,60%,55%)]">{t.planProPrice}</h4>
                <p className="text-xs text-stone-400 leading-relaxed font-light">{t.planProDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full py-2.5 bg-[hsl(45,60%,55%)] text-black text-center font-bold text-xs rounded-xl block hover:bg-[hsl(45,60%,45%)] transition">
                  {t.ctaRegister}
                </Link>
              </div>
            </div>
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
