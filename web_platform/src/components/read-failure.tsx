"use client";

import { ForbiddenNotice, isForbidden, operationsButton, type OperationsLocale } from "@/components/operations-ui";
import { describeConsoleError } from "@/lib/console-errors.mjs";

// What a screen shows instead of its list when the read failed (gap refused-reads-shown-with-an-empty-state): the refusal
// with the role that would grant it when the server refused the account, otherwise the reason and a retry. A failed read
// never shows the empty-list text, so an outage, a refusal and a quiet day cannot be mistaken for one another.
const copy = {
  en: { failed: "{what} could not be loaded.", retry: "Try again" },
  ar: { failed: "تعذر تحميل {what}.", retry: "إعادة المحاولة" },
};

export function ReadFailure({ error, locale, what, onRetry, permissions }: {
  error: unknown;
  locale: OperationsLocale;
  what: string;
  onRetry?: () => void;
  permissions?: string[];
}) {
  const hint = error && typeof error === "object" && "hint" in error ? String((error as { hint?: unknown }).hint ?? "") : "";
  if (isForbidden(error) && hint !== "step_up_required") return <ForbiddenNotice locale={locale} permissions={permissions} />;
  const t = copy[locale];
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="min-w-0 flex-1">
        <strong className="block font-black">{t.failed.replace("{what}", what)}</strong>
        <span className="mt-1 block leading-6">{describeConsoleError(error, locale)}</span>
      </p>
      {onRetry && <button type="button" onClick={onRetry} className={operationsButton}>{t.retry}</button>}
    </div>
  );
}
