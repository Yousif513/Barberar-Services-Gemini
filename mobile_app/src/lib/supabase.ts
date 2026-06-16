import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const expectedProjectRef =
  process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF || "vpszcnxsgmoavkqorjzt";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required.");
}

if (new URL(supabaseUrl).hostname !== `${expectedProjectRef}.supabase.co`) {
  throw new Error(
    `Supabase project mismatch: this Barberar workspace expects ${expectedProjectRef}.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
