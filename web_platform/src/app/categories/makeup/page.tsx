"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    category: "Makeup & Cosmetics",
    title: "Professional Makeup Artists in Riyadh",
    subtitle: "Book Riyadh's finest freelance makeup artists, cosmetics consultants, nail artists, and bridal specialists.",
    bookNow: "Book Appointment",
    priceStarts: "Starting from",
    rating: "Rating",
    reviews: "reviews",
    currency: "SAR"
  },
  ar: {
    backHome: "العودة للرئيسية",
    category: "المكياج ومستحضرات التجميل",
    title: "أخصائيات خبيرات المكياج والتجميل بالرياض",
    subtitle: "احجزي خبيرات التجميل المستقلات، واستشارات المكياج، وأخصائيات الأظافر المعتمدات بالرياض.",
    bookNow: "احجز موعداً",
    priceStarts: "يبدأ من",
    rating: "التقييم",
    reviews: "تقييم",
    currency: "ريال"
  }
};

export default function MakeupCategoryPage() {
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

  const providers = [
    {
      name: locale === "ar" ? "أخصائية التجميل لين" : "Leen Makeup & Hair",
      branch: locale === "ar" ? "خدمة منزلية بالرياض" : "Riyadh In-Home Dispatch",
      rating: "4.9",
      reviews: "116",
      price: 200,
      image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=400&auto=format&fit=crop",
      services: locale === "ar" ? ["مكياج للمناسبات", "مكياج العروس الملكي", "تنسيق الرموش والحواجب"] : ["Event Glam Makeup", "Royal Bridal Makeup", "Lash & Brow Styling"]
    },
    {
      name: locale === "ar" ? "أظافر نورا" : "Noura Nail Artistry",
      branch: locale === "ar" ? "فرع الياسمين" : "Al-Yasmin District",
      rating: "4.9",
      reviews: "82",
      price: 150,
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop",
      services: locale === "ar" ? ["تركيب أظافر جل", "طلاء أظافر فرنسي", "عناية اليدين بالبارافين"] : ["Gel Nail Extension", "French Manicure", "Paraffin Hand Treatment"]
    }
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased flex flex-col justify-between">
      
      {/* Header */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-serif font-black tracking-widest text-stone-900">
          PRIMORA
        </Link>
        <Link href="/" className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-950 transition">
          {t.backHome}
        </Link>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto py-12 px-6 sm:px-8 space-y-12 flex-1 w-full">
        
        {/* Banner Section */}
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{t.category}</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight leading-tight">{t.title}</h1>
          <p className="text-xs sm:text-sm text-stone-500 font-light max-w-xl mx-auto leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Visual Header */}
        <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden border border-stone-200 shadow-md relative bg-stone-100">
          <img 
            src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=1200&auto=format&fit=crop" 
            alt="Makeup & Cosmetics Services" 
            className="w-full h-full object-cover" 
          />
        </div>

        {/* Providers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          {providers.map((p, idx) => (
            <div key={idx} className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-black transition duration-200">
              <div>
                <div className="w-full aspect-[16/10] bg-stone-100 overflow-hidden relative">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-base text-stone-950">{p.name}</h3>
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">{p.branch}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 font-bold text-xs text-stone-850">
                        <span className="text-[hsl(45,60%,55%)]">★</span> {p.rating}
                      </div>
                      <span className="text-[9px] text-stone-400 font-medium block mt-0.5">{p.reviews} {t.reviews}</span>
                    </div>
                  </div>

                  {/* Services chips */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {p.services.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-lg text-[10px] font-semibold text-stone-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Card details */}
              <div className="p-6 border-t border-stone-100 flex items-center justify-between bg-stone-50/50">
                <div>
                  <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider block">{t.priceStarts}</span>
                  <span className="text-sm font-extrabold text-stone-900">{p.price} {t.currency}</span>
                </div>
                <Link href="/login" className="px-5 py-2.5 bg-stone-900 text-stone-55 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-stone-800 transition shadow-sm text-stone-100">
                  {t.bookNow}
                </Link>
              </div>
            </div>
          ))}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. Built for Riyadh, Saudi Arabia. All rights reserved.</p>
      </footer>

    </div>
  );
}
