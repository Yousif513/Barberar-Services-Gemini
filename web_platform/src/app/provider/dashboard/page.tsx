"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const translations = {
  en: {
    dashboard: "Dashboard",
    overview: "Overview",
    monthly: "Monthly",
    totalTime: "Total Time",
    totalSteps: "Total Bookings",
    target: "Target",
    dailyJogging: "Daily Bookings",
    myJogging: "My Performance",
    friends: "Stylists & Staff",
    viewAll: "View All",
    activities: "Active",
    online: "Online",
    liveMap: "Live map",
    view: "View",
    bookWalkIn: "+ BOOK WALK-IN",
    welcome: "Welcome back,",
    searchPlaceholder: "Search...",
    bicycleDrill: "Hair Styling",
    joggingHero: "Spa Therapy",
    healthyBusy: "Grooming Stations",
    daysLeft: "days left",
    completed: "completed",
    steps: "Bookings",
    targetVal: "10,000 Bookings",
    stepsUnit: "Bookings",
    stepsShort: "Bk",
    hr: "hr",
    july: "July",
    april: "April"
  },
  ar: {
    dashboard: "لوحة التحكم",
    overview: "الأداء العام",
    monthly: "شهرياً",
    totalTime: "الوقت الإجمالي",
    totalSteps: "إجمالي الحجوزات",
    target: "المستهدف",
    dailyJogging: "الحجوزات اليومية",
    myJogging: "مؤشرات الأداء",
    friends: "الأخصائيين وفريق العمل",
    viewAll: "عرض الكل",
    activities: "النشطين",
    online: "متصل الآن",
    liveMap: "خريطة الميدان",
    view: "عرض",
    bookWalkIn: "+ حجز عميل حضور",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث...",
    bicycleDrill: "تصفيف الشعر",
    joggingHero: "علاجات السبا",
    healthyBusy: "عربة العناية",
    daysLeft: "أيام متبقية",
    completed: "مكتمل",
    steps: "الحجوزات",
    targetVal: "١٠,٠٠٠ حجز",
    stepsUnit: "حجوزات",
    stepsShort: "حجز",
    hr: "ساعة",
    july: "يوليو",
    april: "أبريل"
  }
};

export default function ProviderDashboardPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [searchQuery, setSearchQuery] = useState("");
  const [businessName, setBusinessName] = useState("Elite Barbershop");

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

  const isRTL = locale === "ar";
  const t = translations[locale];

  // Dynamic statistics calculations
  const [statsData, setStatsData] = useState({
    totalBookings: 9178,
    targetBookings: 9200,
    totalTimeHours: 748,
    activePercentage: 45
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: providerInfo } = await supabase
          .from("providers")
          .select("id, business_name_en, business_name_ar")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (providerInfo) {
          setBusinessName(isRTL ? providerInfo.business_name_ar : providerInfo.business_name_en);
        }
      } catch (err) {
        console.warn("Using offline fallback parameters for stats:", err);
      }
    }
    loadStats();
  }, [locale, isRTL]);

  // Handle language switch from local widget
  const handleLocalLanguageToggle = () => {
    const nextLang = locale === "en" ? "ar" : "en";
    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "ar" ? "rtl" : "ltr";
    setLocale(nextLang);
  };

  return (
    <div className={`grid grid-cols-1 xl:grid-cols-4 gap-8 font-sans ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      
      {/* ========================================== */}
      {/* LEFT & MIDDLE CONTENT (3/4 Width)          */}
      {/* ========================================== */}
      <div className="xl:col-span-3 space-y-8">
        
        {/* ── HEADER ROW ── */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.04] pb-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <div className={isRTL ? "text-right" : "text-left"}>
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-[#D1AF47]">Primora</span>
            <h2 className="text-3xl font-black tracking-tight text-white mt-1">{t.dashboard}</h2>
          </div>

          {/* Search Field */}
          <div className={`flex items-center gap-3 bg-white/[0.03] px-4.5 py-2.5 rounded-2xl border border-white/[0.06] w-full sm:w-80 focus-within:border-[#D1AF47]/30 transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-[#7B859C]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`bg-transparent border-none outline-none text-xs w-full text-white placeholder-[#7B859C]/50 ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>
        </div>

        {/* ── MAIN CHART & SIDE CARDS ROW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Overview Chart Card (Takes 2/3 width of this row) */}
          <div className="lg:col-span-2 bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[360px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-bold text-base text-white">{t.overview}</h3>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] text-[#B8C0D4] font-bold cursor-pointer hover:border-[#D1AF47]/30 transition duration-300">
                <span>{t.monthly}</span>
                <svg className="w-3 h-3 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* SVG Wave Line Chart */}
            <div className="relative w-full h-36 mt-4">
              <svg viewBox="0 0 500 120" className="w-full h-full overflow-visible">
                <defs>
                  <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#D1AF47" stopOpacity="0.00" />
                  </linearGradient>
                </defs>

                {/* Grid line helper */}
                <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                {/* Glowing area */}
                <path
                  d="M 10,75 C 60,60 100,105 150,55 C 200,15 240,85 290,45 C 340,15 390,75 430,35 C 470,25 490,40 500,38 L 500,120 L 10,120 Z"
                  fill="url(#glowGrad)"
                />

                {/* Bezier wave line */}
                <path
                  d="M 10,75 C 60,60 100,105 150,55 C 200,15 240,85 290,45 C 340,15 390,75 430,35 C 470,25 490,40 500,38"
                  fill="none"
                  stroke="#D1AF47"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />

                {/* Selected active point indicator */}
                <g className="cursor-pointer">
                  <line x1="200" y1="15" x2="200" y2="100" stroke="#D1AF47" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="200" cy="15" r="7" fill="#070B12" stroke="#D1AF47" strokeWidth="2.5" />
                  <circle cx="200" cy="15" r="2.5" fill="#FFFFFF" />
                  
                  {/* Tooltip Label */}
                  <rect x="215" y="0" width="85" height="30" rx="8" fill="#172033" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x="257.5" y="18" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold" fontFamily="sans-serif">
                    {statsData.totalBookings.toLocaleString()} {t.stepsShort}
                  </text>
                </g>
              </svg>
            </div>

            {/* Months labels */}
            <div className={`flex justify-between text-[10px] font-extrabold text-[#7B859C] uppercase tracking-wider px-2 mt-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <span>Jan</span><span>Feb</span><span>Mar</span><span className="text-[#D1AF47] bg-[#D1AF47]/10 px-2.5 py-0.5 rounded-full border border-[#D1AF47]/20">Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span>
            </div>

            {/* Bottom 3 metrics grid */}
            <div className="grid grid-cols-3 gap-4 border-t border-white/[0.05] pt-4 mt-6">
              <div className={isRTL ? "text-right" : "text-left"}>
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#7B859C] block">{t.totalTime}</span>
                <span className="text-lg font-black text-white mt-1 block">{statsData.totalTimeHours} {t.hr}</span>
                <span className="text-[9px] text-[#7B859C] block font-medium mt-0.5">{t.april}</span>
              </div>
              <div className="border-x border-white/[0.05] px-4">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#7B859C] block">{t.totalSteps}</span>
                <span className="text-lg font-black text-[#D1AF47] mt-1 block">{statsData.totalBookings.toLocaleString()} {t.stepsShort}</span>
                <span className="text-[9px] text-[#7B859C] block font-medium mt-0.5">{t.april}</span>
              </div>
              <div className={isRTL ? "text-left" : "text-right"}>
                <span className="text-[9px] uppercase font-bold tracking-wider text-[#7B859C] block">{t.target}</span>
                <span className="text-lg font-black text-white mt-1 block">{statsData.targetBookings.toLocaleString()} {t.stepsShort}</span>
                <span className="text-[9px] text-[#7B859C] block font-medium mt-0.5">{t.april}</span>
              </div>
            </div>
          </div>

          {/* Right side vertical stacked cards (Daily Jogging & My Jogging style) */}
          <div className="flex flex-col gap-6 justify-between">
            {/* Daily Jogging (Clean gold gradient glass card) */}
            <div className="bg-gradient-to-br from-[#2E2412] to-[#151108] border border-[#D1AF47]/10 rounded-[28px] p-6 flex items-center justify-between shadow-xl relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300 flex-1">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform pointer-events-none" />
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#D1AF47]/15 border border-[#D1AF47]/20 flex items-center justify-center text-[#D1AF47]">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif font-black text-white text-base leading-tight">{t.dailyJogging}</h4>
                  <p className="text-xs text-[#B8C0D4] mt-1 font-medium">{locale === "ar" ? "٣٢ حجز نشط" : "32 active bookings"}</p>
                </div>
              </div>
            </div>

            {/* My Jogging (Glass card with round arrow indicator) */}
            <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-[#D1AF47]/20 transition-all duration-300 flex-1 min-h-[160px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D1AF47]/5 rounded-full blur-2xl pointer-events-none" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#070B12] flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-serif font-black text-white text-sm leading-tight">{t.myJogging}</h4>
                </div>
              </div>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-[#7B859C] block">{t.totalTime}</span>
                  <span className="text-lg font-black text-white mt-0.5 block">{statsData.totalTimeHours} {t.hr}</span>
                  <span className="text-[9px] text-[#7B859C] font-medium block mt-0.5">{t.july}</span>
                </div>
                <Link href="/provider/reports" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:border-[#D1AF47]/30 hover:bg-[#D1AF47]/10 flex items-center justify-center transition-all duration-300 text-white hover:text-[#D1AF47] hover:scale-105 shadow-inner">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

          </div>

        </div>

        {/* ── BOTTOM THREE DRILLS ROW ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Bicycle Drill */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[200px] hover:border-[#D1AF47]/20 transition-all duration-300 group">
            <div className="flex justify-between items-start">
              <div className="w-11 h-11 rounded-xl bg-[#D1AF47]/10 border border-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:scale-105 transition-transform duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <button className="text-[#7B859C] hover:text-white transition">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <div className="mt-6">
              <h4 className="font-serif font-black text-white text-base leading-tight">{t.bicycleDrill}</h4>
              <p className="text-[10px] text-[#7B859C] font-semibold mt-1">36 {locale === "ar" ? "حجز" : "bookings"} / {locale === "ar" ? "أسبوع" : "week"}</p>
            </div>
            
            {/* Progress segment */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-[#7B859C]">
                <span>Progress</span>
                <span className="text-[#D1AF47]">45%</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] border border-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#B8952E] to-[#D1AF47] rounded-full" style={{ width: "45%" }} />
              </div>
            </div>

            <div className="flex justify-between items-center mt-5 pt-3.5 border-t border-white/[0.04]">
              <span className="text-[10px] font-mono text-[#7B859C] font-semibold">17 / 38 {t.stepsShort}</span>
              <span className="px-2.5 py-0.5 text-[9px] font-bold text-[#D1AF47] bg-[#D1AF47]/10 border border-[#D1AF47]/20 rounded-full">2 {t.daysLeft}</span>
            </div>
          </div>

          {/* Card 2: Jogging Hero */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[200px] hover:border-[#D1AF47]/20 transition-all duration-300 group">
            <div className="flex justify-between items-start">
              <div className="w-11 h-11 rounded-xl bg-[#D1AF47]/10 border border-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:scale-105 transition-transform duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <button className="text-[#7B859C] hover:text-white transition">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <div className="mt-6">
              <h4 className="font-serif font-black text-white text-base leading-tight">{t.joggingHero}</h4>
              <p className="text-[10px] text-[#7B859C] font-semibold mt-1">12 {locale === "ar" ? "حجز" : "bookings"} / {locale === "ar" ? "شهر" : "month"}</p>
            </div>
            
            {/* Progress segment */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-[#7B859C]">
                <span>Progress</span>
                <span className="text-[#D1AF47]">13%</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] border border-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#B8952E] to-[#D1AF47] rounded-full" style={{ width: "13%" }} />
              </div>
            </div>

            <div className="flex justify-between items-center mt-5 pt-3.5 border-t border-white/[0.04]">
              <span className="text-[10px] font-mono text-[#7B859C] font-semibold">2 / 12 {t.stepsShort}</span>
              <span className="px-2.5 py-0.5 text-[9px] font-bold text-[#D1AF47] bg-[#D1AF47]/10 border border-[#D1AF47]/20 rounded-full">17 {t.daysLeft}</span>
            </div>
          </div>

          {/* Card 3: Healthy Busy */}
          <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[200px] hover:border-[#D1AF47]/20 transition-all duration-300 group">
            <div className="flex justify-between items-start">
              <div className="w-11 h-11 rounded-xl bg-[#D1AF47]/10 border border-[#D1AF47]/10 flex items-center justify-center text-[#D1AF47] group-hover:scale-105 transition-transform duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1" />
                </svg>
              </div>
              <button className="text-[#7B859C] hover:text-white transition">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </button>
            </div>
            <div className="mt-6">
              <h4 className="font-serif font-black text-white text-base leading-tight">{t.healthyBusy}</h4>
              <p className="text-[10px] text-[#7B859C] font-semibold mt-1">3200 {locale === "ar" ? "حجز" : "bookings"} / {locale === "ar" ? "أسبوع" : "week"}</p>
            </div>
            
            {/* Progress segment */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-[#7B859C]">
                <span>Progress</span>
                <span className="text-[#D1AF47]">80%</span>
              </div>
              <div className="h-1.5 w-full bg-white/[0.03] border border-white/[0.05] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#B8952E] to-[#D1AF47] rounded-full" style={{ width: "80%" }} />
              </div>
            </div>

            <div className="flex justify-between items-center mt-5 pt-3.5 border-t border-white/[0.04]">
              <span className="text-[10px] font-mono text-[#7B859C] font-semibold">3200 / 4000 {t.stepsShort}</span>
              <span className="px-2.5 py-0.5 text-[9px] font-bold text-[#D1AF47] bg-[#D1AF47]/10 border border-[#D1AF47]/20 rounded-full">2 {t.daysLeft}</span>
            </div>
          </div>

        </div>

      </div>

      {/* ========================================== */}
      {/* RIGHT SIDEBAR (1/4 Width)                  */}
      {/* ========================================== */}
      <div className="space-y-8">
        
        {/* ── TOP UTILITIES CARD ── */}
        <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl space-y-5">
          <div className={`flex justify-between items-center ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            {/* Language Switcher */}
            <button
              onClick={handleLocalLanguageToggle}
              className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-black text-[#B8C0D4] hover:text-white hover:border-[#D1AF47]/30 transition-all duration-300"
            >
              {locale === "en" ? "العربية" : "English"}
            </button>
            
            {/* User welcome & avatar */}
            <div className={`flex items-center gap-3.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={isRTL ? "text-left" : "text-right"}>
                <p className="text-[8px] text-[#7B859C] uppercase font-bold tracking-widest">{t.welcome}</p>
                <p className="text-xs font-black text-white">{businessName}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#111827] font-black text-xs flex items-center justify-center shadow-[0_0_15px_rgba(209,175,71,0.2)]">
                EB
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Link 
              href="/provider/calendar" 
              className="w-full py-3 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-black text-xs tracking-wider uppercase rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(209,175,71,0.2)] transition duration-300 hover:scale-[1.02] select-none"
            >
              {t.bookWalkIn}
            </Link>
          </div>
        </div>

        {/* ── FRIENDS (STAFF ROSTER) CARD ── */}
        <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[350px]">
          <div>
            <div className={`flex justify-between items-center mb-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-bold text-base text-white">{t.friends}</h3>
              <Link href="/provider/team" className="text-[10px] font-bold text-[#7B859C] hover:text-[#D1AF47] transition">
                {t.viewAll}
              </Link>
            </div>

            {/* Activities/Online Sub-tab switcher */}
            <div className={`flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05] gap-1 mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button className="flex-1 py-1.5 bg-[#D1AF47]/10 border border-[#D1AF47]/20 text-[#D1AF47] text-[10px] font-extrabold rounded-lg shadow-sm">
                {t.activities}
              </button>
              <button className="flex-1 py-1.5 text-[#7B859C] text-[10px] font-bold hover:text-white rounded-lg transition">
                {t.online}
              </button>
            </div>

            {/* Staff List */}
            <div className="space-y-4">
              {[
                { name: "Max Stone", task: "Beard Shave Specialist", avatar: "M", status: "online", activeGrad: "from-blue-500/20 to-blue-500/5" },
                { name: "Grisha Jack", task: "Hair Styling Specialist", avatar: "G", status: "busy", activeGrad: "from-[#D1AF47]/20 to-[#D1AF47]/5" },
                { name: "Levi Patrick", task: "Moroccan Bath Expert", avatar: "L", status: "online", activeGrad: "from-[#3DDC84]/20 to-[#3DDC84]/5" },
                { name: "Cody Bryan", task: "Spa Therapy Specialist", avatar: "C", status: "offline", activeGrad: "from-[#FF5D73]/20 to-[#FF5D73]/5" }
              ].map((friend, idx) => (
                <div key={idx} className={`flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.02] transition-colors duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="relative">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1A2236] to-[#0D1422] border border-white/[0.06] text-[#D1AF47] font-black text-xs flex items-center justify-center shadow-inner">
                        {friend.avatar}
                      </div>
                      {/* Status indicator dot */}
                      <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-[#111827] ${
                        friend.status === "online" ? "bg-[#3DDC84] animate-pulse" : friend.status === "busy" ? "bg-[#F5B041]" : "bg-[#7B859C]"
                      }`} />
                    </div>
                    <div className={isRTL ? "text-right" : "text-left"}>
                      <h5 className="font-bold text-xs text-white">{friend.name}</h5>
                      <p className="text-[10px] text-[#7B859C] mt-0.5">{friend.task}</p>
                    </div>
                  </div>
                  
                  {/* Circular check/arrow action button */}
                  <button className="w-7 h-7 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-[#D1AF47]/40 hover:bg-[#D1AF47]/10 flex items-center justify-center text-[#B8C0D4] hover:text-[#D1AF47] transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LIVE MAP WIDGET ── */}
        <div className="bg-[#111827]/80 backdrop-blur-sm border border-white/[0.06] rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[200px] relative overflow-hidden group">
          <div className={`flex justify-between items-center mb-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="font-serif font-bold text-sm text-white">{t.liveMap}</h3>
            </div>
            <Link href="/provider/deliveries" className="text-[10px] font-bold text-[#7B859C] hover:text-[#D1AF47] transition">
              {t.view}
            </Link>
          </div>

          {/* Map canvas container */}
          <div className="h-32 rounded-2xl border border-white/[0.06] relative overflow-hidden bg-[#0A0D14]">
            {/* Simplified Vector Map background lines */}
            <svg className="absolute inset-0 w-full h-full opacity-10" fill="none" stroke="#FFFFFF" strokeWidth="1">
              <line x1="20" y1="0" x2="20" y2="128" />
              <line x1="80" y1="0" x2="80" y2="128" />
              <line x1="180" y1="0" x2="180" y2="128" />
              <line x1="0" y1="30" x2="256" y2="30" />
              <line x1="0" y1="90" x2="256" y2="90" />
              <circle cx="100" cy="60" r="40" />
            </svg>

            {/* Interactive pulsing map markers */}
            <div className="absolute top-1/4 left-1/3">
              <span className="relative flex h-8 w-8">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D1AF47] opacity-40" />
                <div className="relative w-8 h-8 rounded-full border border-[#D1AF47]/40 bg-gradient-to-tr from-[#1A2236] to-[#0D1422] flex items-center justify-center text-[8px] font-bold text-[#D1AF47]">
                  M
                </div>
              </span>
            </div>

            <div className="absolute bottom-1/4 right-1/4">
              <span className="relative flex h-8 w-8">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-40" />
                <div className="relative w-8 h-8 rounded-full border border-[#3DDC84]/40 bg-gradient-to-tr from-[#1A2236] to-[#0D1422] flex items-center justify-center text-[8px] font-bold text-[#3DDC84]">
                  L
                </div>
              </span>
            </div>

            {/* Gold play button trigger overlay */}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/10 transition-colors duration-300">
              <Link href="/provider/deliveries" className="w-10 h-10 rounded-full bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] flex items-center justify-center shadow-[0_0_15px_rgba(209,175,71,0.4)] hover:scale-110 transition duration-300">
                <svg className="w-4 h-4 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
