"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Coupons & Offers Builder",
    subtitle: "Generate platform promo codes, manage discount percentages, and schedule validity.",
    activeCoupons: "Active Coupons",
    totalRedeemed: "Total Redemptions",
    savedValue: "Saved by Customers",
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
    delete: "Delete",
    toggle: "Toggle",
    save: "Save",
    cancel: "Cancel",
    loading: "Loading promotional codes...",
    noCoupons: "No promotional codes yet.",
    errorLoad: "Failed to load promotional codes.",
    errorSave: "Failed to save promotional code.",
    errorDelete: "Failed to delete promotional code.",
    errorToggle: "Failed to update promotional code.",
    codeLabel: "Code",
    typeLabel: "Type",
    valueLabel: "Value",
    maxRedemptionsLabel: "Max redemptions",
    percentage: "Percentage",
    flat: "Flat SAR",
    activeLabel: "Active"
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
    expired: "منتهي"
  }
};

const emptyCouponForm = {
  id: "",
  code: "",
  discountType: "percentage",
  discountValue: "",
  maxRedemptions: "",
  isActive: true
};

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [couponForm, setCouponForm] = useState(emptyCouponForm);
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
  const savedValue = coupons.reduce((sum, coupon) => {
    if (coupon.discountType === "flat") return sum + Number(coupon.discountValue || 0) * Number(coupon.count || 0);
    return sum;
  }, 0);

  const formatCoupon = (coupon: any) => ({
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type,
    type: coupon.discount_type === "flat" ? t.flat : t.percentage,
    discountValue: Number(coupon.discount_value || 0),
    value: coupon.discount_type === "flat" ? `${Number(coupon.discount_value || 0)} SAR` : `${Number(coupon.discount_value || 0)}%`,
    count: Number(coupon.redeemed_count || 0),
    maxRedemptions: coupon.max_redemptions || "",
    active: Boolean(coupon.is_active)
  });

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error: dbError } = await supabase
        .from("promotional_codes")
        .select("id, code, discount_type, discount_value, max_redemptions, redeemed_count, is_active, created_at")
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;
      setCoupons((data || []).map(formatCoupon));
    } catch (err) {
      setCoupons([]);
      setError(t.errorLoad);
      console.warn("Admin coupons load warning:", err);
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
    setCouponForm(emptyCouponForm);
    setModalOpen(true);
  };

  const openEditCoupon = (coupon: any) => {
    setError("");
    setSuccess("");
    setCouponForm({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : "",
      isActive: coupon.active
    });
    setModalOpen(true);
  };

  const saveCoupon = async () => {
    try {
      setSaving(true);
      setError("");
      const discountValue = Number(couponForm.discountValue);
      const maxRedemptions = couponForm.maxRedemptions ? Number(couponForm.maxRedemptions) : null;

      if (!couponForm.code.trim() || !Number.isFinite(discountValue) || discountValue <= 0) {
        setError(t.errorSave);
        return;
      }

      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        discount_type: couponForm.discountType,
        discount_value: discountValue,
        max_redemptions: maxRedemptions,
        is_active: couponForm.isActive,
        updated_at: new Date().toISOString()
      };

      const result = couponForm.id
        ? await supabase.from("promotional_codes").update(payload).eq("id", couponForm.id)
        : await supabase.from("promotional_codes").insert(payload);

      if (result.error) throw result.error;
      setSuccess(couponForm.id ? t.edit : t.addCoupon);
      setModalOpen(false);
      await loadCoupons();
    } catch (err) {
      setError(t.errorSave);
      console.warn("Admin coupon save warning:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (coupon: any) => {
    try {
      setError("");
      const { error: dbError } = await supabase
        .from("promotional_codes")
        .update({ is_active: !coupon.active, updated_at: new Date().toISOString() })
        .eq("id", coupon.id);

      if (dbError) throw dbError;
      setCoupons(prev => prev.map(item => item.id === coupon.id ? { ...item, active: !coupon.active } : item));
    } catch (err) {
      setError(t.errorToggle);
      console.warn("Admin coupon toggle warning:", err);
    }
  };

  const deleteCoupon = async (coupon: any) => {
    try {
      setError("");
      const { error: dbError } = await supabase
        .from("promotional_codes")
        .delete()
        .eq("id", coupon.id);

      if (dbError) throw dbError;
      setCoupons(prev => prev.filter(item => item.id !== coupon.id));
    } catch (err) {
      setError(t.errorDelete);
      console.warn("Admin coupon delete warning:", err);
    }
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div className={`flex items-start justify-between gap-4 ${flip}`}>
        <div>
          <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
        </div>
        <button onClick={openAddCoupon} className="rounded-xl bg-gray-900 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-gray-800">
          {t.addCoupon}
        </button>
      </div>

      {error && <div className="bg-[#FEF3F2] border border-[#FEE4E2] text-[#B42318] text-xs rounded-xl p-4 font-bold">{error}</div>}
      {success && <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeCoupons}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{coupons.filter(c => c.active).length} Codes</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalRedeemed}</span>
          <strong className="block text-2xl font-serif font-black text-[#D1AF47] mt-2.5">{totalRedeemed.toLocaleString()}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.savedValue}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{savedValue.toLocaleString()} SAR</strong>
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
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.noCoupons}</td>
                </tr>
              ) : coupons.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/40 transition duration-150">
                  <td className="py-4 px-6 font-mono font-bold text-gray-900">{c.code}</td>
                  <td className="py-4 px-6">{c.type}</td>
                  <td className="py-4 px-6 font-serif font-black text-gray-900">{c.value}</td>
                  <td className="py-4 px-6 font-serif font-black">{c.count}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                      c.active ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-[#FEF3F2] text-[#D92D20]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
            <div className={`mb-5 flex items-start justify-between gap-4 ${flip}`}>
              <div>
                <h3 className="font-serif text-xl font-black text-gray-900">{couponForm.id ? t.edit : t.addCoupon}</h3>
                <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-500 hover:text-gray-900">
                {t.cancel}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.codeLabel}
                <input value={couponForm.code} onChange={(event) => setCouponForm(form => ({ ...form, code: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold uppercase text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.typeLabel}
                <select value={couponForm.discountType} onChange={(event) => setCouponForm(form => ({ ...form, discountType: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#D1AF47]">
                  <option value="percentage">{t.percentage}</option>
                  <option value="flat">{t.flat}</option>
                </select>
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.valueLabel}
                <input type="number" min="1" value={couponForm.discountValue} onChange={(event) => setCouponForm(form => ({ ...form, discountValue: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                {t.maxRedemptionsLabel}
                <input type="number" min="1" value={couponForm.maxRedemptions} onChange={(event) => setCouponForm(form => ({ ...form, maxRedemptions: event.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 sm:col-span-2">
                {t.activeLabel}
                <input type="checkbox" checked={couponForm.isActive} onChange={(event) => setCouponForm(form => ({ ...form, isActive: event.target.checked }))} className="h-4 w-4 accent-[#D1AF47]" />
              </label>
            </div>

            <div className={`mt-6 flex gap-3 ${isRTL ? "justify-start" : "justify-end"}`}>
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 px-5 py-2 text-xs font-black uppercase tracking-wider text-gray-600 hover:text-gray-900">{t.cancel}</button>
              <button onClick={() => void saveCoupon()} disabled={saving} className="rounded-xl bg-[#D1AF47] px-5 py-2 text-xs font-black uppercase tracking-wider text-gray-950 transition hover:bg-[#E0C46A] disabled:opacity-60">{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
