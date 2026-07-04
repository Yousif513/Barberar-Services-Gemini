import { createClient } from "@supabase/supabase-js";

const expectedProjectRef =
  process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF || "vpszcnxsgmoavkqorjzt";

const derivedRemoteUrl = `https://${expectedProjectRef}.supabase.co`;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || derivedRemoteUrl;
const fallbackAnonKey = "sb_publishable_0TVT_3pEcOWYmtIaDA730A_qqb5JrJO";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fallbackAnonKey;

if (new URL(supabaseUrl).hostname !== `${expectedProjectRef}.supabase.co` &&
    !new URL(supabaseUrl).hostname.includes("localhost") &&
    !new URL(supabaseUrl).hostname.includes("127.0.0.1")) {
  throw new Error(
    `Supabase project mismatch: this Barberar workspace expects ${expectedProjectRef}.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
