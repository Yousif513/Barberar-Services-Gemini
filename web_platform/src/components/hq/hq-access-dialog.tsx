"use client";

import { useId, useState } from "react";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import type { HqLocale } from "@/lib/hq/contracts";
import { accessCopy } from "@/lib/hq/access-copy";
import { HqAccessSecret } from "./hq-access-fields";

export type AccessDialogKind = "enroll" | "rotate" | "revoke";
export function HqAccessDialog({ kind, locale, bootstrap, busy, error, onClose, onSubmit }: {
  kind: AccessDialogKind; locale: HqLocale; bootstrap: boolean; busy: boolean; onClose: () => void;
  error?: string; onSubmit: (secret: string, allSessions: boolean) => Promise<void>;
}) {
  const titleId = useId();
  const introId = useId();
  const [secret, setSecret] = useState("");
  const [all, setAll] = useState(false);
  const [ack, setAck] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const title = accessCopy(locale,kind === "enroll" ? "enroll" : kind === "rotate" ? "rotate" : "revoke");
  const needsSecret = kind !== "revoke" || all;
  const valid = (!needsSecret || secret.trim().length > 0) && (!all || ack);
  const close = () => { if (busy) return; setSecret(""); onClose(); };
  return <ModalPortal><ModalOverlay className="hq-dialog-backdrop" onClose={close} canClose={!busy}>
    <form className="hq-dialog hq-form" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={introId} aria-busy={busy} dir={locale === "ar" ? "rtl" : "ltr"} onSubmit={event => {event.preventDefault();if(!valid || busy){setAttempted(true);return;}setAttempted(false);const proof=secret.trim();setSecret("");void onSubmit(proof,all);}}>
      <header className="hq-dialog-head"><h2 id={titleId} className="hq-title">{title}</h2><button className="hq-close" type="button" disabled={busy} aria-label={accessCopy(locale,"close")} onClick={close}>×</button></header>
      <p id={introId} className="hq-muted">{accessCopy(locale,kind === "enroll" ? "enrollmentIntro" : kind === "rotate" ? "rotationIntro" : "revocationIntro")}</p>
      {kind === "revoke" && <fieldset className="hq-access-scope"><legend className="hq-access-sr">{title}</legend><label className="hq-check"><input type="radio" name="scope" checked={!all} onChange={() => {setAll(false);setSecret("");setAck(false);}} disabled={busy}/>{accessCopy(locale,"thisSession")}</label><label className="hq-check"><input type="radio" name="scope" checked={all} onChange={() => setAll(true)} disabled={busy}/>{accessCopy(locale,"allSessions")}</label></fieldset>}
      {needsSecret && <HqAccessSecret key={`${kind}-${all}`} locale={locale} label={accessCopy(locale,kind === "enroll" ? bootstrap ? "bootstrap" : "permit" : "credential")} hint={accessCopy(locale,kind === "enroll" && bootstrap ? "bootstrapHint" : "credentialHint")} value={secret} onChange={setSecret} disabled={busy} autoFocus/>}
      {kind === "revoke" && all && <label className="hq-check"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} disabled={busy}/>{accessCopy(locale,"revokeAck")}</label>}
      {attempted && !valid && <p className="hq-message hq-message-error" role="alert">{accessCopy(locale,"required")}</p>}
      {error && <p className="hq-message hq-message-error" role="alert">{error}</p>}
      <footer className="hq-form-footer"><button type="button" className="hq-button" onClick={close} disabled={busy}>{accessCopy(locale,"cancel")}</button><button type="submit" className={`hq-button ${kind === "revoke" ? "hq-button-danger" : "hq-button-primary"}`} disabled={busy || !valid}>{accessCopy(locale,busy ? "working" : kind !== "revoke" ? "stage" : all ? "allSessions" : "thisSession")}</button></footer>
    </form>
  </ModalOverlay></ModalPortal>;
}
