"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sponsoredError, type SponsoredPlacement } from "@/lib/sponsored";

type Locale = "en" | "ar";
type Answer = { key: string; placements: SponsoredPlacement[]; error: string };

const copy = {
  en: {
    block: "Sponsored places", badge: "Sponsored / إعلان", loading: "Loading sponsored places...", loadFailed: "Sponsored places could not be loaded.", retry: "Try again",
    note: "Paid placements, shown apart from the search results below. They do not change how the results are ranked.",
    view: "View", reviews: "reviews", verified: "Verified business",
  },
  ar: {
    block: "أماكن مموّلة", badge: "Sponsored / إعلان", loading: "جارٍ تحميل الأماكن المموّلة...", loadFailed: "تعذّر تحميل الأماكن المموّلة.", retry: "أعد المحاولة",
    note: "أماكن مدفوعة تُعرض منفصلة عن نتائج البحث أدناه. لا تؤثر في ترتيب النتائج.",
    view: "عرض", reviews: "تقييماً", verified: "نشاط موثّق",
  },
} as const;

// The labelled sponsored block of the discover page. It asks the database for the places that are eligible right now; the database
// answers with nothing while the owner has not switched the feature on, and the block then renders nothing at all. Every place it draws
// carries the visible "Sponsored / إعلان" badge and sits in its own region above the organic results, never mixed into them.
export default function SponsoredPlacements({ locale, city, category }: { locale: Locale; city: string; category: string }) {
  const t = copy[locale];
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([city, category, locale, retry]);

  useEffect(() => {
    let active = true;
    void supabase
      .rpc("get_sponsored_placements", { p_city: city, p_category: category, p_limit: null })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAnswer({ key, placements: [], error: sponsoredError(error, locale) });
          return;
        }
        const body = data as { configured?: boolean; placements?: SponsoredPlacement[] } | null;
        setAnswer({ key, placements: body?.configured ? body.placements ?? [] : [], error: "" });
      });
    return () => { active = false; };
  }, [key, city, category, locale]);

  const recordClick = (campaignId: string) => {
    // Counting a click must never delay or block the visitor, and a failed count is not shown to them.
    void supabase.rpc("record_sponsored_click", { p_campaign_id: campaignId }).then(() => undefined, () => undefined);
  };

  if (!answer || answer.key !== key) return <p role="status" className="mb-3 text-[11px] font-semibold text-stone-400">{t.loading}</p>;
  if (answer.error) {
    return (
      <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
        <span>{t.loadFailed} <bdi dir="ltr" className="opacity-70">{answer.error}</bdi></span>
        <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-lg border border-red-300 bg-white px-3 py-1 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">{t.retry}</button>
      </div>
    );
  }
  if (answer.placements.length === 0) return null;

  return (
    <section aria-label={t.block} className="mb-4 rounded-3xl border border-dashed border-[#D1AF47]/60 bg-[#FBF7EA] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-sm font-bold text-stone-900">{t.block}</h3>
        <span className="text-[10px] text-stone-500">{t.note}</span>
      </div>
      <ul className="space-y-2">
        {answer.placements.map((place) => {
          const name = locale === "ar" ? place.business_name_ar : place.business_name_en;
          const branch = locale === "ar" ? place.branch_name_ar : place.branch_name_en;
          return (
            <li key={place.campaign_id} className="rounded-2xl border border-stone-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-block rounded-md bg-[#101828] px-2 py-0.5 text-[10px] font-black tracking-wide text-white" dir="ltr">{t.badge}</span>
                  <p className="mt-1.5 truncate font-serif text-sm font-bold text-stone-900">{name}</p>
                  <p className="truncate text-[11px] text-stone-500">{[branch, place.district, place.city].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {place.rating !== null && <span className="font-bold text-stone-900">{place.rating} ★ ({place.reviews} {t.reviews})</span>}
                    {place.rating !== null && place.verified_business && " · "}
                    {place.verified_business && <span>{t.verified}</span>}
                  </p>
                </div>
                <Link
                  href={`/shop/${place.provider_id}`}
                  onClick={() => recordClick(place.campaign_id)}
                  className="shrink-0 text-[11px] font-bold text-stone-900 hover:text-[#D1AF47] transition focus-visible:outline-2 focus-visible:outline-stone-900"
                >
                  {t.view} →<span className="sr-only"> {name}</span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
