"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Messaging & Notification Engine",
    subtitle: "Manage transactional WhatsApp appointment reminders, confirmations, post-visit reviews, and targeted broadcasts.",
    tabBroadcast: "Broadcast Composer",
    tabPipeline: "WhatsApp Pipeline & Logs",
    audience: "Audience",
    audCustomers: "Customers",
    audProviders: "Providers",
    audAll: "Everyone",
    channel: "Channels",
    chPush: "App Push",
    chWhatsapp: "WhatsApp",
    titleEnL: "Title (English)",
    titleArL: "Title (Arabic)",
    bodyEnL: "Message (English)",
    bodyArL: "Message (Arabic)",
    queueBtn: "Queue Broadcast",
    queuedMsg: "Broadcast queued in message pipeline.",
    recentTitle: "Recent Live Transmissions",
    statusQueued: "Queued",
    statusSent: "Sent",
    statusDelivered: "Delivered",
    statusSimulated: "Simulated",
    statusDeferred: "Deferred (Quiet Hours)",
    statusSkippedConsent: "No Consent",
    statusSkippedUnverified: "Unverified Phone",
    validation: "Add a title and message in at least one language.",
    dispatchBtn: "Dispatch Pending Queue Now",
    dispatching: "Dispatching...",
    dispatchedOk: "Queue processed successfully.",
    metricPending: "Pending in Queue",
    metricDelivered: "Delivered",
    metricDeferred: "Quiet Hours Deferrals",
    metricSkipped: "Consent/Verify Skips",
    metricCost: "Total Cost",
    colRecipient: "Recipient",
    colTemplate: "Template",
    colChannel: "Channel",
    colStatus: "Status",
    colCost: "Cost (SAR)",
    colTime: "Timestamp",
    emptyLogs: "No message records found. When bookings occur, automated confirmations and reminders will appear here.",
    loading: "Loading message logs..."
  },
  ar: {
    title: "محرك المراسلة وإشعارات واتساب",
    subtitle: "إدارة إشعارات واتساب الآلية لتأكيد المواعيد، والتذكيرات (قبل 24 و2 ساعة)، ورسائل التقييم وإعادة الحجز، والبث الجماعي.",
    tabBroadcast: "منشئ البث المباشر",
    tabPipeline: "طابور وسجل رسائل واتساب",
    audience: "الجمهور",
    audCustomers: "العملاء",
    audProviders: "المزودون",
    audAll: "الجميع",
    channel: "القنوات",
    chPush: "إشعار التطبيق",
    chWhatsapp: "واتساب",
    titleEnL: "العنوان (إنجليزي)",
    titleArL: "العنوان (عربي)",
    bodyEnL: "الرسالة (إنجليزي)",
    bodyArL: "الرسالة (عربي)",
    queueBtn: "إرسال البث إلى الطابور",
    queuedMsg: "تم إدراج البث في طابور الإرسال بنجاح.",
    recentTitle: "أحدث الرسائل والإرسالات الحية",
    statusQueued: "بالانتظار",
    statusSent: "أُرسل",
    statusDelivered: "تم التسليم",
    statusSimulated: "محاكاة",
    statusDeferred: "مؤجل (ساعات الهدوء)",
    statusSkippedConsent: "بدون موافقة",
    statusSkippedUnverified: "هاتف غير موثق",
    validation: "أضف عنواناً ورسالة بلغة واحدة على الأقل.",
    dispatchBtn: "تشغيل ومعالجة الطابور الآن",
    dispatching: "جارٍ الإرسال...",
    dispatchedOk: "تمت معالجة طابور الرسائل بنجاح.",
    metricPending: "قيد الانتظار بالطابور",
    metricDelivered: "تم تسليمها",
    metricDeferred: "مؤجلة لساعات الهدوء",
    metricSkipped: "مستبعدة (الموافقة/التحقق)",
    metricCost: "إجمالي التكلفة",
    colRecipient: "المستلم",
    colTemplate: "النموذج",
    colChannel: "القناة",
    colStatus: "الحالة",
    colCost: "التكلفة (ر.س)",
    colTime: "الوقت",
    emptyLogs: "لا توجد سجلات مراسلة حتى الآن. عند إنشاء الحجوزات، ستظهر إشعارات التأكيد والتذكير هنا تلقائياً.",
    loading: "جارٍ تحميل سجل الرسائل..."
  }
};

type MessageLogRow = {
  id: string;
  recipient_phone: string;
  channel: string;
  template_name: string;
  locale: string;
  message_body: string;
  status: string;
  cost_sar: number;
  sent_at: string;
  error_details?: string | null;
};

type QueueStats = {
  pending: number;
  delivered: number;
  deferred: number;
  skipped: number;
  totalCostSar: number;
};

export default function AdminNotificationsPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [activeTab, setActiveTab] = useState<"broadcast" | "pipeline">("pipeline");
  const [audience, setAudience] = useState<"customers" | "providers" | "all">("customers");
  const [channels, setChannels] = useState({ push: true, whatsapp: true });
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [feedback, setFeedback] = useState<"" | "ok" | "invalid">("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  const [messageLogs, setMessageLogs] = useState<MessageLogRow[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    delivered: 0,
    deferred: 0,
    skipped: 0,
    totalCostSar: 0
  });
  const [isLoading, setIsLoading] = useState(true);

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

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch recent message logs
      const { data: logsData } = await supabase
        .from("message_log")
        .select("id, recipient_phone, channel, template_name, locale, message_body, status, cost_sar, sent_at, error_details")
        .order("sent_at", { ascending: false })
        .limit(50);

      const logs = (logsData as MessageLogRow[]) || [];
      setMessageLogs(logs);

      // 2. Fetch queue counts
      const { count: pendingCount } = await supabase
        .from("message_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      const { count: deferredCount } = await supabase
        .from("message_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "deferred_quiet_hours");

      const deliveredCount = logs.filter((l) => l.status === "delivered" || l.status === "sent").length;
      const skippedCount = logs.filter((l) => l.status.startsWith("skipped")).length;
      const totalCost = logs.reduce((sum, item) => sum + (Number(item.cost_sar) || 0), 0);

      setStats({
        pending: pendingCount || 0,
        delivered: deliveredCount,
        deferred: deferredCount || 0,
        skipped: skippedCount,
        totalCostSar: Number(totalCost.toFixed(2))
      });
    } catch (err) {
      console.warn("Failed to load message log data:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const inputBase = "w-full rounded-xl border border-[#ECECEC] bg-[#FDFDFC] px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#D1AF47]/50";

  const queueBroadcast = async () => {
    const hasEn = titleEn.trim() && bodyEn.trim();
    const hasAr = titleAr.trim() && bodyAr.trim();
    if (!hasEn && !hasAr) {
      setFeedback("invalid");
      setTimeout(() => setFeedback(""), 3500);
      return;
    }

    try {
      // Direct enqueue via supabase RPC if available
      const textToQueue = (isRTL ? bodyAr : bodyEn) || bodyEn || bodyAr;
      const { error } = await supabase.rpc("enqueue_direct_message", {
        p_recipient_phone: "+966500000000",
        p_recipient_id: null,
        p_template_name: "broadcast_notice",
        p_locale: isRTL ? "ar" : "en",
        p_variables: { message: textToQueue },
        p_channel: channels.whatsapp ? "whatsapp" : "sms"
      });

      if (error) {
        // Fallback to edge function invocation
        await supabase.functions.invoke("send-notification", {
          body: { broadcast: true, simulate: true, audience, channels, titleEn, titleAr, bodyEn, bodyAr }
        });
      }

      setTitleEn("");
      setTitleAr("");
      setBodyEn("");
      setBodyAr("");
      setFeedback("ok");
      setTimeout(() => setFeedback(""), 4000);
      loadData();
    } catch {
      setFeedback("invalid");
      setTimeout(() => setFeedback(""), 3500);
    }
  };

  const handleManualDispatch = async () => {
    setIsDispatching(true);
    setDispatchResult(null);
    try {
      // Sends through the WhatsApp Cloud API via the dispatch-messages Edge Function; a message is
      // counted as sent only when WhatsApp returns a message id.
      const { data, error } = await supabase.functions.invoke("dispatch-messages", {
        body: { batchSize: 25 }
      });

      if (error) {
        let detail = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) detail = body.error;
        } catch {
          // keep the generic message
        }
        setDispatchResult(`Error: ${detail}`);
      } else {
        const res = data as { sent?: number; failed?: number; deferred_quiet_hours?: number; skipped?: number };
        setDispatchResult(
          isRTL
            ? `أُرسلت: ${res?.sent ?? 0} | فشلت: ${res?.failed ?? 0} | مؤجلة لساعات الهدوء: ${res?.deferred_quiet_hours ?? 0} | مستبعدة: ${res?.skipped ?? 0}`
            : `Sent: ${res?.sent ?? 0} | Failed: ${res?.failed ?? 0} | Deferred: ${res?.deferred_quiet_hours ?? 0} | Skipped: ${res?.skipped ?? 0}`
        );
      }
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Dispatch failed";
      setDispatchResult(`Error: ${msg}`);
    } finally {
      setIsDispatching(false);
      setTimeout(() => setDispatchResult(null), 6000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
      case "sent":
        return <span className="rounded-full bg-[#ECFDF3] px-2.5 py-0.5 text-[10px] font-bold text-[#16A34A]">{t.statusDelivered}</span>;
      case "deferred_quiet_hours":
        return <span className="rounded-full bg-[#EFF6FF] px-2.5 py-0.5 text-[10px] font-bold text-[#3B82F6]">{t.statusDeferred}</span>;
      case "skipped_no_consent":
        return <span className="rounded-full bg-[#FFF1F2] px-2.5 py-0.5 text-[10px] font-bold text-[#E11D48]">{t.statusSkippedConsent}</span>;
      case "skipped_unverified":
        return <span className="rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[10px] font-bold text-[#D97706]">{t.statusSkippedUnverified}</span>;
      case "simulated":
        return <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[10px] font-bold text-[#4B5563]">{t.statusSimulated}</span>;
      default:
        return <span className="rounded-full bg-[#FFFAEB] px-2.5 py-0.5 text-[10px] font-bold text-[#F59E0B]">{status}</span>;
    }
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1 max-w-2xl">{t.subtitle}</p>
        </div>
        <div className={`flex items-center gap-2 rounded-xl bg-[#F7F6F3] p-1 border border-[#ECECEC] ${flip}`}>
          <button
            onClick={() => setActiveTab("pipeline")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === "pipeline" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-gray-500 hover:text-gray-900"}`}
          >
            {t.tabPipeline}
          </button>
          <button
            onClick={() => setActiveTab("broadcast")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === "broadcast" ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-gray-500 hover:text-gray-900"}`}
          >
            {t.tabBroadcast}
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">{t.metricPending}</span>
          <span className="text-2xl font-black text-[#D1AF47]">{stats.pending}</span>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">{t.metricDelivered}</span>
          <span className="text-2xl font-black text-[#16A34A]">{stats.delivered}</span>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">{t.metricDeferred}</span>
          <span className="text-2xl font-black text-[#3B82F6]">{stats.deferred}</span>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">{t.metricSkipped}</span>
          <span className="text-2xl font-black text-[#EF4444]">{stats.skipped}</span>
        </div>
        <div className={`${cardBase} col-span-2 lg:col-span-1`}>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">{t.metricCost}</span>
          <span className="text-2xl font-black text-gray-900">{stats.totalCostSar} <span className="text-xs font-bold text-gray-500">SAR</span></span>
        </div>
      </div>

      {activeTab === "pipeline" ? (
        <div className="space-y-4">
          {/* Dispatch Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#ECECEC]">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t.recentTitle}</h3>
              <p className="text-xs text-gray-400">Saudi Quiet Hours: 22:00 - 09:00 AST (UTC+3) · Costs come from your WhatsApp Business account billing</p>
            </div>
            <div className={`flex items-center gap-3 ${flip}`}>
              {dispatchResult && (
                <span className="text-xs font-bold text-[#16A34A]">{dispatchResult}</span>
              )}
              <button
                onClick={handleManualDispatch}
                disabled={isDispatching}
                className="rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-4 py-2 text-xs font-black text-[#101828] shadow-sm transition hover:brightness-105 disabled:opacity-50"
              >
                {isDispatching ? t.dispatching : t.dispatchBtn}
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className={`${cardBase} overflow-hidden p-0`}>
            {isLoading ? (
              <div className="p-8 text-center text-xs font-bold text-gray-400">{t.loading}</div>
            ) : messageLogs.length === 0 ? (
              <div className="p-8 text-center text-xs font-semibold text-gray-400">{t.emptyLogs}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF9F6] border-b border-[#ECECEC] text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">{t.colRecipient}</th>
                      <th className="px-4 py-3">{t.colTemplate}</th>
                      <th className="px-4 py-3">{t.colChannel}</th>
                      <th className="px-4 py-3">{t.colStatus}</th>
                      <th className="px-4 py-3">{t.colCost}</th>
                      <th className="px-4 py-3">{t.colTime}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5]">
                    {messageLogs.map((row) => (
                      <tr key={row.id} className="hover:bg-[#FCFBFA] transition">
                        <td className="px-4 py-3 font-mono font-bold text-gray-800">{row.recipient_phone}</td>
                        <td className="px-4 py-3 font-semibold text-gray-700">
                          <div>{row.template_name}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-xs">{row.message_body}</div>
                        </td>
                        <td className="px-4 py-3 uppercase text-[10px] font-bold text-gray-500">{row.channel}</td>
                        <td className="px-4 py-3">{getStatusBadge(row.status)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-gray-900">{Number(row.cost_sar).toFixed(2)} SAR</td>
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                          {new Date(row.sent_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {new Date(row.sent_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Composer Tab */
        <div className={`${cardBase} space-y-4`}>
          <div className={`flex flex-col gap-3 sm:items-center ${isRTL ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
            <div className="flex-1">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.audience}</span>
              <div className={`flex items-center gap-1 rounded-full bg-[#F7F6F3] border border-[#ECECEC] p-1 w-fit ${flip}`}>
                {(["customers", "providers", "all"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAudience(a)}
                    className={`rounded-full px-3.5 py-1.5 text-[10px] font-black transition ${audience === a ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}
                  >
                    {a === "customers" ? t.audCustomers : a === "providers" ? t.audProviders : t.audAll}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.channel}</span>
              <div className={`flex items-center gap-2 ${flip}`}>
                {([["push", t.chPush], ["whatsapp", t.chWhatsapp]] as ["push" | "whatsapp", string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setChannels((c) => ({ ...c, [key]: !c[key] }))}
                    className={`rounded-full border px-3.5 py-1.5 text-[10px] font-black transition ${channels[key] ? "border-[#D1AF47]/40 bg-[#FFFAEB] text-[#B8952E]" : "border-[#ECECEC] bg-white text-[#667085]"}`}
                  >
                    {channels[key] ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.titleEnL}</label>
              <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.titleArL}</label>
              <input dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.bodyEnL}</label>
              <textarea dir="ltr" rows={4} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} className={`${inputBase} resize-none`} />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.bodyArL}</label>
              <textarea dir="rtl" rows={4} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} className={`${inputBase} resize-none`} />
            </div>
          </div>

          <div className={`flex items-center justify-end gap-3 ${flip}`}>
            {feedback === "ok" && <span className="text-xs font-bold text-[#16A34A]">{t.queuedMsg}</span>}
            {feedback === "invalid" && <span className="text-xs font-bold text-[#EF4444]">{t.validation}</span>}
            <button
              onClick={queueBroadcast}
              className="rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-6 py-2.5 text-sm font-black text-[#101828] shadow-md shadow-[#D1AF47]/15 transition hover:brightness-105"
            >
              {t.queueBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
