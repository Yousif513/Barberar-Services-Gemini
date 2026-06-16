import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)

  try {
    const payload = await req.json()
    const chargeId = payload.id
    if (!chargeId || typeof chargeId !== "string") {
      return json({ received: true, status: "skipped" })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY")
    if (!supabaseUrl || !serviceKey || !tapSecretKey) {
      throw new Error("Payment webhook environment is incomplete.")
    }

    // The callback is public, so trust only charge data retrieved from Tap.
    const chargeResponse = await fetch(
      `https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`,
      { headers: { Authorization: `Bearer ${tapSecretKey}` } },
    )
    if (!chargeResponse.ok) {
      console.error("[Payment Webhook] Unable to verify charge:", await chargeResponse.text())
      return json({ error: "Unable to verify charge." }, 502)
    }

    const charge = await chargeResponse.json()
    const bookingId = charge.metadata?.booking_id
    const status = String(charge.status || "").toUpperCase()
    const currency = String(charge.currency || "").toUpperCase()
    const capturedAmount = Number(charge.amount)

    if (
      charge.id !== chargeId ||
      !bookingId ||
      status !== "CAPTURED" ||
      currency !== "SAR" ||
      !Number.isFinite(capturedAmount)
    ) {
      return json({ received: true, status: "skipped" })
    }

    const supabase = createClient(supabaseUrl, serviceKey)
    const { error } = await supabase.rpc("confirm_booking_payment", {
      target_booking_id: bookingId,
      target_payment_intent_id: chargeId,
      target_total_captured: capturedAmount,
    })

    if (error) throw error
    return json({ success: true })
  } catch (error) {
    console.error("[Payment Webhook] Failure:", error)
    return json({ error: error instanceof Error ? error.message : "Unexpected webhook error." }, 500)
  }
})
