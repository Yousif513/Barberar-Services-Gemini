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
    customers: "Customers",
    reviews: "Reviews",
    promotions: "Promotions",
    reports: "Reports",
    settings: "Settings",
    logout: "Log Out",
    welcome: "Welcome back,",
    searchPlaceholder: "Search...",
    langSwitch: "العربية"
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
    customers: "العملاء",
    reviews: "التقييمات",
    promotions: "العروض الترويجية",
    reports: "التقارير",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث...",
    langSwitch: "English"
  }
};

export default function ProviderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState<"en" | "ar">("en"); // Default to English for Yousif's view
  const pathname = usePathname();
  const t = translations[locale];

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const navItems = [
    { name: t.dashboard, path: "/provider/dashboard", icon: "" },
    { name: t.calendar, path: "/provider/calendar", icon: "" },
    { name: t.bookings, path: "/provider/bookings", icon: "" },
    { name: t.services, path: "/provider/services", icon: "" },
    { name: t.resources, path: "/provider/resources", icon: "" },
    { name: t.packages, path: "/provider/packages", icon: "" },
    { name: t.jobs, path: "/provider/jobs", icon: "" },
    { name: t.employees, path: "/provider/team", icon: "" }, // links to team folder
    { name: t.customers, path: "/provider/customers", icon: "" },
    { name: t.reviews, path: "/provider/reviews", icon: "" },
    { name: t.promotions, path: "/provider/promotions", icon: "" },
    { name: t.reports, path: "/provider/reports", icon: "" },
    { name: t.settings, path: "/provider/settings", icon: "" },
  ];

  return (
    <div className="min-h-screen bg-[hsl(210,20%,97%)] text-[hsl(220,15%,8%)] flex flex-col md:flex-row font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-black text-white flex flex-col justify-between p-6">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            <Link href="/" className="text-xl font-bold tracking-wider text-[hsl(45,60%,55%)]">
              PRIMORA
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-4 px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-[hsla(0,0%,100%,0.08)] text-[hsl(45,60%,55%)]"
                      : "text-gray-400 hover:bg-[hsla(0,0%,100%,0.03)] hover:text-white"
                  }`}
                >
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-6 border-t border-[hsla(0,0%,100%,0.08)]">
          <Link href="/" className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-xs font-semibold text-red-500 hover:bg-[hsla(0,0%,100%,0.03)] transition-all duration-200">
            <span>{t.logout}</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col">
        {/* HEADER */}
        <header className="h-20 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 w-72">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-400 text-gray-700"
            />
          </div>

          <div className="flex items-center gap-6">
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-xs font-bold hover:border-[hsl(45,60%,55%)] hover:text-[hsl(45,60%,55%)] transition-all duration-200"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-gray-400 font-bold">{t.welcome}</p>
                <p className="text-xs font-bold text-gray-800">Elite Barbershop</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-[hsl(45,60%,55%)] text-black font-bold flex items-center justify-center border border-gray-100">
                EB
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
