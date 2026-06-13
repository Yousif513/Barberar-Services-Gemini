"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Package {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  price: number;
  session_count: number;
  expires_in_days: number;
  is_active: boolean;
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [descEn, setDescEn] = useState("");
  const [descAr, setDescAr] = useState("");
  const [price, setPrice] = useState(150);
  const [sessionCount, setSessionCount] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider profile owned by the user
      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        setProviderId(providerInfo.id);

        const { data: packagesData, error: fetchError } = await supabase
          .from("packages")
          .select("*")
          .eq("provider_id", providerInfo.id)
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        setPackages(packagesData || []);
      }
    } catch (err: any) {
      console.error("Error loading packages:", err.message);
      setError("Failed to load packages. Showing mock fallbacks.");
      // Fallback mock items
      setPackages([
        { 
          id: "1", 
          name_en: "Moroccan Hammam Spa package", 
          name_ar: "باقة الحمام المغربي الاسترخائي", 
          description_en: "Buy 5 Moroccan sessions and get 1 free session. Valid for 1 year.", 
          description_ar: "اشترِ 5 جلسات حمام مغربي واحصل على جلسة إضافية مجانية. صالحة لمدة عام كامل.", 
          price: 990, 
          session_count: 6, 
          expires_in_days: 365, 
          is_active: true 
        },
        { 
          id: "2", 
          name_en: "Elite Hair & Beard Grooming Multi-Pass", 
          name_ar: "بطاقة قص الشعر واللحية الممتازة", 
          description_en: "10 hair grooming sessions with premium hair styling products.", 
          description_ar: "باقة 10 جلسات قص شعر ولحية مع مصفف الشعر المميز.", 
          price: 1000, 
          session_count: 10, 
          expires_in_days: 180, 
          is_active: true 
        },
        { 
          id: "3", 
          name_en: "Stress Relief Swedish Massage Bundle", 
          name_ar: "باقة المساج السويدي لتخفيف التوتر", 
          description_en: "5 Swedish full body massage sessions of 60 minutes each.", 
          description_ar: "باقة 5 جلسات مساج سويدي للجسم بالكامل لمدة 60 دقيقة لكل جلسة.", 
          price: 1200, 
          session_count: 5, 
          expires_in_days: 365, 
          is_active: true 
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPackage(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!nameEn.trim() || !nameAr.trim()) {
      setError("Please specify both English and Arabic package names.");
      return;
    }

    if (!providerId) {
      setError("No provider account found. Verify your owner registration settings.");
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from("packages")
        .insert({
          provider_id: providerId,
          name_en: nameEn,
          name_ar: nameAr,
          description_en: descEn,
          description_ar: descAr,
          price,
          session_count: sessionCount,
          expires_in_days: expiresInDays,
          is_active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setSuccess("Wellness membership package created!");
      setNameEn("");
      setNameAr("");
      setDescEn("");
      setDescAr("");
      setPrice(150);
      setSessionCount(5);
      setExpiresInDays(365);
      setShowAddForm(false);
      loadPackages();
    } catch (err: any) {
      console.error("Error inserting package:", err.message);
      setError(err.message || "Failed to create package.");
    }
  }

  async function togglePackageStatus(id: string, currentStatus: boolean) {
    try {
      const { error: updateError } = await supabase
        .from("packages")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (updateError) throw updateError;
      loadPackages();
    } catch (err: any) {
      console.error("Error updating package:", err.message);
    }
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Wellness Packages & Passes</h2>
          <p className="text-sm text-gray-500 mt-1">Configure multi-session memberships, passes, and promotional spa/grooming packages.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold transition duration-150 flex items-center gap-2"
        >
          {showAddForm ? "Close Form" : "➕ Create Wellness Package"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl p-4">
          ✅ {success}
        </div>
      )}

      {/* ADD PACKAGE DIALOG */}
      {showAddForm && (
        <form onSubmit={handleAddPackage} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-2xl space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Create Package Template</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Package Name (English)</label>
              <input
                type="text"
                placeholder="e.g. Deep Tissue 5-Session Pass"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Package Name (Arabic)</label>
              <input
                type="text"
                placeholder="مثال: باقة 5 جلسات مساج عميق"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Description (English)</label>
              <textarea
                placeholder="Specify what services are included and terms..."
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 min-h-[60px]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Description (Arabic)</label>
              <textarea
                placeholder="حدد الخدمات المشمولة والشروط باللغة العربية..."
                value={descAr}
                onChange={(e) => setDescAr(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 min-h-[60px]"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Package Price (SAR)</label>
              <input
                type="number"
                min="1"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Sessions Count</label>
              <input
                type="number"
                min="1"
                value={sessionCount}
                onChange={(e) => setSessionCount(parseInt(e.target.value) || 1)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Expires After (Days)</label>
              <input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 365)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black font-bold text-xs rounded-xl transition duration-150"
          >
            Create Package Template
          </button>
        </form>
      )}

      {/* PACKAGES GRID */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading package templates...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col justify-between transition duration-200 ${
                pkg.is_active ? "border-gray-200 hover:border-[hsl(45,60%,55%)]" : "border-gray-100 opacity-60"
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                    🎁 {pkg.session_count} Sessions
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    pkg.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {pkg.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-gray-800">{pkg.name_en}</h4>
                <h5 className="font-bold text-xs text-gray-500 mt-0.5">{pkg.name_ar}</h5>
                
                <p className="text-xs text-gray-500 mt-3 line-clamp-3 leading-relaxed">{pkg.description_en}</p>
                <p className="text-xs text-gray-400 mt-1 line-clamp-3 leading-relaxed italic">{pkg.description_ar}</p>

                <div className="mt-6 border-t border-gray-100 pt-4 flex justify-between items-end">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">PACKAGE PRICE</span>
                    <span className="text-lg font-extrabold text-gray-900">{pkg.price} SAR</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 block font-bold">VALIDITY</span>
                    <span className="text-xs font-bold text-gray-600">{pkg.expires_in_days} Days</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}
                className={`w-full py-2.5 rounded-xl text-xs font-bold border transition duration-150 mt-6 ${
                  pkg.is_active 
                    ? "bg-gray-50 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-gray-600 border-gray-200" 
                    : "bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                }`}
              >
                {pkg.is_active ? "Deactivate Package" : "Activate Package"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
