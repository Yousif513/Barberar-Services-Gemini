"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { supabase } from "@/lib/supabase";
import { clearDevRole } from "@/lib/dev-access";
import { CommandResult, signOutFailedText } from "@/components/operations-ui";


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
    customerAccount: "Customer account",
    welcome: "Welcome back,",
    searchPlaceholder: "Search services...",
    langSwitch: "العربية",
    openMenu: "Open menu",
    closeMenu: "Close menu"
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
    customerAccount: "حساب العميل",
    welcome: "مرحباً بك،",
    searchPlaceholder: "البحث عن الخدمات...",
    langSwitch: "English",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة"
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    );
  }
  if (path.includes("reviews")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
  // Persist the language only after the saved choice has been read (avoids overwriting it on mount).
  const [langReady, setLangReady] = useState(false);
  const pathname = usePathname();
  // Conversations with a message the customer has not opened; read from the same table the Messages screen uses.
  // Nothing is shown when it cannot be read, rather than a number that was not counted.
  const [unreadMessages, setUnreadMessages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { count, error } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("unread_for_customer", true);
      if (!cancelled) setUnreadMessages(error ? 0 : (count ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  // The phone menu closes on navigation because it is keyed to the path it was opened on.
  const [navOpenPath, setNavOpenPath] = useState<string | null>(null);
  const navOpen = navOpenPath === pathname;
  const t = translations[locale];

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || cancelled) return;
      const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", data.user.id).maybeSingle();
      if (!cancelled) setFirstName(profile?.first_name || "");
    });
    return () => { cancelled = true; };
  }, []);

  // Local scope: leaving this device must not end the person's sessions on their other devices. A failure is shown,
  // and they stay signed in, because the session is still on this device.
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOut = async () => {
    setSignOutFailed(false);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        setSignOutFailed(true);
        return;
      }
    } catch {
      setSignOutFailed(true);
      return;
    }
    clearDevRole();
    router.replace("/login");
  };
  const isRTL = locale === "ar";

  const toggleLanguage = () => {
    setLocale((prev) => (prev === "en" ? "ar" : "en"));
  };

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
    setLangReady(true);
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
    if (!langReady) return;
    localStorage.setItem("primora_lang", locale);
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale, langReady]);

  const navItems = [
    { name: t.dashboard, path: "/customer/dashboard" },
    { name: t.bookings, path: "/customer/bookings" },
    { name: t.packages, path: "/customer/packages" },
    { name: t.jobs, path: "/customer/jobs" },
    { name: t.favorites, path: "/customer/favorites" },
    { name: t.messages, path: "/customer/messages", badge: unreadMessages > 0 ? unreadMessages : undefined },
    { name: t.reviews, path: "/customer/reviews" },
    { name: t.wallet, path: "/customer/wallet" },
    { name: t.notifications, path: "/customer/notifications" },
    { name: t.settings, path: "/customer/settings" },
  ];

  return (
    <AuthGuard allowedRoles={["customer"]}>
      <CommandResult error={signOutFailed ? signOutFailedText[locale] : undefined} locale={locale} onDismiss={() => setSignOutFailed(false)} />
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
            <svg className="absolute bottom-12 right-0 h-48 w-56 opacity-80" viewBox="0 0 220 170" fill="none" aria-hidden="true">
              <defs>
                <filter id="sidebarMeshGlow" x="-35%" y="-35%" width="170%" height="170%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feColorMatrix in="blur" values="1 0 0 0 0.95 0 1 0 0 0.68 0 0 1 0 0.20 0 0 0 0.95 0" />
                  <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path d="M10 135L64 112L101 128L143 74L205 54" stroke="#D1AF47" strokeOpacity=".82" filter="url(#sidebarMeshGlow)" />
              <path d="M34 168L64 112L87 45L143 74L179 8" stroke="#D1AF47" strokeOpacity=".52" filter="url(#sidebarMeshGlow)" />
              {[10, 64, 101, 143, 205, 87, 179].map((x, index) => (
                <circle key={`halo-${x}`} cx={x} cy={[135, 112, 128, 74, 54, 45, 8][index]} r={index === 4 ? "8" : "6"} fill="#F4E7B6" fillOpacity=".28" filter="url(#sidebarMeshGlow)" />
              ))}
              {[10, 64, 101, 143, 205, 87, 179].map((x, index) => (
                <circle key={x} cx={x} cy={[135, 112, 128, 74, 54, 45, 8][index]} r={index === 4 ? "4.4" : "3.2"} fill="#F7E6A6" filter="url(#sidebarMeshGlow)" />
              ))}
            </svg>
          </div>
          {/* Logo and phone menu toggle */}
          <div className="relative z-10 flex flex-shrink-0 flex-row items-center justify-between gap-3">
          <Link href="/" className={`relative z-10 flex flex-shrink-0 items-center gap-2.5 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
              PRIMORA
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setNavOpenPath(navOpen ? null : pathname)}
            aria-expanded={navOpen}
            aria-controls="customer-navigation"
            aria-label={navOpen ? t.closeMenu : t.openMenu}
            className="rounded-xl border border-white/15 p-2 text-[#F4E7B6] transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#E0C46A] md:hidden"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={navOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          </div>

          {/* Navigation Links (scrolls independently) */}
          <nav id="customer-navigation" className={`relative z-10 mt-6 min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${navOpen ? "block" : "hidden"} md:block`}>
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
          <div className={`relative z-10 mt-3 flex-shrink-0 space-y-3 border-t border-white/10 pt-3 ${navOpen ? "block" : "hidden"} md:block`}>
          <div className={`flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#D1AF47]/25 bg-[#F4E7B6]/15 text-sm font-bold text-[#F4E7B6]">
                {firstName.trim().charAt(0).toUpperCase() || "•"}
              </div>
              <div className={`hidden md:block ${isRTL ? "text-left" : "text-right"}`}>
                <p className="mb-0.5 text-[9px] font-bold uppercase leading-none tracking-widest text-[#9C9688]">{t.customerAccount}</p>
                <p className="max-w-[110px] truncate text-xs font-black leading-tight text-white">{firstName}</p>
              </div>
            </div>
            <button type="button" onClick={() => void signOut()} aria-label={t.logout} title={t.logout} className="rounded-xl p-2 text-[#D9D4C8] transition-all duration-300 hover:bg-white/[0.06] hover:text-[#F4E7B6]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
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
            <Link
              href="/customer/search"
              className={`flex items-center gap-3 bg-[#F7F7F5] border border-[#E8E8E8] px-5 py-3 rounded-2xl w-80 max-w-[60vw] text-sm text-[#475467] hover:border-[#D1AF47]/30 focus-visible:outline-2 focus-visible:outline-[#9B7928] transition-all duration-300 ${isRTL ? "flex-row-reverse" : "flex-row"}`}
            >
              <svg aria-hidden="true" className="w-4 h-4 flex-shrink-0 text-[#667085]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="truncate">{t.searchPlaceholder}</span>
            </Link>

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
                  <p className="text-xs font-bold text-gray-900 leading-tight">{firstName}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E8E8] bg-[#F4E7B6] text-sm font-black text-[#9A7B1E] shadow-[0_0_15px_rgba(209,175,71,0.1)]">
                  {firstName.trim().charAt(0).toUpperCase() || "•"}
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
