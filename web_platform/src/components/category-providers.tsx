"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { loadExpandedCategorySlugs } from "@/lib/category-tree";

type Locale = "en" | "ar";

export type CategoryCopy = {
  category: string;
  title: string;
  subtitle: string;
};

type SampleService = { id: string; name_en: string | null; name_ar: string | null; price: number | string | null };

type ProviderRow = {
  branch_id: string;
  provider_id: string;
  business_name_en: string | null;
  business_name_ar: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  city: string | null;
  district: string | null;
  rating: number | string | null;
  reviews: number | string | null;
  sample_services: SampleService[] | null;
};

const text = {
  en: {
    backHome: "Back to Home",
    bookNow: "Book appointment",
    startingFrom: "Starting from",
    reviews: "reviews",
    newOnPrimora: "New on PRIMORA",
    loading: "Loading providers...",
    errorTitle: "We could not load the providers",
    retry: "Try again",
    emptyTitle: "No providers in this category yet",
    emptyBody: "Providers appear here as soon as they join and are verified. You can browse everything available now.",
    browseAll: "Browse all providers",
    footer: "Built for Saudi Arabia. All rights reserved.",
  },
  ar: {
    backHome: "العودة للرئيسية",
    bookNow: "احجز موعداً",
    startingFrom: "يبدأ من",
    reviews: "تقييم",
    newOnPrimora: "جديد على بريمورا",
    loading: "جارٍ تحميل مقدّمي الخدمة...",
    errorTitle: "تعذّر تحميل مقدّمي الخدمة",
    retry: "حاول مرة أخرى",
    emptyTitle: "لا يوجد مقدّمو خدمة في هذا القسم بعد",
    emptyBody: "يظهر مقدّمو الخدمة هنا فور انضمامهم وتوثيقهم. يمكنك تصفّح كل ما هو متاح الآن.",
    browseAll: "تصفّح جميع مقدّمي الخدمة",
    footer: "صُنع للمملكة العربية السعودية. جميع الحقوق محفوظة.",
  },
};

// A public category page lists the providers the marketplace search returns for that category: real ratings and real prices,
// or an honest empty state. The page never invents a business.
export default function CategoryProviders({ categorySlugs, queries, copy }: { categorySlugs?: string[]; queries?: string[]; copy: Record<Locale, CategoryCopy> }) {
  const [locale, setLocale] = useState<Locale>("ar");
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const t = text[locale];
  const c = copy[locale];

  useEffect(() => {
    const syncLanguage = () => {
      const current = document.documentElement.lang;
      if (current === "en" || current === "ar") setLocale(current);
    };
    syncLanguage();
    const interval = setInterval(syncLanguage, 1000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    // A category page covers its top-level categories and every child category, because providers list services in the leaves.
    let slugs: string[] = ["all"];
    if (categorySlugs && categorySlugs.length > 0) {
      const expanded = await loadExpandedCategorySlugs(categorySlugs);
      if (expanded.error) {
        setErrorMessage(expanded.error);
        setStatus("error");
        return;
      }
      slugs = expanded.slugs;
    }
    // One search per term and category slug (service-name terms in both languages); the answers are merged by branch.
    const searches = (queries && queries.length > 0 ? queries : [null]).flatMap((query) =>
      slugs.map((slug) => supabase.rpc("search_marketplace_providers", { p_query: query, p_category: slug, p_limit: 24, p_offset: 0 })),
    );
    const answers = await Promise.all(searches);
    const failed = answers.find((answer) => answer.error);
    if (failed?.error) {
      setErrorMessage(failed.error.message);
      setStatus("error");
      return;
    }
    const merged = new Map<string, ProviderRow>();
    for (const answer of answers) {
      for (const row of (Array.isArray(answer.data?.providers) ? answer.data.providers : []) as ProviderRow[]) merged.set(row.branch_id, row);
    }
    setProviders([...merged.values()]);
    setStatus("ready");
  }, [categorySlugs, queries]);

  useEffect(() => {
    // Loading starts from the effect so the first paint is the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const money = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
  const numbers = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US");

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-stone-50 text-stone-900 font-sans antialiased flex flex-col justify-between">
      <header className="bg-white border-b border-stone-200/80 py-5 px-6 sm:px-12 flex items-center justify-between sticky top-0 z-50">
        <Link href="/" className="text-xl font-serif font-black tracking-widest text-stone-900">
          PRIMORA
        </Link>
        <Link href="/" className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-950 transition">
          {t.backHome}
        </Link>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-6 sm:px-8 space-y-12 flex-1 w-full">
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-widest uppercase font-extrabold text-stone-400">{c.category}</span>
          <h1 className="text-3xl sm:text-4xl font-serif text-stone-950 tracking-tight leading-tight">{c.title}</h1>
          <p className="text-xs sm:text-sm text-stone-500 font-light max-w-xl mx-auto leading-relaxed">{c.subtitle}</p>
        </div>

        {status === "loading" && (
          <p role="status" className="text-center text-sm text-stone-500">{t.loading}</p>
        )}

        {status === "error" && (
          <div role="alert" className="max-w-md mx-auto bg-white border border-red-200 rounded-2xl p-6 text-center space-y-3">
            <p className="font-bold text-sm text-red-700">{t.errorTitle}</p>
            <p className="text-xs text-stone-500" dir="ltr">{errorMessage}</p>
            <button type="button" onClick={() => void load()} className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">
              {t.retry}
            </button>
          </div>
        )}

        {status === "ready" && providers.length === 0 && (
          <div className="max-w-md mx-auto bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3">
            <p className="font-bold text-sm text-stone-900">{t.emptyTitle}</p>
            <p className="text-xs text-stone-500 leading-relaxed">{t.emptyBody}</p>
            <Link href="/discover" className="inline-block px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold">
              {t.browseAll}
            </Link>
          </div>
        )}

        {status === "ready" && providers.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
            {providers.map((p) => {
              const name = (locale === "ar" ? p.business_name_ar || p.business_name_en : p.business_name_en || p.business_name_ar) || "";
              const branch = (locale === "ar" ? p.branch_name_ar || p.branch_name_en : p.branch_name_en || p.branch_name_ar) || "";
              const place = [p.district, p.city].filter(Boolean).join(locale === "ar" ? "، " : ", ");
              const services = p.sample_services ?? [];
              const prices = services.map((s) => Number(s.price)).filter((n) => Number.isFinite(n));
              const reviews = Number(p.reviews ?? 0);
              const rating = p.rating === null || p.rating === undefined ? null : Number(p.rating);
              return (
                <li key={`${p.provider_id}-${p.branch_id}`} className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between hover:border-black transition duration-200">
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="min-w-0">
                        <h2 className="font-bold text-base text-stone-950">{name}</h2>
                        <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">{[branch, place].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="text-end shrink-0">
                        {rating !== null && reviews > 0 ? (
                          <>
                            <div className="flex items-center justify-end gap-1 font-bold text-xs text-stone-800">
                              <span aria-hidden="true" className="text-[hsl(45,60%,55%)]">★</span> {numbers.format(rating)}
                            </div>
                            <span className="text-[9px] text-stone-400 font-medium block mt-0.5">{numbers.format(reviews)} {t.reviews}</span>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold text-stone-500">{t.newOnPrimora}</span>
                        )}
                      </div>
                    </div>

                    {services.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {services.map((s) => (
                          <span key={s.id} className="px-2.5 py-1 bg-stone-50 border border-stone-200/60 rounded-lg text-[10px] font-semibold text-stone-600">
                            {(locale === "ar" ? s.name_ar || s.name_en : s.name_en || s.name_ar) || ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-6 border-t border-stone-100 flex items-center justify-between bg-stone-50/50">
                    <div>
                      {prices.length > 0 && (
                        <>
                          <span className="text-[9px] text-stone-400 uppercase font-bold tracking-wider block">{t.startingFrom}</span>
                          <span className="text-sm font-extrabold text-stone-900">{money.format(Math.min(...prices))}</span>
                        </>
                      )}
                    </div>
                    <Link
                      href={`/shop/${p.provider_id}`}
                      className="px-5 py-2.5 bg-stone-900 text-stone-50 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-stone-800 transition shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
                    >
                      {t.bookNow}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="bg-stone-100 border-t border-stone-200 py-6 text-center text-xs text-stone-500 font-medium">
        <p>© {new Date().getFullYear()} PRIMORA. {t.footer}</p>
      </footer>
    </div>
  );
}
