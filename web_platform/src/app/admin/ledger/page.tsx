"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Transactions Splits Ledger",
    subtitle: "Audit Tap Connect escrow splits, captured funds, and release pending payouts to bank profiles.",
    loading: "Loading captured splits ledger...",
    success: "Success",
    error: "Error",
    paymentIntent: "Payment Intent",
    grossCaptured: "Gross Captured",
    platformShare: "Platform Share (15%)",
    providerShare: "Provider Share (85%)",
    payoutStatus: "Payout Status",
    actions: "Actions",
    released: "Released",
    releasePayout: "Release Payout",
    bookingUuid: "Booking UUID",
    payoutStatusReleased: "released",
    payoutStatusPending: "pending",
    successMsg: "Escrow split payout released successfully!",
    errorMsg: "Failed to release transaction payout split.",
    errorLoad: "Failed to load platform splits ledger.",
    payoutRequestsTitle: "Provider Payout Requests",
    payoutRequestsSubtitle: "Review withdrawal requests, move them into processing, reject them, or mark paid after releasing matched ledger rows.",
    requestId: "Request ID",
    provider: "Provider",
    requestedAt: "Requested",
    amount: "Amount",
    bank: "Bank",
    iban: "IBAN",
    requestStatus: "Request Status",
    markProcessing: "Mark Processing",
    markPaid: "Mark Paid",
    rejectRequest: "Reject",
    noPayoutRequests: "No payout requests yet.",
    statusRequested: "Requested",
    statusProcessing: "Processing",
    statusPaid: "Paid",
    statusRejected: "Rejected",
    requestProcessingMsg: "Payout request moved to processing.",
    requestRejectedMsg: "Payout request rejected.",
    requestPaidMsg: "Payout request marked paid and ledger rows released.",
    requestActionError: "Failed to update payout request.",
    noLedgerCoverage: "No pending ledger rows were found for this provider.",
    noLedgerRows: "No captured ledger rows yet."
  },
  ar: {
    title: "سجل تقسيم المعاملات المالية",
    subtitle: "تدقيق تقسيمات الضمان المالي لمزودي الخدمة عبر Tap Connect، وتحرير المبالغ المعلقة لحساباتهم البنكية.",
    loading: "جاري تحميل سجل المعاملات المالية الموزعة...",
    success: "نجاح",
    error: "خطأ",
    paymentIntent: "معرف الدفع",
    grossCaptured: "المبلغ المقبوض",
    platformShare: "حصة المنصة (15%)",
    providerShare: "حصة مزود الخدمة (85%)",
    payoutStatus: "حالة التحويل",
    actions: "الإجراءات",
    released: "تم التحرير",
    releasePayout: "تحرير المبلغ",
    bookingUuid: "رقم الحجز (UUID)",
    payoutStatusReleased: "تم التحويل",
    payoutStatusPending: "معلق",
    successMsg: "تم تحرير دفعة الضمان بنجاح!",
    errorMsg: "فشل تحرير دفعة الضمان المالي.",
    errorLoad: "فشل تحميل سجل المعاملات المالية الموزعة.",
    payoutRequestsTitle: "طلبات تحويل المزودين",
    payoutRequestsSubtitle: "مراجعة طلبات السحب ونقلها للمعالجة أو رفضها أو تعليمها كمدفوعة بعد تحرير سجلات الدفعات المطابقة.",
    requestId: "رقم الطلب",
    provider: "المزود",
    requestedAt: "تاريخ الطلب",
    amount: "المبلغ",
    bank: "البنك",
    iban: "الآيبان",
    requestStatus: "حالة الطلب",
    markProcessing: "قيد المعالجة",
    markPaid: "تعليم كمدفوع",
    rejectRequest: "رفض",
    noPayoutRequests: "لا توجد طلبات تحويل بعد.",
    statusRequested: "تم الطلب",
    statusProcessing: "قيد المعالجة",
    statusPaid: "مدفوع",
    statusRejected: "مرفوض",
    requestProcessingMsg: "تم نقل طلب التحويل إلى قيد المعالجة.",
    requestRejectedMsg: "تم رفض طلب التحويل.",
    requestPaidMsg: "تم تعليم طلب التحويل كمدفوع وتحرير سجلات الدفعات.",
    requestActionError: "فشل تحديث طلب التحويل.",
    noLedgerCoverage: "لم يتم العثور على سجلات دفعات معلقة لهذا المزود.",
    noLedgerRows: "لا توجد سجلات مالية مقبوضة بعد."
  }
};

export default function AdminLedger() {
  const [ledger, setLedger] = useState<any[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) {
        setLang(currentLang);
      }
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  const t = {
    ...translations[lang],
    totalGrossTitle: lang === "ar" ? "إجمالي الحجم الإجمالي" : "Total Gross Volume",
    totalPlatformTitle: lang === "ar" ? "إجمالي عمولات المنصة" : "Total Platform Revenue",
    totalProviderTitle: lang === "ar" ? "إجمالي مستحقات المزودين" : "Total Providers Share"
  };

  const formatMoney = (value: unknown) =>
    Number(value || 0).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

  const maskIban = (iban: string) => {
    const clean = (iban || "").replace(/\s/g, "").toUpperCase();
    if (clean.length <= 8) return clean;
    return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
  };

  const requestStatusLabel = (status: string) => {
    if (status === "processing") return t.statusProcessing;
    if (status === "paid") return t.statusPaid;
    if (status === "rejected") return t.statusRejected;
    return t.statusRequested;
  };

  const requestStatusClass = (status: string) => {
    if (status === "paid") return "bg-[#ECFDF3] text-[#16A34A]";
    if (status === "rejected") return "bg-[#FEF3F2] text-[#D92D20]";
    if (status === "processing") return "bg-[#EEF4FF] text-[#3538CD]";
    return "bg-[#FFFAEB] text-[#F59E0B]";
  };

  const loadLedger = async () => {
    try {
      setLoading(true);
      const { data, error: dbError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          booking_id,
          payment_intent_id,
          total_captured,
          platform_share,
          provider_share,
          payout_status,
          created_at
        `)
        .order("created_at", { ascending: false });

      if (dbError) throw dbError;

      if (data && data.length > 0) {
        setLedger(data);
      } else {
        setLedger([]);
      }
    } catch (err) {
      setError(t.errorLoad);
      console.warn("Offline splits ledger warning:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadPayoutRequests = async () => {
    try {
      setRequestsLoading(true);
      const { data, error: dbError } = await supabase
        .from("payout_requests")
        .select(`
          id,
          provider_id,
          amount,
          bank_name,
          iban,
          status,
          admin_note,
          requested_at,
          processed_at,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("requested_at", { ascending: false });

      if (dbError) throw dbError;
      setPayoutRequests(data || []);
    } catch (err) {
      setPayoutRequests([]);
      setError(t.errorLoad);
      console.warn("Payout request load warning:", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
    loadPayoutRequests();
  }, [lang]);

  const handleReleasePayout = async (id: string) => {
    try {
      setSuccess("");
      setError("");

      const { error: patchError } = await supabase
        .from("transactional_ledger")
        .update({ payout_status: "released" })
        .eq("id", id);

      if (patchError) throw patchError;

      setSuccess(t.successMsg);
      loadLedger();
    } catch (err) {
      setError(t.errorMsg);
      console.warn("Offline split release warning:", err);
    }
  };

  const updatePayoutRequestStatus = async (request: any, status: "processing" | "rejected") => {
    try {
      setSuccess("");
      setError("");
      setProcessingRequestId(request.id);

      const { error: patchError } = await supabase
        .from("payout_requests")
        .update({
          status,
          processed_at: status === "rejected" ? new Date().toISOString() : null,
          admin_note: status === "rejected" ? "Rejected by admin review." : "Approved for payout processing."
        })
        .eq("id", request.id);

      if (patchError) throw patchError;

      setSuccess(status === "rejected" ? t.requestRejectedMsg : t.requestProcessingMsg);
      await loadPayoutRequests();
    } catch (err) {
      setError(t.requestActionError);
      console.warn("Payout request status warning:", err);
    } finally {
      setProcessingRequestId("");
    }
  };

  const markPayoutRequestPaid = async (request: any) => {
    try {
      setSuccess("");
      setError("");
      setProcessingRequestId(request.id);

      const { data: pendingLedger, error: ledgerError } = await supabase
        .from("transactional_ledger")
        .select(`
          id,
          provider_share,
          created_at,
          bookings!inner (
            branches!inner (
              provider_id
            )
          )
        `)
        .eq("payout_status", "pending")
        .eq("bookings.branches.provider_id", request.provider_id)
        .order("created_at", { ascending: true });

      if (ledgerError) throw ledgerError;
      if (!pendingLedger || pendingLedger.length === 0) {
        setError(t.noLedgerCoverage);
        return;
      }

      const targetAmount = Number(request.amount || 0);
      let coveredAmount = 0;
      const ledgerIdsToRelease: string[] = [];

      for (const entry of pendingLedger) {
        if (coveredAmount >= targetAmount) break;
        ledgerIdsToRelease.push(entry.id);
        coveredAmount += Number(entry.provider_share || 0);
      }

      if (ledgerIdsToRelease.length === 0) {
        setError(t.noLedgerCoverage);
        return;
      }

      const { error: releaseError } = await supabase
        .from("transactional_ledger")
        .update({ payout_status: "released" })
        .in("id", ledgerIdsToRelease);

      if (releaseError) throw releaseError;

      const { error: requestError } = await supabase
        .from("payout_requests")
        .update({
          status: "paid",
          processed_at: new Date().toISOString(),
          admin_note: `Released ${coveredAmount.toFixed(2)} SAR across ${ledgerIdsToRelease.length} ledger rows.`
        })
        .eq("id", request.id);

      if (requestError) throw requestError;

      setSuccess(t.requestPaidMsg);
      await Promise.all([loadLedger(), loadPayoutRequests()]);
    } catch (err) {
      setError(t.requestActionError);
      console.warn("Payout request paid warning:", err);
    } finally {
      setProcessingRequestId("");
    }
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Calculate split summaries
  const totalGross = ledger.reduce((sum, item) => sum + (parseFloat(item.total_captured) || 0), 0);
  const platformTotal = ledger.reduce((sum, item) => sum + (parseFloat(item.platform_share) || 0), 0);
  const providerTotal = ledger.reduce((sum, item) => sum + (parseFloat(item.provider_share) || 0), 0);

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className={`bg-[#ECFDF3] border border-[#22C55E]/20 text-[#16A34A] text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.success}: {success}
        </div>
      )}

      {error && (
        <div className={`bg-[#FEF3F2] border border-[#EF4444]/20 text-[#EF4444] text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {t.error}: {error}
        </div>
      )}

      {/* Payout Request Review */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className={`flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-gray-50/50 p-5 ${flip}`}>
          <div>
            <h3 className="font-serif text-lg font-black text-gray-900">{t.payoutRequestsTitle}</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">{t.payoutRequestsSubtitle}</p>
          </div>
          <span className="rounded-full border border-[#D1AF47]/25 bg-[#D1AF47]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#9A7211]">
            {payoutRequests.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestId}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.provider}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestedAt}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.amount}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bank}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.requestStatus}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {requestsLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : payoutRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.noPayoutRequests}</td>
                </tr>
              ) : (
                payoutRequests.map((request) => {
                  const provider = Array.isArray(request.providers) ? request.providers[0] : request.providers;
                  const providerName = isRTL
                    ? provider?.business_name_ar || provider?.business_name_en || request.provider_id
                    : provider?.business_name_en || provider?.business_name_ar || request.provider_id;
                  const isBusy = processingRequestId === request.id;
                  const isClosed = request.status === "paid" || request.status === "rejected";

                  return (
                    <tr key={request.id} className="hover:bg-gray-50/40 transition duration-150">
                      <td className="py-4 px-6 font-mono font-bold text-gray-900">
                        {request.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">{providerName}</p>
                        <p className="mt-1 font-mono text-[9px] text-gray-400">{request.provider_id.slice(0, 8)}...</p>
                      </td>
                      <td className="py-4 px-6 text-gray-500">{formatDate(request.requested_at)}</td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">
                        {formatMoney(request.amount)} {lang === "ar" ? "Ø±ÙŠØ§Ù„" : "SAR"}
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">{request.bank_name}</p>
                        <p className="mt-1 font-mono text-[9px] text-gray-400">{maskIban(request.iban)}</p>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${requestStatusClass(request.status)}`}>
                          {requestStatusLabel(request.status)}
                        </span>
                      </td>
                      <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                        <div className={`flex flex-wrap gap-2 ${isRTL ? "justify-start" : "justify-end"}`}>
                          {request.status === "requested" && (
                            <button
                              onClick={() => updatePayoutRequestStatus(request, "processing")}
                              disabled={isBusy}
                              className="px-3 py-1.5 bg-white text-gray-700 border border-[#ECECEC] hover:bg-gray-50 disabled:opacity-50 text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                            >
                              {t.markProcessing}
                            </button>
                          )}
                          {!isClosed && (
                            <button
                              onClick={() => markPayoutRequestPaid(request)}
                              disabled={isBusy}
                              className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                            >
                              {t.markPaid}
                            </button>
                          )}
                          {!isClosed && (
                            <button
                              onClick={() => updatePayoutRequestStatus(request, "rejected")}
                              disabled={isBusy}
                              className="px-3 py-1.5 bg-[#FEF3F2] text-[#D92D20] hover:bg-[#FEE4E2] disabled:opacity-50 text-[9px] font-black uppercase tracking-wider rounded-lg transition"
                            >
                              {t.rejectRequest}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split summary widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Gross Captured */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalGrossTitle}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
              $
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalGross.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>

        {/* Platform Share */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalPlatformTitle}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-amber-700 font-serif text-xs font-black">
              %
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">
            {platformTotal.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>

        {/* Provider Share */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalProviderTitle}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#101828]">
              <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {providerTotal.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.paymentIntent}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.grossCaptured}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.platformShare}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerShare}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.payoutStatus}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.noLedgerRows}</td>
                </tr>
              ) : (
                ledger.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/40 transition duration-150">
                    <td className="py-4 px-6">
                      <p className="font-bold text-gray-900">{item.payment_intent_id}</p>
                      <p className="text-[9px] text-gray-400 font-semibold mt-1">{t.bookingUuid}: {item.booking_id.substring(0, 8)}...</p>
                    </td>
                    <td className="py-4 px-6 font-serif font-black text-gray-900">
                      {item.total_captured} {lang === "ar" ? "ريال" : "SAR"}
                    </td>
                    <td className="py-4 px-6 font-serif font-black text-amber-700">
                      {item.platform_share} {lang === "ar" ? "ريال" : "SAR"}
                    </td>
                    <td className="py-4 px-6 font-serif font-black text-gray-700">
                      {item.provider_share} {lang === "ar" ? "ريال" : "SAR"}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                        item.payout_status === "released"
                          ? "bg-[#ECFDF3] text-[#16A34A]"
                          : "bg-[#FFFAEB] text-[#F59E0B]"
                      }`}>
                        {item.payout_status === "released" ? t.released : t.payoutStatusPending}
                      </span>
                    </td>
                    <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                      <button
                        onClick={() => handleReleasePayout(item.id)}
                        disabled={item.payout_status === "released"}
                        className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-50 disabled:text-gray-400 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition border border-[#ECECEC] disabled:border-[#ECECEC]"
                      >
                        {item.payout_status === "released" ? t.released : t.releasePayout}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
