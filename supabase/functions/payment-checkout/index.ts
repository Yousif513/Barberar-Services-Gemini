// supabase/functions/payment-checkout/index.ts
// Deno Edge Function to initialize checkout sessions via Tap Payments / Moyasar

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
    const { bookingId } = await req.json()

    if (!bookingId) {
      return new Response(
        JSON.stringify({ error: "Missing bookingId parameter." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Initialize Supabase Client with service key to bypass RLS policies for transactional fetch
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch booking details
    const { data: booking, error: dbError } = await supabase
      .from("bookings")
      .select(`
        total_price,
        deposit_required,
        profiles (email, phone_number, first_name, last_name)
      `)
      .eq("id", bookingId)
      .single()

    if (dbError || !booking) {
      throw new Error(`Failed to retrieve booking info: ${dbError?.message || 'Not found'}`)
    }

    const customer = booking.profiles as any
    const paymentGatewayUrl = "https://api.tap.company/v2/charges"
    const apiKey = Deno.env.get("TAP_SECRET_KEY")

    let checkoutUrl = `http://localhost:3000/provider/dashboard` // Fallback URL
    let chargeId = `chg_mock_${Math.random().toString(36).substring(7)}`

    if (apiKey) {
      // Create Tap Payment session
      const response = await fetch(paymentGatewayUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: parseFloat(booking.deposit_required),
          currency: "SAR",
          threeDSecure: true,
          save_card: false,
          description: `Booking deposit for Booking Ref: ${bookingId}`,
          metadata: {
            booking_id: bookingId
          },
          customer: {
            first_name: customer.first_name || "Guest",
            last_name: customer.last_name || "User",
            email: customer.email || "guest@beautygrooming.com",
            phone: {
              country_code: "966",
              number: customer.phone_number.replace("+966", "")
            }
          },
          source: {
            id: "src_all" // Supports Mada, Apple Pay, Visa, MC
          },
          redirect: {
            url: `http://localhost:3000/booking/status?id=${bookingId}`
          }
        })
      })

      if (response.ok) {
        const data = await response.json()
        checkoutUrl = data.transaction.url
        chargeId = data.id
      } else {
        const errText = await response.text()
        console.error("[Checkout Engine] Gateway error:", errText)
        throw new Error("Failed to create transaction charge with payment gateway.")
      }
    }

    if (!apiKey) {
      // Simulate live webhook payment capture for local testing:
      // Update booking to confirmed status
      await supabase
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", bookingId);

      const totalCaptured = parseFloat(booking.deposit_required || "0");
      const commissionVal = parseFloat(booking.platform_commission || (parseFloat(booking.total_price || "0") * 0.15).toFixed(2));
      const providerShare = totalCaptured - commissionVal;

      // Create transaction ledger record
      await supabase
        .from("transactional_ledger")
        .insert({
          booking_id: bookingId,
          payment_intent_id: chargeId,
          total_captured: totalCaptured,
          platform_share: commissionVal,
          provider_share: providerShare,
          payout_status: "pending"
        });
    } else {
      // Update booking with pending transaction ID
      await supabase
        .from("bookings")
        .update({ status: "pending_payment" })
        .eq("id", bookingId);
    }

    return new Response(
      JSON.stringify({ success: true, checkoutUrl, chargeId, simulated: !apiKey }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
