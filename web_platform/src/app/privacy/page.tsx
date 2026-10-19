"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    backHome: "Back to Home",
    privacy: "Privacy Policy",
    title: "Privacy & Data Protection",
    subtitle: "How Primora handles your personal data and how to exercise your data rights.",
    section1Title: "1. Data Collection",
    section1Desc: "We collect customer contact information, appointment preferences, in-app messages, and service address details. Card details are entered on Tap Payments' hosted page and are never received or stored by Primora.",
    section2Title: "2. How We Use Your Data",
    section2Desc: "We process personal data to deliver the booking service, and for optional purposes such as WhatsApp messages and offers only where you gave consent. You can ask for access, correction, export or erasure of your data with the request form below.",
    section3Title: "3. Share & Disclosure",
    section3Desc: "Your location and contact number are shared only with the specialist you selected, once a booking is confirmed. We do not sell your personal records to third-party marketing companies.",
    dsrBadge: "Data request",
    dsrTitle: "Exercise Your Data Rights",
    dsrDesc: "In your account you can ask for access to your data, a copy (JSON and PDF), a correction or its deletion, or withdraw a consent. Requests are free of charge and answered within 30 days; we confirm it is you with a one-time code. You can also write to the address below or call us, and we will ask you to confirm the request in your account.",
    openRequests: "Open Privacy in my account",
    reqTypeLabel: "Request Type",
    reqAccess: "Access to my personal records",
    reqRectify: "Correct or update my information",
    reqErase: "Erase my data",
    reqExport: "Export my data",
    detailsLabel: "Request Details & Context",
    detailsPlaceholder: "Describe your request or specify records you wish to access or update...",
    submitBtn: "Submit Request",
    submittingBtn: "Submitting...",
    loginPrompt: "Please sign in to your Primora account before submitting a data request.",
    loginBtn: "Sign in to make a request",
    dsrSuccess: "Your request was recorded. Due date:",
    dsrExisting: "You already have an open request of this kind. Its due date is",
    dsrReference: "Reference:",
    dsrFailed: "The request could not be recorded:",
    contact: "For questions about your personal data, use the request form above or write to",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    privacy: "سياسة الخصوصية",
    title: "الخصوصية وحماية البيانات",
    subtitle: "كيف تتعامل بريمورا مع بياناتك الشخصية وكيف تمارس حقوقك.",
    section1Title: "1. جمع البيانات",
    section1Desc: "نجمع معلومات الاتصال وتفضيلات المواعيد والرسائل داخل المنصة وتفاصيل عنوان تقديم الخدمة. تُدخل بيانات البطاقة في صفحة Tap Payments المستضافة ولا تستلمها بريمورا ولا تخزنها.",
    section2Title: "2. كيف نستخدم بياناتك",
    section2Desc: "نعالج بياناتك الشخصية لتقديم خدمة الحجز، ولأغراض اختيارية مثل رسائل واتساب والعروض فقط عند موافقتك. يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو تصديرها أو محوها عبر نموذج الطلب أدناه.",
    section3Title: "3. المشاركة والإفصاح",
    section3Desc: "تُشارَك بيانات موقعك ورقم جوالك مع الأخصائي الذي اخترته فقط بعد تأكيد الحجز. نحن لا نبيع سجلاتك الشخصية لشركات التسويق الخارجية.",
    dsrBadge: "طلب بيانات",
    dsrTitle: "ممارسة حقوقك في بياناتك",
    dsrDesc: "من حسابك يمكنك طلب الاطلاع على بياناتك أو نسخة منها (JSON وPDF) أو تصحيحها أو حذفها، أو سحب موافقة. الطلبات مجانية ونرد خلال 30 يوماً، ونتحقق من هويتك برمز لمرة واحدة. يمكنك أيضاً مراسلتنا على العنوان أدناه أو الاتصال بنا، وسنطلب منك تأكيد الطلب في حسابك.",
    openRequests: "فتح صفحة الخصوصية في حسابي",
    reqTypeLabel: "نوع الطلب",
    reqAccess: "الاطلاع على بياناتي الشخصية",
    reqRectify: "تصحيح بياناتي أو تحديثها",
    reqErase: "محو بياناتي",
    reqExport: "تصدير بياناتي",
    detailsLabel: "تفاصيل ومبررات الطلب",
    detailsPlaceholder: "اذكر تفاصيل طلبك أو السجلات المحددة المطلوب الاطلاع عليها أو معالجتها...",
    submitBtn: "إرسال الطلب",
    submittingBtn: "جاري الإرسال...",
    loginPrompt: "يرجى تسجيل الدخول بحسابك في بريمورا لتقديم طلب بخصوص بياناتك.",
    loginBtn: "سجّل الدخول لتقديم طلب",
    dsrSuccess: "تم تسجيل طلبك. موعد الاستحقاق:",
    dsrExisting: "لديك طلب مفتوح من هذا النوع بالفعل. موعد استحقاقه",
    dsrReference: "المرجع:",
    dsrFailed: "تعذر تسجيل الطلب:",
    contact: "للاستفسار عن بياناتك الشخصية استخدم نموذج الطلب أعلاه أو راسلنا على",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function PrivacyPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [user, setUser] = useState<{ id: string } | null>(null);
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
    });
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
        <Link href="/" className="text-xs font-bold uppercase tracking-wider text-stone-600 hover:text-stone-950 transition">
          {t.backHome}
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto py-16 px-6 sm:px-8 space-y-12 flex-1 w-full">
        
        {/* Title Section */}
        <div className="space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#7A5B12]">{t.privacy}</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight">{t.title}</h1>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-light">
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

        {/* DSR Interactive Form (G13) */}
        <div className="rounded-2xl border border-[#A57C32]/30 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#7A5B12]">{t.dsrBadge}</span>
            <h3 className="text-lg font-serif font-bold text-stone-900 mt-1">{t.dsrTitle}</h3>
            <p className="text-xs text-stone-600 leading-relaxed mt-1">{t.dsrDesc}</p>
          </div>

          <Link
            href={user ? "/customer/privacy" : "/login?returnUrl=/customer/privacy"}
            className="inline-block rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold text-[#D1AF47] shadow hover:bg-stone-800 transition focus-visible:outline-2 focus-visible:outline-[#A57C32]"
          >
            {user ? t.openRequests : t.loginBtn}
          </Link>
        </div>

        {/* Contact DPO Callout */}
        <div className="bg-stone-100 border border-stone-200 p-6 rounded-2xl text-xs text-stone-600 font-light leading-relaxed">
          {t.contact} <span dir="ltr" className="font-bold text-stone-900">privacy@primora.com</span>.
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-600 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footerText}</p>
      </footer>

    </div>
  );
}
