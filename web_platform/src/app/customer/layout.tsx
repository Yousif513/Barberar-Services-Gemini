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
    // Keep the sidebar in sync when language is toggled elsewhere (e.g. dashboard header)
    const syncFromDoc = () => {
      const docLang = document.documentElement.lang;
      if (docLang === "en" || docLang === "ar") setLocale(docLang);
    };
    const observer = new MutationObserver(syncFromDoc);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
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
    <div className="flex flex-col bg-[#F7F3EA] text-black selection:bg-[#D1AF47] selection:text-white md:h-screen md:flex-row md:overflow-hidden">

      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR — Floating white sidebar fixed to window height  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside className="flex-shrink-0 p-3 md:h-screen md:p-4">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-[#E0C46A]/60 bg-[#10120F] p-5 text-white shadow-[0_0_0_1px_rgba(244,231,182,0.14),0_24px_70px_rgba(16,18,15,0.28),0_0_46px_rgba(209,175,71,0.24)] md:w-[260px]">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 top-0 h-44 w-44 rounded-full bg-[#D1AF47]/15 blur-3xl" />
            <div className="absolute -bottom-20 right-0 h-60 w-60 rounded-full bg-[#D1AF47]/25 blur-3xl" />
            <div className="absolute inset-0 rounded-[28px] shadow-[inset_0_0_42px_rgba(244,231,182,0.12)]" />
            <svg className="absolute bottom-12 right-0 h-48 w-56 opacity-70" viewBox="0 0 220 170" fill="none" aria-hidden="true">
              <path d="M10 135L64 112L101 128L143 74L205 54" stroke="#D1AF47" strokeOpacity=".72" />
              <path d="M34 168L64 112L87 45L143 74L179 8" stroke="#D1AF47" strokeOpacity=".42" />
              {[10, 64, 101, 143, 205, 87, 179].map((x, index) => (
                <circle key={x} cx={x} cy={[135, 112, 128, 74, 54, 45, 8][index]} r="3" fill="#E0C46A" />
              ))}
            </svg>
          </div>
          {/* Logo */}
          <Link href="/" className={`relative z-10 flex flex-shrink-0 items-center gap-2.5 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
              PRIMORA
            </span>
          </Link>

          {/* Navigation Links (scrolls independently) */}
          <nav className="relative z-10 mt-6 min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-[18px] text-[13px] font-semibold transition-all duration-300 ${
                    isActive
                      ? "border border-[#E0C46A]/50 bg-[#D1AF47]/20 text-[#F4E7B6] shadow-[0_0_34px_rgba(209,175,71,0.34),inset_0_0_18px_rgba(244,231,182,0.08)]"
                      : "text-[#D9D4C8] hover:bg-white/[0.06] hover:text-white"
                  } ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
                >
                  {/* Gold active line indicator */}
                  {isActive && (
                    <span className={`absolute top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[#D1AF47] ${isRTL ? "right-0" : "left-0"}`} />
                  )}

                  <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#E0C46A]" : "text-[#8F8A80] group-hover:text-[#D1AF47]"}`}>
                    {getNavIcon(item.path)}
                  </span>

                  <span className="flex-grow">{item.name}</span>

                  {item.badge && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#E0C46A]/60 bg-[#D1AF47] text-[9px] font-bold text-[#10120F]">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer — Help & Logged-in User */}
          <div className="relative z-10 mt-3 flex-shrink-0 space-y-3 border-t border-white/10 pt-3">
          <Link
            href="/customer/search"
            className="group relative block overflow-hidden rounded-2xl border border-[#E0C46A]/60 bg-[#14120E]/80 p-3 shadow-[0_0_38px_rgba(209,175,71,0.34),inset_0_0_18px_rgba(244,231,182,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#E0C46A]/70"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-[#E0C46A]/15 blur-2xl" />
            <div className={`relative flex items-start gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl border border-[#D1AF47]/30 bg-[#D1AF47]/15 text-[#F4E7B6] shadow-[0_0_18px_rgba(209,175,71,0.25)]">
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.35 4.16L17.5 8.5l-4.15 1.34L12 14l-1.35-4.16L6.5 8.5l4.15-1.34L12 3zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14zm14 0l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
                </svg>
              </div>
              <div className={`min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
                <h5 className="text-[11px] font-black leading-none text-[#F4E7B6]">Primora AI Assistant</h5>
                <p className="mt-1 text-[9.5px] font-semibold leading-relaxed text-[#D9D4C8]">I found 2 slots this week that match your routine.</p>
                <span className="mt-2 inline-flex rounded-full border border-[#D1AF47]/40 bg-[#D1AF47]/15 px-3 py-1 text-[9px] font-black text-[#F4E7B6]">View Suggestions</span>
              </div>
            </div>
          </Link>

          <div className={`flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#D1AF47]/25 bg-[#F4E7B6]/15 text-sm font-bold text-[#F4E7B6]">
                Y
              </div>
              <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="mb-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-[#9C9688]">Gold Member</p>
                <p className="max-w-[110px] truncate text-xs font-black leading-tight text-white">Yousif</p>
              </div>
            </div>
            <Link href="/" className="rounded-xl p-2 text-[#D9D4C8] transition-all duration-300 hover:bg-white/[0.06] hover:text-[#F4E7B6]">
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
        <main className="flex-1 p-5 md:overflow-y-auto">
          {children}
        </main>
      </div>


    </div>
    </AuthGuard>
  );
}
