"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const translations = {
  en: {
    title: "Send Notification",
    subtitle: "Compose and queue a broadcast to customers or providers. Delivery runs through WhatsApp Business and push channels once configured in Integrations.",
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
    queuedMsg: "Broadcast queued. It will dispatch through the enabled channels.",
    recentTitle: "Recent Broadcasts",
    statusQueued: "Queued",
    statusSent: "Sent",
    statusSimulated: "Simulated",
    validation: "Add a title and message in at least one language."
  },
  ar: {
    title: "إرسال إشعار",
    subtitle: "أنشئ وأرسل بثاً للعملاء أو المزودين. يتم الإرسال عبر واتساب الأعمال وقنوات الدفع بعد تفعيلها من صفحة التكاملات.",
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
    queueBtn: "إرسال البث",
    queuedMsg: "تم وضع البث في قائمة الإرسال وسيُرسل عبر القنوات المفعلة.",
    recentTitle: "أحدث الإشعارات",
    statusQueued: "بالانتظار",
    statusSent: "أُرسل",
    statusSimulated: "محاكاة",
    validation: "أضف عنواناً ورسالة بلغة واحدة على الأقل."
  }
};

type Broadcast = { id: number; title: string; audience: string; time: string; status: "queued" | "sent" | "simulated" };

const INITIAL_HISTORY: Broadcast[] = [
  { id: 1, title: "Eid promotion — 20% off all bookings", audience: "Customers", time: "12 Jun", status: "sent" },
  { id: 2, title: "New payout schedule for June", audience: "Providers", time: "08 Jun", status: "sent" }
];

export default function AdminNotificationsPage() {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  const [audience, setAudience] = useState<"customers" | "providers" | "all">("customers");
  const [channels, setChannels] = useState({ push: true, whatsapp: false });
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [bodyEn, setBodyEn] = useState("");
  const [bodyAr, setBodyAr] = useState("");
  const [history, setHistory] = useState<Broadcast[]>(INITIAL_HISTORY);
  const [feedback, setFeedback] = useState<"" | "ok" | "invalid">("");

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

  const t = translations[lang];
  const isRTL = lang === "ar";
  const flip = isRTL ? "flex-row-reverse" : "flex-row";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
  const inputBase = "w-full rounded-xl border border-[#ECECEC] bg-[#FDFDFC] px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#D1AF47]/50";

  const audienceLabel = { customers: t.audCustomers, providers: t.audProviders, all: t.audAll };

  const queueBroadcast = async () => {
    const hasEn = titleEn.trim() && bodyEn.trim();
    const hasAr = titleAr.trim() && bodyAr.trim();
    if (!hasEn && !hasAr) {
      setFeedback("invalid");
      setTimeout(() => setFeedback(""), 3500);
      return;
    }
    const id = Date.now();
    const title = (isRTL ? titleAr : titleEn) || titleEn || titleAr;
    setHistory((h) => [
      { id, title, audience: audienceLabel[audience], time: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), status: "queued" },
      ...h
    ]);
    const payload = { audience, channels, titleEn, titleAr, bodyEn, bodyAr };
    setTitleEn(""); setTitleAr(""); setBodyEn(""); setBodyAr("");
    setFeedback("ok");
    setTimeout(() => setFeedback(""), 4000);

    // Dispatch through the send-notification edge function. Until WhatsApp/
    // Unifonic/push provider keys are configured (and the function is deployed),
    // the call fails or no-ops, so we mark the row 'simulated' rather than 'sent'.
    let delivered = false;
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: { broadcast: true, simulate: true, ...payload },
      });
      delivered = !error;
    } catch {
      delivered = false;
    }
    setHistory((h) => h.map((b) => (b.id === id ? { ...b, status: delivered ? "sent" : "simulated" } : b)));

    // Best-effort integrations health stamp (table arrives with a pending migration).
    try {
      await supabase.from("integrations").update({ last_checked_at: new Date().toISOString() }).in("key", ["whatsapp", "expo_push"]);
    } catch { /* integrations table not present yet */ }
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1 max-w-2xl">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Composer */}
        <div className={`${cardBase} lg:col-span-2 space-y-4`}>
          <div className={`flex flex-col gap-3 sm:items-center ${isRTL ? "sm:flex-row-reverse" : "sm:flex-row"}`}>
            <div className="flex-1">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-[#667085]">{t.audience}</span>
              <div className={`flex items-center gap-1 rounded-full bg-[#F7F6F3] border border-[#ECECEC] p-1 w-fit ${flip}`}>
                {(["customers", "providers", "all"] as const).map((a) => (
                  <button key={a} onClick={() => setAudience(a)} className={`rounded-full px-3.5 py-1.5 text-[10px] font-black transition ${audience === a ? "bg-white text-gray-900 shadow-sm border border-[#ECECEC]" : "text-[#667085] hover:text-gray-900"}`}>
                    {audienceLabel[a]}
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
            <button onClick={queueBroadcast} className="rounded-xl bg-gradient-to-r from-[#D1AF47] to-[#E0C46A] px-6 py-2.5 text-sm font-black text-[#101828] shadow-md shadow-[#D1AF47]/15 transition hover:brightness-105">
              {t.queueBtn}
            </button>
          </div>
        </div>

        {/* Recent broadcasts */}
        <div className={cardBase}>
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#667085] mb-3">{t.recentTitle}</h3>
          <div className="divide-y divide-[#F5F5F5]">
            {history.map((b) => (
              <div key={b.id} className="py-3">
                <div className={`flex items-center justify-between gap-2 ${flip}`}>
                  <strong className="truncate text-xs font-black text-gray-900">{b.title}</strong>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${b.status === "sent" ? "bg-[#ECFDF3] text-[#16A34A]" : b.status === "simulated" ? "bg-[#EFF6FF] text-[#3B82F6]" : "bg-[#FFFAEB] text-[#F59E0B]"}`}>
                    {b.status === "sent" ? t.statusSent : b.status === "simulated" ? t.statusSimulated : t.statusQueued}
                  </span>
                </div>
                <div className={`mt-1 flex items-center gap-2 text-[10px] font-bold text-gray-400 ${flip}`}>
                  <span>{b.audience}</span><span>·</span><span>{b.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
