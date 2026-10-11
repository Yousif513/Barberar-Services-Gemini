"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog, ModalOverlay } from "@/components/modal";
import { errorMessage } from "@/lib/error-message";

const translations = {
  en: {
    title: "Coupons & Offers Builder",
    subtitle: "Generate platform promo codes, manage discount percentages, and schedule validity.",
    activeCoupons: "Active Coupons",
    totalRedeemed: "Total Redemptions",
    savedValue: "Switched-off Codes",
    couponCode: "Promo Code",
    discountType: "Discount Type",
    discountVal: "Value",
    usageCount: "Redeemed Count",
    status: "Status",
    actions: "Actions",
    active: "ACTIVE",
    expired: "EXPIRED",
    addCoupon: "Add Coupon",
    edit: "Edit",
    delete: "Deactivate",
    toggle: "Toggle",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading promotional codes...",
    noCoupons: "No promotional codes yet.",
    errorLoad: "Failed to load promotional codes.",
    errorSave: "Failed to save promotional code.",
    errorDelete: "Failed to deactivate promotional code.",
    errorToggle: "Failed to update promotional code.",
    codeLabel: "Code",
    typeLabel: "Type",
    valueLabel: "Value",
    maxRedemptionsLabel: "Max redemptions",
    percentage: "Percentage",
    flat: "Flat SAR",
    activeLabel: "Active",
    perCustomerLabel: "Uses per customer",
    perCustomerHint: "Leave empty for unlimited.",
    firstBookingLabel: "First booking only",
    startsLabel: "Valid from (Riyadh)",
    endsLabel: "Valid until (Riyadh)",
    reasonLabel: "Reason for this change",
    reasonHint: "Recorded in the audit log with your name.",
    reasonShort: "Enter a reason of at least 3 characters.",
    codeInvalid: "A code is 4 to 20 letters, digits, dashes or underscores.",
    valueInvalid: "Enter a value above zero (a percentage up to 100, or a flat amount up to 10000 SAR).",
    retry: "Retry",
    codes: "Codes",
    perCustomerColumn: "Per customer",
    unlimited: "Unlimited",
    firstOnly: "First booking",
    deactivateTitle: "Deactivate this promotion code",
    activateTitle: "Switch this promotion code on",
    deactivateIntro: "It stops accepting new redemptions; its redemption history is kept.",
    activateIntro: "It accepts redemptions again within its limits and dates.",
    working: "Saving...",
    saved: "Promotion code saved.",
    deactivated: "Promotion code switched off.",
    activated: "Promotion code switched on."
  },
  ar: {
    title: "منشئ الكوبونات والعروض",
    subtitle: "توليد أكواد الخصومات الترويجية، تحديد قيم التوفير، وتحديد أوقات الفعالية.",
    activeCoupons: "الكوبونات النشطة",
    totalRedeemed: "إجمالي الاستخدامات",
    savedValue: "إجمالي توفير العملاء",
    couponCode: "رمز الكوبون",
    discountType: "نوع الخصم",
    discountVal: "القيمة",
    usageCount: "مرات الاستخدام",
    status: "الحالة",
    actions: "الإجراءات",
    active: "نشط",
    expired: "منتهي",
    addCoupon: "إضافة كوبون",
    edit: "تعديل",
    delete: "إيقاف",
    toggle: "تبديل",
    save: "حفظ",
    cancel: "إلغاء",
    loading: "جارٍ تحميل رموز الخصم...",
    noCoupons: "لا توجد رموز خصم بعد.",
    errorLoad: "تعذر تحميل رموز الخصم.",
    errorSave: "تعذر حفظ رمز الخصم.",
    errorDelete: "تعذر إيقاف رمز الخصم.",
    errorToggle: "تعذر تحديث رمز الخصم.",
    codeLabel: "الرمز",
    typeLabel: "النوع",
    valueLabel: "القيمة",
    maxRedemptionsLabel: "الحد الأقصى للاستخدام",
    percentage: "نسبة مئوية",
    flat: "مبلغ ثابت (ر.س)",
    activeLabel: "نشط",
    perCustomerLabel: "مرات الاستخدام لكل عميل",
    perCustomerHint: "اتركه فارغاً لعدد غير محدود.",
    firstBookingLabel: "للحجز الأول فقط",
    startsLabel: "صالح من (توقيت الرياض)",
    endsLabel: "صالح حتى (توقيت الرياض)",
    reasonLabel: "سبب هذا التغيير",
    reasonHint: "يُسجَّل في سجل التدقيق باسمك.",
    reasonShort: "اكتب سبباً لا يقل عن 3 أحرف.",
    codeInvalid: "الرمز من 4 إلى 20 حرفاً أو رقماً أو شرطة أو شرطة سفلية.",
    valueInvalid: "أدخل قيمة أكبر من صفر (نسبة حتى 100، أو مبلغ ثابت حتى 10000 ر.س).",
    retry: "إعادة المحاولة",
    codes: "رمز",
    perCustomerColumn: "لكل عميل",
    unlimited: "غير محدود",
    firstOnly: "الحجز الأول",
    deactivateTitle: "إيقاف رمز الخصم",
    activateTitle: "تفعيل رمز الخصم",
    deactivateIntro: "لن يقبل استخدامات جديدة، ويبقى سجل الاستخدام.",
    activateIntro: "سيقبل الاستخدامات من جديد ضمن حدوده وتواريخه.",
    working: "جارٍ الحفظ...",
    saved: "تم حفظ رمز الخصم.",
    deactivated: "تم إيقاف رمز الخصم.",
    activated: "تم تفعيل رمز الخصم."
  }
};

const emptyCouponForm = {
  id: "",
  code: "",
  discountType: "percentage",
  discountValue: "",
  maxRedemptions: "",
  fundingSource: "platform",
  minOrderAmount: "0",
  maxDiscountCap: "",
  perCustomerLimit: "1",
  firstBookingOnly: false,
  startsOn: "",
  endsOn: "",
  reason: "",
  isActive: true
};

// A calendar date typed by the operator is a Riyadh day: start at its first second, end at its last.
const riyadhStart = (day: string) => (day ? `${day}T00:00:00+03:00` : null);
const riyadhEnd = (day: string) => (day ? `${day}T23:59:59+03:00` : null);
const riyadhDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : "");

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);
  const [formError, setFormError] = useState("");
  const [statusPending, setStatusPending] = useState<{ coupon: any; next: boolean } | null>(null);
  const [lang, setLang] = useState<"en" | "ar">("ar");

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

  const t = { ...translations.en, ...translations[lang] };
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const totalRedeemed = coupons.reduce((sum, coupon) => sum + Number(coupon.count || 0), 0);
  const switchedOff = coupons.filter((coupon) => !coupon.active).length;

  const formatCoupon = (coupon: any) => ({
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type,
    type: coupon.discount_type === "flat" ? t.flat : t.percentage,
    discountValue: Number(coupon.discount_value || 0),
    value: coupon.discount_type === "flat" ? `${Number(coupon.discount_value || 0)} SAR` : `${Number(coupon.discount_value || 0)}%`,
    count: Number(coupon.redeemed_count || 0),
    maxRedemptions: coupon.max_redemptions || "",
    fundingSource: coupon.funding_source || "platform",
    minOrderAmount: coupon.min_order_amount || 0,
    maxDiscountCap: coupon.max_discount_cap || "",
    perCustomerLimit: coupon.per_customer_limit ?? null,
    firstBookingOnly: Boolean(coupon.first_booking_only),
    startsAt: coupon.starts_at || null,
    endsAt: coupon.ends_at || null,
    active: Boolean(coupon.is_active)
  });

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbError } = await supabase
        .from("promotional_codes")
        .select("id, code, discount_type, discount_value, max_redemptions, redeemed_count, funding_source, min_order_amount, max_discount_cap, per_customer_limit, first_booking_only, starts_at, ends_at, is_active, created_at")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;
      setCoupons((data || []).map(formatCoupon));
    } catch (err) {
      setCoupons([]);
      setError(`${t.errorLoad} ${errorMessage(err)}`.trim());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCoupons();
  }, [lang]);

  const openAddCoupon = () => {
    setError("");
    setSuccess("");
    setFormError("");
    setCouponForm(emptyCouponForm);
    setModalOpen(true);
  };

  const openEditCoupon = (coupon: any) => {
    setError("");
    setSuccess("");
    setFormError("");
    setCouponForm({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
      fundingSource: coupon.fundingSource || "platform",
      minOrderAmount: String(coupon.minOrderAmount || 0),
      maxDiscountCap: coupon.maxDiscountCap ? String(coupon.maxDiscountCap) : "",
      perCustomerLimit: coupon.perCustomerLimit ? String(coupon.perCustomerLimit) : "",
      firstBookingOnly: coupon.firstBookingOnly,
      startsOn: riyadhDay(coupon.startsAt),
      endsOn: riyadhDay(coupon.endsAt),
      reason: "",
      isActive: coupon.active
    });
    setModalOpen(true);
  };

  // One server command validates the bounds, requires the reason and writes the audit row. A refusal stays in the dialog
  // with everything the operator typed.
  const saveCoupon = async () => {
    const discountValue = Number(couponForm.discountValue);
    if (!/^[A-Za-z0-9_-]{4,20}$/.test(couponForm.code.trim())) { setFormError(t.codeInvalid); return; }
    if (!Number.isFinite(discountValue) || discountValue <= 0) { setFormError(t.valueInvalid); return; }
    if (couponForm.reason.trim().length < 3) { setFormError(t.reasonShort); return; }
    setSaving(true);
    setFormError("");
    const { error: rpcError } = await supabase.rpc("admin_save_promo_code", {
      p_code: couponForm.code.trim().toUpperCase(),
      p_discount_type: couponForm.discountType,
      p_discount_value: discountValue,
      p_reason: couponForm.reason.trim(),
      p_id: couponForm.id || null,
      p_max_redemptions: couponForm.maxRedemptions ? Number(couponForm.maxRedemptions) : null,
      p_funding_source: couponForm.fundingSource,
      p_min_order_amount: Number(couponForm.minOrderAmount || 0),
      p_max_discount_cap: couponForm.maxDiscountCap ? Number(couponForm.maxDiscountCap) : null,
      p_per_customer_limit: couponForm.perCustomerLimit ? Number(couponForm.perCustomerLimit) : null,
      p_first_booking_only: couponForm.firstBookingOnly,
      p_is_active: couponForm.isActive,
      p_starts_at: riyadhStart(couponForm.startsOn),
      p_ends_at: riyadhEnd(couponForm.endsOn)
    });
    setSaving(false);
    if (rpcError) {
      setFormError(errorMessage(rpcError) || t.errorSave);
      return;
    }
    setSuccess(t.saved);
    setModalOpen(false);
    await loadCoupons();
  };

  const handleToggle = (coupon: any) => setStatusPending({ coupon, next: !coupon.active });
  const deleteCoupon = (coupon: any) => setStatusPending({ coupon, next: false });

  const runStatusChange = async (reason: string): Promise<string | null> => {
    if (!statusPending) return null;
    const { coupon, next } = statusPending;
    const { error: rpcError } = await supabase.rpc("admin_set_promo_code_active", { p_id: coupon.id, p_active: next, p_reason: reason });
    if (rpcError) return errorMessage(rpcError) || t.errorToggle;
    setError("");
    setSuccess(next ? t.activated : t.deactivated);
    setCoupons(prev => prev.map(item => item.id === coupon.id ? { ...item, active: next } : item));
    return null;
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {statusPending && (
        <CommandDialog
          locale={lang}
          tone={statusPending.next ? "default" : "danger"}
          title={statusPending.next ? t.activateTitle : t.deactivateTitle}
          intro={statusPending.next ? t.activateIntro : t.deactivateIntro}
          facts={[{ label: t.codeLabel, value: String(statusPending.coupon.code) }]}
          reasonLabel={t.reasonLabel}
          confirmLabel={statusPending.next ? t.activateTitle : t.delete}
          onConfirm={runStatusChange}
          onClose={() => setStatusPending(null)}
        />
      )}
      <div className={`flex items-start justify-between gap-4 ${flip}`}>
        <div>
          <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
        </div>
        <button onClick={openAddCoupon} className="rounded-xl bg-gray-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-gray-800">
          {t.addCoupon}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] text-xs rounded-xl p-4 font-bold">
          <span>{error}</span>
          <button type="button" onClick={() => void loadCoupons()} className="rounded-lg border border-[#B42318]/40 px-3 py-1.5 text-[11px] font-black hover:bg-white">{t.retry}</button>
        </div>
      )}
      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeCoupons}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{coupons.filter(c => c.active).length.toLocaleString(isRTL ? "ar-SA" : "en-US")} {t.codes}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalRedeemed}</span>
          <strong className="block text-2xl font-serif font-black text-[#D1AF47] mt-2.5">{totalRedeemed.toLocaleString(isRTL ? "ar-SA" : "en-US")}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.savedValue}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{switchedOff.toLocaleString(isRTL ? "ar-SA" : "en-US")} {t.codes}</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.couponCode}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.discountType}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.discountVal}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.usageCount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.perCustomerColumn}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.noCoupons}</td>
                </tr>
              ) : coupons.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-mono font-bold text-gray-900">{c.code}</td>
                  <td className="py-4 px-6">{c.type}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{c.value}</td>
                  <td className="py-4 px-6 font-serif font-black">{c.count}</td>
                  <td className="py-4 px-6">
                    {c.perCustomerLimit ?? t.unlimited}
                    {c.firstBookingOnly ? <span className="ms-2 rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[9px] font-black text-[#B54708]">{t.firstOnly}</span> : null}
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      c.active ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FEF3F2] text-[#B91C1C]"
                    }`}>{c.active ? t.active : t.expired}</span>
                  </td>
                  <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                    <div className={`flex gap-2 ${isRTL ? "justify-start" : "justify-end"}`}>
                      <button onClick={() => openEditCoupon(c)} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-900 rounded-lg text-[10px] uppercase font-black tracking-wider hover:border-[#D1AF47] transition">{t.edit}</button>
                      <button onClick={() => handleToggle(c)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition">{t.toggle}</button>
                      <button onClick={() => deleteCoupon(c)} className="px-3 py-1.5 bg-[#FEF3F2] text-[#B42318] rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-[#FEE4E2] transition">{t.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <ModalOverlay onClose={() => setModalOpen(false)} canClose={!saving} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="coupon-dialog-title" tabIndex={-1} className="w-full max-w-lg rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
            <div className={`mb-5 flex items-start justify-between gap-4 ${flip}`}>
              <div>
                <h3 id="coupon-dialog-title" className="font-serif text-xl font-black text-gray-900">{couponForm.id ? t.edit : t.addCoupon}</h3>
                <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 hover:text-gray-900">
                {t.cancel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.codeLabel}
                <input value={couponForm.code} onChange={(event) => setCouponForm(form => ({ ...form, code: event.target.value }))} dir="ltr" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold uppercase text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.typeLabel}
                <select value={couponForm.discountType} onChange={(event) => setCouponForm(form => ({ ...form, discountType: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]">
                  <option value="percentage">{t.percentage}</option>
                  <option value="flat">{t.flat}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.valueLabel}
                <input type="number" min="1" max={couponForm.discountType === "percentage" ? 100 : 10000} value={couponForm.discountValue} onChange={(event) => setCouponForm(form => ({ ...form, discountValue: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.maxRedemptionsLabel}
                <input type="number" min="1" value={couponForm.maxRedemptions} onChange={(event) => setCouponForm(form => ({ ...form, maxRedemptions: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.perCustomerLabel}
                <input type="number" min="1" placeholder={t.perCustomerHint} value={couponForm.perCustomerLimit} onChange={(event) => setCouponForm(form => ({ ...form, perCustomerLimit: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="flex items-center justify-between gap-3 self-end rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700">
                {t.firstBookingLabel}
                <input type="checkbox" checked={couponForm.firstBookingOnly} onChange={(event) => setCouponForm(form => ({ ...form, firstBookingOnly: event.target.checked }))} className="h-4 w-4 accent-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {isRTL ? "جهة التمويل" : "Funding Source"}
                <select value={couponForm.fundingSource} onChange={(event) => setCouponForm(form => ({ ...form, fundingSource: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]">
                  <option value="platform">{isRTL ? "منصة بريمورا (Platform)" : "Platform (PRIMORA)"}</option>
                  <option value="provider">{isRTL ? "مقدم الخدمة / الصالون (Provider)" : "Provider (Salon)"}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {isRTL ? "الحد الأدنى للطلب (ريال)" : "Min Order (SAR)"}
                <input type="number" min="0" value={couponForm.minOrderAmount} onChange={(event) => setCouponForm(form => ({ ...form, minOrderAmount: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {isRTL ? "الحد الأقصى للخصم (ريال)" : "Max Discount Cap (SAR)"}
                <input type="number" min="1" placeholder={isRTL ? "اختياري" : "Optional"} value={couponForm.maxDiscountCap} onChange={(event) => setCouponForm(form => ({ ...form, maxDiscountCap: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.startsLabel}
                <input type="date" value={couponForm.startsOn} onChange={(event) => setCouponForm(form => ({ ...form, startsOn: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.endsLabel}
                <input type="date" value={couponForm.endsOn} onChange={(event) => setCouponForm(form => ({ ...form, endsOn: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 sm:col-span-2">
                {t.activeLabel}
                <input type="checkbox" checked={couponForm.isActive} onChange={(event) => setCouponForm(form => ({ ...form, isActive: event.target.checked }))} className="h-4 w-4 accent-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500 sm:col-span-2">
                {t.reasonLabel}
                <textarea rows={2} value={couponForm.reason} onChange={(event) => setCouponForm(form => ({ ...form, reason: event.target.value }))} aria-describedby="coupon-reason-hint" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
                <span id="coupon-reason-hint" className="block text-[11px] font-semibold normal-case tracking-normal text-gray-500">{t.reasonHint}</span>
              </label>
            </div>

            {formError && <p role="alert" className="mt-4 rounded-xl border border-[#FEE4E2] bg-[#FEF3F2] p-3 text-xs font-bold text-[#B42318]">{formError}</p>}

            <div className={`mt-6 flex gap-3 ${isRTL ? "justify-start" : "justify-end"}`}>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-xl border border-gray-200 px-5 py-2 text-xs font-black uppercase tracking-wider text-gray-600 hover:text-gray-900">{t.cancel}</button>
              <button type="button" onClick={() => void saveCoupon()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2 text-xs font-black uppercase tracking-wider text-gray-950 transition hover:bg-[#E0C46A] disabled:opacity-60">{saving ? t.working : t.save}</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
