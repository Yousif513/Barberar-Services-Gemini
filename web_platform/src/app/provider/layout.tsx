"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Localized Navigation Strings
const translations = {
  en: {
    dashboard: "Dashboard",
    calendar: "Calendar",
    bookings: "Bookings",
    services: "Services",
    employees: "Employees",
    resources: "Rooms & Resources",
    packages: "Wellness Packages",
    jobs: "Find Job Leads",
    deliveries: "Logistics Board",
    customers: "Customers",
    reviews: "Reviews",
    promotions: "Promotions",
    reports: "Reports",
    settings: "Settings",
    messages: "Messages",
    logout: "Log Out",
    welcome: "Welcome back,",
    searchPlaceholder: "Search...",
    langSwitch: "العربية",
    wallet: "Wallet & Payouts"
  },
  ar: {
    dashboard: "لوحة التحكم",
    calendar: "التقويم",
    bookings: "الحجوزات",
    services: "الخدمات",
    employees: "الموظفين",
    resources: "الغرف والموارد",
    packages: "باقات العافية",
    jobs: "فرص العمل المتاحة",
    deliveries: "لوحة اللوجستيات والشحن",
    messages: "الرسائل",
    customers: "العملاء",
    reviews: "التقييمات",
    promotions: "العروض الترويجية",
    reports: "التقارير",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث...",
    langSwitch: "English",
    wallet: "المحفظة والمدفوعات"
  }
};

const getNavIcon = (path: string) => {
  const strokeClass = "w-5 h-5";
  if (path.includes("dashboard")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
      </svg>
    );
  }
  if (path.includes("calendar")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (path.includes("bookings")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2h-2" />
      </svg>
    );
  }
  if (path.includes("services")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (path.includes("resources")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1" />
      </svg>
    );
  }
  if (path.includes("packages")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    );
  }
  if (path.includes("jobs")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    );
  }
  if (path.includes("deliveries")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414" />
      </svg>
    );
  }
  if (path.includes("wallet")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    );
  }
  if (path.includes("messages")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72" />
      </svg>
    );
  }
  if (path.includes("team")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
      </svg>
    );
  }
  if (path.includes("customers")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2" />
      </svg>
    );
  }
  if (path.includes("reviews")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915" />
      </svg>
    );
  }
  if (path.includes("promotions")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2" />
      </svg>
    );
  }
  if (path.includes("reports")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" />
      </svg>
    );
  }
  if (path.includes("settings")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573" />
      </svg>
    );
  }
  return (
    <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
};

// Separator indices: after "deliveries" (index 7) and after "customers" (index 11)
const separatorAfterIndices = [7, 11];

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const pathname = usePathname();
  const t = translations[locale];
  const isRTL = locale === "ar";

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const navItems = [
    { name: t.dashboard, path: "/provider/dashboard" },
    { name: t.calendar, path: "/provider/calendar" },
    { name: t.bookings, path: "/provider/bookings" },
    { name: t.services, path: "/provider/services" },
    { name: t.resources, path: "/provider/resources" },
    { name: t.packages, path: "/provider/packages" },
    { name: t.jobs, path: "/provider/jobs" },
    { name: t.deliveries, path: "/provider/deliveries" },
    { name: t.wallet, path: "/provider/wallet" },
    { name: t.messages, path: "/provider/messages" },
    { name: t.employees, path: "/provider/team" },
    { name: t.customers, path: "/provider/customers" },
    { name: t.reviews, path: "/provider/reviews" },
    { name: t.promotions, path: "/provider/promotions" },
    { name: t.reports, path: "/provider/reports" },
    { name: t.settings, path: "/provider/settings" },
  ];

  return (
    <div className="min-h-screen bg-[#070B12] text-white flex flex-col md:flex-row font-sans selection:bg-[#D1AF47] selection:text-[#070B12]">
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR (280px) — Premium Glass with Inner Glow        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside
        className="w-full md:w-[280px] flex flex-col justify-between p-6 flex-shrink-0 relative border-r border-[#D1AF47]/10"
        style={{
          background: "linear-gradient(180deg, #221B0F 0%, #0B0904 100%)",
          boxShadow: "inset 0 0 50px rgba(209,175,71,0.03), 1px 0 0 rgba(209,175,71,0.05)",
        }}
      >
        <div>
          {/* ── Logo & Notifications Bell ── */}
          <div className={`flex items-center justify-between mb-10 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <Link
              href="/"
              className="text-2xl font-serif font-black tracking-[0.25em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300"
              style={{
                textShadow: "0 0 20px rgba(209,175,71,0.35), 0 0 40px rgba(209,175,71,0.15)",
              }}
            >
              PRIMORA
            </Link>
            <button className="p-2.5 rounded-2xl bg-[#D1AF47]/5 border border-[#D1AF47]/10 hover:border-[#D1AF47]/30 hover:bg-[#D1AF47]/10 transition-all duration-300 text-[#D1AF47] hover:text-[#E0C46A] hover:shadow-[0_0_15px_rgba(209,175,71,0.15)]">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>

          {/* ── Navigation Links ── */}
          <nav className="space-y-0.5">
            {navItems.map((item, index) => {
              const isActive = pathname.startsWith(item.path);
              const isMessages = item.path.includes("messages");

              return (
                <React.Fragment key={item.path}>
                  <Link
                    href={item.path}
                    className={`group relative flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[13px] font-semibold transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-r from-[#D1AF47]/20 to-[#D1AF47]/5 text-white border border-[#D1AF47]/20 shadow-[0_0_20px_rgba(209,175,71,0.1)]"
                        : "text-[#B8C0D4]/80 hover:bg-[#D1AF47]/5 hover:text-white"
                    } ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
                  >
                    {/* Gold accent bar for active item */}
                    {isActive && (
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-[#D1AF47] shadow-[0_0_8px_rgba(209,175,71,0.4)] ${
                          isRTL ? "right-0" : "left-0"
                        }`}
                      />
                    )}

                    <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#D1AF47]" : "text-[#7B859C] group-hover:text-[#B8C0D4]"}`}>
                      {getNavIcon(item.path)}
                    </span>

                    <span className="flex-grow">{item.name}</span>

                    {/* Notification badge dot on Messages */}
                    {isMessages && (
                      <span className="w-2 h-2 rounded-full bg-[#FF5D73] shadow-[0_0_6px_rgba(255,93,115,0.4)] flex-shrink-0" />
                    )}
                  </Link>

                  {/* Separator lines between nav groups */}
                  {separatorAfterIndices.includes(index) && (
                    <div className="my-2.5 mx-4">
                      <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* ── Sidebar Footer — Logout ── */}
        <div className="pt-6 mt-4">
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-5" />
          <Link 
            href="/" 
            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[13px] font-semibold text-[#FF5D73] hover:bg-[#FF5D73]/[0.08] hover:shadow-[0_0_20px_rgba(255,93,115,0.08)] transition-all duration-300 ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="flex-grow">{t.logout}</span>
          </Link>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT AREA                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex-grow flex flex-col min-w-0 bg-[#070B12] relative">

        {/* ── HEADER (80px) ── */}
        {!(pathname === "/provider/dashboard" || pathname === "/provider/dashboard/") && (
          <header className="h-20 bg-[#070B12]/60 backdrop-blur-xl border-b border-white/[0.04] px-8 flex items-center justify-between sticky top-0 z-40">

          
          {/* Glass Search Input */}
          <div className={`flex items-center gap-3 bg-white/[0.04] px-5 py-3 rounded-2xl border border-white/[0.06] w-80 focus-within:border-[#D1AF47]/30 focus-within:shadow-[0_0_20px_rgba(209,175,71,0.06)] transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-[#7B859C] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className={`bg-transparent border-none outline-none text-sm w-full placeholder-[#7B859C]/60 text-white ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>

          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="px-5 py-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.04] text-xs font-bold text-[#B8C0D4] hover:border-[#D1AF47]/40 hover:text-[#D1AF47] hover:shadow-[0_0_20px_rgba(209,175,71,0.1)] transition-all duration-300"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className={`flex items-center gap-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`hidden sm:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="text-[10px] text-[#7B859C] font-semibold uppercase tracking-[0.15em] leading-none mb-1">{t.welcome}</p>
                <p className="text-sm font-bold text-white tracking-wide">Elite Barbershop</p>
              </div>
              <div
                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#111827] font-black text-sm flex items-center justify-center shadow-[0_0_20px_rgba(209,175,71,0.25)] transition-shadow duration-300 hover:shadow-[0_0_30px_rgba(209,175,71,0.35)]"
              >
                EB
              </div>
            </div>
          </div>
        </header>
      )}

        {/* ── PAGES WRAPPER — with subtle noise texture ── */}
        <main
          className="flex-1 p-10 overflow-y-auto relative"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.015'/%3E%3C/svg%3E")`,
          }}
        >
          {children}
        </main>
      </div>

    </div>
  );
}
