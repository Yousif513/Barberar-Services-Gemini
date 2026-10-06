"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { downloadCsv, toCsv } from "@/lib/csv.mjs";
import { CommandResult, operationsInput, useOperationsLocale, type OperationsLocale } from "@/components/operations-ui";

// Financial exports built from the rows the signed-in operator can already read, so row policy applies
// unchanged. A file is handed out only after admin_record_export has written the audit entry; if that call
// fails, nothing is delivered. A period that would produce more than MAX_ROWS rows is refused instead of
// being cut short, because a silently truncated financial export is worse than none.

const PAGE = 1000;
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
    note: "These files contain financial data. Every download is recorded in the audit log with the report, the period and the number of rows.",
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
    note: "تحتوي هذه الملفات على بيانات مالية. يُسجل كل تنزيل في سجل التدقيق مع التقرير والفترة وعدد الصفوف.",
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

class TooManyRows extends Error {}

const riyadhDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: RIYADH }).format(date);
const riyadhStamp = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: RIYADH, dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
// Riyadh has no daylight saving, so a day starts at 00:00 on a fixed +03:00 offset.
const dayStartIso = (day: string) => new Date(`${day}T00:00:00+03:00`).toISOString();
const nextDayStartIso = (day: string) => new Date(Date.parse(`${day}T00:00:00+03:00`) + 86400000).toISOString();
const daysBetween = (range: Range) => Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000);
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

async function readCapped(fetchPage: (start: number, end: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Raw[]> {
  const rows: Raw[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await fetchPage(start, start + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Raw[];
    rows.push(...page);
    if (rows.length > MAX_ROWS) throw new TooManyRows();
    if (page.length < PAGE) return rows;
  }
}

async function namesFor(table: "providers" | "branches", column: "business_name_en" | "name_en", ids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase.from(table).select(`id, ${column}`).in("id", unique.slice(i, i + 200));
    if (error) throw error;
    for (const row of (data ?? []) as unknown as Raw[]) names[String(row.id)] = String(row[column] ?? "");
  }
  return names;
}

async function buildPaymentsLedger(range: Range, lang: OperationsLocale): Promise<Built> {
  const rows = await readCapped((start, end) =>
    supabase
      .from("transactional_ledger")
      .select("id, created_at, entry_type, payment_intent_id, total_captured, platform_share, provider_share, employee_share, refunded_amount, payout_status, provider_id, bookings ( invoice_number, branches ( provider_id ) )")
      .gte("created_at", dayStartIso(range.from))
      .lt("created_at", nextDayStartIso(range.to))
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end)
  );
  const providerOf = (row: Raw) => {
    const booking = row.bookings as { branches?: { provider_id?: string } | null } | null;
    return String(row.provider_id ?? booking?.branches?.provider_id ?? "");
  };
  const providers = await namesFor("providers", "business_name_en", rows.map(providerOf));
  return {
    headers: translations[lang].headers.payments_ledger,
    rows: rows.map((row) => [
      riyadhStamp(String(row.created_at)),
      (row.bookings as { invoice_number?: number | null } | null)?.invoice_number ?? "",
      providers[providerOf(row)] ?? "",
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
  const rows = await readCapped((start, end) =>
    supabase
      .from("monthly_vat_summary")
      .select("month_start, provider_id, branch_id, total_bookings, total_vat_collected, total_sales")
      .gte("month_start", monthStart(range.from))
      .lte("month_start", monthStart(range.to))
      .order("month_start", { ascending: true })
      .order("provider_id", { ascending: true })
      .order("branch_id", { ascending: true })
      .range(start, end)
  );
  const providers = await namesFor("providers", "business_name_en", rows.map((row) => String(row.provider_id ?? "")));
  const branches = await namesFor("branches", "name_en", rows.map((row) => String(row.branch_id ?? "")));
  return {
    headers: translations[lang].headers.vat_summary,
    rows: rows.map((row) => [
      String(row.month_start ?? "").slice(0, 7),
      providers[String(row.provider_id)] ?? "",
      branches[String(row.branch_id)] ?? "",
      num(row.total_bookings),
      num(row.total_sales),
      num(row.total_vat_collected),
    ]),
  };
}

async function buildProviderSettlements(range: Range, lang: OperationsLocale): Promise<Built> {
  const rows = await readCapped((start, end) =>
    supabase
      .from("provider_settlement_summary")
      .select("month_start, provider_id, total_transactions, gross_captured_volume, platform_share_collected, provider_share_expected, provider_share_released")
      .gte("month_start", monthStart(range.from))
      .lte("month_start", monthStart(range.to))
      .order("month_start", { ascending: true })
      .order("provider_id", { ascending: true })
      .range(start, end)
  );
  const providers = await namesFor("providers", "business_name_en", rows.map((row) => String(row.provider_id ?? "")));
  return {
    headers: translations[lang].headers.provider_settlements,
    rows: rows.map((row) => [
      String(row.month_start ?? "").slice(0, 7),
      providers[String(row.provider_id)] ?? "",
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
      // Record first: no file leaves the system without an audit entry.
      const { error: auditError } = await supabase.rpc("admin_record_export", {
        p_report: key,
        p_from: range.from,
        p_to: range.to,
        p_row_count: built.rows.length,
      });
      if (auditError) throw auditError;
      // The monthly reports hand out whole calendar months, so their file name carries months, not the chosen days.
      const monthly = key !== "payments_ledger";
      const file = `${key.replace(/_/g, "-")}_${monthly ? `${monthStart(range.from).slice(0, 7)}_${monthStart(range.to).slice(0, 7)}` : `${range.from}_${range.to}`}.csv`;
      downloadCsv(file, toCsv(built.headers, built.rows));
      setMessage({ success: fill(t.done, { file, rows: built.rows.length.toLocaleString(isRTL ? "ar-SA" : "en-US") }) });
    } catch (error) {
      setMessage({ error: error instanceof TooManyRows ? fill(t.tooMany, { n: MAX_ROWS.toLocaleString(isRTL ? "ar-SA" : "en-US") }) : errorMessage(error) });
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
    </div>
  );
}
