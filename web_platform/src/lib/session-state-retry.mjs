// E2E observation (docs/reviews/2026-10-17-e2e-suite.md): PostgREST refuses an access token in the second it was issued
// (PGRST303 "JWT issued at future"), so the first admin_session_state call right after sign-in could fail, and the console then
// silently left out the role-gated actions (reveal, payout). The read is now retried while the failure is one that clears by
// itself, and a failure that remains is reported to the operator instead of trimming the screen without a word.
// Pure functions with no React and no Supabase client, so tests/session-state-retry.test.mjs runs them directly.

export const SESSION_STATE_RETRY_DELAYS_MS = [250, 600, 1200, 2500];

/**
 * A failure that clears by itself: a token PostgREST sees as issued in the future (clock skew of up to a second after
 * sign-in), an expired or not yet refreshed token, a server that is briefly unavailable, or no answer at all.
 * @param {any} error
 * @returns {boolean}
 */
export function isTransientSessionError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (code === "PGRST303" || code === "PGRST301") return true;
  if (/issued at future|JWT expired|jwt expired/i.test(message)) return true;
  if (/Failed to fetch|NetworkError|network request failed|fetch failed/i.test(message)) return true;
  const status = Number(error.status ?? 0);
  return status === 401 || status === 502 || status === 503 || status === 504;
}

/**
 * Calls fetchState until it answers without an error, retrying transient failures after each delay.
 * @param {() => PromiseLike<{ data?: unknown, error?: any }>} fetchState
 * @param {{ delays?: number[], sleep?: (ms: number) => Promise<void>, beforeRetry?: () => Promise<void>, isCancelled?: () => boolean }} [options]
 * @returns {Promise<{ data?: unknown, error?: any, attempts: number }>}
 */
export async function loadSessionStateWithRetry(fetchState, options = {}) {
  const delays = options.delays ?? SESSION_STATE_RETRY_DELAYS_MS;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let answer;
    try {
      answer = await fetchState();
    } catch (error) {
      answer = { error };
    }
    if (!answer?.error) return { data: answer?.data, attempts };
    if (attempts > delays.length || !isTransientSessionError(answer.error) || options.isCancelled?.()) {
      return { error: answer.error, attempts };
    }
    await sleep(delays[attempts - 1]);
    if (options.beforeRetry) await options.beforeRetry();
  }
}
