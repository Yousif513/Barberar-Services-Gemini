"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

/* ────────────────────────────────────────────────────────────── */
/* Gender-responsive showcase data                                 */
/* ────────────────────────────────────────────────────────────── */

type Gender = "male" | "female";

type Service = { name: string; sub: string; price: string; img: string };
type Provider = { name: string; role: string; rating: string; img: string };

const GENDER_DATA: Record<Gender, {
  avatar: string;
  hero: string;
  exclusiveImg: string;
  exclusiveSub: string;
  appointment: { service: string; stylist: string; date: string; time: string; location: string };
  recommendations: Service[];
  providers: Provider[];
}> = {
  male: {
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=120&auto=format&fit=crop",
    hero: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=600&auto=format&fit=crop",
    exclusiveImg: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=600&auto=format&fit=crop",
    exclusiveSub: "on All Grooming Services",
    appointment: { service: "Beard Sculpt & Cut", stylist: "Omar Khaled", date: "21 Apr", time: "11:00 AM", location: "Gentlemen's Barber, Downtown" },
    recommendations: [
      { name: "Classic Haircut", sub: "Sharp & Clean", price: "$45", img: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=400&auto=format&fit=crop" },
      { name: "Beard Sculpt", sub: "Shape & Line-up", price: "$30", img: "https://images.unsplash.com/photo-1517832606299-7ae9b720a186?q=80&w=400&auto=format&fit=crop" },
      { name: "Hot Towel Shave", sub: "Royal Treatment", price: "$40", img: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?q=80&w=400&auto=format&fit=crop" },
      { name: "Scalp Therapy", sub: "Refresh & Detox", price: "$55", img: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?q=80&w=400&auto=format&fit=crop" },
    ],
    providers: [
      { name: "Omar Khaled", role: "Master Barber", rating: "4.9", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop" },
      { name: "Yousef Adel", role: "Beard Specialist", rating: "4.8", img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=200&auto=format&fit=crop" },
      { name: "Karim Saad", role: "Grooming Expert", rating: "4.9", img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop" },
    ],
  },
  female: {
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=120&auto=format&fit=crop",
    hero: "https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=600&auto=format&fit=crop",
    exclusiveImg: "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop",
    exclusiveSub: "on All Hair Services",
    appointment: { service: "Hair Styling", stylist: "Emma Johnson", date: "21 Apr", time: "11:00 AM", location: "Glam Studio, Downtown" },
    recommendations: [
      { name: "Spa Therapy", sub: "Relax & Rejuvenate", price: "$80", img: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=400&auto=format&fit=crop" },
      { name: "Moroccan Bath", sub: "Deep Cleansing", price: "$90", img: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=400&auto=format&fit=crop" },
      { name: "Facial Treatment", sub: "Skin Rejuvenation", price: "$60", img: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?q=80&w=400&auto=format&fit=crop" },
      { name: "Hair Coloring", sub: "Trendy Shades", price: "$70", img: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=400&auto=format&fit=crop" },
    ],
    providers: [
      { name: "Emma Johnson", role: "Hair Specialist", rating: "4.9", img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop" },
      { name: "Olivia Brown", role: "Spa Therapist", rating: "4.8", img: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&auto=format&fit=crop" },
      { name: "Sophia Lee", role: "Skin Expert", rating: "4.9", img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop" },
    ],
  },
};

const INSIGHTS = [
  { label: "Hair Services", amount: "$620", pct: "50%", color: "#1A1A1A" },
  { label: "Spa & Wellness", amount: "$420", pct: "34%", color: "#C9A24B" },
  { label: "Beauty & Care", amount: "$200", pct: "16%", color: "#E5D5A8" },
];

type Booking = { id: string; service: string; place: string; date: string; time: string; status: "Upcoming" | "Completed" | "Cancelled"; img: string };

const FALLBACK_UPCOMING: Booking[] = [
  { id: "u1", service: "Hair Styling", place: "Glam Studio, Downtown", date: "21 Apr", time: "11:00 AM", status: "Upcoming", img: "https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=200&auto=format&fit=crop" },
  { id: "u2", service: "Beard Grooming", place: "Royal Cuts, Olaya", date: "26 Apr", time: "06:30 PM", status: "Upcoming", img: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?q=80&w=200&auto=format&fit=crop" },
];
const FALLBACK_HISTORY: Booking[] = [
  { id: "h1", service: "Spa Therapy", place: "Lotus Spa, City Center", date: "18 Apr", time: "02:00 PM", status: "Completed", img: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=200&auto=format&fit=crop" },
  { id: "h2", service: "Moroccan Bath", place: "Royal Spa, Marina", date: "12 Apr", time: "01:00 PM", status: "Completed", img: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?q=80&w=200&auto=format&fit=crop" },
  { id: "h3", service: "Hair Coloring", place: "Glow Salon, Al-Nakheel", date: "03 Apr", time: "04:00 PM", status: "Cancelled", img: "https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=200&auto=format&fit=crop" },
];

const translations = {
  en: {
    welcome: "Welcome back,", subtitle: "Here's what's happening with your account today.",
    search: "Search services, providers, pages...", lang: "العربية",
    nextAppointment: "Next Appointment", with: "with", viewDetails: "View Details", startsIn: "Starts in",
    day: "Day", hrs: "Hrs", mins: "Mins", secs: "Secs",
    exclusive: "Exclusive For You", offerTitle: "20% OFF", offerValid: "Valid till 30 Apr, 2024", claimOffer: "Claim Offer",
    recommended: "Recommended For You", viewAll: "View All",
    favoriteProviders: "Favorite Providers", viewAllProviders: "View All Providers",
    bookings: "Bookings", upcomingTab: "Upcoming", historyTab: "History",
    loyalty: "Loyalty & Wallet", details: "Details", goldMember: "Gold Member", points: "Points",
    walletBalance: "Wallet", awayFrom: "$550 to Platinum",
    insights: "Spending Insights", thisMonth: "This Month", totalSpent: "Total Spent", saved: "Saved",
    referText: "Refer a friend — you both get 20% off.", inviteNow: "Invite Now",
    upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled",
    noResults: "No matches found", in: "in",
  },
  ar: {
    welcome: "مرحباً بعودتك،", subtitle: "إليك ما يحدث في حسابك اليوم.",
    search: "ابحث عن الخدمات، المزودين، الصفحات...", lang: "EN",
    nextAppointment: "الموعد القادم", with: "مع", viewDetails: "عرض التفاصيل", startsIn: "يبدأ خلال",
    day: "يوم", hrs: "ساعة", mins: "دقيقة", secs: "ثانية",
    exclusive: "حصري لك", offerTitle: "خصم 20%", offerValid: "ساري حتى 30 أبريل 2024", claimOffer: "احصل على العرض",
    recommended: "موصى به لك", viewAll: "عرض الكل",
    favoriteProviders: "المزودون المفضلون", viewAllProviders: "عرض كل المزودين",
    bookings: "الحجوزات", upcomingTab: "القادمة", historyTab: "السابقة",
    loyalty: "الولاء والمحفظة", details: "التفاصيل", goldMember: "عضو ذهبي", points: "نقطة",
    walletBalance: "المحفظة", awayFrom: "550$ للبلاتيني",
    insights: "تحليل الإنفاق", thisMonth: "هذا الشهر", totalSpent: "الإنفاق", saved: "وفرت",
    referText: "ادعُ صديقاً واحصلا معاً على خصم 20%.", inviteNow: "ادعُ الآن",
    upcoming: "قادم", completed: "مكتمل", cancelled: "ملغى",
    noResults: "لا توجد نتائج", in: "في",
  },
};

const PAGE_INDEX = [
  { label: "My Bookings", type: "Page", href: "/customer/bookings", where: "Bookings" },
  { label: "My Packages", type: "Page", href: "/customer/packages", where: "Packages" },
  { label: "Wallet & Rewards", type: "Page", href: "/customer/wallet", where: "Wallet" },
  { label: "Messages", type: "Page", href: "/customer/messages", where: "Messages" },
  { label: "Reviews", type: "Page", href: "/customer/reviews", where: "Reviews" },
  { label: "Notifications", type: "Page", href: "/customer/notifications", where: "Notifications" },
  { label: "Settings", type: "Page", href: "/customer/settings", where: "Settings" },
  { label: "Book a New Service", type: "Action", href: "/customer/book", where: "New Booking" },
  { label: "Find Providers", type: "Page", href: "/customer/search", where: "Search" },
];

export default function CustomerDashboard() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [userName, setUserName] = useState("Yousif");
  const [gender, setGender] = useState<Gender>("male");
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [history, setHistory] = useState<Booking[]>([]);
  const [bookingTab, setBookingTab] = useState<"upcoming" | "history">("upcoming");
  const [remaining, setRemaining] = useState(22 * 3600 + 43 * 60 + 15);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const d = GENDER_DATA[gender];
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
    const id = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [{ data: profile }, { data: rows }] = await Promise.all([
          supabase.from("profiles").select("first_name, gender").eq("id", user.id).maybeSingle(),
          supabase
            .from("bookings")
            .select("id, scheduled_at, status, services(name_en), branches(providers(business_name_en))")
            .eq("customer_id", user.id)
            .order("scheduled_at", { ascending: false })
            .limit(8),
        ]);
        if (profile?.first_name) setUserName(profile.first_name);
        if (profile?.gender === "male" || profile?.gender === "female") setGender(profile.gender);
        if (rows?.length) {
          const mapped: Booking[] = rows.map((row, i) => {
            const when = new Date(row.scheduled_at);
            const branch = row.branches as unknown as { providers?: { business_name_en?: string } } | null;
            const service = row.services as unknown as { name_en?: string } | null;
            const status = row.status === "completed" ? "Completed" : row.status === "cancelled" ? "Cancelled" : "Upcoming";
            return {
              id: row.id,
              service: service?.name_en ?? "Beauty Service",
              place: branch?.providers?.business_name_en ?? "Primora Provider",
              date: when.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
              time: when.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
              status,
              img: [...FALLBACK_UPCOMING, ...FALLBACK_HISTORY][i % 5].img,
            };
          });
          const up = mapped.filter((b) => b.status === "Upcoming");
          const hist = mapped.filter((b) => b.status !== "Upcoming");
          if (up.length) setUpcoming(up);
          if (hist.length) setHistory(hist);
        }
      } catch (error) {
        console.warn("Customer dashboard using fallback data:", error);
      }
    }
    load();
  }, []);

  const upcomingList = upcoming.length ? upcoming : FALLBACK_UPCOMING;
  const historyList = history.length ? history : FALLBACK_HISTORY;
  const shownBookings = bookingTab === "upcoming" ? upcomingList : historyList;

  const hrs = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  const ringR = 46;
  const ringC = 2 * Math.PI * ringR;

  const dR = 42;
  const dC = 2 * Math.PI * dR;
  const donutSegments = useMemo(() => {
    let acc = 0;
    return INSIGHTS.map((seg) => {
      const frac = parseInt(seg.pct, 10) / 100;
      const dash = frac * dC;
      const offset = -acc * dC;
      acc += frac;
      return { color: seg.color, dash, gap: dC - dash, offset };
    });
  }, [dC]);

  // Live search across services, providers and app pages
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const index = [
      ...d.recommendations.map((s) => ({ label: s.name, type: "Service", href: "/customer/search", where: "Discover Services" })),
      ...d.providers.map((p) => ({ label: p.name, type: "Provider", href: "/customer/favorites", where: "Favorite Providers" })),
      ...PAGE_INDEX,
    ];
    return index.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query, d]);

  const statusPill = (s: Booking["status"]) =>
    s === "Upcoming" ? "bg-[#F4E7B6]/60 text-[#9A7B1E]" : s === "Completed" ? "bg-[#22C55E]/10 text-[#16A34A]" : "bg-[#EF4444]/10 text-[#DC2626]";
  const statusLabel = (s: Booking["status"]) => (s === "Upcoming" ? t.upcoming : s === "Completed" ? t.completed : t.cancelled);

  const cardBase = "rounded-[20px] border border-[#EFEFEF] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]";
  const eyebrow = "text-[10px] font-black uppercase tracking-[0.14em] text-[#667085]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="flex h-full flex-col gap-3 text-[#1A1A1A] font-sans">
      {/* ══════════ HEADER ══════════ */}
      <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-serif text-xl font-black leading-tight lg:text-2xl">{t.welcome} {userName} 👋</h1>
          <p className="text-xs font-medium text-[#8A8F99]">{t.subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Search with live results */}
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
              <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[#EAEAEA] bg-white p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[11px] font-semibold text-[#9CA3AF]">{t.noResults}</div>
                ) : (
                  searchResults.map((r) => (
                    <Link key={`${r.type}-${r.label}`} href={r.href} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition hover:bg-[#F7F7F5]">
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-bold text-[#1A1A1A]">{r.label}</span>
                        <span className="block text-[10px] font-medium text-[#9CA3AF]">{t.in} {r.where}</span>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-[#F4E7B6]/50 px-2 py-0.5 text-[8px] font-black uppercase text-[#9A7B1E]">{r.type}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Language toggle */}
          <button onClick={toggleLang} className="rounded-full border border-[#EAEAEA] bg-white px-3.5 py-2 text-xs font-bold text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#C9A24B]/40 hover:text-[#C9A24B]">
            {t.lang}
          </button>

          {/* Gender toggle (demo personalization control) */}
          <button
            onClick={() => setGender((g) => (g === "male" ? "female" : "male"))}
            title="Switch experience"
            className="rounded-full border border-[#EAEAEA] bg-white px-3 py-2 text-xs font-bold text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#C9A24B]/40 hover:text-[#C9A24B]"
          >
            {gender === "male" ? "♂" : "♀"}
          </button>

          <button aria-label="Notifications" className="relative rounded-full border border-[#EAEAEA] bg-white p-2.5 text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:text-[#C9A24B]">
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#D1AF47] text-[8px] font-black text-white">2</span>
            <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.avatar} alt={userName} className="h-10 w-10 flex-shrink-0 rounded-full border-2 border-white object-cover shadow-[0_4px_14px_rgba(0,0,0,0.1)]" />
        </div>
      </header>

      {/* ══════════ ONE-PAGE GRID ══════════ */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12" style={{ gridTemplateRows: "minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr) auto" }}>
        {/* ─── ROW 1: Merged Appointment + Timer (8) | Exclusive w/ photo (4) ─── */}
        <article className={`${cardBase} flex overflow-hidden lg:col-span-8`}>
          {/* Hero image */}
          <div className="hidden w-44 flex-shrink-0 bg-[#E8DCC8] sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.hero} alt={d.appointment.service} className="h-full w-full object-cover" />
          </div>
          {/* Appointment details */}
          <div className="flex flex-1 flex-col justify-center p-5">
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#B8952E]">{t.nextAppointment}</span>
            <h3 className="mt-1.5 font-serif text-xl font-black leading-tight">{d.appointment.service}</h3>
            <p className="text-xs font-semibold text-[#8A8F99]">{t.with} {d.appointment.stylist}</p>
            <div className="mt-3 flex flex-col gap-1.5 text-[11px] font-semibold text-[#667085]">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0 text-[#C9A24B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span>{d.appointment.date} · {d.appointment.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0 text-[#C9A24B]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>{d.appointment.location}</span>
              </div>
            </div>
            <Link href="/customer/bookings" className="mt-4 inline-block w-fit rounded-lg bg-[#F4E7B6] px-4 py-2 text-[11px] font-black text-[#9A7B1E] transition hover:bg-[#EDDB9C]">{t.viewDetails}</Link>
          </div>
          {/* Timer (merged in, shows the upcoming service name) */}
          <div className="hidden w-48 flex-shrink-0 flex-col items-center justify-center border-l border-[#F0F0F0] bg-[#FBFBF9] p-4 text-center md:flex">
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[#9CA3AF]">{t.startsIn}</span>
            <div className="relative my-1.5 h-[88px] w-[88px]">
              <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
                <circle cx="55" cy="55" r={ringR} fill="none" stroke="#F0EEE9" strokeWidth="7" />
                <circle cx="55" cy="55" r={ringR} fill="none" stroke="#D1AF47" strokeWidth="7" strokeLinecap="round" strokeDasharray={ringC} strokeDashoffset={ringC * (1 - 0.73)} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-2xl font-black">1</span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-[#9CA3AF]">{t.day}</span>
              </div>
            </div>
            <p className="max-w-[150px] truncate text-[11px] font-black text-[#1A1A1A]">{d.appointment.service}</p>
            <div className="mt-1.5 flex items-center justify-center gap-1.5">
              {[[pad(hrs), t.hrs], [pad(mins), t.mins], [pad(secs), t.secs]].map(([val, label], i) => (
                <React.Fragment key={label}>
                  {i > 0 && <span className="font-serif text-sm font-black text-[#D1AF47]">:</span>}
                  <div className="text-center">
                    <span className="block font-serif text-sm font-black leading-none">{val}</span>
                    <span className="block text-[7px] font-bold uppercase text-[#9CA3AF]">{label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </article>

        {/* Exclusive Offer with attractive photo */}
        <article className="relative flex flex-col justify-end overflow-hidden rounded-[20px] p-5 text-white shadow-[0_8px_24px_rgba(0,0,0,0.14)] lg:col-span-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.exclusiveImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E0D0C] via-[#0E0D0C]/80 to-[#0E0D0C]/25" />
          <div className="relative">
            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[#E9C765]">{t.exclusive}</span>
            <h3 className="mt-1 font-serif text-2xl font-black">{t.offerTitle}</h3>
            <p className="text-xs font-semibold text-[#EDE6DA]">{d.exclusiveSub}</p>
            <p className="mt-0.5 text-[10px] font-medium text-[#B9B1A4]">{t.offerValid}</p>
            <Link href="/customer/wallet" className="mt-3 inline-block w-fit rounded-lg bg-white px-4 py-1.5 text-[11px] font-black text-[#1A1A1A] transition hover:bg-[#F4E7B6]">{t.claimOffer}</Link>
          </div>
        </article>

        {/* ─── ROW 2: Recommended (8) | Favorite Providers (4) ─── */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-8`}>
          <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.recommended}</h3>
            <Link href="/customer/search" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.viewAll}</Link>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
            {d.recommendations.map((rec) => (
              <Link key={rec.name} href="/customer/search" className="group flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-[#E8DCC8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={rec.img} alt={rec.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                </div>
                <h4 className="mt-1.5 text-xs font-bold leading-tight">{rec.name}</h4>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium text-[#9CA3AF]">{rec.sub}</p>
                  <span className="font-serif text-xs font-black text-[#C9A24B]">{rec.price}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Favorite Providers */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className="mb-2 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.favoriteProviders}</h3>
            <Link href="/customer/favorites" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.viewAll}</Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5">
            {d.providers.map((p) => (
              <div key={p.name} className="flex items-center gap-2.5">
                <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-[#E8DCC8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.img} alt={p.name} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-bold">{p.name}</h4>
                  <p className="truncate text-[10px] font-medium text-[#9CA3AF]">{p.role}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <span className="text-[11px] font-black">{p.rating}</span>
                  <svg className="h-3 w-3 text-[#D1AF47]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.364 1.118l1.287 3.957c.3.921-.755 1.688-1.54 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.075 9.39c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.951-.69l1.286-3.957z" /></svg>
                </div>
              </div>
            ))}
            <Link href="/customer/favorites" className="block flex-shrink-0 rounded-lg bg-[#F4E7B6]/60 py-1.5 text-center text-[11px] font-black text-[#9A7B1E] transition hover:bg-[#F4E7B6]">{t.viewAllProviders}</Link>
          </div>
        </section>

        {/* ─── ROW 3: Bookings+tabs (5) | Loyalty & Wallet (3) | Insights (4) ─── */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-5`}>
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
            {shownBookings.map((b) => (
              <Link key={b.id} href="/customer/bookings" className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-[#F7F7F5]">
                <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-[#E8DCC8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.img} alt={b.service} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-xs font-bold">{b.service}</h4>
                  <p className="truncate text-[10px] font-medium text-[#9CA3AF]">{b.place}</p>
                </div>
                <div className="hidden flex-shrink-0 text-right sm:block">
                  <span className="block text-[10px] font-bold text-[#667085]">{b.date}</span>
                  <span className="block text-[9px] font-medium text-[#9CA3AF]">{b.time}</span>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${statusPill(b.status)}`}>{statusLabel(b.status)}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Loyalty & Wallet (combined) */}
        <section className={`${cardBase} flex min-h-0 flex-col justify-center p-4 lg:col-span-3`}>
          <div className="mb-2 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.loyalty}</h3>
            <Link href="/customer/wallet" className="text-[10px] font-black text-[#C9A24B] hover:underline">{t.details}</Link>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[#F4E7B6]/50 text-[#C9A24B]">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" /></svg>
            </div>
            <div className="min-w-0">
              <h4 className="font-serif text-base font-black leading-tight">{t.goldMember}</h4>
              <p className="text-[10px] font-semibold text-[#9CA3AF]">2,450 / 3,000 {t.points}</p>
            </div>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#F0EEE9]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" style={{ width: "81%" }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-[#F7F7F5] px-2.5 py-1.5">
            <span className="text-[10px] font-bold text-[#667085]">{t.walletBalance}</span>
            <span className="font-serif text-sm font-black text-[#1A1A1A]">185 SAR</span>
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-[#9CA3AF]">{t.awayFrom}</p>
        </section>

        {/* Spending Insights */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className="mb-1 flex flex-shrink-0 items-center justify-between">
            <h3 className={eyebrow}>{t.insights}</h3>
            <span className="text-[10px] font-bold text-[#9CA3AF]">{t.thisMonth}</span>
          </div>
          <div className="flex min-h-0 flex-1 items-center gap-3">
            <div className="relative h-[88px] w-[88px] flex-shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                {donutSegments.map((seg, i) => (
                  <circle key={i} cx="50" cy="50" r={dR} fill="none" stroke={seg.color} strokeWidth="12" strokeDasharray={`${seg.dash} ${seg.gap}`} strokeDashoffset={seg.offset} />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-serif text-sm font-black">$1,240</span>
                <span className="text-[7px] font-bold uppercase text-[#9CA3AF]">{t.totalSpent}</span>
              </div>
            </div>
            <div className="flex-1 space-y-1">
              {INSIGHTS.map((seg) => (
                <div key={seg.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="flex-1 truncate text-[10px] font-semibold text-[#667085]">{seg.label}</span>
                  <span className="text-[10px] font-black">{seg.amount}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-[#F7F7F5] px-2 py-1.5">
                <span className="text-[10px] font-medium text-[#9CA3AF]">{t.saved}</span>
                <span className="font-serif text-sm font-black text-[#C9A24B]">$180</span>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Refer banner ─── */}
        <div className="flex items-center justify-between gap-3 overflow-hidden rounded-[20px] border border-[#EFEFEF] bg-gradient-to-r from-[#FBF6E9] to-[#F7F7F5] px-4 py-2.5 lg:col-span-12">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎁</span>
            <p className="font-serif text-xs font-black sm:text-sm">{t.referText}</p>
          </div>
          <Link href="/customer/wallet" className="flex-shrink-0 rounded-lg bg-[#1A1A1A] px-4 py-2 text-[11px] font-black text-white transition hover:bg-black">{t.inviteNow}</Link>
        </div>
      </div>
    </div>
  );
}
