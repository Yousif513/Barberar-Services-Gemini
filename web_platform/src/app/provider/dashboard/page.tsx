"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrayerTimes } from "@/lib/use-prayer-times";

// Destinations the provider header search can jump to.
const SEARCH_TARGETS: { en: string; ar: string; href: string }[] = [
  { en: "Bookings", ar: "الحجوزات", href: "/provider/bookings" },
  { en: "Calendar", ar: "التقويم", href: "/provider/calendar" },
  { en: "Employees & Staff", ar: "الموظفون والفريق", href: "/provider/team" },
  { en: "Services", ar: "الخدمات", href: "/provider/services" },
  { en: "Customers", ar: "العملاء", href: "/provider/customers" },
  { en: "Wallet & Payouts", ar: "المحفظة والمستحقات", href: "/provider/wallet" },
  { en: "Reports", ar: "التقارير", href: "/provider/reports" },
  { en: "Reviews", ar: "التقييمات", href: "/provider/reviews" },
  { en: "Promotions", ar: "العروض", href: "/provider/promotions" },
  { en: "Messages", ar: "الرسائل", href: "/provider/messages" },
  { en: "Packages", ar: "الباقات", href: "/provider/packages" },
  { en: "Settings", ar: "الإعدادات", href: "/provider/settings" },
];

const translations = {
  en: {
    branch: "Riyadh Central Branch", search: "Search operations, staff, bookings...",
    bookWalkIn: "Book Walk-In", lang: "العربية",
    revenue: "Revenue", bookings: "Bookings", customers: "Customers", occupancy: "Occupancy",
    staffOnline: "Staff Online", reviews: "Reviews", avgTicket: "Avg Ticket", walkins: "Walk-ins",
    revenueForecast: "Revenue & Load Forecast", forecastSub: "Real-time scheduling load against projected capacity", monthly: "Monthly",
    todaysOps: "Today's Operations", live: "Live", ongoing: "Ongoing", nextUp: "Next Appointment", walkInQueue: "Walk-In Queue", waiting: "Waiting", manageQueue: "Manage Queue",
    staffPerf: "Staff Performance", leaderboard: "Leaderboard", util: "Util",
    serviceIntel: "Service Intelligence", avgLoad: "Avg Load", manageServices: "Manage Services",
    prayerControl: "Prayer Operations Control", lockPending: "Lock Pending", nextPrayer: "Next Prayer", prayerIn: "Prayer in", lockIn: "Lock in", autoResume: "Auto Resume",
    bookingsAffected: "Bookings", staffAffected: "Staff", roomsAffected: "Rooms",
    demoData: "Unavailable",
    highLoad: "High",
    setupTitle: "Guided Setup Checklist",
    setupSubtitle: "Complete your salon onboarding setup to start receiving customer bookings.",
    setupCompleted: "Completed",
    stepHours: "Operating Hours",
    stepHoursDesc: "Set working shifts & prayer pause buffers",
    stepServices: "Services Menu",
    stepServicesDesc: "Add services, durations & prices in SAR",
    stepStaff: "Staff & Specialists",
    stepStaffDesc: "Invite staff and assign services",
    stepPolicy: "Cancellation Policy",
    stepPolicyDesc: "Review deposit and cancellation terms",
    stepShare: "Share Booking Link",
    stepShareDesc: "Promote your direct link for 0% commission",
    shareKitTitle: "Public Booking Link & Share Kit",
    shareKitDesc: "Clients booking via your personal link incur 0% platform fee.",
    copyLink: "Copy Link",
    copied: "Copied!",
    shareWhatsApp: "WhatsApp",
    shareInstagram: "Instagram Bio",
    qrTitle: "Scan & Book (QR)",
    valueSummaryTitle: "PRIMORA Brought You This Month",
    valueSummarySubtitle: "Real platform impact, client acquisition, and commission savings through direct channels.",
    newClientsAcquired: "New Clients Acquired",
    directLinkBookings: "Direct Link Bookings",
    totalGmv: "Total Gross Volume",
    commissionSaved: "0% Commission Saved",
    currency: "SAR",
  },
  ar: {
    branch: "فرع الرياض الرئيسي", search: "البحث في العمليات، الموظفين، الحجوزات...",
    bookWalkIn: "حجز حضور", lang: "EN",
    revenue: "الإيرادات", bookings: "الحجوزات", customers: "العملاء", occupancy: "الإشغال",
    staffOnline: "الموظفون المتصلون", reviews: "التقييمات", avgTicket: "متوسط الفاتورة", walkins: "حجوزات الحضور",
    revenueForecast: "توقعات الإيرادات والأحمال", forecastSub: "حمل الجدولة الحي مقابل السعة المتوقعة", monthly: "شهري",
    todaysOps: "عمليات اليوم", live: "مباشر", ongoing: "جارٍ", nextUp: "الموعد التالي", walkInQueue: "طابور الحضور", waiting: "بالانتظار", manageQueue: "إدارة الطابور",
    staffPerf: "أداء الموظفين", leaderboard: "الصدارة", util: "الاستخدام",
    serviceIntel: "ذكاء الخدمات", avgLoad: "متوسط الحمل", manageServices: "إدارة الخدمات",
    prayerControl: "التحكم بأوقات الصلاة", lockPending: "إغلاق معلق", nextPrayer: "الصلاة القادمة", prayerIn: "الصلاة خلال", lockIn: "الإغلاق خلال", autoResume: "الاستئناف",
    bookingsAffected: "حجوزات", staffAffected: "موظفون", roomsAffected: "غرف",
    demoData: "غير متاح",
    highLoad: "مرتفع",
    setupTitle: "دليل إعداد الصالون",
    setupSubtitle: "أكمل خطوات تأسيس الصالون للبدء في استقبال حجوزات العملاء.",
    setupCompleted: "مكتملة",
    stepHours: "أوقات الدوام والنوبات",
    stepHoursDesc: "حدد ساعات العمل وفترات أوقات الصلاة",
    stepServices: "قائمة الخدمات",
    stepServicesDesc: "أضف الخدمات والأسعار بالريال السعودي",
    stepStaff: "الأخصائيون وفريق العمل",
    stepStaffDesc: "عين الموظفين واربطهم بالخدمات",
    stepPolicy: "سياسة الإلغاء",
    stepPolicyDesc: "راجع شروط العربون والإلغاء",
    stepShare: "مشاركة رابط الحجز",
    stepShareDesc: "انشر رابطك الخاص بعمولة 0% للمنصة",
    shareKitTitle: "رابط الحجز المباشر وحزمة النشر",
    shareKitDesc: "الحجوزات عبر رابطك وقنواتك الخاصة معفاة تماماً من عمولة المنصة (0%).",
    copyLink: "نسخ الرابط",
    copied: "تم النسخ!",
    shareWhatsApp: "واتساب",
    shareInstagram: "بايو انستغرام",
    qrTitle: "رمز QR للحجز المباشر",
    valueSummaryTitle: "ما حققته لك بريمورا هذا الشهر",
    valueSummarySubtitle: "أثر المنصة الملموس في استقطاب عملاء جدد وتوفير العمولات عبر قنواتك المباشرة.",
    newClientsAcquired: "عملاء جدد مكتسبون",
    directLinkBookings: "حجوزات الروابط المباشرة",
    totalGmv: "إجمالي حجم المبيعات",
    commissionSaved: "وفورات العمولة (0%)",
    currency: "ريال",
  },
};

type DashboardStats = {
  revenue: number;
  bookings: number;
  customers: number;
  occupancy: number;
  activeStaff: number;
  totalStaff: number;
  avgRating: number;
  reviewCount: number;
  walkins: number;
  avgTicket: number;
};

const emptyDashboardStats: DashboardStats = {
  revenue: 0,
  bookings: 0,
  customers: 0,
  occupancy: 0,
  activeStaff: 0,
  totalStaff: 0,
  avgRating: 0,
  reviewCount: 0,
  walkins: 0,
  avgTicket: 0,
};

export default function ProviderDashboardPage() {
  const router = useRouter();
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [businessName, setBusinessName] = useState("Elite Barbershop");
  const [coords, setCoords] = useState({ lat: 24.7136, lng: 46.6753 });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(emptyDashboardStats);
  const [statsMode, setStatsMode] = useState<"loading" | "live" | "error">("loading");
  const [statsError, setStatsError] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [valueSummary, setValueSummary] = useState<{
    new_clients_acquired: number;
    marketplace_bookings: number;
    direct_link_bookings: number;
    total_gmv_sar: number;
    commission_saved_sar: number;
  } | null>(null);
  const [origin, setOrigin] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInstagram, setCopiedInstagram] = useState(false);
  const [setupState, setSetupState] = useState({
    hasHours: true,
    servicesCount: 3,
    staffCount: 4,
    hasPolicy: true,
    linkShared: false,
  });

  const isRTL = locale === "ar";
  const t = translations[locale];
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_TARGETS.filter((item) =>
      item.en.toLowerCase().includes(q) || item.ar.includes(searchQuery.trim())
    );
  }, [searchQuery]);

  const goToFirstResult = () => {
    if (searchResults.length) router.push(searchResults[0].href);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    const sync = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStatsMode("error");
          setStatsError(isRTL ? "يرجى تسجيل الدخول." : "Please sign in.");
          return;
        }
        const { data: provider } = await supabase
          .from("providers")
          .select("id, business_name_en, business_name_ar")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (provider) {
          setProviderId(provider.id);
          setBusinessName(isRTL ? provider.business_name_ar : provider.business_name_en);
          const { data: branches } = await supabase
            .from("branches")
            .select("id, latitude, longitude")
            .eq("provider_id", provider.id)
            .order("created_at", { ascending: true });
          const branch = branches?.[0];
          if (branch && branch.latitude && branch.longitude) {
            setCoords({ lat: Number(branch.latitude), lng: Number(branch.longitude) });
          }
          const branchIds = (branches || []).map((item) => item.id).filter(Boolean);
          if (branchIds.length === 0) {
            setDashboardStats(emptyDashboardStats);
            setSetupState({
              hasHours: false,
              servicesCount: 0,
              staffCount: 0,
              hasPolicy: true,
              linkShared: false,
            });
            setStatsMode("live");
            return;
          }

          const [bookingsResult, employeesResult, reviewsResult, servicesCountResult] = await Promise.all([
            supabase
              .from("bookings")
              .select("status, total_price, customer_id, is_home_service")
              .in("branch_id", branchIds),
            supabase
              .from("employees")
              .select("id, is_active")
              .in("branch_id", branchIds),
            supabase
              .from("reviews")
              .select("rating")
              .eq("provider_id", provider.id),
            supabase
              .from("services")
              .select("id", { count: "exact", head: true })
              .eq("provider_id", provider.id),
          ]);

          if (bookingsResult.error) throw bookingsResult.error;
          if (employeesResult.error) throw employeesResult.error;
          if (reviewsResult.error) throw reviewsResult.error;

          const bookings = bookingsResult.data || [];
          const employees = employeesResult.data || [];
          const reviews = reviewsResult.data || [];
          const completedBookings = bookings.filter((booking: any) => booking.status === "completed");
          const revenue = completedBookings.reduce((sum: number, booking: any) => sum + Number(booking.total_price || 0), 0);
          const activeWorkload = bookings.filter((booking: any) => booking.status === "confirmed" || booking.status === "pending_payment").length;
          const totalStaff = employees.length;
          const activeStaff = employees.filter((employee: any) => employee.is_active).length;
          const reviewCount = reviews.length;
          const avgRating = reviewCount ? reviews.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / reviewCount : 0;
          const uniqueCustomers = new Set(bookings.map((booking: any) => booking.customer_id).filter(Boolean)).size;
          const capacityBase = Math.max(activeStaff * 8, 1);

          setDashboardStats({
            revenue,
            bookings: bookings.length,
            customers: uniqueCustomers,
            occupancy: Math.min(100, (activeWorkload / capacityBase) * 100),
            activeStaff,
            totalStaff,
            avgRating,
            reviewCount,
            walkins: bookings.filter((booking: any) => !booking.is_home_service).length,
            avgTicket: completedBookings.length ? revenue / completedBookings.length : 0,
          });
          setSetupState({
            hasHours: branchIds.length > 0,
            servicesCount: servicesCountResult?.count || 0,
            staffCount: totalStaff,
            hasPolicy: true,
            linkShared: false,
          });
          setStatsMode("live");

          try {
            const { data: valData } = await supabase.rpc("get_provider_monthly_value_summary", {
              p_provider_id: provider.id,
              p_month_date: new Date().toISOString().split("T")[0],
            });
            if (valData && typeof valData === "object") {
              setValueSummary({
                new_clients_acquired: Number(valData.new_clients_acquired || 0),
                marketplace_bookings: Number(valData.marketplace_bookings || 0),
                direct_link_bookings: Number(valData.direct_link_bookings || 0),
                total_gmv_sar: Number(valData.total_gmv_sar || 0),
                commission_saved_sar: Number(valData.commission_saved_sar || 0),
              });
            }
          } catch (valErr) {
            console.warn("Could not load provider value summary:", valErr);
          }
        }
      } catch (err) {
        setDashboardStats(emptyDashboardStats);
        setStatsError(err instanceof Error ? err.message : String(err));
        setStatsMode("error");
      }
    }
    load();
  }, [isRTL]);

  const {
    nextPrayer,
    prevPrayer,
    secondsUntilNext,
    isLocked,
    resumesIn,
    lockStartsIn,
    currentTime
  } = usePrayerTimes(coords.lat, coords.lng);


  const toggleLang = () => {
    const target = locale === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLocale(target);
  };

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  const formatTime12h = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? (isRTL ? "م" : "PM") : (isRTL ? "ص" : "AM");
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const resumeTime = new Date(nextPrayer.time.getTime() + 30 * 60 * 1000);
  const prevTime = prevPrayer.time.getTime();
  const nextTime = nextPrayer.time.getTime();
  const totalGap = nextTime - prevTime || 1;
  const elapsed = currentTime.getTime() - prevTime;
  const progressPercent = Math.max(0, Math.min(100, (elapsed / totalGap) * 100));


  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:border-[#D1AF47]/20 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)]";
  const eyebrow = "text-xs font-extrabold uppercase tracking-widest text-[#667085]";
  const compactNumber = (value: number) => value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 0 });
  const money = (value: number) => `${compactNumber(value)} SAR`;
  const percent = (value: number) => `${value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", { maximumFractionDigits: 1 })}%`;

  const kpis = [
    { label: t.revenue, value: money(dashboardStats.revenue), change: statsMode === "live" ? t.live : t.demoData, tone: statsMode === "live" ? "text-[#22C55E]" : "text-[#D1AF47]" },
    { label: t.bookings, value: compactNumber(dashboardStats.bookings), change: statsMode === "live" ? t.live : t.demoData, tone: "text-[#22C55E]" },
    { label: t.customers, value: compactNumber(dashboardStats.customers), change: statsMode === "live" ? t.live : t.demoData, tone: "text-[#22C55E]" },
    { label: t.occupancy, value: percent(dashboardStats.occupancy), change: dashboardStats.occupancy > 85 ? t.highLoad : (locale === "ar" ? "مستقر" : "Stable"), tone: dashboardStats.occupancy > 85 ? "text-[#EF4444]" : "text-[#D1AF47]" },
    { label: t.staffOnline, value: `${dashboardStats.activeStaff} / ${dashboardStats.totalStaff}`, change: t.live, tone: "text-[#22C55E]" },
    { label: t.reviews, value: `${dashboardStats.avgRating.toFixed(1)} ★`, change: compactNumber(dashboardStats.reviewCount), tone: "text-[#22C55E]" },
    { label: t.walkins, value: compactNumber(dashboardStats.walkins), change: statsMode === "live" ? t.live : t.demoData, tone: "text-[#22C55E]" },
    { label: t.avgTicket, value: money(dashboardStats.avgTicket), change: locale === "ar" ? "مستقر" : "Stable", tone: "text-[#D1AF47]" },
  ];

  const bookingUrl = `${origin || "https://primora.sa"}/shop/${providerId || "elite-barbershop"}?source=link`;
  const qrUrl = `${origin || "https://primora.sa"}/shop/${providerId || "elite-barbershop"}?source=qr`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    isRTL
      ? `احجز موعدك مباشرة لدى ${businessName} عبر الرابط المعتمد: ${origin || "https://primora.sa"}/shop/${providerId || "elite-barbershop"}?source=whatsapp`
      : `Book your direct appointment with ${businessName}: ${origin || "https://primora.sa"}/shop/${providerId || "elite-barbershop"}?source=whatsapp`
  )}`;

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bookingUrl);
    }
    setCopiedLink(true);
    setSetupState((prev) => ({ ...prev, linkShared: true }));
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyInstagram = () => {
    const bioText = `🔗 Book online: ${origin || "https://primora.sa"}/shop/${providerId || "elite-barbershop"}?source=instagram`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(bioText);
    }
    setCopiedInstagram(true);
    setSetupState((prev) => ({ ...prev, linkShared: true }));
    setTimeout(() => setCopiedInstagram(false), 2500);
  };

  const setupSteps = [
    {
      id: "hours",
      title: t.stepHours,
      desc: t.stepHoursDesc,
      completed: setupState.hasHours,
      href: "/provider/calendar",
    },
    {
      id: "services",
      title: t.stepServices,
      desc: t.stepServicesDesc,
      completed: setupState.servicesCount > 0,
      href: "/provider/services",
    },
    {
      id: "staff",
      title: t.stepStaff,
      desc: t.stepStaffDesc,
      completed: setupState.staffCount > 0,
      href: "/provider/team",
    },
    {
      id: "policy",
      title: t.stepPolicy,
      desc: t.stepPolicyDesc,
      completed: setupState.hasPolicy,
      href: "/provider/settings",
    },
    {
      id: "share",
      title: t.stepShare,
      desc: t.stepShareDesc,
      completed: setupState.linkShared,
      href: "#share-kit",
    },
  ];
  const completedStepsCount = setupSteps.filter((s) => s.completed).length;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`relative flex min-h-full flex-col gap-4 p-1 pb-10 text-[#101828] font-sans ${isRTL ? "text-right" : "text-left"}`}>
      {/* HEADER */}
      <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className={`flex items-center gap-3 ${flip}`}>
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-xs font-black text-[#101828] shadow-[0_0_20px_rgba(209,175,71,0.18)]">EB</div>
          <div>
            <h1 className="font-serif text-lg font-black leading-tight lg:text-xl">{businessName}</h1>
            <div className={`flex items-center gap-1.5 ${flip}`}>
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <span className="text-[10px] font-bold text-gray-500">{t.branch}</span>
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-2.5 ${flip}`}>
          <div className="relative md:w-56">
            <label className={`flex items-center gap-2 rounded-full border border-[#ECECEC] bg-white px-3.5 py-2 shadow-sm ${flip}`}>
              <svg className="h-4 w-4 flex-shrink-0 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => { if (e.key === "Enter") { goToFirstResult(); setSearchOpen(false); } }}
                placeholder={t.search}
                className="w-full border-none bg-transparent text-xs text-[#101828] outline-none placeholder:text-[#667085]/60"
              />
            </label>
            {searchOpen && searchResults.length > 0 && (
              <div className={`absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_12px_40px_rgba(0,0,0,0.02)] ${isRTL ? "text-right" : "text-left"}`}>
                {searchResults.map((item) => (
                  <button
                    key={item.href}
                    onMouseDown={() => router.push(item.href)}
                    className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-[#101828] transition hover:bg-[#F9FAFB] ${flip}`}
                  >
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#D1AF47]" />
                    {isRTL ? item.ar : item.en}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={toggleLang} className="rounded-full border border-[#ECECEC] bg-white px-3.5 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">{t.lang}</button>
          <Link href="/provider/calendar" className="rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-4 py-2 text-xs font-black text-[#101828] shadow-md shadow-[#D1AF47]/10 transition hover:brightness-105">+ {t.bookWalkIn}</Link>
        </div>
      </header>

      {/* GUIDED SETUP CHECKLIST (P0-C G01) */}
      <section className={`${cardBase} p-5 border-[#D1AF47]/30 bg-gradient-to-r from-amber-500/[0.03] to-transparent`}>
        <div className={`flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${flip}`}>
          <div>
            <div className={`flex items-center gap-2 ${flip}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D1AF47] text-[11px] font-black text-black">✓</span>
              <h2 className="font-serif text-base font-black text-[#101828]">{t.setupTitle}</h2>
              <span className="rounded-full bg-[#D1AF47]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#8A6F1C]">
                {completedStepsCount} / {setupSteps.length} {t.setupCompleted}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#667085]">{t.setupSubtitle}</p>
          </div>
          <div className="w-full md:w-48">
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#ECECEC]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#22C55E] transition-all duration-500"
                style={{ width: `${(completedStepsCount / setupSteps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-5">
          {setupSteps.map((step, idx) => (
            <Link
              key={step.id}
              href={step.href}
              className={`group flex flex-col justify-between rounded-xl border p-3.5 transition-all hover:border-[#D1AF47] hover:shadow-sm ${
                step.completed
                  ? "border-[#22C55E]/30 bg-emerald-50/30"
                  : "border-[#ECECEC] bg-white hover:bg-[#FDFCF8]"
              }`}
            >
              <div>
                <div className={`flex items-center justify-between ${flip}`}>
                  <span className="text-[10px] font-bold text-gray-600">
                    {idx + 1}. {step.title}
                  </span>
                  {step.completed ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#22C55E] text-[9px] font-black text-white">✓</span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-[#667085] line-clamp-2">{step.desc}</p>
              </div>
              <span className={`mt-2 text-[10px] font-bold text-[#D1AF47] group-hover:underline ${isRTL ? "text-left" : "text-right"}`}>
                {step.completed ? (isRTL ? "تعديل ←" : "Edit →") : (isRTL ? "إعداد ←" : "Configure →")}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* PUBLIC BOOKING URL & SHARE KIT (P0-C G03) */}
      <section id="share-kit" className={`${cardBase} p-5 border-[#ECECEC] bg-white`}>
        <div className={`flex flex-col gap-2 md:flex-row md:items-start md:justify-between ${flip}`}>
          <div>
            <div className={`flex items-center gap-2 ${flip}`}>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">0% Commission</span>
              <h2 className="font-serif text-base font-black text-[#101828]">{t.shareKitTitle}</h2>
            </div>
            <p className="mt-1 text-xs text-[#667085]">{t.shareKitDesc}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Booking Link & Quick Actions */}
          <div className="space-y-3 lg:col-span-8">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1.5">
                {isRTL ? "رابط الحجز المباشر (المصدر: link)" : "Direct Booking URL (source: link)"}
              </label>
              <div className={`flex items-center gap-2 rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-1.5 ${flip}`}>
                <input
                  type="text"
                  readOnly
                  value={bookingUrl}
                  className="flex-1 bg-transparent px-3 py-1.5 text-xs font-mono text-[#101828] outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-lg bg-[#101828] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#22C55E]"
                >
                  {copiedLink ? t.copied : t.copyLink}
                </button>
              </div>
            </div>

            {/* Social Share Buttons */}
            <div className="pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-2">
                {isRTL ? "مشاركة عبر القنوات المباشرة" : "Share via Private Channels"}
              </label>
              <div className={`flex flex-wrap items-center gap-2.5 ${flip}`}>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 px-3.5 py-2 text-xs font-bold text-[#128C7E] transition hover:bg-[#25D366]/20"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.045-1.127-.093-.271-.086-.621-.202-1.074-.4-1.905-.828-3.137-2.766-3.232-2.894-.095-.128-.772-1.026-.772-1.956s.486-1.386.659-1.564c.174-.177.381-.222.508-.222.127 0 .254.001.365.006.118.005.276-.044.432.331.162.389.553 1.348.601 1.446.049.098.081.213.016.342-.064.129-.097.21-.192.322-.096.113-.201.251-.287.337-.097.097-.198.203-.085.397.113.194.502.828 1.077 1.341.741.66 1.366.865 1.56.962.195.097.308.081.423-.05.114-.131.49-.571.62-.767.13-.195.26-.163.438-.097.178.065 1.134.535 1.329.632.195.098.324.146.373.228.048.081.048.47-.096.875z"/></svg>
                  {t.shareWhatsApp}
                </a>

                <button
                  type="button"
                  onClick={handleCopyInstagram}
                  className="inline-flex items-center gap-2 rounded-xl bg-pink-50 border border-pink-200 px-3.5 py-2 text-xs font-bold text-pink-700 transition hover:bg-pink-100"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                  {copiedInstagram ? t.copied : t.shareInstagram}
                </button>
              </div>
            </div>

            {/* Explainer callout */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
              <strong className="font-bold">{isRTL ? "ميزة العمولة 0%:" : "0% Commission Guarantee:"}</strong>{" "}
              {isRTL
                ? "جميع العملاء الذين يحجزون عبر رابطك أو رمز QR الخاص بك يُسجلون تحت قنواتك المباشرة، وتُعفى حجوزاتهم بالكامل من عمولة المنصة."
                : "Clients booking via your personal link or QR code are tagged as private direct clients, exempting all their bookings from platform marketplace commissions."}
            </div>
          </div>

          {/* QR Code Card */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#ECECEC] bg-[#FDFCF8] p-4 text-center lg:col-span-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#667085] mb-2">{t.qrTitle}</h3>
            {/* SVG QR Code Pattern */}
            <div className="rounded-xl bg-white p-3 shadow-sm border border-[#ECECEC]">
              <svg className="h-32 w-32 text-[#101828]" viewBox="0 0 100 100" fill="currentColor">
                {/* QR corners */}
                <rect x="10" y="10" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                <rect x="16" y="16" width="12" height="12" fill="currentColor" rx="1" />
                <rect x="66" y="10" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                <rect x="72" y="16" width="12" height="12" fill="currentColor" rx="1" />
                <rect x="10" y="66" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="4" rx="2" />
                <rect x="16" y="72" width="12" height="12" fill="currentColor" rx="1" />
                {/* QR sample data blocks */}
                <rect x="42" y="14" width="6" height="6" fill="#D1AF47" />
                <rect x="52" y="14" width="6" height="6" fill="currentColor" />
                <rect x="42" y="24" width="6" height="6" fill="currentColor" />
                <rect x="52" y="34" width="6" height="6" fill="#D1AF47" />
                <rect x="14" y="44" width="6" height="6" fill="currentColor" />
                <rect x="24" y="44" width="6" height="6" fill="currentColor" />
                <rect x="34" y="44" width="6" height="6" fill="#D1AF47" />
                <rect x="44" y="44" width="12" height="12" fill="currentColor" rx="2" />
                <rect x="64" y="44" width="6" height="6" fill="currentColor" />
                <rect x="74" y="44" width="6" height="6" fill="currentColor" />
                <rect x="42" y="64" width="6" height="6" fill="#D1AF47" />
                <rect x="52" y="74" width="6" height="6" fill="currentColor" />
                <rect x="64" y="64" width="6" height="6" fill="currentColor" />
                <rect x="74" y="74" width="6" height="6" fill="#D1AF47" />
                <rect x="84" y="64" width="6" height="6" fill="currentColor" />
                <rect x="64" y="84" width="16" height="6" fill="currentColor" />
              </svg>
            </div>
            <p className="mt-2 text-[10px] font-mono text-gray-400 break-all">{qrUrl}</p>
            <button
              type="button"
              onClick={() => {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h2>${businessName}</h2><p>Scan to Book Online</p><img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}" width="300" height="300" /><br/><button onclick="window.print()">Print QR</button></body></html>`);
                }
              }}
              className="mt-2 text-[11px] font-bold text-[#D1AF47] hover:underline"
            >
              {isRTL ? "طباعة رمز QR للعرض في الصالون" : "Print Salon QR Display"}
            </button>
          </div>
        </div>
      </section>

      {/* PRIMORA BROUGHT YOU THIS MONTH (P1-E G43) */}
      <section className={`${cardBase} p-5 border-[#D1AF47]/30 bg-gradient-to-br from-amber-500/[0.03] via-white to-transparent`}>
        <div className={`flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${flip}`}>
          <div>
            <div className={`flex items-center gap-2 ${flip}`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D1AF47]/20 text-[#8A6F1C] text-xs font-black">⚡</span>
              <h2 className="font-serif text-base font-black text-[#101828]">{t.valueSummaryTitle}</h2>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">G43 Verified</span>
            </div>
            <p className="mt-1 text-xs text-[#667085]">{t.valueSummarySubtitle}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#ECECEC] bg-white p-4 shadow-sm hover:border-[#D1AF47]/40 transition-colors">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-wider block">{t.newClientsAcquired}</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#101828]">{valueSummary?.new_clients_acquired ?? 0}</span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{isRTL ? "عملاء لأول مرة" : "First-time"}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#ECECEC] bg-white p-4 shadow-sm hover:border-[#D1AF47]/40 transition-colors">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-wider block">{t.directLinkBookings}</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#101828]">{valueSummary?.direct_link_bookings ?? 0}</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">0% Fee</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#ECECEC] bg-white p-4 shadow-sm hover:border-[#D1AF47]/40 transition-colors">
            <span className="text-[10px] uppercase font-bold text-[#667085] tracking-wider block">{t.totalGmv}</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-[#101828]">{(valueSummary?.total_gmv_sar ?? 0).toLocaleString()} <span className="text-xs font-semibold text-gray-500">{t.currency}</span></span>
              <span className="text-[10px] font-bold text-[#8A6F1C] bg-amber-50 px-2 py-0.5 rounded-full">{isRTL ? "إجمالي الحجوزات" : "Gross Bookings"}</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">{t.commissionSaved}</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-700">{(valueSummary?.commission_saved_sar ?? 0).toLocaleString()} <span className="text-xs font-semibold text-emerald-600">{t.currency}</span></span>
              <span className="text-[10px] font-bold text-emerald-700 bg-white border border-emerald-200 px-2 py-0.5 rounded-full">15% Saved</span>
            </div>
          </div>
        </div>
      </section>

      {statsMode === "error" && (
        <div className="rounded-[20px] border border-[#FF5D73]/20 bg-[#FF5D73]/10 p-4 text-xs text-[#EF4444]">
          {isRTL ? "تعذر تحميل مؤشرات الأداء: " : "Could not load your performance figures: "}{statsError}
        </div>
      )}

      {/* KPI STRIP */}
      <div className={`${cardBase} flex-shrink-0 overflow-x-auto p-3`}>
        <div className="flex min-w-max divide-x divide-[#ECECEC] rtl:divide-x-reverse">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-[130px] px-4 first:ps-1 last:pe-1">
              <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[#667085]">{k.label}</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <strong className="font-serif text-sm font-black text-[#101828]">{k.value}</strong>
                <span className={`text-[9px] font-black ${k.tone}`}>{k.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GRID — fits one screen */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12" style={{ gridTemplateRows: "minmax(0,1.15fr) minmax(0,1fr)" }}>
        {/* Revenue & Load Forecast */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-8`}>
          <div className={`mb-1 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <div>
              <h3 className="font-serif text-base font-black">{t.revenueForecast}</h3>
              <p className="text-[10px] font-medium text-gray-500">{t.forecastSub}</p>
            </div>
            <span className="rounded-full border border-[#ECECEC] bg-white px-3 py-1 text-[10px] font-bold text-gray-700 shadow-sm">{t.monthly}</span>
          </div>
          <div className="relative min-h-0 w-full flex-1">
            <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#D1AF47" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="600" y2="40" stroke="#ECECEC" strokeWidth="1" strokeDasharray="3 4" />
              <line x1="0" y1="95" x2="600" y2="95" stroke="#ECECEC" strokeWidth="1" strokeDasharray="3 4" />
              <path d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50 L 600,150 L 10,150 Z" fill="url(#chartGlow)" />
              <path d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50" fill="none" stroke="#D1AF47" strokeWidth="3" strokeLinecap="round" />
              <path d="M 10,125 C 80,110 160,85 230,75 C 300,65 380,105 450,65 C 520,35 550,45 600,20" fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
            </svg>
          </div>
          <div className={`mt-1 flex flex-shrink-0 justify-between px-1 text-[9px] font-black uppercase tracking-wider text-[#667085] ${flip}`}>
            <span>Jan</span><span>Feb</span><span>Mar</span><span className="text-[#D1AF47]">Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span>
          </div>
        </section>

        {/* Today's Operations */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.todaysOps}</h3>
            <span className="rounded-full bg-[#22C55E]/10 px-2 py-0.5 text-[8px] font-black uppercase text-[#22C55E]">{t.live}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            <div className="rounded-xl border border-[#ECECEC] bg-[#F7F6F3] p-2.5">
              <span className="text-[8px] font-black uppercase text-[#22C55E]">{t.ongoing}</span>
              <h4 className="text-xs font-bold">Max Stone — Chair 1</h4>
              <p className="text-[10px] font-semibold text-gray-500">Haircut + Beard · 12m left</p>
            </div>
            <div className="rounded-xl border border-[#ECECEC] bg-[#F7F6F3] p-2.5">
              <span className="text-[8px] font-black uppercase text-[#667085]">{t.nextUp}</span>
              <h4 className="text-xs font-bold">Grisha Jack — Room 2</h4>
              <p className="text-[10px] font-semibold text-gray-500">Moroccan Bath · in 18m</p>
            </div>
            <div className="rounded-xl border border-[#ECECEC] bg-[#F7F6F3] p-2.5">
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[8px] font-black uppercase text-[#667085]">{t.walkInQueue}</span>
                <span className="text-[9px] font-bold text-[#D1AF47]">3 {t.waiting}</span>
              </div>
              <p className="mt-1 text-[10px] font-bold">1. Khalid Yasin · 2. Fahad Al-Qahtani</p>
            </div>
          </div>
          <Link href="/provider/calendar" className={`mt-2 flex flex-shrink-0 items-center justify-between border-t border-[#ECECEC] pt-2 text-[10px] font-bold text-gray-500 ${flip}`}>
            <span>12 walk-ins today</span><span className="text-[#D1AF47]">{t.manageQueue} →</span>
          </Link>
        </section>

        {/* Staff Performance */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.staffPerf}</h3>
            <Link href="/provider/team" className="text-[10px] font-black text-[#D1AF47] hover:underline">{t.leaderboard}</Link>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            {[
              { name: "Max Stone", bookings: 42, rating: "4.9", rev: "18,450", util: "96%" },
              { name: "Levi Patrick", bookings: 36, rating: "4.8", rev: "14,200", util: "92%" },
              { name: "Grisha Jack", bookings: 28, rating: "4.7", rev: "11,800", util: "88%" },
            ].map((s) => (
              <div key={s.name} className={`flex items-center justify-between rounded-xl border border-[#ECECEC] bg-[#F7F6F3] p-2 ${flip}`}>
                <div>
                  <h5 className="text-xs font-bold">{s.name}</h5>
                  <p className="text-[9px] font-semibold text-gray-500">{s.bookings} bk · {s.rating} ★</p>
                </div>
                <div className={isRTL ? "text-left" : "text-right"}>
                  <span className="block font-serif text-xs font-black text-[#101828]">{s.rev} SAR</span>
                  <span className="block text-[9px] font-bold text-[#22C55E]">{t.util}: {s.util}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Service Intelligence */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.serviceIntel}</h3>
            <span className="text-[10px] font-bold text-gray-500">{t.avgLoad}: 72%</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5">
            {[
              { name: "Hair Styling", count: "36", val: 75 },
              { name: "Moroccan Bath", count: "28", val: 85 },
              { name: "Spa Therapy", count: "12", val: 40 },
            ].map((s) => (
              <div key={s.name}>
                <div className={`mb-1 flex items-center justify-between text-[10px] font-bold ${flip}`}>
                  <span className="font-serif">{s.name}</span>
                  <span className="text-[#D1AF47]">{s.count} · {s.val}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#F5F5F5]"><div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" style={{ width: `${s.val}%` }} /></div>
              </div>
            ))}
          </div>
          <Link href="/provider/services" className={`mt-2 flex flex-shrink-0 items-center justify-end border-t border-[#ECECEC] pt-2 text-[10px] font-bold text-[#D1AF47] ${flip}`}>{t.manageServices} →</Link>
        </section>

        {/* Prayer Operations Control */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.prayerControl}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${isLocked ? "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20" : "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20"}`}>{isLocked ? (isRTL ? "مغلق" : "Locked") : (isRTL ? "نشط" : "Active")}</span>
          </div>
          <div className="rounded-xl border border-[#ECECEC] bg-[#F7F6F3] p-3">
            <div className={`flex items-center justify-between ${flip}`}>
              <div>
                <span className="block text-[8px] font-black uppercase text-[#667085]">{t.nextPrayer}</span>
                <span className="font-serif text-base font-black">{isRTL ? nextPrayer.nameAr : nextPrayer.nameEn}</span>
              </div>
              <div className={isRTL ? "text-left" : "text-right"}>
                <span className="block text-[8px] font-black uppercase text-[#667085]">{t.prayerIn}</span>
                <span className="font-serif text-base font-black text-[#EF4444]">{fmt(secondsUntilNext)}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F5]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#EF4444]" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#ECECEC] pt-2">
              <div><span className="block text-[8px] font-black uppercase text-[#667085]">{isLocked ? (isRTL ? "ينتهي خلال" : "Unlocks in") : t.lockIn}</span><span className="font-serif text-xs font-black text-[#D1AF47]">{fmt(isLocked ? resumesIn : lockStartsIn)}</span></div>
              <div><span className="block text-[8px] font-black uppercase text-[#667085]">{t.autoResume}</span><span className="font-serif text-xs font-black text-[#16A34A]">{formatTime12h(resumeTime)}</span></div>
            </div>
          </div>
          <div className="mt-2 grid flex-shrink-0 grid-cols-3 gap-2">
            {([[t.bookingsAffected, "3", "text-[#EF4444]"], [t.staffAffected, "2", "text-[#F59E0B]"], [t.roomsAffected, "1", "text-[#101828]"]] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} className="rounded-lg border border-[#ECECEC] bg-white p-1.5 text-center">
                <span className="block text-[7px] font-black uppercase text-[#667085]">{l}</span>
                <span className={`font-serif text-sm font-black ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
