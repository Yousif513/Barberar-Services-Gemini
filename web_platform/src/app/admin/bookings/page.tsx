"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Global Bookings Ledger",
    subtitle: "Audit active client scheduling logs, platform split captures, and status indicators.",
    loading: "Loading booking sheets...",
    bookingDetails: "Booking Details",
    clientCustomer: "Client / Customer",
    providerBranch: "Provider / Branch",
    capturedPrice: "Captured Price",
    commShare: "Comm. (15%)",
    status: "Status",
    guest: "Guest",
    independent: "Independent",
    directStaff: "Direct Staff",
    invoiceTitle: "Tax Invoice",
    invoiceNo: "Invoice No",
    vatNo: "VAT Number",
    issueDate: "Issue Date",
    printInvoice: "Print Invoice",
    subtotal: "Subtotal",
    vatAmount: "VAT (15%)",
    totalAmount: "Total (incl. VAT)",
    zatcaCompliance: "ZATCA e-Invoicing Compliance QR Code",
    payoutStatus: "Payout Status",
    close: "Close"
  },
  ar: {
    title: "سجل الحجوزات العام",
    subtitle: "تدقيق سجلات الحجوزات النشطة للعملاء، وتقسيم المبالغ المستلمة، ومؤشرات الحالة.",
    loading: "جاري تحميل كشوفات الحجوزات...",
    bookingDetails: "تفاصيل الحجز",
    clientCustomer: "العميل",
    providerBranch: "المزود / الفرع",
    capturedPrice: "المبلغ المقبوض",
    commShare: "رسوم المنصة (15%)",
    status: "الحالة",
    guest: "زائر",
    independent: "مستقل",
    directStaff: "أخصائي مباشر",
    invoiceTitle: "فاتورة ضريبية مبسطة",
    invoiceNo: "رقم الفاتورة",
    vatNo: "الرقم الضريبي",
    issueDate: "تاريخ الإصدار",
    printInvoice: "طباعة الفاتورة",
    subtotal: "المجموع الفرعي",
    vatAmount: "ضريبة القيمة المضافة (١٥٪)",
    totalAmount: "الإجمالي (شامل الضريبة)",
    zatcaCompliance: "رمز الاستجابة السريع لفوترة هيئة الزكاة والضريبة والجمارك",
    payoutStatus: "حالة الدفع",
    close: "إغلاق"
  }
};

const generateZatcaQrBase64 = (seller: string, vatNo: string, timeStr: string, totalStr: string, vatStr: string) => {
  try {
    const encodeTlv = (tag: number, val: string) => {
      const encoder = new TextEncoder();
      const valBytes = encoder.encode(val);
      const tagByte = tag;
      const lenByte = valBytes.length;
      
      const bytes = new Uint8Array(2 + valBytes.length);
      bytes[0] = tagByte;
      bytes[1] = lenByte;
      bytes.set(valBytes, 2);
      return bytes;
    };
    
    const t1 = encodeTlv(1, seller);
    const t2 = encodeTlv(2, vatNo);
    const t3 = encodeTlv(3, timeStr);
    const t4 = encodeTlv(4, totalStr);
    const t5 = encodeTlv(5, vatStr);
    
    const totalLength = t1.length + t2.length + t3.length + t4.length + t5.length;
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    [t1, t2, t3, t4, t5].forEach(t => {
      merged.set(t, offset);
      offset += t.length;
    });
    
    let binary = "";
    for (let i = 0; i < merged.length; i++) {
      binary += String.fromCharCode(merged[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error("ZATCA QR Generation error:", err);
    return "";
  }
};

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);

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
    totalVolume: lang === "ar" ? "إجمالي الحجم المالي" : "Total Volume",
    platformRevenue: lang === "ar" ? "إيرادات المنصة" : "Platform Revenue",
    activeBookings: lang === "ar" ? "الحجوزات النشطة" : "Active Bookings"
  };

  useEffect(() => {
    async function loadGlobalBookings() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("bookings")
          .select(`
            id,
            scheduled_at,
            status,
            total_price,
            platform_commission,
            tax_amount,
            customer:profiles( first_name, last_name ),
            branches( name_en, name_ar, providers( business_name_en, business_name_ar ) )
          `)
          .order("scheduled_at", { ascending: false });

        if (data && data.length > 0) {
          setBookings(data);
        } else {
          setBookings([
            {
              id: "b-mock-1",
              scheduled_at: new Date(Date.now() + 86400000).toISOString(),
              status: "confirmed",
              total_price: 120.00,
              platform_commission: 18.00,
              tax_amount: 15.65,
              customer: { first_name: "يوسف", last_name: "الكمبيوتر" },
              branches: { name_en: "Al-Malqa Branch", name_ar: "فرع الملقا", providers: { business_name_en: "Elite Barber Lounge", business_name_ar: "صالون إيليت الرجالي" } }
            },
            {
              id: "b-mock-2",
              scheduled_at: new Date(Date.now() - 86400000).toISOString(),
              status: "completed",
              total_price: 250.00,
              platform_commission: 37.50,
              tax_amount: 32.60,
              customer: { first_name: "سارة", last_name: "آل سعود" },
              branches: { name_en: "Olaya Spa", name_ar: "سبا العليا", providers: { business_name_en: "Sara Beauty Salon", business_name_ar: "صالون وسبا سارة للتجميل" } }
            },
            {
              id: "b-mock-3",
              scheduled_at: new Date(Date.now() - 172800000).toISOString(),
              status: "pending_payment",
              total_price: 300.00,
              platform_commission: 45.00,
              tax_amount: 39.13,
              customer: { first_name: "محمد", last_name: "العتيبي" },
              branches: { name_en: "Al-Yasmin Resort", name_ar: "منتجع الياسمين الصحي", providers: { business_name_en: "Riyadh Premium Spa", business_name_ar: "سبا الرياض الفاخر للعناية" } }
            }
          ]);
        }
      } catch (err) {
        console.warn("Offline global bookings warning:", err);
      } finally {
        setLoading(false);
      }
    }
    loadGlobalBookings();
  }, [lang]);

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Calculate summary metrics
  const totalVolume = bookings.reduce((sum, b) => sum + (parseFloat(b.total_price) || 0), 0);
  const platformRevenue = bookings.reduce((sum, b) => sum + (parseFloat(b.platform_commission) || (b.total_price * 0.15)), 0);
  const activeCount = bookings.filter(b => b.status === "confirmed" || b.status === "pending_payment").length;

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  // ZATCA invoice metrics for the selected item
  const invoiceData = useMemo(() => {
    if (!selectedBooking) return null;
    const b = selectedBooking;
    const providerName = isRTL 
      ? b.branches?.providers?.business_name_ar || b.branches?.providers?.business_name_en || t.independent
      : b.branches?.providers?.business_name_en || b.branches?.providers?.business_name_ar || t.independent;
    
    const vatNo = "310123456700003"; // Standard mock KSA VAT ID
    const timeStr = b.scheduled_at;
    const price = Number(b.total_price || 0);
    const tax = Number(b.tax_amount || (price * 0.15 / 1.15));
    const subtotal = price - tax;
    
    const qrBase64 = generateZatcaQrBase64(
      providerName,
      vatNo,
      timeStr,
      price.toFixed(2),
      tax.toFixed(2)
    );

    return {
      providerName,
      vatNo,
      timeStr,
      subtotal,
      tax,
      total: price,
      qrBase64
    };
  }, [selectedBooking, isRTL, t.independent]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <div>
          <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {t.title}
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.subtitle}
          </p>
        </div>
      </div>

      {/* Summary KPI Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Total Volume */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalVolume}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
              $
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {totalVolume.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>

        {/* KPI 2: Platform Commission */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.platformRevenue}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
              %
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">
            {platformRevenue.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
          </strong>
        </div>

        {/* KPI 3: Active Bookings */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.activeBookings}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {activeCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bookingDetails}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.clientCustomer}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerBranch}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.capturedPrice}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.commShare}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.status}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : (
                bookings.map((b: any) => {
                  const dateStr = new Date(b.scheduled_at).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <tr 
                      key={b.id} 
                      onClick={() => setSelectedBooking(b)}
                      className="hover:bg-gray-50/60 cursor-pointer transition duration-150"
                    >
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">{dateStr}</p>
                        <p className="text-[9px] text-gray-400 font-semibold mt-1">ID: {b.id.substring(0, 8)}...</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">
                          {b.customer?.first_name || t.guest} {b.customer?.last_name || ""}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">
                          {isRTL 
                            ? b.branches?.providers?.business_name_ar || b.branches?.providers?.business_name_en || t.independent
                            : b.branches?.providers?.business_name_en || b.branches?.providers?.business_name_ar || t.independent
                          }
                        </p>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5">
                          {isRTL ? b.branches?.name_ar || b.branches?.name_en : b.branches?.name_en || b.branches?.name_ar}
                        </p>
                      </td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">
                        {b.total_price} {lang === "ar" ? "ريال" : "SAR"}
                      </td>
                      <td className="py-4 px-6 font-serif font-black text-amber-700">
                        {(parseFloat(b.platform_commission) || (b.total_price * 0.15)).toFixed(2)} {lang === "ar" ? "ريال" : "SAR"}
                      </td>
                      <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${
                          b.status === "confirmed"
                            ? "bg-[#ECFDF3] text-[#16A34A]"
                            : b.status === "completed"
                            ? "bg-gray-100 text-gray-600"
                            : b.status === "pending_payment"
                            ? "bg-[#FFFAEB] text-[#F59E0B]"
                            : "bg-[#FEF3F2] text-[#EF4444]"
                        }`}>
                          {lang === "ar" ? (
                            b.status === "confirmed" ? "مؤكد" : b.status === "completed" ? "مكتمل" : b.status === "pending_payment" ? "انتظار الدفع" : "ملغى / مسترد"
                          ) : (
                            b.status.replace("_", " ")
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice slide-over drawer / modal */}
      {selectedBooking && invoiceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-[#ECECEC] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)] flex flex-col justify-between max-h-[90vh] overflow-y-auto">
            <div>
              {/* Header */}
              <div className={`flex items-start justify-between gap-4 pb-4 border-b border-[#ECECEC] ${flip}`}>
                <div>
                  <h3 className="text-lg font-serif font-black text-gray-900">{t.invoiceTitle}</h3>
                  <p className="text-[10px] text-gray-400 font-semibold mt-1">ID: {selectedBooking.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedBooking(null)}
                  className="rounded-full border border-[#ECECEC] px-3 py-1 text-xs font-bold text-gray-500 hover:border-[#D1AF47]/40 hover:text-[#D1AF47]"
                >
                  {t.close}
                </button>
              </div>

              {/* Invoice Specs */}
              <div className="my-5 space-y-4 text-xs font-semibold text-gray-700">
                <div className={`flex justify-between ${flip}`}>
                  <span className="text-gray-400">{t.invoiceNo}</span>
                  <span className="font-mono font-bold text-gray-900">INV-2026-{selectedBooking.id.substring(0, 6).toUpperCase()}</span>
                </div>
                <div className={`flex justify-between ${flip}`}>
                  <span className="text-gray-400">{t.issueDate}</span>
                  <span className="text-gray-900">{new Date(invoiceData.timeStr).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>
                </div>
                <div className={`flex justify-between ${flip}`}>
                  <span className="text-gray-400">{t.clientCustomer}</span>
                  <span className="text-gray-900 font-bold">
                    {selectedBooking.customer?.first_name || t.guest} {selectedBooking.customer?.last_name || ""}
                  </span>
                </div>
                <div className={`flex justify-between ${flip}`}>
                  <span className="text-gray-400">{t.providerBranch}</span>
                  <span className="text-gray-900 font-bold">{invoiceData.providerName}</span>
                </div>
                <div className={`flex justify-between ${flip}`}>
                  <span className="text-gray-400">{t.vatNo}</span>
                  <span className="font-mono text-gray-900">{invoiceData.vatNo}</span>
                </div>

                <div className="h-px bg-[#ECECEC]" />

                {/* Pricing Split */}
                <div className="space-y-2 pt-2">
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-400">{t.subtotal}</span>
                    <span className="font-mono text-gray-900">{invoiceData.subtotal.toFixed(2)} SAR</span>
                  </div>
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-400">{t.vatAmount}</span>
                    <span className="font-mono text-gray-900">{invoiceData.tax.toFixed(2)} SAR</span>
                  </div>
                  <div className={`flex justify-between font-bold text-sm pt-2 border-t border-[#ECECEC] ${flip}`}>
                    <span className="text-gray-900">{t.totalAmount}</span>
                    <span className="font-mono text-gray-900 text-[#9A7211]">{invoiceData.total.toFixed(2)} SAR</span>
                  </div>
                </div>

                {/* ZATCA QR Compliant Section */}
                <div className="border border-[#ECECEC] rounded-2xl p-4 bg-gray-50/50 flex flex-col items-center justify-center space-y-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#667085] text-center block">
                    {t.zatcaCompliance}
                  </span>
                  
                  {invoiceData.qrBase64 ? (
                    <div className="p-2 bg-white rounded-xl border border-[#ECECEC] shadow-inner">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(invoiceData.qrBase64)}`} 
                        alt="ZATCA Compliance QR Code"
                        className="w-32 h-32"
                      />
                    </div>
                  ) : (
                    <span className="text-red-500 text-[10px]">QR Code unavailable</span>
                  )}
                  
                  <span className="text-[8px] font-mono text-gray-400 text-center break-all block max-w-xs">
                    Base64: {invoiceData.qrBase64.slice(0, 36)}...
                  </span>
                </div>
              </div>
            </div>

            {/* Print trigger */}
            <div className="mt-6 pt-4 border-t border-[#ECECEC] flex gap-3">
              <button 
                onClick={() => window.print()}
                className="w-full py-3 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-black text-xs uppercase tracking-wider rounded-xl transition shadow-[0_4px_12px_rgba(209,175,71,0.2)]"
              >
                {t.printInvoice}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
