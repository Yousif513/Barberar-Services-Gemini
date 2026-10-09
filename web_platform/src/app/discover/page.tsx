"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { errorMessage } from "@/lib/error-message";
import { loadExpandedCategorySlugs } from "@/lib/category-tree";
import { sar } from "@/components/operations-ui";
import SponsoredPlacements from "@/components/sponsored-placements";

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

type CategoryOption = { slug: string; name_en: string; name_ar: string };
type DiscoverResult = { key: string; branches: DiscoveredBranch[]; error: string };
const NO_BRANCHES: DiscoveredBranch[] = [];

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
    allCategories: "All Categories",
    retry: "Try again",
    loadFailed: "Could not load the salons",
    categoriesFailed: "Could not load the categories",
    nearMe: "Distance from me",
    locating: "Locating...",
    locationDenied: "Your browser did not share the location:",
    noMapLocation: "No map location",
    mapNote: "Schematic map: each pin is placed from the branch's coordinates.",
    notOnMap: "{n} not shown on the map (no coordinates)",
    selectSalon: "Show on the map",
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
    allCategories: "جميع التصنيفات",
    retry: "حاول مرة أخرى",
    loadFailed: "تعذر تحميل الصالونات",
    categoriesFailed: "تعذر تحميل التصنيفات",
    nearMe: "المسافة من موقعي",
    locating: "جارٍ تحديد الموقع...",
    locationDenied: "لم يشارك المتصفح الموقع:",
    noMapLocation: "بلا موقع على الخريطة",
    mapNote: "خريطة تخطيطية: يوضع كل دبوس من إحداثيات الفرع.",
    notOnMap: "{n} غير ظاهر على الخريطة (بلا إحداثيات)",
    selectSalon: "إظهار على الخريطة",
  },
};

export default function DiscoverPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [districtOptions, setDistrictOptions] = useState<{ city: string; names: string[] }>({ city: "", names: [] });
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [retry, setRetry] = useState(0);

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

  // The categories are the ones the admin console manages; their slugs are what the search matches.
  useEffect(() => {
    let active = true;
    supabase
      .from("categories")
      .select("slug, name_en, name_ar, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setCategoriesError(errorMessage(error));
        else setCategories((data ?? []) as CategoryOption[]);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  // A result belongs to the filters that produced it; until it arrives the list is loading.
  const requestKey = JSON.stringify([searchQuery, selectedCity, selectedDistrict, selectedCategory, userPosition, retry]);
  const loading = result?.key !== requestKey;
  const branches = loading || !result ? NO_BRANCHES : result.branches;
  const loadError = loading || !result ? "" : result.error;

  useEffect(() => {
    let active = true;
    // A parent category covers its children: providers list services in the leaf categories, and the search matches a
    // service's own category exactly, so one search runs per slug and the answers are merged by branch.
    const searchAll = async () => {
      let slugs = [selectedCategory];
      if (selectedCategory !== "all") {
        const expanded = await loadExpandedCategorySlugs([selectedCategory]);
        if (expanded.error) return { data: null, error: { message: expanded.error } };
        slugs = expanded.slugs;
      }
      const answers = await Promise.all(
        slugs.map((slug) =>
          supabase.rpc("search_marketplace_providers", {
            p_query: searchQuery.trim() || null,
            p_category: slug,
            p_city: selectedCity,
            p_district: selectedDistrict,
            // Distances are measured from the visitor, and only when the visitor shared a position: a city centre is not "where you are".
            p_user_lat: userPosition?.lat ?? null,
            p_user_lng: userPosition?.lng ?? null,
            p_limit: 30,
            p_offset: 0,
          }),
        ),
      );
      const failed = answers.find((answer) => answer.error);
      if (failed?.error) return { data: null, error: failed.error };
      if (answers.length === 1) return { data: answers[0].data, error: null };
      const merged = new Map<string, DiscoveredBranch>();
      for (const answer of answers) {
        for (const row of (Array.isArray(answer.data?.providers) ? answer.data.providers : []) as DiscoveredBranch[]) merged.set(row.branch_id, row);
      }
      const providers = [...merged.values()].sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      return { data: { providers }, error: null };
    };
    searchAll()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setResult({ key: requestKey, branches: [], error: errorMessage(error) });
          return;
        }
        const rows: DiscoveredBranch[] = ((data?.providers || []) as Array<DiscoveredBranch & { sample_services?: DiscoveredBranch["popular_services"] }>)
          .map((row) => ({ ...row, popular_services: row.sample_services ?? null }));
        setResult({ key: requestKey, branches: rows, error: "" });
        if (selectedDistrict === "all") {
          setDistrictOptions({ city: selectedCity, names: [...new Set(rows.map((row) => row.district).filter(Boolean))].sort() });
        }
        trackEvent("search_performed", {
          query: searchQuery.trim() || undefined,
          district: selectedDistrict === "all" ? undefined : selectedDistrict,
          category: selectedCategory === "all" ? undefined : selectedCategory,
          results_count: rows.length,
        });
      });
    return () => {
      active = false;
    };
  }, [requestKey, searchQuery, selectedCity, selectedDistrict, selectedCategory, userPosition]);

  const shareLocation = () => {
    setLocationError("");
    if (userPosition) {
      setUserPosition(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError(`${t.locationDenied} -`);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      (positionError) => {
        setLocationError(`${t.locationDenied} ${positionError.message}`);
        setLocating(false);
      },
      { timeout: 10000 },
    );
  };

  const selectedBranch = useMemo(() => {
    return branches.find((b) => b.branch_id === selectedBranchId) || branches[0] || null;
  }, [branches, selectedBranchId]);

  // The schematic map covers one city. A pin is drawn only for a branch that has coordinates inside it: a branch without
  // coordinates is listed, and counted as "not on the map", never placed at a made-up spot.
  // Bounding box for Riyadh: lat 24.55 to 24.85, lng 46.50 to 46.85; Jeddah: lat 21.40 to 21.75, lng 39.05 to 39.30
  const mapBounds = useMemo(() => {
    if (selectedCity === "Jeddah") {
      return { minLat: 21.40, maxLat: 21.75, minLng: 39.05, maxLng: 39.30 };
    }
    return { minLat: 24.55, maxLat: 24.85, minLng: 46.50, maxLng: 46.85 };
  }, [selectedCity]);

  const projectPin = (lat: number | null, lng: number | null) => {
    if (lat === null || lng === null || lat === undefined || lng === undefined) return null;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < mapBounds.minLat || latitude > mapBounds.maxLat || longitude < mapBounds.minLng || longitude > mapBounds.maxLng) return null;
    return {
      x: ((longitude - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 100,
      y: (1 - (latitude - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 100,
    };
  };

  const pins = branches.map((b) => ({ branch: b, pos: projectPin(b.latitude, b.longitude) }));
  const unmappedCount = pins.filter((pin) => pin.pos === null).length;
  const selectedOnMap = selectedBranch ? pins.find((pin) => pin.branch.branch_id === selectedBranch.branch_id)?.pos !== null : false;

  const districtList = districtOptions.city === selectedCity ? [...districtOptions.names] : [];
  if (selectedDistrict !== "all" && !districtList.includes(selectedDistrict)) districtList.push(selectedDistrict);

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
                aria-label={t.searchPlaceholder}
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-2.5 px-4 pr-10 text-xs text-stone-900 focus:outline-none focus:border-stone-900 transition"
              />
              <svg aria-hidden="true" className={`w-4 h-4 text-stone-400 absolute top-3.5 ${isRTL ? "left-3" : "right-3"}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* CITY SWITCHER */}
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-2xl border border-stone-200 self-start md:self-auto">
              <button
                type="button"
                aria-pressed={selectedCity === "Riyadh"}
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
                aria-pressed={selectedCity === "Jeddah"}
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
            {[{ slug: "all", name_en: t.allCategories, name_ar: t.allCategories }, ...categories].map((cat) => (
              <button
                key={cat.slug}
                type="button"
                aria-pressed={selectedCategory === cat.slug}
                onClick={() => setSelectedCategory(cat.slug)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.slug
                    ? "bg-stone-900 text-stone-50 shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {isRTL ? cat.name_ar : cat.name_en}
              </button>
            ))}
            {categoriesError && (
              <span role="alert" className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-red-700">
                {t.categoriesFailed}
                <button type="button" onClick={() => { setCategoriesError(""); setRetry((n) => n + 1); }} className="rounded-lg border border-red-300 px-2 py-1 focus-visible:outline-2 focus-visible:outline-red-700">{t.retry}</button>
              </span>
            )}

            <span className="h-4 w-px bg-stone-300 mx-1 flex-shrink-0" />

            {/* District pills */}
            <button
              type="button"
              aria-pressed={selectedDistrict === "all"}
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
                key={dist}
                type="button"
                aria-pressed={selectedDistrict === dist}
                onClick={() => setSelectedDistrict(dist)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedDistrict === dist
                    ? "bg-[#D1AF47] text-stone-950"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {dist}
              </button>
            ))}
            <span className="h-4 w-px bg-stone-300 mx-1 flex-shrink-0" />
            <button
              type="button"
              aria-pressed={userPosition !== null}
              onClick={shareLocation}
              disabled={locating}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-stone-900 disabled:opacity-50 ${
                userPosition ? "bg-stone-900 text-stone-50" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {locating ? t.locating : t.nearMe}
            </button>
            {locationError && <span role="alert" className="whitespace-nowrap text-xs font-bold text-red-700">{locationError}</span>}
          </div>
        </div>
      </header>

      {/* MOBILE TOGGLE (MAP VS LIST) */}
      <div className="lg:hidden bg-white border-b border-stone-200 p-2 flex justify-center gap-2">
        <button
          type="button"
          aria-pressed={mobileTab === "map"}
          onClick={() => setMobileTab("map")}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            mobileTab === "map" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700"
          }`}
        >
          {t.viewMap}
        </button>
        <button
          type="button"
          aria-pressed={mobileTab === "list"}
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

          <SponsoredPlacements locale={locale} city={selectedCity} category={selectedCategory} />

          {loading ? (
            <div role="status" className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-[#D1AF47] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-stone-500">{t.loading}</p>
            </div>
          ) : loadError ? (
            <div role="alert" className="flex-1 bg-white border border-red-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <h3 className="font-serif font-bold text-base text-red-700">{t.loadFailed}</h3>
              <p className="text-xs text-stone-500 leading-relaxed max-w-xs" dir="ltr">{loadError}</p>
              <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">{t.retry}</button>
            </div>
          ) : branches.length === 0 ? (
            <div className="flex-1 bg-white border border-stone-200 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-3">
              <div aria-hidden="true" className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="font-serif font-bold text-base text-stone-900">{t.noResults}</h3>
              <p className="text-xs text-stone-500 leading-relaxed max-w-xs">{t.noResultsDesc}</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pe-1">
              {pins.map(({ branch: b, pos }) => {
                const isSelected = selectedBranch?.branch_id === b.branch_id;
                const name = isRTL ? b.business_name_ar : b.business_name_en;
                return (
                  <div
                    key={b.branch_id}
                    className={`bg-white border rounded-2xl p-4 transition duration-150 ${
                      isSelected
                        ? "border-stone-900 ring-2 ring-[#D1AF47] shadow-md"
                        : "border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${t.selectSalon}: ${name}`}
                      onClick={() => {
                        setSelectedBranchId(b.branch_id);
                        if (window.innerWidth < 1024) setMobileTab("map");
                      }}
                      className="flex w-full gap-4 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                    >
                      <span aria-hidden="true" className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-stone-900 font-serif text-2xl font-black text-[#D1AF47]">
                        {(name || "").charAt(0)}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-stone-900 leading-tight">{name}</span>
                          <span className="text-[10px] font-black text-amber-600 flex items-center gap-0.5">
                            {b.rating !== null ? `★ ${b.rating}` : (isRTL ? "جديد" : "New")}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-stone-500 font-medium">
                          <span>{[b.district, b.city].filter(Boolean).join(", ")}</span>
                          {b.distance_km !== null && b.distance_km !== undefined && (
                            <>
                              <span className="text-stone-300">•</span>
                              <span className="text-stone-600 font-mono font-bold">{b.distance_km} {t.kmAway}</span>
                            </>
                          )}
                          {pos === null && (
                            <>
                              <span className="text-stone-300">•</span>
                              <span className="font-bold text-stone-400">{t.noMapLocation}</span>
                            </>
                          )}
                        </span>
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2">
                      {b.popular_services && b.popular_services.length > 0 ? (
                        <span className="text-[10px] text-stone-500">
                          {t.startingFrom}{" "}
                          <strong className="text-stone-900 font-mono font-bold">
                            {sar(Number(b.popular_services[0].price), locale)}
                          </strong>
                        </span>
                      ) : (
                        <span />
                      )}
                      <Link
                        href={`/shop/${b.provider_id}`}
                        className="text-[11px] font-bold text-stone-900 hover:text-[#D1AF47] transition focus-visible:outline-2 focus-visible:outline-stone-900"
                      >
                        {t.viewDetails} →
                      </Link>
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
              <text x="500" y="340" textAnchor="middle" fill="#3D4A5C" fontSize="18" fontWeight="bold" letterSpacing={locale === "ar" ? 0 : 4}>
                {selectedCity === "Jeddah" ? t.cityJeddah : selectedCity === "Riyadh" ? t.cityRiyadh : selectedCity}
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
          <p className="absolute bottom-2 left-4 z-10 text-[10px] font-semibold text-stone-400">
            {t.mapNote}{unmappedCount > 0 ? ` ${t.notOnMap.replace("{n}", String(unmappedCount))}` : ""}
          </p>

          {/* PINS: one per branch that has coordinates inside this city's map */}
          <div className="absolute inset-0 pointer-events-auto">
            {pins.map(({ branch: b, pos }) => {
              if (!pos) return null;
              const isSelected = selectedBranch?.branch_id === b.branch_id;
              const name = isRTL ? b.business_name_ar : b.business_name_en;

              return (
                <button
                  key={b.branch_id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={name}
                  onClick={() => setSelectedBranchId(b.branch_id)}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group transition-transform duration-300 focus-visible:outline-2 focus-visible:outline-[#D1AF47] ${
                    isSelected ? "z-20 scale-125" : "z-10 hover:scale-110"
                  }`}
                  title={name}
                >
                  <div
                    aria-hidden="true"
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs shadow-lg transition-all ${
                      isSelected
                        ? "bg-[#D1AF47] text-stone-950 ring-4 ring-[#D1AF47]/30 scale-110"
                        : "bg-stone-900 border border-stone-700 text-[#D1AF47] hover:border-[#D1AF47]"
                    }`}
                  >
                    ★
                  </div>
                  {isSelected && (
                    <div aria-hidden="true" className="w-2 h-2 bg-[#D1AF47] rotate-45 mx-auto -mt-1 shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 4. SELECTED SALON PREVIEW FLYOUT CARD */}
          {selectedBranch && (
            <div className="absolute bottom-8 left-4 right-4 z-20 max-w-md mx-auto bg-white/95 backdrop-blur-md border border-stone-200 rounded-3xl p-4 shadow-2xl">
              <div className="flex gap-4">
                <div aria-hidden="true" className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-stone-900 font-serif text-2xl font-black text-[#D1AF47]">
                  {(isRTL ? selectedBranch.business_name_ar : selectedBranch.business_name_en).charAt(0)}
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
                      {[selectedBranch.district, selectedBranch.city].filter(Boolean).join(", ")}
                      {selectedBranch.distance_km !== null && selectedBranch.distance_km !== undefined && ` • ${selectedBranch.distance_km} ${t.kmAway}`}
                      {!selectedOnMap && ` • ${t.noMapLocation}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Link
                      href={`/shop/${selectedBranch.provider_id}`}
                      className="flex-1 py-2 px-3 bg-stone-950 hover:bg-stone-800 text-stone-50 rounded-xl text-xs font-bold text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
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

