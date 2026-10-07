"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/error-message";
import { useConfirm } from "@/components/modal";
import { riyadhDateKey } from "@/lib/booking-display.mjs";
import { checkLeave } from "@/lib/schedule-exceptions.mjs";
import { providerFieldClass, providerGhostButton, providerLabelClass, providerPrimaryButton } from "./dialog";

type Lang = "en" | "ar";
type Row = { id: string; start_date: string; end_date: string; reason: string | null; status: "pending" | "approved" | "rejected" };

const copy = {
  en: {
    title: "My leave",
    intro: "Ask for time off. Your manager approves it, and only approved leave removes your slots.",
    from: "From",
    to: "To",
    note: "Note (optional)",
    request: "Request leave",
    sending: "Sending…",
    empty: "You have not asked for leave.",
    status: { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected" },
    withdraw: "Withdraw",
    withdrawTitle: "Withdraw this request?",
    withdrawIntro: "The request is removed and your manager no longer sees it.",
    problems: {
      required: "Choose both dates.",
      invalid: "Enter real dates.",
      order: "The last day cannot be before the first day.",
      past: "The first day cannot be in the past.",
      tooLong: "Leave can be at most 90 days at a time.",
    },
    loadFailed: "Your leave could not be loaded: ",
    saveFailed: "The request was not sent: ",
    loading: "Loading…",
  },
  ar: {
    title: "إجازاتي",
    intro: "اطلب إجازة. يعتمدها مديرك، ولا تُزيل مواعيدك المتاحة إلا الإجازة المعتمدة.",
    from: "من",
    to: "إلى",
    note: "ملاحظة (اختياري)",
    request: "طلب إجازة",
    sending: "جارٍ الإرسال…",
    empty: "لم تطلب إجازة بعد.",
    status: { pending: "بانتظار الموافقة", approved: "معتمدة", rejected: "مرفوضة" },
    withdraw: "سحب الطلب",
    withdrawTitle: "سحب هذا الطلب؟",
    withdrawIntro: "يُحذف الطلب ولن يراه مديرك بعد الآن.",
    problems: {
      required: "اختر التاريخين.",
      invalid: "أدخل تواريخ صحيحة.",
      order: "لا يمكن أن يسبق اليوم الأخير اليوم الأول.",
      past: "لا يمكن أن يكون اليوم الأول في الماضي.",
      tooLong: "الإجازة لا تتجاوز 90 يوماً في المرة الواحدة.",
    },
    loadFailed: "تعذر تحميل إجازاتك: ",
    saveFailed: "لم يُرسل الطلب: ",
    loading: "جارٍ التحميل…",
  },
};

const fmtDate = (value: string, lang: Lang) =>
  new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export function MyLeaveSection({ lang, employeeId }: { lang: Lang; employeeId: string }) {
  const t = copy[lang];
  const today = useMemo(() => riyadhDateKey(new Date()) as string, []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ start: "", end: "", note: "" });
  const [attempted, setAttempted] = useState(false);
  const [confirmNode, askConfirm] = useConfirm(lang);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await supabase
        .from("employee_time_off")
        .select("id, start_date, end_date, reason, status")
        .eq("employee_id", employeeId)
        .order("start_date", { ascending: false })
        .limit(30);
      if (!live) return;
      if (error) setFailure(t.loadFailed + errorMessage(error));
      else { setRows((data ?? []) as Row[]); setFailure(""); }
      setLoading(false);
    })();
    return () => { live = false; };
  }, [employeeId, version, t.loadFailed]);

  const problem = checkLeave({ start: form.start, end: form.end, today });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (problem || busy) return;
    setBusy(true);
    setFailure("");
    // The status is sent explicitly: the column defaults to approved, and only the provider may approve (the database refuses otherwise).
    const { error } = await supabase.from("employee_time_off").insert({
      employee_id: employeeId, start_date: form.start, end_date: form.end, reason: form.note.trim() || null, status: "pending",
    });
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setForm({ start: "", end: "", note: "" });
    setAttempted(false);
    setVersion((value) => value + 1);
  };

  const withdraw = async (row: Row) => {
    const yes = await askConfirm({ title: t.withdrawTitle, intro: t.withdrawIntro, facts: [{ label: t.from, value: fmtDate(row.start_date, lang) }], confirmLabel: t.withdraw, tone: "danger" });
    if (!yes) return;
    setBusy(true);
    setFailure("");
    const { error } = await supabase.from("employee_time_off").delete().eq("id", row.id).eq("status", "pending");
    setBusy(false);
    if (error) { setFailure(t.saveFailed + errorMessage(error)); return; }
    setVersion((value) => value + 1);
  };

  return (
    <section aria-labelledby="my-leave-title" className="rounded-2xl border border-[#ECECEC] bg-white p-5 text-start">
      <h2 id="my-leave-title" className="font-serif text-xl font-black text-[#101828]">{t.title}</h2>
      <p className="mt-1 text-sm text-[#667085]">{t.intro}</p>
      {loading ? <p role="status" className="mt-3 text-sm text-[#667085]">{t.loading}</p> : rows.length === 0 ? <p className="mt-3 rounded-xl border border-[#ECECEC] bg-[#F9FAFB] p-3 text-sm text-[#667085]">{t.empty}</p> : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECECEC] p-3">
              <div>
                <p className="text-sm font-bold text-[#101828]">{fmtDate(row.start_date, lang)}{row.end_date !== row.start_date ? ` - ${fmtDate(row.end_date, lang)}` : ""}</p>
                {row.reason && <p className="text-xs text-[#344054]">{row.reason}</p>}
                <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${row.status === "approved" ? "bg-[#ECFDF3] text-[#067647]" : row.status === "rejected" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#FFFAEB] text-[#93370D]"}`}>{t.status[row.status]}</p>
              </div>
              {row.status === "pending" && <button type="button" disabled={busy} onClick={() => void withdraw(row)} className={providerGhostButton}>{t.withdraw}</button>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate className="mt-4 grid gap-4 rounded-2xl border border-[#ECECEC] p-4 sm:grid-cols-2">
        <div>
          <label className={providerLabelClass} htmlFor="my-leave-from">{t.from}</label>
          <input id="my-leave-from" type="date" min={today} dir="ltr" className={providerFieldClass} value={form.start} disabled={busy} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-invalid={attempted && Boolean(problem)} />
        </div>
        <div>
          <label className={providerLabelClass} htmlFor="my-leave-to">{t.to}</label>
          <input id="my-leave-to" type="date" min={form.start || today} dir="ltr" className={providerFieldClass} value={form.end} disabled={busy} onChange={(e) => setForm({ ...form, end: e.target.value })} aria-invalid={attempted && Boolean(problem)} />
        </div>
        {attempted && problem && <p role="alert" className="text-xs font-semibold text-[#B42318] sm:col-span-2">{t.problems[problem]}</p>}
        <div className="sm:col-span-2">
          <label className={providerLabelClass} htmlFor="my-leave-note">{t.note}</label>
          <input id="my-leave-note" className={providerFieldClass} value={form.note} disabled={busy} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} />
        </div>
        {failure && <div role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318] sm:col-span-2">{failure}</div>}
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={busy} className={providerPrimaryButton}>{busy ? t.sending : t.request}</button>
        </div>
      </form>
      {confirmNode}
    </section>
  );
}
