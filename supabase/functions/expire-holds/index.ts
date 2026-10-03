import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

const ALLOWED_ORIGINS = [
  "https://barberar.vercel.app",
  "https://primora.sa",
  "http://localhost:3000",
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || ""
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  }
}

const json = (body: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? getCorsHeaders(req) : {}),
    },
  })

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Environment configuration missing" }, 500, req)
    }

    // Auth gate: Caller must provide valid service role or admin token
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401, req)
    }

    const token = authHeader.replace(/^Bearer\s+/i, "")
    const isServiceRole = token === serviceKey

    if (!isServiceRole) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || serviceKey)
      const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
      if (authError || !user) {
        return json({ error: "Unauthorized" }, 401, req)
      }

      const serviceClient = createClient(supabaseUrl, serviceKey)
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (profile?.role !== "admin") {
        return json({ error: "Forbidden: Admin role required" }, 403, req)
      }
    }

    let holdMinutes = 15
    if (req.method === "POST") {
      try {
        const body = await req.json()
        if (typeof body?.hold_interval_minutes === "number" && body.hold_interval_minutes > 0) {
          holdMinutes = body.hold_interval_minutes
        }
      } catch {
        // use default 15
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    const { data: expiredCount, error: rpcError } = await supabase.rpc(
      "expire_stale_booking_holds",
      { hold_interval_minutes: holdMinutes }
    )

    if (rpcError) {
      console.error("[Expire Holds] RPC error:", rpcError)
      return json({ error: rpcError.message }, 500, req)
    }

    return json({
      success: true,
      expired_count: expiredCount || 0,
      hold_interval_minutes: holdMinutes,
      timestamp: new Date().toISOString(),
    }, 200, req)
  } catch (err) {
    console.error("[Expire Holds] Unexpected error:", err)
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500, req)
  }
})
