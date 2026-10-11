"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import { CommandResult, operationsButton, operationsDate, useOperationsLocale } from "@/components/operations-ui";
import {
  SERIES_PAGE_SIZE, bookingStatusLabel, describeRecurringError, recurringCopy,
  type SeriesCancelled,
} from "@/lib/recurring";

type Names = { name_en: string; name_ar: string } | null;
type OccurrenceRow = {
  occurrence_no: number;
  target_at: string;
  state: "anchor" | "booked" | "skipped";
  skip_reason: string | null;
  payment_due_at: string | null;
  booking_id: string | null;
  bookings: { id: string; status: string; scheduled_at: string } | null;
};
type SeriesRow = {
  id: string;
  status: "active" | "cancelled";
  interval_weeks: number;
  occurrences_requested: number;
  created_at: string;
  services: Names;
  employees: Names;
  providers: { business_name_en: string; business_name_ar: string } | null;
  booking_series_occurrences: OccurrenceRow[];
};

const SELECT = `id, status, interval_weeks, occurrences_requested, created_at,
  services ( name_en, name_ar ), employees ( name_en, name_ar ), providers ( business_name_en, business_name_ar ),
  booking_series_occurrences ( occurrence_no, target_at, state, skip_reason, payment_due_at, booking_id, bookings ( id, status, scheduled_at ) )`;

export default function CustomerSeriesPage() {
  const locale = useOperationsLocale();
  const t = recurringCopy[locale];
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [payingId, setPayingId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<{ series: SeriesRow; from: string | null } | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      setLoadError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!live) return;
      if (!user) { setRows([]); setTotal(0); setLoading(false); return; }
      const from = page * SERIES_PAGE_SIZE;
      const { data, error, count } = await supabase
        .from("booking_series")
        .select(SELECT, { count: "exact" })
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .range(from, from + SERIES_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setTotal(0); setLoadError(describeRecurringError(error, locale)); }
      else { setRows((data ?? []) as unknown as SeriesRow[]); setTotal(count ?? 0); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [page, reload, locale]);

  const pay = useCallback(async (bookingId: string) => {
    setPayingId(bookingId);
    try {
      const { data, error } = await supabase.functions.invoke("payment-checkout", { body: { bookingId } });
      if (error || !data?.checkoutUrl) throw new Error("no checkout url");
      window.location.assign(data.checkoutUrl);
    } catch {
      setResult({ error: t.payFailed });
      setPayingId("");
    }
  }, [t.payFailed]);

  const cancel = async (reason: string): Promise<string | null> => {
    if (!cancelTarget) return null;
    const { data, error } = await supabase.rpc("cancel_booking_series", {
      p_series_id: cancelTarget.series.id, p_reason: reason.trim() || null, p_from: cancelTarget.from,
    });
    if (error) return describeRecurringError(error, locale);
    const done = data as SeriesCancelled;
    setResult(done.failed > 0 ? { error: t.cancelPartial(done.cancelled, done.failed) } : { success: t.cancelledDone(done.cancelled) });
    setReload((n) => n + 1);
    return null;
  };

  const pages = Math.max(1, Math.ceil(total / SERIES_PAGE_SIZE));
  const upcoming = (series: SeriesRow, o: OccurrenceRow) => o.bookings && ["pending_payment", "confirmed"].includes(o.bookings.status) && new Date(o.bookings.scheduled_at).getTime() > Date.now() && series.status === "active";

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.seriesTitle}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.seriesSubtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />

      {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {!loading && loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.loadFailed} {loadError}</span>
          <button type="button" className={operationsButton} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
        </div>
      )}
      {!loading && !loadError && rows.length === 0 && (
        <div className="rounded-2xl border border-[#D1AF47]/35 bg-white p-8 text-center">
          <h2 className="font-serif text-xl font-bold">{t.emptyTitle}</h2>
          <p className="mt-2 text-sm text-[#667085]">{t.emptyBody}</p>
          <Link href="/customer/bookings" className={`${operationsButton} mt-4 inline-block`}>{t.goBookings}</Link>
        </div>
      )}

      {!loading && rows.map((series) => {
        const occurrences = [...series.booking_series_occurrences].sort((a, b) => a.occurrence_no - b.occurrence_no);
        const anyUpcoming = occurrences.some((o) => upcoming(series, o));
        const name = (n: Names) => (n ? (locale === "ar" ? n.name_ar : n.name_en) : "");
        return (
          <section key={series.id} aria-label={name(series.services)} className="rounded-[24px] border border-[#D1AF47]/35 bg-white/90 p-5 shadow-[0_8px_24px_rgba(56,44,16,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl font-bold">{name(series.services)}</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  {series.providers ? (locale === "ar" ? series.providers.business_name_ar : series.providers.business_name_en) : ""}
                  {series.employees ? ` · ${name(series.employees)}` : ""} · {t.everyN(series.interval_weeks)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#E8DDC0] bg-[#F7F3EA] px-3 py-1 text-xs font-bold">{t.seriesState[series.status] ?? series.status}</span>
                {anyUpcoming && <button type="button" className={operationsButton} onClick={() => setCancelTarget({ series, from: null })}>{t.cancelAll}</button>}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-start text-sm">
                <caption className="sr-only">{name(series.services)}</caption>
                <thead>
                  <tr className="text-xs text-[#667085]">
                    <th scope="col" className="py-2 pe-3 text-start">#</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.date}</th>
                    <th scope="col" className="py-2 pe-3 text-start">{t.status}</th>
                    <th scope="col" className="py-2 text-start"><span className="sr-only">{t.cancelFrom}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {occurrences.map((o) => {
                    const status = o.state === "skipped" ? "skipped" : o.bookings?.status ?? null;
                    const awaiting = o.bookings?.status === "pending_payment" && series.status === "active";
                    return (
                      <tr key={o.occurrence_no} className="border-t border-[#EEE8D6] align-top">
                        <td className="py-3 pe-3">{o.occurrence_no}</td>
                        <td className="py-3 pe-3">{operationsDate(o.bookings?.scheduled_at ?? o.target_at, locale)}</td>
                        <td className="py-3 pe-3">
                          <span className="font-semibold">{bookingStatusLabel(status, locale)}</span>
                          {o.state === "skipped" && o.skip_reason && <span className="block text-xs text-[#667085]">{t.skippedReason[o.skip_reason] ?? o.skip_reason}</span>}
                          {awaiting && o.payment_due_at && <span className="block text-xs text-amber-800">{t.deadline}: {operationsDate(o.payment_due_at, locale)}</span>}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            {awaiting && o.booking_id && (
                              <button type="button" className={operationsButton} disabled={payingId === o.booking_id} onClick={() => void pay(o.booking_id as string)}>
                                {payingId === o.booking_id ? t.paying : t.payDeposit}
                              </button>
                            )}
                            {upcoming(series, o) && o.bookings && (
                              <button type="button" className={operationsButton} onClick={() => setCancelTarget({ series, from: o.bookings?.scheduled_at ?? o.target_at })}>
                                {t.cancelFrom}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {!loading && !loadError && total > SERIES_PAGE_SIZE && (
        <nav aria-label={t.seriesTitle} className="flex items-center justify-between gap-3">
          <button type="button" className={operationsButton} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
          <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
          <button type="button" className={operationsButton} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
        </nav>
      )}

      {cancelTarget && (
        <CommandDialog
          locale={locale}
          tone="danger"
          title={t.cancelTitle}
          intro={t.cancelIntro}
          facts={cancelTarget.from ? [{ label: t.date, value: operationsDate(cancelTarget.from, locale) }] : []}
          reasonLabel={t.cancelReason}
          reasonRequired={false}
          confirmLabel={t.cancelConfirm}
          onConfirm={cancel}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
