// Where the suite runs: the local Supabase stack (Docker) and the web app served from this checkout.
//
// Everything is discovered from `supabase status -o env` unless E2E_* variables are set (CI sets them). The suite refuses
// any API or web address that is not on this machine, so it can never reach the hosted project or a real payment gateway.
// Keys are kept in process memory only and are never logged.

import { execSync } from "node:child_process";

export type Stack = {
  apiUrl: string;
  anonKey: string;
  serviceKey: string;
  mailpitUrl: string;
  dbContainer: string;
  baseURL: string;
  /** The Supabase address the web app was built with (it names the browser's session key). */
  appSupabaseUrl: string;
};

const LOCAL_HOST = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/;

export function assertLocal(name: string, url: string): void {
  if (!LOCAL_HOST.test(url)) {
    throw new Error(`refusing to run: ${name} is not a local address (${new URL(url).host}); the e2e suite only talks to this machine`);
  }
}

function readStatusEnv(): Record<string, string> {
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const env: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** Called once by global setup: fills E2E_* in process.env (inherited by every worker) and validates them. */
export function discoverStack(): Stack {
  const need = ["E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_SUPABASE_SERVICE_KEY", "E2E_MAILPIT_URL"];
  if (need.some((k) => !process.env[k])) {
    const status = readStatusEnv();
    process.env.E2E_SUPABASE_URL ||= status.API_URL;
    process.env.E2E_SUPABASE_ANON_KEY ||= status.ANON_KEY || status.PUBLISHABLE_KEY;
    process.env.E2E_SUPABASE_SERVICE_KEY ||= status.SERVICE_ROLE_KEY || status.SECRET_KEY;
    process.env.E2E_MAILPIT_URL ||= status.MAILPIT_URL || status.INBUCKET_URL;
  }
  process.env.E2E_BASE_URL ||= "http://localhost:3100";
  process.env.E2E_DB_CONTAINER ||= "supabase_db_beauty_grooming_marketplace";
  process.env.E2E_APP_SUPABASE_URL ||= process.env.E2E_SUPABASE_URL;
  return stack();
}

let cached: Stack | null = null;

export function stack(): Stack {
  if (cached) return cached;
  const s: Stack = {
    apiUrl: (process.env.E2E_SUPABASE_URL ?? "").replace(/\/$/, ""),
    anonKey: process.env.E2E_SUPABASE_ANON_KEY ?? "",
    serviceKey: process.env.E2E_SUPABASE_SERVICE_KEY ?? "",
    mailpitUrl: (process.env.E2E_MAILPIT_URL ?? "").replace(/\/$/, ""),
    dbContainer: process.env.E2E_DB_CONTAINER ?? "",
    baseURL: (process.env.E2E_BASE_URL ?? "").replace(/\/$/, ""),
    appSupabaseUrl: (process.env.E2E_APP_SUPABASE_URL ?? "").replace(/\/$/, ""),
  };
  for (const [name, value] of Object.entries(s)) {
    if (!value) throw new Error(`e2e configuration is incomplete: ${name} is empty (is the local Supabase stack running?)`);
  }
  assertLocal("the Supabase API", s.apiUrl);
  assertLocal("the app's Supabase API", s.appSupabaseUrl);
  assertLocal("Mailpit", s.mailpitUrl);
  assertLocal("the web app", s.baseURL);
  cached = s;
  return s;
}

/** supabase-js keeps the session in localStorage under sb-<first label of the API host>-auth-token. */
export function sessionStorageKey(): string {
  return `sb-${new URL(stack().appSupabaseUrl).hostname.split(".")[0]}-auth-token`;
}
