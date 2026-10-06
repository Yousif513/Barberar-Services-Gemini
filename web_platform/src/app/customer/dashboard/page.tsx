"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";

type Locale = "en" | "ar";
type Bilingual = { en: string; ar: string };
type BookingStatus = "pending_payment" | "confirmed" | "completed" | "cancelled" | "no_show";

type Booking = {
  id: string;
  scheduledAt: string;
  status: BookingStatus;
  total: number;
  service: Bilingual;
  category: Bilingual;
  stylist: Bilingual;
  provider: Bilingual;
};

type Recommendation = { providerId: string; provider: Bilingual; service: Bilingual; price: number | null; rating: number | null };
type Favorite = { providerId: string; name: Bilingual };

const both = (en?: string | null, ar?: string | null): Bilingual => ({ en: en || ar || "", ar: ar || en || "" });
const UPCOMING: BookingStatus[] = ["pending_payment", "confirmed"];
const SEGMENT_COLORS = ["#1A1A1A", "#C9A24B", "#E5D5A8", "#8A7F6C"];

const translations = {
  en: {
    welcome: "Welcome back", subtitle: "Here's what's happening with your account today.",
    search: "Search pages...", lang: "العربية",
    nextAppointment: "Next Appointment", with: "with", viewDetails: "View Details", startsIn: "Starts in",
    day: "Days", hrs: "Hrs", mins: "Mins", secs: "Secs",
    noUpcoming: "No upcoming appointments", noUpcomingHint: "Find a shop and book your next visit.", findService: "Find a service",
    awaitingPayment: "Awaiting payment",
    recommended: "Popular Near You", viewAll: "View All", noRecommendations: "No shops are listed yet.",
    favoriteProviders: "Favorite Providers", viewAllProviders: "View All Providers", noFavorites: "Save shops you like to find them here.",
    bookings: "Bookings", upcomingTab: "Upcoming", historyTab: "History", noBookings: "No bookings here yet.",
    loyalty: "Loyalty & Wallet", details: "Details", points: "points", tier: { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum" } as Record<string, string>,
    walletBalance: "Wallet credit", loyaltyOff: "Loyalty points are not active yet.",
    insights: "Spending", thisMonth: "This Month", totalSpent: "Completed visits", noSpending: "No completed visits this month.",
    loadFailed: "Some of your information could not be loaded",
    status: { pending_payment: "Awaiting payment", confirmed: "Upcoming", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as Record<BookingStatus, string>,
    noResults: "No matches found", in: "in", sar: "SAR",
  },
  ar: {
    welcome: "مرحباً بعودتك", subtitle: "إليك ما يحدث في حسابك اليوم.",
    search: "ابحث في الصفحات...", lang: "EN",
    nextAppointment: "الموعد القادم", with: "مع", viewDetails: "عرض التفاصيل", startsIn: "يبدأ خلال",
    day: "أيام", hrs: "ساعة", mins: "دقيقة", secs: "ثانية",
    noUpcoming: "لا توجد مواعيد قادمة", noUpcomingHint: "ابحث عن مركز واحجز زيارتك القادمة.", findService: "ابحث عن خدمة",
    awaitingPayment: "بانتظار الدفع",
    recommended: "الأكثر طلباً بالقرب منك", viewAll: "عرض الكل", noRecommendations: "لا توجد مراكز مدرجة بعد.",
    favoriteProviders: "المزودون المفضلون", viewAllProviders: "عرض كل المزودين", noFavorites: "احفظ المراكز التي تعجبك لتجدها هنا.",
    bookings: "الحجوزات", upcomingTab: "القادمة", historyTab: "السابقة", noBookings: "لا توجد حجوزات هنا بعد.",
    loyalty: "الولاء والمحفظة", details: "التفاصيل", points: "نقطة", tier: { bronze: "برونزي", silver: "فضي", gold: "ذهبي", platinum: "بلاتيني" } as Record<string, string>,
    walletBalance: "رصيد المحفظة", loyaltyOff: "نقاط الولاء غير مفعلة بعد.",
    insights: "الإنفاق", thisMonth: "هذا الشهر", totalSpent: "زيارات مكتملة", noSpending: "لا توجد زيارات مكتملة هذا الشهر.",
    loadFailed: "تعذر تحميل بعض معلوماتك",
    status: { pending_payment: "بانتظار الدفع", confirmed: "قادم", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر" } as Record<BookingStatus, string>,
    noResults: "لا توجد نتائج", in: "في", sar: "ر.س",
  },
};

const PAGE_INDEX = [
  { label: { en: "My Bookings", ar: "حجوزاتي" }, href: "/customer/bookings" },
  { label: { en: "My Packages", ar: "باقاتي" }, href: "/customer/packages" },
  { label: { en: "Wallet & Rewards", ar: "المحفظة والمكافآت" }, href: "/customer/wallet" },
  { label: { en: "Messages", ar: "الرسائل" }, href: "/customer/messages" },
  { label: { en: "Reviews", ar: "التقييمات" }, href: "/customer/reviews" },
  { label: { en: "Notifications", ar: "الإشعارات" }, href: "/customer/notifications" },
  { label: { en: "Settings", ar: "الإعدادات" }, href: "/customer/settings" },
  { label: { en: "Favorites", ar: "المفضلة" }, href: "/customer/favorites" },
  { label: { en: "Find Providers", ar: "ابحث عن مزودين" }, href: "/discover" },
];

function NeuralMesh({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  const stroke = dark ? "#F4E7B6" : "#D1AF47";
  const softStroke = dark ? "#E0C46A" : "#B8952E";
  const glow = dark ? "#F7E6A6" : "#E0C46A";
  const glowId = React.useId();
  const nodes = [12, 66, 118, 166, 238, 336, 96, 208, 306, 156, 282].map((x, index) => ({
    x,
    y: [142, 98, 118, 58, 84, 22, 28, 18, 126, 156, 42][index],
    hot: index === 3 || index === 4 || index === 5,
  }));

  return (
    <svg className={`pointer-events-none absolute ${className}`} viewBox="0 0 360 180" fill="none" aria-hidden="true">
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feColorMatrix in="blur" values="1 0 0 0 0.97 0 1 0 0 0.70 0 0 1 0 0.22 0 0 0 1 0" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M12 142L66 98L118 118L166 58L238 84L336 22" stroke={stroke} strokeOpacity=".72" strokeWidth="1.25" filter={`url(#${glowId})`} />
      <path d="M42 172L66 98L96 28L166 58L208 18L238 84L306 126" stroke={softStroke} strokeOpacity=".46" strokeWidth="1" filter={`url(#${glowId})`} />
      <path d="M118 118L156 156L238 84L282 42L336 22" stroke={stroke} strokeOpacity=".36" strokeWidth=".9" filter={`url(#${glowId})`} />
      {nodes.map((node) => (
        <circle key={`halo-${node.x}`} cx={node.x} cy={node.y} r={node.hot ? "10" : "6.5"} fill={glow} fillOpacity={node.hot ? ".34" : ".18"} filter={`url(#${glowId})`} />
      ))}
      {nodes.map((node, index) => (
        <circle key={node.x} cx={node.x} cy={node.y} r={node.hot ? "4.8" : index % 3 === 0 ? "4" : "3.1"} fill={glow} fillOpacity={node.hot ? "1" : ".78"} filter={`url(#${glowId})`} />
      ))}
    </svg>
  );
}

function CornerGlow({ dark = false }: { dark?: boolean }) {
  const horizontal = dark
    ? "bg-gradient-to-r from-[#F7E6A6]/95 via-[#E0C46A]/70 to-transparent shadow-[0_0_14px_rgba(244,231,182,0.55)]"
    : "bg-gradient-to-r from-[#D1AF47]/85 via-[#E0C46A]/50 to-transparent shadow-[0_0_12px_rgba(209,175,71,0.36)]";
  const vertical = dark
    ? "bg-gradient-to-b from-[#F7E6A6]/95 via-[#E0C46A]/70 to-transparent shadow-[0_0_14px_rgba(244,231,182,0.55)]"
    : "bg-gradient-to-b from-[#D1AF47]/85 via-[#E0C46A]/50 to-transparent shadow-[0_0_12px_rgba(209,175,71,0.36)]";
  const dot = dark ? "bg-[#F7E6A6] shadow-[0_0_18px_rgba(244,231,182,0.80)]" : "bg-[#E0C46A] shadow-[0_0_16px_rgba(209,175,71,0.60)]";

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      <span className={`absolute left-4 top-0 h-px w-14 ${horizontal}`} />
      <span className={`absolute left-0 top-4 h-14 w-px ${vertical}`} />
      <span className={`absolute right-4 top-0 h-px w-14 rotate-180 ${horizontal}`} />
      <span className={`absolute right-0 top-4 h-14 w-px ${vertical}`} />
      <span className={`absolute bottom-0 left-4 h-px w-14 ${horizontal}`} />
      <span className={`absolute bottom-4 left-0 h-14 w-px rotate-180 ${vertical}`} />
      <span className={`absolute bottom-0 right-4 h-px w-14 rotate-180 ${horizontal}`} />
      <span className={`absolute bottom-4 right-0 h-14 w-px rotate-180 ${vertical}`} />
      <span className={`absolute right-3 top-3 h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className={`absolute bottom-3 left-3 h-1.5 w-1.5 rounded-full ${dot}`} />
    </div>
  );
}

export default function CustomerDashboard() {
  const [locale, setLocale] = useState<Locale>("en");
  const [userName, setUserName] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyalty, setLoyalty] = useState<{ points: number; tier: string } | null>(null);
  const [walletCredit, setWalletCredit] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [bookingTab, setBookingTab] = useState<"upcoming" | "history">("upcoming");
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const isRTL = locale === "ar";
  const t = translations[locale];

  useEffect(() => {
    const sync = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const toggleLang = () => {
    const target = locale === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLocale(target);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, bookingRes, favoriteRes, settingRes, loyaltyRes, walletRes, notificationRes, searchRes] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("bookings")
          .select("id, scheduled_at, status, total_price, services(name_en, name_ar, categories(name_en, name_ar)), employees(name_en, name_ar), branches(providers(business_name_en, business_name_ar))")
          .eq("customer_id", user.id)
          .order("scheduled_at", { ascending: false })
          .limit(50),
        supabase.from("customer_favorites").select("provider_id, providers(business_name_en, business_name_ar)").eq("customer_id", user.id).limit(4),
        supabase.from("platform_settings").select("value").eq("key", "loyalty_program").maybeSingle(),
        supabase.from("customer_loyalty").select("points_balance, tier").eq("customer_id", user.id),
        supabase.from("wallet_credits").select("amount, expires_at").eq("customer_id", user.id).eq("is_spent", false),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false),
        supabase.rpc("search_marketplace_providers", { p_limit: 4 }),
      ]);
      const failures = [profileRes, bookingRes, favoriteRes, settingRes, loyaltyRes, walletRes, notificationRes, searchRes]
        .map((r) => r.error?.message).filter(Boolean);
      if (failures.length) setLoadError(failures.join("; "));

      if (profileRes.data?.first_name) setUserName(profileRes.data.first_name);
      setBookings((bookingRes.data || []).map((row: any) => ({
        id: row.id,
        scheduledAt: row.scheduled_at,
        status: row.status,
        total: Number(row.total_price || 0),
        service: both(row.services?.name_en, row.services?.name_ar),
        category: both(row.services?.categories?.name_en, row.services?.categories?.name_ar),
        stylist: both(row.employees?.name_en, row.employees?.name_ar),
        provider: both(row.branches?.providers?.business_name_en, row.branches?.providers?.business_name_ar),
      })));
      setFavorites((favoriteRes.data || []).map((row: any) => ({
        providerId: row.provider_id,
        name: both(row.providers?.business_name_en, row.providers?.business_name_ar),
      })));
      setLoyaltyEnabled(Boolean(settingRes.data?.value?.enabled));
      const loyaltyRows = (loyaltyRes.data || []) as { points_balance: number; tier: string }[];
      if (loyaltyRows.length) {
        const order = ["bronze", "silver", "gold", "platinum"];
        setLoyalty({
          points: loyaltyRows.reduce((sum, r) => sum + Number(r.points_balance || 0), 0),
          tier: loyaltyRows.map((r) => r.tier).sort((a, b) => order.indexOf(b) - order.indexOf(a))[0],
        });
      }
      setWalletCredit((walletRes.data || [])
        .filter((c: any) => !c.expires_at || new Date(c.expires_at).getTime() > Date.now())
        .reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0));
      setUnreadNotifications(notificationRes.count || 0);
      setRecommendations(((searchRes.data as any)?.providers || [])
        .filter((p: any) => Array.isArray(p.sample_services) && p.sample_services.length > 0)
        .map((p: any) => ({
          providerId: p.provider_id,
          provider: both(p.business_name_en, p.business_name_ar),
          service: both(p.sample_services[0].name_en, p.sample_services[0].name_ar),
          price: p.sample_services[0].price === null ? null : Number(p.sample_services[0].price),
          rating: p.rating === null ? null : Number(p.rating),
        })));
    }
    load().catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const upcomingList = bookings
    .filter((b) => UPCOMING.includes(b.status) && new Date(b.scheduledAt).getTime() > now - 2 * 3600000)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const historyList = bookings.filter((b) => !upcomingList.includes(b));
  const shownBookings = bookingTab === "upcoming" ? upcomingList : historyList;
  const next = upcomingList[0] || null;

  const remainingMs = next ? Math.max(0, new Date(next.scheduledAt).getTime() - now) : 0;
  const days = Math.floor(remainingMs / 86400000);
  const hrs = Math.floor((remainingMs % 86400000) / 3600000);
  const mins = Math.floor((remainingMs % 3600000) / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");

  const numberLocale = isRTL ? "ar-SA" : "en-US";
  const sar = (value: number) => `${value.toLocaleString(numberLocale, { maximumFractionDigits: 2 })} ${t.sar}`;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(numberLocale, { day: "numeric", month: "short", timeZone: "Asia/Riyadh" });
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(numberLocale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

  const ringR = 46;
  const ringC = 2 * Math.PI * ringR;
  const ringProgress = next ? Math.min(1, remainingMs / (7 * 86400000)) : 0;

  // Completed visits this calendar month (Riyadh), grouped by service category.
  const spending = useMemo(() => {
    const monthKey = new Date(now + 3 * 3600000).toISOString().slice(0, 7);
    const rows = bookings.filter((b) => b.status === "completed" && new Date(new Date(b.scheduledAt).getTime() + 3 * 3600000).toISOString().slice(0, 7) === monthKey);
    const byCategory = new Map<string, { label: Bilingual; amount: number }>();
    for (const b of rows) {
      const key = b.category.en || "other";
      const entry = byCategory.get(key) || { label: b.category.en ? b.category : { en: "Other", ar: "أخرى" }, amount: 0 };
      entry.amount += b.total;
      byCategory.set(key, entry);
    }
    const total = rows.reduce((sum, b) => sum + b.total, 0);
    const segments = [...byCategory.values()].sort((a, b) => b.amount - a.amount).slice(0, 4);
    return { total, segments };
  }, [bookings, now]);

  const dR = 42;
  const dC = 2 * Math.PI * dR;
  const donutSegments = useMemo(() => {
    let acc = 0;
    return spending.segments.map((seg, i) => {
      const frac = spending.total > 0 ? seg.amount / spending.total : 0;
      const dash = frac * dC;
      const offset = -acc * dC;
      acc += frac;
      return { color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], dash, gap: dC - dash, offset };
    });
  }, [spending, dC]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PAGE_INDEX.filter((item) => item.label.en.toLowerCase().includes(q) || item.label.ar.includes(q)).slice(0, 6);
  }, [query]);

  const statusPill = (s: BookingStatus) =>
    UPCOMING.includes(s) ? "bg-[#F4E7B6]/60 text-[#9A7B1E]" : s === "completed" ? "bg-[#22C55E]/10 text-[#16A34A]" : "bg-[#EF4444]/10 text-[#DC2626]";

  const cardBase = "relative overflow-hidden rounded-[22px] border border-[#D1AF47]/50 bg-white/90 shadow-[0_0_0_1px_rgba(209,175,71,0.18),0_18px_42px_rgba(17,17,17,0.08),0_0_34px_rgba(209,175,71,0.18)] ring-1 ring-white/80 backdrop-blur-xl";
  const eyebrow = "text-[10px] font-black uppercase tracking-[0.16em] text-[#2F332E]";
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "•";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="relative flex h-full flex-col gap-3 overflow-hidden text-[#1A1A1A] font-sans">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-8 h-56 w-56 rounded-full bg-[#D1AF47]/10 blur-3xl" />
        <div className="absolute right-4 top-32 h-64 w-64 rounded-full bg-white/70 blur-3xl" />
        <NeuralMesh className="-left-16 top-20 h-[380px] w-[760px] opacity-35" />
        <NeuralMesh className="bottom-0 right-0 h-[320px] w-[680px] opacity-30" />
      </div>

      {/* ══════════ HEADER ══════════ */}
      <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-serif text-xl font-black leading-tight lg:text-2xl">{t.welcome}{userName ? `${isRTL ? "، " : ", "}${userName}` : ""}</h1>
          <p className="text-xs font-medium text-[#8A8F99]">{t.subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <label className="flex items-center gap-2 rounded-full border border-[#EAEAEA] bg-white px-3.5 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.03)] md:w-64">
              <svg className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder={t.search}
                className="w-full border-none bg-transparent text-xs outline-none placeholder:text-[#9CA3AF]"
              />
            </label>
            {searchOpen && query.trim() && (
              <div className="absolute end-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] font-semibold text-[#9CA3AF]">{t.noResults}</div>
                ) : (
                  searchResults.map((r) => (
                    <Link
                      key={r.href}
                      href={r.href}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSearchOpen(false); setQuery(""); }}
                      className="block rounded-xl px-3 py-2 text-xs font-bold text-[#1A1A1A] transition hover:bg-[#F7F7F5]">
                      {r.label[locale]}
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <button onClick={toggleLang} className="rounded-full border border-[#EAEAEA] bg-white px-3.5 py-2 text-xs font-bold text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#C9A24B]/40 hover:text-[#C9A24B]">
            {t.lang}
          </button>

          <Link href="/customer/notifications" aria-label="Notifications" className="relative rounded-full border border-[#EAEAEA] bg-white p-2.5 text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:text-[#C9A24B]">
            {unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D1AF47] px-1 text-[8px] font-black text-white">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>
            )}
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </Link>

          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border-2 border-white bg-[#F4E7B6] text-xs font-black text-[#9A7B1E] shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
            {initials(userName)}
          </span>
        </div>
      </header>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[11px] text-red-700">{t.loadFailed}: {loadError}</div>
      )}

      {/* ══════════ ONE-PAGE GRID ══════════ */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        {/* ─── ROW 1: Next appointment + countdown ─── */}
        <article className="relative flex overflow-hidden rounded-[22px] border border-[#E0C46A]/60 bg-[#10100E] text-white shadow-[0_0_0_1px_rgba(244,231,182,0.18),0_26px_70px_rgba(16,16,14,0.34),0_0_48px_rgba(209,175,71,0.32)] lg:col-span-12">
          <CornerGlow dark />
          <NeuralMesh dark className="-right-10 bottom-0 h-36 w-80 opacity-70" />
          <div className="relative flex flex-1 flex-col justify-center p-5">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#E9C765]">{t.nextAppointment}</span>
            {next ? (
              <>
                <h3 className="mt-1.5 font-serif text-xl font-black leading-tight">{next.service[locale]}</h3>
                {next.stylist[locale] && <p className="text-xs font-semibold text-[#D9D4C8]">{t.with} {next.stylist[locale]}</p>}
                <div className="mt-3 flex flex-col gap-1.5 text-[11px] font-semibold text-[#D9D4C8]">
                  <span>{formatDate(next.scheduledAt)} · {formatTime(next.scheduledAt)}</span>
                  <span>{next.provider[locale]}</span>
                  {next.status === "pending_payment" && <span className="text-[#F4E7B6]">{t.awaitingPayment}</span>}
                </div>
                <div className="mt-4">
                  <Link href={`/customer/bookings/${next.id}/confirmation`} className="inline-flex w-fit rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#F4E7B6] px-5 py-2 text-[11px] font-black text-[#15120D] transition hover:-translate-y-0.5">{t.viewDetails}</Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="mt-1.5 font-serif text-xl font-black leading-tight">{t.noUpcoming}</h3>
                <p className="text-xs font-semibold text-[#D9D4C8]">{t.noUpcomingHint}</p>
                <Link href="/discover" className="mt-4 inline-flex w-fit rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#F4E7B6] px-5 py-2 text-[11px] font-black text-[#15120D] transition hover:-translate-y-0.5">{t.findService}</Link>
              </>
            )}
          </div>
          {next && (
            <div className="relative hidden w-48 flex-shrink-0 flex-col items-center justify-center border-s border-white/10 bg-white/[0.035] p-4 text-center md:flex">
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#B9B1A4]">{t.startsIn}</span>
              <div className="relative my-1.5 h-[88px] w-[88px]">
                <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
                  <circle cx="55" cy="55" r={ringR} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
                  <circle cx="55" cy="55" r={ringR} fill="none" stroke="#D1AF47" strokeWidth="7" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * ringProgress} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-serif text-2xl font-black">{days}</span>
                  <span className="text-[8px] font-bold uppercase tracking-wider text-[#B9B1A4]">{t.day}</span>
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1.5" dir="ltr">
                {[[pad(hrs), t.hrs], [pad(mins), t.mins], [pad(secs), t.secs]].map(([val, label], i) => (
                  <React.Fragment key={label}>
                    {i > 0 && <span className="font-serif text-sm font-black text-[#D1AF47]">:</span>}
                    <div className="text-center">
                      <span className="block font-serif text-sm font-black leading-none">{val}</span>
                      <span className="block text-[7px] font-bold uppercase text-[#B9B1A4]">{label}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* ─── ROW 2: Popular near you (8) | Favorite Providers (4) ─── */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-8`}>
          <CornerGlow />
          <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.recommended}</h3>
            <Link href="/discover" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.viewAll}</Link>
          </div>
          {recommendations.length === 0 ? (
            <p className="text-xs text-[#9CA3AF]">{t.noRecommendations}</p>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
              {recommendations.map((rec) => (
                <Link key={rec.providerId} href={`/shop/${rec.providerId}`} className="group flex flex-col rounded-xl border border-[#EAEAEA] bg-white p-3 transition hover:border-[#D1AF47]/50">
                  <h4 className="text-xs font-bold leading-tight">{rec.service[locale]}</h4>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-[#9CA3AF]">{rec.provider[locale]}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="text-[10px] font-semibold text-[#667085]">{rec.rating !== null ? `★ ${rec.rating}` : ""}</span>
                    {rec.price !== null && <span className="font-serif text-xs font-black text-[#C9A24B]">{sar(rec.price)}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <CornerGlow />
          <div className="mb-2 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.favoriteProviders}</h3>
            <Link href="/customer/favorites" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.viewAll}</Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            {favorites.length === 0 && <p className="text-xs text-[#9CA3AF]">{t.noFavorites}</p>}
            {favorites.map((p) => (
              <Link key={p.providerId} href={`/shop/${p.providerId}`} className="flex items-center gap-2.5 rounded-lg p-1 transition hover:bg-[#F7F7F5]">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#E8DCC8] text-[10px] font-black text-[#6B5B3E]">{initials(p.name[locale])}</span>
                <h4 className="min-w-0 flex-1 truncate text-xs font-bold">{p.name[locale]}</h4>
              </Link>
            ))}
            <Link href="/customer/favorites" className="mt-auto block flex-shrink-0 rounded-lg bg-[#F4E7B6]/60 py-1.5 text-center text-[11px] font-black text-[#9A7B1E] transition hover:bg-[#F4E7B6]">{t.viewAllProviders}</Link>
          </div>
        </section>

        {/* ─── ROW 3: Bookings (5) | Loyalty & Wallet (3) | Spending (4) ─── */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-5`}>
          <CornerGlow />
          <div className="mb-2 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.bookings}</h3>
            <div className="flex items-center gap-1 rounded-full bg-[#F4F4F2] p-0.5">
              {(["upcoming", "history"] as const).map((tab) => (
                <button key={tab} onClick={() => setBookingTab(tab)} className={`rounded-full px-2.5 py-1 text-[10px] font-black transition ${bookingTab === tab ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#9CA3AF] hover:text-[#667085]"}`}>
                  {tab === "upcoming" ? t.upcomingTab : t.historyTab}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-0.5">
            {shownBookings.length === 0 && <p className="text-xs text-[#9CA3AF]">{t.noBookings}</p>}
            {shownBookings.slice(0, 8).map((b) => (
              <Link key={b.id} href="/customer/bookings" className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-[#F7F7F5]">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-bold">{b.service[locale]}</h4>
                  <p className="truncate text-[10px] font-medium text-[#9CA3AF]">{b.provider[locale]}</p>
                </div>
                <div className="hidden flex-shrink-0 text-end sm:block">
                  <span className="block text-[10px] font-bold text-[#667085]">{formatDate(b.scheduledAt)}</span>
                  <span className="block text-[9px] font-medium text-[#9CA3AF]">{formatTime(b.scheduledAt)}</span>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${statusPill(b.status)}`}>{t.status[b.status] || b.status}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={`${cardBase} relative flex min-h-0 flex-col justify-center overflow-hidden p-4 lg:col-span-3`}>
          <CornerGlow />
          <div className="mb-2 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.loyalty}</h3>
            <Link href="/customer/wallet" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.details}</Link>
          </div>
          {loyaltyEnabled && loyalty ? (
            <div>
              <h4 className="font-serif text-base font-black leading-tight">{t.tier[loyalty.tier] || loyalty.tier}</h4>
              <p className="text-[10px] font-semibold text-[#9CA3AF]">{loyalty.points.toLocaleString(numberLocale)} {t.points}</p>
            </div>
          ) : (
            <p className="text-[10px] font-semibold text-[#9CA3AF]">{t.loyaltyOff}</p>
          )}
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#F7F7F5] px-2.5 py-1.5">
            <span className="text-[10px] font-bold text-[#667085]">{t.walletBalance}</span>
            <span className="font-serif text-sm font-black text-[#1A1A1A]">{sar(walletCredit)}</span>
          </div>
        </section>

        <section className={`${cardBase} relative flex min-h-0 flex-col overflow-hidden p-4 lg:col-span-4`}>
          <CornerGlow />
          <div className="mb-1 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.insights}</h3>
            <span className="text-[10px] font-bold text-[#9CA3AF]">{t.thisMonth}</span>
          </div>
          {spending.total === 0 ? (
            <p className="text-xs text-[#9CA3AF]">{t.noSpending}</p>
          ) : (
            <div className="flex min-h-0 flex-1 items-center gap-3">
              <div className="relative h-[88px] w-[88px] flex-shrink-0">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  {donutSegments.map((seg, i) => (
                    <circle key={i} cx="50" cy="50" r={dR} fill="none" stroke={seg.color} strokeWidth="12" strokeDasharray={`${seg.dash} ${seg.gap}`} strokeDashoffset={seg.offset} />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-serif text-[11px] font-black">{sar(spending.total)}</span>
                  <span className="text-[7px] font-bold uppercase text-[#9CA3AF]">{t.totalSpent}</span>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                {spending.segments.map((seg, i) => (
                  <div key={seg.label.en} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                    <span className="flex-1 truncate text-[10px] font-semibold text-[#667085]">{seg.label[locale]}</span>
                    <span className="text-[10px] font-black">{sar(seg.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
