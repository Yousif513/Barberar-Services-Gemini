"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const translations = {
  en: {
    branch: "Riyadh Central Branch", search: "Search operations, staff, bookings...",
    bookWalkIn: "Book Walk-In", lang: "العربية",
    revenue: "Revenue", bookings: "Bookings", customers: "Customers", occupancy: "Occupancy",
    staffOnline: "Staff Online", reviews: "Reviews", avgTicket: "Avg Ticket", walkins: "Walk-ins",
    revenueForecast: "Revenue & Load Forecast", forecastSub: "Real-time scheduling load against projected capacity", monthly: "Monthly",
    todaysOps: "Today's Operations", live: "Live", ongoing: "Ongoing", nextUp: "Next Appointment", walkInQueue: "Walk-In Queue", waiting: "Waiting", manageQueue: "Manage Queue",
    staffPerf: "Staff Performance", leaderboard: "Leaderboard", util: "Util",
    serviceIntel: "Service Intelligence", avgLoad: "Avg Load", manageServices: "Manage Services",
    prayerControl: "Prayer Operations Control", lockPending: "Lock Pending", nextPrayer: "Next Prayer", prayerIn: "Prayer in", lockIn: "Lock in", autoResume: "Auto Resume",
    bookingsAffected: "Bookings", staffAffected: "Staff", roomsAffected: "Rooms",
  },
  ar: {
    branch: "فرع الرياض الرئيسي", search: "البحث في العمليات، الموظفين، الحجوزات...",
    bookWalkIn: "حجز حضور", lang: "EN",
    revenue: "الإيرادات", bookings: "الحجوزات", customers: "العملاء", occupancy: "الإشغال",
    staffOnline: "الموظفون المتصلون", reviews: "التقييمات", avgTicket: "متوسط الفاتورة", walkins: "حجوزات الحضور",
    revenueForecast: "توقعات الإيرادات والأحمال", forecastSub: "حمل الجدولة الحي مقابل السعة المتوقعة", monthly: "شهري",
    todaysOps: "عمليات اليوم", live: "مباشر", ongoing: "جارٍ", nextUp: "الموعد التالي", walkInQueue: "طابور الحضور", waiting: "بالانتظار", manageQueue: "إدارة الطابور",
    staffPerf: "أداء الموظفين", leaderboard: "الصدارة", util: "الاستخدام",
    serviceIntel: "ذكاء الخدمات", avgLoad: "متوسط الحمل", manageServices: "إدارة الخدمات",
    prayerControl: "التحكم بأوقات الصلاة", lockPending: "إغلاق معلق", nextPrayer: "الصلاة القادمة", prayerIn: "الصلاة خلال", lockIn: "الإغلاق خلال", autoResume: "الاستئناف",
    bookingsAffected: "حجوزات", staffAffected: "موظفون", roomsAffected: "غرف",
  },
};

export default function ProviderDashboardPage() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [businessName, setBusinessName] = useState("Elite Barbershop");
  const [secondsLeft, setSecondsLeft] = useState(4354);

  const isRTL = locale === "ar";
  const t = translations[locale];
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  useEffect(() => {
    const sync = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 4354)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: provider } = await supabase
          .from("providers")
          .select("business_name_en, business_name_ar")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (provider) setBusinessName(isRTL ? provider.business_name_ar : provider.business_name_en);
      } catch (err) {
        console.warn("Provider dashboard using fallback data:", err);
      }
    }
    load();
  }, [isRTL]);

  const toggleLang = () => {
    const target = locale === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLocale(target);
  };

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };
  const lockSeconds = Math.max(0, secondsLeft - 1200);

  const cardBase = "rounded-[20px] border border-[#1C2433] bg-[#0F1623] shadow-[0_8px_24px_rgba(0,0,0,0.04)]";
  const eyebrow = "text-[10px] font-black uppercase tracking-[0.14em] text-[#94A3B8]";

  const kpis = [
    { label: t.revenue, value: "128,450 SAR", change: "+12%", tone: "text-[#22C55E]" },
    { label: t.bookings, value: "9,178", change: "+8%", tone: "text-[#22C55E]" },
    { label: t.customers, value: "1,248", change: "+48", tone: "text-[#22C55E]" },
    { label: t.occupancy, value: "78.4%", change: "-2%", tone: "text-[#EF4444]" },
    { label: t.staffOnline, value: "4 / 6", change: t.live, tone: "text-[#22C55E]" },
    { label: t.reviews, value: "4.8 ★", change: "+0.2", tone: "text-[#22C55E]" },
    { label: t.walkins, value: "12", change: "+4", tone: "text-[#22C55E]" },
    { label: t.avgTicket, value: "138 SAR", change: "Stable", tone: "text-[#B8952E]" },
  ];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`flex h-full flex-col gap-3 bg-[#070B12] text-[#F5F7FA] font-sans ${isRTL ? "text-right" : "text-left"}`}>
      {/* HEADER */}
      <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className={`flex items-center gap-3 ${flip}`}>
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-[#D1AF47] to-[#E0C46A] text-xs font-black text-[#101828] shadow-[0_0_20px_rgba(209,175,71,0.18)]">EB</div>
          <div>
            <h1 className="font-serif text-lg font-black leading-tight lg:text-xl">{businessName}</h1>
            <div className={`flex items-center gap-1.5 ${flip}`}>
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <span className="text-[10px] font-bold text-[#94A3B8]">{t.branch}</span>
            </div>
          </div>
        </div>
        <div className={`flex items-center gap-2.5 ${flip}`}>
          <label className={`flex items-center gap-2 rounded-full border border-[#1C2433] bg-[#0F1623] px-3.5 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.03)] md:w-56 ${flip}`}>
            <svg className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input placeholder={t.search} className="w-full border-none bg-transparent text-xs outline-none placeholder:text-[#9CA3AF]" />
          </label>
          <button onClick={toggleLang} className="rounded-full border border-[#1C2433] bg-[#0F1623] px-3.5 py-2 text-xs font-bold text-[#94A3B8] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">{t.lang}</button>
          <Link href="/provider/calendar" className="rounded-full bg-[#D1AF47] px-4 py-2 text-xs font-black text-white shadow-md shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A]">+ {t.bookWalkIn}</Link>
        </div>
      </header>

      {/* KPI STRIP */}
      <div className={`${cardBase} flex-shrink-0 overflow-x-auto p-3`}>
        <div className="flex min-w-max divide-x divide-[#1C2433] rtl:divide-x-reverse">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-[130px] px-4 first:ps-1 last:pe-1">
              <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[#94A3B8]">{k.label}</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <strong className="font-serif text-sm font-black">{k.value}</strong>
                <span className={`text-[9px] font-black ${k.tone}`}>{k.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GRID — fits one screen */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12" style={{ gridTemplateRows: "minmax(0,1.15fr) minmax(0,1fr)" }}>
        {/* Revenue & Load Forecast */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-8`}>
          <div className={`mb-1 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <div>
              <h3 className="font-serif text-base font-black">{t.revenueForecast}</h3>
              <p className="text-[10px] font-medium text-[#94A3B8]">{t.forecastSub}</p>
            </div>
            <span className="rounded-lg border border-[#1C2433] bg-[#131C2B] px-2.5 py-1 text-[10px] font-bold text-[#94A3B8]">{t.monthly}</span>
          </div>
          <div className="relative min-h-0 w-full flex-1">
            <svg viewBox="0 0 600 150" preserveAspectRatio="none" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#D1AF47" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="40" x2="600" y2="40" stroke="#1C2433" strokeWidth="1" />
              <line x1="0" y1="95" x2="600" y2="95" stroke="#1C2433" strokeWidth="1" />
              <path d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50 L 600,150 L 10,150 Z" fill="url(#chartGlow)" />
              <path d="M 10,110 C 100,90 150,135 230,55 C 310,15 380,85 450,45 C 520,15 550,65 600,50" fill="none" stroke="#D1AF47" strokeWidth="3" strokeLinecap="round" />
              <path d="M 10,125 C 80,110 160,85 230,75 C 300,65 380,105 450,65 C 520,35 550,45 600,20" fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
            </svg>
          </div>
          <div className={`mt-1 flex flex-shrink-0 justify-between px-1 text-[9px] font-black uppercase tracking-wider text-[#94A3B8] ${flip}`}>
            <span>Jan</span><span>Feb</span><span>Mar</span><span className="text-[#D1AF47]">Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span>
          </div>
        </section>

        {/* Today's Operations */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.todaysOps}</h3>
            <span className="rounded-full bg-[#22C55E]/10 px-2 py-0.5 text-[8px] font-black uppercase text-[#22C55E]">{t.live}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            <div className="rounded-xl border border-[#1C2433] bg-[#131C2B] p-2.5">
              <span className="text-[8px] font-black uppercase text-[#22C55E]">{t.ongoing}</span>
              <h4 className="text-xs font-bold">Max Stone — Chair 1</h4>
              <p className="text-[10px] font-semibold text-[#94A3B8]">Haircut + Beard · 12m left</p>
            </div>
            <div className="rounded-xl border border-[#1C2433] bg-[#131C2B] p-2.5">
              <span className="text-[8px] font-black uppercase text-[#94A3B8]">{t.nextUp}</span>
              <h4 className="text-xs font-bold">Grisha Jack — Room 2</h4>
              <p className="text-[10px] font-semibold text-[#94A3B8]">Moroccan Bath · in 18m</p>
            </div>
            <div className="rounded-xl border border-[#1C2433] bg-[#131C2B] p-2.5">
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[8px] font-black uppercase text-[#94A3B8]">{t.walkInQueue}</span>
                <span className="text-[9px] font-bold text-[#D1AF47]">3 {t.waiting}</span>
              </div>
              <p className="mt-1 text-[10px] font-bold">1. Khalid Yasin · 2. Fahad Al-Qahtani</p>
            </div>
          </div>
          <Link href="/provider/calendar" className={`mt-2 flex flex-shrink-0 items-center justify-between border-t border-[#1C2433] pt-2 text-[10px] font-bold text-[#94A3B8] ${flip}`}>
            <span>12 walk-ins today</span><span className="text-[#D1AF47]">{t.manageQueue} →</span>
          </Link>
        </section>

        {/* Staff Performance */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.staffPerf}</h3>
            <Link href="/provider/team" className="text-[10px] font-black text-[#D1AF47] hover:underline">{t.leaderboard}</Link>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            {[
              { name: "Max Stone", bookings: 42, rating: "4.9", rev: "18,450", util: "96%" },
              { name: "Levi Patrick", bookings: 36, rating: "4.8", rev: "14,200", util: "92%" },
              { name: "Grisha Jack", bookings: 28, rating: "4.7", rev: "11,800", util: "88%" },
            ].map((s) => (
              <div key={s.name} className={`flex items-center justify-between rounded-xl border border-[#1C2433] bg-[#131C2B] p-2 ${flip}`}>
                <div>
                  <h5 className="text-xs font-bold">{s.name}</h5>
                  <p className="text-[9px] font-semibold text-[#94A3B8]">{s.bookings} bk · {s.rating} ★</p>
                </div>
                <div className={isRTL ? "text-left" : "text-right"}>
                  <span className="block font-serif text-xs font-black">{s.rev} SAR</span>
                  <span className="block text-[9px] font-bold text-[#22C55E]">{t.util}: {s.util}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Service Intelligence */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.serviceIntel}</h3>
            <span className="text-[10px] font-bold text-[#94A3B8]">{t.avgLoad}: 72%</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5">
            {[
              { name: "Hair Styling", count: "36", val: 75 },
              { name: "Moroccan Bath", count: "28", val: 85 },
              { name: "Spa Therapy", count: "12", val: 40 },
            ].map((s) => (
              <div key={s.name}>
                <div className={`mb-1 flex items-center justify-between text-[10px] font-bold ${flip}`}>
                  <span className="font-serif">{s.name}</span>
                  <span className="text-[#D1AF47]">{s.count} · {s.val}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#1C2433]"><div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" style={{ width: `${s.val}%` }} /></div>
              </div>
            ))}
          </div>
          <Link href="/provider/services" className={`mt-2 flex flex-shrink-0 items-center justify-end border-t border-[#1C2433] pt-2 text-[10px] font-bold text-[#D1AF47] ${flip}`}>{t.manageServices} →</Link>
        </section>

        {/* Prayer Operations Control */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.prayerControl}</h3>
            <span className="rounded-full border border-[#EF4444]/20 bg-[#EF4444]/10 px-2 py-0.5 text-[8px] font-black uppercase text-[#EF4444]">{t.lockPending}</span>
          </div>
          <div className="rounded-xl border border-[#1C2433] bg-[#131C2B] p-3">
            <div className={`flex items-center justify-between ${flip}`}>
              <div>
                <span className="block text-[8px] font-black uppercase text-[#94A3B8]">{t.nextPrayer}</span>
                <span className="font-serif text-base font-black">Asr</span>
              </div>
              <div className={isRTL ? "text-left" : "text-right"}>
                <span className="block text-[8px] font-black uppercase text-[#94A3B8]">{t.prayerIn}</span>
                <span className="font-serif text-base font-black text-[#EF4444]">{fmt(secondsLeft)}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1C2433]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#EF4444]" style={{ width: `${((4354 - secondsLeft) / 4354) * 100}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[#1C2433] pt-2">
              <div><span className="block text-[8px] font-black uppercase text-[#94A3B8]">{t.lockIn}</span><span className="font-serif text-xs font-black text-[#F59E0B]">{fmt(lockSeconds)}</span></div>
              <div><span className="block text-[8px] font-black uppercase text-[#94A3B8]">{t.autoResume}</span><span className="font-serif text-xs font-black text-[#22C55E]">04:15 PM</span></div>
            </div>
          </div>
          <div className="mt-2 grid flex-shrink-0 grid-cols-3 gap-2">
            {([[t.bookingsAffected, "3", "text-[#EF4444]"], [t.staffAffected, "2", "text-[#F59E0B]"], [t.roomsAffected, "1", "text-[#F5F7FA]"]] as [string, string, string][]).map(([l, v, c]) => (
              <div key={l} className="rounded-lg border border-[#1C2433] bg-[#131C2B] p-1.5 text-center">
                <span className="block text-[7px] font-black uppercase text-[#94A3B8]">{l}</span>
                <span className={`font-serif text-sm font-black ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
