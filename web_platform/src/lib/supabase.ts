import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const expectedProjectRef =
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim() ||
  "vpszcnxsgmoavkqorjzt";

const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
const supabaseAnonKey =
  configuredAnonKey ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.build-only";

if (
  configuredUrl &&
  new URL(configuredUrl).hostname !== `${expectedProjectRef}.supabase.co`
) {
  throw new Error(
    `Supabase project mismatch: this Barberar workspace expects ${expectedProjectRef}.`
  );
}

const globalForSupabase = globalThis as typeof globalThis & {
  primoraSupabaseClient?: SupabaseClient;
};

export const supabase =
  globalForSupabase.primoraSupabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey);

if (process.env.NODE_ENV !== "production") {
  globalForSupabase.primoraSupabaseClient = supabase;
}
