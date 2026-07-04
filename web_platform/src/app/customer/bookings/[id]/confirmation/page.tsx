"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type BookingDetail = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  total_price: number;
  deposit_required: number;
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
    };
  };
};

const translations = {
  en: {
    title: "Booking Confirmed",
    subtitle: "Thank you for choosing Primora. Your appointment details are saved below.",
    loading: "Fetching booking details...",
    notFound: "Booking not found",
    fallbackWarning: "Displaying simulated booking confirmation.",
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
    confirmed: "Confirmed",
    pending: "Pending",
    cancelled: "Cancelled",
    priceBreakdown: "Price Summary",
    totalPrice: "Total Amount",
    depositPaid: "Deposit Paid (15%)",
    dueAtVenue: "Balance Due at Venue (85%)",
    vatLine: "Includes 15% KSA VAT",
    sar: "SAR",
    addToCalendar: "Add to Calendar",
    viewBookings: "View My Bookings",
    messageShop: "Message Shop",
    backHome: "Back to Home"
  },
  ar: {
    title: "تم تأكيد الحجز",
    subtitle: "شكراً لاختيارك بريمورا. تفاصيل موعدك محفوظة أدناه.",
    loading: "جاري تحميل تفاصيل الحجز...",
    notFound: "لم يتم العثور على الحجز",
    fallbackWarning: "عرض تأكيد حجز تجريبي/محاكى.",
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
    confirmed: "مؤكد",
    pending: "معلق",
    cancelled: "ملغى",
    priceBreakdown: "ملخص السعر",
    totalPrice: "المبلغ الإجمالي",
    depositPaid: "العربون المدفوع (15%)",
    dueAtVenue: "المبلغ المتبقي في المركز (85%)",
    vatLine: "يشمل 15% ضريبة القيمة المضافة",
    sar: "ر.س",
    addToCalendar: "إضافة إلى التقويم",
    viewBookings: "عرض حجوزاتي",
    messageShop: "مراسلة المتجر",
    backHome: "العودة للرئيسية"
  }
};

export default function BookingConfirmationPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = params?.id as string;
  const statusParam = searchParams.get("status");

  const [locale, setLocale] = useState<"en" | "ar">("en");
  const t = translations[locale];

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

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

  useEffect(() => {
    async function loadBooking() {
      if (!bookingId) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("bookings")
          .select(`
            id,
            status,
            scheduled_at,
            duration_minutes,
            total_price,
            deposit_required,
            is_home_service,
            services ( id, name_en, name_ar, base_price, base_duration_minutes ),
            employees ( id, name_en, name_ar ),
            branches (
              id,
              name_en,
              name_ar,
              address_text_en,
              address_text_ar,
              providers ( id, business_name_en, business_name_ar )
            )
          `)
          .eq("id", bookingId)
          .single();

        if (error || !data) {
          throw error || new Error("No data returned");
        }

        setBooking(data as any);
        setIsFallback(false);
      } catch (err) {
        console.warn("Could not load live booking from DB. Displaying premium mock fallback.", err);
        // Premium fallback mock data
        const mockBooking: BookingDetail = {
          id: bookingId || "bk-mock-789",
          status: statusParam === "pending_payment" ? "pending_payment" : "confirmed",
          scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
          duration_minutes: 45,
          total_price: 150.00,
          deposit_required: 22.50,
          is_home_service: false,
          services: {
            id: "s-mock-1",
            name_en: "Classic Luxury Haircut & Style",
            name_ar: "قصة شعر كلاسيكية فاخرة وتصفيف",
            base_price: 150.00,
            base_duration_minutes: 45
          },
          employees: {
            id: "e-mock-1",
            name_en: "Mustafa Al-Alami",
            name_ar: "مصطفى العلمي"
          },
          branches: {
            id: "b-mock-1",
            name_en: "Elite Grooming Lounge - Branch 1",
            name_ar: "صالون النخبة للعناية - الفرع الأول",
            address_text_en: "Al-Malqa District, Riyadh",
            address_text_ar: "حي الملقا، الرياض",
            providers: {
              id: "p-mock-1",
              business_name_en: "Elite Grooming Co.",
              business_name_ar: "شركة النخبة للحلاقة"
            }
          }
        };
        setBooking(mockBooking);
        setIsFallback(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadBooking();
  }, [bookingId, statusParam]);

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
      `DESCRIPTION:${locale === "ar" ? `حجزك المؤكد مع الأخصائي ${booking.employees.name_ar}` : `Your confirmed appointment with specialist ${booking.employees.name_en}`}`,
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

  // Gregorian clean formatting per locale
  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: true,
        timeZone: "Asia/Riyadh"
      });
    } catch {
      return isoString;
    }
  };

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
          <Link href="/" className="inline-block bg-[#211A12] text-white text-xs font-bold px-6 py-3 rounded-xl transition hover:bg-black">
            {t.backHome}
          </Link>
        </div>
      </div>
    );
  }

  // Calculate pricing
  const total = Number(booking.total_price);
  const deposit = Number(booking.deposit_required);
  const balance = total - deposit;
  const vatIncluded = total * 15 / 115; // 15% VAT KSA rollup

  const isPaid = booking.status !== "pending_payment" && statusParam !== "pending_payment";

  return (
    <div className="min-h-screen bg-[#FBFAF9] text-[#211A12] py-10 px-4 flex justify-center font-sans antialiased" dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-full max-w-md space-y-6">
        
        {/* SUCCESS ICON AND HEADLINE */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-[#C29A4C]/10 border border-[#C29A4C]/20 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <svg className="w-7.5 h-7.5 text-[#C29A4C]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="font-serif text-3xl font-black tracking-tight text-[#15100A]">{t.title}</h1>
          <p className="text-xs text-[#8A7F6C] font-semibold leading-relaxed px-4">{t.subtitle}</p>
        </div>

        {/* FALLBACK BADGE */}
        {isFallback && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-2.5 text-center flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-bold text-amber-800 leading-none">{t.fallbackWarning}</span>
          </div>
        )}

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
                {formatDateTime(booking.scheduled_at)}
              </strong>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.statusLabel}</span>
                <span className={`inline-block text-[9px] font-black px-2.5 py-0.5 rounded-full mt-1.5 uppercase ${
                  booking.status === "cancelled"
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}>
                  {booking.status === "cancelled" ? t.cancelled : t.confirmed}
                </span>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#8A7F6C] block">{t.paymentLabel}</span>
                <span className={`inline-block text-[9px] font-black px-2.5 py-0.5 rounded-full mt-1.5 uppercase ${
                  isPaid
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {isPaid ? t.paid : t.pendingPayment}
                </span>
              </div>
            </div>
          </div>

          {/* FINANCIAL BREAKDOWN */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8A7F6C]">{t.priceBreakdown}</h3>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-[#211A12]/80">
                <span>{t.totalPrice}</span>
                <span className="font-serif font-black">{total.toFixed(2)} {t.sar}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-emerald-700">
                <span>{t.depositPaid}</span>
                <span className="font-serif font-black">-{deposit.toFixed(2)} {t.sar}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-[#15100A] border-t border-[#211A12]/6 pt-2">
                <span>{t.dueAtVenue}</span>
                <span className="font-serif font-black">{balance.toFixed(2)} {t.sar}</span>
              </div>
            </div>

            <div className="text-[9px] font-medium text-[#8A7F6C] bg-stone-50 border border-stone-150 rounded-lg p-2 text-center">
              {t.vatLine} ({vatIncluded.toFixed(2)} {t.sar})
            </div>
          </div>

        </div>

        {/* PRIMARY AND SECONDARY ACTIONS */}
        <div className="space-y-3">
          <button
            onClick={downloadICS}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C29A4C] to-[#E6C679] py-3 text-center text-xs font-black text-[#15100A] shadow-md shadow-[#C29A4C]/15 transition hover:brightness-105"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span>{t.addToCalendar}</span>
          </button>

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
