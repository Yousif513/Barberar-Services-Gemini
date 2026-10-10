"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { downloadCsv, toCsv } from "@/lib/csv.mjs";
import { CommandResult, operationsInput, useOperationsLocale, type OperationsLocale } from "@/components/operations-ui";

// Financial exports are built on the server by admin_export_finance_report (GOV-2, Q4 item 4): it checks the console
// permission (finance or owner), asks for a fresh authenticator code (Q6 step-up for exports), refuses a period of more than
// 20,000 rows instead of cutting it short, and records the report, the period and the number of rows it delivered before the
// file is handed out. The browser only formats the returned rows as CSV.

const MAX_ROWS = 20000;
const MAX_DAYS = 400;
const RIYADH = "Asia/Riyadh";

type ReportKey = "payments_ledger" | "vat_summary" | "provider_settlements";
type CsvValue = string | number | boolean | null | undefined;
type Range = { from: string; to: string };
type Built = { headers: string[]; rows: CsvValue[][] };
type Raw = Record<string, unknown>;

const translations = {
  en: {
    title: "Financial Reports & Exports",
    subtitle: "Download CSV files built from the live ledger and bookings. Dates and calendar months are in Riyadh time and amounts are in SAR.",
    period: "Period",
    from: "From",
    to: "To",
    note: "These files contain financial data and are for finance and the owner. The server builds each file, asks for a fresh authenticator code, and records the report, the period and the number of rows in the audit log.",
    download: "Download CSV",
    downloadFor: "Download CSV: {report}",
    preparing: "Preparing…",
    reports: {
      payments_ledger: { title: "Payments ledger", detail: "Every payment the ledger recorded in the period: amount captured, platform, provider and employee shares, refunds and payout status." },
      vat_summary: { title: "VAT summary", detail: "Completed bookings by month, provider and branch with sales including VAT and the VAT collected. Whole Riyadh calendar months are included, so the rows can cover days outside the dates you chose." },
      provider_settlements: { title: "Provider settlements", detail: "Per month and provider: payments captured, platform share, provider share due and provider share already released." },
    } as Record<ReportKey, { title: string; detail: string }>,
    badRange: "Choose a start date that is not after the end date.",
    tooLong: "Choose a period of at most {n} days.",
    noRows: "There is nothing to export for this period.",
    tooMany: "This period has more than {n} rows. Choose a shorter period.",
    done: "Downloaded {file} with {rows} rows.",
    headers: {
      payments_ledger: ["Date (Riyadh)", "Invoice no.", "Provider", "Entry type", "Payment reference", "Captured (SAR)", "Platform share (SAR)", "Provider share (SAR)", "Employee share (SAR)", "Refunded (SAR)", "Payout status"],
      vat_summary: ["Month", "Provider", "Branch", "Completed bookings", "Sales incl. VAT (SAR)", "VAT collected (SAR)"],
      provider_settlements: ["Month", "Provider", "Payments", "Captured (SAR)", "Platform share (SAR)", "Provider share due (SAR)", "Provider share released (SAR)"],
    } as Record<ReportKey, string[]>,
  },
  ar: {
    title: "التقارير المالية والتصدير",
    subtitle: "حمّل ملفات CSV مبنية من دفتر الحسابات والحجوزات الحالية. التواريخ والأشهر التقويمية بتوقيت الرياض والمبالغ بالريال السعودي.",
    period: "الفترة",
    from: "من",
    to: "إلى",
    note: "تحتوي هذه الملفات على بيانات مالية وهي للمالية والمالك فقط. يبني الخادم كل ملف ويطلب رمزاً جديداً من تطبيق المصادقة ويسجل التقرير والفترة وعدد الصفوف في سجل التدقيق.",
    download: "تنزيل CSV",
    downloadFor: "تنزيل CSV: {report}",
    preparing: "جارٍ التجهيز…",
    reports: {
      payments_ledger: { title: "دفتر المدفوعات", detail: "كل دفعة سجلها الدفتر خلال الفترة: المبلغ المحصّل وحصص المنصة والمزود والموظف والمبالغ المستردة وحالة التحويل." },
      vat_summary: { title: "ملخص ضريبة القيمة المضافة", detail: "الحجوزات المكتملة حسب الشهر والمزود والفرع مع المبيعات شاملة الضريبة والضريبة المحصّلة. تُدرج الأشهر التقويمية كاملة بتوقيت الرياض، لذا قد تشمل الصفوف أياماً خارج التواريخ التي اخترتها." },
      provider_settlements: { title: "مستحقات مقدمي الخدمة", detail: "لكل شهر ومزود: المدفوعات المحصّلة وحصة المنصة وحصة المزود المستحقة وحصة المزود التي تم تحويلها." },
    } as Record<ReportKey, { title: string; detail: string }>,
    badRange: "اختر تاريخ بداية لا يتجاوز تاريخ النهاية.",
    tooLong: "اختر فترة لا تزيد عن {n} يوماً.",
    noRows: "لا توجد بيانات للتصدير في هذه الفترة.",
    tooMany: "تحتوي هذه الفترة على أكثر من {n} صف. اختر فترة أقصر.",
    done: "تم تنزيل {file} (عدد الصفوف: {rows}).",
    headers: {
      payments_ledger: ["التاريخ (الرياض)", "رقم الفاتورة", "المزود", "نوع القيد", "مرجع الدفع", "المحصّل (ر.س)", "حصة المنصة (ر.س)", "حصة المزود (ر.س)", "حصة الموظف (ر.س)", "المسترد (ر.س)", "حالة التحويل"],
      vat_summary: ["الشهر", "المزود", "الفرع", "الحجوزات المكتملة", "المبيعات شاملة الضريبة (ر.س)", "الضريبة المحصّلة (ر.س)"],
      provider_settlements: ["الشهر", "المزود", "عدد المدفوعات", "المحصّل (ر.س)", "حصة المنصة (ر.س)", "حصة المزود المستحقة (ر.س)", "حصة المزود المحوّلة (ر.س)"],
    } as Record<ReportKey, string[]>,
  },
};

const riyadhDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: RIYADH }).format(date);
const riyadhStamp = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: RIYADH, dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const daysBetween = (range: Range) => Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000);
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

async function exportRows(report: ReportKey, range: Range): Promise<Raw[]> {
  const { data, error } = await supabase.rpc("admin_export_finance_report", { p_report: report, p_from: range.from, p_to: range.to });
  if (error) throw error;
  return ((data as { rows?: Raw[] } | null)?.rows ?? []) as Raw[];
}

async function buildPaymentsLedger(range: Range, lang: OperationsLocale): Promise<Built> {
  const rows = await exportRows("payments_ledger", range);
  return {
    headers: translations[lang].headers.payments_ledger,
    rows: rows.map((row) => [
      riyadhStamp(String(row.created_at)),
      (row.invoice_number as number | null) ?? "",
      String(row.provider_name ?? ""),
      String(row.entry_type ?? ""),
      String(row.payment_intent_id ?? ""),
      num(row.total_captured),
      num(row.platform_share),
      num(row.provider_share),
      num(row.employee_share),
      num(row.refunded_amount),
      String(row.payout_status ?? ""),
    ]),
  };
}

async function buildVatSummary(range: Range, lang: OperationsLocale): Promise<Built> {
  const rows = await exportRows("vat_summary", range);
  return {
    headers: translations[lang].headers.vat_summary,
    rows: rows.map((row) => [
      String(row.month_start ?? "").slice(0, 7),
      String(row.provider_name ?? ""),
      String(row.branch_name ?? ""),
      num(row.total_bookings),
      num(row.total_sales),
      num(row.total_vat_collected),
    ]),
  };
}

async function buildProviderSettlements(range: Range, lang: OperationsLocale): Promise<Built> {
  const rows = await exportRows("provider_settlements", range);
  return {
    headers: translations[lang].headers.provider_settlements,
    rows: rows.map((row) => [
      String(row.month_start ?? "").slice(0, 7),
      String(row.provider_name ?? ""),
      num(row.total_transactions),
      num(row.gross_captured_volume),
      num(row.platform_share_collected),
      num(row.provider_share_expected),
      num(row.provider_share_released),
    ]),
  };
}

const builders: Record<ReportKey, (range: Range, lang: OperationsLocale) => Promise<Built>> = {
  payments_ledger: buildPaymentsLedger,
  vat_summary: buildVatSummary,
  provider_settlements: buildProviderSettlements,
};

// ---------------------------------------------------------------------------
// Funnel: read-only counts from analytics_events through admin_get_event_counts (events per Riyadh day with the number of
// different people). It follows the period chosen above. Nothing is estimated: a failed read says so, a period with no events
// says so, and the people figure is the busiest single day because people on different days cannot be added together.
// ---------------------------------------------------------------------------
const FUNNEL_MAX_DAYS = 366;
const FUNNEL_ORDER = ["booking_confirmed", "payment_succeeded", "booking_completed", "booking_cancelled", "booking_no_show"];
// D4 (GOV-2): a day cell describing 1 to 4 people comes back suppressed (events and people null) and is counted apart.
type EventCount = { day: string; event: string; source: string; events: number | string | null; people: number | string | null; suppressed?: boolean };
type FunnelRow = { event: string; source: string; events: number; busiestDayPeople: number; days: number; suppressedDays: number };

const funnelCopy = {
  en: {
    title: "Booking funnel and events",
    detail: "Events recorded by the server (bookings and payments) and by the apps in the period chosen above, counted per event. Counts by day are in Riyadh time.",
    loading: "Loading events...",
    failed: "The events could not be loaded: {reason}",
    retry: "Retry",
    empty: "No events were recorded in this period.",
    tooLong: "Choose a period of at most {n} days to see the funnel.",
    badRange: "Choose a start date that is not after the end date to see the funnel.",
    event: "Event",
    source: "Source",
    events: "Events",
    people: "Most people in one day",
    days: "Days with events",
    suppressedNote: "Days on which fewer than 5 people made an event are not counted, so no one can be singled out: {n} such day(s).",
    server: "Server",
    client: "App",
    names: {
      booking_confirmed: "Booking confirmed",
      payment_succeeded: "Payment received",
      booking_completed: "Booking completed",
      booking_cancelled: "Booking cancelled",
      booking_no_show: "Customer did not attend",
    } as Record<string, string>,
  },
  ar: {
    title: "مسار الحجز والأحداث",
    detail: "الأحداث التي سجّلها الخادم (الحجوزات والمدفوعات) والتطبيقات في الفترة المختارة أعلاه، معدودة لكل حدث. العدّ اليومي بتوقيت الرياض.",
    loading: "جارٍ تحميل الأحداث...",
    failed: "تعذّر تحميل الأحداث: {reason}",
    retry: "إعادة المحاولة",
    empty: "لم تُسجَّل أحداث في هذه الفترة.",
    tooLong: "اختر فترة لا تزيد على {n} يوماً لعرض المسار.",
    badRange: "اختر تاريخ بداية لا يتجاوز تاريخ النهاية لعرض المسار.",
    event: "الحدث",
    source: "المصدر",
    events: "الأحداث",
    people: "أكثر عدد أشخاص في يوم واحد",
    days: "أيام فيها أحداث",
    suppressedNote: "لا تُحسب الأيام التي سجل فيها أقل من 5 أشخاص أحداثاً حتى لا يمكن تمييز أحد: {n} يوم/أيام.",
    server: "الخادم",
    client: "التطبيق",
    names: {
      booking_confirmed: "تأكيد الحجز",
      payment_succeeded: "استلام الدفعة",
      booking_completed: "اكتمال الحجز",
      booking_cancelled: "إلغاء الحجز",
      booking_no_show: "عدم حضور العميل",
    } as Record<string, string>,
  },
};

function FunnelSection({ range, lang }: { range: Range; lang: OperationsLocale }) {
  const t = funnelCopy[lang];
  const numberFormat = lang === "ar" ? "ar-SA" : "en-US";
  const rangeProblem = !range.from || !range.to || range.from > range.to ? t.badRange : daysBetween(range) >= FUNNEL_MAX_DAYS ? fill(t.tooLong, { n: FUNNEL_MAX_DAYS }) : "";
  const [state, setState] = useState<{ key: string; rows: FunnelRow[] | null; error: string }>({ key: "", rows: null, error: "" });
  const [reload, setReload] = useState(0);
  const key = `${range.from}|${range.to}|${reload}`;

  useEffect(() => {
    if (rangeProblem) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("admin_get_event_counts", { p_start_date: range.from, p_end_date: range.to });
      if (cancelled) return;
      if (error) {
        setState({ key, rows: null, error: errorMessage(error) });
        return;
      }
      const byEvent = new Map<string, FunnelRow>();
      for (const item of (data ?? []) as EventCount[]) {
        const id = `${item.event}|${item.source}`;
        const row = byEvent.get(id) ?? { event: item.event, source: item.source, events: 0, busiestDayPeople: 0, days: 0, suppressedDays: 0 };
        if (item.suppressed) {
          row.suppressedDays += 1;
        } else {
          row.events += num(item.events);
          row.busiestDayPeople = Math.max(row.busiestDayPeople, num(item.people));
        }
        row.days += 1;
        byEvent.set(id, row);
      }
      const rank = (event: string) => (FUNNEL_ORDER.includes(event) ? FUNNEL_ORDER.indexOf(event) : FUNNEL_ORDER.length);
      setState({ key, rows: [...byEvent.values()].sort((a, b) => rank(a.event) - rank(b.event) || b.events - a.events || a.event.localeCompare(b.event)), error: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, rangeProblem, key]);

  const current = state.key === key ? state : null;
  return (
    <section aria-labelledby="funnel-title" className="rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
      <h3 id="funnel-title" className="text-sm font-black leading-snug text-gray-900">{t.title}</h3>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-[#667085]">{t.detail}</p>
      <div className="mt-4" aria-live="polite">
        {rangeProblem ? (
          <p className="text-xs font-semibold text-gray-500">{rangeProblem}</p>
        ) : !current ? (
          <p className="text-xs font-bold text-gray-400">{t.loading}</p>
        ) : current.error ? (
          <div>
            <p role="alert" className="text-xs font-bold text-[#B42318]">{fill(t.failed, { reason: current.error })}</p>
            <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
          </div>
        ) : !current.rows || current.rows.length === 0 ? (
          <p className="text-xs font-semibold text-gray-500">{t.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start">{t.event}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t.source}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t.events}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t.people}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t.days}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                {current.rows.map((row) => (
                  <tr key={`${row.event}|${row.source}`}>
                    <td className="px-4 py-3 font-bold text-gray-900">
                      {t.names[row.event] ?? <span dir="ltr" className="font-mono">{row.event}</span>}
                    </td>
                    <td className="px-4 py-3">{row.source === "server" ? t.server : t.client}</td>
                    <td className="px-4 py-3">
                      {row.events.toLocaleString(numberFormat)}
                      {row.suppressedDays > 0 && <span className="mt-1 block text-[10px] font-semibold text-gray-500">{fill(t.suppressedNote, { n: row.suppressedDays.toLocaleString(numberFormat) })}</span>}
                    </td>
                    <td className="px-4 py-3">{row.busiestDayPeople > 0 ? row.busiestDayPeople.toLocaleString(numberFormat) : "—"}</td>
                    <td className="px-4 py-3">{row.days.toLocaleString(numberFormat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default function AdminReports() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const today = riyadhDate(new Date());
  const [range, setRange] = useState<Range>({ from: `${today.slice(0, 7)}-01`, to: today });
  const [busy, setBusy] = useState<ReportKey | "">("");
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  const download = async (key: ReportKey) => {
    setMessage({});
    if (!range.from || !range.to || range.from > range.to) {
      setMessage({ error: t.badRange });
      return;
    }
    if (daysBetween(range) > MAX_DAYS) {
      setMessage({ error: fill(t.tooLong, { n: MAX_DAYS }) });
      return;
    }
    setBusy(key);
    try {
      const built = await builders[key](range, lang);
      if (built.rows.length === 0) {
        setMessage({ error: t.noRows });
        return;
      }
      // The monthly reports hand out whole calendar months, so their file name carries months, not the chosen days.
      const monthly = key !== "payments_ledger";
      const file = `${key.replace(/_/g, "-")}_${monthly ? `${monthStart(range.from).slice(0, 7)}_${monthStart(range.to).slice(0, 7)}` : `${range.from}_${range.to}`}.csv`;
      downloadCsv(file, toCsv(built.headers, built.rows));
      setMessage({ success: fill(t.done, { file, rows: built.rows.length.toLocaleString(isRTL ? "ar-SA" : "en-US") }) });
    } catch (error) {
      const tooMany = (error as { hint?: string } | null)?.hint === "too_many_rows";
      setMessage({ error: tooMany ? fill(t.tooMany, { n: MAX_ROWS.toLocaleString(isRTL ? "ar-SA" : "en-US") }) : errorMessage(error) });
    } finally {
      setBusy("");
    }
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h1>
        <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      <section className={cardBase} aria-labelledby="export-period">
        <h3 id="export-period" className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.period}</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-xl">
          <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
            <span>{t.from}</span>
            <input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className={operationsInput} />
          </label>
          <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
            <span>{t.to}</span>
            <input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className={operationsInput} />
          </label>
        </div>
        <div className="mt-4 rounded-xl border border-[#D1AF47]/30 bg-[#FFFAEB] px-4 py-3 text-xs font-semibold text-[#7A5B12]">{t.note}</div>
      </section>

      <CommandResult error={message.error} success={message.success} locale={lang} onDismiss={() => setMessage({})} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-busy={busy !== ""}>
        {(Object.keys(builders) as ReportKey[]).map((key) => (
          <section key={key} aria-labelledby={`report-${key}`} className={`${cardBase} flex flex-col justify-between gap-5`}>
            <div>
              <h3 id={`report-${key}`} className="text-sm font-black leading-snug text-gray-900">{t.reports[key].title}</h3>
              <div className="mt-2 text-xs font-semibold leading-relaxed text-[#667085]">{t.reports[key].detail}</div>
            </div>
            <button
              type="button"
              aria-disabled={busy !== ""}
              aria-label={fill(t.downloadFor, { report: t.reports[key].title })}
              onClick={() => { if (busy === "") void download(key); }}
              className={`w-full rounded-lg bg-gray-900 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition hover:bg-gray-800 ${busy !== "" ? "opacity-50" : ""} ${focusRing}`}
            >
              {busy === key ? t.preparing : t.download}
            </button>
          </section>
        ))}
      </div>

      <FunnelSection range={range} lang={lang} />
    </div>
  );
}
