"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
    searchPlaceholder: "Search ledger or provider UUID...",
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
    searchPlaceholder: "البحث في الحسابات أو المعرفات...",
    langSwitch: "English"
  }
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const pathname = usePathname();
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const menuItems = [
    { 
      name: t.dashboard, 
      path: "/admin", 
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      )
    },
    { 
      name: t.providers, 
      path: "/admin/providers", 
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
        </svg>
      )
    },
    { 
      name: t.bookings, 
      path: "/admin/bookings", 
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      )
    },
    { 
      name: t.disputes, 
      path: "/admin/disputes", 
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
        </svg>
      )
    },
    { 
      name: t.ledger, 
      path: "/admin/ledger", 
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      )
    }
  ];

  const isRTL = locale === "ar";

  return (
    <div className={`min-h-screen bg-stone-50 text-stone-900 flex font-sans ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
      
      {/* SIDEBAR */}
      <aside className={`w-64 bg-stone-900 text-stone-200 p-6 flex flex-col justify-between border-stone-800 flex-shrink-0 ${isRTL ? "border-l" : "border-r"}`}>
        <div className="space-y-8">
          {/* Logo */}
          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <Link href="/" className="text-xl font-serif font-black tracking-widest text-white">
              PRIMORA
            </Link>
            <span className="bg-amber-500/10 text-amber-500 text-[8px] font-extrabold uppercase px-2 py-0.5 rounded border border-amber-500/20">
              Admin
            </span>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${isRTL ? "flex-row-reverse text-right" : "flex-row"} ${
                    isActive
                      ? "bg-stone-800 text-white shadow-sm border border-stone-700"
                      : "text-stone-400 hover:bg-stone-800/40 hover:text-stone-100"
                  }`}
                >
                  <span className="text-stone-400 group-hover:text-stone-200">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-6 border-t border-stone-800">
          <Link 
            href="/" 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition-all duration-150 ${isRTL ? "flex-row-reverse text-right" : "flex-row"}`}
          >
            <span className="text-red-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </span>
            <span>{t.logout}</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <header className={`h-20 bg-white border-b border-stone-200 px-8 flex items-center justify-between flex-shrink-0 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
          {/* Search Box */}
          <div className={`flex items-center gap-3 bg-stone-50 px-4 py-2 rounded-lg border border-stone-200 w-72 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className={`bg-transparent border-none outline-none text-xs w-full placeholder-stone-400 text-stone-700 font-semibold ${isRTL ? "text-right" : "text-left"}`}
            />
          </div>

          <div className={`flex items-center gap-6 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 rounded-lg border border-stone-200 bg-stone-50 text-[10px] uppercase tracking-wider font-extrabold hover:border-stone-400 transition"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className={`flex items-center gap-3 pl-4 ${isRTL ? "border-r pr-4 border-stone-200 flex-row-reverse" : "border-l pl-4 border-stone-200"}`}>
              <div className="w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                A
              </div>
              <div className={`hidden sm:block ${isRTL ? "text-right" : "text-left"}`}>
                <span className="text-xs font-bold text-stone-900 block">{t.welcome}</span>
                <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-widest block">Root Administrator</span>
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CANVAS */}
        <main className="flex-1 p-8 overflow-y-auto min-h-0 bg-stone-50">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
}
