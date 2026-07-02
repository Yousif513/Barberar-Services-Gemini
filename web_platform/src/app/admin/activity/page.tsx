"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Platform Activity",
    subtitle: "Live feed of marketplace events — bookings, providers, payments, and reviews across the platform.",
    events24h: "Events (24h)",
    newBookings: "New Bookings",
    newProviders: "New Providers",
    filterAll: "All",
    filterBookings: "Bookings",
    filterProviders: "Providers",
    filterPayments: "Payments",
    feedTitle: "Recent Events",
    live: "Live",
    empty: "No activity recorded for this filter yet.",
    typeBooking: "Booking",
    typeProvider: "Provider",
    typePayment: "Payment",
    typeReview: "Review"
  },
  ar: {
    title: "نشاط المنصة",
    subtitle: "بث مباشر لأحداث السوق — الحجوزات، المزودون، المدفوعات، والتقييمات عبر المنصة.",
    events24h: "الأحداث (٢٤ ساعة)",
    newBookings: "حجوزات جديدة",
    newProviders: "مزودون جدد",
    filterAll: "الكل",
    filterBookings: "الحجوزات",
    filterProviders: "المزودون",
    filterPayments: "المدفوعات",
    feedTitle: "أحدث الأحداث",
    live: "مباشر",
    empty: "لا يوجد نشاط مسجل لهذا الفلتر بعد.",
    typeBooking: "حجز",
    typeProvider: "مزود",
    typePayment: "دفعة",
    typeReview: "تقييم"
  }
};

type EventType = "booking" | "provider" | "payment" | "review";
type ActivityEvent = { id: string; type: EventType; text_en: string; text_ar: string; time: string };

const FALLBACK_EVENTS: ActivityEvent[] = [
  { id: "e1", type: "booking", text_en: "New booking — Hair Styling at Glam Studio (320 SAR)", text_ar: "حجز جديد — تصفيف شعر في جلام ستوديو (٣٢٠ ر.س)", time: "2m" },
  { id: "e2", type: "payment", text_en: "Deposit captured — Booking #PR-10842 (1,850 SAR)", text_ar: "تم تحصيل العربون — حجز #PR-10842 (١٬٨٥٠ ر.س)", time: "14m" },
  { id: "e3", type: "provider", text_en: "New provider registered — Jeddah Grooming Palace", text_ar: "تسجيل مزود جديد — قصر جدة للحلاقة", time: "32m" },
  { id: "e4", type: "review", text_en: "5★ review posted for Elite Barbershop", text_ar: "تقييم ٥ نجوم لصالون إيليت", time: "1h" },
  { id: "e5", type: "booking", text_en: "Booking cancelled — Spa Therapy at Lotus Spa", text_ar: "إلغاء حجز — جلسة سبا في لوتس سبا", time: "2h" },
  { id: "e6", type: "payment", text_en: "Payout batch released — 84 providers (128,450 SAR)", text_ar: "صرف دفعة المستحقات — ٨٤ مزوداً (١٢٨٬٤٥٠ ر.س)", time: "3h" },
  { id: "e7", type: "provider", text_en: "Provider verified — Riyadh Wellness House", text_ar: "توثيق مزود — دار الرياض للعافية", time: "5h" }
];

export default function AdminActivityPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [filter, setFilter] = useState<"all" | EventType>("all");
  const [events, setEvents] = useState<ActivityEvent[]>(FALLBACK_EVENTS);
  const [stats, setStats] = useState({ events: 248, bookings: 64, providers: 6 });

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) setLang(currentLang);
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: bookings }, { data: providers }] = await Promise.all([
          supabase.from("bookings").select("id, status, total_price, created_at, services(name_en, name_ar)").order("created_at", { ascending: false }).limit(6),
          supabase.from("providers").select("id, business_name_en, business_name_ar, is_verified, created_at").order("created_at", { ascending: false }).limit(4)
        ]);
        const mapped: ActivityEvent[] = [];
        (bookings ?? []).forEach((b) => {
          const svc = b.services as unknown as { name_en?: string; name_ar?: string } | null;
          mapped.push({
            id: `b-${b.id}`,
            type: b.status === "confirmed" || b.status === "completed" ? "payment" : "booking",
            text_en: `Booking ${b.status.replaceAll("_", " ")} — ${svc?.name_en ?? "Service"} (${Number(b.total_price)} SAR)`,
            text_ar: `حجز ${b.status === "completed" ? "مكتمل" : b.status === "confirmed" ? "مؤكد" : "قيد الدفع"} — ${svc?.name_ar ?? "خدمة"} (${Number(b.total_price)} ر.س)`,
            time: new Date(b.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          });
        });
        (providers ?? []).forEach((p) => {
          mapped.push({
            id: `p-${p.id}`,
            type: "provider",
            text_en: `${p.is_verified ? "Provider verified" : "New provider registered"} — ${p.business_name_en}`,
            text_ar: `${p.is_verified ? "توثيق مزود" : "تسجيل مزود جديد"} — ${p.business_name_ar}`,
            time: new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          });
        });
        if (mapped.length) {
          setEvents(mapped);
          setStats({ events: mapped.length, bookings: (bookings ?? []).length, providers: (providers ?? []).length });
        }
      } catch (err) {
        console.warn("Activity feed using fallback data:", err);
      }
    })();
  }, []);

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const typeStyle: Record<EventType, string> = {
    booking: "bg-[#FFFAEB] text-[#B8952E]",
    provider: "bg-[#EFF6FF] text-[#3B82F6]",
    payment: "bg-[#ECFDF3] text-[#16A34A]",
    review: "bg-[#FDF2F8] text-[#DB2777]"
  };
  const typeLabel: Record<EventType, string> = {
    booking: t.typeBooking,
    provider: t.typeProvider,
    payment: t.typePayment,
    review: t.typeReview
  };

  const shown = filter === "all" ? events : events.filter((e) => e.type === filter);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[[t.events24h, String(stats.events)], [t.newBookings, String(stats.bookings)], [t.newProviders, String(stats.providers)]].map(([label, value]) => (
          <div key={label} className={cardBase}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{label}</span>
            <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{value}</strong>
          </div>
        ))}
      </div>

      <div className={cardBase}>
        <div className={`flex flex-col gap-3 sm:items-center sm:justify-between mb-4 ${isRTL ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
          <div className={`flex items-center gap-2 ${flip}`}>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085]">{t.feedTitle}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[9px] font-black text-[#16A34A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] animate-pulse" />
              {t.live}
            </span>
          </div>
          <div className={`flex items-center gap-1 rounded-full bg-[#F7F6F3] border border-[#ECECEC] p-1 ${flip}`}>
            {([["all", t.filterAll], ["booking", t.filterBookings], ["provider", t.filterProviders], ["payment", t.filterPayments]] as ["all" | EventType, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3 py-1 text-[10px] font-black transition ${filter === key ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-xs font-semibold text-[#667085]">{t.empty}</p>
        ) : (
          <div className="divide-y divide-[#F5F5F5]">
            {shown.map((e) => (
              <div key={e.id} className={`flex items-center justify-between gap-3 py-3 ${flip}`}>
                <div className={`flex min-w-0 items-center gap-3 ${flip}`}>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${typeStyle[e.type]}`}>{typeLabel[e.type]}</span>
                  <span className="truncate text-xs font-bold text-gray-700">{isRTL ? e.text_ar : e.text_en}</span>
                </div>
                <span className="flex-shrink-0 text-[10px] font-bold text-gray-400">{e.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
