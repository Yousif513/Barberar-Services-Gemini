"use client";

import { useEffect, useId, useState } from "react";
import type { HqLocale } from "@/lib/hq/contracts";
import { accessCopy } from "@/lib/hq/access-copy";

export function HqAccessSecret({ locale, label, hint, value, onChange, disabled = false, required = true, autoFocus = false }: {
  locale: HqLocale; label: string; hint?: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean; autoFocus?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => { if(value)return;const timer=setTimeout(()=>setVisible(false),0);return()=>clearTimeout(timer); },[value]);
  return <div className="hq-field">
    <label htmlFor={id}>{label}</label>
    <div className="hq-access-secret-field">
      <input id={id} className="hq-input" type={visible ? "text" : "password"} dir="ltr" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required={required} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-autofocus={autoFocus || undefined} aria-describedby={hint ? `${id}-hint` : undefined}/>
      <button type="button" className="hq-button hq-button-small" disabled={disabled} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{accessCopy(locale,visible?"hide":"show")}<span className="hq-access-sr"> {label}</span></button>
    </div>
    {hint && <span id={`${id}-hint`} className="hq-field-hint">{hint}</span>}
  </div>;
}
