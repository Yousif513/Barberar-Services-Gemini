"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    title: "Split Ledger & Commission Pricing",
    subtitle: "Transparent fee splits, escrow security holds, and zero upfront platform costs",
    pricingModel: "How We Calculate Transaction Splits",
    platformFee: "Platform Commission",
    partnerPayout: "Partner Payout Share",
    feeDesc: "Primora collects a flat 15% commission fee on every booking. This fee completely covers ZATCA e-invoicing compliance, Tap Connect transaction fees, SMS alerts, and secure escrow holds. No monthly subscription is required for basic accounts.",
    payoutDesc: "The remaining 85% is routed straight to your salon's local bank account. As soon as the customer's appointment is completed and marked off in your dashboard calendar, the ledger releases the funds instantly.",
    noUpfront: "Zero Setup or Upfront Fees",
    noUpfrontDesc: "Registering, listing your services catalog, and setting up staff availability calendars are 100% free. We only succeed when you acquire bookings.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    title: "حساب التقسيمات وعمولات الدفع",
    subtitle: "تقسيمات رسوم شفافة، وضمان حجز آمن، وبدون أي تكاليف تأسيس مسبقة",
    pricingModel: "كيف نحسب تقسيمات العمليات المالية",
    platformFee: "عمولة المنصة",
    partnerPayout: "حصة الشريك ومقدم الخدمة",
    feeDesc: "تقتطع بريمورا عمولة ثابتة بنسبة 15% على كل حجز. تغطي هذه الرسوم بالكامل امتثال هيئة الزكاة (الفاتورة الإلكترونية)، ورسوم معالجة المعاملات لمدفوعات مدى وفيزا، وتنبيهات الجوال، وإدارة الضمان الآمن. لا يتطلب الاشتراك في الحساب الأساسي أي رسوم شهرية.",
    payoutDesc: "يتم توجيه الـ 85% المتبقية مباشرة إلى الحساب البنكي لصالونك أو عملك. بمجرد اكتمال موعد العميل ووضع علامة اكتمال في تقويم لوحة التحكم الخاصة بك، يقوم نظام الدفع بتحرير الأموال فوراً.",
    noUpfront: "بدون أي رسوم إعداد أو تأسيس مسبقة",
    noUpfrontDesc: "التسجيل، وإدراج قائمة خدماتك، وإعداد تقويم توافر موظفيك مجاني 100%. نحن ننجح فقط عندما تستقبل حجوزات فعلية.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function PricingPage() {
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

        {/* Pricing Split Breakdown Card */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-base font-bold text-stone-950 uppercase tracking-wide text-center">{t.pricingModel}</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="border border-stone-200 p-6 rounded-2xl text-center space-y-2">
              <span className="text-3xl font-black text-stone-900">15%</span>
              <h3 className="font-bold text-xs text-stone-950 uppercase tracking-wider">{t.platformFee}</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-light">{t.feeDesc}</p>
            </div>

            <div className="bg-stone-950 text-white border border-stone-900 p-6 rounded-2xl text-center space-y-2">
              <span className="text-3xl font-black text-[hsl(45,60%,55%)]">85%</span>
              <h3 className="font-bold text-xs text-stone-300 uppercase tracking-wider">{t.partnerPayout}</h3>
              <p className="text-xs text-stone-400 leading-relaxed font-light">{t.payoutDesc}</p>
            </div>
          </div>
        </div>

        {/* Zero Setup Fees Callout */}
        <div className="bg-stone-100 border border-stone-200 p-8 rounded-3xl space-y-3">
          <h3 className="font-bold text-xs text-stone-950 uppercase tracking-wide">{t.noUpfront}</h3>
          <p className="text-xs text-stone-500 leading-relaxed font-light">
            {t.noUpfrontDesc}
          </p>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
