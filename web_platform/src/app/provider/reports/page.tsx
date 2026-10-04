"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface StaffPerformanceRow {
  employee_id: string;
  name_en: string;
  name_ar: string;
  role: string;
  completed_bookings: number;
  revenue_sar: number;
}

interface PopularServiceRow {
  service_id: string;
  name_en: string;
  name_ar: string;
  category: string;
  bookings_count: number;
  revenue_sar: number;
}

interface SourceDistributionRow {
  source: string;
  bookings_count: number;
  revenue_sar: number;
  share_pct: number;
}

interface DetailedAnalytics {
  provider_id: string;
  start_date: string;
  end_date: string;
  gross_revenue_sar: number;
  platform_fees_sar: number;
  net_earnings_sar: number;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  completion_rate_pct: number;
  no_show_rate_pct: number;
  unique_clients: number;
  first_time_clients: number;
  repeat_clients: number;
  repeat_rate_pct: number;
  sources_distribution: SourceDistributionRow[];
  staff_performance: StaffPerformanceRow[];
  popular_services: PopularServiceRow[];
}

interface BranchSummaryRow {
  branch_id: string;
  name_en: string;
  name_ar: string;
  city: string;
  district: string;
  revenue_sar: number;
  total_bookings: number;
  completed_bookings: number;
  no_show_bookings: number;
  no_show_rate_pct: number;
  active_staff: number;
}

interface MultiBranchSummary {
  provider_id: string;
  start_date: string;
  end_date: string;
  chain_total_revenue_sar: number;
  chain_total_bookings: number;
  total_branches: number;
  branches: BranchSummaryRow[];
}

const translations = {
  en: {
    title: "Analytics & Operations",
    subtitle: "Real-time revenue, salon performance KPIs, multi-branch rollup, and Saudi WPS payroll export.",
    grossRevenue: "Gross Revenue",
    platformFees: "Platform Fees",
    netEarnings: "Net Payout",
    bookingsTotal: "Total Bookings",
    completionRate: "Completion Rate",
    noShowRate: "No-Show Rate",
    repeatRate: "Repeat Client Retention",
    uniqueClients: "Unique Clients",
    exportBtn: "Export Analytics (CSV)",
    wpsExportBtn: "WPS Payroll Export (Mudad CSV)",
    staffPerformance: "Specialist Performance Overview",
    staffName: "Staff Member",
    bookingsCompleted: "Completed Bookings",
    revenueGenerated: "Revenue Generated",
    role: "Role",
    servicesDistribution: "Top Services by Revenue",
    acquisitionChannels: "Acquisition Source Split",
    noData: "No booking records found in this timeframe.",
    emptyStateDesc: "When customers book services at your salon, live performance metrics and financial breakdown will appear here in real time.",
    currency: "SAR",
    popularServices: "Popular Services Analytics",
    serviceName: "Service",
    bookings: "Bookings",
    period: "Time Period",
    customRange: "Custom Range",
    apply: "Apply",
    startDate: "Start Date",
    endDate: "End Date",
    last7Days: "Last 7 Days",
    last30Days: "Last 30 Days",
    last6Months: "Last 6 Months",
    loadingData: "Loading live analytics from database...",
    viewDetailed: "Branch Performance",
    viewMultiBranch: "Multi-Branch Chain Rollup",
    chainRevenue: "Total Chain Revenue",
    chainBookings: "Chain Bookings",
    branchesCount: "Active Branches",
    branchName: "Branch Name",
    location: "Location",
    activeSpecialists: "Staff Count",
    firstTimeVsRepeat: "First-Time vs Repeat Clients",
    firstTime: "New Clients",
    repeat: "Returning Clients",
    downloadingWps: "Exporting WPS...",
  },
  ar: {
    title: "التحليلات والعمليات التشغيلية",
    subtitle: "الإيرادات اللحظية، مؤشرات الأداء، تقارير الفروع المجمعة، وتصدير مسير الرواتب المعتمد (نظام حماية الأجور / مدد).",
    grossRevenue: "إجمالي الإيرادات",
    platformFees: "رسوم المنصة (الضمان)",
    netEarnings: "صافي الأرباح",
    bookingsTotal: "إجمالي الحجوزات",
    completionRate: "معدل الاكتمال",
    noShowRate: "نسبة التغيب (No-Show)",
    repeatRate: "معدل ولاء وعودة العملاء",
    uniqueClients: "العملاء الفريدين",
    exportBtn: "تصدير التحليلات (CSV)",
    wpsExportBtn: "تصدير مسير الرواتب (حماية الأجور WPS)",
    staffPerformance: "أداء الموظفين والأخصائيين",
    staffName: "الموظف",
    bookingsCompleted: "الحجوزات المكتملة",
    revenueGenerated: "الإيراد المحقق",
    role: "المسمى الوظيفي",
    servicesDistribution: "أعلى الخدمات تحقيقاً للإيرادات",
    acquisitionChannels: "قنوات استقطاب العملاء",
    noData: "لا توجد حجوزات مسجلة خلال هذه الفترة الزمنية.",
    emptyStateDesc: "عند قيام العملاء بحجز الخدمات في صالونك، ستظهر مقاييس الأداء اللحظية والتقارير المالية هنا مباشرة دون أي تأخير.",
    currency: "ريال",
    popularServices: "تحليلات الخدمات الأكثر طلباً",
    serviceName: "الخدمة",
    bookings: "الحجوزات",
    period: "الفترة الزمنية",
    customRange: "فترة مخصصة",
    apply: "تطبيق",
    startDate: "تاريخ البدء",
    endDate: "تاريخ الانتهاء",
    last7Days: "آخر ٧ أيام",
    last30Days: "آخر ٣٠ يوماً",
    last6Months: "آخر ٦ أشهر",
    loadingData: "جاري تحميل البيانات الحقيقية من قاعدة البيانات...",
    viewDetailed: "أداء الفرع",
    viewMultiBranch: "تقرير الفروع المجمّع",
    chainRevenue: "إجمالي إيرادات السلسلة",
    chainBookings: "إجمالي حجوزات الفروع",
    branchesCount: "الفروع النشطة",
    branchName: "اسم الفرع",
    location: "الموقع",
    activeSpecialists: "عدد الأخصائيين",
    firstTimeVsRepeat: "العملاء الجدد مقابل المتكررين",
    firstTime: "عملاء جدد",
    repeat: "عملاء متكررين",
    downloadingWps: "جاري تصدير حماية الأجور...",
  }
};

function getIsoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export default function ProviderReportsPage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"detailed" | "multi_branch">("detailed");

  // Date filters
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "6m" | "custom">("30d");
  const [startDate, setStartDate] = useState<string>(getIsoDateDaysAgo(30));
  const [endDate, setEndDate] = useState<string>(getIsoDateDaysAgo(0));
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Real Database States
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [multiBranch, setMultiBranch] = useState<MultiBranchSummary | null>(null);
  const [exportingWps, setExportingWps] = useState(false);

  const t = translations[locale];

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const interval = setInterval(handleLangSync, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadReportData(startDate, endDate);
  }, []);

  async function loadReportData(start: string, end: string) {
    try {
      setLoading(true);
      setError("");

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        setError(locale === "ar" ? "يرجى تسجيل الدخول لعرض التقارير" : "Authentication required");
        return;
      }

      // Find provider ID
      const { data: providerInfo, error: provErr } = await supabase
        .from("providers")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (provErr || !providerInfo) {
        setError(locale === "ar" ? "لم يتم العثور على سجل مزود خدمة مرتبط بهذا الحساب" : "No provider record associated with this account");
        return;
      }

      const pId = providerInfo.id;
      setProviderId(pId);

      // 1. Fetch detailed analytics RPC
      const { data: detailedData, error: detailedErr } = await supabase.rpc(
        "get_provider_detailed_analytics",
        {
          p_provider_id: pId,
          p_start_date: start,
          p_end_date: end,
        }
      );

      if (detailedErr) {
        console.error("Failed to load provider detailed analytics:", detailedErr);
        setError(detailedErr.message);
      } else if (detailedData) {
        setAnalytics(detailedData as DetailedAnalytics);
      }

      // 2. Fetch multi-branch summary RPC
      const { data: mbData, error: mbErr } = await supabase.rpc(
        "get_provider_multi_branch_summary",
        {
          p_provider_id: pId,
          p_start_date: start,
          p_end_date: end,
        }
      );

      if (!mbErr && mbData) {
        setMultiBranch(mbData as MultiBranchSummary);
      }
    } catch (err: any) {
      console.error("Provider analytics error:", err);
      setError(err?.message || "Failed to load reporting data");
    } finally {
      setLoading(false);
    }
  }

  const handleApplyPreset = (preset: "7d" | "30d" | "6m") => {
    setDateRange(preset);
    let s = "";
    const e = getIsoDateDaysAgo(0);
    if (preset === "7d") s = getIsoDateDaysAgo(7);
    else if (preset === "30d") s = getIsoDateDaysAgo(30);
    else if (preset === "6m") s = getIsoDateDaysAgo(180);

    setStartDate(s);
    setEndDate(e);
    loadReportData(s, e);
  };

  const handleApplyCustomDate = () => {
    setDateRange("custom");
    setShowDatePicker(false);
    loadReportData(startDate, endDate);
  };

  // Export Standard Analytics CSV
  const handleExportAnalyticsCsv = () => {
    if (!analytics) return;

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "PRIMORA Provider Analytics Report\n";
    csvContent += `Period,${analytics.start_date} to ${analytics.end_date}\n`;
    csvContent += `Gross Revenue (SAR),${analytics.gross_revenue_sar}\n`;
    csvContent += `Platform Fees (SAR),${analytics.platform_fees_sar}\n`;
    csvContent += `Net Earnings (SAR),${analytics.net_earnings_sar}\n`;
    csvContent += `Total Bookings,${analytics.total_bookings}\n`;
    csvContent += `Completed Bookings,${analytics.completed_bookings}\n`;
    csvContent += `Completion Rate (%),${analytics.completion_rate_pct}%\n`;
    csvContent += `No-Show Rate (%),${analytics.no_show_rate_pct}%\n`;
    csvContent += `Repeat Retention (%),${analytics.repeat_rate_pct}%\n\n`;

    csvContent += "Staff Performance\n";
    csvContent += "Staff Name (EN),Staff Name (AR),Role,Completed Bookings,Revenue Generated (SAR)\n";
    analytics.staff_performance.forEach((s) => {
      csvContent += `"${s.name_en}","${s.name_ar}","${s.role}",${s.completed_bookings},${s.revenue_sar}\n`;
    });

    csvContent += "\nPopular Services\n";
    csvContent += "Service (EN),Service (AR),Category,Bookings Count,Revenue (SAR)\n";
    analytics.popular_services.forEach((srv) => {
      csvContent += `"${srv.name_en}","${srv.name_ar}","${srv.category}",${srv.bookings_count},${srv.revenue_sar}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `primora_analytics_${analytics.start_date}_${analytics.end_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Wages Protection System (WPS / Mudad) Payroll CSV (G55)
  const handleExportWpsPayrollCsv = async () => {
    if (!providerId) return;

    try {
      setExportingWps(true);
      const { data, error: wpsErr } = await supabase.rpc("calculate_staff_payroll", {
        p_provider_id: providerId,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (wpsErr) throw wpsErr;
      if (!data || !data.payroll_entries) {
        throw new Error("No payroll entries returned");
      }

      const entries = data.payroll_entries as any[];

      // Mudad / WPS Compliant CSV format
      let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
      csvContent += "Employee ID,Staff Name,Role,Branch,IBAN,Completed Bookings,Service Revenue (SAR),Commission Rate (%),Commission Earned (SAR),Tips (SAR),Base Salary (SAR),Total Net Payout (SAR)\n";

      entries.forEach((emp) => {
        csvContent += `"${emp.employee_id}","${emp.name_en} / ${emp.name_ar}","${emp.role}","${emp.branch}","${emp.wps_iban}",${emp.completed_bookings},${emp.service_revenue_sar},${emp.commission_rate_pct}%,${emp.commission_earned_sar},${emp.tips_earned_sar},${emp.base_salary_sar},${emp.total_payout_sar}\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `primora_wps_payroll_${startDate}_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("WPS export error:", err);
      alert(locale === "ar" ? `فشل تصدير مسير الرواتب: ${err.message}` : `WPS Export failed: ${err.message}`);
    } finally {
      setExportingWps(false);
    }
  };

  const isRTL = locale === "ar";

  return (
    <div className={`space-y-8 font-sans ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* HEADER */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 border-b border-[#ECECEC] pb-6">
        <div>
          <h2 className="text-3xl font-serif font-semibold tracking-tight text-[#101828]">{t.title}</h2>
          <p className="text-sm text-[#344054] mt-1">{t.subtitle}</p>
        </div>

        {/* DATE FILTERS & EXPORT ACTIONS */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Multi-Branch toggle if multiple branches exist */}
          {multiBranch && multiBranch.total_branches > 1 && (
            <div className="flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200">
              <button
                type="button"
                onClick={() => setViewMode("detailed")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  viewMode === "detailed" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {t.viewDetailed}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("multi_branch")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  viewMode === "multi_branch" ? "bg-[#D1AF47] text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {t.viewMultiBranch} ({multiBranch.total_branches})
              </button>
            </div>
          )}

          {/* Preset Selector Pills */}
          <div className="flex items-center bg-white border border-[#ECECEC] shadow-sm p-1.5 rounded-2xl">
            {(["7d", "30d", "6m"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleApplyPreset(r)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  dateRange === r
                    ? "bg-[#D1AF47] text-[#070B12] shadow-sm font-bold"
                    : "text-[#344054] hover:text-[#101828]"
                }`}
              >
                {r === "7d" ? t.last7Days : r === "30d" ? t.last30Days : t.last6Months}
              </button>
            ))}
          </div>

          {/* Custom Date Picker Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-semibold transition bg-white ${
                dateRange === "custom"
                  ? "border-[#D1AF47] text-[#D1AF47]"
                  : "border-[#ECECEC] text-[#344054] hover:border-[#D1AF47]/40"
              }`}
            >
              <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{dateRange === "custom" ? `${startDate} - ${endDate}` : t.customRange}</span>
            </button>

            {showDatePicker && (
              <div className={`absolute top-full mt-2 p-4 rounded-2xl bg-white border border-[#ECECEC] shadow-2xl z-50 w-72 ${isRTL ? "left-0" : "right-0"}`}>
                <h4 className="text-xs uppercase tracking-wider text-[#667085] mb-3 font-bold">{t.customRange}</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-[#344054] mb-1 font-semibold">{t.startDate}</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full border border-[#ECECEC] rounded-xl px-3 py-1.5 text-xs text-[#101828] focus:border-[#D1AF47] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#344054] mb-1 font-semibold">{t.endDate}</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full border border-[#ECECEC] rounded-xl px-3 py-1.5 text-xs text-[#101828] focus:border-[#D1AF47] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCustomDate}
                    className="w-full py-2 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] text-xs font-bold rounded-xl transition shadow-sm"
                  >
                    {t.apply}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* WPS Payroll CSV Button (G55) */}
          <button
            type="button"
            onClick={handleExportWpsPayrollCsv}
            disabled={exportingWps}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-stone-50 font-bold text-xs rounded-2xl transition shadow-sm disabled:opacity-50"
            title="Saudi Wages Protection System / Mudad CSV export"
          >
            <svg className="w-4 h-4 text-[#D1AF47]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{exportingWps ? t.downloadingWps : t.wpsExportBtn}</span>
          </button>

          {/* Export Analytics CSV Button */}
          <button
            type="button"
            onClick={handleExportAnalyticsCsv}
            disabled={!analytics || analytics.total_bookings === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D1AF47] to-[#B8952E] hover:from-[#E0C46A] hover:to-[#D1AF47] text-[#070B12] font-bold text-xs rounded-2xl transition shadow-sm disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{t.exportBtn}</span>
          </button>
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {/* LOADING STATE */}
      {loading ? (
        <div className="bg-white border border-[#ECECEC] rounded-3xl p-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#D1AF47] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-stone-500">{t.loadingData}</p>
        </div>
      ) : viewMode === "multi_branch" && multiBranch ? (
        /* MULTI-BRANCH CONSOLIDATED CHAIN VIEW (G56) */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.chainRevenue}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {multiBranch.chain_total_revenue_sar.toLocaleString()}{" "}
                <span className="text-sm font-semibold text-[#D1AF47]">{t.currency}</span>
              </h3>
            </div>
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.chainBookings}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {multiBranch.chain_total_bookings.toLocaleString()}
              </h3>
            </div>
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.branchesCount}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {multiBranch.total_branches}
              </h3>
            </div>
          </div>

          <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm overflow-hidden">
            <h3 className="font-serif font-bold text-base text-[#101828] mb-4">{t.viewMultiBranch}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#ECECEC] text-[#667085] font-bold uppercase text-[10px] tracking-wider bg-stone-50/50">
                    <th className="py-3 px-4">{t.branchName}</th>
                    <th className="py-3 px-4">{t.location}</th>
                    <th className="py-3 px-4 text-center">{t.activeSpecialists}</th>
                    <th className="py-3 px-4 text-center">{t.bookingsTotal}</th>
                    <th className="py-3 px-4 text-center">{t.bookingsCompleted}</th>
                    <th className="py-3 px-4 text-center">{t.noShowRate}</th>
                    <th className="py-3 px-4 text-center">{t.revenueGenerated}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECECEC]">
                  {multiBranch.branches.map((b) => (
                    <tr key={b.branch_id} className="hover:bg-stone-50/60 transition">
                      <td className="py-3 px-4 font-bold text-[#101828]">
                        {isRTL ? b.name_ar : b.name_en}
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {b.district}, {b.city}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-stone-700">
                        {b.active_staff}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-stone-700">
                        {b.total_bookings}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-600">
                        {b.completed_bookings}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-stone-500">
                        {b.no_show_rate_pct}%
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-[#D1AF47]">
                        {b.revenue_sar.toLocaleString()} {t.currency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : analytics && analytics.total_bookings > 0 ? (
        /* DETAILED REAL ANALYTICS VIEW (G54) */
        <div className="space-y-8">
          {/* TOP KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Gross Revenue */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm hover:border-[#D1AF47]/40 transition">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.grossRevenue}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {analytics.gross_revenue_sar.toLocaleString()}{" "}
                <span className="text-sm font-semibold text-[#D1AF47]">{t.currency}</span>
              </h3>
              <div className="text-[11px] text-stone-400 mt-2">
                <span>{t.platformFees}: {analytics.platform_fees_sar.toLocaleString()} {t.currency}</span>
              </div>
            </div>

            {/* Net Payout */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm hover:border-emerald-300 transition">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.netEarnings}</span>
              <h3 className="text-3xl font-bold text-emerald-600 mt-2 font-mono">
                {analytics.net_earnings_sar.toLocaleString()}{" "}
                <span className="text-sm font-semibold text-emerald-700">{t.currency}</span>
              </h3>
              <div className="text-[11px] text-stone-400 mt-2">
                <span>{locale === "ar" ? "صافي مستحق بعد استقطاع المنصة" : "Net payout after platform fee"}</span>
              </div>
            </div>

            {/* Total Bookings & Completion */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm hover:border-stone-300 transition">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.bookingsTotal}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {analytics.total_bookings}
              </h3>
              <div className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1">
                <span>✓ {analytics.completion_rate_pct}% {t.completionRate}</span>
                <span className="text-stone-300">•</span>
                <span className="text-red-500">{analytics.no_show_rate_pct}% {t.noShowRate}</span>
              </div>
            </div>

            {/* Client Retention */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm hover:border-[#D1AF47]/40 transition">
              <span className="text-[11px] uppercase font-bold text-[#667085] tracking-wider block">{t.repeatRate}</span>
              <h3 className="text-3xl font-bold text-[#101828] mt-2 font-mono">
                {analytics.repeat_rate_pct}%
              </h3>
              <div className="text-[11px] text-stone-400 mt-2">
                <span>{analytics.unique_clients} {t.uniqueClients} ({analytics.first_time_clients} {t.firstTime} / {analytics.repeat_clients} {t.repeat})</span>
              </div>
            </div>
          </div>

          {/* ACQUISITION CHANNELS & POPULAR SERVICES GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acquisition Source Split */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm">
              <h3 className="font-serif font-bold text-base text-[#101828] mb-4">{t.acquisitionChannels}</h3>
              {analytics.sources_distribution.length === 0 ? (
                <p className="text-xs text-stone-400">{t.noData}</p>
              ) : (
                <div className="space-y-4">
                  {analytics.sources_distribution.map((src, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-stone-800 capitalize font-medium">{src.source}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-stone-500">{src.bookings_count} {t.bookings}</span>
                          <span className="font-mono font-bold text-[#D1AF47]">{src.share_pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] rounded-full"
                          style={{ width: `${Math.min(src.share_pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Popular Services */}
            <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm">
              <h3 className="font-serif font-bold text-base text-[#101828] mb-4">{t.popularServices}</h3>
              {analytics.popular_services.length === 0 ? (
                <p className="text-xs text-stone-400">{t.noData}</p>
              ) : (
                <div className="space-y-3">
                  {analytics.popular_services.slice(0, 5).map((srv) => (
                    <div key={srv.service_id} className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50/70 border border-stone-100">
                      <div>
                        <h4 className="text-xs font-bold text-stone-900">{isRTL ? srv.name_ar : srv.name_en}</h4>
                        <span className="text-[10px] text-stone-400 uppercase font-semibold">{srv.category}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-[#D1AF47]">{srv.revenue_sar.toLocaleString()} {t.currency}</div>
                        <span className="text-[10px] font-mono text-stone-500">{srv.bookings_count} {t.bookings}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* STAFF SPECIALIST PERFORMANCE */}
          <div className="bg-white border border-[#ECECEC] rounded-[24px] p-6 shadow-sm overflow-hidden">
            <h3 className="font-serif font-bold text-base text-[#101828] mb-4">{t.staffPerformance}</h3>
            {analytics.staff_performance.length === 0 ? (
              <p className="text-xs text-stone-400">{t.noData}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#ECECEC] text-[#667085] font-bold uppercase text-[10px] tracking-wider bg-stone-50/50">
                      <th className="py-3 px-4">{t.staffName}</th>
                      <th className="py-3 px-4">{t.role}</th>
                      <th className="py-3 px-4 text-center">{t.bookingsCompleted}</th>
                      <th className="py-3 px-4 text-center">{t.revenueGenerated}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECECEC]">
                    {analytics.staff_performance.map((staff) => (
                      <tr key={staff.employee_id} className="hover:bg-stone-50/60 transition">
                        <td className="py-3 px-4 font-bold text-[#101828]">
                          {isRTL ? staff.name_ar : staff.name_en}
                        </td>
                        <td className="py-3 px-4 text-stone-500">
                          {staff.role}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold text-stone-700">
                          {staff.completed_bookings}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-[#D1AF47]">
                          {staff.revenue_sar.toLocaleString()} {t.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* AUTHENTIC EMPTY STATE (Zero mock data rule) */
        <div className="bg-white border border-[#ECECEC] rounded-[24px] p-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="font-serif font-bold text-lg text-stone-900">{t.noData}</h3>
            <p className="text-xs text-stone-500 leading-relaxed">{t.emptyStateDesc}</p>
          </div>
        </div>
      )}
    </div>
  );
}

