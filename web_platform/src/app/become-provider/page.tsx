"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    promoText: "Book Premier Home Service & Salon Appointments in Riyadh",
    promoSub: "Get 15% off your first booking - Use code:",
    home: "Home",
    discover: "Services",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    title: "Join Riyadh's Finest Beauty & Grooming Collective",
    subtitle: "List your salon, barbershop, or spa, and instantly accept secure bookings.",
    ctaRegister: "Register as Provider Now",
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
    footerDesc: "Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh artists with selective clients.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Riyadh, Saudi Arabia.",
    popular: "Popular",
    standardComm: "Standard Commission"
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات بالرياض",
    promoSub: "احصل على خصم 15% على حجزك الأول - استخدم الرمز:",
    home: "الرئيسية",
    discover: "الخدمات",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
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
    footerDesc: "منصة الجمال الفاخرة، والعناية والعافية. نصل بين أفضل فناني الرياض والعملاء المميزين.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للرياض، المملكة العربية السعودية.",
    popular: "شائع",
    standardComm: "عمولة قياسية"
  }
};

export default function BecomeProviderRootPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("primora_lang", locale);
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const isRTL = locale === "ar";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased">
      {/* 1. TOP PROMO BAR */}
      <div className="w-full bg-stone-100 border-b border-stone-200 py-2.5 px-4 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-stone-600 uppercase flex items-center justify-center gap-4">
        <span>{t.promoText}</span>
      </div>

      {/* 2. HEADER */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <Link href="/" className="text-2xl font-serif font-black tracking-widest text-stone-900 hover:opacity-80 transition flex-shrink-0">
          PRIMORA
        </Link>
        <nav className="hidden lg:flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-wider text-stone-500 flex-1 mx-8">
          <Link href="/" className="hover:text-stone-950 transition-colors">{t.home}</Link>
          <Link href="/services" className="hover:text-stone-950 transition-colors">{t.discover}</Link>
          <Link href="/service-board" className="hover:text-stone-950 transition-colors">{t.serviceBoard}</Link>
          <Link href="/become-provider" className="text-stone-900 hover:text-stone-900 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/services" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          <div className="h-4 w-px bg-stone-200"></div>
          <button
            onClick={toggleLanguage}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-[10px] font-extrabold hover:border-black transition"
          >
            {locale === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* 3. MAIN CONTENT */}
      <main className="max-w-4xl mx-auto py-16 px-6 sm:px-8 space-y-16 flex-grow">
        {/* Title Section */}
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.becomeProvider}</span>
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

        {/* Value Prop */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              SAR
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value1Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value1Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              G
            </div>
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.value2Title}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.value2Desc}</p>
          </div>

          <div className="space-y-3">
            <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-800">
              E
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
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">{t.standardComm}</span>
                <h3 className="font-bold text-base text-stone-950">{t.planBasicName}</h3>
                <h4 className="text-2xl font-black text-stone-900">{t.planBasicPrice}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-light">{t.planBasicDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full text-center py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-900 rounded-lg text-xs font-bold uppercase tracking-wider block transition">
                  {t.signup}
                </Link>
              </div>
            </div>

            {/* Plan 2 */}
            <div className="bg-white border-2 border-stone-950 p-8 rounded-2xl space-y-4 shadow-md flex flex-col justify-between relative">
              <span className="absolute -top-3 right-6 bg-stone-900 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded">
                {t.popular}
              </span>
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">SaaS Subscription</span>
                <h3 className="font-bold text-base text-stone-950">{t.planProName}</h3>
                <h4 className="text-2xl font-black text-stone-900">{t.planProPrice}</h4>
                <p className="text-xs text-stone-500 leading-relaxed font-light">{t.planProDesc}</p>
              </div>
              <div className="pt-4">
                <Link href="/login" className="w-full text-center py-2.5 bg-stone-900 hover:bg-stone-850 text-stone-50 rounded-lg text-xs font-bold uppercase tracking-wider block transition shadow-sm">
                  {locale === "ar" ? "اشترك الآن" : "Subscribe Now"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 4. FOOTER */}
      <footer className="bg-stone-950 text-stone-400 py-12 px-6 sm:px-12 border-t border-stone-900 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <h4 className="text-white font-serif font-black tracking-widest text-lg">PRIMORA</h4>
            <p className="text-xs text-stone-500 font-light leading-relaxed">
              {t.footerDesc}
            </p>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerDiscover}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/categories/barber" className="hover:text-white transition">{locale === "ar" ? "قص الشعر والحلاقة" : "Haircuts & Barbering"}</Link></li>
              <li><Link href="/categories/hair" className="hover:text-white transition">{locale === "ar" ? "تصفيف وتلوين الشعر" : "Hair Styling & Color"}</Link></li>
              <li><Link href="/categories/spa" className="hover:text-white transition">{locale === "ar" ? "غرف السبا والعافية" : "Wellness & Spa Rooms"}</Link></li>
              <li><Link href="/categories/makeup" className="hover:text-white transition">{locale === "ar" ? "المكياج ومستحضرات التجميل" : "Makeup & Cosmetics"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerPartners}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/become-provider" className="hover:text-white transition">{t.becomeProvider}</Link></li>
              <li><Link href="/provider/staff-management" className="hover:text-white transition">{locale === "ar" ? "إدارة شؤون الموظفين" : "Staff Management"}</Link></li>
              <li><Link href="/provider/pricing" className="hover:text-white transition">{locale === "ar" ? "التسعير المشترك" : "Split Ledger Pricing"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerLegal}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-white transition">{locale === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">{locale === "ar" ? "شروط الخدمة" : "Terms of Service"}</Link></li>
              <li><Link href="/security" className="hover:text-white transition">{locale === "ar" ? "هيئة الزكاة والمدفوعات" : "ZATCA & Payments"}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. {t.allRightsReserved}</p>
        </div>
      </footer>
    </div>
  );
}
