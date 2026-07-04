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
type ServiceGender = "male" | "female" | "unisex";
type ShopGender = "male" | "female" | "both";
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
  images: string[];
  genderCategory: ServiceGender;
  providerNameEn: string;
  providerNameAr: string;
};
type CatalogCategory = { id: string; slug: string; name_en: string; name_ar: string; icon: string | null };
type CatalogShop = {
  id: string;
  providerId: string;
  nameEn: string;
  nameAr: string;
  districtEn: string;
  districtAr: string;
  providerNameEn: string;
  providerNameAr: string;
  genderCategory: ShopGender;
  serviceCategorySlugs: string[];
  serviceNamesEn: string[];
  serviceNamesAr: string[];
  rating: number;
  reviews: number;
  image: string;
  isHomeServiceEligible: boolean;
};

type CatalogRelationCategory = { slug?: string | null };
type CatalogRelationProvider = { business_name_en?: string | null; business_name_ar?: string | null };
type CatalogServiceRow = {
  id: string;
  slug?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  base_price?: number | string | null;
  base_duration_minutes?: number | null;
  is_home_service_eligible?: boolean | null;
  featured_in_services?: boolean | null;
  sort_order?: number | null;
  add_ons?: unknown;
  images?: unknown;
  categories?: CatalogRelationCategory | null;
  providers?: CatalogRelationProvider | null;
};
type CatalogProviderServiceRow = {
  id: string;
  slug?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  is_home_service_eligible?: boolean | null;
  categories?: CatalogRelationCategory | null;
};
type CatalogProviderBranchRow = {
  id: string;
  name_en?: string | null;
  name_ar?: string | null;
  address_text_en?: string | null;
  address_text_ar?: string | null;
};
type CatalogProviderRow = {
  id: string;
  business_name_en?: string | null;
  business_name_ar?: string | null;
  branches?: CatalogProviderBranchRow[] | null;
  services?: CatalogProviderServiceRow[] | null;
};
type ProviderServiceSummary = {
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  genderCategory: ServiceGender;
  isHomeServiceEligible: boolean;
};

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
  images: [],
  genderCategory: inferServiceGender(slug, cat, en),
  providerNameEn: fallbackProviderFor(cat, "en"),
  providerNameAr: fallbackProviderFor(cat, "ar"),
});

const SERVICE_IMAGE_BY_CATEGORY: Record<string, string> = {
  "barber-hair": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200&auto=format&fit=crop",
  "beard-shave": "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1200&auto=format&fit=crop",
  "skincare-facials": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop",
  "spa-wellness": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop",
  "nails-hands": "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop",
  "signature-packages": "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200&auto=format&fit=crop"
};

const SERVICE_IMAGE_BY_GENDER_CATEGORY: Record<string, Record<ServiceGender, string>> = {
  "barber-hair": {
    male: "https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop"
  },
  "beard-shave": {
    male: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=1200&auto=format&fit=crop"
  },
  "skincare-facials": {
    male: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1515377905703-c4788e51af15?q=80&w=1200&auto=format&fit=crop"
  },
  "spa-wellness": {
    male: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1600334129128-685c5582fd35?q=80&w=1200&auto=format&fit=crop"
  },
  "nails-hands": {
    male: "https://images.unsplash.com/photo-1610992015732-2449b76344bc?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop"
  },
  "signature-packages": {
    male: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1200&auto=format&fit=crop",
    female: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=1200&auto=format&fit=crop",
    unisex: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop"
  }
};

const SERVICE_IMAGE_BY_SLUG: Record<string, string> = {
  "classic-haircut": "https://images.unsplash.com/photo-1622287162716-f311baa1a2b8?q=80&w=1200&auto=format&fit=crop",
  "skin-fade": "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=1200&auto=format&fit=crop",
  "beard-sculpt": "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=1200&auto=format&fit=crop",
  "hot-towel-shave": "https://images.unsplash.com/photo-1622296089863-eb7fc530daa8?q=80&w=1200&auto=format&fit=crop",
  "moroccan-bath": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=1200&auto=format&fit=crop",
  "manicure": "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop",
  "pedicure": "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=1200&auto=format&fit=crop"
};

const SHOP_IMAGE_BY_GENDER: Record<ShopGender, string> = {
  male: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=1200&auto=format&fit=crop",
  female: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&auto=format&fit=crop",
  both: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?q=80&w=1200&auto=format&fit=crop"
};

function fallbackProviderFor(categorySlug: string, locale: "en" | "ar") {
  const providers = {
    "barber-hair": ["Elite Barbershop", "إليت باربرشوب"],
    "beard-shave": ["Royal Cuts Riyadh", "رويال كتس الرياض"],
    "skincare-facials": ["Lumi Skin Studio", "لومي للعناية بالبشرة"],
    "spa-wellness": ["Primora Wellness Spa", "بريمورا سبا"],
    "nails-hands": ["Sara Beauty Lounge", "سارة بيوتي لاونج"],
    "signature-packages": ["PRIMORA Signature", "بريمورا سيغنتشر"]
  } as const;
  const item = providers[categorySlug as keyof typeof providers] ?? providers["signature-packages"];
  return locale === "ar" ? item[1] : item[0];
}

function inferServiceGender(slug: string, categorySlug: string, name = ""): ServiceGender {
  const text = `${slug} ${categorySlug} ${name}`.toLowerCase();
  if (/(beard|shave|barber|groom|fade|kids-cut|scalp)/.test(text)) return "male";
  if (/(nail|manicure|pedicure|bridal|makeup|lashes|brow|wax|hand-spa)/.test(text)) return "female";
  return "unisex";
}

function serviceImageFor(service: CatalogService) {
  return service.images[0] || SERVICE_IMAGE_BY_SLUG[service.slug] || SERVICE_IMAGE_BY_GENDER_CATEGORY[service.category_slug]?.[service.genderCategory] || SERVICE_IMAGE_BY_CATEGORY[service.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
}

function normalizeServiceImages(images: unknown, slug: string, categorySlug: string): string[] {
  const list = Array.isArray(images) ? images.filter((image): image is string => typeof image === "string" && image.trim().length > 0) : [];
  const gender = inferServiceGender(slug, categorySlug);
  return list.length > 0 ? list : [SERVICE_IMAGE_BY_SLUG[slug] || SERVICE_IMAGE_BY_GENDER_CATEGORY[categorySlug]?.[gender] || SERVICE_IMAGE_BY_CATEGORY[categorySlug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"]];
}

function serviceMatchesGender(service: CatalogService, filter: "all" | "male" | "female") {
  return filter === "all" || service.genderCategory === filter || service.genderCategory === "unisex";
}

function shopMatchesGender(shop: CatalogShop, filter: "all" | "male" | "female") {
  return filter === "all" || shop.genderCategory === "both" || shop.genderCategory === filter;
}

function genderFromServices(services: Pick<CatalogService, "genderCategory">[]): ShopGender {
  const hasMale = services.some((service) => service.genderCategory === "male" || service.genderCategory === "unisex");
  const hasFemale = services.some((service) => service.genderCategory === "female" || service.genderCategory === "unisex");
  if (hasMale && hasFemale) return "both";
  if (hasFemale) return "female";
  return "male";
}

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

const FALLBACK_SHOPS: CatalogShop[] = [
  {
    id: "shop-elite",
    providerId: "provider-elite",
    nameEn: "Elite Barbershop",
    nameAr: "إليت باربرشوب",
    districtEn: "Riyadh Central",
    districtAr: "وسط الرياض",
    providerNameEn: "Elite Barbershop Group",
    providerNameAr: "مجموعة إليت للحلاقة",
    genderCategory: "male",
    serviceCategorySlugs: ["barber-hair", "beard-shave", "signature-packages"],
    serviceNamesEn: ["Classic Haircut", "Skin Fade", "Beard Sculpt", "Groom's Prep"],
    serviceNamesAr: ["قصة شعر كلاسيكية", "قصة فيد", "نحت اللحية", "تجهيز العريس"],
    rating: 4.9,
    reviews: 1240,
    image: SHOP_IMAGE_BY_GENDER.male,
    isHomeServiceEligible: true
  },
  {
    id: "shop-sara",
    providerId: "provider-sara",
    nameEn: "Sara Beauty Lounge",
    nameAr: "سارة بيوتي لاونج",
    districtEn: "Olaya",
    districtAr: "العليا",
    providerNameEn: "Sara Beauty Group",
    providerNameAr: "مجموعة سارة للتجميل",
    genderCategory: "female",
    serviceCategorySlugs: ["skincare-facials", "spa-wellness", "nails-hands"],
    serviceNamesEn: ["Deep Cleanse", "Aromatherapy Massage", "Manicure", "Pedicure"],
    serviceNamesAr: ["تنظيف عميق", "مساج بالزيوت العطرية", "مانيكير", "باديكير"],
    rating: 4.8,
    reviews: 980,
    image: SHOP_IMAGE_BY_GENDER.female,
    isHomeServiceEligible: true
  },
  {
    id: "shop-primora",
    providerId: "provider-primora",
    nameEn: "PRIMORA Wellness Spa",
    nameAr: "بريمورا سبا",
    districtEn: "Al-Malqa",
    districtAr: "الملقا",
    providerNameEn: "PRIMORA Signature",
    providerNameAr: "بريمورا سيغنتشر",
    genderCategory: "both",
    serviceCategorySlugs: ["spa-wellness", "skincare-facials", "signature-packages"],
    serviceNamesEn: ["Moroccan Bath", "Express Facial", "Full Reset"],
    serviceNamesAr: ["حمام مغربي", "فيشل سريع", "استعادة كاملة"],
    rating: 4.9,
    reviews: 1540,
    image: SHOP_IMAGE_BY_GENDER.both,
    isHomeServiceEligible: false
  }
];

const CATEGORY_ICON: Record<string, string> = {
  scissors: "✂️", razor: "🪒", sparkles: "✨", lotus: "🪷", hand: "🤲", crown: "👑",
};

const translations = {
  en: {
    title: "Services",
    subtitle: "Search shops and services by treatment, provider, category, and gender fit.",
    search: "Search shops, services, categories...",
    providerSearch: "Search shop or provider name...",
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
    genderAll: "All genders",
    male: "Male",
    female: "Female",
    unisex: "Unisex",
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
    resultSummary: "matching results",
    shopEmpty: "No shops match these filters. Try a wider provider name, category, or gender.",
    servicesEmpty: "No services match these filters. Try a wider service name, category, or gender.",
    provider: "Provider",
    shopGender: "Shop category",
    servicesOffered: "Services offered",
    viewShop: "View shop",
    reviewsLabel: "reviews",
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
    subtitle: "ابحث عن المتاجر والخدمات حسب العلاج والمزود والفئة وملاءمة الجنس.",
    search: "ابحث عن المتاجر والخدمات والفئات...",
    providerSearch: "ابحث باسم المتجر أو المزود...",
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
    genderAll: "كل الفئات",
    male: "رجالي",
    female: "نسائي",
    unisex: "للجميع",
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
    resultSummary: "نتيجة مطابقة",
    shopEmpty: "لا توجد متاجر مطابقة لهذه الفلاتر. جرّب اسم مزود أو فئة أو جنس أوسع.",
    servicesEmpty: "لا توجد خدمات مطابقة لهذه الفلاتر. جرّب اسم خدمة أو فئة أو جنس أوسع.",
    provider: "المزود",
    shopGender: "فئة المتجر",
    servicesOffered: "الخدمات المقدمة",
    viewShop: "عرض المتجر",
    reviewsLabel: "تقييم",
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
  const [shops, setShops] = useState<CatalogShop[]>(FALLBACK_SHOPS);
  const [query, setQuery] = useState("");
  const [activeResultTab, setActiveResultTab] = useState<"all" | "shops" | "services">("all");
  const [activeCat, setActiveCat] = useState<string>(searchParams.get("category") ?? "all");
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(false);
  const [priceBand, setPriceBand] = useState<"any" | "u50" | "50-100" | "100-200" | "200+">("any");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
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

  useEffect(() => {
    (async () => {
      try {
        const [{ data: cats }, { data: rows }, { data: providerRows }] = await Promise.all([
          supabase.from("categories").select("id, slug, name_en, name_ar, icon, sort_order").eq("is_active", true).order("sort_order"),
          supabase
            .from("services")
            .select("id, slug, name_en, name_ar, description_en, description_ar, base_price, base_duration_minutes, is_home_service_eligible, featured_in_services, sort_order, add_ons, images, categories(slug), providers(business_name_en, business_name_ar)")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("providers")
            .select("id, business_name_en, business_name_ar, type, is_verified, branches(id, name_en, name_ar, address_text_en, address_text_ar), services(id, slug, name_en, name_ar, is_home_service_eligible, categories(slug))")
            .eq("is_verified", true)
            .order("created_at", { ascending: false }),
        ]);
        if (cats?.length) setCategories(cats);
        if (rows?.length) {
          setServices((rows as CatalogServiceRow[]).map((r, i) => {
            const cat = r.categories ?? null;
            const provider = r.providers ?? null;
            return {
              id: r.id, slug: r.slug ?? r.id,
              name_en: r.name_en || "Service", name_ar: r.name_ar || r.name_en || "Ø®Ø¯Ù…Ø©",
              description_en: r.description_en ?? "", description_ar: r.description_ar ?? "",
              base_price: Number(r.base_price || 0), base_duration_minutes: Number(r.base_duration_minutes || 0),
              is_home_service_eligible: !!r.is_home_service_eligible,
              featured_in_services: !!r.featured_in_services,
              sort_order: r.sort_order ?? i,
              category_slug: cat?.slug ?? "other",
              add_ons: Array.isArray(r.add_ons) ? (r.add_ons as AddOn[]) : [],
              rating: 4.7 + ((String(r.id).charCodeAt(0) % 3) * 0.1),
              images: normalizeServiceImages(r.images, r.slug ?? r.id, cat?.slug ?? "other"),
              genderCategory: inferServiceGender(r.slug ?? r.id, cat?.slug ?? "other", r.name_en ?? ""),
              providerNameEn: provider?.business_name_en || fallbackProviderFor(cat?.slug ?? "other", "en"),
              providerNameAr: provider?.business_name_ar || fallbackProviderFor(cat?.slug ?? "other", "ar"),
            };
          }));
        }
        if (providerRows?.length) {
          const mappedShops: CatalogShop[] = (providerRows as CatalogProviderRow[]).flatMap((provider, providerIndex) => {
            const providerServices: ProviderServiceSummary[] = (provider.services || []).map((service) => {
              const category = service.categories ?? null;
              return {
                nameEn: service.name_en || "",
                nameAr: service.name_ar || service.name_en || "",
                categorySlug: category?.slug ?? "other",
                genderCategory: inferServiceGender(service.slug ?? service.id, category?.slug ?? "other", service.name_en ?? ""),
                isHomeServiceEligible: Boolean(service.is_home_service_eligible)
              };
            });
            const shopGender = genderFromServices(providerServices);
            const branchRows: CatalogProviderBranchRow[] = provider.branches?.length
              ? provider.branches
              : [{ id: `${provider.id}-virtual`, name_en: provider.business_name_en, name_ar: provider.business_name_ar, address_text_en: "Riyadh", address_text_ar: "الرياض" }];

            return branchRows.map((branch, branchIndex) => ({
              id: branch.id,
              providerId: provider.id,
              nameEn: branch.name_en || provider.business_name_en || "Provider Shop",
              nameAr: branch.name_ar || provider.business_name_ar || provider.business_name_en || "متجر المزود",
              districtEn: String(branch.address_text_en || "Riyadh").split(",")[0],
              districtAr: String(branch.address_text_ar || "الرياض").split(",")[0],
              providerNameEn: provider.business_name_en || "Provider",
              providerNameAr: provider.business_name_ar || provider.business_name_en || "مزود",
              genderCategory: shopGender,
              serviceCategorySlugs: [...new Set(providerServices.map((service) => service.categorySlug))],
              serviceNamesEn: providerServices.map((service) => service.nameEn).filter(Boolean),
              serviceNamesAr: providerServices.map((service) => service.nameAr).filter(Boolean),
              rating: 4.6 + (((providerIndex + branchIndex) % 4) * 0.1),
              reviews: 220 + providerIndex * 140 + branchIndex * 35,
              image: SHOP_IMAGE_BY_GENDER[shopGender],
              isHomeServiceEligible: providerServices.some((service) => service.isHomeServiceEligible)
            }));
          });
          if (mappedShops.length) setShops(mappedShops);
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

  const categoryNameBySlug = useMemo(() => {
    const map = new Map<string, { en: string; ar: string }>();
    categories.forEach((category) => map.set(category.slug, { en: category.name_en, ar: category.name_ar }));
    return map;
  }, [categories]);

  const filteredServices = useMemo(() => {
    let list = services.filter((s) => {
      if (activeCat !== "all" && s.category_slug !== activeCat) return false;
      if (!serviceMatchesGender(s, genderFilter)) return false;
      if (homeOnly && !s.is_home_service_eligible) return false;
      if (priceBand === "u50" && s.base_price >= 50) return false;
      if (priceBand === "50-100" && (s.base_price < 50 || s.base_price > 100)) return false;
      if (priceBand === "100-200" && (s.base_price < 100 || s.base_price > 200)) return false;
      if (priceBand === "200+" && s.base_price < 200) return false;
      if (query.trim()) {
        // Unified search: service name/description/category AND provider name.
        const q = query.trim().toLowerCase();
        const category = categoryNameBySlug.get(s.category_slug);
        const searchableEn = `${s.name_en} ${s.description_en} ${category?.en ?? ""} ${s.providerNameEn}`.toLowerCase();
        const searchableAr = `${s.name_ar} ${s.description_ar} ${category?.ar ?? ""} ${s.providerNameAr}`;
        if (!searchableEn.includes(q) && !searchableAr.includes(query.trim())) return false;
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
  }, [services, activeCat, categoryNameBySlug, genderFilter, homeOnly, priceBand, query, sort]);

  const filteredShops = useMemo(() => {
    return shops.filter((shop) => {
      if (!shopMatchesGender(shop, genderFilter)) return false;
      if (homeOnly && !shop.isHomeServiceEligible) return false;
      if (activeCat !== "all" && !shop.serviceCategorySlugs.includes(activeCat)) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const categoriesText = shop.serviceCategorySlugs
          .map((slug) => {
            const category = categoryNameBySlug.get(slug);
            return `${category?.en ?? slug} ${category?.ar ?? ""}`;
          })
          .join(" ");
        const shopTextEn = `${shop.nameEn} ${shop.providerNameEn} ${shop.serviceNamesEn.join(" ")} ${categoriesText}`.toLowerCase();
        const shopTextAr = `${shop.nameAr} ${shop.providerNameAr} ${shop.serviceNamesAr.join(" ")} ${categoriesText}`;
        if (!shopTextEn.includes(q) && !shopTextAr.includes(query.trim())) return false;
      }
      return true;
    });
  }, [activeCat, categoryNameBySlug, genderFilter, homeOnly, query, shops]);

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
          {/* Row 1: single unified search + type segmented control */}
          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${isRTL ? "sm:flex-row-reverse" : ""}`}>
            <label className={`flex flex-1 items-center gap-2 rounded-xl border border-[#211A12]/10 bg-[#F2EEE6]/60 px-4 py-2.5 ${isRTL ? "flex-row-reverse" : ""}`}>
              <svg className="h-4 w-4 flex-shrink-0 text-[#8A7F6C]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} className="w-full border-none bg-transparent text-sm outline-none placeholder:text-[#8A7F6C]" />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="flex-shrink-0 text-[#8A7F6C] hover:text-[#211A12]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </label>
            {/* Type: All / Shops / Services */}
            <div className="flex flex-shrink-0 rounded-xl border border-[#211A12]/10 bg-[#F2EEE6]/65 p-1">
              {([
                ["all", t.typeAll, filteredShops.length + filteredServices.length],
                ["shops", t.shopsTab, filteredShops.length],
                ["services", t.servicesTab, filteredServices.length],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  onClick={() => setActiveResultTab(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                    activeResultTab === value
                      ? "bg-[#15100A] text-[#E6C679] shadow-sm"
                      : "text-[#5F584D] hover:bg-white"
                  }`}
                >
                  {label} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: secondary filters (price / home / gender / sort) */}
          <div className={`flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <select value={priceBand} onChange={(e) => setPriceBand(e.target.value as typeof priceBand)} className="rounded-xl border border-[#211A12]/10 bg-white px-3 py-2 text-xs font-bold text-[#5F584D] outline-none">
              <option value="any">{t.anyPrice}</option>
              <option value="u50">{t.under50}</option>
              <option value="50-100">{t.p50to100}</option>
              <option value="100-200">{t.p100to200}</option>
              <option value="200+">{t.over200}</option>
            </select>
            <button onClick={() => setHomeOnly((h) => !h)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${homeOnly ? "border-[#C29A4C]/60 bg-[#C29A4C]/10 text-[#A57C32]" : "border-[#211A12]/10 bg-white text-[#5F584D]"}`}>
              {homeOnly ? "✓ " : ""}{t.homeService}
            </button>
            <div className="flex rounded-xl border border-[#211A12]/10 bg-white p-1 shadow-sm">
              {([
                ["all", t.genderAll],
                ["male", t.male],
                ["female", t.female],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setGenderFilter(value)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-black transition ${
                    genderFilter === value ? "bg-[#15100A] text-[#E6C679]" : "text-[#5F584D] hover:bg-[#F2EEE6]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-xl border border-[#211A12]/10 bg-white px-3 py-2 text-xs font-bold text-[#5F584D] outline-none">
              <option value="recommended">{t.sortRecommended}</option>
              <option value="price-asc">{t.sortPriceLow}</option>
              <option value="price-desc">{t.sortPriceHigh}</option>
              <option value="rating">{t.sortRating}</option>
            </select>
          </div>

          {/* Category chips — collapse smoothly on scroll to free vertical space */}
          <div className={`overflow-hidden transition-all duration-300 ${categoriesCollapsed ? "max-h-0 opacity-0" : "max-h-40 opacity-100 border-t border-[#211A12]/8 pt-3"}`}>
            <div className={`flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isRTL ? "flex-row-reverse" : ""}`}>
              <button onClick={() => setActiveCat("all")} className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition ${activeCat === "all" ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
                {t.all}
              </button>
              {categories.map((c) => (
                <button key={c.slug} onClick={() => setActiveCat(c.slug)} className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-black transition ${activeCat === c.slug ? "bg-[#15100A] text-[#E6C679]" : "border border-[#211A12]/10 bg-white text-[#5F584D] hover:border-[#C29A4C]/40"}`}>
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
        </div>

        {/* Combined empty state (only when nothing at all matches) */}
        {activeResultTab === "all" && filteredShops.length === 0 && filteredServices.length === 0 && (
          <div className="rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#8A7F6C]">{t.empty}</p>
          </div>
        )}

        {/* Shops section */}
        {(activeResultTab === "shops" || (activeResultTab === "all" && filteredShops.length > 0)) && (
          <>
            <div className={`mb-4 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h2 className="font-serif text-lg font-black text-[#211A12]">{t.shopsTab}</h2>
              <span className="text-xs font-bold text-[#8A7F6C]">{filteredShops.length}</span>
            </div>
            {filteredShops.length === 0 ? (
          <div className="mb-8 rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#8A7F6C]">{t.shopEmpty}</p>
          </div>
        ) : (
          <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredShops.map((shop) => (
              <article
                key={shop.id}
                className={`group overflow-hidden rounded-[24px] border border-[#211A12]/8 bg-white shadow-[0_8px_30px_rgba(21,16,10,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C29A4C]/40 hover:shadow-[0_18px_48px_rgba(194,154,76,0.14)] ${isRTL ? "text-right" : "text-left"}`}
              >
                <div className="relative h-48 overflow-hidden bg-[#15100A]">
                  <img
                    src={shop.image}
                    alt={isRTL ? shop.nameAr : shop.nameEn}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.src = SHOP_IMAGE_BY_GENDER[shop.genderCategory];
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#15100A]/75 via-transparent to-transparent" />
                  <div className={`absolute bottom-4 ${isRTL ? "right-4" : "left-4"}`}>
                    <span className="rounded-full border border-[#E6C679]/35 bg-[#15100A]/70 px-3 py-1 text-[10px] font-black text-[#E6C679] backdrop-blur-md">
                      {shop.genderCategory === "both" ? t.unisex : t[shop.genderCategory]}
                    </span>
                  </div>
                  {shop.isHomeServiceEligible && (
                    <span className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-[#15100A]`}>
                      {t.home}
                    </span>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div className={`flex items-start justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <div>
                      <h3 className="font-serif text-xl font-black leading-snug text-[#211A12] group-hover:text-[#A57C32]">{isRTL ? shop.nameAr : shop.nameEn}</h3>
                      <p className="mt-1 text-xs font-bold text-[#8A7F6C]">{t.provider}: {isRTL ? shop.providerNameAr : shop.providerNameEn}</p>
                      <p className="mt-1 text-xs font-semibold text-[#8A7F6C]">{isRTL ? shop.districtAr : shop.districtEn}</p>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[11px] font-black text-[#A57C32]">★ {shop.rating.toFixed(1)}</span>
                  </div>
                  <div>
                    <p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-[#8A7F6C]">{t.servicesOffered}</p>
                    <div className="flex flex-wrap gap-2">
                      {(isRTL ? shop.serviceNamesAr : shop.serviceNamesEn).slice(0, 4).map((name) => (
                        <span key={name} className="rounded-full border border-[#211A12]/8 bg-[#F2EEE6]/70 px-2.5 py-1 text-[10px] font-bold text-[#5F584D]">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`flex items-center justify-between gap-3 border-t border-[#211A12]/8 pt-4 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <span className="text-[11px] font-bold text-[#8A7F6C]">{shop.reviews.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {t.reviewsLabel}</span>
                    <Link href={`/shop/${shop.providerId}`} className="rounded-xl bg-[#15100A] px-4 py-2.5 text-xs font-black text-[#E6C679] transition hover:bg-gradient-to-r hover:from-[#C29A4C] hover:to-[#E6C679] hover:text-[#15100A]">
                      {t.viewShop}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
          </>
        )}

        {/* Services section */}
        {(activeResultTab === "services" || (activeResultTab === "all" && filteredServices.length > 0)) && (
          <>
            <div className={`mb-4 flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h2 className="font-serif text-lg font-black text-[#211A12]">{t.servicesTab}</h2>
              <span className="text-xs font-bold text-[#8A7F6C]">{filteredServices.length}</span>
            </div>
            {filteredServices.length === 0 ? (
          <div className="rounded-2xl border border-[#211A12]/8 bg-white p-12 text-center">
            <p className="text-sm font-semibold text-[#8A7F6C]">{t.servicesEmpty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredServices.map((s) => (
              <button
                key={s.id}
                onClick={() => setDetail(s)}
                className={`group flex flex-col rounded-[20px] border border-[#211A12]/8 bg-white p-4 shadow-[0_8px_30px_rgba(21,16,10,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C29A4C]/40 hover:shadow-[0_16px_40px_rgba(194,154,76,0.12)] ${isRTL ? "text-right" : "text-left"}`}
              >
                <div className="relative mb-4 h-40 overflow-hidden rounded-2xl bg-[#15100A]">
                  <img
                    src={serviceImageFor(s)}
                    alt={isRTL ? s.name_ar : s.name_en}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(event) => {
                      event.currentTarget.src = SERVICE_IMAGE_BY_CATEGORY[s.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#15100A]/70 via-transparent to-transparent" />
                  <span className={`absolute bottom-3 ${isRTL ? "right-3" : "left-3"} rounded-full border border-[#E6C679]/35 bg-[#15100A]/70 px-2.5 py-1 text-[10px] font-black text-[#E6C679] backdrop-blur-md`}>
                    {t[s.genderCategory]}
                  </span>
                </div>
                <div className={`mb-3 flex items-start justify-between gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <span className="rounded-full bg-[#F2EEE6] px-2.5 py-1 text-[10px] font-black text-[#8A7F6C]">
                    {CATEGORY_ICON[categories.find((c) => c.slug === s.category_slug)?.icon ?? ""] ?? "•"} {catName(categories.find((c) => c.slug === s.category_slug) ?? categories[0])}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-black text-[#A57C32]">★ {s.rating.toFixed(1)}</span>
                </div>
                <h3 className="font-serif text-lg font-black leading-snug text-[#211A12] group-hover:text-[#A57C32] transition-colors">{isRTL ? s.name_ar : s.name_en}</h3>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#A57C32]">{isRTL ? s.providerNameAr : s.providerNameEn}</p>
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
          </>
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
              <div className="relative h-52 overflow-hidden rounded-2xl bg-[#15100A]">
                <img
                  src={serviceImageFor(detail)}
                  alt={isRTL ? detail.name_ar : detail.name_en}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.src = SERVICE_IMAGE_BY_CATEGORY[detail.category_slug] || SERVICE_IMAGE_BY_CATEGORY["barber-hair"];
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#15100A]/75 via-[#15100A]/10 to-transparent" />
                <span className={`absolute bottom-4 ${isRTL ? "right-4" : "left-4"} rounded-full border border-[#E6C679]/35 bg-[#15100A]/70 px-3 py-1 text-[11px] font-black text-[#E6C679] backdrop-blur-md`}>
                  {t[detail.genderCategory]}
                </span>
              </div>
              <p className="text-sm font-medium leading-6 text-[#5F584D]">{isRTL ? detail.description_ar : detail.description_en}</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.from}</span>
                  <strong className="font-serif text-lg font-black text-[#211A12]">{detail.base_price} {t.sar}</strong>
                </div>
                <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.duration}</span>
                  <strong className="font-serif text-lg font-black text-[#211A12]">{detail.base_duration_minutes} {t.min}</strong>
                </div>
                <div className="rounded-xl border border-[#211A12]/8 bg-white p-3">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.genderAll}</span>
                  <strong className="font-serif text-lg font-black text-[#211A12]">{t[detail.genderCategory]}</strong>
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
