import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { bearerToken, corsHeaders, env, json, MissingConfigError, serviceClient } from "../_shared/http.ts"

// PRIV-2 (Q1.5): the customer's authenticated download of their data copy.
//   POST { "request_id": "<uuid>", "file": "json" | "pdf" }   with the customer's own access token
// privacy_export_authorize_download runs with the caller's token: only the person the copy is about, only a built copy, only for
// 7 days, and every download is recorded. The file is then read from the private bucket with the service key and returned.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)
  try {
    const token = bearerToken(req)
    if (!token) return json(req, { error: "Sign in to download your data." }, 401)
    const body = await req.json().catch(() => ({}))
    const requestId = typeof body?.request_id === "string" ? body.request_id : ""
    const file = body?.file === "json" ? "json" : body?.file === "pdf" ? "pdf" : ""
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !file) return json(req, { error: "request_id and file (json or pdf) are required." }, 400)

    const asCaller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: grant, error } = await asCaller.rpc("privacy_export_authorize_download", { p_request_id: requestId, p_file: file })
    if (error) {
      const status = error.hint === "export_expired" ? 410 : error.code === "P0002" ? 404 : error.code === "28000" ? 401 : 403
      return json(req, { error: error.message, hint: error.hint ?? null }, status)
    }
    const { data: blob, error: downloadError } = await serviceClient().storage.from("privacy-exports").download(grant.path)
    if (downloadError || !blob) return json(req, { error: "The file could not be read; try again later." }, 502)
    return new Response(blob, {
      status: 200,
      headers: {
        ...corsHeaders(req),
        "Content-Type": grant.content_type,
        "Content-Disposition": `attachment; filename="primora-personal-data.${file}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[privacy-export-download] failure", error instanceof Error ? error.message : "unknown")
    return json(req, { error: "Unexpected error." }, 500)
  }
})
