"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BarChart } from "@/components/control-center";

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
  const cardBase = "rounded-[20px] border border-[#EFEFEF] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.04)]";
  const eyebrow = "text-[10px] font-black uppercase tracking-[0.14em] text-[#667085]";
  const toggleLang = () => {
    const target = locale === "en" ? "ar" : "en";
    document.documentElement.lang = target;
    document.documentElement.dir = target === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("primora_lang", target); } catch {}
    setLocale(target);
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`flex h-full flex-col gap-3 bg-[#F7F7F5] text-[#101828] font-sans ${isRTL ? "text-right" : "text-left"}`}>
      {/* HEADER */}
      <header className="flex flex-shrink-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#B8952E]">{t.eyebrow}</span>
          <h1 className="font-serif text-xl font-black leading-tight lg:text-2xl">{t.title}</h1>
        </div>
        <div className={`flex items-center gap-2.5 ${flip}`}>
          <label className={`flex items-center gap-2 rounded-full border border-[#EAEAEA] bg-white px-3.5 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.03)] md:w-60 ${flip}`}>
            <svg className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} className="w-full border-none bg-transparent text-xs outline-none placeholder:text-[#9CA3AF]" />
          </label>
          <button onClick={toggleLang} className="rounded-full border border-[#EAEAEA] bg-white px-3.5 py-2 text-xs font-bold text-[#667085] shadow-[0_4px_14px_rgba(0,0,0,0.03)] transition hover:border-[#D1AF47]/40 hover:text-[#D1AF47]">{locale === "en" ? "العربية" : "EN"}</button>
          <Link href="/admin/providers" className="hidden rounded-full bg-[#D1AF47] px-4 py-2 text-xs font-black text-white shadow-md shadow-[#D1AF47]/10 transition hover:bg-[#E0C46A] sm:block">{t.actionLabel}</Link>
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#101828] text-xs font-black text-white">PA</div>
        </div>
      </header>

      {/* KPI STRIP */}
      <div className={`${cardBase} flex-shrink-0 overflow-x-auto p-3`}>
        <div className="flex min-w-max divide-x divide-[#EAEAEA] rtl:divide-x-reverse">
          {[
            { label: t.kpiGmv, value: `${stats.gmv.toLocaleString()} SAR`, change: "+12.4%", tone: "text-[#22C55E]" },
            { label: t.kpiRevenue, value: `${stats.revenue.toLocaleString()} SAR`, change: "+9.8%", tone: "text-[#22C55E]" },
            { label: t.kpiBookings, value: stats.bookings.toLocaleString(), change: "+8.1%", tone: "text-[#22C55E]" },
            { label: t.kpiProviders, value: stats.providers.toLocaleString(), change: "+14", tone: "text-[#22C55E]" },
            { label: t.kpiAudits, value: String(audits.length), change: t.changeReview, tone: "text-[#B8952E]" },
            { label: t.kpiDisputes, value: String(stats.disputes), change: t.changeAction, tone: "text-[#EF4444]" },
            { label: t.kpiSuccess, value: "99.6%", change: "+0.2%", tone: "text-[#22C55E]" },
          ].map((k) => (
            <div key={k.label} className="min-w-[140px] px-4 first:ps-1 last:pe-1">
              <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[#667085]">{k.label}</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <strong className="font-serif text-sm font-black">{k.value}</strong>
                <span className={`text-[9px] font-black ${k.tone}`}>{k.change}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GRID — fits one screen */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12" style={{ gridTemplateRows: "minmax(0,1.15fr) minmax(0,1fr)" }}>
        {/* Revenue Command */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-7`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.panelRevenue}</h3>
            <Link href="/admin/ledger" className="text-[10px] font-black text-[#D1AF47] hover:underline">{t.panelRevenueLedger}</Link>
          </div>
          <div className="min-h-0 flex-1"><BarChart values={[42, 58, 54, 68, 74, 66, 82, 92, 88, 96, 91, 100]} labels={["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]} /></div>
          <div className="mt-2 grid flex-shrink-0 grid-cols-4 gap-2">
            {[[t.todayGmv, "24,820"], [t.settled, "21,640"], [t.inEscrow, "3,180"], [t.refundRate, "0.8%"]].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#EFEFEF] bg-[#F7F7F5] p-2">
                <span className="block text-[7px] font-black uppercase text-[#667085]">{label}</span>
                <strong className="mt-0.5 block font-serif text-[11px] font-black">{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Live Operations Queue */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-5`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.panelQueue}</h3>
            <Link href="/admin/bookings" className="text-[10px] font-black text-[#D1AF47] hover:underline">{t.panelQueueFooter}</Link>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            {[
              { title: t.queueItem1, meta: t.queueItem1Meta, status: t.opFinance, tone: "bg-[#D1AF47]/10 text-[#B8952E]" },
              { title: t.queueItem2, meta: t.queueItem2Meta, status: t.opCompliance, tone: "bg-[#3B82F6]/10 text-[#3B82F6]" },
              { title: t.queueItem3, meta: t.queueItem3Meta, status: t.opRisk, tone: "bg-[#EF4444]/10 text-[#EF4444]" },
              { title: t.queueItem4, meta: t.queueItem4Meta, status: t.opTreasury, tone: "bg-[#22C55E]/10 text-[#22C55E]" },
            ].map((item) => (
              <div key={item.title} className={`flex items-center justify-between gap-2 rounded-xl border border-[#EFEFEF] bg-[#F7F7F5] p-2.5 ${flip}`}>
                <div className="min-w-0">
                  <strong className="block truncate text-xs font-bold">{item.title}</strong>
                  <span className="mt-0.5 block truncate text-[9px] font-semibold text-[#667085]">{item.meta}</span>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${item.tone}`}>{item.status}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Verification Intelligence */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <div className={`mb-2 flex flex-shrink-0 items-center justify-between ${flip}`}>
            <h3 className={eyebrow}>{t.panelVerify}</h3>
            <Link href="/admin/providers" className="text-[10px] font-black text-[#D1AF47] hover:underline">{t.panelVerifyFooter}</Link>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            {audits.slice(0, 4).map((audit) => (
              <div key={audit.id} className={`flex items-center justify-between gap-2 rounded-xl border border-[#EFEFEF] bg-[#F7F7F5] p-2 ${flip}`}>
                <div className="min-w-0">
                  <strong className="block truncate text-xs font-bold">{audit.business_name_en}</strong>
                  <span className="block text-[8px] font-black uppercase tracking-wider text-[#667085]">{audit.type}</span>
                </div>
                <Link href="/admin/providers" className="flex-shrink-0 rounded-lg bg-[#D1AF47] px-2.5 py-1.5 text-[8px] font-black text-white">{t.auditBtn}</Link>
              </div>
            ))}
          </div>
        </section>

        {/* Trust & Risk */}
        <section className={`${cardBase} flex min-h-0 flex-col justify-center p-4 lg:col-span-4`}>
          <h3 className={`${eyebrow} mb-2 flex-shrink-0`}>{t.panelTrust}</h3>
          <div className="space-y-2">
            {([[t.rowIdentity, 96, "96.2%"], [t.rowFraud, 99, "99.1%"], [t.rowResolution, 82, "82.0%"]] as [string, number, string][]).map(([label, value, detail]) => (
              <div key={label}>
                <div className={`mb-1 flex items-center justify-between text-[9px] font-bold ${flip}`}><span>{label}</span><span className="text-[#667085]">{detail}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#F0EEE9]"><div className="h-full rounded-full bg-gradient-to-r from-[#D1AF47] to-[#E0C46A]" style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {[[t.flagged, "8"], [t.escalated, "3"], [t.resolved, "42"]].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#EFEFEF] bg-[#F7F7F5] p-1.5 text-center">
                <span className="block text-[8px] font-black uppercase text-[#667085]">{label}</span>
                <strong className="block font-serif text-sm font-black">{value}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Operations */}
        <section className={`${cardBase} flex min-h-0 flex-col p-4 lg:col-span-4`}>
          <h3 className={`${eyebrow} mb-2 flex-shrink-0`}>{t.panelQuickOps}</h3>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pe-0.5">
            {[
              ["/admin/disputes", t.quickOp1Title, t.quickOp1Detail],
              ["/admin/ledger", t.quickOp2Title, t.quickOp2Detail],
              ["/admin/providers", t.quickOp3Title, t.quickOp3Detail],
              ["/admin/bookings", t.quickOp4Title, t.quickOp4Detail],
            ].map(([href, title, detail]) => (
              <Link key={href} href={href} className={`flex items-center justify-between gap-2 rounded-xl border border-[#EFEFEF] bg-[#F7F7F5] p-2.5 transition hover:border-[#D1AF47]/40 ${flip}`}>
                <div className="min-w-0">
                  <strong className="block truncate text-xs font-bold">{title}</strong>
                  <span className="block truncate text-[9px] font-semibold text-[#667085]">{detail}</span>
                </div>
                <span className="flex-shrink-0 text-sm font-black text-[#D1AF47]">{isRTL ? "←" : "→"}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
