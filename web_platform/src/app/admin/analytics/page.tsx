"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Platform Business Analytics",
    subtitle: "Real-time performance metrics, platform split distributions, and activity trends.",
    loading: "Loading analytics database...",
    totalRevenue: "Total Gross Revenue",
    conversionRate: "Conversion Rate",
    avgTicket: "Avg. Ticket Value",
    bookingsTrend: "Booking Trend (Last 7 Days)",
    revenueDistribution: "Revenue by Vertical",
    topPerformingDistricts: "Top Performing Districts",
    districtName: "District",
    bookingCount: "BookingsCount",
    revenueVal: "Revenue",
    salon: "Salon / Venues",
    freelancer: "Freelancers",
    packages: "Packages",
    productSales: "Product Sales"
  },
  ar: {
    title: "تحليلات منصة الأعمال",
    subtitle: "مؤشرات الأداء الحية، توزيع نسب الأرباح، واتجاهات الحجوزات اليومية.",
    loading: "جاري تحميل بيانات التحليلات...",
    totalRevenue: "إجمالي الإيرادات الإجمالية",
    conversionRate: "معدل التحويل",
    avgTicket: "متوسط قيمة الفاتورة",
    bookingsTrend: "مؤشر الحجوزات (آخر 7 أيام)",
    revenueDistribution: "توزيع الإيرادات حسب الفئة",
    topPerformingDistricts: "الأحياء الأكثر نشاطاً",
    districtName: "الحي",
    bookingCount: "عدد الحجوزات",
    revenueVal: "الإيرادات",
    salon: "الصالونات والمراكز",
    freelancer: "المستقلون والأخصائيون",
    packages: "الباقات والعروض",
    productSales: "مبيعات المنتجات"
  }
};

export default function AdminAnalytics() {
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

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  // Mock charts data
  const trendPoints = [32, 45, 40, 58, 65, 55, 78];
  const maxPoint = Math.max(...trendPoints);
  const chartHeight = 160;
  const chartWidth = 500;

  // Calculate coordinates for SVG area chart
  const pointsString = trendPoints
    .map((val, idx) => {
      const x = (idx / (trendPoints.length - 1)) * chartWidth;
      const y = chartHeight - (val / maxPoint) * (chartHeight - 40);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPointsString = `0,${chartHeight} ${pointsString} ${chartWidth},${chartHeight}`;

  const districts = [
    { nameEn: "Al-Olaya", nameAr: "العليا", bookings: 1420, revenue: 340800 },
    { nameEn: "Al-Malqa", nameAr: "الملقا", bookings: 980, revenue: 254800 },
    { nameEn: "Al-Yasmin", nameAr: "الياسمين", bookings: 850, revenue: 204000 },
    { nameEn: "Al-Sulaimaniyah", nameAr: "السليمانية", bookings: 720, revenue: 172800 },
    { nameEn: "Al-Muhammadiyah", nameAr: "المحمدية", bookings: 540, revenue: 129600 }
  ];

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
          {t.title}
        </h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">
          {t.subtitle}
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#ECECEC] rounded-2xl p-8 text-center text-gray-400 text-xs font-bold shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
          {t.loading}
        </div>
      ) : (
        <>
          {/* Summary KPI Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPI 1 */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalRevenue}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47] font-serif text-xs font-black">
                  $
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
                {(1254300).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}
              </strong>
            </div>

            {/* KPI 2 */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.conversionRate}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-emerald-700 font-serif text-xs font-black">
                  %
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">
                94.8%
              </strong>
            </div>

            {/* KPI 3 */}
            <div className={cardBase}>
              <div className={`flex items-center justify-between ${flip}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.avgTicket}</span>
                <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#101828]">
                  <span className="text-amber-700 font-serif text-xs font-black">240</span>
                </div>
              </div>
              <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
                240 {lang === "ar" ? "ريال" : "SAR"}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SVG Trend Line Chart */}
            <div className="bg-white border border-[#ECECEC] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">{t.bookingsTrend}</h3>
              <div className="w-full overflow-hidden">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible">
                  <defs>
                    <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D1AF47" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#D1AF47" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1={chartHeight - 40} x2={chartWidth} y2={chartHeight - 40} stroke="#F2F2F2" strokeWidth="1" />
                  <line x1="0" y1={chartHeight - 80} x2={chartWidth} y2={chartHeight - 80} stroke="#F2F2F2" strokeWidth="1" />
                  <line x1="0" y1={chartHeight - 120} x2={chartWidth} y2={chartHeight - 120} stroke="#F2F2F2" strokeWidth="1" />

                  {/* Area Fill */}
                  <polygon points={areaPointsString} fill="url(#glow)" />
                  
                  {/* Line Chart */}
                  <polyline fill="none" stroke="#D1AF47" strokeWidth="2.8" points={pointsString} strokeLinecap="round" strokeLinejoin="round" />
                  
                  {/* Node Anchor points */}
                  {trendPoints.map((val, idx) => {
                    const x = (idx / (trendPoints.length - 1)) * chartWidth;
                    const y = chartHeight - (val / maxPoint) * (chartHeight - 40);
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#FFFFFF"
                        stroke="#D1AF47"
                        strokeWidth="2.2"
                      />
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Revenue distribution progress meters */}
            <div className="bg-white border border-[#ECECEC] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">{t.revenueDistribution}</h3>
              <div className="space-y-4 pt-2">
                {[
                  { key: t.salon, value: 55, amt: "689,865" },
                  { key: t.freelancer, value: 25, amt: "313,575" },
                  { key: t.packages, value: 12, amt: "150,516" },
                  { key: t.productSales, value: 8, amt: "100,344" }
                ].map((item) => (
                  <div key={item.key} className="space-y-1">
                    <div className={`flex justify-between items-center text-xs font-semibold text-gray-700 ${flip}`}>
                      <span>{item.key}</span>
                      <span className="font-serif font-black">{item.amt} {lang === "ar" ? "ريال" : "SAR"} ({item.value}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#D1AF47] h-full rounded-full transition-all duration-500" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Districts Table */}
          <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div className="p-5 border-b border-[#ECECEC]">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-900">{t.topPerformingDistricts}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.districtName}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bookingCount}</th>
                    <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.revenueVal}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                  {districts.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/40 transition duration-150">
                      <td className="py-4 px-6 font-bold text-gray-900">{lang === "ar" ? item.nameAr : item.nameEn}</td>
                      <td className="py-4 px-6">{item.bookings.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">{item.revenue.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")} {lang === "ar" ? "ريال" : "SAR"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
