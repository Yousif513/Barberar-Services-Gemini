"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog, ModalOverlay, ModalPortal } from "@/components/modal";
import MakeRegularButton from "@/components/make-regular";
import IntakeLink from "@/components/intake-link";
import {
  receiptAmounts, bookingStatusLabel, policyFromProvider, policySentences, cancellationPreview,
  formatBookingDate, formatBookingTime, formatBookingDateTime, riyadhDateKey, bookAgainHref,
} from "@/lib/booking-display.mjs";
import { prayerWindowsForDate } from "@/lib/prayer-windows.mjs";

// Replaces the hand-made `fixed inset-0` layers: a modal dialog with focus moved in, Tab kept inside, Escape to close
// and the page behind it inert (ModalOverlay), named for screen readers.
function Dialog({ label, onClose, canClose = true, panelClass = "rounded-2xl max-w-lg space-y-6", children }: {
  label: string; onClose: () => void; canClose?: boolean; panelClass?: string; children: React.ReactNode;
}) {
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={canClose} className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`bg-white border border-gray-200 w-full max-h-full overflow-y-auto p-6 shadow-2xl ${panelClass}`}>
          {children}
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");

const translations = {
  en: {
    title: "My Bookings",
    subtitle: "Manage your upcoming appointments, service history, and bookings.",
    upcoming: "Upcoming Appointments",
    past: "Past History",
    cancelled: "Cancelled",
    noBookings: "No appointments found under this tab.",
    date: "Date & Time",
    provider: "Provider",
    service: "Service",
    staff: "Stylist / Specialist",
    price: "Total (incl. VAT)",
    status: "Status",
    actions: "Actions",
    details: "View Details",
    cancel: "Cancel Appointment",
    reschedule: "Reschedule",
    message: "Message Specialist",
    rebook: "Book Again",
    confirmCancelTitle: "Cancel Appointment",
    confirmCancelDesc: "Are you sure you want to cancel this appointment? This action cannot be undone.",
    cancelUnpaid: "No payment has been taken for this booking, so cancelling costs nothing.",
    cancelFree: "You are inside the free-cancellation window: nothing is kept and your full deposit is refunded.",
    cancelLate: "This is a late cancellation: {fee} of your {deposit} deposit is kept ({pct}%) and {refund} is refunded.",
    cancelPolicyUnknown: "The provider's cancellation terms could not be loaded, so the fee cannot be shown in advance. Any fee kept is shown right after you cancel.",
    cancelEstimate: "This is worked out from the provider's terms; the final amounts are confirmed when you cancel.",
    cancelTermsTitle: "Provider's cancellation terms",
    factDeposit: "Deposit paid",
    factFee: "You will lose",
    factRefund: "Refund to you",
    cancelDone: "Booking cancelled. No fee was kept.",
    cancelDoneFee: "Booking cancelled. Fee kept: {fee}. Refund requested: {refund}.",
    cancelDoneRefund: "Booking cancelled. Refund requested: {refund}.",
    yesCancel: "Yes, Cancel",
    close: "Close",
    currency: "SAR",
    attendanceConfirmed: "Attendance confirmed! Looking forward to welcoming you.",
    rescheduleTitle: "Reschedule Appointment",
    selectNewDate: "Select New Date",
    selectNewTime: "Select New Time Slot",
    reasonOptional: "Reason (Optional)",
    confirmReschedule: "Confirm Reschedule",
    rescheduling: "Rescheduling...",
    noSlotsFound: "No available slots on this date. Please pick another day.",
    taxInvoiceBtn: "View tax invoice",
    taxInvoiceTitle: "Simplified tax invoice",
    invoiceNumber: "Invoice Number",
    issueDate: "Issue Date",
    seller: "Provider (Seller)",
    sellerVat: "Seller VAT ID",
    buyer: "Customer (Buyer)",
    subtotal: "Subtotal (Excl. VAT)",
    vatAmount: "VAT (15%)",
    totalAmount: "Total (Incl. VAT)",
    zatcaQr: "Invoice QR (ZATCA Phase 1 format)",
    zatcaReported: "Not yet submitted to ZATCA (FATOORA Phase 2 integration pending)",
    openDispute: "File Dispute / Refund",
    disputeTitle: "Open Booking Dispute / Refund Request",
    disputeReason: "Reason for Dispute",
    disputeReasonPlaceholder: "Describe the issue clearly...",
    evidenceUrlOptional: "Evidence URL (Photo/Link)",
    submitDispute: "Submit Dispute",
    submittingDispute: "Submitting...",
    disputeSuccess: "Dispute submitted successfully. Admin team will review your case.",
    tipStaffBtn: "Tip Specialist",
    tipModalTitle: "Send a Tip to Your Specialist",
    tipNotice: "The full tip is paid to the provider for the specialist who served you. The platform takes no commission on tips; how the provider shares it with the specialist is up to them.",
    tipSelectAmount: "Select Tip Amount",
    tipCustom: "Custom Amount (SAR)",
    sendTipBtn: "Send Tip",
    sendingTip: "Processing Tip...",
    tipSuccess: "Redirecting to payment for your tip...",
    minTipNotice: "Minimum tip amount is 5 SAR.",
    tipBadge: "Staff recognition",
    loading: "Loading bookings...",
    loadFailed: "Your bookings could not be loaded:",
    retry: "Try again",
    bookingId: "Booking ID",
    bookingRef: "Booking",
    feeKept: "Fee kept",
    refundLabel: "Refund",
    slotsLoading: "Loading available times...",
    slotsFailed: "Could not load available times:",
    noSpecialist: "This booking has no assigned specialist, so times cannot be loaded. Contact the provider.",
    rescheduleNotice: "Rescheduling closes {hours} hours before the appointment.",
    rescheduleDone: "Appointment rescheduled to {when}.",
    closeDialog: "Close dialog"
  },
  ar: {
    title: "حجوزاتي",
    subtitle: "إدارة مواعيدك القادمة، وسجل الخدمات، وحجوزاتك الحالية.",
    upcoming: "المواعيد القادمة",
    past: "السجل السابق",
    cancelled: "الملغية",
    noBookings: "لا توجد حجوزات في هذا التبويب.",
    date: "التاريخ والوقت",
    provider: "مزود الخدمة",
    service: "الخدمة",
    staff: "الأخصائي / المصفف",
    price: "الإجمالي شامل الضريبة",
    status: "الحالة",
    actions: "الإجراءات",
    details: "عرض التفاصيل",
    cancel: "إلغاء الموعد",
    reschedule: "إعادة جدولة",
    message: "مراسلة الأخصائي",
    rebook: "احجز مرة أخرى",
    confirmCancelTitle: "إلغاء الحجز",
    confirmCancelDesc: "هل أنت متأكد من إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.",
    cancelUnpaid: "لم يتم سحب أي مبلغ لهذا الحجز، لذلك لا يترتب على إلغائه أي تكلفة.",
    cancelFree: "أنت ضمن فترة الإلغاء المجاني: لن يُستقطع شيء وسيُسترد العربون كاملاً.",
    cancelLate: "هذا إلغاء متأخر: سيُستقطع {fee} من عربونك البالغ {deposit} ({pct}%) ويُسترد {refund}.",
    cancelPolicyUnknown: "تعذر تحميل سياسة الإلغاء الخاصة بمقدم الخدمة، لذلك لا يمكن عرض الرسم مسبقاً. سيظهر أي رسم مستقطع مباشرة بعد الإلغاء.",
    cancelEstimate: "هذه الأرقام محسوبة من سياسة مقدم الخدمة، وتتأكد المبالغ النهائية عند الإلغاء.",
    cancelTermsTitle: "سياسة الإلغاء لدى مقدم الخدمة",
    factDeposit: "العربون المدفوع",
    factFee: "ستخسر",
    factRefund: "المبلغ المسترد إليك",
    cancelDone: "تم إلغاء الحجز. لم يُستقطع أي رسم.",
    cancelDoneFee: "تم إلغاء الحجز. الرسم المستقطع: {fee}. المبلغ المطلوب استرداده: {refund}.",
    cancelDoneRefund: "تم إلغاء الحجز. المبلغ المطلوب استرداده: {refund}.",
    yesCancel: "نعم، إلغاء الحجز",
    close: "إغلاق",
    currency: "ريال",
    attendanceConfirmed: "تم تأكيد حضورك بنجاح! نحن بانتظارك في الموعد المحدد.",
    rescheduleTitle: "إعادة جدولة الموعد",
    selectNewDate: "اختر التاريخ الجديد",
    selectNewTime: "اختر الوقت المتاح",
    reasonOptional: "السبب (اختياري)",
    confirmReschedule: "تأكيد إعادة الجدولة",
    rescheduling: "جاري الجدولة...",
    noSlotsFound: "لا توجد أوقات شاغرة في هذا اليوم. يرجى اختيار يوم آخر.",
    taxInvoiceBtn: "عرض الفاتورة الضريبية",
    taxInvoiceTitle: "فاتورة ضريبية مبسطة (هيئة الزكاة)",
    invoiceNumber: "رقم الفاتورة",
    issueDate: "تاريخ الإصدار",
    seller: "مقدم الخدمة (البائع)",
    sellerVat: "الرقم الضريبي للبائع",
    buyer: "العميل (المشتري)",
    subtotal: "المجموع قبل الضريبة",
    vatAmount: "ضريبة القيمة المضافة (١٥٪)",
    totalAmount: "المبلغ الإجمالي شامل الضريبة",
    zatcaQr: "رمز الاستجابة السريعة لهيئة الزكاة (QR)",
    zatcaReported: "لم تُرسل بعد إلى هيئة الزكاة (الربط مع فاتورة - المرحلة الثانية قيد التنفيذ)",
    openDispute: "رفع نزاع مالي أو طلب استرداد",
    disputeTitle: "تقديم نزاع مالي / طلب استرداد",
    disputeReason: "سبب النزاع",
    disputeReasonPlaceholder: "اشرح المشكلة بالتفصيل...",
    evidenceUrlOptional: "رابط الإثبات أو الصورة (اختياري)",
    submitDispute: "إرسال النزاع",
    submittingDispute: "جاري الإرسال...",
    disputeSuccess: "تم رفع النزاع بنجاح. سيتولى مسؤولو المنصة مراجعة طلبك والبت فيه.",
    tipStaffBtn: "إكرامية للمختص",
    tipModalTitle: "إرسال إكرامية للأخصائي",
    tipNotice: "يُدفع مبلغ الإكرامية كاملاً إلى مقدم الخدمة عن الأخصائي الذي خدمك. لا تقتطع المنصة أي عمولة من الإكرامية، وتوزيعها على الأخصائي يعود إلى مقدم الخدمة.",
    tipSelectAmount: "اختر قيمة الإكرامية",
    tipCustom: "مبلغ مخصص (ريال)",
    sendTipBtn: "إرسال الإكرامية الآن",
    sendingTip: "جاري المعالجة...",
    tipSuccess: "جاري تحويلك لصفحة دفع الإكرامية...",
    minTipNotice: "الحد الأدنى للإكرامية 5 ريال.",
    tipBadge: "تقدير الفريق",
    loading: "جارٍ تحميل الحجوزات...",
    loadFailed: "تعذر تحميل حجوزاتك:",
    retry: "حاول مرة أخرى",
    bookingId: "رقم الحجز",
    bookingRef: "الحجز",
    feeKept: "الرسم المستقطع",
    refundLabel: "المسترد",
    slotsLoading: "جارٍ تحميل الأوقات المتاحة...",
    slotsFailed: "تعذر تحميل الأوقات المتاحة:",
    noSpecialist: "لا يوجد أخصائي معيّن لهذا الحجز، لذلك لا يمكن تحميل الأوقات. تواصل مع مقدم الخدمة.",
    rescheduleNotice: "تُغلق إعادة الجدولة قبل الموعد بـ {hours} ساعة.",
    rescheduleDone: "تمت إعادة جدولة الموعد إلى {when}.",
    closeDialog: "إغلاق النافذة"
  }
};

export default function CustomerBookingsPage() {
  const locale = useOperationsLocale();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [rescheduleBookingTarget, setRescheduleBookingTarget] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleMin, setRescheduleMin] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsRetry, setSlotsRetry] = useState(0);
  const [cancelInfo, setCancelInfo] = useState<{ policy: ReturnType<typeof policyFromProvider>; preview: ReturnType<typeof cancellationPreview> | null } | null>(null);

  // ZATCA & Dispute Modal States (G25, G33)
  const [invoiceModalTarget, setInvoiceModalTarget] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any | null>(null);
  const [disputeBookingTarget, setDisputeBookingTarget] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeEvidence, setDisputeEvidence] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  // Staff Tipping Modal States (G47)
  const [tipTarget, setTipTarget] = useState<any | null>(null);
  const [tipAmount, setTipAmount] = useState<number>(20);
  const [customTip, setCustomTip] = useState<string>("");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState("");
  const [tipSuccess, setTipSuccess] = useState("");

  const t = translations[locale];

  const handleSendTip = async () => {
    if (!tipTarget) return;
    const finalAmount = customTip ? Number(customTip) : tipAmount;
    if (!finalAmount || finalAmount < 5) {
      setTipError(t.minTipNotice);
      return;
    }
    try {
      setTipLoading(true);
      setTipError("");
      const { data, error: rpcErr } = await supabase.rpc("add_booking_tip", {
        p_booking_id: tipTarget.id,
        p_amount: finalAmount,
        p_payment_method: "card"
      });
      if (rpcErr) throw rpcErr;
      // The tip is credited to the professional only after Tap confirms the payment.
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke("payment-checkout", {
        body: { purchaseType: "tip", purchaseId: data.purchase_id }
      });
      if (checkoutError || !checkout?.checkoutUrl) {
        throw new Error(locale === "ar" ? "تعذر فتح صفحة الدفع، لم يُخصم أي مبلغ." : "Could not open the payment page; nothing was charged.");
      }
      setTipSuccess(t.tipSuccess);
      window.location.assign(checkout.checkoutUrl);
    } catch (err: any) {
      console.error("Tip error:", err);
      setTipError(errorMessage(err));
    } finally {
      setTipLoading(false);
    }
  };

  const handleViewTaxInvoice = async (bk: any) => {
    try {
      setInvoiceLoading(true);
      setInvoiceModalTarget(bk);
      const { data, error: rpcErr } = await supabase.rpc("generate_zatca_tax_invoice", {
        p_booking_id: bk.id
      });
      if (rpcErr) throw rpcErr;
      setInvoiceData(data);
    } catch (err: any) {
      setInvoiceModalTarget(null);
      setInvoiceData(null);
      setActionMessage(err?.message || (locale === "ar" ? "تعذر إصدار الفاتورة" : "Could not issue the invoice"));
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!disputeReason.trim()) {
      setDisputeError(locale === "ar" ? "يرجى كتابة سبب النزاع" : "Please provide a reason for the dispute");
      return;
    }
    try {
      setDisputeLoading(true);
      setDisputeError("");
      const { data, error: rpcErr } = await supabase.rpc("open_booking_dispute", {
        p_booking_id: disputeBookingTarget.id,
        p_reason: disputeReason.trim(),
        p_evidence_urls: disputeEvidence.trim() ? [disputeEvidence.trim()] : []
      });
      if (rpcErr) throw rpcErr;
      setActionMessage(t.disputeSuccess);
      setDisputeBookingTarget(null);
      setDisputeReason("");
      setDisputeEvidence("");
      loadBookings();
    } catch (err: any) {
      console.error("Open dispute error:", err);
      setDisputeError(err?.message || (locale === "ar" ? "فشل فتح النزاع" : "Failed to open dispute"));
    } finally {
      setDisputeLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();

    // Handle interactive action from WhatsApp link (?action=confirm_attendance&booking_id=...)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const action = params.get("action");
      const bookingId = params.get("booking_id") || params.get("id");

      if (action === "confirm_attendance" && bookingId) {
        (async () => {
          try {
            const { data, error: rpcErr } = await supabase.rpc("customer_confirm_attendance", {
              p_booking_id: bookingId
            });
            if (!rpcErr && (data as { success?: boolean })?.success) {
              setActionMessage(t.attendanceConfirmed);
              loadBookings();
            }
          } catch (e) {
            console.warn("Attendance confirmation error:", e);
          }
        })();
      }
    }
  }, []);

  async function loadBookings() {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("bookings")
        .select(`
          id,
          scheduled_at,
          status,
          employee_id,
          duration_minutes,
          total_price,
          tax_amount,
          deposit_required,
          cancellation_fee,
          refund_amount,
          services ( id, name_en, name_ar ),
          employees ( name_en, name_ar ),
          branches (
            name_en,
            name_ar,
            latitude,
            longitude,
            providers ( id, business_name_en, business_name_ar, logo_url, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent, deposit_percentage )
          )
        `)
        .eq("customer_id", user.id)
        .order("scheduled_at", { ascending: false });

      if (fetchError) throw fetchError;
      setBookings(data || []);
    } catch (err: any) {
      setError(errorMessage(err));
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }

  // The fee and refund shown before confirming come from the provider's policy; the figures after it come from the row
  // cancel_booking returns. Resolves to a message when the server refused (the dialog stays open and shows it).
  async function cancelBooking(id: string): Promise<string | null> {
    try {
      const { data, error: cancelError } = await supabase.rpc("cancel_booking", { target_booking_id: id });
      if (cancelError) throw cancelError;
      const row = data as { cancellation_fee?: number | string | null; refund_amount?: number | string | null } | null;
      const fee = Number(row?.cancellation_fee ?? 0);
      const refund = Number(row?.refund_amount ?? 0);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: "cancelled", cancellation_fee: fee, refund_amount: refund } : b));
      setActionMessage(
        fee > 0 ? fill(t.cancelDoneFee, { fee: sar(fee, locale), refund: sar(refund, locale) })
          : refund > 0 ? fill(t.cancelDoneRefund, { refund: sar(refund, locale) })
          : t.cancelDone
      );
      setSelectedBooking(null);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  function openCancel(bk: any) {
    const policy = policyFromProvider(bk.branches?.providers);
    setCancelInfo({
      policy,
      preview: policy
        ? cancellationPreview({ status: bk.status, scheduledAt: bk.scheduled_at, now: new Date(), depositRequired: bk.deposit_required, policy })
        : null,
    });
    setSelectedBooking(bk);
    setShowCancelModal(true);
  }

  function describeCancel(bk: any) {
    const preview = cancelInfo?.preview;
    const policy = cancelInfo?.policy;
    const facts: { label: string; value: string }[] = [];
    let intro = t.confirmCancelDesc;
    if (bk.status === "pending_payment") {
      intro = `${t.cancelUnpaid} ${t.confirmCancelDesc}`;
    } else if (preview && policy) {
      facts.push(
        { label: t.factDeposit, value: sar(preview.captured, locale) },
        { label: t.factFee, value: sar(preview.fee, locale) },
        { label: t.factRefund, value: sar(preview.refund, locale) },
      );
      const verdict = preview.fee > 0
        ? fill(t.cancelLate, { fee: sar(preview.fee, locale), deposit: sar(preview.captured, locale), pct: String(policy.lateFeePercent), refund: sar(preview.refund, locale) })
        : t.cancelFree;
      intro = `${verdict} ${t.cancelEstimate}`;
    } else {
      intro = `${t.cancelPolicyUnknown} ${t.confirmCancelDesc}`;
    }
    return { intro, facts, effects: policy ? policySentences(policy, locale) : [] };
  }

  // Load available slots for selected reschedule date
  // Only slots the database returns are ever offered: a failed query shows its error and a retry, never made-up times.
  useEffect(() => {
    let active = true;
    async function fetchRescheduleSlots() {
      setSlotsError("");
      if (!rescheduleBookingTarget || !rescheduleDate) {
        setRescheduleSlots([]);
        return;
      }
      if (!rescheduleBookingTarget.employee_id) {
        setRescheduleSlots([]);
        setSlotsError(translations[locale].noSpecialist);
        return;
      }
      setSlotsLoading(true);
      try {
        const branch = rescheduleBookingTarget.branches;
        const { starts, ends } = prayerWindowsForDate(rescheduleDate, branch?.latitude, branch?.longitude);
        const { data, error: slotsErr } = await supabase.rpc("get_available_slots", {
          target_employee_id: rescheduleBookingTarget.employee_id,
          target_date: rescheduleDate,
          service_duration_minutes: rescheduleBookingTarget.duration_minutes,
          prayer_window_starts: starts,
          prayer_window_ends: ends,
        });
        if (slotsErr) throw slotsErr;
        if (!active) return;
        setRescheduleSlots((data || []).map((s: { slot_start: string }) => s.slot_start));
      } catch (err) {
        if (!active) return;
        setRescheduleSlots([]);
        setSlotsError(errorMessage(err));
      } finally {
        if (active) setSlotsLoading(false);
      }
    }
    fetchRescheduleSlots();
    return () => {
      active = false;
    };
  }, [rescheduleBookingTarget, rescheduleDate, slotsRetry, locale]);

  async function handleReschedule() {
    if (!rescheduleBookingTarget || !rescheduleSlot) return;
    try {
      setRescheduleLoading(true);
      setRescheduleError("");
      const { data, error: rpcErr } = await supabase.rpc("reschedule_booking", {
        target_booking_id: rescheduleBookingTarget.id,
        new_scheduled_at: rescheduleSlot,
        new_employee_id: rescheduleBookingTarget.employee_id,
        reschedule_reason: rescheduleReason.trim() || undefined
      });
      if (rpcErr) throw rpcErr;

      setBookings(prev => prev.map(b => b.id === rescheduleBookingTarget.id ? { ...b, scheduled_at: rescheduleSlot } : b));
      setActionMessage(fill(t.rescheduleDone, { when: formatBookingDateTime(rescheduleSlot, locale) }));
      setRescheduleBookingTarget(null);
    } catch (err) {
      setRescheduleError(errorMessage(err));
    } finally {
      setRescheduleLoading(false);
    }
  }

  const filteredBookings = bookings.filter(b => {
    if (activeTab === "upcoming") {
      return b.status === "confirmed" || b.status === "pending_payment" || b.status === "pending";
    } else if (activeTab === "past") {
      return b.status === "completed" || b.status === "no_show";
    } else {
      return b.status === "cancelled";
    }
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "confirmed":
      case "completed":
        return "bg-green-50 text-green-700 border-green-200";
      case "pending_payment":
      case "pending":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "cancelled":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
        </div>
      </div>

      {actionMessage && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl p-4 flex items-center justify-between">
          <span>✓ {actionMessage}</span>
          <button type="button" aria-label={t.closeDialog} onClick={() => setActionMessage("")} className="text-emerald-700 hover:text-emerald-900 font-bold ms-2">✕</button>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 flex items-center justify-between gap-3">
          <span>{t.loadFailed} {error}</span>
          <button type="button" onClick={() => void loadBookings()} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-bold">{t.retry}</button>
        </div>
      )}

      {/* TABS */}
      <div className="flex w-full max-w-full overflow-x-auto border-b border-gray-200">
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`min-w-0 flex-1 sm:flex-none pb-4 px-2 sm:px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "upcoming"
              ? "border-black text-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {t.upcoming}
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`min-w-0 flex-1 sm:flex-none pb-4 px-2 sm:px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "past"
              ? "border-black text-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {t.past}
        </button>
        <button
          onClick={() => setActiveTab("cancelled")}
          className={`min-w-0 flex-1 sm:flex-none pb-4 px-2 sm:px-6 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${
            activeTab === "cancelled"
              ? "border-black text-black"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {t.cancelled}
        </button>
      </div>

      {/* LIST SECTION */}
      {loading ? (
        <div role="status" className="text-center py-12 text-sm text-gray-400">{t.loading}</div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 shadow-sm">
          <p className="text-sm font-semibold">{t.noBookings}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredBookings.map((bk) => (
            <div
              key={bk.id}
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:border-[hsl(45,60%,55%)] transition duration-200"
            >
              {/* Left Info: Provider & Service */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-100 bg-stone-100 flex-shrink-0">
                  {bk.branches?.providers?.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bk.branches.providers.logo_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-lg font-black text-stone-400">
                      {(bk.branches?.providers?.business_name_en || bk.branches?.providers?.business_name_ar || "").charAt(0)}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    {locale === "ar"
                      ? (bk as any).branches?.providers?.business_name_ar || (bk as any).branches?.providers?.business_name_en
                      : (bk as any).branches?.providers?.business_name_en}
                  </span>
                  <h3 className="font-bold text-sm text-gray-800 mt-1">
                    {locale === "ar" ? bk.services?.name_ar : bk.services?.name_en}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">
                    {locale === "ar" ? bk.branches?.name_ar : bk.branches?.name_en}
                  </p>
                </div>
              </div>

              {/* Middle Info: Date & Stylist */}
              <div className="grid grid-cols-2 lg:flex lg:items-center gap-6 lg:gap-12 w-full lg:w-auto border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-50">
                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block">{t.date}</span>
                  <span className="text-xs font-bold text-gray-700 block mt-1">
                    {formatBookingDate(bk.scheduled_at, locale)}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500 block">
                    {formatBookingTime(bk.scheduled_at, locale)}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block">{t.staff}</span>
                  <span className="text-xs font-bold text-gray-700 block mt-1">
                    {locale === "ar" ? bk.employees?.name_ar : bk.employees?.name_en}
                  </span>
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block">{t.price}</span>
                  <span className="text-xs font-bold text-gray-800 block mt-1">
                    {sar(receiptAmounts(bk).totalDue, locale)}
                  </span>
                  {(bk.status === "cancelled" || bk.status === "no_show") && Number(bk.cancellation_fee) > 0 && (
                    <span className="text-[10px] font-semibold text-red-700 block">{t.feeKept}: {sar(Number(bk.cancellation_fee), locale)}</span>
                  )}
                  {(bk.status === "cancelled" || bk.status === "no_show") && Number(bk.refund_amount) > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-700 block">{t.refundLabel}: {sar(Number(bk.refund_amount), locale)}</span>
                  )}
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1">{t.status}</span>
                  <span
                    className={`px-2.5 py-1 rounded-full font-bold text-[9px] border uppercase ${getStatusColor(
                      bk.status
                    )}`}
                  >
                    {bookingStatusLabel(bk.status, locale)}
                  </span>
                </div>
              </div>

              {/* Actions Section */}
              <div className="flex items-center gap-3 w-full lg:w-auto border-t lg:border-t-0 pt-4 lg:pt-0 border-gray-50">
                <button
                  type="button"
                  onClick={() => setSelectedBooking(bk)}
                  className="flex-1 lg:flex-initial px-4 py-2 border border-gray-200 bg-gray-50 text-xs font-bold rounded-xl hover:border-black transition duration-150"
                >
                  {t.details}
                </button>
                {activeTab === "upcoming" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setRescheduleBookingTarget(bk);
                        setRescheduleMin(riyadhDateKey(new Date()));
                        setRescheduleDate(riyadhDateKey(new Date(Date.now() + 86400000)));
                        setRescheduleSlot("");
                        setRescheduleReason("");
                        setRescheduleError("");
                      }}
                      className="flex-1 lg:flex-initial px-4 py-2 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold text-xs rounded-xl border border-amber-200 transition duration-150"
                    >
                      {t.reschedule}
                    </button>
                    <button
                      type="button"
                      onClick={() => openCancel(bk)}
                      className="flex-1 lg:flex-initial px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs rounded-xl border border-red-200 transition duration-150"
                    >
                      {t.cancel}
                    </button>
                    <MakeRegularButton booking={bk} className="flex-1 lg:flex-initial px-4 py-2 bg-[#F8F3E4] text-[#725517] hover:bg-[#F4E7B6] font-bold text-xs rounded-xl border border-[#D1AF47]/50 transition duration-150" />
                  </>
                )}
                {activeTab === "past" && (
                  <>
                    {bk.status === "completed" && (
                      <button
                        onClick={() => {
                          setTipTarget(bk);
                          setTipAmount(20);
                          setCustomTip("");
                          setTipError("");
                          setTipSuccess("");
                        }}
                        className="flex-1 lg:flex-initial px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-1.5"
                      >
                        <span className="text-[#D1AF47]">★</span>
                        <span>{t.tipStaffBtn}</span>
                      </button>
                    )}
                    <IntakeLink bookingId={bk.id} status={bk.status} className="flex-1 lg:flex-initial px-4 py-2 bg-white hover:bg-[#F8F3E4] text-[#6B4F17] border border-[#C29A4C]/40 font-bold text-xs rounded-xl transition duration-150 text-center" />
                    {bookAgainHref(bk.branches?.providers?.id, bk.services?.id) && (
                      <Link
                        href={bookAgainHref(bk.branches?.providers?.id, bk.services?.id) as string}
                        className="flex-1 lg:flex-initial px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition duration-150 text-center"
                      >
                        {t.rebook}
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedBooking && !showCancelModal && (
        <Dialog label={t.details} onClose={() => setSelectedBooking(null)}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {locale === "ar"
                    ? selectedBooking.branches?.providers?.business_name_ar || selectedBooking.branches?.providers?.business_name_en
                    : selectedBooking.branches?.providers?.business_name_en}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{t.bookingId}: {selectedBooking.id}</p>
              </div>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => setSelectedBooking(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="divide-y divide-gray-100 border-y border-gray-100 py-4 space-y-4">
              <div className="flex justify-between text-xs pt-2">
                <span className="font-bold text-gray-400">{t.service}</span>
                <span className="font-semibold text-gray-800">
                  {locale === "ar" ? selectedBooking.services?.name_ar : selectedBooking.services?.name_en}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-4">
                <span className="font-bold text-gray-400">{t.date}</span>
                <span className="font-semibold text-gray-800">
                  {formatBookingDateTime(selectedBooking.scheduled_at, locale)}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-4">
                <span className="font-bold text-gray-400">{t.staff}</span>
                <span className="font-semibold text-gray-800">
                  {locale === "ar" ? selectedBooking.employees?.name_ar : selectedBooking.employees?.name_en}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-4">
                <span className="font-bold text-gray-400">{t.price}</span>
                <span className="font-bold text-black">
                  {sar(receiptAmounts(selectedBooking).totalDue, locale)}
                </span>
              </div>
            </div>

            {/* ZATCA e-invoicing and dispute actions */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => handleViewTaxInvoice(selectedBooking)}
                className="w-full py-2 bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-900 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5 text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{t.taxInvoiceBtn}</span>
              </button>
              {selectedBooking.status === "completed" && (
                <button
                  onClick={() => {
                    setTipTarget(selectedBooking);
                    setTipAmount(20);
                    setCustomTip("");
                    setTipError("");
                    setTipSuccess("");
                  }}
                  className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
                >
                  <span className="text-[#D1AF47]">★</span>
                  <span>{t.tipStaffBtn}</span>
                </button>
              )}
              {selectedBooking.status !== "cancelled" && (
                <button
                  onClick={() => {
                    setDisputeBookingTarget(selectedBooking);
                    setDisputeError("");
                    setDisputeReason("");
                    setDisputeEvidence("");
                  }}
                  className="w-full py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{t.openDispute}</span>
                </button>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setSelectedBooking(null)}
                className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition"
              >
                {t.close}
              </button>
              {(selectedBooking.status === "confirmed" || selectedBooking.status === "pending_payment") && (
                <button
                  type="button"
                  onClick={() => openCancel(selectedBooking)}
                  className="flex-1 py-2.5 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-bold text-xs rounded-xl transition"
                >
                  {t.cancel}
                </button>
              )}
            </div>
        </Dialog>
      )}

      {/* CONFIRM CANCEL: shows what the provider's policy would keep before the command is sent */}
      {showCancelModal && selectedBooking && (() => {
        const described = describeCancel(selectedBooking);
        return (
          <CommandDialog
            locale={locale}
            tone="danger"
            title={t.confirmCancelTitle}
            intro={described.intro}
            facts={described.facts}
            effects={described.effects}
            effectsTitle={t.cancelTermsTitle}
            reasonLabel=""
            reasonRequired={false}
            confirmLabel={t.yesCancel}
            onConfirm={() => cancelBooking(selectedBooking.id)}
            onClose={() => setShowCancelModal(false)}
          />
        );
      })()}

      {/* RESCHEDULE MODAL (G21) */}
      {rescheduleBookingTarget && (
        <Dialog label={t.rescheduleTitle} onClose={() => setRescheduleBookingTarget(null)} canClose={!rescheduleLoading}>
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{t.rescheduleTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === "ar"
                    ? rescheduleBookingTarget.services?.name_ar || rescheduleBookingTarget.services?.name_en
                    : rescheduleBookingTarget.services?.name_en}
                </p>
              </div>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => setRescheduleBookingTarget(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {(() => {
              const policy = policyFromProvider(rescheduleBookingTarget.branches?.providers);
              return policy && policy.freeHours > 0
                ? <p className="text-[11px] font-medium text-gray-500">{fill(t.rescheduleNotice, { hours: String(policy.freeHours) })}</p>
                : null;
            })()}

            {rescheduleError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
                {rescheduleError}
              </div>
            )}

            <div className="space-y-4">
              {/* Date Input */}
              <div>
                <label htmlFor="reschedule-date" className="block text-xs font-bold text-gray-700 mb-1">{t.selectNewDate}</label>
                <input
                  id="reschedule-date"
                  type="date"
                  min={rescheduleMin}
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleSlot("");
                  }}
                  className="w-full text-xs font-semibold p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D1AF47]"
                />
              </div>

              {/* Time Slots */}
              <div>
                <span id="reschedule-times" className="block text-xs font-bold text-gray-700 mb-1">{t.selectNewTime}</span>
                {slotsLoading ? (
                  <p role="status" className="text-xs text-gray-400 py-3">{t.slotsLoading}</p>
                ) : slotsError ? (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <span>{rescheduleBookingTarget.employee_id ? `${t.slotsFailed} ${slotsError}` : slotsError}</span>
                    {rescheduleBookingTarget.employee_id && (
                      <button type="button" onClick={() => setSlotsRetry((n) => n + 1)} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 font-bold">{t.retry}</button>
                    )}
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">{t.noSlotsFound}</p>
                ) : (
                  <div role="group" aria-labelledby="reschedule-times" className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                    {rescheduleSlots.map((slotIso) => {
                      const timeStr = formatBookingTime(slotIso, locale);
                      const isSelected = rescheduleSlot === slotIso;
                      return (
                        <button
                          key={slotIso}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setRescheduleSlot(slotIso)}
                          className={`py-2 px-2 text-xs font-bold rounded-xl border transition ${
                            isSelected
                              ? "bg-black text-white border-black"
                              : "bg-gray-50 text-gray-800 border-gray-200 hover:border-gray-400"
                          }`}
                        >
                          {timeStr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reason Input */}
              <div>
                <label htmlFor="reschedule-reason" className="block text-xs font-bold text-gray-700 mb-1">{t.reasonOptional}</label>
                <input
                  id="reschedule-reason"
                  type="text"
                  placeholder={locale === "ar" ? "سبب إعادة الجدولة..." : "e.g. Schedule conflict..."}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D1AF47]"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleBookingTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold text-xs rounded-xl transition"
              >
                {t.close}
              </button>
              <button
                type="button"
                disabled={!rescheduleSlot || rescheduleLoading}
                onClick={handleReschedule}
                className="flex-1 py-2.5 bg-[#D1AF47] hover:bg-[#b89837] text-white font-bold text-xs rounded-xl transition disabled:opacity-50"
              >
                {rescheduleLoading ? t.rescheduling : t.confirmReschedule}
              </button>
            </div>
        </Dialog>
      )}

      {/* TAX INVOICE MODAL (G25 ZATCA) */}
      {invoiceModalTarget && invoiceData && (
        <Dialog label={t.taxInvoiceTitle} onClose={() => { setInvoiceModalTarget(null); setInvoiceData(null); }}>
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <span className="inline-block rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-800 mb-1">
                  {t.zatcaReported}
                </span>
                <h3 className="text-base font-bold text-gray-900">{t.taxInvoiceTitle}</h3>
                <p className="text-xs font-mono text-gray-500 mt-0.5">{invoiceData.invoice_number}</p>
              </div>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => {
                  setInvoiceModalTarget(null);
                  setInvoiceData(null);
                }}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs bg-gray-50/70 p-4 rounded-xl border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">{t.seller}</span>
                <span className="font-bold text-gray-900">
                  {locale === "ar"
                    ? invoiceModalTarget.branches?.providers?.business_name_ar || invoiceModalTarget.branches?.providers?.business_name_en
                    : invoiceModalTarget.branches?.providers?.business_name_en}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">{t.sellerVat}</span>
                <span className="font-mono font-bold text-gray-800" dir="ltr">{invoiceData.seller_vat_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">{t.service}</span>
                <span className="font-semibold text-gray-800">
                  {locale === "ar" ? invoiceModalTarget.services?.name_ar : invoiceModalTarget.services?.name_en}
                </span>
              </div>
              <div className="border-t border-gray-200 my-2 pt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">{t.subtotal}</span>
                  <span className="font-mono font-bold text-gray-900">
                    {Number(invoiceData.subtotal_sar).toFixed(2)} {t.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">{t.vatAmount}</span>
                  <span className="font-mono font-bold text-amber-700">
                    {Number(invoiceData.vat_amount_sar).toFixed(2)} {t.currency}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-1 border-t border-gray-200 font-black">
                  <span className="text-gray-900">{t.totalAmount}</span>
                  <span className="text-black font-mono">
                    {Number(invoiceData.total_amount_sar).toFixed(2)} {t.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code Payload display */}
            {invoiceData.zatca_qr_code && (
              <div className="border border-dashed border-gray-200 rounded-xl p-3 bg-gray-50 text-[10px] space-y-1">
                <span className="font-bold text-gray-600 block">{t.zatcaQr}:</span>
                <p className="font-mono text-gray-500 break-all line-clamp-2">{invoiceData.zatca_qr_code}</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setInvoiceModalTarget(null);
                  setInvoiceData(null);
                }}
                className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition"
              >
                {t.close}
              </button>
            </div>
        </Dialog>
      )}

      {/* DISPUTE MODAL (G33) */}
      {disputeBookingTarget && (
        <Dialog label={t.disputeTitle} onClose={() => setDisputeBookingTarget(null)} canClose={!disputeLoading}>
            <div className="flex justify-between items-start border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{t.disputeTitle}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {t.bookingRef} #{disputeBookingTarget.id.substring(0, 8)} · {sar(receiptAmounts(disputeBookingTarget).totalDue, locale)}
                </p>
              </div>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => setDisputeBookingTarget(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {disputeError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 font-semibold">
                {disputeError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="dispute-reason" className="block text-xs font-bold text-gray-700 mb-1">{t.disputeReason}</label>
                <textarea
                  id="dispute-reason"
                  rows={3}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder={t.disputeReasonPlaceholder}
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D1AF47]"
                />
              </div>
              <div>
                <label htmlFor="dispute-evidence" className="block text-xs font-bold text-gray-700 mb-1">{t.evidenceUrlOptional}</label>
                <input
                  id="dispute-evidence"
                  type="url"
                  value={disputeEvidence}
                  onChange={(e) => setDisputeEvidence(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D1AF47]"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setDisputeBookingTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-800 font-bold text-xs rounded-xl transition"
              >
                {t.close}
              </button>
              <button
                type="button"
                disabled={!disputeReason.trim() || disputeLoading}
                onClick={handleSubmitDispute}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition disabled:opacity-50"
              >
                {disputeLoading ? t.submittingDispute : t.submitDispute}
              </button>
            </div>
        </Dialog>
      )}

      {/* STAFF TIPPING MODAL (G47) */}
      {tipTarget && (
        <Dialog label={t.tipModalTitle} onClose={() => setTipTarget(null)} canClose={!tipLoading} panelClass="rounded-3xl max-w-md space-y-5">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#D1AF47] block">
                  ★ {t.tipBadge}
                </span>
                <h3 className="text-lg font-serif font-black text-gray-900">{t.tipModalTitle}</h3>
                <p className="text-xs text-gray-500 font-medium">
                  {locale === "ar"
                    ? `للأخصائي: ${tipTarget.employees?.name_ar || tipTarget.employees?.name_en || "الأخصائي"}`
                    : `Specialist: ${tipTarget.employees?.name_en || tipTarget.employees?.name_ar || "Specialist"}`}
                </p>
              </div>
              <button
                type="button"
                aria-label={t.closeDialog}
                onClick={() => setTipTarget(null)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-900 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Zero Platform Commission Guarantee Badge */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-xs text-emerald-800 font-semibold flex items-center gap-2.5">
              <span className="text-base text-emerald-600">✓</span>
              <span>{t.tipNotice}</span>
            </div>

            {tipSuccess && (
              <div className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-3 font-bold">
                {tipSuccess}
              </div>
            )}

            {tipError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 font-semibold">
                {tipError}
              </div>
            )}

            {/* Tip Amount Chips */}
            <div className="space-y-3">
              <span id="tip-amounts" className="block text-xs font-bold text-gray-700">{t.tipSelectAmount}</span>
              <div role="group" aria-labelledby="tip-amounts" className="grid grid-cols-4 gap-2">
                {[10, 20, 30, 50].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    aria-pressed={tipAmount === amt && !customTip}
                    onClick={() => {
                      setTipAmount(amt);
                      setCustomTip("");
                      setTipError("");
                    }}
                    className={`py-3 rounded-2xl text-xs font-serif font-black transition border ${
                      tipAmount === amt && !customTip
                        ? "bg-black text-white border-black shadow-sm"
                        : "bg-gray-50 text-gray-800 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {amt} ﷼
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="tip-custom" className="block text-[11px] font-bold text-gray-500 mb-1">{t.tipCustom}</label>
                <input
                  id="tip-custom"
                  type="number"
                  min="5"
                  max="1000"
                  step="1"
                  value={customTip}
                  onChange={(e) => {
                    setCustomTip(e.target.value);
                    setTipError("");
                  }}
                  className="w-full text-xs p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D1AF47] font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setTipTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl transition"
              >
                {t.close}
              </button>
              <button
                type="button"
                disabled={tipLoading || Boolean(tipSuccess)}
                onClick={handleSendTip}
                className="flex-1 py-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl transition shadow-sm disabled:opacity-50"
              >
                {tipLoading ? t.sendingTip : `${t.sendTipBtn} (${sar(Number(customTip || tipAmount), locale)})`}
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
}
