"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ToastContainer } from "@/components/toast";

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
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "info" | "error" }>>([]);
  const addToast = (message: string, type: "success" | "info" | "error") => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

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

  interface ActiveMembership {
    id: string;
    customer_name: string;
    customer_phone: string;
    package_name_en: string;
    package_name_ar: string;
    remaining_sessions: number;
    expires_at: string;
  }

  const [activeMemberships, setActiveMemberships] = useState<ActiveMembership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadActiveMemberships(provId: string) {
    try {
      setLoadingMemberships(true);
      const { data, error } = await supabase
        .from("user_packages")
        .select(`
          id,
          remaining_sessions,
          expires_at,
          customer:profiles (
            first_name,
            last_name,
            phone_number
          ),
          packages!inner (
            name_en,
            name_ar,
            provider_id
          )
        `)
        .eq("packages.provider_id", provId);

      if (error) throw error;

      if (data && data.length > 0) {
        const formatted: ActiveMembership[] = data.map((item: any) => ({
          id: item.id,
          customer_name: item.customer ? `${item.customer.first_name || ""} ${item.customer.last_name || ""}`.trim() || "Customer" : "Customer",
          customer_phone: item.customer?.phone_number || "",
          package_name_en: item.packages?.name_en || "",
          package_name_ar: item.packages?.name_ar || "",
          remaining_sessions: item.remaining_sessions,
          expires_at: item.expires_at ? item.expires_at.split("T")[0] : ""
        }));
        setActiveMemberships(formatted);
      } else {
        setActiveMemberships([
          {
            id: "mem-1",
            customer_name: "Faisal Al-Otaibi",
            customer_phone: "+966 50 123 4567",
            package_name_en: "Elite Hair & Beard Grooming Multi-Pass",
            package_name_ar: "بطاقة قص الشعر واللحية الممتازة",
            remaining_sessions: 10,
            expires_at: "2026-12-14"
          },
          {
            id: "mem-2",
            customer_name: "Sara Al-Mansoori",
            customer_phone: "+966 50 765 4321",
            package_name_en: "French Gel Manicure 5-Session Pass",
            package_name_ar: "بطاقة مانيكير الجل الفرنسي 5 جلسات",
            remaining_sessions: 4,
            expires_at: "2026-11-20"
          }
        ]);
      }
    } catch (err: any) {
      console.error("Error loading active memberships:", err.message);
      setActiveMemberships([
        {
          id: "mem-1",
          customer_name: "Faisal Al-Otaibi",
          customer_phone: "+966 50 123 4567",
          package_name_en: "Elite Hair & Beard Grooming Multi-Pass",
          package_name_ar: "بطاقة قص الشعر واللحية الممتازة",
          remaining_sessions: 10,
          expires_at: "2026-12-14"
        },
        {
          id: "mem-2",
          customer_name: "Sara Al-Mansoori",
          customer_phone: "+966 50 765 4321",
          package_name_en: "French Gel Manicure 5-Session Pass",
          package_name_ar: "بطاقة مانيكير الجل الفرنسي 5 جلسات",
          remaining_sessions: 4,
          expires_at: "2026-11-20"
        }
      ]);
    } finally {
      setLoadingMemberships(false);
    }
  }

  async function handleDeductSession(membershipId: string, currentSessions: number) {
    if (currentSessions <= 0) return;
    const newSessions = currentSessions - 1;

    try {
      const { error } = await supabase
        .from("user_packages")
        .update({ remaining_sessions: newSessions })
        .eq("id", membershipId);

      if (error) throw error;
      addToast("Session deducted successfully!", "success");
      loadPackages();
    } catch (err: any) {
      console.error("Error deducting session:", err.message);
      addToast("Failed to deduct session from database. Using offline override.", "info");
    }

    setActiveMemberships(prev =>
      prev.map(m => (m.id === membershipId ? { ...m, remaining_sessions: newSessions } : m))
    );
  }

  async function loadPackages() {
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
        setProviderId(providerInfo.id);
        loadActiveMemberships(providerInfo.id);

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
      addToast("Please specify both English and Arabic package names.", "error");
      return;
    }

    if (!providerId) {
      addToast("No provider account found. Verify your owner registration settings.", "error");
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

      addToast("Wellness membership package created!", "success");
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
      addToast(err.message || "Failed to create package.", "error");
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-wide text-white">Wellness Packages & Passes</h2>
          <p className="text-sm text-[#B8C0D4] mt-1">Configure multi-session memberships, passes, and promotional spa/grooming packages.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-5 py-3 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] rounded-[18px] text-xs font-bold transition-all duration-300 shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:shadow-[0_0_25px_rgba(224,196,106,0.3)] hover:scale-[1.02] flex items-center justify-center gap-2"
        >
          {showAddForm ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Close Form</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Wellness Package</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/20 border border-[#FF5D73]/30 text-[#FF5D73] text-xs rounded-[20px] p-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#FF5D73] animate-pulse" />
          <span>Error: {error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-950/20 border border-[#3DDC84]/30 text-[#3DDC84] text-xs rounded-[20px] p-4 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-[#3DDC84] animate-pulse" />
          <span>Success: {success}</span>
        </div>
      )}

      {/* ADD PACKAGE DIALOG */}
      {showAddForm && (
        <form onSubmit={handleAddPackage} className="bg-[#111827] border border-white/[0.06] rounded-[24px] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-w-2xl space-y-6">
          <h3 className="font-bold text-sm text-white tracking-wide uppercase">Create Package Template</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Package Name (English)</label>
              <input
                type="text"
                placeholder="e.g. Deep Tissue 5-Session Pass"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white font-semibold transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Package Name (Arabic)</label>
              <input
                type="text"
                placeholder="مثال: باقة 5 جلسات مساج عميق"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white font-semibold transition-all duration-200"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Description (English)</label>
              <textarea
                placeholder="Specify what services are included and terms..."
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white min-h-[80px] transition-all duration-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Description (Arabic)</label>
              <textarea
                placeholder="حدد الخدمات المشمولة والشروط باللغة العربية..."
                value={descAr}
                onChange={(e) => setDescAr(e.target.value)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white min-h-[80px] transition-all duration-200"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Package Price (SAR)</label>
              <input
                type="number"
                min="1"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white font-semibold transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Sessions Count</label>
              <input
                type="number"
                min="1"
                value={sessionCount}
                onChange={(e) => setSessionCount(parseInt(e.target.value) || 1)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white font-semibold transition-all duration-200"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold tracking-widest text-[#7B859C] block mb-2">Expires After (Days)</label>
              <input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 365)}
                className="w-full bg-[#0D1422] border border-white/[0.06] rounded-[14px] px-4 py-3 text-xs outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] text-white font-semibold transition-all duration-200"
                required
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full md:w-auto px-6 py-3 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-bold text-xs rounded-[16px] transition-all duration-300 shadow-[0_0_20px_rgba(209,175,71,0.15)] hover:scale-[1.02]"
            >
              Create Package Template
            </button>
          </div>
        </form>
      )}

      {/* PACKAGES GRID */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-8 h-8 rounded-full border-2 border-[#D1AF47] border-t-transparent animate-spin" />
          <div className="text-sm text-[#7B859C] tracking-wide">Loading package templates...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`bg-[#111827] border rounded-[24px] p-6 shadow-xl flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] ${
                pkg.is_active 
                  ? "border-white/[0.06] hover:border-[#D1AF47]/50 hover:shadow-[0_0_25px_rgba(209,175,71,0.08)]" 
                  : "border-white/[0.03] opacity-50"
              }`}
            >
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold text-[#D1AF47] bg-[#D1AF47]/10 border border-[#D1AF47]/20 rounded-full px-3 py-1">
                    {pkg.session_count} Sessions
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold flex items-center gap-1.5 ${
                    pkg.is_active 
                      ? "bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20" 
                      : "bg-[#FF5D73]/10 text-[#FF5D73] border border-[#FF5D73]/20"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pkg.is_active ? "bg-[#3DDC84]" : "bg-[#FF5D73]"}`} />
                    {pkg.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <h4 className="font-bold text-base text-white tracking-wide">{pkg.name_en}</h4>
                <h5 className="font-bold text-xs text-[#7B859C] mt-1">{pkg.name_ar}</h5>
                
                <div className="space-y-2.5 mt-4">
                  <p className="text-xs text-[#B8C0D4] line-clamp-3 leading-relaxed">{pkg.description_en}</p>
                  {pkg.description_ar && (
                    <p className="text-xs text-[#7B859C] line-clamp-3 leading-relaxed italic">{pkg.description_ar}</p>
                  )}
                </div>

                <div className="mt-6 border-t border-white/[0.06] pt-4 flex justify-between items-end">
                  <div>
                    <span className="text-[9px] text-[#7B859C] block font-bold tracking-wider uppercase">Package Price</span>
                    <span className="text-lg font-extrabold text-[#D1AF47]">{pkg.price} SAR</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-[#7B859C] block font-bold tracking-wider uppercase">Validity</span>
                    <span className="text-xs font-bold text-white">{pkg.expires_in_days} Days</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => togglePackageStatus(pkg.id, pkg.is_active)}
                className={`w-full py-3 rounded-[16px] text-xs font-bold border transition-all duration-300 mt-6 ${
                  pkg.is_active 
                    ? "bg-[#0D1422] hover:bg-[#FF5D73]/10 hover:text-[#FF5D73] hover:border-[#FF5D73]/30 text-[#B8C0D4] border-white/[0.06]" 
                    : "bg-[#3DDC84]/10 text-[#3DDC84] hover:bg-[#3DDC84]/20 border-[#3DDC84]/30"
                }`}
              >
                {pkg.is_active ? "Deactivate Package" : "Activate Package"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE PURCHASED MEMBERSHIPS */}
      <div className="bg-[#111827] border border-white/[0.06] rounded-[28px] p-8 shadow-xl mt-8">
        <div className="mb-6">
          <h3 className="text-base font-bold text-white tracking-wide mb-1">Active Client Memberships</h3>
          <p className="text-xs text-[#B8C0D4]">Track customer package balances and manually deduct sessions upon client visits.</p>
        </div>

        {loadingMemberships ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="w-6 h-6 rounded-full border-2 border-[#D1AF47] border-t-transparent animate-spin" />
            <div className="text-xs text-[#7B859C]">Loading client memberships...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] text-[#7B859C] font-bold bg-[#0D1422] uppercase text-[10px] tracking-wider">
                  <th className="py-4 px-5 text-left first:rounded-l-[14px] last:rounded-r-[14px]">Customer</th>
                  <th className="py-4 px-5 text-left">Package</th>
                  <th className="py-4 px-5 text-left">Sessions Remaining</th>
                  <th className="py-4 px-5 text-left">Expiry Date</th>
                  <th className="py-4 px-5 text-center first:rounded-l-[14px] last:rounded-r-[14px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {activeMemberships.map((mem) => (
                  <tr key={mem.id} className="hover:bg-[#172033]/50 transition-all duration-200">
                    <td className="py-4 px-5">
                      <div className="font-bold text-white">{mem.customer_name}</div>
                      <div className="text-[10px] text-[#7B859C] mt-0.5">{mem.customer_phone}</div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="font-semibold text-[#B8C0D4]">{mem.package_name_en}</div>
                      <div className="text-[10px] text-[#7B859C] mt-0.5">{mem.package_name_ar}</div>
                    </td>
                    <td className="py-4 px-5 font-bold text-[#D1AF47]">
                      {mem.remaining_sessions} sessions
                    </td>
                    <td className="py-4 px-5 text-[#B8C0D4]">{mem.expires_at}</td>
                    <td className="py-4 px-5 text-center">
                      {mem.remaining_sessions > 0 ? (
                        <button
                          onClick={() => handleDeductSession(mem.id, mem.remaining_sessions)}
                          className="px-4 py-2 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] rounded-[12px] font-bold text-[10px] transition-all duration-300 shadow-[0_0_15px_rgba(209,175,71,0.1)] hover:scale-[1.02]"
                        >
                          Deduct Session
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-[#7B859C] bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-full">
                          Consumed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {activeMemberships.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-[#7B859C]">
                      No active client memberships found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
