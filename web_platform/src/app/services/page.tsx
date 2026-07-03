"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ─────────────────────────────────────────────────────────────────────────
   PRIMORA · Services — the public, admin-driven catalog.
   Reads categories + active services from Supabase; every item here is one
   the admin created or can edit. Falls back to the seeded catalog shape when
   the database is unreachable so the page never renders empty.
   ──────────────────────────────────────────────────────────────────────── */

type AddOn = { key: string; label_en: string; label_ar: string; priceSAR: number };
type CatalogService = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  base_price: number;
  base_duration_minutes: number;
  is_home_service_eligible: boolean;
  featured_in_services: boolean;
  sort_order: number;
  category_slug: string;
  add_ons: AddOn[];
  rating: number;
};
type CatalogCategory = { id: string; slug: string; name_en: string; name_ar: string; icon: string | null };

const FALLBACK_CATEGORIES: CatalogCategory[] = [
  { id: "c1", slug: "barber-hair", name_en: "Barber & Hair", name_ar: "الحلاقة والشعر", icon: "scissors" },
  { id: "c2", slug: "beard-shave", name_en: "Beard & Shave", name_ar: "اللحية والحلاقة", icon: "razor" },
  { id: "c3", slug: "skincare-facials", name_en: "Skincare & Facials", name_ar: "العناية بالبشرة", icon: "sparkles" },
  { id: "c4", slug: "spa-wellness", name_en: "Spa & Wellness", name_ar: "السبا والعافية", icon: "lotus" },
  { id: "c5", slug: "nails-hands", name_en: "Nails & Hands", name_ar: "الأظافر واليدين", icon: "hand" },
  { id: "c6", slug: "signature-packages", name_en: "Signature Packages", name_ar: "الباقات المميزة", icon: "crown" },
];

const F = (slug: string, cat: string, en: string, ar: string, den: string, dar: string, price: number, dur: number, home: boolean, feat: boolean, ord: number): CatalogService => ({
  id: slug, slug, category_slug: cat, name_en: en, name_ar: ar, description_en: den, description_ar: dar,
  base_price: price, base_duration_minutes: dur, is_home_service_eligible: home,
  featured_in_services: feat, sort_order: ord, add_ons: [], rating: 4.7 + ((slug.length % 3) * 0.1),
});

const FALLBACK_SERVICES: CatalogService[] = [
  F("classic-haircut", "barber-hair", "Classic Haircut", "قصة شعر كلاسيكية", "Precision cut with consultation and finish styling.", "قصة دقيقة مع استشارة وتصفيف نهائي.", 45, 40, true, true, 1),
  F("skin-fade", "barber-hair", "Skin Fade", "قصة فيد", "Sharp zero fade blended to your length on top.", "تدريج حاد يبدأ من الصفر مع دمج احترافي.", 55, 45, true, true, 2),
  F("kids-cut", "barber-hair", "Kids Cut", "قصة أطفال", "Gentle, patient cuts for the young gentlemen.", "قصات لطيفة وصبورة لصغار السادة.", 35, 30, true, false, 3),
  F("hair-coloring", "barber-hair", "Hair Coloring", "صبغ الشعر", "Full color or camouflage greys with premium dyes.", "صبغة كاملة أو تمويه الشيب بأصباغ فاخرة.", 90, 60, false, true, 4),
  F("scalp-therapy", "barber-hair", "Scalp Therapy", "علاج فروة الرأس", "Detox scalp treatment with massage and steam.", "علاج منقٍ لفروة الرأس مع مساج وبخار.", 55, 35, false, false, 5),
  F("beard-sculpt", "beard-shave", "Beard Sculpt", "نحت اللحية", "Shape and line-up with hot towel finish.", "تشكيل وتحديد مع لمسة المنشفة الساخنة.", 30, 25, true, true, 1),
  F("hot-towel-shave", "beard-shave", "Hot Towel Shave", "حلاقة بالمنشفة الساخنة", "Classic straight-razor shave, hot towels and balm.", "حلاقة كلاسيكية بالموس مع مناشف ساخنة وبلسم.", 40, 30, true, false, 2),
  F("beard-color", "beard-shave", "Beard Color", "صبغ اللحية", "Natural-look beard coloring, ammonia-free.", "صبغ لحية بمظهر طبيعي خالٍ من الأمونيا.", 45, 30, false, false, 3),
  F("royal-shave-ritual", "beard-shave", "Royal Shave Ritual", "طقس الحلاقة الملكي", "Our signature 5-step shave with facial massage.", "طقسنا المميز من خمس خطوات مع مساج للوجه.", 70, 50, false, true, 4),
  F("express-facial", "skincare-facials", "Express Facial", "فيشل سريع", "30-minute glow-up cleanse and hydration.", "تنظيف وترطيب لإشراقة سريعة خلال ٣٠ دقيقة.", 80, 30, true, false, 1),
  F("deep-cleanse", "skincare-facials", "Deep Cleanse", "تنظيف عميق", "Deep-pore cleansing facial with extraction.", "تنظيف عميق للمسام مع إزالة الشوائب.", 120, 60, false, true, 2),
  F("anti-fatigue", "skincare-facials", "Anti-fatigue Treatment", "علاج مضاد للإجهاد", "Revitalizing treatment for tired skin.", "علاج منشّط للبشرة المجهدة.", 140, 60, false, false, 3),
  F("moroccan-bath", "spa-wellness", "Moroccan Bath", "حمام مغربي", "Traditional hammam with black soap and kessa.", "حمام تقليدي بالصابون المغربي والكيس.", 90, 60, false, true, 1),
  F("aromatherapy-massage", "spa-wellness", "Aromatherapy Massage", "مساج بالزيوت العطرية", "Full-body relaxation with essential oil blends.", "استرخاء كامل للجسم بخلطات الزيوت العطرية.", 160, 60, true, false, 2),
  F("recovery-massage", "spa-wellness", "Recovery Massage", "مساج استشفائي", "Deep-tissue recovery for active lifestyles.", "مساج عميق للاستشفاء العضلي.", 180, 75, true, false, 3),
  F("manicure", "nails-hands", "Manicure", "مانيكير", "Clean, shape and finish for hands and nails.", "تنظيف وتشكيل وعناية كاملة لليدين والأظافر.", 60, 40, true, false, 1),
  F("pedicure", "nails-hands", "Pedicure", "باديكير", "Full pedicure with exfoliation and massage.", "باديكير كامل مع تقشير ومساج.", 70, 50, true, false, 2),
  F("hand-spa", "nails-hands", "Hand Spa", "سبا اليدين", "Paraffin hand spa with cuticle care.", "سبا بارافين لليدين مع عناية بالجليدة.", 50, 30, true, false, 3),
  F("grooms-prep", "signature-packages", "Groom's Prep", "تجهيز العريس", "Complete pre-wedding grooming: cut, shave, facial, hands.", "تجهيز متكامل قبل الزفاف: قصة، حلاقة، فيشل، وعناية باليدين.", 350, 180, false, true, 1),
  F("executive-refresh", "signature-packages", "Executive Refresh", "انتعاشة المدير", "Cut, beard sculpt and express facial in one sitting.", "قصة ونحت لحية وفيشل سريع في جلسة واحدة.", 220, 100, false, true, 2),
  F("full-reset", "signature-packages", "Full Reset", "استعادة كاملة", "The complete PRIMORA experience, head to toe.", "تجربة بريمورا الكاملة من الرأس إلى القدمين.", 480, 240, false, true, 3),
];

const CATEGORY_ICON: Record<string, string> = {
  scissors: "✂️", razor: "🪒", sparkles: "✨", lotus: "🪷", hand: "🤲", crown: "👑",
};

const translations = {
  en: {
    title: "Services",
    subtitle: "Every treatment on PRIMORA, curated and priced by our team. Filter, compare, and book.",
    search: "Search services...",
    all: "All",
    price: "Price",
    anyPrice: "Any price",
    under50: "Under 50 SAR",
    p50to100: "50–100 SAR",
    p100to200: "100–200 SAR",
    over200: "200+ SAR",
    homeService: "Home service",
    sort: "Sort",
    sortRecommended: "Recommended",
    sortPriceLow: "Price: low to high",
    sortPriceHigh: "Price: high to low",
    sortRating: "Rating",
    featured: "Featured",
    home: "Home",
    from: "From",
    sar: "SAR",
    min: "min",
    book: "Book",
    results: "services",
    empty: "No services match these filters — try widening your search.",
    addOns: "Add-ons",
    duration: "Duration",
    close: "Close",
    bookNow: "Book this service",
    backHome: "PRIMORA",
    lang: "العربية",
  },
  ar: {
    title: "الخدمات",
    subtitle: "كل خدمات بريمورا، منسقة ومسعّرة من فريقنا. صفِّ وقارن واحجز.",
    search: "ابحث عن خدمة...",
    all: "الكل",
    price: "السعر",
    anyPrice: "أي سعر",
    under50: "أقل من ٥٠ ر.س",
    p50to100: "٥٠–١٠٠ ر.س",
    p100to200: "١٠٠–٢٠٠ ر.س",
    over200: "٢٠٠+ ر.س",
    homeService: "خدمة منزلية",
    sort: "الترتيب",
    sortRecommended: "الموصى به",
    sortPriceLow: "السعر: من الأقل",
    sortPriceHigh: "السعر: من الأعلى",
    sortRating: "التقييم",
    featured: "مميزة",
    home: "منزلية",
    from: "من",
    sar: "ر.س",
    min: "دقيقة",
    book: "احجز",
    results: "خدمة",
    empty: "لا توجد خدمات مطابقة — جرّب توسيع البحث.",
    addOns: "الإضافات",
    duration: "المدة",
    close: "إغلاق",
    bookNow: "احجز هذه الخدمة",
    backHome: "بريمورا",
    lang: "EN",
  },
};

function ServicesCatalog() {
  const searchParams = useSearchParams();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [categories, setCategories] = useState<CatalogCategory[]>(FALLBACK_CATEGORIES);
  const [services, setServices] = useState<CatalogService[]>(FALLBACK_SERVICES);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>(searchParams.get("category") ?? "all");
  const [priceBand, setPriceBand] = useState<"any" | "u50" | "50-100" | "100-200" | "200+">("any");
  const [homeOnly, setHomeOnly] = useState(false);
  const [sort, setSort] = useState<"recommended" | "price-asc" | "price-desc" | "rating">("recommended");
  const [detail, setDetail] = useState<CatalogService | null>(null);

  useEffect(() => {
    const sync = () => setLang(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: cats }, { data: rows }] = await Promise.all([
          supabase.from("categories").select("id, slug, name_en, name_ar, icon, sort_order").eq("is_active", true).order("sort_order"),
          supabase
            .from("services")
            .select("id, slug, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_home_service_eligible, featured_in_services, sort_order, add_ons, categories(slug)")
            .eq("is_active", true)
            .order("sort_order"),
        ]);
        if (cats?.length) setCategories(cats);
        if (rows?.length) {
          setServices(rows.map((r, i) => {
            const cat = r.categories as unknown as { slug?: string } | null;
            return {
              id: r.id, slug: r.slug ?? r.id,
              name_en: r.name_en, name_ar: r.name_ar,
              description_en: r.description_en ?? "", description_ar: r.description_ar ?? "",
              base_price: Number(r.base_price), base_duration_minutes: r.base_duration_minutes,
              is_home_service_eligible: !!r.is_home_service_eligible,
              featured_in_services: !!r.featured_in_services,
              sort_order: r.sort_order ?? i,
              category_slug: cat?.slug ?? "other",
              add_ons: Array.isArray(r.add_ons) ? (r.add_ons as AddOn[]) : [],
              rating: 4.7 + ((String(r.id).charCodeAt(0) % 3) * 0.1),
            };
          }));
        }
      } catch (err) {
        console.warn("Services catalog using fallback data:", err);
      }
    })();
  }, []);

  const toggleLang = () => {
    const target = lang === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLang(target);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";

  const filtered = useMemo(() => {
    let list = services.filter((s) => {
      if (activeCat !== "all" && s.category_slug !== activeCat) return false;
      if (homeOnly && !s.is_home_service_eligible) return false;
      if (priceBand === "u50" && s.base_price >= 50) return false;
      if (priceBand === "50-100" && (s.base_price < 50 || s.base_price > 100)) return false;
      if (priceBand === "100-200" && (s.base_price < 100 || s.base_price > 200)) return false;
      if (priceBand === "200+" && s.base_price < 200) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (!s.name_en.toLowerCase().includes(q) && !s.name_ar.includes(query.trim())) return false;
      }
      return true;
    });
    switch (sort) {
      case "price-asc": list = [...list].sort((a, b) => a.base_price - b.base_price); break;
      case "price-desc": list = [...list].sort((a, b) => b.base_price - a.base_price); break;
      case "rating": list = [...list].sort((a, b) => b.rating - a.rating); break;
      default:
        list = [...list].sort((a, b) =>
          Number(b.featured_in_services) - Number(a.featured_in_services) || a.sort_order - b.sort_order);
    }
    return list;
  }, [services, activeCat, homeOnly, priceBand, query, sort]);

  const catName = (c: CatalogCategory) => (isRTL ? c.name_ar : c.name_en);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-[#F2EEE6] text-[#211A12] font-sans ${isRTL ? "text-right" : "text-left"}`}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[#211A12]/8 bg-[#F2EEE6]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-[clamp(16px,4vw,40px)] py-4">
          <Link href="/" className="font-serif text-lg font-black tracking-[0.22em] text-[#A57C32]">{t.backHome}</Link>
          <div className="flex items-center gap-2.5">
            <button onClick={toggleLang} className="rounded-full border border-[#211A12]/10 bg-white px-3.5 py-2 text-xs font-bold text-[#5F584D] shadow-sm transition hover:border-[#C29A4C]/50 hover:text-[#A57C32]">{t.lang}</button>
            <Link href="/customer/book" className="rounded-full bg-gradient-to-r from-[#C29A4C] to-[#E6C679] px-4 py-2 text-xs font-black text-[#15100A] shadow-md shadow-[#C29A4C]/20 transition hover:brightness-105">{t.book}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-[clamp(16px,4vw,40px)] py-8">
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-black leading-tight text-[#211A12] sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-xl text-sm font-medium text-[#5F584D]">{t.subtitle}</p>
        </div>

        {/* Sticky filter bar */}
        <div className="sticky top-[65px] z-30 -mx-2 mb-6 space-y-3 rounded-2xl border border-[#211A12]/8 bg-white/90 p-4 shadow-[0_8px_30px_rgba(21,16,10,0.05)] backdrop-blur-xl">
          <div className={`flex flex-col gap-3 lg:flex-row lg:items-center ${isRTL ? "lg:flex-row-reverse" : ""}`}>
            <label className={`flex flex-1 items-center gap-2 rounded-xl border border-[#211A12]/10 bg-[#F2EEE6]/60 px-4 py-2.5 ${isRTL ? "flex-row-reverse" : ""}`}>
              <svg className="h-4 w-4 flex-shrink-0 text-[#8A7F6C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="w-full border-none bg-transparent text-sm outline-none placeholder:text-[#8A7F6C]" />
            </label>
            <div className={`flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <select value={priceBand} onChange={(e) => setPriceBand(e.target.value as typeof priceBand)} className="rounded-xl border border-[#211A12]/10 bg-white px-3 py-2.5 text-xs font-bold text-[#5F584D] outline-none">
                <option value="any">{t.anyPrice}</option>
                <option value="u50">{t.under50}</option>
                <option value="50-100">{t.p50to100}</option>
                <option value="100-200">{t.p100to200}</option>
                <option value="200+">{t.over200}</option>
              </select>
              <button onClick={() => setHomeOnly((h) => !h)} className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold transition ${homeOnly ? "border-[#C29A4C]/60 bg-[#C29A4C]/10 text-[#A57C32]" : "border-[#211A12]/10 bg-white text-[#5F584D]"}`}>
                {homeOnly ? "✓ " : ""}{t.homeService}
              </button>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-xl border border-[#211A12]/10 bg-white px-3 py-2.5 text-xs font-bold text-[#5F584D] outline-none">
                <option value="recommended">{t.sortRecommended}</option>
                <option value="price-asc">{t.sortPriceLow}</option>
                <option value="price-desc">{t.sortPriceHigh}</option>
                <option value="rating">{t.sortRating}</option>
              </select>
            </div>
          </div>
          {/* Category chips */}
          <div className={`flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <button onClick={() => setActiveCat("all")} className={`rounded-full px-4 py-1.5 text-xs font-black transition ${activeCat === "all" ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
              {t.all}
            </button>
            {categories.map((c) => (
              <button key={c.slug} onClick={() => setActiveCat(c.slug)} className={`rounded-full px-4 py-1.5 text-xs font-black transition ${activeCat === c.slug ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
                <span className="me-1">{CATEGORY_ICON[c.icon ?? ""] ?? "•"}</span>{catName(c)}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="mb-4 text-xs font-bold text-[#8A7F6C]">{filtered.length} {t.results}</p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#8A7F6C]">{t.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => setDetail(s)}
                className={`group flex flex-col rounded-[20px] border border-[#211A12]/8 bg-white p-5 shadow-[0_8px_30px_rgba(21,16,10,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C29A4C]/40 hover:shadow-[0_16px_40px_rgba(194,154,76,0.12)] ${isRTL ? "text-right" : "text-left"}`}
              >
                <div className={`mb-3 flex items-start justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[10px] font-black text-[#8A7F6C]">
                    {CATEGORY_ICON[categories.find((c) => c.slug === s.category_slug)?.icon ?? ""] ?? "•"} {catName(categories.find((c) => c.slug === s.category_slug) ?? categories[0])}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-black text-[#A57C32]">★ {s.rating.toFixed(1)}</span>
                </div>
                <h3 className="font-serif text-lg font-black leading-snug text-[#211A12] group-hover:text-[#A57C32] transition-colors">{isRTL ? s.name_ar : s.name_en}</h3>
                <p className="mt-1.5 line-clamp-2 flex-1 text-xs font-medium leading-5 text-[#8A7F6C]">{isRTL ? s.description_ar : s.description_en}</p>
                <div className={`mt-4 flex items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.from}</span>
                    <span className="font-serif text-lg font-black text-[#211A12]">{s.base_price} <span className="text-xs text-[#A57C32]">{t.sar}</span></span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                    {s.featured_in_services && <span className="rounded-full bg-[#C29A4C]/12 px-2 py-0.5 text-[9px] font-black text-[#A57C32]">{t.featured}</span>}
                    {s.is_home_service_eligible && <span className="rounded-full bg-[#15100A]/5 px-2 py-0.5 text-[9px] font-black text-[#5F584D]">🏠 {t.home}</span>}
                  </div>
                </div>
                <span className="mt-4 block rounded-xl bg-[#15100A] py-2.5 text-center text-xs font-black text-[#E6C679] transition group-hover:bg-gradient-to-r group-hover:from-[#C29A4C] group-hover:to-[#E6C679] group-hover:text-[#15100A]">
                  {t.book} · {s.base_duration_minutes} {t.min}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50" dir={isRTL ? "rtl" : "ltr"}>
          <div className="absolute inset-0 bg-[#15100A]/55 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <aside className={`absolute top-0 bottom-0 ${isRTL ? "left-0" : "right-0"} flex w-full max-w-md flex-col bg-[#F9F7F2] shadow-2xl`}>
            <div className={`flex items-center justify-between border-b border-[#211A12]/8 p-5 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h2 className="font-serif text-xl font-black text-[#211A12]">{isRTL ? detail.name_ar : detail.name_en}</h2>
              <button onClick={() => setDetail(null)} aria-label={t.close} className="rounded-xl p-2 text-[#8A7F6C] transition hover:bg-[#211A12]/5 hover:text-[#211A12]">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br from-[#15100A] to-[#3A2E1D] text-5xl">
                {CATEGORY_ICON[categories.find((c) => c.slug === detail.category_slug)?.icon ?? ""] ?? "✦"}
              </div>
              <p className="text-sm font-medium leading-6 text-[#5F584D]">{isRTL ? detail.description_ar : detail.description_en}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.from}</span>
                  <strong className="font-serif text-lg font-black text-[#211A12]">{detail.base_price} {t.sar}</strong>
                </div>
                <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.duration}</span>
                  <strong className="font-serif text-lg font-black text-[#211A12]">{detail.base_duration_minutes} {t.min}</strong>
                </div>
              </div>
              {detail.add_ons.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.addOns}</h4>
                  <div className="space-y-2">
                    {detail.add_ons.map((a) => (
                      <div key={a.key} className={`flex items-center justify-between rounded-xl border border-[#211A12]/8 bg-white px-3 py-2.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-bold text-[#211A12]">{isRTL ? a.label_ar : a.label_en}</span>
                        <span className="text-xs font-black text-[#A57C32]">+{a.priceSAR} {t.sar}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-[#211A12]/8 p-5">
              <Link href="/customer/book" className="block rounded-xl bg-gradient-to-r from-[#C29A4C] to-[#E6C679] py-3 text-center text-sm font-black text-[#15100A] shadow-lg shadow-[#C29A4C]/20 transition hover:brightness-105">
                {t.bookNow}
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F2EEE6]" />}>
      <ServicesCatalog />
    </Suspense>
  );
}
