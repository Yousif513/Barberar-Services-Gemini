"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";

const translations = {
  en: {
    title: "Client Reviews & Moderation Queue",
    subtitle: "Audit customer ratings, manage provider responses, and moderate flagged reviews.",
    totalReviews: "Total Reviews",
    avgRating: "Average Rating",
    flaggedReviews: "Flagged / Hidden",
    client: "Client Name",
    rating: "Score",
    comment: "Comment Detail",
    status: "Moderation State",
    actions: "Actions",
    approveBtn: "Approve Review",
    flagBtn: "Flag as Abusive",
    hideBtn: "Hide Review",
    approved: "Published",
    flagged: "Flagged",
    hidden: "Hidden",
    loading: "Loading reviews...",
    noReviews: "No customer reviews recorded yet.",
    providerReply: "Provider Response:"
  },
  ar: {
    title: "تدقيق ومراجعة التقييمات",
    subtitle: "إدارة ومراقبة تقييمات العملاء، وحجب التعليقات المخالفة، ومتابعة ردود المتاجر.",
    totalReviews: "إجمالي التقييمات",
    avgRating: "متوسط التقييم العام",
    flaggedReviews: "التقييمات المبلّغ عنها / المحجوبة",
    client: "اسم العميل",
    rating: "التقييم",
    comment: "تفاصيل التعليق",
    status: "حالة التقييم",
    actions: "الإجراءات",
    approveBtn: "نشر التقييم",
    flagBtn: "بلاغ مخالفة",
    hideBtn: "حجب التقييم",
    approved: "منشور",
    flagged: "مخالفة",
    hidden: "محجوب",
    loading: "جاري تحميل التقييمات...",
    noReviews: "لا توجد تقييمات مسجلة حتى الآن.",
    providerReply: "رد مقدم الخدمة:"
  }
};

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [actionError, setActionError] = useState("");

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

  useEffect(() => {
    loadReviews();
  }, []);

  async function loadReviews() {
    try {
      setLoading(true);
      setActionError("");
      const { data, error } = await supabase
        .from("reviews")
        .select(`
          id,
          rating,
          comment,
          created_at,
          moderation_status,
          reply_comment,
          reply_created_at,
          customer:profiles!reviews_customer_id_fkey(first_name, last_name),
          provider:providers(business_name_en, business_name_ar),
          employee:employees(name_en, name_ar)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (err: any) {
      console.warn("Failed to load live reviews:", err.message);
      setActionError(err?.message || "Failed to sync reviews from database.");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  // Hiding or flagging customer content opens a dialog that shows the review and captures a recorded reason
  // (moderate_review audits it); restoring a review needs none. A refusal stays in the dialog.
  const [pendingModeration, setPendingModeration] = useState<{ review: any; status: "flagged" | "hidden" } | null>(null);
  const runModeration = async (reviewId: string, status: "published" | "flagged" | "hidden", reason: string): Promise<string | null> => {
    const { error } = await supabase.rpc("moderate_review", {
      p_review_id: reviewId,
      p_status: status,
      p_reason: reason
    });
    if (error) return error.message || "Failed to update review status.";
    setActionError("");
    setReviews(prev => prev.map(r => r.id === reviewId ? { ...r, moderation_status: status } : r));
    return null;
  };

  const handleModerate = async (reviewId: string, status: "published" | "flagged" | "hidden") => {
    if (status === "published") {
      const message = await runModeration(reviewId, status, "Restored by admin");
      if (message) setActionError(message);
      return;
    }
    const review = reviews.find((row) => row.id === reviewId);
    if (review) setPendingModeration({ review, status });
  };

  const renderModerationDialog = () => {
    if (!pendingModeration) return null;
    const { review, status } = pendingModeration;
    const ar = lang === "ar";
    const customer = review.customer ? `${review.customer.first_name || ""} ${review.customer.last_name || ""}`.trim() : "";
    const provider = ar ? review.provider?.business_name_ar || review.provider?.business_name_en : review.provider?.business_name_en || review.provider?.business_name_ar;
    return (
      <CommandDialog
        locale={lang}
        tone={status === "hidden" ? "danger" : "default"}
        title={status === "hidden" ? (ar ? "إخفاء هذا التقييم" : "Hide this review") : (ar ? "الإبلاغ عن هذا التقييم" : "Flag this review")}
        intro={status === "hidden"
          ? (ar ? "لن يظهر التقييم للعملاء. يمكن استعادته لاحقاً." : "The review is no longer shown to customers. It can be restored later.")
          : (ar ? "يُعلَّم التقييم للمراجعة. يمكن استعادته لاحقاً." : "The review is marked for follow-up. It can be restored later.")}
        facts={[
          { label: ar ? "العميل" : "Customer", value: customer || "—" },
          { label: ar ? "مقدم الخدمة" : "Provider", value: provider || "—" },
          { label: ar ? "التقييم" : "Rating", value: String(review.rating ?? "—") },
          { label: ar ? "التعليق" : "Comment", value: review.comment || "—" },
        ]}
        reasonLabel={ar ? "سبب الإجراء (يُسجل في سجل التدقيق)" : "Reason for this action (recorded in the audit log)"}
        confirmLabel={status === "hidden" ? (ar ? "إخفاء التقييم" : "Hide review") : (ar ? "الإبلاغ عن التقييم" : "Flag review")}
        onConfirm={(reason) => runModeration(review.id, status, reason)}
        onClose={() => setPendingModeration(null)}
      />
    );
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const totalCount = reviews.length;
  const avgScore = totalCount > 0
    ? (reviews.reduce((acc, curr) => acc + (curr.rating || 0), 0) / totalCount).toFixed(1)
    : "0.0";
  const flaggedCount = reviews.filter(r => r.moderation_status === "flagged" || r.moderation_status === "hidden").length;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {renderModerationDialog()}
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalReviews}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.avgRating}</span>
          <strong className="block text-2xl font-serif font-black text-[#D1AF47] mt-2.5">
            {avgScore} / 5.0
          </strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.flaggedReviews}</span>
          <strong className="block text-2xl font-serif font-black text-red-700 mt-2.5">
            {flaggedCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="bg-white border border-[#ECECEC] rounded-2xl p-8 text-center text-gray-400 font-bold text-xs">
            {t.loading}
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white border border-[#ECECEC] rounded-2xl p-8 text-center text-gray-400 font-bold text-xs">
            {t.noReviews}
          </div>
        ) : (
          reviews.map(r => {
            const customerName = r.customer ? `${r.customer.first_name || ""} ${r.customer.last_name || ""}`.trim() : (isRTL ? "عميل موثق" : "Verified Client");
            const providerName = isRTL ? r.provider?.business_name_ar || r.provider?.business_name_en : r.provider?.business_name_en;
            const staffName = isRTL ? r.employee?.name_ar || r.employee?.name_en : r.employee?.name_en;
            const statusKey = r.moderation_status || "published";

            return (
              <div key={r.id} className="bg-white border border-[#ECECEC] rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
                <div className={`flex justify-between items-start gap-4 ${flip}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">{customerName}</p>
                      {providerName && (
                        <span className="text-[10px] text-gray-400 font-semibold">@ {providerName}</span>
                      )}
                      {staffName && (
                        <span className="text-[10px] text-amber-700 font-semibold">({staffName})</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 mt-1 ${flip}`}>
                      <span className="text-[#D1AF47] font-bold text-xs">{"★".repeat(r.rating || 5)}{"☆".repeat(Math.max(0, 5 - (r.rating || 5)))}</span>
                      <span className="text-[10px] text-gray-400 font-semibold ml-2">
                        {new Date(r.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                    statusKey === "published" 
                      ? "bg-[#ECFDF3] text-[#15803D]" 
                      : statusKey === "flagged" 
                      ? "bg-[#FEF3F2] text-[#B91C1C]" 
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {statusKey === "published" ? t.approved : statusKey === "flagged" ? t.flagged : t.hidden}
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed font-semibold">"{r.comment || (isRTL ? "بدون تعليق مكتوب." : "No written review.")}"</p>

                {r.reply_comment && (
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">{t.providerReply}</span>
                    <p className="text-gray-700 font-medium">{r.reply_comment}</p>
                  </div>
                )}

                <div className={`flex gap-2 pt-2 border-t border-[#F5F5F5] ${isRTL ? "justify-start" : "justify-end"}`}>
                  <button 
                    onClick={() => handleModerate(r.id, "hidden")} 
                    className="px-3.5 py-1.5 bg-white text-gray-700 border border-[#ECECEC] rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-50 transition"
                  >
                    {t.hideBtn}
                  </button>
                  <button 
                    onClick={() => handleModerate(r.id, "flagged")} 
                    className="px-3.5 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-red-100 transition"
                  >
                    {t.flagBtn}
                  </button>
                  <button 
                    onClick={() => handleModerate(r.id, "published")} 
                    className="px-3.5 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition"
                  >
                    {t.approveBtn}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
