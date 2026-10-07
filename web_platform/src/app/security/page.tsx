"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    security: "VAT and Payments",
    title: "Payments and Invoices",
    subtitle: "How we handle VAT, payments and your data",
    section1Title: "1. VAT (15%) & Tax Breakdown",
    section1Desc: "Every booking shows the 15% Value-Added Tax (VAT) as a separate line. Digital receipts and transaction summaries are available in the customer and provider portals.",
    section2Title: "2. Card Payments and Connections",
    section2Desc: "Card payments are entered on Tap Payments' hosted page, so Primora never receives or stores your card number. Connections to Primora use HTTPS encryption.",
    section3Title: "3. Fees and Payouts",
    section3Desc: "Bookings a provider brings from its own clients carry no commission. A new client found through the Primora marketplace carries a 20% commission on the first visit (minimum SAR 10, maximum SAR 40); repeat visits from that client carry none. Each booking is recorded in the ledger. The provider's share becomes payable after the visit is completed and is paid out to its registered bank account when the provider requests a payout.",
    sealCardLabel: "Card details",
    sealCardText: "Entered on Tap's page",
    sealVatLabel: "VAT 15%",
    sealVatText: "Shown on every booking",
    sealConnLabel: "Connection",
    sealConnText: "HTTPS",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    security: "الضريبة والمدفوعات",
    title: "المدفوعات والفواتير",
    subtitle: "كيف نتعامل مع ضريبة القيمة المضافة والمدفوعات وبياناتك",
    section1Title: "1. ضريبة القيمة المضافة (15%) وتفاصيل الفواتير",
    section1Desc: "يظهر في كل حجز بند مستقل لضريبة القيمة المضافة (15%). وتتوفر الإيصالات الرقمية وملخصات المعاملات في بوابتي العميل ومقدم الخدمة.",
    section2Title: "2. الدفع بالبطاقة والاتصال",
    section2Desc: "تُدخل بيانات البطاقة في صفحة Tap Payments المستضافة، لذلك لا تستلم بريمورا رقم بطاقتك ولا تخزنه. الاتصال ببريمورا مشفر عبر HTTPS.",
    section3Title: "3. الرسوم وصرف المستحقات",
    section3Desc: "لا عمولة على الحجوزات التي يجلبها مقدم الخدمة من عملائه. العميل الجديد القادم من سوق بريمورا عليه عمولة 20% في الزيارة الأولى (بحد أدنى 10 ر.س وأقصى 40 ر.س) ولا عمولة على زياراته المتكررة. يُسجَّل كل حجز في دفتر الحسابات. تصبح حصة مقدم الخدمة مستحقة بعد اكتمال الزيارة، وتُحوَّل إلى حسابه البنكي المسجّل عندما يطلب التحويل.",
    sealCardLabel: "بيانات البطاقة",
    sealCardText: "تُدخل في صفحة Tap",
    sealVatLabel: "ضريبة 15%",
    sealVatText: "تظهر في كل حجز",
    sealConnLabel: "الاتصال",
    sealConnText: "HTTPS",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function SecurityPage() {
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
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.security}</span>
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

        {/* Security Seals */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4 text-center">
          <div className="border border-stone-200 p-4 rounded-2xl bg-white space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">{t.sealCardLabel}</span>
            <span className="text-xs font-bold text-stone-950 block">{t.sealCardText}</span>
          </div>
          <div className="border border-stone-200 p-4 rounded-2xl bg-white space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">{t.sealVatLabel}</span>
            <span className="text-xs font-bold text-stone-950 block">{t.sealVatText}</span>
          </div>
          <div className="border border-stone-200 p-4 rounded-2xl bg-white space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">{t.sealConnLabel}</span>
            <span className="text-xs font-bold text-stone-950 block">{t.sealConnText}</span>
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
