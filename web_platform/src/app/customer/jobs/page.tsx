"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface JobBid {
  id: string;
  bid_price: number;
  proposal_notes: string;
  status: string;
  providers: {
    business_name_en: string;
    business_name_ar: string;
    logo_url: string;
  };
}

interface JobPost {
  id: string;
  title: string;
  description: string;
  address_text: string;
  target_date: string;
  budget_max: number;
  status: string;
  category_id: string;
  job_bids?: JobBid[];
}

export default function CustomerJobsPage() {
  const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("Al-Malqa, Riyadh");
  const [targetDate, setTargetDate] = useState("");
  const [budgetMax, setBudgetMax] = useState(250);
  const [categoryId, setCategoryId] = useState("");
  const [categoriesList, setCategoriesList] = useState<{ id: string; name_en: string }[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadJobPosts();
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const { data } = await supabase
        .from("categories")
        .select("id, name_en")
        .eq("is_active", true);
      setCategoriesList(data || []);
      if (data && data.length > 0) setCategoryId(data[0].id);
    } catch (err) {
      console.error("Error loading categories:", err);
    }
  }

  async function loadJobPosts() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("job_posts")
        .select(`
          id,
          title,
          description,
          address_text,
          target_date,
          budget_max,
          status,
          category_id,
          job_bids (
            id,
            bid_price,
            proposal_notes,
            status,
            providers (
              business_name_en,
              business_name_ar,
              logo_url
            )
          )
        `)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setJobPosts((data as any) || []);
    } catch (err: any) {
      console.error("Error loading job posts:", err.message);
      setError("Failed to load your requests. Showing mock fallbacks.");
      // Fallback mock items
      setJobPosts([
        {
          id: "1",
          title: "Urgent Split AC Maintenance & Leak Fix",
          description: "Water is leaking from the indoor AC unit. Need filter cleaning and leak sealing.",
          address_text: "Al-Malqa, Riyadh",
          target_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          budget_max: 300,
          status: "open",
          category_id: "cat_ac",
          job_bids: [
            {
              id: "b1",
              bid_price: 280,
              proposal_notes: "We have certified AC technicians available. Can complete in 45 mins. 30-day warranty.",
              status: "pending",
              providers: {
                business_name_en: "Riyadh Home Maintenance Experts",
                business_name_ar: "خبراء الصيانة المنزلية بالرياض",
                logo_url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=100&auto=format&fit=crop"
              }
            },
            {
              id: "b2",
              bid_price: 250,
              proposal_notes: "Local technician nearby. Can visit today evening.",
              status: "pending",
              providers: {
                business_name_en: "Quick Fix Technical Services",
                business_name_ar: "خدمات التصليح السريع",
                logo_url: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=100&auto=format&fit=crop"
              }
            }
          ]
        },
        {
          id: "2",
          title: "Deep Cleaning for 3-Bedroom Apartment",
          description: "Full deep cleaning of windows, kitchen, bathrooms, and vacuuming carpet rooms.",
          address_text: "Al-Olaya, Riyadh",
          target_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          budget_max: 500,
          status: "open",
          category_id: "cat_clean",
          job_bids: []
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !description.trim()) {
      setError("Please fill in the job title and description.");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication session expired.");

      // If category list is empty, use a dummy category uuid
      const finalCategory = categoryId || "00000000-0000-0000-0000-000000000000";

      const { error: insertError } = await supabase
        .from("job_posts")
        .insert({
          customer_id: user.id,
          category_id: finalCategory,
          title,
          description,
          address_text: addressText,
          latitude: 24.7136, // Riyadh center coordinates
          longitude: 46.6753,
          target_date: targetDate ? new Date(targetDate).toISOString() : new Date().toISOString(),
          budget_max: budgetMax,
          status: "open"
        });

      if (insertError) throw insertError;

      setSuccess("Job request posted successfully! Local providers are being notified.");
      setTitle("");
      setDescription("");
      setTargetDate("");
      setShowAddForm(false);
      loadJobPosts();
    } catch (err: any) {
      console.error("Error inserting job post:", err.message);
      setError(err.message || "Failed to submit request.");
    }
  }

  async function acceptBid(bidId: string, jobId: string) {
    try {
      setError("");
      setSuccess("");

      // Update the bid status to accepted
      const { error: bidUpdateError } = await supabase
        .from("job_bids")
        .update({ status: "accepted" })
        .eq("id", bidId);

      if (bidUpdateError) throw bidUpdateError;

      // Update the job status to assigned
      const { error: jobUpdateError } = await supabase
        .from("job_posts")
        .update({ status: "assigned" })
        .eq("id", jobId);

      if (jobUpdateError) throw jobUpdateError;

      setSuccess("Bid accepted successfully! Provider will contact you shortly.");
      loadJobPosts();
    } catch (err: any) {
      console.error("Error accepting bid:", err.message);
      setError(err.message || "Failed to accept bid.");
    }
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Service Requests Board</h2>
          <p className="text-sm text-gray-500 mt-1">Post on-demand requests for home maintenance, cleaning, wellness, and events, and accept bids.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold transition duration-150 flex items-center gap-2"
        >
          {showAddForm ? "Close Form" : "Post Service Request"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          Error: {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl p-4">
          Success: {success}
        </div>
      )}

      {/* ADD SERVICE REQUEST */}
      {showAddForm && (
        <form onSubmit={handleAddJob} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-2xl space-y-4">
          <h3 className="font-bold text-sm text-gray-800">What service do you need?</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Job Title</label>
              <input
                type="text"
                placeholder="e.g. Clean & service 4 Split AC units before summer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Detailed Description</label>
              <textarea
                placeholder="Describe the issues, symptoms, or requirements clearly to get accurate price bids..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 min-h-[80px]"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Location Address</label>
              <input
                type="text"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Target Date & Time</label>
              <input
                type="datetime-local"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-500 font-semibold"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Maximum Budget (SAR)</label>
              <input
                type="number"
                min="50"
                value={budgetMax}
                onChange={(e) => setBudgetMax(parseInt(e.target.value) || 50)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            {categoriesList.length > 0 && (
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Service Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-bold"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name_en}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black font-bold text-xs rounded-xl transition duration-150"
          >
            Post Request
          </button>
        </form>
      )}

      {/* JOB POSTS LIST */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading requests...</div>
      ) : (
        <div className="space-y-6">
          {jobPosts.map((post) => (
            <div key={post.id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-6">
              
              {/* Post Details */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-base text-gray-900">{post.title}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${
                      post.status === "open" 
                        ? "bg-green-50 text-green-700 border-green-200" 
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>
                      {post.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">{post.description}</p>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[10px] text-gray-400 font-bold uppercase">
                    <span>Address: <strong className="text-gray-600 font-bold">{post.address_text}</strong></span>
                    <span>Date: <strong className="text-gray-600 font-bold">{new Date(post.target_date).toLocaleString()}</strong></span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[10px] text-gray-400 block font-bold">BUDGET LIMIT</span>
                  <span className="text-xl font-black text-gray-900">{post.budget_max} SAR</span>
                </div>
              </div>

              {/* Bids Section */}
              <div className="border-t border-gray-100 pt-6">
                <h4 className="font-bold text-xs text-gray-800 mb-4">
                  Bids Received ({post.job_bids?.length || 0})
                </h4>

                {!post.job_bids || post.job_bids.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">Waiting for bids from local providers...</p>
                ) : (
                  <div className="space-y-4">
                    {post.job_bids.map((bid) => (
                      <div key={bid.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 border border-gray-200">
                            {bid.providers?.logo_url && <img src={bid.providers.logo_url} alt={bid.providers.business_name_en} className="w-full h-full object-cover" />}
                          </div>
                          <div>
                            <h5 className="font-bold text-xs text-gray-800">{bid.providers?.business_name_en}</h5>
                            <p className="text-[10px] text-gray-500 mt-0.5">{bid.proposal_notes}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-left sm:text-right">
                            <span className="text-[9px] text-gray-400 block font-bold">PROPOSED BID</span>
                            <span className="text-sm font-extrabold text-gray-900">{bid.bid_price} SAR</span>
                          </div>

                          {post.status === "open" && bid.status === "pending" && (
                            <button
                              onClick={() => acceptBid(bid.id, post.id)}
                              className="px-4 py-2 bg-black hover:bg-gray-800 text-white text-[10px] font-bold rounded-lg transition duration-150"
                            >
                              Accept Bid
                            </button>
                          )}
                          {bid.status === "accepted" && (
                            <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-[9px] font-bold border border-green-200">
                              ACCEPTED
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}
