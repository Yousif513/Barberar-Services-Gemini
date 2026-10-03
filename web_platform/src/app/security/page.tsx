"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    security: "VAT & Payments Compliance",
    title: "Secure Payouts & Invoicing",
    subtitle: "Aligned with Saudi tax calculations and licensed electronic payment standards",
    section1Title: "1. VAT (15%) & Tax Breakdown",
    section1Desc: "Every transaction processed on the Primora platform includes a transparent breakdown reflecting the 15% Value-Added Tax (VAT) in accordance with Saudi tax regulations. Detailed digital receipts and transaction summaries are accessible in customer and provider portals.",
    section2Title: "2. Payment Security & Encryption",
    section2Desc: "All checkout transactions are securely processed through licensed gateway Tap Payments. Payment details and card credentials are protected using PCI-DSS Level 1 certified systems. We utilize TLS 1.3 encryption, ensuring your financial information is transmitted safely.",
    section3Title: "3. Automated Split Settlement Routing",
    section3Desc: "Our automated smart splits routing mechanism calculates the platform's 15% commission and the partner's 85% share, settling completed bookings into local bank accounts to avoid manual calculation errors.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    security: "الامتثال الضريبي والمدفوعات",
    title: "المدفوعات والفواتير الآمنة",
    subtitle: "متوافق مع حسابات ضريبة القيمة المضافة وبوابات الدفع الإلكتروني المرخصة في المملكة",
    section1Title: "1. ضريبة القيمة المضافة (15%) وتفاصيل الفواتير",
    section1Desc: "تتضمن كل معاملة على منصة بريمورا تفصيلاً مالياً دقيقاً يوضح ضريبة القيمة المضافة (15%) طبقاً للأنظمة واللوائح الضريبية السعودية. وتتاح إيصالات الدفع الرقمية وسجلات المعاملات مباشرة عبر لوحات تحكم العملاء ومقدمي الخدمة.",
    section2Title: "2. أمان وتشفير المدفوعات",
    section2Desc: "تتم معالجة جميع عمليات الدفع عبر بوابة Tap Payments المرخصة. يتم حماية وتشفير بيانات البطاقات في أنظمة معتمدة بمعيار PCI-DSS من المستوى الأول. نحن نستخدم تشفير TLS 1.3 لضمان أمان البيانات المالية أثناء النقل.",
    section3Title: "3. توجيه تسوية المدفوعات الآلي",
    section3Desc: "يقوم نظام التقسيم الآلي باحتساب نسبة الـ 15% للمنصة وحصة الشريك البالغة 85% بدقة فور اكتمال الخدمة، وتوجيه المستحقات إلى الحسابات البنكية المعتمدة لتفادي الأخطاء اليدوية.",
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
            <span className="text-[10px] uppercase font-bold text-stone-400 block">PCI-DSS</span>
            <span className="text-xs font-bold text-stone-950 block">GATEWAY COMPLIANT</span>
          </div>
          <div className="border border-stone-200 p-4 rounded-2xl bg-white space-y-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">VAT 15%</span>
            <span className="text-xs font-bold text-stone-950 block">TAX BREAKDOWN</span>
          </div>
          <div className="border border-stone-200 p-4 rounded-2xl bg-white space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Encryption</span>
            <span className="text-xs font-bold text-stone-950 block">TLS 1.3 SECURE SSL</span>
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
