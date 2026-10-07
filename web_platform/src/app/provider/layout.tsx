"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { CommandResult, signOutFailedText, useOperationsLocale } from "@/components/operations-ui";
import { supabase } from "@/lib/supabase";
import { ProviderContextProvider, useProviderContext } from "./_components/provider-context";
import { clearDevRole } from "@/lib/dev-access";

// Localized Navigation Strings
const translations = {
  en: {
    dashboard: "Dashboard",
    myDay: "My day",
    loadingBusiness: "Loading your business…",
    contextFailed: "Your business could not be loaded: ",
    tryAgain: "Try again",
    calendar: "Calendar",
    bookings: "Bookings",
    services: "Services",
    employees: "Employees",
    resources: "Rooms & Resources",
    inventory: "Inventory & Suppliers",
    chain: "Chain Operations",
    developer: "Developer API",
    recurring: "Regular Appointments",
    groups: "Group Bookings",
    intake: "Intake & Patch Tests",
    identity: "Professional Identity",
    packages: "Wellness Packages",
    memberships: "Memberships",
    share: "Share & Reach",
    jobs: "Find Job Leads",
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
    wallet: "Wallet & Payouts",
    needHelp: "Need help?",
    contactSupport: "Settings & support",
    partnerHub: "Partner Hub",
    openMenu: "Open menu",
    closeMenu: "Close menu"
  },
  ar: {
    dashboard: "لوحة التحكم",
    myDay: "يومي",
    loadingBusiness: "جارٍ تحميل بيانات نشاطك…",
    contextFailed: "تعذر تحميل بيانات نشاطك: ",
    tryAgain: "إعادة المحاولة",
    calendar: "التقويم",
    bookings: "الحجوزات",
    services: "الخدمات",
    employees: "الموظفين",
    resources: "الغرف والموارد",
    inventory: "المخزون والموردون",
    chain: "عمليات الفروع",
    developer: "واجهة المطورين",
    recurring: "المواعيد المنتظمة",
    groups: "الحجوزات الجماعية",
    intake: "الاستمارات واختبار الحساسية",
    identity: "الهوية المهنية",
    packages: "باقات العافية",
    memberships: "العضويات",
    share: "المشاركة والانتشار",
    jobs: "فرص العمل المتاحة",
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
    wallet: "المحفظة والمدفوعات",
    needHelp: "تحتاج مساعدة؟",
    contactSupport: "الإعدادات والدعم",
    partnerHub: "بوابة الشركاء",
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
  if (path.includes("calendar") || path.includes("my-day")) {
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
  if (path.includes("inventory")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7.5l-8-4-8 4m16 0l-8 4m8-4v9l-8 4m0-9L4 7.5m8 4v9M4 7.5v9l8 4" />
      </svg>
    );
  }
  if (path.includes("share")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    );
  }
  if (path.includes("team") || path.includes("employees")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    );
  }
  if (path.includes("customers")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
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
  if (path.includes("promotions")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    );
  }
  if (path.includes("reports")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    );
  }
  if (path.includes("developer")) {
    return (
      <svg className={strokeClass} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
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

// Keep navigation groups anchored to their destination as tabs are added.
const separatorAfterPaths = ["/provider/jobs", "/provider/customers"];

function ProviderShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = useOperationsLocale();
  const pathname = usePathname();
  // Conversations with a message the shop has not opened; nothing is shown when it cannot be read.
  const [unreadMessages, setUnreadMessages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { count, error } = await supabase.from("conversations").select("id", { count: "exact", head: true }).eq("unread_for_provider", true);
      if (!cancelled) setUnreadMessages(error ? 0 : (count ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  const router = useRouter();
  // The phone menu closes on navigation because it is keyed to the path it was opened on.
  const [navOpenPath, setNavOpenPath] = useState<string | null>(null);
  const navOpen = navOpenPath === pathname;
  // The business and the person's role come from my_provider_context, not from owner_id: an employee owns nothing.
  const providerState = useProviderContext();
  const providerCtx = providerState.status === "ready" ? providerState.context : null;
  const business = providerCtx && providerCtx.role !== "none"
    ? { en: providerCtx.businessNameEn || providerCtx.businessNameAr, ar: providerCtx.businessNameAr || providerCtx.businessNameEn }
    : null;
  const isEmployee = providerCtx?.role === "employee";
  const onMyDay = pathname.startsWith("/provider/my-day");
  useEffect(() => {
    if (isEmployee && !onMyDay) router.replace("/provider/my-day");
  }, [isEmployee, onMyDay, router]);

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
  const t = translations[locale];
  const isRTL = locale === "ar";

  const toggleLanguage = () => {
    const next = locale === "en" ? "ar" : "en";
    localStorage.setItem("primora_lang", next);
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = next;
  };

  const identityItem = { name: t.identity, path: "/provider/identity" };
  const ownerNav = [
    { name: t.dashboard, path: "/provider/dashboard" },
    { name: t.calendar, path: "/provider/calendar" },
    { name: t.bookings, path: "/provider/bookings" },
    { name: t.services, path: "/provider/services" },
    { name: t.resources, path: "/provider/resources" },
    { name: t.inventory, path: "/provider/inventory" },
    { name: t.chain, path: "/provider/chain" },
    { name: t.developer, path: "/provider/developer" },
    { name: t.recurring, path: "/provider/recurring" },
    { name: t.groups, path: "/provider/groups" },
    { name: t.intake, path: "/provider/intake" },
    { name: t.packages, path: "/provider/packages" },
    { name: t.memberships, path: "/provider/memberships" },
    { name: t.share, path: "/provider/share" },
    { name: t.jobs, path: "/provider/jobs" },
    { name: t.wallet, path: "/provider/wallet" },
    { name: t.messages, path: "/provider/messages" },
    { name: t.employees, path: "/provider/employees" },
    identityItem,
    { name: t.customers, path: "/provider/customers" },
    { name: t.reviews, path: "/provider/reviews" },
    { name: t.promotions, path: "/provider/promotions" },
    { name: t.reports, path: "/provider/reports" },
    { name: t.settings, path: "/provider/settings" },
  ];
  // A professional works from one screen; the owner's management screens stay hidden from them (and refuse them in the database).
  const navItems = isEmployee ? [{ name: t.myDay, path: "/provider/my-day" }, identityItem] : ownerNav;

  return (
    <AuthGuard allowedRoles={["provider_owner", "provider_employee"]}>
      <CommandResult error={signOutFailed ? signOutFailedText[locale] : undefined} locale={locale} onDismiss={() => setSignOutFailed(false)} />
    <div className="primora-dashboard-skin flex flex-col md:flex-row bg-[radial-gradient(circle_at_20%_10%,rgba(209,175,71,0.13),transparent_32%),linear-gradient(135deg,#F8F6EF_0%,#F2EEE4_46%,#E9E2D2_100%)] text-black font-sans selection:bg-[#D1AF47] selection:text-white md:h-screen md:overflow-hidden">
      
      {/* ═══════════════════════════════════════════════════════ */}
      {/* SIDEBAR — Floating white sidebar fixed to window height  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <aside className="flex-shrink-0 p-4 md:h-screen">
        <div className="primora-dashboard-sidebar relative flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-[#E0C46A]/60 bg-[radial-gradient(circle_at_22%_0%,rgba(224,196,106,0.22),transparent_36%),linear-gradient(160deg,#221C12_0%,#171814_46%,#2B2417_100%)] p-5 text-[#F8F5EA] shadow-[0_24px_70px_rgba(16,18,15,0.22),0_0_46px_rgba(209,175,71,0.24)] md:w-[280px]">
          {/* Logo and phone menu toggle */}
          <div className="flex flex-shrink-0 flex-row items-center justify-between gap-3">
          <Link href="/" className={`flex flex-shrink-0 items-center gap-2.5 px-2 flex-row`}>
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
            aria-controls="provider-navigation"
            aria-label={navOpen ? t.closeMenu : t.openMenu}
            className="rounded-xl border border-white/15 p-2 text-[#F4E7B6] transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#E0C46A] md:hidden"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d={navOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          </div>

          {/* Navigation Links (scrolls independently) */}
          <nav id="provider-navigation" className={`mt-6 min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${navOpen ? "block" : "hidden"} md:block`}>
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path);
              const isMessages = item.path.includes("messages");

              return (
                <React.Fragment key={item.path}>
                  <Link
                    href={item.path}
                    aria-current={isActive ? "page" : undefined}
                    className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-[18px] text-[13px] font-semibold transition-all duration-300 ${
                      isActive
                        ? "border border-[#E0C46A]/50 bg-[#D1AF47]/20 text-[#F4E7B6] shadow-[0_0_34px_rgba(209,175,71,0.34),inset_0_0_18px_rgba(244,231,182,0.08)]"
                        : "text-[#EFE7D8] hover:bg-[#ffffff]/[0.08] hover:text-white"
                    } flex-row text-start`}
                  >
                    <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#E0C46A]" : "text-[#C8BFAE] group-hover:text-[#E0C46A]"}`}>
                      {getNavIcon(item.path)}
                    </span>

                    <span className="flex-grow">{item.name}</span>

                    {/* Notification dot */}
                    {isMessages && unreadMessages > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5D73] px-1 text-[11px] font-bold text-white">{unreadMessages}</span>
                    )}
                  </Link>

                  {/* Separator lines between nav groups */}
                  {separatorAfterPaths.includes(item.path) && (
                    <div className="my-2 mx-4">
                      <div className="h-px bg-white/10" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Sidebar Footer — Support & Logout */}
          <div className={`mt-3 flex-shrink-0 space-y-3 border-t border-white/10 pt-3 ${navOpen ? "block" : "hidden"} md:block`}>
            {/* Help Support Card */}
            <Link
              href="/provider/settings"
              className="flex items-center justify-between p-3 bg-[#14120E]/80 border border-[#E0C46A]/60 rounded-2xl group hover:border-[#E0C46A]/70 transition-all duration-300 shadow-[0_0_38px_rgba(209,175,71,0.24),inset_0_0_18px_rgba(244,231,182,0.08)]"
            >
              <div className={`flex items-center gap-3 flex-row`}>
                <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/15 border border-[#D1AF47]/40 flex items-center justify-center text-[#F4E7B6] group-hover:text-[#D1AF47] transition duration-300">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0A5 5 0 1110.12 10.12l3.536-3.536m0 0L20 4M9 15l-3 3m0 0l-3-3m3 3V9" />
                  </svg>
                </div>
                <div className={`text-left text-start`}>
                  <h5 className="text-[11px] font-bold text-[#F4E7B6] leading-none">{t.needHelp}</h5>
                  <p className="text-[9px] text-[#EFE7D8] font-semibold mt-0.5">{t.contactSupport}</p>
                </div>
              </div>
              <svg className={`w-3 h-3 text-[#EFE7D8] group-hover:text-[#E0C46A] transition duration-300 ${isRTL ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* User Initials Avatar & Logout */}
            <div className={`flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#ffffff]/[0.03] px-2 py-2 flex-row`}>
              <div className={`flex items-center gap-2.5 flex-row`}>
                <div className="w-9 h-9 rounded-full bg-[#F4E7B6]/15 border border-[#D1AF47]/25 flex items-center justify-center text-[#F4E7B6] font-bold text-sm flex-shrink-0">
                  {(business?.[locale] || "").trim().charAt(0).toUpperCase() || "•"}
                </div>
                <div className={`hidden md:block text-end`}>
                  <p className="text-[9px] text-[#D0C5AF] uppercase font-bold tracking-widest leading-none mb-0.5">{t.partnerHub}</p>
                  <p className="text-xs font-black text-white leading-tight truncate max-w-[110px]">{business?.[locale] || ""}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label={t.logout}
                title={t.logout}
                className="p-2 rounded-xl text-[#EFE7D8] hover:bg-[#ffffff]/[0.08] hover:text-[#F4E7B6] transition-all duration-300"
              >
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

        {/* ── HEADER (80px) ── */}
        {!(pathname === "/provider/dashboard" || pathname === "/provider/dashboard/") && (
          <header className="mx-5 mt-5 h-[72px] rounded-[26px] border border-[#ECECEC] bg-white px-6 flex items-center justify-between sticky top-5 z-40 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">

          
          {/* Spacer keeps the controls on the end side; there is no global search to offer here. */}
          <div aria-hidden="true" />

          <div className={`flex items-center gap-6 flex-row`}>
            {/* Language Switcher Button */}
            <button
              onClick={toggleLanguage}
              className="px-5 py-2.5 rounded-2xl border border-[#ECECEC] bg-white text-xs font-bold text-gray-700 hover:border-[#D1AF47]/40 hover:text-[#D1AF47] transition-all duration-300"
            >
              {t.langSwitch}
            </button>

            {/* Profile Menu */}
            <div className={`flex items-center gap-4 flex-row`}>
              <div className={`hidden sm:block text-end`}>
                <p className="text-[10px] text-[#667085] font-semibold uppercase tracking-[0.15em] leading-none mb-1">{t.welcome}</p>
                <p className="text-sm font-bold text-[#101828] tracking-wide">{business?.[locale] || ""}</p>
              </div>
              <div
                className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-[#101828] font-black text-sm flex items-center justify-center shadow-[0_0_20px_rgba(209,175,71,0.15)]"
              >
                {(business?.[locale] || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "•"}
              </div>
            </div>
          </div>
        </header>
      )}
        {/* ── PAGES WRAPPER ── */}
        <main className="primora-dashboard-content flex-1 p-5 md:overflow-y-auto">
          {providerState.status === "loading" ? (
            <p role="status" className="p-6 text-sm font-semibold text-[#667085]">{t.loadingBusiness}</p>
          ) : providerState.status === "error" ? (
            <div role="alert" className="m-6 rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-5 text-sm font-semibold text-[#B42318]">
              <p>{t.contextFailed}{providerState.message}</p>
              <button type="button" onClick={providerState.retry} className="mt-3 rounded-xl border border-[#B42318] bg-white px-4 py-2 text-xs font-black text-[#B42318] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.tryAgain}</button>
            </div>
          ) : isEmployee && !onMyDay ? null : (
            children
          )}
        </main>
      </div>

    </div>
    </AuthGuard>
  );
}

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProviderContextProvider>
      <ProviderShell>{children}</ProviderShell>
    </ProviderContextProvider>
  );
}
