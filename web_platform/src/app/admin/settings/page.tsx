"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ForbiddenNotice, isForbidden, useOperationsLocale } from "@/components/operations-ui";

// Platform settings that the database actually reads: booking hold expiry (expire_stale_booking_holds),
// loyalty (booking pricing and reward triggers) and referral rewards. Every change goes through
// admin_update_platform_setting, which validates the value, requires a reason and writes the audit log.
type SettingRow = {
  key: string;
  value: Record<string, unknown> | number;
  requires_owner_approval: boolean;
  approved_at: string | null;
  updated_at: string | null;
};

type SectionKey = "booking_hold_minutes" | "loyalty_program" | "referral_program";

const translations = {
  en: {
    title: "Platform Settings",
    subtitle: "Settings the booking engine reads. Every change needs a reason and is written to the audit log.",
    loading: "Loading settings...",
    loadFailed: "Could not load platform settings",
    retry: "Retry",
    reason: "Reason for this change",
    reasonRequired: "Enter a reason of at least 3 characters.",
    save: "Save",
    saving: "Saving...",
    saved: "Saved.",
    lastChanged: "Last changed",
    approved: "Approved for launch",
    ownerApproval: "Requires the platform owner's approval: saving records you as the approver.",
    holdTitle: "Unpaid booking hold",
    holdHelp: "Minutes an unpaid booking keeps its time slot before it is released (5–120).",
    holdLabel: "Hold minutes",
    loyaltyTitle: "Loyalty points",
    loyaltyHelp: "Customers earn points on completed visits and can redeem them at checkout.",
    enabled: "Enabled",
    pointsPerSar: "Points earned per SAR",
    sarPerPoint: "SAR value of one point",
    minRedeem: "Minimum points to redeem",
    referralTitle: "Referral rewards",
    referralHelp: "Wallet credit for the referrer and the new customer after the new customer's first completed visit.",
    rewardSar: "Reward per person (SAR)",
    holdInvalid: "Hold minutes must be a whole number from 5 to 120.",
    pointsInvalid: "Points earned per SAR must be a number, 0 or more.",
    valueInvalid: "The SAR value of one point must be a number, 0 or more.",
    redeemInvalid: "Minimum points to redeem must be a whole number, 1 or more.",
    rewardInvalid: "The reward per person must be a number, 0 or more.",
  },
  ar: {
    title: "إعدادات المنصة",
    subtitle: "إعدادات يقرؤها محرك الحجز. كل تغيير يتطلب سبباً ويُسجل في سجل التدقيق.",
    loading: "جارٍ تحميل الإعدادات...",
    loadFailed: "تعذر تحميل إعدادات المنصة",
    retry: "إعادة المحاولة",
    reason: "سبب هذا التغيير",
    reasonRequired: "اكتب سبباً من 3 أحرف على الأقل.",
    save: "حفظ",
    saving: "جارٍ الحفظ...",
    saved: "تم الحفظ.",
    lastChanged: "آخر تغيير",
    approved: "معتمد للإطلاق",
    ownerApproval: "يتطلب اعتماد مالك المنصة: الحفظ يسجلك معتمِداً.",
    holdTitle: "مهلة الحجز غير المدفوع",
    holdHelp: "عدد الدقائق التي يحتفظ فيها الحجز غير المدفوع بموعده قبل إطلاقه (5–120).",
    holdLabel: "دقائق المهلة",
    loyaltyTitle: "نقاط الولاء",
    loyaltyHelp: "يكسب العملاء نقاطاً عن الزيارات المكتملة ويمكنهم استبدالها عند الدفع.",
    enabled: "مفعّل",
    pointsPerSar: "النقاط المكتسبة لكل ريال",
    sarPerPoint: "قيمة النقطة الواحدة بالريال",
    minRedeem: "الحد الأدنى من النقاط للاستبدال",
    referralTitle: "مكافآت الإحالة",
    referralHelp: "رصيد محفظة للمُحيل وللعميل الجديد بعد أول زيارة مكتملة للعميل الجديد.",
    rewardSar: "المكافأة لكل شخص (ر.س)",
    holdInvalid: "يجب أن تكون دقائق المهلة عدداً صحيحاً من 5 إلى 120.",
    pointsInvalid: "يجب أن تكون النقاط المكتسبة لكل ريال رقماً لا يقل عن 0.",
    valueInvalid: "يجب أن تكون قيمة النقطة بالريال رقماً لا يقل عن 0.",
    redeemInvalid: "يجب أن يكون الحد الأدنى للاستبدال عدداً صحيحاً لا يقل عن 1.",
    rewardInvalid: "يجب أن تكون المكافأة لكل شخص رقماً لا يقل عن 0.",
  },
};

export default function AdminSettings() {
  const lang = useOperationsLocale();
  const t = translations[lang];
  const isRTL = lang === "ar";
  const [rows, setRows] = useState<Record<string, SettingRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadForbidden, setLoadForbidden] = useState(false);
  // The field the last check refused, so its message sits beside it and the field is marked invalid.
  const [invalid, setInvalid] = useState<{ field: string; message: string } | null>(null);
  const [hold, setHold] = useState("");
  const [loyalty, setLoyalty] = useState({ enabled: false, points_per_sar: "", sar_per_point: "", min_redeem_points: "" });
  const [referral, setReferral] = useState({ enabled: false, reward_sar: "" });
  const [reasons, setReasons] = useState<Record<SectionKey, string>>({ booking_hold_minutes: "", loyalty_program: "", referral_program: "" });
  const [saving, setSaving] = useState<SectionKey | "">("");
  const [messages, setMessages] = useState<Record<SectionKey, { error?: string; success?: string }>>({
    booking_hold_minutes: {}, loyalty_program: {}, referral_program: {},
  });

  // A reload after a save is silent: the form stays on screen (and keeps focus) while the saved values are read back.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError("");
    const { data, error } = await supabase
      .from("platform_settings")
      .select("key, value, requires_owner_approval, approved_at, updated_at")
      .in("key", ["booking_hold_minutes", "loyalty_program", "referral_program"]);
    if (error) {
      setLoadError(error.message);
      setLoadForbidden(isForbidden(error));
      setLoading(false);
      return;
    }
    setLoadForbidden(false);
    const byKey: Record<string, SettingRow> = {};
    for (const row of (data || []) as SettingRow[]) byKey[row.key] = row;
    setRows(byKey);
    const holdValue = byKey.booking_hold_minutes?.value;
    setHold(holdValue === undefined ? "" : String(holdValue));
    const l = (byKey.loyalty_program?.value || {}) as Record<string, unknown>;
    setLoyalty({
      enabled: l.enabled === true,
      points_per_sar: l.points_per_sar === undefined ? "" : String(l.points_per_sar),
      sar_per_point: l.sar_per_point === undefined ? "" : String(l.sar_per_point),
      min_redeem_points: l.min_redeem_points === undefined ? "" : String(l.min_redeem_points),
    });
    const r = (byKey.referral_program?.value || {}) as Record<string, unknown>;
    setReferral({ enabled: r.enabled === true, reward_sar: r.reward_sar === undefined ? "" : String(r.reward_sar) });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setMessage = (key: SectionKey, message: { error?: string; success?: string }) =>
    setMessages((prev) => ({ ...prev, [key]: message }));

  const refuse = (key: SectionKey, field: string, message: string) => {
    setMessage(key, {});
    setInvalid({ field, message });
    document.getElementById(field)?.focus();
  };

  const save = async (key: SectionKey, value: unknown) => {
    const reason = reasons[key].trim();
    if (reason.length < 3) {
      refuse(key, `reason-${key}`, t.reasonRequired);
      return;
    }
    setSaving(key);
    setInvalid(null);
    setMessage(key, {});
    const { error } = await supabase.rpc("admin_update_platform_setting", { p_key: key, p_value: value, p_reason: reason });
    setSaving("");
    if (error) {
      // The operator's input stays in the form so the change can be corrected and retried.
      setMessage(key, { error: error.message });
      return;
    }
    setReasons((prev) => ({ ...prev, [key]: "" }));
    setMessage(key, { success: t.saved });
    await load(true);
  };

  const num = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(isRTL ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "—";

  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4";
  const inputBase = "w-full rounded-xl border border-[#D0D5DD] bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]";
  const fieldError = (field: string) => (invalid?.field === field ? <span id={`${field}-error`} className="text-xs font-bold text-red-700">{invalid.message}</span> : null);
  const fieldProps = (field: string) => ({ id: field, "aria-invalid": invalid?.field === field, "aria-describedby": invalid?.field === field ? `${field}-error` : undefined });
  const labelBase = "flex flex-col gap-1 text-[11px] font-bold text-[#667085]";

  const sectionFooter = (key: SectionKey, onSave: () => void) => {
    const row = rows[key];
    return (
      <>
        {row?.requires_owner_approval && <p className="text-[11px] font-semibold text-[#9A7B1E]">{t.ownerApproval}</p>}
        <label className={labelBase}>
          <span>{t.reason}</span>
          <input
            {...fieldProps(`reason-${key}`)}
            className={inputBase}
            value={reasons[key]}
            maxLength={300}
            onChange={(e) => setReasons((prev) => ({ ...prev, [key]: e.target.value }))}
          />
          {fieldError(`reason-${key}`)}
        </label>
        {messages[key].error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{messages[key].error}</div>}
        {messages[key].success && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-bold text-green-800">{messages[key].success}</div>}
        <div className={`flex flex-wrap items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <button
            type="button"
            disabled={saving !== ""}
            onClick={onSave}
            className="rounded-xl bg-gray-900 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50"
          >
            {saving === key ? t.saving : t.save}
          </button>
          <span className="text-[11px] text-gray-500">
            {t.lastChanged}: {formatDate(row?.updated_at ?? null)}
            {row?.requires_owner_approval && row.approved_at ? ` · ${t.approved}: ${formatDate(row.approved_at)}` : ""}
          </span>
        </div>
      </>
    );
  };

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      <div>
        <h1 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h1>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {loading && <p role="status" className="text-sm text-gray-600">{t.loading}</p>}
      {!loading && loadError && loadForbidden && <ForbiddenNotice locale={lang} />}
      {!loading && loadError && !loadForbidden && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {t.loadFailed}: {loadError}{" "}
          <button type="button" onClick={() => void load()} className="font-bold underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
        </div>
      )}

      {!loading && (!loadError || Object.keys(rows).length > 0) && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <section className={cardBase} aria-labelledby="hold-title">
            <h3 id="hold-title" className="text-sm font-black text-gray-900">{t.holdTitle}</h3>
            <p className="text-xs text-gray-500">{t.holdHelp}</p>
            <label className={labelBase}>
              <span>{t.holdLabel}</span>
              <input {...fieldProps("hold-minutes")} type="number" min={5} max={120} step={1} className={inputBase} value={hold} onChange={(e) => setHold(e.target.value)} />
              {fieldError("hold-minutes")}
            </label>
            {sectionFooter("booking_hold_minutes", () => {
              const minutes = num(hold);
              if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
                refuse("booking_hold_minutes", "hold-minutes", t.holdInvalid);
                return;
              }
              void save("booking_hold_minutes", minutes);
            })}
          </section>

          <section className={cardBase} aria-labelledby="loyalty-title">
            <h3 id="loyalty-title" className="text-sm font-black text-gray-900">{t.loyaltyTitle}</h3>
            <p className="text-xs text-gray-500">{t.loyaltyHelp}</p>
            <label className={`flex items-center gap-2 text-xs font-bold text-gray-800 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
              <input type="checkbox" checked={loyalty.enabled} onChange={(e) => setLoyalty((prev) => ({ ...prev, enabled: e.target.checked }))} />
              <span>{t.enabled}</span>
            </label>
            <label className={labelBase}>
              <span>{t.pointsPerSar}</span>
              <input {...fieldProps("points-per-sar")} type="number" min={0} step="0.01" className={inputBase} value={loyalty.points_per_sar} onChange={(e) => setLoyalty((prev) => ({ ...prev, points_per_sar: e.target.value }))} />
              {fieldError("points-per-sar")}
            </label>
            <label className={labelBase}>
              <span>{t.sarPerPoint}</span>
              <input {...fieldProps("sar-per-point")} type="number" min={0} step="0.01" className={inputBase} value={loyalty.sar_per_point} onChange={(e) => setLoyalty((prev) => ({ ...prev, sar_per_point: e.target.value }))} />
              {fieldError("sar-per-point")}
            </label>
            <label className={labelBase}>
              <span>{t.minRedeem}</span>
              <input {...fieldProps("min-redeem")} type="number" min={1} step={1} className={inputBase} value={loyalty.min_redeem_points} onChange={(e) => setLoyalty((prev) => ({ ...prev, min_redeem_points: e.target.value }))} />
              {fieldError("min-redeem")}
            </label>
            {sectionFooter("loyalty_program", () => {
              const value = {
                enabled: loyalty.enabled,
                points_per_sar: num(loyalty.points_per_sar),
                sar_per_point: num(loyalty.sar_per_point),
                min_redeem_points: num(loyalty.min_redeem_points),
              };
              if (!Number.isFinite(value.points_per_sar) || value.points_per_sar < 0) return refuse("loyalty_program", "points-per-sar", t.pointsInvalid);
              if (!Number.isFinite(value.sar_per_point) || value.sar_per_point < 0) return refuse("loyalty_program", "sar-per-point", t.valueInvalid);
              if (!Number.isInteger(value.min_redeem_points) || value.min_redeem_points < 1) return refuse("loyalty_program", "min-redeem", t.redeemInvalid);
              void save("loyalty_program", value);
            })}
          </section>

          <section className={cardBase} aria-labelledby="referral-title">
            <h3 id="referral-title" className="text-sm font-black text-gray-900">{t.referralTitle}</h3>
            <p className="text-xs text-gray-500">{t.referralHelp}</p>
            <label className={`flex items-center gap-2 text-xs font-bold text-gray-800 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
              <input type="checkbox" checked={referral.enabled} onChange={(e) => setReferral((prev) => ({ ...prev, enabled: e.target.checked }))} />
              <span>{t.enabled}</span>
            </label>
            <label className={labelBase}>
              <span>{t.rewardSar}</span>
              <input {...fieldProps("referral-reward")} type="number" min={0} step="0.01" className={inputBase} value={referral.reward_sar} onChange={(e) => setReferral((prev) => ({ ...prev, reward_sar: e.target.value }))} />
              {fieldError("referral-reward")}
            </label>
            {sectionFooter("referral_program", () => {
              const reward = num(referral.reward_sar);
              if (!Number.isFinite(reward) || reward < 0) {
                refuse("referral_program", "referral-reward", t.rewardInvalid);
                return;
              }
              void save("referral_program", { enabled: referral.enabled, reward_sar: reward });
            })}
          </section>
        </div>
      )}
    </div>
  );
}
