"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { useConfirm } from "@/components/modal";
import { riyadhDateKey } from "@/lib/booking-display.mjs";
import { checkClosure, checkLeave, checkSeason, isOvernightShift, rangesOverlap } from "@/lib/schedule-exceptions.mjs";
import { providerFieldClass, providerGhostButton, providerLabelClass, providerPrimaryButton } from "./dialog";

type Lang = "en" | "ar";
export type BranchOption = { id: string; name: string };

const copy = {
  en: {
    allBranches: "All branches",
    branch: "Branch",
    save: "Save",
    saving: "Saving…",
    delete: "Delete",
    loading: "Loading…",
    cancel: "Cancel",
    from: "From",
    to: "To",
    reasonEn: "Reason (English)",
    reasonAr: "Reason (Arabic)",
    reasonNeeded: "Write the reason in at least one language.",
    dateProblems: {
      required: "Choose both dates.",
      invalid: "Enter real dates.",
      order: "The last day cannot be before the first day.",
      past: "The first day cannot be in the past.",
      tooLong: "That range is too long.",
    },
    overlap: "This overlaps another entry for the same branch. Change the dates or delete the other entry first.",
    loadFailed: "Could not load: ",
    saveFailed: "Not saved: ",
    // closures
    closuresTitle: "Closures and holidays",
    closuresIntro: "Customers cannot book on these days. Bookings already made stay as they are and are not cancelled for you.",
    closureType: "Type",
    types: { holiday: "Holiday", emergency: "Emergency", maintenance: "Maintenance", other: "Other" },
    closuresEmpty: "No closures yet.",
    addClosure: "Add closure",
    affectedTitle: "Bookings already exist on these days",
    affectedIntro: "{n} booking(s) fall inside this closure. They are not cancelled or moved: reschedule or cancel them from Bookings. New bookings on these days will be blocked.",
    affectedConfirm: "Close anyway",
    deleteClosureTitle: "Delete this closure?",
    deleteClosureIntro: "Customers will be able to book those days again.",
    // seasons
    seasonsTitle: "Seasonal schedules",
    seasonsIntro: "Different opening hours for a period, for example Ramadan evenings. A closing time before the opening time runs past midnight.",
    seasonName: "Season name",
    startTime: "Opens",
    endTime: "Closes",
    secondShift: "Add a second shift",
    secondStart: "Second shift opens",
    secondEnd: "Second shift closes",
    active: "Active",
    inactive: "Paused",
    activate: "Switch on",
    pause: "Pause",
    overnight: "Overnight",
    seasonsEmpty: "No seasonal schedules yet.",
    addSeason: "Add season",
    seasonProblems: {
      name: "Give the season a name of 2 to 100 characters.",
      dates: "Check the dates.",
      times: "Set the opening and closing time.",
      sameTime: "Opening and closing time cannot be the same.",
      secondTimes: "Set both times of the second shift.",
      secondSameTime: "The second shift cannot open and close at the same time.",
    },
    deleteSeasonTitle: "Delete this season?",
    deleteSeasonIntro: "Its opening hours stop applying immediately.",
    // leave
    leaveTitle: "Team leave",
    leaveIntro: "Requests from your professionals wait here. Approved leave removes their slots on those days.",
    leaveEmpty: "No leave requests or entries.",
    professional: "Professional",
    note: "Note (optional)",
    approve: "Approve",
    reject: "Reject",
    rejectTitle: "Reject this leave request?",
    rejectIntro: "The professional will see the request as rejected.",
    status: { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" },
    addLeave: "Record approved leave",
    leaveNote: "Bookings that already exist on those days are not cancelled automatically.",
  },
  ar: {
    allBranches: "كل الفروع",
    branch: "الفرع",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    delete: "حذف",
    loading: "جارٍ التحميل…",
    cancel: "إلغاء",
    from: "من",
    to: "إلى",
    reasonEn: "السبب (إنجليزي)",
    reasonAr: "السبب (عربي)",
    reasonNeeded: "اكتب السبب بلغة واحدة على الأقل.",
    dateProblems: {
      required: "اختر التاريخين.",
      invalid: "أدخل تواريخ صحيحة.",
      order: "لا يمكن أن يسبق اليوم الأخير اليوم الأول.",
      past: "لا يمكن أن يكون اليوم الأول في الماضي.",
      tooLong: "هذه الفترة طويلة جداً.",
    },
    overlap: "تتقاطع هذه الفترة مع إدخال آخر لنفس الفرع. غيّر التواريخ أو احذف الإدخال الآخر أولاً.",
    loadFailed: "تعذر التحميل: ",
    saveFailed: "لم يُحفظ: ",
    closuresTitle: "الإغلاقات والإجازات الرسمية",
    closuresIntro: "لا يستطيع العملاء الحجز في هذه الأيام. الحجوزات القائمة تبقى كما هي ولا تُلغى تلقائياً.",
    closureType: "النوع",
    types: { holiday: "إجازة رسمية", emergency: "طارئ", maintenance: "صيانة", other: "أخرى" },
    closuresEmpty: "لا توجد إغلاقات بعد.",
    addClosure: "إضافة إغلاق",
    affectedTitle: "توجد حجوزات في هذه الأيام",
    affectedIntro: "يقع {n} حجز ضمن هذا الإغلاق. لن تُلغى أو تُنقل: أعد جدولتها أو ألغِها من شاشة الحجوزات. الحجوزات الجديدة في هذه الأيام ستُمنع.",
    affectedConfirm: "أغلق على أي حال",
    deleteClosureTitle: "حذف هذا الإغلاق؟",
    deleteClosureIntro: "سيتمكن العملاء من الحجز في تلك الأيام من جديد.",
    seasonsTitle: "الجداول الموسمية",
    seasonsIntro: "ساعات عمل مختلفة لفترة معينة، مثل ليالي رمضان. وقت إغلاق قبل وقت الفتح يعني وردية تمتد بعد منتصف الليل.",
    seasonName: "اسم الموسم",
    startTime: "الفتح",
    endTime: "الإغلاق",
    secondShift: "إضافة وردية ثانية",
    secondStart: "فتح الوردية الثانية",
    secondEnd: "إغلاق الوردية الثانية",
    active: "فعّال",
    inactive: "متوقف",
    activate: "تشغيل",
    pause: "إيقاف",
    overnight: "ليلي",
    seasonsEmpty: "لا توجد جداول موسمية بعد.",
    addSeason: "إضافة موسم",
    seasonProblems: {
      name: "أعطِ الموسم اسماً من 2 إلى 100 حرف.",
      dates: "تحقق من التواريخ.",
      times: "حدد وقت الفتح ووقت الإغلاق.",
      sameTime: "لا يمكن أن يتساوى وقت الفتح مع وقت الإغلاق.",
      secondTimes: "حدد وقتي الوردية الثانية.",
      secondSameTime: "لا يمكن أن تفتح الوردية الثانية وتغلق في الوقت نفسه.",
    },
    deleteSeasonTitle: "حذف هذا الموسم؟",
    deleteSeasonIntro: "تتوقف ساعات عمله عن السريان فوراً.",
    leaveTitle: "إجازات الفريق",
    leaveIntro: "طلبات أخصائييك تنتظر هنا. الإجازة المعتمدة تُزيل مواعيدهم المتاحة في تلك الأيام.",
    leaveEmpty: "لا توجد طلبات أو إدخالات إجازة.",
    professional: "الأخصائي",
    note: "ملاحظة (اختياري)",
    approve: "اعتماد",
    reject: "رفض",
    rejectTitle: "رفض طلب الإجازة؟",
    rejectIntro: "سيرى الأخصائي أن الطلب مرفوض.",
    status: { pending: "بانتظار الموافقة", approved: "معتمدة", rejected: "مرفوضة" },
    addLeave: "تسجيل إجازة معتمدة",
    leaveNote: "الحجوزات القائمة في تلك الأيام لا تُلغى تلقائياً.",
  },
};

const fmtDate = (value: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const nextDay = (value: string) => new Date(new Date(`${value}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
const hhmm = (value: string | null) => String(value ?? "").slice(0, 5);
const useToday = () => useMemo(() => riyadhDateKey(new Date()) as string, []);

function SectionShell({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.015)] text-start">
      <h2 id={id} className="font-serif text-xl font-black text-[#101828]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#667085]">{intro}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}
const problem = (message: string) => <p role="alert" className="mt-1 text-xs font-semibold text-[#B42318]">{message}</p>;
const failureBox = (message: string) => message ? <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318]">{message}</div> : null;

function BranchSelect({ id, lang, branches, value, onChange, disabled }: { id: string; lang: Lang; branches: BranchOption[]; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const t = copy[lang];
  return (
    <div>
      <label className={providerLabelClass} htmlFor={id}>{t.branch}</label>
      <select id={id} className={providerFieldClass} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{t.allBranches}</option>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
type ClosureRow = { id: string; branch_id: string | null; start_date: string; end_date: string; reason_en: string; reason_ar: string; closure_type: string };

export function ClosuresSection({ lang, providerId, branches }: { lang: Lang; providerId: string; branches: BranchOption[] }) {
  const t = copy[lang];
  const today = useToday();
  const [rows, setRows] = useState<ClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ start: "", end: "", type: "holiday", reasonEn: "", reasonAr: "", branchId: "" });
  const [attempted, setAttempted] = useState(false);
  const [confirmNode, askConfirm] = useConfirm(lang);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("provider_closures")
        .select("id, branch_id, start_date, end_date, reason_en, reason_ar, closure_type")
        .eq("provider_id", providerId)
        .order("start_date", { ascending: false })
        .limit(200);
      if (!live) return;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else { setRows((data ?? []) as ClosureRow[]); setFailure(""); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, version, t.loadFailed]);

  const dateProblem = checkClosure({ start: form.start, end: form.end, today });
  const reasonProblem = !form.reasonEn.trim() && !form.reasonAr.trim();
  const overlapping = !dateProblem && rows.some((row) => (!row.branch_id || !form.branchId || row.branch_id === form.branchId) && rangesOverlap({ start: row.start_date, end: row.end_date }, { start: form.start, end: form.end }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (dateProblem || reasonProblem || overlapping || busy) return;
    setBusy(true);
    setFailure("");
    const scope = form.branchId ? [form.branchId] : branches.map((branch) => branch.id);
    const { count, error: countError } = scope.length === 0 ? { count: 0, error: null } : await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .in("branch_id", scope)
      .in("status", ["pending_payment", "confirmed"])
      .gte("scheduled_at", `${form.start}T00:00:00+03:00`)
      .lt("scheduled_at", `${nextDay(form.end)}T00:00:00+03:00`);
    if (countError) { setBusy(false); setFailure(t.saveFailed + errorMessage(countError)); return; }
    if ((count ?? 0) > 0) {
      const go = await askConfirm({
        title: t.affectedTitle,
        intro: t.affectedIntro.replace("{n}", String(count)),
        facts: [{ label: t.from, value: fmtDate(form.start, lang) }, { label: t.to, value: fmtDate(form.end, lang) }],
        confirmLabel: t.affectedConfirm,
        tone: "danger",
      });
      if (!go) { setBusy(false); return; }
    }
    const { error } = await supabase.from("provider_closures").insert({
      provider_id: providerId,
      branch_id: form.branchId || null,
      start_date: form.start,
      end_date: form.end,
      closure_type: form.type,
      reason_en: form.reasonEn.trim() || form.reasonAr.trim(),
      reason_ar: form.reasonAr.trim() || form.reasonEn.trim(),
    });
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setForm({ start: "", end: "", type: "holiday", reasonEn: "", reasonAr: "", branchId: "" });
    setAttempted(false);
    setVersion((value) => value + 1);
  };

  const remove = async (row: ClosureRow) => {
    const yes = await askConfirm({
      title: t.deleteClosureTitle,
      intro: t.deleteClosureIntro,
      facts: [{ label: t.from, value: fmtDate(row.start_date, lang) }, { label: t.to, value: fmtDate(row.end_date, lang) }],
      confirmLabel: t.delete,
      tone: "danger",
    });
    if (!yes) return;
    setBusy(true);
    const { error } = await supabase.from("provider_closures").delete().eq("id", row.id);
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setVersion((value) => value + 1);
  };

  const branchName = (id: string | null) => (id ? branches.find((branch) => branch.id === id)?.name ?? "" : t.allBranches);

  return (
    <SectionShell id="closures-title" title={t.closuresTitle} intro={t.closuresIntro}>
      {loading ? <p role="status" className="text-sm text-[#667085]">{t.loading}</p> : rows.length === 0 ? <p className="rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-4 text-sm text-[#667085]">{t.closuresEmpty}</p> : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#101828]">{fmtDate(row.start_date, lang)}{row.end_date !== row.start_date ? ` - ${fmtDate(row.end_date, lang)}` : ""}</p>
                <p className="text-xs text-[#667085]">{(t.types as Record<string, string>)[row.closure_type] ?? row.closure_type} · {branchName(row.branch_id)}</p>
                <p className="text-xs text-[#344054]">{(lang === "ar" ? row.reason_ar || row.reason_en : row.reason_en || row.reason_ar)}</p>
              </div>
              <button type="button" disabled={busy} onClick={() => void remove(row)} className="rounded-xl border border-[#FECDCA] px-3 py-2 text-xs font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.delete}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4 rounded-2xl border border-[#ECECEC] p-4 sm:grid-cols-2">
        <div>
          <label className={providerLabelClass} htmlFor="closure-from">{t.from}</label>
          <input id="closure-from" type="date" min={today} dir="ltr" className={providerFieldClass} value={form.start} disabled={busy} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-invalid={attempted && Boolean(dateProblem)} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="closure-to">{t.to}</label>
          <input id="closure-to" type="date" min={form.start || today} dir="ltr" className={providerFieldClass} value={form.end} disabled={busy} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-invalid={attempted && Boolean(dateProblem)} />
        </div>
        {attempted && dateProblem && <div className="sm:col-span-2">{problem(t.dateProblems[dateProblem])}</div>}
        <div>
          <label className={providerLabelClass} htmlFor="closure-type">{t.closureType}</label>
          <select id="closure-type" className={providerFieldClass} value={form.type} disabled={busy} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(t.types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <BranchSelect id="closure-branch" lang={lang} branches={branches} value={form.branchId} onChange={(branchId) => setForm({ ...form, branchId })} disabled={busy} />
        <div>
          <label className={providerLabelClass} htmlFor="closure-reason-en">{t.reasonEn}</label>
          <input id="closure-reason-en" dir="ltr" className={providerFieldClass} value={form.reasonEn} disabled={busy} onChange={(e) => setForm({ ...form, reasonEn: e.target.value })} maxLength={200} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="closure-reason-ar">{t.reasonAr}</label>
          <input id="closure-reason-ar" dir="rtl" className={providerFieldClass} value={form.reasonAr} disabled={busy} onChange={(e) => setForm({ ...form, reasonAr: e.target.value })} maxLength={200} />
        </div>
        {attempted && reasonProblem && <div className="sm:col-span-2">{problem(t.reasonNeeded)}</div>}
        {attempted && overlapping && <div className="sm:col-span-2">{problem(t.overlap)}</div>}
        <div className="sm:col-span-2">{failureBox(failure)}</div>
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={busy} className={providerPrimaryButton}>{busy ? t.saving : t.addClosure}</button>
        </div>
      </form>
      {confirmNode}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
type SeasonRow = {
  id: string; branch_id: string | null; season_name: string; start_date: string; end_date: string; start_time: string; end_time: string;
  has_second_shift: boolean; second_start_time: string | null; second_end_time: string | null; is_active: boolean;
};

export function SeasonsSection({ lang, providerId, branches }: { lang: Lang; providerId: string; branches: BranchOption[] }) {
  const t = copy[lang];
  const today = useToday();
  const [rows, setRows] = useState<SeasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = { name: "", start: "", end: "", startTime: "", endTime: "", second: false, secondStart: "", secondEnd: "", branchId: "" };
  const [form, setForm] = useState(empty);
  const [attempted, setAttempted] = useState(false);
  const [confirmNode, askConfirm] = useConfirm(lang);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("seasonal_schedules")
        .select("id, branch_id, season_name, start_date, end_date, start_time, end_time, has_second_shift, second_start_time, second_end_time, is_active")
        .eq("provider_id", providerId)
        .order("start_date", { ascending: false })
        .limit(200);
      if (!live) return;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else { setRows((data ?? []) as SeasonRow[]); setFailure(""); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [providerId, version, t.loadFailed]);

  const seasonProblem = checkSeason({ name: form.name, start: form.start, end: form.end, startTime: form.startTime, endTime: form.endTime, secondShift: form.second, secondStartTime: form.secondStart, secondEndTime: form.secondEnd, today });
  const overlapping = !seasonProblem && rows.some((row) => row.is_active && (!row.branch_id || !form.branchId || row.branch_id === form.branchId) && rangesOverlap({ start: row.start_date, end: row.end_date }, { start: form.start, end: form.end }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (seasonProblem || overlapping || busy) return;
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("seasonal_schedules").insert({
      provider_id: providerId,
      branch_id: form.branchId || null,
      season_name: form.name.trim(),
      start_date: form.start,
      end_date: form.end,
      start_time: form.startTime,
      end_time: form.endTime,
      has_second_shift: form.second,
      second_start_time: form.second ? form.secondStart : null,
      second_end_time: form.second ? form.secondEnd : null,
      is_active: true,
    });
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setForm(empty);
    setAttempted(false);
    setVersion((value) => value + 1);
  };

  const toggle = async (row: SeasonRow) => {
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("seasonal_schedules").update({ is_active: !row.is_active }).eq("id", row.id);
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setVersion((value) => value + 1);
  };

  const remove = async (row: SeasonRow) => {
    const yes = await askConfirm({ title: t.deleteSeasonTitle, intro: t.deleteSeasonIntro, facts: [{ label: t.seasonName, value: row.season_name }], confirmLabel: t.delete, tone: "danger" });
    if (!yes) return;
    setBusy(true);
    const { error } = await supabase.from("seasonal_schedules").delete().eq("id", row.id);
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setVersion((value) => value + 1);
  };

  const branchName = (id: string | null) => (id ? branches.find((branch) => branch.id === id)?.name ?? "" : t.allBranches);
  const timeText = (start: string, end: string) => `${hhmm(start)} - ${hhmm(end)}${isOvernightShift(hhmm(start), hhmm(end)) ? ` (${t.overnight})` : ""}`;

  return (
    <SectionShell id="seasons-title" title={t.seasonsTitle} intro={t.seasonsIntro}>
      {loading ? <p role="status" className="text-sm text-[#667085]">{t.loading}</p> : rows.length === 0 ? <p className="rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-4 text-sm text-[#667085]">{t.seasonsEmpty}</p> : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#101828]">{row.season_name} <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] font-black ${row.is_active ? "bg-[#ECFDF3] text-[#067647]" : "bg-[#F2F4F7] text-[#475467]"}`}>{row.is_active ? t.active : t.inactive}</span></p>
                <p className="text-xs text-[#667085]">{fmtDate(row.start_date, lang)} - {fmtDate(row.end_date, lang)} · {branchName(row.branch_id)}</p>
                <p dir="ltr" className="text-xs font-mono text-[#344054]">{timeText(row.start_time, row.end_time)}{row.has_second_shift && row.second_start_time && row.second_end_time ? ` + ${timeText(row.second_start_time, row.second_end_time)}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => void toggle(row)} className={providerGhostButton}>{row.is_active ? t.pause : t.activate}</button>
                <button type="button" disabled={busy} onClick={() => void remove(row)} className="rounded-xl border border-[#FECDCA] px-3 py-2 text-xs font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.delete}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4 rounded-2xl border border-[#ECECEC] p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={providerLabelClass} htmlFor="season-name">{t.seasonName}</label>
          <input id="season-name" className={providerFieldClass} value={form.name} disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="season-from">{t.from}</label>
          <input id="season-from" type="date" min={today} dir="ltr" className={providerFieldClass} value={form.start} disabled={busy} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="season-to">{t.to}</label>
          <input id="season-to" type="date" min={form.start || today} dir="ltr" className={providerFieldClass} value={form.end} disabled={busy} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="season-open">{t.startTime}</label>
          <input id="season-open" type="time" dir="ltr" className={providerFieldClass} value={form.startTime} disabled={busy} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="season-close">{t.endTime}</label>
          <input id="season-close" type="time" dir="ltr" className={providerFieldClass} value={form.endTime} disabled={busy} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
          {isOvernightShift(form.startTime, form.endTime) && <p className="mt-1 text-xs font-semibold text-[#9A741F]">{t.overnight}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#344054] sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-[#9B7928]" checked={form.second} disabled={busy} onChange={(e) => setForm({ ...form, second: e.target.checked })} />
          {t.secondShift}
        </label>
        {form.second && (
          <>
            <div>
              <label className={providerLabelClass} htmlFor="season-open2">{t.secondStart}</label>
              <input id="season-open2" type="time" dir="ltr" className={providerFieldClass} value={form.secondStart} disabled={busy} onChange={(e) => setForm({ ...form, secondStart: e.target.value })} />
            </div>
            <div>
              <label className={providerLabelClass} htmlFor="season-close2">{t.secondEnd}</label>
              <input id="season-close2" type="time" dir="ltr" className={providerFieldClass} value={form.secondEnd} disabled={busy} onChange={(e) => setForm({ ...form, secondEnd: e.target.value })} />
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <BranchSelect id="season-branch" lang={lang} branches={branches} value={form.branchId} onChange={(branchId) => setForm({ ...form, branchId })} disabled={busy} />
        </div>
        {attempted && seasonProblem && <div className="sm:col-span-2">{problem(t.seasonProblems[seasonProblem])}</div>}
        {attempted && overlapping && <div className="sm:col-span-2">{problem(t.overlap)}</div>}
        <div className="sm:col-span-2">{failureBox(failure)}</div>
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={busy} className={providerPrimaryButton}>{busy ? t.saving : t.addSeason}</button>
        </div>
      </form>
      {confirmNode}
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
type LeaveRow = { id: string; employee_id: string; start_date: string; end_date: string; reason: string | null; status: "pending" | "approved" | "rejected"; employees: { name_en: string | null; name_ar: string | null } | null };
type Person = { id: string; name: string };

export function LeaveSection({ lang, branches }: { lang: Lang; branches: BranchOption[] }) {
  const t = copy[lang];
  const today = useToday();
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ employeeId: "", start: "", end: "", note: "" });
  const [attempted, setAttempted] = useState(false);
  const [confirmNode, askConfirm] = useConfirm(lang);
  const branchKey = branches.map((branch) => branch.id).join(",");

  useEffect(() => {
    const ids = branchKey ? branchKey.split(",") : [];
    if (ids.length === 0) return;
    let live = true;
    void (async () => {
      const [leave, staff] = await Promise.all([
        supabase
          .from("employee_time_off")
          .select("id, employee_id, start_date, end_date, reason, status, employees!inner ( name_en, name_ar, branch_id )")
          .in("employees.branch_id", ids)
          .order("start_date", { ascending: false })
          .limit(200),
        supabase.from("employees").select("id, name_en, name_ar").in("branch_id", ids).eq("is_active", true).order("name_en"),
      ]);
      if (!live) return;
      const error = leave.error || staff.error;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else {
        setRows((leave.data ?? []) as unknown as LeaveRow[]);
        setPeople((staff.data ?? []).map((row) => ({ id: row.id as string, name: ((lang === "ar" ? row.name_ar || row.name_en : row.name_en || row.name_ar) as string) || "" })));
        setFailure("");
      }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [branchKey, version, lang, t.loadFailed]);

  const decide = async (row: LeaveRow, status: "approved" | "rejected") => {
    if (status === "rejected") {
      const yes = await askConfirm({ title: t.rejectTitle, intro: t.rejectIntro, facts: [{ label: t.professional, value: nameOf(row) }, { label: t.from, value: fmtDate(row.start_date, lang) }], confirmLabel: t.reject, tone: "danger" });
      if (!yes) return;
    }
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("employee_time_off").update({ status }).eq("id", row.id);
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setVersion((value) => value + 1);
  };

  const nameOf = useCallback((row: LeaveRow) => (lang === "ar" ? row.employees?.name_ar || row.employees?.name_en : row.employees?.name_en || row.employees?.name_ar) || "", [lang]);

  const dateProblem = checkLeave({ start: form.start, end: form.end, today });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!form.employeeId || dateProblem || busy) return;
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("employee_time_off").insert({
      employee_id: form.employeeId, start_date: form.start, end_date: form.end, reason: form.note.trim() || null, status: "approved",
    });
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setForm({ employeeId: "", start: "", end: "", note: "" });
    setAttempted(false);
    setVersion((value) => value + 1);
  };

  const pending = rows.filter((row) => row.status === "pending");
  const decided = rows.filter((row) => row.status !== "pending");

  return (
    <SectionShell id="leave-title" title={t.leaveTitle} intro={t.leaveIntro}>
      {loading && branches.length > 0 ? <p role="status" className="text-sm text-[#667085]">{t.loading}</p> : rows.length === 0 ? <p className="rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-4 text-sm text-[#667085]">{t.leaveEmpty}</p> : (
        <ul className="space-y-2">
          {[...pending, ...decided].map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#101828]">{nameOf(row)}</p>
                <p className="text-xs text-[#667085]">{fmtDate(row.start_date, lang)}{row.end_date !== row.start_date ? ` - ${fmtDate(row.end_date, lang)}` : ""}</p>
                {row.reason && <p className="text-xs text-[#344054]">{row.reason}</p>}
                <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${row.status === "approved" ? "bg-[#ECFDF3] text-[#067647]" : row.status === "rejected" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#93370D]"}`}>{t.status[row.status]}</p>
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void decide(row, "approved")} className={providerPrimaryButton}>{t.approve}</button>
                  <button type="button" disabled={busy} onClick={() => void decide(row, "rejected")} className="rounded-xl border border-[#FECDCA] px-3 py-2 text-sm font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.reject}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4 rounded-2xl border border-[#ECECEC] p-4 sm:grid-cols-2">
        <p className="text-xs text-[#667085] sm:col-span-2">{t.leaveNote}</p>
        <div className="sm:col-span-2">
          <label className={providerLabelClass} htmlFor="leave-person">{t.professional}</label>
          <select id="leave-person" className={providerFieldClass} value={form.employeeId} disabled={busy} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} aria-invalid={attempted && !form.employeeId}>
            <option value="">—</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="leave-from">{t.from}</label>
          <input id="leave-from" type="date" min={today} dir="ltr" className={providerFieldClass} value={form.start} disabled={busy} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="leave-to">{t.to}</label>
          <input id="leave-to" type="date" min={form.start || today} dir="ltr" className={providerFieldClass} value={form.end} disabled={busy} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        {attempted && dateProblem && <div className="sm:col-span-2">{problem(t.dateProblems[dateProblem])}</div>}
        <div className="sm:col-span-2">
          <label className={providerLabelClass} htmlFor="leave-note">{t.note}</label>
          <input id="leave-note" className={providerFieldClass} value={form.note} disabled={busy} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} />
        </div>
        <div className="sm:col-span-2">{failureBox(failure)}</div>
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={busy || people.length === 0} className={providerPrimaryButton}>{busy ? t.saving : t.addLeave}</button>
        </div>
      </form>
      {confirmNode}
    </SectionShell>
  );
}
