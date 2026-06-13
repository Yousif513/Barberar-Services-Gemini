// supabase/functions/send-otp/index.ts
// Deno Edge Function for sending WhatsApp/SMS OTP authentication codes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Missing phone number or OTP code parameters." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 1. WhatsApp OTP gateway selection (Twilio vs. Unifonic)
    const whatsappProvider = Deno.env.get("WHATSAPP_PROVIDER") || "mock"
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")
    const twilioWhatsappSender = Deno.env.get("TWILIO_WHATSAPP_SENDER") || "whatsapp:+14155238886"

    console.log(`[OTP Engine] Sending code ${code} to ${phone} using provider: ${whatsappProvider}`)

    if (whatsappProvider === "twilio" && twilioAccountSid && twilioAuthToken) {
      // Twilio WhatsApp API Request
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
      const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
      
      const formData = new URLSearchParams()
      formData.append("To", `whatsapp:${phone}`)
      formData.append("From", twilioWhatsappSender)
      formData.append("Body", `Your Beauty & Grooming login code is: ${code}. Valid for 3 minutes. / رمز الدخول الخاص بك هو: ${code}`)

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
        throw new Error("Failed to send OTP via Twilio WhatsApp Gateway.")
      }
    } else {
      // Mock / Dev fallback
      console.log(`[OTP Engine] Local testing mode active. Code: ${code}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: "OTP code transmitted successfully." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
