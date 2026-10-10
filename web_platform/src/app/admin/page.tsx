"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { ForbiddenNotice, isForbidden, operationsDate, sar, useOperationsLocale, type OperationsLocale } from "@/components/operations-ui";

// The landing page is an exception router: what is waiting for an operator, how long it has waited and
// where to act on it, plus a few live platform figures. Every number comes from admin_dashboard_overview()
// or a live query; when a source fails the page says so instead of showing invented figures.

type QueueKey =
  | "payout_requests"
  | "payouts_processing"
  | "refund_requests"
  | "disputes"
  | "provider_applications"
  | "data_requests"
  | "expired_holds"
  | "flagged_reviews";

type QueueRow = {
  key: QueueKey;
  count: number;
  oldest_at: string | null;
  amount_sar?: number | string;
  overdue?: number;
  next_due?: string | null;
  failed?: number;
  stalled?: number;
  stuck?: number;
  hold_minutes?: number;
};

type Overview = {
  generated_at: string;
  // D4 (GOV-2): a figure that describes 1 to 4 people comes back null and is named in suppressed.
  kpis: {
    bookings_today: number | null;
    captured_7d_sar: number | string | null;
    platform_share_7d_sar: number | string | null;
    live_providers: number | null;
    customers: number | null;
    completed_30d: number | null;
    finished_30d: number | null;
    suppressed?: string[];
  };
  small_cell_threshold?: number;
  queues: QueueRow[];
  reconciliation: {
    latest: { run_date: string; status: string; discrepancy_amount_sar: number | string | null; created_at: string } | null;
    discrepant_30d: number;
  };
};

type Named = { name_en: string | null; name_ar: string | null };
type RecentBooking = {
  id: string;
  scheduled_at: string;
  status: string;
  total_price: number | string | null;
  services: Named | null;
  branches: (Named & { providers: { business_name_en: string | null; business_name_ar: string | null } | null }) | null;
};
type AuditRow = { id: string; action: string; target_type: string | null; actor_id: string | null; created_at: string; actorName: string };

const QUEUE_ROUTES: Record<QueueKey, string> = {
  payout_requests: "/admin/ledger",
  payouts_processing: "/admin/ledger",
  refund_requests: "/admin/refunds",
  disputes: "/admin/disputes",
  provider_applications: "/admin/providers?tab=applications&appStatus=pending",
  data_requests: "/admin/customers?tab=requests",
  expired_holds: "/admin/bookings?status=pending_payment",
  flagged_reviews: "/admin/reviews",
};

const translations = {
  en: {
    welcome: "Welcome back",
    subtitle: "Work waiting for an operator and live platform figures. Times are shown in Riyadh time.",
    updated: "Updated {time}",
    refresh: "Refresh",
    activity: "Platform activity",
    helpCenter: "Help Center",
    loading: "Loading the overview…",
    loadFailed: "The overview could not be loaded: {reason}",
    retry: "Try again",
    kpiBookingsToday: "Bookings today",
    kpiBookingsTodayHint: "Scheduled for today and not cancelled",
    kpiCaptured: "Payments captured, 7 days",
    kpiCapturedHint: "Bookings, tips, packages, gift cards and subscriptions",
    kpiCommission: "Platform commission, 7 days",
    kpiCommissionHint: "The platform's share of those payments",
    kpiProviders: "Live providers",
    kpiProvidersHint: "Verified, with an active branch customers can find",
    kpiCustomers: "Customers",
    kpiCustomersHint: "Customer accounts on the platform",
    kpiSuppressed: "Fewer than {n}",
    kpiSuppressedHint: "Hidden because fewer than {n} people are behind this figure",
    kpiCompletion: "Completion rate, 30 days",
    kpiCompletionHint: "{completed} of {finished} finished visits",
    kpiCompletionNone: "No finished visits in the last 30 days",
    attentionTitle: "Needs attention",
    attentionSubtitle: "Each line opens the screen where it is handled.",
    nothingWaiting: "Nothing waiting",
    oldest: "Oldest has waited {age}",
    open: "Open",
    queues: {
      payout_requests: "Payout requests awaiting a decision",
      payouts_processing: "Approved payouts not yet marked paid",
      refund_requests: "Refunds not yet returned to customers",
      disputes: "Open payment disputes",
      provider_applications: "Provider applications to review",
      data_requests: "Personal data requests (PDPL)",
      expired_holds: "Unpaid holds past the hold time",
      flagged_reviews: "Reviews flagged for moderation",
    } as Record<QueueKey, string>,
    overdue: "{n} past the due date",
    nextDue: "Next due {date}",
    failedRefunds: "{n} refused by the gateway",
    stalledRefunds: "{n} no longer retried automatically",
    stuckRefunds: "{n} stuck in progress",
    holdTime: "Hold time {m} min",
    reconTitle: "Payment reconciliation",
    reconNone: "No reconciliation has run yet.",
    reconLatest: "Latest run, for {date}",
    reconStatus: { matched: "Matched", discrepant: "Discrepancy", resolved: "Resolved" } as Record<string, string>,
    reconDifference: "Difference {amount}",
    reconDiscrepant30: "Days with a discrepancy in the last 30 days: {n}",
    reconOpen: "Open the ledger",
    recentBookings: "Latest bookings",
    recentBookingsEmpty: "No bookings yet.",
    recentActivity: "Latest operator actions",
    recentActivityEmpty: "No operator actions recorded yet.",
    viewAll: "View all",
    sectionFailed: "Could not load: {reason}",
    system: "System",
    statuses: { pending_payment: "Awaiting payment", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as Record<string, string>,
    goTo: "Go to",
    links: [
      { label: "Bookings", href: "/admin/bookings" },
      { label: "Providers", href: "/admin/providers" },
      { label: "Ledger & payouts", href: "/admin/ledger" },
      { label: "Refunds", href: "/admin/refunds" },
      { label: "Disputes", href: "/admin/disputes" },
      { label: "Customers", href: "/admin/customers" },
      { label: "Supply", href: "/admin/supply" },
      { label: "Notifications", href: "/admin/notifications" },
      { label: "Audit log", href: "/admin/audit-logs" },
    ],
  },
  ar: {
    welcome: "مرحباً بعودتك",
    subtitle: "الأعمال التي تنتظر إجراءً من المشرف وأرقام المنصة المباشرة. الأوقات بتوقيت الرياض.",
    updated: "آخر تحديث {time}",
    refresh: "تحديث",
    activity: "نشاط المنصة",
    helpCenter: "مركز المساعدة",
    loading: "جارٍ تحميل النظرة العامة…",
    loadFailed: "تعذّر تحميل النظرة العامة: {reason}",
    retry: "إعادة المحاولة",
    kpiBookingsToday: "حجوزات اليوم",
    kpiBookingsTodayHint: "المجدولة لليوم وغير الملغاة",
    kpiCaptured: "المدفوعات المحصّلة، ٧ أيام",
    kpiCapturedHint: "الحجوزات والإكراميات والباقات وبطاقات الهدايا والاشتراكات",
    kpiCommission: "عمولة المنصة، ٧ أيام",
    kpiCommissionHint: "حصة المنصة من تلك المدفوعات",
    kpiProviders: "مقدمو الخدمة الظاهرون",
    kpiProvidersHint: "موثقون ولديهم فرع نشط يمكن للعملاء العثور عليه",
    kpiCustomers: "العملاء",
    kpiCustomersHint: "حسابات العملاء على المنصة",
    kpiSuppressed: "أقل من {n}",
    kpiSuppressedHint: "مخفي لأن عدد الأشخاص وراء هذا الرقم أقل من {n}",
    kpiCompletion: "نسبة الإكمال، ٣٠ يوماً",
    kpiCompletionHint: "{completed} من {finished} زيارة منتهية",
    kpiCompletionNone: "لا توجد زيارات منتهية خلال آخر ٣٠ يوماً",
    attentionTitle: "تحتاج إلى إجراء",
    attentionSubtitle: "كل سطر يفتح الشاشة التي تتم معالجته فيها.",
    nothingWaiting: "لا شيء بالانتظار",
    oldest: "مدة انتظار الأقدم: {age}",
    open: "فتح",
    queues: {
      payout_requests: "طلبات سحب الأرباح بانتظار القرار",
      payouts_processing: "مدفوعات معتمدة لم تُسجل كمدفوعة بعد",
      refund_requests: "مبالغ مستردة لم تصل إلى العملاء بعد",
      disputes: "نزاعات دفع مفتوحة",
      provider_applications: "طلبات انضمام مقدمي الخدمة للمراجعة",
      data_requests: "طلبات البيانات الشخصية (نظام حماية البيانات)",
      expired_holds: "حجوزات غير مدفوعة تجاوزت مهلة الحجز",
      flagged_reviews: "تقييمات مُبلغ عنها للمراجعة",
    } as Record<QueueKey, string>,
    overdue: "{n} تجاوزت موعدها النهائي",
    nextDue: "الموعد التالي {date}",
    failedRefunds: "{n} رفضتها بوابة الدفع",
    stalledRefunds: "{n} لم تعد تُعاد محاولتها تلقائياً",
    stuckRefunds: "{n} عالقة قيد المعالجة",
    holdTime: "مهلة الحجز {m} دقيقة",
    reconTitle: "مطابقة المدفوعات",
    reconNone: "لم تُجرَ أي مطابقة بعد.",
    reconLatest: "آخر مطابقة، ليوم {date}",
    reconStatus: { matched: "مطابقة", discrepant: "يوجد فرق", resolved: "تمت المعالجة" } as Record<string, string>,
    reconDifference: "الفرق {amount}",
    reconDiscrepant30: "أيام بها فروقات خلال آخر ٣٠ يوماً: {n}",
    reconOpen: "فتح السجل المالي",
    recentBookings: "أحدث الحجوزات",
    recentBookingsEmpty: "لا توجد حجوزات بعد.",
    recentActivity: "أحدث إجراءات المشرفين",
    recentActivityEmpty: "لم تُسجل إجراءات للمشرفين بعد.",
    viewAll: "عرض الكل",
    sectionFailed: "تعذّر التحميل: {reason}",
    system: "النظام",
    statuses: { pending_payment: "بانتظار الدفع", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر" } as Record<string, string>,
    goTo: "انتقال إلى",
    links: [
      { label: "الحجوزات", href: "/admin/bookings" },
      { label: "مقدمو الخدمة", href: "/admin/providers" },
      { label: "السجل المالي والمدفوعات", href: "/admin/ledger" },
      { label: "المبالغ المستردة", href: "/admin/refunds" },
      { label: "النزاعات", href: "/admin/disputes" },
      { label: "العملاء", href: "/admin/customers" },
      { label: "التوريد", href: "/admin/supply" },
      { label: "الإشعارات", href: "/admin/notifications" },
      { label: "سجل التدقيق", href: "/admin/audit-logs" },
    ],
  },
};

function waited(iso: string, locale: OperationsLocale) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const [value, unit] = minutes < 60 ? [minutes, "minute"] : minutes < 48 * 60 ? [Math.round(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { style: "unit", unit: unit as string, unitDisplay: "long" }).format(Number(value));
}

function count(value: number | string, locale: OperationsLocale) {
  return Number(value).toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
}

function fill(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
}

export default function AdminDashboardPage() {
  const locale = useOperationsLocale();
  const t = translations[locale];
  const isRTL = locale === "ar";

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewForbidden, setOverviewForbidden] = useState(false);
  const [bookings, setBookings] = useState<RecentBooking[] | null>(null);
  const [bookingsError, setBookingsError] = useState("");
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [auditError, setAuditError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [overviewResult, bookingsResult, auditResult, userResult] = await Promise.all([
        supabase.rpc("admin_dashboard_overview"),
        supabase
          .from("bookings")
          .select("id, scheduled_at, status, total_price, services ( name_en, name_ar ), branches ( name_en, name_ar, providers ( business_name_en, business_name_ar ) )")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("admin_audit_logs")
          .select("id, action, target_type, actor_id, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;

      setOverview(overviewResult.error ? null : (overviewResult.data as Overview));
      setOverviewError(overviewResult.error ? errorMessage(overviewResult.error) : "");
      setOverviewForbidden(Boolean(overviewResult.error) && isForbidden(overviewResult.error));
      setBookings(bookingsResult.error ? null : ((bookingsResult.data ?? []) as unknown as RecentBooking[]));
      setBookingsError(bookingsResult.error ? errorMessage(bookingsResult.error) : "");

      if (auditResult.error) {
        setAudit(null);
        setAuditError(errorMessage(auditResult.error));
      } else {
        const rows = (auditResult.data ?? []) as Omit<AuditRow, "actorName">[];
        const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
        const names = new Map<string, string>();
        if (actorIds.length > 0) {
          // GOV-2: names come from admin_people_names (console staff for every role; others only with personal.read, logged).
          const { data: people } = await supabase.rpc("admin_people_names", { p_ids: actorIds, p_purpose: "audit_review" });
          for (const person of (people ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
            names.set(person.id, [person.first_name, person.last_name].filter(Boolean).join(" "));
          }
        }
        if (cancelled) return;
        setAudit(rows.map((row) => ({ ...row, actorName: (row.actor_id && names.get(row.actor_id)) || "" })));
        setAuditError("");
      }

      const userId = userResult.data?.user?.id;
      if (userId) {
        const { data: me } = await supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle();
        if (!cancelled) setFirstName(me?.first_name ?? "");
      }
      if (!cancelled) setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const localName = (item: Named | null | undefined) => (item ? (isRTL ? item.name_ar || item.name_en : item.name_en || item.name_ar) || "" : "");
  const providerName = (b: RecentBooking) => {
    const p = b.branches?.providers;
    return p ? (isRTL ? p.business_name_ar || p.business_name_en : p.business_name_en || p.business_name_ar) || "" : "";
  };
  const generatedTime = overview
    ? new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(overview.generated_at))
    : "";
  const kpis = overview?.kpis;
  const threshold = overview?.small_cell_threshold ?? 5;
  const hiddenValue = fill(t.kpiSuppressed, { n: count(threshold, locale) });
  const hiddenHint = fill(t.kpiSuppressedHint, { n: count(threshold, locale) });
  const completion = kpis && kpis.finished_30d !== null && kpis.completed_30d !== null && kpis.finished_30d > 0
    ? Math.round((kpis.completed_30d / kpis.finished_30d) * 1000) / 10 : null;
  // A suppressed figure reads "Fewer than 5" with the reason, never as zero.
  const tile = (label: string, value: number | string | null, format: (v: number | string) => string, hint: string, href: string) =>
    value === null ? { label, value: hiddenValue, hint: hiddenHint, href } : { label, value: format(value), hint, href };
  const kpiCards = kpis
    ? [
        tile(t.kpiBookingsToday, kpis.bookings_today, (v) => count(v, locale), t.kpiBookingsTodayHint, "/admin/bookings"),
        tile(t.kpiCaptured, kpis.captured_7d_sar, (v) => sar(Number(v), locale), t.kpiCapturedHint, "/admin/ledger"),
        tile(t.kpiCommission, kpis.platform_share_7d_sar, (v) => sar(Number(v), locale), t.kpiCommissionHint, "/admin/ledger"),
        tile(t.kpiProviders, kpis.live_providers, (v) => count(v, locale), t.kpiProvidersHint, "/admin/providers"),
        tile(t.kpiCustomers, kpis.customers, (v) => count(v, locale), t.kpiCustomersHint, "/admin/customers"),
        kpis.finished_30d === null || kpis.completed_30d === null
          ? { label: t.kpiCompletion, value: hiddenValue, hint: hiddenHint, href: "/admin/bookings" }
          : {
              label: t.kpiCompletion,
              value: completion === null ? "—" : `${completion.toLocaleString(isRTL ? "ar-SA" : "en-US")}%`,
              hint: completion === null ? t.kpiCompletionNone : fill(t.kpiCompletionHint, { completed: count(kpis.completed_30d, locale), finished: count(kpis.finished_30d, locale) }),
              href: "/admin/bookings",
            },
      ]
    : [];
  const latestRun = overview?.reconciliation.latest ?? null;

  const dateOnly = (value: string) =>
    new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const sectionTitle = "text-xs font-extrabold uppercase tracking-widest text-[#667085]";
  const smallLink = `rounded-xl border border-[#ECECEC] bg-white px-3 py-1.5 text-[11px] font-black text-[#7A5B12] transition hover:border-[#D1AF47]/40 hover:bg-[#FFFAEB] ${focusRing}`;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 text-[#101828] font-sans pb-10 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Greeting, freshness and the operator's own tools */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {firstName ? `${t.welcome}, ${firstName}` : t.welcome}
          </h1>
          <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
          {overview && <div className="mt-1 text-[11px] font-bold text-[#7A5B12]">{fill(t.updated, { time: generatedTime })}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
            className={`rounded-full border border-[#D1AF47]/40 bg-[#FFFAEB] px-4 py-2.5 text-xs font-black text-[#7A5B12] shadow-sm transition hover:bg-[#F4E7B6] disabled:opacity-50 ${focusRing}`}
          >
            {t.refresh}
          </button>
          <Link href="/admin/activity" className={`rounded-full border border-[#ECECEC] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 ${focusRing}`}>
            {t.activity}
          </Link>
          <Link href="/admin/help" className={`rounded-full border border-[#ECECEC] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 ${focusRing}`}>
            {t.helpCenter}
          </Link>
        </div>
      </header>

      {loading && !overview && !overviewError && (
        <div role="status" className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">{t.loading}</div>
      )}

      {overviewError && overviewForbidden && <ForbiddenNotice locale={locale} />}
      {overviewError && !overviewForbidden && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{fill(t.loadFailed, { reason: overviewError })}</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
            className={`rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 disabled:opacity-50 ${focusRing}`}
          >
            {t.retry}
          </button>
        </div>
      )}

      {overview && (
        <>
          {/* Live platform figures; each card opens the screen behind it */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpiCards.map((card) => (
              <Link key={card.label} href={card.href} className={`${cardBase} flex flex-col gap-2 transition hover:border-[#D1AF47]/40 ${focusRing}`}>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{card.label}</span>
                <strong className="font-serif text-2xl font-black leading-none text-[#101828]">{card.value}</strong>
                <span className="text-[11px] font-semibold text-gray-500">{card.hint}</span>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Work waiting for an operator */}
            <section aria-labelledby="attention-title" className={`${cardBase} lg:col-span-8`}>
              <h3 id="attention-title" className={sectionTitle}>{t.attentionTitle}</h3>
              <div className="mt-1 text-[11px] font-semibold text-gray-500">{t.attentionSubtitle}</div>
              <ul className="mt-3 divide-y divide-[#F2F4F7]">
                {overview.queues.map((queue) => {
                  const waiting = queue.count > 0;
                  const urgent = (queue.key === "data_requests" && (queue.overdue ?? 0) > 0) || (queue.key === "refund_requests" && ((queue.stalled ?? 0) > 0 || (queue.stuck ?? 0) > 0));
                  const details: string[] = [];
                  if (waiting && queue.oldest_at) details.push(fill(t.oldest, { age: waited(queue.oldest_at, locale) }));
                  if (waiting && Number(queue.amount_sar ?? 0) > 0) details.push(sar(Number(queue.amount_sar), locale));
                  if (queue.key === "data_requests" && (queue.overdue ?? 0) > 0) details.push(fill(t.overdue, { n: count(queue.overdue ?? 0, locale) }));
                  if (queue.key === "data_requests" && waiting && queue.next_due) details.push(fill(t.nextDue, { date: dateOnly(queue.next_due) }));
                  if (queue.key === "refund_requests" && (queue.failed ?? 0) > 0) details.push(fill(t.failedRefunds, { n: count(queue.failed ?? 0, locale) }));
                  if (queue.key === "refund_requests" && (queue.stalled ?? 0) > 0) details.push(fill(t.stalledRefunds, { n: count(queue.stalled ?? 0, locale) }));
                  if (queue.key === "refund_requests" && (queue.stuck ?? 0) > 0) details.push(fill(t.stuckRefunds, { n: count(queue.stuck ?? 0, locale) }));
                  if (queue.key === "expired_holds" && waiting && queue.hold_minutes) details.push(fill(t.holdTime, { m: count(queue.hold_minutes, locale) }));
                  return (
                    <li key={queue.key}>
                      <Link href={QUEUE_ROUTES[queue.key]} className={`flex items-center gap-4 rounded-xl px-2 py-3 transition hover:bg-[#FFFAEB] ${focusRing}`}>
                        <span
                          className={`flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-black ${
                            urgent ? "bg-red-50 text-red-700 ring-1 ring-red-200" : waiting ? "bg-[#FFFAEB] text-[#7A5B12] ring-1 ring-[#D1AF47]/40" : "bg-gray-50 text-gray-400"
                          }`}
                        >
                          {count(queue.count, locale)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-bold ${waiting ? "text-gray-900" : "text-gray-500"}`}>{t.queues[queue.key]}</span>
                          <span className={`block text-[11px] font-semibold ${urgent ? "text-red-700" : "text-gray-500"}`}>
                            {waiting ? details.join(" · ") : t.nothingWaiting}
                          </span>
                        </span>
                        <span className="text-[11px] font-black text-[#7A5B12]">{t.open}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Card-network totals against the ledger */}
            <section aria-labelledby="recon-title" className={`${cardBase} flex flex-col lg:col-span-4`}>
              <h3 id="recon-title" className={sectionTitle}>{t.reconTitle}</h3>
              {latestRun ? (
                <div className="mt-4 space-y-2">
                  <div className="text-[11px] font-semibold text-gray-500">{fill(t.reconLatest, { date: dateOnly(latestRun.run_date) })}</div>
                  <div className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${latestRun.status === "discrepant" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {t.reconStatus[latestRun.status] ?? latestRun.status}
                  </div>
                  {Number(latestRun.discrepancy_amount_sar ?? 0) !== 0 && (
                    <div className="text-sm font-bold text-gray-900">{fill(t.reconDifference, { amount: sar(Number(latestRun.discrepancy_amount_sar), locale) })}</div>
                  )}
                </div>
              ) : (
                <div className="mt-4 text-sm font-semibold text-gray-500">{t.reconNone}</div>
              )}
              <div className="mt-3 text-[11px] font-semibold text-gray-500">{fill(t.reconDiscrepant30, { n: count(overview.reconciliation.discrepant_30d, locale) })}</div>
              <div className="mt-auto pt-4">
                <Link href="/admin/ledger" className={smallLink}>{t.reconOpen}</Link>
              </div>
            </section>
          </div>
        </>
      )}

      {(!loading || bookings !== null || audit !== null) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Latest bookings, newest first */}
          <section aria-labelledby="recent-bookings-title" className={cardBase}>
            <div className="flex items-center justify-between gap-3">
              <h3 id="recent-bookings-title" className={sectionTitle}>{t.recentBookings}</h3>
              <Link href="/admin/bookings" className={smallLink}>{t.viewAll}</Link>
            </div>
            {bookingsError ? (
              <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{fill(t.sectionFailed, { reason: bookingsError })}</div>
            ) : bookings && bookings.length === 0 ? (
              <div className="mt-3 text-sm font-semibold text-gray-500">{t.recentBookingsEmpty}</div>
            ) : bookings ? (
              <ul className="mt-2 divide-y divide-[#F2F4F7]">
                {bookings.map((booking) => (
                  <li key={booking.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-gray-900">{providerName(booking) || localName(booking.branches)}</span>
                      <span className="block truncate text-[11px] font-semibold text-gray-500">
                        {[localName(booking.services), operationsDate(booking.scheduled_at, locale)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs font-black text-gray-900">{booking.total_price === null ? "—" : sar(Number(booking.total_price), locale)}</span>
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-600">{t.statuses[booking.status] ?? booking.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* Latest operator actions from the audit log */}
          <section aria-labelledby="recent-activity-title" className={cardBase}>
            <div className="flex items-center justify-between gap-3">
              <h3 id="recent-activity-title" className={sectionTitle}>{t.recentActivity}</h3>
              <Link href="/admin/audit-logs" className={smallLink}>{t.viewAll}</Link>
            </div>
            {auditError ? (
              <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">{fill(t.sectionFailed, { reason: auditError })}</div>
            ) : audit && audit.length === 0 ? (
              <div className="mt-3 text-sm font-semibold text-gray-500">{t.recentActivityEmpty}</div>
            ) : audit ? (
              <ul className="mt-2 divide-y divide-[#F2F4F7]">
                {audit.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span dir="ltr" className="block truncate font-mono text-xs font-bold text-gray-900">{row.action}</span>
                      <span className="block truncate text-[11px] font-semibold text-gray-500">{[row.actorName || t.system, row.target_type].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-gray-500">{operationsDate(row.created_at, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      )}

      {/* Shortcuts to the screens operators use most */}
      <nav aria-label={t.goTo} className={cardBase}>
        <h3 className={sectionTitle}>{t.goTo}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {t.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-[#D1AF47]/40 hover:bg-[#FFFAEB] ${focusRing}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
