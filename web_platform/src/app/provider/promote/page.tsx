"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, ForbiddenNotice, OperationsField, OperationsPanel, isForbidden, operationsButton, operationsDate, operationsInput, sar, useOperationsLocale,
} from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import {
  monthName, parseSarAmount, recentMonths, sponsoredError, statusLabel, waivedReason,
  type CampaignStatus, type SponsoredConfig, type Statement,
} from "@/lib/sponsored";

type Campaign = {
  id: string; branch_id: string | null; city: string | null; category_slug: string | null; monthly_budget_cap_sar: number; status: CampaignStatus;
  starts_on: string; ends_on: string | null; accepted_price_sar: number | null; created_at: string;
};
type Branch = { id: string; name_en: string; name_ar: string; city: string | null };
type Category = { slug: string; name_en: string; name_ar: string };
type Draft = { branchId: string; city: string; category: string; budget: string; startsOn: string; endsOn: string };
type Dialog =
  | { kind: "create"; draft: Draft; cap: number }
  | { kind: "activate" | "pause" | "end" | "budget"; campaign: Campaign };

const emptyDraft: Draft = { branchId: "", city: "", category: "", budget: "", startsOn: "", endsOn: "" };

const copy = {
  en: {
    title: "Promote your business",
    subtitle: "Appear in a separate, labelled Sponsored block above the search results and pay only for each NEW client it brings. You set a monthly budget; the charge stops when it is reached.",
    loading: "Loading your campaigns...", noProvider: "No provider profile is linked to this account. Only the owner of the business can promote it.",
    loadFailed: "We could not load your campaigns.", retry: "Try again",
    unavailableTitle: "Sponsored placement is not switched on yet",
    unavailableBody: "The platform has not opened sponsored places. You can see your campaigns here, but you cannot start one until it opens.",
    priceTitle: "How you are charged",
    priceLine: (price: string, days: number) => `${price} for each new client: someone who clicked your sponsored place, booked within ${days} days and completed the visit, and had never completed a visit with you before.`,
    priceNote: "You accept the price in force when you activate a campaign and are never charged more than that for it. Fees appear on your monthly fee invoice. Your business is always shown with the Sponsored label.",
    campaignsTitle: "Your campaigns", campaignsEmpty: "You have no campaigns yet. Create one below.",
    colTarget: "Campaign", colStatus: "Status", colDates: "Dates", colBudget: "Monthly budget", colSpent: "Charged", colClients: "New clients", colClicks: "Clicks", colActions: "Actions",
    allBranches: "All branches", anyCity: "Any city", anyCategory: "Any category", noEnd: "no end date", from: "from", until: "until",
    activate: "Activate", pause: "Pause", resume: "Resume", end: "End", budget: "Edit budget",
    createTitle: "Create a campaign", createHint: "A new campaign is a draft: nothing is shown or charged until you activate it.",
    branch: "Branch", city: "City", category: "Category", monthlyBudget: "Monthly budget (SAR)", startsOn: "Start date", endsOn: "End date (optional)",
    budgetInvalid: "Enter a budget above 0 with at most two decimals.", datesInvalid: "The end date must not be before the start date.",
    createButton: "Review and create",
    createDialog: "Create this campaign?", createIntro: "It is saved as a draft. You choose when to activate it.",
    createReason: "Why are you creating this campaign?", createConfirm: "Create draft", created: "Campaign created as a draft.",
    activateDialog: "Activate this campaign?", activateReason: "Reason for activating", activateConfirm: "Activate and accept the price",
    activateAck: (price: string, cap: string) => `I agree to pay ${price} for each new client this campaign brings, up to ${cap} a month.`,
    activated: "Campaign activated.",
    pauseDialog: "Pause this campaign?", pauseIntro: "Your business stops appearing in the sponsored block. Clients who already clicked can still be attributed within the window.", pauseReason: "Reason for pausing", pauseConfirm: "Pause campaign", paused: "Campaign paused.",
    endDialog: "End this campaign?", endIntro: "An ended campaign cannot be started again. Charges for clients already brought remain on your statement.", endReason: "Reason for ending", endConfirm: "End campaign", ended: "Campaign ended.",
    budgetDialog: "Change the monthly budget", budgetIntro: "The charge stops once the budget for the month is reached. Fees already charged stay.", budgetReason: "Reason for the change", budgetConfirm: "Save budget", budgetSaved: "Budget saved.",
    factPrice: "Price per new client", factBudget: "Monthly budget", factBranch: "Branch", factCity: "City", factCategory: "Category", factStart: "Starts", factEnd: "Ends",
    statementTitle: "Statement", month: "Month", statementLoading: "Loading the statement...", statementFailed: "We could not load the statement.",
    cardClients: "New clients", cardCharged: "Charged", cardBilled: "On your invoice", cardWaiting: "Waiting for the next invoice", cardWaived: "Not charged", cardCancelled: "Cancelled", cardClicks: "Clicks",
    linesTitle: "Charges and decisions", linesEmpty: "No sponsored visits in this month.", colDate: "Date", colBooking: "Booking", colFee: "Fee", colInvoice: "Invoice", noInvoice: "not invoiced yet",
    cappedNote: (n: number) => `${n} visit(s) were not charged because the monthly budget was reached.`,
  },
  ar: {
    title: "روّج لنشاطك",
    subtitle: "اظهر في مكان منفصل يحمل علامة «إعلان» فوق نتائج البحث، وادفع فقط عن كل عميل جديد يجلبه. أنت تحدّد ميزانية شهرية ويتوقف الاحتساب عند بلوغها.",
    loading: "جارٍ تحميل حملاتك...", noProvider: "لا يوجد ملف مزوّد مرتبط بهذا الحساب. مالك النشاط فقط يمكنه الترويج له.",
    loadFailed: "تعذّر تحميل حملاتك.", retry: "أعد المحاولة",
    unavailableTitle: "الأماكن المموّلة غير مفعّلة بعد",
    unavailableBody: "لم تفتح المنصة الأماكن المموّلة بعد. يمكنك رؤية حملاتك هنا لكن لا يمكنك بدء حملة حتى تُفتح.",
    priceTitle: "كيف يتم الاحتساب",
    priceLine: (price: string, days: number) => `${price} عن كل عميل جديد: شخص ضغط على مكانك المموّل وحجز خلال ${days} يوماً وأتمّ الزيارة، ولم يسبق له إتمام زيارة لديك.`,
    priceNote: "تقبل السعر السائد عند تفعيل الحملة ولن يُحتسب عليك أكثر منه لها. تظهر الرسوم في فاتورة الرسوم الشهرية. يظهر نشاطك دائماً بعلامة إعلان.",
    campaignsTitle: "حملاتك", campaignsEmpty: "ليس لديك حملات بعد. أنشئ واحدة أدناه.",
    colTarget: "الحملة", colStatus: "الحالة", colDates: "التواريخ", colBudget: "الميزانية الشهرية", colSpent: "المحتسب", colClients: "عملاء جدد", colClicks: "النقرات", colActions: "إجراءات",
    allBranches: "كل الفروع", anyCity: "أي مدينة", anyCategory: "أي تصنيف", noEnd: "بلا تاريخ نهاية", from: "من", until: "إلى",
    activate: "تفعيل", pause: "إيقاف مؤقت", resume: "استئناف", end: "إنهاء", budget: "تعديل الميزانية",
    createTitle: "أنشئ حملة", createHint: "الحملة الجديدة مسودة: لا يظهر شيء ولا يُحتسب شيء قبل أن تفعّلها.",
    branch: "الفرع", city: "المدينة", category: "التصنيف", monthlyBudget: "الميزانية الشهرية (ريال)", startsOn: "تاريخ البداية", endsOn: "تاريخ النهاية (اختياري)",
    budgetInvalid: "أدخل ميزانية أكبر من صفر بخانتين عشريتين كحد أقصى.", datesInvalid: "تاريخ النهاية يجب ألا يسبق تاريخ البداية.",
    createButton: "مراجعة وإنشاء",
    createDialog: "إنشاء هذه الحملة؟", createIntro: "تُحفظ كمسودة، وأنت تختار متى تفعّلها.",
    createReason: "لماذا تنشئ هذه الحملة؟", createConfirm: "إنشاء مسودة", created: "تم إنشاء الحملة كمسودة.",
    activateDialog: "تفعيل هذه الحملة؟", activateReason: "سبب التفعيل", activateConfirm: "تفعيل وقبول السعر",
    activateAck: (price: string, cap: string) => `أوافق على دفع ${price} عن كل عميل جديد تجلبه هذه الحملة، بحد أقصى ${cap} شهرياً.`,
    activated: "تم تفعيل الحملة.",
    pauseDialog: "إيقاف هذه الحملة مؤقتاً؟", pauseIntro: "يتوقف ظهور نشاطك في الكتلة المموّلة. العملاء الذين ضغطوا سابقاً يمكن احتسابهم ضمن المدة.", pauseReason: "سبب الإيقاف", pauseConfirm: "إيقاف الحملة", paused: "تم إيقاف الحملة مؤقتاً.",
    endDialog: "إنهاء هذه الحملة؟", endIntro: "لا يمكن تشغيل الحملة المنتهية من جديد. تبقى الرسوم المحتسبة للعملاء الذين جلبتهم في كشفك.", endReason: "سبب الإنهاء", endConfirm: "إنهاء الحملة", ended: "تم إنهاء الحملة.",
    budgetDialog: "تغيير الميزانية الشهرية", budgetIntro: "يتوقف الاحتساب عند بلوغ ميزانية الشهر. الرسوم المحتسبة سابقاً تبقى.", budgetReason: "سبب التغيير", budgetConfirm: "حفظ الميزانية", budgetSaved: "تم حفظ الميزانية.",
    factPrice: "السعر لكل عميل جديد", factBudget: "الميزانية الشهرية", factBranch: "الفرع", factCity: "المدينة", factCategory: "التصنيف", factStart: "تبدأ", factEnd: "تنتهي",
    statementTitle: "الكشف", month: "الشهر", statementLoading: "جارٍ تحميل الكشف...", statementFailed: "تعذّر تحميل الكشف.",
    cardClients: "عملاء جدد", cardCharged: "المحتسب", cardBilled: "في فاتورتك", cardWaiting: "بانتظار الفاتورة القادمة", cardWaived: "غير محتسب", cardCancelled: "ملغى", cardClicks: "النقرات",
    linesTitle: "الرسوم والقرارات", linesEmpty: "لا توجد زيارات مموّلة في هذا الشهر.", colDate: "التاريخ", colBooking: "الحجز", colFee: "الرسوم", colInvoice: "الفاتورة", noInvoice: "لم تُفوتر بعد",
    cappedNote: (n: number) => `لم تُحتسب ${n} زيارة لأن الميزانية الشهرية بلغت حدها.`,
  },
} as const;

export default function ProviderPromotePage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const dir = locale === "ar" ? "rtl" : "ltr";
  const ids = { branch: useId(), city: useId(), category: useId(), budget: useId(), start: useId(), end: useId(), month: useId() };

  const [state, setState] = useState<"loading" | "ready" | "no_provider" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [config, setConfig] = useState<SponsoredConfig | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [month, setMonth] = useState("");
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [statementResult, setStatementResult] = useState<{ key: string; statement: Statement | null; error: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) { setState("no_provider"); return; }
      const { data: provider, error: providerError } = await supabase.from("providers").select("id").eq("owner_id", user.id).maybeSingle();
      if (providerError) throw providerError;
      if (!provider) { setState("no_provider"); return; }
      const [configRes, campaignRes, branchRes, categoryRes] = await Promise.all([
        supabase.rpc("sponsored_config"),
        supabase.from("sponsored_campaigns")
          .select("id, branch_id, city, category_slug, monthly_budget_cap_sar, status, starts_on, ends_on, accepted_price_sar, created_at")
          .eq("provider_id", provider.id).order("created_at", { ascending: false }).limit(200),
        supabase.from("branches").select("id, name_en, name_ar, city").eq("provider_id", provider.id).eq("is_active", true).order("created_at", { ascending: true }).limit(200),
        supabase.from("categories").select("slug, name_en, name_ar, sort_order").eq("is_active", true).order("sort_order", { ascending: true }).limit(200),
      ]);
      for (const res of [configRes, campaignRes, branchRes, categoryRes]) if (res.error) throw res.error;
      const now = Date.now();
      setProviderId(provider.id);
      setConfig(configRes.data as SponsoredConfig);
      setCampaigns(((campaignRes.data ?? []) as Campaign[]).map((row) => ({ ...row, monthly_budget_cap_sar: Number(row.monthly_budget_cap_sar), accepted_price_sar: row.accepted_price_sar === null ? null : Number(row.accepted_price_sar) })));
      setBranches((branchRes.data ?? []) as Branch[]);
      setCategories((categoryRes.data ?? []) as Category[]);
      setNowMs(now);
      setMonth((current) => current || recentMonths(now)[0]);
      setLoadError("");
      setForbidden(false);
      setState("ready");
    } catch (error) {
      if (isForbidden(error)) setForbidden(true);
      setLoadError(sponsoredError(error, locale));
      setState("error");
    }
  }, [locale]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The statement belongs to the month it was asked for; until the stored key matches the wanted one it is loading.
  const statementKey = `${providerId}|${month}|${locale}|${revision}`;
  useEffect(() => {
    if (state !== "ready" || !providerId || !month) return;
    let active = true;
    void supabase.rpc("sponsored_statement", { p_provider_id: providerId, p_month: month }).then(({ data, error }) => {
      if (active) setStatementResult({ key: statementKey, statement: error ? null : (data as Statement), error: error ? sponsoredError(error, locale) : "" });
    });
    return () => { active = false; };
  }, [state, providerId, month, locale, statementKey]);
  const statementCurrent = statementResult?.key === statementKey ? statementResult : null;
  const statement = statementCurrent?.statement ?? null;

  const months = useMemo(() => (nowMs ? recentMonths(nowMs) : []), [nowMs]);
  const cities = useMemo(() => [...new Set(branches.map((b) => b.city).filter((c): c is string => Boolean(c)))].sort(), [branches]);
  const available = Boolean(config?.configured);
  const price = config?.price_per_new_client_sar ?? null;

  const branchName = useCallback((id: string | null) => {
    if (!id) return t.allBranches;
    const branch = branches.find((b) => b.id === id);
    return branch ? (locale === "ar" ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar) : t.allBranches;
  }, [branches, locale, t.allBranches]);
  const categoryName = useCallback((slug: string | null) => {
    if (!slug) return t.anyCategory;
    const category = categories.find((c) => c.slug === slug);
    return category ? (locale === "ar" ? category.name_ar || category.name_en : category.name_en || category.name_ar) : slug;
  }, [categories, locale, t.anyCategory]);
  const targetName = (c: Campaign) => `${branchName(c.branch_id)} · ${c.city ?? t.anyCity} · ${categoryName(c.category_slug)}`;
  const dateRange = (c: Campaign) => `${t.from} ${c.starts_on}${c.ends_on ? ` ${t.until} ${c.ends_on}` : ` · ${t.noEnd}`}`;

  const finish = (success: string) => { setResult({ success }); setRevision((n) => n + 1); void load(); };

  const submitDraft = (event: React.FormEvent) => {
    event.preventDefault();
    const cap = parseSarAmount(draft.budget);
    if (cap === null) { setFormError(t.budgetInvalid); return; }
    if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) { setFormError(t.datesInvalid); return; }
    setFormError("");
    setDialog({ kind: "create", draft, cap });
  };

  const create = async (d: Draft, cap: number, reason: string): Promise<string | null> => {
    const { error } = await supabase.rpc("create_sponsored_campaign", {
      p_provider_id: providerId, p_branch_id: d.branchId || null, p_city: d.city || null, p_category_slug: d.category || null,
      p_monthly_budget_cap_sar: cap, p_starts_on: d.startsOn || null, p_ends_on: d.endsOn || null, p_reason: reason,
    });
    if (error) return sponsoredError(error, locale);
    setDraft(emptyDraft);
    finish(t.created);
    return null;
  };
  const changeStatus = async (campaign: Campaign, status: "active" | "paused" | "ended", reason: string, success: string): Promise<string | null> => {
    const { error } = await supabase.rpc("set_sponsored_campaign_status", { p_campaign_id: campaign.id, p_status: status, p_reason: reason });
    if (error) return sponsoredError(error, locale);
    finish(success);
    return null;
  };
  const changeBudget = async (campaign: Campaign, amount: string, reason: string): Promise<string | null> => {
    const cap = parseSarAmount(amount);
    if (cap === null) return t.budgetInvalid;
    const { error } = await supabase.rpc("update_sponsored_campaign", { p_campaign_id: campaign.id, p_monthly_budget_cap_sar: cap, p_ends_on: campaign.ends_on, p_reason: reason });
    if (error) return sponsoredError(error, locale);
    finish(t.budgetSaved);
    return null;
  };

  const stat = (id: string) => statement?.campaigns.find((c) => c.campaign_id === id);
  const money = (n: number) => sar(Number(n), locale);
  const count = (n: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA").format(n);
  const actionClass = `${operationsButton} !px-3 !py-1.5 !text-xs`;

  const renderDialog = () => {
    if (!dialog) return null;
    const close = () => setDialog(null);
    if (dialog.kind === "create") {
      const { draft: d, cap } = dialog;
      return (
        <CommandDialog
          locale={locale} title={t.createDialog} intro={t.createIntro} reasonLabel={t.createReason} confirmLabel={t.createConfirm} onClose={close}
          facts={[
            { label: t.factBranch, value: branchName(d.branchId || null) }, { label: t.factCity, value: d.city || t.anyCity },
            { label: t.factCategory, value: categoryName(d.category || null) }, { label: t.factBudget, value: money(cap) },
            { label: t.factStart, value: d.startsOn || "-" }, { label: t.factEnd, value: d.endsOn || t.noEnd },
          ]}
          onConfirm={(reason) => create(d, cap, reason)}
        />
      );
    }
    const c = dialog.campaign;
    if (dialog.kind === "activate") {
      return (
        <CommandDialog
          locale={locale} title={t.activateDialog} reasonLabel={t.activateReason} confirmLabel={t.activateConfirm} onClose={close}
          facts={[{ label: t.colTarget, value: targetName(c) }, { label: t.factPrice, value: price === null ? "-" : money(price) }, { label: t.factBudget, value: money(c.monthly_budget_cap_sar) }]}
          acknowledgement={price === null ? undefined : t.activateAck(money(price), money(c.monthly_budget_cap_sar))}
          onConfirm={(reason) => changeStatus(c, "active", reason, t.activated)}
        />
      );
    }
    if (dialog.kind === "pause") {
      return (
        <CommandDialog
          locale={locale} title={t.pauseDialog} intro={t.pauseIntro} reasonLabel={t.pauseReason} confirmLabel={t.pauseConfirm} onClose={close}
          facts={[{ label: t.colTarget, value: targetName(c) }]}
          onConfirm={(reason) => changeStatus(c, "paused", reason, t.paused)}
        />
      );
    }
    if (dialog.kind === "end") {
      return (
        <CommandDialog
          locale={locale} tone="danger" title={t.endDialog} intro={t.endIntro} reasonLabel={t.endReason} confirmLabel={t.endConfirm} onClose={close}
          facts={[{ label: t.colTarget, value: targetName(c) }]}
          onConfirm={(reason) => changeStatus(c, "ended", reason, t.ended)}
        />
      );
    }
    return (
      <CommandDialog
        locale={locale} title={t.budgetDialog} intro={t.budgetIntro} reasonLabel={t.budgetReason} confirmLabel={t.budgetConfirm} onClose={close}
        facts={[{ label: t.colTarget, value: targetName(c) }, { label: t.factBudget, value: money(c.monthly_budget_cap_sar) }]}
        field={{ label: t.monthlyBudget, initial: String(c.monthly_budget_cap_sar), pattern: /^\d{1,7}(\.\d{1,2})?$/, error: t.budgetInvalid, ltr: true }}
        onConfirm={(reason, amount) => changeBudget(c, amount, reason)}
      />
    );
  };

  return (
    <div dir={dir} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#667085]">{t.subtitle}</p>
      </header>

      {state === "loading" && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {state === "no_provider" && <p role="status" className="rounded-xl border border-[#D8D2C5] bg-white p-4 text-sm">{t.noProvider}</p>}
      {state === "error" && (forbidden ? <ForbiddenNotice locale={locale} /> : (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span><strong>{t.loadFailed}</strong> <bdi dir="ltr">{loadError}</bdi></span>
          <button type="button" className={operationsButton} onClick={() => { setState("loading"); void load(); }}>{t.retry}</button>
        </div>
      ))}

      {state === "ready" && (
        <>
          {available && price !== null ? (
            <OperationsPanel title={t.priceTitle}>
              <p className="text-sm leading-6">{t.priceLine(money(price), config?.attribution_window_days ?? 0)}</p>
              <p className="mt-2 text-xs leading-5 text-[#667085]">{t.priceNote}</p>
            </OperationsPanel>
          ) : (
            <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-black">{t.unavailableTitle}</p>
              <p className="mt-1 leading-6">{t.unavailableBody}</p>
            </div>
          )}

          <OperationsPanel title={t.campaignsTitle}>
            {campaigns.length === 0 ? <p className="text-sm text-[#667085]">{t.campaignsEmpty}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-[#ECE7D9] text-xs text-[#667085]">
                      {[t.colTarget, t.colStatus, t.colDates, t.colBudget, t.colSpent, t.colClients, t.colClicks, t.colActions].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const s = stat(c.id);
                      const name = targetName(c);
                      return (
                        <tr key={c.id} className="border-b border-[#F2EEE2] align-top">
                          <th scope="row" className="max-w-[240px] px-2 py-3 text-start font-semibold">{name}</th>
                          <td className="px-2 py-3"><span className="rounded-full bg-[#F8F3E4] px-2.5 py-1 text-xs font-bold text-[#725517]">{statusLabel[locale][c.status]}</span></td>
                          <td className="px-2 py-3 text-xs" dir="ltr">{dateRange(c)}</td>
                          <td className="px-2 py-3">{money(c.monthly_budget_cap_sar)}</td>
                          <td className="px-2 py-3">{s ? money(s.spent_sar) : "-"}</td>
                          <td className="px-2 py-3">{s ? count(s.new_clients) : "-"}</td>
                          <td className="px-2 py-3">{s ? count(s.clicks) : "-"}</td>
                          <td className="px-2 py-3">
                            {c.status !== "ended" && (
                              <div className="flex flex-wrap gap-2">
                                {(c.status === "draft" || c.status === "paused") && (
                                  <button type="button" className={actionClass} disabled={!available} aria-label={`${c.status === "paused" ? t.resume : t.activate}: ${name}`} onClick={() => setDialog({ kind: "activate", campaign: c })}>{c.status === "paused" ? t.resume : t.activate}</button>
                                )}
                                {c.status === "active" && (
                                  <button type="button" className={actionClass} aria-label={`${t.pause}: ${name}`} onClick={() => setDialog({ kind: "pause", campaign: c })}>{t.pause}</button>
                                )}
                                <button type="button" className={actionClass} aria-label={`${t.budget}: ${name}`} onClick={() => setDialog({ kind: "budget", campaign: c })}>{t.budget}</button>
                                <button type="button" className={actionClass} aria-label={`${t.end}: ${name}`} onClick={() => setDialog({ kind: "end", campaign: c })}>{t.end}</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </OperationsPanel>

          <OperationsPanel title={t.createTitle}>
            <p className="mb-4 text-sm text-[#667085]">{t.createHint}</p>
            <form onSubmit={submitDraft} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" noValidate>
              <OperationsField label={t.branch}>
                <select id={ids.branch} className={operationsInput} value={draft.branchId} disabled={!available} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}>
                  <option value="">{t.allBranches}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{locale === "ar" ? b.name_ar || b.name_en : b.name_en || b.name_ar}</option>)}
                </select>
              </OperationsField>
              <OperationsField label={t.city}>
                <select id={ids.city} className={operationsInput} value={draft.city} disabled={!available} onChange={(e) => setDraft({ ...draft, city: e.target.value })}>
                  <option value="">{t.anyCity}</option>
                  {cities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </OperationsField>
              <OperationsField label={t.category}>
                <select id={ids.category} className={operationsInput} value={draft.category} disabled={!available} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option value="">{t.anyCategory}</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{locale === "ar" ? c.name_ar || c.name_en : c.name_en || c.name_ar}</option>)}
                </select>
              </OperationsField>
              <OperationsField label={t.monthlyBudget}>
                <input id={ids.budget} className={operationsInput} inputMode="decimal" dir="ltr" value={draft.budget} disabled={!available} aria-invalid={Boolean(formError)} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} />
              </OperationsField>
              <OperationsField label={t.startsOn}>
                <input id={ids.start} type="date" className={operationsInput} dir="ltr" value={draft.startsOn} disabled={!available} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} />
              </OperationsField>
              <OperationsField label={t.endsOn}>
                <input id={ids.end} type="date" className={operationsInput} dir="ltr" value={draft.endsOn} disabled={!available} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} />
              </OperationsField>
              <div className="md:col-span-2 xl:col-span-3">
                {formError && <p role="alert" className="mb-3 text-sm font-semibold text-red-700">{formError}</p>}
                <button type="submit" className={operationsButton} disabled={!available}>{t.createButton}</button>
              </div>
            </form>
          </OperationsPanel>

          <OperationsPanel title={t.statementTitle}>
            <div className="mb-4 max-w-xs">
              <OperationsField label={t.month}>
                <select id={ids.month} className={operationsInput} value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m} value={m}>{monthName(m, locale)}</option>)}
                </select>
              </OperationsField>
            </div>
            {!statementCurrent && <p role="status" className="text-sm text-[#667085]">{t.statementLoading}</p>}
            {statementCurrent?.error && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <span><strong>{t.statementFailed}</strong> <bdi dir="ltr">{statementCurrent.error}</bdi></span>
                <button type="button" className={operationsButton} onClick={() => setRevision((n) => n + 1)}>{t.retry}</button>
              </div>
            )}
            {statement && (
              <div className="space-y-5">
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    [t.cardClients, count(statement.totals.new_clients)], [t.cardCharged, money(statement.totals.accrued_sar)],
                    [t.cardBilled, money(statement.totals.billed_sar)], [t.cardWaiting, money(statement.totals.unbilled_sar)],
                    [t.cardWaived, money(statement.totals.waived_sar)], [t.cardCancelled, money(statement.totals.void_sar)], [t.cardClicks, count(statement.clicks)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[#ECE7D9] bg-[#FBF9F2] p-3">
                      <dt className="text-xs font-semibold text-[#667085]">{label}</dt>
                      <dd className="mt-1 text-lg font-black">{value}</dd>
                    </div>
                  ))}
                </dl>
                {statement.totals.waived_for_cap > 0 && <p className="text-xs text-[#667085]">{t.cappedNote(statement.totals.waived_for_cap)}</p>}
                <h3 className="font-serif text-base font-bold">{t.linesTitle}</h3>
                {statement.lines.length === 0 ? <p className="text-sm text-[#667085]">{t.linesEmpty}</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-[#ECE7D9] text-xs text-[#667085]">
                          {[t.colDate, t.colBooking, t.colStatus, t.colFee, t.colInvoice].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {statement.lines.map((line) => (
                          <tr key={line.attribution_id} className="border-b border-[#F2EEE2]">
                            <td className="px-2 py-2.5">{operationsDate(line.created_at, locale)}</td>
                            <td className="px-2 py-2.5 font-mono text-xs" dir="ltr">{line.booking_id.slice(0, 8)}</td>
                            <td className="px-2 py-2.5">
                              {statusLabel[locale][line.status]}
                              {line.status !== "accrued" && line.status_reason && <span className="block text-xs text-[#667085]">{waivedReason[locale][line.status_reason] ?? line.status_reason}</span>}
                            </td>
                            <td className="px-2 py-2.5">{money(line.fee_amount_sar)}</td>
                            <td className="px-2 py-2.5 text-xs" dir="ltr">{line.status === "accrued" ? (line.invoice_number ?? t.noInvoice) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </OperationsPanel>
        </>
      )}

      {renderDialog()}
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />
    </div>
  );
}
