"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { supabase } from "@/lib/supabase";
import { clearDevRole } from "@/lib/dev-access";


const translations = {
  en: {
    dashboard: "Dashboard",
    analytics: "Analytics",
    bookings: "Bookings",
    providers: "Providers",
    customers: "Customers",
    services: "Services",
    packages: "Packages",
    orders: "Orders",
    payments: "Payments",
    payouts: "Payouts",
    commissions: "Commissions",
    reviews: "Reviews",
    disputes: "Disputes",
    reports: "Reports",
    overview: "Overview",
    management: "Management",
    teams: "Teams",
    roles: "Roles & Permissions",
    branches: "Branches",
    rooms: "Rooms & Resources",
    locations: "Locations",
    taxes: "Taxes & Fees",
    coupons: "Coupons & Offers",
    system: "System",
    integrations: "API & Integrations",
    webhooks: "Webhooks",
    systemLogs: "System Logs",
    auditLogs: "Audit Logs",
    settings: "Settings",
    logout: "Log Out",
    welcome: "Admin Root",
    roleLabel: "Super Administrator",
    searchPlaceholder: "Search for anything...",
    adminHub: "Admin Hub",
    helpTitle: "Need Help?",
    helpSubtitle: "System Support",
    langSwitch: "العربية"
  },
  ar: {
    dashboard: "لوحة المتابعة",
    analytics: "التحليلات",
    bookings: "الحجوزات",
    providers: "مقدمو الخدمات",
    customers: "العملاء",
    services: "الخدمات",
    packages: "الباقات",
    orders: "الطلبات",
    payments: "المدفوعات",
    payouts: "المدفوعات الخارجية",
    commissions: "العمولات",
    reviews: "التقييمات",
    disputes: "النزاعات والشكاوى",
    reports: "التقارير",
    overview: "نظرة عامة",
    management: "الإدارة",
    teams: "فرق العمل",
    roles: "الأدوار والصلاحيات",
    branches: "الفروع",
    rooms: "الغرف والموارد",
    locations: "المواقع",
    taxes: "الضرائب والرسوم",
    coupons: "الكوبونات والعروض",
    system: "النظام",
    integrations: "الربط والدمج (API)",
    webhooks: "تنبيهات الويب هوك",
    systemLogs: "سجلات النظام",
    auditLogs: "سجلات التدقيق",
    settings: "الإعدادات العامة",
    logout: "تسجيل الخروج",
    welcome: "مدير النظام",
    roleLabel: "مدير عام النظام",
    searchPlaceholder: "البحث عن أي شيء...",
    adminHub: "مركز الإدارة",
    helpTitle: "تحتاج مساعدة؟",
    helpSubtitle: "دعم النظام",
    langSwitch: "English"
  }
};

const getNavIcon = (nameKey: string) => {
  const s = "w-4 h-4";
  switch (nameKey) {
    case "dashboard":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" /></svg>;
    case "analytics":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2zm7 0v-9a2 2 0 00-2-2h-2a2 2 0 00-2 2v9a2 2 0 002 2h2a2 2 0 002-2zm7 0V5a2 2 0 00-2-2h-2a2 2 0 00-2 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>;
    case "bookings":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case "providers":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
    case "customers":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2m-10 0a4 4 0 11-8 0 4 4 0 018 0zm13-3h-6a3 3 0 00-3 3v2h12v-2a3 3 0 00-3-3z" /></svg>;
    case "services":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7a5 5 0 11-10 0 5 5 0 0110 0z" /></svg>;
    case "packages":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4v10M4 7v10l8 4" /></svg>;
    case "orders":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>;
    case "payments":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>;
    case "payouts":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
    case "commissions":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 11h.01M12 14h.01M12 17h.01M15 11h.01M15 14h.01M15 17h.01M9 11h.01" /></svg>;
    case "reviews":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
    case "disputes":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
    case "reports":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case "teams":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" /></svg>;
    case "roles":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m-2-2a2 2 0 00-2 2m2-2V5a2 2 0 10-4 0v2m4 0h2m-6 0h-2m-2 0a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" /></svg>;
    case "branches":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1" /></svg>;
    case "rooms":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>;
    case "locations":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case "taxes":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>;
    case "coupons":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>;
    case "integrations":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>;
    case "webhooks":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>;
    case "systemLogs":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
    case "auditLogs":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    case "settings":
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    default:
      return <svg className={s} fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>;
  }
};

type Item = { nameKey: string; path: string };
type Section = {
  titleKey: string;
  items: Item[];
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

  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }
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

  const navSections: Section[] = [
    {
      titleKey: "overview",
      items: [
        { nameKey: "dashboard", path: "/admin" },
        { nameKey: "analytics", path: "/admin/analytics" },
        { nameKey: "bookings", path: "/admin/bookings" },
        { nameKey: "providers", path: "/admin/providers" },
        { nameKey: "customers", path: "/admin/customers" },
        { nameKey: "services", path: "/admin/services" },
        { nameKey: "packages", path: "/admin/packages" },
        { nameKey: "orders", path: "/admin/orders" },
        { nameKey: "payments", path: "/admin/payments" },
        { nameKey: "payouts", path: "/admin/ledger" },
        { nameKey: "commissions", path: "/admin/commissions" },
        { nameKey: "reviews", path: "/admin/reviews" },
        { nameKey: "disputes", path: "/admin/disputes" },
        { nameKey: "reports", path: "/admin/reports" }
      ]
    },
    {
      titleKey: "management",
      items: [
        { nameKey: "teams", path: "/admin/teams" },
        { nameKey: "roles", path: "/admin/roles" },
        { nameKey: "branches", path: "/admin/branches" },
        { nameKey: "rooms", path: "/admin/rooms" },
        { nameKey: "locations", path: "/admin/locations" },
        { nameKey: "taxes", path: "/admin/taxes" },
        { nameKey: "coupons", path: "/admin/coupons" }
      ]
    },
    {
      titleKey: "system",
      items: [
        { nameKey: "integrations", path: "/admin/integrations" },
        { nameKey: "webhooks", path: "/admin/webhooks" },
        { nameKey: "systemLogs", path: "/admin/system-logs" },
        { nameKey: "auditLogs", path: "/admin/audit-logs" },
        { nameKey: "settings", path: "/admin/settings" }
      ]
    }
  ];

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <div className="primora-dashboard-skin flex flex-col md:flex-row bg-[#F7F6F3] text-black font-sans selection:bg-[#D1AF47] selection:text-white md:h-screen md:overflow-hidden">
        
        {/* ═══════════════════════════════════════════════════════ */}
        {/* SIDEBAR — Solid dark obsidian sidebar full-height       */}
        {/* ═══════════════════════════════════════════════════════ */}
        <aside className="flex-shrink-0 p-4 md:h-screen">
          <div className="primora-dashboard-sidebar flex h-full w-full flex-col rounded-[28px] border border-[#E0C46A]/60 bg-[#10120F] p-5 text-white shadow-[0_24px_70px_rgba(16,18,15,0.28),0_0_46px_rgba(209,175,71,0.24)] md:w-[280px]">
          
          {/* Logo & ADMN Badge */}
          <div className={`flex flex-shrink-0 items-center justify-between gap-3 px-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <Link href="/" className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <svg className="w-5.5 h-5.5 text-[#D1AF47]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span className="text-xl font-serif font-black tracking-[0.2em] text-[#D1AF47] hover:text-[#E0C46A] transition-colors duration-300">
                PRIMORA
              </span>
            </Link>
            <span className="rounded-full border border-[#D1AF47]/40 bg-[#D1AF47]/15 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-[#F4E7B6]">
              ADMN
            </span>
          </div>

          {/* Grouped Links (Scrollable) */}
          <nav className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pe-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navSections.map((sec) => (
              <div key={sec.titleKey} className="space-y-1">
                <span className={`block px-4 text-[9px] font-bold text-[#9C9688] uppercase tracking-widest ${isRTL ? "text-right" : "text-left"}`}>
                  {t[sec.titleKey as keyof typeof t] || sec.titleKey.toUpperCase()}
                </span>
                <div className="space-y-0.5">
                  {sec.items.map((item) => {
                    const isActive = item.path === "/admin"
                      ? pathname === "/admin" || pathname === "/admin/"
                      : pathname.startsWith(item.path);

                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        aria-current={isActive ? "page" : undefined}
                        className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-[18px] text-[13px] font-semibold transition-all duration-300 ${
                          isActive
                            ? "border border-[#E0C46A]/50 bg-[#D1AF47]/20 text-[#F4E7B6] shadow-[0_0_34px_rgba(209,175,71,0.34),inset_0_0_18px_rgba(244,231,182,0.08)]"
                            : "text-[#D9D4C8] hover:bg-white/[0.06] hover:text-white"
                        } ${isRTL ? "flex-row-reverse text-right" : "flex-row text-left"}`}
                      >
                        <span className={`flex-shrink-0 transition-colors duration-300 ${isActive ? "text-[#E0C46A]" : "text-[#8F8A80] group-hover:text-[#D1AF47]"}`}>
                          {getNavIcon(item.nameKey)}
                        </span>
                        <span className="flex-grow">{t[item.nameKey as keyof typeof t] || item.nameKey}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Sidebar Footer - Support & Admin Profile */}
          <div className="mt-3 flex-shrink-0 space-y-3 border-t border-white/10 pt-3">
            <Link
              href="/admin/settings"
              className="flex items-center justify-between p-3 bg-[#14120E]/80 border border-[#E0C46A]/60 rounded-2xl group hover:border-[#E0C46A]/70 transition-all duration-300 shadow-[0_0_38px_rgba(209,175,71,0.24),inset_0_0_18px_rgba(244,231,182,0.08)]"
            >
              <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-8 h-8 rounded-xl bg-[#D1AF47]/15 border border-[#D1AF47]/40 flex items-center justify-center text-[#F4E7B6] group-hover:text-[#D1AF47] transition duration-300">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-3.536 3.536m0 0A5 5 0 1110.12 10.12l3.536-3.536m0 0L20 4M9 15l-3 3m0 0l-3-3m3 3V9" />
                  </svg>
                </div>
                <div className={`${isRTL ? "text-right" : "text-left"}`}>
                  <h5 className="text-[11px] font-bold text-[#F4E7B6] leading-none">{t.helpTitle}</h5>
                  <p className="text-[9px] text-[#D9D4C8] font-semibold mt-0.5">{t.helpSubtitle}</p>
                </div>
              </div>
              <svg className={`w-3 h-3 text-[#D9D4C8] group-hover:text-[#D1AF47] transition duration-300 ${isRTL ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <div className={`flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`flex items-center gap-2.5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D1AF47]/25 bg-[#F4E7B6]/15 flex-shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop"
                    alt="Admin Root"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <div className="w-full h-full flex items-center justify-center text-[#F4E7B6] font-black text-xs">
                    AR
                  </div>
                </div>
                <div className={`min-w-0 ${isRTL ? "text-right" : "text-left"}`}>
                  <p className="text-[9px] text-[#9C9688] uppercase font-bold tracking-widest leading-none mb-0.5">{t.adminHub}</p>
                  <p className="text-xs font-black text-white leading-tight truncate max-w-[120px]">{t.welcome}</p>
                </div>
              </div>
              <button
                aria-label={t.logout}
                title={t.logout}
                onClick={async () => {
                  try { await supabase.auth.signOut(); } catch {}
                  clearDevRole();
                  window.location.href = "/login";
                }}
                className="p-2 rounded-xl text-[#D9D4C8] hover:bg-[#EF4444]/15 hover:text-[#F87171] transition-all duration-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MAIN PANEL CONTENT                                      */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
          <main className="primora-dashboard-content flex-grow p-6 md:overflow-y-auto">
            <div className="max-w-[1500px] mx-auto h-full">
              {children}
            </div>
          </main>
        </div>

      </div>
    </AuthGuard>
  );
}
