"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { describeConsoleError } from "@/lib/console-errors.mjs";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { oneOf, writeUrlState } from "@/lib/url-state";
import { GovernanceNotices } from "./governance-notices";

// Maker-checker inbox (GOV-1 / D-Q5). Every payout release, refunds of SAR 1,000 or more (or past SAR 5,000 per administrator
// per Riyadh day), provider bank-account changes and threshold changes wait here for a different administrator. The database
// decides who may approve (admin_decide_approval refuses your own request, for owners too); the buttons only mirror it.
// Break-glass (owner alone, no second eligible administrator) needs a 20-character justification, stays under the daily cap and
// opens an independent review due within 7 days, which is signed off below.

// Kinds whose approval moves or holds money, where the balance, hold and duplicate checks run again.
const MONEY_KINDS: string[] = ["payout_release", "refund", "ledger_settlement", "ledger_adjustment", "payout_hold", "booking_cancellation", "reconciliation_import"];
const PAGE_SIZE = 25;
const STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
type Status = (typeof STATUSES)[number];
type Numeric = number | string | null;
type ApprovalRow = {
  id: string;
  kind: "payout_release" | "refund" | "iban_change" | "setting_change" | "ledger_settlement" | "ledger_adjustment" | "fee_rule_change" | "payout_hold" | "reward_program" | "role_change" | "booking_cancellation" | "reconciliation_import" | "sponsored_price_change"
    | "privacy_export" | "privacy_deletion" | "privacy_legal_hold" | "customer_profile_clear"
    | "privacy_legal_hold_release" | "privacy_legal_hold_renewal" | "incident_aware_at_correction" | "privacy_retention_purge";
  status: string;
  target_id: string | null;
  amount_sar: Numeric;
  summary: Record<string, unknown> | null;
  requested_by: string;
  requested_role: string | null;
  requested_at: string;
  request_reason: string;
  decided_at: string | null;
  decision_reason: string | null;
  break_glass: boolean;
  requested_by_name: string | null;
  decided_by_name: string | null;
  provider_name_en: string | null;
  provider_name_ar: string | null;
  can_decide: boolean;
  can_cancel: boolean;
  can_break_glass: boolean;
  target_name?: string | null;
  decide_blocked_reason?: string | null;
  break_glass_blocked_until?: string | null;
  // F1: the active legal hold on the account of a pending profile clear; approving it is refused while it lasts.
  legal_hold?: { hold_id: string; basis: string; case_reference: string; review_due_at: string | null } | null;
};
type Review = { id: string; approval_request_id: string; amount_sar: Numeric; justification: string; executed_at: string; due_at: string; signed_off_at: string | null; reviewer_name: string | null; document_reference: string | null; overdue: boolean; can_sign_off?: boolean };
type Setting = { key: string; value: Numeric; description_en: string; description_ar: string; updated_at: string };
type Alert = { id: string; kind: string; user_id: string | null; details: Record<string, unknown>; created_at: string; can_acknowledge?: boolean };
type Inbox = {
  counts: Record<string, Numeric>;
  matching: Numeric;
  rows: ApprovalRow[];
  break_glass_reviews: Review[];
  settings: Setting[];
  open_alerts: Alert[];
  break_glass_used_today: Numeric;
  can_acknowledge_alerts: boolean;
  can_review_break_glass: boolean;
  can_propose_settings: boolean;
};
type Dialog =
  | { type: "decide"; row: ApprovalRow; decision: "approve" | "reject" }
  | { type: "bulk"; rows: ApprovalRow[] }
  | { type: "cancel"; row: ApprovalRow }
  | { type: "break-glass"; row: ApprovalRow }
  | { type: "review"; review: Review }
  | { type: "setting"; setting: Setting }
  | { type: "alert"; alert: Alert }
  | { type: "lift"; alert: Alert };

const translations = {
  en: {
    title: "Approvals",
    subtitle: "Actions that need a second administrator. You cannot approve your own request; the server refuses it for every role, owners included.",
    tabs: { pending: "Waiting", approved: "Approved", rejected: "Rejected", cancelled: "Withdrawn" },
    kinds: { payout_release: "Payout release", refund: "Refund", iban_change: "Bank account change", setting_change: "Threshold change",
      ledger_settlement: "Manual ledger settlement", ledger_adjustment: "Ledger correction", fee_rule_change: "Fee rule change",
      payout_hold: "Payout hold", reward_program: "Reward programme change", role_change: "Console role grant",
      booking_cancellation: "Booking cancellation with refund", reconciliation_import: "Reconciliation file import",
      sponsored_price_change: "Sponsored price per new client",
      privacy_export: "Release of a customer's data copy", privacy_deletion: "Customer data deletion", privacy_legal_hold: "Legal hold on customer data",
      customer_profile_clear: "Clearing a customer's profile details",
      privacy_legal_hold_release: "Early release of a legal hold (erases what it kept)",
      privacy_legal_hold_renewal: "Renewal of a legal hold kept for over a year",
      incident_aware_at_correction: "Correction of an incident's awareness time (moves the SDAIA deadline)",
      privacy_retention_purge: "Retention purge of erased customers' records (irreversible)" },
    holdRenewals: "renewed {n} times",
    customerErased: "customer already erased",
    accountHeld: "account held",
    deadlineMove: "SDAIA deadline {from} → {to} ({h} h)",
    purgePreview: "dry run on {date}: {s} sub-records and {d} bookings deleted, {a} bookings kept anonymous; the approved run counts again",
    profileClearEffect: "removes name, e-mail, phone, gender and push token; keeps sign-in, bookings, invoices and messages",
    profileClearHeld: "legal hold {ref} keeps this account: approving is refused until the hold is released; reject the request instead",
    approveIntroChange: "Approving applies the change now, in your name, with the checks the change has. It needs a fresh authenticator code.",
    privacyTypes: { access: "access", copy: "copy", deletion: "deletion" } as Record<string, string>,
    privacyPreview: "{p} bookings pseudonymised, {d} deleted, {m} messages, {h} health answers",
    privacyFollowUp: "Approved. The next step did not run yet ({reason}); open Privacy Requests to run it again.",
    consoleRoles: { owner: "Owner", finance: "Finance", operations: "Operations", analyst: "Analyst (read-only)" } as Record<string, string>,
    noConsoleRole: "No console role",
    breakGlassClosedUntil: "Break-glass closed until {date}: an administrator who could approve this was demoted or removed",
    ownAlert: "About you or your action: another owner acknowledges it",
    ownBreakGlass: "You used this break-glass: another administrator records the review",
    describeParts: { increase: "increase, 30 days notice", from: "from", place: "place hold", lift: "lift hold", enable: "enable", disable: "disable",
      reference: "bank reference", provider: "provider", platform: "platform", tap: "Tap object",
      cancelBooking: "cancel booking", noShowBooking: "no-show", invoice: "invoice", refund: "refund",
      sources: { tap_settlement_file: "Tap settlement file", bank_statement: "bank statement" } as Record<string, string>,
      rows: "lines", day: "day", breakDiff: "break difference", corrected: "already corrected", partial: "partial correction" },
    columnRequest: "Request",
    columnAmount: "Amount",
    columnRequestedBy: "Requested by",
    columnReason: "Reason",
    columnActions: "Actions",
    approve: "Approve",
    reject: "Reject",
    withdraw: "Withdraw",
    breakGlass: "Break-glass",
    approveSelected: "Approve selected ({n})",
    selectRow: "Select this request",
    selectAll: "Select every request you can approve",
    yours: "Your request: another administrator decides it",
    noRight: "Your console role cannot decide this kind of request",
    accountChangedRecently: "Bank account changed in the last 30 days",
    provider: "Provider",
    account: "Account",
    previousAccount: "Previous account",
    holder: "Account holder",
    setting: "Setting",
    from: "From",
    to: "To",
    loading: "Loading requests...",
    empty: "Nothing here.",
    emptyPending: "No request is waiting for a decision.",
    loadFailed: "The requests could not be loaded: {reason}",
    retry: "Retry",
    previous: "Previous",
    next: "Next",
    pageOf: "Page {page} of {pages}",
    decidedBy: "Decided by {name} on {date}",
    breakGlassBadge: "Break-glass",
    approveTitle: "Approve: {kind}",
    rejectTitle: "Reject: {kind}",
    approveIntro: "Approving runs the action now, in your name, with every check the action has (balance, hold, idempotency). It needs a fresh authenticator code.",
    rejectIntro: "Rejecting closes the request; nothing is paid, refunded or changed.",
    decisionReason: "Why are you deciding this way?",
    bulkTitle: "Approve {n} requests",
    bulkIntro: "Each request is approved and executed on its own; one that fails stays waiting and is listed with the reason.",
    bulkDone: "{ok} approved, {failed} not approved.",
    bulkFailures: "Not approved",
    cancelTitle: "Withdraw your request",
    cancelReason: "Why are you withdrawing it?",
    breakGlassTitle: "Break-glass: execute without a second administrator",
    breakGlassIntro: "Use only when no other administrator can approve. It is limited to {cap} per Riyadh day ({used} used today), notifies every owner out of band, raises a security alert and must be reviewed independently within 7 days. Never available for bank accounts or thresholds.",
    breakGlassReason: "Written justification (at least 20 characters)",
    reviewsTitle: "Break-glass reviews",
    reviewsEmpty: "No break-glass action needs a review.",
    reviewDue: "Review due {date}",
    overdue: "Overdue",
    signedOff: "Signed off by {name} ({ref})",
    signOff: "Record review",
    reviewTitle: "Record the independent review",
    reviewIntro: "The external accountant or another named person who is not an administrator reviews the action. Record their name and the reference of the review document.",
    reviewName: "Reviewer's name",
    reviewRef: "Review document reference",
    reviewRefError: "Enter the document reference (at least 3 characters).",
    settingsTitle: "Thresholds",
    settingsIntro: "Changing a threshold is itself a request that another administrator with money rights approves.",
    propose: "Propose change",
    settingTitle: "Propose a new value",
    settingValue: "New value in SAR",
    settingValueError: "Enter a positive amount.",
    settingReason: "Why should it change? (at least 10 characters)",
    alertsTitle: "Open security alerts",
    alertsEmpty: "No open security alert.",
    acknowledge: "Acknowledge",
    alertTitle: "Acknowledge this alert",
    alertReason: "What was checked? (at least 10 characters)",
    alertKinds: {
      mfa_lockout: "Account locked after 10 wrong authenticator codes",
      mfa_reset: "Two-step verification reset",
      iban_reveal_volume: "More than 10 IBAN reveals in 24 hours",
      break_glass_used: "Break-glass used",
      console_role_changed: "Console role changed",
      iban_change_requested: "Provider bank account change requested",
      health_break_glass: "Health-intake answers opened through break-glass",
      mfa_factor_added: "Authenticator added to an administrator account",
      iban_reveal_limit_reached: "IBAN reveal ceiling reached (20 in 24 hours)",
      privacy_lookup_limit_reached: "Customer lookup limit reached (10 searches in 10 minutes)",
    } as Record<string, string>,
    liftReveals: "Allow 10 more reveals",
    liftTitle: "Allow this administrator 10 more IBAN reveals today",
    liftIntro: "Reveals stop at 20 in 24 hours. Allowing more is recorded in your name and needs a fresh authenticator code. You cannot allow more for yourself.",
    liftReason: "Why are more reveals needed? (at least 15 characters)",
    settingNames: {
      refund_single_approval_sar: "Single refund needing a second approver",
      refund_daily_cumulative_sar: "Daily refund total per administrator",
      break_glass_daily_cap_sar: "Break-glass daily cap",
    } as Record<string, string>,
    done: "Done.",
    approvedDone: "Approved and executed.",
    rejectedDone: "Rejected.",
    proposedDone: "The change is waiting for a second administrator.",
    unnamed: "Unnamed account",
    provider_request: "Provider owner",
  },
  ar: {
    title: "الاعتمادات",
    subtitle: "إجراءات تحتاج إلى مسؤول ثانٍ. لا يمكنك اعتماد طلبك بنفسك؛ يرفض الخادم ذلك لكل الأدوار بما فيها المالك.",
    tabs: { pending: "بانتظار القرار", approved: "معتمدة", rejected: "مرفوضة", cancelled: "مسحوبة" },
    kinds: { payout_release: "صرف تحويل", refund: "استرداد", iban_change: "تغيير حساب بنكي", setting_change: "تغيير حد",
      ledger_settlement: "تسوية قيد يدوية", ledger_adjustment: "تصحيح قيد", fee_rule_change: "تغيير قاعدة رسوم",
      payout_hold: "إيقاف التحويلات", reward_program: "تغيير برنامج مكافآت", role_change: "منح دور في لوحة الإدارة",
      booking_cancellation: "إلغاء حجز مع استرداد", reconciliation_import: "استيراد ملف تسوية",
      sponsored_price_change: "سعر الإعلان لكل عميل جديد",
      privacy_export: "تسليم نسخة من بيانات عميل", privacy_deletion: "حذف بيانات عميل", privacy_legal_hold: "حجز قانوني على بيانات عميل",
      customer_profile_clear: "مسح بيانات الملف الشخصي لعميل",
      privacy_legal_hold_release: "رفع حجز قانوني قبل موعده (يحذف ما احتفظ به)",
      privacy_legal_hold_renewal: "تجديد حجز قانوني مضى عليه أكثر من سنة",
      incident_aware_at_correction: "تصحيح وقت العلم بحادثة (يغيّر مهلة سدايا)",
      privacy_retention_purge: "حذف سجلات العملاء المحذوفين بعد انتهاء مدة الاحتفاظ (لا يمكن التراجع عنه)" },
    holdRenewals: "جُدد {n} مرات",
    customerErased: "حُذف حساب العميل",
    accountHeld: "الحساب محتجز",
    deadlineMove: "مهلة سدايا {from} ← {to} ({h} ساعة)",
    purgePreview: "تجربة بتاريخ {date}: حذف {s} سجلاً فرعياً و{d} حجزاً، والإبقاء على {a} حجزاً دون هوية؛ يُعاد العدّ عند التنفيذ المعتمد",
    profileClearEffect: "يحذف الاسم والبريد والهاتف والجنس ورمز الإشعارات؛ ويُبقي تسجيل الدخول والحجوزات والفواتير والرسائل",
    profileClearHeld: "الحجز القانوني {ref} يحتفظ بهذا الحساب: يُرفض الاعتماد حتى يُرفع الحجز؛ ارفض الطلب بدلاً من ذلك",
    approveIntroChange: "الاعتماد يطبّق التغيير الآن باسمك مع فحوصاته. يحتاج رمزاً جديداً من تطبيق المصادقة.",
    privacyTypes: { access: "اطلاع", copy: "نسخة", deletion: "حذف" } as Record<string, string>,
    privacyPreview: "{p} حجوزات بلا هوية، {d} محذوفة، {m} رسائل، {h} إجابات صحية",
    privacyFollowUp: "تم الاعتماد. لم تُنفَّذ الخطوة التالية بعد ({reason})؛ افتح طلبات الخصوصية لإعادة تشغيلها.",
    consoleRoles: { owner: "المالك", finance: "المالية", operations: "العمليات", analyst: "محلل (قراءة فقط)" } as Record<string, string>,
    noConsoleRole: "بلا دور في لوحة الإدارة",
    breakGlassClosedUntil: "إجراء الطوارئ مغلق حتى {date}: خُفّض دور مسؤول كان يمكنه الاعتماد أو أُزيل",
    ownAlert: "يتعلق بك أو بإجراء قمت به: يقرّ به مالك آخر",
    ownBreakGlass: "أنت من استخدم إجراء الطوارئ: يسجّل المراجعةَ مسؤول آخر",
    describeParts: { increase: "زيادة، إشعار ٣٠ يوماً", from: "من", place: "إيقاف", lift: "رفع الإيقاف", enable: "تفعيل", disable: "إيقاف",
      reference: "المرجع البنكي", provider: "المزود", platform: "المنصة", tap: "معرّف Tap",
      cancelBooking: "إلغاء الحجز", noShowBooking: "عدم حضور", invoice: "الفاتورة", refund: "الاسترداد",
      sources: { tap_settlement_file: "ملف تسويات Tap", bank_statement: "كشف الحساب البنكي" } as Record<string, string>,
      rows: "أسطر", day: "اليوم", breakDiff: "مبلغ الفرق", corrected: "المصحَّح سابقاً", partial: "تصحيح جزئي" },
    columnRequest: "الطلب",
    columnAmount: "المبلغ",
    columnRequestedBy: "مقدّم الطلب",
    columnReason: "السبب",
    columnActions: "الإجراءات",
    approve: "اعتماد",
    reject: "رفض",
    withdraw: "سحب الطلب",
    breakGlass: "إجراء الطوارئ",
    approveSelected: "اعتماد المحدد ({n})",
    selectRow: "تحديد هذا الطلب",
    selectAll: "تحديد كل الطلبات التي يمكنك اعتمادها",
    yours: "طلبك: يقرره مسؤول آخر",
    noRight: "دورك في لوحة الإدارة لا يسمح بالبت في هذا النوع",
    accountChangedRecently: "تغيّر الحساب البنكي خلال آخر ٣٠ يوماً",
    provider: "المزود",
    account: "الحساب",
    previousAccount: "الحساب السابق",
    holder: "اسم صاحب الحساب",
    setting: "الإعداد",
    from: "من",
    to: "إلى",
    loading: "جارٍ تحميل الطلبات...",
    empty: "لا يوجد شيء هنا.",
    emptyPending: "لا يوجد طلب بانتظار القرار.",
    loadFailed: "تعذّر تحميل الطلبات: {reason}",
    retry: "إعادة المحاولة",
    previous: "السابق",
    next: "التالي",
    pageOf: "الصفحة {page} من {pages}",
    decidedBy: "قرره {name} في {date}",
    breakGlassBadge: "إجراء طوارئ",
    approveTitle: "اعتماد: {kind}",
    rejectTitle: "رفض: {kind}",
    approveIntro: "الاعتماد ينفذ الإجراء الآن باسمك مع كل فحوصاته (الرصيد والتعليق ومنع التكرار). يحتاج رمزاً جديداً من تطبيق المصادقة.",
    rejectIntro: "الرفض يغلق الطلب؛ لا يُدفع أو يُسترد أو يتغير شيء.",
    decisionReason: "ما سبب قرارك؟",
    bulkTitle: "اعتماد {n} طلبات",
    bulkIntro: "يُعتمد كل طلب ويُنفذ وحده؛ الطلب الذي يفشل يبقى بانتظار القرار ويظهر مع سببه.",
    bulkDone: "اعتُمد {ok}، ولم يُعتمد {failed}.",
    bulkFailures: "لم يُعتمد",
    cancelTitle: "سحب طلبك",
    cancelReason: "لماذا تسحبه؟",
    breakGlassTitle: "إجراء الطوارئ: التنفيذ دون مسؤول ثانٍ",
    breakGlassIntro: "استخدمه فقط عند عدم وجود مسؤول آخر يمكنه الاعتماد. الحد {cap} في اليوم بتوقيت الرياض (استُخدم اليوم {used})، ويُبلَّغ كل مالك عبر قناة خارجية، ويُرفع تنبيه أمني، ويجب مراجعته مراجعة مستقلة خلال ٧ أيام. لا يتاح أبداً للحسابات البنكية أو الحدود.",
    breakGlassReason: "مبرر مكتوب (٢٠ حرفاً على الأقل)",
    reviewsTitle: "مراجعات إجراءات الطوارئ",
    reviewsEmpty: "لا يوجد إجراء طوارئ يحتاج مراجعة.",
    reviewDue: "موعد المراجعة {date}",
    overdue: "متأخرة",
    signedOff: "راجعها {name} ({ref})",
    signOff: "تسجيل المراجعة",
    reviewTitle: "تسجيل المراجعة المستقلة",
    reviewIntro: "يراجع الإجراءَ المحاسبُ الخارجي أو شخص مسمّى ليس مسؤولاً في اللوحة. سجّل اسمه ومرجع مستند المراجعة.",
    reviewName: "اسم المراجع",
    reviewRef: "مرجع مستند المراجعة",
    reviewRefError: "أدخل مرجع المستند (٣ أحرف على الأقل).",
    settingsTitle: "الحدود",
    settingsIntro: "تغيير أي حد هو نفسه طلب يعتمده مسؤول آخر لديه صلاحيات مالية.",
    propose: "اقتراح تغيير",
    settingTitle: "اقتراح قيمة جديدة",
    settingValue: "القيمة الجديدة بالريال",
    settingValueError: "أدخل مبلغاً موجباً.",
    settingReason: "لماذا يجب تغييره؟ (١٠ أحرف على الأقل)",
    alertsTitle: "تنبيهات أمنية مفتوحة",
    alertsEmpty: "لا يوجد تنبيه أمني مفتوح.",
    acknowledge: "إقرار",
    alertTitle: "الإقرار بهذا التنبيه",
    alertReason: "ما الذي تم التحقق منه؟ (١٠ أحرف على الأقل)",
    alertKinds: {
      mfa_lockout: "قفل حساب بعد ١٠ رموز مصادقة خاطئة",
      mfa_reset: "إعادة ضبط التحقق بخطوتين",
      iban_reveal_volume: "أكثر من ١٠ عمليات كشف آيبان خلال ٢٤ ساعة",
      break_glass_used: "استُخدم إجراء الطوارئ",
      console_role_changed: "تغيّر دور في لوحة الإدارة",
      iban_change_requested: "طلب تغيير الحساب البنكي لمزود",
      health_break_glass: "فُتحت إجابات الاستبيان الصحي عبر إجراء الطوارئ",
      mfa_factor_added: "أُضيف تطبيق مصادقة إلى حساب مسؤول",
      iban_reveal_limit_reached: "بلوغ الحد الأعلى لكشف الآيبان (٢٠ خلال ٢٤ ساعة)",
      privacy_lookup_limit_reached: "بلوغ حد البحث عن العملاء (١٠ عمليات بحث خلال ١٠ دقائق)",
    } as Record<string, string>,
    liftReveals: "السماح بـ ١٠ عمليات كشف إضافية",
    liftTitle: "السماح لهذا المسؤول بـ ١٠ عمليات كشف آيبان إضافية اليوم",
    liftIntro: "يتوقف كشف الآيبان عند ٢٠ مرة خلال ٢٤ ساعة. السماح بالمزيد يُسجَّل باسمك ويحتاج رمزاً جديداً من تطبيق المصادقة. لا يمكنك السماح بالمزيد لنفسك.",
    liftReason: "لماذا تلزم عمليات كشف إضافية؟ (١٥ حرفاً على الأقل)",
    settingNames: {
      refund_single_approval_sar: "استرداد واحد يحتاج معتمداً ثانياً",
      refund_daily_cumulative_sar: "إجمالي الاسترداد اليومي لكل مسؤول",
      break_glass_daily_cap_sar: "الحد اليومي لإجراء الطوارئ",
    } as Record<string, string>,
    done: "تم.",
    approvedDone: "تم الاعتماد والتنفيذ.",
    rejectedDone: "تم الرفض.",
    proposedDone: "التغيير بانتظار اعتماد مسؤول ثانٍ.",
    unnamed: "حساب بلا اسم",
    provider_request: "مالك المزود",
  },
};

const toNumber = (value: Numeric | undefined) => Number(value ?? 0);
const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
const text = (value: unknown) => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

export default function AdminApprovals() {
  return (
    <Suspense fallback={null}>
      <ApprovalsScreen />
    </Suspense>
  );
}

function ApprovalsScreen() {
  const lang = useOperationsLocale();
  const params = useSearchParams();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const [status, setStatus] = useState<Status>(() => oneOf(params.get("status"), STATUSES, "pending"));
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [success, setSuccess] = useState("");
  const [failure, setFailure] = useState("");
  const [bulkFailures, setBulkFailures] = useState<{ id: string; label: string; reason: string }[]>([]);

  useEffect(() => {
    writeUrlState({ status: status === "pending" ? "" : status });
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError("");
      const { data, error } = await supabase.rpc("admin_approval_inbox", { p_status: status, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
      if (cancelled) return;
      if (error) {
        setInbox(null);
        setLoadError(describeConsoleError(error, lang));
        setForbidden(isForbidden(error));
      } else {
        setInbox(data as Inbox);
        setForbidden(false);
      }
      setSelected([]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const providerName = (row: ApprovalRow) => (isRTL ? row.provider_name_ar || row.provider_name_en : row.provider_name_en || row.provider_name_ar) || "";
  const kindLabel = (row: ApprovalRow) => t.kinds[row.kind] ?? row.kind;
  const describe = (row: ApprovalRow) => {
    const s = row.summary ?? {};
    if (row.kind === "setting_change") {
      const name = t.settingNames[text(s.key)] ?? text(s.key);
      return `${name}: ${sar(toNumber(s.value_before as Numeric), lang)} → ${sar(toNumber(s.value as Numeric), lang)}`;
    }
    if (row.kind === "iban_change") {
      return [providerName(row), text(s.bank_name), text(s.iban_masked)].filter(Boolean).join(" · ");
    }
    const d = t.describeParts;
    if (row.kind === "ledger_settlement") {
      return [providerName(row), sar(toNumber(s.amount as Numeric), lang), `${d.reference}: ${text(s.bank_reference)}`].filter(Boolean).join(" · ");
    }
    if (row.kind === "ledger_adjustment") {
      return [providerName(row), text(s.correction), `${d.provider} ${sar(toNumber(s.provider_share_delta as Numeric), lang)}`,
        `${d.platform} ${sar(toNumber(s.platform_share_delta as Numeric), lang)}`, s.tap_object_id ? `${d.tap}: ${text(s.tap_object_id)}` : "",
        s.break_difference !== undefined ? `${d.breakDiff} ${sar(toNumber(s.break_difference as Numeric), lang)}` : "",
        s.break_corrected_before !== undefined && toNumber(s.break_corrected_before as Numeric) > 0 ? `${d.corrected} ${sar(toNumber(s.break_corrected_before as Numeric), lang)}` : "",
        s.partial ? d.partial : ""].filter(Boolean).join(" · ");
    }
    if (row.kind === "fee_rule_change") {
      const after = (s.after ?? {}) as Record<string, unknown>;
      return [`${text(after.fee_percentage)}%`, sar(toNumber(after.min_fee_sar as Numeric), lang), after.max_fee_sar === null ? "" : sar(toNumber(after.max_fee_sar as Numeric), lang),
        `${d.from} ${text(s.effective_from).slice(0, 10)}`, s.increase ? d.increase : ""].filter(Boolean).join(" · ");
    }
    if (row.kind === "payout_hold") {
      return [providerName(row), s.action === "lift" ? d.lift : d.place].filter(Boolean).join(" · ");
    }
    if (row.kind === "privacy_export" || row.kind === "privacy_deletion") {
      const p = (s.preview ?? {}) as Record<string, unknown>;
      return [t.privacyTypes[text(s.request_type)] ?? text(s.request_type), `${text(s.subject_id).slice(0, 8)}`,
        row.kind === "privacy_deletion" ? t.privacyPreview.replace("{p}", text(p.bookings_to_pseudonymise)).replace("{d}", text(p.bookings_to_delete))
          .replace("{m}", text(p.messages)).replace("{h}", text(p.health_answers)) : "",
        s.deadline_at ? operationsDate(text(s.deadline_at), lang) : ""].filter(Boolean).join(" · ");
    }
    if (row.kind === "customer_profile_clear") {
      return [`${text(row.target_id).slice(0, 8)}`, t.profileClearEffect,
        row.legal_hold ? t.profileClearHeld.replace("{ref}", text(row.legal_hold.case_reference)) : ""].filter(Boolean).join(" · ");
    }
    if (row.kind === "privacy_legal_hold_release" || row.kind === "privacy_legal_hold_renewal") {
      const cats = Array.isArray(s.categories) ? (s.categories as string[]).join(", ") : "";
      return [text(s.basis).replace("_", " "), text(s.case_reference), cats, s.account_held ? t.accountHeld : "",
        s.customer_erased ? t.customerErased : "", t.holdRenewals.replace("{n}", text(s.renewals))].filter(Boolean).join(" · ");
    }
    if (row.kind === "privacy_retention_purge") {
      const subRecords = Object.values((s.sub_records ?? {}) as Record<string, unknown>).reduce<number>((sum, n) => sum + toNumber(n as Numeric), 0);
      return t.purgePreview.replace("{date}", text(s.cutoff)).replace("{s}", String(subRecords))
        .replace("{d}", text(s.bookings_deleted)).replace("{a}", text(s.bookings_anonymised));
    }
    if (row.kind === "incident_aware_at_correction") {
      return [text(s.reference), t.deadlineMove.replace("{from}", s.deadline_from ? operationsDate(text(s.deadline_from), lang) : "—")
        .replace("{to}", s.deadline_to ? operationsDate(text(s.deadline_to), lang) : "—").replace("{h}", text(s.moves_deadline_hours))].join(" · ");
    }
    if (row.kind === "privacy_legal_hold") {
      const cats = Array.isArray(s.categories) ? (s.categories as string[]).join(", ") : "";
      return [text(s.basis).replace("_", " "), text(s.case_reference), cats].filter(Boolean).join(" · ");
    }
    if (row.kind === "sponsored_price_change") {
      const price = (value: unknown) => (value === null || value === undefined ? "—" : sar(toNumber(value as Numeric), lang));
      return `${price(s.value_before)} → ${price(s.value)}`;
    }
    if (row.kind === "reconciliation_import") {
      return [d.sources[text(s.source)] ?? text(s.source), `${d.day} ${text(s.business_day)}`, `${text(s.row_count)} ${d.rows}`,
        sar(toNumber(s.total_sar as Numeric), lang), `SHA-256 ${text(s.file_sha256).slice(0, 12)}…`].filter(Boolean).join(" · ");
    }
    if (row.kind === "booking_cancellation") {
      return [providerName(row), s.action === "no_show" ? d.noShowBooking : d.cancelBooking, s.invoice_number ? `${d.invoice} ${text(s.invoice_number)}` : "",
        `${d.refund} ${sar(toNumber(s.refund_amount as Numeric), lang)}`].filter(Boolean).join(" · ");
    }
    if (row.kind === "role_change") {
      const role = (value: unknown) => (typeof value === "string" && value ? t.consoleRoles[value] ?? value : t.noConsoleRole);
      return [row.target_name || t.unnamed, `${role(s.role_before)} → ${role(s.role_after)}`].join(" · ");
    }
    if (row.kind === "reward_program") {
      return [text(s.program), s.enabled ? d.enable : d.disable, s.reward_value_sar === null || s.reward_value_sar === undefined ? "" : sar(toNumber(s.reward_value_sar as Numeric), lang)].filter(Boolean).join(" · ");
    }
    return [providerName(row), text(s.iban_masked)].filter(Boolean).join(" · ");
  };
  const requester = (row: ApprovalRow) => row.requested_by_name || (row.requested_role === "provider" ? t.provider_request : t.unnamed);

  const decide = async (row: ApprovalRow, decision: "approve" | "reject", reason: string): Promise<string | null> => {
    const { error } = await supabase.rpc("admin_decide_approval", { p_request_id: row.id, p_decision: decision, p_reason: reason });
    if (error) return describeConsoleError(error, lang);
    // PRIV: an approved copy is built and an approved deletion's auth account removed right away by the Edge Functions (the
    // scheduler retries them too). A failure here leaves the approval done and the next step visible on the privacy screen.
    if (decision === "approve" && (row.kind === "privacy_export" || row.kind === "privacy_deletion")) {
      const { error: followUp } = await supabase.functions.invoke(row.kind === "privacy_export" ? "privacy-export" : "privacy-erase-account",
        { body: row.kind === "privacy_export" ? { request_id: row.target_id } : {} });
      if (followUp) setFailure(t.privacyFollowUp.replace("{reason}", describeConsoleError(followUp, lang)));
    }
    return null;
  };

  const confirmDialog = async (reason: string, extra: string): Promise<string | null> => {
    if (!dialog) return null;
    let message: string | null = null;
    if (dialog.type === "decide") {
      message = await decide(dialog.row, dialog.decision, reason);
      if (!message) setSuccess(dialog.decision === "approve" ? t.approvedDone : t.rejectedDone);
    } else if (dialog.type === "bulk") {
      const failures: { id: string; label: string; reason: string }[] = [];
      for (const row of dialog.rows) {
        const refused = await decide(row, "approve", reason);
        if (refused) failures.push({ id: row.id, label: `${kindLabel(row)} · ${describe(row)}`, reason: refused });
      }
      setBulkFailures(failures);
      const summaryText = fill(t.bulkDone, { ok: dialog.rows.length - failures.length, failed: failures.length });
      if (failures.length) setFailure(summaryText);
      else setSuccess(summaryText);
    } else if (dialog.type === "cancel") {
      const { error } = await supabase.rpc("admin_cancel_approval", { p_request_id: dialog.row.id, p_reason: reason });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.done);
    } else if (dialog.type === "break-glass") {
      const { error } = await supabase.rpc("admin_break_glass_execute", { p_request_id: dialog.row.id, p_justification: reason });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.approvedDone);
    } else if (dialog.type === "review") {
      const { error } = await supabase.rpc("admin_sign_off_break_glass", { p_review_id: dialog.review.id, p_reviewer_name: reason, p_document_reference: extra, p_notes: null });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.done);
    } else if (dialog.type === "setting") {
      const { error } = await supabase.rpc("admin_request_setting_change", { p_key: dialog.setting.key, p_value: Number(extra), p_reason: reason });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.proposedDone);
    } else if (dialog.type === "lift") {
      const { error } = await supabase.rpc("admin_lift_iban_reveal_limit", { p_user_id: dialog.alert.user_id, p_reason: reason });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.done);
    } else if (dialog.type === "alert") {
      const { error } = await supabase.rpc("admin_acknowledge_security_alert", { p_alert_id: dialog.alert.id, p_note: reason });
      message = error ? describeConsoleError(error, lang) : null;
      if (!message) setSuccess(t.done);
    }
    if (!message) reload();
    return message;
  };

  const rows = inbox?.rows ?? [];
  const decidable = rows.filter((row) => row.can_decide);
  const matching = toNumber(inbox?.matching);
  const pages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";
  const requestDetails = (row: ApprovalRow) => (
    <>
      <p className="font-black text-gray-900">{kindLabel(row)}{row.break_glass ? <span className="ms-2 rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-black text-[#B42318]">{t.breakGlassBadge}</span> : null}</p>
      <p className="mt-0.5 text-[11px] text-gray-600"><bdi>{describe(row)}</bdi></p>
      {row.summary?.destination_changed_recently === true && <p className="mt-1 text-[11px] font-black text-[#B54708]">{t.accountChangedRecently}</p>}
      {row.kind === "iban_change" && row.summary?.previous_iban_masked ? <p className="mt-1 text-[11px] text-gray-600">{t.previousAccount}: <bdi dir="ltr">{text(row.summary.previous_iban_masked)}</bdi></p> : null}
      {row.kind === "iban_change" && row.summary?.account_holder_name ? <p className="mt-1 text-[11px] text-gray-600">{t.holder}: {text(row.summary.account_holder_name)}</p> : null}
      <p className="mt-1 text-[10px] text-gray-600">{operationsDate(row.requested_at, lang)}</p>
    </>
  );
  const reasonDetails = (row: ApprovalRow) => (
    <>
      <p className="break-words">{row.request_reason}</p>
      {row.decided_at && <p className="mt-1 text-[10px] text-gray-600">{fill(t.decidedBy, { name: row.decided_by_name || t.unnamed, date: operationsDate(row.decided_at, lang) })}{row.decision_reason ? ` — ${row.decision_reason}` : ""}</p>}
    </>
  );
  const rowActions = (row: ApprovalRow, smallButton: string) => (row.status === "pending" ? (
    <span className="flex flex-wrap gap-1.5">
      {row.can_decide && <button type="button" onClick={() => setDialog({ type: "decide", row, decision: "approve" })} aria-label={`${t.approve}: ${kindLabel(row)}`} className={`${smallButton} border-[#101828] bg-[#101828] text-white`}>{t.approve}</button>}
      {row.can_decide && <button type="button" onClick={() => setDialog({ type: "decide", row, decision: "reject" })} aria-label={`${t.reject}: ${kindLabel(row)}`} className={`${smallButton} border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]`}>{t.reject}</button>}
      {row.can_cancel && <button type="button" onClick={() => setDialog({ type: "cancel", row })} className={`${smallButton} border-gray-300 bg-white text-gray-800`}>{t.withdraw}</button>}
      {row.can_break_glass && <button type="button" onClick={() => setDialog({ type: "break-glass", row })} className={`${smallButton} border-[#B42318] bg-white text-[#B42318]`}>{t.breakGlass}</button>}
      {!row.can_decide && !row.can_cancel && <span className="text-[11px] text-gray-600">{row.decide_blocked_reason || t.noRight}</span>}
      {row.can_cancel && row.break_glass_blocked_until ? <span className="w-full text-[10px] font-bold text-[#B54708]">{fill(t.breakGlassClosedUntil, { date: operationsDate(row.break_glass_blocked_until, lang) })}</span> : null}
      {row.can_cancel && !row.can_break_glass && <span className="w-full text-[10px] text-gray-600">{t.yours}</span>}
    </span>
  ) : null);
  const smallButton = `whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${focusRing}`;
  const panel = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";

  const dialogProps = (() => {
    if (!dialog) return null;
    switch (dialog.type) {
      case "decide":
        return {
          title: fill(dialog.decision === "approve" ? t.approveTitle : t.rejectTitle, { kind: kindLabel(dialog.row) }),
          // The balance, hold and duplicate checks belong to money actions; a setting, role or privacy change has its own checks.
          intro: dialog.decision === "approve"
            ? (MONEY_KINDS.includes(dialog.row.kind) ? t.approveIntro : t.approveIntroChange)
            : t.rejectIntro,
          facts: [
            { label: t.columnRequest, value: describe(dialog.row) || kindLabel(dialog.row) },
            ...(dialog.row.amount_sar !== null ? [{ label: t.columnAmount, value: sar(toNumber(dialog.row.amount_sar), lang) }] : []),
            { label: t.columnRequestedBy, value: requester(dialog.row) },
            { label: t.columnReason, value: dialog.row.request_reason },
          ],
          reasonLabel: t.decisionReason,
          confirmLabel: dialog.decision === "approve" ? t.approve : t.reject,
          tone: dialog.decision === "reject" ? ("danger" as const) : ("default" as const),
        };
      case "bulk":
        return {
          title: fill(t.bulkTitle, { n: dialog.rows.length }),
          intro: t.bulkIntro,
          facts: [{ label: t.columnAmount, value: sar(dialog.rows.reduce((sum, row) => sum + toNumber(row.amount_sar), 0), lang) }],
          reasonLabel: t.decisionReason,
          confirmLabel: fill(t.approveSelected, { n: dialog.rows.length }),
        };
      case "cancel":
        return { title: t.cancelTitle, facts: [{ label: t.columnRequest, value: describe(dialog.row) || kindLabel(dialog.row) }], reasonLabel: t.cancelReason, confirmLabel: t.withdraw, tone: "danger" as const };
      case "break-glass": {
        const cap = inbox?.settings.find((s) => s.key === "break_glass_daily_cap_sar")?.value ?? null;
        return {
          title: t.breakGlassTitle,
          intro: fill(t.breakGlassIntro, { cap: sar(toNumber(cap), lang), used: sar(toNumber(inbox?.break_glass_used_today), lang) }),
          facts: [
            { label: t.columnRequest, value: describe(dialog.row) || kindLabel(dialog.row) },
            ...(dialog.row.amount_sar !== null ? [{ label: t.columnAmount, value: sar(toNumber(dialog.row.amount_sar), lang) }] : []),
          ],
          reasonLabel: t.breakGlassReason,
          minReasonLength: 20,
          confirmLabel: t.breakGlass,
          tone: "danger" as const,
        };
      }
      case "review":
        return {
          title: t.reviewTitle,
          intro: t.reviewIntro,
          facts: [{ label: t.columnAmount, value: sar(toNumber(dialog.review.amount_sar), lang) }, { label: t.columnReason, value: dialog.review.justification }],
          field: { label: t.reviewRef, pattern: /^.{3,}$/, error: t.reviewRefError, ltr: true },
          reasonLabel: t.reviewName,
          confirmLabel: t.signOff,
        };
      case "setting":
        return {
          title: t.settingTitle,
          intro: t.settingsIntro,
          facts: [{ label: t.setting, value: t.settingNames[dialog.setting.key] ?? dialog.setting.key }, { label: t.from, value: sar(toNumber(dialog.setting.value), lang) }],
          field: { label: t.settingValue, pattern: /^[0-9]+(\.[0-9]{1,2})?$/, error: t.settingValueError, ltr: true, inputMode: "decimal" as const },
          reasonLabel: t.settingReason,
          minReasonLength: 10,
          confirmLabel: t.propose,
        };
      case "lift":
        return { title: t.liftTitle, intro: t.liftIntro, facts: [{ label: t.columnRequest, value: t.alertKinds[dialog.alert.kind] ?? dialog.alert.kind }], reasonLabel: t.liftReason, minReasonLength: 15, confirmLabel: t.liftReveals };
      case "alert":
        return { title: t.alertTitle, facts: [{ label: t.columnRequest, value: t.alertKinds[dialog.alert.kind] ?? dialog.alert.kind }], reasonLabel: t.alertReason, minReasonLength: 10, confirmLabel: t.acknowledge };
    }
  })();

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-6 text-start">
      <div>
        <h1 className="font-serif text-2xl font-black text-gray-900">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      {forbidden ? (
        <ForbiddenNotice locale={lang} />
      ) : (
        <>
          <div role="tablist" aria-label={t.title} className="flex flex-wrap gap-2">
            {STATUSES.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={status === item}
                onClick={() => { setStatus(item); setPage(1); }}
                className={`rounded-full border px-4 py-2 text-xs font-black ${focusRing} ${status === item ? "border-[#101828] bg-[#101828] text-[#F4E7B6]" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"}`}>
                {t.tabs[item]}
                {inbox?.counts?.[item] !== undefined ? <span className="ms-2 opacity-70">{toNumber(inbox.counts[item]).toLocaleString(isRTL ? "ar-SA" : "en-US")}</span> : null}
              </button>
            ))}
          </div>

          {status === "pending" && decidable.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={selected.length === 0}
                onClick={() => setDialog({ type: "bulk", rows: decidable.filter((row) => selected.includes(row.id)) })}
                className={`rounded-xl bg-[#101828] px-4 py-2 text-xs font-black text-white disabled:opacity-40 ${focusRing}`}>
                {fill(t.approveSelected, { n: selected.length })}
              </button>
            </div>
          )}

          {bulkFailures.length > 0 && (
            <div role="alert" className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-4 text-xs font-semibold text-[#B42318]">
              <p className="font-black">{t.bulkFailures}</p>
              <ul className="mt-2 list-disc space-y-1 ps-5">{bulkFailures.map((item) => <li key={item.id}>{item.label}: {item.reason}</li>)}</ul>
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            {loading ? (
              <p role="status" className="p-8 text-center text-xs font-bold text-gray-400">{t.loading}</p>
            ) : loadError ? (
              <div className="p-8 text-center">
                <p role="alert" className="text-xs font-bold text-[#B42318]">{fill(t.loadFailed, { reason: loadError })}</p>
                <button type="button" onClick={reload} className={`mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500 ${focusRing}`}>{t.retry}</button>
              </div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-center text-xs font-semibold text-gray-500">{status === "pending" ? t.emptyPending : t.empty}</p>
            ) : (
              <>
              <ul className="divide-y divide-[#F5F5F5] md:hidden" aria-label={t.columnRequest}>
                {rows.map((row) => (
                  <li key={row.id} className="space-y-3 p-4 text-xs font-semibold text-gray-700">
                    <div className="flex items-start gap-3">
                      {status === "pending" && row.can_decide ? (
                        <input type="checkbox" aria-label={`${t.selectRow}: ${kindLabel(row)}`} checked={selected.includes(row.id)}
                          onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#9B7928]" />
                      ) : null}
                      <div className="min-w-0 flex-1">{requestDetails(row)}</div>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt className="text-gray-600">{t.columnAmount}</dt>
                      <dd className="min-w-0">{row.amount_sar !== null ? sar(toNumber(row.amount_sar), lang) : "—"}</dd>
                      <dt className="text-gray-600">{t.columnRequestedBy}</dt>
                      <dd className="min-w-0 break-words">{requester(row)}</dd>
                      <dt className="text-gray-600">{t.columnReason}</dt>
                      <dd className="min-w-0">{reasonDetails(row)}</dd>
                    </dl>
                    {rowActions(row, `${smallButton} min-h-11`)}
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[860px] text-xs">
                  <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>
                      {status === "pending" && (
                        <th scope="col" className={`${cell} w-8`}>
                          <input type="checkbox" aria-label={t.selectAll} disabled={decidable.length === 0}
                            checked={decidable.length > 0 && decidable.every((row) => selected.includes(row.id))}
                            onChange={(event) => setSelected(event.target.checked ? decidable.map((row) => row.id) : [])} className="h-4 w-4 accent-[#9B7928]" />
                        </th>
                      )}
                      <th scope="col" className={`${cell} text-start`}>{t.columnRequest}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnAmount}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnRequestedBy}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnReason}</th>
                      <th scope="col" className={`${cell} text-start`}>{t.columnActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        {status === "pending" && (
                          <td className={cell}>
                            {row.can_decide ? (
                              <input type="checkbox" aria-label={`${t.selectRow}: ${kindLabel(row)}`} checked={selected.includes(row.id)}
                                onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}
                                className="h-4 w-4 accent-[#9B7928]" />
                            ) : null}
                          </td>
                        )}
                        <td className={cell}>{requestDetails(row)}</td>
                        <td className={`${cell} whitespace-nowrap`}>{row.amount_sar !== null ? sar(toNumber(row.amount_sar), lang) : "—"}</td>
                        <td className={cell}>{requester(row)}</td>
                        <td className={`${cell} max-w-[260px]`}>{reasonDetails(row)}</td>
                        <td className={cell}>{rowActions(row, smallButton)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            {!loading && !loadError && rows.length > 0 ? (
              <div className="flex items-center justify-between gap-3 border-t border-[#ECECEC] px-4 py-3 text-xs font-bold text-gray-600">
                <span>{fill(t.pageOf, { page: page.toLocaleString(isRTL ? "ar-SA" : "en-US"), pages: pages.toLocaleString(isRTL ? "ar-SA" : "en-US") })}</span>
                <span className="flex gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className={`${smallButton} border-gray-300`}>{t.previous}</button>
                  <button type="button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)} className={`${smallButton} border-gray-300`}>{t.next}</button>
                </span>
              </div>
            ) : null}
          </section>

          {inbox && (
            <div className="grid gap-4 xl:grid-cols-3">
              <section className={panel} aria-labelledby="bg-reviews">
                <h3 id="bg-reviews" className="font-serif text-lg font-black text-gray-900">{t.reviewsTitle}</h3>
                {inbox.break_glass_reviews.length === 0 ? <p className="mt-3 text-xs text-gray-500">{t.reviewsEmpty}</p> : (
                  <ul className="mt-3 space-y-3 text-xs">
                    {inbox.break_glass_reviews.map((review) => (
                      <li key={review.id} className="rounded-xl border border-[#ECECEC] p-3">
                        <p className="font-black text-gray-900">{sar(toNumber(review.amount_sar), lang)} · {operationsDate(review.executed_at, lang)}</p>
                        <p className="mt-1 break-words text-gray-600">{review.justification}</p>
                        {review.signed_off_at ? (
                          <p className="mt-1 text-green-800">{fill(t.signedOff, { name: review.reviewer_name ?? "", ref: review.document_reference ?? "" })}</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={review.overdue ? "font-black text-[#B42318]" : "text-gray-500"}>{review.overdue ? t.overdue : fill(t.reviewDue, { date: operationsDate(review.due_at, lang) })}</span>
                            {inbox.can_review_break_glass && review.can_sign_off !== false && <button type="button" onClick={() => setDialog({ type: "review", review })} className={`${smallButton} border-gray-300 bg-white`}>{t.signOff}</button>}
                            {inbox.can_review_break_glass && review.can_sign_off === false && <span className="text-[11px] text-gray-500">{t.ownBreakGlass}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={panel} aria-labelledby="gov-settings">
                <h3 id="gov-settings" className="font-serif text-lg font-black text-gray-900">{t.settingsTitle}</h3>
                <p className="mt-1 text-[11px] text-gray-500">{t.settingsIntro}</p>
                <ul className="mt-3 space-y-2 text-xs">
                  {inbox.settings.map((setting) => (
                    <li key={setting.key} className="flex items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
                      <span>
                        <span className="block font-bold text-gray-800">{t.settingNames[setting.key] ?? setting.key}</span>
                        <span className="block text-[11px] text-gray-500">{isRTL ? setting.description_ar : setting.description_en}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-black text-gray-900">{sar(toNumber(setting.value), lang)}</span>
                        {inbox.can_propose_settings && <button type="button" onClick={() => setDialog({ type: "setting", setting })} className={`${smallButton} border-gray-300 bg-white`}>{t.propose}</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className={panel} aria-labelledby="sec-alerts">
                <h3 id="sec-alerts" className="font-serif text-lg font-black text-gray-900">{t.alertsTitle}</h3>
                {inbox.open_alerts.length === 0 ? <p className="mt-3 text-xs text-gray-500">{t.alertsEmpty}</p> : (
                  <ul className="mt-3 space-y-2 text-xs">
                    {inbox.open_alerts.map((alert) => (
                      <li key={alert.id} className="flex items-start justify-between gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3">
                        <span>
                          <span className="block font-bold text-[#93370D]">{t.alertKinds[alert.kind] ?? alert.kind}</span>
                          <span className="block text-[11px] text-[#B54708]">{operationsDate(alert.created_at, lang)}</span>
                        </span>
                        {inbox.can_acknowledge_alerts && alert.can_acknowledge !== false && <button type="button" onClick={() => setDialog({ type: "alert", alert })} className={`${smallButton} border-[#FEC84B] bg-white text-[#93370D]`}>{t.acknowledge}</button>}
                        {inbox.can_acknowledge_alerts && alert.can_acknowledge !== false && (alert.kind === "iban_reveal_limit_reached" || alert.kind === "iban_reveal_volume") && alert.user_id && (
                          <button type="button" onClick={() => setDialog({ type: "lift", alert })} className={`${smallButton} border-[#FEC84B] bg-white text-[#93370D]`}>{t.liftReveals}</button>
                        )}
                        {inbox.can_acknowledge_alerts && alert.can_acknowledge === false && <span className="max-w-[140px] text-[10px] text-[#B54708]">{t.ownAlert}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <GovernanceNotices locale={lang} panelClass={panel} buttonClass={`${smallButton} border-[#FEC84B] bg-white text-[#93370D]`}
                onDone={(message) => { setSuccess(message); reload(); }} />
            </div>
          )}
        </>
      )}

      {dialog && dialogProps && (
        <CommandDialog locale={lang} {...dialogProps} onConfirm={confirmDialog} onClose={() => setDialog(null)} />
      )}
      <CommandResult success={success} error={failure} locale={lang} onDismiss={() => { setSuccess(""); setFailure(""); }} />
    </div>
  );
}
