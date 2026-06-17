"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BarChart, CommandHeader, KpiStrip, MetricCard, Panel, ProgressRow } from "@/components/control-center";

type AuditItem = {
  id: string;
  business_name_en: string;
  type: string;
  created_at: string;
};

const fallbackAudits: AuditItem[] = [
  { id: "audit-1", business_name_en: "Jeddah Grooming Palace", type: "salon", created_at: new Date().toISOString() },
  { id: "audit-2", business_name_en: "Maha Stylist & Artist", type: "freelancer", created_at: new Date().toISOString() },
  { id: "audit-3", business_name_en: "Riyadh Wellness House", type: "salon", created_at: new Date().toISOString() },
];

const translations = {
  en: {
    eyebrow: "Primora Marketplace Command",
    title: "Platform Operations Control Center",
    subtitle: "Live marketplace performance, compliance, finance, and risk operations",
    searchPlaceholder: "Search providers, bookings, transactions, or cases...",
    actionLabel: "Review Providers",
    kpiGmv: "Captured GMV",
    kpiRevenue: "Net Revenue",
    kpiBookings: "Total Bookings",
    kpiProviders: "Verified Providers",
    kpiAudits: "Pending Audits",
    kpiDisputes: "Open Disputes",
    kpiSuccess: "Payout Success",
    changeReview: "Review",
    changeAction: "Action",
    metricHealth: "Marketplace Health",
    healthDetail: "All core services operational",
    metricRisk: "Risk Exposure",
    riskDetail: "3 cases require attention",
    metricSla: "Provider SLA",
    slaDetail: "+2.1% this week",
    metricTrust: "Customer Trust",
    trustDetail: "18,442 verified reviews",
    panelRevenue: "Marketplace Revenue Command",
    revenueBadge: "Live settlement data",
    panelRevenueFooter: "15% blended platform commission",
    panelRevenueLedger: "Open financial ledger",
    todayGmv: "Today GMV",
    settled: "Settled",
    inEscrow: "In Escrow",
    refundRate: "Refund Rate",
    panelQueue: "Live Operations Queue",
    queueBadge: "12 actions",
    panelQueueFooter: "Open global scheduler",
    queueItem1: "High-value booking review",
    queueItem1Meta: "Booking #PR-10842 · 1,850 SAR",
    queueItem2: "Provider verification pending",
    queueItem2Meta: "Jeddah Grooming Palace · 3 documents",
    queueItem3: "Customer dispute escalated",
    queueItem3Meta: "Case #DS-2041 · 420 SAR escrow",
    queueItem4: "Payout batch ready",
    queueItem4Meta: "84 providers · 128,450 SAR",
    opFinance: "Finance",
    opCompliance: "Compliance",
    opRisk: "Risk",
    opTreasury: "Treasury",
    panelVerify: "Verification Intelligence",
    panelVerifyBadge: "pending",
    panelVerifyFooter: "Open audit center",
    auditBtn: "AUDIT",
    panelTrust: "Trust & Risk Center",
    panelTrustBadge: "Controlled",
    panelTrustFooter: "Open dispute center",
    rowIdentity: "Identity verification coverage",
    rowFreshness: "Provider document freshness",
    rowFraud: "Booking fraud controls",
    rowResolution: "Dispute resolution SLA",
    flagged: "Flagged",
    escalated: "Escalated",
    resolved: "Resolved",
    panelMatrix: "Regional Marketplace Matrix",
    panelMatrixBadge: "KSA coverage",
    panelMatrixFooter: "Regional demand forecast refreshes every 30 minutes",
    regionHealth: "health",
    regionProviders: "providers",
    regionBookings: "bookings",
    panelDispatch: "Global Booking Dispatch",
    panelDispatchBadge: "Live marketplace",
    panelDispatchFooter: "View all platform bookings",
    thBooking: "Booking",
    thProvider: "Provider",
    thRegion: "Region",
    thStatus: "Status",
    thValue: "Value",
    panelQuickOps: "Quick Operations",
    panelQuickOpsBadge: "Admin tools",
    panelQuickOpsFooter: "All admin actions are written to the immutable audit log",
    quickOp1Title: "Arbitrate disputes",
    quickOp1Detail: "Review escalations and refund appeals",
    quickOp2Title: "Release payout batch",
    quickOp2Detail: "Audit splits and provider settlements",
    quickOp3Title: "Verify providers",
    quickOp3Detail: "Review documents and marketplace readiness",
    quickOp4Title: "Inspect scheduler",
    quickOp4Detail: "Monitor active bookings across KSA",
  },
  ar: {
    eyebrow: "نظام تحكم بريمورا للماركت بليس",
    title: "مركز التحكم في عمليات المنصة",
    subtitle: "أداء السوق المباشر، والامتثال، والتمويل، وعمليات المخاطر",
    searchPlaceholder: "ابحث عن المزودين، الحجوزات، المعاملات، أو الحالات...",
    actionLabel: "مراجعة المزودين",
    kpiGmv: "إجمالي قيمة البضائع (GMV)",
    kpiRevenue: "صافي الإيرادات",
    kpiBookings: "إجمالي الحجوزات",
    kpiProviders: "المزودون المعتمدون",
    kpiAudits: "التدقيقات المعلقة",
    kpiDisputes: "النزاعات المفتوحة",
    kpiSuccess: "نجاح المدفوعات",
    changeReview: "تدقيق",
    changeAction: "إجراء",
    metricHealth: "صحة السوق",
    healthDetail: "جميع الخدمات الأساسية تعمل",
    metricRisk: "التعرض للمخاطر",
    riskDetail: "3 حالات تتطلب الاهتمام",
    metricSla: "اتفاقية مستوى الخدمة للمزود",
    slaDetail: "+2.1% هذا الأسبوع",
    metricTrust: "ثقة العملاء",
    trustDetail: "18,442 تقييم تم التحقق منه",
    panelRevenue: "التحكم في إيرادات السوق",
    revenueBadge: "بيانات التسوية الحية",
    panelRevenueFooter: "عمولة منصة مختلطة بنسبة 15%",
    panelRevenueLedger: "فتح دفتر الحسابات المالي",
    todayGmv: "GMV اليوم",
    settled: "تمت تسويتها",
    inEscrow: "في الضمان",
    refundRate: "معدل الاسترداد",
    panelQueue: "طابور العمليات المباشرة",
    queueBadge: "12 إجراءً",
    panelQueueFooter: "فتح الجدول العالمي",
    queueItem1: "مراجعة الحجز ذو القيمة العالية",
    queueItem1Meta: "حجز #PR-10842 · 1,850 ر.س",
    queueItem2: "تحقق المزود معلق",
    queueItem2Meta: "قصر جدة للحلاقة · 3 مستندات",
    queueItem3: "تم تصعيد نزاع العميل",
    queueItem3Meta: "حالة #DS-2041 · 420 ر.س في الضمان",
    queueItem4: "دفعة المدفوعات جاهزة",
    queueItem4Meta: "84 مزوداً · 128,450 ر.س",
    opFinance: "المالية",
    opCompliance: "الامتثال",
    opRisk: "المخاطر",
    opTreasury: "الخزانة",
    panelVerify: "ذكاء التحقق والتدقيق",
    panelVerifyBadge: "معلق",
    panelVerifyFooter: "فتح مركز التدقيق",
    auditBtn: "تدقيق",
    panelTrust: "مركز الثقة والمخاطر",
    panelTrustBadge: "تحت السيطرة",
    panelTrustFooter: "فتح مركز النزاعات",
    rowIdentity: "تغطية التحقق من الهوية",
    rowFreshness: "حداثة مستندات المزود",
    rowFraud: "عناصر التحكم في احتيال الحجوزات",
    rowResolution: "اتفاقية مستوى الخدمة لحل النزاعات",
    flagged: "المميزة بعلامة",
    escalated: "المصعدة",
    resolved: "المحلولة",
    panelMatrix: "مصفوفة السوق الإقليمية",
    panelMatrixBadge: "تغطية المملكة العربية السعودية",
    panelMatrixFooter: "توقعات الطلب الإقليمي تتحدث كل 30 دقيقة",
    regionHealth: "صحة",
    regionProviders: "مقدمي الخدمات",
    regionBookings: "حجوزات",
    panelDispatch: "التوزيع العالمي للحجوزات",
    panelDispatchBadge: "السوق المباشر",
    panelDispatchFooter: "عرض جميع حجوزات المنصة",
    thBooking: "الحجز",
    thProvider: "المزود",
    thRegion: "المنطقة",
    thStatus: "الحالة",
    thValue: "القيمة",
    panelQuickOps: "العمليات السريعة",
    panelQuickOpsBadge: "أدوات المسؤول",
    panelQuickOpsFooter: "تُكتب جميع إجراءات المسؤول في سجل تدقيق غير قابل للتغيير",
    quickOp1Title: "التحكيم في النزاعات",
    quickOp1Detail: "مراجعة التصعيدات وطلبات الاسترداد",
    quickOp2Title: "إصدار دفعة المستحقات",
    quickOp2Detail: "تدقيق النسب وتسويات المزودين",
    quickOp3Title: "التحقق من المزودين",
    quickOp3Detail: "مراجعة المستندات وجاهزية السوق",
    quickOp4Title: "فحص الجدول الزمني",
    quickOp4Detail: "مراقبة الحجوزات النشطة في المملكة",
  }
};

export default function AdminDashboard() {
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAudits, setPendingAudits] = useState<AuditItem[]>([]);
  const [stats, setStats] = useState({
    gmv: 425840,
    revenue: 63876,
    providers: 186,
    bookings: 9178,
    disputes: 3,
  });

  useEffect(() => {
    const syncLocale = () => setLocale(document.documentElement.lang === "ar" ? "ar" : "en");
    syncLocale();
    const observer = new MutationObserver(syncLocale);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function loadAdminData() {
      try {
        setLoading(true);
        const [{ data: providers }, { count: providerCount }, { count: bookingCount }, { count: disputeCount }] = await Promise.all([
          supabase.from("providers").select("id, business_name_en, type, created_at").eq("is_verified", false).order("created_at", { ascending: false }).limit(5),
          supabase.from("providers").select("id", { count: "exact", head: true }).eq("is_verified", true),
          supabase.from("bookings").select("id", { count: "exact", head: true }),
          supabase.from("disputes").select("id", { count: "exact", head: true }).in("status", ["open", "under_review"]),
        ]);

        if (providers?.length) setPendingAudits(providers);
        setStats((current) => ({
          ...current,
          providers: providerCount ?? current.providers,
          bookings: bookingCount ?? current.bookings,
          disputes: disputeCount ?? current.disputes,
        }));
      } catch (error) {
        console.warn("Using admin dashboard fallback data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadAdminData();
  }, []);

  const audits = pendingAudits.length ? pendingAudits : fallbackAudits;
  const isRTL = locale === "ar";
  const t = translations[locale];
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  return (
    <div className={`min-h-screen space-y-8 bg-[#F7F7F5] text-[#101828] ${isRTL ? "text-right" : "text-left"}`} dir={isRTL ? "rtl" : "ltr"}>
      {/* HEADER CONTROL */}
      <CommandHeader
        eyebrow={t.eyebrow}
        title={t.title}
        subtitle={t.subtitle}
        initials="PA"
        searchPlaceholder={t.searchPlaceholder}
        searchValue={search}
        onSearchChange={setSearch}
        actionLabel={t.actionLabel}
        actionHref="/admin/providers"
      />

      {/* LANGUAGE SWITCHER */}
      <div className={`flex items-center justify-end ${flip}`}>
        <button
          onClick={() => {
            const target = locale === "en" ? "ar" : "en";
            document.documentElement.lang = target;
            document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
            try {
              localStorage.setItem("primora_lang", target);
            } catch {}
            setLocale(target);
          }}
          className="rounded-full border border-[#EAEAEA] bg-white px-4 py-1.5 text-xs font-bold text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#D1AF47]/40 hover:text-[#D1AF47]"
        >
          {locale === "en" ? "العربية" : "English"}
        </button>
      </div>

      {/* KPI STRIP */}
      <KpiStrip items={[
        { label: t.kpiGmv, value: `${stats.gmv.toLocaleString()} SAR`, change: "+12.4%", tone: "green" },
        { label: t.kpiRevenue, value: `${stats.revenue.toLocaleString()} SAR`, change: "+9.8%", tone: "green" },
        { label: t.kpiBookings, value: stats.bookings.toLocaleString(), change: "+8.1%", tone: "green" },
        { label: t.kpiProviders, value: stats.providers.toLocaleString(), change: "+14", tone: "green" },
        { label: t.kpiAudits, value: String(audits.length), change: t.changeReview, tone: "gold" },
        { label: t.kpiDisputes, value: String(stats.disputes), change: t.changeAction, tone: "red" },
        { label: t.kpiSuccess, value: "99.6%", change: "+0.2%", tone: "green" },
      ]} />

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t.metricHealth} value="98.4%" detail={t.healthDetail} tone="green" />
        <MetricCard label={t.metricRisk} value="12,840 SAR" detail={t.riskDetail} tone="red" />
        <MetricCard label={t.metricSla} value="94.8%" detail={t.slaDetail} tone="blue" />
        <MetricCard label={t.metricTrust} value="4.86 / 5" detail={t.trustDetail} tone="gold" />
      </div>

      {/* ROW 1 PANELS */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <Panel
          title={t.panelRevenue}
          badge={t.revenueBadge}
          className="xl:col-span-7"
          footer={<div className="flex justify-between"><span>{t.panelRevenueFooter}</span><Link href="/admin/ledger" className="font-black text-[#D1AF47]">{t.panelRevenueLedger}</Link></div>}
        >
          <BarChart values={[42, 58, 54, 68, 74, 66, 82, 92, 88, 96, 91, 100]} labels={["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[[t.todayGmv, "24,820 SAR"], [t.settled, "21,640 SAR"], [t.inEscrow, "3,180 SAR"], [t.refundRate, "0.8%"]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
                <span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span>
                <strong className="mt-1 block font-serif text-sm font-black">{value}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={t.panelQueue} badge={t.queueBadge} className="xl:col-span-5" footer={<Link href="/admin/bookings" className="font-black text-[#D1AF47]">{t.panelQueueFooter}</Link>}>
          <div className="space-y-3">
            {[
              { title: t.queueItem1, meta: t.queueItem1Meta, status: t.opFinance, tone: "bg-[#D1AF47]/10 text-[#B8952E]" },
              { title: t.queueItem2, meta: t.queueItem2Meta, status: t.opCompliance, tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
              { title: t.queueItem3, meta: t.queueItem3Meta, status: t.opRisk, tone: "bg-[#EF4444]/10 text-[#EF4444]" },
              { title: t.queueItem4, meta: t.queueItem4Meta, status: t.opTreasury, tone: "bg-[#22C55E]/10 text-[#22C55E]" },
            ].map((item) => (
              <div key={item.title} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 transition hover:border-[#D1AF47]/30">
                <div className="min-w-0">
                  <strong className="block truncate font-serif text-sm font-black">{item.title}</strong>
                  <span className="mt-1 block truncate text-[9px] font-semibold text-[#667085]">{item.meta}</span>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-1 text-[8px] font-black ${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ROW 2 PANELS */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
        <Panel title={t.panelVerify} badge={`${audits.length} ${t.panelVerifyBadge}`} footer={<Link href="/admin/providers" className="font-black text-[#D1AF47]">{t.panelVerifyFooter}</Link>}>
          <div className="space-y-3">
            {audits.slice(0, 4).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-3">
                <div className="min-w-0">
                  <strong className="block truncate font-serif text-sm font-black">{audit.business_name_en}</strong>
                  <span className="mt-1 block text-[8px] font-black uppercase tracking-wider text-[#667085]">{audit.type} · {new Date(audit.created_at).toLocaleDateString()}</span>
                </div>
                <Link href="/admin/providers" className="rounded-lg bg-[#D1AF47] px-3 py-2 text-[8px] font-black text-white">{t.auditBtn}</Link>
              </div>
            ))}
            {loading && <p className="py-2 text-center text-[9px] font-semibold text-[#667085]">Synchronizing provider queue...</p>}
          </div>
        </Panel>

        <Panel title={t.panelTrust} badge={t.panelTrustBadge} footer={<Link href="/admin/disputes" className="font-black text-[#D1AF47]">{t.panelTrustFooter}</Link>}>
          <div className="space-y-5">
            <ProgressRow label={t.rowIdentity} value={96} detail="96.2%" />
            <ProgressRow label={t.rowFreshness} value={88} detail="88.4%" />
            <ProgressRow label={t.rowFraud} value={99} detail="99.1%" />
            <ProgressRow label={t.rowResolution} value={82} detail="82.0%" />
            <div className="grid grid-cols-3 gap-2">
              {[[t.flagged, "8"], [t.escalated, "3"], [t.resolved, "42"]].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#EAEAEA] bg-[#F7F7F5] p-3 text-center">
                  <span className="text-[8px] font-black uppercase text-[#667085]">{label}</span>
                  <strong className="mt-1 block font-serif text-base font-black">{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title={t.panelMatrix} badge={t.panelMatrixBadge} footer={t.panelMatrixFooter}>
          <div className="space-y-3">
            {[
              { city: "Riyadh", providers: 82, bookings: "4,280", health: 96 },
              { city: "Jeddah", providers: 54, bookings: "2,940", health: 91 },
              { city: "Dammam", providers: 31, bookings: "1,426", health: 87 },
              { city: "Madinah", providers: 19, bookings: "532", health: 78 },
            ].map((region) => (
              <div key={region.city} className="rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-3.5">
                <div className="flex items-center justify-between">
                  <strong className="font-serif text-sm font-black">{region.city === "Riyadh" && locale === "ar" ? "الرياض" : region.city === "Jeddah" && locale === "ar" ? "جدة" : region.city === "Dammam" && locale === "ar" ? "الدمام" : region.city === "Madinah" && locale === "ar" ? "المدينة المنورة" : region.city}</strong>
                  <span className="text-[9px] font-black text-[#D1AF47]">{region.health}% {t.regionHealth}</span>
                </div>
                <div className="mt-2 flex justify-between text-[8px] font-bold text-[#667085]">
                  <span>{region.providers} {t.regionProviders}</span><span>{region.bookings} {t.regionBookings}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8E8E8]"><div className="h-full rounded-full bg-[#D1AF47]" style={{ width: `${region.health}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ROW 3 PANELS */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        <Panel title={t.panelDispatch} badge={t.panelDispatchBadge} className="xl:col-span-8" footer={<Link href="/admin/bookings" className="font-black text-[#D1AF47]">{t.panelDispatchFooter}</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs rtl:text-right">
              <thead>
                <tr className="border-b border-[#EAEAEA] text-[8px] font-black uppercase tracking-wider text-[#667085]">
                  <th className="px-3 py-3">{t.thBooking}</th>
                  <th className="px-3 py-3">{t.thProvider}</th>
                  <th className="px-3 py-3">{t.thRegion}</th>
                  <th className="px-3 py-3">{t.thStatus}</th>
                  <th className="px-3 py-3">{t.thValue}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAEA]">
                {[
                  ["#PR-10842", "Elite Salon", "Riyadh", "IN SERVICE", "1,850 SAR"],
                  ["#PR-10841", "Noura Nails", "Jeddah", "CONFIRMED", "320 SAR"],
                  ["#PR-10840", "Salman Hair", "Riyadh", "EN ROUTE", "245 SAR"],
                  ["#PR-10839", "Maha Artist", "Dammam", "COMPLETED", "480 SAR"],
                ].map((row) => (
                  <tr key={row[0]} className="transition hover:bg-[#F7F7F5]">
                    <td className="px-3 py-4 font-black text-[#D1AF47]">{row[0]}</td>
                    <td className="px-3 py-4 font-serif font-black">{row[1]}</td>
                    <td className="px-3 py-4 font-semibold text-[#667085]">{row[2]}</td>
                    <td className="px-3 py-4">
                      <span className="rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-2 py-1 text-[8px] font-black text-[#22C55E]">
                        {row[3]}
                      </span>
                    </td>
                    <td className="px-3 py-4 font-black">{row[4]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={t.panelQuickOps} badge={t.panelQuickOpsBadge} className="xl:col-span-4" footer={t.panelQuickOpsFooter}>
          <div className="space-y-3">
            {[
              ["/admin/disputes", t.quickOp1Title, t.quickOp1Detail],
              ["/admin/ledger", t.quickOp2Title, t.quickOp2Detail],
              ["/admin/providers", t.quickOp3Title, t.quickOp3Detail],
              ["/admin/bookings", t.quickOp4Title, t.quickOp4Detail],
            ].map(([href, title, detail]) => (
              <Link key={href} href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-[#EAEAEA] bg-[#F7F7F5] p-4 transition hover:border-[#D1AF47]/40">
                <div>
                  <strong className="block font-serif text-sm font-black">{title}</strong>
                  <span className="mt-1 block text-[9px] font-semibold text-[#667085]">{detail}</span>
                </div>
                <span className="text-sm font-black text-[#D1AF47]">→</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
