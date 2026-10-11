"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { operationError, type OperationsLocale } from "@/components/operations-ui";

// One modal behaviour for the whole console, following the WAI-ARIA dialog (modal) pattern: focus moves in when the
// dialog opens, Tab stays inside it, Escape closes it, everything behind it is inert, and focus returns to the control
// that opened it. Dialogs are portalled to <body>, so "behind it" is every other child of <body>.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openOverlays: HTMLElement[] = [];

function reachable(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0);
}

export function useModalBehavior(overlayRef: React.RefObject<HTMLElement | null>, onClose: () => void, canClose = true) {
  const latest = useRef({ onClose, canClose });
  useEffect(() => {
    latest.current = { onClose, canClose };
  });

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child === overlay || !(child instanceof HTMLElement) || child.hasAttribute("inert")) continue;
      child.setAttribute("inert", "");
      inerted.push(child);
    }
    openOverlays.push(overlay);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]') ?? overlay;
    (overlay.querySelector<HTMLElement>("[data-autofocus]") ?? reachable(dialog)[0] ?? dialog).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (openOverlays[openOverlays.length - 1] !== overlay) return;
      if (event.key === "Escape") {
        if (!latest.current.canClose) return;
        event.preventDefault();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const stops = reachable(dialog);
      if (stops.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openOverlays.indexOf(overlay);
      if (at >= 0) openOverlays.splice(at, 1);
      for (const child of inerted) child.removeAttribute("inert");
      if (opener && opener.isConnected) opener.focus();
      else document.getElementById("admin-main")?.focus();
    };
  }, [overlayRef]);
}

// The dimmed layer that holds a dialog panel. The panel inside it carries role="dialog", aria-modal and its name.
export function ModalOverlay({ onClose, canClose = true, className, children }: { onClose: () => void; canClose?: boolean; className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalBehavior(ref, onClose, canClose);
  return <div ref={ref} className={className}>{children}</div>;
}

const copy = {
  en: {
    cancel: "Cancel",
    working: "Working…",
    reasonTooShort: "Enter a reason of at least {n} characters.",
    reasonHint: "Recorded in the audit log with your name.",
    typeToConfirm: "Type {value} to confirm",
    typedMismatch: "That does not match {value}.",
    ackRequired: "Tick the box to confirm before continuing.",
    fieldInvalid: "Check this value.",
  },
  ar: {
    cancel: "إلغاء",
    working: "جارٍ التنفيذ…",
    reasonTooShort: "اكتب سبباً لا يقل عن {n} أحرف.",
    reasonHint: "يُسجَّل في سجل التدقيق باسمك.",
    typeToConfirm: "اكتب {value} للتأكيد",
    typedMismatch: "لا يطابق {value}.",
    ackRequired: "ضع علامة في المربع للتأكيد قبل المتابعة.",
    fieldInvalid: "تحقق من هذه القيمة.",
  },
};

export type CommandFact = { label: string; value: string };

export function CommandDialog({
  locale,
  title,
  intro,
  facts = [],
  effects = [],
  effectsTitle,
  reasonLabel,
  reasonRequired = true,
  minReasonLength = 3,
  confirmWord,
  acknowledgement,
  field,
  confirmLabel,
  tone = "default",
  onConfirm,
  onClose,
}: {
  locale: OperationsLocale;
  title: string;
  intro?: string;
  facts?: CommandFact[];
  effects?: string[];
  effectsTitle?: string;
  reasonLabel: string;
  reasonRequired?: boolean;
  minReasonLength?: number;
  confirmWord?: string;
  // A statement the operator must tick before the command can be sent (a check made outside the console).
  acknowledgement?: string;
  // One more value the command needs besides the reason (a registration number, for example), checked against a pattern.
  field?: { label: string; initial?: string; pattern: RegExp; error: string; ltr?: boolean };
  confirmLabel: string;
  tone?: "default" | "danger";
  // Resolves to a message when the command was refused (the dialog stays open and keeps what was typed) or null when it succeeded.
  onConfirm: (reason: string, extra: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const t = copy[locale];
  const titleId = useId();
  const introId = useId();
  const reasonId = useId();
  const errorId = useId();
  const confirmId = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [extra, setExtra] = useState(field?.initial ?? "");
  const fieldId = useId();
  const [attempted, setAttempted] = useState(false);
  const ackId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const dir = locale === "ar" ? "rtl" : "ltr";
  const trimmed = reason.trim();
  const reasonProblem = reasonRequired && trimmed.length < minReasonLength ? t.reasonTooShort.replace("{n}", String(minReasonLength)) : "";
  const confirmed = !confirmWord || typed.trim().toLowerCase() === confirmWord.toLowerCase();
  const danger = tone === "danger";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (busy || reasonProblem || !confirmed || (acknowledgement && !acknowledged) || (field && !field.pattern.test(extra.trim()))) return;
    setBusy(true);
    setFailure("");
    let message: string | null;
    try {
      message = await onConfirm(trimmed, extra.trim());
    } catch (error) {
      message = operationError(error);
    }
    setBusy(false);
    if (message) setFailure(message);
    else onClose();
  };

  return (
    <ModalPortal>
    <ModalOverlay onClose={onClose} canClose={!busy} className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#101828]/55 px-4 py-8 backdrop-blur-sm">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={intro ? introId : undefined}
        dir={dir}
        tabIndex={-1}
        onSubmit={(event) => void submit(event)}
        className={`max-h-full w-full max-w-lg overflow-y-auto rounded-[28px] border bg-white p-6 shadow-2xl ${danger ? "border-[#FECDCA]" : "border-[#D1AF47]/40"}`}
      >
        <h2 id={titleId} className={`font-serif text-xl font-black ${danger ? "text-[#B42318]" : "text-[#101828]"}`}>{title}</h2>
        {intro && <p id={introId} className="mt-2 text-sm leading-6 text-[#475467]">{intro}</p>}
        {facts.length > 0 && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-[#ECECEC] bg-[#F9F7F1] p-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="contents">
                <dt className="font-semibold text-[#667085]">{fact.label}</dt>
                <dd className="min-w-0 break-words font-bold text-[#101828]">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {effects.length > 0 && (
          <div className="mt-4">
            {effectsTitle && <p className="text-xs font-black text-[#344054]">{effectsTitle}</p>}
            <ul className="mt-1.5 list-disc space-y-1 ps-5 text-sm leading-6 text-[#475467]">
              {effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          </div>
        )}
        {field && (
          <div className="mt-4">
            <label htmlFor={fieldId} className="block text-xs font-black text-[#344054]">{field.label}</label>
            <input
              id={fieldId}
              data-autofocus
              dir={field.ltr ? "ltr" : undefined}
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
              autoComplete="off"
              aria-invalid={attempted && !field.pattern.test(extra.trim())}
              disabled={busy}
              className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 font-mono text-sm text-[#101828] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60"
            />
            {attempted && !field.pattern.test(extra.trim()) && <p className="mt-1 text-xs font-semibold text-[#B42318]">{field.error}</p>}
          </div>
        )}
        {reasonRequired && (
          <div className="mt-4">
            <label htmlFor={reasonId} className="block text-xs font-black text-[#344054]">{reasonLabel}</label>
            <textarea
              id={reasonId}
              data-autofocus={field ? undefined : true}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              aria-invalid={attempted && Boolean(reasonProblem)}
              aria-describedby={attempted && reasonProblem ? errorId : undefined}
              disabled={busy}
              className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 text-sm text-[#101828] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-[#667085]">{t.reasonHint}</p>
          </div>
        )}
        {confirmWord && (
          <div className="mt-4">
            <label htmlFor={confirmId} className="block text-xs font-black text-[#344054]">
              {t.typeToConfirm.replace("{value}", "")}<bdi dir="ltr" className="rounded bg-[#F2F4F7] px-1.5 py-0.5 font-mono text-[#101828]">{confirmWord}</bdi>
            </label>
            <input
              id={confirmId}
              dir="ltr"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={attempted && !confirmed}
              disabled={busy}
              className="mt-1.5 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 py-2.5 font-mono text-sm text-[#101828] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60"
            />
            {attempted && !confirmed && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.typedMismatch.replace("{value}", confirmWord)}</p>}
          </div>
        )}
        {acknowledgement && (
          <div className="mt-4">
            <label htmlFor={ackId} className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-[#344054]">
              <input id={ackId} type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} aria-invalid={attempted && !acknowledged} className="mt-1.5 h-4 w-4 shrink-0 accent-[#9B7928]" />
              <span>{acknowledgement}</span>
            </label>
            {attempted && !acknowledged && <p className="mt-1 text-xs font-semibold text-[#B42318]">{t.ackRequired}</p>}
          </div>
        )}
        {attempted && reasonProblem && <p id={errorId} className="mt-3 text-xs font-semibold text-[#B42318]">{reasonProblem}</p>}
        {failure && <div role="alert" className="mt-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-sm font-semibold text-[#B42318]">{failure}</div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#D0D5DD] bg-white px-4 py-2.5 text-sm font-bold text-[#344054] outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-50">{t.cancel}</button>
          <button
            type="submit"
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-black text-white outline-2 outline-offset-2 outline-transparent focus-visible:outline-[#9B7928] disabled:opacity-60 ${danger ? "bg-[#B42318]" : "bg-[#101828]"}`}
          >
            {busy ? t.working : confirmLabel}
          </button>
        </div>
      </form>
    </ModalOverlay>
    </ModalPortal>
  );
}

// Portals a dialog to <body> once the document exists (the console renders on the client, so this is immediate).
export function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

export type ConfirmOptions = { title: string; intro?: string; facts?: CommandFact[]; confirmLabel: string; tone?: "default" | "danger" };

// A named confirmation for a command that needs a yes or no and no reason (turning something off, archiving a record
// that keeps its history). `ask` resolves true when the operator confirms and false when they cancel or press Escape;
// render `node` once in the screen. It replaces window.confirm, which cannot name the target, follow the page direction
// or be reached predictably by keyboard and screen reader.
export function useConfirm(locale: OperationsLocale) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (answer: boolean) => void } | null>(null);
  const ask = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })), []);
  const node = pending ? (
    <CommandDialog
      locale={locale}
      tone={pending.options.tone}
      title={pending.options.title}
      intro={pending.options.intro}
      facts={pending.options.facts}
      reasonLabel=""
      reasonRequired={false}
      confirmLabel={pending.options.confirmLabel}
      onConfirm={async () => {
        pending.resolve(true);
        return null;
      }}
      onClose={() => {
        pending.resolve(false);
        setPending(null);
      }}
    />
  ) : null;
  return [node, ask] as const;
}
