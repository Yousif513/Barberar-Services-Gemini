"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { describeConsoleError } from "@/lib/console-errors.mjs";
import { CommandResult, ForbiddenNotice, isForbidden, operationsButton, operationsDate, operationsInput, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { writeUrlState } from "@/lib/url-state";
import { knownToHold, useConsoleSession } from "@/lib/console-session";
import { CustomerPicker, type PickedCustomer } from "./customer-picker";
import { RetentionPurgePanel } from "./retention-purge";

// Privacy requests, legal holds, the deletion ledger and the health-intake collection gate (PRIV package; Q1, Q2, Q2.6, X3(6) of
// docs/legal/2026-10-10-privacy-decision-memo.md). Every read goes through an audited server function and every change through a
// server command; the server decides who may do what (privacy.manage works the queue, a different privacy.approve holder approves
// a copy, a deletion or a hold on the Approvals screen). Nothing here is computed from a guess: a failed read says so.

type RequestType = "access" | "copy" | "correction" | "deletion" | "consent_withdrawal";
type PrivacyRequest = {
  id: string; subject_id: string; request_type: RequestType; channel: string; status: string; details: string | null;
  received_at: string; verified_at: string | null; verification_method: string | null; deadline_at: string; due_at: string;
  extended_due_at: string | null; extension_code: string | null; extension_reason: string | null; elapsed_days: number;
  escalation: "past_internal_target" | "day_20" | "day_28" | "overdue" | null; refusal_code: string | null; decision_reason: string | null;
  correction_field: string | null; correction_value: string | null; review_choice: string | null; consent_purposes: string[] | null;
  execution_state: string | null; completion_summary: Record<string, unknown> | null; completed_at: string | null; staff_notes: string | null;
  approval_request_id: string | null; legacy: boolean; subject: { first_name: string | null; last_name: string | null } | null;
  events?: { event: string; actor_kind: string; created_at: string; details: Record<string, unknown> }[];
  restricted_field?: string | null; recipients_notified?: number;
};
type Hold = {
  id: string; subject_id: string | null; basis: string; case_reference: string; booking_id: string | null; categories: string[]; reason: string;
  status: string; review_due_at: string | null; review_overdue: boolean; created_at: string; approved_at: string | null; release_due_at: string | null;
};
type LedgerSummary = { entries: number; auth_pending: number; last_erased_at: string | null; last_reapplied_at: string | null };
type Gate = { enabled: boolean; approved_on: string | null; notice_en: string | null; notice_ar: string | null };
type Dialog =
  | { kind: "note" | "propose" | "correction"; request: PrivacyRequest }
  | { kind: "review"; hold: Hold; keep: boolean }
  | { kind: "revoke" };

const PAGE = 50;
const copy = {
  en: {
    title: "Privacy Requests",
    subtitle: "PDPL requests from customers: 30 days from receipt, one extension of up to 30 days notified before day 30, free of charge. A copy, a deletion and a legal hold run only after a different owner approves them.",
    tabs: { requests: "Requests", holds: "Legal holds", ledger: "Deletion ledger & health intake" },
    open: "Open", closed: "Closed", view: "View",
    types: { access: "Access", copy: "Copy", correction: "Correction", deletion: "Deletion", consent_withdrawal: "Consent withdrawal" } as Record<string, string>,
    statuses: { awaiting_verification: "Waiting for the customer to confirm", open: "Open", awaiting_approval: "Waiting for approval", executing: "Being carried out", completed: "Completed", refused: "Refused", withdrawn: "Withdrawn" } as Record<string, string>,
    channels: { in_app: "In the app", email: "E-mail", phone: "Phone", in_person: "In person" } as Record<string, string>,
    escalation: { past_internal_target: "Past the 15-day target", day_20: "Escalated: day 20", day_28: "Escalated: day 28", overdue: "Overdue" } as Record<string, string>,
    cols: ["Request", "Customer", "Channel", "Received", "Deadline", "Status", ""],
    loading: "Loading…", loadFailed: "Privacy requests could not be loaded: {reason}", retry: "Try again",
    emptyOpen: "No open privacy requests.", emptyClosed: "No closed privacy requests yet.",
    escalate: "Run the day-20 / day-28 check now", escalated: "Escalation check done: {a} at day 20, {b} at day 28.",
    detailTitle: "Request {id}", received: "Received", verified: "Identity confirmed", notVerified: "Not confirmed yet: nothing is released or deleted before the customer confirms with a one-time code in the app.",
    deadline: "Deadline", extended: "Extended once", extensionReason: "Extension reason", details: "What the customer asked", notes: "Staff notes", history: "History",
    correction: "Correction asked", reviewChoice: "Reviews", reviewChoices: { delete_text: "Delete the review text", deleted_user: "Keep as \"Deleted user\"" } as Record<string, string>,
    purposes: "Consents to withdraw", restricted: "Field held out of processing", summary: "Outcome", decision: "Decision",
    addNote: "Add a note", propose: "Propose for approval", completeCorrection: "Complete the correction", buildCopy: "Build the copy now", eraseAccount: "Delete the sign-in account now",
    extendTitle: "Extend once (before day 30)", extendReason: "Reason the customer will read (at least 20 characters)", extendSubmit: "Extend by up to 30 days",
    extendCodes: { disproportionate_effort: "Disproportionate effort", multiple_requests: "Multiple requests from this person" } as Record<string, string>,
    refuseTitle: "Refuse", refuseReason: "Reason the customer will read with their right to complain to SDAIA (at least 20 characters)", refuseSubmit: "Refuse the request",
    refuseCodes: { repetitive: "Repetitive", manifestly_unfounded: "Manifestly unfounded", disproportionate: "Disproportionate" } as Record<string, string>,
    noteLabel: "Note (kept on the request and in the audit log)", proposeTitle: "Propose this {type} for approval",
    proposeIntro: "A different owner approves it on the Approvals screen; you cannot approve your own proposal. Both of you confirm a fresh authenticator code.",
    proposeReason: "What you checked (at least 10 characters)", deletionEffects: "What the deletion does", correctionTitle: "Complete the correction",
    correctionIntro: "The new value replaces the contested one, every business the customer booked with is notified, and the customer is told.",
    correctionReason: "How the correction was checked (at least 10 characters)", done: "Done.",
    preview: "{p} bookings pseudonymised and kept 10 years with their invoices, {d} bookings deleted, {m} messages deleted, {h} health answers destroyed, {c} consents and {f} favourites deleted. Open disputes: {o}. Wallet balance: {w} SAR, unused package sessions: {s}.",
    logTitle: "Log a request received outside the app", type: "Type", channel: "Channel", receivedAt: "Received at (Riyadh time)",
    whatAsked: "What the customer asked (10 to 2000 characters)", field: "Detail to correct", newValue: "Correct value", purposesLabel: "Consents to withdraw",
    logSubmit: "Log the request", logged: "Logged. The customer was asked to confirm it in the app.",
    fields: { first_name: "First name", last_name: "Last name", gender: "Gender" } as Record<string, string>,
    purposeNames: { whatsapp: "WhatsApp", marketing: "Marketing", photos_portfolio: "Photos in portfolio", data_processing: "Data processing", health_data: "Health data", health_data_reuse: "Health-data reuse" } as Record<string, string>,
    holdsActive: "Active", holdsPending: "Waiting for approval", holdsClosed: "Released or withdrawn", reviewOverdue: "{n} holds are past their 90-day review.",
    holdCols: ["Basis", "Reference", "Customer", "Held", "Review due", ""], basis: { court_case: "Court case", payment_dispute: "Payment dispute" } as Record<string, string>,
    keep: "Keep (review again in 90 days)", release: "Release", releaseAsked: "Release requested: a second privacy approver must approve it under Approvals. The hold stays in force until then.",
    renewalAsked: "This hold was already renewed 3 times; keeping it needs an owner who has never proposed, approved or renewed it. The request is under Approvals.",
    releaseIntro: "Releasing a hold early is decided by a second privacy approver. Once approved, what the hold kept is erased at once (and an account kept for a court case is deleted with its login).",
    releaseDue: "Release dispute holds 30 days after the dispute closed",
    reviewTitleKeep: "Keep this hold", reviewTitleRelease: "Release this hold", reviewReason: "Outcome of the review (at least 20 characters)",
    holdForm: "Propose a legal hold", holdBasis: "Basis", holdReference: "Case or dispute reference", holdCategories: "What the case needs (never health data)",
    holdBooking: "Disputed booking ID", holdReason: "Why (at least 20 characters)", holdAccountReason: "Why the case needs the account itself: profile, contact details and login (at least 20 characters)", holdSubmit: "Propose the hold",
    categories: { account: "Account", reviews: "Reviews", messages: "Messages", bookings: "Bookings" } as Record<string, string>,
    emptyHolds: "No holds in this list.", released: "Released: {n}.",
    ledgerTitle: "Deletion ledger", ledgerEntries: "Erased customers recorded", authPending: "Sign-in accounts still to delete", lastErased: "Last erasure", lastReapplied: "Last re-application",
    ledgerNote: "A database restore rolls this ledger back too. Download it after each deletion and keep it outside the database with its SHA-256; after any restore, the archive is imported with the service key (privacy_import_deletion_archive), then re-applied here.",
    download: "Download the ledger (JSON)", reapply: "Re-apply the ledger now", reapplied: "Re-applied: {n} customers erased again; {a} sign-in accounts to delete.",
    gateTitle: "Health-intake collection", gateOff: "Collection is OFF until the owner records the approved transfer risk assessment (X3 item 6).", gateOn: "Collection is ON. Approved assessment dated {date}.",
    gateForm: "Record the approved transfer risk assessment (owner)", docRef: "Signed document reference", approvedOn: "Approval date", signedBy: "Signed by", gateNotes: "Notes (optional)",
    gateSubmit: "Record and switch collection on", revoke: "Switch collection off", revokeTitle: "Switch health-intake collection off", revokeReason: "Reason (at least 10 characters)",
    never: "—",
    v: {
      subject: "Find and choose the customer first.", details: "Describe what the customer asked in 10 to 2000 characters ({count} now).",
      value: "Enter the correct value.", purposes: "Tick at least one consent to withdraw.", min: "Write at least {n} characters ({count} now).",
      booking: "Enter the disputed booking's ID: 36 characters, as shown on the booking.", received: "Enter when it actually arrived, within the last 30 days and not in the future.",
      date: "Enter the approval date.", categories: "Tick at least one thing the case needs.", fix: "Check the highlighted fields.",
    },
  },
  ar: {
    title: "طلبات الخصوصية",
    subtitle: "طلبات العملاء وفق نظام حماية البيانات الشخصية: ٣٠ يوماً من الاستلام، وتمديد واحد حتى ٣٠ يوماً يُبلَّغ قبل اليوم ٣٠، ومجاناً. لا تُنفَّذ النسخة أو الحذف أو الحجز القانوني إلا بعد اعتماد مالك آخر.",
    tabs: { requests: "الطلبات", holds: "الحجز القانوني", ledger: "سجل الحذف والاستبيان الصحي" },
    open: "مفتوحة", closed: "مغلقة", view: "عرض",
    types: { access: "اطلاع", copy: "نسخة", correction: "تصحيح", deletion: "حذف", consent_withdrawal: "سحب موافقة" } as Record<string, string>,
    statuses: { awaiting_verification: "بانتظار تأكيد العميل", open: "مفتوح", awaiting_approval: "بانتظار الاعتماد", executing: "قيد التنفيذ", completed: "مكتمل", refused: "مرفوض", withdrawn: "مسحوب" } as Record<string, string>,
    channels: { in_app: "داخل التطبيق", email: "البريد", phone: "الهاتف", in_person: "حضورياً" } as Record<string, string>,
    escalation: { past_internal_target: "تجاوز هدف ١٥ يوماً", day_20: "تصعيد: اليوم ٢٠", day_28: "تصعيد: اليوم ٢٨", overdue: "متأخر" } as Record<string, string>,
    cols: ["الطلب", "العميل", "القناة", "الاستلام", "الموعد النهائي", "الحالة", ""],
    loading: "جارٍ التحميل…", loadFailed: "تعذّر تحميل طلبات الخصوصية: {reason}", retry: "إعادة المحاولة",
    emptyOpen: "لا توجد طلبات خصوصية مفتوحة.", emptyClosed: "لا توجد طلبات مغلقة بعد.",
    escalate: "تشغيل فحص اليوم ٢٠ / ٢٨ الآن", escalated: "تم الفحص: {a} عند اليوم ٢٠ و{b} عند اليوم ٢٨.",
    detailTitle: "الطلب {id}", received: "الاستلام", verified: "تأكيد الهوية", notVerified: "لم يؤكَّد بعد: لا يُسلَّم أو يُحذف شيء قبل تأكيد العميل برمز لمرة واحدة داخل التطبيق.",
    deadline: "الموعد النهائي", extended: "مُدِّد مرة واحدة", extensionReason: "سبب التمديد", details: "ما طلبه العميل", notes: "ملاحظات الفريق", history: "السجل",
    correction: "التصحيح المطلوب", reviewChoice: "التقييمات", reviewChoices: { delete_text: "حذف نص التقييم", deleted_user: "الإبقاء باسم «مستخدم محذوف»" } as Record<string, string>,
    purposes: "الموافقات المطلوب سحبها", restricted: "حقل موقوف عن المعالجة", summary: "النتيجة", decision: "القرار",
    addNote: "إضافة ملاحظة", propose: "اقتراح للاعتماد", completeCorrection: "إتمام التصحيح", buildCopy: "إنشاء النسخة الآن", eraseAccount: "حذف حساب الدخول الآن",
    extendTitle: "تمديد مرة واحدة (قبل اليوم ٣٠)", extendReason: "السبب الذي سيقرؤه العميل (٢٠ حرفاً على الأقل)", extendSubmit: "تمديد حتى ٣٠ يوماً",
    extendCodes: { disproportionate_effort: "جهد غير متناسب", multiple_requests: "طلبات متعددة من الشخص نفسه" } as Record<string, string>,
    refuseTitle: "رفض", refuseReason: "السبب الذي سيقرؤه العميل مع حقه في الشكوى إلى سدايا (٢٠ حرفاً على الأقل)", refuseSubmit: "رفض الطلب",
    refuseCodes: { repetitive: "متكرر", manifestly_unfounded: "لا أساس له بوضوح", disproportionate: "غير متناسب" } as Record<string, string>,
    noteLabel: "ملاحظة (تُحفظ مع الطلب وفي سجل التدقيق)", proposeTitle: "اقتراح {type} للاعتماد",
    proposeIntro: "يعتمده مالك آخر من شاشة الاعتمادات؛ لا يمكنك اعتماد اقتراحك. يؤكد كلاكما برمز جديد من تطبيق المصادقة.",
    proposeReason: "ما الذي تحققت منه (١٠ أحرف على الأقل)", deletionEffects: "ما الذي يفعله الحذف", correctionTitle: "إتمام التصحيح",
    correctionIntro: "تحل القيمة الجديدة محل القيمة المعترض عليها، وتُبلَّغ كل منشأة حجز لديها العميل، ويُبلَّغ العميل.",
    correctionReason: "كيف تم التحقق من التصحيح (١٠ أحرف على الأقل)", done: "تم.",
    preview: "{p} حجوزات تُزال منها الهوية وتُحفظ ١٠ سنوات مع فواتيرها، {d} حجوزات تُحذف، {m} رسائل تُحذف، {h} إجابات صحية تُتلف، {c} موافقات و{f} مفضلة تُحذف. نزاعات مفتوحة: {o}. رصيد المحفظة: {w} ريال، جلسات باقات غير مستخدمة: {s}.",
    logTitle: "تسجيل طلب ورد خارج التطبيق", type: "النوع", channel: "القناة", receivedAt: "وقت الاستلام (بتوقيت الرياض)",
    whatAsked: "ما طلبه العميل (١٠ إلى ٢٠٠٠ حرف)", field: "البيان المطلوب تصحيحه", newValue: "القيمة الصحيحة", purposesLabel: "الموافقات المطلوب سحبها",
    logSubmit: "تسجيل الطلب", logged: "تم التسجيل. طُلب من العميل تأكيده داخل التطبيق.",
    fields: { first_name: "الاسم الأول", last_name: "اسم العائلة", gender: "الجنس" } as Record<string, string>,
    purposeNames: { whatsapp: "واتساب", marketing: "التسويق", photos_portfolio: "الصور في المعرض", data_processing: "معالجة البيانات", health_data: "البيانات الصحية", health_data_reuse: "إعادة استخدام البيانات الصحية" } as Record<string, string>,
    holdsActive: "سارية", holdsPending: "بانتظار الاعتماد", holdsClosed: "مرفوعة أو مسحوبة", reviewOverdue: "{n} حجوزات تجاوزت مراجعة ٩٠ يوماً.",
    holdCols: ["الأساس", "المرجع", "العميل", "المحجوز", "موعد المراجعة", ""], basis: { court_case: "قضية أمام القضاء", payment_dispute: "نزاع دفع" } as Record<string, string>,
    keep: "إبقاء (مراجعة بعد ٩٠ يوماً)", release: "رفع الحجز", releaseAsked: "طُلب رفع الحجز: يجب أن يعتمده مسؤول خصوصية ثانٍ في صفحة الموافقات، ويبقى الحجز سارياً حتى ذلك الحين.",
    renewalAsked: "جُدد هذا الحجز ٣ مرات من قبل؛ يتطلب إبقاؤه مالكاً لم يقترحه أو يعتمده أو يجدده من قبل. الطلب في صفحة الموافقات.",
    releaseIntro: "يقرر رفعَ الحجز قبل موعده مسؤولُ خصوصية ثانٍ. بعد الاعتماد يُحذف ما احتفظ به الحجز فوراً (ويُحذف الحساب المحتفظ به لقضية مع بيانات دخوله).",
    releaseDue: "رفع حجوزات النزاعات بعد ٣٠ يوماً من إغلاقها",
    reviewTitleKeep: "إبقاء هذا الحجز", reviewTitleRelease: "رفع هذا الحجز", reviewReason: "نتيجة المراجعة (٢٠ حرفاً على الأقل)",
    holdForm: "اقتراح حجز قانوني", holdBasis: "الأساس", holdReference: "مرجع القضية أو النزاع", holdCategories: "ما تحتاجه القضية (لا تشمل البيانات الصحية أبداً)",
    holdBooking: "معرّف الحجز محل النزاع", holdReason: "السبب (٢٠ حرفاً على الأقل)", holdAccountReason: "لماذا تحتاج القضية الحساب نفسه: الملف وبيانات التواصل وتسجيل الدخول (٢٠ حرفاً على الأقل)", holdSubmit: "اقتراح الحجز",
    categories: { account: "الحساب", reviews: "التقييمات", messages: "الرسائل", bookings: "الحجوزات" } as Record<string, string>,
    emptyHolds: "لا توجد حجوزات في هذه القائمة.", released: "رُفع: {n}.",
    ledgerTitle: "سجل الحذف", ledgerEntries: "العملاء المحذوفون المسجلون", authPending: "حسابات دخول بانتظار الحذف", lastErased: "آخر حذف", lastReapplied: "آخر إعادة تطبيق",
    ledgerNote: "استعادة قاعدة البيانات تعيد هذا السجل إلى الوراء أيضاً. نزّله بعد كل حذف واحفظه خارج قاعدة البيانات مع بصمة SHA-256، وبعد أي استعادة يُستورد الأرشيف بمفتاح الخدمة (privacy_import_deletion_archive) ثم يُعاد تطبيقه من هنا.",
    download: "تنزيل السجل (JSON)", reapply: "إعادة تطبيق السجل الآن", reapplied: "أُعيد التطبيق: حُذف {n} عملاء مجدداً؛ {a} حسابات دخول بانتظار الحذف.",
    gateTitle: "جمع الاستبيان الصحي", gateOff: "الجمع متوقف حتى يسجل المالك اعتماد تقييم مخاطر النقل (البند ٦ من X3).", gateOn: "الجمع مفعّل. تقييم معتمد بتاريخ {date}.",
    gateForm: "تسجيل اعتماد تقييم مخاطر النقل (المالك)", docRef: "مرجع الوثيقة الموقعة", approvedOn: "تاريخ الاعتماد", signedBy: "الموقّع", gateNotes: "ملاحظات (اختياري)",
    gateSubmit: "التسجيل وتفعيل الجمع", revoke: "إيقاف الجمع", revokeTitle: "إيقاف جمع الاستبيان الصحي", revokeReason: "السبب (١٠ أحرف على الأقل)",
    never: "—",
    v: {
      subject: "ابحث عن العميل واختره أولاً.", details: "صف ما طلبه العميل في ١٠ إلى ٢٠٠٠ حرف (الآن {count}).",
      value: "أدخل القيمة الصحيحة.", purposes: "ضع علامة على موافقة واحدة على الأقل لسحبها.", min: "اكتب {n} حرفاً على الأقل (الآن {count}).",
      booking: "أدخل معرّف الحجز محل النزاع: ٣٦ حرفاً كما يظهر في الحجز.", received: "أدخل وقت وصول الطلب فعلاً، خلال آخر ٣٠ يوماً وليس في المستقبل.",
      date: "أدخل تاريخ الاعتماد.", categories: "ضع علامة على عنصر واحد على الأقل تحتاجه القضية.", fix: "راجع الحقول المحددة.",
    },
  },
};
type T = typeof copy.en;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Counts in validation messages follow the page's numerals.
const num = (n: number, lang: "en" | "ar") => new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US").format(n);
const minMessage = (t: T, lang: "en" | "ar", n: number, text: string) => fill(t.v.min, { n: num(n, lang), count: num(text.trim().length, lang) });
function FieldError({ id, text }: { id: string; text?: string }) {
  return text ? <span id={id} className="mt-1 block text-[11px] font-black text-[#B42318]">{text}</span> : null;
}
// Moves focus to the first field the form marked invalid, so a keyboard user lands where the problem is.
const focusFirstInvalid = (form: HTMLFormElement | null) => window.setTimeout(() => form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, x]) => acc.split(`{${k}}`).join(String(x)), s);
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
const small = `whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${focusRing}`;
const card = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";

export default function AdminPrivacy() {
  return <Suspense fallback={null}><PrivacyScreen /></Suspense>;
}

function PrivacyScreen() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  const isRTL = lang === "ar";
  const params = useSearchParams();
  const [tab, setTab] = useState<"requests" | "holds" | "ledger">(() => (params.get("tab") === "holds" ? "holds" : params.get("tab") === "ledger" ? "ledger" : "requests"));
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  useEffect(() => writeUrlState({ tab: tab === "requests" ? "" : tab }), [tab]);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h1>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-gray-500">{t.subtitle}</p>
        </div>
        <div role="group" aria-label={t.title} className="flex flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 text-xs font-bold">
          {(["requests", "holds", "ledger"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
              className={`rounded-lg px-3 py-2 transition ${focusRing} ${tab === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
              {t.tabs[value]}
            </button>
          ))}
        </div>
      </div>
      <CommandResult error={notice.error} success={notice.success} locale={lang} onDismiss={() => setNotice({})} />
      {tab === "requests" && <RequestsTab t={t} lang={lang} setNotice={setNotice} />}
      {tab === "holds" && <HoldsTab t={t} lang={lang} setNotice={setNotice} />}
      {tab === "ledger" && <LedgerTab t={t} lang={lang} setNotice={setNotice} />}
    </div>
  );
}

type TabProps = { t: T; lang: "en" | "ar"; setNotice: (n: { error?: string; success?: string }) => void };
type Rpc = PromiseLike<{ data: unknown; error: unknown }>;

function RequestsTab({ t, lang, setNotice }: TabProps) {
  const canManage = knownToHold(useConsoleSession(), ["privacy.manage"]);
  const [state, setState] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<PrivacyRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [preview, setPreview] = useState<Record<string, number | string> | null>(null);
  const refresh = useCallback(() => setReload((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("admin_privacy_list_requests", { p_state: state, p_limit: PAGE, p_offset: 0, p_purpose: "privacy_request" });
      if (cancelled) return;
      if (error) { setLoadError(error); setRows(null); return; }
      const page = data as { total: number; rows: PrivacyRequest[] };
      setLoadError(null); setRows(page.rows); setTotal(Number(page.total));
    })();
    return () => { cancelled = true; };
  }, [state, reload]);

  const open = async (id: string) => {
    const { data, error } = await supabase.rpc("admin_privacy_get_request", { p_request_id: id, p_purpose: "privacy_request" });
    if (error) { setNotice({ error: describeConsoleError(error, lang) }); return; }
    const r = data as PrivacyRequest;
    setSelected(r);
    setPreview(null);
    if (r.request_type === "deletion" && ["open", "awaiting_verification"].includes(r.status)) {
      const p = await supabase.rpc("admin_privacy_deletion_preview", { p_request_id: id });
      if (!p.error) setPreview(p.data as Record<string, number | string>);
    }
  };
  const run = async (call: Rpc, success: string): Promise<string | null> => {
    const { error } = await call;
    if (error) return describeConsoleError(error, lang);
    setNotice({ success });
    refresh();
    if (selected) await open(selected.id);
    return null;
  };
  const invoke = async (name: "privacy-export" | "privacy-erase-account", body: Record<string, unknown>) => {
    const { error } = await supabase.functions.invoke(name, { body });
    if (error) setNotice({ error: describeConsoleError(error, lang) });
    else { setNotice({ success: t.done }); refresh(); if (selected) await open(selected.id); }
  };
  const escalate = async () => {
    const { data, error } = await supabase.rpc("privacy_escalate_requests");
    if (error) setNotice({ error: describeConsoleError(error, lang) });
    else { const d = data as { day_20: number; day_28: number }; setNotice({ success: fill(t.escalated, { a: num(d.day_20, lang), b: num(d.day_28, lang) }) }); refresh(); }
  };
  const name = (r: PrivacyRequest) => [r.subject?.first_name, r.subject?.last_name].filter(Boolean).join(" ") || r.subject_id.slice(0, 8);
  const forbidden = loadError && isForbidden(loadError);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs font-bold">
          {(["open", "closed"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={state === v} onClick={() => { setState(v); setSelected(null); }}
              className={`rounded-lg px-3 py-1.5 ${focusRing} ${state === v ? "bg-white shadow-sm" : "text-gray-500"}`}>{t[v]}{state === v && rows ? ` (${num(total, lang)})` : ""}</button>
          ))}
        </div>
        {canManage && <button type="button" onClick={() => void escalate()} className={operationsButton}>{t.escalate}</button>}
      </div>

      {forbidden ? <ForbiddenNotice locale={lang} /> : loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{fill(t.loadFailed, { reason: describeConsoleError(loadError, lang) })}</span>
          <button type="button" onClick={refresh} className={`rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-black ${focusRing}`}>{t.retry}</button>
        </div>
      ) : !rows ? <div role="status" className={card}>{t.loading}</div> : rows.length === 0 ? (
        <div className={`${card} text-sm font-semibold text-gray-500`}>{state === "open" ? t.emptyOpen : t.emptyClosed}</div>
      ) : (
        <div role="region" aria-label={t.title} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
          <table className="w-full min-w-[860px] text-xs">
            <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">
              <tr>{t.cols.map((c, i) => <th key={i} scope="col" className="px-4 py-3 text-start">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
              {rows.map((r) => (
                <tr key={r.id} className={selected?.id === r.id ? "bg-[#FBF7EA]" : undefined}>
                  <td className="px-4 py-3 font-black text-gray-900">{t.types[r.request_type] ?? r.request_type}</td>
                  <td className="px-4 py-3">{name(r)}<div dir="ltr" className="text-start font-mono text-[10px] text-gray-500">{r.subject_id.slice(0, 8)}</div></td>
                  <td className="px-4 py-3">{t.channels[r.channel] ?? r.channel}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{operationsDate(r.received_at, lang)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {operationsDate(r.deadline_at, lang)}
                    {r.escalation && <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${r.escalation === "overdue" || r.escalation === "day_28" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{t.escalation[r.escalation]}</div>}
                  </td>
                  <td className="px-4 py-3">{t.statuses[r.status] ?? r.status}</td>
                  <td className="px-4 py-3"><button type="button" onClick={() => void open(r.id)} className={`${small} border-[#ECECEC] text-gray-800`} aria-label={`${t.view}: ${t.types[r.request_type]} ${name(r)}`}>{t.view}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <RequestDetail t={t} lang={lang} r={selected} preview={preview} setDialog={setDialog} run={run} invoke={invoke} />}
      {dialog && dialog.kind === "note" && (
        <CommandDialog locale={lang} title={t.addNote} reasonLabel={t.noteLabel} confirmLabel={t.addNote} onClose={() => setDialog(null)}
          onConfirm={(note) => run(supabase.rpc("admin_privacy_add_note", { p_request_id: dialog.request.id, p_note: note }), t.done)} />
      )}
      {dialog && dialog.kind === "propose" && (
        <CommandDialog locale={lang} tone={dialog.request.request_type === "deletion" ? "danger" : "default"}
          title={fill(t.proposeTitle, { type: t.types[dialog.request.request_type] })} intro={t.proposeIntro}
          facts={[{ label: t.cols[1], value: name(dialog.request) }, { label: t.deadline, value: operationsDate(dialog.request.deadline_at, lang) }]}
          effectsTitle={dialog.request.request_type === "deletion" ? t.deletionEffects : undefined}
          effects={dialog.request.request_type === "deletion" && preview ? [previewText(t, lang, preview)] : []}
          reasonLabel={t.proposeReason} minReasonLength={10} confirmLabel={t.propose} onClose={() => setDialog(null)}
          onConfirm={(reason) => run(supabase.rpc("admin_privacy_propose_execution", { p_request_id: dialog.request.id, p_reason: reason }), t.done)} />
      )}
      {dialog && dialog.kind === "correction" && (
        <CommandDialog locale={lang} title={t.correctionTitle} intro={t.correctionIntro}
          facts={[{ label: t.correction, value: `${t.fields[dialog.request.correction_field ?? ""] ?? ""}: ${dialog.request.correction_value ?? ""}` }]}
          reasonLabel={t.correctionReason} minReasonLength={10} confirmLabel={t.completeCorrection} onClose={() => setDialog(null)}
          onConfirm={(note) => run(supabase.rpc("admin_privacy_complete_correction", { p_request_id: dialog.request.id, p_note: note }), t.done)} />
      )}
      {canManage && <LogRequestForm t={t} lang={lang} onDone={(msg) => { setNotice({ success: msg }); refresh(); }} onError={(e) => setNotice({ error: e })} />}
    </div>
  );
}

function previewText(t: T, lang: "en" | "ar", p: Record<string, number | string>) {
  const n = (v: number | string | undefined) => num(Number(v ?? 0), lang);
  return fill(t.preview, { p: n(p.bookings_to_pseudonymise), d: n(p.bookings_to_delete), m: n(p.messages), h: n(p.health_answers),
    c: n(p.consents), f: n(p.favourites), o: n(p.open_disputes), w: n(p.wallet_balance_sar), s: n(p.unused_package_sessions) });
}

function RequestDetail({ t, lang, r, preview, setDialog, run, invoke }: {
  t: T; lang: "en" | "ar"; r: PrivacyRequest; preview: Record<string, number | string> | null; setDialog: (d: Dialog) => void;
  run: (call: Rpc, success: string) => Promise<string | null>; invoke: (name: "privacy-export" | "privacy-erase-account", body: Record<string, unknown>) => Promise<void>;
}) {
  const [extendCode, setExtendCode] = useState("disproportionate_effort");
  const [extendReason, setExtendReason] = useState("");
  const [refuseCode, setRefuseCode] = useState("repetitive");
  const [refuseReason, setRefuseReason] = useState("");
  const [formError, setFormError] = useState("");
  const [extendProblem, setExtendProblem] = useState("");
  const [refuseProblem, setRefuseProblem] = useState("");
  const live = ["awaiting_verification", "open", "awaiting_approval", "executing"].includes(r.status);
  const facts: [string, React.ReactNode][] = [
    [t.received, `${operationsDate(r.received_at, lang)} · ${t.channels[r.channel] ?? r.channel}`],
    [t.verified, r.verified_at ? operationsDate(r.verified_at, lang) : t.notVerified],
    [t.deadline, `${operationsDate(r.deadline_at, lang)}${r.extended_due_at ? ` (${t.extended})` : ""}`],
  ];
  if (r.extension_reason) facts.push([t.extensionReason, `${t.extendCodes[r.extension_code ?? ""] ?? ""}: ${r.extension_reason}`]);
  if (r.details) facts.push([t.details, r.details]);
  if (r.correction_field) facts.push([t.correction, `${t.fields[r.correction_field]}: ${r.correction_value ?? t.never}`]);
  if (r.restricted_field) facts.push([t.restricted, t.fields[r.restricted_field] ?? r.restricted_field]);
  if (r.review_choice) facts.push([t.reviewChoice, t.reviewChoices[r.review_choice]]);
  if (r.consent_purposes?.length) facts.push([t.purposes, r.consent_purposes.map((p) => t.purposeNames[p] ?? p).join(", ")]);
  if (r.decision_reason) facts.push([t.decision, `${r.refusal_code ? `${t.refuseCodes[r.refusal_code]}: ` : ""}${r.decision_reason}`]);
  if (r.staff_notes) facts.push([t.notes, r.staff_notes]);
  if (r.completion_summary) facts.push([t.summary, <pre key="s" dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap text-start font-mono text-[10px]">{JSON.stringify(r.completion_summary, null, 2)}</pre>]);

  const submitExtend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (extendReason.trim().length < 20) { setExtendProblem(minMessage(t, lang, 20, extendReason)); focusFirstInvalid(e.currentTarget); return; }
    setExtendProblem("");
    const msg = await run(supabase.rpc("admin_privacy_extend_request", { p_request_id: r.id, p_code: extendCode, p_reason: extendReason.trim() }), t.done);
    setFormError(msg ?? ""); if (!msg) setExtendReason("");
  };
  const submitRefuse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (refuseReason.trim().length < 20) { setRefuseProblem(minMessage(t, lang, 20, refuseReason)); focusFirstInvalid(e.currentTarget); return; }
    setRefuseProblem("");
    const msg = await run(supabase.rpc("admin_privacy_refuse_request", { p_request_id: r.id, p_code: refuseCode, p_reason: refuseReason.trim() }), t.done);
    setFormError(msg ?? ""); if (!msg) setRefuseReason("");
  };

  return (
    <section aria-labelledby="privacy-detail" className={`${card} space-y-4`}>
      <h2 id="privacy-detail" className="font-serif text-lg font-black text-gray-900">{fill(t.detailTitle, { id: r.id.slice(0, 8) })} · {t.types[r.request_type]} · {t.statuses[r.status]}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(140px,auto)_1fr]">
        {facts.map(([label, value]) => <div key={label} className="contents"><dt className="font-semibold text-[#667085]">{label}</dt><dd className="min-w-0 break-words font-semibold text-[#101828]">{value}</dd></div>)}
      </dl>
      {r.request_type === "deletion" && preview && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950">{previewText(t, lang, preview)}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDialog({ kind: "note", request: r })} className={`${small} border-[#ECECEC] text-gray-800`}>{t.addNote}</button>
        {r.status === "open" && ["access", "copy", "deletion"].includes(r.request_type) && (
          <button type="button" onClick={() => setDialog({ kind: "propose", request: r })} className={`${small} border-[#D1AF47] text-[#725517]`}>{t.propose}</button>
        )}
        {r.status === "open" && r.request_type === "correction" && (
          <button type="button" onClick={() => setDialog({ kind: "correction", request: r })} className={`${small} border-emerald-300 text-emerald-800`}>{t.completeCorrection}</button>
        )}
        {r.status === "executing" && r.execution_state === "awaiting_build" && (
          <button type="button" onClick={() => void invoke("privacy-export", { request_id: r.id })} className={`${small} border-blue-300 text-blue-800`}>{t.buildCopy}</button>
        )}
        {r.status === "executing" && r.execution_state === "erased_awaiting_auth" && (
          <button type="button" onClick={() => void invoke("privacy-erase-account", {})} className={`${small} border-red-300 text-red-700`}>{t.eraseAccount}</button>
        )}
      </div>
      {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{formError}</p>}
      {live && !r.extended_due_at && (
        <form noValidate onSubmit={(e) => void submitExtend(e)} className="grid gap-2 rounded-xl border border-[#ECECEC] p-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <label className="text-xs font-bold text-[#667085]">{t.extendTitle}
            <select value={extendCode} onChange={(e) => setExtendCode(e.target.value)} className={`${operationsInput} mt-1`}>
              {Object.entries(t.extendCodes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#667085]">{t.extendReason}
            <input value={extendReason} onChange={(e) => setExtendReason(e.target.value)} aria-invalid={Boolean(extendProblem)} aria-describedby={extendProblem ? "extend-error" : undefined} className={`${operationsInput} mt-1`} />
            <FieldError id="extend-error" text={extendProblem} />
          </label>
          <button type="submit" className={operationsButton}>{t.extendSubmit}</button>
        </form>
      )}
      {["awaiting_verification", "open", "awaiting_approval"].includes(r.status) && (
        <form noValidate onSubmit={(e) => void submitRefuse(e)} className="grid gap-2 rounded-xl border border-red-100 p-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <label className="text-xs font-bold text-[#667085]">{t.refuseTitle}
            <select value={refuseCode} onChange={(e) => setRefuseCode(e.target.value)} className={`${operationsInput} mt-1`}>
              {Object.entries(t.refuseCodes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-[#667085]">{t.refuseReason}
            <input value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} aria-invalid={Boolean(refuseProblem)} aria-describedby={refuseProblem ? "refuse-error" : undefined} className={`${operationsInput} mt-1`} />
            <FieldError id="refuse-error" text={refuseProblem} />
          </label>
          <button type="submit" className={`${operationsButton} !border-red-300 !bg-red-50 !text-red-800`}>{t.refuseSubmit}</button>
        </form>
      )}
      {r.events && r.events.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#667085]">{t.history}</h3>
          <ol className="mt-2 space-y-1 text-xs text-gray-700">
            {r.events.map((e, i) => <li key={i}><span className="font-mono text-[10px] text-gray-500">{operationsDate(e.created_at, lang)}</span> · {e.event.replace(/_/g, " ")} · {e.actor_kind}</li>)}
          </ol>
        </div>
      )}
    </section>
  );
}

function LogRequestForm({ t, lang, onDone, onError }: { t: T; lang: "en" | "ar"; onDone: (m: string) => void; onError: (e: string) => void }) {
  const [subject, setSubject] = useState<PickedCustomer | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [type, setType] = useState<RequestType>("copy");
  const [channel, setChannel] = useState("phone");
  const [receivedAt, setReceivedAt] = useState("");
  const [details, setDetails] = useState("");
  const [field, setField] = useState("first_name");
  const [value, setValue] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    // Checked here, in the page language, before the server checks the same rules; nothing typed is lost on a refusal.
    const found: Record<string, string> = {};
    if (!subject) found.subject = t.v.subject;
    const text = details.trim();
    if (text.length < 10 || text.length > 2000) found.details = fill(t.v.details, { count: num(text.length, lang) });
    if (type === "correction" && !value.trim()) found.value = t.v.value;
    if (type === "consent_withdrawal" && purposes.length === 0) found.purposes = t.v.purposes;
    if (receivedAt) {
      const at = new Date(`${receivedAt}:00+03:00`).getTime();
      if (!Number.isFinite(at) || at > Date.now() + 60000 || at < Date.now() - 30 * 86400000) found.receivedAt = t.v.received;
    }
    setProblems(found);
    if (Object.keys(found).length > 0) { focusFirstInvalid(form); return; }
    if (busy || !subject) return;
    setBusy(true);
    const options = type === "correction" ? { correction_field: field, correction_value: value } : type === "consent_withdrawal" ? { consent_purposes: purposes } : {};
    const received = receivedAt ? new Date(`${receivedAt}:00+03:00`).toISOString() : new Date().toISOString();
    const { error } = await supabase.rpc("admin_privacy_log_request", { p_subject_id: subject.id, p_request_type: type, p_channel: channel,
      p_received_at: received, p_details: details.trim(), p_options: options });
    setBusy(false);
    if (error) onError(describeConsoleError(error, lang));
    else { onDone(t.logged); setSubject(null); setDetails(""); setValue(""); setPurposes([]); setReceivedAt(""); }
  };
  const invalid = (key: string) => ({ "aria-invalid": Boolean(problems[key]), "aria-describedby": problems[key] ? `log-${key}-error` : undefined });
  return (
    <form noValidate onSubmit={(e) => void submit(e)} className={`${card} grid gap-3 sm:grid-cols-2`} aria-labelledby="log-title">
      <h2 id="log-title" className="font-serif text-lg font-black text-gray-900 sm:col-span-2">{t.logTitle}</h2>
      <div className="sm:col-span-2"><CustomerPicker lang={lang} value={subject} onChange={(c) => { setSubject(c); setProblems((p) => ({ ...p, subject: "" })); }} error={problems.subject} inputId="log-subject" /></div>
      <label className="text-xs font-bold text-[#667085]">{t.type}
        <select value={type} onChange={(e) => setType(e.target.value as RequestType)} className={`${operationsInput} mt-1`}>{Object.entries(t.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="text-xs font-bold text-[#667085]">{t.channel}
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className={`${operationsInput} mt-1`}>{["email", "phone", "in_person"].map((k) => <option key={k} value={k}>{t.channels[k]}</option>)}</select>
      </label>
      <label className="text-xs font-bold text-[#667085]">{t.receivedAt}<input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} {...invalid("receivedAt")} className={`${operationsInput} mt-1`} /><FieldError id="log-receivedAt-error" text={problems.receivedAt} /></label>
      {type === "correction" && (
        <>
          <label className="text-xs font-bold text-[#667085]">{t.field}<select value={field} onChange={(e) => setField(e.target.value)} className={`${operationsInput} mt-1`}>{Object.entries(t.fields).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs font-bold text-[#667085]">{t.newValue}<input value={value} onChange={(e) => setValue(e.target.value)} maxLength={50} {...invalid("value")} className={`${operationsInput} mt-1`} /><FieldError id="log-value-error" text={problems.value} /></label>
        </>
      )}
      {type === "consent_withdrawal" && (
        <fieldset className="sm:col-span-2" aria-describedby={problems.purposes ? "log-purposes-error" : undefined}><legend className="text-xs font-bold text-[#667085]">{t.purposesLabel}</legend>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">{Object.entries(t.purposeNames).map(([k, v], i) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={purposes.includes(k)} aria-invalid={i === 0 && Boolean(problems.purposes)} onChange={(e) => setPurposes((p) => e.target.checked ? [...p, k] : p.filter((x) => x !== k))} className="accent-[#9B7928]" />{v}</label>
          ))}</div>
          <FieldError id="log-purposes-error" text={problems.purposes} />
        </fieldset>
      )}
      <label className="text-xs font-bold text-[#667085] sm:col-span-2">{t.whatAsked}<textarea maxLength={2000} rows={2} value={details} onChange={(e) => setDetails(e.target.value)} {...invalid("details")} className={`${operationsInput} mt-1`} /><FieldError id="log-details-error" text={problems.details} /></label>
      <div className="sm:col-span-2"><button type="submit" aria-disabled={busy} className={operationsButton}>{t.logSubmit}</button></div>
    </form>
  );
}

function HoldsTab({ t, lang, setNotice }: TabProps) {
  const [state, setState] = useState<"active" | "pending_approval" | "closed">("active");
  const [rows, setRows] = useState<Hold[] | null>(null);
  const [overdue, setOverdue] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [form, setForm] = useState({ basis: "court_case", reference: "", booking: "", reason: "", accountReason: "", categories: [] as string[] });
  const [holdSubject, setHoldSubject] = useState<PickedCustomer | null>(null);
  const [holdProblems, setHoldProblems] = useState<Record<string, string>>({});
  const canManage = knownToHold(useConsoleSession(), ["privacy.manage"]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("admin_privacy_list_legal_holds", { p_state: state, p_limit: 100, p_offset: 0 });
      if (cancelled) return;
      if (error) { setLoadError(error); setRows(null); return; }
      const d = data as { rows: Hold[]; review_overdue: number };
      setLoadError(null); setRows(d.rows); setOverdue(Number(d.review_overdue));
    })();
    return () => { cancelled = true; };
  }, [state, reload]);
  const releaseDue = async () => {
    const { data, error } = await supabase.rpc("privacy_release_due_holds");
    if (error) setNotice({ error: describeConsoleError(error, lang) });
    else { setNotice({ success: fill(t.released, { n: num((data as { released: number }).released, lang) }) }); setReload((k) => k + 1); }
  };
  const propose = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!holdSubject) found.subject = t.v.subject;
    if (form.reference.trim().length < 3) found.reference = minMessage(t, lang, 3, form.reference);
    if (form.basis === "payment_dispute" && !UUID.test(form.booking.trim())) found.booking = t.v.booking;
    if (form.basis === "court_case" && form.categories.length === 0) found.categories = t.v.categories;
    if (form.basis === "court_case" && form.categories.includes("account") && form.accountReason.trim().length < 20) found.accountReason = minMessage(t, lang, 20, form.accountReason);
    if (form.reason.trim().length < 20) found.reason = minMessage(t, lang, 20, form.reason);
    setHoldProblems(found);
    if (Object.keys(found).length > 0 || !holdSubject) { focusFirstInvalid(e.currentTarget); return; }
    const { error } = await supabase.rpc("admin_privacy_propose_legal_hold", { p_subject_id: holdSubject.id, p_basis: form.basis,
      p_case_reference: form.reference.trim(), p_categories: form.basis === "court_case" ? form.categories : null,
      p_booking_id: form.basis === "payment_dispute" ? form.booking.trim() : null, p_reason: form.reason.trim(),
      p_account_reason: form.basis === "court_case" && form.categories.includes("account") ? form.accountReason.trim() : null });
    if (error) setNotice({ error: describeConsoleError(error, lang) });
    else { setNotice({ success: t.done }); setForm({ ...form, reference: "", booking: "", reason: "", accountReason: "", categories: [] }); setHoldSubject(null); setReload((k) => k + 1); }
  };
  const invalid = (key: string) => ({ "aria-invalid": Boolean(holdProblems[key]), "aria-describedby": holdProblems[key] ? `hold-${key}-error` : undefined });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" className="flex rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs font-bold">
          {([["active", t.holdsActive], ["pending_approval", t.holdsPending], ["closed", t.holdsClosed]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={state === v} onClick={() => setState(v)} className={`rounded-lg px-3 py-1.5 ${focusRing} ${state === v ? "bg-white shadow-sm" : "text-gray-500"}`}>{label}</button>
          ))}
        </div>
        {canManage && <button type="button" onClick={() => void releaseDue()} className={operationsButton}>{t.releaseDue}</button>}
      </div>
      {overdue > 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-950">{fill(t.reviewOverdue, { n: num(overdue, lang) })}</p>}
      {loadError ? (isForbidden(loadError) ? <ForbiddenNotice locale={lang} /> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fill(t.loadFailed, { reason: describeConsoleError(loadError, lang) })}</p>)
        : !rows ? <div role="status" className={card}>{t.loading}</div> : rows.length === 0 ? <div className={`${card} text-sm font-semibold text-gray-500`}>{t.emptyHolds}</div> : (
        <div role="region" aria-label={t.tabs.holds} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]"><tr>{t.holdCols.map((c, i) => <th key={i} className="px-4 py-3 text-start">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
              {rows.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-3">{t.basis[h.basis] ?? h.basis}</td>
                  <td className="px-4 py-3" dir="ltr">{h.case_reference}</td>
                  <td className="px-4 py-3 font-mono text-[10px]" dir="ltr">{h.subject_id ? h.subject_id.slice(0, 8) : "—"}</td>
                  <td className="px-4 py-3">{h.categories.map((c) => t.categories[c] ?? c).join(", ")}</td>
                  <td className={`px-4 py-3 whitespace-nowrap ${h.review_overdue ? "font-black text-red-700" : ""}`}>{h.review_due_at ? operationsDate(h.review_due_at, lang) : t.never}</td>
                  <td className="px-4 py-3">{h.status === "active" && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setDialog({ kind: "review", hold: h, keep: true })} className={`${small} border-[#ECECEC]`}>{t.keep}</button>
                      <button type="button" onClick={() => setDialog({ kind: "review", hold: h, keep: false })} className={`${small} border-red-200 text-red-700`}>{t.release}</button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && dialog.kind === "review" && (
        <CommandDialog locale={lang} tone={dialog.keep ? "default" : "danger"} title={dialog.keep ? t.reviewTitleKeep : t.reviewTitleRelease}
          intro={dialog.keep ? undefined : t.releaseIntro}
          facts={[{ label: t.holdCols[1], value: dialog.hold.case_reference }]} reasonLabel={t.reviewReason} minReasonLength={20}
          confirmLabel={dialog.keep ? t.keep : t.release} onClose={() => setDialog(null)}
          onConfirm={async (note) => {
            const { data, error } = await supabase.rpc("admin_privacy_review_legal_hold", { p_hold_id: dialog.hold.id, p_keep: dialog.keep, p_note: note });
            if (error) return describeConsoleError(error, lang);
            const result = data as { status?: string; release_needs_approval?: boolean; renewal_needs_approval?: boolean } | null;
            const asked = result?.status === "pending_approval";
            setNotice({ success: asked ? (result?.release_needs_approval ? t.releaseAsked : t.renewalAsked) : t.done }); setReload((k) => k + 1); return null;
          }} />
      )}
      {canManage && <form noValidate onSubmit={(e) => void propose(e)} className={`${card} grid gap-3 sm:grid-cols-2`} aria-labelledby="hold-title">
        <h2 id="hold-title" className="font-serif text-lg font-black text-gray-900 sm:col-span-2">{t.holdForm}</h2>
        <div className="sm:col-span-2"><CustomerPicker lang={lang} value={holdSubject} onChange={(c) => { setHoldSubject(c); setHoldProblems((p) => ({ ...p, subject: "" })); }} error={holdProblems.subject} inputId="hold-subject" /></div>
        <label className="text-xs font-bold text-[#667085]">{t.holdBasis}<select value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })} className={`${operationsInput} mt-1`}>{Object.entries(t.basis).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-xs font-bold text-[#667085]">{t.holdReference}<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} {...invalid("reference")} className={`${operationsInput} mt-1`} /><FieldError id="hold-reference-error" text={holdProblems.reference} /></label>
        {form.basis === "payment_dispute" ? (
          <label className="text-xs font-bold text-[#667085]">{t.holdBooking}<input dir="ltr" value={form.booking} onChange={(e) => setForm({ ...form, booking: e.target.value })} {...invalid("booking")} className={`${operationsInput} mt-1 font-mono`} /><FieldError id="hold-booking-error" text={holdProblems.booking} /></label>
        ) : (
          <fieldset aria-describedby={holdProblems.categories ? "hold-categories-error" : undefined}><legend className="text-xs font-bold text-[#667085]">{t.holdCategories}</legend>
            <FieldError id="hold-categories-error" text={holdProblems.categories} />
            <div className="mt-1 flex flex-wrap gap-3 text-xs">{Object.entries(t.categories).map(([k, v], i) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" aria-invalid={i === 0 && Boolean(holdProblems.categories)} checked={form.categories.includes(k)} onChange={(e) => setForm({ ...form, categories: e.target.checked ? [...form.categories, k] : form.categories.filter((x) => x !== k) })} className="accent-[#9B7928]" />{v}</label>
            ))}</div>
          </fieldset>
        )}
        {form.basis === "court_case" && form.categories.includes("account") && (
          <label className="text-xs font-bold text-[#667085] sm:col-span-2">{t.holdAccountReason}<textarea rows={2} value={form.accountReason} onChange={(e) => setForm({ ...form, accountReason: e.target.value })} {...invalid("accountReason")} className={`${operationsInput} mt-1`} /><FieldError id="hold-accountReason-error" text={holdProblems.accountReason} /></label>
        )}
        <label className="text-xs font-bold text-[#667085] sm:col-span-2">{t.holdReason}<textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} {...invalid("reason")} className={`${operationsInput} mt-1`} /><FieldError id="hold-reason-error" text={holdProblems.reason} /></label>
        <div className="sm:col-span-2"><button type="submit" className={operationsButton}>{t.holdSubmit}</button></div>
      </form>}
    </div>
  );
}

function LedgerTab({ t, lang, setNotice }: TabProps) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [gateForm, setGateForm] = useState({ ref: "", date: "", signer: "", notes: "" });
  const [gateProblems, setGateProblems] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, g] = await Promise.all([supabase.rpc("admin_privacy_deletion_ledger_summary"), supabase.rpc("health_intake_collection_status")]);
      if (cancelled) return;
      if (s.error) setLoadError(s.error); else { setLoadError(null); setSummary(s.data as LedgerSummary); }
      if (!g.error) setGate(g.data as Gate);
    })();
    return () => { cancelled = true; };
  }, [reload]);
  const download = async () => {
    const { data, error } = await supabase.rpc("admin_privacy_export_deletion_ledger");
    if (error) { setNotice({ error: describeConsoleError(error, lang) }); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `primora-deletion-ledger-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const reapply = async () => {
    const { data, error } = await supabase.rpc("privacy_reapply_deletion_ledger");
    if (error) { setNotice({ error: describeConsoleError(error, lang) }); return; }
    const d = data as { reapplied: number; auth_accounts_to_delete: string[] };
    setNotice({ success: fill(t.reapplied, { n: num(d.reapplied, lang), a: num(d.auth_accounts_to_delete.length, lang) }) });
    if (d.auth_accounts_to_delete.length) await supabase.functions.invoke("privacy-erase-account", { body: {} });
    setReload((k) => k + 1);
  };
  const recordGate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (gateForm.ref.trim().length < 3) found.ref = minMessage(t, lang, 3, gateForm.ref);
    if (!gateForm.date) found.date = t.v.date;
    if (gateForm.signer.trim().length < 3) found.signer = minMessage(t, lang, 3, gateForm.signer);
    setGateProblems(found);
    if (Object.keys(found).length > 0) { focusFirstInvalid(e.currentTarget); return; }
    const { error } = await supabase.rpc("admin_privacy_record_transfer_assessment", { p_document_reference: gateForm.ref.trim(), p_approved_on: gateForm.date,
      p_signed_by: gateForm.signer.trim(), p_notes: gateForm.notes.trim() || null });
    if (error) setNotice({ error: describeConsoleError(error, lang) }); else { setNotice({ success: t.done }); setReload((k) => k + 1); }
  };
  const stat = (label: string, value: React.ReactNode) => <div className={card}><span className="text-[11px] font-extrabold uppercase tracking-widest text-[#667085]">{label}</span><strong className="mt-2 block text-xl font-black text-gray-900">{value}</strong></div>;
  const notice = useMemo(() => (gate ? (lang === "ar" ? gate.notice_ar : gate.notice_en) : null), [gate, lang]);
  return (
    <div className="space-y-6">
      <section aria-labelledby="ledger-title" className="space-y-3">
        <h2 id="ledger-title" className="font-serif text-lg font-black text-gray-900">{t.ledgerTitle}</h2>
        {loadError ? (isForbidden(loadError) ? <ForbiddenNotice locale={lang} /> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fill(t.loadFailed, { reason: describeConsoleError(loadError, lang) })}</p>) : !summary ? <div role="status" className={card}>{t.loading}</div> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {stat(t.ledgerEntries, num(summary.entries, lang))}
            {stat(t.authPending, num(summary.auth_pending, lang))}
            {stat(t.lastErased, summary.last_erased_at ? operationsDate(summary.last_erased_at, lang) : t.never)}
            {stat(t.lastReapplied, summary.last_reapplied_at ? operationsDate(summary.last_reapplied_at, lang) : t.never)}
          </div>
        )}
        <p className="text-xs font-semibold text-gray-600">{t.ledgerNote}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void download()} className={operationsButton}>{t.download}</button>
          <button type="button" onClick={() => void reapply()} className={operationsButton}>{t.reapply}</button>
        </div>
      </section>
      <RetentionPurgePanel lang={lang} onNotice={setNotice} />
      <section aria-labelledby="gate-title" className={`${card} space-y-3`}>
        <h2 id="gate-title" className="font-serif text-lg font-black text-gray-900">{t.gateTitle}</h2>
        {gate && (gate.enabled ? (
          <>
            <p role="status" className="text-sm font-bold text-emerald-800">{fill(t.gateOn, { date: gate.approved_on ? new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${gate.approved_on.slice(0, 10)}T00:00:00Z`)) : "" })}</p>
            <button type="button" onClick={() => setRevoking(true)} className={`${small} border-red-300 text-red-700`}>{t.revoke}</button>
          </>
        ) : (
          <>
            <p role="status" className="text-sm font-bold text-amber-900">{t.gateOff}</p>
            {notice && <p className="text-xs text-gray-600">{notice}</p>}
            <form noValidate onSubmit={(e) => void recordGate(e)} className="grid gap-3 sm:grid-cols-2" aria-label={t.gateForm}>
              <p className="text-xs font-black text-[#344054] sm:col-span-2">{t.gateForm}</p>
              <label className="text-xs font-bold text-[#667085]">{t.docRef}<input value={gateForm.ref} onChange={(e) => setGateForm({ ...gateForm, ref: e.target.value })} aria-invalid={Boolean(gateProblems.ref)} aria-describedby={gateProblems.ref ? "gate-ref-error" : undefined} className={`${operationsInput} mt-1`} /><FieldError id="gate-ref-error" text={gateProblems.ref} /></label>
              <label className="text-xs font-bold text-[#667085]">{t.approvedOn}<input type="date" value={gateForm.date} onChange={(e) => setGateForm({ ...gateForm, date: e.target.value })} aria-invalid={Boolean(gateProblems.date)} aria-describedby={gateProblems.date ? "gate-date-error" : undefined} className={`${operationsInput} mt-1`} /><FieldError id="gate-date-error" text={gateProblems.date} /></label>
              <label className="text-xs font-bold text-[#667085]">{t.signedBy}<input value={gateForm.signer} onChange={(e) => setGateForm({ ...gateForm, signer: e.target.value })} aria-invalid={Boolean(gateProblems.signer)} aria-describedby={gateProblems.signer ? "gate-signer-error" : undefined} className={`${operationsInput} mt-1`} /><FieldError id="gate-signer-error" text={gateProblems.signer} /></label>
              <label className="text-xs font-bold text-[#667085]">{t.gateNotes}<input value={gateForm.notes} onChange={(e) => setGateForm({ ...gateForm, notes: e.target.value })} className={`${operationsInput} mt-1`} /></label>
              <div className="sm:col-span-2"><button type="submit" className={operationsButton}>{t.gateSubmit}</button></div>
            </form>
          </>
        ))}
      </section>
      {revoking && (
        <CommandDialog locale={lang} tone="danger" title={t.revokeTitle} reasonLabel={t.revokeReason} minReasonLength={10} confirmLabel={t.revoke}
          onClose={() => setRevoking(false)}
          onConfirm={async (reason) => {
            const { error } = await supabase.rpc("admin_privacy_revoke_transfer_assessment", { p_reason: reason });
            if (error) return describeConsoleError(error, lang);
            setNotice({ success: t.done }); setReload((k) => k + 1); return null;
          }} />
      )}
    </div>
  );
}
