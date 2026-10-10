import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { serviceKeyMatches } from "./request-guards.ts"

// Origins allowed to call functions from a browser. APP_ORIGIN adds a deployment origin.
const ALLOWED_ORIGINS = [
  "https://primora.sa",
  "https://barberar.vercel.app",
  "http://localhost:3000",
  ...(Deno.env.get("APP_ORIGIN") ? [Deno.env.get("APP_ORIGIN") as string] : []),
]

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || ""
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

export function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new MissingConfigError(name)
  return value
}

export class MissingConfigError extends Error {
  constructor(public variable: string) {
    super(`${variable} is not configured`)
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  })
}

export type Caller = { kind: "service" } | { kind: "admin"; userId: string } | { kind: "user"; userId: string }

// Resolves the caller from the Authorization header: the service key (scheduler), an admin, or a user.
export async function resolveCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("Authorization") || ""
  const token = header.replace(/^Bearer\s+/i, "")
  if (!token) return null
  if (serviceKeyMatches(token, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) return { kind: "service" }

  const admin = serviceClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).single()
  // GOV-1 / Q6: the profile role is not enough. An administrator counts only in an aal2 session with a console role that is
  // not locked, which the database decides (public.is_admin() reads the caller's own JWT).
  return profile?.role === "admin" && (await adminSessionAllows(token)) ? { kind: "admin", userId: data.user.id } : { kind: "user", userId: data.user.id }
}

// Asks the database, with the caller's own token, whether this session is an active console session (is_admin()) or holds
// one console permission (admin_can, for example "money.refund"). Fails closed when the anon key is not configured.
export async function adminSessionAllows(token: string, permission?: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  if (!url || !anonKey || !token) return false
  const asCaller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = permission
    ? await asCaller.rpc("admin_can", { p_permission: permission })
    : await asCaller.rpc("is_admin")
  return !error && data === true
}

export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
}
