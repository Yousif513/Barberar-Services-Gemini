"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { errorMessage } from "@/lib/error-message";
import { useOperationsLocale } from "@/components/operations-ui";
import { formatBookingDate } from "@/lib/booking-display.mjs";

const translations = {
  en: {
    title: "My Reviews",
    subtitle: "Share feedback on your grooming experiences and view past ratings.",
    pendingTitle: "Write a Review",
    pendingDesc: "Your feedback helps the collective maintain premium standards.",
    submittedTitle: "Past Reviews",
    rating: "Rating",
    commentPlaceholder: "Share your experience with details about the hygiene, style, and care...",
    submitReview: "Submit Review",
    noPending: "No pending reviews at the moment.",
    noReviews: "You haven't posted any reviews yet.",
    thankYou: "Thank you! Your review has been saved.",
    service: "Service",
    provider: "Provider",
    date: "Date",
    comments: "Comments",
    cancel: "Cancel",
    loading: "Loading reviews...",
    loadFailed: "Your reviews could not be loaded:",
    saveFailed: "Your review was not saved; what you wrote is kept so you can try again:",
    saving: "Saving...",
    star: "{n} of 5 stars",
    bookingAlreadyReviewed: "You have already reviewed that visit. Your review is listed below.",
    bookingNotReviewable: "That visit cannot be reviewed: only your own completed visits can be."
  },
  ar: {
    title: "تقييماتي",
    subtitle: "شارك تجربتك للعناية بالجمال واطلع على تقييماتك السابقة.",
    pendingTitle: "اكتب تقييماً",
    pendingDesc: "ملاحظاتك تساعد أعضاء المجموعة على الحفاظ على مستويات الخدمة الممتازة.",
    submittedTitle: "التقييمات السابقة",
    rating: "التقييم",
    commentPlaceholder: "شارك تجربتك بالتفصيل عن النظافة، الأسلوب، والاهتمام بالخدمة...",
    submitReview: "تقديم التقييم",
    noPending: "لا توجد خدمات بانتظار التقييم حالياً.",
    noReviews: "لم تقم بنشر أي تقييمات بعد.",
    thankYou: "شكراً لك! تم حفظ تقييمك بنجاح.",
    service: "الخدمة",
    provider: "مزود الخدمة",
    date: "التاريخ",
    comments: "التعليقات",
    cancel: "إلغاء",
    loading: "جارٍ تحميل التقييمات...",
    loadFailed: "تعذر تحميل تقييماتك:",
    saveFailed: "لم يُحفظ تقييمك، وقد أبقينا ما كتبته لتحاول مرة أخرى:",
    saving: "جارٍ الحفظ...",
    star: "{n} من 5 نجوم",
    bookingAlreadyReviewed: "لقد قيّمت تلك الزيارة من قبل. تقييمك مدرج أدناه.",
    bookingNotReviewable: "لا يمكن تقييم تلك الزيارة: يمكن تقييم زياراتك المكتملة فقط."
  }
};

// useSearchParams needs a Suspense boundary in the App Router, so the page body sits one level down.
export default function CustomerReviewsPage() {
  return (
    <Suspense fallback={null}>
      <CustomerReviews />
    </Suspense>
  );
}

function CustomerReviews() {
  const locale = useOperationsLocale();
  // The post-visit message links here with ?booking=<id>: that visit's review form opens on arrival.
  const bookingParam = useSearchParams().get("booking");
  const bookingParamHandled = useRef(false);
  const [bookingNotice, setBookingNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Review Form State
  const [activePendingId, setActivePendingId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState("");

  const t = translations[locale];

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch submitted reviews
      const { data: reviewsData, error: reviewsError } = await supabase
        .from("reviews")
        .select(`
          id,
          booking_id,
          rating,
          comment,
          created_at,
          bookings (
            scheduled_at,
            services ( name_en, name_ar ),
            branches (
              providers ( business_name_en, business_name_ar )
            )
          )
        `)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (reviewsError) throw reviewsError;
      setMyReviews(reviewsData || []);

      // 2. Fetch completed bookings that do NOT have a review yet
      const { data: completedBookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          scheduled_at,
          services ( name_en, name_ar ),
          branches (
            providers ( id, business_name_en, business_name_ar )
          )
        `)
        .eq("customer_id", user.id)
        .eq("status", "completed");

      if (bookingsError) throw bookingsError;

      // Filter out bookings that already have reviews
      const reviewedBookingIds = new Set((reviewsData || []).map(r => r.booking_id).filter(Boolean));
      const unreviewed = (completedBookings || []).filter(b => !reviewedBookingIds.has(b.id));
      setPendingReviews(unreviewed);

      // Open the form for the visit named in ?booking= (once), or say why it cannot be reviewed.
      if (bookingParam && !bookingParamHandled.current) {
        bookingParamHandled.current = true;
        if (unreviewed.some(b => b.id === bookingParam)) {
          setActivePendingId(bookingParam);
          setRating(5);
          setComment("");
          setBookingNotice("");
        } else if (reviewedBookingIds.has(bookingParam)) {
          setBookingNotice(translations[locale].bookingAlreadyReviewed);
        } else {
          setBookingNotice(translations[locale].bookingNotReviewable);
        }
      }

    } catch (err) {
      setMyReviews([]);
      setPendingReviews([]);
      setError(`${translations[locale].loadFailed} ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }

  async function submitReview(bookingId: string) {
    if (saving) return;
    try {
      setSaving(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error: insertError } = await supabase
        .from("reviews")
        .insert({
          booking_id: bookingId,
          customer_id: user.id,
          rating,
          comment
        });

      if (insertError) throw insertError;

      trackEvent("review_submitted", {
        booking_id: bookingId,
        provider_id: (pendingReviews.find((p) => p.id === bookingId) as any)?.branches?.providers?.id || "",
        rating,
        has_text: comment.trim().length > 0,
      });
      setSuccessMsg(t.thankYou);
      setComment("");
      setRating(5);
      setActivePendingId(null);
      
      // Reload lists
      loadData();
    } catch (err) {
      // Keep the rating and comment so the customer can retry.
      setError(`${t.saveFailed} ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 font-sans">
      {/* HEADER */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
      </div>

      {successMsg && (
        <div role="status" className="bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl p-4 font-bold">
          {successMsg}
        </div>
      )}

      {bookingNotice && (
        <div role="status" className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-xl p-4">
          {bookingNotice}
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4">
          {error}
        </div>
      )}

      {/* 1. PENDING REVIEWS FORM CARD */}
      {pendingReviews.length > 0 && (
        <div className="bg-stone-900 text-white rounded-2xl p-6 shadow-md border border-stone-850">
          <h3 className="font-bold text-sm text-white mb-2">{t.pendingTitle}</h3>
          <p className="text-xs text-stone-400 mb-6">{t.pendingDesc}</p>

          <div className="space-y-4">
            {pendingReviews.map((b) => (
              <div key={b.id} className="bg-stone-950 border border-stone-800 rounded-xl p-4">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-stone-500">
                      {locale === "ar" ? b.branches?.providers?.business_name_ar : b.branches?.providers?.business_name_en}
                    </span>
                    <h4 className="font-bold text-xs text-white mt-1">
                      {locale === "ar" ? b.services?.name_ar : b.services?.name_en}
                    </h4>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {formatBookingDate(b.scheduled_at, locale)}
                    </p>
                  </div>

                  {activePendingId !== b.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActivePendingId(b.id);
                        setRating(5);
                        setComment("");
                      }}
                      className="px-4 py-2 bg-[hsl(45,60%,55%)] text-black font-bold text-xs rounded-lg hover:bg-[hsl(45,60%,45%)] transition"
                    >
                      {t.pendingTitle}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActivePendingId(null)}
                      className="px-3 py-1.5 border border-stone-750 text-xs text-stone-400 rounded-lg hover:text-white"
                    >
                      {t.cancel}
                    </button>
                  )}
                </div>

                {/* FORM INPUTS */}
                {activePendingId === b.id && (
                  <div className="mt-6 pt-6 border-t border-stone-850 space-y-4">
                    {/* Star Rating Toggle */}
                    <div>
                      <span id={`review-rating-${b.id}`} className="text-[10px] uppercase font-bold text-stone-400 block mb-2">{t.rating}</span>
                      <div role="group" aria-labelledby={`review-rating-${b.id}`} className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            aria-pressed={star === rating}
                            aria-label={t.star.replace("{n}", String(star))}
                            onClick={() => setRating(star)}
                            className="text-lg transition focus-visible:outline-2 focus-visible:outline-[hsl(45,60%,55%)]"
                          >
                            <span aria-hidden="true" className={star <= rating ? "text-[hsl(45,60%,55%)]" : "text-stone-700"}>★</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comment Area */}
                    <div>
                      <label htmlFor={`review-comment-${b.id}`} className="text-[10px] uppercase font-bold text-stone-400 block mb-2">{t.comments}</label>
                      <textarea
                        id={`review-comment-${b.id}`}
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={t.commentPlaceholder}
                        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-white outline-none focus:border-[hsl(45,60%,55%)] placeholder-stone-600"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => submitReview(b.id)}
                      className="w-full py-2.5 bg-white text-black font-bold text-xs rounded-lg hover:bg-stone-100 transition disabled:opacity-60"
                    >
                      {saving ? t.saving : t.submitReview}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. SUBMITTED REVIEWS LIST */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-sm text-gray-800 mb-6">{t.submittedTitle}</h3>

        {loading ? (
          <div role="status" className="text-center py-12 text-sm text-gray-400">{t.loading}</div>
        ) : myReviews.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-xs font-semibold">{t.noReviews}</div>
        ) : (
          <div className="space-y-6">
            {myReviews.map((rev) => (
              <div key={rev.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      {locale === "ar"
                        ? (rev.bookings as any)?.branches?.providers?.business_name_ar || (rev.bookings as any)?.branches?.providers?.business_name_en
                        : (rev.bookings as any)?.branches?.providers?.business_name_en}
                    </span>
                    <h4 className="font-bold text-xs text-gray-800 mt-1">
                      {locale === "ar" ? (rev.bookings as any)?.services?.name_ar : (rev.bookings as any)?.services?.name_en}
                    </h4>
                  </div>
                  
                  <div className="text-end">
                    <div role="img" aria-label={t.star.replace("{n}", String(rev.rating))} className="flex items-center justify-end gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span
                          key={star}
                          className={`text-xs ${star <= rev.rating ? "text-[hsl(45,60%,55%)]" : "text-gray-200"}`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      {formatBookingDate(rev.created_at, locale)}
                    </span>
                  </div>
                </div>

                {rev.comment && (
                  <p className="text-xs text-gray-600 mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3 leading-relaxed">
                    {rev.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
