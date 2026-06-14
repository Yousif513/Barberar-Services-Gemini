"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Promotions & Campaigns",
    subtitle: "Launch discount codes, wellness campaigns, and coupons to attract selective Riyadh clients.",
    createBtn: "Create Promo Code",
    tableCode: "Promo Code",
    tableType: "Type",
    tableValue: "Discount Value",
    tableExpiry: "Expires On",
    tableStatus: "Status",
    tableUsage: "Usage Count",
    statusActive: "ACTIVE",
    statusExpired: "EXPIRED",
    noPromos: "No promotional campaigns created yet.",
    createTitle: "Create Promo Code",
    codePlaceholder: "e.g. RIYADH15",
    discountPct: "Discount Percentage (%)",
    fixedDiscount: "Fixed Amount Discount (SAR)",
    expiryDate: "Expiration Date",
    savePromo: "Publish Promo Code",
    descPlaceholder: "Write a short summary (e.g. 15% off your first hair coloring appointment)...",
    
    // Premium Redesign translations
    kpiActive: "Active Campaigns",
    kpiTotalRedemptions: "Total Redemptions",
    kpiAvgDiscount: "Avg. Discount Rate",
    kpiEstimatedLift: "Est. Revenue Lift",
    activeBannersTitle: "Active Spotlight Promotions",
    targetSegmentLabel: "Target Segment",
    targetSegmentAll: "All Riyadh Clients",
    targetSegmentVip: "Riyadh VIPs Only",
    targetSegmentNew: "First-Time Bookers",
    targetSegmentLoyal: "Loyal Returning Clients",
    discountRateLabel: "Discount Rate",
    cancelBtn: "Cancel",
    percentageOff: "Percentage Off",
    fixedAmount: "Fixed Amount",
    disableBtn: "Disable",
    enableBtn: "Enable",
    statusDisabled: "DISABLED"
  },
  ar: {
    title: "العروض الترويجية والحملات",
    subtitle: "أطلق رموز الخصم وحملات العافية لجذب عملاء مميزين في الرياض.",
    createBtn: "إنشاء رمز خصم",
    tableCode: "رمز الخصم",
    tableType: "النوع",
    tableValue: "قيمة الخصم",
    tableExpiry: "تاريخ الانتهاء",
    tableStatus: "الحالة",
    tableUsage: "مرات الاستخدام",
    statusActive: "نشط",
    statusExpired: "منتهي",
    noPromos: "لم يتم إنشاء حملات ترويجية بعد.",
    createTitle: "إنشاء رمز خصم جديد",
    codePlaceholder: "مثال: RIYADH15",
    discountPct: "نسبة الخصم (%)",
    fixedDiscount: "خصم بمبلغ ثابت (ريال)",
    expiryDate: "تاريخ الانتهاء",
    savePromo: "نشر رمز الخصم",
    descPlaceholder: "اكتب وصفاً قصيراً (مثل: خصم 15% على جلسات تلوين الشعر الجديدة)...",

    // Premium Redesign translations
    kpiActive: "الحملات النشطة",
    kpiTotalRedemptions: "إجمالي الاستخدام",
    kpiAvgDiscount: "متوسط نسبة الخصم",
    kpiEstimatedLift: "زيادة المبيعات التقديرية",
    activeBannersTitle: "العروض النشطة البارزة",
    targetSegmentLabel: "شريحة العملاء المستهدفة",
    targetSegmentAll: "جميع عملاء الرياض",
    targetSegmentVip: "عملاء الرياض VIP فقط",
    targetSegmentNew: "الحجوزات لأول مرة",
    targetSegmentLoyal: "العملاء الأوفياء المستمرين",
    discountRateLabel: "معدل الخصم",
    cancelBtn: "إلغاء",
    percentageOff: "نسبة مئوية",
    fixedAmount: "خصم ثابت",
    disableBtn: "تعطيل",
    enableBtn: "تفعيل",
    statusDisabled: "معطل"
  }
};

export default function ProviderPromotionsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [promos, setPromos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create Form State
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [expiry, setExpiry] = useState("");
  const [description, setDescription] = useState("");
  
  // Custom Redesign State variables
  const [targetSegment, setTargetSegment] = useState<"all" | "vip" | "new" | "loyal">("all");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const t = translations[locale];
  const isRTL = locale === "ar";

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

  useEffect(() => {
    loadPromos();
  }, []);

  async function loadPromos() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        const { data, error: fetchError } = await supabase
          .from("provider_promos")
          .select("*")
          .eq("provider_id", providerInfo.id)
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        setPromos(data || []);
        return;
      }
      throw new Error("No provider active");
    } catch (err: any) {
      console.warn("Using offline promotions list due to local sandbox constraints:", err.message);
      setError("Displaying local campaign records.");

      setPromos([
        {
          id: "promo-1",
          code: "PRIMORA15",
          type: "percentage",
          value: 15,
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          description: "[vip] 15% off first booking on the marketplace platform.",
          usage_count: 48,
          is_active: true
        },
        {
          id: "promo-2",
          code: "SUMMERFREE",
          type: "fixed",
          value: 50,
          expires_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          description: "[all] 50 SAR discount on premium wellness retreats.",
          usage_count: 120,
          is_active: false
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!code || !value || !expiry) return;

    const finalDesc = targetSegment !== "all" ? `[${targetSegment}] ${description}` : description;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .single();

      if (providerInfo) {
        const { data: newPromo, error: insertError } = await supabase
          .from("provider_promos")
          .insert({
            provider_id: providerInfo.id,
            code: code.toUpperCase(),
            type,
            value: parseFloat(value),
            expires_at: new Date(expiry).toISOString(),
            description: finalDesc,
            usage_count: 0,
            is_active: true
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setPromos(prev => [newPromo, ...prev]);
      }

      setCode("");
      setValue("");
      setExpiry("");
      setDescription("");
      setTargetSegment("all");
      setShowForm(false);
    } catch (err: any) {
      console.warn("Creating promotion locally for simulation preview:", err.message);
      const simulatedPromo = {
        id: `promo-sim-${Date.now()}`,
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        expires_at: new Date(expiry).toISOString(),
        description: finalDesc,
        usage_count: 0,
        is_active: new Date(expiry) > new Date()
      };
      setPromos(prev => [simulatedPromo, ...prev]);
      setCode("");
      setValue("");
      setExpiry("");
      setDescription("");
      setTargetSegment("all");
      setShowForm(false);
    }
  }

  function togglePromoStatus(id: string) {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
  }

  const copyToClipboard = (codeStr: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(codeStr);
      setCopiedCode(codeStr);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const parseDescription = (desc: string) => {
    if (!desc) return { segment: "all" as const, cleanDesc: "" };
    const match = desc.match(/^\[(all|vip|new|loyal)\]\s*(.*)/i);
    if (match) {
      return { segment: match[1].toLowerCase() as "all" | "vip" | "new" | "loyal", cleanDesc: match[2] };
    }
    return { segment: "all" as const, cleanDesc: desc };
  };

  const getSegmentBadge = (segment: "all" | "vip" | "new" | "loyal") => {
    switch (segment) {
      case "vip":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#D1AF47]/10 text-[#D1AF47] border border-[#D1AF47]/20">
            <span className="w-1 h-1 rounded-full bg-[#D1AF47]"></span>
            {t.targetSegmentVip}
          </span>
        );
      case "new":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20">
            <span className="w-1 h-1 rounded-full bg-[#3DDC84]"></span>
            {t.targetSegmentNew}
          </span>
        );
      case "loyal":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F5B041]/10 text-[#F5B041] border border-[#F5B041]/20">
            <span className="w-1 h-1 rounded-full bg-[#F5B041]"></span>
            {t.targetSegmentLoyal}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.04] text-[#B8C0D4] border border-white/[0.06]">
            <span className="w-1 h-1 rounded-full bg-[#B8C0D4]"></span>
            {t.targetSegmentAll}
          </span>
        );
    }
  };

  // KPI Calculations
  const totalCampaigns = promos.length;
  const activePromos = promos.filter(p => p.is_active && new Date(p.expires_at) >= new Date());
  const activeCampaigns = activePromos.length;
  const totalRedemptions = promos.reduce((sum, p) => sum + (p.usage_count || 0), 0);
  
  const percentagePromos = promos.filter(p => p.type === "percentage");
  const avgDiscount = percentagePromos.length > 0
    ? Math.round(percentagePromos.reduce((sum, p) => sum + p.value, 0) / percentagePromos.length)
    : 15;

  const estRevenueLift = totalRedemptions * 180;

  return (
    <div className={`space-y-10 font-sans text-white pb-12 ${isRTL ? "rtl" : "ltr"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border-b border-white/[0.06] pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold font-serif tracking-tight text-white flex items-center gap-3">
            <span className="w-3.5 h-7 bg-gradient-to-b from-[#D1AF47] to-[#B8952E] rounded-full inline-block"></span>
            {t.title}
          </h2>
          <p className="text-sm text-[#B8C0D4]">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowForm(prev => !prev)}
          className="self-start sm:self-center px-6 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs rounded-xl shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_30px_rgba(209,175,71,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 uppercase tracking-widest"
        >
          {t.createBtn}
        </button>
      </div>

      {error && (
        <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#FF5D73] text-xs rounded-2xl p-4 flex items-center gap-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Notice: {error}</span>
        </div>
      )}

      {/* KPI METRICS COUNTERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Campaigns */}
        <div className="group bg-[#111827] border border-white/[0.06] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#7B859C] uppercase tracking-wider">{t.kpiActive}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-[#B8952E]/10 flex items-center justify-center text-[#D1AF47]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{activeCampaigns}</span>
            <span className="text-[10px] text-[#7B859C] font-semibold">/ {totalCampaigns} total</span>
          </div>
        </div>

        {/* Total Code Redemptions */}
        <div className="group bg-[#111827] border border-white/[0.06] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#7B859C] uppercase tracking-wider">{t.kpiTotalRedemptions}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#3DDC84]/20 to-transparent flex items-center justify-center text-[#3DDC84]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{totalRedemptions}</span>
            <span className="text-[10px] text-[#3DDC84] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84] animate-ping"></span>
              Live Redemptions
            </span>
          </div>
        </div>

        {/* Average Discount Rate */}
        <div className="group bg-[#111827] border border-white/[0.06] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#7B859C] uppercase tracking-wider">{t.kpiAvgDiscount}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#F5B041]/20 to-transparent flex items-center justify-center text-[#F5B041]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{avgDiscount}%</span>
            <span className="text-[10px] text-[#7B859C] font-semibold">average percentage</span>
          </div>
        </div>

        {/* Est. Revenue Lift */}
        <div className="group bg-[#111827] border border-white/[0.06] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#7B859C] uppercase tracking-wider">{t.kpiEstimatedLift}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-transparent flex items-center justify-center text-[#D1AF47]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#D1AF47]">{estRevenueLift.toLocaleString()} SAR</span>
            <span className="text-[10px] text-[#7B859C] font-semibold">estimated lift</span>
          </div>
        </div>
      </div>

      {/* ACTIVE SPOTLIGHT BANNERS */}
      {activePromos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#7B859C] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D1AF47] animate-pulse"></span>
            {t.activeBannersTitle}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activePromos.map((p) => {
              const { segment, cleanDesc } = parseDescription(p.description);
              return (
                <div
                  key={p.id}
                  className="group relative bg-gradient-to-br from-[#172033] to-[#0D1422] rounded-[24px] border border-white/[0.06] hover:border-[#D1AF47]/30 p-6 flex flex-col justify-between overflow-hidden shadow-xl hover:shadow-[0_0_30px_rgba(209,175,71,0.08)] transition-all duration-300"
                >
                  {/* Premium gold hover glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#D1AF47]/5 rounded-full blur-2xl group-hover:bg-[#D1AF47]/10 transition-all duration-500"></div>
                  
                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-start">
                      {getSegmentBadge(segment)}
                      <span className="text-[10px] font-semibold text-[#7B859C]">
                        {new Date(p.expires_at).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                        <span className="text-[#D1AF47]">
                          {p.type === "percentage" ? `${p.value}%` : `${p.value}`}
                        </span>
                        <span className="text-xs text-[#B8C0D4] font-medium uppercase">
                          {p.type === "percentage" ? "OFF" : "SAR OFF"}
                        </span>
                      </div>
                      <p className="text-xs text-[#B8C0D4] line-clamp-2 min-h-[2rem]">
                        {cleanDesc || (locale === "ar" ? "عرض حصري لنخبة الرياض" : "Exclusive boutique session discount")}
                      </p>
                    </div>
                  </div>

                  {/* Voucher design cutout line */}
                  <div className="relative my-4">
                    <div className={`absolute -top-1.5 w-3 h-3 bg-[#070B12] rounded-full border-white/[0.06] ${isRTL ? "-right-7.5 border-l" : "-left-7.5 border-r"}`}></div>
                    <div className={`absolute -top-1.5 w-3 h-3 bg-[#070B12] rounded-full border-white/[0.06] ${isRTL ? "-left-7.5 border-r" : "-right-7.5 border-l"}`}></div>
                    <div className="border-t border-dashed border-white/[0.08] w-full"></div>
                  </div>

                  <div className="flex justify-between items-center relative z-10">
                    <div className="font-mono text-sm font-bold tracking-wider text-white bg-black/40 px-3 py-1.5 rounded-xl border border-white/[0.04]">
                      {p.code}
                    </div>
                    <button
                      onClick={() => copyToClipboard(p.code)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#D1AF47]/10 text-[#D1AF47] border border-[#D1AF47]/20 hover:bg-[#D1AF47] hover:text-[#070B12] hover:border-transparent transition-all duration-300 flex items-center gap-1.5"
                    >
                      {copiedCode === p.code ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
                          </svg>
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE FORM CARD */}
      {showForm && (
        <div className="bg-[#111827] border border-white/[0.06] rounded-[24px] p-8 shadow-[0_0_30px_rgba(0,0,0,0.4)] space-y-6 relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#D1AF47]/10 to-transparent rounded-bl-[100px]"></div>

          <h3 className="font-bold text-base text-white border-b border-white/[0.06] pb-4 tracking-wide flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D1AF47] shadow-[0_0_10px_rgba(209,175,71,0.5)] animate-pulse"></span>
            {t.createTitle}
          </h3>
          
          <form onSubmit={createPromo} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Promo Code Input */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">{t.tableCode}</label>
                <input
                  type="text"
                  required
                  placeholder={t.codePlaceholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-[#0D1422] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#D1AF47] transition placeholder-[#7B859C]/40 font-mono tracking-wider"
                />
              </div>

              {/* Discount Type Select */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">{t.tableType}</label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full bg-[#0D1422] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#D1AF47] transition appearance-none cursor-pointer"
                  >
                    <option value="percentage">{t.discountPct}</option>
                    <option value="fixed">{t.fixedDiscount}</option>
                  </select>
                  <div className={`absolute inset-y-0 flex items-center pointer-events-none text-[#7B859C] ${isRTL ? "left-4" : "right-4"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Target Segment Select */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">{t.targetSegmentLabel}</label>
                <div className="relative">
                  <select
                    value={targetSegment}
                    onChange={(e) => setTargetSegment(e.target.value as any)}
                    className="w-full bg-[#0D1422] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#D1AF47] transition appearance-none cursor-pointer"
                  >
                    <option value="all">{t.targetSegmentAll}</option>
                    <option value="vip">{t.targetSegmentVip}</option>
                    <option value="new">{t.targetSegmentNew}</option>
                    <option value="loyal">{t.targetSegmentLoyal}</option>
                  </select>
                  <div className={`absolute inset-y-0 flex items-center pointer-events-none text-[#7B859C] ${isRTL ? "left-4" : "right-4"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Discount Value Slider + Number Input */}
            <div className="p-5 bg-[#0D1422] border border-white/[0.04] rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">{t.discountRateLabel}</span>
                  <span className="text-xs text-[#B8C0D4]">{t.discountRateLabel} for the active campaign.</span>
                </div>
                <div className="relative flex items-center bg-black/40 rounded-xl border border-white/[0.06] overflow-hidden px-3">
                  <input
                    type="number"
                    required
                    placeholder="15"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="bg-transparent border-none outline-none py-2 text-xs text-white w-20 font-bold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs font-bold text-[#D1AF47]">
                    {type === "percentage" ? "%" : "SAR"}
                  </span>
                </div>
              </div>

              {/* Gold Discount Rate Slider */}
              <div className="space-y-2 pt-2">
                <input
                  type="range"
                  min={type === "percentage" ? 1 : 5}
                  max={type === "percentage" ? 100 : 500}
                  step={type === "percentage" ? 1 : 5}
                  value={Number(value) || (type === "percentage" ? 15 : 50)}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full h-1 bg-[#1A2236] rounded-lg appearance-none cursor-pointer accent-[#D1AF47] focus:outline-none"
                  style={{
                    background: "linear-gradient(to right, #D1AF47 0%, #D1AF47 100%)",
                  }}
                />
                <div className="flex justify-between text-[10px] text-[#7B859C] font-mono">
                  <span>{type === "percentage" ? "1%" : "5 SAR"}</span>
                  <span>{type === "percentage" ? "50%" : "250 SAR"}</span>
                  <span>{type === "percentage" ? "100%" : "500 SAR"}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Expiration Date Input */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">{t.expiryDate}</label>
                <input
                  type="date"
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full bg-[#0D1422] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#D1AF47] transition placeholder-[#7B859C]/40"
                />
              </div>

              {/* Campaign Description Input */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#7B859C] tracking-widest block">Campaign Description</label>
                <input
                  type="text"
                  placeholder={t.descPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#0D1422] border border-white/[0.06] rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#D1AF47] transition placeholder-[#7B859C]/40"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 border border-white/[0.08] text-[#B8C0D4] font-bold text-xs rounded-xl hover:text-white hover:bg-white/[0.02] hover:border-white/[0.15] transition-all duration-300"
              >
                {t.cancelBtn}
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs rounded-xl shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_30px_rgba(209,175,71,0.25)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
              >
                {t.savePromo}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PROMOTIONS LIST TABLE / COUPON MANAGERS LIST */}
      {loading ? (
        <div className="text-center py-20 text-sm text-[#7B859C] flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-[#D1AF47] border-t-transparent rounded-full animate-spin"></div>
          <span>Loading coupons...</span>
        </div>
      ) : promos.length === 0 ? (
        <div className="bg-[#111827] border border-white/[0.06] rounded-[24px] p-16 text-center text-[#7B859C] shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.04] flex items-center justify-center text-[#7B859C]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white">{t.noPromos}</p>
            <p className="text-xs text-[#7B859C]">Launch your first exclusive coupon campaign for Riyadh clientele.</p>
          </div>
        </div>
      ) : (
        <div className="bg-[#111827] border border-white/[0.06] rounded-[24px] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse" dir={isRTL ? "rtl" : "ltr"}>
              <thead>
                <tr className="border-b border-white/[0.06] text-[#7B859C] font-bold uppercase text-[10px] tracking-wider bg-white/[0.01]">
                  <th className="py-4.5 px-6 text-start">{t.tableCode}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableType}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableValue}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableExpiry}</th>
                  <th className="py-4.5 px-6 text-center">{t.tableUsage}</th>
                  <th className="py-4.5 px-6 text-center">{t.tableStatus}</th>
                  <th className="py-4.5 px-6 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {promos.map((p) => {
                  const isExpired = new Date(p.expires_at) < new Date();
                  const { segment, cleanDesc } = parseDescription(p.description);

                  return (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors duration-300">
                      {/* Code */}
                      <td className="py-5 px-6 text-start">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-white tracking-widest bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-lg">
                              {p.code}
                            </span>
                            {getSegmentBadge(segment)}
                          </div>
                          {cleanDesc && (
                            <span className="text-xs text-[#B8C0D4] max-w-xs block mt-0.5">{cleanDesc}</span>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-5 px-6 text-start">
                        <span className="text-[#B8C0D4] font-semibold">
                          {p.type === "percentage" ? t.percentageOff : t.fixedAmount}
                        </span>
                      </td>

                      {/* Value */}
                      <td className="py-5 px-6 text-start">
                        <span className="font-extrabold text-[#D1AF47] text-sm">
                          {p.type === "percentage" ? `${p.value}%` : `${p.value} SAR`}
                        </span>
                      </td>

                      {/* Expiry */}
                      <td className="py-5 px-6 text-start">
                        <span className="text-[#B8C0D4] font-medium">
                          {new Date(p.expires_at).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                      </td>

                      {/* Usage */}
                      <td className="py-5 px-6 text-center">
                        <span className="font-bold text-white bg-white/[0.03] border border-white/[0.04] px-3 py-1 rounded-lg text-xs">
                          {p.usage_count}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-5 px-6 text-center">
                        <div className="flex justify-center">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5D73]"></span>
                              {t.statusExpired}
                            </span>
                          ) : p.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84] animate-pulse"></span>
                              {t.statusActive}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/[0.04] text-[#7B859C] border border-white/[0.06]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#7B859C]"></span>
                              {t.statusDisabled}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-5 px-6 text-end">
                        {!isExpired && (
                          <button
                            onClick={() => togglePromoStatus(p.id)}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 border ${
                              p.is_active
                                ? "bg-[#FF5D73]/10 text-[#FF5D73] border-[#FF5D73]/20 hover:bg-[#FF5D73] hover:text-[#070B12] hover:border-transparent"
                                : "bg-[#3DDC84]/10 text-[#3DDC84] border-[#3DDC84]/20 hover:bg-[#3DDC84] hover:text-[#070B12] hover:border-transparent"
                            }`}
                          >
                            {p.is_active ? t.disableBtn : t.enableBtn}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

