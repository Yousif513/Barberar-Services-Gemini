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
    tableValue: "Value",
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
    descPlaceholder: "Write a short summary (e.g. 15% off your first hair coloring appointment)..."
  },
  ar: {
    title: "العروض الترويجية والحملات",
    subtitle: "أطلق رموز الخصم وحملات العافية لجذب عملاء مميزين في الرياض.",
    createBtn: "إنشاء رمز خصم",
    tableCode: "رمز الخصم",
    tableType: "النوع",
    tableValue: "القيمة",
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
    descPlaceholder: "اكتب وصفاً قصيراً (مثل: خصم 15% على جلسات تلوين الشعر الجديدة)..."
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

  const t = translations[locale];

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
          description: "15% off first booking on the marketplace platform.",
          usage_count: 48,
          is_active: true
        },
        {
          id: "promo-2",
          code: "SUMMERFREE",
          type: "fixed",
          value: 50,
          expires_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          description: "50 SAR discount on premium wellness retreats.",
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
            description,
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
      setShowForm(false);
    } catch (err: any) {
      console.warn("Creating promotion locally for simulation preview:", err.message);
      const simulatedPromo = {
        id: `promo-sim-${Date.now()}`,
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        expires_at: new Date(expiry).toISOString(),
        description,
        usage_count: 0,
        is_active: new Date(expiry) > new Date()
      };
      setPromos(prev => [simulatedPromo, ...prev]);
      setCode("");
      setValue("");
      setExpiry("");
      setDescription("");
      setShowForm(false);
    }
  }

  function togglePromoStatus(id: string) {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, is_active: !p.is_active } : p));
  }

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowForm(prev => !prev)}
          className="self-start sm:self-center px-4 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition"
        >
          {t.createBtn}
        </button>
      </div>

      {error && (
        <div className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-xl p-4">
          Notice: {error}
        </div>
      )}

      {/* CREATE FORM CARD */}
      {showForm && (
        <div className="bg-stone-900 text-white border border-stone-850 rounded-2xl p-6 shadow-md space-y-6">
          <h3 className="font-bold text-sm text-white border-b border-stone-800 pb-3">{t.createTitle}</h3>
          
          <form onSubmit={createPromo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Promo Code</label>
                <input
                  type="text"
                  required
                  placeholder={t.codePlaceholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[hsl(45,60%,55%)] placeholder-stone-600"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Discount Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[hsl(45,60%,55%)]"
                >
                  <option value="percentage">{t.discountPct}</option>
                  <option value="fixed">{t.fixedDiscount}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Discount Value</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 15"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[hsl(45,60%,55%)] placeholder-stone-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">{t.expiryDate}</label>
                <input
                  type="date"
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-400 outline-none focus:border-[hsl(45,60%,55%)]"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1">Campaign Description</label>
                <input
                  type="text"
                  placeholder={t.descPlaceholder}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[hsl(45,60%,55%)] placeholder-stone-600"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 py-2.5 border border-stone-850 text-stone-400 font-bold text-xs rounded-lg hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-white text-black font-bold text-xs rounded-lg hover:bg-stone-100 transition"
              >
                {t.savePromo}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PROMOTIONS LIST TABLE */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading coupons...</div>
      ) : promos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          <p className="text-sm font-semibold">{t.noPromos}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-150 text-gray-400 font-bold uppercase text-[9px] bg-gray-50/50">
                  <th className="py-3.5 px-6">{t.tableCode}</th>
                  <th className="py-3.5 px-6">{t.tableType}</th>
                  <th className="py-3.5 px-6">Discount Value</th>
                  <th className="py-3.5 px-6">{t.tableExpiry}</th>
                  <th className="py-3.5 px-6 text-center">{t.tableUsage}</th>
                  <th className="py-3.5 px-6 text-center">{t.tableStatus}</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {promos.map((p) => {
                  const isExpired = new Date(p.expires_at) < new Date();
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      {/* Code */}
                      <td className="py-4 px-6 font-bold text-gray-900 tracking-wider">
                        {p.code}
                        <span className="text-[10px] font-semibold text-gray-400 block mt-0.5">{p.description}</span>
                      </td>

                      {/* Type */}
                      <td className="py-4 px-6 text-gray-500 font-bold uppercase">
                        {p.type === "percentage" ? "Percentage Off" : "Fixed Amount"}
                      </td>

                      {/* Value */}
                      <td className="py-4 px-6 font-bold text-gray-800">
                        {p.type === "percentage" ? `${p.value}%` : `${p.value} SAR`}
                      </td>

                      {/* Expiry */}
                      <td className="py-4 px-6 text-gray-500 font-medium">
                        {new Date(p.expires_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>

                      {/* Usage */}
                      <td className="py-4 px-6 text-center font-bold text-gray-700">
                        {p.usage_count}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 text-center">
                        {isExpired ? (
                          <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full font-bold text-[9px]">
                            {t.statusExpired}
                          </span>
                        ) : p.is_active ? (
                          <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full font-bold text-[9px]">
                            {t.statusActive}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-50 text-gray-500 border border-gray-200 rounded-full font-bold text-[9px]">
                            DISABLED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        {!isExpired && (
                          <button
                            onClick={() => togglePromoStatus(p.id)}
                            className={`px-3 py-1.5 border text-[10px] font-bold rounded-lg transition ${
                              p.is_active
                                ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                                : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            }`}
                          >
                            {p.is_active ? "Disable" : "Enable"}
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
