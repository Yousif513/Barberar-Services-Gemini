"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Explore Beauty & Grooming",
    subtitle: "Discover Riyadh's top-rated verified salons, specialists, and luxury spas",
    searchPlaceholder: "Search by salon name, service, or neighborhood...",
    allServices: "All Services",
    haircut: "Haircut & Styling",
    makeup: "Makeup & Beauty",
    nails: "Nails & Care",
    spa: "Spa & Massage",
    allRiyadh: "All Riyadh",
    malqa: "Al-Malqa",
    olaya: "Olaya",
    yasmin: "Al-Yasmin",
    nakheel: "Al-Nakheel",
    hamra: "Al-Hamra",
    homeService: "Home Service Available",
    verifiedCR: "Wathq Verified CR",
    viewAndBook: "View & Book",
    reviews: "reviews",
    noResults: "No salons or specialists found matching your search criteria.",
    loading: "Searching verified salons in Riyadh...",
    errorMsg: "Failed to load salons. Please try again."
  },
  ar: {
    title: "استكشف خدمات الجمال والعناية",
    subtitle: "اكتشف أفضل الصالونات ومراكز التجميل المعتمدة في الرياض",
    searchPlaceholder: "ابحث باسم الصالون، الخدمة، أو الحي...",
    allServices: "جميع الخدمات",
    haircut: "قص وتصفيف الشعر",
    makeup: "المكياج والتجميل",
    nails: "العناية بالأظافر",
    spa: "سبا ومساج",
    allRiyadh: "جميع أحياء الرياض",
    malqa: "الالملقا",
    olaya: "العليا",
    yasmin: "الياسمين",
    nakheel: "النخيل",
    hamra: "الحمراء",
    homeService: "خدمة منزلية متاحة",
    verifiedCR: "موثق بسجل تجاري (واثق)",
    viewAndBook: "عرض الخدمات والحجز",
    reviews: "تقييم",
    noResults: "لم يتم العثور على صالونات مطابقة لمعايير البحث الحالية.",
    loading: "جاري البحث في صالونات ومراكز الرياض المعتمدة...",
    errorMsg: "تعذر تحميل الصالونات. يرجى المحاولة مرة أخرى."
  }
};

export default function CustomerSearchPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const t = translations[locale];

  // Sync language with document root
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

  const categories = [
    { id: "all", name: t.allServices },
    { id: "haircut", name: t.haircut },
    { id: "makeup", name: t.makeup },
    { id: "nails", name: t.nails },
    { id: "spa", name: t.spa }
  ];

  const locations = [
    { id: "all", name: t.allRiyadh },
    { id: "malqa", name: t.malqa },
    { id: "olaya", name: t.olaya },
    { id: "yasmin", name: t.yasmin },
    { id: "nakheel", name: t.nakheel },
    { id: "hamra", name: t.hamra }
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProviders();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, selectedLocation]);

  const fetchProviders = async () => {
    try {
      setLoading(true);
      setError("");

      // Attempt server search RPC with Arabic normalization (G29)
      const { data: rpcData, error: rpcError } = await supabase.rpc("search_marketplace_providers", {
        p_query: searchQuery.trim() || null,
        p_category: selectedCategory === "all" ? null : selectedCategory,
        p_city: "Riyadh",
        p_district: selectedLocation === "all" ? null : selectedLocation,
        p_limit: 24,
        p_offset: 0
      });

      if (!rpcError && rpcData?.providers) {
        setProviders(rpcData.providers);
        return;
      }

      // Live Supabase fallback query if RPC unapplied
      let query = supabase
        .from("providers")
        .select(`
          id,
          business_name_en,
          business_name_ar,
          rating,
          review_count,
          verified_business,
          cr_verification_status,
          branches (
            id,
            name_en,
            name_ar,
            city,
            district,
            latitude,
            longitude
          ),
          services (
            id,
            name_en,
            name_ar,
            price,
            category
          )
        `)
        .eq("status", "approved");

      if (searchQuery.trim()) {
        query = query.or(`business_name_en.ilike.%${searchQuery}%,business_name_ar.ilike.%${searchQuery}%`);
      }

      const { data: dbData, error: dbError } = await query.limit(24);
      if (dbError) throw dbError;

      const formatted = (dbData || []).map((p: any) => {
        const branch = Array.isArray(p.branches) ? p.branches[0] : p.branches;
        const services = Array.isArray(p.services) ? p.services : [];
        return {
          id: p.id,
          provider_id: p.id,
          business_name_en: p.business_name_en,
          business_name_ar: p.business_name_ar,
          district: branch?.district || "Riyadh",
          city: branch?.city || "Riyadh",
          rating: p.rating || 5.0,
          reviews: p.review_count || 0,
          verified_business: p.verified_business,
          cr_verification_status: p.cr_verification_status,
          sample_services: services.slice(0, 3)
        };
      });

      setProviders(formatted);
    } catch (err: any) {
      console.warn("Search providers fetch warning:", err);
      setError(t.errorMsg);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  const isRTL = locale === "ar";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-8 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Search Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-serif font-black tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {/* Search Bar Input */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="flex items-center gap-3 bg-gray-50/80 px-4 py-2.5 rounded-xl border border-gray-100">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-xs w-full placeholder-gray-400 text-gray-800 font-semibold"
          />
        </div>
      </div>

      {/* Filter Chips row */}
      <div className="space-y-4">
        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition duration-150 border ${
                selectedCategory === cat.id
                  ? "bg-black border-black text-white shadow-sm"
                  : "bg-white border-gray-200 text-gray-600 hover:border-black"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Location Filters */}
        <div className="flex flex-wrap gap-2">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc.id)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold transition duration-150 border ${
                selectedLocation === loc.id
                  ? "border-[#D1AF47] text-[#9A7D2C] bg-[#D1AF47]/10"
                  : "border-gray-200 text-gray-400 hover:border-gray-300 bg-white"
              }`}
            >
              {loc.name}
            </button>
          ))}
        </div>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-gray-400">
          {t.loading}
        </div>
      ) : error ? (
        <div className="py-12 text-center text-xs font-bold text-rose-600 bg-rose-50 rounded-xl border border-rose-200">
          {error}
        </div>
      ) : providers.length === 0 ? (
        <div className="py-20 text-center text-xs font-bold text-gray-400 bg-gray-50/60 rounded-2xl border border-gray-100">
          {t.noResults}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {providers.map((p) => {
            const providerName = isRTL ? p.business_name_ar || p.business_name_en : p.business_name_en || p.business_name_ar;
            const targetId = p.provider_id || p.id;
            return (
              <div 
                key={targetId} 
                className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)] flex flex-col justify-between group hover:shadow-[0_12px_40px_rgba(0,0,0,0.04)] hover:border-[#D1AF47]/30 transition-all duration-300"
              >
                <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-serif font-black text-base text-gray-900 group-hover:text-[#9A7D2C] transition">
                        {providerName}
                      </h4>
                      <div className="flex items-center gap-1 text-[11px] font-black text-amber-700 shrink-0">
                        <span>★</span>
                        <span>{Number(p.rating || 5.0).toFixed(1)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-gray-500">📍 {p.district || p.city || "Riyadh"}</span>
                      {p.distance_km && (
                        <span className="font-mono text-gray-400">({p.distance_km} km)</span>
                      )}
                      {(p.verified_business || p.cr_verification_status === "verified") && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold text-[8px]">
                          ✓ {t.verifiedCR}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sample Services Preview */}
                  {p.sample_services && p.sample_services.length > 0 && (
                    <div className="border-t border-gray-100 pt-3 space-y-1.5">
                      {p.sample_services.map((s: any, idx: number) => (
                        <div key={s.id || idx} className="flex justify-between text-[11px] text-gray-600 font-semibold">
                          <span className="truncate max-w-[180px]">
                            {isRTL ? s.name_ar || s.name_en : s.name_en || s.name_ar}
                          </span>
                          <span className="font-bold text-gray-900 shrink-0">{s.price} SAR</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Link 
                    href={`/shop/${targetId}`} 
                    className="w-full py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold text-center transition block shadow-sm"
                  >
                    {t.viewAndBook}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
