"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { isReauthRequired } from "@/lib/step-up";
import { useConfirm } from "@/components/modal";
import { DialogError, ProviderDialog, providerFieldClass, providerGhostButton, providerLabelClass, providerPrimaryButton } from "./dialog";

type Lang = "en" | "ar";

const copy = {
  en: {
    rulesTitle: "Pay rules",
    rulesIntro: "Used for the payroll summary. Nothing is assumed: enter the values you have agreed with this professional.",
    baseSalary: "Base monthly salary (SAR)",
    commission: "Service commission (%)",
    productCommission: "Product commission (%)",
    iban: "Salary IBAN (optional)",
    ibanHint: "Saudi IBAN: SA followed by 22 digits. Stored for payroll only.",
    ibanNew: "New salary IBAN (leave empty to keep the current one)",
    ibanCurrent: "Account on file: {masked}",
    ibanNone: "No salary account on file.",
    ibanRemove: "Remove the salary account on file",
    revealReason: "Why do you need the full number?",
    revealButton: "Show the full number for 60 seconds",
    revealing: "Checking…",
    revealHide: "Hide",
    revealShown: "Full number (hidden in {n} s)",
    revealReauth: "For your security, sign in again (within the last 10 minutes) to see the full account number.",
    revealFailed: "The number could not be shown: ",
    revealReasonShort: "Give a reason of at least 5 characters.",
    invalidAmount: "Enter a number that is zero or more.",
    invalidRate: "Enter a rate between 0 and 100.",
    invalidIban: "A Saudi IBAN is SA followed by 22 digits.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    loadFailed: "The saved rules could not be loaded: ",
    saveFailed: "The rules were not saved: ",
    portfolioTitle: "Portfolio",
    portfolioIntro: "Photos of finished work shown on your public page. Only add a photo when the client agreed to it being shown.",
    imageUrl: "Image link (https)",
    titleEn: "Caption (English)",
    titleAr: "Caption (Arabic)",
    consent: "The client in this photo agreed to it being shown publicly.",
    consentRequired: "Confirm the client agreed before adding the photo.",
    invalidImage: "Enter a full https:// image link.",
    add: "Add photo",
    empty: "No portfolio photos yet.",
    remove: "Remove",
    removeTitle: "Remove this photo?",
    removeIntro: "The photo disappears from the public page immediately.",
    removeLabel: "Remove photo",
    close: "Close",
    portfolioFailed: "The portfolio change was not saved: ",
    loading: "Loading…",
  },
  ar: {
    rulesTitle: "قواعد الأجر",
    rulesIntro: "تُستخدم في ملخص الرواتب. لا نفترض أي قيمة: أدخل ما اتفقتم عليه مع هذا الأخصائي.",
    baseSalary: "الراتب الأساسي الشهري (ر.س)",
    commission: "عمولة الخدمات (%)",
    productCommission: "عمولة المنتجات (%)",
    iban: "رقم الآيبان للراتب (اختياري)",
    ibanHint: "الآيبان السعودي: SA يتبعه 22 رقماً. يُحفظ لأغراض الرواتب فقط.",
    ibanNew: "آيبان الراتب الجديد (اتركه فارغاً للإبقاء على الحالي)",
    ibanCurrent: "الحساب المحفوظ: {masked}",
    ibanNone: "لا يوجد حساب راتب محفوظ.",
    ibanRemove: "حذف حساب الراتب المحفوظ",
    revealReason: "لماذا تحتاج الرقم كاملاً؟",
    revealButton: "إظهار الرقم كاملاً لمدة 60 ثانية",
    revealing: "جارٍ التحقق…",
    revealHide: "إخفاء",
    revealShown: "الرقم كاملاً (يختفي خلال {n} ث)",
    revealReauth: "لحمايتك، سجّل الدخول من جديد (خلال آخر 10 دقائق) لعرض رقم الحساب كاملاً.",
    revealFailed: "تعذر عرض الرقم: ",
    revealReasonShort: "اكتب سبباً من 5 أحرف على الأقل.",
    invalidAmount: "أدخل رقماً لا يقل عن صفر.",
    invalidRate: "أدخل نسبة بين 0 و100.",
    invalidIban: "الآيبان السعودي هو SA يتبعه 22 رقماً.",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    cancel: "إلغاء",
    loadFailed: "تعذر تحميل القواعد المحفوظة: ",
    saveFailed: "لم تُحفظ القواعد: ",
    portfolioTitle: "معرض الأعمال",
    portfolioIntro: "صور لأعمال منجزة تظهر في صفحتك العامة. لا تضف صورة إلا إذا وافق العميل على عرضها.",
    imageUrl: "رابط الصورة (https)",
    titleEn: "الوصف (إنجليزي)",
    titleAr: "الوصف (عربي)",
    consent: "وافق العميل الظاهر في هذه الصورة على عرضها للعموم.",
    consentRequired: "أكّد موافقة العميل قبل إضافة الصورة.",
    invalidImage: "أدخل رابط صورة كاملاً يبدأ بـ https://",
    add: "إضافة الصورة",
    empty: "لا توجد صور في المعرض بعد.",
    remove: "إزالة",
    removeTitle: "إزالة هذه الصورة؟",
    removeIntro: "ستختفي الصورة من الصفحة العامة فوراً.",
    removeLabel: "إزالة الصورة",
    close: "إغلاق",
    portfolioFailed: "لم يُحفظ تغيير المعرض: ",
    loading: "جارٍ التحميل…",
  },
};

export const SAUDI_IBAN = /^SA\d{22}$/;

export function normalizeIban(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function CommissionRulesDialog({ lang, providerId, employeeId, employeeName, onClose, onSaved }: {
  lang: Lang; providerId: string; employeeId: string; employeeName: string; onClose: () => void; onSaved: () => void;
}) {
  const t = copy[lang];
  const [salary, setSalary] = useState("");
  const [rate, setRate] = useState("");
  const [productRate, setProductRate] = useState("");
  // GOV-FIX M-5: the full salary IBAN is never read back. The screen shows the masked copy, a new number replaces it, and the
  // full number appears only through reveal_employee_wps_iban (fresh sign-in, reason, audited) for 60 seconds.
  const [iban, setIban] = useState("");
  const [maskedIban, setMaskedIban] = useState<string | null>(null);
  const [ruleExists, setRuleExists] = useState(false);
  const [removeIban, setRemoveIban] = useState(false);
  const [revealReason, setRevealReason] = useState("");
  const [revealed, setRevealed] = useState<{ iban: string; until: number } | null>(null);
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealError, setRevealError] = useState("");
  const [clock, setClock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("employee_commission_rules")
        .select("base_salary_sar, commission_rate, product_commission_rate, wps_iban_masked")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (!live) return;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else if (data) {
        setSalary(String(data.base_salary_sar ?? ""));
        setRate(String(data.commission_rate ?? ""));
        setProductRate(String(data.product_commission_rate ?? ""));
        setMaskedIban(data.wps_iban_masked ?? null);
        setRuleExists(true);
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [employeeId, t.loadFailed]);

  useEffect(() => {
    if (!revealed) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setClock(current);
      if (current >= revealed.until) setRevealed(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [revealed]);

  const reveal = async () => {
    if (revealReason.trim().length < 5) { setRevealError(t.revealReasonShort); return; }
    setRevealBusy(true);
    setRevealError("");
    const { data, error } = await supabase.rpc("reveal_employee_wps_iban", { p_employee_id: employeeId, p_reason: revealReason.trim() });
    setRevealBusy(false);
    if (error) { setRevealError(isReauthRequired(error) ? t.revealReauth : t.revealFailed + errorMessage(error)); return; }
    const shown = data as { iban: string; expires_at: string };
    const until = Math.min(new Date(shown.expires_at).getTime(), Date.now() + 60000);
    setClock(Date.now());
    setRevealed({ iban: shown.iban, until });
  };

  const num = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const salaryProblem = !(num(salary) >= 0);
  const rateProblem = !(num(rate) >= 0 && num(rate) <= 100);
  const productProblem = !(num(productRate) >= 0 && num(productRate) <= 100);
  const ibanProblem = iban.trim() !== "" && !SAUDI_IBAN.test(normalizeIban(iban));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (salaryProblem || rateProblem || productProblem || ibanProblem || saving) return;
    setSaving(true);
    setFailure("");
    // The full number is not readable, so an upsert (which reads what it sets) is refused: insert a new rule, update an
    // existing one, and send the IBAN only when it changes.
    const values: Record<string, unknown> = {
      base_salary_sar: num(salary),
      commission_rate: num(rate),
      product_commission_rate: num(productRate),
      updated_at: new Date().toISOString(),
    };
    if (iban.trim() !== "") values.wps_iban = normalizeIban(iban);
    else if (removeIban) values.wps_iban = null;
    const { error } = ruleExists
      ? await supabase.from("employee_commission_rules").update(values).eq("employee_id", employeeId)
      : await supabase.from("employee_commission_rules").insert({ employee_id: employeeId, provider_id: providerId, ...values });
    setSaving(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    onSaved();
    onClose();
  };

  return (
    <ProviderDialog label={`${t.rulesTitle} - ${employeeName}`} onClose={onClose} canClose={!saving}>
      <form onSubmit={(event) => void save(event)} noValidate>
        <h2 className="font-serif text-xl font-black text-[#101828]">{t.rulesTitle}</h2>
        <p className="mt-1 text-sm font-semibold text-[#344054]">{employeeName}</p>
        <p className="mt-2 text-sm leading-6 text-[#475467]">{t.rulesIntro}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={providerLabelClass} htmlFor="rules-salary">{t.baseSalary}</label>
            <input id="rules-salary" inputMode="decimal" dir="ltr" disabled={loading || saving} value={salary} onChange={(e) => setSalary(e.target.value)} aria-invalid={attempted && salaryProblem} className={providerFieldClass} />
            {attempted && salaryProblem && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.invalidAmount}</p>}
          </div>
          <div>
            <label className={providerLabelClass} htmlFor="rules-rate">{t.commission}</label>
            <input id="rules-rate" inputMode="decimal" dir="ltr" disabled={loading || saving} value={rate} onChange={(e) => setRate(e.target.value)} aria-invalid={attempted && rateProblem} className={providerFieldClass} />
            {attempted && rateProblem && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.invalidRate}</p>}
          </div>
          <div>
            <label className={providerLabelClass} htmlFor="rules-product-rate">{t.productCommission}</label>
            <input id="rules-product-rate" inputMode="decimal" dir="ltr" disabled={loading || saving} value={productRate} onChange={(e) => setProductRate(e.target.value)} aria-invalid={attempted && productProblem} className={providerFieldClass} />
            {attempted && productProblem && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.invalidRate}</p>}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold text-[#344054]">
              {maskedIban ? <>{t.ibanCurrent.split("{masked}")[0]}<bdi dir="ltr" className="font-mono">{maskedIban}</bdi>{t.ibanCurrent.split("{masked}")[1]}</> : t.ibanNone}
            </p>
            {maskedIban && (
              <div className="mb-3 rounded-xl border border-[#ECECEC] bg-[#F9F7F1] p-3">
                {revealed ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block text-[11px] font-bold text-[#667085]">{t.revealShown.replace("{n}", String(Math.max(0, Math.ceil((revealed.until - (clock || revealed.until)) / 1000))))}</span>
                      <bdi dir="ltr" className="select-all font-mono text-sm font-black text-[#101828]">{revealed.iban.replace(/(.{4})/g, "$1 ").trim()}</bdi>
                    </span>
                    <button type="button" onClick={() => setRevealed(null)} className={providerGhostButton}>{t.revealHide}</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1">
                      <label className={providerLabelClass} htmlFor="rules-reveal-reason">{t.revealReason}</label>
                      <input id="rules-reveal-reason" disabled={revealBusy} value={revealReason} onChange={(e) => setRevealReason(e.target.value)} className={providerFieldClass} />
                    </div>
                    <button type="button" onClick={() => void reveal()} disabled={revealBusy} className={providerGhostButton}>{revealBusy ? t.revealing : t.revealButton}</button>
                  </div>
                )}
                {revealError && <p role="alert" className="mt-2 text-xs font-semibold text-[#B42318]">{revealError}</p>}
              </div>
            )}
            <label className={providerLabelClass} htmlFor="rules-iban">{maskedIban ? t.ibanNew : t.iban}</label>
            <input id="rules-iban" dir="ltr" autoComplete="off" disabled={loading || saving || removeIban} value={iban} onChange={(e) => setIban(e.target.value)} aria-invalid={attempted && ibanProblem} aria-describedby="rules-iban-hint" className={`${providerFieldClass} font-mono`} />
            <p id="rules-iban-hint" className="mt-1 text-xs text-[#667085]">{t.ibanHint}</p>
            {maskedIban && (
              <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#344054]">
                <input type="checkbox" checked={removeIban} disabled={loading || saving} onChange={(e) => { setRemoveIban(e.target.checked); if (e.target.checked) setIban(""); }} className="h-4 w-4 accent-[#9B7928]" />
                {t.ibanRemove}
              </label>
            )}
            {attempted && ibanProblem && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.invalidIban}</p>}
          </div>
        </div>
        <DialogError message={failure} />
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={providerGhostButton}>{t.cancel}</button>
          <button type="submit" disabled={loading || saving} className={providerPrimaryButton}>{saving ? t.saving : t.save}</button>
        </div>
      </form>
    </ProviderDialog>
  );
}

type PortfolioRow = { id: string; image_url: string; title_en: string | null; title_ar: string | null; display_order: number };

export function PortfolioDialog({ lang, employeeId, employeeName, onClose }: {
  lang: Lang; employeeId: string; employeeName: string; onClose: () => void;
}) {
  const t = copy[lang];
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [consent, setConsent] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [confirmNode, askConfirm] = useConfirm(lang);

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((value) => value + 1);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("employee_portfolios")
        .select("id, image_url, title_en, title_ar, display_order")
        .eq("employee_id", employeeId)
        .order("display_order", { ascending: true });
      if (!live) return;
      if (error) setFailure(t.portfolioFailed + errorMessage(error));
      else setRows((data ?? []) as PortfolioRow[]);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [employeeId, version, t.portfolioFailed]);

  const imageProblem = !/^https:\/\/\S+$/i.test(imageUrl.trim());

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (imageProblem || !consent || busy) return;
    setBusy(true);
    setFailure("");
    const nextOrder = rows.reduce((max, row) => Math.max(max, row.display_order), 0) + 1;
    const { error } = await supabase.from("employee_portfolios").insert({
      employee_id: employeeId,
      image_url: imageUrl.trim(),
      title_en: titleEn.trim() || null,
      title_ar: titleAr.trim() || null,
      customer_consent_confirmed: true,
      display_order: nextOrder,
    });
    setBusy(false);
    if (error) { setFailure(t.portfolioFailed + errorMessage(error)); return; }
    setImageUrl(""); setTitleEn(""); setTitleAr(""); setConsent(false); setAttempted(false);
    reload();
  };

  const remove = async (row: PortfolioRow) => {
    const yes = await askConfirm({ title: t.removeTitle, intro: t.removeIntro, confirmLabel: t.removeLabel, tone: "danger" });
    if (!yes) return;
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("employee_portfolios").delete().eq("id", row.id);
    setBusy(false);
    if (error) { setFailure(t.portfolioFailed + errorMessage(error)); return; }
    reload();
  };

  return (
    <>
      <ProviderDialog label={`${t.portfolioTitle} - ${employeeName}`} onClose={onClose} canClose={!busy} wide>
        <h2 className="font-serif text-xl font-black text-[#101828]">{t.portfolioTitle}</h2>
        <p className="mt-1 text-sm font-semibold text-[#344054]">{employeeName}</p>
        <p className="mt-2 text-sm leading-6 text-[#475467]">{t.portfolioIntro}</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3" aria-label={t.portfolioTitle}>
          {rows.map((row) => {
            const caption = (lang === "ar" ? row.title_ar || row.title_en : row.title_en || row.title_ar) || "";
            return (
              <li key={row.id} className="overflow-hidden rounded-2xl border border-[#ECECEC] bg-[#F9FAFB]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.image_url} alt={caption} className="h-28 w-full object-cover" />
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="min-w-0 truncate text-xs font-semibold text-[#344054]">{caption}</span>
                  <button type="button" disabled={busy} onClick={() => void remove(row)} className="shrink-0 rounded-lg border border-[#FECDCA] px-2 py-1 text-xs font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.remove}</button>
                </div>
              </li>
            );
          })}
        </ul>
        {!loading && rows.length === 0 && <p className="mt-4 rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-4 text-sm text-[#667085]">{t.empty}</p>}
        {loading && <p className="mt-4 text-sm text-[#667085]">{t.loading}</p>}

        <form onSubmit={(event) => void add(event)} noValidate className="mt-5 space-y-4 rounded-2xl border border-[#ECECEC] p-4">
          <div>
            <label className={providerLabelClass} htmlFor="portfolio-url">{t.imageUrl}</label>
            <input id="portfolio-url" dir="ltr" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} disabled={busy} aria-invalid={attempted && imageProblem} className={providerFieldClass} />
            {attempted && imageProblem && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.invalidImage}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={providerLabelClass} htmlFor="portfolio-title-en">{t.titleEn}</label>
              <input id="portfolio-title-en" dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} disabled={busy} className={providerFieldClass} />
            </div>
            <div>
              <label className={providerLabelClass} htmlFor="portfolio-title-ar">{t.titleAr}</label>
              <input id="portfolio-title-ar" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} disabled={busy} className={providerFieldClass} />
            </div>
          </div>
          <div>
            <label className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-[#344054]">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} aria-invalid={attempted && !consent} className="mt-1.5 h-4 w-4 shrink-0 accent-[#9B7928]" />
              <span>{t.consent}</span>
            </label>
            {attempted && !consent && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.consentRequired}</p>}
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className={providerPrimaryButton}>{t.add}</button>
          </div>
        </form>
        <DialogError message={failure} />
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={providerGhostButton}>{t.close}</button>
        </div>
      </ProviderDialog>
      {confirmNode}
    </>
  );
}
