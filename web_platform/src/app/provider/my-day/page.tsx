"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { bookingStatusLabel, formatBookingDate, formatBookingTime, riyadhDateKey } from "@/lib/booking-display.mjs";
import { useProviderContext } from "../_components/provider-context";
import { providerGhostButton, providerPrimaryButton } from "../_components/dialog";
import { MyLeaveSection } from "../_components/my-leave";

const copy = {
  en: {
    title: "My day",
    subtitle: "Your appointments for today, and what you have earned.",
    notEmployeeTitle: "This screen is for professionals",
    notEmployeeBody: "Your account manages the business. Use the calendar and bookings screens instead.",
    toDashboard: "Go to the dashboard",
    noBusinessTitle: "No business is linked to your account",
    noBusinessBody: "Ask the business owner to add you as a professional with this account, then sign in again.",
    today: "Today",
    empty: "You have no appointments today.",
    loadFailed: "Your appointments could not be loaded: ",
    refresh: "Refresh",
    customer: "Customer",
    walkIn: "Walk-in customer",
    unknownService: "Service",
    minutes: "min",
    checkedIn: "Checked in",
    checkIn: "Check in",
    complete: "Mark completed",
    noShow: "Mark no-show",
    noShowTitle: "Mark this customer as a no-show?",
    noShowIntro: "The no-show fee from your booking policy is applied to the deposit. This cannot be undone.",
    noShowReason: "What happened",
    noShowConfirm: "Mark no-show",
    updated: "The appointment was updated.",
    actionFailed: "The appointment was not updated: ",
    earnings: "My earnings",
    earningsThisMonth: "This month",
    earningsLastMonth: "Last month",
    completedLabel: "{n} completed",
    earningsFailed: "Your earnings could not be loaded: ",
    noEarnings: "Nothing earned yet.",
    start: "Start",
    status: "Status",
  },
  ar: {
    title: "يومي",
    subtitle: "مواعيدك لهذا اليوم، وما حققته من أرباح.",
    notEmployeeTitle: "هذه الشاشة للأخصائيين",
    notEmployeeBody: "حسابك يدير النشاط التجاري. استخدم شاشتي التقويم والحجوزات.",
    toDashboard: "الذهاب إلى لوحة التحكم",
    noBusinessTitle: "لا يوجد نشاط تجاري مرتبط بحسابك",
    noBusinessBody: "اطلب من صاحب النشاط إضافتك كأخصائي بهذا الحساب ثم سجّل الدخول من جديد.",
    today: "اليوم",
    empty: "لا توجد مواعيد لك اليوم.",
    loadFailed: "تعذر تحميل مواعيدك: ",
    refresh: "تحديث",
    customer: "العميل",
    walkIn: "عميل حضوري",
    unknownService: "خدمة",
    minutes: "د",
    checkedIn: "تم تسجيل الوصول",
    checkIn: "تسجيل الوصول",
    complete: "تحديد كمكتمل",
    noShow: "تحديد عدم الحضور",
    noShowTitle: "تحديد هذا العميل كغائب؟",
    noShowIntro: "يُطبّق رسم عدم الحضور من سياسة الحجز على العربون. لا يمكن التراجع عن ذلك.",
    noShowReason: "ما الذي حدث",
    noShowConfirm: "تحديد عدم الحضور",
    updated: "تم تحديث الموعد.",
    actionFailed: "لم يُحدَّث الموعد: ",
    earnings: "أرباحي",
    earningsThisMonth: "هذا الشهر",
    earningsLastMonth: "الشهر الماضي",
    completedLabel: "{n} مكتمل",
    earningsFailed: "تعذر تحميل أرباحك: ",
    noEarnings: "لا أرباح بعد.",
    start: "البداية",
    status: "الحالة",
  },
};

type Row = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  checked_in_at: string | null;
  walk_in_name: string | null;
  services: { name_en: string | null; name_ar: string | null } | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};
type Earning = { month_start: string; total_completed_bookings: number; total_employee_earnings: number };

// Riyadh day boundaries as instants, so "today" is the same day for the professional whatever their phone's time zone is.
function riyadhDayRange(now: Date) {
  const key = riyadhDateKey(now) as string;
  const start = new Date(`${key}T00:00:00+03:00`);
  return { key, start: start.toISOString(), end: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() };
}

export default function MyDayPage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const state = useProviderContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [earningsError, setEarningsError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [noShowFor, setNoShowFor] = useState<Row | null>(null);
  const [version, setVersion] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const employeeId = state.status === "ready" && state.context.role === "employee" ? state.context.employeeId : null;

  useEffect(() => {
    if (!employeeId) return;
    let live = true;
    void (async () => {
      const { start, end } = riyadhDayRange(new Date());
      const [bookings, summary] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, scheduled_at, duration_minutes, status, checked_in_at, walk_in_name, services ( name_en, name_ar ), profiles ( first_name, last_name )")
          .eq("employee_id", employeeId)
          .gte("scheduled_at", start)
          .lt("scheduled_at", end)
          .neq("status", "cancelled")
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("employee_earnings_summary")
          .select("month_start, total_completed_bookings, total_employee_earnings")
          .eq("employee_id", employeeId)
          .order("month_start", { ascending: false })
          .limit(2),
      ]);
      if (!live) return;
      setLoadError(bookings.error ? t.loadFailed + errorMessage(bookings.error) : "");
      setRows(bookings.error ? [] : ((bookings.data ?? []) as unknown as Row[]));
      setEarningsError(summary.error ? t.earningsFailed + errorMessage(summary.error) : "");
      setEarnings(summary.error ? [] : ((summary.data ?? []) as Earning[]));
      setNowMs(Date.now());
      setLoading(false);
    })();
    return () => { live = false; };
  }, [employeeId, version, t.loadFailed, t.earningsFailed]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const update = async (row: Row, status: "in_service" | "completed" | "no_show", notes: string | null): Promise<string | null> => {
    setBusyId(row.id);
    const { error } = await supabase.rpc("employee_update_booking_status", { p_booking_id: row.id, p_new_status: status, p_notes: notes });
    setBusyId("");
    if (error) return t.actionFailed + errorMessage(error);
    setResult({ success: t.updated });
    refresh();
    return null;
  };
  const runSimple = async (row: Row, status: "in_service" | "completed") => {
    const message = await update(row, status, null);
    if (message) setResult({ error: message });
  };

  if (state.status === "loading") return <p role="status" className="p-6 text-sm font-semibold text-[#667085]">…</p>;
  if (state.status === "error") return null; // the layout already shows the failure with a retry
  if (state.context.role === "none") {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-[#ECECEC] bg-white p-8 text-start">
        <h1 className="font-serif text-2xl font-black text-[#101828]">{t.noBusinessTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#475467]">{t.noBusinessBody}</p>
      </section>
    );
  }
  if (state.context.role !== "employee") {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-[#ECECEC] bg-white p-8 text-start">
        <h1 className="font-serif text-2xl font-black text-[#101828]">{t.notEmployeeTitle}</h1>
        <p className="mt-2 text-sm leading-6 text-[#475467]">{t.notEmployeeBody}</p>
        <Link href="/provider/dashboard" className={`${providerGhostButton} mt-4 inline-block`}>{t.toDashboard}</Link>
      </section>
    );
  }

  const monthKey = (riyadhDateKey(new Date()) as string).slice(0, 7);
  const thisMonth = earnings.find((row) => String(row.month_start).slice(0, 7) === monthKey);
  const lastMonth = earnings.find((row) => String(row.month_start).slice(0, 7) !== monthKey);
  const displayName = locale === "ar" ? state.context.employeeNameAr || state.context.employeeNameEn : state.context.employeeNameEn || state.context.employeeNameAr;

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-start">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-black text-[#101828]">{t.title}</h1>
          <p className="mt-1 text-sm text-[#667085]">{displayName} · {formatBookingDate(new Date().toISOString(), locale)}</p>
          <p className="text-sm text-[#667085]">{t.subtitle}</p>
        </div>
        <button type="button" onClick={refresh} className={providerGhostButton}>{t.refresh}</button>
      </header>

      <section aria-label={t.today} className="space-y-3">
        {loadError && <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-sm font-semibold text-[#B42318]">{loadError}</div>}
        {loading && !loadError && <p role="status" className="text-sm text-[#667085]">…</p>}
        {!loading && !loadError && rows.length === 0 && <p className="rounded-2xl border border-[#ECECEC] bg-white p-6 text-sm text-[#475467]">{t.empty}</p>}
        <ul className="space-y-3">
          {rows.map((row) => {
            const started = new Date(row.scheduled_at).getTime() <= nowMs;
            const confirmed = row.status === "confirmed";
            const customer = [row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(" ") || row.walk_in_name || t.walkIn;
            const service = (locale === "ar" ? row.services?.name_ar || row.services?.name_en : row.services?.name_en || row.services?.name_ar) || t.unknownService;
            return (
              <li key={row.id} className="rounded-2xl border border-[#ECECEC] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-[#101828]" dir="ltr">{formatBookingTime(row.scheduled_at, locale)}</p>
                    <p className="mt-0.5 text-sm font-bold text-[#344054]">{customer}</p>
                    <p className="text-xs text-[#667085]">{service}{row.duration_minutes ? ` · ${row.duration_minutes} ${t.minutes}` : ""}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full border border-[#D1AF47]/40 bg-[#F8F3E4] px-3 py-1 text-xs font-black text-[#725517]">{bookingStatusLabel(row.status, locale)}</span>
                    {row.checked_in_at && <span className="text-xs font-semibold text-[#067647]">{t.checkedIn}</span>}
                  </div>
                </div>
                {confirmed && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!row.checked_in_at && (
                      <button type="button" disabled={busyId === row.id} onClick={() => void runSimple(row, "in_service")} className={providerGhostButton}>{t.checkIn}</button>
                    )}
                    {started && (
                      <button type="button" disabled={busyId === row.id} onClick={() => void runSimple(row, "completed")} className={providerPrimaryButton}>{t.complete}</button>
                    )}
                    {started && (
                      <button type="button" disabled={busyId === row.id} onClick={() => setNoShowFor(row)} className="rounded-xl border border-[#FECDCA] bg-white px-4 py-2.5 text-sm font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.noShow}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="my-earnings" className="rounded-2xl border border-[#ECECEC] bg-white p-5">
        <h2 id="my-earnings" className="font-serif text-xl font-black text-[#101828]">{t.earnings}</h2>
        {earningsError && <p role="alert" className="mt-3 text-sm font-semibold text-[#B42318]">{earningsError}</p>}
        {!earningsError && earnings.length === 0 && <p className="mt-3 text-sm text-[#667085]">{t.noEarnings}</p>}
        {!earningsError && earnings.length > 0 && (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {[{ label: t.earningsThisMonth, row: thisMonth }, { label: t.earningsLastMonth, row: lastMonth }].map(({ label, row }) => (
              <div key={label} className="rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-3">
                <dt className="text-xs font-bold text-[#667085]">{label}</dt>
                <dd className="mt-1 text-lg font-black text-[#101828]">{row ? sar(Number(row.total_employee_earnings), locale) : "—"}</dd>
                {row && <dd className="text-xs text-[#667085]">{t.completedLabel.replace("{n}", String(row.total_completed_bookings))}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>

      <MyLeaveSection lang={locale} employeeId={state.context.employeeId as string} />

      {noShowFor && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={t.noShowTitle}
          intro={t.noShowIntro}
          facts={[
            { label: t.customer, value: [noShowFor.profiles?.first_name, noShowFor.profiles?.last_name].filter(Boolean).join(" ") || noShowFor.walk_in_name || t.walkIn },
            { label: t.start, value: formatBookingTime(noShowFor.scheduled_at, locale) },
          ]}
          reasonLabel={t.noShowReason}
          confirmLabel={t.noShowConfirm}
          onConfirm={(reason) => update(noShowFor, "no_show", reason)}
          onClose={() => setNoShowFor(null)}
        />
      )}
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />
    </div>
  );
}
