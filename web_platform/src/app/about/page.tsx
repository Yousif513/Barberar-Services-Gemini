"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    aboutUs: "About Us",
    title: "The Primora Collective",
    subtitle: "Riyadh's Premier Luxury Beauty, Grooming & Wellness Marketplace",
    storyTitle: "Our Story",
    storyContent1: "Founded in Riyadh, Saudi Arabia, Primora was born out of a desire to redefine how selective clients discover and experience luxury personal care. We envisioned a marketplace that brings the top 1% of independent grooming master stylists, premium beauty salons, and luxury wellness sanctuaries together under a single, unified digital collective.",
    storyContent2: "Whether you prefer the tranquil atmosphere of Riyadh's most exclusive wellness spas or the absolute comfort and privacy of a bespoke in-home service, Primora guarantees a vetted, secure, and exceptional experience tailored to you.",
    pillarTitle: "The Primora Pillars",
    pillar1Title: "Top 1% Vetted Talent",
    pillar1Desc: "Every specialist on our platform passes rigorous licensing, hygiene audits, and style validations.",
    pillar2Title: "Escrow Deposit Security",
    pillar2Desc: "Funds are securely deposited in escrow at booking and only released to the artist after successful completion.",
    pillar3Title: "Geofenced Convenience",
    pillar3Desc: "Seamless logistics management for home-service appointments, ensuring prompt arrivals across Riyadh.",
    hygieneTitle: "Strict Hygiene Protocol",
    hygieneDesc: "We enforce a zero-tolerance policy on equipment sanitation. All registered artists are equipped with certified single-use tools or undergo medical-grade disinfection processes before every session.",
    footerText: "Built for Riyadh, Saudi Arabia. All rights reserved."
  },
  ar: {
    backHome: "العودة للرئيسية",
    aboutUs: "من نحن",
    title: "مجموعة بريمورا",
    subtitle: "منصة الرياض الرائدة للجمال، العناية الشخصية والعافية الفاخرة",
    storyTitle: "قصتنا",
    storyContent1: "تأسست بريمورا في الرياض، المملكة العربية السعودية، انطلاقاً من الرغبة في إعادة تعريف كيفية اكتشاف وتجربة العناية الشخصية الفاخرة. لقد تصورنا منصة تجمع أفضل 1% من مصممي الحلاقة المستقلين وصالونات التجميل الراقية وملاذات العافية الفاخرة تحت مظلة واحدة موحدة.",
    storyContent2: "سواء كنت تفضل الأجواء الهادئة في المنتجعات الصحية الأكثر تميزاً بالرياض أو الراحة والخصوصية المطلقة للخدمة المنزلية المصممة خصيصاً لك، فإن بريمورا تضمن لك تجربة موثوقة وآمنة واستثنائية.",
    pillarTitle: "ركائز بريمورا",
    pillar1Title: "أفضل 1% من الكفاءات المعتمدة",
    pillar1Desc: "يمر كل أخصائي على منصتنا بعمليات تدقيق صارمة للتراخيص والنظافة وتقييم الأسلوب.",
    pillar2Title: "أمان دفع الضمان",
    pillar2Desc: "يتم إيداع الأموال بشكل آمن في الضمان عند الحجز ولا يتم تحريرها للمزود إلا بعد إتمام الخدمة بنجاح.",
    pillar3Title: "سهولة تغطية الرياض الجغرافية",
    pillar3Desc: "إدارة لوجستية سلسة للمواعيد المنزلية لضمان الوصول في الوقت المحدد في جميع أنحاء الرياض.",
    hygieneTitle: "بروتوكول تعقيم صارم",
    hygieneDesc: "نحن نطبق سياسة صارمة تجاه تعقيم الأدوات. جميع مقدمي الخدمة مجهزون بأدوات معقمة ذات استخدام واحد أو يخضعون لعمليات تعقيم طبية قبل كل جلسة.",
    footerText: "صمم خصيصاً للرياض، المملكة العربية السعودية. جميع الحقوق محفوظة."
  }
};

export default function AboutPage() {
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
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.aboutUs}</span>
          <h1 className="text-4xl sm:text-5xl font-serif text-stone-950 tracking-tight">{t.title}</h1>
          <p className="text-sm sm:text-base text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Brand Image Banner */}
        <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden border border-stone-200 shadow-lg relative bg-stone-100">
          <img 
            src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop" 
            alt="Luxury apothecary and wellness" 
            className="w-full h-full object-cover" 
          />
          <div className="absolute inset-0 bg-stone-950/10" />
        </div>

        {/* Story Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          <h2 className="text-xl font-serif font-bold text-stone-950 md:col-span-1">{t.storyTitle}</h2>
          <div className="md:col-span-2 space-y-6 text-xs sm:text-sm text-stone-600 leading-relaxed font-light">
            <p>{t.storyContent1}</p>
            <p>{t.storyContent2}</p>
          </div>
        </div>

        <hr className="border-stone-200" />

        {/* Pillars Section */}
        <div className="space-y-8">
          <h2 className="text-xl font-serif font-bold text-stone-950 text-center">{t.pillarTitle}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-stone-200/60 p-6 rounded-2xl space-y-3 shadow-sm hover:border-black transition duration-200">
              <span className="text-[10px] font-bold text-[hsl(45,60%,45%)] uppercase tracking-wider">01</span>
              <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.pillar1Title}</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-light">{t.pillar1Desc}</p>
            </div>

            <div className="bg-white border border-stone-200/60 p-6 rounded-2xl space-y-3 shadow-sm hover:border-black transition duration-200">
              <span className="text-[10px] font-bold text-[hsl(45,60%,45%)] uppercase tracking-wider">02</span>
              <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.pillar2Title}</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-light">{t.pillar2Desc}</p>
            </div>

            <div className="bg-white border border-stone-200/60 p-6 rounded-2xl space-y-3 shadow-sm hover:border-black transition duration-200">
              <span className="text-[10px] font-bold text-[hsl(45,60%,45%)] uppercase tracking-wider">03</span>
              <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wide">{t.pillar3Title}</h3>
              <p className="text-xs text-stone-500 leading-relaxed font-light">{t.pillar3Desc}</p>
            </div>
          </div>
        </div>

        {/* Hygiene Certification Banner */}
        <div className="bg-stone-950 text-white rounded-3xl p-8 sm:p-12 space-y-4 relative overflow-hidden border border-stone-900 shadow-md">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsla(45,60%,55%,0.04)] rounded-full blur-3xl" />
          <span className="text-[9px] uppercase font-bold text-[hsl(45,60%,55%)] tracking-wider">Operational Integrity</span>
          <h3 className="text-lg sm:text-xl font-serif text-white">{t.hygieneTitle}</h3>
          <p className="text-xs text-stone-400 leading-relaxed max-w-xl font-light">
            {t.hygieneDesc}
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
