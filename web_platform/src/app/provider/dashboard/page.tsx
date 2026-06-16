"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const translations = {
  en: {
    dashboard: "Operations Control Center",
    welcome: "Welcome back,",
    searchPlaceholder: "Search operations, staff, or bookings...",
    bookWalkIn: "Book Walk-In",
    walkInQueue: "Walk-In Queue",
    ongoingAppts: "Ongoing Appointments",
    upcomingTimeline: "Upcoming Timeline",
    prayerLockStatus: "Prayer Lock Status",
    currentPrayerStatus: "Current Status",
    nextPrayer: "Next Prayer",
    prayerStartsIn: "Prayer Starts In",
    lockStartsIn: "Booking Lock Starts In",
    prayerDuration: "Prayer Duration",
    autoResume: "Auto Resume",
    bookingsAffected: "Bookings Affected",
    staffAffected: "Staff Affected",
    roomsAffected: "Rooms Affected",
    prayerImpact: "Prayer Impact Analytics",
    shiftedBookings: "Shifted Bookings",
    revenueImpact: "Revenue Impact",
    utilizationImpact: "Utilization Impact",
    autoRecs: "Auto-Scheduling Recommendations",
    timelineFajr: "Fajr",
    timelineDhuhr: "Dhuhr",
    timelineAsr: "Asr",
    timelineMaghrib: "Maghrib",
    timelineIsha: "Isha",
    revenueToday: "Revenue Today",
    activeBookings: "Active Bookings",
    availableStaff: "Available Staff",
    occupancyRate: "Occupancy Rate",
    custSatisfaction: "Customer Satisfaction",
    prayerCountdown: "Prayer Countdown",
    kpiStripRevenue: "Revenue",
    kpiStripBookings: "Bookings",
    kpiStripCustomers: "Customers",
    kpiStripServices: "Services",
    kpiStripRooms: "Rooms",
    kpiStripReviews: "Reviews",
    kpiStripOccupancy: "Occupancy",
    kpiStripStaffOnline: "Staff Online",
    kpiStripWalkins: "Walk-ins",
    kpiStripAvgTicket: "Avg Ticket",
    staffPerfCenter: "Staff Performance Center",
    leaderboard: "Leaderboard",
    attendance: "Attendance",
    prayerBreakImpact: "Prayer Break Impact",
    revenueGen: "Revenue Generated",
    bookingsComp: "Bookings Completed",
    rating: "Rating",
    utilization: "Utilization",
    noShows: "No Shows",
    serviceIntel: "Service Intelligence & Utilization",
    custIntel: "Customer Intelligence & Demographics",
    newCusts: "New Customers",
    retCusts: "Returning Customers",
    vipCusts: "VIP Customers",
    membershipHolders: "Membership Holders",
    clv: "Customer Lifetime Value",
    repeatRate: "Repeat Rate",
    liveMap: "Geofenced Fleet Tracker",
    geofenceRadius: "Geofence Radius",
    travelTime: "Avg Travel Time",
    mobileStaff: "Mobile Staff Locations",
    bookingMgmt: "Booking Dispatch Board",
    vipBookings: "VIP Bookings",
    cancelledBookings: "Cancelled Bookings",
    delayedBookings: "Delayed Bookings",
    revenueCommand: "Revenue Command Center",
    revWeek: "Revenue This Week",
    revMonth: "Revenue This Month",
    revPerStaff: "Revenue Per Staff",
    revPerService: "Revenue Per Service",
    revGrowth: "Revenue Growth",
    peakHours: "Peak Booking Hours",
    staffForecast: "Staff Capacity Forecast",
    roomUtil: "Room Utilization",
    prodConsumption: "Product Consumption",
    marketingPerf: "Marketing Campaigns",
    referralTracking: "Referral Tracking",
    reviewAnalytics: "Review Sentiment",
    active: "Active",
    online: "Online",
    completed: "Completed",
    monthly: "Monthly"
  },
  ar: {
    dashboard: "مركز التحكم بالعمليات",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث في العمليات، الموظفين، أو الحجوزات...",
    bookWalkIn: "حجز عميل حضور",
    walkInQueue: "طابور الحضور",
    ongoingAppts: "المواعيد الجارية حالياً",
    upcomingTimeline: "المخطط الزمني القادم",
    prayerLockStatus: "حالة إغلاق أوقات الصلاة",
    currentPrayerStatus: "الحالة الحالية",
    nextPrayer: "الصلاة القادمة",
    prayerStartsIn: "تبدأ الصلاة خلال",
    lockStartsIn: "يبدأ إغلاق الحجز خلال",
    prayerDuration: "مدة الصلاة",
    autoResume: "الاستئناف التلقائي",
    bookingsAffected: "الحجوزات المتأثرة",
    staffAffected: "الموظفين المتأثرين",
    roomsAffected: "الغرف المتأثرة",
    prayerImpact: "تحليلات تأثير أوقات الصلاة",
    shiftedBookings: "الحجوزات التي تم ترحيلها",
    revenueImpact: "التأثير المالي",
    utilizationImpact: "تأثير نسبة الإشغال",
    autoRecs: "توصيات الجدولة التلقائية",
    timelineFajr: "الفجر",
    timelineDhuhr: "الظهر",
    timelineAsr: "العصر",
    timelineMaghrib: "المغرب",
    timelineIsha: "العشاء",
    revenueToday: "إيرادات اليوم",
    activeBookings: "الحجوزات النشطة",
    availableStaff: "الموظفين المتاحين",
    occupancyRate: "معدل الإشغال",
    custSatisfaction: "رضا العملاء",
    prayerCountdown: "تنازلي الصلاة",
    kpiStripRevenue: "الإيرادات",
    kpiStripBookings: "الحجوزات",
    kpiStripCustomers: "العملاء",
    kpiStripServices: "الخدمات",
    kpiStripRooms: "الغرف",
    kpiStripReviews: "التقييمات",
    kpiStripOccupancy: "الإشغال",
    kpiStripStaffOnline: "الموظفين المتصلين",
    kpiStripWalkins: "حجوزات الحضور",
    kpiStripAvgTicket: "متوسط الفاتورة",
    staffPerfCenter: "مركز أداء وتفاعل الموظفين",
    leaderboard: "لوحة الصدارة",
    attendance: "نسبة الحضور",
    prayerBreakImpact: "تأثير استراحة الصلاة",
    revenueGen: "الإيرادات المحققة",
    bookingsComp: "الحجوزات المكتملة",
    rating: "التقييم",
    utilization: "معدل الاستخدام",
    noShows: "عدم الحضور",
    serviceIntel: "تحليلات أداء واستخدام الخدمات",
    custIntel: "تحليلات ورضا العملاء",
    newCusts: "العملاء الجدد",
    retCusts: "العملاء المتكررون",
    vipCusts: "عملاء VIP",
    membershipHolders: "حاملو الاشتراكات",
    clv: "القيمة الدائمة للعميل",
    repeatRate: "معدل العودة",
    liveMap: "متتبع أسطول الخدمة المنزلية",
    geofenceRadius: "نطاق التغطية الجغرافية",
    travelTime: "متوسط وقت السفر",
    mobileStaff: "مواقع الموظفين الميدانيين",
    bookingMgmt: "لوحة توجيه الحجوزات العامة",
    vipBookings: "حجوزات VIP",
    cancelledBookings: "الحجوزات الملغاة",
    delayedBookings: "الحجوزات المتأخرة",
    revenueCommand: "مركز القيادة المالية",
    revWeek: "إيرادات هذا الأسبوع",
    revMonth: "إيرادات هذا الشهر",
    revPerStaff: "الإيرادات لكل موظف",
    revPerService: "الإيرادات لكل خدمة",
    revGrowth: "معدل النمو المالي",
    peakHours: "ساعات الذروة للحجوزات",
    staffForecast: "توقعات طاقة الموظفين",
    roomUtil: "معدل استخدام الغرف",
    prodConsumption: "استهلاك المنتجات والمخزون",
    marketingPerf: "أداء الحملات التسويقية",
    referralTracking: "تتبع الإحالات",
    reviewAnalytics: "تحليل مشاعر المراجعات",
    active: "نشط",
    online: "متصل",
    completed: "مكتمل",
    monthly: "شهرياً"
  }
};

export default function ProviderDashboardPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [searchQuery, setSearchQuery] = useState("");
  const [businessName, setBusinessName] = useState("Elite Barbershop");
  const [selectedBranch, setSelectedBranch] = useState("riyadh_central");

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

  // Dynamic values
  const [statsData, setStatsData] = useState({
    totalBookings: 9178,
    targetBookings: 10000,
    totalTimeHours: 748,
    activePercentage: 45
  });

  // Fetch provider title from Supabase
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

  // Live countdown timer for Asr prayer in Riyadh
  const [secondsLeft, setSecondsLeft] = useState(4354); // 01:12:34
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 4354));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const lockSeconds = Math.max(0, secondsLeft - 1200); // Lock starts 20 minutes before

  return (
    <div className={`space-y-8 font-sans bg-[#F7F7F5] min-h-screen text-[#101828] ${isRTL ? "rtl text-right" : "ltr text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* 1. TOP HEADER                                          */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className={`bg-white border border-[#EAEAEA] rounded-[24px] p-5 shadow-[0_12px_30px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-5`}>
        
        {/* Branch Selector & Name */}
        <div className={`flex items-center gap-4 w-full md:w-auto ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#101828] font-black text-sm flex items-center justify-center shadow-[0_0_20px_rgba(209,175,71,0.15)] flex-shrink-0">
            EB
          </div>
          <div className={isRTL ? "text-right" : "text-left"}>
            <h2 className="text-lg font-serif font-black text-[#101828]">{businessName}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="text-[10px] font-bold text-[#667085] bg-transparent outline-none cursor-pointer border-none p-0"
              >
                <option value="riyadh_central">{isRTL ? "فرع الرياض الرئيسي" : "Riyadh Central Branch"}</option>
                <option value="jeddah_corniche">{isRTL ? "فرع كورنيش جدة" : "Jeddah Corniche Branch"}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Global Search */}
        <div className={`flex items-center gap-3 bg-[#F7F7F5] border border-[#EAEAEA] px-4 py-2.5 rounded-2xl w-full md:w-80 focus-within:border-[#D1AF47]/40 transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          <svg className="w-4 h-4 text-[#667085] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`bg-transparent border-none outline-none text-xs w-full text-[#101828] placeholder-[#667085]/55 ${isRTL ? "text-right" : "text-left"}`}
          />
        </div>

        {/* Action controls */}
        <div className={`flex items-center gap-4 w-full md:w-auto justify-end ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          {/* Quick Walkin booking button */}
          <Link
            href="/provider/calendar"
            className="px-5 py-2.5 bg-[#D1AF47] hover:bg-[#E0C46A] text-white text-xs font-bold rounded-xl shadow-md shadow-[#D1AF47]/10 hover:scale-[1.02] transition duration-300"
          >
            + {t.bookWalkIn}
          </Link>

          {/* Quick utility icons */}
          <div className="flex items-center gap-2">
            {/* Lang switcher */}
            <button
              onClick={() => {
                const target = locale === "en" ? "ar" : "en";
                document.documentElement.lang = target;
                document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
                setLocale(target);
              }}
              className="p-2.5 rounded-xl border border-[#EAEAEA] bg-white hover:bg-[#F7F7F5] transition duration-300 text-xs font-bold text-[#667085]"
            >
              {locale === "en" ? "العربية" : "EN"}
            </button>

            {/* Notifications */}
            <button className="p-2.5 rounded-xl border border-[#EAEAEA] bg-white hover:bg-[#F7F7F5] text-[#667085] transition duration-300 relative">
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#EF4444]" />
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Dark mode toggle */}
            <button className="p-2.5 rounded-xl border border-[#EAEAEA] bg-white hover:bg-[#F7F7F5] text-[#667085] transition duration-300">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
              </svg>
            </button>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 2. COMPACT KPI STRIP                                   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.04)] overflow-x-auto">
        <div className="flex items-center justify-between min-w-[1000px] divide-x divide-[#EAEAEA] rtl:divide-x-reverse">
          {[
            { label: t.kpiStripRevenue, val: "128,450 SAR", change: "+12%", trend: "up" },
            { label: t.kpiStripBookings, val: "9,178", change: "+8%", trend: "up" },
            { label: t.kpiStripCustomers, val: "1,248", change: "+48", trend: "up" },
            { label: t.kpiStripServices, val: "24 Active", change: "+2", trend: "up" },
            { label: t.kpiStripRooms, val: "8 Slots", change: "Full", trend: "neutral" },
            { label: t.kpiStripReviews, val: "4.8 ★", change: "+0.2", trend: "up" },
            { label: t.kpiStripOccupancy, val: "78.4%", change: "-2%", trend: "down" },
            { label: t.kpiStripStaffOnline, val: "4 / 6 On", change: "Active", trend: "up" },
            { label: t.kpiStripWalkins, val: "12 Today", change: "+4", trend: "up" },
            { label: "Avg Ticket", val: "138 SAR", change: "Stable", trend: "neutral" }
          ].map((item, idx) => (
            <div key={idx} className="flex-1 px-4 text-center first:pl-0 last:pr-0">
              <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider block">{item.label}</span>
              <span className="text-sm font-serif font-black text-[#101828] mt-1 block">{item.val}</span>
              <span className={`text-[9px] font-bold mt-0.5 block ${
                item.trend === "up" ? "text-[#22C55E]" : item.trend === "down" ? "text-[#EF4444]" : "text-[#F59E0B]"
              }`}>
                {item.change}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 3. ROW 1: STATUS SUMMARY ROW                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: t.revenueToday, val: "4,250 SAR", detail: "+15% vs yesterday", border: "border-l-4 border-l-[#D1AF47]" },
          { label: t.activeBookings, val: "18 Bookings", detail: "4 in progress now", border: "border-l-4 border-l-[#22C55E]" },
          { label: t.availableStaff, val: "4 / 6 Online", detail: "2 on custom breaks", border: "border-l-4 border-l-[#22C55E]" },
          { label: t.occupancyRate, val: "82% Current", detail: "Peak: 90% at 5PM", border: "border-l-4 border-l-[#F59E0B]" },
          { label: t.custSatisfaction, val: "98.2%", detail: "From 42 ratings", border: "border-l-4 border-l-[#D1AF47]" },
          { label: t.prayerCountdown, val: formatTime(secondsLeft), detail: "Asr Prayer Lock", border: "border-l-4 border-l-[#EF4444]" }
        ].map((card, idx) => (
          <div key={idx} className={`bg-white border border-[#EAEAEA] rounded-[20px] p-4.5 shadow-[0_12px_30px_rgba(0,0,0,0.04)] flex flex-col justify-between ${card.border}`}>
            <span className="text-[10px] uppercase font-black tracking-wider text-[#667085]">{card.label}</span>
            <div className="mt-2.5">
              <span className="text-lg font-serif font-black text-[#101828] block">{card.val}</span>
              <span className="text-[9px] text-[#667085] font-semibold mt-0.5 block">{card.detail}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 4. ROW 2: OPERATIONS CHART & TODAY'S OPERATIONS CENTER  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left (70%): Large Analytics Chart */}
        <div className="lg:col-span-8 bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-serif font-black text-lg text-[#101828]">Executive Revenue & Load Forecast</h3>
              <p className="text-xs text-[#667085] font-medium mt-0.5">Real-time scheduling load vectors against projected capacity</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7F7F5] border border-[#EAEAEA] text-[10px] text-[#667085] font-bold cursor-pointer hover:border-[#D1AF47]/30 transition duration-300">
              <span>{t.monthly}</span>
              <svg className="w-3.5 h-3.5 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* SVG Complex Curve Chart */}
          <div className="relative w-full h-48 mt-4">
            <svg viewBox="0 0 600 150" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#D1AF47" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="secGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Gridlines */}
              <line x1="0" y1="30" x2="600" y2="30" stroke="#F0F0F0" strokeWidth="1" />
              <line x1="0" y1="75" x2="600" y2="75" stroke="#F0F0F0" strokeWidth="1" />
              <line x1="0" y1="120" x2="600" y2="120" stroke="#F0F0F0" strokeWidth="1" />

              {/* Area 1: Actual Revenue */}
              <path
                d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50 L 600,150 L 10,150 Z"
                fill="url(#chartGlow)"
              />
              
              {/* Curve 1: Actual Revenue */}
              <path
                d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50"
                fill="none"
                stroke="#D1AF47"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Curve 2: Projection / Booking Load */}
              <path
                d="M 10,125 C 80,110 160,85 230,75 C 300,65 380,105 450,65 C 520,35 550,45 600,20"
                fill="none"
                stroke="#22C55E"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />

              {/* Target vertical indicator */}
              <g>
                <line x1="230" y1="55" x2="230" y2="150" stroke="#D1AF47" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx="230" cy="55" r="6" fill="white" stroke="#D1AF47" strokeWidth="2.5" />
                <circle cx="230" cy="55" r="2" fill="#D1AF47" />
              </g>
            </svg>
          </div>

          {/* Month Labels */}
          <div className={`flex justify-between text-[10px] font-black text-[#667085] uppercase tracking-wider px-2 mt-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span>Jan</span><span>Feb</span><span>Mar</span><span className="text-[#D1AF47] bg-[#F7EBC3] px-3 py-1 rounded-full border border-[#D1AF47]/20">Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span>
          </div>

        </div>

        {/* Right (30%): Today's Operations Center */}
        <div className="lg:col-span-4 bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[400px]">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">Today's Operations</h3>
              <span className="px-2 py-0.5 bg-[#22C55E]/10 text-[#22C55E] text-[9px] font-black uppercase rounded-full">Live Monitor</span>
            </div>

            <div className="space-y-4">
              {/* Ongoing Appointment */}
              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl relative overflow-hidden">
                <span className="text-[8px] uppercase font-black text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full absolute top-3 right-3">Ongoing</span>
                <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider block">{t.ongoingAppts}</span>
                <h4 className="font-bold text-xs text-[#101828] mt-1.5">Max Stone - Barber Chair 1</h4>
                <p className="text-[10px] text-[#667085] mt-0.5 font-semibold">Haircut + Beard (Finishing in 12m)</p>
              </div>

              {/* Next Upcoming */}
              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl">
                <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider block">Next Appointment</span>
                <h4 className="font-bold text-xs text-[#101828] mt-1.5">Grisha Jack - Room 2</h4>
                <p className="text-[10px] text-[#667085] mt-0.5 font-semibold">Moroccan Bath (Starts in 18m)</p>
              </div>

              {/* Walkin Queue */}
              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl">
                <div className={`flex justify-between items-center ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider">{t.walkInQueue}</span>
                  <span className="text-[9px] font-bold text-[#D1AF47]">3 Waiting</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className={`flex justify-between items-center text-[10px] font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-[#101828]">1. Khalid Yasin (Beard Trim)</span>
                    <span className="text-[#F59E0B]">Waiting 12m</span>
                  </div>
                  <div className={`flex justify-between items-center text-[10px] font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-[#101828]">2. Fahad Al-Qahtani (Massage)</span>
                    <span className="text-[#667085]">Waiting 4m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#EAEAEA] flex items-center justify-between text-xs font-bold text-[#667085]">
            <span>Today's Total: 12 Walk-ins</span>
            <Link href="/provider/calendar" className="text-[#D1AF47] hover:underline">Manage Queue →</Link>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 5. ROW 3: STAFF & SERVICE INTELLIGENCE CONTROL CENTER    */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Column 1: Staff Performance Center */}
        <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">{t.staffPerfCenter}</h3>
              <Link href="/provider/team" className="text-xs font-bold text-[#D1AF47]">{t.leaderboard}</Link>
            </div>

            <div className="space-y-4">
              {[
                { name: "Max Stone", score: "96.4%", bookings: 42, rating: "4.9", rev: "18,450 SAR" },
                { name: "Levi Patrick", score: "92.1%", bookings: 36, rating: "4.8", rev: "14,200 SAR" },
                { name: "Grisha Jack", score: "88.5%", bookings: 28, rating: "4.7", rev: "11,800 SAR" }
              ].map((staff, idx) => (
                <div key={idx} className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-xs text-[#101828]">{staff.name}</h5>
                    <p className="text-[10px] text-[#667085] mt-0.5 font-semibold">
                      {staff.bookings} Bookings | Rating: {staff.rating} ★
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-serif font-black text-[#101828] block">{staff.rev}</span>
                    <span className="text-[9px] text-[#22C55E] font-bold block mt-0.5">Util: {staff.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>Online: 4 staff members</span>
            <span>Total Breaks Today: 40 mins</span>
          </div>
        </div>

        {/* Column 2: Service Intelligence & Utilization */}
        <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">{t.serviceIntel}</h3>
              <span className="text-xs font-bold text-[#667085]">Avg Load: 72%</span>
            </div>

            <div className="space-y-4">
              {[
                { name: "Hair Styling", count: "36 bookings", pct: "75%", val: "75" },
                { name: "Moroccan Bath", count: "28 bookings", pct: "85%", val: "85" },
                { name: "Spa Therapy", count: "12 bookings", pct: "40%", val: "40" }
              ].map((serv, idx) => (
                <div key={idx} className="space-y-2">
                  <div className={`flex justify-between text-[11px] font-bold ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <span className="text-[#101828] font-serif">{serv.name}</span>
                    <span className="text-[#D1AF47]">{serv.count} ({serv.pct})</span>
                  </div>
                  <div className="h-2 w-full bg-[#F7F7F5] rounded-full overflow-hidden border border-[#EAEAEA]">
                    <div className="h-full bg-[#D1AF47] rounded-full" style={{ width: `${serv.val}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>Least Booked: Grooming Stations</span>
            <Link href="/provider/services" className="text-[#D1AF47] hover:underline">Manage Services →</Link>
          </div>
        </div>

        {/* Column 3: Customer Intelligence & Demographics */}
        <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">{t.custIntel}</h3>
              <span className="px-2 py-0.5 bg-[#D1AF47]/10 text-[#D1AF47] text-[9px] font-black uppercase rounded-full">CRM Info</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl text-center">
                <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider block">{t.newCusts}</span>
                <span className="text-lg font-serif font-black text-[#101828] mt-1 block">428</span>
                <span className="text-[9px] text-[#22C55E] font-bold mt-0.5 block">+18% MoM</span>
              </div>
              
              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl text-center">
                <span className="text-[9px] uppercase font-black text-[#667085] tracking-wider block">{t.retCusts}</span>
                <span className="text-lg font-serif font-black text-[#101828] mt-1 block">820</span>
                <span className="text-[9px] text-[#22C55E] font-bold mt-0.5 block">65.7% Repeat</span>
              </div>

              <div className="p-3 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl text-center col-span-2">
                <div className={`flex justify-between items-center text-[10px] font-bold text-[#667085] ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <span>{t.vipCusts}: 82 Members</span>
                  <span className="text-[#D1AF47]">CLV: 2,450 SAR</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>Repeat rate is up 4.2%</span>
            <Link href="/provider/customers" className="text-[#D1AF47] hover:underline">View CRM Directory →</Link>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 6. ROW 4: PLATFORM SCHEDULER & PRAYER INTELLIGENCE      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left (60%): Live Operations Timeline */}
        <div className="lg:col-span-7 bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[450px]">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">{t.bookingMgmt}</h3>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-[#667085] bg-[#F7F7F5] border border-[#EAEAEA] px-2 py-0.5 rounded">Riyadh Central</span>
              </div>
            </div>

            {/* List of active schedules */}
            <div className="space-y-3">
              {[
                { time: "02:30 PM", client: "Yousif Al-Harbi", service: "Moroccan Royal Bath", staff: "Levi Patrick", status: "Active", bg: "bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]" },
                { time: "03:15 PM", client: "Fahad bin Salman", service: "Beard Reshaping", staff: "Max Stone", status: "Delayed", bg: "bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]" },
                { time: "04:30 PM", client: "Abdulrahman Saud", service: "Spa Massage", staff: "Cody Bryan", status: "VIP Booking", bg: "bg-[#D1AF47]/10 border-[#D1AF47]/30 text-[#D1AF47]" },
                { time: "05:00 PM", client: "Nasser Al-Ghamdi", service: "Haircut & Styling", staff: "Grisha Jack", status: "Pending", bg: "bg-[#667085]/10 border-[#E8E8E8] text-[#667085]" }
              ].map((booking, idx) => (
                <div key={idx} className={`p-3.5 bg-white border border-[#EAEAEA] rounded-2xl flex items-center justify-between gap-4 group hover:border-[#D1AF47]/30 transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex items-center gap-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="px-2.5 py-1.5 bg-[#F7F7F5] border border-[#EAEAEA] text-[#101828] font-bold text-[10px] rounded-xl flex-shrink-0">
                      {booking.time}
                    </div>
                    <div className={isRTL ? "text-right" : "text-left"}>
                      <h5 className="font-serif font-black text-sm text-[#101828]">{booking.client}</h5>
                      <p className="text-[10px] text-[#667085] mt-0.5 font-semibold">{booking.service} • Specialist: {booking.staff}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-full border ${booking.bg} flex-shrink-0`}>
                    {booking.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[#EAEAEA] flex items-center justify-between text-xs font-bold text-[#667085]">
            <span>Active Scheduler Status: Operational</span>
            <Link href="/provider/bookings" className="text-[#D1AF47] hover:underline">Open Scheduler Console →</Link>
          </div>
        </div>

        {/* Right (40%): Prayer Intelligence Center */}
        <div className="lg:col-span-5 bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[450px]">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">Prayer Operations Control</h3>
              <span className="px-2.5 py-0.5 bg-[#EF4444]/10 text-[#EF4444] text-[9px] font-black uppercase rounded-full border border-[#EF4444]/20">Lock Pending</span>
            </div>

            {/* Core Prayer Countdown & Info */}
            <div className="p-4 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl space-y-4">
              <div className={`flex justify-between items-center ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div>
                  <span className="text-[9px] uppercase font-black text-[#667085] block">{t.nextPrayer}</span>
                  <span className="text-xl font-serif font-black text-[#101828] mt-1 block">Asr (Riyadh)</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase font-black text-[#667085] block">{t.prayerStartsIn}</span>
                  <span className="text-xl font-serif font-black text-[#EF4444] mt-1 block">{formatTime(secondsLeft)}</span>
                </div>
              </div>

              {/* Progress bar to next prayer */}
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-[#E8E8E8] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#D1AF47] to-[#EF4444] rounded-full" style={{ width: `${((4354 - secondsLeft) / 4354) * 100}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#EAEAEA]/80">
                <div>
                  <span className="text-[8px] uppercase font-black text-[#667085] block">{t.lockStartsIn}</span>
                  <span className="text-xs font-serif font-black text-[#F59E0B] mt-0.5 block">{formatTime(lockSeconds)}</span>
                </div>
                <div>
                  <span className="text-[8px] uppercase font-black text-[#667085] block">{t.autoResume}</span>
                  <span className="text-xs font-serif font-black text-[#22C55E] mt-0.5 block">04:15 PM</span>
                </div>
              </div>
            </div>

            {/* Shift & Block Impacts */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="p-2.5 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl text-center">
                <span className="text-[8px] uppercase font-black text-[#667085] block">{t.bookingsAffected}</span>
                <span className="text-sm font-serif font-black text-[#EF4444] mt-0.5 block">3</span>
              </div>
              <div className="p-2.5 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl text-center">
                <span className="text-[8px] uppercase font-black text-[#667085] block">{t.staffAffected}</span>
                <span className="text-sm font-serif font-black text-[#F59E0B] mt-0.5 block">2</span>
              </div>
              <div className="p-2.5 bg-[#F7F7F5] border border-[#EAEAEA] rounded-xl text-center">
                <span className="text-[8px] uppercase font-black text-[#667085] block">{t.roomsAffected}</span>
                <span className="text-sm font-serif font-black text-[#101828] mt-0.5 block">1</span>
              </div>
            </div>

            {/* Daily Prayer Timeline */}
            <div className={`mt-5 flex items-center justify-between relative px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              {/* Timeline Connector Line */}
              <div className="absolute top-[13px] left-8 right-8 h-0.5 bg-gray-200 z-0" />
              {[
                { name: t.timelineFajr, time: "04:10 AM", completed: true, active: false },
                { name: t.timelineDhuhr, time: "12:20 PM", completed: true, active: false },
                { name: t.timelineAsr, time: "03:40 PM", completed: false, active: true },
                { name: t.timelineMaghrib, time: "06:50 PM", completed: false, active: false },
                { name: t.timelineIsha, time: "08:20 PM", completed: false, active: false }
              ].map((p, idx) => (
                <div key={idx} className="flex flex-col items-center relative z-10">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                    p.completed
                      ? "bg-[#22C55E] border-[#22C55E] text-white"
                      : p.active
                      ? "bg-white border-[#D1AF47] text-[#D1AF47] shadow-lg animate-pulse"
                      : "bg-[#F7F7F5] border-gray-200 text-gray-400"
                  }`}>
                    {p.completed ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className="text-[9px] font-black">{idx + 1}</span>
                    )}
                  </div>
                  <span className="text-[9px] font-extrabold text-[#101828] mt-1.5">{p.name}</span>
                  <span className="text-[7px] text-[#667085] font-semibold mt-0.5">{p.time}</span>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            <div className="mt-5 p-3 bg-[#F4E7B6]/20 border border-[#D1AF47]/30 rounded-xl">
              <span className="text-[9px] uppercase font-black text-[#B8952E] block">{t.autoRecs}</span>
              <p className="text-[10px] text-[#101828] mt-1 font-semibold leading-relaxed">
                {isRTL 
                  ? "نقترح ترحيل حجز الساعة 03:30 م بمقدار 20 دقيقة إلى 03:50 م لتفادي تعارض صلاة العصر." 
                  : "Shift 03:30 PM appointment by +20 minutes to 03:50 PM to bypass Asr prayer lock."}
              </p>
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>{t.shiftedBookings}: 3 today</span>
            <span>{t.revenueImpact}: 0 SAR</span>
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* 7. ROW 5: BUSINESS RELATIONSHIPS GRID & GEOMAP TRACKER   */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Linked Business Relationship grid */}
        <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">Linked Business Operations Matrix</h3>
              <span className="px-2 py-0.5 bg-[#F7EBC3] text-[#B8952E] text-[9px] font-black uppercase rounded-full border border-[#D1AF47]/20">Active Matrix</span>
            </div>

            <div className="space-y-4">
              {[
                { service: "Hair Styling & Design", staff: "4 Specialists", rooms: "2 Styling Stations", products: "Primora Styling Wax, Gold Serum", rev: "14,850 SAR", rating: "4.9 ★" },
                { service: "Moroccan Royal Bath", staff: "2 Specialists", rooms: "1 Hammam Chamber", products: "Moroccan Black Soap, Clay scrub", rev: "12,200 SAR", rating: "4.8 ★" }
              ].map((matrix, idx) => (
                <div key={idx} className="p-4 bg-[#F7F7F5] border border-[#EAEAEA] rounded-2xl space-y-3 hover:border-[#D1AF47]/30 transition duration-300">
                  <div className={`flex justify-between items-center ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                    <h5 className="font-serif font-black text-sm text-[#101828]">{matrix.service}</h5>
                    <span className="text-xs font-serif font-black text-[#D1AF47]">{matrix.rev}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-[#667085]">
                    <div className="p-2 bg-white rounded-xl border border-[#EAEAEA]">
                      <span className="block text-[8px] uppercase text-[#667085]">Staff Assigned</span>
                      <span className="text-[#101828] block mt-0.5">{matrix.staff}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-[#EAEAEA]">
                      <span className="block text-[8px] uppercase text-[#667085]">Rooms Assigned</span>
                      <span className="text-[#101828] block mt-0.5">{matrix.rooms}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-[#EAEAEA]">
                      <span className="block text-[8px] uppercase text-[#667085]">Avg Rating</span>
                      <span className="text-[#B8952E] block mt-0.5">{matrix.rating}</span>
                    </div>
                  </div>
                  <div className="text-[9px] font-semibold text-[#667085]">
                    <span className="font-bold text-[#101828]">Inventory Consumed: </span>{matrix.products}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>Linked metrics auto-update every 10 mins</span>
            <Link href="/provider/services" className="text-[#D1AF47] hover:underline">Configure Matrix →</Link>
          </div>
        </div>

        {/* Live Map Fleet tracker */}
        <div className="bg-white border border-[#EAEAEA] rounded-[24px] p-6 shadow-[0_12px_30px_rgba(0,0,0,0.08)] flex flex-col justify-between min-h-[350px]">
          <div>
            <div className={`flex justify-between items-center mb-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <h3 className="font-serif font-black text-base text-[#101828]">{t.liveMap}</h3>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 bg-[#F7F7F5] border border-[#EAEAEA] text-[#667085] text-[9px] font-black rounded">{t.geofenceRadius}: 15km</span>
                <span className="px-2 py-0.5 bg-[#F7F7F5] border border-[#EAEAEA] text-[#667085] text-[9px] font-black rounded">{t.travelTime}: 18 mins</span>
              </div>
            </div>

            {/* SVG Interactive Map Frame */}
            <div className="h-60 rounded-2xl border border-[#EAEAEA] relative overflow-hidden bg-[#F7F7F5]">
              <svg className="absolute inset-0 w-full h-full opacity-40" fill="none" stroke="#667085" strokeWidth="1">
                {/* Simulated Riyadh Ring Roads & highways */}
                <circle cx="150" cy="120" r="100" strokeDasharray="5 5" />
                <circle cx="150" cy="120" r="60" />
                <line x1="0" y1="120" x2="300" y2="120" />
                <line x1="150" y1="0" x2="150" y2="240" />
                <path d="M 30,30 Q 150,90 270,30" stroke="#D1AF47" strokeWidth="1.5" />
                {/* Riyadh Districts indicators */}
                <text x="180" y="50" fill="#667085" fontSize="8" fontWeight="bold">Al-Malqa</text>
                <text x="210" y="140" fill="#667085" fontSize="8" fontWeight="bold">Olaya</text>
                <text x="40" y="190" fill="#667085" fontSize="8" fontWeight="bold">Al-Yasmin</text>
              </svg>

              {/* Staff Coordinates Pin 1 */}
              <div className="absolute top-1/4 left-1/3">
                <span className="relative flex h-8 w-8">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D1AF47] opacity-60" />
                  <div className="relative w-8 h-8 rounded-full border-2 border-white bg-[#D1AF47] text-white shadow-md flex items-center justify-center text-[8px] font-black">
                    M
                  </div>
                </span>
                <div className="bg-white border border-[#EAEAEA] px-2 py-1 rounded-lg text-[7px] font-black shadow-sm mt-1 text-center whitespace-nowrap">
                  Max: Al-Malqa (In Venue)
                </div>
              </div>

              {/* Staff Coordinates Pin 2 */}
              <div className="absolute bottom-1/3 right-1/4">
                <span className="relative flex h-8 w-8">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-60" />
                  <div className="relative w-8 h-8 rounded-full border-2 border-white bg-[#22C55E] text-white shadow-md flex items-center justify-center text-[8px] font-black">
                    L
                  </div>
                </span>
                <div className="bg-white border border-[#EAEAEA] px-2 py-1 rounded-lg text-[7px] font-black shadow-sm mt-1 text-center whitespace-nowrap">
                  Levi: Olaya (Home Transit - 12m)
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-[#667085] font-semibold mt-4 pt-3 border-t border-[#EAEAEA] flex justify-between">
            <span>2 Mobile specialists active in field</span>
            <Link href="/provider/deliveries" className="text-[#D1AF47] hover:underline">Open Logistics Board →</Link>
          </div>
        </div>

      </div>

    </div>
  );
}
