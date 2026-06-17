"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";

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
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const pathname = usePathname();
  const t = translations[locale];
  const isRTL = locale === "ar";

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("primora_lang", locale);
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
    <AuthGuard allowedRoles={["provider_owner", "provider_employee"]}>
    <div className="flex flex-col md:flex-row bg-[#F7F7F5] text-black font-sans selection:bg-[#D1AF47] selection:text-white md:h-screen md:overflow-hidden">
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR — Floating white sidebar fixed to window height  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside className="flex-shrink-0 p-4 md:h-screen">
        <div className="flex h-full w-full flex-col rounded-[28px] border border-[#E8E8E8] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] md:w-[280px]">
          {/* Logo */}
          <Link href="/" className={`flex flex-shrink-0 items-center gap-2.5 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
              PRIMORA
            </span>
          </Link>

          {/* Navigation Links (scrolls independently) */}
          <nav className="mt-6 min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1">
            {navItems.map((item, index) => {
              const isActive = pathname.startsWith(item.path);
              const isMessages = item.path.includes("messages");

              return (
                <React.Fragment key={item.path}>
                  <Link
                    href={item.path}
                    className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-[18px] text-[13px] font-semibold transition-all duration-300 ${
                      isActive
                        ? "bg-[#F4E7B6]/30 text-[#B8952E]"
                        : "text-[#667085] hover:bg-[#F7F7F5] hover:text-[#101828]"
                    } ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
                  >
                    {/* Gold indicator bar */}
                    {isActive && (
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[#D1AF47] ${
                          isRTL ? "right-0" : "left-0"
                        }`}
                      />
                    )}

                    <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#D1AF47]" : "text-[#7B859C] group-hover:text-[#667085]"}`}>
                      {getNavIcon(item.path)}
                    </span>

                    <span className="flex-grow">{item.name}</span>

                    {/* Notification dot */}
                    {isMessages && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF5D73] flex-shrink-0" />
                    )}
                  </Link>

                  {/* Separator lines between nav groups */}
                  {separatorAfterIndices.includes(index) && (
                    <div className="my-2 mx-4">
                      <div className="h-px bg-gray-100" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Sidebar Footer — Support & Logout */}
          <div className="mt-3 flex-shrink-0 space-y-3 border-t border-gray-100 pt-3">
            {/* Help Support Card */}
            <Link
              href="/provider/settings"
              className="flex items-center justify-between p-3 bg-[#F7F7F5] border border-[#E8E8E8] rounded-2xl group hover:border-[#D1AF47]/30 transition-all duration-300"
            >
              <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-8 h-8 rounded-xl bg-white border border-[#E8E8E8] flex items-center justify-center text-gray-500 group-hover:text-[#D1AF47] transition duration-300">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0A5 5 0 1110.12 10.12l3.536-3.536m0 0L20 4M9 15l-3 3m0 0l-3-3m3 3V9" />
                  </svg>
                </div>
                <div className={`text-left ${isRTL ? "text-right" : "text-left"}`}>
                  <h5 className="text-[11px] font-bold text-gray-900 leading-none">Need Help?</h5>
                  <p className="text-[9px] text-[#667085] font-semibold mt-0.5">Contact Support</p>
                </div>
              </div>
              <svg className={`w-3 h-3 text-gray-400 group-hover:text-[#D1AF47] transition duration-300 ${isRTL ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* User Initials Avatar & Logout */}
            <div className={`flex items-center justify-between gap-2 px-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-9 h-9 rounded-full bg-[#F4E7B6]/40 border border-[#D1AF47]/20 flex items-center justify-center text-[#B8952E] font-bold text-sm flex-shrink-0">
                  N
                </div>
                <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
                  <p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-0.5">Partner Hub</p>
                  <p className="text-xs font-black text-gray-900 leading-tight truncate max-w-[110px]">Elite Barbershop</p>
                </div>
              </div>
              <Link 
                href="/" 
                className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-all duration-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT AREA                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">

        {/* ── HEADER (80px) ── */}
        {!(pathname === "/provider/dashboard" || pathname === "/provider/dashboard/") && (
          <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-[#E8E8E8] px-8 flex items-center justify-between sticky top-0 z-40">

          
          {/* Light Search Input */}
          <div className={`flex items-center gap-3 bg-[#F7F7F5] border border-[#E8E8E8] px-5 py-3 rounded-2xl w-80 focus-within:border-[#D1AF47]/30 transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-[#667085] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className={`bg-transparent border-none outline-none text-sm w-full placeholder-[#667085]/60 text-[#101828] ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>

          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="px-5 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-xs font-bold text-[#667085] hover:border-[#D1AF47]/40 hover:text-[#D1AF47] transition-all duration-300"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className={`flex items-center gap-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`hidden sm:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-[0.15em] leading-none mb-1">{t.welcome}</p>
                <p className="text-sm font-bold text-gray-900 tracking-wide">Elite Barbershop</p>
              </div>
              <div
                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#101828] font-black text-sm flex items-center justify-center shadow-[0_0_20px_rgba(209,175,71,0.15)]"
              >
                EB
              </div>
            </div>
          </div>
        </header>
      )}
        {/* ── PAGES WRAPPER ── */}
        <main className="flex-1 p-5 md:overflow-y-auto">
          {children}
        </main>
      </div>

    </div>
    </AuthGuard>
  );
}
