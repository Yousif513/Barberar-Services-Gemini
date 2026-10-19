"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { describeConsoleError } from "@/lib/console-errors.mjs";
import { CommandResult, ForbiddenNotice, isForbidden, operationsButton, operationsDate, operationsInput, useOperationsLocale } from "@/components/operations-ui";
import { CommandDialog } from "@/components/modal";

// X1 (docs/legal/2026-10-10-privacy-decision-memo.md): the personal data breach register. Awareness starts a 72-hour SDAIA clock
// shown on every open incident; SDAIA is notified for every breach unless a reasoned conclusion records that no harm is possible.
// Records are kept 5 years. Only incident.manage (owner) reaches these functions; the server refuses everyone else.

type Incident = {
  id: string; reference: string; title: string; description: string; discovered_at: string; aware_at: string; sdaia_deadline_at: string;
  hours_left: number | null; subject_categories: string[]; approx_subjects: number | null; data_types: string[]; risk_level: string;
  risk_assessment: string | null; containment_actions: string | null; preventive_actions: string | null; sdaia_decision: string;
  sdaia_decision_reason: string | null; sdaia_reference: string | null; sdaia_notified_at: string | null; sdaia_late_reason: string | null;
  subjects_decision: string; subjects_decision_reason: string | null; subjects_notified_at: string | null; subjects_channels: string[] | null;
  evidence: { label: string; reference: string | null; storage_path: string | null; added_at: string }[]; status: string; closed_at: string | null;
  retain_until: string; events?: { event: string; created_at: string }[]; aware_at_corrected_at?: string | null; aware_at_original?: string | null;
};

const copy = {
  en: {
    title: "Incident Register", subtitle: "Personal data breaches. Notify SDAIA within 72 hours of becoming aware, for every breach unless you record a reasoned conclusion that no harm is possible. Tell the people affected without undue delay whenever harm is possible. Records are kept 5 years.",
    open: "Open", closed: "Closed", newTitle: "Record a new incident", titleLabel: "Short title", description: "What happened (at least 20 characters)",
    discovered: "Discovered at (Riyadh time)", aware: "PRIMORA became aware at (Riyadh time) — starts the 72-hour clock", create: "Record the incident",
    cols: ["Reference", "Incident", "Aware", "SDAIA clock", "Status", ""], view: "View", empty: "No incidents in this list.", loading: "Loading…",
    loadFailed: "The register could not be loaded: {reason}", hoursLeft: "{h} h left", overdue: "72 hours passed", filed: "Filed with SDAIA", noHarm: "No-harm conclusion",
    statuses: { open: "Open", contained: "Contained", closed: "Closed" } as Record<string, string>,
    assessment: "Assessment", categories: "Categories of data subjects (comma separated)", approx: "Approximate number of data subjects", dataTypes: "Data types (comma separated)",
    risk: "Risk level", risks: { unassessed: "Not assessed", no_harm_possible: "No harm possible", low: "Low", medium: "Medium", high: "High" } as Record<string, string>,
    riskAssessment: "Risk assessment", containment: "Containment actions", preventive: "Preventive actions", markContained: "Contained", save: "Save the assessment",
    sdaia: "SDAIA notification", sdaiaDecision: "Decision", sdaiaDecisions: { notify: "Notify SDAIA", not_required_no_harm: "Not notified: no harm possible (reasoned)" } as Record<string, string>,
    sdaiaReason: "Reasoned no-harm conclusion (at least 30 characters)", sdaiaRef: "SDAIA reference", sdaiaAt: "Filed at (Riyadh time)", lateReason: "Reason the filing is after 72 hours",
    recordSdaia: "Record the SDAIA decision", subjects: "People affected", subjectsDecision: "Decision", subjectsDecisions: { notify: "Notify them", not_required: "Not notified (reasoned)" } as Record<string, string>,
    subjectsReason: "Reason (at least 20 characters when not notifying)", subjectsAt: "Sent at (Riyadh time)", channels: "Channels", recordSubjects: "Record the decision",
    evidence: "Evidence", evidenceLabel: "Label", evidenceRef: "Where it is kept (ticket, document)", evidenceFile: "Or upload a file", addEvidence: "Add evidence",
    close: "Close the incident", closeTitle: "Close this incident", closeReason: "Outcome summary (at least 20 characters)", retain: "Kept until {date}", history: "History", done: "Saved.", correctionAsked: "Correction requested: a second incident manager must approve it under Approvals before the 72-hour clock moves.",
    deadline: "SDAIA deadline", correctAware: "Correct the awareness time (once, approved by a second incident manager; moves the 72-hour clock)", correctAwareAt: "Correct awareness time (Riyadh time)",
    correctReason: "Why the recorded time was wrong (at least 20 characters)", correctSubmit: "Request the correction", corrected: "Awareness time corrected on {date}; recorded first as {old}.",
  },
  ar: {
    title: "سجل الحوادث", subtitle: "حوادث تسرب البيانات الشخصية. أبلغ سدايا خلال ٧٢ ساعة من العلم بالحادثة، لكل حادثة ما لم تسجل استنتاجاً مسبباً بعدم إمكان وقوع ضرر. أبلغ المتأثرين دون تأخير كلما أمكن وقوع ضرر. تُحفظ السجلات ٥ سنوات.",
    open: "مفتوحة", closed: "مغلقة", newTitle: "تسجيل حادثة جديدة", titleLabel: "عنوان مختصر", description: "ما الذي حدث (٢٠ حرفاً على الأقل)",
    discovered: "وقت الاكتشاف (بتوقيت الرياض)", aware: "وقت علم بريمورا (بتوقيت الرياض) — يبدأ مهلة ٧٢ ساعة", create: "تسجيل الحادثة",
    cols: ["المرجع", "الحادثة", "العلم", "مهلة سدايا", "الحالة", ""], view: "عرض", empty: "لا توجد حوادث في هذه القائمة.", loading: "جارٍ التحميل…",
    loadFailed: "تعذّر تحميل السجل: {reason}", hoursLeft: "متبقٍ {h} ساعة", overdue: "انقضت ٧٢ ساعة", filed: "أُبلغت سدايا", noHarm: "استنتاج عدم الضرر",
    statuses: { open: "مفتوحة", contained: "محتواة", closed: "مغلقة" } as Record<string, string>,
    assessment: "التقييم", categories: "فئات أصحاب البيانات (مفصولة بفواصل)", approx: "العدد التقريبي لأصحاب البيانات", dataTypes: "أنواع البيانات (مفصولة بفواصل)",
    risk: "مستوى الخطر", risks: { unassessed: "لم يُقيَّم", no_harm_possible: "لا ضرر ممكن", low: "منخفض", medium: "متوسط", high: "مرتفع" } as Record<string, string>,
    riskAssessment: "تقييم المخاطر", containment: "إجراءات الاحتواء", preventive: "الإجراءات الوقائية", markContained: "تم الاحتواء", save: "حفظ التقييم",
    sdaia: "إبلاغ سدايا", sdaiaDecision: "القرار", sdaiaDecisions: { notify: "إبلاغ سدايا", not_required_no_harm: "عدم الإبلاغ: لا ضرر ممكن (مسبب)" } as Record<string, string>,
    sdaiaReason: "استنتاج مسبب بعدم الضرر (٣٠ حرفاً على الأقل)", sdaiaRef: "مرجع سدايا", sdaiaAt: "وقت الإبلاغ (بتوقيت الرياض)", lateReason: "سبب الإبلاغ بعد ٧٢ ساعة",
    recordSdaia: "تسجيل قرار سدايا", subjects: "المتأثرون", subjectsDecision: "القرار", subjectsDecisions: { notify: "إبلاغهم", not_required: "عدم الإبلاغ (مسبب)" } as Record<string, string>,
    subjectsReason: "السبب (٢٠ حرفاً على الأقل عند عدم الإبلاغ)", subjectsAt: "وقت الإرسال (بتوقيت الرياض)", channels: "القنوات", recordSubjects: "تسجيل القرار",
    evidence: "الأدلة", evidenceLabel: "الوصف", evidenceRef: "مكان حفظها (تذكرة، مستند)", evidenceFile: "أو ارفع ملفاً", addEvidence: "إضافة دليل",
    close: "إغلاق الحادثة", closeTitle: "إغلاق هذه الحادثة", closeReason: "ملخص النتيجة (٢٠ حرفاً على الأقل)", retain: "تُحفظ حتى {date}", history: "السجل", done: "تم الحفظ.", correctionAsked: "طُلب التصحيح: يجب أن يعتمده مسؤول حوادث ثانٍ في صفحة الموافقات قبل أن تتغير مهلة ٧٢ ساعة.",
    deadline: "مهلة سدايا", correctAware: "تصحيح وقت العلم (مرة واحدة، بموافقة مسؤول حوادث ثانٍ، ويغيّر مهلة ٧٢ ساعة)", correctAwareAt: "وقت العلم الصحيح (بتوقيت الرياض)",
    correctReason: "لماذا كان الوقت المسجل خاطئاً (٢٠ حرفاً على الأقل)", correctSubmit: "طلب التصحيح", corrected: "صُحح وقت العلم في {date}؛ سُجل أولاً {old}.",
  },
};
type T = typeof copy.en;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928]";
const card = "rounded-2xl border border-[#ECECEC] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.015)]";
const label = "text-xs font-bold text-[#667085]";
const riyadhIso = (local: string) => (local ? new Date(`${local}:00+03:00`).toISOString() : null);
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function Clock({ i, t, lang }: { i: Incident; t: T; lang: "en" | "ar" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(id); }, []);
  if (i.sdaia_notified_at) return <span className="font-black text-emerald-700">{t.filed}</span>;
  if (i.sdaia_decision === "not_required_no_harm") return <span className="font-black text-gray-700">{t.noHarm}</span>;
  const hours = (new Date(i.sdaia_deadline_at).getTime() - now) / 3600000;
  return hours <= 0 ? <span className="font-black text-red-700">{t.overdue}</span>
    : <span className={`font-black ${hours < 24 ? "text-red-700" : "text-amber-800"}`}>{t.hoursLeft.replace("{h}", new Intl.NumberFormat(lang === "ar" ? "ar-SA" : "en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(hours))}</span>;
}

export default function AdminIncidents() {
  const lang = useOperationsLocale();
  const t = copy[lang];
  const [state, setState] = useState<"open" | "closed">("open");
  const [rows, setRows] = useState<Incident[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [closing, setClosing] = useState(false);
  const [create, setCreate] = useState({ title: "", description: "", discovered: "", aware: "" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("admin_incident_list", { p_state: state, p_limit: 100, p_offset: 0 });
      if (cancelled) return;
      if (error) { setLoadError(error); setRows(null); } else { setLoadError(null); setRows((data as { rows: Incident[] }).rows); }
    })();
    return () => { cancelled = true; };
  }, [state, reload]);

  const open = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("admin_incident_get", { p_incident_id: id });
    if (error) setNotice({ error: describeConsoleError(error, lang) }); else setSelected(data as Incident);
  }, []);
  const run = async (call: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await call;
    if (error) { setNotice({ error: describeConsoleError(error, lang) }); return false; }
    setNotice({ success: (data as { status?: string } | null)?.status === "pending_approval" ? t.correctionAsked : t.done });
    setReload((k) => k + 1);
    const id = (data as { id?: string } | null)?.id ?? selected?.id;
    if (id) await open(id);
    return true;
  };
  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(supabase.rpc("admin_incident_create", { p_title: create.title.trim(), p_description: create.description.trim(),
      p_discovered_at: riyadhIso(create.discovered), p_aware_at: riyadhIso(create.aware) }));
    if (ok) setCreate({ title: "", description: "", discovered: "", aware: "" });
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-black tracking-tight text-gray-900">{t.title}</h1>
        <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-gray-500">{t.subtitle}</p>
      </div>
      <CommandResult error={notice.error} success={notice.success} locale={lang} onDismiss={() => setNotice({})} />
      <div role="group" className="flex w-fit rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs font-bold">
        {(["open", "closed"] as const).map((v) => <button key={v} type="button" aria-pressed={state === v} onClick={() => { setState(v); setSelected(null); }} className={`rounded-lg px-3 py-1.5 ${focusRing} ${state === v ? "bg-white shadow-sm" : "text-gray-500"}`}>{t[v]}</button>)}
      </div>
      {loadError ? (isForbidden(loadError) ? <ForbiddenNotice locale={lang} /> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.loadFailed.replace("{reason}", describeConsoleError(loadError, lang))}</p>)
        : !rows ? <div role="status" className={card}>{t.loading}</div> : rows.length === 0 ? <div className={`${card} text-sm font-semibold text-gray-500`}>{t.empty}</div> : (
        <div role="region" aria-label={t.title} tabIndex={0} className={`overflow-x-auto rounded-2xl border border-[#ECECEC] bg-white ${focusRing}`}>
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-[#FAFAF7] text-[11px] font-extrabold uppercase tracking-widest text-[#667085]"><tr>{t.cols.map((c, i) => <th key={i} scope="col" className="px-4 py-3 text-start">{c}</th>)}</tr></thead>
            <tbody className="divide-y divide-[#F5F5F5] font-semibold text-gray-700">
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-mono" dir="ltr">{i.reference}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{i.title}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{operationsDate(i.aware_at, lang)}</td>
                  <td className="px-4 py-3"><Clock i={i} t={t} lang={lang} /></td>
                  <td className="px-4 py-3">{t.statuses[i.status]}</td>
                  <td className="px-4 py-3"><button type="button" onClick={() => void open(i.id)} className={`rounded-lg border border-[#ECECEC] px-2.5 py-1.5 text-[11px] font-black ${focusRing}`} aria-label={`${t.view}: ${i.reference}`}>{t.view}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && <IncidentDetail key={selected.id + selected.status + selected.sdaia_decision + selected.evidence.length} i={selected} t={t} lang={lang} run={run} onClose={() => setClosing(true)} />}
      {closing && selected && (
        <CommandDialog locale={lang} title={t.closeTitle} facts={[{ label: t.cols[0], value: selected.reference }]} reasonLabel={t.closeReason} minReasonLength={20}
          confirmLabel={t.close} onClose={() => setClosing(false)}
          onConfirm={async (note) => {
            const { error } = await supabase.rpc("admin_incident_close", { p_incident_id: selected.id, p_note: note });
            if (error) return describeConsoleError(error, lang);
            setNotice({ success: t.done }); setReload((k) => k + 1); await open(selected.id); return null;
          }} />
      )}
      <form onSubmit={(e) => void submitCreate(e)} className={`${card} grid gap-3 sm:grid-cols-2`} aria-labelledby="new-incident">
        <h2 id="new-incident" className="font-serif text-lg font-black text-gray-900 sm:col-span-2">{t.newTitle}</h2>
        <label className={label}>{t.titleLabel}<input required minLength={5} maxLength={200} value={create.title} onChange={(e) => setCreate({ ...create, title: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.discovered}<input type="datetime-local" required value={create.discovered} onChange={(e) => setCreate({ ...create, discovered: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={`${label} sm:col-span-2`}>{t.aware}<input type="datetime-local" required value={create.aware} onChange={(e) => setCreate({ ...create, aware: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={`${label} sm:col-span-2`}>{t.description}<textarea required minLength={20} rows={3} value={create.description} onChange={(e) => setCreate({ ...create, description: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <div className="sm:col-span-2"><button type="submit" className={operationsButton}>{t.create}</button></div>
      </form>
    </div>
  );
}

function IncidentDetail({ i, t, lang, run, onClose }: { i: Incident; t: T; lang: "en" | "ar"; run: (c: PromiseLike<{ data: unknown; error: unknown }>) => Promise<boolean>; onClose: () => void }) {
  const closed = i.status === "closed";
  const [a, setA] = useState({ categories: i.subject_categories.join(", "), approx: i.approx_subjects?.toString() ?? "", types: i.data_types.join(", "),
    risk: i.risk_level, assessment: i.risk_assessment ?? "", containment: i.containment_actions ?? "", preventive: i.preventive_actions ?? "" });
  const [s, setS] = useState({ decision: i.sdaia_decision === "pending" ? "notify" : i.sdaia_decision, reason: i.sdaia_decision_reason ?? "", ref: i.sdaia_reference ?? "", at: "", late: i.sdaia_late_reason ?? "" });
  const [p, setP] = useState({ decision: i.subjects_decision === "pending" ? "notify" : i.subjects_decision, reason: i.subjects_decision_reason ?? "", at: "", channels: i.subjects_channels ?? [] as string[] });
  const [ev, setEv] = useState({ label: "", ref: "", file: null as File | null });
  const [fix, setFix] = useState({ at: "", reason: "" });
  const saveAssessment = (contained: boolean) => run(supabase.rpc("admin_incident_update", { p_incident_id: i.id, p_changes: {
    subject_categories: list(a.categories), approx_subjects: a.approx === "" ? null : Number(a.approx), data_types: list(a.types), risk_level: a.risk,
    risk_assessment: a.assessment, containment_actions: a.containment, preventive_actions: a.preventive, ...(contained ? { status: "contained" } : {}) } }));
  const addEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    let path: string | null = null;
    if (ev.file) {
      path = `${i.id}/${Date.now()}-${ev.file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
      const { error } = await supabase.storage.from("privacy-incident-evidence").upload(path, ev.file);
      if (error) { await run(Promise.resolve({ data: null, error })); return; }
    }
    if (await run(supabase.rpc("admin_incident_add_evidence", { p_incident_id: i.id, p_label: ev.label.trim(), p_reference: ev.ref.trim() || null, p_storage_path: path }))) setEv({ label: "", ref: "", file: null });
  };
  return (
    <section className={`${card} space-y-5`} aria-labelledby="incident-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="incident-detail" className="font-serif text-lg font-black text-gray-900"><bdi dir="ltr">{i.reference}</bdi> · {i.title}</h2>
          <p className="mt-1 text-xs text-gray-600">{i.description}</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">{t.deadline}: {operationsDate(i.sdaia_deadline_at, lang)} · <Clock i={i} t={t} lang={lang} /> · {t.retain.replace("{date}", operationsDate(i.retain_until, lang))}</p>
        </div>
        {!closed && <button type="button" onClick={onClose} className={operationsButton}>{t.close}</button>}
      </div>
      {i.aware_at_corrected_at && i.aware_at_original ? (
        <p className="text-xs font-semibold text-gray-600">{t.corrected.replace("{date}", operationsDate(i.aware_at_corrected_at, lang)).replace("{old}", operationsDate(i.aware_at_original, lang))}</p>
      ) : !closed && (
        <form onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc("admin_incident_correct_aware_at", { p_incident_id: i.id, p_aware_at: riyadhIso(fix.at), p_reason: fix.reason.trim() })).then((ok) => { if (ok) setFix({ at: "", reason: "" }); }); }}
          className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end" aria-label={t.correctAware}>
          <label className={label}>{t.correctAwareAt}<input type="datetime-local" required value={fix.at} onChange={(e) => setFix({ ...fix, at: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          <label className={label}>{t.correctReason}<input required minLength={20} value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          <button type="submit" className={operationsButton}>{t.correctSubmit}</button>
        </form>
      )}
      <fieldset disabled={closed} className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-black text-gray-900">{t.assessment}</legend>
        <label className={label}>{t.categories}<input value={a.categories} onChange={(e) => setA({ ...a, categories: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.approx}<input type="number" min={0} value={a.approx} onChange={(e) => setA({ ...a, approx: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.dataTypes}<input value={a.types} onChange={(e) => setA({ ...a, types: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.risk}<select value={a.risk} onChange={(e) => setA({ ...a, risk: e.target.value })} className={`${operationsInput} mt-1`}>{Object.entries(t.risks).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className={`${label} sm:col-span-2`}>{t.riskAssessment}<textarea rows={2} value={a.assessment} onChange={(e) => setA({ ...a, assessment: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.containment}<textarea rows={2} value={a.containment} onChange={(e) => setA({ ...a, containment: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <label className={label}>{t.preventive}<textarea rows={2} value={a.preventive} onChange={(e) => setA({ ...a, preventive: e.target.value })} className={`${operationsInput} mt-1`} /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="button" onClick={() => void saveAssessment(false)} className={operationsButton}>{t.save}</button>
          {i.status === "open" && <button type="button" onClick={() => void saveAssessment(true)} className={operationsButton}>{t.markContained}</button>}
        </div>
      </fieldset>
      <form onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc("admin_incident_record_sdaia", { p_incident_id: i.id, p_decision: s.decision, p_reason: s.reason || null,
          p_reference: s.ref || null, p_notified_at: riyadhIso(s.at), p_late_reason: s.late || null })); }} className="grid gap-3 sm:grid-cols-2">
        <fieldset disabled={closed} className="contents">
          <legend className="text-sm font-black text-gray-900 sm:col-span-2">{t.sdaia}</legend>
          <label className={label}>{t.sdaiaDecision}<select value={s.decision} onChange={(e) => setS({ ...s, decision: e.target.value })} className={`${operationsInput} mt-1`}>{Object.entries(t.sdaiaDecisions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {s.decision === "notify" ? (<>
            <label className={label}>{t.sdaiaRef}<input value={s.ref} onChange={(e) => setS({ ...s, ref: e.target.value })} className={`${operationsInput} mt-1`} /></label>
            <label className={label}>{t.sdaiaAt}<input type="datetime-local" value={s.at} onChange={(e) => setS({ ...s, at: e.target.value })} className={`${operationsInput} mt-1`} /></label>
            <label className={label}>{t.lateReason}<input value={s.late} onChange={(e) => setS({ ...s, late: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          </>) : (
            <label className={`${label} sm:col-span-2`}>{t.sdaiaReason}<textarea rows={2} value={s.reason} onChange={(e) => setS({ ...s, reason: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          )}
          <div className="sm:col-span-2"><button type="submit" className={operationsButton}>{t.recordSdaia}</button></div>
        </fieldset>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc("admin_incident_record_subjects", { p_incident_id: i.id, p_decision: p.decision, p_reason: p.reason || null,
          p_notified_at: riyadhIso(p.at), p_channels: p.channels.length ? p.channels : null })); }} className="grid gap-3 sm:grid-cols-2">
        <fieldset disabled={closed} className="contents">
          <legend className="text-sm font-black text-gray-900 sm:col-span-2">{t.subjects}</legend>
          <label className={label}>{t.subjectsDecision}<select value={p.decision} onChange={(e) => setP({ ...p, decision: e.target.value })} className={`${operationsInput} mt-1`}>{Object.entries(t.subjectsDecisions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className={label}>{t.subjectsAt}<input type="datetime-local" value={p.at} onChange={(e) => setP({ ...p, at: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          <fieldset className="text-xs"><legend className={label}>{t.channels}</legend>
            <div className="mt-1 flex gap-3">{["sms", "email"].map((c) => <label key={c} className="flex items-center gap-1.5"><input type="checkbox" checked={p.channels.includes(c)} onChange={(e) => setP({ ...p, channels: e.target.checked ? [...p.channels, c] : p.channels.filter((x) => x !== c) })} className="accent-[#9B7928]" />{c.toUpperCase()}</label>)}</div>
          </fieldset>
          <label className={label}>{t.subjectsReason}<input value={p.reason} onChange={(e) => setP({ ...p, reason: e.target.value })} className={`${operationsInput} mt-1`} /></label>
          <div className="sm:col-span-2"><button type="submit" className={operationsButton}>{t.recordSubjects}</button></div>
        </fieldset>
      </form>
      <div>
        <h3 className="text-sm font-black text-gray-900">{t.evidence}</h3>
        <ul className="mt-2 space-y-1 text-xs text-gray-700">{i.evidence.map((e, k) => <li key={k}>{e.label}{e.reference ? ` · ${e.reference}` : ""}{e.storage_path ? <bdi dir="ltr" className="font-mono"> · {e.storage_path.split("/").pop()}</bdi> : null} · {operationsDate(e.added_at, lang)}</li>)}</ul>
        {!closed && (
          <form onSubmit={(e) => void addEvidence(e)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <label className={label}>{t.evidenceLabel}<input required minLength={3} value={ev.label} onChange={(e) => setEv({ ...ev, label: e.target.value })} className={`${operationsInput} mt-1`} /></label>
            <label className={label}>{t.evidenceRef}<input value={ev.ref} onChange={(e) => setEv({ ...ev, ref: e.target.value })} className={`${operationsInput} mt-1`} /></label>
            <label className={label}>{t.evidenceFile}<input type="file" onChange={(e) => setEv({ ...ev, file: e.target.files?.[0] ?? null })} className="mt-1 block w-full text-xs" /></label>
            <button type="submit" className={operationsButton}>{t.addEvidence}</button>
          </form>
        )}
      </div>
      {i.events && <div><h3 className="text-xs font-black uppercase tracking-widest text-[#667085]">{t.history}</h3><ol className="mt-1 space-y-0.5 text-xs text-gray-600">{i.events.map((e, k) => <li key={k}>{operationsDate(e.created_at, lang)} · {e.event.replace(/_/g, " ")}</li>)}</ol></div>}
    </section>
  );
}
