import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
 * Supabase browser client.
 *
 * IMPORTANT (production): NEXT_PUBLIC_* env vars are inlined at BUILD time. They
 * must be set in the Vercel project (Production + Preview) BEFORE the build, or
 * the deployed bundle ships without them. Previously this file fell back to
 * `http://127.0.0.1:54321` when the URL was missing — on a phone that resolves
 * to the phone's own localhost, so auth silently failed on the Vercel site while
 * working locally. We now default the URL to the known remote project instead of
 * localhost, and expose `isSupabaseConfigured` so the UI can show a clear message
 * when the anon key is missing (a missing key cannot be derived).
 */

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const expectedProjectRef =
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim() ||
  "vpszcnxsgmoavkqorjzt";

// Default to the real remote project URL (derivable from the known ref) rather
// than localhost, so a missing NEXT_PUBLIC_SUPABASE_URL never points the
// deployed site at 127.0.0.1. Local Supabase users can still opt in by setting
// NEXT_PUBLIC_SUPABASE_URL explicitly.
const derivedRemoteUrl = `https://${expectedProjectRef}.supabase.co`;
const supabaseUrl = configuredUrl || derivedRemoteUrl;

// The anon/publishable key cannot be derived. A build-only placeholder keeps
// `next build` working when secrets are absent in CI, but auth will not function
// with it — isSupabaseConfigured reflects whether a real key is present.
const BUILD_ONLY_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.build-only";
const supabaseAnonKey = configuredAnonKey || BUILD_ONLY_KEY;

/** True when a real anon/publishable key is configured (i.e. auth can work). */
export const isSupabaseConfigured = Boolean(configuredAnonKey);

// Warn (do NOT throw) on a project-ref mismatch. Throwing at module load would
// white-screen the entire app; a warning is diagnosable without breaking render.
if (configuredUrl) {
  try {
    const host = new URL(configuredUrl).hostname;
    if (
      host !== `${expectedProjectRef}.supabase.co` &&
      !host.includes("127.0.0.1") &&
      !host.includes("localhost")
    ) {
      console.warn(
        `[supabase] NEXT_PUBLIC_SUPABASE_URL host "${host}" does not match the expected project "${expectedProjectRef}". Auth may target the wrong project.`
      );
    }
  } catch {
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

// Loud, actionable diagnostic in the browser when the key is missing in a
// deployed build (the usual cause of "cannot log in on the live site").
if (typeof window !== "undefined" && !isSupabaseConfigured) {
  console.error(
    "[supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel project (Production + Preview) and redeploy — sign in / sign up will not work until then."
  );
}

const globalForSupabase = globalThis as typeof globalThis & {
  primoraSupabaseClient?: SupabaseClient;
};

export const supabase =
  globalForSupabase.primoraSupabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.primoraSupabaseClient = supabase;
}
