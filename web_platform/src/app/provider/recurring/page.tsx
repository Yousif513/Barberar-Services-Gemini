"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, ForbiddenNotice, OperationsField as Field, OperationsPanel as Panel, isForbidden,
  operationsButton as button, operationsDate, operationsInput as input, useOperationsLocale,
} from "@/components/operations-ui";
import {
  MAX_OCCURRENCES, MIN_OCCURRENCES, SERIES_PAGE_SIZE, bookingStatusLabel, describeRecurringError, recurringCopy,
} from "@/lib/recurring";
import { useProviderContext } from "../_components/provider-context";

type Names = { name_en: string; name_ar: string } | null;
type Row = {
  id: string;
  status: "active" | "cancelled";
  interval_weeks: number;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
  services: Names;
  employees: Names;
  booking_series_occurrences: {
    occurrence_no: number;
    target_at: string;
    state: "anchor" | "booked" | "skipped";
    payment_due_at: string | null;
    bookings: { id: string; status: string; scheduled_at: string } | null;
  }[];
};
type Settings = { enabled: boolean; max_occurrences: number | null; payment_hold_hours: number | null };

const SELECT = `id, status, interval_weeks, created_at, profiles ( first_name, last_name ), services ( name_en, name_ar ), employees ( name_en, name_ar ),
  booking_series_occurrences ( occurrence_no, target_at, state, payment_due_at, bookings ( id, status, scheduled_at ) )`;

export default function ProviderRecurringPage() {
  const locale = useOperationsLocale();
  const t = recurringCopy[locale];
  const provider = useProviderContext();
  const providerId = provider.status === "ready" ? provider.context.providerId : null;
  const isOwner = provider.status === "ready" && provider.context.role === "owner";

  const [settings, setSettings] = useState<Settings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [max, setMax] = useState("");
  const [hold, setHold] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ max?: string; hold?: string }>({});
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("provider_recurring_settings")
        .select("enabled, max_occurrences, payment_hold_hours").eq("provider_id", providerId).maybeSingle();
      if (!live) return;
      if (error) { setForbidden(isForbidden(error)); setSettingsError(describeRecurringError(error, locale)); return; }
      const current = (data as Settings | null) ?? { enabled: false, max_occurrences: null, payment_hold_hours: null };
      setSettings(current);
      setEnabled(current.enabled);
      setMax(current.max_occurrences == null ? "" : String(current.max_occurrences));
      setHold(current.payment_hold_hours == null ? "" : String(current.payment_hold_hours));
      setSettingsError("");
    })();
    return () => { live = false; };
  }, [providerId, reload, locale]);

  useEffect(() => {
    if (!providerId) return;
    let live = true;
    void (async () => {
      setLoading(true);
      setListError("");
      const from = page * SERIES_PAGE_SIZE;
      const { data, error, count } = await supabase.from("booking_series").select(SELECT, { count: "exact" })
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .range(from, from + SERIES_PAGE_SIZE - 1);
      if (!live) return;
      if (error) { setRows([]); setTotal(0); setListError(describeRecurringError(error, locale)); }
      else { setRows((data ?? []) as unknown as Row[]); setTotal(count ?? 0); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, page, reload, locale]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!providerId || saving) return;
    const errors: { max?: string; hold?: string } = {};
    const maxNumber = max.trim() === "" ? null : Number(max);
    const holdNumber = hold.trim() === "" ? null : Number(hold);
    if (enabled && (maxNumber == null || !Number.isInteger(maxNumber) || maxNumber < MIN_OCCURRENCES || maxNumber > MAX_OCCURRENCES)) errors.max = t.maxInvalid;
    if (holdNumber != null && (!Number.isInteger(holdNumber) || holdNumber < 1 || holdNumber > 168)) errors.hold = t.holdInvalid;
    setFieldErrors(errors);
    if (errors.max || errors.hold) return;
    setSaving(true);
    const { error } = await supabase.rpc("set_provider_recurring_settings", {
      p_provider_id: providerId, p_enabled: enabled, p_max_occurrences: maxNumber, p_payment_hold_hours: holdNumber, p_reason: null,
    });
    setSaving(false);
    if (error) { setResult({ error: describeRecurringError(error, locale) }); return; }
    setResult({ success: t.saved });
    setReload((n) => n + 1);
  };

  const pages = Math.max(1, Math.ceil(total / SERIES_PAGE_SIZE));
  const name = (n: Names) => (n ? (locale === "ar" ? n.name_ar : n.name_en) : "");

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.providerTitle}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.providerSubtitle}</p>
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />

      {provider.status === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {provider.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{provider.message}</span><button type="button" className={button} onClick={provider.retry}>{t.retry}</button>
        </div>
      )}
      {provider.status === "ready" && !providerId && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{t.noProvider}</p>}
      {forbidden && <ForbiddenNotice locale={locale} />}

      {providerId && (
        <>
          <Panel title={t.settingsTitle}>
            {settingsError && !forbidden && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{settingsError}</p>}
            <form onSubmit={save} className="grid gap-4 md:max-w-xl" noValidate>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" role="switch" className="mt-1 h-4 w-4" checked={enabled} disabled={!isOwner || saving || !settings} onChange={(e) => setEnabled(e.target.checked)} />
                <span><span className="font-semibold">{t.enable}</span><span className="block text-xs text-[#667085]">{t.enableHelp}</span></span>
              </label>
              <Field label={t.maxLabel}>
                <input className={input} type="number" inputMode="numeric" min={MIN_OCCURRENCES} max={MAX_OCCURRENCES} value={max} disabled={!isOwner || saving || !settings}
                  aria-invalid={Boolean(fieldErrors.max)} aria-describedby="recurring-max-help" onChange={(e) => setMax(e.target.value)} />
                <span id="recurring-max-help" className={fieldErrors.max ? "text-red-700" : "font-normal"}>{fieldErrors.max ?? t.maxHelp}</span>
              </Field>
              <Field label={t.holdLabel}>
                <input className={input} type="number" inputMode="numeric" min={1} max={168} value={hold} disabled={!isOwner || saving || !settings}
                  aria-invalid={Boolean(fieldErrors.hold)} aria-describedby="recurring-hold-help" onChange={(e) => setHold(e.target.value)} />
                <span id="recurring-hold-help" className={fieldErrors.hold ? "text-red-700" : "font-normal"}>{fieldErrors.hold ?? t.holdHelp}</span>
              </Field>
              {isOwner
                ? <div><button className={button} disabled={saving || !settings}>{saving ? t.saving : t.save}</button></div>
                : <p className="text-sm text-[#667085]">{t.ownerOnly}</p>}
            </form>
          </Panel>

          <Panel title={t.seriesListTitle}>
            {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
            {!loading && listError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <span>{t.loadFailed} {listError}</span><button type="button" className={button} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
              </div>
            )}
            {!loading && !listError && rows.length === 0 && <p className="text-sm text-[#667085]">{t.noSeries}</p>}
            {!loading && rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-start text-sm">
                  <caption className="sr-only">{t.seriesListTitle}</caption>
                  <thead>
                    <tr className="text-xs text-[#667085]">
                      <th scope="col" className="py-2 pe-3 text-start">{t.customer}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.service}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.professional}</th>
                      <th scope="col" className="py-2 pe-3 text-start">{t.appointments}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((series) => (
                      <tr key={series.id} className="border-t border-[#EEE8D6] align-top">
                        <td className="py-3 pe-3 font-semibold">{[series.profiles?.first_name, series.profiles?.last_name].filter(Boolean).join(" ")}</td>
                        <td className="py-3 pe-3">{name(series.services)}<span className="block text-xs text-[#667085]">{t.everyN(series.interval_weeks)} · {t.seriesState[series.status]}</span></td>
                        <td className="py-3 pe-3">{name(series.employees)}</td>
                        <td className="py-3 pe-3">
                          <ul className="space-y-1">
                            {[...series.booking_series_occurrences].sort((a, b) => a.occurrence_no - b.occurrence_no).map((o) => (
                              <li key={o.occurrence_no} className="text-xs">
                                {o.occurrence_no}. {operationsDate(o.bookings?.scheduled_at ?? o.target_at, locale)} ·{" "}
                                <span className="font-semibold">{bookingStatusLabel(o.state === "skipped" ? "skipped" : o.bookings?.status, locale)}</span>
                                {o.bookings?.status === "pending_payment" && o.payment_due_at && ` · ${t.deadline}: ${operationsDate(o.payment_due_at, locale)}`}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3"><Link href="/provider/bookings" className={button}>{t.viewBookings}</Link></div>
              </div>
            )}
            {!loading && !listError && total > SERIES_PAGE_SIZE && (
              <nav aria-label={t.seriesListTitle} className="mt-4 flex items-center justify-between gap-3">
                <button type="button" className={button} disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prev}</button>
                <span className="text-sm text-[#667085]">{t.page(page + 1, pages)}</span>
                <button type="button" className={button} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>{t.next}</button>
              </nav>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
