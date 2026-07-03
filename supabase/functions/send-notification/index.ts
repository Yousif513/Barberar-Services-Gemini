import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing database configuration.")
    }

    const { userId, title, body, data } = await req.json()
    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required parameters: userId, title, or body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // 1. Fetch user's registered expo push tokens
    const { data: tokenRows, error: tokenError } = await supabase
      .from("expo_push_tokens")
      .select("token")
      .eq("user_id", userId)

    if (tokenError) {
      console.warn("[Send Notification] Failed to fetch push tokens:", tokenError)
    }

    const tokens = (tokenRows || []).map(r => r.token);

    // 2. Insert notification record into notifications database table
    const { error: notifInsertError } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        title,
        body,
        data: data || {},
        is_read: false
      })

    if (notifInsertError) {
      console.warn("[Send Notification] Database insert failed:", notifInsertError)
    }

    // 3. Dispatch to Expo Push API for each token
    const results = []
    for (const token of tokens) {
      try {
        const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: token,
            sound: "default",
            title,
            body,
            data: data || {},
          }),
        })
        if (expoRes.ok) {
          results.push({ token, success: true })
        } else {
          results.push({ token, success: false, error: await expoRes.text() })
        }
      } catch (err) {
        results.push({ token, success: false, error: err instanceof Error ? err.message : "Dispatch exception" })
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sentCount: results.filter(r => r.success).length,
      tokensProcessed: tokens.length,
      details: results
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Send notification failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
