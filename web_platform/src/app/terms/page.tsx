"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    terms: "Terms of Service",
    title: "Marketplace Terms & Rules",
    subtitle: "Rules governing payments, booking settlements, and cancellation policies",
    section1Title: "1. Online Booking & Payment Processing",
    section1Desc: "When a customer books on Primora, the deposit is paid by card through Tap Payments. The provider's share is recorded in the ledger and is paid out to the provider's registered bank account when the provider requests a payout.",
    section2Title: "2. Client Cancellation & Refunds",
    section2Desc: "Each shop sets its free-cancellation window and its late-cancellation and no-show fees. They are shown on the shop page before you book and apply automatically when you cancel. If the shop cancels, you receive a full refund.",
    section3Title: "3. Fees and Payouts",
    section3Desc: "Bookings a provider brings from its own clients carry no commission. A new client found through the Primora marketplace carries a 20% commission on the first visit (minimum SAR 10, maximum SAR 40); repeat visits from that client carry none. Each booking is recorded in the ledger. The provider's share becomes payable after the visit is completed and is paid out to its registered bank account when the provider requests a payout.",
    help: "For help with a booking, open it in your dashboard bookings tab, or write to",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    terms: "شروط الخدمة",
    title: "شروط وقواعد المنصة",
    subtitle: "القواعد المنظمة للمدفوعات، تسوية الحجوزات وسياسات الإلغاء",
    section1Title: "1. الحجز والدفع الإلكتروني",
    section1Desc: "عند الحجز على بريمورا يدفع العميل العربون بالبطاقة عبر Tap Payments. وتُسجَّل حصة مقدم الخدمة في دفتر الحسابات وتُحوَّل إلى حسابه البنكي المسجّل عندما يطلب التحويل.",
    section2Title: "2. إلغاء الموعد واسترداد الأموال",
    section2Desc: "يحدد كل مركز مدة الإلغاء المجاني ورسوم الإلغاء المتأخر وعدم الحضور، وتظهر في صفحة المركز قبل الحجز وتُطبق تلقائياً عند الإلغاء. وإذا ألغى المركز الموعد تسترد المبلغ كاملاً.",
    section3Title: "3. الرسوم وصرف المستحقات",
    section3Desc: "لا عمولة على الحجوزات التي يجلبها مقدم الخدمة من عملائه. العميل الجديد القادم من سوق بريمورا عليه عمولة 20% في الزيارة الأولى (بحد أدنى 10 ر.س وأقصى 40 ر.س) ولا عمولة على زياراته المتكررة. يُسجَّل كل حجز في دفتر الحسابات. تصبح حصة مقدم الخدمة مستحقة بعد اكتمال الزيارة، وتُحوَّل إلى حسابه البنكي المسجّل عندما يطلب التحويل.",
    help: "للمساعدة في حجز، افتحه من تبويب الحجوزات في لوحتك، أو راسلنا على",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function TermsPage() {
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
    <div 
      className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased flex flex-col justify-between"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      
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
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.terms}</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight">{t.title}</h1>
          <p className="text-xs sm:text-sm text-stone-500 leading-relaxed font-light">
            {t.subtitle}
          </p>
        </div>

        <hr className="border-stone-200" />

        {/* Sections */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section1Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section1Desc}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section2Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section2Desc}</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide">{t.section3Title}</h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">{t.section3Desc}</p>
          </div>
        </div>

        {/* Callout */}
        <div className="bg-stone-100 border border-stone-200 p-6 rounded-2xl text-xs text-stone-600 font-light leading-relaxed">
          {t.help} <span dir="ltr" className="font-bold text-stone-900">support@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
