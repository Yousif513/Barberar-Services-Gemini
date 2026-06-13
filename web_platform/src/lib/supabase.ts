import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vpszcnxsgmoavkqorjzt.supabase.co";
// Fallback to a mock key structure to pass Next.js build-time static page compilation if not defined in .env
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-key-to-pass-nextjs-build-checks";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
