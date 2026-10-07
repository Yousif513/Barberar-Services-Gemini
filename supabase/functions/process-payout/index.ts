import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { corsHeaders as sharedCorsHeaders } from "../_shared/http.ts"

serve(async (req) => {
  const corsHeaders = sharedCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing database configuration.")
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    
    // Get user from token
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Verify user is administrator
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden. Administrative access required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    return new Response(JSON.stringify({ error: "Retired. Payout requests are reviewed and released from the Ledger screen with the database commands admin_review_payout_request and admin_release_payout, which check the ledger balance, allocate it and record who released what and why." }), {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Process payout failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
