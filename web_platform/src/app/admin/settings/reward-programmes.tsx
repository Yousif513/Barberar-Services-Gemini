"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { ForbiddenNotice, isForbidden, operationsDate, sar, type OperationsLocale } from "@/components/operations-ui";

// Referral and loyalty programmes (D-Q7, docs/legal/2026-10-10-adopted-decisions.md). Both ship disabled with every value unset.
// An owner or finance user proposes a change here (admin_propose_reward_program); a different owner approves it in Approvals.
// The server refuses to enable a programme while the reward value, the per-customer monthly cap, the monthly budget, the credit
// expiry or a published terms version is missing, and break-glass never applies, so with one administrator it stays disabled.
// Terms are published once per version in Arabic and English (admin_publish_reward_terms) and never edited.

type Programme = {
  program: "referral" | "loyalty";
  enabled: boolean;
  reward_value_sar: number | null;
  points_per_sar: number | null;
  min_redeem_points: number | null;
  min_qualifying_sar: number | null;
  customer_monthly_cap_sar: number | null;
  monthly_budget_sar: number | null;
  credit_expiry_days: number | null;
  terms_version: string | null;
  updated_at: string;
};
type Terms = { program: string; version: string; published_at: string };
type Pending = { id: string; summary: Record<string, unknown>; requested_at: string; reason: string };
type View = {
  programs: Programme[];
  terms: Terms[];
  pending: Pending[];
  issued_this_month_sar: Record<string, number>;
  second_owner_exists: boolean;
  can_propose: boolean;
  can_approve: boolean;
};
type Form = {
  enabled: boolean; reward: string; cap: string; budget: string; expiry: string; terms: string; pps: string; minRedeem: string; minQualifying: string; reason: string;
};
type TermsForm = { version: string; en: string; ar: string; reason: string };

const copy = {
  en: {
    title: "Referral and loyalty programmes",
    intro: "Both programmes are off until every value is set and a different owner approves. Credits are funded by the platform, cannot be withdrawn as cash, transferred, bought or topped up, are usable only on PRIMORA and expire as published. Customers accept the published terms in Arabic and English before they enrol.",
    soloWarning: "There is only one owner account. A programme cannot be enabled until a second owner exists to approve it.",
    loading: "Loading programmes...",
    retry: "Retry",
    referral: "Referral rewards",
    loyalty: "Loyalty points",
    on: "Enabled",
    off: "Disabled",
    notSet: "Not set",
    reward: { referral: "Credit per person (SAR)", loyalty: "SAR value of one point" },
    pps: "Points earned per SAR",
    minRedeem: "Fewest points redeemable",
    minQualifying: "Smallest qualifying booking (SAR, optional)",
    cap: "Cap per customer per month (SAR)",
    budget: "Programme budget per month (SAR)",
    expiry: "Credit expiry (days)",
    terms: "Published terms version",
    noTerms: "No terms published",
    issued: "Issued this month",
    pendingTitle: "Waiting for a second owner",
    propose: "Propose a change",
    enable: "Enable the programme",
    reason: "Reason (at least 10 characters)",
    send: "Send for approval",
    sending: "Sending...",
    sent: "Sent for approval. A different owner approves it in Approvals.",
    publishTitle: "Publish terms",
    version: "Version (letters, digits, dots, dashes)",
    bodyEn: "Terms in English (at least 200 characters)",
    bodyAr: "Terms in Arabic (at least 200 characters)",
    publish: "Publish",
    published: "The terms were published. They can no longer be changed; publish a new version instead.",
    cancel: "Cancel",
    invalidNumber: "Enter a positive number, or leave it empty.",
    reasonShort: "Enter a reason of at least 10 characters.",
    termsHint: "Terms cover eligibility, value, cap, expiry, exclusions, change and termination with 30 days' notice, and what happens on a refund. Counsel confirms the licence question and a tax adviser the VAT treatment before the first enablement.",
  },
  ar: {
    title: "برنامجا الإحالة والولاء",
    intro: "البرنامجان متوقفان حتى تُحدَّد كل القيم ويعتمدها مالك آخر. الأرصدة تموّلها المنصة، ولا يمكن سحبها نقداً أو تحويلها أو شراؤها أو شحنها، وتُستخدم في PRIMORA فقط، وتنتهي كما هو منشور. يوافق العملاء على الشروط المنشورة بالعربية والإنجليزية قبل الاشتراك.",
    soloWarning: "يوجد حساب مالك واحد فقط. لا يمكن تفعيل أي برنامج حتى يوجد مالك ثانٍ يعتمده.",
    loading: "جارٍ تحميل البرامج...",
    retry: "إعادة المحاولة",
    referral: "مكافآت الإحالة",
    loyalty: "نقاط الولاء",
    on: "مفعّل",
    off: "متوقف",
    notSet: "غير محدد",
    reward: { referral: "الرصيد لكل شخص (ر.س)", loyalty: "قيمة النقطة الواحدة (ر.س)" },
    pps: "النقاط المكتسبة لكل ريال",
    minRedeem: "أقل عدد نقاط للاستبدال",
    minQualifying: "أقل قيمة حجز مؤهلة (ر.س، اختياري)",
    cap: "الحد لكل عميل شهرياً (ر.س)",
    budget: "ميزانية البرنامج شهرياً (ر.س)",
    expiry: "مدة صلاحية الرصيد (أيام)",
    terms: "نسخة الشروط المنشورة",
    noTerms: "لا توجد شروط منشورة",
    issued: "الصادر هذا الشهر",
    pendingTitle: "بانتظار مالك ثانٍ",
    propose: "اقتراح تغيير",
    enable: "تفعيل البرنامج",
    reason: "السبب (10 أحرف على الأقل)",
    send: "إرسال للاعتماد",
    sending: "جارٍ الإرسال...",
    sent: "أُرسل للاعتماد. يعتمده مالك آخر من صفحة الاعتمادات.",
    publishTitle: "نشر الشروط",
    version: "النسخة (حروف وأرقام ونقاط وشرطات)",
    bodyEn: "الشروط بالإنجليزية (200 حرف على الأقل)",
    bodyAr: "الشروط بالعربية (200 حرف على الأقل)",
    publish: "نشر",
    published: "نُشرت الشروط ولا يمكن تعديلها بعد الآن؛ انشر نسخة جديدة بدلاً من ذلك.",
    cancel: "إلغاء",
    invalidNumber: "أدخل رقماً موجباً أو اتركه فارغاً.",
    reasonShort: "اكتب سبباً من 10 أحرف على الأقل.",
    termsHint: "تشمل الشروط الأهلية والقيمة والحد والصلاحية والاستثناءات والتعديل والإنهاء بإشعار 30 يوماً وما يحدث عند الاسترداد. يؤكد المستشار القانوني مسألة الترخيص ويؤكد المستشار الضريبي معالجة ضريبة القيمة المضافة قبل أول تفعيل.",
  },
};

const blankForm = (p: Programme): Form => ({
  enabled: p.enabled,
  reward: p.reward_value_sar === null ? "" : String(p.reward_value_sar),
  cap: p.customer_monthly_cap_sar === null ? "" : String(p.customer_monthly_cap_sar),
  budget: p.monthly_budget_sar === null ? "" : String(p.monthly_budget_sar),
  expiry: p.credit_expiry_days === null ? "" : String(p.credit_expiry_days),
  terms: p.terms_version ?? "",
  pps: p.points_per_sar === null ? "" : String(p.points_per_sar),
  minRedeem: p.min_redeem_points === null ? "" : String(p.min_redeem_points),
  minQualifying: p.min_qualifying_sar === null ? "" : String(p.min_qualifying_sar),
  reason: "",
});

export function RewardProgrammes({ locale }: { locale: OperationsLocale }) {
  const t = copy[locale];
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ program: Programme["program"]; form: Form } | null>(null);
  const [publishing, setPublishing] = useState<{ program: Programme["program"]; form: TermsForm } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("admin_reward_programs");
    if (rpcError) {
      setError(errorMessage(rpcError));
      setForbidden(isForbidden(rpcError));
      setView(null);
    } else {
      setError("");
      setView(data as View);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const value = (n: number | null, money = false) => (n === null || n === undefined ? t.notSet : money ? sar(Number(n), locale) : Number(n).toLocaleString(locale === "ar" ? "ar-SA" : "en-US"));
  const optional = (text: string): number | null | "bad" => {
    if (text.trim() === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : "bad";
  };

  const submitProposal = async () => {
    if (!editing) return;
    const f = editing.form;
    const fields = [f.reward, f.cap, f.budget, f.expiry, f.pps, f.minRedeem].map(optional);
    const minQualifying = f.minQualifying.trim() === "" ? null : Number(f.minQualifying);
    if (fields.includes("bad") || (minQualifying !== null && (!Number.isFinite(minQualifying) || minQualifying < 0))) { setFormError(t.invalidNumber); return; }
    if (f.reason.trim().length < 10) { setFormError(t.reasonShort); return; }
    const [reward, cap, budget, expiry, pps, minRedeem] = fields as (number | null)[];
    setBusy(true);
    setFormError("");
    const { error: rpcError } = await supabase.rpc("admin_propose_reward_program", {
      p_program: editing.program,
      p_enabled: f.enabled,
      p_reward_value_sar: reward,
      p_customer_monthly_cap_sar: cap,
      p_monthly_budget_sar: budget,
      p_credit_expiry_days: expiry === null ? null : Math.round(expiry),
      p_terms_version: f.terms.trim() || null,
      p_reason: f.reason.trim(),
      p_points_per_sar: editing.program === "loyalty" ? pps : null,
      p_min_redeem_points: editing.program === "loyalty" && minRedeem !== null ? Math.round(minRedeem) : null,
      p_min_qualifying_sar: editing.program === "referral" ? minQualifying : null,
    });
    setBusy(false);
    if (rpcError) { setFormError(errorMessage(rpcError)); return; }
    setEditing(null);
    setDone(t.sent);
    await load();
  };

  const submitTerms = async () => {
    if (!publishing) return;
    const f = publishing.form;
    if (f.reason.trim().length < 10) { setFormError(t.reasonShort); return; }
    setBusy(true);
    setFormError("");
    const { error: rpcError } = await supabase.rpc("admin_publish_reward_terms", {
      p_program: publishing.program, p_version: f.version.trim(), p_body_en: f.en, p_body_ar: f.ar, p_reason: f.reason.trim(),
    });
    setBusy(false);
    if (rpcError) { setFormError(errorMessage(rpcError)); return; }
    setPublishing(null);
    setDone(t.published);
    await load();
  };

  const input = "w-full rounded-xl border border-[#D0D5DD] bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus-visible:outline-2 focus-visible:outline-[#9B7928]";
  const label = "flex flex-col gap-1 text-[11px] font-bold text-[#667085]";
  const button = "rounded-xl border border-gray-300 px-4 py-2 text-xs font-black text-gray-900 hover:border-[#D1AF47] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50";
  const primary = "rounded-xl bg-gray-900 px-5 py-2 text-xs font-black text-white hover:bg-gray-800 focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:opacity-50";

  if (loading) return <p role="status" className="text-sm text-gray-600">{t.loading}</p>;
  if (forbidden) return <ForbiddenNotice locale={locale} />;
  if (error || !view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
        {error}{" "}
        <button type="button" onClick={() => void load()} className="font-bold underline focus-visible:outline-2 focus-visible:outline-[#9B7928]">{t.retry}</button>
      </div>
    );
  }

  return (
    <section aria-labelledby="rewards-title" className="space-y-4">
      <div>
        <h2 id="rewards-title" className="font-serif text-lg font-black text-gray-900">{t.title}</h2>
        <p className="mt-1 max-w-4xl text-xs font-semibold text-gray-500">{t.intro}</p>
        {!view.second_owner_exists ? <p role="note" className="mt-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-bold text-[#B54708]">{t.soloWarning}</p> : null}
        {done ? <p role="status" className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs font-bold text-green-800">{done}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {view.programs.map((p) => {
          const published = view.terms.filter((x) => x.program === p.program);
          const pending = view.pending.filter((x) => x.summary.program === p.program);
          return (
            <article key={p.program} aria-labelledby={`programme-${p.program}`} className="space-y-3 rounded-2xl border border-[#ECECEC] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id={`programme-${p.program}`} className="text-sm font-black text-gray-900">{t[p.program]}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${p.enabled ? "bg-[#ECFDF3] text-[#027A48]" : "bg-stone-100 text-stone-700"}`}>{p.enabled ? t.on : t.off}</span>
              </div>
              <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div><dt className="font-bold text-gray-500">{t.reward[p.program]}</dt><dd className="font-semibold text-gray-900">{value(p.reward_value_sar, p.program === "referral")}</dd></div>
                {p.program === "loyalty" ? (
                  <>
                    <div><dt className="font-bold text-gray-500">{t.pps}</dt><dd className="font-semibold text-gray-900">{value(p.points_per_sar)}</dd></div>
                    <div><dt className="font-bold text-gray-500">{t.minRedeem}</dt><dd className="font-semibold text-gray-900">{value(p.min_redeem_points)}</dd></div>
                  </>
                ) : (
                  <div><dt className="font-bold text-gray-500">{t.minQualifying}</dt><dd className="font-semibold text-gray-900">{value(p.min_qualifying_sar, true)}</dd></div>
                )}
                <div><dt className="font-bold text-gray-500">{t.cap}</dt><dd className="font-semibold text-gray-900">{value(p.customer_monthly_cap_sar, true)}</dd></div>
                <div><dt className="font-bold text-gray-500">{t.budget}</dt><dd className="font-semibold text-gray-900">{value(p.monthly_budget_sar, true)}</dd></div>
                <div><dt className="font-bold text-gray-500">{t.expiry}</dt><dd className="font-semibold text-gray-900">{value(p.credit_expiry_days)}</dd></div>
                <div><dt className="font-bold text-gray-500">{t.terms}</dt><dd dir="ltr" className="text-start font-mono font-semibold text-gray-900">{p.terms_version ?? t.notSet}</dd></div>
                <div><dt className="font-bold text-gray-500">{t.issued}</dt><dd className="font-semibold text-gray-900">{sar(Number(view.issued_this_month_sar[p.program] ?? 0), locale)}</dd></div>
              </dl>
              {pending.length > 0 ? (
                <div className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs font-semibold text-[#B54708]">
                  <p className="font-black">{t.pendingTitle}</p>
                  {pending.map((x) => <p key={x.id}>{operationsDate(x.requested_at, locale)} · {x.reason}</p>)}
                </div>
              ) : null}
              {view.can_propose ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} onClick={() => { setFormError(""); setDone(""); setPublishing(null); setEditing({ program: p.program, form: blankForm(p) }); }}>{t.propose}</button>
                  <button type="button" className={button} onClick={() => { setFormError(""); setDone(""); setEditing(null); setPublishing({ program: p.program, form: { version: "", en: "", ar: "", reason: "" } }); }}>{t.publishTitle}</button>
                </div>
              ) : null}

              {editing?.program === p.program ? (
                <div className="space-y-3 border-t border-[#ECECEC] pt-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-gray-800">
                    <input type="checkbox" checked={editing.form.enabled} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, enabled: e.target.checked } })} />
                    <span>{t.enable}</span>
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={label}><span>{t.reward[p.program]}</span><input type="number" min={0} step="0.01" className={input} value={editing.form.reward} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, reward: e.target.value } })} /></label>
                    {p.program === "loyalty" ? (
                      <>
                        <label className={label}><span>{t.pps}</span><input type="number" min={0} step="0.01" className={input} value={editing.form.pps} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, pps: e.target.value } })} /></label>
                        <label className={label}><span>{t.minRedeem}</span><input type="number" min={1} step={1} className={input} value={editing.form.minRedeem} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, minRedeem: e.target.value } })} /></label>
                      </>
                    ) : (
                      <label className={label}><span>{t.minQualifying}</span><input type="number" min={0} step="0.01" className={input} value={editing.form.minQualifying} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, minQualifying: e.target.value } })} /></label>
                    )}
                    <label className={label}><span>{t.cap}</span><input type="number" min={0} step="0.01" className={input} value={editing.form.cap} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, cap: e.target.value } })} /></label>
                    <label className={label}><span>{t.budget}</span><input type="number" min={0} step="0.01" className={input} value={editing.form.budget} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, budget: e.target.value } })} /></label>
                    <label className={label}><span>{t.expiry}</span><input type="number" min={1} step={1} className={input} value={editing.form.expiry} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, expiry: e.target.value } })} /></label>
                    <label className={label}>
                      <span>{t.terms}</span>
                      <select className={input} value={editing.form.terms} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, terms: e.target.value } })}>
                        <option value="">{published.length === 0 ? t.noTerms : t.notSet}</option>
                        {published.map((x) => <option key={x.version} value={x.version}>{x.version} · {operationsDate(x.published_at, locale)}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className={label}><span>{t.reason}</span><input className={input} maxLength={300} value={editing.form.reason} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, reason: e.target.value } })} /></label>
                  {formError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{formError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primary} disabled={busy} onClick={() => void submitProposal()}>{busy ? t.sending : t.send}</button>
                    <button type="button" className={button} disabled={busy} onClick={() => setEditing(null)}>{t.cancel}</button>
                  </div>
                </div>
              ) : null}

              {publishing?.program === p.program ? (
                <div className="space-y-3 border-t border-[#ECECEC] pt-3">
                  <p className="text-[11px] font-semibold text-gray-500">{t.termsHint}</p>
                  <label className={label}><span>{t.version}</span><input dir="ltr" className={input} maxLength={32} value={publishing.form.version} onChange={(e) => setPublishing({ ...publishing, form: { ...publishing.form, version: e.target.value } })} /></label>
                  <label className={label}><span>{t.bodyEn}</span><textarea dir="ltr" rows={6} className={input} value={publishing.form.en} onChange={(e) => setPublishing({ ...publishing, form: { ...publishing.form, en: e.target.value } })} /></label>
                  <label className={label}><span>{t.bodyAr}</span><textarea dir="rtl" rows={6} className={input} value={publishing.form.ar} onChange={(e) => setPublishing({ ...publishing, form: { ...publishing.form, ar: e.target.value } })} /></label>
                  <label className={label}><span>{t.reason}</span><input className={input} maxLength={300} value={publishing.form.reason} onChange={(e) => setPublishing({ ...publishing, form: { ...publishing.form, reason: e.target.value } })} /></label>
                  {formError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{formError}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={primary} disabled={busy} onClick={() => void submitTerms()}>{busy ? t.sending : t.publish}</button>
                    <button type="button" className={button} disabled={busy} onClick={() => setPublishing(null)}>{t.cancel}</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
