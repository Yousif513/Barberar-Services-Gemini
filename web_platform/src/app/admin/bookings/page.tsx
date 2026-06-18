"use client";

import React, { useState, useEffect } from "react";
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
    directStaff: "Direct Staff"
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
    directStaff: "أخصائي مباشر"
  }
};

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    totalVolume: lang === "ar" ? "إجمالي الحجم المالي" : "Total Volume",
    platformRevenue: lang === "ar" ? "إيرادات المنصة" : "Platform Revenue",
    activeBookings: lang === "ar" ? "الحجوزات النشطة" : "Active Bookings"
  };

  useEffect(() => {
    async function loadGlobalBookings() {
      try {
        setLoading(true);
        // Load bookings from Supabase
        const { data, error } = await supabase
          .from("bookings")
          .select(`
            id,
            scheduled_at,
            status,
            total_price,
            platform_commission,
            customer:profiles( first_name, last_name ),
            branches( name_en, providers( business_name_en ) )
          `)
          .order("scheduled_at", { ascending: false });

        if (data && data.length > 0) {
          setBookings(data);
        } else {
          // Mock bookings
          setBookings([
            {
              id: "b-mock-1",
              scheduled_at: new Date(Date.now() + 86400000).toISOString(),
              status: "confirmed",
              total_price: 120.00,
              platform_commission: 18.00,
              customer: { first_name: "يوسف", last_name: "الكمبيوتر" },
              branches: { name_en: "فرع الملقا", providers: { business_name_en: "صالون إيليت الرجالي" } }
            },
            {
              id: "b-mock-2",
              scheduled_at: new Date(Date.now() - 86400000).toISOString(),
              status: "completed",
              total_price: 250.00,
              platform_commission: 37.50,
              customer: { first_name: "سارة", last_name: "آل سعود" },
              branches: { name_en: "سبا العليا", providers: { business_name_en: "صالون وسبا سارة للتجميل" } }
            },
            {
              id: "b-mock-3",
              scheduled_at: new Date(Date.now() - 172800000).toISOString(),
              status: "pending_payment",
              total_price: 300.00,
              platform_commission: 45.00,
              customer: { first_name: "محمد", last_name: "العتيبي" },
              branches: { name_en: "منتجع الياسمين الصحي", providers: { business_name_en: "سبا الرياض الفاخر للعناية" } }
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
                    <tr key={b.id} className="hover:bg-gray-50/40 transition duration-150">
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
                          {b.branches?.providers?.business_name_en || t.independent}
                        </p>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5">
                          {b.branches?.name_en || t.directStaff}
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
    </div>
  );
}
