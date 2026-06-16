import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

const allowedOrigin = Deno.env.get("APP_ORIGIN") || "http://localhost:3000"
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)

  try {
    const authorization = req.headers.get("Authorization")
    if (!authorization) return json({ error: "Authentication required." }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Supabase function environment is incomplete.")
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Invalid session." }, 401)

    const { bookingId } = await req.json()
    if (!bookingId) return json({ error: "Missing bookingId parameter." }, 400)

    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("id, customer_id, total_price, deposit_required, status, profiles!bookings_customer_id_fkey(email, phone_number, first_name, last_name)")
      .eq("id", bookingId)
      .eq("customer_id", user.id)
      .single()

    if (bookingError || !booking) return json({ error: "Booking not found." }, 404)
    if (booking.status !== "pending_payment") {
      return json({ error: "Booking is not awaiting payment." }, 409)
    }

    const apiKey = Deno.env.get("TAP_SECRET_KEY")
    if (!apiKey) {
      return json({ error: "Payment gateway is not configured." }, 503)
    }

    const customer = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles
    const appUrl = Deno.env.get("APP_URL") || allowedOrigin
    const webhookUrl =
      Deno.env.get("PAYMENT_WEBHOOK_URL") || `${supabaseUrl}/functions/v1/payment-webhook`
    const gatewayResponse = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(booking.deposit_required),
        currency: "SAR",
        threeDSecure: true,
        save_card: false,
        description: `Booking deposit for ${booking.id}`,
        metadata: { booking_id: booking.id },
        customer: {
          first_name: customer?.first_name || "Guest",
          last_name: customer?.last_name || "User",
          email: customer?.email || "guest@primora.sa",
          phone: {
            country_code: "966",
            number: customer?.phone_number?.replace("+966", "") || "",
          },
        },
        source: { id: "src_all" },
        post: { url: webhookUrl },
        redirect: { url: `${appUrl}/customer/bookings?payment=${booking.id}` },
      }),
    })

    if (!gatewayResponse.ok) {
      console.error("[Checkout] Gateway rejected request:", await gatewayResponse.text())
      return json({ error: "Unable to initialize payment." }, 502)
    }

    const charge = await gatewayResponse.json()
    if (!charge?.id || !charge?.transaction?.url) {
      throw new Error("Payment gateway returned an invalid response.")
    }

    return json({ success: true, checkoutUrl: charge.transaction.url, chargeId: charge.id })
  } catch (error) {
    console.error("[Checkout] Failure:", error)
    return json({ error: error instanceof Error ? error.message : "Unexpected checkout error." }, 500)
  }
})
