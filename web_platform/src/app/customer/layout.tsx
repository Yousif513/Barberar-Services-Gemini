"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Localized Navigation Strings
const translations = {
  en: {
    dashboard: "Dashboard",
    bookings: "Bookings",
    packages: "My Packages",
    favorites: "Favorites",
    messages: "Messages",
    reviews: "Reviews",
    wallet: "Wallet",
    notifications: "Notifications",
    settings: "Settings",
    logout: "Log Out",
    welcome: "Welcome back,",
    searchPlaceholder: "Search services...",
    langSwitch: "العربية"
  },
  ar: {
    dashboard: "لوحة التحكم",
    bookings: "الحجوزات",
    packages: "باقاتي",
    favorites: "المفضلة",
    messages: "الرسائل",
    reviews: "التقييمات",
    wallet: "المحفظة",
    notifications: "التنبيهات",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث عن الخدمات...",
    langSwitch: "English"
  }
};

export default function CustomerLayout({
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
    { name: t.dashboard, path: "/customer/dashboard", icon: "📊" },
    { name: t.bookings, path: "/customer/bookings", icon: "📅" },
    { name: t.packages, path: "/customer/packages", icon: "🎁" },
    { name: t.favorites, path: "/customer/favorites", icon: "❤️" },
    { name: t.messages, path: "/customer/messages", icon: "💬", badge: 3 },
    { name: t.reviews, path: "/customer/reviews", icon: "⭐" },
    { name: t.wallet, path: "/customer/wallet", icon: "💳" },
    { name: t.notifications, path: "/customer/notifications", icon: "🔔" },
    { name: t.settings, path: "/customer/settings", icon: "⚙️" },
  ];

  return (
    <div className="min-h-screen bg-[hsl(210,20%,97%)] text-[hsl(220,15%,8%)] flex flex-col md:flex-row font-sans">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-black text-white flex flex-col justify-between p-6">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 px-2">
            <span className="text-2xl">✨</span>
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
                  className={`flex items-center justify-between px-4 py-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? "bg-[hsla(0,0%,100%,0.08)] text-[hsl(45,60%,55%)]"
                      : "text-gray-400 hover:bg-[hsla(0,0%,100%,0.03)] hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="bg-[hsl(45,60%,55%)] text-black font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-6 border-t border-[hsla(0,0%,100%,0.08)]">
          <Link href="/" className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-xs font-semibold text-red-500 hover:bg-[hsla(0,0%,100%,0.03)] transition-all duration-200">
            <span>🚪</span>
            <span>{t.logout}</span>
          </Link>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col">
        {/* HEADER */}
        <header className="h-20 bg-white border-b border-gray-200 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 w-72">
            <span>🔍</span>
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
                <p className="text-xs font-bold text-gray-800">Yousif</p>
              </div>
              <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-100">
                <img src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" alt="Yousif" className="w-full h-full object-cover" />
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
