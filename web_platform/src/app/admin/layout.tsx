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
  const [locale, setLocale] = useState<"en" | "ar">("en");
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
    { name: t.dashboard, path: "/admin", icon: "📊" },
    { name: t.providers, path: "/admin/providers", icon: "🏢" },
    { name: t.bookings, path: "/admin/bookings", icon: "📅" },
    { name: t.disputes, path: "/admin/disputes", icon: "⚖️" },
    { name: t.ledger, path: "/admin/ledger", icon: "💰" }
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-stone-900 text-stone-200 p-6 flex flex-col justify-between border-r border-stone-800 flex-shrink-0">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 ${
                    isActive
                      ? "bg-stone-800 text-white shadow-sm border border-stone-700"
                      : "text-stone-400 hover:bg-stone-800/40 hover:text-stone-100"
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-6 border-t border-stone-800">
          <Link href="/" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition-all duration-150">
            <span>🚪</span>
            <span>{t.logout}</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* HEADER */}
        <header className="h-20 bg-white border-b border-stone-200 px-8 flex items-center justify-between flex-shrink-0">
          {/* Search Box */}
          <div className="flex items-center gap-3 bg-stone-50 px-4 py-2 rounded-lg border border-stone-200 w-72">
            <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="bg-transparent border-none outline-none text-xs w-full placeholder-stone-400 text-stone-700 font-semibold"
            />
          </div>

          <div className="flex items-center gap-6">
            {/* Language Switcher */}
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 rounded-lg border border-stone-200 bg-stone-50 text-[10px] uppercase tracking-wider font-extrabold hover:border-stone-400 transition"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className="flex items-center gap-3 pl-4 border-l border-stone-200">
              <div className="w-8 h-8 rounded-full bg-stone-900 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                A
              </div>
              <div className="hidden sm:block text-left">
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
