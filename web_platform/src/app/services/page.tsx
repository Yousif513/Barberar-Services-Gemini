"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { sar } from "@/components/operations-ui";
import { ModalOverlay, ModalPortal } from "@/components/modal";

/* ─────────────────────────────────────────────────────────────────────────
   PRIMORA · Services — the public catalog.
   Shops come from search_marketplace_providers (server-side search, category, ratings and paging) and services from a
   paged, filtered query; ratings come from provider_rating_summaries. Nothing is downloaded in bulk and nothing is
   invented: a failed query shows its error with a retry, an empty result shows an empty state.
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
  category_slug: string;
  add_ons: AddOn[];
  rating: number | null;
  images: string[];
  providerNameEn: string;
  providerNameAr: string;
  provider_id: string | null;
};
type CatalogCategory = { id: string; slug: string; name_en: string; name_ar: string; icon: string | null };
type CatalogShop = {
  id: string;
  providerId: string;
  nameEn: string;
  nameAr: string;
  placeEn: string;
  placeAr: string;
  providerNameEn: string;
  providerNameAr: string;
  serviceNamesEn: string[];
  serviceNamesAr: string[];
  rating: number | null;
  reviews: number;
};

type ServiceRow = {
  id: string;
  provider_id?: string | null;
  slug?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  base_price?: number | string | null;
  base_duration_minutes?: number | null;
  is_home_service_eligible?: boolean | null;
  featured_in_services?: boolean | null;
  add_ons?: unknown;
  images?: unknown;
  categories?: { slug?: string | null } | null;
  providers?: { business_name_en?: string | null; business_name_ar?: string | null } | null;
};
type ShopRow = {
  branch_id: string;
  provider_id: string;
  business_name_en: string | null;
  business_name_ar: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  city: string | null;
  district: string | null;
  rating: number | string | null;
  reviews: number | string | null;
  sample_services: Array<{ id: string; name_en: string | null; name_ar: string | null }> | null;
};

type PriceBand = "any" | "u50" | "50-100" | "100-200" | "200+";
type SortKey = "recommended" | "price-asc" | "price-desc";
type ServiceFilters = { query: string; category: string; priceBand: PriceBand; homeOnly: boolean; sort: SortKey };
type Page<T> = { items: T[]; total: number; error: string };
type PageResult<T> = Page<T> & { key: string };

const PAGE_SIZE = 24;

// The same columns twice: an inner join on the category is needed only when the list is filtered by category.
const SERVICE_COLUMNS = "id, provider_id, slug, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_home_service_eligible, featured_in_services, add_ons, images";
const SERVICE_SELECT = `${SERVICE_COLUMNS}, categories(slug), providers!inner(business_name_en, business_name_ar, is_verified)`;
const SERVICE_SELECT_BY_CATEGORY = `${SERVICE_COLUMNS}, categories!inner(slug), providers!inner(business_name_en, business_name_ar, is_verified)`;

// Shown only when a provider uploaded no picture for a service; chosen by category, never by guessing who the service is for.
const SERVICE_IMAGE_BY_CATEGORY: Record<string, string> = {
  "barber-hair": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200&auto=format&fit=crop",
  "beard-shave": "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1200&auto=format&fit=crop",
  "skincare-facials": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop",
  "spa-wellness": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop",
  "nails-hands": "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop",
  "signature-packages": "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200&auto=format&fit=crop"
};

function serviceImageFor(service: CatalogService) {
  return service.images[0] || SERVICE_IMAGE_BY_CATEGORY[service.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
}

function uploadedImages(images: unknown): string[] {
  return Array.isArray(images) ? images.filter((image): image is string => typeof image === "string" && image.trim().length > 0) : [];
}

// The search term is placed inside a PostgREST or() filter, where these characters have a meaning of their own.
function searchTerm(value: string) {
  return value.replace(/[%*,()"\\]/g, " ").replace(/\s+/g, " ").trim();
}

async function ratingsFor(providerIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(providerIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("provider_rating_summaries", { p_provider_ids: ids });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ provider_id: string; rating: number | string | null }>;
  return new Map(rows.filter((row) => row.rating !== null).map((row) => [row.provider_id, Number(row.rating)]));
}

async function fetchShopsPage(query: string, category: string, offset: number): Promise<Page<CatalogShop>> {
  const { data, error } = await supabase.rpc("search_marketplace_providers", {
    p_query: query.trim() || null,
    p_category: category,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
  if (error) return { items: [], total: 0, error: errorMessage(error) };
  const payload = data as { total_count?: number | string; providers?: ShopRow[] } | null;
  const rows = Array.isArray(payload?.providers) ? payload.providers : [];
  const items = rows.map((row): CatalogShop => {
    const samples = row.sample_services ?? [];
    const place = [row.district, row.city].filter(Boolean).join(", ");
    return {
      id: row.branch_id,
      providerId: row.provider_id,
      nameEn: row.branch_name_en || row.business_name_en || row.business_name_ar || "",
      nameAr: row.branch_name_ar || row.business_name_ar || row.business_name_en || "",
      placeEn: place,
      placeAr: place,
      providerNameEn: row.business_name_en || row.business_name_ar || "",
      providerNameAr: row.business_name_ar || row.business_name_en || "",
      serviceNamesEn: samples.map((s) => s.name_en || s.name_ar || "").filter(Boolean),
      serviceNamesAr: samples.map((s) => s.name_ar || s.name_en || "").filter(Boolean),
      rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
      reviews: Number(row.reviews ?? 0),
    };
  });
  return { items, total: Number(payload?.total_count ?? items.length), error: "" };
}

async function fetchServicesPage(filters: ServiceFilters, offset: number): Promise<Page<CatalogService>> {
  try {
    const byCategory = filters.category !== "all";
    let request = supabase
      .from("services")
      .select(byCategory ? SERVICE_SELECT_BY_CATEGORY : SERVICE_SELECT, { count: "exact" })
      .eq("is_active", true)
      .eq("providers.is_verified", true);
    if (byCategory) request = request.eq("categories.slug", filters.category);
    if (filters.homeOnly) request = request.eq("is_home_service_eligible", true);
    if (filters.priceBand === "u50") request = request.lt("base_price", 50);
    if (filters.priceBand === "50-100") request = request.gte("base_price", 50).lte("base_price", 100);
    if (filters.priceBand === "100-200") request = request.gte("base_price", 100).lte("base_price", 200);
    if (filters.priceBand === "200+") request = request.gte("base_price", 200);
    const term = searchTerm(filters.query);
    if (term) request = request.or(`name_en.ilike.*${term}*,name_ar.ilike.*${term}*,description_en.ilike.*${term}*,description_ar.ilike.*${term}*`);
    if (filters.sort === "price-asc") request = request.order("base_price", { ascending: true });
    else if (filters.sort === "price-desc") request = request.order("base_price", { ascending: false });
    else request = request.order("featured_in_services", { ascending: false }).order("sort_order", { ascending: true });
    const { data, error, count } = await request.order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ServiceRow[];
    const ratings = await ratingsFor(rows.map((row) => row.provider_id).filter((id): id is string => Boolean(id)));
    const items = rows.map((row): CatalogService => {
      const category = row.categories ?? null;
      const provider = row.providers ?? null;
      return {
        id: row.id,
        slug: row.slug ?? row.id,
        name_en: row.name_en || row.name_ar || "",
        name_ar: row.name_ar || row.name_en || "",
        description_en: row.description_en ?? "",
        description_ar: row.description_ar ?? "",
        base_price: Number(row.base_price || 0),
        base_duration_minutes: Number(row.base_duration_minutes || 0),
        is_home_service_eligible: !!row.is_home_service_eligible,
        featured_in_services: !!row.featured_in_services,
        category_slug: category?.slug ?? "other",
        add_ons: Array.isArray(row.add_ons) ? (row.add_ons as AddOn[]) : [],
        rating: row.provider_id ? (ratings.get(row.provider_id) ?? null) : null,
        images: uploadedImages(row.images),
        providerNameEn: provider?.business_name_en || provider?.business_name_ar || "",
        providerNameAr: provider?.business_name_ar || provider?.business_name_en || "",
        provider_id: row.provider_id || null,
      };
    });
    return { items, total: count ?? items.length, error: "" };
  } catch (err) {
    return { items: [], total: 0, error: errorMessage(err) };
  }
}

const CATEGORY_ICON: Record<string, string> = {
  scissors: "✂️", razor: "🪒", sparkles: "✨", lotus: "🪷", hand: "🤲", crown: "👑",
};

const translations = {
  en: {
    title: "Services",
    subtitle: "Search shops and services by treatment, provider and category.",
    search: "Search shops, services, categories...",
    providerSearch: "Search shop or provider name...",
    filters: "Filters",
    filterHint: "Refine the catalog by result type, category, price and availability.",
    resultType: "Result type",
    categoryFilter: "Category",
    clearFilters: "Clear filters",
    all: "All",
    typeAll: "All",
    shopsTab: "Shops",
    servicesTab: "Services",
    changeCategory: "Change category",
    shops: "shops",
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
    rating: "Rating",
    loadMore: "Show more",
    loadingMore: "Loading...",
    showing: "Showing {n} of {total}",
    retry: "Try again",
    clearSearch: "Clear search",
    shopsFilterNote: "Price and home-service filters apply to services only.",
    shopsFailed: "Could not load the shops",
    servicesFailed: "Could not load the services",
    categoriesFailed: "Could not load the categories",
    featured: "Featured",
    home: "Home",
    from: "From",
    sar: "SAR",
    min: "min",
    book: "Book",
    results: "services",
    resultSummary: "matching results",
    shopEmpty: "No shops match these filters. Try a wider provider name or category.",
    servicesEmpty: "No services match these filters. Try a wider service name or category.",
    provider: "Provider",
    servicesOffered: "Services offered",
    viewShop: "View shop",
    reviewsLabel: "reviews",
    newShop: "New",
    loadingCatalog: "Loading...",
    empty: "Nothing matches these filters. Try widening your search.",
    addOns: "Add-ons",
    duration: "Duration",
    close: "Close",
    bookNow: "Book this service",
    backHome: "PRIMORA",
    lang: "العربية",
  },
  ar: {
    title: "الخدمات",
    subtitle: "ابحث عن المتاجر والخدمات حسب العلاج والمزود والفئة.",
    search: "ابحث عن المتاجر والخدمات والفئات...",
    providerSearch: "ابحث باسم المتجر أو المزود...",
    filters: "الفلاتر",
    filterHint: "رتب النتائج حسب النوع والفئة والسعر والتوفر.",
    resultType: "نوع النتيجة",
    categoryFilter: "الفئة",
    clearFilters: "مسح الفلاتر",
    all: "الكل",
    typeAll: "الكل",
    shopsTab: "المتاجر",
    servicesTab: "الخدمات",
    changeCategory: "تغيير الفئة",
    shops: "متجر",
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
    rating: "التقييم",
    loadMore: "عرض المزيد",
    loadingMore: "جارٍ التحميل...",
    showing: "عرض {n} من {total}",
    retry: "حاول مرة أخرى",
    clearSearch: "مسح البحث",
    shopsFilterNote: "فلاتر السعر والخدمة المنزلية تنطبق على الخدمات فقط.",
    shopsFailed: "تعذر تحميل المتاجر",
    servicesFailed: "تعذر تحميل الخدمات",
    categoriesFailed: "تعذر تحميل الفئات",
    featured: "مميزة",
    home: "منزلية",
    from: "من",
    sar: "ر.س",
    min: "دقيقة",
    book: "احجز",
    results: "خدمة",
    resultSummary: "نتيجة مطابقة",
    shopEmpty: "لا توجد متاجر مطابقة لهذه الفلاتر. جرّب اسم مزود أو فئة أوسع.",
    servicesEmpty: "لا توجد خدمات مطابقة لهذه الفلاتر. جرّب اسم خدمة أو فئة أوسع.",
    provider: "المزود",
    servicesOffered: "الخدمات المقدمة",
    viewShop: "عرض المتجر",
    reviewsLabel: "تقييم",
    newShop: "جديد",
    loadingCatalog: "جارٍ التحميل...",
    empty: "لا توجد نتائج مطابقة. جرّب توسيع البحث.",
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
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"all" | "shops" | "services">("all");
  const [activeCat, setActiveCat] = useState<string>(searchParams.get("category") ?? "all");
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [priceBand, setPriceBand] = useState<PriceBand>("any");
  const [homeOnly, setHomeOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [detail, setDetail] = useState<CatalogService | null>(null);
  const [retry, setRetry] = useState(0);
  const [shopsResult, setShopsResult] = useState<PageResult<CatalogShop> | null>(null);
  const [servicesResult, setServicesResult] = useState<PageResult<CatalogService> | null>(null);
  const [moreBusy, setMoreBusy] = useState<"" | "shops" | "services">("");

  useEffect(() => {
    const sync = () => setLang(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "shops" || tabParam === "services" || tabParam === "all") {
      setActiveResultTab(tabParam);
    }
    const catParam = searchParams.get("category");
    if (catParam) {
      setActiveCat(catParam);
    }
  }, [searchParams]);

  // Collapse the category chips when scrolling down (frees vertical space on
  // mobile and stops the sticky bar from covering content); reveal near the top
  // or when scrolling back up.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 120) setCategoriesCollapsed(false);
      else if (y > lastY + 6) setCategoriesCollapsed(true);
      else if (y < lastY - 6) setCategoriesCollapsed(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The search runs on the server; typing waits a moment so each keystroke does not become a request.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    supabase
      .from("categories")
      .select("id, slug, name_en, name_ar, icon, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setCategoriesError(errorMessage(error));
        else setCategories((data ?? []) as CatalogCategory[]);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  // A result belongs to the filters that produced it; while the filters differ from the result's key it is loading.
  const shopsKey = [debouncedQuery, activeCat, retry].join("|");
  const servicesKey = [debouncedQuery, activeCat, priceBand, homeOnly, sort, retry].join("|");
  const shopsLoading = shopsResult?.key !== shopsKey;
  const servicesLoading = servicesResult?.key !== servicesKey;

  useEffect(() => {
    let active = true;
    fetchShopsPage(debouncedQuery, activeCat, 0).then((page) => {
      if (active) setShopsResult({ ...page, key: shopsKey });
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery, activeCat, shopsKey]);

  useEffect(() => {
    let active = true;
    fetchServicesPage({ query: debouncedQuery, category: activeCat, priceBand, homeOnly, sort }, 0).then((page) => {
      if (active) setServicesResult({ ...page, key: servicesKey });
    });
    return () => {
      active = false;
    };
  }, [debouncedQuery, activeCat, priceBand, homeOnly, sort, servicesKey]);

  const loadMoreShops = async () => {
    if (!shopsResult || shopsLoading || moreBusy) return;
    setMoreBusy("shops");
    const page = await fetchShopsPage(debouncedQuery, activeCat, shopsResult.items.length);
    setShopsResult((prev) => (prev && prev.key === shopsKey ? { ...prev, items: [...prev.items, ...page.items], total: page.error ? prev.total : page.total, error: page.error } : prev));
    setMoreBusy("");
  };

  const loadMoreServices = async () => {
    if (!servicesResult || servicesLoading || moreBusy) return;
    setMoreBusy("services");
    const page = await fetchServicesPage({ query: debouncedQuery, category: activeCat, priceBand, homeOnly, sort }, servicesResult.items.length);
    setServicesResult((prev) => (prev && prev.key === servicesKey ? { ...prev, items: [...prev.items, ...page.items], total: page.error ? prev.total : page.total, error: page.error } : prev));
    setMoreBusy("");
  };

  const toggleLang = () => {
    const target = lang === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLang(target);
  };

  const t = translations[lang];
  const isRTL = lang === "ar";

  const shopItems = shopsLoading || !shopsResult ? [] : shopsResult.items;
  const serviceItems = servicesLoading || !servicesResult ? [] : servicesResult.items;
  const shopTotal = shopsLoading || !shopsResult ? null : shopsResult.total;
  const serviceTotal = servicesLoading || !servicesResult ? null : servicesResult.total;
  const showing = (n: number, total: number) => t.showing.replace("{n}", n.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")).replace("{total}", total.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"));
  const count = (value: number | null) => (value === null ? "…" : value.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"));

  const catName = (c?: CatalogCategory) => (c ? (isRTL ? c.name_ar : c.name_en) : "");

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`min-h-screen bg-[#F2EEE6] text-[#211A12] font-sans ${isRTL ? "text-right" : "text-left"}`}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-[#211A12]/8 bg-[#F2EEE6]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-[clamp(16px,4vw,40px)] py-4">
          <Link href="/" className="font-serif text-lg font-black tracking-[0.22em] text-[#A57C32]">{t.backHome}</Link>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={toggleLang} className="rounded-full border border-[#211A12]/10 bg-white px-3.5 py-2 text-xs font-bold text-[#5F584D] shadow-sm transition hover:border-[#C29A4C]/50 hover:text-[#A57C32]">{t.lang}</button>
            <Link href="/discover" className="rounded-full bg-gradient-to-r from-[#C29A4C] to-[#E6C679] px-4 py-2 text-xs font-black text-[#15100A] shadow-md shadow-[#C29A4C]/20 transition hover:brightness-105">{t.book}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-[clamp(16px,4vw,40px)] py-8">
        {categoriesError && (
          <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{t.categoriesFailed}: {categoriesError}</span>
            <button type="button" onClick={() => { setCategoriesError(""); setRetry((n) => n + 1); }} className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-black focus-visible:outline-2 focus-visible:outline-red-700">{t.retry}</button>
          </div>
        )}
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-serif text-3xl font-black leading-tight text-[#211A12] sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-xl text-sm font-medium text-[#5F584D]">{t.subtitle}</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[310px_minmax(0,1fr)] lg:items-start">
        {/* Left filter rail */}
        <aside className="z-30 space-y-5 rounded-[28px] border border-[#211A12]/8 bg-white/[0.92] p-5 shadow-[0_18px_55px_rgba(21,16,10,0.08)] backdrop-blur-xl lg:sticky lg:top-[88px]">
          <div className={`flex items-start justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <div>
              <h2 className="font-serif text-xl font-black text-[#211A12]">{t.filters}</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#8A7F6C]">{t.filterHint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveResultTab("all");
                setActiveCat("all");
                setPriceBand("any");
                setHomeOnly(false);
                setSort("recommended");
                setCategoriesCollapsed(false);
              }}
              className="rounded-full border border-[#211A12]/10 bg-[#F2EEE6] px-3 py-1.5 text-[10px] font-black text-[#5F584D] transition hover:border-[#C29A4C]/45 hover:text-[#A57C32]"
            >
              {t.clearFilters}
            </button>
          </div>
          {/* Search + type segmented control */}
          <div className="space-y-3">
            <label className={`flex flex-1 items-center gap-2 rounded-xl border border-[#211A12]/10 bg-[#F2EEE6]/60 px-4 py-2.5 ${isRTL ? "flex-row-reverse" : ""}`}>
              <svg className="h-4 w-4 flex-shrink-0 text-[#8A7F6C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search} className="w-full border-none bg-transparent text-sm outline-none placeholder:text-[#8A7F6C]" />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label={t.clearSearch} className="flex-shrink-0 text-[#8A7F6C] hover:text-[#211A12]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </label>
            {/* Type: All / Shops / Services */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A7F6C]">{t.resultType}</p>
            <div className="grid grid-cols-3 rounded-2xl border border-[#211A12]/10 bg-[#F2EEE6]/65 p-1">
              {([
                ["all", t.typeAll, shopTotal === null || serviceTotal === null ? null : shopTotal + serviceTotal],
                ["shops", t.shopsTab, shopTotal],
                ["services", t.servicesTab, serviceTotal],
              ] as const).map(([value, label, total]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={activeResultTab === value}
                  onClick={() => setActiveResultTab(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                    activeResultTab === value
                      ? "bg-[#15100A] text-[#E6C679] shadow-sm"
                      : "text-[#5F584D] hover:bg-white"
                  }`}
                >
                  {label} <span className="opacity-60">{count(total)}</span>
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Secondary filters */}
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A7F6C]">{t.price}</span>
            <select value={priceBand} onChange={(e) => setPriceBand(e.target.value as typeof priceBand)} className="w-full rounded-2xl border border-[#211A12]/10 bg-white px-3 py-3 text-xs font-bold text-[#5F584D] outline-none transition focus:border-[#C29A4C]/50">
              <option value="any">{t.anyPrice}</option>
              <option value="u50">{t.under50}</option>
              <option value="50-100">{t.p50to100}</option>
              <option value="100-200">{t.p100to200}</option>
              <option value="200+">{t.over200}</option>
            </select>
            </label>
            <button type="button" aria-pressed={homeOnly} onClick={() => setHomeOnly((h) => !h)} className={`w-full rounded-2xl border px-3 py-3 text-xs font-bold transition ${homeOnly ? "border-[#C29A4C]/60 bg-[#C29A4C]/10 text-[#A57C32]" : "border-[#211A12]/10 bg-white text-[#5F584D]"}`}>
              {homeOnly ? "✓ " : ""}{t.homeService}
            </button>
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8A7F6C]">{t.sort}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-full rounded-2xl border border-[#211A12]/10 bg-white px-3 py-3 text-xs font-bold text-[#5F584D] outline-none transition focus:border-[#C29A4C]/50">
              <option value="recommended">{t.sortRecommended}</option>
              <option value="price-asc">{t.sortPriceLow}</option>
              <option value="price-desc">{t.sortPriceHigh}</option>
            </select>
            </label>
          </div>

          {/* Category chips — collapse smoothly on scroll to free vertical space */}
          <div className={`overflow-hidden transition-all duration-300 ${categoriesCollapsed ? "max-h-0 opacity-0 lg:max-h-[520px] lg:opacity-100" : "max-h-[520px] opacity-100 border-t border-[#211A12]/8 pt-4"}`}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#8A7F6C]">{t.categoryFilter}</p>
            <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
              <button type="button" aria-pressed={activeCat === "all"} onClick={() => setActiveCat("all")} className={`rounded-2xl px-3.5 py-2.5 text-start text-xs font-black transition ${activeCat === "all" ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
                {t.all}
              </button>
              {categories.map((c) => (
                <button type="button" key={c.slug} aria-pressed={activeCat === c.slug} onClick={() => setActiveCat(c.slug)} className={`rounded-2xl px-3.5 py-2.5 text-start text-xs font-black transition ${activeCat === c.slug ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
                  <span className="me-1">{CATEGORY_ICON[c.icon ?? ""] ?? "•"}</span>{catName(c)}
                </button>
              ))}
            </div>
          </div>
          {/* Compact re-expand affordance shown only while collapsed */}
          {categoriesCollapsed && activeCat !== "all" && (
            <button onClick={() => setCategoriesCollapsed(false)} className={`flex items-center gap-1.5 text-[11px] font-black text-[#A57C32] ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="rounded-full bg-[#15100A] px-2.5 py-0.5 text-[#E6C679]">{catName(categories.find((c) => c.slug === activeCat) ?? categories[0])}</span>
              <span className="underline decoration-dotted">{t.changeCategory}</span>
            </button>
          )}
        </aside>

        <section className="min-w-0">

        {/* Combined empty state (only when both lists finished and nothing matches) */}
        {activeResultTab === "all" && !shopsLoading && !servicesLoading && shopItems.length === 0 && serviceItems.length === 0 && !shopsResult?.error && !servicesResult?.error && (
          <div className="rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#8A7F6C]">{t.empty}</p>
          </div>
        )}

        {/* Shops section */}
        {(activeResultTab === "shops" || (activeResultTab === "all" && (shopsLoading || shopItems.length > 0 || Boolean(shopsResult?.error)))) && (
          <>
            <div className={`mb-4 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h2 className="font-serif text-lg font-black text-[#211A12]">{t.shopsTab}</h2>
              <span className="text-xs font-bold text-[#8A7F6C]">{count(shopTotal)}</span>
            </div>
            {(homeOnly || priceBand !== "any") && (
              <p className="mb-3 text-xs font-semibold text-[#8A7F6C]">{t.shopsFilterNote}</p>
            )}
            {shopsLoading ? (
              <p role="status" className="mb-8 text-sm font-semibold text-[#8A7F6C]">{t.loadingCatalog}</p>
            ) : shopsResult?.error && shopItems.length === 0 ? (
              <div role="alert" className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <span>{t.shopsFailed}: {shopsResult.error}</span>
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-black focus-visible:outline-2 focus-visible:outline-red-700">{t.retry}</button>
              </div>
            ) : shopItems.length === 0 ? (
              <div className="mb-8 rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
                <p className="text-sm font-semibold text-[#8A7F6C]">{t.shopEmpty}</p>
              </div>
            ) : (
              <div className="mb-10">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {shopItems.map((shop) => (
                    <article
                      key={shop.id}
                      className={`group overflow-hidden rounded-[24px] border border-[#211A12]/8 bg-white shadow-[0_8px_30px_rgba(21,16,10,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C29A4C]/40 hover:shadow-[0_18px_48px_rgba(194,154,76,0.14)] ${isRTL ? "text-right" : "text-left"}`}
                    >
                      <div aria-hidden="true" className="flex h-24 items-center justify-center bg-[#15100A]">
                        <span className="font-serif text-4xl font-black text-[#E6C679]">{(isRTL ? shop.nameAr : shop.nameEn).charAt(0)}</span>
                      </div>
                      <div className="space-y-4 p-5">
                        <div className={`flex items-start justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                          <div>
                            <h3 className="font-serif text-xl font-black leading-snug text-[#211A12] group-hover:text-[#A57C32]">{isRTL ? shop.nameAr : shop.nameEn}</h3>
                            <p className="mt-1 text-xs font-bold text-[#8A7F6C]">{t.provider}: {isRTL ? shop.providerNameAr : shop.providerNameEn}</p>
                            {(isRTL ? shop.placeAr : shop.placeEn) && <p className="mt-1 text-xs font-semibold text-[#8A7F6C]">{isRTL ? shop.placeAr : shop.placeEn}</p>}
                          </div>
                          <span className="flex items-center gap-1 rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[11px] font-black text-[#A57C32]">{shop.rating !== null ? `★ ${shop.rating.toFixed(1)}` : t.newShop}</span>
                        </div>
                        {(isRTL ? shop.serviceNamesAr : shop.serviceNamesEn).length > 0 && (
                          <div>
                            <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#8A7F6C]">{t.servicesOffered}</p>
                            <div className="flex flex-wrap gap-2">
                              {(isRTL ? shop.serviceNamesAr : shop.serviceNamesEn).map((name) => (
                                <span key={name} className="rounded-full border border-[#211A12]/8 bg-[#F2EEE6]/70 px-2.5 py-1 text-[10px] font-bold text-[#5F584D]">
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className={`flex items-center justify-between gap-3 border-t border-[#211A12]/8 pt-4 ${isRTL ? "flex-row-reverse" : ""}`}>
                          <span className="text-[11px] font-bold text-[#8A7F6C]">{shop.reviews.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {t.reviewsLabel}</span>
                          <Link href={`/shop/${shop.providerId}`} className="rounded-xl bg-[#15100A] px-4 py-2.5 text-xs font-black text-[#E6C679] transition hover:bg-gradient-to-r hover:from-[#C29A4C] hover:to-[#E6C679] hover:text-[#15100A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15100A]">
                            {t.viewShop}
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <span className="text-xs font-semibold text-[#8A7F6C]">{showing(shopItems.length, shopTotal ?? shopItems.length)}</span>
                  {shopTotal !== null && shopItems.length < shopTotal && (
                    <button type="button" onClick={() => void loadMoreShops()} disabled={moreBusy !== ""} className="rounded-xl border border-[#211A12]/15 bg-white px-4 py-2 text-xs font-black text-[#5F584D] transition hover:border-[#C29A4C]/50 focus-visible:outline-2 focus-visible:outline-[#15100A] disabled:opacity-50">
                      {moreBusy === "shops" ? t.loadingMore : t.loadMore}
                    </button>
                  )}
                  {shopsResult?.error && <span role="alert" className="text-xs font-bold text-red-700">{t.shopsFailed}: {shopsResult.error}</span>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Services section */}
        {(activeResultTab === "services" || (activeResultTab === "all" && (servicesLoading || serviceItems.length > 0 || Boolean(servicesResult?.error)))) && (
          <>
            <div className={`mb-4 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h2 className="font-serif text-lg font-black text-[#211A12]">{t.servicesTab}</h2>
              <span className="text-xs font-bold text-[#8A7F6C]">{count(serviceTotal)}</span>
            </div>
            {servicesLoading ? (
              <p role="status" className="text-sm font-semibold text-[#8A7F6C]">{t.loadingCatalog}</p>
            ) : servicesResult?.error && serviceItems.length === 0 ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <span>{t.servicesFailed}: {servicesResult.error}</span>
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-black focus-visible:outline-2 focus-visible:outline-red-700">{t.retry}</button>
              </div>
            ) : serviceItems.length === 0 ? (
              <div className="rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
                <p className="text-sm font-semibold text-[#8A7F6C]">{t.servicesEmpty}</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {serviceItems.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setDetail(s)}
                      className={`group flex flex-col rounded-[20px] border border-[#211A12]/8 bg-white p-4 shadow-[0_8px_30px_rgba(21,16,10,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C29A4C]/40 hover:shadow-[0_16px_40px_rgba(194,154,76,0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15100A] ${isRTL ? "text-right" : "text-left"}`}
                    >
                      <span className="relative mb-4 block h-40 overflow-hidden rounded-2xl bg-[#15100A]">
                        <img
                          src={serviceImageFor(s)}
                          alt=""
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          onError={(event) => {
                            event.currentTarget.src = SERVICE_IMAGE_BY_CATEGORY[s.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
                          }}
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-[#15100A]/70 via-transparent to-transparent" />
                      </span>
                      <span className={`mb-3 flex items-start justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span className="rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[10px] font-black text-[#8A7F6C]">
                          {CATEGORY_ICON[categories.find((c) => c.slug === s.category_slug)?.icon ?? ""] ?? "•"} {catName(categories.find((c) => c.slug === s.category_slug))}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-black text-[#A57C32]">{s.rating !== null ? `★ ${s.rating.toFixed(1)}` : t.newShop}</span>
                      </span>
                      <span className="block font-serif text-lg font-black leading-snug text-[#211A12] transition-colors group-hover:text-[#A57C32]">{isRTL ? s.name_ar : s.name_en}</span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#A57C32]">{isRTL ? s.providerNameAr : s.providerNameEn}</span>
                      <span className="mt-1.5 line-clamp-2 block flex-1 text-xs font-medium leading-5 text-[#8A7F6C]">{isRTL ? s.description_ar : s.description_en}</span>
                      <span className={`mt-4 flex items-center justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <span>
                          <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.from}</span>
                          <span className="block font-serif text-lg font-black text-[#211A12]">{sar(s.base_price, lang)}</span>
                        </span>
                        <span className={`flex items-center gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                          {s.featured_in_services && <span className="rounded-full bg-[#C29A4C]/12 px-2 py-0.5 text-[9px] font-black text-[#A57C32]">{t.featured}</span>}
                          {s.is_home_service_eligible && <span className="rounded-full bg-[#15100A]/5 px-2 py-0.5 text-[9px] font-black text-[#5F584D]">{t.home}</span>}
                        </span>
                      </span>
                      <span className="mt-4 block rounded-xl bg-[#15100A] py-2.5 text-center text-xs font-black text-[#E6C679] transition group-hover:bg-gradient-to-r group-hover:from-[#C29A4C] group-hover:to-[#E6C679] group-hover:text-[#15100A]">
                        {t.book} · {s.base_duration_minutes} {t.min}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <span className="text-xs font-semibold text-[#8A7F6C]">{showing(serviceItems.length, serviceTotal ?? serviceItems.length)}</span>
                  {serviceTotal !== null && serviceItems.length < serviceTotal && (
                    <button type="button" onClick={() => void loadMoreServices()} disabled={moreBusy !== ""} className="rounded-xl border border-[#211A12]/15 bg-white px-4 py-2 text-xs font-black text-[#5F584D] transition hover:border-[#C29A4C]/50 focus-visible:outline-2 focus-visible:outline-[#15100A] disabled:opacity-50">
                      {moreBusy === "services" ? t.loadingMore : t.loadMore}
                    </button>
                  )}
                  {servicesResult?.error && <span role="alert" className="text-xs font-bold text-red-700">{t.servicesFailed}: {servicesResult.error}</span>}
                </div>
              </div>
            )}
          </>
        )}
        </section>
        </div>
      </main>

      {/* Detail drawer: a named modal dialog (focus moves in and stays, Escape closes, the page behind is inert) */}
      {detail && (
        <ModalPortal>
          <ModalOverlay onClose={() => setDetail(null)} className="fixed inset-0 z-[9999]">
            <div className="absolute inset-0 bg-[#15100A]/55 backdrop-blur-sm" onClick={() => setDetail(null)} aria-hidden="true" />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label={isRTL ? detail.name_ar : detail.name_en}
              tabIndex={-1}
              dir={isRTL ? "rtl" : "ltr"}
              className={`absolute top-0 bottom-0 ${isRTL ? "left-0" : "right-0"} flex w-full max-w-md flex-col bg-[#F9F7F2] shadow-2xl`}
            >
              <div className={`flex items-center justify-between border-b border-[#211A12]/8 p-5 ${isRTL ? "flex-row-reverse" : ""}`}>
                <h2 className="font-serif text-xl font-black text-[#211A12]">{isRTL ? detail.name_ar : detail.name_en}</h2>
                <button type="button" onClick={() => setDetail(null)} aria-label={t.close} className="rounded-xl p-2 text-[#8A7F6C] transition hover:bg-[#211A12]/5 hover:text-[#211A12] focus-visible:outline-2 focus-visible:outline-[#15100A]">
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <div className="relative h-52 overflow-hidden rounded-2xl bg-[#15100A]">
                  <img
                    src={serviceImageFor(detail)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.src = SERVICE_IMAGE_BY_CATEGORY[detail.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#15100A]/75 via-[#15100A]/10 to-transparent" />
                </div>
                {(isRTL ? detail.description_ar : detail.description_en) && (
                  <p className="text-sm font-medium leading-6 text-[#5F584D]">{isRTL ? detail.description_ar : detail.description_en}</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.from}</span>
                    <strong className="font-serif text-lg font-black text-[#211A12]">{sar(detail.base_price, lang)}</strong>
                  </div>
                  <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.duration}</span>
                    <strong className="font-serif text-lg font-black text-[#211A12]">{detail.base_duration_minutes} {t.min}</strong>
                  </div>
                  <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.rating}</span>
                    <strong className="font-serif text-lg font-black text-[#211A12]">{detail.rating !== null ? `★ ${detail.rating.toFixed(1)}` : t.newShop}</strong>
                  </div>
                </div>
                {detail.add_ons.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.addOns}</h3>
                    <div className="space-y-2">
                      {detail.add_ons.map((a) => (
                        <div key={a.key} className={`flex items-center justify-between rounded-xl border border-[#211A12]/8 bg-white px-3 py-2.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                          <span className="text-xs font-bold text-[#211A12]">{isRTL ? a.label_ar : a.label_en}</span>
                          <span className="text-xs font-black text-[#A57C32]">+{sar(a.priceSAR, lang)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-[#211A12]/8 p-5">
                <Link
                  href={
                    detail.provider_id
                      ? `/shop/${detail.provider_id}?service=${detail.id}`
                      : `/services?tab=shops&category=${detail.category_slug}`
                  }
                  onClick={() => setDetail(null)}
                  className="block rounded-xl bg-gradient-to-r from-[#C29A4C] to-[#E6C679] py-3 text-center text-sm font-black text-[#15100A] shadow-lg shadow-[#C29A4C]/20 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15100A]"
                >
                  {t.bookNow}
                </Link>
              </div>
            </aside>
          </ModalOverlay>
        </ModalPortal>
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
