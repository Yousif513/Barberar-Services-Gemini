"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { CommandResult, ForbiddenNotice, isForbidden, operationsDate, operationsInput, sar, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog, ModalOverlay } from "@/components/modal";

// Platform switches and rates: feature flags, marketplace fee rules and the API limits. Every change is a server command
// that needs the operator's reason and is recorded in the audit log (admin_set_feature_flag, admin_set_api_setting); a fee
// change is a pending request a different administrator approves (admin_propose_fee_rule_change, D-Q8): it adds a new,
// effective-dated version and never edits the old one. Nothing here writes a table. A list that fails to load says so and offers a retry, and a
// value nobody has set is shown as not set, never as a made-up default.

const API_KEYS = [
  "api.max_requests_per_minute",
  "api.max_key_lifetime_days",
  "api.webhook_max_attempts",
  "api.webhook_retry_base_seconds",
  "api.webhook_disable_after_failures",
] as const;

type Flag = { flag_key: string; is_enabled: boolean; description: string | null; updated_at: string };
type FeeRule = {
  id: string;
  channel: string;
  is_first_visit: boolean | null;
  fee_percentage: number | string;
  min_fee_sar: number | string;
  max_fee_sar: number | string | null;
  is_active: boolean;
  description: string | null;
  effective_from: string;
  effective_to: string | null;
  in_force: boolean;
  scheduled: boolean;
};
type PendingFee = { id: string; summary: { is_first_visit: boolean | null; increase: boolean; effective_from: string; after: { fee_percentage: number; min_fee_sar: number; max_fee_sar: number | null } }; requested_at: string; reason: string };
type ApiSetting = { key: string; value: unknown; updated_at: string | null };
type Section<T> = { rows: T[] | null; error: string; forbidden: boolean };
type RuleForm = { id: string | null; firstVisit: boolean; percentage: string; min: string; max: string; description: string; reason: string; effectiveDate: string };

const translations = {
  en: {
    title: "Platform Rules",
    subtitle: "Feature flags, marketplace fees and API limits. Each change needs a reason and is recorded in the audit log.",
    retry: "Retry",
    loading: "Loading...",
    loadFailed: "This section could not be loaded: {reason}",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    flagLabel: "Flag",
    keyLabel: "Setting",
    flagsTitle: "Feature flags",
    flagsIntro: "A flag switches a whole capability on or off for everyone.",
    flagsEmpty: "There are no feature flags.",
    flagOn: "On",
    flagOff: "Off",
    turnOn: "Turn on",
    turnOff: "Turn off",
    turnOnTitle: "Turn on {flag}",
    turnOffTitle: "Turn off {flag}",
    turnOnIntro: "This starts the capability for every user. Check that its preconditions are met before you continue.",
    turnOffIntro: "This stops the capability for every user until it is turned on again.",
    flagReason: "Why is this flag changing?",
    flagOnDone: "The flag was turned on.",
    flagOffDone: "The flag was turned off.",
    updated: "Updated",
    feesTitle: "Marketplace fee rules",
    feesIntro: "What the platform charges on a booking that comes through the marketplace. Bookings that come through a provider's own link, QR code, WhatsApp, Instagram, walk-in or imported client are always free of platform fee, so those rows are shown but cannot be changed. A change is a new version from a start date: it applies to bookings made from that date only, a different administrator must approve it, and an increase starts at least 30 days after approval so providers are told in time. VAT is charged on the platform fee.",
    columnFrom: "In force from",
    columnTo: "Until",
    inForce: "In force",
    scheduledState: "Scheduled",
    ended: "Ended",
    proposeChange: "Propose a change",
    effectiveLabel: "Start date (Riyadh)",
    effectiveHint: "A lower fee can start today. A higher fee must start at least 30 days after it is approved.",
    effectiveInvalid: "Choose a start date from today on.",
    ruleSent: "The fee change was sent for approval. A different administrator approves it in Approvals.",
    pendingTitle: "Waiting for approval",
    increaseBadge: "Increase: 30 days notice",
    vatNote: "Plus VAT on this fee",
    feesEmpty: "There are no fee rules.",
    columnChannel: "Channel",
    columnVisit: "Visit",
    columnPercent: "Fee %",
    columnMin: "Minimum",
    columnMax: "Maximum",
    columnState: "State",
    columnActions: "Actions",
    firstVisit: "First visit",
    repeatVisit: "Repeat visit",
    anyVisit: "Any visit",
    always0: "Always no fee",
    noMax: "No maximum",
    active: "Active",
    inactive: "Inactive",
    edit: "Edit",
    addRule: "Add the missing rule: {visit}",
    ruleTitleEdit: "Change the marketplace fee: {visit}",
    ruleTitleAdd: "Add the marketplace fee: {visit}",
    percentLabel: "Fee percentage (0 to 50)",
    minLabel: "Minimum fee (SAR)",
    maxLabel: "Maximum fee (SAR, empty for none)",
    descriptionLabel: "Description (optional)",
    ruleReason: "Reason for this change",
    ruleReasonHint: "Recorded in the audit log with your name.",
    ruleSaved: "The fee change was sent for approval.",
    percentInvalid: "Enter a percentage from 0 to 50.",
    minInvalid: "Enter a minimum from 0 to 1000.",
    maxInvalid: "The maximum is empty or between the minimum and 1000.",
    reasonShort: "Enter a reason of at least 10 characters.",
    apiTitle: "API limits",
    apiIntro: "Limits for the provider developer API. A limit nobody has set is shown as not set, and the capability that depends on it stays off until you set it.",
    apiEmpty: "These settings are not in this database yet. Apply the developer API migrations first.",
    notSet: "Not set",
    setValue: "Set value",
    changeValue: "Change value",
    apiValueLabel: "Whole number from 1 to 1,000,000",
    apiValueError: "Enter a whole number from 1 to 1,000,000.",
    apiTitleDialog: "Set {key}",
    apiReason: "Why is this limit changing?",
    apiDone: "The setting was saved.",
    api: {
      "api.max_requests_per_minute": ["Requests per minute ceiling", "The highest per-key limit a provider can choose. While not set, API keys cannot be created."],
      "api.max_key_lifetime_days": ["Key lifetime ceiling (days)", "How far in the future a key may expire. While not set, any future date is accepted."],
      "api.webhook_max_attempts": ["Webhook delivery attempts", "Attempts per event before it is marked failed. While not set, no webhook is sent."],
      "api.webhook_retry_base_seconds": ["Webhook retry base (seconds)", "Base of the exponential back-off. While not set, no webhook is sent."],
      "api.webhook_disable_after_failures": ["Disable endpoint after failures", "Failed events in a row before an endpoint is switched off. While not set, endpoints stay on."],
    } as Record<string, [string, string]>,
  },
  ar: {
    title: "قواعد المنصة",
    subtitle: "مفاتيح الميزات ورسوم السوق وحدود واجهة البرمجة. كل تغيير يحتاج إلى سبب ويُسجَّل في سجل التدقيق.",
    retry: "إعادة المحاولة",
    loading: "جارٍ التحميل...",
    loadFailed: "تعذّر تحميل هذا القسم: {reason}",
    cancel: "إلغاء",
    save: "حفظ",
    saving: "جارٍ الحفظ...",
    flagLabel: "المفتاح",
    keyLabel: "الإعداد",
    flagsTitle: "مفاتيح الميزات",
    flagsIntro: "المفتاح يشغّل خاصية كاملة أو يوقفها لجميع المستخدمين.",
    flagsEmpty: "لا توجد مفاتيح ميزات.",
    flagOn: "يعمل",
    flagOff: "متوقف",
    turnOn: "تشغيل",
    turnOff: "إيقاف",
    turnOnTitle: "تشغيل {flag}",
    turnOffTitle: "إيقاف {flag}",
    turnOnIntro: "سيبدأ تشغيل الخاصية لجميع المستخدمين. تأكد من استيفاء شروطها قبل المتابعة.",
    turnOffIntro: "ستتوقف الخاصية لجميع المستخدمين حتى يُعاد تشغيلها.",
    flagReason: "ما سبب تغيير هذا المفتاح؟",
    flagOnDone: "تم تشغيل المفتاح.",
    flagOffDone: "تم إيقاف المفتاح.",
    updated: "آخر تحديث",
    feesTitle: "قواعد رسوم السوق",
    feesIntro: "ما تتقاضاه المنصة على الحجز القادم من السوق. الحجوزات القادمة من رابط المزود أو رمز QR أو واتساب أو إنستغرام أو العميل الحاضر أو قائمة العملاء المستوردة تكون دائماً بلا رسوم منصة، لذلك تظهر صفوفها دون إمكانية تعديلها. التغيير نسخة جديدة تبدأ من تاريخ محدد: تسري على الحجوزات من ذلك التاريخ فقط، ويجب أن يعتمدها مسؤول آخر، والزيادة تبدأ بعد 30 يوماً على الأقل من الاعتماد ليُبلَّغ المزودون في الوقت المناسب. تُضاف ضريبة القيمة المضافة على رسوم المنصة.",
    columnFrom: "سارية من",
    columnTo: "حتى",
    inForce: "سارية",
    scheduledState: "مجدولة",
    ended: "منتهية",
    proposeChange: "اقتراح تغيير",
    effectiveLabel: "تاريخ البدء (بتوقيت الرياض)",
    effectiveHint: "يمكن أن تبدأ الرسوم الأقل اليوم. أما الرسوم الأعلى فتبدأ بعد 30 يوماً على الأقل من اعتمادها.",
    effectiveInvalid: "اختر تاريخ بدء من اليوم فصاعداً.",
    ruleSent: "أُرسل تغيير الرسوم للاعتماد. يعتمده مسؤول آخر من صفحة الاعتمادات.",
    pendingTitle: "بانتظار الاعتماد",
    increaseBadge: "زيادة: إشعار 30 يوماً",
    vatNote: "تضاف ضريبة القيمة المضافة على هذه الرسوم",
    feesEmpty: "لا توجد قواعد رسوم.",
    columnChannel: "القناة",
    columnVisit: "الزيارة",
    columnPercent: "الرسوم %",
    columnMin: "الحد الأدنى",
    columnMax: "الحد الأقصى",
    columnState: "الحالة",
    columnActions: "الإجراءات",
    firstVisit: "الزيارة الأولى",
    repeatVisit: "زيارة متكررة",
    anyVisit: "أي زيارة",
    always0: "دائماً بلا رسوم",
    noMax: "بلا حد أقصى",
    active: "مفعّلة",
    inactive: "معطّلة",
    edit: "تعديل",
    addRule: "إضافة القاعدة الناقصة: {visit}",
    ruleTitleEdit: "تغيير رسوم السوق: {visit}",
    ruleTitleAdd: "إضافة رسوم السوق: {visit}",
    percentLabel: "نسبة الرسوم (0 إلى 50)",
    minLabel: "الحد الأدنى للرسوم (ر.س)",
    maxLabel: "الحد الأقصى للرسوم (ر.س، فارغ لعدم التحديد)",
    descriptionLabel: "الوصف (اختياري)",
    ruleReason: "سبب هذا التغيير",
    ruleReasonHint: "يُسجَّل في سجل التدقيق باسمك.",
    ruleSaved: "أُرسل تغيير الرسوم للاعتماد.",
    percentInvalid: "أدخل نسبة من 0 إلى 50.",
    minInvalid: "أدخل حداً أدنى من 0 إلى 1000.",
    maxInvalid: "الحد الأقصى فارغ أو بين الحد الأدنى و1000.",
    reasonShort: "اكتب سبباً لا يقل عن 10 أحرف.",
    apiTitle: "حدود واجهة البرمجة",
    apiIntro: "حدود واجهة برمجة المزودين. الحد الذي لم يحدده أحد يظهر «غير محدد»، وتبقى الخاصية المعتمدة عليه متوقفة حتى تحدده.",
    apiEmpty: "هذه الإعدادات غير موجودة في قاعدة البيانات بعد. طبّق ترحيلات واجهة البرمجة أولاً.",
    notSet: "غير محدد",
    setValue: "تحديد القيمة",
    changeValue: "تغيير القيمة",
    apiValueLabel: "عدد صحيح من 1 إلى 1,000,000",
    apiValueError: "أدخل عدداً صحيحاً من 1 إلى 1,000,000.",
    apiTitleDialog: "تحديد {key}",
    apiReason: "ما سبب تغيير هذا الحد؟",
    apiDone: "تم حفظ الإعداد.",
    api: {
      "api.max_requests_per_minute": ["سقف الطلبات في الدقيقة", "أعلى حد لكل مفتاح يمكن للمزود اختياره. ما لم يُحدَّد لا يمكن إنشاء مفاتيح."],
      "api.max_key_lifetime_days": ["سقف عمر المفتاح (أيام)", "إلى أي مدى مستقبلاً يمكن أن ينتهي المفتاح. ما لم يُحدَّد يُقبل أي تاريخ مستقبلي."],
      "api.webhook_max_attempts": ["محاولات تسليم الويب هوك", "عدد المحاولات لكل حدث قبل اعتباره فاشلاً. ما لم يُحدَّد لا يُرسل أي ويب هوك."],
      "api.webhook_retry_base_seconds": ["أساس إعادة المحاولة (ثوانٍ)", "أساس التأخير التصاعدي. ما لم يُحدَّد لا يُرسل أي ويب هوك."],
      "api.webhook_disable_after_failures": ["إيقاف النقطة بعد إخفاقات", "عدد الأحداث الفاشلة المتتالية قبل إيقاف النقطة. ما لم يُحدَّد تبقى النقاط تعمل."],
    } as Record<string, [string, string]>,
  },
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
const emptySection = <T,>(): Section<T> => ({ rows: null, error: "", forbidden: false });
const API_VALUE = /^([1-9][0-9]{0,5}|1000000)$/;
// Today in Riyadh as YYYY-MM-DD (the start date picker works in the platform's time zone).
const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function AdminPlatformRules() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const numberFormat = isRTL ? "ar-SA" : "en-US";

  const [flags, setFlags] = useState<Section<Flag>>(emptySection);
  const [rules, setRules] = useState<Section<FeeRule>>(emptySection);
  const [pendingFees, setPendingFees] = useState<PendingFee[]>([]);
  const [vatRate, setVatRate] = useState<number | null>(null);
  const [apiSettings, setApiSettings] = useState<Section<ApiSetting>>(emptySection);
  const [loading, setLoading] = useState({ flags: true, rules: true, api: true });
  const [flagPending, setFlagPending] = useState<{ flag: Flag; next: boolean } | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null);
  const [ruleError, setRuleError] = useState("");
  const [ruleSaving, setRuleSaving] = useState(false);
  const [apiPending, setApiPending] = useState<ApiSetting | null>(null);
  const [success, setSuccess] = useState("");

  const loadFlags = useCallback(async () => {
    setLoading((value) => ({ ...value, flags: true }));
    const { data, error } = await supabase.from("platform_feature_flags").select("flag_key, is_enabled, description, updated_at").order("flag_key");
    setFlags(error ? { rows: null, error: errorMessage(error), forbidden: isForbidden(error) } : { rows: (data ?? []) as Flag[], error: "", forbidden: false });
    setLoading((value) => ({ ...value, flags: false }));
  }, []);
  const loadRules = useCallback(async () => {
    setLoading((value) => ({ ...value, rules: true }));
    const { data, error } = await supabase.rpc("admin_fee_rule_versions");
    const page = (data ?? null) as { versions: FeeRule[]; pending: PendingFee[]; vat_rate_percent: number | null } | null;
    setRules(error ? { rows: null, error: errorMessage(error), forbidden: isForbidden(error) } : { rows: page?.versions ?? [], error: "", forbidden: false });
    setPendingFees(error ? [] : page?.pending ?? []);
    setVatRate(error || page?.vat_rate_percent === null || page?.vat_rate_percent === undefined ? null : Number(page.vat_rate_percent));
    setLoading((value) => ({ ...value, rules: false }));
  }, []);
  const loadApi = useCallback(async () => {
    setLoading((value) => ({ ...value, api: true }));
    const { data, error } = await supabase.from("platform_settings").select("key, value, updated_at").in("key", [...API_KEYS]);
    setApiSettings(error ? { rows: null, error: errorMessage(error), forbidden: isForbidden(error) } : { rows: (data ?? []) as ApiSetting[], error: "", forbidden: false });
    setLoading((value) => ({ ...value, api: false }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFlags();
      void loadRules();
      void loadApi();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadFlags, loadRules, loadApi]);

  const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
  const cell = "px-4 py-3 align-top";
  const smallButton = `whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-black disabled:opacity-50 ${focusRing}`;
  const card = "overflow-hidden rounded-2xl border border-[#ECECEC] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const visitLabel = (first: boolean | null) => (first === null ? t.anyVisit : first ? t.firstVisit : t.repeatVisit);
  const directChannel = (channel: string) => channel !== "marketplace";

  const sectionBody = <T,>(section: Section<T>, isLoading: boolean, reload: () => void, empty: string, render: (rows: T[]) => React.ReactNode) => {
    if (isLoading) return <p className="p-6 text-center text-xs font-bold text-gray-400">{t.loading}</p>;
    if (section.error) {
      return (
        <div className="p-6 text-center">
          <p role="alert" className="text-xs font-bold text-[#B42318]">{fill(t.loadFailed, { reason: section.error })}</p>
          <button type="button" onClick={reload} className={`mt-3 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:border-gray-500 ${focusRing}`}>{t.retry}</button>
        </div>
      );
    }
    if (!section.rows || section.rows.length === 0) return <p className="p-6 text-center text-xs font-semibold text-gray-500">{empty}</p>;
    return render(section.rows);
  };

  const changeFlag = async (reason: string): Promise<string | null> => {
    if (!flagPending) return null;
    const { flag, next } = flagPending;
    const { error } = await supabase.rpc("admin_set_feature_flag", { p_flag_key: flag.flag_key, p_enabled: next, p_reason: reason });
    if (error) return errorMessage(error);
    setSuccess(next ? t.flagOnDone : t.flagOffDone);
    await loadFlags();
    return null;
  };

  const openRule = (rule: FeeRule | null, firstVisit: boolean) =>
    {
      setRuleError("");
      setRuleForm({
        id: rule?.id ?? null,
        firstVisit,
        percentage: rule ? String(Number(rule.fee_percentage)) : "",
        min: rule ? String(Number(rule.min_fee_sar)) : "0",
        max: rule?.max_fee_sar === null || rule === null ? "" : String(Number(rule.max_fee_sar)),
        description: rule?.description ?? "",
        reason: "",
        effectiveDate: riyadhToday(),
      });
    };

  const saveRule = async () => {
    if (!ruleForm) return;
    const percentage = Number(ruleForm.percentage);
    const min = Number(ruleForm.min);
    const max = ruleForm.max.trim() === "" ? null : Number(ruleForm.max);
    if (ruleForm.percentage.trim() === "" || !Number.isFinite(percentage) || percentage < 0 || percentage > 50) { setRuleError(t.percentInvalid); return; }
    if (ruleForm.min.trim() === "" || !Number.isFinite(min) || min < 0 || min > 1000) { setRuleError(t.minInvalid); return; }
    if (max !== null && (!Number.isFinite(max) || max < min || max > 1000)) { setRuleError(t.maxInvalid); return; }
    if (ruleForm.reason.trim().length < 10) { setRuleError(t.reasonShort); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ruleForm.effectiveDate) || ruleForm.effectiveDate < riyadhToday()) { setRuleError(t.effectiveInvalid); return; }
    // Today means now; a later date means the start of that day in Riyadh.
    const effectiveFrom = ruleForm.effectiveDate === riyadhToday() ? new Date().toISOString() : `${ruleForm.effectiveDate}T00:00:00+03:00`;
    setRuleSaving(true);
    setRuleError("");
    const { error } = await supabase.rpc("admin_propose_fee_rule_change", {
      p_channel: "marketplace",
      p_is_first_visit: ruleForm.firstVisit,
      p_fee_percentage: percentage,
      p_min_fee_sar: min,
      p_max_fee_sar: max,
      p_effective_from: effectiveFrom,
      p_reason: ruleForm.reason.trim(),
      p_description: ruleForm.description.trim() || null,
    });
    setRuleSaving(false);
    if (error) {
      setRuleError(errorMessage(error));
      return;
    }
    setRuleForm(null);
    setSuccess(t.ruleSent);
    await loadRules();
  };

  const changeApi = async (reason: string, value: string): Promise<string | null> => {
    if (!apiPending) return null;
    const { error } = await supabase.rpc("admin_set_api_setting", { p_key: apiPending.key, p_value: Number(value), p_reason: reason });
    if (error) return errorMessage(error);
    setSuccess(t.apiDone);
    await loadApi();
    return null;
  };

  const marketplaceRules = (rules.rows ?? []).filter((rule) => rule.channel === "marketplace" && (rule.in_force || rule.scheduled));
  const missingVisits = rules.rows ? [true, false].filter((first) => !marketplaceRules.some((rule) => rule.is_first_visit === first)) : [];
  const forbidden = flags.forbidden || rules.forbidden || apiSettings.forbidden;

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-8 text-start">
      <div>
        <h2 className="font-serif text-2xl font-black text-gray-900">{t.title}</h2>
        <p className="mt-1 max-w-3xl text-xs font-semibold text-gray-500">{t.subtitle}</p>
      </div>

      {forbidden ? (
        <ForbiddenNotice locale={lang} />
      ) : (
        <>
          <section aria-labelledby="flags-title" className="space-y-3">
            <div>
              <h3 id="flags-title" className="font-serif text-lg font-black text-gray-900">{t.flagsTitle}</h3>
              <p className="text-xs font-semibold text-gray-500">{t.flagsIntro}</p>
            </div>
            <div className={card}>
              {sectionBody(flags, loading.flags, () => void loadFlags(), t.flagsEmpty, (rows) => (
                <ul className="divide-y divide-[#F5F5F5]">
                  {rows.map((flag) => (
                    <li key={flag.flag_key} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 max-w-2xl">
                        <p dir="ltr" className="text-start font-mono text-sm font-bold text-gray-900">{flag.flag_key}</p>
                        {flag.description ? <p className="mt-1 text-xs font-semibold text-gray-600">{flag.description}</p> : null}
                        <p className="mt-1 text-[11px] text-gray-500">{t.updated}: {operationsDate(flag.updated_at, lang)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${flag.is_enabled ? "bg-[#ECFDF3] text-[#027A48]" : "bg-stone-100 text-stone-700"}`}>{flag.is_enabled ? t.flagOn : t.flagOff}</span>
                        <button type="button" onClick={() => setFlagPending({ flag, next: !flag.is_enabled })} aria-label={`${flag.is_enabled ? t.turnOff : t.turnOn}: ${flag.flag_key}`} className={`${smallButton} ${flag.is_enabled ? "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]" : "border-gray-300 bg-white text-gray-900 hover:border-[#D1AF47]"}`}>
                          {flag.is_enabled ? t.turnOff : t.turnOn}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </section>

          <section aria-labelledby="fees-title" className="space-y-3">
            <div>
              <h3 id="fees-title" className="font-serif text-lg font-black text-gray-900">{t.feesTitle}</h3>
              <p className="max-w-4xl text-xs font-semibold text-gray-500">{t.feesIntro}</p>
            </div>
            <div className={card}>
              {sectionBody(rules, loading.rules, () => void loadRules(), t.feesEmpty, (rows) => (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="border-b border-[#ECECEC] bg-[#FAF9F6] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                      <tr>
                        <th scope="col" className={`${cell} text-start`}>{t.columnChannel}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnVisit}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnPercent}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnMin}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnMax}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnFrom}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnTo}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnState}</th>
                        <th scope="col" className={`${cell} text-start`}>{t.columnActions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
                      {rows.map((rule) => (
                        <tr key={rule.id}>
                          <td dir="ltr" className={`${cell} text-start font-mono font-bold text-gray-900`}>{rule.channel}</td>
                          <td className={cell}>{visitLabel(rule.is_first_visit)}</td>
                          {directChannel(rule.channel) ? (
                            <td colSpan={3} className={`${cell} text-gray-500`}>{t.always0}</td>
                          ) : (
                            <>
                              <td className={cell}>
                                {Number(rule.fee_percentage).toLocaleString(numberFormat)}%
                                {vatRate !== null && Number(rule.fee_percentage) > 0 ? <span className="block text-[10px] font-semibold text-gray-500">{t.vatNote} ({vatRate.toLocaleString(numberFormat)}%)</span> : null}
                              </td>
                              <td className={cell}>{sar(Number(rule.min_fee_sar), lang)}</td>
                              <td className={cell}>{rule.max_fee_sar === null ? t.noMax : sar(Number(rule.max_fee_sar), lang)}</td>
                            </>
                          )}
                          <td className={cell}>{operationsDate(rule.effective_from, lang)}</td>
                          <td className={cell}>{rule.effective_to ? operationsDate(rule.effective_to, lang) : "—"}</td>
                          <td className={cell}>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${rule.in_force ? "bg-[#ECFDF3] text-[#027A48]" : rule.scheduled ? "bg-[#FFFAEB] text-[#B54708]" : "bg-stone-100 text-stone-700"}`}>{rule.in_force ? t.inForce : rule.scheduled ? t.scheduledState : t.ended}</span>
                          </td>
                          <td className={cell}>
                            {directChannel(rule.channel) || !rule.in_force ? "—" : (
                              <button type="button" onClick={() => openRule(rule, rule.is_first_visit === true)} aria-label={`${t.proposeChange}: ${visitLabel(rule.is_first_visit)}`} className={`${smallButton} border-gray-300 bg-white text-gray-900 hover:border-[#D1AF47]`}>{t.proposeChange}</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {pendingFees.length > 0 && !loading.rules ? (
                <div className="border-t border-[#ECECEC] p-4">
                  <h4 className="text-xs font-black text-gray-900">{t.pendingTitle}</h4>
                  <ul className="mt-2 space-y-2">
                    {pendingFees.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-700">
                        <span>{visitLabel(item.summary.is_first_visit)}:</span>
                        <span>{Number(item.summary.after.fee_percentage).toLocaleString(numberFormat)}% · {sar(Number(item.summary.after.min_fee_sar), lang)} – {item.summary.after.max_fee_sar === null ? t.noMax : sar(Number(item.summary.after.max_fee_sar), lang)}</span>
                        <span>{t.columnFrom}: {operationsDate(item.summary.effective_from, lang)}</span>
                        {item.summary.increase ? <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[10px] font-black text-[#B54708]">{t.increaseBadge}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {missingVisits.length > 0 && !loading.rules ? (
                <div className="flex flex-wrap gap-2 border-t border-[#ECECEC] p-4">
                  {missingVisits.map((first) => (
                    <button key={String(first)} type="button" onClick={() => openRule(null, first)} className={`${smallButton} border-gray-300 bg-white text-gray-900 hover:border-[#D1AF47]`}>{fill(t.addRule, { visit: visitLabel(first) })}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="api-title" className="space-y-3">
            <div>
              <h3 id="api-title" className="font-serif text-lg font-black text-gray-900">{t.apiTitle}</h3>
              <p className="max-w-4xl text-xs font-semibold text-gray-500">{t.apiIntro}</p>
            </div>
            <div className={card}>
              {sectionBody(apiSettings, loading.api, () => void loadApi(), t.apiEmpty, (rows) => (
                <ul className="divide-y divide-[#F5F5F5]">
                  {API_KEYS.map((key) => {
                    const row = rows.find((item) => item.key === key);
                    if (!row) return null;
                    const set = typeof row.value === "number";
                    const [label, hint] = t.api[key];
                    return (
                      <li key={key} className="flex flex-wrap items-start justify-between gap-3 p-4">
                        <div className="min-w-0 max-w-2xl">
                          <p className="text-sm font-bold text-gray-900">{label}</p>
                          <p dir="ltr" className="text-start font-mono text-[11px] text-gray-500">{key}</p>
                          <p className="mt-1 text-xs font-semibold text-gray-600">{hint}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${set ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FFFAEB] text-[#B54708]"}`}>
                            {set ? Number(row.value).toLocaleString(numberFormat) : t.notSet}
                          </span>
                          <button type="button" onClick={() => setApiPending(row)} aria-label={`${set ? t.changeValue : t.setValue}: ${label}`} className={`${smallButton} border-gray-300 bg-white text-gray-900 hover:border-[#D1AF47]`}>{set ? t.changeValue : t.setValue}</button>
                        </div>
                      </li>
                    );
                  })}
                  {API_KEYS.every((key) => !rows.some((item) => item.key === key)) ? <li className="p-6 text-center text-xs font-semibold text-gray-500">{t.apiEmpty}</li> : null}
                </ul>
              ))}
            </div>
          </section>
        </>
      )}

      {flagPending && (
        <CommandDialog
          locale={lang}
          tone={flagPending.next ? "danger" : "default"}
          title={fill(flagPending.next ? t.turnOnTitle : t.turnOffTitle, { flag: flagPending.flag.flag_key })}
          intro={`${flagPending.next ? t.turnOnIntro : t.turnOffIntro}${flagPending.flag.description ? ` ${flagPending.flag.description}` : ""}`}
          facts={[{ label: t.flagLabel, value: flagPending.flag.flag_key }]}
          confirmWord={flagPending.next ? flagPending.flag.flag_key : undefined}
          reasonLabel={t.flagReason}
          confirmLabel={flagPending.next ? t.turnOn : t.turnOff}
          onConfirm={changeFlag}
          onClose={() => setFlagPending(null)}
        />
      )}

      {apiPending && (
        <CommandDialog
          locale={lang}
          title={fill(t.apiTitleDialog, { key: t.api[apiPending.key]?.[0] ?? apiPending.key })}
          intro={t.api[apiPending.key]?.[1]}
          facts={[{ label: t.keyLabel, value: apiPending.key }]}
          field={{ label: t.apiValueLabel, initial: typeof apiPending.value === "number" ? String(apiPending.value) : "", pattern: API_VALUE, error: t.apiValueError, ltr: true }}
          reasonLabel={t.apiReason}
          confirmLabel={t.save}
          onConfirm={changeApi}
          onClose={() => setApiPending(null)}
        />
      )}

      {ruleForm && (
        <ModalOverlay onClose={() => setRuleForm(null)} canClose={!ruleSaving} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="rule-dialog-title" tabIndex={-1} dir={isRTL ? "rtl" : "ltr"} className="w-full max-w-lg rounded-2xl border border-[#ECECEC] bg-white p-6 text-start shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
            <h3 id="rule-dialog-title" className="font-serif text-xl font-black text-gray-900">{fill(ruleForm.id ? t.ruleTitleEdit : t.ruleTitleAdd, { visit: visitLabel(ruleForm.firstVisit) })}</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">{t.feesIntro}</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
                <span>{t.percentLabel}</span>
                <input type="number" min="0" max="50" step="0.01" value={ruleForm.percentage} onChange={(event) => setRuleForm({ ...ruleForm, percentage: event.target.value })} className={operationsInput} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
                <span>{t.minLabel}</span>
                <input type="number" min="0" max="1000" step="0.01" value={ruleForm.min} onChange={(event) => setRuleForm({ ...ruleForm, min: event.target.value })} className={operationsInput} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]">
                <span>{t.maxLabel}</span>
                <input type="number" min="0" max="1000" step="0.01" value={ruleForm.max} onChange={(event) => setRuleForm({ ...ruleForm, max: event.target.value })} className={operationsInput} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085] sm:col-span-3">
                <span>{t.effectiveLabel}</span>
                <input type="date" dir="ltr" min={riyadhToday()} value={ruleForm.effectiveDate} onChange={(event) => setRuleForm({ ...ruleForm, effectiveDate: event.target.value })} aria-describedby="rule-effective-hint" className={operationsInput} />
                <span id="rule-effective-hint" className="text-[11px]">{t.effectiveHint}</span>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085] sm:col-span-3">
                <span>{t.descriptionLabel}</span>
                <input maxLength={300} value={ruleForm.description} onChange={(event) => setRuleForm({ ...ruleForm, description: event.target.value })} className={operationsInput} />
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085] sm:col-span-3">
                <span>{t.ruleReason}</span>
                <textarea rows={2} value={ruleForm.reason} onChange={(event) => setRuleForm({ ...ruleForm, reason: event.target.value })} aria-describedby="rule-reason-hint" className={operationsInput} />
                <span id="rule-reason-hint" className="text-[11px]">{t.ruleReasonHint}</span>
              </label>
            </div>
            {ruleError ? <p role="alert" className="mt-4 rounded-xl border border-[#FEE4E2] bg-[#FEF3F2] p-3 text-xs font-bold text-[#B42318]">{ruleError}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setRuleForm(null)} disabled={ruleSaving} className={`rounded-xl border border-gray-200 px-5 py-2 text-xs font-black text-gray-600 hover:text-gray-900 ${focusRing}`}>{t.cancel}</button>
              <button type="button" onClick={() => void saveRule()} disabled={ruleSaving} className={`rounded-xl bg-[#D1AF47] px-5 py-2 text-xs font-black text-gray-950 hover:bg-[#E0C46A] disabled:opacity-60 ${focusRing}`}>{ruleSaving ? t.saving : t.proposeChange}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <CommandResult success={success} locale={lang} onDismiss={() => setSuccess("")} />
    </div>
  );
}
