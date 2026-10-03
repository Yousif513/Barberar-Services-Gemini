// supabase/functions/dispatch-messages/index.ts
// Secure Deno Edge Function for dispatching scheduled WhatsApp & SMS messages (G11)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || ""
  const allowedOriginEnv = Deno.env.get("APP_ORIGIN")
  const isAllowed =
    (allowedOriginEnv && origin === allowedOriginEnv) ||
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000" ||
    origin.endsWith(".vercel.app") ||
    origin.endsWith("primora.sa")

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : (allowedOriginEnv || "http://localhost:3000"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const authorization = req.headers.get("Authorization")

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authorization.replace(/^Bearer\s+/i, "")
    const isServiceRole = token === supabaseServiceKey

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // If not called by service_role, verify that caller is an authenticated administrator
    if (!isServiceRole) {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized access token." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (!profile || profile.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Forbidden. Administrative privileges required." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {}
    const batchSize = Number(body.batchSize) || 25

    // Invoke the secure dispatcher RPC in Postgres
    const { data, error } = await supabaseAdmin.rpc("dispatch_message_queue_batch", {
      p_batch_size: batchSize
    })

    if (error) {
      console.error("[dispatch-messages] RPC Error:", error)
      return new Response(
        JSON.stringify({ error: "Failed to dispatch message queue batch.", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        batch: data,
        message: "Message queue processed successfully."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err) {
    console.error("[dispatch-messages] Unexpected Error:", err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
