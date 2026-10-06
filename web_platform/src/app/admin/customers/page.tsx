"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { writeUrlState } from "@/lib/url-state";

// Customer directory and PDPL data requests. The directory is one server-computed page at a time
// (admin_customer_overview), so booking figures are exact and a visit to the page is recorded without keeping
// the search text. Phone verification and data requests change only through commands that need the operator's
// own reason or note; clearing profile details is its own audited command. Nothing here is built from a guess:
// a failed query says so instead of showing zeros or an empty queue.

const PAGE_SIZE = 25;
const OPEN_REQUEST_LIMIT = 200;
const CLOSED_REQUEST_LIMIT = 25;
const CONSENT_LIMIT = 50;

type Numeric = number | string | null;
type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  phone_verified: boolean;
  created_at: string;
  bookings: Numeric;
  completed_bookings: Numeric;
  spend: Numeric;
};
type Overview = { total_customers: Numeric; verified_customers: Numeric; matching: Numeric; rows: CustomerRow[] };
type RequestStatus = "pending" | "in_progress" | "completed" | "rejected";
type DataRequest = {
  id: string;
  user_id: string;
  request_type: string;
  status: RequestStatus;
  details: string | null;
  due_date: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { first_name: string | null; last_name: string | null } | null;
};
type Consent = { id: string; user_id: string; purpose: string; status: string; document_version: string; method: string; created_at: string };
type Notice = { error?: string; success?: string };
type Pending =
  | { kind: "phone"; customer: CustomerRow; next: boolean }
  | { kind: "clear"; customer: CustomerRow }
  | { kind: "request"; request: DataRequest; status: "in_progress" | "completed" | "rejected" };

const translations = {
  en: {
    title: "Customer Directory & Data Rights",
    subtitle: "Look up customer accounts and their booking history, and work through PDPL data requests and recorded consents.",
    searchLabel: "Search by name, email, phone or ID",
    viewSwitch: "View",
    tabCustomers: "Customer Directory",
    tabDsr: "PDPL Data Rights & Consents",
    totalCustomers: "Total Customers",
    verifiedCustomers: "Verified Phone Accounts",
    pendingDsr: "Open Data Requests",
    customerName: "Customer",
    contactInfo: "Contact",
    verificationStatus: "Phone",
    bookingsCount: "Bookings",
    totalSpend: "Spend on completed bookings",
    actions: "Actions",
    verified: "Verified",
    unverified: "Unverified",
    verifyBtn: "Verify phone",
    revokeBtn: "Remove verification",
    clearBtn: "Clear profile details",
    detailsCleared: "Details cleared",
    noPhone: "No phone number",
    noName: "—",
    idLabel: "ID {id}",
    verifyTitle: "Mark phone as verified",
    verifyIntro: "This marks the number as verified without a one-time code. Only do this after confirming the number with the customer.",
    verifyConfirm: "Mark as verified",
    revokeTitle: "Remove phone verification",
    revokeIntro: "The number stays on the profile but is no longer treated as verified.",
    revokeConfirm: "Remove verification",
    verifyDone: "Phone number marked as verified.",
    revokeDone: "Verified mark removed.",
    clearTitle: "Clear this customer's profile details",
    clearIntro: "The console cannot restore these details afterwards. Check the name and ID below belong to the customer you mean.",
    clearEffectsTitle: "What happens",
    clearEffects: [
      "Removed: name, email, phone number, gender and push token.",
      "Kept: sign-in identity, bookings, invoices and messages.",
      "The audit log records who cleared the profile and why, but not the values that were removed.",
    ],
    clearConfirm: "Clear profile details",
    clearDone: "Profile details cleared. Sign-in identity, bookings, invoices and messages were not changed.",
    factCustomer: "Customer",
    factEmail: "Email",
    factPhone: "Phone",
    factId: "ID",
    factRequest: "Request",
    factRespondBy: "Respond by",
    reasonLabel: "Reason (recorded in the audit log)",
    noteLabel: "Note on this request: what you did, or why it is refused (kept on the request and in the audit log)",
    requestStartTitle: "Start work on this request",
    requestCompleteTitle: "Mark this request completed",
    requestRejectTitle: "Refuse this request",
    requestRejectIntro: "The customer's request is closed as refused. Record the reason in the note.",
    openRecord: "Open customer record",
    clearFilter: "Clear search",
    loading: "Loading customers…",
    loadFailed: "Customers could not be loaded: {reason}",
    requestsFailed: "Data requests could not be loaded, so the queue below may be incomplete: {reason}",
    consentsFailed: "Consents could not be loaded: {reason}",
    retry: "Try again",
    emptyCustomers: "No customer accounts yet.",
    filteredEmpty: "No customers match this search.",
    showing: "Showing {from}–{to} of {total}",
    previous: "Previous",
    next: "Next",
    dsrTitle: "Data subject requests",
    dsrNote: "Saudi PDPL: respond within 30 days of intake. Open requests are listed first, oldest deadline first.",
    dsrTruncated: "Showing the first {n} open requests.",
    dsrType: "Request",
    dsrCustomer: "Customer",
    dsrDetails: "What the customer asked",
    dsrStatus: "Status",
    dsrDue: "Respond by",
    dsrNotes: "Operator note",
    emptyDsr: "No data requests have been filed.",
    overdue: "Overdue",
    requestTypes: { access: "Access", rectification: "Rectification", erasure: "Erasure", export: "Data export" } as Record<string, string>,
    requestStatuses: { pending: "Pending", in_progress: "In progress", completed: "Completed", rejected: "Rejected" } as Record<string, string>,
    actionStart: "Start work",
    actionComplete: "Mark completed",
    actionReject: "Refuse request",
    noteDone: "Request updated.",
    consentsTitle: "Recorded consents",
    consentsNote: "The latest recorded opt-ins and withdrawals for WhatsApp and promotional messaging.",
    consentUser: "Customer",
    purpose: "Purpose",
    consentStatus: "Status",
    consentVersion: "Document version",
    method: "How",
    consentTime: "Recorded",
    emptyConsents: "No consents have been recorded yet.",
    granted: "Granted",
    withdrawn: "Withdrawn",
  },
  ar: {
    title: "سجل العملاء وحقوق البيانات",
    subtitle: "ابحث عن حسابات العملاء وسجل حجوزاتهم، وتابع طلبات حقوق البيانات الشخصية (PDPL) والموافقات المسجلة.",
    searchLabel: "ابحث بالاسم أو البريد أو الهاتف أو المعرّف",
    viewSwitch: "العرض",
    tabCustomers: "سجل العملاء",
    tabDsr: "حقوق البيانات والموافقات (PDPL)",
    totalCustomers: "إجمالي العملاء",
    verifiedCustomers: "حسابات بأرقام موثقة",
    pendingDsr: "طلبات بيانات مفتوحة",
    customerName: "العميل",
    contactInfo: "التواصل",
    verificationStatus: "الهاتف",
    bookingsCount: "الحجوزات",
    totalSpend: "الإنفاق على الحجوزات المكتملة",
    actions: "الإجراءات",
    verified: "موثق",
    unverified: "غير موثق",
    verifyBtn: "توثيق الهاتف",
    revokeBtn: "إزالة التوثيق",
    clearBtn: "مسح بيانات الملف الشخصي",
    detailsCleared: "تم مسح البيانات",
    noPhone: "لا يوجد رقم هاتف",
    noName: "—",
    idLabel: "المعرّف {id}",
    verifyTitle: "توثيق رقم الهاتف",
    verifyIntro: "سيُعتبر الرقم موثقاً دون رمز تحقق. لا تفعل ذلك إلا بعد التأكد من الرقم مع العميل.",
    verifyConfirm: "توثيق الرقم",
    revokeTitle: "إزالة توثيق الهاتف",
    revokeIntro: "يبقى الرقم في الملف الشخصي لكنه لا يُعامل كرقم موثق.",
    revokeConfirm: "إزالة التوثيق",
    verifyDone: "تم توثيق رقم الهاتف.",
    revokeDone: "تمت إزالة التوثيق.",
    clearTitle: "مسح بيانات الملف الشخصي لهذا العميل",
    clearIntro: "لا تستطيع لوحة الإدارة استرجاع هذه البيانات بعد المسح. تأكد من أن الاسم والمعرّف أدناه يعودان للعميل المقصود.",
    clearEffectsTitle: "ما الذي سيحدث",
    clearEffects: [
      "يُحذف: الاسم والبريد ورقم الهاتف والجنس ورمز الإشعارات.",
      "يبقى: هوية تسجيل الدخول والحجوزات والفواتير والرسائل.",
      "يسجّل سجل التدقيق من مسح الملف الشخصي وسببه، دون القيم المحذوفة.",
    ],
    clearConfirm: "مسح بيانات الملف الشخصي",
    clearDone: "تم مسح بيانات الملف الشخصي. لم تتغير هوية تسجيل الدخول أو الحجوزات أو الفواتير أو الرسائل.",
    factCustomer: "العميل",
    factEmail: "البريد الإلكتروني",
    factPhone: "الهاتف",
    factId: "المعرّف",
    factRequest: "الطلب",
    factRespondBy: "آخر موعد للرد",
    reasonLabel: "السبب (يُسجل في سجل التدقيق)",
    noteLabel: "ملاحظة على الطلب: ما الذي تم، أو سبب الرفض (تُحفظ مع الطلب وفي سجل التدقيق)",
    requestStartTitle: "بدء العمل على هذا الطلب",
    requestCompleteTitle: "تسجيل هذا الطلب كمكتمل",
    requestRejectTitle: "رفض هذا الطلب",
    requestRejectIntro: "سيُغلق طلب العميل كمرفوض. اكتب السبب في الملاحظة.",
    openRecord: "فتح سجل العميل",
    clearFilter: "مسح البحث",
    loading: "جارٍ تحميل العملاء…",
    loadFailed: "تعذّر تحميل العملاء: {reason}",
    requestsFailed: "تعذّر تحميل طلبات البيانات، لذا قد تكون القائمة أدناه ناقصة: {reason}",
    consentsFailed: "تعذّر تحميل الموافقات: {reason}",
    retry: "إعادة المحاولة",
    emptyCustomers: "لا توجد حسابات عملاء بعد.",
    filteredEmpty: "لا يوجد عملاء مطابقون لهذا البحث.",
    showing: "عرض {from}–{to} من {total}",
    previous: "السابق",
    next: "التالي",
    dsrTitle: "طلبات أصحاب البيانات",
    dsrNote: "نظام حماية البيانات الشخصية: يجب الرد خلال 30 يوماً من تقديم الطلب. تظهر الطلبات المفتوحة أولاً بحسب أقرب موعد.",
    dsrTruncated: "عرض أول {n} من الطلبات المفتوحة.",
    dsrType: "الطلب",
    dsrCustomer: "العميل",
    dsrDetails: "ما طلبه العميل",
    dsrStatus: "الحالة",
    dsrDue: "آخر موعد للرد",
    dsrNotes: "ملاحظة المشرف",
    emptyDsr: "لم يُقدَّم أي طلب بيانات.",
    overdue: "متأخر",
    requestTypes: { access: "الاطلاع", rectification: "التصحيح", erasure: "المحو", export: "تصدير البيانات" } as Record<string, string>,
    requestStatuses: { pending: "قيد الانتظار", in_progress: "قيد المعالجة", completed: "مكتمل", rejected: "مرفوض" } as Record<string, string>,
    actionStart: "بدء العمل",
    actionComplete: "تسجيل كمكتمل",
    actionReject: "رفض الطلب",
    noteDone: "تم تحديث الطلب.",
    consentsTitle: "الموافقات المسجلة",
    consentsNote: "أحدث الموافقات والانسحابات المسجلة للتواصل عبر واتساب والرسائل الترويجية.",
    consentUser: "العميل",
    purpose: "الغرض",
    consentStatus: "الحالة",
    consentVersion: "إصدار الوثيقة",
    method: "الطريقة",
    consentTime: "وقت التسجيل",
    emptyConsents: "لم تُسجل أي موافقات بعد.",
    granted: "ممنوحة",
    withdrawn: "مسحوبة",
  },
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
const toNumber = (value: Numeric | undefined) => Number(value ?? 0);
// Characters that carry meaning in the search box are sent as typed; the server treats them as plain text.
const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

// The view and the search term are kept in the address bar (?tab=requests&q=...), so a dashboard link, a bookmark or a
// pasted link opens the same list.
export default function AdminCustomers() {
  return (
    <Suspense fallback={null}>
      <CustomersScreen />
    </Suspense>
  );
}

function CustomersScreen() {
  const lang = useOperationsLocale();
  const params = useSearchParams();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const numberFormat = isRTL ? "ar-SA" : "en-US";
  const count = (value: number) => value.toLocaleString(numberFormat);

  const [tab, setTab] = useState<"customers" | "dsr">(() => (params.get("tab") === "requests" ? "dsr" : "customers"));
  const [term, setTerm] = useState(() => params.get("q") ?? "");
  const [search, setSearch] = useState(() => (params.get("q") ?? "").trim());
  useEffect(() => {
    writeUrlState({ tab: tab === "dsr" ? "requests" : "", q: search });
  }, [tab, search]);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState("");
  const [customersForbidden, setCustomersForbidden] = useState(false);
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [openRequestTotal, setOpenRequestTotal] = useState(0);
  const [requestsError, setRequestsError] = useState("");
  const [requestsForbidden, setRequestsForbidden] = useState(false);
  const [consents, setConsents] = useState<Consent[] | null>(null);
  const [consentsError, setConsentsError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice>({});

  // The search box applies a moment after typing stops, so each keystroke is not a recorded look at customer data.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(term.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setCustomersLoading(true);
      setCustomersError("");
      const { data, error } = await supabase.rpc("admin_customer_overview", {
        p_search: search || null,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });
      if (cancelled) return;
      if (error) {
        setOverview(null);
        setCustomersError(errorMessage(error));
        setCustomersForbidden(isForbidden(error));
      } else {
        setOverview(data as Overview);
        setCustomersForbidden(false);
      }
      setCustomersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [search, page, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const select = "id, user_id, request_type, status, details, due_date, admin_notes, reviewed_at, created_at, profiles ( first_name, last_name )";
      const [open, closed, consentResult] = await Promise.all([
        supabase.from("data_subject_requests").select(select, { count: "exact" }).in("status", ["pending", "in_progress"]).order("due_date", { ascending: true }).range(0, OPEN_REQUEST_LIMIT - 1),
        supabase.from("data_subject_requests").select(select).in("status", ["completed", "rejected"]).order("reviewed_at", { ascending: false }).range(0, CLOSED_REQUEST_LIMIT - 1),
        supabase.from("consents").select("id, user_id, purpose, status, document_version, method, created_at").order("created_at", { ascending: false }).limit(CONSENT_LIMIT),
      ]);
      if (cancelled) return;
      const failure = open.error ?? closed.error;
      if (failure) {
        setRequests(null);
        setRequestsError(errorMessage(failure));
        setRequestsForbidden(isForbidden(failure));
      } else {
        setRequestsForbidden(false);
        setRequests([...((open.data ?? []) as unknown as DataRequest[]), ...((closed.data ?? []) as unknown as DataRequest[])]);
        setOpenRequestTotal(open.count ?? 0);
        setRequestsError("");
      }
      if (consentResult.error) {
        setConsents(null);
        setConsentsError(errorMessage(consentResult.error));
      } else {
        setConsents((consentResult.data ?? []) as Consent[]);
        setConsentsError("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Runs one operator command. A refusal is handed back to the dialog (which stays open and keeps what was typed);
  // a success is announced where the operator is looking and the list is read again.
  const execute = async (command: PromiseLike<{ error: unknown }>, success: string): Promise<string | null> => {
    const { error } = await command;
    if (error) return errorMessage(error);
    setNotice({ success });
    setReloadKey((key) => key + 1);
    return null;
  };

  // Shows one customer's own record: the directory filtered to that customer's ID.
  const openCustomer = (userId: string) => {
    setTab("customers");
    setTerm(userId);
    setSearch(userId);
    setPage(1);
  };

  const rows = overview?.rows ?? [];
  const matching = toNumber(overview?.matching);
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const today = riyadhToday();
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";
  const personName = (profile: { first_name: string | null; last_name: string | null } | null | undefined) =>
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const isCleared = (customer: CustomerRow) => !customer.first_name && !customer.last_name && !customer.email && !customer.phone_number;
  const smallButton = `whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${focusRing}`;
  const customerLabel = (customer: CustomerRow) => (isCleared(customer) ? t.detailsCleared : personName(customer) || customer.email || customer.id.slice(0, 8));

  const renderDialog = () => {
    if (!pending) return null;
    const close = () => setPending(null);
    if (pending.kind === "phone") {
      const { customer, next } = pending;
      return (
        <CommandDialog
          locale={lang}
          title={next ? t.verifyTitle : t.revokeTitle}
          intro={next ? t.verifyIntro : t.revokeIntro}
          facts={[
            { label: t.factCustomer, value: customerLabel(customer) },
            { label: t.factPhone, value: customer.phone_number || t.noPhone },
            { label: t.factId, value: customer.id.slice(0, 8) },
          ]}
          reasonLabel={t.reasonLabel}
          confirmLabel={next ? t.verifyConfirm : t.revokeConfirm}
          onConfirm={(why) => execute(supabase.rpc("admin_set_phone_verified", { p_customer_id: customer.id, p_verified: next, p_reason: why }), next ? t.verifyDone : t.revokeDone)}
          onClose={close}
        />
      );
    }
    if (pending.kind === "clear") {
      const { customer } = pending;
      return (
        <CommandDialog
          locale={lang}
          tone="danger"
          title={t.clearTitle}
          intro={t.clearIntro}
          facts={[
            { label: t.factCustomer, value: customerLabel(customer) },
            { label: t.factEmail, value: customer.email || "—" },
            { label: t.factPhone, value: customer.phone_number || t.noPhone },
            { label: t.factId, value: customer.id },
          ]}
          effectsTitle={t.clearEffectsTitle}
          effects={t.clearEffects}
          reasonLabel={t.reasonLabel}
          confirmWord={customer.id.slice(0, 8)}
          confirmLabel={t.clearConfirm}
          onConfirm={(why) => execute(supabase.rpc("admin_clear_customer_profile", { p_customer_id: customer.id, p_reason: why }), t.clearDone)}
          onClose={close}
        />
      );
    }
    const { request, status } = pending;
    return (
      <CommandDialog
        locale={lang}
        tone={status === "rejected" ? "danger" : "default"}
        title={status === "in_progress" ? t.requestStartTitle : status === "completed" ? t.requestCompleteTitle : t.requestRejectTitle}
        intro={status === "rejected" ? t.requestRejectIntro : undefined}
        facts={[
          { label: t.factRequest, value: t.requestTypes[request.request_type] ?? request.request_type },
          { label: t.factCustomer, value: `${personName(request.profiles) || "—"} (${request.user_id.slice(0, 8)})` },
          { label: t.factRespondBy, value: request.due_date ? String(request.due_date).slice(0, 10) : "—" },
        ]}
        reasonLabel={t.noteLabel}
        confirmLabel={status === "in_progress" ? t.actionStart : status === "completed" ? t.actionComplete : t.actionReject}
        onConfirm={(note) => execute(supabase.rpc("admin_update_data_request", { p_request_id: request.id, p_status: status, p_note: note }), t.noteDone)}
        onClose={close}
      />
    );
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-black tracking-tight text-gray-900 leading-tight">{t.title}</h1>
          <p className="mt-1 text-xs font-semibold text-gray-500">{t.subtitle}</p>
        </div>
        <div role="group" aria-label={t.viewSwitch} className="flex rounded-xl border border-gray-200 bg-gray-100 p-1 text-xs font-bold">
          {(["customers", "dsr"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-lg px-4 py-2 transition ${focusRing} ${tab === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
            >
              {value === "customers" ? t.tabCustomers : t.tabDsr}
            </button>
          ))}
        </div>
      </div>

      <CommandResult error={notice.error} success={notice.success} locale={lang} onDismiss={() => setNotice({})} />
      {renderDialog()}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          [t.totalCustomers, overview ? count(toNumber(overview.total_customers)) : "—", "text-gray-900"],
          [t.verifiedCustomers, overview ? count(toNumber(overview.verified_customers)) : "—", "text-emerald-700"],
          [t.pendingDsr, requests ? count(openRequestTotal) : "—", openRequestTotal > 0 ? "text-amber-700" : "text-gray-900"],
        ].map(([label, value, tone]) => (
          <div key={label} className={cardBase}>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{label}</span>
            <strong className={`mt-2.5 block text-2xl font-serif font-black ${tone}`}>{value}</strong>
          </div>
        ))}
      </div>

      {tab === "customers" ? (
        <>
          <label className="block max-w-xl text-[11px] font-bold text-[#667085]">
            <span>{t.searchLabel}</span>
            <input type="search" value={term} onChange={(event) => setTerm(event.target.value)} className={`${operationsInput} mt-1`} />
          </label>

          {customersError && customersForbidden ? (
            <ForbiddenNotice locale={lang} />
          ) : customersError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <span>{fill(t.loadFailed, { reason: customersError })}</span>
              <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={`rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-800 ${focusRing}`}>{t.retry}</button>
            </div>
          ) : customersLoading && !overview ? (
            <div role="status" className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">{t.loading}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ECECEC] bg-white p-5 text-sm font-semibold text-gray-500">
              <span>{search ? t.filteredEmpty : t.emptyCustomers}</span>
              {search && <button type="button" onClick={() => { setTerm(""); setSearch(""); setPage(1); }} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 text-xs font-black text-gray-700 ${focusRing}`}>{t.clearFilter}</button>}
            </div>
          ) : (
            <div role="region" aria-label={t.tabCustomers} aria-busy={customersLoading} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
                  <tr>
                    {[t.customerName, t.contactInfo, t.verificationStatus, t.bookingsCount, t.totalSpend, t.actions].map((heading) => (
                      <th key={heading} scope="col" className={`${cell} text-start`}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2F4F7]">
                  {rows.map((customer) => {
                    const cleared = isCleared(customer);
                    return (
                      <tr key={customer.id}>
                        <td className={cell}>
                          <div className="font-bold text-gray-900">{cleared ? t.detailsCleared : personName(customer) || t.noName}</div>
                          <div dir="ltr" className="text-start text-[11px] font-semibold text-gray-600">{fill(t.idLabel, { id: customer.id.slice(0, 8) })}</div>
                        </td>
                        <td className={cell}>
                          <div dir="ltr" className="text-start font-bold text-gray-900">{customer.email || "—"}</div>
                          <div dir="ltr" className="text-start text-[11px] font-semibold text-gray-500">{customer.phone_number || t.noPhone}</div>
                        </td>
                        <td className={cell}>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ${customer.phone_verified ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#FFFAEB] text-[#93370D]"}`}>
                            {customer.phone_verified ? t.verified : t.unverified}
                          </span>
                        </td>
                        <td className={`${cell} font-black text-gray-900`}>{count(toNumber(customer.bookings))}</td>
                        <td className={`${cell} whitespace-nowrap font-black text-gray-900`}>{sar(toNumber(customer.spend), lang)}</td>
                        <td className={cell}>
                          <div className="flex flex-wrap gap-2">
                            {(customer.phone_verified || customer.phone_number) && (
                              <button type="button" aria-label={`${customer.phone_verified ? t.revokeBtn : t.verifyBtn}: ${customerLabel(customer)}`} onClick={() => setPending({ kind: "phone", customer, next: !customer.phone_verified })} className={`${smallButton} border-[#ECECEC] text-gray-700`}>
                                {customer.phone_verified ? t.revokeBtn : t.verifyBtn}
                              </button>
                            )}
                            {!cleared && (
                              <button type="button" aria-label={`${t.clearBtn}: ${customerLabel(customer)}`} onClick={() => setPending({ kind: "clear", customer })} className={`${smallButton} border-red-200 text-red-700`}>{t.clearBtn}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!customersError && matching > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-gray-500">
                {fill(t.showing, { from: count((page - 1) * PAGE_SIZE + 1), to: count(Math.min(page * PAGE_SIZE, matching)), total: count(matching) })}
              </span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1 || customersLoading} onClick={() => setPage((current) => Math.max(1, current - 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>{t.previous}</button>
                <button type="button" disabled={page >= pages || customersLoading} onClick={() => setPage((current) => Math.min(pages, current + 1))} className={`rounded-xl border border-[#ECECEC] px-3 py-1.5 font-bold disabled:opacity-40 ${focusRing}`}>{t.next}</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <section className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]" aria-labelledby="dsr-title">
            <div className="border-b border-[#ECECEC] p-5">
              <h3 id="dsr-title" className="text-base font-serif font-black text-gray-900">{t.dsrTitle}</h3>
              <div className="mt-0.5 text-[11px] font-medium text-gray-500">{t.dsrNote}</div>
              {openRequestTotal > OPEN_REQUEST_LIMIT && <div className="mt-1 text-[11px] font-bold text-amber-700">{fill(t.dsrTruncated, { n: count(OPEN_REQUEST_LIMIT) })}</div>}
            </div>
            {requestsError && requestsForbidden && <div className="m-4"><ForbiddenNotice locale={lang} /></div>}
            {requestsError && !requestsForbidden && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{fill(t.requestsFailed, { reason: requestsError })}</div>}
            {requests && (
              <div role="region" aria-label={t.dsrTitle} tabIndex={0} className={`overflow-x-auto ${focusRing}`}>
                <table className="w-full min-w-[960px] text-xs">
                  <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
                    <tr>
                      {[t.dsrType, t.dsrCustomer, t.dsrDetails, t.dsrStatus, t.dsrDue, t.dsrNotes, t.actions].map((heading) => (
                        <th key={heading} scope="col" className={`${cell} text-start`}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {requests.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center font-bold text-gray-400">{t.emptyDsr}</td></tr>
                    ) : (
                      requests.map((request) => {
                        const open = request.status === "pending" || request.status === "in_progress";
                        const late = open && Boolean(request.due_date) && String(request.due_date) < today;
                        return (
                          <tr key={request.id}>
                            <td className={`${cell} font-bold text-stone-900`}>{t.requestTypes[request.request_type] ?? request.request_type}</td>
                            <td className={cell}>
                              <div className="font-bold text-gray-900">{personName(request.profiles) || "—"}</div>
                              <div dir="ltr" className="text-start font-mono text-[11px] text-stone-600">{request.user_id.slice(0, 8)}</div>
                              <button type="button" onClick={() => openCustomer(request.user_id)} aria-label={`${t.openRecord}: ${personName(request.profiles) || request.user_id.slice(0, 8)}`} className={`mt-1 text-[11px] font-black text-[#725517] underline underline-offset-2 ${focusRing}`}>{t.openRecord}</button>
                            </td>
                            <td className={`${cell} max-w-[220px] text-[11px] text-stone-600`}><span className="line-clamp-3" title={request.details ?? ""}>{request.details || "—"}</span></td>
                            <td className={cell}>
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                                request.status === "completed" ? "bg-emerald-100 text-emerald-800" : request.status === "pending" ? "bg-amber-100 text-amber-800" : request.status === "in_progress" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
                              }`}>{t.requestStatuses[request.status] ?? request.status}</span>
                            </td>
                            <td className={`${cell} whitespace-nowrap text-[11px] ${late ? "font-black text-red-700" : "text-stone-700"}`}>
                              {request.due_date ? new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${String(request.due_date).slice(0, 10)}T00:00:00Z`)) : "—"}
                              {late && <div>{t.overdue}</div>}
                            </td>
                            <td className={`${cell} max-w-[220px] text-[11px] text-stone-600`}>
                              <span className="line-clamp-3" title={request.admin_notes ?? ""}>{request.admin_notes || "—"}</span>
                              {request.reviewed_at && <div className="text-[11px] text-stone-400">{operationsDate(request.reviewed_at, lang)}</div>}
                            </td>
                            <td className={cell}>
                              {open && (
                                <div className="flex flex-wrap gap-2">
                                  {request.status === "pending" && (
                                    <button type="button" aria-label={`${t.actionStart}: ${t.requestTypes[request.request_type] ?? request.request_type} (${request.user_id.slice(0, 8)})`} onClick={() => setPending({ kind: "request", request, status: "in_progress" })} className={`${smallButton} border-blue-200 text-blue-800`}>{t.actionStart}</button>
                                  )}
                                  <button type="button" aria-label={`${t.actionComplete}: ${t.requestTypes[request.request_type] ?? request.request_type} (${request.user_id.slice(0, 8)})`} onClick={() => setPending({ kind: "request", request, status: "completed" })} className={`${smallButton} border-emerald-200 text-emerald-800`}>{t.actionComplete}</button>
                                  <button type="button" aria-label={`${t.actionReject}: ${t.requestTypes[request.request_type] ?? request.request_type} (${request.user_id.slice(0, 8)})`} onClick={() => setPending({ kind: "request", request, status: "rejected" })} className={`${smallButton} border-red-200 text-red-700`}>{t.actionReject}</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]" aria-labelledby="consents-title">
            <div className="border-b border-[#ECECEC] p-5">
              <h3 id="consents-title" className="text-base font-serif font-black text-gray-900">{t.consentsTitle}</h3>
              <div className="mt-0.5 text-[11px] font-medium text-gray-500">{t.consentsNote}</div>
            </div>
            {consentsError && <div role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{fill(t.consentsFailed, { reason: consentsError })}</div>}
            {consents && (
              <div role="region" aria-label={t.consentsTitle} tabIndex={0} className={`overflow-x-auto ${focusRing}`}>
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
                    <tr>
                      {[t.consentUser, t.purpose, t.consentStatus, t.consentVersion, t.method, t.consentTime].map((heading) => (
                        <th key={heading} scope="col" className={`${cell} text-start`}>{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {consents.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center font-bold text-gray-400">{t.emptyConsents}</td></tr>
                    ) : (
                      consents.map((consent) => (
                        <tr key={consent.id}>
                          <td dir="ltr" className={`${cell} text-start font-mono text-[11px] text-stone-500`}>{consent.user_id.slice(0, 8)}</td>
                          <td className={`${cell} font-bold text-stone-800`}>{consent.purpose}</td>
                          <td className={cell}>
                            <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-black ${consent.status === "granted" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                              {consent.status === "granted" ? t.granted : consent.status === "withdrawn" ? t.withdrawn : consent.status}
                            </span>
                          </td>
                          <td className={`${cell} text-stone-500`}>{consent.document_version}</td>
                          <td className={`${cell} text-stone-500`}>{consent.method}</td>
                          <td className={`${cell} whitespace-nowrap text-[11px] text-stone-500`}>{operationsDate(consent.created_at, lang)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
