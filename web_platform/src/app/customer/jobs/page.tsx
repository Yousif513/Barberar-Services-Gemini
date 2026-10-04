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

const contentTranslations = {
  en: {
    title: "Service Requests Board",
    subtitle: "Post a request and compare price offers from verified providers.",
    openForm: "Post Service Request",
    closeForm: "Close Form",
    formTitle: "What service do you need?",
    jobTitle: "Job Title",
    titlePlaceholder: "e.g. Bridal hair styling for two people",
    description: "Detailed Description",
    descriptionPlaceholder: "Describe what you need so providers can price it accurately...",
    address: "Location Address",
    addressPlaceholder: "District, city",
    targetDate: "Target Date & Time",
    budget: "Maximum Budget (SAR)",
    category: "Service Category",
    chooseCategory: "Choose a category",
    submit: "Post Request",
    submitting: "Posting...",
    noCategories: "Requests are unavailable because no service categories are configured yet.",
    fillRequired: "Please fill in the title, description, address, date and category.",
    futureDate: "Please choose a date and time in the future.",
    posted: "Request posted. Verified providers can now send you price offers.",
    accepted: "Offer accepted. The provider can now see the request is assigned to them.",
    cancelled: "Request cancelled.",
    loadFailed: "Could not load your requests",
    retry: "Try again",
    loading: "Loading requests...",
    empty: "You have not posted any requests yet.",
    addressLabel: "Address",
    dateLabel: "Date",
    budgetLimit: "BUDGET LIMIT",
    bidsReceived: "Bids Received",
    waiting: "Waiting for offers from verified providers...",
    proposedBid: "PROPOSED BID",
    acceptBid: "Accept Bid",
    cancelRequest: "Cancel Request",
    confirmAccept: "Accept this offer? All other offers on this request will be declined.",
    confirmCancel: "Cancel this request? Providers will no longer be able to send offers.",
    status: { open: "OPEN", assigned: "ASSIGNED", completed: "COMPLETED", cancelled: "CANCELLED" } as Record<string, string>,
    bidStatus: { accepted: "ACCEPTED", rejected: "DECLINED", withdrawn: "WITHDRAWN" } as Record<string, string>,
    sar: "SAR",
    errorPrefix: "Error",
    successPrefix: "Success",
  },
  ar: {
    title: "لوحة طلبات الخدمة",
    subtitle: "انشر طلبك وقارن عروض الأسعار من مقدمي خدمة موثقين.",
    openForm: "نشر طلب خدمة",
    closeForm: "إغلاق النموذج",
    formTitle: "ما الخدمة التي تحتاجها؟",
    jobTitle: "عنوان الطلب",
    titlePlaceholder: "مثال: تصفيف شعر عروس لشخصين",
    description: "الوصف التفصيلي",
    descriptionPlaceholder: "صف ما تحتاجه ليتمكن مقدمو الخدمة من تسعيره بدقة...",
    address: "العنوان",
    addressPlaceholder: "الحي، المدينة",
    targetDate: "التاريخ والوقت المطلوب",
    budget: "الميزانية القصوى (ريال)",
    category: "فئة الخدمة",
    chooseCategory: "اختر الفئة",
    submit: "نشر الطلب",
    submitting: "جارٍ النشر...",
    noCategories: "الطلبات غير متاحة لعدم إعداد فئات الخدمات بعد.",
    fillRequired: "يرجى تعبئة العنوان والوصف والموقع والتاريخ والفئة.",
    futureDate: "يرجى اختيار تاريخ ووقت في المستقبل.",
    posted: "تم نشر الطلب. يمكن لمقدمي الخدمة الموثقين إرسال عروضهم الآن.",
    accepted: "تم قبول العرض. يرى مقدم الخدمة الآن أن الطلب أُسند إليه.",
    cancelled: "تم إلغاء الطلب.",
    loadFailed: "تعذر تحميل طلباتك",
    retry: "إعادة المحاولة",
    loading: "جارٍ تحميل الطلبات...",
    empty: "لم تنشر أي طلبات بعد.",
    addressLabel: "العنوان",
    dateLabel: "التاريخ",
    budgetLimit: "الحد الأقصى للميزانية",
    bidsReceived: "العروض المستلمة",
    waiting: "بانتظار عروض من مقدمي خدمة موثقين...",
    proposedBid: "العرض المقترح",
    acceptBid: "قبول العرض",
    cancelRequest: "إلغاء الطلب",
    confirmAccept: "قبول هذا العرض؟ سيتم رفض جميع العروض الأخرى على هذا الطلب.",
    confirmCancel: "إلغاء هذا الطلب؟ لن يتمكن مقدمو الخدمة من إرسال عروض.",
    status: { open: "مفتوح", assigned: "مُسند", completed: "مكتمل", cancelled: "ملغى" } as Record<string, string>,
    bidStatus: { accepted: "مقبول", rejected: "مرفوض", withdrawn: "مسحوب" } as Record<string, string>,
    sar: "ريال",
    errorPrefix: "خطأ",
    successPrefix: "تم",
  },
};

export default function CustomerJobsPage() {
  const [jobPosts, setJobPosts] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [isRTL, setIsRTL] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addressText, setAddressText] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [budgetMax, setBudgetMax] = useState(250);
  const [categoryId, setCategoryId] = useState("");
  const [categoriesList, setCategoriesList] = useState<{ id: string; name_en: string; name_ar: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const t = contentTranslations[isRTL ? "ar" : "en"];

  useEffect(() => {
    loadJobPosts();
    loadCategories();
    if (typeof document !== "undefined") {
      setIsRTL(document.documentElement.dir === "rtl");
      const observer = new MutationObserver(() => setIsRTL(document.documentElement.dir === "rtl"));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir"] });
      return () => observer.disconnect();
    }
  }, []);

  async function loadCategories() {
    const { data, error: catError } = await supabase
      .from("categories")
      .select("id, name_en, name_ar")
      .eq("is_active", true)
      .order("name_en", { ascending: true });
    if (catError) {
      setError(catError.message);
      return;
    }
    setCategoriesList(data || []);
  }

  async function loadJobPosts() {
    try {
      setLoading(true);
      setLoadError("");
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
        .order("created_at", { ascending: false })
        .limit(100);

      if (fetchError) throw fetchError;
      setJobPosts((data as unknown as JobPost[]) || []);
    } catch (err: unknown) {
      setJobPosts([]);
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !description.trim() || !addressText.trim() || !targetDate || !categoryId) {
      setError(t.fillRequired);
      return;
    }
    const when = new Date(targetDate);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError(t.futureDate);
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication session expired.");

      const { error: insertError } = await supabase
        .from("job_posts")
        .insert({
          customer_id: user.id,
          category_id: categoryId,
          title: title.trim(),
          description: description.trim(),
          address_text: addressText.trim(),
          target_date: when.toISOString(),
          budget_max: budgetMax,
        });

      if (insertError) throw insertError;

      setSuccess(t.posted);
      setTitle("");
      setDescription("");
      setAddressText("");
      setTargetDate("");
      setShowAddForm(false);
      loadJobPosts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptBid(bidId: string) {
    if (!window.confirm(t.confirmAccept)) return;
    setError("");
    setSuccess("");
    setBusyId(bidId);
    try {
      const { error: acceptError } = await supabase.rpc("accept_job_bid", { p_bid_id: bidId });
      if (acceptError) throw acceptError;
      setSuccess(t.accepted);
      loadJobPosts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  async function cancelRequest(jobId: string) {
    if (!window.confirm(t.confirmCancel)) return;
    setError("");
    setSuccess("");
    setBusyId(jobId);
    try {
      const { data, error: cancelError } = await supabase
        .from("job_posts")
        .update({ status: "cancelled" })
        .eq("id", jobId)
        .eq("status", "open")
        .select("id");
      if (cancelError) throw cancelError;
      if (!data || data.length === 0) throw new Error(t.loadFailed);
      setSuccess(t.cancelled);
      loadJobPosts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={categoriesList.length === 0}
          className="px-4 py-2 bg-black text-white hover:bg-gray-800 rounded-xl text-xs font-bold transition duration-150 flex items-center gap-2"
        >
          {showAddForm ? t.closeForm : t.openForm}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4">
          {t.errorPrefix}: {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl p-4">
          {t.successPrefix}: {success}
        </div>
      )}

      {!loading && categoriesList.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-4">{t.noCategories}</div>
      )}

      {/* ADD SERVICE REQUEST */}
      {showAddForm && (
        <form onSubmit={handleAddJob} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-2xl space-y-4">
          <h3 className="font-bold text-sm text-gray-800">{t.formTitle}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.jobTitle}</label>
              <input
                type="text"
                maxLength={200}
                placeholder={t.titlePlaceholder}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.description}</label>
              <textarea
                placeholder={t.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 min-h-[80px]"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.address}</label>
              <input
                type="text"
                placeholder={t.addressPlaceholder}
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-semibold"
                required
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.targetDate}</label>
              <input
                type="datetime-local"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-500 font-semibold"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.budget}</label>
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
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">{t.category}</label>
                <select
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[hsl(45,60%,55%)] text-gray-700 font-bold"
                >
                  <option value="">{t.chooseCategory}</option>
                  {categoriesList.map((cat) => (
                    <option key={cat.id} value={cat.id}>{isRTL ? cat.name_ar : cat.name_en}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[hsl(45,60%,55%)] hover:bg-[hsl(45,60%,45%)] text-black font-bold text-xs rounded-xl transition duration-150 disabled:opacity-50"
          >
            {submitting ? t.submitting : t.submit}
          </button>
        </form>
      )}

      {/* JOB POSTS LIST */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">{t.loading}</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-4 space-y-2">
          <p className="font-bold">{t.loadFailed}</p>
          <p>{loadError}</p>
          <button onClick={loadJobPosts} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg font-bold">{t.retry}</button>
        </div>
      ) : jobPosts.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">{t.empty}</div>
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
                      {t.status[post.status] || post.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">{post.description}</p>
                  
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[10px] text-gray-400 font-bold uppercase">
                    <span>{t.addressLabel}: <strong className="text-gray-600 font-bold">{post.address_text}</strong></span>
                    <span>{t.dateLabel}: <strong className="text-gray-600 font-bold">{new Date(post.target_date).toLocaleString(isRTL ? "ar-SA" : "en-US", { timeZone: "Asia/Riyadh" })}</strong></span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[10px] text-gray-400 block font-bold">{t.budgetLimit}</span>
                  <span className="text-xl font-black text-gray-900">{post.budget_max} {t.sar}</span>
                  {post.status === "open" && (
                    <button
                      onClick={() => cancelRequest(post.id)}
                      disabled={busyId === post.id}
                      className="block mt-2 text-[10px] font-bold text-red-600 hover:underline disabled:opacity-50"
                    >
                      {t.cancelRequest}
                    </button>
                  )}
                </div>
              </div>

              {/* Bids Section */}
              <div className="border-t border-gray-100 pt-6">
                <h4 className="font-bold text-xs text-gray-800 mb-4">
                  {t.bidsReceived} ({post.job_bids?.length || 0})
                </h4>

                {!post.job_bids || post.job_bids.length === 0 ? (
                  <p className="text-[11px] text-gray-400 italic">{post.status === "open" ? t.waiting : ""}</p>
                ) : (
                  <div className="space-y-4">
                    {post.job_bids.map((bid) => (
                      <div key={bid.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 border border-gray-200">
                            {bid.providers?.logo_url && <img src={bid.providers.logo_url} alt={bid.providers.business_name_en} className="w-full h-full object-cover" />}
                          </div>
                          <div>
                            <h5 className="font-bold text-xs text-gray-800">{isRTL ? bid.providers?.business_name_ar || bid.providers?.business_name_en : bid.providers?.business_name_en}</h5>
                            <p className="text-[10px] text-gray-500 mt-0.5">{bid.proposal_notes}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                          <div className="text-left sm:text-right">
                            <span className="text-[9px] text-gray-400 block font-bold">{t.proposedBid}</span>
                            <span className="text-sm font-extrabold text-gray-900">{bid.bid_price} {t.sar}</span>
                          </div>

                          {post.status === "open" && bid.status === "pending" && (
                            <button
                              onClick={() => acceptBid(bid.id)}
                              disabled={busyId === bid.id}
                              className="px-4 py-2 bg-black hover:bg-gray-800 text-white text-[10px] font-bold rounded-lg transition duration-150 disabled:opacity-50"
                            >
                              {t.acceptBid}
                            </button>
                          )}
                          {bid.status !== "pending" && t.bidStatus[bid.status] && (
                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border ${bid.status === "accepted" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                              {t.bidStatus[bid.status]}
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
