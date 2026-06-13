// supabase/functions/payment-webhook/index.ts
// Deno Edge Function to handle payment gateway webhooks and split payout ledgering

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

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
    const payload = await req.json()
    console.log("[Webhook Engine] Received payload from payment gateway:", JSON.stringify(payload))

    // Parse charge parameters depending on gateway response formats (Tap / Moyasar)
    const chargeId = payload.id
    const status = payload.status // e.g. "CAPTURED" or "paid"
    const bookingId = payload.metadata?.booking_id

    if (!bookingId || status !== "CAPTURED") {
      console.log("[Webhook Engine] Transaction not captured or missing booking metadata. Skipping.")
      return new Response(JSON.stringify({ received: true, status: "skipped" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Initialize Supabase Client with service key
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Update booking status to 'confirmed'
    const { data: booking, error: updateError } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId)
      .select(`
        total_price,
        deposit_required,
        platform_commission,
        customer_id,
        profiles (phone_number, first_name)
      `)
      .single()

    if (updateError || !booking) {
      throw new Error(`Failed to update booking status: ${updateError?.message}`)
    }

    const customer = booking.profiles as any
    const totalCaptured = parseFloat(booking.deposit_required)
    const commissionVal = parseFloat(booking.platform_commission)
    const providerShare = totalCaptured - commissionVal

    // 2. Insert Split Transaction record into Ledger
    const { error: ledgerError } = await supabase
      .from("transactional_ledger")
      .insert({
        booking_id: bookingId,
        payment_intent_id: chargeId,
        total_captured: totalCaptured,
        platform_share: commissionVal,
        provider_share: providerShare,
        payout_status: "pending"
      })

    if (ledgerError) {
      console.error("[Webhook Engine] Failed to record ledger splits:", ledgerError.message)
    }

    // 3. Trigger WhatsApp Confirmation alert (calls send-otp function with message content)
    const functionUrl = `${supabaseUrl}/functions/v1/send-otp`
    try {
      await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({
          phone: customer.phone_number,
          code: `CONFIRMED - ${bookingId.substring(0,8)}` // Simulate booking confirm alert code
        })
      })
    } catch (msgError) {
      console.warn("[Webhook Engine] WhatsApp dispatch notification failed:", msgError)
    }

    return new Response(
      JSON.stringify({ success: true, ledgerCreated: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    console.error("[Webhook Engine] Error processing webhook:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
