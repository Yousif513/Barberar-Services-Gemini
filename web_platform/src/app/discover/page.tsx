"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";

interface DiscoveredBranch {
  branch_id: string;
  provider_id: string;
  business_name_en: string;
  business_name_ar: string;
  branch_name_en: string;
  branch_name_ar: string;
  city: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  verified_business: boolean;
  cr_verification_status: string;
  rating: number | null;
  reviews: number;
  popular_services: Array<{
    id: string;
    name_en: string;
    name_ar: string;
    price: number;
    duration_minutes: number;
  }> | null;
}

const SAUDI_DISTRICTS: Record<string, Array<{ en: string; ar: string }>> = {
  Riyadh: [
    { en: "Al-Malqa", ar: "الملقا" },
    { en: "Al-Olaya", ar: "العليا" },
    { en: "Al-Nakheel", ar: "النخيل" },
    { en: "Hittin", ar: "حطين" },
    { en: "Al-Mohammadiyah", ar: "المحمدية" },
    { en: "Al-Sulaimaniyah", ar: "السليمانية" },
  ],
  Jeddah: [
    { en: "Al-Rawdah", ar: "الروضة" },
    { en: "Al-Zahra", ar: "الزهراء" },
    { en: "Al-Shati", ar: "الشاطئ" },
    { en: "Al-Andalus", ar: "الأندلس" },
    { en: "Al-Hamra", ar: "الحمراء" },
  ],
};

const CATEGORIES = [
  { slug: "all", en: "All Categories", ar: "جميع التصنيفات" },
  { slug: "haircuts", en: "Barbershop", ar: "حلاقة وتصفيف" },
  { slug: "haircolor", en: "Hair & Beauty", ar: "شعر وتجميل" },
  { slug: "massage", en: "Spa & Wellness", ar: "سبا ومساج" },
  { slug: "skincare", en: "Skincare", ar: "عناية بالبشرة" },
  { slug: "nails", en: "Nails", ar: "أظافر" },
];

const translations = {
  en: {
    pageTitle: "Discover Salons & Spas",
    pageSubtitle: "Map of grooming and wellness destinations across Saudi Arabia.",
    searchPlaceholder: "Search salon name, service, or district...",
    allCities: "All Cities",
    allDistricts: "All Districts",
    viewMap: "Map View",
    viewList: "List View",
    verifiedCR: "CR checked with Wathq",
    reviews: "reviews",
    startingFrom: "from",
    bookNow: "Book Appointment",
    viewDetails: "View Services",
    kmAway: "km away",
    noResults: "No salons found matching your criteria.",
    noResultsDesc: "Try switching districts, choosing another category, or resetting your search query.",
    resetFilters: "Reset Filters",
    loading: "Loading destinations...",
    salonsFound: "salons available",
    cityRiyadh: "Riyadh",
    cityJeddah: "Jeddah",
  },
  ar: {
    pageTitle: "استكشف الصالونات والسبا",
    pageSubtitle: "خريطة لوجهات العناية والجمال في المملكة العربية السعودية.",
    searchPlaceholder: "ابحث عن اسم الصالون، الخدمة، أو الحي...",
    allCities: "جميع المدن",
    allDistricts: "جميع الأحياء",
    viewMap: "عرض الخريطة",
    viewList: "عرض القائمة",
    verifiedCR: "سجل تجاري موثّق عبر واثق",
    reviews: "تقييم",
    startingFrom: "تبدأ من",
    bookNow: "احجز الآن",
    viewDetails: "عرض الخدمات",
    kmAway: "كم",
    noResults: "لم يتم العثور على صالونات مطابقة للبحث.",
    noResultsDesc: "جرّب تغيير الحي، أو اختيار تصنيف آخر، أو إعادة ضبط كلمات البحث.",
    resetFilters: "إعادة تعيين الفلاتر",
    loading: "جارٍ تحميل الوجهات...",
    salonsFound: "صالون متاح",
    cityRiyadh: "الرياض",
    cityJeddah: "جدة",
  },
};

export default function DiscoverPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<DiscoveredBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState<string>("Riyadh");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  // Sync document language
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

  const t = translations[locale];
  const isRTL = locale === "ar";

  // Coordinates anchor for Riyadh & Jeddah
  const cityCenter = useMemo(() => {
    if (selectedCity === "Jeddah") {
      return { lat: 21.5433, lng: 39.1728 };
    }
    return { lat: 24.7136, lng: 46.6753 };
  }, [selectedCity]);

  useEffect(() => {
    fetchBranches();
  }, [searchQuery, selectedCity, selectedDistrict, selectedCategory]);

  async function fetchBranches() {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_marketplace_providers", {
        p_query: searchQuery.trim() || null,
        p_category: selectedCategory === "all" ? "all" : selectedCategory,
        p_city: selectedCity === "all" ? "all" : selectedCity,
        p_district: selectedDistrict === "all" ? "all" : selectedDistrict,
        p_user_lat: cityCenter.lat,
        p_user_lng: cityCenter.lng,
        p_limit: 30,
        p_offset: 0,
      });

      if (error) throw error;
      const rows: DiscoveredBranch[] = ((data?.providers || []) as Array<DiscoveredBranch & { sample_services?: DiscoveredBranch["popular_services"] }>)
        .map((row) => ({ ...row, popular_services: row.sample_services ?? null }));
      setBranches(rows);
      if (rows.length > 0 && !selectedBranchId) {
        setSelectedBranchId(rows[0].branch_id);
      }
      trackEvent("search_performed", {
        query: searchQuery.trim() || undefined,
        district: selectedDistrict === "all" ? undefined : selectedDistrict,
        category: selectedCategory === "all" ? undefined : selectedCategory,
        results_count: rows.length,
      });
    } catch (err) {
      console.error("Failed to load discovery:", err);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }

  const selectedBranch = useMemo(() => {
    return branches.find((b) => b.branch_id === selectedBranchId) || branches[0] || null;
  }, [branches, selectedBranchId]);

  // Coordinate projections for the SVG map surface
  // Bounding box for Riyadh: lat 24.55 to 24.85, lng 46.50 to 46.85
  // Bounding box for Jeddah: lat 21.40 to 21.75, lng 39.05 to 39.30
  const mapBounds = useMemo(() => {
    if (selectedCity === "Jeddah") {
      return { minLat: 21.40, maxLat: 21.75, minLng: 39.05, maxLng: 39.30 };
    }
    return { minLat: 24.55, maxLat: 24.85, minLng: 46.50, maxLng: 46.85 };
  }, [selectedCity]);

  const projectPin = (lat: number | null, lng: number | null, index: number) => {
    const validLat = lat && lat > 15 ? lat : mapBounds.minLat + 0.15 + (index * 0.03) % 0.2;
    const validLng = lng && lng > 35 ? lng : mapBounds.minLng + 0.15 + (index * 0.04) % 0.25;

    const x = ((validLng - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 100;
    const y = (1 - (validLat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 100;

    return {
      x: Math.max(8, Math.min(92, x)),
      y: Math.max(8, Math.min(92, y)),
    };
  };

  const districtList = SAUDI_DISTRICTS[selectedCity] || [];

  return (
    <div className={`min-h-screen bg-stone-50 font-sans ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* 1. TOP HEADER & SEARCH BAR */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Link href="/" className="text-xs font-bold text-stone-400 hover:text-stone-900 transition">
                  PRIMORA
                </Link>
                <span className="text-stone-300">/</span>
                <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">{t.pageTitle}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-stone-950 mt-0.5">{t.pageTitle}</h1>
            </div>

            {/* SEARCH INPUT */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-2.5 px-4 pr-10 text-xs text-stone-900 focus:outline-none focus:border-stone-900 transition"
              />
              <svg className={`w-4 h-4 text-stone-400 absolute top-3.5 ${isRTL ? "left-3" : "right-3"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* CITY SWITCHER */}
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-2xl border border-stone-200 self-start md:self-auto">
              <button
                type="button"
                onClick={() => {
                  setSelectedCity("Riyadh");
                  setSelectedDistrict("all");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedCity === "Riyadh" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {t.cityRiyadh}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCity("Jeddah");
                  setSelectedDistrict("all");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedCity === "Jeddah" ? "bg-white text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {t.cityJeddah}
              </button>
            </div>
          </div>

          {/* 2. CATEGORY & DISTRICT PILLS */}
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setSelectedCategory(cat.slug)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.slug
                    ? "bg-stone-900 text-stone-50 shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {isRTL ? cat.ar : cat.en}
              </button>
            ))}

            <span className="h-4 w-px bg-stone-300 mx-1 flex-shrink-0" />

            {/* District pills */}
            <button
              type="button"
              onClick={() => setSelectedDistrict("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                selectedDistrict === "all"
                  ? "bg-[#D1AF47] text-stone-950"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {t.allDistricts}
            </button>
            {districtList.map((dist) => (
              <button
                key={dist.en}
                type="button"
                onClick={() => setSelectedDistrict(dist.en)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedDistrict === dist.en
                    ? "bg-[#D1AF47] text-stone-950"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {isRTL ? dist.ar : dist.en}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* MOBILE TOGGLE (MAP VS LIST) */}
      <div className="lg:hidden bg-white border-b border-stone-200 p-2 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setMobileTab("map")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            mobileTab === "map" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"
          }`}
        >
          {t.viewMap}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("list")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            mobileTab === "list" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"
          }`}
        >
          {t.viewList} ({branches.length})
        </button>
      </div>

      {/* 3. MAIN SPLIT INTERACTIVE SURFACE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-160px)]">
        {/* LIST COLUMN (LEFT/RIGHT DEPENDING ON RTL) */}
        <div
          className={`lg:col-span-5 flex flex-col h-full overflow-hidden ${
            mobileTab === "list" ? "block" : "hidden lg:flex"
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-stone-200 mb-4">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              {branches.length} {t.salonsFound}
            </span>
            {(selectedDistrict !== "all" || selectedCategory !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDistrict("all");
                  setSelectedCategory("all");
                  setSearchQuery("");
                }}
                className="text-xs font-bold text-[#B8952E] hover:underline"
              >
                {t.resetFilters}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#D1AF47] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-stone-500">{t.loading}</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="flex-1 bg-white border border-stone-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900">{t.noResults}</h3>
              <p className="text-xs text-stone-500 leading-relaxed max-w-xs">{t.noResultsDesc}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {branches.map((b) => {
                const isSelected = selectedBranch?.branch_id === b.branch_id;
                return (
                  <div
                    key={b.branch_id}
                    onClick={() => {
                      setSelectedBranchId(b.branch_id);
                      if (window.innerWidth < 1024) setMobileTab("map");
                    }}
                    className={`bg-white border rounded-2xl p-4 cursor-pointer transition duration-150 flex gap-4 ${
                      isSelected
                        ? "border-stone-900 ring-2 ring-[#D1AF47] shadow-md"
                        : "border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0">
                      <img
                        src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop"
                        alt={isRTL ? b.business_name_ar : b.business_name_en}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-sm text-stone-900 leading-tight">
                            {isRTL ? b.business_name_ar : b.business_name_en}
                          </h4>
                          <span className="text-[10px] font-black text-amber-600 flex items-center gap-0.5">
                            {b.rating !== null ? `★ ${b.rating}` : (isRTL ? "جديد" : "New")}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 font-medium mt-1 flex items-center gap-1">
                          <span>{b.district}, {b.city}</span>
                          {b.distance_km && (
                            <>
                              <span className="text-stone-300">•</span>
                              <span className="text-stone-600 font-mono font-bold">{b.distance_km} {t.kmAway}</span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-100">
                        {b.popular_services && b.popular_services.length > 0 ? (
                          <span className="text-[10px] text-stone-500">
                            {t.startingFrom}{" "}
                            <strong className="text-stone-900 font-mono font-bold">
                              {b.popular_services[0].price} SAR
                            </strong>
                          </span>
                        ) : (
                          <span className="text-[10px] text-stone-400">{t.verifiedCR}</span>
                        )}
                        <Link
                          href={`/shop/${b.provider_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] font-bold text-stone-900 hover:text-[#D1AF47] transition"
                        >
                          {t.viewDetails} →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MAP COLUMN (RIGHT/LEFT) */}
        <div
          className={`lg:col-span-7 h-full rounded-3xl overflow-hidden border border-stone-200 relative bg-[#1E232B] shadow-inner ${
            mobileTab === "map" ? "block" : "hidden lg:block"
          }`}
        >
          {/* SVG Map Canvas with realistic highway/district geometry */}
          <div className="absolute inset-0 select-none">
            <svg className="w-full h-full opacity-60" viewBox="0 0 1000 700" preserveAspectRatio="none">
              <defs>
                <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#0B0F14" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="1000" height="700" fill="#14181F" />
              <circle cx="500" cy="350" r="400" fill="url(#mapGlow)" />

              {/* Major Ring & Artery Roads */}
              <line x1="500" y1="0" x2="500" y2="700" stroke="#2D3748" strokeWidth="4" />
              <line x1="0" y1="350" x2="1000" y2="350" stroke="#2D3748" strokeWidth="4" />
              <circle cx="500" cy="350" r="220" fill="none" stroke="#2D3748" strokeWidth="3" strokeDasharray="6 4" />
              <circle cx="500" cy="350" r="340" fill="none" stroke="#232C37" strokeWidth="2" />
              
              {/* Secondary avenues */}
              <line x1="200" y1="0" x2="800" y2="700" stroke="#1F2733" strokeWidth="2" />
              <line x1="800" y1="0" x2="200" y2="700" stroke="#1F2733" strokeWidth="2" />
              <line x1="0" y1="180" x2="1000" y2="180" stroke="#1F2733" strokeWidth="1.5" />
              <line x1="0" y1="520" x2="1000" y2="520" stroke="#1F2733" strokeWidth="1.5" />

              {/* District text watermarks */}
              <text x="500" y="340" textAnchor="middle" fill="#3D4A5C" fontSize="18" fontWeight="bold" letterSpacing="4">
                {selectedCity.toUpperCase()}
              </text>
            </svg>
          </div>

          {/* City label pill in map header */}
          <div className="absolute top-4 left-4 z-10 bg-stone-900/90 backdrop-blur-md border border-stone-700/60 rounded-xl px-3 py-1.5 flex items-center gap-2 text-stone-200 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{selectedCity === "Jeddah" ? t.cityJeddah : t.cityRiyadh}</span>
            <span className="text-stone-500">•</span>
            <span className="text-[#D1AF47] font-mono">{branches.length}</span>
          </div>

          {/* INTERACTIVE PINS */}
          <div className="absolute inset-0 pointer-events-auto">
            {branches.map((b, idx) => {
              const pos = projectPin(b.latitude, b.longitude, idx);
              const isSelected = selectedBranch?.branch_id === b.branch_id;

              return (
                <button
                  key={b.branch_id}
                  type="button"
                  onClick={() => setSelectedBranchId(b.branch_id)}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group transition-transform duration-300 ${
                    isSelected ? "z-20 scale-125" : "z-10 hover:scale-110"
                  }`}
                  title={isRTL ? b.business_name_ar : b.business_name_en}
                >
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs shadow-lg transition-all ${
                      isSelected
                        ? "bg-[#D1AF47] text-stone-950 ring-4 ring-[#D1AF47]/30 scale-110"
                        : "bg-stone-900 border border-stone-700 text-[#D1AF47] hover:border-[#D1AF47]"
                    }`}
                  >
                    ★
                  </div>
                  {isSelected && (
                    <div className="w-2 h-2 bg-[#D1AF47] rotate-45 mx-auto -mt-1 shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 4. SELECTED SALON PREVIEW FLYOUT CARD */}
          {selectedBranch && (
            <div className={`absolute bottom-4 left-4 right-4 z-20 max-w-md mx-auto bg-white/95 backdrop-blur-md border border-stone-200 rounded-3xl p-4 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4`}>
              <div className="flex gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-stone-100 flex-shrink-0 border border-stone-200">
                  <img
                    src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop"
                    alt={isRTL ? selectedBranch.business_name_ar : selectedBranch.business_name_en}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase font-bold text-[#B8952E] tracking-wider">
                        {selectedBranch.district}
                      </span>
                      <span className="text-xs font-black text-amber-600 flex items-center gap-0.5">
                        {selectedBranch.rating !== null ? `★ ${selectedBranch.rating} (${selectedBranch.reviews})` : (isRTL ? "جديد" : "New")}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-stone-950 mt-0.5 leading-snug">
                      {isRTL ? selectedBranch.business_name_ar : selectedBranch.business_name_en}
                    </h3>
                    <p className="text-[10px] text-stone-500 font-medium">
                      {selectedBranch.district}, {selectedBranch.city}
                      {selectedBranch.distance_km && ` • ${selectedBranch.distance_km} ${t.kmAway}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Link
                      href={`/shop/${selectedBranch.provider_id}`}
                      className="flex-1 py-2 px-3 bg-stone-950 hover:bg-stone-800 text-stone-50 rounded-xl text-xs font-bold text-center transition"
                    >
                      {t.bookNow}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

