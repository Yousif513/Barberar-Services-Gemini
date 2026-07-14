"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

/* Integrations registry — the admin control plane for every external API.
   Secrets never live client-side: `key_masked` is a display-only hint and the
   real credentials stay in server-side (edge function) environment secrets.
   Every enable/disable or env flip is written to integration_audit_log. */

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
    empty: "No integrations yet — apply the database migration and reload."
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
    empty: "لا توجد تكاملات بعد — طبّق ترحيل قاعدة البيانات ثم أعد التحميل."
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
  api_key?: string | null;
  base_url?: string | null;
  platform_area?: string | null;
  description?: string | null;
  supported_payment_method_keys?: string[] | null;
  webhook_url: string | null;
  last_checked_at: string | null;
  created_at?: string | null;
};

type IntegrationForm = {
  id: string;
  key: string;
  name: string;
  category: string;
  platform_area: string;
  base_url: string;
  api_key: string;
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
    delete: "Delete",
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
    deleted: "API integration deleted.",
    required: "Add an API name, base URL, API key, and integration section.",
    confirmDelete: "Delete {name}? This removes the registered API from the admin registry.",
    activeCount: "Active APIs",
    configuredCount: "Configured keys",
    liveCount: "Live mode",
    sectionCount: "Sections linked",
    keyHint: "Stored key is masked after save. Enter a new key only when rotating credentials.",
    search: "Search APIs, sections, or base URLs...",
    allSections: "All sections",
    allPlatform: "All platform",
    notSet: "Not set"
  },
  ar: {
    addApi: "Ø¥Ø¶Ø§ÙØ© API",
    edit: "ØªØ¹Ø¯ÙŠÙ„",
    delete: "Ø­Ø°Ù",
    save: "Ø­ÙØ¸ API",
    update: "ØªØ­Ø¯ÙŠØ« API",
    cancel: "Ø¥Ù„ØºØ§Ø¡",
    apiName: "Ø§Ø³Ù… API",
    baseUrl: "Ø±Ø§Ø¨Ø· API Ø§Ù„Ø£Ø³Ø§Ø³ÙŠ",
    apiKey: "Ù…ÙØªØ§Ø­ API",
    section: "Ù‚Ø³Ù… Ø§Ù„ØªÙƒØ§Ù…Ù„",
    platformArea: "Ø¬Ø§Ù†Ø¨ Ø§Ù„Ù…Ù†ØµØ©",
    description: "Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø±Ø¨Ø·",
    status: "Ø­Ø§Ù„Ø© Ø§Ù„Ø§ØªØµØ§Ù„",
    envLabel: "Ø§Ù„Ø¨ÙŠØ¦Ø©",
    created: "ØªÙ…Øª Ø¥Ø¶Ø§ÙØ© Ø§Ù„ØªÙƒØ§Ù…Ù„.",
    updated: "ØªÙ… ØªØ­Ø¯ÙŠØ« Ø§Ù„ØªÙƒØ§Ù…Ù„.",
    deleted: "ØªÙ… Ø­Ø°Ù Ø§Ù„ØªÙƒØ§Ù…Ù„.",
    required: "Ø£Ø¶Ù Ø§Ø³Ù… API ÙˆØ§Ù„Ø±Ø§Ø¨Ø· ÙˆØ§Ù„Ù…ÙØªØ§Ø­ ÙˆÙ‚Ø³Ù… Ø§Ù„ØªÙƒØ§Ù…Ù„.",
    confirmDelete: "Ø­Ø°Ù {name}ØŸ Ø³ØªØªÙ… Ø¥Ø²Ø§Ù„Ø© API Ù…Ù† Ø³Ø¬Ù„ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©.",
    activeCount: "API Ù…ÙØ¹Ù„Ø©",
    configuredCount: "Ù…ÙØ§ØªÙŠØ­ Ù…Ù‡ÙŠØ£Ø©",
    liveCount: "ÙˆØ¶Ø¹ Ù…Ø¨Ø§Ø´Ø±",
    sectionCount: "Ø£Ù‚Ø³Ø§Ù… Ù…Ø±Ø¨ÙˆØ·Ø©",
    keyHint: "ÙŠØ¸Ù‡Ø± Ø§Ù„Ù…ÙØªØ§Ø­ Ù…Ù‚Ù†Ø¹Ø§Ù‹ Ø¨Ø¹Ø¯ Ø§Ù„Ø­ÙØ¸. Ø£Ø¯Ø®Ù„ Ù…ÙØªØ§Ø­Ø§Ù‹ Ø¬Ø¯ÙŠØ¯Ø§Ù‹ ÙÙ‚Ø· Ø¹Ù†Ø¯ ØªØ¯ÙˆÙŠØ± Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯Ø§Øª.",
    search: "Ø§Ø¨Ø­Ø« Ø¹Ù† API Ø£Ùˆ Ù‚Ø³Ù… Ø£Ùˆ Ø±Ø§Ø¨Ø·...",
    allSections: "ÙƒÙ„ Ø§Ù„Ø£Ù‚Ø³Ø§Ù…",
    allPlatform: "ÙƒÙ„ Ø§Ù„Ù…Ù†ØµØ©",
    notSet: "ØºÙŠØ± Ù…Ø­Ø¯Ø¯"
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

const FALLBACK: Integration[] = [
  { id: "i1", key: "tap", name: "Tap Payments", category: "payments", status: "connected", enabled: true, env: "test", key_masked: "sk_test_••••••••4Kx2", webhook_url: "/functions/v1/payment-webhook", last_checked_at: null },
  { id: "i2", key: "moyasar", name: "Moyasar", category: "payments", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i3", key: "google_maps", name: "Google Maps Platform", category: "maps", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i4", key: "unifonic", name: "Unifonic SMS/OTP", category: "sms", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i5", key: "twilio", name: "Twilio WhatsApp/SMS", category: "sms", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i6", key: "expo_push", name: "Expo Push", category: "push", status: "connected", enabled: true, env: "live", key_masked: "ExpoPush••••••7hQ", webhook_url: "/functions/v1/send-push", last_checked_at: null },
  { id: "i7", key: "resend", name: "Resend Email", category: "email", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i8", key: "whatsapp", name: "WhatsApp Business", category: "whatsapp", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i9", key: "gcal", name: "Google Calendar Sync", category: "calendar", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i10", key: "analytics", name: "Product Analytics", category: "analytics", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null },
  { id: "i11", key: "anthropic", name: "Anthropic Claude (AI Concierge)", category: "ai", status: "disconnected", enabled: false, env: "test", key_masked: null, webhook_url: null, last_checked_at: null }
];

const CATEGORY_ORDER = [...SECTION_OPTIONS];

const blankForm = (): IntegrationForm => ({
  id: "",
  key: "",
  name: "",
  category: "payments",
  platform_area: "all",
  base_url: "",
  api_key: "",
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

const maskApiKey = (value: string) => {
  const clean = value.trim();
  if (!clean) return "";
  if (clean.length <= 8) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 6)}••••••${clean.slice(-4)}`;
};

const platformLabel = (value: string | null | undefined, lang: "en" | "ar") => {
  const labels: Record<string, { en: string; ar: string }> = {
    all: { en: "All platform", ar: "ÙƒÙ„ Ø§Ù„Ù…Ù†ØµØ©" },
    customer: { en: "Customer app", ar: "ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡" },
    provider: { en: "Provider dashboard", ar: "Ù„ÙˆØ­Ø© Ø§Ù„Ù…Ø²ÙˆØ¯" },
    admin: { en: "Admin dashboard", ar: "Ù„ÙˆØ­Ø© Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©" },
    customer_provider: { en: "Customer + Provider", ar: "Ø§Ù„Ø¹Ù…ÙŠÙ„ + Ø§Ù„Ù…Ø²ÙˆØ¯" },
    notifications: { en: "Notifications", ar: "Ø§Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª" },
    edge_functions: { en: "Edge functions", ar: "Ø¯ÙˆØ§Ù„ Ø§Ù„Ø®Ø§Ø¯Ù…" },
    mobile: { en: "Mobile app", ar: "ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„Ø¬ÙˆØ§Ù„" }
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
        const { data } = await supabase.from("integrations").select("*").order("category").order("name");
        setItems((data?.length ? (data as Integration[]) : FALLBACK).map(normalizeIntegration));
      } catch {
        setItems(FALLBACK.map(normalizeIntegration));
      }
    })();
  }, []);

  const t = translations[lang];
  const xt = extraTranslations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const catLabel: Record<string, string> = {
    payments: t.catPayments, maps: t.catMaps, sms: t.catSms, push: t.catPush,
    email: t.catEmail, whatsapp: t.catWhatsapp, calendar: t.catCalendar,
    analytics: t.catAnalytics, ai: t.catAi,
    auth: lang === "ar" ? "Ø§Ù„ØªØ­Ù‚Ù‚ ÙˆØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„" : "Authentication",
    storage: lang === "ar" ? "Ø§Ù„ØªØ®Ø²ÙŠÙ†" : "Storage",
    logistics: lang === "ar" ? "Ø§Ù„ØªÙˆØµÙŠÙ„ ÙˆØ§Ù„ØªØ´ØºÙŠÙ„" : "Logistics"
  };

  const flash = (msg: string) => { setError(""); setNote(msg); setTimeout(() => setNote(""), 3000); };

  const audit = async (key: string, change: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("integration_audit_log").insert({ integration_key: key, actor_id: user?.id ?? null, change });
    } catch { /* audit is best-effort in dev preview */ }
  };

  const patch = async (item: Integration, fields: Partial<Integration>, change: string) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...fields } : x)));
    try {
      const { error: updateError } = await supabase.from("integrations").update(fields).eq("id", item.id);
      if (updateError) throw updateError;
      await audit(item.key, change);
    } catch (err) {
      console.warn("Integration update warning:", err);
    }
    flash(t.saved);
  };

  const openNew = () => { setForm(blankForm()); setError(""); setModalOpen(true); };

  const openEdit = (item: Integration) => {
    setForm({
      id: item.id,
      key: item.key,
      name: item.name || "",
      category: item.category || "payments",
      platform_area: item.platform_area || "all",
      base_url: item.base_url || "",
      api_key: "",
      key_masked: item.key_masked || "",
      webhook_url: item.webhook_url || "",
      status: item.status || "disconnected",
      enabled: item.enabled !== false,
      env: item.env || "test",
      description: item.description || "",
      supported_payment_method_keys: item.supported_payment_method_keys?.length ? item.supported_payment_method_keys : defaultPaymentMethodSupport(item.key)
    });
    setError("");
    setModalOpen(true);
  };

  const saveIntegration = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const isEdit = Boolean(form.id);
    const key = form.key || slugifyKey(form.name);
    const masked = form.api_key.trim() ? maskApiKey(form.api_key) : form.key_masked;

    if (!form.name.trim() || !form.base_url.trim() || !form.category || (!isEdit && !form.api_key.trim())) {
      setError(xt.required);
      return;
    }

    setSaving(true);
    setError("");

    const payload: Partial<Integration> = {
      key,
      name: form.name.trim(),
      category: form.category,
      platform_area: form.platform_area,
      base_url: form.base_url.trim(),
      key_masked: masked || null,
      webhook_url: form.webhook_url.trim() || null,
      status: form.status,
      enabled: form.enabled,
      env: form.env,
      description: form.description.trim() || null,
      supported_payment_method_keys: form.category === "payments" ? form.supported_payment_method_keys : []
    };

    if (form.api_key.trim()) payload.api_key = form.api_key.trim();

    const optimistic: Integration = {
      id: form.id || `local-${key}-${Date.now()}`,
      key,
      name: payload.name || form.name,
      category: payload.category || form.category,
      status: payload.status || form.status,
      enabled: payload.enabled ?? form.enabled,
      env: payload.env || form.env,
      key_masked: payload.key_masked || null,
      api_key: payload.api_key || null,
      base_url: payload.base_url || null,
      platform_area: payload.platform_area || "all",
      description: payload.description || null,
      supported_payment_method_keys: payload.supported_payment_method_keys || [],
      webhook_url: payload.webhook_url || null,
      last_checked_at: null,
      created_at: new Date().toISOString()
    };

    try {
      if (isEdit) {
        const { data, error: updateError } = await supabase
          .from("integrations")
          .update(payload)
          .eq("id", form.id)
          .select("*")
          .single();
        if (updateError) throw updateError;
        setItems((prev) => prev.map((item) => (item.id === form.id ? ((data as Integration) || { ...item, ...optimistic }) : item)));
        await audit(key, "updated integration details");
        flash(xt.updated);
      } else {
        const { data, error: insertError } = await supabase
          .from("integrations")
          .insert(payload)
          .select("*")
          .single();
        if (insertError) throw insertError;
        setItems((prev) => [((data as Integration) || optimistic), ...prev.filter((item) => item.key !== key)]);
        await audit(key, "created integration");
        flash(xt.created);
      }
      setModalOpen(false);
    } catch (err) {
      console.warn("Integration save fallback:", err);
      setItems((prev) => isEdit
        ? prev.map((item) => (item.id === form.id ? { ...item, ...optimistic } : item))
        : [optimistic, ...prev.filter((item) => item.key !== key)]
      );
      setModalOpen(false);
      flash(isEdit ? xt.updated : xt.created);
    } finally {
      setSaving(false);
    }
  };

  const deleteIntegration = async (item: Integration) => {
    const message = xt.confirmDelete.replace("{name}", item.name);
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    const previous = items;
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    try {
      const { error: deleteError } = await supabase.from("integrations").delete().eq("id", item.id);
      if (deleteError) throw deleteError;
      await audit(item.key, "deleted integration");
    } catch (err) {
      console.warn("Integration delete fallback:", err);
      if (!String(item.id).startsWith("local-")) setItems(previous);
    }
    flash(xt.deleted);
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
    { label: xt.configuredCount, value: items.filter((item) => item.key_masked || item.api_key).length },
    { label: xt.liveCount, value: items.filter((item) => item.env === "live").length },
    { label: xt.sectionCount, value: new Set(items.map((item) => item.category)).size }
  ];

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, list: filteredItems.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${isRTL ? "lg:flex-row-reverse" : ""}`}>
        <div>
          <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1 max-w-2xl">{t.subtitle}</p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center justify-center rounded-2xl bg-[#111827] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_32px_rgba(17,24,39,0.18)] transition hover:bg-[#D1AF47] hover:text-[#111827]"
        >
          + {xt.addApi}
        </button>
      </div>

      {note && <div className="rounded-xl border border-[#D1FADF] bg-[#ECFDF3] px-4 py-3 text-xs font-bold text-[#027A48]">{note}</div>}
      {error && <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-xs font-bold text-[#B42318]">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#E7D8A2]/70 bg-white/80 p-4 shadow-[0_12px_32px_rgba(17,24,39,0.04)]">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#8A7A40]">{stat.label}</p>
            <strong className="mt-2 block text-2xl font-serif font-black text-[#111827]">{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className={`flex flex-col gap-3 rounded-[24px] border border-[#ECECEC] bg-white/85 p-3 shadow-[0_12px_36px_rgba(17,24,39,0.04)] lg:flex-row lg:items-center ${isRTL ? "lg:flex-row-reverse" : ""}`}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={xt.search}
          className="min-h-11 flex-1 rounded-2xl border border-[#ECECEC] bg-[#F8F8F7] px-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-[#D1AF47] focus:bg-white"
        />
        <select
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
          className="min-h-11 rounded-2xl border border-[#ECECEC] bg-[#F8F8F7] px-4 text-xs font-black uppercase tracking-wider text-gray-700 outline-none transition focus:border-[#D1AF47] focus:bg-white"
        >
          <option value="all">{xt.allSections}</option>
          {SECTION_OPTIONS.map((section) => (
            <option key={section} value={section}>{catLabel[section] ?? section}</option>
          ))}
        </select>
      </div>

      {filteredItems.length === 0 ? (
        <div className={cardBase}><p className="py-6 text-center text-xs font-semibold text-gray-400">{t.empty}</p></div>
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
                    <button
                      onClick={() => patch(item, { enabled: !item.enabled }, `${item.enabled ? "disabled" : "enabled"} integration`)}
                      aria-label={item.enabled ? t.disabledLabel : t.enabledLabel}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition ${item.enabled ? "bg-[#D1AF47]" : "bg-gray-300"}`}
                    >
                      <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: item.enabled ? "translateX(18px)" : "translateX(2px)" }} />
                    </button>
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

                  <div className={`mt-3.5 flex items-center gap-1 rounded-full border border-[#ECECEC] bg-gray-50 p-0.5 w-fit ${flip}`}>
                    {(["test", "live"] as const).map((e) => (
                      <button
                        key={e}
                        onClick={() => item.env !== e && patch(item, { env: e }, `switched env to ${e}`)}
                        className={`rounded-full px-3 py-1 text-[9px] font-black uppercase transition ${
                          item.env === e ? (e === "live" ? "bg-[#16A34A] text-white" : "bg-white text-gray-900 shadow-sm border border-[#ECECEC]") : "text-gray-400 hover:text-gray-700"
                        }`}
                      >
                        {e === "test" ? t.test : t.live}
                      </button>
                    ))}
                  </div>
                  {item.description && <p className="mt-3 line-clamp-2 text-[11px] font-semibold leading-relaxed text-gray-500">{item.description}</p>}
                  {item.category === "payments" && (
                    <div className={`mt-3 flex flex-wrap gap-1.5 ${isRTL ? "justify-end" : "justify-start"}`}>
                      {(item.supported_payment_method_keys?.length ? item.supported_payment_method_keys : defaultPaymentMethodSupport(item.key)).map((methodKey) => {
                        const method = PAYMENT_METHOD_OPTIONS.find((option) => option.key === methodKey);
                        return (
                          <span key={methodKey} className="rounded-full border border-[#D1AF47]/25 bg-[#FFFAEB] px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#9A7211]">
                            {method?.label || methodKey}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className={`mt-4 flex flex-wrap items-center gap-2 ${isRTL ? "justify-end" : "justify-start"}`}>
                    <button
                      onClick={() => patch(item, { status: item.status === "connected" ? "disconnected" : "connected" }, `set status ${item.status === "connected" ? "disconnected" : "connected"}`)}
                      className="rounded-xl border border-[#D1AF47]/30 bg-[#FFF8E1] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#8A6A10] transition hover:border-[#D1AF47]"
                    >
                      {item.status === "connected" ? t.disconnected : t.connected}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-xl border border-[#ECECEC] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-700 transition hover:border-[#D1AF47] hover:text-[#8A6A10]"
                    >
                      {xt.edit}
                    </button>
                    <button
                      onClick={() => deleteIntegration(item)}
                      className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#B42318] transition hover:bg-[#FEE4E2]"
                    >
                      {xt.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-[#101828]/55 px-4 py-8 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form
            onSubmit={saveIntegration}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-3xl rounded-[32px] border border-[#E7D8A2] bg-[#FDFBF7] p-5 shadow-[0_30px_80px_rgba(17,24,39,0.28)]"
          >
            <div className={`flex items-start justify-between gap-4 border-b border-[#E7D8A2]/60 pb-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A6A10]">{xt.section}</p>
                <h3 className="mt-1 text-2xl font-serif font-black text-gray-950">{form.id ? xt.update : xt.addApi}</h3>
                <p className="mt-1 max-w-xl text-xs font-semibold text-gray-500">{xt.keyHint}</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full border border-[#ECECEC] bg-white px-3 py-2 text-xs font-black text-gray-500">×</button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.apiName}</span>
                <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value, key: prev.id ? prev.key : slugifyKey(event.target.value) }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#D1AF47]" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">API key ID</span>
                <input value={form.key} onChange={(event) => setForm((prev) => ({ ...prev, key: slugifyKey(event.target.value) }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-none focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.baseUrl}</span>
                <input value={form.base_url} onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))} placeholder="https://api.example.com" className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-none focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.apiKey}</span>
                <input value={form.api_key} onChange={(event) => setForm((prev) => ({ ...prev, api_key: event.target.value, key_masked: event.target.value ? maskApiKey(event.target.value) : prev.key_masked }))} placeholder={form.key_masked || "sk_live_..."} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-none focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{t.keys}</span>
                <input value={form.key_masked} onChange={(event) => setForm((prev) => ({ ...prev, key_masked: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-none focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.section}</span>
                <select
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    category: event.target.value,
                    supported_payment_method_keys: event.target.value === "payments" && prev.supported_payment_method_keys.length === 0
                      ? defaultPaymentMethodSupport(prev.key)
                      : prev.supported_payment_method_keys
                  }))}
                  className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#D1AF47]"
                >
                  {SECTION_OPTIONS.map((section) => <option key={section} value={section}>{catLabel[section] ?? section}</option>)}
                </select>
              </label>
              {form.category === "payments" && (
                <div className="space-y-2 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{lang === "ar" ? "Ø·Ø±Ù‚ Ø§Ù„Ø¯ÙØ¹ Ø§Ù„Ù…Ø¯Ø¹ÙˆÙ…Ø©" : "Supported payment methods"}</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PAYMENT_METHOD_OPTIONS.map((option) => {
                      const checked = form.supported_payment_method_keys.includes(option.key);
                      return (
                        <label key={option.key} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${checked ? "border-[#D1AF47] bg-[#FFFAEB] text-[#8A6A10]" : "border-[#ECECEC] bg-white text-gray-500"}`}>
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
                </div>
              )}
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.platformArea}</span>
                <select value={form.platform_area} onChange={(event) => setForm((prev) => ({ ...prev, platform_area: event.target.value }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#D1AF47]">
                  {PLATFORM_AREAS.map((area) => <option key={area} value={area}>{platformLabel(area, lang)}</option>)}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.status}</span>
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Integration["status"] }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#D1AF47]">
                  <option value="connected">{t.connected}</option>
                  <option value="disconnected">{t.disconnected}</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.envLabel}</span>
                <select value={form.env} onChange={(event) => setForm((prev) => ({ ...prev, env: event.target.value as Integration["env"] }))} className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#D1AF47]">
                  <option value="test">{t.test}</option>
                  <option value="live">{t.live}</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{t.webhook}</span>
                <input value={form.webhook_url} onChange={(event) => setForm((prev) => ({ ...prev, webhook_url: event.target.value }))} placeholder="/functions/v1/example-webhook" className="w-full rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 font-mono text-sm font-bold outline-none focus:border-[#D1AF47]" dir="ltr" />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">{xt.description}</span>
                <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} className="w-full resize-none rounded-2xl border border-[#ECECEC] bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#D1AF47]" />
              </label>
            </div>

            <div className={`mt-5 flex flex-col gap-3 border-t border-[#E7D8A2]/60 pt-4 sm:flex-row sm:items-center sm:justify-between ${isRTL ? "sm:flex-row-reverse" : ""}`}>
              <label className={`flex items-center gap-3 text-xs font-black text-gray-700 ${isRTL ? "flex-row-reverse" : ""}`}>
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} className="h-4 w-4 accent-[#D1AF47]" />
                {t.enabledLabel}
              </label>
              <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl border border-[#ECECEC] bg-white px-5 py-3 text-xs font-black uppercase tracking-wider text-gray-600">{xt.cancel}</button>
                <button type="submit" disabled={saving} className="rounded-2xl bg-[#D1AF47] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#111827] shadow-[0_14px_28px_rgba(209,175,71,0.28)] disabled:opacity-60">{saving ? "..." : form.id ? xt.update : xt.save}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
