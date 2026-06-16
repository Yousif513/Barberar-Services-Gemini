"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";

const translations = {
  en: {
    dashboard: "Dashboard",
    providers: "Provider Audits",
    bookings: "Global Bookings",
    disputes: "Disputes Arbitrator",
    ledger: "Splits Ledger",
    settings: "Settings",
    logout: "Log Out",
    welcome: "Admin Center",
    searchPlaceholder: "Search ledger or provider...",
    langSwitch: "العربية"
  },
  ar: {
    dashboard: "لوحة المتابعة",
    providers: "تدقيق المزودين",
    bookings: "الحجوزات العامة",
    disputes: "حكم النزاعات",
    ledger: "دفتر الحسابات",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    welcome: "مركز الإدارة",
    searchPlaceholder: "البحث في الحسابات...",
    langSwitch: "English"
  }
};

const getNavIcon = (path: string) => {
  const strokeClass = "w-5 h-5";
  if (path === "/admin" || path === "/admin/") {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
      </svg>
    );
  }
  if (path.includes("providers")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
  if (path.includes("disputes")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (path.includes("ledger")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
};

export default function AdminLayout({
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

  const menuItems = [
    { name: t.dashboard, path: "/admin" },
    { name: t.providers, path: "/admin/providers" },
    { name: t.bookings, path: "/admin/bookings" },
    { name: t.disputes, path: "/admin/disputes" },
    { name: t.ledger, path: "/admin/ledger" },
  ];

  return (
    <AuthGuard allowedRoles={["admin"]}>
    <div className="min-h-screen bg-[#F7F7F5] text-black flex flex-col md:flex-row font-sans selection:bg-[#D1AF47] selection:text-white">
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR (280px) — Premium Floating White Sidebar        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside className="w-full md:w-[280px] flex flex-col justify-between p-6 flex-shrink-0 bg-white rounded-[28px] border border-[#E8E8E8] shadow-[0_10px_30px_rgba(0,0,0,0.04)] m-6 relative">
        <div>
          {/* Logo & Admin Indicator */}
          <div className={`flex items-center justify-between mb-8 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <Link href="/" className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
                PRIMORA
              </span>
            </Link>
            <span className="bg-[#F4E7B6] text-[#B8952E] text-[8px] font-extrabold uppercase px-2 py-0.5 rounded border border-[#D1AF47]/20">
              Admin
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-0.5 max-h-[55vh] overflow-y-auto pr-1">
            {menuItems.map((item) => {
              // Exact match or prefix match for subpages (like providers, ledger, bookings)
              const isActive = item.path === "/admin" 
                ? pathname === "/admin" || pathname === "/admin/"
                : pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-[18px] text-[13px] font-semibold transition-all duration-300 ${
                    isActive
                      ? "bg-[#F4E7B6]/30 text-[#B8952E]"
                      : "text-[#667085] hover:bg-[#F7F7F5] hover:text-[#101828]"
                  } ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
                >
                  {/* Gold active line indicator */}
                  {isActive && (
                    <span className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[#D1AF47] ${isRTL ? "right-0" : "left-0"}`} />
                  )}

                  <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#D1AF47]" : "text-[#7B859C] group-hover:text-[#667085]"}`}>
                    {getNavIcon(item.path)}
                  </span>

                  <span className="flex-grow">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer — Help & Logged-in Admin Info */}
        <div className="pt-4 mt-2 border-t border-gray-100 space-y-4">
          <Link
            href="/admin"
            className="flex items-center justify-between p-3 bg-[#F7F7F5] border border-[#E8E8E8] rounded-2xl group hover:border-[#D1AF47]/30 transition-all duration-300"
          >
            <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-8 h-8 rounded-xl bg-white border border-[#E8E8E8] flex items-center justify-center text-gray-500 group-hover:text-[#D1AF47] transition duration-300">
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0A5 5 0 1110.12 10.12l3.536-3.536m0 0L20 4M9 15l-3 3m0 0l-3-3m3 3V9" />
                </svg>
              </div>
              <div className={`text-left ${isRTL ? "text-right" : "text-left"}`}>
                <h5 className="text-[11px] font-bold text-gray-900 leading-none">System Status</h5>
                <p className="text-[9px] text-[#22C55E] font-semibold mt-0.5">All Systems Operational</p>
              </div>
            </div>
            <svg className={`w-3 h-3 text-gray-400 group-hover:text-[#D1AF47] transition duration-300 ${isRTL ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          <div className={`flex items-center justify-between gap-2 px-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-9 h-9 rounded-full bg-[#F4E7B6]/40 border border-[#D1AF47]/20 flex items-center justify-center text-[#B8952E] font-bold text-sm flex-shrink-0">
                A
              </div>
              <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-0.5">Root Console</p>
                <p className="text-xs font-black text-gray-900 leading-tight truncate max-w-[110px]">{t.welcome}</p>
              </div>
            </div>
            <Link href="/" className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-all duration-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </Link>
          </div>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* MAIN CONTENT AREA                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F7F7F5] relative">
        {/* HEADER */}
        <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-[#E8E8E8] px-8 flex items-center justify-between sticky top-0 z-40">
          <div className={`flex items-center gap-3 bg-[#F7F7F5] border border-[#E8E8E8] px-5 py-3 rounded-2xl w-80 focus-within:border-[#D1AF47]/30 transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className={`bg-transparent border-none outline-none text-sm w-full placeholder-[#667085]/60 text-[#101828] ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>

          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <button
              onClick={toggleLanguage}
              className="px-5 py-2.5 rounded-2xl border border-[#E8E8E8] bg-white text-xs font-bold text-[#667085] hover:border-[#D1AF47]/40 hover:text-[#D1AF47] transition-all duration-300"
            >
              {t.langSwitch}
            </button>

            <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`text-right hidden sm:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="text-[10px] text-gray-400 font-bold leading-none mb-1">Signed in as</p>
                <p className="text-xs font-bold text-gray-900 leading-tight">Admin Root</p>
              </div>
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E8E8E8] shadow-[0_0_15px_rgba(209,175,71,0.1)] bg-stone-900 text-white flex items-center justify-center font-bold text-sm">
                AD
              </div>
            </div>
          </div>
        </header>

        {/* PAGES WRAPPER */}
        <main className="flex-grow p-8 overflow-y-auto relative">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>

    </div>
    </AuthGuard>
  );
}
