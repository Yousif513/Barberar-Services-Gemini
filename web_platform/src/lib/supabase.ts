import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestStepUp, responseHint } from "@/lib/step-up";

/*
 * Supabase browser client.
 *
 * IMPORTANT (production): NEXT_PUBLIC_* env vars are inlined at BUILD time. They must be set in the Vercel project
 * (Production + Preview) BEFORE the build, or the deployed bundle ships without them.
 *
 * There is no baked-in project: a missing URL or key used to fall back to a project that no longer exists, so a
 * misconfigured deployment looked configured and every request failed with a network error. Now `isSupabaseConfigured`
 * is false when either value is missing, the login screen says so, and the client points at an address that cannot
 * resolve (".invalid") instead of at somebody else's project. For local development set the two variables to the local
 * stack (`npx supabase status -o env` prints them).
 */

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const expectedProjectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim();

/** True when both the project URL and its public (anon/publishable) key are configured. */
export const isSupabaseConfigured = Boolean(configuredUrl && configuredAnonKey);

const supabaseUrl = configuredUrl || "https://supabase-not-configured.invalid";
const supabaseAnonKey = configuredAnonKey || "supabase-not-configured";

// Warn (do NOT throw) on a project-ref mismatch. Throwing at module load would
// white-screen the entire app; a warning is diagnosable without breaking render.
if (configuredUrl && expectedProjectRef) {
  try {
    const host = new URL(configuredUrl).hostname;
    if (host !== `${expectedProjectRef}.supabase.co` && !host.includes("127.0.0.1") && !host.includes("localhost")) {
      console.warn(
        `[supabase] NEXT_PUBLIC_SUPABASE_URL host "${host}" does not match the expected project "${expectedProjectRef}". Auth may target the wrong project.`
      );
    }
  } catch {
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

// Loud, actionable diagnostic in the browser when the configuration is missing in a deployed build.
if (typeof window !== "undefined" && !isSupabaseConfigured) {
  console.error(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Set both in the Vercel project (Production + Preview) and redeploy — sign in and every data screen will fail until then."
  );
}

const globalForSupabase = globalThis as typeof globalThis & {
  primoraSupabaseClient?: SupabaseClient;
};

// GOV-1 step-up: a database command refused with the hint "step_up_required" asks the operator for a fresh authenticator code
// (StepUpDialog) and is sent once more with the refreshed session. Every other response passes through untouched.
async function stepUpAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401 && response.status !== 403) return response;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/rest/v1/") || (await responseHint(response)) !== "step_up_required") return response;
  if (!(await requestStepUp())) return response;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return response;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

export const supabase: SupabaseClient =
  globalForSupabase.primoraSupabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: stepUpAwareFetch },
  });

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.primoraSupabaseClient = supabase;
}
