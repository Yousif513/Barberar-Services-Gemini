"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";

// Localized Navigation Strings
const translations = {
  en: {
    dashboard: "Dashboard",
    bookings: "Bookings",
    packages: "My Packages",
    jobs: "Service Requests",
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
    jobs: "طلبات الخدمات",
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

const getNavIcon = (path: string) => {
  const strokeClass = "w-5 h-5";
  if (path.includes("dashboard")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
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
  if (path.includes("packages")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
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
  if (path.includes("favorites")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
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
  if (path.includes("reviews")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915" />
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
  if (path.includes("notifications")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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

export default function CustomerLayout({
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
    { name: t.dashboard, path: "/customer/dashboard" },
    { name: t.bookings, path: "/customer/bookings" },
    { name: t.packages, path: "/customer/packages" },
    { name: t.jobs, path: "/customer/jobs" },
    { name: t.favorites, path: "/customer/favorites" },
    { name: t.messages, path: "/customer/messages", badge: 3 },
    { name: t.reviews, path: "/customer/reviews" },
    { name: t.wallet, path: "/customer/wallet" },
    { name: t.notifications, path: "/customer/notifications" },
    { name: t.settings, path: "/customer/settings" },
  ];

  return (
    <AuthGuard allowedRoles={["customer"]}>
    <div className="min-h-screen bg-[#F7F7F5] text-black flex flex-col md:flex-row font-sans selection:bg-[#D1AF47] selection:text-white">
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR (280px) — Premium Floating White Sidebar        */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside className="w-full md:w-[280px] flex flex-col justify-between p-6 flex-shrink-0 bg-white rounded-[28px] border border-[#E8E8E8] shadow-[0_10px_30px_rgba(0,0,0,0.04)] m-6 relative">
        <div>
          {/* Logo & Notifications */}
          <div className={`flex items-center justify-between mb-8 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <Link href="/" className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
                PRIMORA
              </span>
            </Link>
            <button className="p-2.5 rounded-2xl bg-white border border-[#E8E8E8] hover:border-[#D1AF47]/30 hover:bg-[#F7F7F5] transition-all duration-300 text-[#D1AF47]">
              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-0.5 max-h-[55vh] overflow-y-auto pr-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
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

                  {item.badge && (
                    <span className="bg-[#FF5D73] text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer — Help & Logged-in User */}
        <div className="pt-4 mt-2 border-t border-gray-100 space-y-4">
          <Link
            href="/customer/settings"
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

          <div className={`flex items-center justify-between gap-2 px-1 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="w-9 h-9 rounded-full bg-[#F4E7B6]/40 border border-[#D1AF47]/20 flex items-center justify-center text-[#B8952E] font-bold text-sm flex-shrink-0">
                Y
              </div>
              <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="text-[9px] text-gray-400 uppercase font-bold tracking-widest leading-none mb-0.5">Member Hub</p>
                <p className="text-xs font-black text-gray-900 leading-tight truncate max-w-[110px]">Yousif</p>
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
        {!(pathname === "/customer/dashboard" || pathname === "/customer/dashboard/") && (
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
                  <p className="text-[10px] text-gray-400 font-bold leading-none mb-1">{t.welcome}</p>
                  <p className="text-xs font-bold text-gray-900 leading-tight">Yousif</p>
                </div>
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E8E8E8] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
                  <img src="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=200&auto=format&fit=crop" alt="Yousif" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
          </header>
        )}

        {/* PAGES WRAPPER */}
        <main className="flex-grow p-8 overflow-y-auto relative">
          {children}
        </main>
      </div>

    </div>
    </AuthGuard>
  );
}
