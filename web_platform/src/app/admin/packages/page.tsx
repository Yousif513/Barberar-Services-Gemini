"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { CommandDialog } from "@/components/modal";
import { useOperationsLocale } from "@/components/operations-ui";
import { ReadFailure } from "@/components/read-failure";
import { commandOutcome } from "@/lib/write-result.mjs";
import { describeConsoleError, unchangedText } from "@/lib/console-errors.mjs";
import { knownToHold, useConsoleSession } from "@/lib/console-session";

const translations = {
  en: {
    title: "Service Packages & Passes",
    subtitle: "Manage bundled discount offers, wellness passes, and multi-session vouchers.",
    loading: "Loading wellness packages...",
    totalPackages: "Total Packages",
    activeVouchers: "Active Sold Passes",
    redeemedRatio: "Total Redemptions",
    packageName: "Package Name",
    providerName: "Provider / Salon",
    sessionCount: "Sessions Included",
    packagePrice: "Package Price",
    status: "Status",
    active: "Active",
    inactive: "Inactive",
    verifyBtn: "Toggle Status",
    successMsg: "Package status updated successfully!",
    errorLoad: "Failed to load packages from database.",
    noPackages: "No service packages yet.",
    fewerThanFive: "Fewer than 5",
    what: "The package list",
    usageWhat: "The voucher and redemption totals",
    actions: "Actions",
    switchOff: "Switch off",
    switchOn: "Switch on",
    offTitle: "Switch this package off",
    onTitle: "Switch this package on",
    offIntro: "Customers can no longer buy it. Vouchers already bought keep working until they are used or expire.",
    onIntro: "Customers can buy it again.",
    reasonLabel: "Reason (recorded in the audit log)",
    switchedOff: "Package switched off.",
    switchedOn: "Package switched on."
  },
  ar: {
    title: "باقات الخدمات وعروض التوفير",
    subtitle: "إدارة باقات الخدمات المجمعة، بطاقات جلسات العناية المتعددة، وقسائم الخصم.",
    loading: "جاري تحميل الباقات والاشتراكات...",
    totalPackages: "إجمالي الباقات",
    activeVouchers: "البطاقات المباعة النشطة",
    redeemedRatio: "إجمالي الجلسات المستخدمة",
    packageName: "اسم الباقة",
    providerName: "مقدم الخدمة / الصالون",
    sessionCount: "عدد الجلسات المشمولة",
    packagePrice: "سعر الباقة",
    status: "الحالة",
    active: "نشط",
    inactive: "غير نشط",
    verifyBtn: "تعديل الحالة",
    successMsg: "تم تحديث حالة الباقة بنجاح!",
    errorLoad: "تعذر تحميل الباقات من قاعدة البيانات.",
    noPackages: "لا توجد باقات خدمات بعد.",
    fewerThanFive: "أقل من ٥",
    what: "قائمة الباقات",
    usageWhat: "إجماليات القسائم والجلسات المستخدمة",
    actions: "الإجراءات",
    switchOff: "إيقاف",
    switchOn: "تفعيل",
    offTitle: "إيقاف هذه الباقة",
    onTitle: "تفعيل هذه الباقة",
    offIntro: "لن يتمكن العملاء من شرائها. تبقى القسائم المشتراة صالحة حتى تُستخدم أو تنتهي.",
    onIntro: "يتمكن العملاء من شرائها من جديد.",
    reasonLabel: "السبب (يُسجَّل في سجل التدقيق)",
    switchedOff: "تم إيقاف الباقة.",
    switchedOn: "تم تفعيل الباقة."
  }
};

export default function AdminPackages() {
  const [packages, setPackages] = useState<any[]>([]);
  // null = fewer than 5 (D4 small-cell suppression), shown as such rather than as a number.
  const [activeVouchersCount, setActiveVouchersCount] = useState<number | null>(0);
  const [totalRedemptionsCount, setTotalRedemptionsCount] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [usageError, setUsageError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState<any | null>(null);
  // The language follows the console shell (<html lang>), so a load failure is worded in the language on screen.
  const lang = useOperationsLocale();
  // Only a console role with operations.write gets the control (the server refuses every other role anyway).
  const canWrite = knownToHold(useConsoleSession(), ["operations.write"]);

  useEffect(() => {
    loadPackagesData();
  }, []);

  async function loadPackagesData() {
    try {
      setLoading(true);
      setLoadError(null);
      setUsageError(null);

      const { data: pkgData, error: pkgErr } = await supabase
        .from("packages")
        .select(`
          id,
          name_en,
          name_ar,
          description_en,
          description_ar,
          price,
          session_count,
          expires_in_days,
          is_active,
          created_at,
          providers (
            business_name_en,
            business_name_ar
          )
        `)
        .order("created_at", { ascending: false });

      if (pkgErr) throw pkgErr;
      setPackages(pkgData || []);
    } catch (err) {
      setLoadError(err);
      setPackages([]);
      setLoading(false);
      return;
    }
    try {

      // GOV-FIX (Q4): customers' vouchers and redemptions are counted on the server (admin_package_usage_summary); a count of
      // 1 to 4 people is suppressed (D4) and a failure is reported instead of showing zero.
      const { data: usage, error: usageErr } = await supabase.rpc("admin_package_usage_summary");
      if (usageErr) throw usageErr;
      const totals = usage as { active_vouchers: number | null; redemptions: number | null } | null;
      setActiveVouchersCount(totals?.active_vouchers ?? null);
      setTotalRedemptionsCount(totals?.redemptions ?? null);
    } catch (err) {
      setUsageError(err);
    } finally {
      setLoading(false);
    }
  }

  // admin_set_package_active checks operations.write, needs a reason and answers the stored state; the row changes only
  // after that answer, and a refusal stays in the dialog with the reason typed.
  const runToggle = async (pkg: any, reason: string): Promise<string | null> => {
    const next = !pkg.is_active;
    const outcome = commandOutcome(await supabase.rpc("admin_set_package_active", { p_package_id: pkg.id, p_active: next, p_reason: reason }));
    if (!outcome.ok) return describeConsoleError(outcome.error, lang);
    const stored = Boolean(outcome.data?.is_active);
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_active: stored } : p));
    setSuccess(outcome.changed ? (stored ? translations[lang].switchedOn : translations[lang].switchedOff) : unchangedText(lang));
    return null;
  };

  const renderToggleDialog = () => {
    if (!pending) return null;
    const tt = translations[lang];
    const name = lang === "ar" ? pending.name_ar || pending.name_en : pending.name_en || pending.name_ar;
    return (
      <CommandDialog
        locale={lang}
        tone={pending.is_active ? "danger" : "default"}
        title={pending.is_active ? tt.offTitle : tt.onTitle}
        intro={pending.is_active ? tt.offIntro : tt.onIntro}
        facts={[{ label: tt.packageName, value: name }]}
        reasonLabel={tt.reasonLabel}
        confirmLabel={pending.is_active ? tt.switchOff : tt.switchOn}
        onConfirm={(reason) => runToggle(pending, reason)}
        onClose={() => setPending(null)}
      />
    );
  };

  const t = translations[lang];
  const isRTL = lang === "ar";
  const cardBase = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.035)] hover:border-[#D1AF47]/20";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={`space-y-6 ${isRTL ? "text-right" : "text-left"}`}>
      {renderToggleDialog()}
      <div>
        <h2 className="text-2xl font-serif font-black text-gray-900 leading-tight">{t.title}</h2>
        <p className="text-xs text-gray-500 font-semibold mt-1">{t.subtitle}</p>
      </div>

      {success && <div role="status" className="bg-[#ECFDF3] border border-[#D1FADF] text-[#027A48] text-xs rounded-xl p-4 font-bold">{success}</div>}

      {loadError ? (
        <ReadFailure error={loadError} locale={lang} what={t.what} onRetry={() => void loadPackagesData()} />
      ) : (
      <>
      {usageError ? <ReadFailure error={usageError} locale={lang} what={t.usageWhat} onRetry={() => void loadPackagesData()} /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.totalPackages}</span>
          <strong className="block text-2xl font-serif font-black text-gray-900 mt-2.5">{packages.length}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.activeVouchers}</span>
          <strong className="block text-2xl font-serif font-black text-emerald-700 mt-2.5">{usageError ? "—" : activeVouchersCount === null ? t.fewerThanFive : activeVouchersCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</strong>
        </div>
        <div className={cardBase}>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#667085] block">{t.redeemedRatio}</span>
          <strong className="block text-2xl font-serif font-black text-amber-700 mt-2.5">{usageError ? "—" : totalRedemptionsCount === null ? t.fewerThanFive : totalRedemptionsCount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</strong>
        </div>
      </div>

      <div className="bg-white border border-[#ECECEC] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
        {loading ? (
          <div role="status" className="py-16 text-center text-xs text-gray-500 font-bold">{t.loading}</div>
        ) : packages.length === 0 ? (
          <div className="py-16 text-center text-xs text-gray-500 font-bold">{t.noPackages}</div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.title}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className={`border-b border-[#ECECEC] text-[#667085] bg-gray-50/50 uppercase tracking-widest font-extrabold text-[9px] ${isRTL ? "text-right" : ""}`}>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packageName}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.providerName}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.sessionCount}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.packagePrice}</th>
                  <th className={`py-4 px-6 ${isRTL ? "text-right" : "text-left"}`}>{t.status}</th>
                  {canWrite && <th className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>{t.actions}</th>}
                </tr>
              </thead>
              <tbody className={`divide-y divide-[#F5F5F5] font-semibold text-gray-700 ${isRTL ? "text-right" : "text-left"}`}>
                {packages.map(p => {
                  const pkgName = lang === "ar" ? p.name_ar || p.name_en : p.name_en || p.name_ar;
                  const provName = lang === "ar" ? p.providers?.business_name_ar || p.providers?.business_name_en : p.providers?.business_name_en || p.providers?.business_name_ar;

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/40 transition duration-150">
                      <td className="py-4 px-6 font-bold text-gray-900">{pkgName}</td>
                      <td className="py-4 px-6 text-gray-600 font-medium">{provName || "—"}</td>
                      <td className="py-4 px-6">{p.session_count}</td>
                      <td className="py-4 px-6 font-serif font-black text-gray-900">{p.price} {lang === "ar" ? "ريال" : "SAR"}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider inline-block ${p.is_active ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FEF3F2] text-[#B91C1C]"}`}>
                          {p.is_active ? t.active : t.inactive}
                        </span>
                      </td>
                      {canWrite && (
                      <td className={`py-4 px-6 ${isRTL ? "text-left" : "text-right"}`}>
                        <button
                          type="button"
                          onClick={() => { setSuccess(""); setPending(p); }}
                          aria-label={`${p.is_active ? t.switchOff : t.switchOn}: ${pkgName}`}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-gray-800 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]"
                        >
                          {p.is_active ? t.switchOff : t.switchOn}
                        </button>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
