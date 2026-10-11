"use client";

import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OperationsField as Field, operationsInput as input, type OperationsLocale } from "@/components/operations-ui";
import {
  LANGUAGE_CODES, describeProfessionalError, handleLooksValid, identityCopy, languageLabel, splitList,
  type MyIdentity,
} from "@/lib/professional-identity";

type HandleState = "idle" | "checking" | "free" | "invalid" | "taken" | "reserved";

const primary = "rounded-xl bg-[#D1AF47] px-5 py-2.5 text-sm font-black text-[#070B12] transition hover:bg-[#E0C46A] focus-visible:outline-2 focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-60";

// Create or edit the public profile. What the person typed is kept when the server refuses the save.
export function ProfileForm({ locale, data, onSaved }: { locale: OperationsLocale; data: MyIdentity; onSaved: (created: boolean) => void }) {
  const t = identityCopy[locale];
  const profile = data.profile;
  const locked = Boolean(profile?.handle_locked);
  const hintId = useId();
  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [nameEn, setNameEn] = useState(profile?.display_name_en ?? data.suggested_names?.en ?? "");
  const [nameAr, setNameAr] = useState(profile?.display_name_ar ?? data.suggested_names?.ar ?? "");
  const [headlineEn, setHeadlineEn] = useState(profile?.headline_en ?? "");
  const [headlineAr, setHeadlineAr] = useState(profile?.headline_ar ?? "");
  const [bioEn, setBioEn] = useState(profile?.bio_en ?? "");
  const [bioAr, setBioAr] = useState(profile?.bio_ar ?? "");
  const [specialties, setSpecialties] = useState((profile?.specialties ?? []).join(", "));
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remote, setRemote] = useState<{ value: string; state: HandleState } | null>(null);

  const typed = handle.trim().toLowerCase();
  const changed = !locked && typed !== (profile?.handle ?? "");
  const needsRemote = changed && handleLooksValid(typed);

  useEffect(() => {
    if (!needsRemote) return;
    let live = true;
    const timer = window.setTimeout(async () => {
      const { data: answer, error: failure } = await supabase.rpc("professional_handle_available", { p_handle: typed });
      if (!live) return;
      if (failure) { setRemote(null); return; }
      const result = answer as { available: boolean; problem: string | null };
      setRemote({ value: typed, state: result.available ? "free" : result.problem === "reserved" ? "reserved" : result.problem === "invalid" ? "invalid" : "taken" });
    }, 350);
    return () => { live = false; window.clearTimeout(timer); };
  }, [needsRemote, typed]);

  const handleState: HandleState = !changed || !typed ? "idle" : !handleLooksValid(typed) ? "invalid" : remote?.value === typed ? remote.state : "checking";
  const handleMessage = handleState === "checking" ? t.handleChecking : handleState === "free" ? t.handleFree : handleState === "invalid" ? t.handleInvalid
    : handleState === "taken" ? t.handleTaken : handleState === "reserved" ? t.handleReserved : "";

  const languageOptions = Array.from(new Set<string>([...LANGUAGE_CODES, ...languages]));
  const toggleLanguage = (code: string) => setLanguages((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!nameEn.trim() || !nameAr.trim()) { setError(t.namesRequired); return; }
    if (!profile && !handleLooksValid(typed)) { setError(t.handleInvalid); return; }
    setBusy(true);
    setError("");
    const { data: out, error: failure } = await supabase.rpc("save_professional_profile", {
      p_handle: typed,
      p_display_name_en: nameEn,
      p_display_name_ar: nameAr,
      p_headline_en: headlineEn || null,
      p_headline_ar: headlineAr || null,
      p_bio_en: bioEn || null,
      p_bio_ar: bioAr || null,
      p_specialties: splitList(specialties),
      p_languages: languages,
    });
    setBusy(false);
    if (failure) { setError(`${t.saveFailed}${describeProfessionalError(failure, locale)}`); return; }
    onSaved(Boolean((out as { created?: boolean } | null)?.created));
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
      <div>
        <Field label={t.handle}>
          <input
            className={input}
            dir="ltr"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            disabled={locked || busy}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={hintId}
            aria-invalid={handleState === "invalid" || handleState === "taken" || handleState === "reserved"}
          />
        </Field>
        <p id={hintId} className="mt-1 text-xs text-[#667085]">{locked ? t.handleLocked : t.handleHint}</p>
        {handleMessage && (
          <p role="status" className={`mt-1 text-xs font-semibold ${handleState === "free" ? "text-green-700" : handleState === "checking" ? "text-[#667085]" : "text-red-700"}`}>{handleMessage}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.nameEn}><input className={input} dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={80} disabled={busy} /></Field>
        <Field label={t.nameAr}><input className={input} dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={80} disabled={busy} /></Field>
        <Field label={t.headlineEn}><input className={input} dir="ltr" value={headlineEn} onChange={(e) => setHeadlineEn(e.target.value)} maxLength={120} disabled={busy} /></Field>
        <Field label={t.headlineAr}><input className={input} dir="rtl" value={headlineAr} onChange={(e) => setHeadlineAr(e.target.value)} maxLength={120} disabled={busy} /></Field>
        <Field label={`${t.bioEn} (${bioEn.length}/1000)`}><textarea className={`${input} min-h-28`} dir="ltr" value={bioEn} onChange={(e) => setBioEn(e.target.value)} maxLength={1000} disabled={busy} /></Field>
        <Field label={`${t.bioAr} (${bioAr.length}/1000)`}><textarea className={`${input} min-h-28`} dir="rtl" value={bioAr} onChange={(e) => setBioAr(e.target.value)} maxLength={1000} disabled={busy} /></Field>
      </div>

      <div>
        <Field label={t.specialties}><input className={input} value={specialties} onChange={(e) => setSpecialties(e.target.value)} disabled={busy} /></Field>
        <p className="mt-1 text-xs text-[#667085]">{t.specialtiesHint}</p>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-[#667085]">{t.languages}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {languageOptions.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm text-[#344054]">
              <input type="checkbox" className="h-4 w-4 accent-[#9B7928] focus-visible:outline-2 focus-visible:outline-[#9B7928]" checked={languages.includes(code)} onChange={() => toggleLanguage(code)} disabled={busy} />
              <span>{languageLabel(code, locale)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="flex justify-end">
        <button type="submit" className={primary} disabled={busy || handleState === "taken" || handleState === "reserved" || handleState === "invalid"}>
          {busy ? t.saving : profile ? t.save : t.createProfile}
        </button>
      </div>
    </form>
  );
}
