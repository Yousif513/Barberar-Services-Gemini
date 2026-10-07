"use client";

import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { IntakeAnswerList } from "@/components/intake-form";
import { operationsButton as button, operationsDate, operationsInput as input, type OperationsLocale } from "@/components/operations-ui";
import { describeIntakeError, intakeCopy, personName, type StaffAnswers, type StatusRow } from "@/lib/intake";

const primary = "rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1D2939] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
const overlay = "fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm";
const panel = "max-h-full w-full max-w-lg overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 text-[#101828] shadow-2xl";

export type RequirementValues = {
  template_id: string | null; form_required: boolean; patch_test_required: boolean; patch_validity_days: number | null; patch_min_hours_before: number | null;
};

// Sets what one service asks of a client: a form before the appointment and / or a patch test. The patch-test numbers are the
// provider's own and start empty.
export function RequirementDialog({ service, current, templates, locale, onSaved, onClose }: {
  service: { id: string; name_en: string; name_ar: string };
  current: RequirementValues | null;
  templates: { id: string; name_en: string; name_ar: string }[];
  locale: OperationsLocale;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = intakeCopy[locale];
  const titleId = useId();
  const [formRequired, setFormRequired] = useState(current?.form_required ?? true);
  const [templateId, setTemplateId] = useState(current?.template_id ?? "");
  const [patch, setPatch] = useState(current?.patch_test_required ?? false);
  const [days, setDays] = useState(current?.patch_validity_days != null ? String(current.patch_validity_days) : "");
  const [hours, setHours] = useState(current?.patch_min_hours_before != null ? String(current.patch_min_hours_before) : "");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  const errors: { template?: string; days?: string; hours?: string } = {};
  if (formRequired && !templateId) errors.template = t.formChoiceNeeded;
  if (patch && !(/^\d{1,4}$/.test(days.trim()) && Number(days) >= 1 && Number(days) <= 3650)) errors.days = t.validityInvalid;
  if (patch && hours.trim() !== "" && !(/^\d{1,3}$/.test(hours.trim()) && Number(hours) <= 720)) errors.hours = t.minHoursInvalid;
  const invalid = Boolean(errors.template || errors.days || errors.hours);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (saving || invalid) return;
    setSaving(true);
    setFailure("");
    const { error } = await supabase.rpc("set_service_intake_requirement", {
      p_service_id: service.id, p_template_id: formRequired ? templateId : null, p_form_required: formRequired, p_patch_test_required: patch,
      p_patch_validity_days: patch ? Number(days) : null, p_patch_min_hours_before: patch && hours.trim() !== "" ? Number(hours) : null,
    });
    setSaving(false);
    if (error) { setFailure(describeIntakeError(error, locale)); return; }
    onSaved();
    onClose();
  };

  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!saving} className={overlay}>
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} noValidate onSubmit={(e) => void submit(e)} className={panel}>
          <h2 id={titleId} className="font-serif text-xl font-black">{t.requirementTitle}</h2>
          <p className="mt-1 text-sm text-[#667085]">{locale === "ar" ? service.name_ar : service.name_en}</p>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={formRequired} disabled={saving} onChange={(e) => setFormRequired(e.target.checked)} />
            <span className="font-semibold">{t.formRequiredLabel}</span>
          </label>
          {formRequired && (
            <label className="mt-3 flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.chooseForm}</span>
              <select className={input} value={templateId} disabled={saving} aria-invalid={attempted && Boolean(errors.template)} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">{t.chooseFormPlaceholder}</option>
                {templates.map((x) => <option key={x.id} value={x.id}>{locale === "ar" ? x.name_ar : x.name_en}</option>)}
              </select>
              {attempted && errors.template && <span role="alert" className="font-normal text-red-700">{errors.template}</span>}
            </label>
          )}
          <label className="mt-5 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={patch} disabled={saving} onChange={(e) => setPatch(e.target.checked)} />
            <span className="font-semibold">{t.patchRequiredLabel}</span>
          </label>
          {patch && (
            <div className="mt-3 grid gap-3">
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.validityDays}</span>
                <input className={input} type="number" inputMode="numeric" min={1} max={3650} value={days} disabled={saving} aria-invalid={attempted && Boolean(errors.days)} onChange={(e) => setDays(e.target.value)} />
                <span className={attempted && errors.days ? "font-normal text-red-700" : "font-normal"}>{attempted && errors.days ? errors.days : t.validityHelp}</span></label>
              <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.minHours}</span>
                <input className={input} type="number" inputMode="numeric" min={0} max={720} value={hours} disabled={saving} aria-invalid={attempted && Boolean(errors.hours)} onChange={(e) => setHours(e.target.value)} />
                <span className={attempted && errors.hours ? "font-normal text-red-700" : "font-normal"}>{attempted && errors.hours ? errors.hours : t.minHoursHelp}</span></label>
            </div>
          )}
          {failure && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" className={button} disabled={saving} onClick={onClose}>{t.cancel}</button>
            <button className={primary} disabled={saving}>{saving ? t.saving : t.save}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}

// Records a patch-test result for the client of one booking. The request key is made once per dialog, so a retry after a
// dropped connection can never record the result twice.
export function PatchTestDialog({ row, locale, onSaved, onClose }: { row: StatusRow; locale: OperationsLocale; onSaved: () => void; onClose: () => void }) {
  const t = intakeCopy[locale];
  const titleId = useId();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [opened] = useState(() => Date.now());
  const [result, setResult] = useState<"negative" | "positive">("negative");
  const [testedAt, setTestedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [attempted, setAttempted] = useState(false);
  const future = testedAt !== "" && new Date(testedAt).getTime() > opened + 5 * 60 * 1000;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (saving || future) return;
    setSaving(true);
    setFailure("");
    const { error } = await supabase.rpc("record_patch_test", {
      p_booking_id: row.booking_id, p_service_id: row.service_id, p_result: result,
      p_tested_at: testedAt === "" ? null : new Date(testedAt).toISOString(), p_request_key: requestKey,
    });
    setSaving(false);
    if (error) { setFailure(describeIntakeError(error, locale)); return; }
    onSaved();
    onClose();
  };

  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!saving} className={overlay}>
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} noValidate onSubmit={(e) => void submit(e)} className={panel}>
          <h2 id={titleId} className="font-serif text-xl font-black">{t.patchDialogTitle}</h2>
          <p className="mt-1 text-sm text-[#667085]">{t.patchDialogIntro}</p>
          <p className="mt-2 text-sm font-semibold">{personName(row.customer_first_name, row.customer_last_name)} · {locale === "ar" ? row.service_name_ar : row.service_name_en}</p>
          <fieldset className="mt-4" disabled={saving}>
            <legend className="mb-2 text-xs font-semibold text-[#667085]">{t.result}</legend>
            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="patch-result" className="h-4 w-4" checked={result === "negative"} onChange={() => setResult("negative")} />{t.negative}</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="patch-result" className="h-4 w-4" checked={result === "positive"} onChange={() => setResult("positive")} />{t.positive}</label>
            </div>
          </fieldset>
          {result === "positive" && <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{t.patchPositiveWarning}</p>}
          <label className="mt-4 flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.testedAt}</span>
            <input className={input} type="datetime-local" value={testedAt} disabled={saving} aria-invalid={attempted && future} onChange={(e) => setTestedAt(e.target.value)} />
            {attempted && future && <span role="alert" className="font-normal text-red-700">{t.testedAtInvalid}</span>}
          </label>
          {failure && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" className={button} disabled={saving} onClick={onClose}>{t.cancel}</button>
            <button className={primary} disabled={saving}>{saving ? t.saving : t.save}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}

// Opens a client's answers for the staff who serve the booking. Opening is one command that writes an audit row, so it is
// done once per dialog (the guard keeps a development double-mount from recording two reads).
export function AnswersDialog({ row, locale, onClose }: { row: StatusRow; locale: OperationsLocale; onClose: () => void }) {
  const t = intakeCopy[locale];
  const titleId = useId();
  const started = useRef(false);
  const [state, setState] = useState<{ loading: boolean; error: string; data: StaffAnswers | null }>({ loading: true, error: "", data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (started.current && attempt === 0) return;
    started.current = true;
    void (async () => {
      const { data, error } = await supabase.rpc("read_booking_intake_answers", { p_booking_id: row.booking_id });
      setState(error ? { loading: false, error: describeIntakeError(error, locale), data: null } : { loading: false, error: "", data: data as StaffAnswers });
    })();
  }, [row.booking_id, locale, attempt]);

  const data = state.data;
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} className={overlay}>
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} className={`${panel} max-w-2xl`}>
          <h2 id={titleId} className="font-serif text-xl font-black">{t.answersTitle}</h2>
          <p className="mt-1 text-sm text-[#667085]">{personName(row.customer_first_name, row.customer_last_name)} · {operationsDate(row.scheduled_at, locale)}</p>
          {state.loading && <p role="status" className="mt-4 text-sm text-[#667085]">{t.loading}</p>}
          {state.error && (
            <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>{state.error}</span>
              <button type="button" className={button} onClick={() => { setState({ loading: true, error: "", data: null }); setAttempt((n) => n + 1); }}>{t.retry}</button>
            </div>
          )}
          {data && data.status === "submitted" && data.answers && data.fields && (
            <>
              <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">{t.answersWarning}</p>
              <p className="mt-3 text-xs text-[#667085]">
                {locale === "ar" ? data.name_ar : data.name_en} · {t.version(data.template_version ?? 1)}
                {data.submitted_at && ` · ${t.submittedOn} ${operationsDate(data.submitted_at, locale)}`}
              </p>
              <div className="mt-3"><IntakeAnswerList fields={data.fields} answers={data.answers} locale={locale} /></div>
            </>
          )}
          {data && data.status !== "submitted" && (
            <p className="mt-4 text-sm text-[#667085]">{data.status === "missing" ? t.answersNone : t.answersRemoved}</p>
          )}
          <div className="mt-6 flex justify-end"><button type="button" className={button} onClick={onClose}>{t.close}</button></div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}
