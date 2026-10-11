"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CommandResult, ForbiddenNotice, OperationsField, OperationsPanel, isForbidden, operationsButton, operationsDate, operationsInput, sar, useOperationsLocale,
} from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";
import {
  monthName, parseSarAmount, recentMonths, settingLabel, sponsoredError, statusLabel, waivedReason,
  type AttributionStatus, type CampaignStatus, type SponsoredConfig,
} from "@/lib/sponsored";

type Totals = {
  clicks: number; new_clients: number; accrued_sar: number; billed_sar: number; unbilled_sar: number;
  waived_count: number; waived_sar: number; void_count: number; void_sar: number;
  campaigns_active: number; campaigns_paused: number; campaigns_draft: number; campaigns_ended: number;
};
type CampaignRow = {
  campaign_id: string; provider_id: string; business_name_en: string; business_name_ar: string; status: CampaignStatus;
  monthly_budget_cap_sar: number; accepted_price_sar: number | null; spent_sar: number; new_clients: number;
};
type AttributionRow = {
  attribution_id: string; campaign_id: string; provider_id: string; business_name_en: string; business_name_ar: string; booking_id: string;
  is_new_client: boolean; fee_amount_sar: number; status: AttributionStatus; status_reason: string | null; billed: boolean; created_at: string;
};
type Overview = { month: string; currency: "SAR"; config: SponsoredConfig; totals: Totals; campaigns: CampaignRow[]; attributions: AttributionRow[] };
type SettingKey = "sponsored.enabled" | "sponsored.price_per_new_client_sar" | "sponsored.max_slots_per_search" | "sponsored.attribution_window_days";
type Dialog = { kind: "setting"; key: SettingKey } | { kind: "decide"; row: AttributionRow; action: "void" | "waive" };

const SETTINGS: SettingKey[] = ["sponsored.enabled", "sponsored.price_per_new_client_sar", "sponsored.max_slots_per_search", "sponsored.attribution_window_days"];

const copy = {
  en: {
    title: "Sponsored placement",
    subtitle: "Labelled sponsored places on the discover page, paid per NEW client. The platform owner sets the price; nothing runs until every setting below has a value and the switch is on.",
    loading: "Loading sponsored placement...", loadFailed: "We could not load sponsored placement.", retry: "Try again",
    settingsTitle: "Owner settings", settingsHint: "Changing a value never changes a fee that was already charged: each fee keeps the price it was charged at. Every change asks for a reason and is audited.",
    stateOn: "Running", stateOff: "Not running", missingNote: (names: string) => `Still unset: ${names}.`, readyNote: "All four settings are set and the switch is on.", switchOffNote: "All values are set, but the master switch is off.",
    colSetting: "Setting", colValue: "Value", colActions: "Actions", unset: "Not set", on: "On", off: "Off", days: (n: number) => `${n} days`, places: (n: number) => `${n} places`,
    edit: "Edit", switchOn: "Switch on", switchOff: "Switch off",
    settingDialog: "Change a sponsored setting", settingReason: "Reason for the change", settingConfirm: "Save", settingSaved: "Setting saved.", settingPending: "Sent for approval: a different owner must approve the new price per new client before it applies. It is listed under Approvals.",
    factSetting: "Setting", factCurrent: "Current value", factNew: "New value", valueLabel: "New value",
    effectWillStayOff: (names: string) => `It will stay inactive until these are also set: ${names}.`,
    effectOn: "Providers can activate campaigns and the sponsored block starts to appear on the discover page.",
    effectOff: "The sponsored block disappears and no new fee accrues. Campaigns and fees already recorded stay.",
    priceInvalid: "Enter an amount above 0 with at most two decimals.", slotsInvalid: "Enter a whole number from 1 to 10.", windowInvalid: "Enter a whole number of days from 1 to 365.",
    month: "Month", totalsTitle: "This month in numbers",
    cardClicks: "Clicks", cardClients: "New clients charged", cardAccrued: "Revenue accrued", cardBilled: "On invoices", cardWaiting: "Waiting for invoices", cardWaived: "Not charged", cardCancelled: "Cancelled", cardCampaigns: "Active campaigns",
    campaignsTitle: "Campaigns", campaignsEmpty: "No campaigns exist yet.", colProvider: "Provider", colStatus: "Status", colBudget: "Monthly budget", colPrice: "Accepted price", colSpent: "Charged", colClients: "New clients",
    fees: "Fees", feesEmpty: "No sponsored visits in this month.", colDate: "Date", colBooking: "Booking", colFee: "Fee", colReason: "Reason",
    waive: "Waive", voidAction: "Void", billedNote: "On an invoice", notNew: "Returning client",
    decideWaive: "Waive this fee?", decideVoid: "Void this attribution?",
    decideWaiveIntro: "The visit was legitimate and the platform forgives the fee. It will not be billed.", decideVoidIntro: "The attribution was wrong (for example fraud or a duplicate account). It will not be billed.",
    decideReason: "Reason (kept in the audit log)", decideWaiveConfirm: "Waive the fee", decideVoidConfirm: "Void the attribution", decided: "Decision recorded.",
    factProvider: "Provider", factBooking: "Booking", factFee: "Fee",
  },
  ar: {
    title: "الأماكن المموّلة",
    subtitle: "أماكن مموّلة وموسومة في صفحة الاستكشاف، تُدفع عن كل عميل جديد. مالك المنصة يحدّد السعر، ولا يعمل شيء قبل أن يكون لكل إعداد أدناه قيمة وأن يكون المفتاح مفعّلاً.",
    loading: "جارٍ تحميل الأماكن المموّلة...", loadFailed: "تعذّر تحميل الأماكن المموّلة.", retry: "أعد المحاولة",
    settingsTitle: "إعدادات المالك", settingsHint: "تغيير قيمة لا يغيّر رسوماً سبق احتسابها: كل رسم يحتفظ بالسعر الذي احتُسب به. كل تغيير يتطلب سبباً ويُسجَّل في سجل التدقيق.",
    stateOn: "يعمل", stateOff: "لا يعمل", missingNote: (names: string) => `ما زال غير محدد: ${names}.`, readyNote: "الإعدادات الأربعة محددة والمفتاح مفعّل.", switchOffNote: "كل القيم محددة لكن المفتاح الرئيسي متوقف.",
    colSetting: "الإعداد", colValue: "القيمة", colActions: "إجراءات", unset: "غير محدد", on: "مفعّل", off: "متوقف", days: (n: number) => `${n} يوماً`, places: (n: number) => `${n} أماكن`,
    edit: "تعديل", switchOn: "تفعيل", switchOff: "إيقاف",
    settingDialog: "تغيير إعداد الأماكن المموّلة", settingReason: "سبب التغيير", settingConfirm: "حفظ", settingSaved: "تم حفظ الإعداد.", settingPending: "أُرسل للاعتماد: يجب أن يعتمد مالك آخر السعر الجديد لكل عميل جديد قبل تطبيقه. يظهر الطلب في صفحة الاعتمادات.",
    factSetting: "الإعداد", factCurrent: "القيمة الحالية", factNew: "القيمة الجديدة", valueLabel: "القيمة الجديدة",
    effectWillStayOff: (names: string) => `سيبقى غير فعّال حتى يتم تحديد: ${names}.`,
    effectOn: "يمكن للمزوّدين تفعيل الحملات وتبدأ الكتلة المموّلة بالظهور في صفحة الاستكشاف.",
    effectOff: "تختفي الكتلة المموّلة ولا تُحتسب رسوم جديدة. الحملات والرسوم المسجلة سابقاً تبقى.",
    priceInvalid: "أدخل مبلغاً أكبر من صفر بخانتين عشريتين كحد أقصى.", slotsInvalid: "أدخل عدداً صحيحاً من 1 إلى 10.", windowInvalid: "أدخل عدداً صحيحاً من الأيام بين 1 و365.",
    month: "الشهر", totalsTitle: "هذا الشهر بالأرقام",
    cardClicks: "النقرات", cardClients: "عملاء جدد محتسبون", cardAccrued: "الإيراد المحتسب", cardBilled: "في الفواتير", cardWaiting: "بانتظار الفواتير", cardWaived: "غير محتسب", cardCancelled: "ملغى", cardCampaigns: "حملات نشطة",
    campaignsTitle: "الحملات", campaignsEmpty: "لا توجد حملات بعد.", colProvider: "المزوّد", colStatus: "الحالة", colBudget: "الميزانية الشهرية", colPrice: "السعر المقبول", colSpent: "المحتسب", colClients: "عملاء جدد",
    fees: "الرسوم", feesEmpty: "لا توجد زيارات مموّلة في هذا الشهر.", colDate: "التاريخ", colBooking: "الحجز", colFee: "الرسوم", colReason: "السبب",
    waive: "تنازل", voidAction: "إلغاء", billedNote: "في فاتورة", notNew: "عميل سابق",
    decideWaive: "التنازل عن هذه الرسوم؟", decideVoid: "إلغاء هذا الاحتساب؟",
    decideWaiveIntro: "الزيارة سليمة وتتنازل المنصة عن الرسوم. لن تُفوتر.", decideVoidIntro: "الاحتساب كان خاطئاً (مثل احتيال أو حساب مكرر). لن يُفوتر.",
    decideReason: "السبب (يُحفظ في سجل التدقيق)", decideWaiveConfirm: "التنازل عن الرسوم", decideVoidConfirm: "إلغاء الاحتساب", decided: "تم تسجيل القرار.",
    factProvider: "المزوّد", factBooking: "الحجز", factFee: "الرسوم",
  },
} as const;

export default function AdminSponsoredPage() {
  const locale = useOperationsLocale();
  const t = copy[locale];
  const monthId = useId();
  const [month, setMonth] = useState("");
  const [nowMs, setNowMs] = useState(0);
  const [revision, setRevision] = useState(0);
  const [answer, setAnswer] = useState<{ key: string; overview: Overview | null; error: string; forbidden: boolean } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setNowMs(now);
      setMonth((current) => current || recentMonths(now)[0]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const key = `${month}|${locale}|${revision}`;
  useEffect(() => {
    if (!month) return;
    let active = true;
    void supabase.rpc("admin_sponsored_overview", { p_month: month }).then(({ data, error }) => {
      if (!active) return;
      setAnswer({ key, overview: error ? null : (data as Overview), error: error ? sponsoredError(error, locale) : "", forbidden: Boolean(error && isForbidden(error)) });
    });
    return () => { active = false; };
  }, [key, month, locale]);

  const current = answer?.key === key ? answer : null;
  const overview = current?.overview ?? null;
  const months = useMemo(() => (nowMs ? recentMonths(nowMs) : []), [nowMs]);
  const money = (n: number) => sar(Number(n), locale);
  const count = (n: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA").format(n);
  const providerName = (row: { business_name_en: string; business_name_ar: string }) => (locale === "ar" ? row.business_name_ar || row.business_name_en : row.business_name_en || row.business_name_ar);
  const actionClass = `${operationsButton} !px-3 !py-1.5 !text-xs`;
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  const valueText = (config: SponsoredConfig, setting: SettingKey): string => {
    if (setting === "sponsored.enabled") return config.enabled ? t.on : t.off;
    if (setting === "sponsored.price_per_new_client_sar") return config.price_per_new_client_sar === null ? t.unset : money(config.price_per_new_client_sar);
    if (setting === "sponsored.max_slots_per_search") return config.max_slots_per_search === null ? t.unset : t.places(config.max_slots_per_search);
    return config.attribution_window_days === null ? t.unset : t.days(config.attribution_window_days);
  };
  const parseSetting = (setting: SettingKey, text: string): number | null => {
    if (setting === "sponsored.price_per_new_client_sar") return parseSarAmount(text);
    const whole = /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
    if (whole === null) return null;
    if (setting === "sponsored.max_slots_per_search") return whole >= 1 && whole <= 10 ? whole : null;
    return whole >= 1 && whole <= 365 ? whole : null;
  };

  const saveSetting = async (setting: SettingKey, value: number | boolean, reason: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("admin_update_platform_setting", { p_key: setting, p_value: value, p_reason: reason });
    if (error) return sponsoredError(error, locale);
    // SECFIX-2 R2-L7: the price per new client changes only after a different owner approves it.
    setResult({ success: (data as { status?: string } | null)?.status === "pending_approval" ? t.settingPending : t.settingSaved });
    refresh();
    return null;
  };
  const decide = async (row: AttributionRow, action: "void" | "waive", reason: string): Promise<string | null> => {
    const { error } = await supabase.rpc("admin_void_sponsored_attribution", { p_attribution_id: row.attribution_id, p_action: action, p_reason: reason });
    if (error) return sponsoredError(error, locale);
    setResult({ success: t.decided });
    refresh();
    return null;
  };

  const renderDialog = () => {
    if (!dialog || !overview) return null;
    const close = () => setDialog(null);
    if (dialog.kind === "decide") {
      const { row, action } = dialog;
      const isVoid = action === "void";
      return (
        <CommandDialog
          locale={locale} tone={isVoid ? "danger" : "default"} title={isVoid ? t.decideVoid : t.decideWaive} intro={isVoid ? t.decideVoidIntro : t.decideWaiveIntro}
          reasonLabel={t.decideReason} confirmLabel={isVoid ? t.decideVoidConfirm : t.decideWaiveConfirm} onClose={close}
          facts={[{ label: t.factProvider, value: providerName(row) }, { label: t.factBooking, value: row.booking_id.slice(0, 8) }, { label: t.factFee, value: money(row.fee_amount_sar) }]}
          onConfirm={(reason) => decide(row, action, reason)}
        />
      );
    }
    const setting = dialog.key;
    const config = overview.config;
    const facts = [{ label: t.factSetting, value: settingLabel[locale][setting] }, { label: t.factCurrent, value: valueText(config, setting) }];
    if (setting === "sponsored.enabled") {
      const turningOn = !config.enabled;
      const missing = config.missing.map((m) => settingLabel[locale][m] ?? m).join(", ");
      const effects = turningOn ? [t.effectOn, ...(config.missing.length ? [t.effectWillStayOff(missing)] : [])] : [t.effectOff];
      return (
        <CommandDialog
          locale={locale} title={t.settingDialog} reasonLabel={t.settingReason} confirmLabel={turningOn ? t.switchOn : t.switchOff} onClose={close}
          facts={[...facts, { label: t.factNew, value: turningOn ? t.on : t.off }]} effects={effects} tone={turningOn ? "default" : "danger"}
          onConfirm={(reason) => saveSetting(setting, turningOn, reason)}
        />
      );
    }
    const invalid = setting === "sponsored.price_per_new_client_sar" ? t.priceInvalid : setting === "sponsored.max_slots_per_search" ? t.slotsInvalid : t.windowInvalid;
    const pattern = setting === "sponsored.price_per_new_client_sar" ? /^\d{1,7}(\.\d{1,2})?$/ : /^\d{1,3}$/;
    return (
      <CommandDialog
        locale={locale} title={t.settingDialog} reasonLabel={t.settingReason} confirmLabel={t.settingConfirm} onClose={close} facts={facts}
        field={{ label: t.valueLabel, pattern, error: invalid, ltr: true }}
        onConfirm={(reason, text) => {
          const value = parseSetting(setting, text);
          return value === null ? Promise.resolve(invalid) : saveSetting(setting, value, reason);
        }}
      />
    );
  };

  const config = overview?.config ?? null;
  const missingNames = config ? config.missing.map((m) => settingLabel[locale][m] ?? m).join(", ") : "";

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="space-y-6 text-[#101828]">
      <header>
        <h1 className="font-serif text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#667085]">{t.subtitle}</p>
      </header>

      {!current && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {current?.error && (current.forbidden ? <ForbiddenNotice locale={locale} /> : (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span><strong>{t.loadFailed}</strong> <bdi dir="ltr">{current.error}</bdi></span>
          <button type="button" className={operationsButton} onClick={refresh}>{t.retry}</button>
        </div>
      ))}

      {overview && config && (
        <>
          <OperationsPanel title={t.settingsTitle}>
            <p role="status" className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-black ${config.configured ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{config.configured ? t.stateOn : t.stateOff}</p>
            <p className="mb-4 text-sm text-[#475467]">
              {config.configured ? t.readyNote : config.missing.length ? t.missingNote(missingNames) : t.switchOffNote}
            </p>
            <p className="mb-4 text-xs text-[#667085]">{t.settingsHint}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-[#ECE7D9] text-xs text-[#667085]">
                    {[t.colSetting, t.colValue, t.colActions].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SETTINGS.map((setting) => (
                    <tr key={setting} className="border-b border-[#F2EEE2]">
                      <th scope="row" className="px-2 py-3 text-start font-semibold">{settingLabel[locale][setting]}</th>
                      <td className="px-2 py-3">{valueText(config, setting)}</td>
                      <td className="px-2 py-3">
                        <button type="button" className={actionClass} aria-label={`${setting === "sponsored.enabled" ? (config.enabled ? t.switchOff : t.switchOn) : t.edit}: ${settingLabel[locale][setting]}`} onClick={() => setDialog({ kind: "setting", key: setting })}>
                          {setting === "sponsored.enabled" ? (config.enabled ? t.switchOff : t.switchOn) : t.edit}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OperationsPanel>

          <div className="max-w-xs">
            <OperationsField label={t.month}>
              <select id={monthId} className={operationsInput} value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => <option key={m} value={m}>{monthName(m, locale)}</option>)}
              </select>
            </OperationsField>
          </div>

          <OperationsPanel title={t.totalsTitle}>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [t.cardClicks, count(overview.totals.clicks)], [t.cardClients, count(overview.totals.new_clients)], [t.cardAccrued, money(overview.totals.accrued_sar)],
                [t.cardBilled, money(overview.totals.billed_sar)], [t.cardWaiting, money(overview.totals.unbilled_sar)],
                [t.cardWaived, `${count(overview.totals.waived_count)} · ${money(overview.totals.waived_sar)}`],
                [t.cardCancelled, `${count(overview.totals.void_count)} · ${money(overview.totals.void_sar)}`], [t.cardCampaigns, count(overview.totals.campaigns_active)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#ECE7D9] bg-[#FBF9F2] p-3">
                  <dt className="text-xs font-semibold text-[#667085]">{label}</dt>
                  <dd className="mt-1 text-lg font-black">{value}</dd>
                </div>
              ))}
            </dl>
          </OperationsPanel>

          <OperationsPanel title={t.campaignsTitle}>
            {overview.campaigns.length === 0 ? <p className="text-sm text-[#667085]">{t.campaignsEmpty}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-[#ECE7D9] text-xs text-[#667085]">
                      {[t.colProvider, t.colStatus, t.colBudget, t.colPrice, t.colSpent, t.colClients].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.campaigns.map((c) => (
                      <tr key={c.campaign_id} className="border-b border-[#F2EEE2]">
                        <th scope="row" className="px-2 py-2.5 text-start font-semibold">{providerName(c)}</th>
                        <td className="px-2 py-2.5">{statusLabel[locale][c.status]}</td>
                        <td className="px-2 py-2.5">{money(c.monthly_budget_cap_sar)}</td>
                        <td className="px-2 py-2.5">{c.accepted_price_sar === null ? "-" : money(c.accepted_price_sar)}</td>
                        <td className="px-2 py-2.5">{money(c.spent_sar)}</td>
                        <td className="px-2 py-2.5">{count(c.new_clients)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OperationsPanel>

          <OperationsPanel title={t.fees}>
            {overview.attributions.length === 0 ? <p className="text-sm text-[#667085]">{t.feesEmpty}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-[#ECE7D9] text-xs text-[#667085]">
                      {[t.colDate, t.colProvider, t.colBooking, t.colStatus, t.colFee, t.colReason, t.colActions].map((h) => <th key={h} scope="col" className="px-2 py-2 text-start font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {overview.attributions.map((row) => {
                      const name = providerName(row);
                      const decidable = row.status === "accrued" && !row.billed;
                      return (
                        <tr key={row.attribution_id} className="border-b border-[#F2EEE2] align-top">
                          <td className="px-2 py-2.5">{operationsDate(row.created_at, locale)}</td>
                          <th scope="row" className="px-2 py-2.5 text-start font-semibold">{name}</th>
                          <td className="px-2 py-2.5 font-mono text-xs" dir="ltr">{row.booking_id.slice(0, 8)}</td>
                          <td className="px-2 py-2.5">{statusLabel[locale][row.status]}</td>
                          <td className="px-2 py-2.5">{money(row.fee_amount_sar)}</td>
                          <td className="px-2 py-2.5 text-xs">{row.status === "accrued" ? (row.billed ? t.billedNote : "-") : (row.status_reason ? waivedReason[locale][row.status_reason] ?? row.status_reason : "-")}</td>
                          <td className="px-2 py-2.5">
                            {decidable && (
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={actionClass} aria-label={`${t.waive}: ${name} ${row.booking_id.slice(0, 8)}`} onClick={() => setDialog({ kind: "decide", row, action: "waive" })}>{t.waive}</button>
                                <button type="button" className={actionClass} aria-label={`${t.voidAction}: ${name} ${row.booking_id.slice(0, 8)}`} onClick={() => setDialog({ kind: "decide", row, action: "void" })}>{t.voidAction}</button>
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
        </>
      )}

      {renderDialog()}
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />
    </div>
  );
}
