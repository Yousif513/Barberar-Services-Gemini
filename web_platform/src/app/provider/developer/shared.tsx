"use client";

import React, { useId, useState } from "react";
import { ModalOverlay, ModalPortal } from "@/components/modal";
import { operationError, type OperationsLocale } from "@/components/operations-ui";
import { describeServerError } from "../_components/server-errors";
import type { DeveloperCopy } from "./copy";

export const fieldClass =
  "mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 text-sm text-[#101828] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60";
export const primaryButton =
  "rounded-xl bg-[#101828] px-4 py-2.5 text-sm font-black text-white outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "rounded-xl border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-bold text-[#344054] outline-2 outline-offset-2 outline-transparent hover:bg-[#F9F7F1] focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";
export const dangerButton =
  "rounded-xl border border-[#FECDCA] bg-white px-3 py-2 text-xs font-bold text-[#B42318] outline-2 outline-offset-2 outline-transparent hover:bg-[#FEF3F2] focus-visible:outline-[#9B7928] disabled:cursor-not-allowed disabled:opacity-50";

// A server refusal in the reader's language: the cases this screen can cause get their own sentence, anything else is
// the server's own reason (translated where the shared table knows it).
export function explainError(error: unknown, locale: OperationsLocale, t: DeveloperCopy): string {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = operationError(error);
  if (code === "55000") return t.errNotConfigured;
  if (code === "28000") return t.errSignIn;
  if (code === "P0002") return t.errNotFound;
  if (code === "23505") return /address/i.test(message) ? t.errDuplicateUrl : t.errDuplicateKey;
  const url = /Webhook address not allowed: (\w+)/.exec(message);
  if (url && t.urlProblem[url[1]]) return t.urlProblem[url[1]];
  if (code === "42501") return t.errForbidden;
  return describeServerError(error, locale);
}

// A dialog with a form body. The caller returns a message when the server refused (the dialog stays open and keeps what
// was typed) or null when it worked. The same keyboard behaviour as the shared command dialog: focus moves in, Tab stays
// inside, Escape closes, everything behind is inert.
export function FormDialog({
  locale, title, intro, submitLabel, busyLabel, cancelLabel, wide, onSubmit, onClose, children,
}: {
  locale: OperationsLocale;
  title: string;
  intro?: string;
  submitLabel: string;
  busyLabel: string;
  cancelLabel: string;
  wide?: boolean;
  onSubmit: () => Promise<string | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    let message: string | null;
    try {
      message = await onSubmit();
    } catch (error) {
      message = operationError(error);
    }
    setBusy(false);
    if (message) setFailure(message);
  };
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={!busy} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          dir={locale === "ar" ? "rtl" : "ltr"}
          tabIndex={-1}
          noValidate
          onSubmit={(event) => void submit(event)}
          className={`max-h-full w-full overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}
        >
          <h2 id={titleId} className="font-serif text-xl font-black text-[#101828]">{title}</h2>
          {intro && <p className="mt-2 text-sm leading-6 text-[#475467]">{intro}</p>}
          <div className="mt-4 space-y-4">{children}</div>
          {failure && <div role="alert" className="mt-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318]">{failure}</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>{cancelLabel}</button>
            <button type="submit" disabled={busy} className={primaryButton}>{busy ? busyLabel : submitLabel}</button>
          </div>
        </form>
      </ModalOverlay>
    </ModalPortal>
  );
}

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="mt-1 text-xs font-semibold text-[#B42318]">{children}</p>;
}

// Shows a credential exactly once. It lives only in this component's props for as long as the dialog is open; closing
// is possible only after the owner confirms they stored it, so an accidental Escape cannot lose it.
export function SecretDialog({
  locale, t, title, warning, label, value, onClose,
}: {
  locale: OperationsLocale;
  t: DeveloperCopy;
  title: string;
  warning: string;
  label: string;
  value: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const valueId = useId();
  const ackId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [copyNote, setCopyNote] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyNote(t.copied);
    } catch {
      setCopyNote(t.copyFailed);
    }
  };
  return (
    <ModalPortal>
      <ModalOverlay onClose={onClose} canClose={acknowledged} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} dir={locale === "ar" ? "rtl" : "ltr"} tabIndex={-1}
          className="max-h-full w-full max-w-xl overflow-y-auto rounded-[28px] border border-[#D1AF47]/40 bg-white p-6 shadow-2xl">
          <h2 id={titleId} className="font-serif text-xl font-black text-[#101828]">{title}</h2>
          <p role="note" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">{warning}</p>
          <p id={valueId} className="mt-4 text-xs font-black text-[#344054]">{label}</p>
          <code dir="ltr" aria-labelledby={valueId} data-autofocus tabIndex={0}
            className="mt-1.5 block select-all break-all rounded-xl border border-[#D0D5DD] bg-[#101828] px-3 py-3 text-start font-mono text-xs leading-6 text-[#E9E2D2] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928]">
            {value}
          </code>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void copy()} className={secondaryButton}>{t.copy}</button>
            <span role="status" className="text-xs font-semibold text-[#475467]">{copyNote}</span>
          </div>
          <label htmlFor={ackId} className="mt-5 flex items-start gap-2.5 text-sm font-semibold leading-6 text-[#344054]">
            <input id={ackId} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1.5 h-4 w-4 shrink-0 accent-[#9B7928]" />
            <span>{t.storedAck}</span>
          </label>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} disabled={!acknowledged} className={primaryButton}>{t.done}</button>
          </div>
        </div>
      </ModalOverlay>
    </ModalPortal>
  );
}

export function StatusBadge({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const tones = {
    good: "border-green-300 bg-green-50 text-green-900",
    warn: "border-amber-300 bg-amber-50 text-amber-950",
    bad: "border-red-300 bg-red-50 text-red-900",
    muted: "border-[#D0D5DD] bg-[#F2F4F7] text-[#344054]",
  };
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function CodeBlock({ code, label, copyLabel }: { code: string; label: string; copyLabel: string }) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-[#667085]">{label}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => setNote("✓"), () => setNote("!"));
          }}
          className={secondaryButton}
          aria-label={`${copyLabel}: ${label}`}
        >
          {copyLabel}
        </button>
        <span role="status" className="sr-only">{note}</span>
      </div>
      <pre dir="ltr" tabIndex={0} className="mt-1 overflow-x-auto rounded-xl border border-[#D0D5DD] bg-[#101828] p-3 text-start text-xs leading-6 text-[#E9E2D2] focus-visible:outline-2 focus-visible:outline-[#9B7928]"><code>{code}</code></pre>
    </div>
  );
}
