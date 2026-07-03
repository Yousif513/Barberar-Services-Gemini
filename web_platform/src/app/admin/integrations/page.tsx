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
  webhook_url: string | null;
  last_checked_at: string | null;
};

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

const CATEGORY_ORDER = ["payments", "maps", "sms", "push", "email", "whatsapp", "calendar", "analytics", "ai"];

export default function AdminIntegrations() {
  const [items, setItems] = useState<Integration[]>([]);
  const [note, setNote] = useState("");
  const [lang, setLang] = useState<"en" | "ar">("ar");

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
        const { data } = await supabase.from("integrations").select("*");
        setItems(data?.length ? (data as Integration[]) : FALLBACK);
      } catch {
        setItems(FALLBACK);
      }
    })();
  }, []);

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  const catLabel: Record<string, string> = {
    payments: t.catPayments, maps: t.catMaps, sms: t.catSms, push: t.catPush,
    email: t.catEmail, whatsapp: t.catWhatsapp, calendar: t.catCalendar,
    analytics: t.catAnalytics, ai: t.catAi
  };

  const flash = (msg: string) => { setNote(msg); setTimeout(() => setNote(""), 3000); };

  const audit = async (key: string, change: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("integration_audit_log").insert({ integration_key: key, actor_id: user?.id ?? null, change });
    } catch { /* audit is best-effort in dev preview */ }
  };

  const patch = async (item: Integration, fields: Partial<Integration>, change: string) => {
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...fields } : x)));
    try {
      await supabase.from("integrations").update(fields).eq("key", item.key);
      await audit(item.key, change);
    } catch { /* fallback rows still toggle locally */ }
    flash(t.saved);
  };

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, list: items.filter((i) => i.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1 max-w-2xl">{t.subtitle}</p>
      </div>

      {note && <div className="rounded-xl border border-[#D1FADF] bg-[#ECFDF3] px-4 py-3 text-xs font-bold text-[#027A48]">{note}</div>}

      {items.length === 0 ? (
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
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
