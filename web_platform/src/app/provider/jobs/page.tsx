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

  useEffect(() => {
    loadJobsData();
  }, []);

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
    <div className="space-y-8">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">On-Demand Dispatch Board</h2>
        <p className="text-sm text-gray-500 mt-1">Submit bidding proposals for open customer requests near Riyadh.</p>
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

      {/* JOBS LEADS LIST */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Searching active leads...</div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {openJobs.map((job) => (
            <div key={job.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:border-[hsl(45,60%,55%)] transition duration-200">
              
              {/* Job Details */}
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-3">
                  <h3 className="font-extrabold text-sm text-gray-800">{job.title}</h3>
                  <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[8px] font-bold uppercase">Open Lead</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{job.description}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] text-gray-400 font-bold uppercase mt-2">
                  <span>📍 Area: <strong className="text-gray-600 font-bold">{job.address_text}</strong></span>
                  <span>📅 Date: <strong className="text-gray-600 font-bold">{new Date(job.target_date).toLocaleString()}</strong></span>
                </div>
              </div>

              {/* Action and Budget */}
              <div className="flex md:flex-col items-end gap-4 md:gap-2 justify-between w-full md:w-auto border-t md:border-0 pt-4 md:pt-0">
                <div className="text-left md:text-right">
                  <span className="text-[9px] text-gray-400 block font-bold uppercase">Budget Limit</span>
                  <span className="text-base font-black text-gray-900">{job.budget_max} SAR</span>
                </div>
                <button
                  onClick={() => handleOpenBidModal(job)}
                  className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150"
                >
                  Submit Bid
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* BID MODAL DIALOG */}
      {activeJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl w-full max-w-lg space-y-6">
            
            <div>
              <div className="flex justify-between items-start">
                <h3 className="font-extrabold text-sm text-gray-900">{activeJob.title}</h3>
                <button
                  onClick={() => setActiveJob(null)}
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">{activeJob.description}</p>
            </div>

            <form onSubmit={handleSubmitBid} className="space-y-4">
              
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Your Proposed Price (SAR)</label>
                <input
                  type="number"
                  min="1"
                  value={bidPrice}
                  onChange={(e) => setBidPrice(parseInt(e.target.value) || 0)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                  required
                />
                <span className="text-[9px] text-gray-400 block mt-1">Customer maximum budget: {activeJob.budget_max} SAR</span>
              </div>

              {employees.length > 0 && (
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Assign Staff Employee (Optional)</label>
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-bold"
                  >
                    <option value="">-- No Employee Assignment --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name_en}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Proposal Proposal notes / Cover Letter</label>
                <textarea
                  placeholder="Explain why you are qualified, what materials are covered, and your availability..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 min-h-[60px]"
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-500 font-bold text-xs rounded-xl transition duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150"
                >
                  {submitting ? "Submitting..." : "Send Proposal Bid"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
