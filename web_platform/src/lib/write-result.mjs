// Whether a write really changed what it says, judged from the database's answer and never from the request having been
// sent (AGENTS.md defect 1: a refused write must never be reported as saved). Pure functions with no React and no Supabase
// client, so tests/write-result.test.mjs runs them against the answers the database actually gives.

// A table UPDATE or DELETE that a row policy refuses raises nothing: it matches no row and PostgREST answers 200 with an
// empty body. Such a write must ask for the rows it changed (`.select("id")`) and be judged here. `expected` is the number of
// rows the write must change; without it, at least one.
// The refusal is worded in the screen's language, so a screen that shows error.message stays in one language.
export const NO_ROWS_MESSAGE = {
  en: "Nothing was saved: the server did not accept this change for your account, or the record no longer exists. Reload the page to see the current values.",
  ar: "لم يُحفظ شيء: لم يقبل الخادم هذا التغيير لحسابك، أو لم يعد السجل موجوداً. أعد تحميل الصفحة لرؤية القيم الحالية.",
};

/**
 * @param {{ error?: unknown, data?: unknown } | null | undefined} answer
 * @param {number} [expected]
 * @param {"en" | "ar"} [lang]
 * @returns {{ ok: true, rows: unknown[] } | { ok: false, reason: "failed" | "no_rows", error: any }}
 */
export function tableWriteOutcome(answer, expected, lang = "en") {
  if (!answer) return { ok: false, reason: "failed", error: { message: "The server gave no answer" } };
  if (answer.error) return { ok: false, reason: "failed", error: answer.error };
  const rows = Array.isArray(answer.data) ? answer.data : answer.data ? [answer.data] : [];
  if (rows.length === 0 || (typeof expected === "number" && rows.length !== expected)) {
    return { ok: false, reason: "no_rows", error: { code: "no_rows", message: NO_ROWS_MESSAGE[lang === "ar" ? "ar" : "en"] } };
  }
  return { ok: true, rows };
}

// For handlers written as try/throw: returns the changed rows, or throws the refusal (the database error, or the no-rows
// refusal above) for the handler's catch to show.
/**
 * @param {{ error?: unknown, data?: unknown } | null | undefined} answer
 * @param {{ expected?: number, lang?: "en" | "ar" }} [options]
 */
export function requireRows(answer, options = {}) {
  // Without a language, the page's (<html lang>, set by the portal shell) when there is a page.
  const lang = options.lang ?? (typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar" : "en");
  const outcome = tableWriteOutcome(answer, options.expected, lang);
  if (!outcome.ok) throw outcome.error;
  return outcome.rows;
}

// For handlers written around `const { error } = await ...`: the same answer shape, with a write that changed no row turned
// into an error, so the handler's existing error path runs instead of its success path.
/**
 * @param {{ error?: unknown, data?: unknown } | null | undefined} answer
 * @param {{ expected?: number, lang?: "en" | "ar" }} [options]
 * @returns {{ error: any, data: unknown[] | null }}
 */
export function checkedWrite(answer, options = {}) {
  const lang = options.lang ?? (typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar" : "en");
  const outcome = tableWriteOutcome(answer, options.expected, lang);
  return outcome.ok ? { error: null, data: outcome.rows } : { error: outcome.error, data: null };
}

// A command (RPC) answers an error or a result. A result that says success: false is a refusal as well; a result that says
// changed: false is a confirmed answer that nothing needed to change (the record was already in the asked state).
/**
 * @param {{ error?: unknown, data?: unknown } | null | undefined} answer
 * @returns {{ ok: true, changed: boolean, data: any } | { ok: false, reason: "failed" | "rejected", error: unknown }}
 */
export function commandOutcome(answer) {
  if (!answer) return { ok: false, reason: "failed", error: { message: "The server gave no answer" } };
  if (answer.error) return { ok: false, reason: "failed", error: answer.error };
  const data = answer.data;
  if (data && typeof data === "object" && !Array.isArray(data) && data.success === false) {
    const message = [data.message, data.reason, data.error].find((value) => typeof value === "string" && value) || "The server did not accept the change";
    return { ok: false, reason: "rejected", error: { message, code: typeof data.code === "string" ? data.code : "rejected", hint: typeof data.hint === "string" ? data.hint : "" } };
  }
  const changed = !(data && typeof data === "object" && !Array.isArray(data) && data.changed === false);
  return { ok: true, changed, data };
}

// The optimistic pattern: show the change, send it, keep it only when the answer confirms it, otherwise put the previous
// state back. A thrown request (network failure) counts as a failure. Returns the outcome for the caller to report.
/**
 * @template T
 * @param {{ apply?: () => void, rollback?: () => void, send: () => Promise<T> | PromiseLike<T>, judge?: (answer: T) => any }} steps
 */
export async function optimisticWrite({ apply, rollback, send, judge = commandOutcome }) {
  if (apply) apply();
  let outcome;
  try {
    outcome = judge(await send());
  } catch (error) {
    outcome = { ok: false, reason: "failed", error };
  }
  if (!outcome.ok && rollback) rollback();
  return outcome;
}
