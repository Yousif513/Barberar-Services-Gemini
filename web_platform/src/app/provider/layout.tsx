"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Localized Navigation Strings
const translations = {
  en: {
    dashboard: "Dashboard",
    calendar: "Calendar",
    services: "Services Menu",
    team: "Team & Staff",
    wallet: "Wallet & Payouts",
    settings: "Settings",
    logout: "Log Out",
    welcome: "Welcome,",
    searchPlaceholder: "Search bookings...",
    langSwitch: "العربية"
  },
  ar: {
    dashboard: "لوحة التحكم",
    calendar: "التقويم",
    services: "قائمة الخدمات",
    team: "فريق العمل",
    wallet: "المحفظة والمدفوعات",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    welcome: "مرحباً،",
    searchPlaceholder: "البحث عن الحجوزات...",
    langSwitch: "English"
  }
};

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<"en" | "ar">("ar"); // Default to Arabic for Saudi market
  const pathname = usePathname();
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    // Sync document direction with current locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const navItems = [
    { name: t.dashboard, path: "/provider/dashboard", icon: "📊" },
    { name: t.calendar, path: "/provider/calendar", icon: "📅" },
    { name: t.services, path: "/provider/services", icon: "✂️" },
    { name: t.team, path: "/provider/team", icon: "👥" },
    { name: t.wallet, path: "/provider/wallet", icon: "💳" },
  ];

  return (
    <div className="min-h-screen bg-[hsl(220,15%,8%)] text-[hsl(0,0%,98%)] flex flex-col md:flex-row font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-[hsl(220,12%,14%)] border-r md:border-r border-b md:border-b-0 border-[hsla(0,0%,100%,0.08)] flex flex-col justify-between p-6">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            <span className="text-2xl">✨</span>
            <h1 className="text-xl font-bold tracking-wider text-[hsl(45,60%,55%)]">
              {locale === "ar" ? "صالون إيليت" : "Elite Salon"}
            </h1>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] font-semibold shadow-[0_0_15px_hsla(45,60%,55%,0.2)]"
                      : "text-[hsl(210,8%,65%)] hover:bg-[hsla(0,0%,100%,0.03)] hover:text-[hsl(0,0%,98%)]"
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="mt-8 pt-6 border-t border-[hsla(0,0%,100%,0.08)]">
          <button className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-[hsl(355,75%,50%)] hover:bg-[hsla(355,75%,50%,0.08)] transition-all duration-200">
            <span>🚪</span>
            <span>{t.logout}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col">
        {/* HEADER */}
        <header className="h-20 bg-[hsl(220,12%,14%)] border-b border-[hsla(0,0%,100%,0.08)] px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 bg-[hsla(0,0%,100%,0.03)] px-4 py-2 rounded-lg border border-[hsla(0,0%,100%,0.05)] w-72">
            <span>🔍</span>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="bg-transparent border-none outline-none text-sm w-full placeholder-[hsl(210,8%,65%)]"
            />
          </div>

          <div className="flex items-center gap-6">
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 rounded-lg border border-[hsla(0,0%,100%,0.08)] bg-[hsla(0,0%,100%,0.02)] text-sm font-semibold hover:border-[hsl(45,60%,55%)] hover:text-[hsl(45,60%,55%)] transition-all duration-200"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-[hsl(210,8%,65%)]">{t.welcome}</p>
                <p className="text-sm font-medium">Abdurahman Al-Faisal</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[hsl(45,60%,55%)] text-[hsl(220,15%,8%)] flex items-center justify-center font-bold text-lg">
                A
              </div>
            </div>
          </div>
        </header>

        {/* PAGES WRAPPER */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>

    </div>
  );
}
