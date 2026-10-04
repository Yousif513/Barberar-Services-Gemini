import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"

export type RefundOutcome = {
  refundId: string
  status: "succeeded" | "failed" | "skipped"
  gatewayRefundId?: string
  error?: string
}

// Claims a refund request in the database, asks Tap to refund exactly that amount, and records
// the gateway's answer. Money moves only for a claimed request; the database ledger is updated
// in complete_refund_request inside one transaction.
export async function processRefundRequest(
  db: SupabaseClient,
  tapSecretKey: string,
  refundId: string,
): Promise<RefundOutcome> {
  const { data: claim, error: claimError } = await db.rpc("claim_refund_request", { p_refund_id: refundId })
  if (claimError) throw claimError
  if (!claim?.claimed) return { refundId, status: "skipped", error: claim?.reason }

  let gatewayRefundId: string | undefined
  let failure: string | undefined
  try {
    const response = await fetch("https://api.tap.company/v2/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tapSecretKey}`,
        "Content-Type": "application/json",
        // Tap de-duplicates retried requests carrying the same key.
        "Idempotency-Key": claim.idempotency_key,
      },
      body: JSON.stringify({
        charge_id: claim.payment_intent_id,
        amount: Number(claim.amount),
        currency: "SAR",
        reason: String(claim.reason || "requested_by_customer").slice(0, 255),
        metadata: { refund_request_id: refundId, booking_id: claim.booking_id },
      }),
    })
    const body = await response.json().catch(() => ({}))
    const status = String(body?.status || "").toUpperCase()
    if (response.ok && body?.id && ["REFUNDED", "PENDING", "IN_PROGRESS", "INITIATED"].includes(status)) {
      gatewayRefundId = body.id
    } else {
      failure = `Tap refund rejected (${response.status}): ${JSON.stringify(body?.errors ?? body).slice(0, 500)}`
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "Refund request failed"
  }

  const { error: completeError } = await db.rpc("complete_refund_request", {
    p_refund_id: refundId,
    p_succeeded: !failure,
    p_gateway_refund_id: gatewayRefundId ?? null,
    p_error: failure ?? null,
  })
  if (completeError) throw completeError

  return failure
    ? { refundId, status: "failed", error: failure }
    : { refundId, status: "succeeded", gatewayRefundId }
}
