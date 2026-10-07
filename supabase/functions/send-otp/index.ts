// supabase/functions/send-otp/index.ts
// Deno Edge Function for sending WhatsApp/SMS OTP authentication codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders as sharedCorsHeaders } from "../_shared/http.ts"

serve(async (req) => {
  const corsHeaders = sharedCorsHeaders(req)

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const authorization = req.headers.get("Authorization")
    if (!serviceKey || authorization !== `Bearer ${serviceKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { phone, code } = await req.json()

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Missing phone number or OTP code parameters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. WhatsApp OTP gateway selection (Twilio vs. Unifonic)
    const whatsappProvider = Deno.env.get("WHATSAPP_PROVIDER")
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")
    // Sender, brand and validity come from the environment only: there is no fallback sender number or brand name.
    const twilioWhatsappSender = Deno.env.get("TWILIO_WHATSAPP_SENDER")
    const brand = Deno.env.get("OTP_BRAND_NAME")
    const validMinutes = Number(Deno.env.get("OTP_VALID_MINUTES"))
    if (!twilioWhatsappSender || !brand || !Number.isInteger(validMinutes) || validMinutes < 1) {
      return new Response(
        JSON.stringify({ error: "OTP sender, brand or validity is not configured on this environment." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (whatsappProvider === "twilio" && twilioAccountSid && twilioAuthToken) {
      // Twilio WhatsApp API Request
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
      const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
      
      const formData = new URLSearchParams()
      formData.append("To", `whatsapp:${phone}`)
      formData.append("From", twilioWhatsappSender)
      formData.append("Body", `Your ${brand} login code is: ${code}. Valid for ${validMinutes} minutes. / رمز الدخول إلى ${brand}: ${code}. صالح لمدة ${validMinutes} دقيقة.`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: formData.toString()
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error("[OTP Engine] Twilio API Error:", errText)
        return new Response(
          JSON.stringify({ error: "Failed to send OTP via Twilio WhatsApp Gateway.", details: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    } else {
      return new Response(
        JSON.stringify({ error: "WhatsApp provider gateway is not configured on this environment." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "OTP code transmitted successfully."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected OTP error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
