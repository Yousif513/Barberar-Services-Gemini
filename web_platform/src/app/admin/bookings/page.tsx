"use client";

import React, { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog, ModalOverlay, ModalPortal } from "@/components/modal";
import { oneOf, writeUrlState } from "@/lib/url-state";

const translations = {
  en: {
    title: "Global Bookings Ledger",
    subtitle: "Audit active client scheduling logs, platform split captures, and status indicators. Times are shown in Riyadh time.",
    loading: "Loading booking sheets...",
    loadFailed: "Bookings could not be loaded: {reason}",
    retry: "Try again",
    bookingDetails: "Booking Details",
    clientCustomer: "Client / Customer",
    providerBranch: "Provider / Branch",
    capturedPrice: "Captured Price",
    commShare: "Platform commission",
    status: "Status",
    guest: "Guest",
    independent: "Independent",
    directStaff: "Direct Staff",
    invoiceTitle: "Tax Invoice",
    invoiceNo: "Invoice No",
    vatNo: "VAT Number",
    issueDate: "Issue Date",
    printInvoice: "Print Invoice",
    subtotal: "Subtotal",
    vatAmount: "VAT (15%)",
    totalAmount: "Total (incl. VAT)",
    zatcaCompliance: "ZATCA e-Invoicing Compliance QR Code",
    payoutStatus: "Payout Status",
    close: "Close",
    actions: "Actions",
    invoice: "Invoice",
    cancel: "Cancel",
    complete: "Complete",
    noShow: "No-show",
    releaseHolds: "Release expired unpaid holds",
    cancelTitle: "Cancel this booking",
    cancelIntro: "The shop's cancellation policy and refund rules apply to this booking.",
    noShowTitle: "Mark this booking as a no-show",
    noShowIntro: "The shop's no-show fee applies.",
    completeTitle: "Mark this booking as completed",
    completeIntro: "The booking is recorded as completed by a platform administrator.",
    releaseTitle: "Release expired unpaid holds",
    releaseIntro: "Unpaid holds that passed the hold time are released so the slots can be booked again.",
    confirmCancel: "Cancel booking",
    confirmNoShow: "Mark no-show",
    confirmComplete: "Mark completed",
    confirmRelease: "Release holds",
    reasonLabel: "Reason (recorded in the audit log)",
    factBooking: "Booking",
    factWhen: "Scheduled",
    factAmount: "Amount",
    qrNotRendered: "The console does not send this invoice to an outside service to draw a QR image. The value below is exactly what the QR holds (ZATCA TLV, Base64).",
    qrPayload: "ZATCA QR payload",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Select the text and copy it",
    qrUnavailable: "No QR value is stored for this invoice.",
    noInvoice: "No tax invoice has been issued for this booking yet.",
    invoiceFailed: "The invoice could not be loaded: {reason}",
    loadingInvoice: "Loading the invoice…",
    released: "Released {n} expired unpaid holds.",
    done: "Booking updated.",
    statusLabel: "Status",
    allStatuses: "All statuses",
    empty: "No bookings match these filters.",
    searchLabel: "Search by booking ID, invoice number, customer or provider",
    fromLabel: "From (Riyadh date)",
    toLabel: "To (Riyadh date)",
    clearFilters: "Clear filters",
    rangeInvalid: "The From date must not be after the To date.",
    showing: "Showing {from}–{to} of {total}",
    previous: "Previous",
    next: "Next",
    unpaidFor: "Unpaid for {m} min",
    shownNote: "Totals cover every booking that matches the filters, not only the page below.",
    totalVolume: "Value of matching bookings",
    platformRevenue: "Platform commission on matching bookings",
    activeBookings: "Awaiting payment or confirmed (matching)",
    invoiceFor: "Invoice for booking {id}",
    cancelFor: "Cancel booking {id}",
    completeFor: "Complete booking {id}",
    noShowFor: "Mark booking {id} as no-show",
    statuses: { pending_payment: "Awaiting payment", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as Record<string, string>
  },
  ar: {
    title: "سجل الحجوزات العام",
    subtitle: "تدقيق سجلات الحجوزات النشطة للعملاء، وتقسيم المبالغ المستلمة، ومؤشرات الحالة. الأوقات بتوقيت الرياض.",
    loading: "جاري تحميل كشوفات الحجوزات...",
    loadFailed: "تعذّر تحميل الحجوزات: {reason}",
    retry: "إعادة المحاولة",
    bookingDetails: "تفاصيل الحجز",
    clientCustomer: "العميل",
    providerBranch: "المزود / الفرع",
    capturedPrice: "المبلغ المقبوض",
    commShare: "عمولة المنصة",
    status: "الحالة",
    guest: "زائر",
    independent: "مستقل",
    directStaff: "أخصائي مباشر",
    invoiceTitle: "فاتورة ضريبية مبسطة",
    invoiceNo: "رقم الفاتورة",
    vatNo: "الرقم الضريبي",
    issueDate: "تاريخ الإصدار",
    printInvoice: "طباعة الفاتورة",
    subtotal: "المجموع الفرعي",
    vatAmount: "ضريبة القيمة المضافة (١٥٪)",
    totalAmount: "الإجمالي (شامل الضريبة)",
    zatcaCompliance: "رمز الاستجابة السريع لفوترة هيئة الزكاة والضريبة والجمارك",
    payoutStatus: "حالة الدفع",
    close: "إغلاق",
    actions: "الإجراءات",
    invoice: "الفاتورة",
    cancel: "إلغاء",
    complete: "إكمال",
    noShow: "عدم حضور",
    releaseHolds: "إطلاق الحجوزات غير المدفوعة المنتهية",
    cancelTitle: "إلغاء هذا الحجز",
    cancelIntro: "تُطبق سياسة الإلغاء وقواعد الاسترداد الخاصة بالمركز على هذا الحجز.",
    noShowTitle: "تسجيل هذا الحجز كعدم حضور",
    noShowIntro: "تُطبق رسوم عدم الحضور الخاصة بالمركز.",
    completeTitle: "تسجيل هذا الحجز كمكتمل",
    completeIntro: "يُسجَّل الحجز كمكتمل بواسطة مسؤول المنصة.",
    releaseTitle: "إطلاق الحجوزات غير المدفوعة المنتهية",
    releaseIntro: "تُطلق الحجوزات غير المدفوعة التي تجاوزت مهلة الحجز لتصبح المواعيد متاحة للحجز مجدداً.",
    confirmCancel: "إلغاء الحجز",
    confirmNoShow: "تسجيل عدم حضور",
    confirmComplete: "تسجيل كمكتمل",
    confirmRelease: "إطلاق الحجوزات",
    reasonLabel: "السبب (يُسجل في سجل التدقيق)",
    factBooking: "الحجز",
    factWhen: "الموعد",
    factAmount: "المبلغ",
    qrNotRendered: "لا ترسل لوحة الإدارة هذه الفاتورة إلى خدمة خارجية لرسم صورة الرمز. القيمة أدناه هي نفسها ما يحمله الرمز (ZATCA TLV بترميز Base64).",
    qrPayload: "قيمة رمز ZATCA",
    copy: "نسخ",
    copied: "تم النسخ",
    copyFailed: "حدد النص وانسخه",
    qrUnavailable: "لا توجد قيمة رمز محفوظة لهذه الفاتورة.",
    noInvoice: "لم تُصدر فاتورة ضريبية لهذا الحجز بعد.",
    invoiceFailed: "تعذّر تحميل الفاتورة: {reason}",
    loadingInvoice: "جارٍ تحميل الفاتورة…",
    released: "تم إطلاق {n} من الحجوزات غير المدفوعة المنتهية.",
    done: "تم تحديث الحجز.",
    statusLabel: "الحالة",
    allStatuses: "كل الحالات",
    empty: "لا توجد حجوزات مطابقة لهذه التصفية.",
    searchLabel: "ابحث برقم الحجز أو رقم الفاتورة أو العميل أو مقدم الخدمة",
    fromLabel: "من (تاريخ الرياض)",
    toLabel: "إلى (تاريخ الرياض)",
    clearFilters: "مسح التصفية",
    rangeInvalid: "يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.",
    showing: "عرض {from}–{to} من {total}",
    previous: "السابق",
    next: "التالي",
    unpaidFor: "غير مدفوع منذ {m} دقيقة",
    shownNote: "تشمل الإجماليات كل حجز يطابق التصفية، وليس الصفحة أدناه فقط.",
    totalVolume: "قيمة الحجوزات المطابقة",
    platformRevenue: "عمولة المنصة على الحجوزات المطابقة",
    activeBookings: "بانتظار الدفع أو مؤكدة (المطابقة)",
    invoiceFor: "فاتورة الحجز {id}",
    cancelFor: "إلغاء الحجز {id}",
    completeFor: "إكمال الحجز {id}",
    noShowFor: "تسجيل عدم حضور للحجز {id}",
    statuses: { pending_payment: "بانتظار الدفع", confirmed: "مؤكد", completed: "مكتمل", cancelled: "ملغى", no_show: "لم يحضر" } as Record<string, string>
  }
};

const PAGE_SIZE = 25;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Money = number | string | null;
type BookingRow = {
  id: string;
  invoice_number?: number | string | null;
  created_at: string | null;
  scheduled_at: string;
  status: string;
  total_price: Money;
  platform_commission: Money;
  tax_amount: Money;
  customer: { first_name: string | null; last_name: string | null } | null;
  branches: {
    name_en: string | null;
    name_ar: string | null;
    providers: { business_name_en: string | null; business_name_ar: string | null } | null;
  } | null;
};
type StoredInvoice = {
  invoice_number: string;
  seller_name: string;
  seller_vat_number: string;
  issue_date: string;
  subtotal_sar: Money;
  vat_amount_sar: Money;
  total_amount_sar: Money;
  zatca_qr_code: string | null;
};
// What was read for one booking's invoice: the invoice, none issued, or the reason the read failed.
type InvoiceRead = { bookingId: string; invoice: StoredInvoice | null; error: string };
type Pending = { kind: "cancel" | "no_show" | "complete"; booking: BookingRow } | { kind: "release" };
type DirectoryTotals = { matching: number; value: number; commission: number; active: number };

// The status filter is kept in the address bar (?status=pending_payment), so a dashboard link or a bookmark opens the same list.
export default function AdminBookings() {
  return (
    <Suspense fallback={null}>
      <BookingsScreen />
    </Suspense>
  );
}

function BookingsScreen() {
  const lang = useOperationsLocale();
  const params = useSearchParams();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<BookingRow | null>(null);
  const [invoiceRead, setInvoiceRead] = useState<InvoiceRead | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadForbidden, setLoadForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    oneOf<string>(params.get("status"), ["all", "pending_payment", "confirmed", "completed", "cancelled", "no_show"], "all"));
  const [term, setTerm] = useState(() => params.get("q") ?? "");
  const [search, setSearch] = useState(() => (params.get("q") ?? "").trim());
  const [from, setFrom] = useState(() => (DATE_PATTERN.test(params.get("from") ?? "") ? (params.get("from") as string) : ""));
  const [to, setTo] = useState(() => (DATE_PATTERN.test(params.get("to") ?? "") ? (params.get("to") as string) : ""));
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState<DirectoryTotals | null>(null);
  useEffect(() => {
    writeUrlState({ status: statusFilter === "all" ? "" : statusFilter, q: search, from, to });
  }, [statusFilter, search, from, to]);
  // The search box applies a moment after typing stops, so each keystroke is not a recorded look at booking data.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(term.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [term]);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionMessage, setActionMessage] = useState<{ error?: string; success?: string }>({});
  // When the list was read; ages and "already started" are measured against it, so rendering stays free of the clock.
  const [loadedAt, setLoadedAt] = useState(0);
  const [copyState, setCopyState] = useState<"" | "copied" | "failed">("");

  const t = translations[lang];

  const rangeInvalid = Boolean(from && to && from > to);
  useEffect(() => {
    if (rangeInvalid) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc("admin_booking_directory", {
        p_search: search || null,
        p_status: statusFilter === "all" ? null : statusFilter,
        p_from: from || null,
        p_to: to || null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (cancelled) return;
      if (error) {
        setBookings([]);
        setTotals(null);
        setLoadError(errorMessage(error));
        setLoadForbidden(isForbidden(error));
      } else {
        const result = data as { matching: number | string; total_value: number | string; total_commission: number | string; active: number | string; rows: BookingRow[] };
        setBookings(result.rows ?? []);
        setTotals({ matching: Number(result.matching), value: Number(result.total_value), commission: Number(result.total_commission), active: Number(result.active) });
        setLoadForbidden(false);
        setLoadedAt(Date.now());
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, search, from, to, page, reloadKey, rangeInvalid]);

  // Booking commands run on the server (cancel_booking, mark_booking_no_show,
  // employee_update_booking_status); each applies the shop's policy and writes the audit log. A refusal goes back to
  // the dialog, which stays open with what the operator typed; a success is announced and the list read again.
  const execute = async (command: PromiseLike<{ data: unknown; error: unknown }>, success: (data: unknown) => string): Promise<string | null> => {
    const { data, error } = await command;
    if (error) return errorMessage(error);
    setActionMessage({ success: success(data) });
    setReloadKey((k) => k + 1);
    return null;
  };

  const openInvoice = (booking: BookingRow) => {
    setCopyState("");
    setSelectedBooking(booking);
  };

  const bookingName = (booking: BookingRow) => `${booking.customer?.first_name || t.guest} ${booking.customer?.last_name || ""}`.trim();
  const providerName = (booking: BookingRow) =>
    (lang === "ar"
      ? booking.branches?.providers?.business_name_ar || booking.branches?.providers?.business_name_en
      : booking.branches?.providers?.business_name_en || booking.branches?.providers?.business_name_ar) || t.independent;
  const shortId = (booking: BookingRow) => String(booking.id).substring(0, 8);
  const fill = (template: string, id: string) => template.replace("{id}", id);

  const renderDialog = () => {
    if (!pending) return null;
    const close = () => setPending(null);
    if (pending.kind === "release") {
      return (
        <CommandDialog
          locale={lang}
          title={t.releaseTitle}
          intro={t.releaseIntro}
          reasonLabel={t.reasonLabel}
          confirmLabel={t.confirmRelease}
          onConfirm={(reason) => execute(supabase.rpc("admin_release_expired_holds", { p_reason: reason }), (data) => t.released.replace("{n}", String((data as { released?: number } | null)?.released ?? 0)))}
          onClose={close}
        />
      );
    }
    const { booking, kind } = pending;
    const facts = [
      { label: t.factBooking, value: `${bookingName(booking)} · ${providerName(booking)} · ${shortId(booking)}` },
      { label: t.factWhen, value: operationsDate(booking.scheduled_at, lang) },
      { label: t.factAmount, value: sar(Number(booking.total_price) || 0, lang) },
    ];
    if (kind === "complete") {
      return (
        <CommandDialog
          locale={lang}
          title={t.completeTitle}
          intro={t.completeIntro}
          facts={facts}
          reasonLabel={t.reasonLabel}
          confirmLabel={t.confirmComplete}
          onConfirm={(reason) => execute(supabase.rpc("employee_update_booking_status", { p_booking_id: booking.id, p_new_status: "completed", p_notes: reason }), () => t.done)}
          onClose={close}
        />
      );
    }
    const cancelling = kind === "cancel";
    return (
      <CommandDialog
        locale={lang}
        tone="danger"
        title={cancelling ? t.cancelTitle : t.noShowTitle}
        intro={cancelling ? t.cancelIntro : t.noShowIntro}
        facts={facts}
        reasonLabel={t.reasonLabel}
        confirmLabel={cancelling ? t.confirmCancel : t.confirmNoShow}
        onConfirm={(reason) =>
          execute(
            cancelling
              ? supabase.rpc("cancel_booking", { target_booking_id: booking.id, p_reason: reason })
              : supabase.rpc("mark_booking_no_show", { target_booking_id: booking.id, p_reason: reason }),
            () => t.done,
          )
        }
        onClose={close}
      />
    );
  };

  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";

  // Calculate summary metrics
  const totalVolume = totals?.value ?? 0;
  const platformRevenue = totals?.commission ?? 0;
  const activeCount = totals?.active ?? 0;
  const matching = totals?.matching ?? 0;
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const filtered = Boolean(statusFilter !== "all" || search || from || to);
  const clearFilters = () => {
    setStatusFilter("all");
    setTerm("");
    setSearch("");
    setFrom("");
    setTo("");
    setPage(1);
    setActionMessage({});
  };

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  // Tax invoices are issued and signed server-side (generate_zatca_tax_invoice); this view only
  // displays the stored invoice and never builds one in the browser.
  useEffect(() => {
    if (!selectedBooking) return;
    let cancelled = false;
    const bookingId = selectedBooking.id;
    // GOV-2 (Q2 item 4, Q4): invoices are read by finance or the owner only, through the audited admin_get_booking_invoice.
    void supabase.rpc("admin_get_booking_invoice", { p_booking_id: bookingId, p_purpose: "finance_operations" }).then(
      ({ data, error }) => {
        if (!cancelled) setInvoiceRead({ bookingId, invoice: error ? null : (data as StoredInvoice | null), error: error ? errorMessage(error) : "" });
      },
      (error: unknown) => {
        if (!cancelled) setInvoiceRead({ bookingId, invoice: null, error: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedBooking]);

  const currentRead = selectedBooking && invoiceRead?.bookingId === selectedBooking.id ? invoiceRead : null;
  const invoiceLoading = Boolean(selectedBooking) && !currentRead;
  const invoiceError = currentRead?.error ?? "";
  const invoiceData = useMemo(() => {
    const stored = currentRead?.invoice;
    if (!stored) return null;
    return {
      number: stored.invoice_number,
      providerName: stored.seller_name,
      vatNo: stored.seller_vat_number,
      timeStr: stored.issue_date,
      subtotal: Number(stored.subtotal_sar),
      tax: Number(stored.vat_amount_sar),
      total: Number(stored.total_amount_sar),
      qrBase64: stored.zatca_qr_code || "",
    };
  }, [currentRead]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      
      {/* Title Header */}
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
        <div>
          <h1 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">
            {t.title}
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {t.subtitle}
          </p>
        </div>
      </div>

      <div className={`flex flex-wrap items-end gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.searchLabel}</span>
          <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} className={operationsInput} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.fromLabel}</span>
          <input type="date" value={from} max={to || undefined} aria-invalid={rangeInvalid} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className={operationsInput} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.toLabel}</span>
          <input type="date" value={to} min={from || undefined} aria-invalid={rangeInvalid} onChange={(event) => { setTo(event.target.value); setPage(1); }} className={operationsInput} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-[#667085]">
          <span>{t.statusLabel}</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
              setActionMessage({});
            }}
            className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-xs text-gray-900 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
          >
            <option value="all">{t.allStatuses}</option>
            {Object.entries(t.statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPending({ kind: "release" })}
          className="rounded-xl border border-[#D1AF47]/40 bg-[#FFFAEB] px-4 py-2 text-xs font-black text-[#7A5B12] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50"
        >
          {t.releaseHolds}
        </button>
        {filtered && (
          <button type="button" onClick={clearFilters} className="rounded-xl border border-[#D0D5DD] bg-white px-4 py-2 text-xs font-black text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.clearFilters}</button>
        )}
      </div>
      {rangeInvalid && <p role="alert" className="text-xs font-bold text-red-700">{t.rangeInvalid}</p>}
      <CommandResult error={actionMessage.error} success={actionMessage.success} locale={lang} onDismiss={() => setActionMessage({})} />
      {renderDialog()}
      {!loading && !loadError && <p className="text-[11px] text-gray-500">{t.shownNote}</p>}

      {/* Summary KPI Widgets: only shown when the bookings actually loaded */}
      {!loading && !loadError && (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Total Volume */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.totalVolume}</span>
            <div aria-hidden="true" className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#7A5B12] text-[11px] font-black">
              {lang === "ar" ? "ر.س" : "SAR"}
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {sar(totalVolume, lang)}
          </strong>
        </div>

        {/* KPI 2: Platform Commission */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.platformRevenue}</span>
            <div aria-hidden="true" className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#7A5B12] font-serif text-xs font-black">
              %
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-amber-800 mt-2.5">
            {sar(platformRevenue, lang)}
          </strong>
        </div>

        {/* KPI 3: Active Bookings */}
        <div className={cardBase}>
          <div className={`flex items-center justify-between ${flip}`}>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{t.activeBookings}</span>
            <div className="w-8 h-8 rounded-full bg-gray-50 border border-[#ECECEC] flex items-center justify-center text-[#D1AF47]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">
            {activeCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </strong>
        </div>
      </div>
      )}

      {/* Bookings Table */}
      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[11px] ${isRTL ? "text-right" : ""}`}>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.bookingDetails}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.clientCustomer}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerBranch}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.capturedPrice}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.commShare}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.status}</th>
                <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.actions}</th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.loading}</td>
                </tr>
              ) : bookings.length === 0 && !loadError ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 font-bold">{t.empty}</td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const dateStr = operationsDate(b.scheduled_at, lang);

                  return (
                    <tr 
                      key={b.id} 
                      onClick={() => openInvoice(b)}
                      className="hover:bg-gray-50/60 cursor-pointer transition duration-150"
                    >
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">{dateStr}</p>
                        <p dir="ltr" className="text-[11px] text-gray-600 font-semibold mt-1">ID: {shortId(b)}{b.invoice_number ? ` · #${b.invoice_number}` : ""}</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">
                          {b.customer?.first_name || t.guest} {b.customer?.last_name || ""}
                        </p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="font-bold text-gray-900">
                          {isRTL 
                            ? b.branches?.providers?.business_name_ar || b.branches?.providers?.business_name_en || t.independent
                            : b.branches?.providers?.business_name_en || b.branches?.providers?.business_name_ar || t.independent
                          }
                        </p>
                        <p className="text-[11px] text-gray-600 font-semibold mt-0.5">
                          {isRTL ? b.branches?.name_ar || b.branches?.name_en : b.branches?.name_en || b.branches?.name_ar}
                        </p>
                      </td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">
                        {sar(Number(b.total_price) || 0, lang)}
                      </td>
                      <td className="py-4 px-6 font-serif font-black text-amber-700">
                        {sar(Number(b.platform_commission) || 0, lang)}
                      </td>
                      <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider inline-block ${
                          b.status === "confirmed"
                            ? "bg-[#ECFDF3] text-[#15803D]"
                            : b.status === "completed"
                            ? "bg-gray-100 text-gray-700"
                            : b.status === "pending_payment"
                            ? "bg-[#FFFAEB] text-[#B45309]"
                            : "bg-[#FEF3F2] text-[#B91C1C]"
                        }`}>
                          {t.statuses[b.status] || b.status}
                        </span>
                        {b.status === "pending_payment" && (
                          <div className="mt-1 text-[11px] font-semibold text-[#93370D]">
                            {t.unpaidFor.replace("{m}", String(Math.max(0, Math.floor((loadedAt - new Date(b.created_at || b.scheduled_at).getTime()) / 60000))))}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <div className={`flex flex-wrap gap-1.5 ${isRTL ? "flex-row-reverse" : ""}`}>
                          <button type="button" aria-label={fill(t.invoiceFor, shortId(b))} onClick={() => openInvoice(b)} className="rounded-lg border border-[#ECECEC] px-2.5 py-1.5 text-[11px] font-black text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.invoice}</button>
                          {(b.status === "pending_payment" || b.status === "confirmed") && (
                            <button type="button" aria-label={fill(t.cancelFor, shortId(b))} onClick={() => setPending({ kind: "cancel", booking: b })} className="rounded-lg border border-[#FECDCA] px-2.5 py-1.5 text-[11px] font-black text-[#B42318] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.cancel}</button>
                          )}
                          {b.status === "confirmed" && new Date(b.scheduled_at).getTime() <= loadedAt && (
                            <>
                              <button type="button" aria-label={fill(t.completeFor, shortId(b))} onClick={() => setPending({ kind: "complete", booking: b })} className="rounded-lg border border-[#A6F4C5] px-2.5 py-1.5 text-[11px] font-black text-[#067647] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.complete}</button>
                              <button type="button" aria-label={fill(t.noShowFor, shortId(b))} onClick={() => setPending({ kind: "no_show", booking: b })} className="rounded-lg border border-[#FEDF89] px-2.5 py-1.5 text-[11px] font-black text-[#93370D] focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.noShow}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loadError && matching > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-gray-600">
            {t.showing
              .replace("{from}", ((page - 1) * PAGE_SIZE + 1).toLocaleString(lang === "ar" ? "ar-SA" : "en-US"))
              .replace("{to}", Math.min(page * PAGE_SIZE, matching).toLocaleString(lang === "ar" ? "ar-SA" : "en-US"))
              .replace("{total}", matching.toLocaleString(lang === "ar" ? "ar-SA" : "en-US"))}
          </span>
          <div className="flex gap-2">
            <button type="button" aria-disabled={page <= 1 || loading} onClick={() => { if (!loading && page > 1) setPage((current) => current - 1); }} className={`rounded-xl border border-[#D0D5DD] px-3 py-1.5 font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${page <= 1 || loading ? "opacity-40" : ""}`}>{t.previous}</button>
            <button type="button" aria-disabled={page >= pages || loading} onClick={() => { if (!loading && page < pages) setPage((current) => current + 1); }} className={`rounded-xl border border-[#D0D5DD] px-3 py-1.5 font-bold focus-visible:outline-2 focus-visible:outline-[#9B7928] ${page >= pages || loading ? "opacity-40" : ""}`}>{t.next}</button>
          </div>
        </div>
      )}

      {loadError && loadForbidden && <ForbiddenNotice locale={lang} />}
      {loadError && !loadForbidden && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.loadFailed.replace("{reason}", loadError)}</span>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
        </div>
      )}

      {selectedBooking && !invoiceData && (
        <ModalPortal>
          <ModalOverlay onClose={() => setSelectedBooking(null)} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/40 px-4 py-6 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="invoice-title" dir={isRTL ? "rtl" : "ltr"} tabIndex={-1} className="w-full max-w-sm space-y-4 rounded-3xl border border-[#ECECEC] bg-white p-6 text-sm text-gray-700">
              <h2 id="invoice-title" className="text-lg font-serif font-black text-gray-900">{t.invoiceTitle}</h2>
              <p role={invoiceError ? "alert" : invoiceLoading ? "status" : undefined}>{invoiceLoading ? t.loadingInvoice : invoiceError ? t.invoiceFailed.replace("{reason}", invoiceError) : t.noInvoice}</p>
              <button type="button" data-autofocus onClick={() => setSelectedBooking(null)} className="rounded-full border border-[#D0D5DD] px-4 py-1.5 text-xs font-bold text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.close}</button>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}

      {/* Invoice dialog */}
      {selectedBooking && invoiceData && (
        <ModalPortal>
          <ModalOverlay onClose={() => setSelectedBooking(null)} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/40 px-4 py-6 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" aria-labelledby="invoice-title" dir={isRTL ? "rtl" : "ltr"} tabIndex={-1} className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-3xl border border-[#ECECEC] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
              <div>
                {/* Header */}
                <div className={`flex items-start justify-between gap-4 pb-4 border-b border-[#ECECEC] ${flip}`}>
                  <div>
                    <h2 id="invoice-title" className="text-lg font-serif font-black text-gray-900">{t.invoiceTitle}</h2>
                    <p dir="ltr" className="mt-1 text-[11px] font-semibold text-gray-600">ID: {selectedBooking.id}</p>
                  </div>
                  <button
                    type="button"
                    data-autofocus
                    onClick={() => setSelectedBooking(null)}
                    className="rounded-full border border-[#D0D5DD] px-3 py-1.5 text-xs font-bold text-gray-700 hover:border-[#D1AF47]/60 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                  >
                    {t.close}
                  </button>
                </div>

                {/* Invoice Specs */}
                <div className="my-5 space-y-4 text-xs font-semibold text-gray-700">
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-600">{t.invoiceNo}</span>
                    <span dir="ltr" className="font-mono font-bold text-gray-900">{invoiceData.number}</span>
                  </div>
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-600">{t.issueDate}</span>
                    <span className="text-gray-900">{operationsDate(invoiceData.timeStr, lang)}</span>
                  </div>
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-600">{t.clientCustomer}</span>
                    <span className="text-gray-900 font-bold">{bookingName(selectedBooking)}</span>
                  </div>
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-600">{t.providerBranch}</span>
                    <span className="text-gray-900 font-bold">{invoiceData.providerName}</span>
                  </div>
                  <div className={`flex justify-between ${flip}`}>
                    <span className="text-gray-600">{t.vatNo}</span>
                    <span dir="ltr" className="font-mono text-gray-900">{invoiceData.vatNo}</span>
                  </div>

                  <div className="h-px bg-[#ECECEC]" />

                  {/* Pricing Split */}
                  <div className="space-y-2 pt-2">
                    <div className={`flex justify-between ${flip}`}>
                      <span className="text-gray-600">{t.subtotal}</span>
                      <span className="font-mono text-gray-900">{sar(invoiceData.subtotal, lang)}</span>
                    </div>
                    <div className={`flex justify-between ${flip}`}>
                      <span className="text-gray-600">{t.vatAmount}</span>
                      <span className="font-mono text-gray-900">{sar(invoiceData.tax, lang)}</span>
                    </div>
                    <div className={`flex justify-between font-bold text-sm pt-2 border-t border-[#ECECEC] ${flip}`}>
                      <span className="text-gray-900">{t.totalAmount}</span>
                      <span className="font-mono text-[#7A5B12]">{sar(invoiceData.total, lang)}</span>
                    </div>
                  </div>

                  {/* ZATCA QR value. The invoice is never sent to an outside service to draw an image. */}
                  <div className="space-y-2 rounded-2xl border border-[#ECECEC] bg-gray-50/50 p-4">
                    <span className="block text-[11px] font-black uppercase tracking-wider text-[#475467]">{t.zatcaCompliance}</span>
                    {invoiceData.qrBase64 ? (
                      <>
                        <p className="text-xs font-medium leading-5 text-gray-600">{t.qrNotRendered}</p>
                        <textarea
                          readOnly
                          dir="ltr"
                          rows={4}
                          value={invoiceData.qrBase64}
                          aria-label={t.qrPayload}
                          onFocus={(event) => event.currentTarget.select()}
                          className="w-full rounded-xl border border-[#D0D5DD] bg-white p-2 font-mono text-[11px] text-gray-800 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(invoiceData.qrBase64).then(
                                () => setCopyState("copied"),
                                () => setCopyState("failed"),
                              );
                            }}
                            className="rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-black text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                          >
                            {t.copy}
                          </button>
                          <span role="status" className="text-xs font-semibold text-gray-600">{copyState === "copied" ? t.copied : copyState === "failed" ? t.copyFailed : ""}</span>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-red-700">{t.qrUnavailable}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Print trigger */}
              <div className="mt-6 pt-4 border-t border-[#ECECEC] flex gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-3 bg-[#D1AF47] hover:bg-[#E0C46A] text-[#070B12] font-black text-xs uppercase tracking-wider rounded-xl transition shadow-[0_4px_12px_rgba(209,175,71,0.2)] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                >
                  {t.printInvoice}
                </button>
              </div>
            </div>
          </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
}
