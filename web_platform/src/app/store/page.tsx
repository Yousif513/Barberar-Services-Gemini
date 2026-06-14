"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

const translations = {
  en: {
    promoText: "Book Premier Home Service & Salon Appointments in Riyadh & Jeddah",
    home: "Home",
    discover: "Discover",
    serviceBoard: "Service Board",
    becomeProvider: "Become a Provider",
    aboutUs: "About Us",
    login: "Log in",
    signup: "Sign up",
    storeHeader: "Luxury Marketplace",
    storeSubtitle: "Browse premium services or discover top-rated shops across KSA cities and neighborhoods.",
    searchPlaceholder: "Search services, shops, or specialists...",
    tabServices: "Browse Services",
    tabShops: "Browse Shops",
    cityLabel: "City",
    neighborhoodLabel: "Neighborhood",
    genderLabel: "Target Audience",
    categoryLabel: "Category",
    serviceTypeLabel: "Service Setting",
    priceRangeLabel: "Price Limit (SAR)",
    sortByLabel: "Sort By",
    allCities: "All Cities",
    allNeighborhoods: "All Neighborhoods",
    allGenders: "All Audiences",
    menOnly: "Men",
    womenOnly: "Women",
    unisexOnly: "Unisex",
    allCategories: "All Categories",
    haircuts: "Haircuts & Shaves",
    haircolor: "Hair Color & Styling",
    massage: "Massage & Spas",
    nails: "Nails & Manicures",
    makeup: "Makeup Glam",
    skincare: "Apothecary & Skincare",
    anySetting: "Any Setting",
    mobile: "Mobile / At Home",
    salon: "In-Salon / Venue",
    recommended: "Recommended",
    ratingHigh: "Top Rated",
    priceLow: "Price: Low to High",
    priceHigh: "Price: High to Low",
    startingFrom: "Starting from",
    viewShop: "View Shop Profile",
    bookNow: "Book Now",
    noResults: "No results match your Booksy-style filters.",
    reviews: "reviews",
    mins: "mins",
    platformFeeSplit: "15% Escrow splits secured via Tap Connect",
    footerDesc: "Luxury Beauty, Grooming & Wellness Marketplace. Connecting premier Riyadh & Jeddah artists with selective clients.",
    footerDiscover: "Discover",
    footerPartners: "For Partners",
    footerLegal: "Legal",
    allRightsReserved: "All rights reserved. Built for Saudi Arabia."
  },
  ar: {
    promoText: "احجز أفضل خدمات التجميل والعناية المنزلية والصالونات في الرياض وجدة",
    home: "الرئيسية",
    discover: "اكتشف",
    serviceBoard: "لوحة الخدمات",
    becomeProvider: "انضم كمزود خدمة",
    aboutUs: "من نحن",
    login: "تسجيل الدخول",
    signup: "تسجيل جديد",
    storeHeader: "سوق الخدمات الفاخرة",
    storeSubtitle: "تصفح الخدمات الراقية أو اكتشف أفضل الصالونات عبر المدن والأحياء بالمملكة.",
    searchPlaceholder: "ابحث عن الخدمات، الصالونات، أو الأخصائيين...",
    tabServices: "تصفح الخدمات",
    tabShops: "تصفح الصالونات والمراكز",
    cityLabel: "المدينة",
    neighborhoodLabel: "الحي",
    genderLabel: "الفئة المستهدفة",
    categoryLabel: "الفئة",
    serviceTypeLabel: "نوع الخدمة",
    priceRangeLabel: "الحد الأقصى للسعر (ريال)",
    sortByLabel: "ترتيب حسب",
    allCities: "كل المدن",
    allNeighborhoods: "كل الأحياء",
    allGenders: "جميع الفئات",
    menOnly: "الرجال",
    womenOnly: "النساء",
    unisexOnly: "مشترك",
    allCategories: "جميع الفئات",
    haircuts: "قص وحلاقة",
    haircolor: "صبغ وتصفيف الشعر",
    massage: "المساج والسبا",
    nails: "العناية بالأظافر",
    makeup: "المكياج والجمال",
    skincare: "العناية بالبشرة",
    anySetting: "أي مكان",
    mobile: "منزلي / عند الطلب",
    salon: "في الصالون / المركز",
    recommended: "الموصى به",
    ratingHigh: "الأعلى تقييماً",
    priceLow: "السعر: من الأقل للأعلى",
    priceHigh: "السعر: من الأعلى للأقل",
    startingFrom: "تبدأ من",
    viewShop: "عرض الملف الشخصي",
    bookNow: "احجز الموعد",
    noResults: "لا توجد نتائج تطابق خيارات التصفية الخاصة بك.",
    reviews: "تقييم",
    mins: "دقيقة",
    platformFeeSplit: "تقسيمات ضمان بنسبة 15% مؤمنة عبر Tap Connect",
    footerDesc: "منصة الجمال الفاخرة، والعناية والعافية. نصل بين أفضل فناني الرياض وجدة والعملاء المميزين.",
    footerDiscover: "استكشف",
    footerPartners: "للشركاء",
    footerLegal: "قانوني",
    allRightsReserved: "جميع الحقوق محفوظة. صمم خصيصاً للمملكة العربية السعودية."
  }
};

interface ShopItem {
  id: string;
  name: { en: string; ar: string };
  city: "riyadh" | "jeddah";
  neighborhood: string;
  neighborhoodKey: string;
  address: { en: string; ar: string };
  rating: number;
  reviewsCount: number;
  image: string;
  description: { en: string; ar: string };
  specialists: string[];
}

interface ServiceItem {
  id: string;
  shopId: string;
  name: { en: string; ar: string };
  providerName: { en: string; ar: string };
  category: string;
  gender: "men" | "women" | "unisex";
  price: number;
  duration: number;
  rating: number;
  reviewsCount: number;
  serviceType: "mobile" | "salon";
  image: string;
}

const mapPins = [
  { id: "1", name: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" }, city: "riyadh", district: "malqa", x: 160, y: 120, rating: 4.9, address: { en: "Al-Malqa, Riyadh", ar: "حي الملقا، الرياض" }, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=300&auto=format&fit=crop" },
  { id: "3", name: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" }, city: "riyadh", district: "yasmin", x: 340, y: 110, rating: 4.9, address: { en: "Al-Yasmin, Riyadh", ar: "حي الياسمين، الرياض" }, image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=300&auto=format&fit=crop" },
  { id: "2", name: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" }, city: "riyadh", district: "olaya", x: 250, y: 220, rating: 4.8, address: { en: "Olaya, Riyadh", ar: "حي العليا، الرياض" }, image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=300&auto=format&fit=crop" },
  { id: "4", name: { en: "Jeddah Royal Wellness Center", ar: "مركز النخبة الملكي بجدة" }, city: "jeddah", district: "hamra", x: 260, y: 250, rating: 4.7, address: { en: "Al-Hamra, Jeddah", ar: "حي الحمراء، جدة" }, image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=300&auto=format&fit=crop" },
  { id: "5", name: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" }, city: "jeddah", district: "shatei", x: 180, y: 150, rating: 4.9, address: { en: "Ash-Shati, Jeddah", ar: "حي الشاطئ، جدة" }, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=300&auto=format&fit=crop" }
];

export default function StorePage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const t = translations[locale];

  // --- TAB TOGGLE ---
  const [activeTab, setActiveTab] = useState<"services" | "shops">("services");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedMapShop, setSelectedMapShop] = useState<any>(null);

  // --- BOOKSY-STYLE FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("all");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSetting, setSelectedSetting] = useState("all");
  const [sortBy, setSortBy] = useState("recommended");
  const [maxPrice, setMaxPrice] = useState(1500);

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  // Neighborhood option lists based on selected City
  const neighborhoodsMap: Record<string, { id: string; name_en: string; name_ar: string }[]> = {
    all: [
      { id: "malqa", name_en: "Al-Malqa (Riyadh)", name_ar: "الملقا (الرياض)" },
      { id: "olaya", name_en: "Olaya (Riyadh)", name_ar: "العليا (الرياض)" },
      { id: "yasmin", name_en: "Al-Yasmin (Riyadh)", name_ar: "الياسمين (الرياض)" },
      { id: "hamra", name_en: "Al-Hamra (Jeddah)", name_ar: "الحمراء (جدة)" },
      { id: "shatei", name_en: "Ash-Shati (Jeddah)", name_ar: "الشاطئ (جدة)" }
    ],
    riyadh: [
      { id: "malqa", name_en: "Al-Malqa", name_ar: "الملقا" },
      { id: "olaya", name_en: "Olaya", name_ar: "العليا" },
      { id: "yasmin", name_en: "Al-Yasmin", name_ar: "الياسمين" }
    ],
    jeddah: [
      { id: "hamra", name_en: "Al-Hamra", name_ar: "الحمراء" },
      { id: "shatei", name_en: "Ash-Shati", name_ar: "الشاطئ" }
    ]
  };

  // Reset neighborhood selection if city changes
  useEffect(() => {
    setSelectedNeighborhood("all");
  }, [selectedCity]);

  // Mock Shops Data
  const shops: ShopItem[] = [
    {
      id: "1",
      name: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "الملقا" : "Al-Malqa",
      neighborhoodKey: "malqa",
      address: { en: "Anas Bin Malik Road, Al-Malqa, Riyadh", ar: "طريق أنس بن مالك، حي الملقا، الرياض" },
      rating: 4.9,
      reviewsCount: 1520,
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop",
      description: {
        en: "Premier luxury grooming salon for modern gentlemen in Riyadh. Master cuts, beard sculpting, and wellness face therapies.",
        ar: "صالون الحلاقة الفاخر الأول للرجال العصريين بالرياض. قصات شعر إحترافية، تهذيب اللحية، وجلسات العناية بالبشرة."
      },
      specialists: ["Ali Al-Harbi", "Tariq Mahmood"]
    },
    {
      id: "2",
      name: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "العليا" : "Olaya",
      neighborhoodKey: "olaya",
      address: { en: "Tahlia Street, Olaya, Riyadh", ar: "شارع التحلية، حي العليا، الرياض" },
      rating: 4.8,
      reviewsCount: 980,
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop",
      description: {
        en: "Exclusive women-only luxury salon offering signature event makeup, hair styling, color treatments, and custom manicures.",
        ar: "صالون تجميل فاخر وحصري للسيدات يقدم أرقى تسريحات الشعر، المكياج السينمائي، العناية بالأظافر والسبا الاستشفائي."
      },
      specialists: ["Elena Rostova", "Sara Al-Mansoori"]
    },
    {
      id: "3",
      name: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      city: "riyadh",
      neighborhood: locale === "ar" ? "الياسمين" : "Al-Yasmin",
      neighborhoodKey: "yasmin",
      address: { en: "King Abdulaziz Road, Al-Yasmin, Riyadh", ar: "طريق الملك عبدالعزيز، حي الياسمين، الرياض" },
      rating: 4.9,
      reviewsCount: 1120,
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=600&auto=format&fit=crop",
      description: {
        en: "A tranquil sanctuary offering deep sports therapies, Moroccan baths, and advanced skincare in Al-Yasmin.",
        ar: "ملاذ هادئ يقدم جلسات المساج السويدية والرياضية الفاخرة، الحمامات المغربية الملكية، والعناية المتطورة بالبشرة."
      },
      specialists: ["Elena Rostova", "Ali Al-Harbi"]
    },
    {
      id: "4",
      name: { en: "Jeddah Royal Wellness Center", ar: "مركز النخبة الملكي بجدة" },
      city: "jeddah",
      neighborhood: locale === "ar" ? "الحمراء" : "Al-Hamra",
      neighborhoodKey: "hamra",
      address: { en: "Corniche Road, Al-Hamra, Jeddah", ar: "طريق الكورنيش، حي الحمراء، جدة" },
      rating: 4.7,
      reviewsCount: 650,
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=600&auto=format&fit=crop",
      description: {
        en: "Luxury wellness and grooming center on the Jeddah Corniche. Specialized therapists and master barbers.",
        ar: "مركز صحي وحلاقة راقي على كورنيش جدة. معالجون متخصصون وحلاقو نخبة يقدمون أفضل الخدمات المنزلية وفي الفرع."
      },
      specialists: ["Tariq Mahmood", "Ali Al-Harbi"]
    },
    {
      id: "5",
      name: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" },
      city: "jeddah",
      neighborhood: locale === "ar" ? "الشاطئ" : "Ash-Shati",
      neighborhoodKey: "shatei",
      address: { en: "Prince Faisal Bin Fahd Road, Ash-Shati, Jeddah", ar: "طريق الأمير فيصل بن فهد، حي الشاطئ، جدة" },
      rating: 4.9,
      reviewsCount: 430,
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=600&auto=format&fit=crop",
      description: {
        en: "Premium coastal spa retreat providing Thalassotherapy, organic facials, nail care, and hair restoration styling.",
        ar: "منتجع وسبا ساحلي فاخر يقدم جلسات العلاج بالبحر، تنظيف البشرة العضوي، صبغ وتصفيف الشعر، وتجميل العرائس."
      },
      specialists: ["Sara Al-Mansoori", "Elena Rostova"]
    }
  ];

  // Mock Services Data linked to Shop IDs
  const services: ServiceItem[] = [
    {
      id: "s1",
      shopId: "1",
      name: { en: "Luxury Beard Grooming & Hot Towel Shave", ar: "حلاقة اللحية الفاخرة والمنشفة الساخنة" },
      providerName: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
      category: "haircuts",
      gender: "men",
      price: 150,
      duration: 45,
      rating: 4.9,
      reviewsCount: 340,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s2",
      shopId: "1",
      name: { en: "Master Haircut & Organic Scalp Wash", ar: "قص الشعر الإحترافي وغسيل فروة الرأس العضوي" },
      providerName: { en: "Elite Grooming Lounge", ar: "صالون إيليت الرجالي" },
      category: "haircuts",
      gender: "men",
      price: 120,
      duration: 45,
      rating: 4.8,
      reviewsCount: 210,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s3",
      shopId: "3",
      name: { en: "Deep Tissue Sports Therapy & Massage", ar: "علاج الأنسجة العميقة وتدليك المفاصل للرياضيين" },
      providerName: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      category: "massage",
      gender: "unisex",
      price: 350,
      duration: 60,
      rating: 4.9,
      reviewsCount: 142,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s4",
      shopId: "2",
      name: { en: "Balayage Hand-Painted Color & Silk Blowdry", ar: "تلوين بالياج يدوي واستشوار الحرير الفاخر" },
      providerName: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      category: "haircolor",
      gender: "women",
      price: 650,
      duration: 150,
      rating: 4.9,
      reviewsCount: 412,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s5",
      shopId: "2",
      name: { en: "Silk Keratin Smoothing Therapy", ar: "علاج بروتين الكيراتين الحريري لتنعيم الشعر" },
      providerName: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      category: "haircolor",
      gender: "women",
      price: 800,
      duration: 120,
      rating: 4.8,
      reviewsCount: 185,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s6",
      shopId: "3",
      name: { en: "Charcoal Face Mask Skin Extraction & Hydration", ar: "قناع الفحم لتنقية البشرة وترطيب عميق للوجه" },
      providerName: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      category: "skincare",
      gender: "unisex",
      price: 220,
      duration: 50,
      rating: 4.7,
      reviewsCount: 96,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1590439471364-192aa70c0b53?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s7",
      shopId: "3",
      name: { en: "Royal Moroccan Bath Hammam", ar: "الحمام المغربي الملكي الفاخر" },
      providerName: { en: "Riyadh Premium Spa & Wellness", ar: "سبا الرياض الفاخر للعناية" },
      category: "massage",
      gender: "women",
      price: 500,
      duration: 90,
      rating: 4.9,
      reviewsCount: 322,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s8",
      shopId: "4",
      name: { en: "Premium Haircut & Hot Towel Combo", ar: "حزمة قص الشعر وتنعيم الذقن بالمنشفة الساخنة" },
      providerName: { en: "Jeddah Royal Wellness Center", ar: "مركز النخبة الملكي بجدة" },
      category: "haircuts",
      gender: "men",
      price: 200,
      duration: 60,
      rating: 4.6,
      reviewsCount: 148,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s9",
      shopId: "5",
      name: { en: "Organic Deep Facial Therapy", ar: "علاج تنظيف البشرة العضوي العميق" },
      providerName: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" },
      category: "skincare",
      gender: "women",
      price: 400,
      duration: 60,
      rating: 4.9,
      reviewsCount: 110,
      serviceType: "mobile",
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s10",
      shopId: "2",
      name: { en: "French Gel Manicure & Paraffin Hand Treatment", ar: "جلسة المانيكير الفرنسي وعلاج اليدين بالبارافين" },
      providerName: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      category: "nails",
      gender: "women",
      price: 180,
      duration: 45,
      rating: 4.8,
      reviewsCount: 125,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s11",
      shopId: "5",
      name: { en: "Luxury Pedicure & Organic Mint Foot Scrub", ar: "باديكير فاخر وتقشير القدمين بالنعناع العضوي" },
      providerName: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" },
      category: "nails",
      gender: "women",
      price: 220,
      duration: 50,
      rating: 4.9,
      reviewsCount: 68,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s12",
      shopId: "2",
      name: { en: "Bridal Couture Makeup & False Lashes Glam", ar: "مكياج عروس ملكي وتركيب رموش كثيفة" },
      providerName: { en: "Sara Beauty Salon & Spa", ar: "صالون وسبا سارة للتجميل" },
      category: "makeup",
      gender: "women",
      price: 1200,
      duration: 120,
      rating: 5.0,
      reviewsCount: 94,
      serviceType: "salon",
      image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?q=80&w=400&auto=format&fit=crop"
    },
    {
      id: "s13",
      shopId: "5",
      name: { en: "Event Glam Makeup & Glowing Dewy Finish", ar: "مكياج المناسبات الساحر وإضاءة الوجه الندية" },
      providerName: { en: "Ash-Shati Luxury Ladies Spa", ar: "صالون الشاطئ النسائي الفاخر" },
      category: "makeup",
      gender: "women",
      price: 450,
      duration: 60,
      rating: 4.9,
      reviewsCount: 52,
      serviceType: "mobile",
      image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?q=80&w=400&auto=format&fit=crop"
    }
  ];

  // --- FILTER & SORT ACTIONS ---
  // Filtered Shops
  const filteredShops = shops.filter(shop => {
    const matchesSearch = shop.name[locale].toLowerCase().includes(searchQuery.toLowerCase()) ||
                          shop.address[locale].toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = selectedCity === "all" || shop.city === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === "all" || shop.neighborhoodKey === selectedNeighborhood;

    // Check if shop works with selected gender
    const shopServices = services.filter(s => s.shopId === shop.id);
    const matchesGender = selectedGender === "all" || shopServices.some(s => s.gender === selectedGender);
    
    // Check if shop has selected category
    const matchesCategory = selectedCategory === "all" || shopServices.some(s => s.category === selectedCategory);
    
    // Setting type
    const matchesSetting = selectedSetting === "all" || shopServices.some(s => s.serviceType === selectedSetting);

    return matchesSearch && matchesCity && matchesNeighborhood && matchesGender && matchesCategory && matchesSetting;
  }).sort((a, b) => {
    if (sortBy === "rating") return b.rating - a.rating;
    return b.reviewsCount - a.reviewsCount;
  });

  // Filtered Services
  const filteredServices = services.filter(s => {
    const shop = shops.find(sh => sh.id === s.shopId);
    if (!shop) return false;

    const matchesSearch = s.name[locale].toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.providerName[locale].toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = selectedCity === "all" || shop.city === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === "all" || shop.neighborhoodKey === selectedNeighborhood;
    const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
    const matchesGender = selectedGender === "all" || s.gender === selectedGender;
    const matchesSetting = selectedSetting === "all" || s.serviceType === selectedSetting;
    const matchesPrice = s.price <= maxPrice;

    return matchesSearch && matchesCity && matchesNeighborhood && matchesCategory && matchesGender && matchesSetting && matchesPrice;
  }).sort((a, b) => {
    if (sortBy === "rating") return b.rating - a.rating;
    if (sortBy === "price-low") return a.price - b.price;
    if (sortBy === "price-high") return b.price - a.price;
    return b.reviewsCount - a.reviewsCount;
  });

  const isRTL = locale === "ar";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans antialiased">
      {/* 1. TOP PROMO BAR */}
      <div className="w-full bg-stone-100 border-b border-stone-200 py-2.5 px-4 text-center text-[10px] sm:text-xs font-semibold tracking-wider text-stone-600 uppercase flex items-center justify-center gap-4">
        <span>{t.promoText}</span>
      </div>

      {/* 2. HEADER */}
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50 shadow-sm backdrop-blur-md bg-white/95">
        <Link href="/" className="text-2xl font-serif font-black tracking-widest text-stone-900 hover:opacity-80 transition flex-shrink-0">
          PRIMORA
        </Link>
        <nav className="hidden lg:flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-wider text-stone-500 flex-1 mx-8">
          <Link href="/" className="hover:text-stone-950 transition-colors">{t.home}</Link>
          <Link href="/store" className="text-stone-900 hover:text-stone-900 transition-colors">{t.discover}</Link>
          <Link href="/service-board" className="hover:text-stone-950 transition-colors">{t.serviceBoard}</Link>
          <Link href="/become-provider" className="hover:text-stone-950 transition-colors">{t.becomeProvider}</Link>
          <Link href="/about" className="hover:text-stone-950 transition-colors">{t.aboutUs}</Link>
        </nav>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Link href="/store" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>
            <Link href="/login" className="text-stone-700 hover:text-stone-950 transition">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>
          </div>
          <div className="h-4 w-px bg-stone-200"></div>
          <button
            onClick={toggleLanguage}
            className="px-3.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-[10px] font-extrabold hover:border-black transition"
          >
            {locale === "en" ? "العربية" : "English"}
          </button>
        </div>
      </header>

      {/* 3. MAIN CONTENT AND BOOKSY SEARCH SYSTEM */}
      <main className="max-w-7xl mx-auto py-12 px-6 sm:px-8 space-y-8 flex-grow w-full">
        {/* Title Header */}
        <div className={isRTL ? "text-right" : "text-left"}>
          <h1 className="text-3xl sm:text-4xl font-serif font-black tracking-tight text-stone-950">{t.storeHeader}</h1>
          <p className="text-xs text-stone-500 mt-1.5">{t.storeSubtitle}</p>
        </div>

        {/* Tab switcher: Browse Services vs. Browse Shops */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setActiveTab("services")}
            className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === "services"
                ? "border-stone-950 text-stone-950 font-black"
                : "border-transparent text-stone-400 hover:text-stone-750"
            }`}
          >
            {t.tabServices}
          </button>
          <button
            onClick={() => setActiveTab("shops")}
            className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === "shops"
                ? "border-stone-950 text-stone-950 font-black"
                : "border-transparent text-stone-400 hover:text-stone-750"
            }`}
          >
            {t.tabShops}
          </button>
        </div>

        {/* Global text search */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 bg-stone-50 px-4 py-3.5 rounded-xl border border-stone-200/80">
            <svg className="w-4.5 h-4.5 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`bg-transparent border-none outline-none text-xs w-full text-stone-850 placeholder-stone-400 ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>
        </div>

        {/* Two-Column Booksy Layout: Sidebar Filters + Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          
          {/* SIDEBAR FILTERS PANEL */}
          <aside className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6 lg:sticky lg:top-24">
            
            {/* 1. City selection */}
            <div className="space-y-2">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.cityLabel}</h3>
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              >
                <option value="all">{t.allCities}</option>
                <option value="riyadh">Riyadh / الرياض</option>
                <option value="jeddah">Jeddah / جدة</option>
              </select>
            </div>

            <hr className="border-stone-150" />

            {/* 2. Neighborhood selection (dependent on City choice) */}
            <div className="space-y-2">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.neighborhoodLabel}</h3>
              <select
                value={selectedNeighborhood}
                onChange={e => setSelectedNeighborhood(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              >
                <option value="all">{t.allNeighborhoods}</option>
                {(neighborhoodsMap[selectedCity] || neighborhoodsMap.all).map(n => (
                  <option key={n.id} value={n.id}>{locale === "ar" ? n.name_ar : n.name_en}</option>
                ))}
              </select>
            </div>

            <hr className="border-stone-150" />

            {/* 3. Target Audience / Gender */}
            <div className="space-y-3">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.genderLabel}</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "all", label: t.allGenders },
                  { id: "men", label: t.menOnly },
                  { id: "women", label: t.womenOnly },
                  { id: "unisex", label: t.unisexOnly }
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGender(g.id)}
                    className={`py-2 px-3 rounded-lg text-[10px] font-bold transition uppercase tracking-wide ${
                      selectedGender === g.id
                        ? "bg-stone-900 text-stone-50"
                        : "bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-stone-150" />

            {/* 4. Category selection */}
            <div className="space-y-2">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.categoryLabel}</h3>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              >
                <option value="all">{t.allCategories}</option>
                <option value="haircuts">{t.haircuts}</option>
                <option value="haircolor">{t.haircolor}</option>
                <option value="massage">{t.massage}</option>
                <option value="nails">{t.nails}</option>
                <option value="makeup">{t.makeup}</option>
                <option value="skincare">{t.skincare}</option>
              </select>
            </div>

            <hr className="border-stone-150" />

            {/* 5. Setting / Service Type */}
            <div className="space-y-2">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.serviceTypeLabel}</h3>
              <select
                value={selectedSetting}
                onChange={e => setSelectedSetting(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              >
                <option value="all">{t.anySetting}</option>
                <option value="salon">{t.salon}</option>
                <option value="mobile">{t.mobile}</option>
              </select>
            </div>

            {activeTab === "services" && (
              <>
                <hr className="border-stone-150" />
                {/* 6. Price Range Limit (Services only) */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                    <span>{t.priceRangeLabel}</span>
                    <span className="text-stone-900 font-black">{maxPrice} SAR</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1500"
                    step="25"
                    value={maxPrice}
                    onChange={e => setMaxPrice(Number(e.target.value))}
                    className="w-full h-1 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-stone-900"
                  />
                </div>
              </>
            )}

            <hr className="border-stone-150" />

            {/* 7. Sorting */}
            <div className="space-y-2">
              <h3 className={`text-[10px] uppercase font-bold tracking-wider text-stone-400 ${isRTL ? "text-right" : "text-left"}`}>{t.sortByLabel}</h3>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-950 ${isRTL ? "text-right" : "text-left"}`}
              >
                <option value="recommended">{t.recommended}</option>
                <option value="rating">{t.ratingHigh}</option>
                {activeTab === "services" && (
                  <>
                    <option value="price-low">{t.priceLow}</option>
                    <option value="price-high">{t.priceHigh}</option>
                  </>
                )}
              </select>
            </div>

          </aside>

          {/* MAIN RESULTS AREA */}
          <div className="lg:col-span-3 space-y-6">
            
            <div className={`flex items-center justify-between text-xs text-stone-400 font-semibold px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>
                {activeTab === "services" 
                  ? `${filteredServices.length} ${locale === "ar" ? "خدمة متاحة" : "services available"}` 
                  : `${filteredShops.length} ${locale === "ar" ? "صالون ومركز متاح" : "shops available"}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition ${
                    viewMode === "list"
                      ? "bg-stone-900 border-stone-900 text-stone-50"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-950"
                  }`}
                >
                  {locale === "ar" ? "قائمة" : "List"}
                </button>
                <button
                  onClick={() => {
                    setViewMode("map");
                    setSelectedMapShop(null);
                  }}
                  className={`px-3 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition ${
                    viewMode === "map"
                      ? "bg-stone-900 border-stone-900 text-stone-50"
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-950"
                  }`}
                >
                  {locale === "ar" ? "خريطة" : "Map"}
                </button>
              </div>
            </div>

            {viewMode === "map" ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
                  <div className={`space-y-0.5 ${isRTL ? "text-right" : "text-left"}`}>
                    <h3 className="font-serif font-black text-lg text-stone-900">
                      {selectedCity === "jeddah" 
                        ? (isRTL ? "خريطة جدة التفاعلية" : "Jeddah Interactive Map")
                        : (isRTL ? "خريطة الرياض التفاعلية" : "Riyadh Interactive Map")}
                    </h3>
                    <p className="text-[10px] text-stone-400 font-semibold">
                      {isRTL ? "انقر على مؤشرات الصالونات باللون الذهبي لاستعراض التفاصيل وحجز المواعيد." : "Click on gold salon pin markers to display info card overlays and book appointments."}
                    </p>
                  </div>
                </div>

                <div className="relative aspect-[16/10] w-full border border-stone-200 rounded-xl overflow-hidden bg-stone-950">
                  {selectedCity === "jeddah" ? (
                    <svg viewBox="0 0 500 320" className="w-full h-full">
                      <defs>
                        <pattern id="jeddahGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#jeddahGrid)" />
                      <path d="M 0 0 L 120 0 Q 150 160 110 320 L 0 320 Z" fill="rgba(14, 116, 144, 0.15)" stroke="rgba(14, 116, 144, 0.3)" strokeWidth="1.5" />
                      <text x="35" y="160" fill="rgba(14, 116, 144, 0.4)" fontSize="10" fontWeight="bold" transform="rotate(-90 35 160)" letterSpacing="2">RED SEA / البحر الأحمر</text>
                      <path d="M 125 0 Q 155 160 115 320" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
                      <text x="180" y="90" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="extrabold" letterSpacing="1">ASH-SHATI / الشاطئ</text>
                      <text x="250" y="210" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="extrabold" letterSpacing="1">AL-HAMRA / الحمراء</text>
                      {mapPins.filter(pin => pin.city === "jeddah" && (selectedNeighborhood === "all" || pin.district === selectedNeighborhood)).map(pin => (
                        <g 
                          key={pin.id} 
                          onClick={() => setSelectedMapShop(pin)}
                          className="cursor-pointer group"
                        >
                          <circle cx={pin.x} cy={pin.y} r="14" fill="none" stroke="hsl(45,60%,50%)" strokeWidth="1.5" />
                          <circle cx={pin.x} cy={pin.y} r="8" fill="hsla(45,60%,50%,0.2)" />
                          <circle cx={pin.x} cy={pin.y} r="4.5" fill="hsl(45,60%,50%)" stroke="#ffffff" strokeWidth="1" />
                          <rect x={pin.x - 50} y={pin.y - 24} width="100" height="15" rx="3" fill="rgba(0,0,0,0.8)" stroke="hsla(45,60%,50%,0.3)" strokeWidth="0.5" />
                          <text x={pin.x} y={pin.y - 14} fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">{pin.name[locale]}</text>
                        </g>
                      ))}
                    </svg>
                  ) : (
                    <svg viewBox="0 0 500 320" className="w-full h-full">
                      <defs>
                        <pattern id="riyadhGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#riyadhGrid)" />
                      <path d="M 50 160 Q 250 160 450 160" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2.5" strokeDasharray="4 4" />
                      <path d="M 250 40 Q 250 160 250 280" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2.5" />
                      <circle cx="250" cy="160" r="100" fill="none" stroke="hsla(45,60%,50%,0.12)" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="250" y="75" fill="hsla(45,60%,50%,0.3)" fontSize="7" fontWeight="bold" textAnchor="middle" letterSpacing="1">10KM ROUTING BOUNDARY</text>
                      <text x="110" y="85" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="extrabold" letterSpacing="1">AL-MALQA / الملقا</text>
                      <text x="320" y="85" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="extrabold" letterSpacing="1">AL-YASMIN / الياسمين</text>
                      <text x="220" y="265" fill="rgba(255,255,255,0.25)" fontSize="9" fontWeight="extrabold" letterSpacing="1">OLAYA / العليا</text>
                      {mapPins.filter(pin => (selectedCity === "all" || pin.city === selectedCity) && (selectedNeighborhood === "all" || pin.district === selectedNeighborhood)).map(pin => (
                        <g 
                          key={pin.id} 
                          onClick={() => setSelectedMapShop(pin)}
                          className="cursor-pointer group"
                        >
                          <circle cx={pin.x} cy={pin.y} r="14" fill="none" stroke="hsl(45,60%,50%)" strokeWidth="1.5" />
                          <circle cx={pin.x} cy={pin.y} r="8" fill="hsla(45,60%,50%,0.2)" />
                          <circle cx={pin.x} cy={pin.y} r="4.5" fill="hsl(45,60%,50%)" stroke="#ffffff" strokeWidth="1" />
                          <rect x={pin.x - 50} y={pin.y - 24} width="100" height="15" rx="3" fill="rgba(0,0,0,0.8)" stroke="hsla(45,60%,50%,0.3)" strokeWidth="0.5" />
                          <text x={pin.x} y={pin.y - 14} fill="#ffffff" fontSize="7" fontWeight="bold" textAnchor="middle">{pin.name[locale]}</text>
                        </g>
                      ))}
                    </svg>
                  )}

                  {selectedMapShop && (
                    <div className="absolute bottom-4 left-4 right-4 bg-stone-900 border border-stone-800 p-4 rounded-xl flex items-center justify-between gap-4 text-white shadow-2xl animate-[slideDown_0.2s_ease-out]">
                      <div className="flex items-center gap-3">
                        <img src={selectedMapShop.image} alt={selectedMapShop.name[locale]} className="w-12 h-12 rounded-lg object-cover border border-stone-800" />
                        <div className={`space-y-0.5 ${isRTL ? "text-right" : "text-left"}`}>
                          <h4 className="text-xs font-bold text-white">{selectedMapShop.name[locale]}</h4>
                          <p className="text-[9px] text-stone-400 font-semibold">{selectedMapShop.address[locale]}</p>
                          <span className="text-[8px] text-[hsl(45,60%,50%)] font-bold">★ {selectedMapShop.rating}</span>
                        </div>
                      </div>
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => setSelectedMapShop(null)}
                          className="px-2.5 py-1.5 border border-stone-800 text-stone-400 hover:text-white rounded-lg text-[10px] font-bold uppercase transition"
                        >
                          {isRTL ? "إغلاق" : "Close"}
                        </button>
                        <Link 
                          href={`/shop/${selectedMapShop.id}`}
                          className="px-3.5 py-1.5 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black rounded-lg text-[10px] font-bold uppercase transition"
                        >
                          {isRTL ? "حجز" : "Book Now"}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* GRID OF SERVICES */}
                {activeTab === "services" && (
                  filteredServices.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center">
                  <p className="text-xs text-stone-400 font-semibold">{t.noResults}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredServices.map(item => (
                    <div
                      key={item.id}
                      className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:border-black transition duration-200 group"
                    >
                      <div className="space-y-4">
                        {/* cover image */}
                        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-stone-100 relative border border-stone-100">
                          <img
                            src={item.image}
                            alt={item.name[locale]}
                            className="w-full h-full object-cover group-hover:scale-103 transition duration-500"
                          />
                          <span className="absolute top-2.5 right-2.5 bg-stone-900/90 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded">
                            ★ {item.rating} ({item.reviewsCount})
                          </span>
                          <span className={`absolute bottom-2.5 left-2.5 text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded ${
                            item.gender === "men"
                              ? "bg-blue-900/90 text-blue-50"
                              : item.gender === "women"
                                ? "bg-purple-900/90 text-purple-50"
                                : "bg-stone-900/90 text-stone-50"
                          }`}>
                            {item.gender === "men" ? t.menOnly : item.gender === "women" ? t.womenOnly : t.unisexOnly}
                          </span>
                        </div>

                        {/* info */}
                        <div className={`space-y-1 ${isRTL ? "text-right" : "text-left"}`}>
                          <Link href={`/shop/${item.shopId}`} className="text-[9px] text-stone-400 font-bold uppercase tracking-wider block hover:text-stone-900">
                            {item.providerName[locale]} →
                          </Link>
                          <h3 className="font-bold text-stone-900 text-sm line-clamp-2 h-10 leading-tight">{item.name[locale]}</h3>
                          <p className="text-[10px] text-stone-400 font-semibold">{item.duration} {t.mins}</p>
                          
                          <div className={`pt-2 flex ${isRTL ? "justify-end" : "justify-start"}`}>
                            <span className="text-[8px] font-extrabold px-2 py-0.5 rounded-full bg-stone-50 text-stone-600 border border-stone-200">
                              {item.serviceType === "mobile" ? t.mobile : t.salon}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* footer price & action */}
                      <div className="flex items-center justify-between pt-4 border-t border-stone-100 mt-4">
                        <div>
                          <span className="text-[8px] text-stone-400 uppercase font-bold block">{t.startingFrom}</span>
                          <span className="text-sm font-black text-stone-950">{item.price} SAR</span>
                        </div>
                        <Link
                          href={`/shop/${item.shopId}`}
                          className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-wider rounded-lg transition shadow-sm"
                        >
                          {t.bookNow}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* GRID OF SHOPS */}
            {activeTab === "shops" && (
              filteredShops.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center">
                  <p className="text-xs text-stone-400 font-semibold">{t.noResults}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredShops.map(shop => (
                    <div
                      key={shop.id}
                      className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:border-black transition duration-200 group"
                    >
                      <div className="space-y-4">
                        {/* Cover Image */}
                        <div className="aspect-[4/3] rounded-xl overflow-hidden bg-stone-100 relative border border-stone-100">
                          <img
                            src={shop.image}
                            alt={shop.name[locale]}
                            className="w-full h-full object-cover group-hover:scale-103 transition duration-500"
                          />
                          <span className="absolute top-2.5 right-2.5 bg-stone-900/90 text-stone-50 text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded">
                            ★ {shop.rating} ({shop.reviewsCount})
                          </span>
                        </div>

                        {/* Shop Info */}
                        <div className={`space-y-2 ${isRTL ? "text-right" : "text-left"}`}>
                          <span className="text-[8px] text-[hsl(45,60%,50%)] font-extrabold uppercase tracking-widest bg-stone-50 border border-stone-150 px-2 py-0.5 rounded-full inline-block">
                            {shop.city.toUpperCase()} • {shop.neighborhood}
                          </span>
                          <h3 className="font-bold text-stone-900 text-sm line-clamp-1">{shop.name[locale]}</h3>
                          <p className="text-[10px] text-stone-450 leading-relaxed font-light line-clamp-2 h-8">{shop.description[locale]}</p>
                          <p className="text-[9px] text-stone-400 font-semibold mt-1 truncate">{shop.address[locale]}</p>
                        </div>
                      </div>

                      {/* Action CTA */}
                      <div className="pt-4 border-t border-stone-100 mt-4">
                        <Link
                          href={`/shop/${shop.id}`}
                          className="w-full text-center py-2 bg-stone-900 hover:bg-stone-850 text-stone-50 text-[10px] font-bold uppercase tracking-widest rounded-lg block transition shadow-sm"
                        >
                          {t.viewShop}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
              </>
            )}

          </div>

        </div>

      </main>

      {/* 4. FOOTER */}
      <footer className="bg-stone-950 text-stone-400 py-12 px-6 sm:px-12 border-t border-stone-900 mt-auto">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          <div className="space-y-4">
            <h4 className="text-white font-serif font-black tracking-widest text-lg">PRIMORA</h4>
            <p className="text-xs text-stone-500 font-light leading-relaxed">
              {t.footerDesc}
            </p>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerDiscover}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/categories/barber" className="hover:text-white transition">{locale === "ar" ? "قص الشعر والحلاقة" : "Haircuts & Barbering"}</Link></li>
              <li><Link href="/categories/hair" className="hover:text-white transition">{locale === "ar" ? "تصفيف وتلوين الشعر" : "Hair Styling & Color"}</Link></li>
              <li><Link href="/categories/spa" className="hover:text-white transition">{locale === "ar" ? "غرف السبا والعافية" : "Wellness & Spa Rooms"}</Link></li>
              <li><Link href="/categories/makeup" className="hover:text-white transition">{locale === "ar" ? "المكياج ومستحضرات التجميل" : "Makeup & Cosmetics"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerPartners}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/become-provider" className="hover:text-white transition">{t.becomeProvider}</Link></li>
              <li><Link href="/provider/staff-management" className="hover:text-white transition">{locale === "ar" ? "إدارة شؤون الموظفين" : "Staff Management"}</Link></li>
              <li><Link href="/provider/pricing" className="hover:text-white transition">{locale === "ar" ? "التسعير المشترك" : "Split Ledger Pricing"}</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white text-xs uppercase tracking-widest font-extrabold mb-4">{t.footerLegal}</h5>
            <ul className="space-y-2 text-xs">
              <li><Link href="/privacy" className="hover:text-white transition">{locale === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}</Link></li>
              <li><Link href="/terms" className="hover:text-white transition">{locale === "ar" ? "شروط الخدمة" : "Terms of Service"}</Link></li>
              <li><Link href="/security" className="hover:text-white transition">{locale === "ar" ? "هيئة الزكاة والمدفوعات" : "ZATCA & Payments"}</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-8 border-t border-stone-900 text-center text-xs text-stone-600 font-medium">
          <p>© {new Date().getFullYear()} PRIMORA. {t.allRightsReserved}</p>
        </div>
      </footer>
    </div>
  );
}
