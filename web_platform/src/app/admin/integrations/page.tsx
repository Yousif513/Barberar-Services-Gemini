"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog, ModalOverlay, ModalPortal } from "@/components/modal";
import { ReadFailure } from "@/components/read-failure";
import { commandOutcome } from "@/lib/write-result.mjs";
import { describeConsoleError, unchangedText } from "@/lib/console-errors.mjs";
import { knownToHold, useConsoleSession } from "@/lib/console-session";

/* Integrations registry — the admin control plane for every external API.
   Secrets never live client-side: `key_masked` is a display-only hint and the
   real credentials stay in server-side (edge function) environment secrets.
   Every change goes through admin_set_integration_state or admin_save_integration, which need settings.manage, a fresh
   authenticator code and a reason, and write integration_audit_log on the server (QAFIX). */

const translations = {
  en: {
    title: "API & Integrations",
    subtitle: "Enable, disable and switch environments for every connected service. Credentials stay server-side — only masked hints are shown here.",
    connected: "Connected",
    disconnected: "Disconnected",
    enabledLabel: "Enabled",
    disabledLabel: "Disabled",
    test: "Test",
    live: "Live",
    keys: "Credentials",
    noKeys: "Configured server-side",
    webhook: "Webhook",
    lastCheck: "Last check",
    never: "Never",
    saved: "Integration settings saved.",
    catPayments: "Payments",
    catMaps: "Maps & Location",
    catSms: "SMS / OTP",
    catPush: "Push Notifications",
    catEmail: "Email",
    catWhatsapp: "WhatsApp Business",
    catCalendar: "Calendar Sync",
    catAnalytics: "Analytics",
    catAi: "AI Concierge",
    empty: "No integrations are registered yet.",
    filteredEmpty: "No integration matches this search or section."
  },
  ar: {
    title: "الربط البرمجي والتكاملات",
    subtitle: "فعّل وعطّل وبدّل البيئات لكل خدمة خارجية. تبقى المفاتيح في الخادم — تظهر هنا قيم مقنّعة فقط.",
    connected: "متصل",
    disconnected: "غير متصل",
    enabledLabel: "مفعل",
    disabledLabel: "معطل",
    test: "تجريبي",
    live: "مباشر",
    keys: "بيانات الاعتماد",
    noKeys: "مهيأة في الخادم",
    webhook: "رابط الويبهوك",
    lastCheck: "آخر فحص",
    never: "لم يتم",
    saved: "تم حفظ إعدادات التكامل.",
    catPayments: "المدفوعات",
    catMaps: "الخرائط والمواقع",
    catSms: "الرسائل / رمز التحقق",
    catPush: "إشعارات الدفع",
    catEmail: "البريد الإلكتروني",
    catWhatsapp: "واتساب الأعمال",
    catCalendar: "مزامنة التقويم",
    catAnalytics: "التحليلات",
    catAi: "المساعد الذكي",
    empty: "لا توجد تكاملات مسجلة بعد.",
    filteredEmpty: "لا يوجد تكامل يطابق هذا البحث أو القسم."
  }
};

type Integration = {
  id: string;
  key: string;
  name: string;
  category: string;
  status: "connected" | "disconnected";
  enabled: boolean;
  env: "test" | "live";
  key_masked: string | null;
  base_url?: string | null;
  platform_area?: string | null;
  description?: string | null;
  supported_payment_method_keys?: string[] | null;
  webhook_url: string | null;
  last_checked_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type IntegrationForm = {
  id: string;
  key: string;
  name: string;
  category: string;
  platform_area: string;
  base_url: string;
  key_masked: string;
  webhook_url: string;
  status: "connected" | "disconnected";
  enabled: boolean;
  env: "test" | "live";
  description: string;
  supported_payment_method_keys: string[];
};

const extraTranslations = {
  en: {
    addApi: "Add API",
    edit: "Edit",
    delete: "Disable",
    save: "Save API",
    update: "Update API",
    cancel: "Cancel",
    apiName: "API name",
    baseUrl: "API base URL",
    apiKey: "API key",
    section: "Integrated section",
    platformArea: "Platform side",
    description: "Integration notes",
    status: "Connection status",
    envLabel: "Environment",
    created: "API integration added.",
    updated: "API integration updated.",
    deleted: "API integration disabled.",
    required: "Add an API name, base URL and integration section.",
    confirmDelete: "Disable {name}? It stops being used; its configuration stays in the registry and can be re-enabled.",
    activeCount: "Active APIs",
    configuredCount: "Configured keys",
    liveCount: "Live mode",
    sectionCount: "Sections linked",
    keyHint: "Credentials are Edge Function secrets and are never stored or entered here. The key hint below only helps identify which key is in use.",
    keyHintLabel: "Key hint (last 4 characters)",
    hintInvalid: "The key hint may only contain bullets and the last four characters of the key. Never paste a full key here.",
    search: "Search APIs, sections, or base URLs...",
    allSections: "All sections",
    allPlatform: "All platform",
    notSet: "Not set",
    keyId: "API key ID",
    keyFixed: "The key of a registered integration does not change: payment methods name their gateway by it.",
    reasonLabel: "Reason for this change (recorded in the audit log)",
    reasonShort: "Enter a reason of at least 3 characters.",
    enableTitle: "Enable this integration",
    disableTitle: "Disable this integration",
    enableIntro: "The platform starts using this service again.",
    disableIntro: "The platform stops using this service. Its configuration stays in the registry and can be enabled again.",
    envTitle: "Switch the environment",
    envIntroLive: "Live mode sends real requests (and real money, for payments) through this service.",
    envIntroTest: "Test mode sends requests to the provider's sandbox only.",
    statusTitle: "Change the connection status",
    statusIntro: "Payment methods route only through connected payment integrations.",
    enabledDone: "Integration enabled.",
    disabledDone: "Integration disabled.",
    envDone: "Environment switched.",
    statusDone: "Connection status saved.",
    toggleLabel: "{state}: {name}",
    what: "The integration registry"
  },
  ar: {
    addApi: "إضافة API",
    edit: "تعديل",
    delete: "تعطيل",
    save: "حفظ API",
    update: "تحديث API",
    cancel: "إلغاء",
    apiName: "اسم API",
    baseUrl: "رابط API الأساسي",
    apiKey: "مفتاح API",
    section: "قسم التكامل",
    platformArea: "جانب المنصة",
    description: "ملاحظات الربط",
    status: "حالة الاتصال",
    envLabel: "البيئة",
    created: "تمت إضافة التكامل.",
    updated: "تم تحديث التكامل.",
    deleted: "تم تعطيل التكامل.",
    required: "أضف اسم API والرابط وقسم التكامل.",
    confirmDelete: "تعطيل {name}؟ يتوقف استخدامه ويبقى إعداده في السجل ويمكن إعادة تفعيله.",
    activeCount: "API مفعلة",
    configuredCount: "مفاتيح مهيأة",
    liveCount: "وضع مباشر",
    sectionCount: "أقسام مربوطة",
    keyHint: "بيانات الاعتماد أسرار في بيئة Edge Function ولا تُخزَّن أو تُدخَل هنا. تلميح المفتاح أدناه يساعد فقط على معرفة المفتاح المستخدم.",
    keyHintLabel: "تلميح المفتاح (آخر 4 أحرف)",
    hintInvalid: "يقبل تلميح المفتاح نقاطاً وآخر أربعة أحرف من المفتاح فقط. لا تلصق المفتاح كاملاً هنا.",
    search: "ابحث عن API أو قسم أو رابط...",
    allSections: "كل الأقسام",
    allPlatform: "كل المنصة",
    notSet: "غير محدد",
    keyId: "معرّف مفتاح API",
    keyFixed: "لا يتغير مفتاح تكامل مسجل: طرق الدفع تذكر بوابتها به.",
    reasonLabel: "سبب هذا التغيير (يُسجَّل في سجل التدقيق)",
    reasonShort: "اكتب سبباً لا يقل عن 3 أحرف.",
    enableTitle: "تفعيل هذا التكامل",
    disableTitle: "تعطيل هذا التكامل",
    enableIntro: "تعود المنصة إلى استخدام هذه الخدمة.",
    disableIntro: "تتوقف المنصة عن استخدام هذه الخدمة، ويبقى إعدادها في السجل ويمكن إعادة تفعيلها.",
    envTitle: "تبديل البيئة",
    envIntroLive: "الوضع المباشر يرسل طلبات حقيقية (وأموالاً حقيقية في المدفوعات) عبر هذه الخدمة.",
    envIntroTest: "الوضع التجريبي يرسل الطلبات إلى بيئة الاختبار لدى المزود فقط.",
    statusTitle: "تغيير حالة الاتصال",
    statusIntro: "لا تمر طرق الدفع إلا عبر تكاملات دفع متصلة.",
    enabledDone: "تم تفعيل التكامل.",
    disabledDone: "تم تعطيل التكامل.",
    envDone: "تم تبديل البيئة.",
    statusDone: "تم حفظ حالة الاتصال.",
    toggleLabel: "{state}: {name}",
    what: "سجل التكاملات"
  }
};

const SECTION_OPTIONS = [
  "payments", "maps", "sms", "push", "email", "whatsapp", "calendar", "analytics", "ai", "auth", "storage", "logistics"
];

const PLATFORM_AREAS = ["all", "customer", "provider", "admin", "customer_provider", "notifications", "edge_functions", "mobile"];

const PAYMENT_METHOD_OPTIONS = [
  { key: "mada", label: "Mada" },
  { key: "apple_pay", label: "Apple Pay" },
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
  { key: "stc_pay", label: "STC Pay" },
  { key: "tamara", label: "Tamara" },
  { key: "tabby", label: "Tabby" }
];

const defaultPaymentMethodSupport = (key: string) => {
  if (key === "tamara") return ["tamara"];
  if (key === "tabby") return ["tabby"];
  if (["tap", "moyasar", "paytabs", "myfatoorah"].includes(key)) return ["mada", "apple_pay", "visa", "mastercard", "stc_pay"];
  return [];
};

const normalizeIntegration = (item: Integration): Integration => ({
  ...item,
  supported_payment_method_keys: item.supported_payment_method_keys?.length
    ? item.supported_payment_method_keys
    : defaultPaymentMethodSupport(item.key)
});

const CATEGORY_ORDER = [...SECTION_OPTIONS];

const blankForm = (): IntegrationForm => ({
  id: "",
  key: "",
  name: "",
  category: "payments",
  platform_area: "all",
  base_url: "",
  key_masked: "",
  webhook_url: "",
  status: "disconnected",
  enabled: true,
  env: "test",
  description: "",
  supported_payment_method_keys: []
});

const slugifyKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `api_${Date.now()}`;

// The registry never holds a credential: real keys are Edge Function secrets. Only an identification hint (bullets and the
// last four characters) may be stored, and the database refuses anything longer.
const KEY_HINT_PATTERN = /^[*•]{0,12}[A-Za-z0-9]{0,4}$/;
const INTEGRATION_COLUMNS = "id, key, name, category, status, enabled, env, key_masked, webhook_url, last_checked_at, updated_at, base_url, platform_area, description, created_at, supported_payment_method_keys";

const platformLabel = (value: string | null | undefined, lang: "en" | "ar") => {
  const labels: Record<string, { en: string; ar: string }> = {
    all: { en: "All platform", ar: "كل المنصة" },
    customer: { en: "Customer app", ar: "تطبيق العملاء" },
    provider: { en: "Provider dashboard", ar: "لوحة المزود" },
    admin: { en: "Admin dashboard", ar: "لوحة الإدارة" },
    customer_provider: { en: "Customer + Provider", ar: "العميل + المزود" },
    notifications: { en: "Notifications", ar: "الإشعارات" },
    edge_functions: { en: "Edge functions", ar: "دوال الخادم" },
    mobile: { en: "Mobile app", ar: "تطبيق الجوال" }
  };
  return labels[value || "all"]?.[lang] || value || labels.all[lang];
};

export default function AdminIntegrations() {
  const [items, setItems] = useState<Integration[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [form, setForm] = useState<IntegrationForm>(() => blankForm());
  const [formReason, setFormReason] = useState("");
  const [formUpdatedAt, setFormUpdatedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState<{ item: Integration; changes: Partial<Pick<Integration, "enabled" | "env" | "status">> } | null>(null);
  // Write controls only for a console role with settings.manage (the server refuses every other role anyway).
  const canWrite = knownToHold(useConsoleSession(), ["settings.manage"]);

  useEffect(() => {
    const checkLang = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang && currentLang !== lang) setLang(currentLang);
    };
    checkLang();
    const observer = new MutationObserver(checkLang);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, [lang]);

  useEffect(() => {
    (async () => {
      try {
        setLoadError(null);
        const { data, error: readError } = await supabase.from("integrations").select(INTEGRATION_COLUMNS).order("category").order("name");
        if (readError) throw readError;
        setItems(((data ?? []) as Integration[]).map(normalizeIntegration));
      } catch (err) {
        setItems([]);
        setLoadError(err);
      } finally {
        setLoaded(true);
      }
    })();
  }, [lang, reloadKey]);

  const t = translations[lang];
  const xt = extraTranslations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const catLabel: Record<string, string> = {
    payments: t.catPayments, maps: t.catMaps, sms: t.catSms, push: t.catPush,
    email: t.catEmail, whatsapp: t.catWhatsapp, calendar: t.catCalendar,
    analytics: t.catAnalytics, ai: t.catAi,
    auth: lang === "ar" ? "التحقق وتسجيل الدخول" : "Authentication",
    storage: lang === "ar" ? "التخزين" : "Storage",
    logistics: lang === "ar" ? "التوصيل والتشغيل" : "Logistics"
  };

  const flash = (msg: string) => { setError(""); setNote(msg); setTimeout(() => setNote(""), 4000); };
  const replaceItem = (answer: Integration) => setItems((prev) => prev.map((x) => (x.id === answer.id ? normalizeIntegration(answer) : x)));

  // On/off, environment and connection status: admin_set_integration_state needs settings.manage, a fresh code and a reason,
  // refuses a stale card and answers the stored row; the card changes only after that answer. A refusal stays in the dialog.
  const runStateChange = async (reason: string): Promise<string | null> => {
    if (!pending) return null;
    const { item, changes } = pending;
    const outcome = commandOutcome(await supabase.rpc("admin_set_integration_state", {
      p_integration_id: item.id, p_changes: changes, p_reason: reason, p_expected_updated_at: item.updated_at ?? null,
    }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    replaceItem(outcome.data.integration as Integration);
    const done = "enabled" in changes ? (changes.enabled ? xt.enabledDone : xt.disabledDone) : "env" in changes ? xt.envDone : xt.statusDone;
    flash(outcome.changed ? done : unchangedText(lang));
    return null;
  };

  const askState = (item: Integration, changes: Partial<Pick<Integration, "enabled" | "env" | "status">>) => {
    setNote("");
    setError("");
    setPending({ item, changes });
  };

  const openNew = () => { setForm(blankForm()); setFormReason(""); setFormUpdatedAt(null); setError(""); setModalOpen(true); };

  const openEdit = (item: Integration) => {
    setForm({
      id: item.id,
      key: item.key,
      name: item.name || "",
      category: item.category || "payments",
      platform_area: item.platform_area || "all",
      base_url: item.base_url || "",
      key_masked: item.key_masked || "",
      webhook_url: item.webhook_url || "",
      status: item.status || "disconnected",
      enabled: item.enabled !== false,
      env: item.env || "test",
      description: item.description || "",
      supported_payment_method_keys: item.supported_payment_method_keys?.length ? item.supported_payment_method_keys : defaultPaymentMethodSupport(item.key)
    });
    setFormReason("");
    setFormUpdatedAt(item.updated_at ?? null);
    setError("");
    setModalOpen(true);
  };

  // Registry details through admin_save_integration (settings.manage, fresh code, reason). A refusal keeps the dialog open
  // with everything typed.
  const saveIntegration = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (saving) return;
    const isEdit = Boolean(form.id);
    const key = form.key || slugifyKey(form.name);
    const hint = form.key_masked.trim();

    if (!form.name.trim() || !form.base_url.trim() || !form.category) {
      setError(xt.required);
      return;
    }
    if (!KEY_HINT_PATTERN.test(hint)) {
      setError(xt.hintInvalid);
      return;
    }
    if (formReason.trim().length < 3) {
      setError(xt.reasonShort);
      return;
    }

    setSaving(true);
    setError("");

    const values: Record<string, unknown> = {
      key,
      name: form.name.trim(),
      category: form.category,
      platform_area: form.platform_area,
      base_url: form.base_url.trim(),
      key_masked: hint || null,
      webhook_url: form.webhook_url.trim() || null,
      status: form.status,
      enabled: form.enabled,
      env: form.env,
      description: form.description.trim() || null,
      supported_payment_method_keys: form.category === "payments" ? form.supported_payment_method_keys : []
    };

    const outcome = commandOutcome(await supabase.rpc("admin_save_integration", {
      p_integration_id: isEdit ? form.id : null,
      p_values: values,
      p_reason: formReason.trim(),
      p_expected_updated_at: isEdit ? formUpdatedAt : null,
    }));
    setSaving(false);
    if (!outcome.ok) {
      setError(describeConsoleError(outcome.error, lang));
      return;
    }
    const saved = normalizeIntegration(outcome.data.integration as Integration);
    setItems((prev) => (isEdit ? prev.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...prev.filter((item) => item.key !== saved.key)]));
    setModalOpen(false);
    flash(!outcome.changed ? unchangedText(lang) : isEdit ? xt.updated : xt.created);
  };

  const renderStateDialog = () => {
    if (!pending) return null;
    const { item, changes } = pending;
    const ar = lang === "ar";
    let title = xt.statusTitle;
    let intro = xt.statusIntro;
    let confirmLabel = ar ? "حفظ" : "Save";
    let danger = false;
    if ("enabled" in changes) {
      title = changes.enabled ? xt.enableTitle : xt.disableTitle;
      intro = changes.enabled ? xt.enableIntro : xt.disableIntro;
      confirmLabel = changes.enabled ? (ar ? "تفعيل" : "Enable") : (ar ? "تعطيل" : "Disable");
      danger = !changes.enabled;
    } else if ("env" in changes) {
      title = xt.envTitle;
      intro = changes.env === "live" ? xt.envIntroLive : xt.envIntroTest;
      confirmLabel = changes.env === "live" ? t.live : t.test;
      danger = changes.env === "live";
    }
    const facts = [{ label: ar ? "التكامل" : "Integration", value: `${item.name} (${item.key})` }];
    if ("env" in changes) facts.push({ label: xt.envLabel, value: `${item.env === "live" ? t.live : t.test} → ${changes.env === "live" ? t.live : t.test}` });
    if ("status" in changes) facts.push({ label: xt.status, value: `${item.status === "connected" ? t.connected : t.disconnected} → ${changes.status === "connected" ? t.connected : t.disconnected}` });
    return (
      <CommandDialog
        locale={lang}
        tone={danger ? "danger" : "default"}
        title={title}
        intro={intro}
        facts={facts}
        reasonLabel={xt.reasonLabel}
        confirmLabel={confirmLabel}
        onConfirm={runStateChange}
        onClose={() => setPending(null)}
      />
    );
  };

  const filteredItems = items.filter((item) => {
    const needle = search.trim().toLowerCase();
    const inSection = sectionFilter === "all" || item.category === sectionFilter;
    const haystack = [item.name, item.key, item.category, item.base_url, item.platform_area, item.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return inSection && (!needle || haystack.includes(needle));
  });

  const stats = [
    { label: xt.activeCount, value: items.filter((item) => item.enabled).length },
    { label: xt.configuredCount, value: items.filter((item) => item.key_masked).length },
    { label: xt.liveCount, value: items.filter((item) => item.env === "live").length },
    { label: xt.sectionCount, value: new Set(items.map((item) => item.category)).size }
  ];

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, list: filteredItems.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {renderStateDialog()}
      <div className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${isRTL ? "lg:flex-row-reverse" : ""}`}>
        <div>
          <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1 max-w-2xl">{t.subtitle}</p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center rounded-2xl bg-[#111827] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(17,24,39,0.18)] transition hover:bg-[#D1AF47] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]"
          >
            + {xt.addApi}
          </button>
        )}
      </div>

      {note && <div role="status" className="rounded-xl border border-[#D1FADF] bg-[#ECFDF3] px-4 py-3 text-xs font-bold text-[#027A48]">{note}</div>}
      {error && !modalOpen && <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs font-bold text-[#B42318]">{error}</div>}

      {loadError ? (
        <ReadFailure error={loadError} locale={lang} what={xt.what} onRetry={() => setReloadKey((n) => n + 1)} />
      ) : (
      <>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#E7D8A2]/70 bg-white/80 p-4 shadow-[0_12px_32px_rgba(17,24,39,0.04)]">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6B5A1E]">{stat.label}</p>
            <strong className="mt-2 block text-2xl font-serif font-black text-[#111827]">{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className={`flex flex-col gap-3 rounded-[24px] border border-[#ECECEC] bg-white/85 p-3 shadow-[0_12px_36px_rgba(17,24,39,0.04)] lg:flex-row lg:items-center ${isRTL ? "lg:flex-row-reverse" : ""}`}>
        <input
          type="search"
          aria-label={xt.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={xt.search}
          className="min-h-11 flex-1 rounded-2xl border border-[#ECECEC] bg-[#F8F8F7] px-4 text-sm font-semibold text-gray-800 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] transition focus:border-[#D1AF47] focus:bg-white"
        />
        <select
          aria-label={xt.section}
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
          className="min-h-11 rounded-2xl border border-[#ECECEC] bg-[#F8F8F7] px-4 text-xs font-black uppercase tracking-wider text-gray-700 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] transition focus:border-[#D1AF47] focus:bg-white"
        >
          <option value="all">{xt.allSections}</option>
          {SECTION_OPTIONS.map((section) => (
            <option key={section} value={section}>{catLabel[section] ?? section}</option>
          ))}
        </select>
      </div>

      {!loaded ? (
        <div className={cardBase}><p role="status" className="py-6 text-center text-xs font-semibold text-gray-500">{lang === "ar" ? "جارٍ تحميل التكاملات..." : "Loading integrations..."}</p></div>
      ) : filteredItems.length === 0 ? (
        <div className={cardBase}><p className="py-6 text-center text-xs font-semibold text-gray-500">{items.length > 0 ? t.filteredEmpty : t.empty}</p></div>
      ) : (
        grouped.map(({ cat, list }) => (
          <div key={cat}>
            <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{catLabel[cat] ?? cat}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((item) => (
                <div key={item.id} className={cardBase}>
                  <div className={`flex items-start justify-between gap-3 ${flip}`}>
                    <div className={isRTL ? "text-right" : "text-left"}>
                      <strong className="block text-sm font-black text-gray-900">{item.name}</strong>
                      <span className="mt-1 block font-mono text-[9px] font-bold uppercase tracking-wider text-gray-400">{item.key}</span>
                      <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-black ${
                        item.status === "connected" ? "bg-[#ECFDF3] text-[#16A34A]" : "bg-gray-100 text-gray-500"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${item.status === "connected" ? "bg-[#16A34A]" : "bg-gray-400"}`} />
                        {item.status === "connected" ? t.connected : t.disconnected}
                      </span>
                    </div>
                    {canWrite ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.enabled}
                        onClick={() => askState(item, { enabled: !item.enabled })}
                        aria-label={xt.toggleLabel.replace("{state}", t.enabledLabel).replace("{name}", item.name)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] ${item.enabled ? "bg-[#D1AF47]" : "bg-gray-400"}`}
                      >
                        <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: item.enabled ? "translateX(18px)" : "translateX(2px)" }} />
                      </button>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-gray-700">{item.enabled ? t.enabledLabel : t.disabledLabel}</span>
                    )}
                  </div>

                  <div className="mt-3.5 space-y-1.5 text-[10px] font-semibold text-gray-500">
                    <div className={`flex items-center justify-between ${flip}`}>
                      <span className="uppercase tracking-wider text-gray-400">{t.keys}</span>
                      <code className="rounded bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">{item.key_masked ?? t.noKeys}</code>
                    </div>
                    <div className={`flex items-center justify-between gap-3 ${flip}`}>
                      <span className="uppercase tracking-wider text-gray-400">{xt.baseUrl}</span>
                      <span className="max-w-[62%] truncate font-mono text-[10px]" dir="ltr">{item.base_url || xt.notSet}</span>
                    </div>
                    <div className={`flex items-center justify-between gap-3 ${flip}`}>
                      <span className="uppercase tracking-wider text-gray-400">{xt.platformArea}</span>
                      <span className="max-w-[62%] truncate text-[10px] font-black text-gray-700">{platformLabel(item.platform_area, lang)}</span>
                    </div>
                    <div className={`flex items-center justify-between ${flip}`}>
                      <span className="uppercase tracking-wider text-gray-400">{t.webhook}</span>
                      <span className="max-w-[60%] truncate font-mono text-[10px]" dir="ltr">{item.webhook_url ?? "—"}</span>
                    </div>
                    <div className={`flex items-center justify-between ${flip}`}>
                      <span className="uppercase tracking-wider text-gray-400">{t.lastCheck}</span>
                      <span>{item.last_checked_at ? new Date(item.last_checked_at).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB") : t.never}</span>
                    </div>
                  </div>

                  {canWrite ? (
                    <div role="group" aria-label={`${xt.envLabel}: ${item.name}`} className={`mt-3.5 flex items-center gap-1 rounded-full border border-[#ECECEC] bg-gray-50 p-0.5 w-fit ${flip}`}>
                      {(["test", "live"] as const).map((e) => (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={item.env === e}
                          onClick={() => { if (item.env !== e) askState(item, { env: e }); }}
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase transition focus-visible:outline-2 focus-visible:outline-[#9B7928] ${
                            item.env === e ? (e === "live" ? "bg-[#15803D] text-white" : "bg-white text-gray-900 shadow-sm border border-[#ECECEC]") : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          {e === "test" ? t.test : t.live}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3.5 text-[10px] font-black uppercase text-gray-700">{xt.envLabel}: {item.env === "live" ? t.live : t.test}</p>
                  )}
                  {item.description && <p className="mt-3 line-clamp-2 text-[11px] font-semibold leading-relaxed text-gray-500">{item.description}</p>}
                  {item.category === "payments" && (
                    <div className={`mt-3 flex flex-wrap gap-1.5 ${isRTL ? "justify-end" : "justify-start"}`}>
                      {(item.supported_payment_method_keys?.length ? item.supported_payment_method_keys : defaultPaymentMethodSupport(item.key)).map((methodKey) => {
                        const method = PAYMENT_METHOD_OPTIONS.find((option) => option.key === methodKey);
                        return (
                          <span key={methodKey} className="rounded-full border border-[#D1AF47]/25 bg-[#FFFAEB] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#6B5A1E]">
                            {method?.label || methodKey}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {canWrite && (
                  <div className={`mt-4 flex flex-wrap items-center gap-2 ${isRTL ? "justify-end" : "justify-start"}`}>
                    <button
                      type="button"
                      onClick={() => askState(item, { status: item.status === "connected" ? "disconnected" : "connected" })}
                      aria-label={`${xt.status}: ${item.status === "connected" ? t.disconnected : t.connected} — ${item.name}`}
                      className="rounded-xl border border-[#D1AF47]/30 bg-[#FFF8E1] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#6B5A1E] transition hover:border-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                    >
                      {item.status === "connected" ? t.disconnected : t.connected}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      aria-label={`${xt.edit}: ${item.name}`}
                      className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 transition hover:border-[#D1AF47] hover:text-[#6B5A1E] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                    >
                      {xt.edit}
                    </button>
                    {item.enabled && (
                      <button
                        type="button"
                        onClick={() => askState(item, { enabled: false })}
                        aria-label={`${xt.delete}: ${item.name}`}
                        className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#B42318] transition hover:bg-[#FEE4E2] focus-visible:outline-2 focus-visible:outline-[#9B7928]"
                      >
                        {xt.delete}
                      </button>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      </>
      )}

      {modalOpen && canWrite && (
        <ModalPortal>
        <ModalOverlay onClose={() => { if (!saving) setModalOpen(false); }} canClose={!saving} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="integration-dialog-title"
            onSubmit={saveIntegration}
            noValidate
            dir={isRTL ? "rtl" : "ltr"}
            style={{ maxHeight: "calc(100dvh - 2rem)" }}
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-[#E7D8A2] bg-[#FDFBF7] shadow-[0_30px_80px_rgba(17,24,39,0.28)]"
          >
            <div className={`flex shrink-0 items-start justify-between gap-4 border-b border-[#E7D8A2]/60 px-5 pb-4 pt-5 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B5A1E]">{xt.section}</p>
                <h3 id="integration-dialog-title" className="mt-1 text-2xl font-serif font-black text-gray-950">{form.id ? xt.update : xt.addApi}</h3>
                <p className="mt-1 max-w-xl text-xs font-semibold text-gray-600">{xt.keyHint}</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} aria-label={xt.cancel} className="rounded-full border border-[#ECECEC] bg-white px-3 py-2 text-xs font-black text-gray-600 focus-visible:outline-2 focus-visible:outline-[#9B7928]">×</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error && <div role="alert" className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs font-bold text-[#B42318]">{error}</div>}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.apiName}</span>
                <input data-autofocus value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value, key: prev.id ? prev.key : slugifyKey(event.target.value) }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-bold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.keyId}</span>
                <input value={form.key} readOnly={Boolean(form.id)} aria-describedby={form.id ? "integration-key-fixed" : undefined} onChange={(event) => setForm((prev) => (prev.id ? prev : { ...prev, key: slugifyKey(event.target.value) }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47] read-only:bg-gray-50" dir="ltr" />
                {form.id && <span id="integration-key-fixed" className="block text-[11px] font-semibold text-gray-600">{xt.keyFixed}</span>}
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.baseUrl}</span>
                <input value={form.base_url} onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))} placeholder="https://api.example.com" className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.keyHintLabel}</span>
                <input value={form.key_masked} maxLength={16} placeholder="••••1234" onChange={(event) => setForm((prev) => ({ ...prev, key_masked: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.section}</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    category: event.target.value,
                    supported_payment_method_keys: event.target.value === "payments" && prev.supported_payment_method_keys.length === 0
                      ? defaultPaymentMethodSupport(prev.key)
                      : prev.supported_payment_method_keys
                  }))}
                  className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]"
                >
                  {SECTION_OPTIONS.map((section) => <option key={section} value={section}>{catLabel[section] ?? section}</option>)}
                </select>
              </label>
              {form.category === "payments" && (
                <fieldset className="space-y-2 md:col-span-2">
                  <legend className="text-[10px] font-black uppercase tracking-wider text-gray-600">{lang === "ar" ? "طرق الدفع المدعومة" : "Supported payment methods"}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PAYMENT_METHOD_OPTIONS.map((option) => {
                      const checked = form.supported_payment_method_keys.includes(option.key);
                      return (
                        <label key={option.key} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${checked ? "border-[#D1AF47] bg-[#FFFAEB] text-[#6B5A1E]" : "border-[#ECECEC] bg-white text-gray-600"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => setForm((prev) => ({
                              ...prev,
                              supported_payment_method_keys: event.target.checked
                                ? Array.from(new Set([...prev.supported_payment_method_keys, option.key]))
                                : prev.supported_payment_method_keys.filter((key) => key !== option.key)
                            }))}
                            className="h-3.5 w-3.5 accent-[#D1AF47]"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.platformArea}</span>
                <select value={form.platform_area} onChange={(event) => setForm((prev) => ({ ...prev, platform_area: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]">
                  {PLATFORM_AREAS.map((area) => <option key={area} value={area}>{platformLabel(area, lang)}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.status}</span>
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Integration["status"] }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]">
                  <option value="connected">{t.connected}</option>
                  <option value="disconnected">{t.disconnected}</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.envLabel}</span>
                <select value={form.env} onChange={(event) => setForm((prev) => ({ ...prev, env: event.target.value as Integration["env"] }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]">
                  <option value="test">{t.test}</option>
                  <option value="live">{t.live}</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{t.webhook}</span>
                <input value={form.webhook_url} onChange={(event) => setForm((prev) => ({ ...prev, webhook_url: event.target.value }))} placeholder="/functions/v1/example-webhook" className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.description}</span>
                <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} className="w-full resize-none rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
              <label className={`flex items-center gap-3 text-xs font-black text-gray-700 md:col-span-2 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} className="h-4 w-4 accent-[#D1AF47]" />
                {t.enabledLabel}
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-600">{xt.reasonLabel}</span>
                <textarea value={formReason} onChange={(event) => setFormReason(event.target.value)} rows={2} className="w-full resize-none rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] focus:border-[#D1AF47]" />
              </label>
            </div>
            </div>

            <div className={`flex shrink-0 justify-end gap-2 border-t border-[#E7D8A2]/60 bg-[#FDFBF7] px-5 py-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-2xl border border-[#ECECEC] bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-700 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{xt.cancel}</button>
              <button type="submit" aria-disabled={saving} className="rounded-2xl bg-[#D1AF47] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#111827] shadow-[0_14px_28px_rgba(209,175,71,0.28)] aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-[#9B7928]">{saving ? "..." : form.id ? xt.update : xt.save}</button>
            </div>
          </form>
        </ModalOverlay>
        </ModalPortal>
      )}
    </div>
  );
}
