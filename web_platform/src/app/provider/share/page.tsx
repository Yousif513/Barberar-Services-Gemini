"use client";

import React, { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, ForbiddenNotice, OperationsField, OperationsPanel, isForbidden, operationsButton, operationsDate, operationsInput, useOperationsLocale,
  type OperationsLocale,
} from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import { describeServerError } from "@/app/provider/_components/server-errors";
import { buildShareLink, sanitizeLabel, whatsappShareUrl, SHARE_CHANNELS } from "@/lib/distribution.mjs";
import { printableQrHtml, qrSvgPath } from "@/lib/qr-svg.mjs";

type ShareChannel = (typeof SHARE_CHANNELS)[number];
type TokenRow = { id: string; source: ShareChannel; token: string; label: string | null; expires_at: string | null; created_at: string; revoked_at: string | null };
type Option = { id: string; name_en: string; name_ar: string };
type ChannelCount = { channel: string; bookings: number; completed: number; lost: number };
type CampaignCount = { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; bookings: number; completed: number };
type Report = { from: string; to: string; bookings: number; attributed: number; unattributed: number; walk_ins: number; by_channel: ChannelCount[]; by_campaign: CampaignCount[] };

const RANGES = [7, 30, 90] as const;
const subscribeNever = () => () => {};

const copy = {
  en: {
    title: "Share & Reach",
    subtitle: "Build booking links for Instagram, WhatsApp, a printed QR code or your own site, then see which of them brings bookings. Links open your shop page, where customers pay the same way as everyone else.",
    loading: "Loading your share kit...", noProvider: "No provider profile is linked to this account. Only the owner uses the share kit.",
    loadFailed: "We could not load the share kit.", retry: "Try again",
    buildTitle: "Build a link", channel: "Where will you share it?",
    channels: { link: "Link (your site, Google profile, e-mail)", qr: "QR code (print)", whatsapp: "WhatsApp", instagram: "Instagram" } as Record<string, string>,
    service: "Service", wholeShop: "Whole shop", professional: "Professional", anyProfessional: "Any professional",
    campaign: "Campaign name (optional)", campaignHint: "Letters, digits, dash. For example ramadan-offer. It appears in your report.",
    advanced: "Advanced labels", utmSource: "Source label", utmMedium: "Medium label",
    keyLabel: "Share key", noKeyTitle: "No active share key for this channel", noKeyBody: "A share key is what ties a booking to your own link, so it is treated as your direct client and no marketplace fee applies to it. Create one for this channel to build a link.",
    keyName: "Name for the key (optional)", createKey: "Create a share key", creating: "Creating...", keyCreated: "Share key created.",
    yourLink: "Your link", copy: "Copy link", copied: "Link copied.", copyFailed: "The browser did not allow copying. Select the link above and copy it by hand.",
    whatsapp: "Share on WhatsApp", whatsappText: (name: string, link: string) => `Book your appointment with ${name} here: ${link}`,
    instagram: "Share for Instagram", instagramHint: "Instagram posts cannot hold a clickable link. Paste it in your bio, a story link sticker or a message.", shared: "Shared.",
    qrTitle: "QR code", qrAlt: "QR code that opens the booking link", downloadQr: "Download QR (SVG)", printQr: "Print QR", printFailed: "The browser blocked the print window. Allow pop-ups for this site and try again.",
    printCaption: "Scan to book online", printLabel: "Print",
    keysTitle: "Share keys", keysEmpty: "You have no share keys yet.", colChannel: "Channel", colName: "Name", colKey: "Key", colCreated: "Created", colExpires: "Expires", colStatus: "Status", colActions: "Actions",
    active: "Active", revoked: "Revoked", expired: "Expired", never: "No expiry", revoke: "Revoke",
    revokeTitle: "Revoke this share key?", revokeIntro: "Links and QR codes that carry this key stop counting as your direct clients. Bookings already made are not changed.", revokeReason: "Reason", revokeConfirm: "Revoke key", revoked_ok: "Share key revoked.",
    reportTitle: "Where your bookings come from", range: "Period", days: (n: number) => `Last ${n} days`,
    total: "Bookings", attributed: "With a known source", unattributed: "Source unknown", walkIns: "Counter bookings (not counted)",
    byChannel: "By channel", byCampaign: "By campaign", completed: "Completed", lost: "Cancelled or missed", share: "Share",
    colSource: "Source", colMedium: "Medium", colCampaign: "Campaign",
    reportEmpty: "No bookings in this period yet.", campaignsEmpty: "No bookings carried a campaign label in this period.",
    reportNote: "Counts only: no customer is named or identified. The channel is what the customer's browser reported, except for QR, WhatsApp and Instagram share keys, which are verified. This report is for analytics and never changes your fees.",
    channelNames: { google: "Google", instagram: "Instagram", whatsapp: "WhatsApp", facebook: "Facebook", tiktok: "TikTok", snapchat: "Snapchat", qr: "QR code", direct: "Direct or from PRIMORA", other: "Other sites" } as Record<string, string>,
    noLabel: "-", linkRefused: "A link cannot be built yet:",
  },
  ar: {
    title: "المشاركة والانتشار",
    subtitle: "أنشئ روابط حجز لإنستغرام وواتساب ورمز QR مطبوع أو موقعك، ثم اعرف أيّها يجلب لك الحجوزات. تفتح الروابط صفحة نشاطك ويدفع العملاء كما يدفع الجميع.",
    loading: "جارٍ تحميل أدوات المشاركة...", noProvider: "لا يوجد ملف مزوّد مرتبط بهذا الحساب. مالك النشاط فقط يستخدم أدوات المشاركة.",
    loadFailed: "تعذّر تحميل أدوات المشاركة.", retry: "أعد المحاولة",
    buildTitle: "أنشئ رابطاً", channel: "أين ستشاركه؟",
    channels: { link: "رابط (موقعك أو ملف جوجل أو البريد)", qr: "رمز QR (للطباعة)", whatsapp: "واتساب", instagram: "إنستغرام" } as Record<string, string>,
    service: "الخدمة", wholeShop: "النشاط كله", professional: "الأخصائي", anyProfessional: "أي أخصائي",
    campaign: "اسم الحملة (اختياري)", campaignHint: "أحرف إنجليزية وأرقام وشرطة، مثل ramadan-offer. يظهر في تقريرك.",
    advanced: "تسميات متقدمة", utmSource: "تسمية المصدر", utmMedium: "تسمية الوسيلة",
    keyLabel: "مفتاح المشاركة", noKeyTitle: "لا يوجد مفتاح مشاركة فعّال لهذه القناة", noKeyBody: "مفتاح المشاركة هو ما يربط الحجز برابطك الخاص، فيُعدّ العميل من عملائك المباشرين ولا تُطبَّق عليه رسوم السوق. أنشئ مفتاحاً لهذه القناة لتبني الرابط.",
    keyName: "اسم للمفتاح (اختياري)", createKey: "إنشاء مفتاح مشاركة", creating: "جارٍ الإنشاء...", keyCreated: "تم إنشاء مفتاح المشاركة.",
    yourLink: "رابطك", copy: "نسخ الرابط", copied: "تم نسخ الرابط.", copyFailed: "منع المتصفح النسخ. حدّد الرابط أعلاه وانسخه يدوياً.",
    whatsapp: "مشاركة عبر واتساب", whatsappText: (name: string, link: string) => `احجز موعدك لدى ${name} من هنا: ${link}`,
    instagram: "مشاركة لإنستغرام", instagramHint: "منشورات إنستغرام لا تقبل رابطاً قابلاً للنقر. ضعه في السيرة الذاتية أو ملصق الرابط في القصة أو في رسالة.", shared: "تمت المشاركة.",
    qrTitle: "رمز QR", qrAlt: "رمز QR يفتح رابط الحجز", downloadQr: "تنزيل الرمز (SVG)", printQr: "طباعة الرمز", printFailed: "منع المتصفح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع وأعد المحاولة.",
    printCaption: "امسح الرمز للحجز عبر الإنترنت", printLabel: "طباعة",
    keysTitle: "مفاتيح المشاركة", keysEmpty: "ليس لديك مفاتيح مشاركة بعد.", colChannel: "القناة", colName: "الاسم", colKey: "المفتاح", colCreated: "أُنشئ", colExpires: "ينتهي", colStatus: "الحالة", colActions: "إجراءات",
    active: "فعّال", revoked: "ملغى", expired: "منتهٍ", never: "بلا انتهاء", revoke: "إلغاء",
    revokeTitle: "إلغاء مفتاح المشاركة هذا؟", revokeIntro: "الروابط ورموز QR التي تحمل هذا المفتاح لن تُحتسب بعد الآن من عملائك المباشرين. الحجوزات التي تمت لا تتغير.", revokeReason: "السبب", revokeConfirm: "إلغاء المفتاح", revoked_ok: "تم إلغاء مفتاح المشاركة.",
    reportTitle: "من أين تأتي حجوزاتك", range: "الفترة", days: (n: number) => `آخر ${n} يوماً`,
    total: "الحجوزات", attributed: "بمصدر معروف", unattributed: "مصدر غير معروف", walkIns: "حجوزات الكاونتر (غير محسوبة)",
    byChannel: "حسب القناة", byCampaign: "حسب الحملة", completed: "مكتملة", lost: "ملغاة أو لم يحضر", share: "النسبة",
    colSource: "المصدر", colMedium: "الوسيلة", colCampaign: "الحملة",
    reportEmpty: "لا توجد حجوزات في هذه الفترة بعد.", campaignsEmpty: "لم يحمل أي حجز اسم حملة في هذه الفترة.",
    reportNote: "أعداد فقط: لا يظهر اسم أي عميل ولا يمكن التعرف عليه. القناة هي ما أبلغ عنه متصفح العميل، عدا مفاتيح QR وواتساب وإنستغرام فهي موثّقة. هذا التقرير للتحليل فقط ولا يغيّر رسومك.",
    channelNames: { google: "جوجل", instagram: "إنستغرام", whatsapp: "واتساب", facebook: "فيسبوك", tiktok: "تيك توك", snapchat: "سناب شات", qr: "رمز QR", direct: "مباشر أو من بريمورا", other: "مواقع أخرى" } as Record<string, string>,
    noLabel: "-", linkRefused: "لا يمكن بناء الرابط بعد:",
  },
} as const;

const arabicReasons: Array<[RegExp, string]> = [
  [/^Provider not found/i, "لم يُعثر على النشاط المطلوب."],
  [/^Share token not found/i, "لم يُعثر على مفتاح المشاركة."],
  [/^At most 50 live share tokens/i, "الحد الأقصى 50 مفتاح مشاركة فعّالاً. ألغِ مفتاحاً قبل إنشاء آخر."],
  [/^The label can have at most 80/i, "اسم المفتاح حتى 80 حرفاً."],
  [/^The expiry must be in the future/i, "تاريخ الانتهاء يجب أن يكون في المستقبل."],
  [/^The channel must be link, qr, whatsapp or instagram/i, "القناة يجب أن تكون رابطاً أو QR أو واتساب أو إنستغرام."],
  [/^A reason of at least 3 characters/i, "اكتب سبباً لا يقل عن 3 أحرف."],
  [/^The start date must not be after/i, "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية."],
  [/^The date range can span at most/i, "الفترة لا تتجاوز 366 يوماً."],
];

function shareError(error: unknown, locale: OperationsLocale): string {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  if (locale === "ar") for (const [pattern, arabic] of arabicReasons) if (pattern.test(message)) return arabic;
  return describeServerError(error, locale);
}

// Riyadh calendar day as yyyy-mm-dd, `daysBack` days before today.
function riyadhDay(daysBack: number): string {
  const day = new Date(Date.now() - daysBack * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
}

const isLive = (row: TokenRow, now: number) => !row.revoked_at && (!row.expires_at || new Date(row.expires_at).getTime() > now);

export default function ProviderSharePage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const ids = { channel: useId(), service: useId(), pro: useId(), campaign: useId(), source: useId(), medium: useId(), keyName: useId(), link: useId(), range: useId(), key: useId() };
  const number = useMemo(() => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA"), [locale]);

  const [state, setState] = useState<"loading" | "ready" | "no_provider" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const origin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [services, setServices] = useState<Option[]>([]);
  const [staff, setStaff] = useState<Option[]>([]);

  const [channel, setChannel] = useState<ShareChannel>("link");
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [campaign, setCampaign] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [printFailed, setPrintFailed] = useState(false);
  const [revokeFor, setRevokeFor] = useState<TokenRow | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [reportRetry, setReportRetry] = useState(0);
  const [reportResult, setReportResult] = useState<{ key: string; report: Report | null; error: string } | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) { setState("no_provider"); return; }
      const { data: provider, error: providerError } = await supabase.from("providers").select("id, business_name_en, business_name_ar").eq("owner_id", user.id).maybeSingle();
      if (providerError) throw providerError;
      if (!provider) { setState("no_provider"); return; }
      setProviderId(provider.id);
      setBusinessName(locale === "ar" ? provider.business_name_ar || provider.business_name_en : provider.business_name_en || provider.business_name_ar);

      const [tokenRes, serviceRes, branchRes] = await Promise.all([
        supabase.from("provider_share_tokens").select("id, source, token, label, expires_at, created_at, revoked_at").eq("provider_id", provider.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("services").select("id, name_en, name_ar").eq("provider_id", provider.id).eq("is_active", true).order("sort_order", { ascending: true }).limit(500),
        supabase.from("branches").select("id").eq("provider_id", provider.id).limit(200),
      ]);
      for (const res of [tokenRes, serviceRes, branchRes]) if (res.error) throw res.error;
      const branchIds = (branchRes.data ?? []).map((b: { id: string }) => b.id);
      let people: Option[] = [];
      if (branchIds.length > 0) {
        const staffRes = await supabase.from("employees").select("id, name_en, name_ar").in("branch_id", branchIds).eq("is_active", true).order("name_en", { ascending: true }).limit(200);
        if (staffRes.error) throw staffRes.error;
        people = (staffRes.data ?? []) as Option[];
      }
      setNowMs(Date.now());
      setTokens((tokenRes.data ?? []) as TokenRow[]);
      setServices((serviceRes.data ?? []) as Option[]);
      setStaff(people);
      setLoadError("");
      setForbidden(false);
      setState("ready");
    } catch (error) {
      if (isForbidden(error)) setForbidden(true);
      setLoadError(shareError(error, locale));
      setState("error");
    }
  }, [locale]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The report is keyed by what it was asked for; while the stored key differs from the wanted one it is loading. Nothing sets state before the answer arrives.
  const reportKey = `${providerId}|${days}|${locale}|${reportRetry}`;
  useEffect(() => {
    if (state !== "ready" || !providerId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("provider_bookings_by_channel", { p_provider_id: providerId, p_from: riyadhDay(days - 1), p_to: riyadhDay(0) });
      if (!cancelled) setReportResult({ key: reportKey, report: error ? null : (data as Report), error: error ? shareError(error, locale) : "" });
    })();
    return () => { cancelled = true; };
  }, [state, providerId, days, locale, reportKey]);
  const reportCurrent = reportResult?.key === reportKey ? reportResult : null;
  const report = reportCurrent?.report ?? null;
  const reportState: "loading" | "error" | "idle" = !reportCurrent ? "loading" : reportCurrent.error ? "error" : "idle";
  const reportError = reportCurrent?.error ?? "";

  const now = nowMs;
  const liveForChannel = useMemo(() => tokens.filter((row) => row.source === channel && isLive(row, now)), [tokens, channel, now]);
  const activeToken = liveForChannel.find((row) => row.id === tokenId) ?? liveForChannel[0] ?? null;

  const built = useMemo(() => {
    if (!providerId || !origin || !activeToken) return { link: "", problem: "" };
    try {
      return {
        link: buildShareLink({ origin, providerId, token: activeToken.token, channel, serviceId: serviceId || null, employeeId: employeeId || null, campaign, source: utmSource, medium: utmMedium }),
        problem: "",
      };
    } catch (error) {
      return { link: "", problem: error instanceof Error ? error.message : String(error) };
    }
  }, [providerId, origin, activeToken, channel, serviceId, employeeId, campaign, utmSource, utmMedium]);
  const qr = useMemo(() => (built.link ? qrSvgPath(built.link) : null), [built.link]);
  const labelPreview = sanitizeLabel(campaign);

  const nameOf = (option: Option) => (locale === "ar" ? option.name_ar || option.name_en : option.name_en || option.name_ar);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(built.link);
      setResult({ success: t.copied });
    } catch {
      setResult({ error: t.copyFailed });
    }
  };
  const shareOnInstagram = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: businessName, url: built.link });
        setResult({ success: t.shared });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyLink();
  };
  const downloadQr = () => {
    if (!qr) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="640" height="640"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${qr.d}" fill="#000"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "primora-booking-qr.svg";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const printQr = () => {
    if (!built.link) return;
    const w = window.open("", "_blank");
    if (!w) { setPrintFailed(true); return; }
    setPrintFailed(false);
    w.document.write(printableQrHtml({ title: businessName, caption: t.printCaption, url: built.link, printLabel: t.printLabel, lang: locale }));
    w.document.close();
  };

  const createKey = async () => {
    setCreating(true);
    setResult({});
    const { data, error } = await supabase.rpc("create_provider_share_token", { p_provider_id: providerId, p_source: channel, p_label: keyName.trim() || null, p_expires_at: null });
    setCreating(false);
    if (error) { setResult({ error: shareError(error, locale) }); return; }
    setKeyName("");
    setTokenId((data as { id?: string } | null)?.id ?? "");
    setResult({ success: t.keyCreated });
    await load();
  };

  const statusOf = (row: TokenRow) => (row.revoked_at ? t.revoked : isLive(row, now) ? t.active : t.expired);
  const maxChannel = Math.max(1, ...(report?.by_channel ?? []).map((row) => row.bookings));

  if (state === "loading") return <div dir={dir} role="status" className="p-6 text-sm text-[#667085]">{t.loading}</div>;
  if (state === "no_provider") return <div dir={dir} className="p-6"><p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t.noProvider}</p></div>;
  if (state === "error") {
    return (
      <div dir={dir} className="space-y-4 p-6">
        {forbidden ? <ForbiddenNotice locale={locale} /> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t.loadFailed} {loadError}</p>}
        {!forbidden && <button type="button" className={operationsButton} onClick={() => { setState("loading"); void load(); }}>{t.retry}</button>}
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="font-serif text-3xl font-black text-[#101828]">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#667085]">{t.subtitle}</p>
      </header>

      <OperationsPanel title={t.buildTitle}>
        <div className="grid gap-4 md:grid-cols-2">
          <OperationsField label={t.channel}>
            <select id={ids.channel} className={operationsInput} value={channel} onChange={(e) => { setChannel(e.target.value as ShareChannel); setTokenId(""); }}>
              {SHARE_CHANNELS.map((c) => <option key={c} value={c}>{t.channels[c]}</option>)}
            </select>
          </OperationsField>
          <OperationsField label={t.service}>
            <select id={ids.service} className={operationsInput} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">{t.wholeShop}</option>
              {services.map((s) => <option key={s.id} value={s.id}>{nameOf(s)}</option>)}
            </select>
          </OperationsField>
          <OperationsField label={t.professional}>
            <select id={ids.pro} className={operationsInput} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{t.anyProfessional}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{nameOf(s)}</option>)}
            </select>
          </OperationsField>
          <OperationsField label={t.campaign}>
            <input id={ids.campaign} className={operationsInput} value={campaign} maxLength={64} dir="ltr" autoComplete="off" onChange={(e) => setCampaign(e.target.value)} aria-describedby={`${ids.campaign}-hint`} />
            <span id={`${ids.campaign}-hint`} className="font-normal text-[#667085]">{t.campaignHint}{labelPreview && labelPreview !== campaign ? ` utm_campaign=${labelPreview}` : ""}</span>
          </OperationsField>
        </div>
        <details className="mt-4 rounded-xl border border-[#E4DECF] p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#725517]">{t.advanced}</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <OperationsField label={t.utmSource}><input id={ids.source} className={operationsInput} value={utmSource} maxLength={64} dir="ltr" autoComplete="off" onChange={(e) => setUtmSource(e.target.value)} /></OperationsField>
            <OperationsField label={t.utmMedium}><input id={ids.medium} className={operationsInput} value={utmMedium} maxLength={64} dir="ltr" autoComplete="off" onChange={(e) => setUtmMedium(e.target.value)} /></OperationsField>
          </div>
        </details>

        {!activeToken ? (
          <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-black">{t.noKeyTitle}</p>
            <p className="mt-1">{t.noKeyBody}</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1">
                <OperationsField label={t.keyName}><input id={ids.keyName} className={operationsInput} value={keyName} maxLength={80} onChange={(e) => setKeyName(e.target.value)} /></OperationsField>
              </div>
              <button type="button" className={operationsButton} disabled={creating} onClick={() => void createKey()}>{creating ? t.creating : t.createKey}</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {liveForChannel.length > 1 && (
              <OperationsField label={t.keyLabel}>
                <select id={ids.key} className={operationsInput} value={activeToken.id} onChange={(e) => setTokenId(e.target.value)}>
                  {liveForChannel.map((row) => <option key={row.id} value={row.id}>{row.label || `${t.channels[row.source]} · ${row.token.slice(-6)}`}</option>)}
                </select>
              </OperationsField>
            )}
            <div>
              <label htmlFor={ids.link} className="text-xs font-semibold text-[#667085]">{t.yourLink}</label>
              <input id={ids.link} readOnly dir="ltr" className={`${operationsInput} mt-2 font-mono text-xs`} value={built.link} onFocus={(e) => e.currentTarget.select()} aria-live="polite" />
              {built.problem && <p role="alert" className="mt-2 text-sm text-red-800">{t.linkRefused} {built.problem}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={operationsButton} disabled={!built.link} onClick={() => void copyLink()}>{t.copy}</button>
              {channel === "whatsapp" && (
                <a className={`${operationsButton} inline-block`} href={built.link ? whatsappShareUrl(t.whatsappText(businessName, built.link)) : undefined} aria-disabled={!built.link} target="_blank" rel="noopener noreferrer">{t.whatsapp}</a>
              )}
              {channel === "instagram" && <button type="button" className={operationsButton} disabled={!built.link} onClick={() => void shareOnInstagram()}>{t.instagram}</button>}
            </div>
            {channel === "instagram" && <p className="text-xs text-[#667085]">{t.instagramHint}</p>}
            {channel === "qr" && qr && (
              <div className="flex flex-wrap items-start gap-5">
                <div className="rounded-2xl border border-[#E4DECF] bg-white p-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${qr.size} ${qr.size}`} width="208" height="208" role="img" aria-label={t.qrAlt}>
                    <rect width={qr.size} height={qr.size} fill="#fff" />
                    <path d={qr.d} fill="#000" />
                  </svg>
                </div>
                <div className="flex flex-col gap-3">
                  <h3 className="font-serif text-lg font-bold text-[#101828]">{t.qrTitle}</h3>
                  <button type="button" className={operationsButton} onClick={downloadQr}>{t.downloadQr}</button>
                  <button type="button" className={operationsButton} onClick={printQr}>{t.printQr}</button>
                  {printFailed && <p role="alert" className="max-w-xs text-sm text-red-800">{t.printFailed}</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </OperationsPanel>

      <OperationsPanel title={t.keysTitle}>
        {tokens.length === 0 ? (
          <p className="text-sm text-[#667085]">{t.keysEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">{t.keysTitle}</caption>
              <thead>
                <tr className="text-start text-xs text-[#667085]">
                  {[t.colChannel, t.colName, t.colKey, t.colCreated, t.colExpires, t.colStatus, t.colActions].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tokens.map((row) => (
                  <tr key={row.id} className="border-t border-[#EFEADC]">
                    <td className="px-2 py-2">{t.channels[row.source]}</td>
                    <td className="px-2 py-2">{row.label || t.noLabel}</td>
                    <td className="px-2 py-2 font-mono text-xs" dir="ltr">…{row.token.slice(-6)}</td>
                    <td className="px-2 py-2">{operationsDate(row.created_at, locale)}</td>
                    <td className="px-2 py-2">{row.expires_at ? operationsDate(row.expires_at, locale) : t.never}</td>
                    <td className="px-2 py-2">{statusOf(row)}</td>
                    <td className="px-2 py-2">
                      {isLive(row, now) && (
                        <button type="button" className={operationsButton} aria-label={`${t.revoke}: ${row.label || t.channels[row.source]} …${row.token.slice(-6)}`} onClick={() => setRevokeFor(row)}>{t.revoke}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OperationsPanel>

      <OperationsPanel title={t.reportTitle}>
        <div className="mb-4 max-w-xs">
          <OperationsField label={t.range}>
            <select id={ids.range} className={operationsInput} value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof RANGES)[number])}>
              {RANGES.map((n) => <option key={n} value={n}>{t.days(n)}</option>)}
            </select>
          </OperationsField>
        </div>
        {reportState === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
        {reportState === "error" && (
          <div className="space-y-3">
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reportError}</p>
            <button type="button" className={operationsButton} onClick={() => setReportRetry((n) => n + 1)}>{t.retry}</button>
          </div>
        )}
        {reportState === "idle" && report && (
          <div className="space-y-6">
            <dl className="grid gap-3 sm:grid-cols-4">
              {[[t.total, report.bookings], [t.attributed, report.attributed], [t.unattributed, report.unattributed], [t.walkIns, report.walk_ins]].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-[#E4DECF] bg-white p-4">
                  <dt className="text-xs font-semibold text-[#667085]">{label}</dt>
                  <dd className="mt-1 text-2xl font-black text-[#101828]">{number.format(Number(value))}</dd>
                </div>
              ))}
            </dl>
            {report.bookings === 0 ? (
              <p className="text-sm text-[#667085]">{t.reportEmpty}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <caption className="mb-2 text-start font-serif text-lg font-bold text-[#101828]">{t.byChannel}</caption>
                    <thead>
                      <tr className="text-xs text-[#667085]">
                        {[t.colChannel, t.total, t.completed, t.lost, t.share].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_channel.map((row) => (
                        <tr key={row.channel} className="border-t border-[#EFEADC]">
                          <th scope="row" className="px-2 py-2 text-start font-semibold">{t.channelNames[row.channel] ?? row.channel}</th>
                          <td className="px-2 py-2">{number.format(row.bookings)}</td>
                          <td className="px-2 py-2">{number.format(row.completed)}</td>
                          <td className="px-2 py-2">{number.format(row.lost)}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-28 overflow-hidden rounded-full bg-[#EFEADC]" aria-hidden="true"><div className="h-full rounded-full bg-[#9B7928]" style={{ width: `${Math.round((row.bookings / maxChannel) * 100)}%` }} /></div>
                              <span>{new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "percent" }).format(report.attributed > 0 ? row.bookings / report.attributed : 0)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <caption className="mb-2 text-start font-serif text-lg font-bold text-[#101828]">{t.byCampaign}</caption>
                    {report.by_campaign.length === 0 ? (
                      <tbody><tr><td className="py-2 text-[#667085]">{t.campaignsEmpty}</td></tr></tbody>
                    ) : (
                      <>
                        <thead>
                          <tr className="text-xs text-[#667085]">
                            {[t.colCampaign, t.colSource, t.colMedium, t.total, t.completed].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {report.by_campaign.map((row) => (
                            <tr key={`${row.utm_source}|${row.utm_medium}|${row.utm_campaign}`} className="border-t border-[#EFEADC]">
                              <td className="px-2 py-2 font-semibold" dir="ltr">{row.utm_campaign ?? t.noLabel}</td>
                              <td className="px-2 py-2" dir="ltr">{row.utm_source ?? t.noLabel}</td>
                              <td className="px-2 py-2" dir="ltr">{row.utm_medium ?? t.noLabel}</td>
                              <td className="px-2 py-2">{number.format(row.bookings)}</td>
                              <td className="px-2 py-2">{number.format(row.completed)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </>
                    )}
                  </table>
                </div>
              </>
            )}
            <p className="text-xs text-[#667085]">{t.reportNote}</p>
          </div>
        )}
      </OperationsPanel>

      {revokeFor && (
        <CommandDialog locale={locale} tone="danger" title={t.revokeTitle} intro={t.revokeIntro}
          facts={[{ label: t.colChannel, value: t.channels[revokeFor.source] }, { label: t.colName, value: revokeFor.label || t.noLabel }, { label: t.colKey, value: `…${revokeFor.token.slice(-6)}` }]}
          reasonLabel={t.revokeReason} confirmLabel={t.revokeConfirm}
          onConfirm={async (reason) => {
            const { error } = await supabase.rpc("revoke_provider_share_token", { p_token_id: revokeFor.id, p_reason: reason });
            if (error) return shareError(error, locale);
            setResult({ success: t.revoked_ok });
            await load();
            return null;
          }}
          onClose={() => setRevokeFor(null)} />
      )}
      <CommandResult locale={locale} error={result.error} success={result.success} onDismiss={() => setResult({})} />
    </div>
  );
}
