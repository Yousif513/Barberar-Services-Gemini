"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CommandResult, operationsButton as button, operationsDate, useOperationsLocale } from "@/components/operations-ui";
import { useConfirm } from "@/components/modal";
import { IntakeAnswerForm } from "@/components/intake-form";
import { answerProblems, cleanAnswers, describeIntakeError, intakeCopy, type Answers, type BookingIntake } from "@/lib/intake";

const primary = "rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1D2939] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
const danger = "rounded-xl border border-[#FECDCA] bg-white px-4 py-2 text-sm font-semibold text-[#B42318] transition hover:bg-[#FEF3F2] focus-visible:outline-2 focus-visible:outline-[#B42318] disabled:cursor-not-allowed disabled:opacity-50";
const card = "rounded-[24px] border border-[#D1AF47]/35 bg-white/90 p-5 shadow-[0_8px_24px_rgba(56,44,16,0.06)]";

// Where a client completes the health form of one booking: consent first (what is shared with whom), then the questions,
// then a summary with the number of times the answers were opened and the controls to change, delete or withdraw.
export default function CustomerBookingIntakePage() {
  const locale = useOperationsLocale();
  const t = intakeCopy[locale];
  const params = useParams();
  const bookingId = params?.id as string;
  const [confirmNode, ask] = useConfirm(locale);

  const [data, setData] = useState<BookingIntake | null>(null);
  const [providerName, setProviderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);

  const [draft, setDraft] = useState<Answers>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [consentProblem, setConsentProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data: row, error } = await supabase.rpc("get_booking_intake", { p_booking_id: bookingId });
    if (error) { setData(null); setLoadError(describeIntakeError(error, locale)); setLoading(false); return; }
    const view = row as BookingIntake;
    setData(view);
    setDraft((view.submission?.answers as Answers | null) ?? {});
    const { data: provider } = await supabase.from("providers").select("business_name_en, business_name_ar").eq("id", view.provider_id).maybeSingle();
    if (provider) setProviderName(locale === "ar" ? provider.business_name_ar || provider.business_name_en : provider.business_name_en || provider.business_name_ar);
    setLoading(false);
  }, [bookingId, locale]);

  useEffect(() => {
    if (!bookingId) return;
    void load();
  }, [load, reload, bookingId]);

  const giveConsent = async () => {
    if (!agreed) { setConsentProblem(true); return; }
    setBusy(true);
    const { error } = await supabase.rpc("record_consent", { p_purpose: "health_data", p_status: "granted", p_document_version: "v1.0", p_method: "web_form" });
    setBusy(false);
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setResult({ success: t.consentRecorded });
    setReload((n) => n + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data?.form || busy) return;
    const found = answerProblems(data.form.fields, draft, locale);
    setProblems(found);
    if (Object.keys(found).length > 0) { setResult({ error: t.checkAnswers }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("submit_booking_intake", { p_booking_id: bookingId, p_answers: cleanAnswers(data.form.fields, draft) });
    setBusy(false);
    // A refusal keeps everything the client typed.
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setEditing(false);
    setResult({ success: t.submitted });
    setReload((n) => n + 1);
  };

  const remove = async () => {
    const yes = await ask({ title: t.deleteTitle, intro: t.deleteIntro, confirmLabel: t.deleteConfirm, tone: "danger" });
    if (!yes) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_booking_intake", { p_booking_id: bookingId });
    setBusy(false);
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setDraft({});
    setEditing(false);
    setResult({ success: t.deleted });
    setReload((n) => n + 1);
  };

  const withdraw = async () => {
    const yes = await ask({ title: t.withdrawTitle, intro: t.withdrawIntro, confirmLabel: t.withdrawConfirm, tone: "danger" });
    if (!yes) return;
    setBusy(true);
    const { data: out, error } = await supabase.rpc("withdraw_health_data_consent");
    setBusy(false);
    if (error) { setResult({ error: describeIntakeError(error, locale) }); return; }
    setDraft({});
    setEditing(false);
    setAgreed(false);
    setResult({ success: t.withdrawn(Number((out as { answers_removed?: number } | null)?.answers_removed ?? 0)) });
    setReload((n) => n + 1);
  };

  const upcoming = data ? ["pending_payment", "confirmed"].includes(data.booking_status) : false;
  const form = data?.form ?? null;
  const submission = data?.submission ?? null;
  const submitted = submission?.status === "submitted";
  const who = providerName || (locale === "ar" ? "مزوّد الخدمة" : "your provider");

  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-2xl space-y-6 p-4 text-[#101828] md:p-8">
      {confirmNode}
      <header>
        <Link href="/customer/bookings" className="text-sm font-semibold text-[#725517] underline">{t.back}</Link>
        <h1 className="mt-3 font-serif text-3xl font-bold">{t.customerTitle}</h1>
        <p className="mt-2 text-sm text-[#667085]">{t.customerSubtitle}</p>
        {data && <p className="mt-1 text-xs text-[#667085]">{providerName} · {operationsDate(data.scheduled_at, locale)}</p>}
      </header>
      <CommandResult error={result.error} success={result.success} locale={locale} onDismiss={() => setResult({})} />

      {loading && <p role="status" className="text-sm text-[#667085]">{t.loading}</p>}
      {!loading && loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{t.loadFailed} {loadError}</span><button type="button" className={button} onClick={() => setReload((n) => n + 1)}>{t.retry}</button>
        </div>
      )}

      {!loading && data && !data.requirement?.form_required && (
        <section className={card}>
          <h2 className="font-serif text-xl font-bold">{t.noFormTitle}</h2>
          <p className="mt-2 text-sm text-[#667085]">{t.noFormBody}</p>
        </section>
      )}

      {!loading && data && data.requirement?.form_required && !form && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{t.formUnavailable}</p>
      )}

      {!loading && data && form && !data.consent_active && (!submitted) && (
        <section className={card} aria-labelledby="consent-title">
          <h2 id="consent-title" className="font-serif text-xl font-bold">{t.consentTitle}</h2>
          <h3 className="mt-4 text-sm font-bold">{t.shareHeading}</h3>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-[#344054]">{t.shareItems(who).map((line) => <li key={line}>{line}</li>)}</ul>
          <h3 className="mt-4 text-sm font-bold">{t.keptHeading}</h3>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-[#344054]">{t.keptItems.map((line) => <li key={line}>{line}</li>)}</ul>
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={agreed} aria-invalid={consentProblem && !agreed}
              aria-describedby={consentProblem && !agreed ? "consent-error" : undefined}
              onChange={(e) => { setAgreed(e.target.checked); setConsentProblem(false); }} />
            <span className="font-semibold">{t.consentLabel}</span>
          </label>
          {consentProblem && !agreed && <p id="consent-error" role="alert" className="mt-2 text-xs text-red-700">{t.consentNeeded}</p>}
          <div className="mt-4"><button type="button" className={primary} disabled={busy} onClick={() => void giveConsent()}>{busy ? t.consentGiving : t.consentGive}</button></div>
        </section>
      )}

      {!loading && data && form && data.consent_active && upcoming && (!submitted || editing) && (
        <form onSubmit={(e) => void submit(e)} noValidate className={card} aria-labelledby="form-title">
          <h2 id="form-title" className="font-serif text-xl font-bold">{locale === "ar" ? form.name_ar : form.name_en}</h2>
          {submission && !submitted && (
            <p role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              {submission.status === "withdrawn" ? t.stateWithdrawn : submission.status === "deleted" ? t.stateDeleted : t.statePurged}
            </p>
          )}
          <div className="mt-4">
            <IntakeAnswerForm fields={form.fields} answers={draft} problems={problems} locale={locale} disabled={busy}
              onChange={(key, value) => { setDraft((d) => ({ ...d, [key]: value })); setProblems((p) => { const { [key]: _removed, ...rest } = p; void _removed; return rest; }); }} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className={primary} disabled={busy}>{busy ? t.submitting : submitted ? t.update : t.submit}</button>
            {editing && <button type="button" className={button} disabled={busy} onClick={() => { setEditing(false); setDraft(submission?.answers ?? {}); setProblems({}); }}>{t.cancel}</button>}
          </div>
        </form>
      )}

      {!loading && data && form && !upcoming && !submitted && <p className="text-sm text-[#667085]">{t.cannotComplete}</p>}

      {!loading && data && submitted && submission && !editing && (
        <section className={card} aria-labelledby="done-title">
          <h2 id="done-title" className="font-serif text-xl font-bold">{t.submittedHeading}</h2>
          <p className="mt-2 text-sm">{t.submittedBody(operationsDate(submission.submitted_at, locale), submission.template_version)}</p>
          <p className="mt-2 text-sm text-[#667085]">
            {t.readCount(submission.read_count)}
            {submission.last_read_at && ` ${t.lastRead}: ${operationsDate(submission.last_read_at, locale)}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {upcoming && form && data.consent_active && <button type="button" className={button} disabled={busy} onClick={() => setEditing(true)}>{t.editAnswers}</button>}
            <button type="button" className={danger} disabled={busy} onClick={() => void remove()}>{t.deleteAnswers}</button>
          </div>
        </section>
      )}

      {!loading && data?.requirement?.patch_test_required && (
        <section className={card} aria-labelledby="patch-title">
          <h2 id="patch-title" className="font-serif text-xl font-bold">{t.patchHeading}</h2>
          <p className="mt-2 text-sm text-[#344054]">{t.patchRule(data.requirement.patch_validity_days, data.requirement.patch_min_hours_before)}</p>
          {data.state.blocked && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.patchBlockedNote}</p>}
          {data.patch_tests.length === 0
            ? <p className="mt-3 text-sm text-[#667085]">{t.patchNone}</p>
            : (
              <ul className="mt-3 space-y-1 text-sm">
                {data.patch_tests.map((p) => (
                  <li key={p.id}>
                    {operationsDate(p.tested_at, locale)} · <span className="font-semibold">{p.result === "negative" ? t.negative : t.positive}</span>
                    {p.cleared_at && ` · ${t.cleared}`}
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}

      {!loading && data && data.consent_active && (
        <div><button type="button" className={danger} disabled={busy} onClick={() => void withdraw()}>{t.withdraw}</button></div>
      )}
    </div>
  );
}
