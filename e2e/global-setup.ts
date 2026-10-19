// Runs once before the suite: finds the local stack, refuses anything that is not on this machine, and checks that the
// web app and the stack answer before any test starts (a clear failure instead of 100 time-outs).

import { discoverStack } from "./support/stack";
import { sql } from "./support/db";

export default async function globalSetup(): Promise<void> {
  const s = discoverStack();
  const health = await fetch(`${s.apiUrl}/auth/v1/health`, { headers: { apikey: s.anonKey } }).catch(() => null);
  if (!health?.ok) throw new Error(`the local Supabase stack does not answer at ${s.apiUrl}; start it with npx supabase start`);
  const web = await fetch(`${s.baseURL}/login`).catch(() => null);
  if (!web?.ok) throw new Error(`the web app does not answer at ${s.baseURL}/login; start it (next dev or next start) first`);
  const migrations = Number(sql("select count(*) from supabase_migrations.schema_migrations"));
  if (!(migrations > 100)) throw new Error(`only ${migrations} migrations are applied to the local database`);
}
