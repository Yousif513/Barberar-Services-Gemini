// supabase/functions/send-push/index.ts
// Deno Edge Function to send push notifications via Expo Push API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { title, body, token, data } = await req.json()

    if (!token || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: token, title, or body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
      console.warn("[Push Engine] Received token does not match Expo token pattern:", token)
    }

    // Dispatch payload to Expo Push Services
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title: title,
        body: body,
        data: data || {},
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[Push Engine] Expo API error:", errorText)
      throw new Error(`Expo service rejected notification request: ${errorText}`)
    }

    const resJson = await response.json()
    console.log("[Push Engine] Notification successfully dispatched to Expo:", JSON.stringify(resJson))

    return new Response(
      JSON.stringify({ success: true, response: resJson }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    console.error("[Push Engine] Exception occurred:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
