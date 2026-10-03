import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY")
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

    // Verify caller identity and admin authority
    const token = authHeader.replace(/^Bearer\s+/i, "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

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

    const { bookingId, refundReason, idempotencyKey } = await req.json()
    if (!bookingId) {
      return new Response(JSON.stringify({ error: "Missing required bookingId parameter." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Check for idempotency replay
    if (idempotencyKey) {
      const { data: existingAudit } = await supabase
        .from("admin_audit_logs")
        .select("payload")
        .eq("action", "process_refund")
        .filter("payload->>idempotency_key", "eq", idempotencyKey)
        .maybeSingle()

      if (existingAudit?.payload) {
        return new Response(JSON.stringify({
          success: true,
          idempotent: true,
          message: "Refund already processed under this idempotency key.",
          details: existingAudit.payload
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }
    }

    // 1. Load the booking details and ledger info
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*, customer:profiles(*)")
      .eq("id", bookingId)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking details not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 2. Fetch the transaction ledger record to get payment intent
    const { data: ledgerRow, error: ledgerError } = await supabase
      .from("transactional_ledger")
      .select("*")
      .eq("booking_id", bookingId)
      .single()

    if (ledgerError || !ledgerRow) {
      return new Response(JSON.stringify({ error: "No transaction ledger record found for booking." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const paymentIntentId = ledgerRow.payment_intent_id
    if (!paymentIntentId) {
      return new Response(JSON.stringify({ error: "Missing payment intent identifier on ledger." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 3. Initiate payment gateway refund — fail closed if unconfigured or failed
    if (!tapSecretKey) {
      return new Response(JSON.stringify({ error: "Tap Payments refund integration is not configured." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const refundResponse = await fetch("https://api.tap.company/v2/refunds", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tapSecretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        charge_id: paymentIntentId,
        amount: Number(booking.total_price),
        currency: "SAR",
        reason: refundReason || "Administrative refund processed.",
        metadata: { booking_id: bookingId, processed_by: user.id }
      })
    })

    if (!refundResponse.ok) {
      const errorText = await refundResponse.text()
      console.error("[Refund Gateway] Tap API error:", errorText)
      return new Response(JSON.stringify({ 
        error: "Gateway refund request failed. Money was not debited.",
        details: errorText
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    const refundData = await refundResponse.json()
    const gatewayRefundId = refundData.id
    const refundStatus = refundData.status

    // 4. Update the booking status to cancelled
    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId)

    if (updateBookingError) throw updateBookingError;

    // 5. Update ledger entry to refunded
    const { error: updateLedgerError } = await supabase
      .from("transactional_ledger")
      .update({ payout_status: "refunded" })
      .eq("id", ledgerRow.id)

    if (updateLedgerError) throw updateLedgerError;

    // 6. Write to admin audit log
    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "process_refund",
      entity_name: "bookings",
      entity_id: bookingId,
      payload: {
        idempotency_key: idempotencyKey || null,
        booking_id: bookingId,
        refund_id: gatewayRefundId,
        refund_amount: Number(booking.total_price),
        status: refundStatus,
        reason: refundReason || "Administrative refund"
      }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      refundId: gatewayRefundId, 
      status: refundStatus,
      message: "Booking refund processed successfully."
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Process refund failure." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })
  }
})
