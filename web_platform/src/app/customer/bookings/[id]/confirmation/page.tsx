"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { sar } from "@/components/operations-ui";
import MakeRegularButton from "@/components/make-regular";
import IntakeLink from "@/components/intake-link";
import {
  receiptAmounts, bookingStatusKey, bookingStatusTone, settlementKey, policyFromProvider, policySentences,
  formatBookingDateTime, isSuccessfulBooking,
} from "@/lib/booking-display.mjs";

// While a booking waits for the payment webhook the receipt re-reads it every 3 seconds, for at most one minute.
const POLL_INTERVAL_MS = 3000;
const POLL_LIMIT = 20;

const BOOKING_SELECT = `
  id,
  status,
  scheduled_at,
  duration_minutes,
  subtotal_price,
  discount_amount,
  tax_amount,
  total_price,
  deposit_required,
  gift_card_amount,
  cancellation_fee,
  refund_amount,
  is_home_service,
  services ( id, name_en, name_ar, base_price, base_duration_minutes ),
  employees ( id, name_en, name_ar ),
  branches (
    id,
    name_en,
    name_ar,
    address_text_en,
    address_text_ar,
    providers ( id, business_name_en, business_name_ar, deposit_percentage, free_cancellation_hours, late_cancellation_fee_percent, no_show_fee_percent )
  )
`;

type BookingDetail = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  subtotal_price: number | null;
  discount_amount: number;
  tax_amount: number;
  total_price: number;
  deposit_required: number;
  gift_card_amount: number;
  cancellation_fee: number;
  refund_amount: number;
  is_home_service: boolean;
  services: {
    id: string;
    name_en: string;
    name_ar: string;
    base_price: number;
    base_duration_minutes: number;
  };
  employees: {
    id: string;
    name_en: string;
    name_ar: string;
  };
  branches: {
    id: string;
    name_en: string;
    name_ar: string;
    address_text_en: string;
    address_text_ar: string;
    providers: {
      id: string;
      business_name_en: string;
      business_name_ar: string;
      deposit_percentage: number | null;
      free_cancellation_hours: number | null;
      late_cancellation_fee_percent: number | null;
      no_show_fee_percent: number | null;
    };
  };
};

const translations = {
  en: {
    title: "Booking Confirmed",
    subtitle: "Thank you for choosing Primora. Your appointment details are saved below.",
    titleCompleted: "Visit Completed",
    subtitleCompleted: "This visit is complete. Your receipt is below.",
    titleCancelled: "Booking Cancelled",
    subtitleCancelled: "This booking was cancelled. What was kept and what comes back to you is shown below.",
    titleNoShow: "Marked as No-Show",
    subtitleNoShow: "The provider marked this visit as a no-show. What was kept and what comes back to you is shown below.",
    titleUnknown: "Booking Receipt",
    subtitleUnknown: "The status of this booking is not one this page recognises. Check My Bookings.",
    loading: "Fetching booking details...",
    notFound: "Booking not found",
    loadFailed: "We could not load this booking right now. Your booking is not affected; check My Bookings or try again.",
    titlePending: "Awaiting Payment",
    subtitlePending: "Your time is held. Complete the payment to confirm the appointment.",
    serviceLabel: "Service",
    venueLabel: "Venue & Shop",
    specialistLabel: "Specialist",
    dateTimeLabel: "Date & Time",
    typeLabel: "Service Type",
    homeService: "Home Service",
    salonService: "In-Salon Service",
    duration: "Duration",
    minutes: "mins",
    statusLabel: "Booking Status",
    paymentLabel: "Payment Status",
    paid: "Paid",
    pendingPayment: "Pending Payment",
    statusConfirmed: "Confirmed",
    statusCompleted: "Completed",
    statusCancelled: "Cancelled",
    statusNoShow: "No-show",
    statusUnknown: "Unknown",
    notRequired: "No payment due",
    refunded: "Refunded",
    partlyRefunded: "Partly refunded",
    feeKept: "Fee kept",
    noCharge: "No charge",
    priceBreakdown: "Price Summary",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    totalPrice: "Total incl. VAT",
    depositPaid: "Deposit paid",
    depositDue: "Deposit due now",
    giftCard: "Gift card",
    dueAtVenue: "Balance due at the venue",
    cancellationFee: "Cancellation fee kept",
    refundAmount: "Refund to you",
    policyTitle: "Cancellation & No-Show Terms",
    policyUnavailable: "The provider's cancellation terms could not be loaded.",
    payNow: "Pay deposit now",
    paying: "Opening payment...",
    payFailed: "Could not open the payment page. Nothing was charged; try again.",
    waiting: "Checking for your payment...",
    stillWaiting: "We have not received the payment confirmation yet. If you already paid it can take a minute.",
    refresh: "Refresh status",
    refreshFailed: "Could not refresh the booking right now.",
    addToCalendar: "Add to Calendar",
    viewBookings: "View My Bookings",
    messageShop: "Message Shop",
    backHome: "Back to Home"
  },
  ar: {
    title: "تم تأكيد الحجز",
    subtitle: "شكراً لاختيارك بريمورا. تفاصيل موعدك محفوظة أدناه.",
    titleCompleted: "اكتملت الزيارة",
    subtitleCompleted: "اكتملت هذه الزيارة. إيصالك أدناه.",
    titleCancelled: "تم إلغاء الحجز",
    subtitleCancelled: "أُلغي هذا الحجز. يظهر أدناه ما تم استقطاعه وما يعود إليك.",
    titleNoShow: "سُجّل كعدم حضور",
    subtitleNoShow: "سجّل مقدم الخدمة هذه الزيارة كعدم حضور. يظهر أدناه ما تم استقطاعه وما يعود إليك.",
    titleUnknown: "إيصال الحجز",
    subtitleUnknown: "حالة هذا الحجز غير معروفة لهذه الصفحة. راجع حجوزاتي.",
    loading: "جاري تحميل تفاصيل الحجز...",
    notFound: "لم يتم العثور على الحجز",
    loadFailed: "تعذر تحميل هذا الحجز الآن. حجزك لم يتأثر؛ راجع حجوزاتي أو حاول مرة أخرى.",
    titlePending: "بانتظار الدفع",
    subtitlePending: "تم حجز الموعد مؤقتاً. أكمل الدفع لتأكيد الموعد.",
    serviceLabel: "الخدمة",
    venueLabel: "الموقع والمتجر",
    specialistLabel: "الأخصائي",
    dateTimeLabel: "التاريخ والوقت",
    typeLabel: "نوع الخدمة",
    homeService: "خدمة منزلية",
    salonService: "في الصالون",
    duration: "المدة",
    minutes: "دقيقة",
    statusLabel: "حالة الحجز",
    paymentLabel: "حالة الدفع",
    paid: "مدفوع",
    pendingPayment: "في انتظار الدفع",
    statusConfirmed: "مؤكد",
    statusCompleted: "مكتمل",
    statusCancelled: "ملغى",
    statusNoShow: "لم يحضر",
    statusUnknown: "غير معروف",
    notRequired: "لا يوجد مبلغ مستحق",
    refunded: "تم الاسترداد",
    partlyRefunded: "استرداد جزئي",
    feeKept: "تم استقطاع الرسم",
    noCharge: "بدون رسوم",
    priceBreakdown: "ملخص السعر",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    totalPrice: "الإجمالي شامل الضريبة",
    depositPaid: "العربون المدفوع",
    depositDue: "العربون المستحق الآن",
    giftCard: "بطاقة الهدية",
    dueAtVenue: "المتبقي المستحق في المركز",
    cancellationFee: "رسم الإلغاء المستقطع",
    refundAmount: "المبلغ المسترد إليك",
    policyTitle: "سياسة الإلغاء وعدم الحضور",
    policyUnavailable: "تعذر تحميل سياسة الإلغاء الخاصة بمقدم الخدمة.",
    payNow: "ادفع العربون الآن",
    paying: "جارٍ فتح صفحة الدفع...",
    payFailed: "تعذر فتح صفحة الدفع. لم يُخصم أي مبلغ؛ حاول مرة أخرى.",
    waiting: "جارٍ التحقق من دفعتك...",
    stillWaiting: "لم يصلنا تأكيد الدفع بعد. إذا كنت قد دفعت فقد يستغرق ذلك دقيقة.",
    refresh: "تحديث الحالة",
    refreshFailed: "تعذر تحديث الحجز الآن.",
    addToCalendar: "إضافة إلى التقويم",
    viewBookings: "عرض حجوزاتي",
    messageShop: "مراسلة المتجر",
    backHome: "العودة للرئيسية"
  }
};

export default function BookingConfirmationPage() {
  const params = useParams();
  const bookingId = params?.id as string;

  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshError, setRefreshError] = useState(false);
  const [polls, setPolls] = useState(0);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  // Synchronize language with HTML element attribute
  useEffect(() => {
    const savedLang = localStorage.getItem("primora_lang") as "en" | "ar";
    if (savedLang === "en" || savedLang === "ar") {
      setLocale(savedLang);
    }

    const sync = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const fetchBooking = useCallback(async () => {
    const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).eq("id", bookingId).single();
    if (error || !data) {
      throw error || new Error("No data returned");
    }
    return data as unknown as BookingDetail;
  }, [bookingId]);

  // A quiet re-read keeps the last good receipt on screen and only flags that the refresh failed.
  const refreshQuietly = useCallback(async () => {
    try {
      setBooking(await fetchBooking());
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    }
  }, [fetchBooking]);

  useEffect(() => {
    let active = true;
    async function loadBooking() {
      if (!bookingId) {
        setIsLoading(false);
        return;
      }
      try {
        const loaded = await fetchBooking();
        if (!active) return;
        setBooking(loaded);
        setLoadError("");
      } catch (err) {
        if (!active) return;
        setBooking(null);
        setLoadError(errorMessage(err));
      } finally {
        if (active) setIsLoading(false);
      }
    }
    loadBooking();
    return () => {
      active = false;
    };
  }, [bookingId, fetchBooking]);

  // The payment webhook confirms the booking after the Tap redirect; poll every 3 s for up to a minute while it is pending.
  const awaitingPayment = booking?.status === "pending_payment";
  useEffect(() => {
    if (!awaitingPayment || polls >= POLL_LIMIT) return;
    const timer = window.setTimeout(() => {
      setPolls((n) => n + 1);
      void refreshQuietly();
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingPayment, polls, refreshQuietly]);

  const payNow = async () => {
    setPayError("");
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-checkout", { body: { bookingId } });
      if (error || !data?.checkoutUrl) throw new Error("no checkout url");
      window.location.assign(data.checkoutUrl);
    } catch {
      setPayError(t.payFailed);
      setPaying(false);
    }
  };

  const refreshNow = () => {
    setPolls(0);
    void refreshQuietly();
  };

  const downloadICS = () => {
    if (!booking) return;
    const startDate = new Date(booking.scheduled_at);
    const duration = booking.duration_minutes || 45;
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const serviceName = locale === "ar" ? booking.services.name_ar : booking.services.name_en;
    const branchName = locale === "ar" ? booking.branches.name_ar : booking.branches.name_en;
    const providerName = locale === "ar" ? booking.branches.providers.business_name_ar : booking.branches.providers.business_name_en;

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Primora Booking//EN",
      "BEGIN:VEVENT",
      `UID:${booking.id}`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${serviceName} - ${providerName}`,
      `DESCRIPTION:${locale === "ar" ? `موعدك مع الأخصائي ${booking.employees.name_ar}` : `Your appointment with specialist ${booking.employees.name_en}`}`,
      `LOCATION:${branchName}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `primora-booking-${booking.id}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isRTL = locale === "ar";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#C29A4C] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-black tracking-widest text-[#8A7F6C] uppercase">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="font-serif text-2xl font-black text-[#211A12]">{t.notFound}</h2>
          {loadError && <p className="text-xs text-[#8A7F6C]">{t.loadFailed} ({loadError})</p>}
          <Link href="/" className="inline-block bg-[#211A12] text-white text-xs font-bold px-6 py-3 rounded-xl transition hover:bg-black">
            {t.backHome}
          </Link>
        </div>
      </div>
    );
  }

  // The database row is the source of truth for every figure and for the status; nothing here is a literal.
  const amounts = receiptAmounts(booking);
  const statusKey = bookingStatusKey(booking.status);
  const tone = bookingStatusTone(statusKey);
  const settlement = settlementKey(booking);
  const policy = policyFromProvider(booking.branches?.providers);
  const isPending = statusKey === "pending_payment";
  const isClosed = statusKey === "cancelled" || statusKey === "no_show";
  const headlines = {
    pending_payment: [t.titlePending, t.subtitlePending],
    confirmed: [t.title, t.subtitle],
    completed: [t.titleCompleted, t.subtitleCompleted],
    cancelled: [t.titleCancelled, t.subtitleCancelled],
    no_show: [t.titleNoShow, t.subtitleNoShow],
    unknown: [t.titleUnknown, t.subtitleUnknown],
  }[statusKey];
  const statusLabels = {
    pending_payment: t.pendingPayment, confirmed: t.statusConfirmed, completed: t.statusCompleted,
    cancelled: t.statusCancelled, no_show: t.statusNoShow, unknown: t.statusUnknown,
  };
  const settlementLabels = {
    pending: t.pendingPayment, paid: t.paid, not_required: t.notRequired, refunded: t.refunded,
    partly_refunded: t.partlyRefunded, fee_kept: t.feeKept, no_charge: t.noCharge,
  };
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    sky: "bg-sky-50 text-sky-700 border border-sky-200",
    stone: "bg-stone-100 text-stone-700 border border-stone-200",
  };
  const settlementTone = settlement === "paid" || settlement === "not_required" || settlement === "refunded" || settlement === "no_charge"
    ? "emerald" : settlement === "pending" || settlement === "partly_refunded" ? "amber" : "red";
  const iconPath = isSuccessfulBooking(statusKey)
    ? "M4.5 12.75l6 6 9-13.5"
    : isPending ? "M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" : "M6 18L18 6M6 6l12 12";

  return (
    <div className="min-h-screen bg-[#FBFAF9] text-[#211A12] py-10 px-4 flex justify-center font-sans antialiased" dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-full max-w-md space-y-6">
        
        {/* SUCCESS ICON AND HEADLINE */}
        <div className="text-center space-y-3">
          <div className={`w-16 h-16 border rounded-full flex items-center justify-center mx-auto shadow-sm ${isClosed ? "bg-red-50 border-red-200 text-red-700" : "bg-[#C29A4C]/10 border-[#C29A4C]/20 text-[#C29A4C]"}`}>
            <svg className="w-7.5 h-7.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-black tracking-tight text-[#15100A]">{headlines[0]}</h1>
          <p className="text-xs text-[#8A7F6C] font-semibold leading-relaxed px-4">{headlines[1]}</p>
        </div>

        {/* RECEIPT SUMMARY CARD */}
        <div className="bg-white border border-[#211A12]/8 rounded-2xl p-5 shadow-sm space-y-5">
          
          {/* APPOINTMENT KEY DETAILS */}
          <div className="space-y-4 border-b border-[#211A12]/8 pb-5">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.serviceLabel}</span>
              <strong className="text-sm font-bold text-[#15100A] mt-0.5 block">
                {locale === "ar" ? booking.services.name_ar : booking.services.name_en}
              </strong>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.venueLabel}</span>
              <strong className="text-xs font-bold text-[#211A12] mt-0.5 block">
                {locale === "ar" ? booking.branches.providers.business_name_ar : booking.branches.providers.business_name_en}
              </strong>
              <span className="text-[10px] font-medium text-[#8A7F6C] block mt-0.5">
                {locale === "ar" ? booking.branches.name_ar : booking.branches.name_en}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.specialistLabel}</span>
                <strong className="text-xs font-bold text-[#211A12] mt-0.5 block">
                  {locale === "ar" ? booking.employees.name_ar : booking.employees.name_en}
                </strong>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.duration}</span>
                <strong className="text-xs font-bold text-[#211A12] mt-0.5 block">
                  {booking.duration_minutes || booking.services.base_duration_minutes} {t.minutes}
                </strong>
              </div>
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.dateTimeLabel}</span>
              <strong className="text-xs font-bold text-[#211A12] mt-0.5 block">
                {formatBookingDateTime(booking.scheduled_at, locale)}
              </strong>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.statusLabel}</span>
                <span className={`inline-block text-[9px] font-black px-2.5 py-0.5 rounded-full mt-1.5 uppercase ${toneClasses[tone]}`}>
                  {statusLabels[statusKey]}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.paymentLabel}</span>
                <span className={`inline-block text-[9px] font-black px-2.5 py-0.5 rounded-full mt-1.5 uppercase ${toneClasses[settlementTone]}`}>
                  {settlementLabels[settlement]}
                </span>
              </div>
            </div>
          </div>

          {/* FINANCIAL BREAKDOWN */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.priceBreakdown}</h3>
            
            <dl className="space-y-2">
              {amounts.discount > 0 && (
                <div className="flex justify-between text-xs font-semibold text-[#211A12]/80">
                  <dt>{t.subtotal}</dt>
                  <dd className="font-serif font-black">{sar(amounts.subtotal, locale)}</dd>
                </div>
              )}
              {amounts.discount > 0 && (
                <div className="flex justify-between text-xs font-semibold text-emerald-700">
                  <dt>{t.discount}</dt>
                  <dd className="font-serif font-black">-{sar(amounts.discount, locale)}</dd>
                </div>
              )}
              <div className="flex justify-between text-xs font-semibold text-[#211A12]/80">
                <dt>{t.vat}</dt>
                <dd className="font-serif font-black">{sar(amounts.vat, locale)}</dd>
              </div>
              <div className="flex justify-between text-xs font-semibold text-[#211A12]/80">
                <dt>{t.totalPrice}</dt>
                <dd className="font-serif font-black">{sar(amounts.totalDue, locale)}</dd>
              </div>
              {amounts.giftCard > 0 && (
                <div className="flex justify-between text-xs font-semibold text-emerald-700">
                  <dt>{t.giftCard}</dt>
                  <dd className="font-serif font-black">-{sar(amounts.giftCard, locale)}</dd>
                </div>
              )}
              {amounts.deposit > 0 && !isClosed && (
                <div className="flex justify-between text-xs font-semibold text-emerald-700">
                  <dt>{isPending ? t.depositDue : t.depositPaid}</dt>
                  <dd className="font-serif font-black">{isPending ? "" : "-"}{sar(amounts.deposit, locale)}</dd>
                </div>
              )}
              {!isClosed && (
                <div className="flex justify-between text-sm font-black text-[#15100A] border-t border-[#211A12]/6 pt-2">
                  <dt>{t.dueAtVenue}</dt>
                  <dd className="font-serif font-black">{sar(amounts.balanceAtVenue, locale)}</dd>
                </div>
              )}
              {isClosed && Number(booking.cancellation_fee) > 0 && (
                <div className="flex justify-between text-sm font-black text-red-700 border-t border-[#211A12]/6 pt-2">
                  <dt>{t.cancellationFee}</dt>
                  <dd className="font-serif font-black">{sar(Number(booking.cancellation_fee), locale)}</dd>
                </div>
              )}
              {isClosed && Number(booking.refund_amount) > 0 && (
                <div className="flex justify-between text-sm font-black text-emerald-700">
                  <dt>{t.refundAmount}</dt>
                  <dd className="font-serif font-black">{sar(Number(booking.refund_amount), locale)}</dd>
                </div>
              )}
            </dl>

            {/* CANCELLATION & NO-SHOW POLICY (G10): the provider's own numbers */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-1.5 text-[10px] text-amber-900">
              <span className="font-bold block">{t.policyTitle}</span>
              {policy ? (
                <ul className="text-amber-800 leading-relaxed font-medium list-disc ps-4 space-y-0.5">
                  {policySentences(policy, locale).map((sentence) => <li key={sentence}>{sentence}</li>)}
                </ul>
              ) : (
                <p className="text-amber-800 leading-relaxed font-medium">{t.policyUnavailable}</p>
              )}
            </div>
          </div>

        </div>

        {/* PRIMARY AND SECONDARY ACTIONS */}
        <div className="space-y-3">
          {isPending && (
            <div className="space-y-2" aria-live="polite">
              <button
                type="button"
                onClick={payNow}
                disabled={paying}
                className="w-full rounded-xl bg-[#211A12] py-3 text-center text-xs font-black text-white shadow-md transition hover:bg-black focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-60"
              >
                {paying ? t.paying : `${t.payNow} (${sar(amounts.deposit, locale)})`}
              </button>
              {payError && <p role="alert" className="text-center text-[11px] font-semibold text-red-700">{payError}</p>}
              {refreshError && <p role="alert" className="text-center text-[11px] font-semibold text-red-700">{t.refreshFailed}</p>}
              {polls < POLL_LIMIT ? (
                <p className="text-center text-[11px] font-semibold text-[#8A7F6C]">{t.waiting}</p>
              ) : (
                <div className="space-y-1.5 text-center">
                  <p className="text-[11px] font-semibold text-[#8A7F6C]">{t.stillWaiting}</p>
                  <button type="button" onClick={refreshNow} className="rounded-lg border border-[#211A12]/10 bg-white px-4 py-2 text-[11px] font-bold text-[#211A12] focus-visible:outline-2 focus-visible:outline-[#9B7928]">
                    {t.refresh}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isClosed && (
          <button
            type="button"
            onClick={downloadICS}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C29A4C] to-[#E6C679] py-3 text-center text-xs font-black text-[#15100A] shadow-md shadow-[#C29A4C]/15 transition hover:brightness-105"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span>{t.addToCalendar}</span>
          </button>
          )}

          <IntakeLink bookingId={booking.id} status={booking.status} className="block w-full rounded-xl border border-[#C29A4C]/40 bg-white py-3 text-center text-xs font-black text-[#6B4F17] transition hover:bg-[#F8F3E4]" />

          <MakeRegularButton booking={booking} className="w-full rounded-xl border border-[#C29A4C]/40 bg-white py-3 text-center text-xs font-black text-[#6B4F17] transition hover:bg-[#F8F3E4]" />

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/customer/bookings"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#211A12]/8 bg-white py-3 text-center text-xs font-bold text-[#211A12] transition hover:bg-[#211A12]/4"
            >
              <span>{t.viewBookings}</span>
            </Link>

            <Link
              href="/customer/messages"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-[#211A12]/8 bg-white py-3 text-center text-xs font-bold text-[#211A12] transition hover:bg-[#211A12]/4"
            >
              <span>{t.messageShop}</span>
            </Link>
          </div>

          <Link
            href="/"
            className="block text-center text-[10px] font-black uppercase tracking-widest text-[#8A7F6C] hover:text-[#211A12] transition pt-2"
          >
            {t.backHome}
          </Link>
        </div>

      </div>
    </div>
  );
}
