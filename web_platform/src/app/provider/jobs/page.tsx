"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
    subtitle: "Submit bidding proposals for open customer requests near Riyadh.",
    activeLeads: "Active Opportunities",
    connectedStatus: "Live Riyadh Dispatch",
    connectedText: "Connected & Listening",
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
    subtitle: "تقديم عروض الأسعار لطلبات العملاء النشطة في الرياض.",
    activeLeads: "الفرص النشطة",
    connectedStatus: "توزيع حي في الرياض",
    connectedText: "متصل ويستمع الآن",
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
  const [employees, setEmployees] = useState<{ id: string; name_en: string }[]>([]);

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
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find provider owned by current user
      const { data: providerInfo } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (providerInfo) {
        setProviderId(providerInfo.id);

        // Fetch employees of this provider
        const { data: employeesData } = await supabase
          .from("employees")
          .select("id, name_en")
          .eq("is_active", true); // Simple query fallback

        setEmployees(employeesData || []);

        // Fetch open job posts
        const { data: openJobsData, error: fetchError } = await supabase
          .from("job_posts")
          .select("*")
          .eq("status", "open")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        setOpenJobs(openJobsData || []);
      }
    } catch (err: any) {
      console.error("Error loading open job posts:", err.message);
      setError("Failed to load active job leads. Showing mock leads.");
      // Fallback mock items
      setOpenJobs([
        {
          id: "1",
          title: "Urgent Split AC Maintenance & Leak Fix",
          description: "Water is leaking from the indoor AC unit. Need filter cleaning and leak sealing.",
          address_text: "Al-Malqa, Riyadh",
          target_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          budget_max: 300,
          status: "open"
        },
        {
          id: "2",
          title: "Deep Cleaning for 3-Bedroom Apartment",
          description: "Full deep cleaning of windows, kitchen, bathrooms, and vacuuming carpet rooms.",
          address_text: "Al-Olaya, Riyadh",
          target_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          budget_max: 500,
          status: "open"
        },
        {
          id: "3",
          title: "Full Body Massage & Aromatherapy (Home Service)",
          description: "Requesting professional Swedish massage therapist for home session. Spa table required.",
          address_text: "Al-Naseem, Riyadh",
          target_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          budget_max: 400,
          status: "open"
        }
      ]);
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
    setSubmitting(true);

    try {
      const { error: insertError } = await supabase
        .from("job_bids")
        .insert({
          job_post_id: activeJob.id,
          provider_id: providerId,
          employee_id: employeeId || null,
          bid_price: bidPrice,
          proposal_notes: notes,
          status: "pending"
        });

      if (insertError) throw insertError;

      setSuccess("Your price proposal bid has been sent successfully!");
      setActiveJob(null);
      loadJobsData();
    } catch (err: any) {
      console.error("Error submitting bid:", err.message);
      setError(err.message || "Failed to submit proposal bid.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-wide text-white font-sans">
            {t.title.split(" ")[0]} <span className="text-[#D1AF47] bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] bg-clip-text text-transparent">{t.title.split(" ").slice(1).join(" ")}</span>
          </h1>
          <p className="text-sm text-[#B8C0D4] mt-2 font-medium">
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* METRICS / STATS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Active Leads */}
        <div className="bg-[#111827] border border-white/5 rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#3DDC84]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#7B859C] uppercase font-bold tracking-widest block">{t.activeLeads}</span>
            <span className="text-3xl font-black text-white">{openJobs.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#3DDC84]/10 border border-[#3DDC84]/20 flex items-center justify-center text-[#3DDC84] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Connection Status */}
        <div className="bg-[#111827] border border-white/5 rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#D1AF47]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#7B859C] uppercase font-bold tracking-widest block">{t.connectedStatus}</span>
            <span className="text-sm font-bold text-[#3DDC84] flex items-center gap-1.5 mt-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3DDC84]"></span>
              </span>
              {t.connectedText}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#D1AF47]/10 border border-[#D1AF47]/20 flex items-center justify-center text-[#D1AF47] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071a10.5 10.5 0 0114.14 0M1.34 8.344a16.5 16.5 0 0121.32 0" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Employee Pool */}
        <div className="bg-[#111827] border border-white/5 rounded-[24px] p-6 flex items-center justify-between shadow-lg relative overflow-hidden group hover:border-[#D1AF47]/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#F5B041]/5 to-transparent rounded-bl-full pointer-events-none" />
          <div className="space-y-1">
            <span className="text-[10px] text-[#7B859C] uppercase font-bold tracking-widest block">{t.employeePool}</span>
            <span className="text-3xl font-black text-white">{employees.length}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F5B041]/10 border border-[#F5B041]/20 flex items-center justify-center text-[#F5B041] group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-[#FF5D73]/10 border border-[#FF5D73]/20 text-[#FF5D73] text-sm rounded-[20px] p-5 backdrop-blur-md flex items-center gap-3.5 shadow-lg">
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
        <div className="bg-[#3DDC84]/10 border border-[#3DDC84]/20 text-[#3DDC84] text-sm rounded-[20px] p-5 backdrop-blur-md flex items-center gap-3.5 shadow-lg">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <strong className="font-bold block text-xs uppercase tracking-wider">{t.successTitle}</strong>
            <p className="text-xs opacity-90 mt-0.5">{success}</p>
          </div>
        </div>
      )}

      {/* JOBS LEADS LIST */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-10 h-10 border-2 border-[#D1AF47]/20 border-t-[#D1AF47] rounded-full animate-spin" />
          <div className="text-sm text-[#7B859C] font-semibold tracking-wide">{t.searching}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {openJobs.map((job) => (
            <div
              key={job.id}
              className="bg-[#111827] border border-white/5 rounded-[24px] p-8 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-8 hover:border-[#D1AF47]/40 hover:shadow-[0_0_30px_rgba(209,175,71,0.08)] transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden"
            >
              {/* Subtle top inner glow bar */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#D1AF47]/10 to-transparent" />

              {/* Job Details */}
              <div className="space-y-4 max-w-3xl flex-grow">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-black text-lg text-white tracking-wide group-hover:text-[#D1AF47] transition-colors duration-300">
                    {job.title}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase bg-[#3DDC84]/10 text-[#3DDC84] border border-[#3DDC84]/20">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3DDC84] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3DDC84]"></span>
                    </span>
                    {t.openLead}
                  </span>
                </div>
                <p className="text-sm text-[#B8C0D4] leading-relaxed font-normal">{job.description}</p>
                
                <div className="flex flex-wrap gap-x-8 gap-y-2 pt-2 border-t border-white/[0.04]">
                  {/* Area */}
                  <div className="flex items-center gap-2 text-xs text-[#7B859C]">
                    <svg className="w-4 h-4 text-[#D1AF47] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      {t.area}: <strong className="text-white font-semibold">{job.address_text}</strong>
                    </span>
                  </div>

                  {/* Target Date */}
                  <div className="flex items-center gap-2 text-xs text-[#7B859C]">
                    <svg className="w-4 h-4 text-[#D1AF47] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {t.date}: <strong className="text-white font-semibold">{new Date(job.target_date).toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action and Budget */}
              <div className="flex md:flex-col items-end gap-6 md:gap-4 justify-between w-full md:w-auto border-t md:border-0 border-white/[0.06] pt-6 md:pt-0">
                <div className="text-left md:text-right rtl:text-right">
                  <span className="text-[10px] text-[#7B859C] tracking-widest uppercase font-bold block">{t.budgetMax}</span>
                  <span className="text-2xl font-black text-[#D1AF47] tracking-wider block mt-1">
                    {job.budget_max} <span className="text-xs font-semibold text-[#B8C0D4]">{t.sar}</span>
                  </span>
                </div>
                <button
                  onClick={() => handleOpenBidModal(job)}
                  className="px-6 py-3.5 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-black text-[11px] uppercase tracking-wider rounded-2xl shadow-[0_4px_20px_rgba(209,175,71,0.15)] hover:shadow-[0_4px_25px_rgba(209,175,71,0.35)] transition-all duration-300 transform hover:scale-[1.03] active:scale-95 cursor-pointer"
                >
                  {t.placeOffer}
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* BID MODAL DIALOG */}
      {activeJob && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#111827] border border-white/10 rounded-[28px] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] w-full max-w-xl space-y-6 relative overflow-hidden transition-all duration-300">
            {/* Ambient gold glow decoration */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#D1AF47]/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative">
              <div className="flex justify-between items-start">
                <h3 className="font-black text-xl text-white tracking-wide">{activeJob.title}</h3>
                <button
                  onClick={() => setActiveJob(null)}
                  className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[#7B859C] hover:text-[#D1AF47] hover:bg-white/[0.08] transition-all duration-200 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-[#B8C0D4] mt-3 leading-relaxed bg-[#172033]/40 border border-white/5 rounded-2xl p-4">{activeJob.description}</p>
            </div>

            <form onSubmit={handleSubmitBid} className="space-y-6 relative">
              {/* Proposed Price with Range Slider */}
              <div className="space-y-4">
                <label className="text-[11px] uppercase font-black text-[#D1AF47] tracking-wider block mb-1">
                  {t.proposedPrice}
                </label>
                
                <div className="flex justify-between items-center bg-[#172033] border border-white/5 rounded-2xl p-4 focus-within:border-[#D1AF47]/50 focus-within:shadow-[0_0_15px_rgba(209,175,71,0.06)] transition-all duration-300">
                  <div className="flex-1">
                    <span className="text-[10px] text-[#7B859C] uppercase font-bold tracking-wider block">{t.yourBidOffer}</span>
                    <input
                      type="number"
                      min="1"
                      value={bidPrice}
                      onChange={(e) => setBidPrice(parseInt(e.target.value) || 0)}
                      className="w-full bg-transparent border-none text-2xl font-black text-[#D1AF47] tracking-wider focus:outline-none focus:ring-0 mt-1"
                      required
                    />
                  </div>
                  <span className="text-base font-bold text-[#B8C0D4]">{t.sar}</span>
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
                  <div className="flex justify-between text-[10px] text-[#7B859C] font-bold tracking-wide">
                    <span>{t.minBid}</span>
                    <span className="text-[#3DDC84]">{t.customerBudget}: {activeJob.budget_max} {t.sar}</span>
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
                      className="w-full bg-[#172033] border border-white/5 rounded-2xl px-4 py-3.5 text-xs text-white font-bold outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] appearance-none cursor-pointer transition-all duration-300"
                    >
                      <option value="" className="bg-[#111827] text-white">
                        {t.noEmployee}
                      </option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id} className="bg-[#111827] text-white font-semibold">
                          {emp.name_en}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#7B859C] rtl:left-4 rtl:right-auto">
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
                  className="w-full bg-[#172033] border border-white/5 rounded-2xl px-4 py-3.5 text-xs text-white font-semibold placeholder-[#7B859C]/50 outline-none focus:border-[#D1AF47] focus:ring-1 focus:ring-[#D1AF47] min-h-[100px] transition-all duration-300"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-4 justify-end pt-4 border-t border-white/[0.04] rtl:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="px-6 py-3.5 border border-white/10 hover:border-white/20 text-[#B8C0D4] hover:text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all duration-300 cursor-pointer"
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

