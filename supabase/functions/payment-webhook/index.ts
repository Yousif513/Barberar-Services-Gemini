import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { processRefundRequest } from "../_shared/refunds.ts"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

// Tap calls this endpoint without a Supabase JWT (verify_jwt = false in config.toml). The payload
// is never trusted: the charge is re-fetched from Tap and only a CAPTURED SAR charge is recorded.
serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405)

  try {
    const payload = await req.json().catch(() => ({}))
    const chargeId = payload?.id
    if (!chargeId || typeof chargeId !== "string") return json({ received: true, status: "skipped" })

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY")
    if (!supabaseUrl || !serviceKey || !tapSecretKey) throw new Error("Payment webhook environment is incomplete.")

    const chargeResponse = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`, {
      headers: { Authorization: `Bearer ${tapSecretKey}` },
    })
    if (!chargeResponse.ok) {
      console.error("[payment-webhook] unable to verify charge", await chargeResponse.text())
      return json({ error: "Unable to verify charge." }, 502)
    }
    const charge = await chargeResponse.json()
    const status = String(charge.status || "").toUpperCase()
    const currency = String(charge.currency || "").toUpperCase()
    const amount = Number(charge.amount)
    if (charge.id !== chargeId || status !== "CAPTURED" || currency !== "SAR" || !Number.isFinite(amount)) {
      return json({ received: true, status: "skipped" })
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const purchaseType = String(charge.metadata?.purchase_type || "booking")

    if (purchaseType !== "booking") {
      const purchaseId = charge.metadata?.purchase_id
      if (!purchaseId) return json({ received: true, status: "skipped" })
      // A membership has its own confirmation (idempotent on the charge id, amount-checked against the sold price).
      const { data, error } = purchaseType === "membership"
        ? await db.rpc("confirm_membership_payment", {
            p_membership_id: purchaseId,
            p_payment_intent_id: chargeId,
            p_amount: amount,
          })
        : await db.rpc("confirm_purchase_payment", {
            p_purchase_type: purchaseType,
            p_purchase_id: purchaseId,
            p_payment_intent_id: chargeId,
            p_amount: amount,
          })
      if (error) throw error
      return json({ success: true, result: data })
    }

    const bookingId = charge.metadata?.booking_id
    if (!bookingId) return json({ received: true, status: "skipped" })

    const { data: result, error } = await db.rpc("confirm_booking_payment", {
      target_booking_id: bookingId,
      target_payment_intent_id: chargeId,
      target_total_captured: amount,
    })
    if (error) throw error

    // Late payment for a released slot: the database recorded the capture and a refund request.
    if (result?.conflict && result?.refund_request_id) {
      const outcome = await processRefundRequest(db, tapSecretKey, result.refund_request_id)
      return json({ received: true, status: "refund_for_conflict", booking_id: bookingId, refund: outcome })
    }
    return json({ success: true, result })
  } catch (error) {
    console.error("[payment-webhook] failure", error)
    return json({ error: error instanceof Error ? error.message : "Unexpected webhook error." }, 500)
  }
})
