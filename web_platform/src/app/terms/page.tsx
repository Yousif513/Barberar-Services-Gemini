"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    terms: "Terms of Service",
    title: "Marketplace Terms & Rules",
    subtitle: "Rules governing payments, escrow splits, and cancellation policies",
    section1Title: "1. The Escrow Booking Model",
    section1Desc: "When a customer schedules a grooming session on Primora, their payment is authorized and captured into a secure escrow hold. These funds are held safely by our partner payment processor (Tap Connect) and are only released to the service provider after the appointment is marked complete.",
    section2Title: "2. Client Cancellation & Refunds",
    section2Desc: "Clients can cancel bookings up to 24 hours prior to the scheduled slot without penalty. For cancellations within 24 hours, the platform reserves the right to charge up to 50% of the booking total to compensate the specialist for their lost time slot.",
    section3Title: "3. Split Payout Allocations",
    section3Desc: "Our platform collects a standard 15% commission fee from every transaction to cover escrow management, WhatsApp OTP notifications, and system servers. The remaining 85% is routed directly to the service provider's bank ledger.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    terms: "شروط الخدمة",
    title: "شروط وقواعد المنصة",
    subtitle: "القواعد المنظمة للمدفوعات، تقسيمات الضمان وسياسات الإلغاء",
    section1Title: "1. نظام حجز الضمان",
    section1Desc: "عندما يقوم العميل بجدولة جلسة عناية على بريمورا، يتم تفويض الدفع وحجزه في حساب ضمان آمن. يتم الاحتفاظ بهذه الأموال بأمان بواسطة شريك الدفع (Tap Connect) ولا يتم تحريرها لمقدم الخدمة إلا بعد وضع علامة اكتمال على الموعد.",
    section2Title: "2. إلغاء الموعد واسترداد الأموال",
    section2Desc: "يمكن للعملاء إلغاء الحجوزات قبل 24 ساعة من الموعد المحدد دون تطبيق أي رسوم. في حال الإلغاء خلال أقل من 24 ساعة، تحتفظ المنصة بالحق في خصم ما يصل إلى 50% من إجمالي قيمة الحجز لتعويض الأخصائي عن وقته الضائع.",
    section3Title: "3. تخصيص دفعات التقسيم",
    section3Desc: "تقتطع منصتنا رسوم عمولة قياسية بنسبة 15% من كل معاملة لتغطية إدارة حساب الضمان، وتنبيهات الجوال، وصيانة الخوادم. يتم توجيه الـ 85% المتبقية مباشرة إلى الحساب البنكي لمقدم الخدمة.",
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
          For help resolving disputes or submitting cancel claims, please navigate to your dashboard bookings tab or contact our arbitration desk at <span className="font-bold text-stone-900">support@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
