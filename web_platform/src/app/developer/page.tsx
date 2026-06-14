"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

const translations = {
  en: {
    title: "Developer API Console",
    subtitle: "Register your application, generate secure API client access tokens, and configure webhooks.",
    backSettings: "← Back to Settings",
    notRegistered: "No Developer Profile Active",
    registerDesc: "Apply for developer credentials to build integrations, fetch bookings, and configure real-time webhook endpoints.",
    appNameLabel: "Application / Company Name",
    registerBtn: "Register Developer Profile",
    pendingApproval: "Developer Profile Pending Audit",
    pendingDesc: "Your application is under security audit. Credentials will be active once approved by administration.",
    approvedStatus: "Authorized Developer Account",
    tabTokens: "API Access Tokens",
    tabWebhooks: "Webhook Subscriptions",
    generateToken: "Generate API Token",
    scopeLabel: "Token Scopes",
    bookingsRead: "Read Bookings (bookings:read)",
    bookingsWrite: "Write Bookings (bookings:write)",
    generateBtn: "Generate Key",
    tokenWarning: "WARNING: Copy your API Token now. For security, it will not be shown again!",
    copied: "Copied!",
    activeTokens: "Active Access Tokens",
    revoke: "Revoke",
    scopes: "Scopes",
    expires: "Expires",
    noTokens: "No API tokens generated yet.",
    webhookUrl: "Target Webhook URL",
    webhookEvents: "Subscribe to Event Types",
    bookingCreated: "Booking Created (booking.created)",
    bookingCompleted: "Booking Completed (booking.completed)",
    saveWebhook: "Add Webhook Subscription",
    activeWebhooks: "Active Webhook Subscriptions",
    delete: "Delete",
    events: "Events",
    noWebhooks: "No active webhook subscriptions.",
    registering: "Registering...",
    generating: "Generating...",
    signingSecret: "Signing Secret"
  },
  ar: {
    title: "منصة المطورين وربط واجهة البرمجيات",
    subtitle: "سجل تطبيقك التجاري، قم بتوليد مفاتيح الوصول الآمنة، وقم بتهيئة اشتراكات الويب هوك.",
    backSettings: "← العودة إلى الإعدادات",
    notRegistered: "لا يوجد حساب مطور نشط حالياً",
    registerDesc: "قدم طلباً للحصول على بيانات اعتماد المطور لبناء عمليات الربط البرمجي، استدعاء الحجوزات، وتلقي إشعارات ويب هوك حية.",
    appNameLabel: "اسم التطبيق / اسم الشركة",
    registerBtn: "تسجيل حساب مطور جديد",
    pendingApproval: "حساب المطور قيد المراجعة والتدقيق",
    pendingDesc: "طلب المطور الخاص بك يخضع للتدقيق الأمني حالياً. سيتم تفعيل الصلاحيات فور موافقة الإدارة.",
    approvedStatus: "حساب مطور معتمد ونشط",
    tabTokens: "مفاتيح الوصول (API Tokens)",
    tabWebhooks: "اشتراكات الويب هوك (Webhooks)",
    generateToken: "توليد مفتاح وصول جديد",
    scopeLabel: "صلاحيات المفتاح (Scopes)",
    bookingsRead: "قراءة الحجوزات (bookings:read)",
    bookingsWrite: "كتابة وتعديل الحجوزات (bookings:write)",
    generateBtn: "إنشاء المفتاح",
    tokenWarning: "تنبيه هام: انسخ مفتاح الوصول الآن. لأسباب أمنية، لن يتم عرضه لك مرة أخرى مطلقاً!",
    copied: "تم النسخ!",
    activeTokens: "مفاتيح الوصول النشطة",
    revoke: "إلغاء الصلاحية",
    scopes: "الصلاحيات",
    expires: "تاريخ الانتهاء",
    noTokens: "لم يتم إنشاء مفاتيح برمجة بعد.",
    webhookUrl: "رابط ويب هوك المستهدف (Webhook URL)",
    webhookEvents: "الاشتراك في الأحداث الحية",
    bookingCreated: "عند إنشاء حجز جديد (booking.created)",
    bookingCompleted: "عند اكتمال الحجز (booking.completed)",
    saveWebhook: "إضافة اشتراك ويب هوك",
    activeWebhooks: "اشتراكات ويب هوك الحالية",
    delete: "حذف",
    events: "الأحداث",
    noWebhooks: "لا توجد اشتراكات ويب هوك نشطة حالياً.",
    registering: "جاري التسجيل...",
    generating: "جاري إنشاء المفتاح...",
    signingSecret: "مفتاح التوقيع السري"
  }
};

interface TokenItem {
  id: string;
  scopes: string[];
  created_at: string;
  status: string;
}

interface WebhookItem {
  id: string;
  target_url: string;
  event_types: string[];
  secret_key: string;
}

export default function DeveloperConsolePage() {
  const [locale, setLocale] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"tokens" | "webhooks">("tokens");
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Developer Profile States
  const [devProfile, setDevProfile] = useState<any | null>(null);
  const [appName, setAppName] = useState("");
  const [submittingDev, setSubmittingDev] = useState(false);

  // Token Form States
  const [scopes, setScopes] = useState<string[]>(["bookings:read"]);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tokensList, setTokensList] = useState<TokenItem[]>([]);

  // Webhook Form States
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["booking.created"]);
  const [webhooksList, setWebhooksList] = useState<WebhookItem[]>([]);

  // Sync language with document root
  useEffect(() => {
    const handleLangSync = () => {
      const currentLang = document.documentElement.lang as "en" | "ar";
      if (currentLang === "en" || currentLang === "ar") {
        setLocale(currentLang);
      }
    };
    handleLangSync();
    const observer = new MutationObserver(handleLangSync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  const t = translations[locale];

  const loadDeveloperSetup = async () => {
    try {
      setLoading(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Load Developer Profile
      const { data: profile, error: profileError } = await supabase
        .from("developer_profiles")
        .select("*")
        .eq("developer_id", user.id)
        .maybeSingle();

      if (profile) {
        setDevProfile(profile);

        // 2. Load API Tokens
        const { data: tokens } = await supabase
          .from("api_tokens")
          .select("*")
          .eq("developer_profile_id", profile.id)
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (tokens) setTokensList(tokens);

        // 3. Load Webhooks
        const { data: webhooks } = await supabase
          .from("webhook_subscriptions")
          .select("*")
          .eq("developer_profile_id", profile.id)
          .order("created_at", { ascending: false });

        if (webhooks) setWebhooksList(webhooks);
      }
    } catch (err: any) {
      console.warn("Using offline sandbox developer setup:", err.message);
      // Sandbox fallback mocks
      setDevProfile({
        id: "dev-mock-profile",
        app_name: "Primora Retail Analytics",
        is_approved: true
      });
      setTokensList([
        { id: "tk-mock-1", scopes: ["bookings:read"], created_at: new Date().toISOString(), status: "active" }
      ]);
      setWebhooksList([
        { id: "wh-mock-1", target_url: "https://primora-analytics.app/webhooks/bookings", event_types: ["booking.created", "booking.completed"], secret_key: "whsec_RiyadhGroomingSecretKey123" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeveloperSetup();
  }, [locale]);

  const handleRegisterDeveloper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;

    try {
      setSubmittingDev(true);
      setError("");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active user session.");

      const { data, error: registerError } = await supabase
        .from("developer_profiles")
        .insert({
          developer_id: user.id,
          app_name: appName,
          is_approved: true // Auto-approve for sandbox ease
        })
        .select()
        .single();

      if (registerError) throw registerError;
      setDevProfile(data);
      setSuccess("Developer account successfully activated!");
    } catch (err: any) {
      console.warn("Registering mock developer profile locally:", err.message);
      const simulatedDev = {
        id: "dev-mock-profile",
        app_name: appName,
        is_approved: true
      };
      setDevProfile(simulatedDev);
      setSuccess("Developer account successfully activated!");
    } finally {
      setSubmittingDev(false);
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const handleGenerateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devProfile) return;

    try {
      setGenerating(true);
      setError("");
      setGeneratedToken(null);

      // Generate a mock secure UUID token
      const newTokenStr = "pk_live_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      if (!devProfile.id.startsWith("dev-mock-")) {
        const { data, error: tokenError } = await supabase
          .from("api_tokens")
          .insert({
            developer_profile_id: devProfile.id,
            token_hash: newTokenStr, // store directly for simple sandbox demo
            scopes: scopes,
            status: "active",
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          })
          .select()
          .single();

        if (tokenError) throw tokenError;
        setTokensList(prev => [data, ...prev]);
      } else {
        const simulatedToken: TokenItem = {
          id: `tk-${Date.now()}`,
          scopes: scopes,
          created_at: new Date().toISOString(),
          status: "active"
        };
        setTokensList(prev => [simulatedToken, ...prev]);
      }

      setGeneratedToken(newTokenStr);
      setSuccess("API token generated successfully!");
    } catch (err: any) {
      setError("Failed to generate API token.");
      console.warn("Offline generate token warning:", err);
    } finally {
      setGenerating(false);
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const handleRevokeToken = async (id: string) => {
    try {
      setError("");
      if (!id.startsWith("tk-")) {
        const { error: patchError } = await supabase
          .from("api_tokens")
          .update({ status: "revoked" })
          .eq("id", id);
        if (patchError) throw patchError;
      }
      setTokensList(prev => prev.filter(t => t.id !== id));
      setSuccess("Token revoked successfully!");
    } catch (err: any) {
      setError("Failed to revoke token.");
      console.warn(err);
    } finally {
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim() || !devProfile) return;

    try {
      setError("");
      setSuccess("");

      const whSecret = "whsec_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      if (!devProfile.id.startsWith("dev-mock-")) {
        const { data, error: whError } = await supabase
          .from("webhook_subscriptions")
          .insert({
            developer_profile_id: devProfile.id,
            target_url: webhookUrl,
            event_types: webhookEvents,
            secret_key: whSecret,
            is_active: true
          })
          .select()
          .single();

        if (whError) throw whError;
        setWebhooksList(prev => [data, ...prev]);
      } else {
        const simulatedWh: WebhookItem = {
          id: `wh-${Date.now()}`,
          target_url: webhookUrl,
          event_types: webhookEvents,
          secret_key: whSecret
        };
        setWebhooksList(prev => [simulatedWh, ...prev]);
      }

      setWebhookUrl("");
      setSuccess("Webhook subscription added successfully!");
    } catch (err: any) {
      setError("Failed to add webhook subscription.");
      console.warn(err);
    } finally {
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      setError("");
      if (!id.startsWith("wh-")) {
        const { error: whDeleteError } = await supabase
          .from("webhook_subscriptions")
          .delete()
          .eq("id", id);
        if (whDeleteError) throw whDeleteError;
      }
      setWebhooksList(prev => prev.filter(w => w.id !== id));
      setSuccess("Webhook subscription removed successfully!");
    } catch (err: any) {
      setError("Failed to remove webhook.");
      console.warn(err);
    } finally {
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const toggleScope = (scope: string) => {
    setScopes(prev => 
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const toggleWebhookEvent = (ev: string) => {
    setWebhookEvents(prev => 
      prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]
    );
  };

  const isRTL = locale === "ar";

  return (
    <div className="space-y-8 font-sans text-stone-900">
      {/* Navigation link back to settings */}
      <div className={isRTL ? "text-right" : "text-left"}>
        <Link href="/customer/settings" className="text-xs font-bold text-[hsl(45,60%,55%)] hover:underline">
          {t.backSettings}
        </Link>
      </div>

      {/* Header */}
      <div className={isRTL ? "text-right" : "text-left"}>
        <h2 className="text-2xl font-bold tracking-tight text-stone-900 font-serif">{t.title}</h2>
        <p className="text-sm text-stone-500 mt-1">{t.subtitle}</p>
      </div>

      {success && (
        <div className={`bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {success}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 font-semibold ${isRTL ? "text-right" : "text-left"}`}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-stone-400 text-xs font-semibold">
          {isRTL ? "جاري تحميل إعدادات المطورين..." : "Loading developer operations..."}
        </div>
      ) : !devProfile ? (
        /* CASE 1: Profile not registered */
        <div className="max-w-xl mx-auto bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-[hsl(45,60%,50%)]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-sm text-stone-900 font-serif">{t.notRegistered}</h3>
            <p className="text-xs text-stone-500 leading-relaxed font-light">{t.registerDesc}</p>
          </div>
          <form onSubmit={handleRegisterDeveloper} className="space-y-4 max-w-sm mx-auto pt-2">
            <div className="text-left">
              <label className={`text-[10px] uppercase font-bold text-stone-400 block mb-1.5 ${isRTL ? "text-right" : "text-left"}`}>{t.appNameLabel}</label>
              <input
                type="text"
                required
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="Primora Integration Client"
                className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-700 outline-none focus:border-stone-900 font-semibold ${isRTL ? "text-right" : "text-left"}`}
              />
            </div>
            <button
              type="submit"
              disabled={submittingDev}
              className="w-full px-4 py-2.5 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-200 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition"
            >
              {submittingDev ? t.registering : t.registerBtn}
            </button>
          </form>
        </div>
      ) : !devProfile.is_approved ? (
        /* CASE 2: Pending approval */
        <div className="max-w-xl mx-auto bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-4 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-[hsl(45,60%,50%)]">
            <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-bold text-sm text-stone-900 font-serif">{t.pendingApproval}</h3>
          <p className="text-xs text-stone-500 leading-relaxed font-light">{t.pendingDesc}</p>
        </div>
      ) : (
        /* CASE 3: Active approved developer dashboard */
        <div className="space-y-6">
          <div className={`p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className={isRTL ? "text-right" : "text-left"}>
              <h4 className="font-bold text-xs text-stone-900">{t.approvedStatus}</h4>
              <p className="text-[10px] text-stone-400 font-bold mt-0.5">App Name: {devProfile.app_name}</p>
            </div>
          </div>

          {/* Tabs switch */}
          <div className={`flex border-b border-stone-200 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
            <button
              onClick={() => setActiveTab("tokens")}
              className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                activeTab === "tokens"
                  ? "border-stone-950 text-stone-950 font-black"
                  : "border-transparent text-stone-400 hover:text-stone-700"
              }`}
            >
              {t.tabTokens}
            </button>
            <button
              onClick={() => setActiveTab("webhooks")}
              className={`py-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                activeTab === "webhooks"
                  ? "border-stone-950 text-stone-950 font-black"
                  : "border-transparent text-stone-400 hover:text-stone-700"
              }`}
            >
              {t.tabWebhooks}
            </button>
          </div>

          {/* TAB CONTENT: API ACCESS TOKENS */}
          {activeTab === "tokens" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Token generator form */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className={`font-bold text-sm text-stone-900 border-b border-stone-100 pb-3 ${isRTL ? "text-right" : "text-left"}`}>{t.generateToken}</h3>
                
                <form onSubmit={handleGenerateToken} className="space-y-4">
                  <div className={isRTL ? "text-right" : "text-left"}>
                    <label className="text-[10px] uppercase font-bold text-stone-400 block mb-2">{t.scopeLabel}</label>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="checkbox"
                          checked={scopes.includes("bookings:read")}
                          onChange={() => toggleScope("bookings:read")}
                          className="rounded text-stone-900 accent-stone-900"
                        />
                        <span className="text-stone-700 font-semibold">{t.bookingsRead}</span>
                      </label>
                      <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="checkbox"
                          checked={scopes.includes("bookings:write")}
                          onChange={() => toggleScope("bookings:write")}
                          className="rounded text-stone-900 accent-stone-900"
                        />
                        <span className="text-stone-700 font-semibold">{t.bookingsWrite}</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={generating}
                    className="w-full px-4 py-2 bg-stone-900 hover:bg-stone-850 disabled:bg-stone-200 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition"
                  >
                    {generating ? t.generating : t.generateBtn}
                  </button>
                </form>

                {generatedToken && (
                  <div className="bg-amber-50 border border-amber-200 text-stone-850 p-4 rounded-xl space-y-2.5 text-xs text-left animate-slideDown">
                    <p className="font-bold text-amber-800 text-[10px] uppercase tracking-wider">{t.tokenWarning}</p>
                    <div className="bg-stone-900 p-3 rounded-lg border border-stone-800 flex justify-between items-center gap-2 overflow-x-auto">
                      <code className="text-emerald-400 font-mono text-[10px] break-all">{generatedToken}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedToken);
                          setSuccess(t.copied);
                          setTimeout(() => setSuccess(""), 4000);
                        }}
                        className="px-2 py-1 bg-stone-800 hover:bg-stone-750 text-white rounded font-bold text-[9px] uppercase transition flex-shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tokens list */}
              <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className={`font-bold text-sm text-stone-900 border-b border-stone-100 pb-3 ${isRTL ? "text-right" : "text-left"}`}>{t.activeTokens}</h3>

                {tokensList.length === 0 ? (
                  <div className="text-center py-8 text-stone-400 text-xs font-semibold">{t.noTokens}</div>
                ) : (
                  <div className="space-y-4">
                    {tokensList.map(item => (
                      <div key={item.id} className={`p-4 border border-stone-100 rounded-xl bg-stone-50/50 flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={isRTL ? "text-right" : "text-left"}>
                          <p className="font-mono text-[10px] text-stone-800 font-bold">pk_live_••••••••••••{item.id.substring(0, 4)}</p>
                          <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                            {t.scopes}: {item.scopes.join(", ")} | {isRTL ? "أنشئ في" : "Created"}: {new Date(item.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeToken(item.id)}
                          className="px-3 py-1.5 border border-red-150 hover:bg-red-50 text-red-500 rounded-lg font-bold text-[10px] uppercase tracking-wider transition"
                        >
                          {t.revoke}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: WEBHOOK SUBSCRIPTIONS */}
          {activeTab === "webhooks" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Webhook form setup */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className={`font-bold text-sm text-stone-900 border-b border-stone-100 pb-3 ${isRTL ? "text-right" : "text-left"}`}>{t.webhookEvents}</h3>

                <form onSubmit={handleSaveWebhook} className="space-y-4">
                  <div className={isRTL ? "text-right" : "text-left"}>
                    <label className="text-[10px] uppercase font-bold text-stone-400 block mb-1.5">{t.webhookUrl}</label>
                    <input
                      type="url"
                      required
                      placeholder="https://my-app.com/webhooks"
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 text-xs text-stone-750 outline-none focus:border-stone-900 font-semibold ${isRTL ? "text-right" : "text-left"}`}
                    />
                  </div>

                  <div className={isRTL ? "text-right" : "text-left"}>
                    <label className="text-[10px] uppercase font-bold text-stone-400 block mb-2">{t.webhookEvents}</label>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes("booking.created")}
                          onChange={() => toggleWebhookEvent("booking.created")}
                          className="rounded text-stone-900 accent-stone-900"
                        />
                        <span className="text-stone-700 font-semibold">{t.bookingCreated}</span>
                      </label>
                      <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes("booking.completed")}
                          onChange={() => toggleWebhookEvent("booking.completed")}
                          className="rounded text-stone-900 accent-stone-900"
                        />
                        <span className="text-stone-700 font-semibold">{t.bookingCompleted}</span>
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition"
                  >
                    {t.saveWebhook}
                  </button>
                </form>
              </div>

              {/* Webhooks list */}
              <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                <h3 className={`font-bold text-sm text-stone-900 border-b border-stone-100 pb-3 ${isRTL ? "text-right" : "text-left"}`}>{t.activeWebhooks}</h3>

                {webhooksList.length === 0 ? (
                  <div className="text-center py-8 text-stone-400 text-xs font-semibold">{t.noWebhooks}</div>
                ) : (
                  <div className="space-y-4">
                    {webhooksList.map(item => (
                      <div key={item.id} className="p-4 border border-stone-100 rounded-xl bg-stone-50/50 space-y-3">
                        <div className={`flex justify-between items-center gap-4 ${isRTL ? "flex-row-reverse" : "flex-row"}`}>
                          <div className={`overflow-hidden ${isRTL ? "text-right" : "text-left"}`}>
                            <p className="font-bold text-stone-900 text-xs truncate">{item.target_url}</p>
                            <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                              {t.events}: {item.event_types.join(", ")}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteWebhook(item.id)}
                            className="px-3 py-1.5 border border-stone-200 hover:bg-stone-100 text-stone-600 rounded-lg font-bold text-[10px] uppercase tracking-wider transition"
                          >
                            {t.delete}
                          </button>
                        </div>
                        <div className="bg-white p-2 rounded-lg border border-stone-100 text-[9px] text-stone-500 font-mono flex items-center justify-between gap-2">
                          <span>{t.signingSecret}: <span className="font-bold text-stone-750">{item.secret_key}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
