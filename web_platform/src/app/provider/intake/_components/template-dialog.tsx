"use client";

import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { operationsButton as button, operationsInput as input, type OperationsLocale } from "@/components/operations-ui";
import { FIELD_TYPES, MAX_FIELDS, MAX_OPTIONS, MAX_TEXT_LENGTH, describeIntakeError, intakeCopy, type FieldType, type IntakeField } from "@/lib/intake";

type DraftOption = { value: string; label_en: string; label_ar: string };
type DraftField = { key: string; type: FieldType; label_en: string; label_ar: string; required: boolean; max_length: string; options: DraftOption[] };
export type TemplateRow = { id: string; name_en: string; name_ar: string; is_active: boolean; current_version: number };

const primary = "rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1D2939] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
const isChoice = (type: FieldType) => type === "single_choice" || type === "multi_choice";
const isText = (type: FieldType) => type === "short_text" || type === "long_text";

function nextKey(prefix: string, used: string[]): string {
  let n = used.length + 1;
  while (used.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function toDraft(f: IntakeField): DraftField {
  return {
    key: f.key, type: f.type, label_en: f.label_en, label_ar: f.label_ar, required: f.required,
    max_length: f.max_length ? String(f.max_length) : "", options: (f.options ?? []).map((o) => ({ ...o })),
  };
}

// The builder for one form: names, questions (type, both languages, required, length, choices). Saving different questions
// publishes a new version on the server; the server validates the list again and has the last word.
export function TemplateDialog({ providerId, template, locale, onSaved, onClose }: {
  providerId: string;
  template: TemplateRow | null;
  locale: OperationsLocale;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = intakeCopy[locale];
  const titleId = useId();
  const [nameEn, setNameEn] = useState(template?.name_en ?? "");
  const [nameAr, setNameAr] = useState(template?.name_ar ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [loading, setLoading] = useState(Boolean(template));
  const [loadError, setLoadError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!template) return;
    let live = true;
    void (async () => {
      const { data, error } = await supabase.from("intake_form_template_versions").select("fields")
        .eq("template_id", template.id).eq("version", template.current_version).maybeSingle();
      if (!live) return;
      if (error) setLoadError(describeIntakeError(error, locale));
      else setFields(((data?.fields ?? []) as IntakeField[]).map(toDraft));
      setLoading(false);
    })();
    return () => { live = false; };
  }, [template, locale]);

  const update = (index: number, patch: Partial<DraftField>) => setFields((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const updateOption = (fi: number, oi: number, patch: Partial<DraftOption>) =>
    setFields((list) => list.map((f, i) => (i === fi ? { ...f, options: f.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : f)));
  const move = (index: number, by: number) => setFields((list) => {
    const target = index + by;
    if (target < 0 || target >= list.length) return list;
    const copy = [...list];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  });
  const changeType = (index: number, type: FieldType) => setFields((list) => list.map((f, i) => {
    if (i !== index) return f;
    const options = isChoice(type) && f.options.length === 0
      ? [{ value: "o1", label_en: "", label_ar: "" }, { value: "o2", label_en: "", label_ar: "" }]
      : f.options;
    return { ...f, type, options, required: type === "acknowledge" ? true : f.required };
  }));

  const problems = (): { form?: string; fields: Record<number, string> } => {
    const out: { form?: string; fields: Record<number, string> } = { fields: {} };
    if (!nameEn.trim() || !nameAr.trim()) out.form = t.formNamesNeeded;
    else if (fields.length === 0) out.form = t.templateNeedsFields;
    fields.forEach((f, i) => {
      if (!f.label_en.trim() || !f.label_ar.trim()) out.fields[i] = t.labelsNeeded;
      else if (isChoice(f.type) && (f.options.length < 2 || f.options.some((o) => !o.label_en.trim() || !o.label_ar.trim()))) out.fields[i] = t.optionsNeeded;
      else if (isText(f.type) && f.max_length.trim() !== "" && !(/^\d{1,4}$/.test(f.max_length.trim()) && Number(f.max_length) >= 1 && Number(f.max_length) <= MAX_TEXT_LENGTH)) out.fields[i] = t.maxLengthInvalid;
    });
    return out;
  };
  const found = problems();
  const invalid = Boolean(found.form) || Object.keys(found.fields).length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (saving || invalid) return;
    setSaving(true);
    setFailure("");
    const payload = fields.map((f) => ({
      key: f.key, type: f.type, label_en: f.label_en.trim(), label_ar: f.label_ar.trim(), required: f.required,
      ...(isText(f.type) && f.max_length.trim() !== "" ? { max_length: Number(f.max_length) } : {}),
      ...(isChoice(f.type) ? { options: f.options.map((o) => ({ value: o.value, label_en: o.label_en.trim(), label_ar: o.label_ar.trim() })) } : {}),
    }));
    const { error } = await supabase.rpc("save_intake_template", {
      p_provider_id: providerId, p_template_id: template?.id ?? null, p_name_en: nameEn.trim(), p_name_ar: nameAr.trim(), p_fields: payload, p_is_active: active,
    });
    setSaving(false);
    // A refusal keeps the dialog and everything typed in it.
    if (error) { setFailure(describeIntakeError(error, locale)); return; }
    onSaved();
    onClose();
  };

  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!saving} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
        <form role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1} noValidate onSubmit={(e) => void submit(e)}
          className="max-h-full w-full max-w-3xl overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 text-[#101828] shadow-2xl">
          <h2 id={titleId} className="font-serif text-xl font-black">{template ? t.editForm : t.newForm}</h2>
          <p className="mt-1 text-sm text-[#667085]">{t.templateHelp}</p>
          {loading && <p role="status" className="mt-4 text-sm text-[#667085]">{t.loading}</p>}
          {loadError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{t.loadFailed} {loadError}</p>}
          {!loading && !loadError && (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.nameEn}</span>
                  <input className={input} value={nameEn} maxLength={120} disabled={saving} onChange={(e) => setNameEn(e.target.value)} aria-invalid={attempted && !nameEn.trim()} /></label>
                <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.nameAr}</span>
                  <input className={input} dir="rtl" value={nameAr} maxLength={120} disabled={saving} onChange={(e) => setNameAr(e.target.value)} aria-invalid={attempted && !nameAr.trim()} /></label>
              </div>
              {template && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={active} disabled={saving} onChange={(e) => setActive(e.target.checked)} />{t.activeForm}
                </label>
              )}
              <h3 className="mt-6 text-sm font-bold">{t.fieldsTitle}</h3>
              <ol className="mt-3 grid gap-4">
                {fields.map((f, i) => (
                  <li key={f.key} className="rounded-2xl border border-[#EEE8D6] bg-[#FBFAF6] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.labelEn}</span>
                        <input className={input} value={f.label_en} maxLength={300} disabled={saving} onChange={(e) => update(i, { label_en: e.target.value })} /></label>
                      <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.labelAr}</span>
                        <input className={input} dir="rtl" value={f.label_ar} maxLength={300} disabled={saving} onChange={(e) => update(i, { label_ar: e.target.value })} /></label>
                      <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.fieldType}</span>
                        <select className={input} value={f.type} disabled={saving} onChange={(e) => changeType(i, e.target.value as FieldType)}>
                          {FIELD_TYPES.map((type) => <option key={type} value={type}>{t.types[type]}</option>)}
                        </select></label>
                      {isText(f.type) && (
                        <label className="flex flex-col gap-2 text-xs font-semibold text-[#667085]"><span>{t.maxLength}</span>
                          <input className={input} type="number" inputMode="numeric" min={1} max={MAX_TEXT_LENGTH} value={f.max_length} disabled={saving} onChange={(e) => update(i, { max_length: e.target.value })} />
                          <span className="font-normal">{t.maxLengthHelp}</span></label>
                      )}
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" checked={f.required} disabled={saving} onChange={(e) => update(i, { required: e.target.checked })} />{t.requiredField}
                    </label>
                    {isChoice(f.type) && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-[#667085]">{t.options}</p>
                        <ul className="mt-2 grid gap-2">
                          {f.options.map((o, j) => (
                            <li key={o.value} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]">
                              <input className={input} aria-label={`${t.optionEn} ${j + 1}`} placeholder={t.optionEn} value={o.label_en} maxLength={200} disabled={saving} onChange={(e) => updateOption(i, j, { label_en: e.target.value })} />
                              <input className={input} dir="rtl" aria-label={`${t.optionAr} ${j + 1}`} placeholder={t.optionAr} value={o.label_ar} maxLength={200} disabled={saving} onChange={(e) => updateOption(i, j, { label_ar: e.target.value })} />
                              <button type="button" className={button} disabled={saving || f.options.length <= 2} onClick={() => update(i, { options: f.options.filter((_, k) => k !== j) })}>{t.removeOption}</button>
                            </li>
                          ))}
                        </ul>
                        <button type="button" className={`${button} mt-2`} disabled={saving || f.options.length >= MAX_OPTIONS}
                          onClick={() => update(i, { options: [...f.options, { value: nextKey("o", f.options.map((o) => o.value)), label_en: "", label_ar: "" }] })}>{t.addOption}</button>
                      </div>
                    )}
                    {attempted && found.fields[i] && <p role="alert" className="mt-3 text-xs text-red-700">{found.fields[i]}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={button} disabled={saving || i === 0} onClick={() => move(i, -1)}>{t.moveUp}</button>
                      <button type="button" className={button} disabled={saving || i === fields.length - 1} onClick={() => move(i, 1)}>{t.moveDown}</button>
                      <button type="button" className={button} disabled={saving} onClick={() => setFields((list) => list.filter((_, k) => k !== i))}>{t.removeField}</button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-3">
                <button type="button" className={button} disabled={saving || fields.length >= MAX_FIELDS}
                  onClick={() => setFields((list) => [...list, { key: nextKey("q", list.map((f) => f.key)), type: "short_text", label_en: "", label_ar: "", required: false, max_length: "", options: [] }])}>{t.addField}</button>
              </div>
              {attempted && found.form && <p role="alert" className="mt-3 text-sm text-red-700">{found.form}</p>}
              {failure && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" className={button} disabled={saving} onClick={onClose}>{t.cancel}</button>
                <button className={primary} disabled={saving}>{saving ? t.saving : t.saveForm}</button>
              </div>
            </>
          )}
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}
