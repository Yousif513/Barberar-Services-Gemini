"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    backHome: "Back to Home",
    category: "Wellness & Spa",
    title: "Luxury Spas & Hammams in Riyadh",
    subtitle: "Rejuvenate your body and mind. Book verified wellness retreats, custom massage rooms, and steam baths.",
    bookNow: "Book Appointment",
    priceStarts: "Starting from",
    rating: "Rating",
    reviews: "reviews",
    currency: "SAR"
  },
  ar: {
    backHome: "العودة للرئيسية",
    category: "المنتجعات الصحية والعافية",
    title: "حمامات وسبا العافية الفاخرة بالرياض",
    subtitle: "استعد نشاط وحيوية جسدك وذهنك. احجز غرف المساج المتخصصة، والحمامات المغربية، والمنتجعات الصحية بالرياض.",
    bookNow: "احجز موعداً",
    priceStarts: "يبدأ من",
    rating: "التقييم",
    reviews: "تقييم",
    currency: "ريال"
  }
};

export default function SpaCategoryPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
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
      name: locale === "ar" ? "منتجع الرياض الصحي" : "Riyadh Wellness Retreat",
      branch: locale === "ar" ? "فرع الملقا" : "Al-Malqa District",
      rating: "4.9",
      reviews: "74",
      price: 300,
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop",
      services: locale === "ar" ? ["تدليك عميق للأنسجة", "العلاج بحجر البازلت الساخن", "علاج الوجه بالأكسجين"] : ["Deep Tissue Massage", "Hot Stone Therapy", "Oxygen Facial Treatment"]
    },
    {
      name: locale === "ar" ? "سبا الرياض الفاخر للعناية" : "Riyadh Premium Spa & Wellness",
      branch: locale === "ar" ? "فرع العليا" : "Olaya District",
      rating: "4.9",
      reviews: "148",
      price: 450,
      image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=400&auto=format&fit=crop",
      services: locale === "ar" ? ["حمام مغربي ملكي بالطين", "سنفرة الجسم بالقهوة", "مساج سويدي استرخائي"] : ["Royal Moroccan Hammam", "Body Coffee Scrub", "Swedish Relaxing Massage"]
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
            src="https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop" 
            alt="Spa & Wellness Rooms" 
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
