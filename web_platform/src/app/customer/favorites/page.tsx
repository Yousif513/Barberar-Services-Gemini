"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface FavoriteItem {
  id: string; // favorite id
  provider_id: string;
  name_en: string;
  name_ar: string;
  rating: number | null;
  reviews_count: number;
  image: string | null;
  district: string;
  city: string;
}

const translations = {
  en: {
    title: "My Favorites",
    subtitle: "Quick access to your preferred salons, barbershops, and stylists in Riyadh & Jeddah.",
    reviews: "reviews",
    newSalon: "New on PRIMORA",
    bookBtn: "Book Appointment",
    removeTitle: "Remove from favorites",
    noFavorites: "No favorite salons saved yet.",
    emptyDesc: "Explore premier salons and grooming destinations across Saudi Arabia and tap the heart to save them here.",
    exploreBtn: "Discover Salons",
    loading: "Loading your saved salons...",
    errorTitle: "Notice",
    currency: "SAR",
    unauthenticated: "Please log in to view and manage your favorite salons.",
    loginBtn: "Log In",
  },
  ar: {
    title: "المفضلة",
    subtitle: "وصول سريع ومباشر إلى صالوناتك ومراكز التجميل المفضلة في الرياض وجدة.",
    reviews: "تقييم",
    newSalon: "جديد على بريمورا",
    bookBtn: "حجز موعد",
    removeTitle: "إزالة من المفضلة",
    noFavorites: "لم تقم بإضافة أي صالون إلى المفضلة بعد.",
    emptyDesc: "استكشف أرقى الصالونات ومراكز العناية في المملكة واضغط على رمز القلب لحفظها هنا لسهولة الوصول.",
    exploreBtn: "استكشف الصالونات",
    loading: "جاري تحميل صالوناتك المفضلة...",
    errorTitle: "تنبيه",
    currency: "ريال",
    unauthenticated: "يرجى تسجيل الدخول لعرض وإدارة صالوناتك المفضلة.",
    loginBtn: "تسجيل الدخول",
  }
};

export default function CustomerFavorites() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const interval = setInterval(handleLangSync, 1000);
    return () => clearInterval(interval);
  }, []);

  const t = translations[locale];
  const isRTL = locale === "ar";

  useEffect(() => {
    loadFavorites();
  }, []);

  async function loadFavorites() {
    try {
      setLoading(true);
      setError(null);

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        setUserId(null);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Query customer_favorites joined with providers and branches
      const { data, error: favErr } = await supabase
        .from("customer_favorites")
        .select(`
          id,
          provider_id,
          created_at,
          providers (
            id,
            business_name_en,
            business_name_ar,
            logo_url,
            cover_image_url,
            branches (
              id,
              name_en,
              name_ar,
              district,
              city
            )
          )
        `)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (favErr) {
        console.error("Failed to load customer favorites:", favErr);
        setError(favErr.message);
        return;
      }

      if (data) {
        const rows = data.filter((f: any) => f.providers);
        // The rating is the real average of published reviews; a salon with none yet is shown as new.
        const ratings = new Map<string, { rating: number; reviews: number }>();
        if (rows.length > 0) {
          const { data: summaries, error: ratingErr } = await supabase.rpc("provider_rating_summaries", {
            p_provider_ids: rows.map((f: any) => f.providers.id),
          });
          if (ratingErr) throw ratingErr;
          for (const row of summaries ?? []) ratings.set(row.provider_id, { rating: Number(row.rating), reviews: Number(row.reviews) });
        }
        const mapped: FavoriteItem[] = rows.map((f: any) => {
          const p = f.providers;
          const branch = p.branches && p.branches.length > 0 ? p.branches[0] : null;
          const summary = ratings.get(p.id);
          return {
            id: f.id,
            provider_id: p.id,
            name_en: p.business_name_en || p.business_name_ar || "",
            name_ar: p.business_name_ar || p.business_name_en || "",
            rating: summary ? summary.rating : null,
            reviews_count: summary ? summary.reviews : 0,
            image: p.cover_image_url || p.logo_url || null,
            district: branch?.district || "",
            city: branch?.city || "",
          };
        });
        setFavorites(mapped);
      }
    } catch (err: any) {
      console.error("Error loading favorites:", err);
      setError(err?.message || "Failed to load favorites");
    } finally {
      setLoading(false);
    }
  }

  const handleRemove = async (providerId: string) => {
    // Optimistic UI update
    setFavorites(prev => prev.filter(f => f.provider_id !== providerId));

    try {
      const { error: toggleErr } = await supabase.rpc("toggle_customer_favorite", {
        p_provider_id: providerId,
      });

      if (toggleErr) {
        console.error("Failed to remove favorite:", toggleErr);
        // Rollback on error
        loadFavorites();
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
      loadFavorites();
    }
  };

  return (
    <div className={`space-y-8 font-sans ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#D1AF47] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-gray-500">{t.loading}</p>
        </div>
      ) : !userId ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center space-y-4">
          <p className="text-sm font-semibold text-gray-700">{t.unauthenticated}</p>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition"
          >
            {t.loginBtn}
          </Link>
        </div>
      ) : favorites.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {favorites.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow duration-300"
            >
              <div className="h-44 overflow-hidden relative">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={isRTL ? item.name_ar : item.name_en}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div aria-hidden="true" className="w-full h-full bg-stone-100 flex items-center justify-center text-4xl font-black text-stone-300">
                    {(isRTL ? item.name_ar : item.name_en).trim().charAt(0)}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(item.provider_id)}
                  title={t.removeTitle}
                  className="absolute top-3 right-3 bg-white/95 hover:bg-red-50 text-red-500 p-2 rounded-full border border-gray-200/50 shadow-sm transition"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <div className="p-5 flex flex-col justify-between flex-grow">
                <div>
                  <h4 className="font-bold text-sm text-black mt-1">
                    {isRTL ? item.name_ar : item.name_en}
                  </h4>
                  <p className="text-[10px] text-stone-500 font-semibold mt-1 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {[item.district, item.city].filter(Boolean).join(isRTL ? "، " : ", ")}
                  </p>

                  <div className="flex items-center gap-1 mt-3 text-[10px] font-bold text-gray-800">
                    <svg className="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span>{item.rating === null ? t.newSalon : `${item.rating} (${item.reviews_count} ${t.reviews})`}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Link
                    href={`/shop/${item.provider_id}`}
                    className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold text-center transition duration-200"
                  >
                    {t.bookBtn}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
            <svg className="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="font-bold text-base text-gray-900">{t.noFavorites}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">{t.emptyDesc}</p>
          </div>
          <div className="pt-2">
            <Link
              href="/discover"
              className="inline-block px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition"
            >
              {t.exploreBtn}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

