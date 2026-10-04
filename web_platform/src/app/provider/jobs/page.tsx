"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface MyBid {
  job_post_id: string;
  bid_price: number;
  status: string;
}

interface JobPost {
  id: string;
  title: string;
  description: string;
  address_text: string;
  target_date: string;
  budget_max: number;
  status: string;
}

const contentTranslations = {
  en: {
    title: "On-Demand Dispatch Board",
    subtitle: "Send price offers on open customer requests.",
    activeLeads: "Active Opportunities",
    myPendingBids: "My Pending Offers",
    bidSent: "Offer sent",
    yourOffer: "Your offer",
    noProvider: "This page is for provider owners. No business is linked to your account.",
    loadFailed: "Could not load open requests",
    retry: "Try again",
    empty: "There are no open requests right now.",
    priceRequired: "Enter a price greater than zero.",
    sent: "Your offer was sent to the customer.",
    employeePool: "Available Dispatch Pool",
    searching: "Searching active leads...",
    openLead: "Open Lead",
    area: "Area",
    date: "Date",
    budgetMax: "Max Budget",
    submitBid: "Submit Bid",
    placeOffer: "Place Offer",
    modalTitle: "Submit Price Proposal",
    proposedPrice: "Your Proposed Price (SAR)",
    customerBudget: "Customer maximum budget",
    assignEmployee: "Assign Staff Employee (Optional)",
    noEmployee: "-- No Employee Assignment --",
    proposalNotes: "Proposal Notes / Cover Letter",
    notesPlaceholder: "Explain why you are qualified, what materials are covered, and your availability...",
    cancel: "Cancel",
    sendBid: "Send Proposal Bid",
    submitting: "Submitting...",
    errorTitle: "Error",
    successTitle: "Success",
    yourBidOffer: "Your Bid Offer",
    minBid: "1 SAR",
    sar: "SAR"
  },
  ar: {
    title: "لوحة التوزيع الفوري",
    subtitle: "أرسل عروض أسعار على طلبات العملاء المفتوحة.",
    activeLeads: "الفرص النشطة",
    myPendingBids: "عروضي قيد الانتظار",
    bidSent: "تم إرسال العرض",
    yourOffer: "عرضك",
    noProvider: "هذه الصفحة لأصحاب المنشآت. لا توجد منشأة مرتبطة بحسابك.",
    loadFailed: "تعذر تحميل الطلبات المفتوحة",
    retry: "إعادة المحاولة",
    empty: "لا توجد طلبات مفتوحة حالياً.",
    priceRequired: "أدخل سعراً أكبر من صفر.",
    sent: "تم إرسال عرضك إلى العميل.",
    employeePool: "طاقم العمل المتاح للتوجيه",
    searching: "جاري البحث عن فرص نشطة...",
    openLead: "فرصة نشطة",
    area: "المنطقة",
    date: "التاريخ",
    budgetMax: "أقصى ميزانية",
    submitBid: "قدّم عرضًا",
    placeOffer: "قدّم عرضًا",
    modalTitle: "تقديم عرض سعر",
    proposedPrice: "سعر العرض المقترح (ريال)",
    customerBudget: "أقصى ميزانية للعميل",
    assignEmployee: "تعيين موظف من الطاقم (اختياري)",
    noEmployee: "-- بدون تعيين موظف --",
    proposalNotes: "ملاحظات العرض / رسالة التغطية",
    notesPlaceholder: "اشرح لماذا أنت مؤهل، وما المواد المشمولة، ووقت توفرك...",
    cancel: "إلغاء",
    sendBid: "إرسال عرض السعر",
    submitting: "جاري الإرسال...",
    errorTitle: "خطأ",
    successTitle: "نجاح",
    yourBidOffer: "قيمة عرضك",
    minBid: "1 ريال",
    sar: "ريال"
  }
};

export default function ProviderJobsPage() {
  const [openJobs, setOpenJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [myBids, setMyBids] = useState<MyBid[]>([]);
  const [loadError, setLoadError] = useState("");
  const [noProvider, setNoProvider] = useState(false);

  // Bidding Modal states
  const [activeJob, setActiveJob] = useState<JobPost | null>(null);
  const [bidPrice, setBidPrice] = useState(0);
  const [employeeId, setEmployeeId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isRTL, setIsRTL] = useState(false);

  useEffect(() => {
    loadJobsData();

    // Detect RTL from document element
    if (typeof document !== "undefined") {
      setIsRTL(document.documentElement.dir === "rtl");
      const observer = new MutationObserver(() => {
        setIsRTL(document.documentElement.dir === "rtl");
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
      return () => observer.disconnect();
    }
  }, []);

  const t = contentTranslations[isRTL ? "ar" : "en"];

  async function loadJobsData() {
    try {
      setLoading(true);
      setLoadError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider owned by current user
      const { data: providerInfo, error: providerError } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (providerError) throw providerError;
      if (!providerInfo) {
        setNoProvider(true);
        return;
      }
      setProviderId(providerInfo.id);

      const [employeesRes, jobsRes, bidsRes] = await Promise.all([
        // Only this provider's professionals (through its branches).
        supabase
          .from("employees")
          .select("id, name_en, name_ar, branches!inner(provider_id)")
          .eq("branches.provider_id", providerInfo.id)
          .eq("is_active", true),
        supabase
          .from("job_posts")
          .select("id, title, description, address_text, target_date, budget_max, status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("job_bids")
          .select("job_post_id, bid_price, status")
          .eq("provider_id", providerInfo.id),
      ]);
      for (const res of [employeesRes, jobsRes, bidsRes]) {
        if (res.error) throw res.error;
      }
      setEmployees((employeesRes.data || []).map((e: { id: string; name_en: string; name_ar: string }) => ({ id: e.id, name_en: e.name_en, name_ar: e.name_ar })));
      setOpenJobs(jobsRes.data || []);
      setMyBids(bidsRes.data || []);
    } catch (err: unknown) {
      setOpenJobs([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenBidModal(job: JobPost) {
    setActiveJob(job);
    setBidPrice(job.budget_max);
    setNotes("");
    setSuccess("");
    setError("");
  }

  async function handleSubmitBid(e: React.FormEvent) {
    e.preventDefault();
    if (!activeJob || !providerId) return;

    setError("");
    setSuccess("");
    if (!(bidPrice > 0)) {
      setError(t.priceRequired);
      return;
    }
    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("job_bids")
        .insert({
          job_post_id: activeJob.id,
          provider_id: providerId,
          employee_id: employeeId || null,
          bid_price: bidPrice,
          proposal_notes: notes.trim() || null,
        });

      if (insertError) throw insertError;

      setSuccess(t.sent);
      setActiveJob(null);
      loadJobsData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-wide text-[#101828] font-sans">
            {t.title.split(" ")[0]} <span className="text-[#D1AF47] bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] bg-clip-text text-transparent">{t.title.split(" ").slice(1).join(" ")}</span>
          </h1>
          <p className="text-sm text-[#344054] mt-2 font-medium">
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* METRICS / STATS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Active Leads */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#3DDC84]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] uppercase font-bold tracking-widest block">{t.activeLeads}</span>
            <span className="text-3xl font-black text-[#101828]">{openJobs.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#3DDC84]/10 border border-[#3DDC84]/20 flex items-center justify-center text-[#22C55E] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Connection Status */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#D1AF47]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] uppercase font-bold tracking-widest block">{t.myPendingBids}</span>
            <span className="text-3xl font-black text-[#101828]">{myBids.filter((b) => b.status === "pending").length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 border border-[#D1AF47]/20 flex items-center justify-center text-[#D1AF47] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10.5 10.5 0 0114.14 0M1.34 8.344a16.5 16.5 0 0121.32 0" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Employee Pool */}
        <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#F5B041]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#667085] uppercase font-bold tracking-widest block">{t.employeePool}</span>
            <span className="text-3xl font-black text-[#101828]">{employees.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F5B041]/10 border border-[#F5B041]/20 flex items-center justify-center text-[#F5B041] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-sm rounded-[20px] p-5 backdrop-blur-md flex items-center gap-3.5 shadow-lg">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <strong className="font-bold block text-xs uppercase tracking-wider">{t.errorTitle}</strong>
            <p className="text-xs opacity-90 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-[#3DDC84]/10 border border-[#3DDC84]/20 text-[#22C55E] text-sm rounded-[20px] p-5 backdrop-blur-md flex items-center gap-3.5 shadow-lg">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <strong className="font-bold block text-xs uppercase tracking-wider">{t.successTitle}</strong>
            <p className="text-xs opacity-90 mt-0.5">{success}</p>
          </div>
        </div>
      )}

      {noProvider && (
        <div className="bg-white border border-[#ECECEC] rounded-[20px] p-5 text-sm text-[#344054]">{t.noProvider}</div>
      )}

      {/* JOBS LEADS LIST */}
      {loadError ? (
        <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#EF4444] text-sm rounded-[20px] p-5 space-y-2">
          <p className="font-bold">{t.loadFailed}</p>
          <p className="text-xs">{loadError}</p>
          <button onClick={loadJobsData} className="px-3 py-1.5 bg-white border border-[#FF5D73]/30 rounded-lg text-xs font-bold">{t.retry}</button>
        </div>
      ) : !loading && !noProvider && openJobs.length === 0 ? (
        <div className="bg-white border border-[#ECECEC] rounded-[20px] p-8 text-center text-sm text-[#667085]">{t.empty}</div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-2 border-[#D1AF47]/20 border-t-[#D1AF47] rounded-full animate-spin" />
          <div className="text-sm text-[#667085] font-semibold tracking-wide">{t.searching}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {openJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] p-8 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-8 hover:border-[#D1AF47]/40 hover:shadow-[0_0_30px_rgba(209,175,71,0.08)] transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden"
            >
              {/* Subtle top inner glow bar */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D1AF47]/10 to-transparent" />

              {/* Job Details */}
              <div className="space-y-4 max-w-3xl flex-grow">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-black text-lg text-[#101828] tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">
                    {job.title}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-[#3DDC84]/10 text-[#22C55E] border border-[#3DDC84]/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3DDC84]"></span>
                    </span>
                    {t.openLead}
                  </span>
                </div>
                <p className="text-sm text-[#344054] leading-relaxed font-normal">{job.description}</p>
                
                <div className="flex flex-wrap gap-x-8 gap-y-2 pt-2 border-t border-[#ECECEC]">
                  {/* Area */}
                  <div className="flex items-center gap-2 text-xs text-[#667085]">
                    <svg className="w-4 h-4 text-[#D1AF47] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      {t.area}: <strong className="text-[#101828] font-semibold">{job.address_text}</strong>
                    </span>
                  </div>

                  {/* Target Date */}
                  <div className="flex items-center gap-2 text-xs text-[#667085]">
                    <svg className="w-4 h-4 text-[#D1AF47] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {t.date}: <strong className="text-[#101828] font-semibold">{new Date(job.target_date).toLocaleString(isRTL ? "ar-SA" : "en-US", { timeZone: "Asia/Riyadh" })}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action and Budget */}
              <div className="flex md:flex-col items-end gap-6 md:gap-4 justify-between w-full md:w-auto border-t md:border-0 border-[#ECECEC] pt-6 md:pt-0">
                <div className="text-left md:text-right rtl:text-right">
                  <span className="text-[10px] text-[#667085] tracking-widest uppercase font-bold block">{t.budgetMax}</span>
                  <span className="text-2xl font-black text-[#D1AF47] tracking-wider block mt-1">
                    {job.budget_max} <span className="text-xs font-semibold text-[#344054]">{t.sar}</span>
                  </span>
                </div>
                {myBids.some((b) => b.job_post_id === job.id) ? (
                  <span className="px-4 py-2 rounded-2xl bg-[#3DDC84]/10 text-[#22C55E] text-[11px] font-black border border-[#3DDC84]/20">
                    {t.bidSent}: {myBids.find((b) => b.job_post_id === job.id)?.bid_price} {t.sar}
                  </span>
                ) : (
                <button
                  onClick={() => handleOpenBidModal(job)}
                  className="px-6 py-3.5 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-[11px] uppercase tracking-wider rounded-2xl shadow-[0_4px_20px_rgba(209,175,71,0.15)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.35)] transition-all duration-300 transform hover:scale-[1.03] active:scale-95 cursor-pointer"
                >
                  {t.placeOffer}
                </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* BID MODAL DIALOG */}
      {activeJob && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[28px] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.04)] w-full max-w-xl space-y-6 relative overflow-hidden transition-all duration-300">
            {/* Ambient gold glow decoration */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#D1AF47]/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative">
              <div className="flex justify-between items-start">
                <h3 className="font-black text-xl text-[#101828] tracking-wide">{activeJob.title}</h3>
                <button
                  onClick={() => setActiveJob(null)}
                  className="p-2 rounded-xl bg-[#F3F4F6] border border-[#ECECEC] text-[#667085] hover:text-[#D1AF47] hover:bg-[#E5E7EB] border border-[#ECECEC] transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-[#344054] mt-3 leading-relaxed bg-white border border-[#ECECEC]/40 border border-[#ECECEC] rounded-2xl p-4">{activeJob.description}</p>
            </div>

            <form onSubmit={handleSubmitBid} className="space-y-6 relative">
              {/* Proposed Price with Range Slider */}
              <div className="space-y-4">
                <label className="text-[11px] uppercase font-black text-[#D1AF47] tracking-wider block mb-1">
                  {t.proposedPrice}
                </label>
                
                <div className="flex justify-between items-center bg-white border border-[#ECECEC] rounded-2xl p-4 focus-within:border-[#D1AF47]/50 focus-within:shadow-[0_0_15px_rgba(209,175,71,0.06)] transition-all duration-300">
                  <div className="flex-1">
                    <span className="text-[10px] text-[#667085] uppercase font-bold tracking-wider block">{t.yourBidOffer}</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={bidPrice}
                      onChange={(e) => setBidPrice(Number(e.target.value) || 0)}
                      className="w-full bg-transparent border-none text-2xl font-black text-[#D1AF47] tracking-wider focus:outline-none focus:ring-0 mt-1"
                      required
                    />
                  </div>
                  <span className="text-base font-bold text-[#344054]">{t.sar}</span>
                </div>

                {/* Range Slider */}
                <div className="px-1 space-y-2">
                  <input
                    type="range"
                    min="1"
                    max={Math.max(activeJob.budget_max, bidPrice)}
                    value={bidPrice}
                    onChange={(e) => setBidPrice(parseInt(e.target.value) || 0)}
                    className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#D1AF47] focus:outline-none transition-all duration-200"
                  />
                  <div className="flex justify-between text-[10px] text-[#667085] font-bold tracking-wide">
                    <span>{t.minBid}</span>
                    <span className="text-[#22C55E]">{t.customerBudget}: {activeJob.budget_max} {t.sar}</span>
                    <span>{Math.max(activeJob.budget_max, bidPrice)} {t.sar}</span>
                  </div>
                </div>
              </div>

              {/* Employee Selection */}
              {employees.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[11px] uppercase font-black text-[#D1AF47] tracking-wider block">
                    {t.assignEmployee}
                  </label>
                  <div className="relative">
                    <select
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="w-full bg-white border border-[#ECECEC] rounded-2xl px-4 py-3.5 text-xs text-[#101828] font-bold outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] appearance-none cursor-pointer transition-all duration-300"
                    >
                      <option value="" className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] text-[#101828]">
                        {t.noEmployee}
                      </option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id} className="bg-white border border-[#ECECEC] shadow-[0_8px_30px_rgb(0,0,0,0.015)] text-[#101828] font-semibold">
                          {isRTL ? emp.name_ar || emp.name_en : emp.name_en}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#667085] rtl:left-4 rtl:right-auto">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* Proposal Notes */}
              <div className="space-y-2">
                <label className="text-[11px] uppercase font-black text-[#D1AF47] tracking-wider block">
                  {t.proposalNotes}
                </label>
                <textarea
                  placeholder={t.notesPlaceholder}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-[#ECECEC] rounded-2xl px-4 py-3.5 text-xs text-[#101828] font-semibold placeholder-[#7B859C]/50 outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] min-h-[100px] transition-all duration-300"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 justify-end pt-4 border-t border-[#ECECEC] rtl:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="px-6 py-3.5 border border-[#ECECEC] hover:border-[#D1AF47]/40 text-[#344054] hover:text-[#101828] font-bold text-xs uppercase tracking-wider rounded-2xl transition-all duration-300 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3.5 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-xs uppercase tracking-wider rounded-2xl shadow-[0_4px_20px_rgba(209,175,71,0.15)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.3)] transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {submitting ? t.submitting : t.sendBid}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

