"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    privacy: "Privacy Policy",
    title: "Privacy & Data Protection",
    subtitle: "Commitment to Saudi Personal Data Protection Law (PDPL) principles",
    section1Title: "1. Data Collection",
    section1Desc: "To ensure premium service delivery, we collect customer contact information, appointment preferences, in-app communications, and service address details. Payment card records are never stored directly on our servers; they are processed securely through licensed payment gateways.",
    section2Title: "2. Personal Data Protection Principles",
    section2Desc: "Primora is committed to data protection principles under the Saudi PDPL. We process personal data transparently based on user consent and legitimate service delivery needs. Users may contact our team to exercise data subject rights including access, correction, or deletion requests.",
    section3Title: "3. Share & Disclosure",
    section3Desc: "Client location and contact numbers are only shared with the selected service specialist once a booking is confirmed, and are protected through secure platform access. We never sell or distribute your personal records to third-party marketing companies.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    privacy: "سياسة الخصوصية",
    title: "الخصوصية وحماية البيانات",
    subtitle: "الالتزام بمبادئ نظام حماية البيانات الشخصية السعودي (PDPL)",
    section1Title: "1. جمع البيانات",
    section1Desc: "لضمان تقديم خدمة متميزة، نقوم بجمع معلومات الاتصال، وتفضيلات المواعيد، وسجل المراسلات داخل المنصة، وتفاصيل عنوان تقديم الخدمة. لا يتم تخزين بيانات بطاقات الدفع نهائياً على خوادمنا، بل تتم معالجتها بأمان عبر بوابات الدفع المرخصة.",
    section2Title: "2. مبادئ حماية البيانات الشخصية",
    section2Desc: "تلتزم بريمورا بتطبيق مبادئ حماية البيانات الشخصية وفقاً للأنظمة المعمول بها في المملكة. تتم معالجة بياناتك بشفافية لتقديم خدمات المنصة وبناءً على موافقتك. يمكنك التواصل مع فريقنا لممارسة حقوق صاحب البيانات بما في ذلك طلب الوصول أو التصحيح أو الحذف.",
    section3Title: "3. المشاركة والإفصاح",
    section3Desc: "يتم مشاركة موقع العميل وبيانات الاتصال فقط مع الأخصائي المختار بعد تأكيد الحجز وحمايتها عبر قنوات وصول آمنة. نحن لا نبيع أو نشارك سجلاتك الشخصية لشركات التسويق الخارجية.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function PrivacyPage() {
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
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.privacy}</span>
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
          If you have any questions regarding your personal logs or wish to request data erasure under PDPL, please reach out to our Riyadh Data Protection Officer at <span className="font-bold text-stone-900">privacy@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
