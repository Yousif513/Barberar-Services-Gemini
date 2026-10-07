"use client";

import { useId } from "react";
import type { OperationsLocale } from "@/components/operations-ui";
import { operationsInput as input } from "@/components/operations-ui";
import { MAX_TEXT_LENGTH, intakeCopy, type Answers, type IntakeField } from "@/lib/intake";

const labelOf = (f: { label_en: string; label_ar: string }, locale: OperationsLocale) => (locale === "ar" ? f.label_ar : f.label_en);

// The form a client fills in. Controlled by the screen so a failed request never loses what was typed.
export function IntakeAnswerForm({
  fields, answers, onChange, problems, locale, disabled,
}: {
  fields: IntakeField[];
  answers: Answers;
  onChange: (key: string, value: string | boolean | string[]) => void;
  problems: Record<string, string>;
  locale: OperationsLocale;
  disabled?: boolean;
}) {
  const t = intakeCopy[locale];
  const base = useId();
  return (
    <div className="grid gap-5">
      {fields.map((f, index) => {
        const id = `${base}-${index}`;
        const problem = problems[f.key];
        const describedBy = problem ? `${id}-error` : undefined;
        const value = answers[f.key];
        const legend = (
          <>
            {labelOf(f, locale)}
            <span className="ms-2 text-xs font-normal text-[#667085]">{f.required ? t.required : t.optional}</span>
          </>
        );
        let control: React.ReactNode;
        if (f.type === "short_text") {
          control = <input id={id} className={input} type="text" maxLength={f.max_length ?? MAX_TEXT_LENGTH} value={typeof value === "string" ? value : ""} disabled={disabled}
            aria-invalid={Boolean(problem)} aria-describedby={describedBy} onChange={(e) => onChange(f.key, e.target.value)} />;
        } else if (f.type === "long_text") {
          control = <textarea id={id} className={`${input} min-h-28`} maxLength={f.max_length ?? MAX_TEXT_LENGTH} value={typeof value === "string" ? value : ""} disabled={disabled}
            aria-invalid={Boolean(problem)} aria-describedby={describedBy} onChange={(e) => onChange(f.key, e.target.value)} />;
        } else if (f.type === "date") {
          control = <input id={id} className={input} type="date" value={typeof value === "string" ? value : ""} disabled={disabled}
            aria-invalid={Boolean(problem)} aria-describedby={describedBy} onChange={(e) => onChange(f.key, e.target.value)} />;
        } else if (f.type === "acknowledge") {
          return (
            <div key={f.key} className={`rounded-xl border p-3 ${problem ? "border-red-300 bg-red-50" : "border-[#EEE8D6] bg-[#FBFAF6]"}`}>
              <label className="flex items-start gap-3 text-sm">
                <input id={id} type="checkbox" className="mt-1 h-4 w-4" checked={value === true} disabled={disabled} aria-invalid={Boolean(problem)} aria-describedby={describedBy}
                  onChange={(e) => onChange(f.key, e.target.checked)} />
                <span className="font-semibold">{legend}</span>
              </label>
              {problem && <p id={describedBy} role="alert" className="mt-2 text-xs text-red-700">{problem}</p>}
            </div>
          );
        } else {
          // yes_no, single_choice and multi_choice are groups of radio buttons or checkboxes.
          const options = f.type === "yes_no"
            ? [{ value: "yes", label: t.yes }, { value: "no", label: t.no }]
            : (f.options ?? []).map((o) => ({ value: o.value, label: labelOf(o, locale) }));
          const selected = (optionValue: string) =>
            f.type === "yes_no" ? (value === true ? "yes" : value === false ? "no" : "") === optionValue
              : f.type === "single_choice" ? value === optionValue
                : Array.isArray(value) && value.includes(optionValue);
          control = (
            <div className="flex flex-wrap gap-x-5 gap-y-2" role={f.type === "multi_choice" ? "group" : "radiogroup"} aria-labelledby={`${id}-legend`} aria-describedby={describedBy}>
              {options.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm font-normal text-[#101828]">
                  <input
                    type={f.type === "multi_choice" ? "checkbox" : "radio"}
                    name={id}
                    className="h-4 w-4"
                    checked={selected(o.value)}
                    disabled={disabled}
                    onChange={(e) => {
                      if (f.type === "yes_no") onChange(f.key, o.value === "yes");
                      else if (f.type === "single_choice") onChange(f.key, o.value);
                      else {
                        const current = Array.isArray(value) ? value : [];
                        onChange(f.key, e.target.checked ? [...current, o.value] : current.filter((x) => x !== o.value));
                      }
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          );
          return (
            <div key={f.key} className={problem ? "rounded-xl border border-red-300 bg-red-50 p-3" : ""}>
              <p id={`${id}-legend`} className="mb-2 text-sm font-semibold text-[#101828]">{legend}</p>
              {control}
              {problem && <p id={describedBy} role="alert" className="mt-2 text-xs text-red-700">{problem}</p>}
            </div>
          );
        }
        return (
          <div key={f.key}>
            <label htmlFor={id} className="mb-2 block text-sm font-semibold text-[#101828]">{legend}</label>
            {control}
            {problem && <p id={describedBy} role="alert" className="mt-2 text-xs text-red-700">{problem}</p>}
          </div>
        );
      })}
    </div>
  );
}

function shown(f: IntakeField, value: Answers[string], locale: OperationsLocale): string {
  const t = intakeCopy[locale];
  if (value == null || value === "") return "—";
  if (f.type === "yes_no" || f.type === "acknowledge") return value === true ? t.yes : value === false ? t.no : "—";
  const optionLabel = (v: string) => {
    const o = f.options?.find((x) => x.value === v);
    return o ? labelOf(o, locale) : v;
  };
  if (f.type === "single_choice") return typeof value === "string" ? optionLabel(value) : "—";
  if (f.type === "multi_choice") return Array.isArray(value) ? value.map(optionLabel).join(locale === "ar" ? "، " : ", ") : "—";
  return String(value);
}

// The answers as the staff who serve the booking see them (read only).
export function IntakeAnswerList({ fields, answers, locale }: { fields: IntakeField[]; answers: Answers; locale: OperationsLocale }) {
  return (
    <dl className="grid gap-3">
      {fields.map((f) => (
        <div key={f.key} className="rounded-xl border border-[#EEE8D6] bg-[#FBFAF6] p-3">
          <dt className="text-xs font-semibold text-[#667085]">{labelOf(f, locale)}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-[#101828]">{shown(f, answers[f.key], locale)}</dd>
        </div>
      ))}
    </dl>
  );
}
