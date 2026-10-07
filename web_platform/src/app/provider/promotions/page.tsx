"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { riyadhDateKey } from "@/lib/booking-display.mjs";
import { useOperationsLocale } from "@/components/operations-ui";
import { useProviderContext } from "../_components/provider-context";

const translations = {
  en: {
    title: "Promotions & Campaigns",
    subtitle: "Create discount codes your customers type at checkout. You fund the discount; it comes off the price of your services.",
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
    
    // Premium Redesign translations
    kpiActive: "Active Campaigns",
    kpiTotalRedemptions: "Total Redemptions",
    kpiAvgDiscount: "Avg. Discount Rate",
    activeBannersTitle: "Active Spotlight Promotions",
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
    subtitle: "أنشئ رموز خصم يكتبها عملاؤك عند الدفع. أنت تتحمل قيمة الخصم، ويُخصم من سعر خدماتك.",
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

    // Premium Redesign translations
    kpiActive: "الحملات النشطة",
    kpiTotalRedemptions: "إجمالي الاستخدام",
    kpiAvgDiscount: "متوسط نسبة الخصم",
    activeBannersTitle: "العروض النشطة البارزة",
    discountRateLabel: "معدل الخصم",
    cancelBtn: "إلغاء",
    percentageOff: "نسبة مئوية",
    fixedAmount: "خصم ثابت",
    disableBtn: "تعطيل",
    enableBtn: "تفعيل",
    statusDisabled: "معطل"
  }
};

const promoCopy = {
  en: {
    allCustomers: "All customers",
    noExpiry: "No end date",
    maxUses: "Redemption limit (optional)",
    minOrder: "Minimum order in SAR (optional)",
    kpiSwitchedOff: "Switched off",
    codesLabel: "codes",
    total: "total",
    redemptionsLabel: "redemptions so far",
    avgLabel: "average percentage",
    actions: "Actions",
    loading: "Loading your codes…",
    emptyHint: "Create your first code and tell your customers to enter it at checkout.",
    loadFailed: "Your codes could not be loaded: ",
    createFailed: "The code was not created: ",
    toggleFailed: "The code was not changed: ",
    badCode: "A code is 4 to 20 letters, digits, dashes or underscores.",
    badValue: "Enter a discount above 0 (a percentage cannot be above 100).",
    badExpiry: "Choose an end date that is today or later.",
    badNumber: "The limit and minimum order must be whole or positive numbers.",
    segmentNote: "A code works for every customer of your business. Codes for new clients only or for VIPs are not available yet.",
    discountFor: "Discount for the code",
    ownerOnly: "Only the business owner manages promo codes.",
    copied: "COPIED",
    copy: "COPY",
    expiresPrefix: "Ends",
    minLine: "Minimum order",
    unlimited: "Unlimited uses",
    uses: "uses",
  },
  ar: {
    allCustomers: "كل العملاء",
    noExpiry: "بلا تاريخ انتهاء",
    maxUses: "حد الاستخدام (اختياري)",
    minOrder: "الحد الأدنى للطلب بالريال (اختياري)",
    kpiSwitchedOff: "الموقوفة",
    codesLabel: "رموز",
    total: "إجمالاً",
    redemptionsLabel: "استخدام حتى الآن",
    avgLabel: "متوسط النسبة",
    actions: "الإجراءات",
    loading: "جارٍ تحميل رموزك…",
    emptyHint: "أنشئ أول رمز واطلب من عملائك إدخاله عند الدفع.",
    loadFailed: "تعذر تحميل رموزك: ",
    createFailed: "لم يُنشأ الرمز: ",
    toggleFailed: "لم يتغير الرمز: ",
    badCode: "الرمز من 4 إلى 20 حرفاً أو رقماً أو شرطة أو شرطة سفلية.",
    badValue: "أدخل خصماً أكبر من 0 (ولا تتجاوز النسبة 100).",
    badExpiry: "اختر تاريخ انتهاء اليوم أو بعده.",
    badNumber: "حد الاستخدام والحد الأدنى للطلب يجب أن يكونا أرقاماً موجبة.",
    segmentNote: "يعمل الرمز لكل عملاء نشاطك. الرموز لعملاء جدد فقط أو لعملاء VIP غير متاحة بعد.",
    discountFor: "قيمة الخصم للرمز",
    ownerOnly: "صاحب النشاط وحده يدير رموز الخصم.",
    copied: "تم النسخ",
    copy: "نسخ",
    expiresPrefix: "ينتهي",
    minLine: "الحد الأدنى للطلب",
    unlimited: "استخدام غير محدود",
    uses: "استخدام",
  },
};

type Promo = {
  id: string; code: string; type: "percentage" | "flat"; value: number; expires_at: string | null;
  usage_count: number; max_redemptions: number | null; min_order: number; is_active: boolean;
};

export default function ProviderPromotionsPage() {
  const locale = useOperationsLocale();
  const state = useProviderContext();
  const providerId = state.status === "ready" && state.context.role === "owner" ? state.context.providerId : null;
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  // Create Form State
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "flat">("percentage");
  const [value, setValue] = useState("");
  const [expiry, setExpiry] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const t = translations[locale];
  const x = promoCopy[locale];
  const isRTL = locale === "ar";

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("list_provider_promo_codes", { p_provider_id: providerId });
      if (!live) return;
      if (rpcError) {
        setError(promoCopy[locale].loadFailed + errorMessage(rpcError));
        setPromos([]);
      } else {
        setError("");
        setPromos(((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id),
          code: String(row.code),
          type: row.discount_type === "flat" ? "flat" : "percentage",
          value: Number(row.discount_value),
          expires_at: typeof row.ends_at === "string" ? row.ends_at : null,
          usage_count: Number(row.redeemed_count || 0),
          max_redemptions: row.max_redemptions === null || row.max_redemptions === undefined ? null : Number(row.max_redemptions),
          min_order: Number(row.min_order_amount || 0),
          is_active: Boolean(row.is_active),
        })));
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, version, locale]);

  // The code is created by an owner-only command in the table checkout reads; the form keeps what was typed when it is refused.
  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || saving) return;
    setFormError("");
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{4,20}$/.test(trimmed)) { setFormError(x.badCode); return; }
    const amount = Number(value);
    if (!(amount > 0) || (type === "percentage" && amount > 100)) { setFormError(x.badValue); return; }
    if (!expiry || expiry < (riyadhDateKey(new Date()) as string)) { setFormError(x.badExpiry); return; }
    const limit = maxUses.trim() === "" ? null : Number(maxUses);
    const minimum = minOrder.trim() === "" ? 0 : Number(minOrder);
    if ((limit !== null && !(Number.isInteger(limit) && limit >= 1)) || !(minimum >= 0)) { setFormError(x.badNumber); return; }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("create_provider_promo_code", {
      p_provider_id: providerId,
      p_code: trimmed,
      p_discount_type: type,
      p_discount_value: amount,
      p_ends_at: `${expiry}T23:59:59+03:00`,
      p_max_redemptions: limit,
      p_min_order_amount: minimum,
    });
    setSaving(false);
    if (rpcError) { setFormError(x.createFailed + errorMessage(rpcError)); return; }
    setCode(""); setValue(""); setExpiry(""); setMaxUses(""); setMinOrder("");
    setShowForm(false);
    setVersion((current) => current + 1);
  }

  async function togglePromoStatus(promo: Promo) {
    if (busyId) return;
    setBusyId(promo.id);
    setError("");
    const { error: rpcError } = await supabase.rpc("set_provider_promo_code_active", { p_code_id: promo.id, p_active: !promo.is_active });
    setBusyId("");
    if (rpcError) { setError(x.toggleFailed + errorMessage(rpcError)); return; }
    setVersion((current) => current + 1);
  }

  const copyToClipboard = async (codeStr: string) => {
    try {
      await navigator.clipboard.writeText(codeStr);
      setCopiedCode(codeStr);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setError(isRTL ? "تعذر النسخ تلقائياً. حدد الرمز وانسخه يدوياً." : "Could not copy automatically. Select the code and copy it by hand.");
    }
  };

  const showLoading = loading && (state.status === "loading" || providerId !== null);

  // KPI figures come from the codes themselves; nothing is estimated.
  const totalCampaigns = promos.length;
  const notExpired = (p: Promo) => !p.expires_at || new Date(p.expires_at) >= new Date();
  const activePromos = promos.filter(p => p.is_active && notExpired(p));
  const activeCampaigns = activePromos.length;
  const totalRedemptions = promos.reduce((sum, p) => sum + (p.usage_count || 0), 0);
  const switchedOff = promos.filter(p => !p.is_active).length;
  const percentagePromos = promos.filter(p => p.type === "percentage");
  const avgDiscount = percentagePromos.length > 0
    ? Math.round(percentagePromos.reduce((sum, p) => sum + p.value, 0) / percentagePromos.length)
    : null;

  if (state.status === "ready" && !providerId) {
    return <p className="p-6 text-sm font-semibold text-[#667085]">{x.ownerOnly}</p>;
  }

  return (
    <div className="space-y-10 font-sans text-[#101828] pb-12 text-start">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 border-b border-[#ECECEC] pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold font-serif tracking-tight text-[#101828] flex items-center gap-3">
            <span className="w-3.5 h-7 bg-gradient-to-b from-[#D1AF47] to-[#B8952E] rounded-full inline-block"></span>
            {t.title}
          </h2>
          <p className="text-sm text-[#344054]">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowForm(prev => !prev)}
          className="self-start sm:self-center px-6 py-3 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs rounded-xl shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_30px_rgba(209,175,71,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 uppercase tracking-widest"
        >
          {t.createBtn}
        </button>
      </div>

      {error && (
        <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-xs rounded-2xl p-4 flex items-center gap-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span role="alert">{error}</span>
        </div>
      )}

      {/* KPI METRICS COUNTERS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Campaigns */}
        <div className="group bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiActive}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-[#B8952E]/10 flex items-center justify-center text-[#D1AF47]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#101828]">{activeCampaigns}</span>
            <span className="text-[10px] text-[#667085] font-semibold">/ {totalCampaigns} {x.total}</span>
          </div>
        </div>

        {/* Total Code Redemptions */}
        <div className="group bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiTotalRedemptions}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#3DDC84]/20 to-transparent flex items-center justify-center text-[#22C55E]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#101828]">{totalRedemptions}</span>
            <span className="text-[10px] text-[#22C55E] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84] animate-ping"></span>
              {x.redemptionsLabel}
            </span>
          </div>
        </div>

        {/* Average Discount Rate */}
        <div className="group bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{t.kpiAvgDiscount}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#F5B041]/20 to-transparent flex items-center justify-center text-[#F5B041]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#101828]">{avgDiscount === null ? "—" : `${avgDiscount}%`}</span>
            <span className="text-[10px] text-[#667085] font-semibold">{x.avgLabel}</span>
          </div>
        </div>

        {/* Switched-off codes */}
        <div className="group bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 hover:border-[#D1AF47]/30 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)] transition-all duration-300">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">{x.kpiSwitchedOff}</span>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D1AF47]/20 to-transparent flex items-center justify-center text-[#D1AF47]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#D1AF47]">{switchedOff}</span>
            <span className="text-[10px] text-[#667085] font-semibold">{x.codesLabel}</span>
          </div>
        </div>
      </div>

      {/* ACTIVE SPOTLIGHT BANNERS */}
      {activePromos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-[#667085] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#D1AF47] animate-pulse"></span>
            {t.activeBannersTitle}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activePromos.map((p) => {
              return (
                <div
                  key={p.id}
                  className="group relative bg-white rounded-[24px] border border-[#ECECEC] hover:border-[#D1AF47]/30 p-6 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300"
                >
                  {/* Premium gold hover glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#D1AF47]/5 rounded-full blur-2xl group-hover:bg-[#D1AF47]/10 transition-all duration-500"></div>
                  
                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-start">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F3F4F6] border border-[#ECECEC] text-[#344054]">{x.allCustomers}</span>
                      <span className="text-[10px] font-semibold text-[#667085]">
                        {p.expires_at ? new Date(p.expires_at).toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
                          day: "numeric",
                          month: "short",
                        }) : x.noExpiry}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-3xl font-black text-[#101828] tracking-tight flex items-baseline gap-1">
                        <span className="text-[#D1AF47]">
                          {p.type === "percentage" ? `${p.value}%` : `${p.value}`}
                        </span>
                        <span className="text-xs text-[#344054] font-medium uppercase">
                          {p.type === "percentage" ? "OFF" : "SAR OFF"}
                        </span>
                      </div>
                      <p className="text-xs text-[#344054] line-clamp-2 min-h-[2rem]">
                        {p.min_order > 0 ? `${x.minLine}: ${p.min_order} SAR` : ""}{p.min_order > 0 ? " · " : ""}{p.max_redemptions === null ? x.unlimited : `${p.usage_count} / ${p.max_redemptions} ${x.uses}`}
                      </p>
                    </div>
                  </div>

                  {/* Voucher design cutout line */}
                  <div className="relative my-4">
                    <div className={`absolute -top-1.5 w-3 h-3 bg-transparent rounded-full border-[#ECECEC] ${isRTL ? "-right-7.5 border-l" : "-left-7.5 border-r"}`}></div>
                    <div className={`absolute -top-1.5 w-3 h-3 bg-transparent rounded-full border-[#ECECEC] ${isRTL ? "-left-7.5 border-r" : "-right-7.5 border-l"}`}></div>
                    <div className="border-t border-dashed border-[#ECECEC] w-full"></div>
                  </div>

                  <div className="flex justify-between items-center relative z-10">
                    <div className="font-mono text-sm font-bold tracking-wider text-[#101828] bg-[#F9FAFB] px-3 py-1.5 rounded-xl border border-[#ECECEC]">
                      {p.code}
                    </div>
                    <button
                      onClick={() => void copyToClipboard(p.code)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#D1AF47]/10 text-[#D1AF47] border border-[#D1AF47]/20 hover:bg-[#D1AF47] hover:text-[#070B12] hover:border-transparent transition-all duration-300 flex items-center gap-1.5"
                    >
                      {copiedCode === p.code ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{x.copied}</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
                          </svg>
                          <span>{x.copy}</span>
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
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-8 shadow-[0_0_30px_rgba(0,0,0,0.4)] space-y-6 relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#D1AF47]/10 to-transparent rounded-bl-[100px]"></div>

          <h3 className="font-bold text-base text-[#101828] border-b border-[#ECECEC] pb-4 tracking-wide flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D1AF47] shadow-[0_0_10px_rgba(209,175,71,0.5)] animate-pulse"></span>
            {t.createTitle}
          </h3>
          
          <form onSubmit={createPromo} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Promo Code Input */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{t.tableCode}</label>
                <input
                  type="text"
                  required
                  placeholder={t.codePlaceholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-xl px-4 py-3 text-xs text-[#101828] outline-none focus:border-[#D1AF47] transition placeholder-[#7B859C]/40 font-mono tracking-wider"
                />
              </div>

              {/* Discount Type Select */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{t.tableType}</label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "percentage" | "flat")}
                    className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-xl px-4 py-3 text-xs text-[#101828] outline-none focus:border-[#D1AF47] transition appearance-none cursor-pointer"
                  >
                    <option value="percentage">{t.discountPct}</option>
                    <option value="flat">{t.fixedDiscount}</option>
                  </select>
                  <div className={`absolute inset-y-0 flex items-center pointer-events-none text-[#667085] end-4`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

            </div>

            <p className="text-xs text-[#667085]">{x.segmentNote}</p>

            {/* Discount Value Slider + Number Input */}
            <div className="p-5 bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{t.discountRateLabel}</span>
                  <span className="text-xs text-[#344054]">{x.discountFor}</span>
                </div>
                <div className="relative flex items-center bg-[#F9FAFB] rounded-xl border border-[#ECECEC] overflow-hidden px-3">
                  <input
                    type="number"
                    required
                    placeholder="15"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="bg-transparent border-none outline-none py-2 text-xs text-[#101828] w-20 font-bold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                <div className="flex justify-between text-[10px] text-[#667085] font-mono">
                  <span>{type === "percentage" ? "1%" : "5 SAR"}</span>
                  <span>{type === "percentage" ? "50%" : "250 SAR"}</span>
                  <span>{type === "percentage" ? "100%" : "500 SAR"}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Expiration Date Input */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{t.expiryDate}</label>
                <input
                  type="date"
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-xl px-4 py-3 text-xs text-[#101828] outline-none focus:border-[#D1AF47] transition placeholder-[#7B859C]/40"
                />
              </div>

              {/* Campaign Description Input */}
              <div className="space-y-2">
                <label htmlFor="promo-max-uses" className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{x.maxUses}</label>
                <input
                  id="promo-max-uses"
                  type="number"
                  min={1}
                  step={1}
                  dir="ltr"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-xl px-4 py-3 text-xs text-[#101828] outline-none focus:border-[#D1AF47] transition"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="promo-min-order" className="text-[10px] uppercase font-bold text-[#667085] tracking-widest block">{x.minOrder}</label>
                <input
                  id="promo-min-order"
                  type="number"
                  min={0}
                  step="0.01"
                  dir="ltr"
                  value={minOrder}
                  onChange={(e) => setMinOrder(e.target.value)}
                  className="w-full bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-xl px-4 py-3 text-xs text-[#101828] outline-none focus:border-[#D1AF47] transition"
                />
              </div>
            </div>

            {formError && <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-sm font-semibold text-[#B42318]">{formError}</div>}

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-[#ECECEC]">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 border border-[#ECECEC] text-[#344054] font-bold text-xs rounded-xl hover:text-[#101828] hover:bg-transparent hover:border-[#D1AF47]/40 transition-all duration-300"
              >
                {t.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 disabled:opacity-60 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs rounded-xl shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_30px_rgba(209,175,71,0.25)] hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
              >
                {t.savePromo}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PROMOTIONS LIST TABLE / COUPON MANAGERS LIST */}
      {showLoading ? (
        <div className="text-center py-20 text-sm text-[#667085] flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-[#D1AF47] border-t-transparent rounded-full animate-spin"></div>
          <span role="status">{x.loading}</span>
        </div>
      ) : promos.length === 0 ? (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-16 text-center text-[#667085] shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-transparent border border-[#ECECEC] flex items-center justify-center text-[#667085]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#101828]">{t.noPromos}</p>
            <p className="text-xs text-[#667085]">{x.emptyHint}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse" dir={isRTL ? "rtl" : "ltr"}>
              <thead>
                <tr className="border-b border-[#ECECEC] text-[#667085] font-bold uppercase text-[10px] tracking-wider bg-[#F9FAFB]/50">
                  <th className="py-4.5 px-6 text-start">{t.tableCode}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableType}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableValue}</th>
                  <th className="py-4.5 px-6 text-start">{t.tableExpiry}</th>
                  <th className="py-4.5 px-6 text-center">{t.tableUsage}</th>
                  <th className="py-4.5 px-6 text-center">{t.tableStatus}</th>
                  <th className="py-4.5 px-6 text-end">{x.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECECEC]">
                {promos.map((p) => {
                  const isExpired = !notExpired(p);
    
                  return (
                    <tr key={p.id} className="hover:bg-transparent transition-colors duration-300">
                      {/* Code */}
                      <td className="py-5 px-6 text-start">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-[#101828] tracking-widest bg-[#F3F4F6] border border-[#ECECEC] px-2.5 py-1 rounded-lg">
                              {p.code}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F3F4F6] border border-[#ECECEC] text-[#344054]">{x.allCustomers}</span>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="py-5 px-6 text-start">
                        <span className="text-[#344054] font-semibold">
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
                        <span className="text-[#344054] font-medium">
                          {p.expires_at ? new Date(p.expires_at).toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }) : x.noExpiry}
                        </span>
                      </td>

                      {/* Usage */}
                      <td className="py-5 px-6 text-center">
                        <span className="font-bold text-[#101828] bg-[#F9FAFB] border border-[#ECECEC] px-3 py-1 rounded-lg text-xs">
                          {p.usage_count}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-5 px-6 text-center">
                        <div className="flex justify-center">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#FF5D73]/10 text-[#EF4444] border border-[#FF5D73]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5D73]"></span>
                              {t.statusExpired}
                            </span>
                          ) : p.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#3DDC84]/10 text-[#22C55E] border border-[#3DDC84]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3DDC84] animate-pulse"></span>
                              {t.statusActive}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#F3F4F6] border border-[#ECECEC] text-[#667085] border border-[#ECECEC]">
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
                            disabled={busyId === p.id}
                            onClick={() => void togglePromoStatus(p)}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 border ${
                              p.is_active
                                ? "bg-[#FF5D73]/10 text-[#EF4444] border-[#FF5D73]/20 hover:bg-[#FF5D73] hover:text-[#070B12] hover:border-transparent"
                                : "bg-[#3DDC84]/10 text-[#22C55E] border-[#3DDC84]/20 hover:bg-[#3DDC84] hover:text-[#070B12] hover:border-transparent"
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

