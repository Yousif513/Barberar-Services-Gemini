import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.1"
import { classifyRefundCreation, type RefundCreationOutcome } from "./tap-refund-status.ts"

export type RefundOutcome = {
  refundId: string
  status: "succeeded" | "failed" | "skipped" | "unknown"
  gatewayRefundId?: string
  error?: string
}

// How long one refund request to Tap may take before its outcome is treated as unknown.
const TAP_TIMEOUT_MS = 20_000

// Claims a refund request in the database, asks Tap to refund exactly that amount, and records
// the gateway's answer. Money moves only for a claimed request; the database ledger is updated
// in complete_refund_request inside one transaction.
// QA item 4: an answer that does not prove what happened (timeout, dropped connection, 5xx, no refund id) is recorded as
// 'unknown' with record_refund_outcome_unknown, and an unknown refund is never claimed or sent again; Check with Tap or an
// approved decision settles it.
export async function processRefundRequest(
  db: SupabaseClient,
  tapSecretKey: string,
  refundId: string,
): Promise<RefundOutcome> {
  const { data: claim, error: claimError } = await db.rpc("claim_refund_request", { p_refund_id: refundId })
  if (claimError) throw claimError
  if (!claim?.claimed) return { refundId, status: "skipped", error: claim?.reason }

  let outcome: RefundCreationOutcome
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
      signal: AbortSignal.timeout(TAP_TIMEOUT_MS),
    })
    const body = await response.json().catch(() => undefined)
    outcome = classifyRefundCreation({ httpStatus: response.status, body })
  } catch (error) {
    outcome = classifyRefundCreation({ thrown: error })
  }

  if (outcome.kind === "unknown") {
    const { error: unknownError } = await db.rpc("record_refund_outcome_unknown", {
      p_refund_id: refundId,
      p_detail: outcome.detail,
      p_gateway_refund_id: outcome.gatewayRefundId,
      p_tap_status: outcome.gatewayStatus,
    })
    if (unknownError) throw unknownError
    return { refundId, status: "unknown", gatewayRefundId: outcome.gatewayRefundId ?? undefined, error: outcome.detail }
  }

  const { error: completeError } = await db.rpc("complete_refund_request", {
    p_refund_id: refundId,
    p_succeeded: outcome.kind === "accepted",
    p_gateway_refund_id: outcome.kind === "accepted" ? outcome.gatewayRefundId : null,
    p_error: outcome.kind === "refused" ? outcome.detail : null,
  })
  if (completeError) {
    // Tap made the refund but the ledger could not record it: the row stays out of the queue as unknown, with Tap's refund id,
    // so Check with Tap can complete it instead of a retry sending it twice.
    if (outcome.kind === "accepted") {
      await db.rpc("record_refund_outcome_unknown", {
        p_refund_id: refundId,
        p_detail: `Tap made refund ${outcome.gatewayRefundId} but it could not be recorded: ${completeError.message}`.slice(0, 900),
        p_gateway_refund_id: outcome.gatewayRefundId,
        p_tap_status: outcome.gatewayStatus,
      })
    }
    throw completeError
  }
  if (outcome.kind === "accepted") {
    // D-Q9: Tap's own status is kept; a refund still PENDING at Tap is tracked until it succeeds ("Check with Tap").
    const { error: statusError } = await db.rpc("record_refund_gateway_status", {
      p_refund_id: refundId,
      p_tap_status: outcome.gatewayStatus,
      p_tap_amount: outcome.amount,
    })
    if (statusError) throw statusError
    return { refundId, status: "succeeded", gatewayRefundId: outcome.gatewayRefundId }
  }
  return { refundId, status: "failed", error: outcome.detail }
}
