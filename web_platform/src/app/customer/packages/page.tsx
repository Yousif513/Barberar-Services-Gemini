"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface UserPackage {
  id: string;
  remaining_sessions: number;
  expires_at: string;
  packages: {
    id: string;
    name_en: string;
    name_ar: string;
    description_en: string;
    description_ar: string;
    session_count: number;
    price: number;
    providers: {
      business_name_en: string;
      business_name_ar: string;
    };
  };
}

interface AvailablePackage {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  session_count: number;
  price: number;
  expires_in_days: number;
  providers: {
    business_name_en: string;
    business_name_ar: string;
  };
}

const translations = {
  en: {
    title: "My Wellness Packages & Multi-Passes",
    subtitle: "Track your active prepaid sessions, remaining appointments, and purchase discounted bundle packages.",
    activeTab: "My Active Passes",
    exploreTab: "Browse New Packages",
    noPasses: "You do not have any active packages yet.",
    explorePrompt: "Browse packages below to save up to 30% on bundled grooming & wellness visits.",
    sessionsRemaining: "Sessions Remaining",
    expiresOn: "Expires On",
    expiringSoon: "Expiring Soon",
    bookSession: "Book Session",
    purchaseBtn: "Purchase Package",
    purchasing: "Purchasing...",
    purchaseSuccess: "Package purchased successfully! Your session balance is now updated.",
    priceSar: "SAR",
    sessionsCount: "sessions",
    validFor: "Valid for",
    days: "days",
    loadError: "Unable to load your package details from the network."
  },
  ar: {
    title: "باقاتي واشتراكات الجلسات المتعددة",
    subtitle: "متابعة جلساتك المدفوعة مسبقاً، المواعيد المتبقية، وشراء باقات العناية المجمعة بأسعار مخفضة.",
    activeTab: "باقاتي المفعلة",
    exploreTab: "استعراض باقات جديدة",
    noPasses: "لا توجد لديك باقات مفعلة حالياً.",
    explorePrompt: "استعرض الباقات المتاحة أدناه ووفر حتى 30% على جلسات العناية والسبا.",
    sessionsRemaining: "الجلسات المتبقية",
    expiresOn: "تاريخ الانتهاء",
    expiringSoon: "تنتهي قريباً",
    bookSession: "حجز موعد",
    purchaseBtn: "شراء الباقة الآن",
    purchasing: "جاري الشراء...",
    purchaseSuccess: "تم شراء الباقة بنجاح! تم تحديث رصيد جلساتك الآن.",
    priceSar: "ريال",
    sessionsCount: "جلسات",
    validFor: "صالحة لمدة",
    days: "يوم",
    loadError: "تعذر تحميل بيانات الباقات من الخادم."
  }
};

export default function CustomerPackagesPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"my_passes" | "browse">("my_passes");
  const [userPackages, setUserPackages] = useState<UserPackage[]>([]);
  const [availablePackages, setAvailablePackages] = useState<AvailablePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const t = translations[locale];
  const isRTL = locale === "ar";

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

  useEffect(() => {
    loadAllPackages();
  }, []);

  async function loadAllPackages() {
    try {
      setLoading(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();

      // Load user's purchased passes if authenticated
      if (user) {
        const { data: myData, error: myError } = await supabase
          .from("user_packages")
          .select(`
            id,
            remaining_sessions,
            expires_at,
            packages (
              id,
              name_en,
              name_ar,
              description_en,
              description_ar,
              session_count,
              price,
              providers (
                business_name_en,
                business_name_ar
              )
            )
          `)
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false });

        if (myError) throw myError;
        setUserPackages((myData as any) || []);
      }

      // Load available marketplace packages
      const { data: browseData, error: browseError } = await supabase
        .from("packages")
        .select(`
          id,
          name_en,
          name_ar,
          description_en,
          description_ar,
          session_count,
          price,
          expires_in_days,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .eq("is_active", true)
        .order("price", { ascending: true });

      if (browseError) throw browseError;
      setAvailablePackages((browseData as any) || []);
    } catch (err: any) {
      console.error("Error loading packages:", err.message);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(packageId: string) {
    try {
      setPurchasingId(packageId);
      setError("");
      setSuccessMsg("");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login?returnUrl=/customer/packages";
        return;
      }

      const { data, error: purchaseErr } = await supabase.rpc("purchase_service_package", {
        p_package_id: packageId,
        p_payment_method: "card"
      });

      if (purchaseErr) throw purchaseErr;

      setSuccessMsg(t.purchaseSuccess);
      await loadAllPackages();
      setActiveTab("my_passes");
    } catch (err: any) {
      console.error("Purchase failed:", err.message);
      setError(err.message || "Failed to purchase package.");
    } finally {
      setPurchasingId(null);
    }
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-8 ${isRTL ? "text-right" : "text-left"}`}>
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>

        {/* TABS */}
        <div className="flex bg-gray-100 p-1 rounded-xl self-start">
          <button
            onClick={() => setActiveTab("my_passes")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "my_passes"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.activeTab} ({userPackages.length})
          </button>
          <button
            onClick={() => setActiveTab("browse")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === "browse"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.exploreTab} ({availablePackages.length})
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg("")} className="text-[#027A48] hover:opacity-75">×</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 font-bold">
          {error}
        </div>
      )}

      {/* MY PASSES VIEW */}
      {activeTab === "my_passes" && (
        loading ? (
          <div className="text-center py-16 text-sm text-gray-400 font-semibold">{t.title}...</div>
        ) : userPackages.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-3xl p-12 text-center shadow-sm max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 bg-amber-50 text-[#D1AF47] rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold">
              ★
            </div>
            <h3 className="font-bold text-gray-900 text-base">{t.noPasses}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{t.explorePrompt}</p>
            <button
              onClick={() => setActiveTab("browse")}
              className="mt-2 inline-block px-6 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150"
            >
              {t.exploreTab}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {userPackages.map((item) => {
              const totalSessions = item.packages?.session_count || 1;
              const pctRemaining = Math.round((item.remaining_sessions / totalSessions) * 100);
              const isExpiringSoon = item.expires_at && (new Date(item.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000);

              const pkgName = isRTL ? item.packages?.name_ar || item.packages?.name_en : item.packages?.name_en || item.packages?.name_ar;
              const provName = isRTL ? item.packages?.providers?.business_name_ar || item.packages?.providers?.business_name_en : item.packages?.providers?.business_name_en || item.packages?.providers?.business_name_ar;
              const desc = isRTL ? item.packages?.description_ar || item.packages?.description_en : item.packages?.description_en || item.packages?.description_ar;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:border-[#D1AF47] transition duration-200"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-extrabold text-[#D1AF47] uppercase tracking-wider block">
                          {provName}
                        </span>
                        <h3 className="font-bold text-base text-gray-900 mt-1">{pkgName}</h3>
                      </div>
                      <span className="text-xs font-black px-2.5 py-1 bg-gray-100 rounded-lg text-gray-700">
                        {item.packages?.price} {t.priceSar}
                      </span>
                    </div>

                    {desc && <p className="text-xs text-gray-500 mb-6 line-clamp-2">{desc}</p>}

                    {/* SESSIONS BALANCE PROGRESS BAR */}
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-xs font-bold text-gray-700">
                        <span>{t.sessionsRemaining}</span>
                        <span className="text-[#B3933B] font-black">{item.remaining_sessions} / {totalSessions}</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-black h-full transition-all duration-300"
                          style={{ width: `${Math.max(0, Math.min(100, pctRemaining))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-gray-100 pt-4">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">{t.expiresOn}</span>
                      <span className={`text-xs block font-bold mt-0.5 ${isExpiringSoon ? "text-red-500 animate-pulse" : "text-gray-700"}`}>
                        {item.expires_at ? new Date(item.expires_at).toLocaleDateString(isRTL ? "ar-SA" : "en-GB") : "—"}
                      </span>
                    </div>
                    <Link
                      href="/customer/book"
                      className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150 shadow-sm"
                    >
                      {t.bookSession}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* BROWSE NEW PACKAGES VIEW */}
      {activeTab === "browse" && (
        loading ? (
          <div className="text-center py-16 text-sm text-gray-400 font-semibold">{t.title}...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availablePackages.map((pkg) => {
              const pkgName = isRTL ? pkg.name_ar || pkg.name_en : pkg.name_en || pkg.name_ar;
              const provName = isRTL ? pkg.providers?.business_name_ar || pkg.providers?.business_name_en : pkg.providers?.business_name_en || pkg.providers?.business_name_ar;
              const desc = isRTL ? pkg.description_ar || pkg.description_en : pkg.description_en || pkg.description_ar;

              return (
                <div
                  key={pkg.id}
                  className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-[#D1AF47]/40 transition duration-200"
                >
                  <div className="space-y-3">
                    <span className="text-[10px] font-extrabold text-[#D1AF47] uppercase tracking-wider block">
                      {provName}
                    </span>
                    <h3 className="font-bold text-base text-gray-900">{pkgName}</h3>
                    {desc && <p className="text-xs text-gray-500 line-clamp-3">{desc}</p>}

                    <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100 flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-bold">{pkg.session_count} {t.sessionsCount}</span>
                      <span className="text-gray-500 text-[11px] font-medium">{t.validFor} {pkg.expires_in_days || 365} {t.days}</span>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-100 mt-6 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold block">{t.priceSar}</span>
                      <strong className="text-xl font-serif font-black text-gray-900 block">{pkg.price} ﷼</strong>
                    </div>

                    <button
                      onClick={() => handlePurchase(pkg.id)}
                      disabled={purchasingId === pkg.id}
                      className="px-5 py-2.5 bg-black hover:bg-gray-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition duration-150 shadow-sm"
                    >
                      {purchasingId === pkg.id ? t.purchasing : t.purchaseBtn}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
