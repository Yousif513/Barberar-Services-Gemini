import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vpszcnxsgmoavkqorjzt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-key-to-pass-nextjs-build-checks";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
