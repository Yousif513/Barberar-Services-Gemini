"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { operationsDate, useOperationsLocale } from "@/components/operations-ui";
import {
  MAX_OCCURRENCES, MIN_OCCURRENCES, describeRecurringError, recurringCopy,
  type SeriesCreated, type SeriesPreview,
} from "@/lib/recurring";

type RegularBooking = { id: string; status: string; scheduled_at: string; is_home_service?: boolean | null };

const field = "w-full rounded-xl border border-[#D8D2C5] bg-white px-3 py-2.5 text-sm text-[#101828] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50";
const primary = "rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1D2939] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-xl border border-[#D1AF47]/50 bg-[#F8F3E4] px-4 py-2.5 text-sm font-bold text-[#725517] transition hover:bg-[#F4E7B6] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";

// "Make this a regular": turns one confirmed, upcoming booking into a repeating series with the same professional and service.
// The dates are checked first (nothing is written), then the series is booked by one server command. A retry of the same
// request carries the same key, so it can never book twice.
export default function MakeRegularButton({ booking, className }: { booking: RegularBooking; className?: string }) {
  const locale = useOperationsLocale();
  const t = recurringCopy[locale];
  const [open, setOpen] = useState(false);
  const [opened] = useState(() => Date.now());
  const eligible = booking.status === "confirmed" && !booking.is_home_service && new Date(booking.scheduled_at).getTime() > opened;
  if (!eligible) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? secondary}>{t.makeRegular}</button>
      {open && <MakeRegularDialog booking={booking} onClose={() => setOpen(false)} />}
    </>
  );
}

function MakeRegularDialog({ booking, onClose }: { booking: RegularBooking; onClose: () => void }) {
  const locale = useOperationsLocale();
  const t = recurringCopy[locale];
  const titleId = useId();
  const [weeks, setWeeks] = useState(1);
  const [count, setCount] = useState(4);
  const [skip, setSkip] = useState(false);
  const [attempt, setAttempt] = useState(() => crypto.randomUUID());
  const [retry, setRetry] = useState(0);
  // The answer to the latest check, tagged with the request it answers; a check is pending while the tag is not the current request.
  const [checked, setChecked] = useState<{ key: string; preview: SeriesPreview | null; error: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [created, setCreated] = useState<SeriesCreated | null>(null);

  const countValid = Number.isInteger(count) && count >= MIN_OCCURRENCES && count <= MAX_OCCURRENCES;
  const requestKey = `${weeks}:${count}:${retry}`;
  const answered = checked?.key === requestKey ? checked : null;
  const checking = countValid && !answered;
  const preview = answered?.preview ?? null;
  const previewError = answered?.error ?? "";
  useEffect(() => {
    if (!countValid || created) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.rpc("preview_booking_series", { p_booking_id: booking.id, p_interval_weeks: weeks, p_occurrences: count });
      if (!live) return;
      setChecked({ key: requestKey, preview: error ? null : (data as SeriesPreview), error: error ? describeRecurringError(error, locale) : "" });
    })();
    return () => { live = false; };
  }, [booking.id, weeks, count, countValid, created, locale, requestKey]);

  // A new request (other interval or count) needs a new key; the same request retried keeps its key.
  const change = (apply: () => void) => { apply(); setAttempt(crypto.randomUUID()); setCreateError(""); };

  const create = async () => {
    if (creating || !preview?.can_create || !countValid) return;
    setCreating(true);
    setCreateError("");
    const { data, error } = await supabase.rpc("create_booking_series_from_booking", {
      p_booking_id: booking.id, p_interval_weeks: weeks, p_occurrences: count, p_skip_unavailable: skip, p_idempotency_key: attempt,
    });
    setCreating(false);
    if (error) { setCreateError(describeRecurringError(error, locale)); return; }
    setCreated(data as SeriesCreated);
  };

  const booked = created ? created.occurrences.filter((o) => o.state === "booked").length : 0;
  const skippedCount = created ? created.occurrences.filter((o) => o.state === "skipped").length : 0;
  const unpaid = created ? created.occurrences.some((o) => o.payment_due_at) : false;
  const blockedByDates = Boolean(preview && !preview.all_available && !skip);

  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!creating} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/45 px-4 py-8 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} dir={locale === "ar" ? "rtl" : "ltr"}
          className="max-h-full w-full max-w-lg space-y-5 overflow-y-auto rounded-[28px] border border-[#ECECEC] bg-white p-6 text-start text-[#101828] shadow-2xl">
          {created ? (
            <>
              <h2 id={titleId} className="font-serif text-xl font-bold">{t.createdTitle}</h2>
              <p role="status" className="text-sm">{t.createdBody(booked, skippedCount)}</p>
              {unpaid && <p className="text-sm text-[#667085]">{t.createdPay}</p>}
              <div className="flex flex-wrap gap-2">
                <Link href="/customer/series" className={primary}>{t.viewSeries}</Link>
                <button type="button" onClick={onClose} className={secondary}>{t.close}</button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h2 id={titleId} className="font-serif text-xl font-bold">{t.dialogTitle}</h2>
                <p className="mt-1 text-sm text-[#667085]">{t.dialogIntro}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
                  <span>{t.every}</span>
                  <select className={field} value={weeks} disabled={creating} onChange={(e) => change(() => setWeeks(Number(e.target.value)))}>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{t.weeks(n)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
                  <span>{t.total}</span>
                  <input className={field} type="number" inputMode="numeric" min={MIN_OCCURRENCES} max={MAX_OCCURRENCES} value={count} disabled={creating}
                    aria-invalid={!countValid} onChange={(e) => change(() => setCount(Number(e.target.value)))} />
                </label>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={skip} disabled={creating} onChange={(e) => change(() => setSkip(e.target.checked))} />
                <span><span className="font-semibold">{t.skip}</span><span className="block text-xs text-[#667085]">{t.skipHelp}</span></span>
              </label>

              {checking && countValid && <p role="status" className="text-sm text-[#667085]">{t.previewing}</p>}
              {previewError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p>{previewError}</p>
                  <button type="button" onClick={() => setRetry((n) => n + 1)} className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-bold">{t.retry}</button>
                </div>
              )}
              {preview && !checking && (
                <>
                  <ol className="divide-y divide-[#EEE8D6] rounded-xl border border-[#E8DDC0] text-sm">
                    <li className="flex items-center justify-between gap-3 px-3 py-2"><span>{operationsDate(booking.scheduled_at, locale)}</span><span className="text-xs text-[#667085]">{t.thisBooking}</span></li>
                    {preview.items.map((item) => (
                      <li key={item.occurrence_no} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span>{operationsDate(item.target_at, locale)}</span>
                        <span className={`text-xs font-bold ${item.available ? "text-green-700" : "text-red-700"}`}>{item.available ? t.available : t.unavailable}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-xl bg-[#F7F3EA] p-3 text-sm">
                    <p className="font-semibold">{t.paymentTitle}</p>
                    <p className="mt-1 text-[#475467]">
                      {!preview.requires_online_payment ? t.paymentNone : preview.payment_hold_hours ? t.paymentHold(preview.payment_hold_hours) : t.paymentBlocked}
                    </p>
                  </div>
                </>
              )}
              {createError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{createError}</div>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={creating || checking || !preview?.can_create || !countValid || blockedByDates} onClick={() => void create()}>
                  {creating ? t.creating : t.create}
                </button>
                <button type="button" onClick={onClose} disabled={creating} className={secondary}>{t.close}</button>
              </div>
            </>
          )}
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}
