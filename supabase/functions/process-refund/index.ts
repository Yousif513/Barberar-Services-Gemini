import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, json, MissingConfigError, resolveCaller, serviceClient, adminSessionAllows, bearerToken } from "../_shared/http.ts"
import { processRefundRequest } from "../_shared/refunds.ts"

// Processes refund requests recorded by the database (cancellations, no-show remainders,
// disputes, admin refunds, late-payment conflicts). It never refunds an arbitrary booking:
// money moves only for a refund_requests row, for exactly its amount.
//
//   { "refundRequestId": "<uuid>" }   admin or scheduler: process one request
//   { "processPending": true }         scheduler (service key) only: process the pending queue
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405)

  try {
    const caller = await resolveCaller(req)
    if (!caller) return json(req, { error: "Authentication required." }, 401)
    if (caller.kind === "user") return json(req, { error: "Administrative access required." }, 403)
    // D-Q5: operations and analyst hold no money permission.
    if (caller.kind === "admin" && !(await adminSessionAllows(bearerToken(req), "money.refund"))) {
      return json(req, { error: "Your console role cannot process refunds." }, 403)
    }

    const tapSecretKey = Deno.env.get("TAP_SECRET_KEY")
    if (!tapSecretKey) return json(req, { error: "Tap refunds are not configured (TAP_SECRET_KEY)." }, 503)

    const body = await req.json().catch(() => ({}))
    const db = serviceClient()

    if (body?.processPending === true) {
      if (caller.kind !== "service") return json(req, { error: "Only the scheduler can process the queue." }, 403)
      const { data: pending, error } = await db
        .from("refund_requests")
        .select("id")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .order("created_at", { ascending: true })
        .limit(20)
      if (error) throw error
      const results = []
      for (const row of pending ?? []) results.push(await processRefundRequest(db, tapSecretKey, row.id))
      return json(req, { processed: results.length, results })
    }

    const refundRequestId = typeof body?.refundRequestId === "string" ? body.refundRequestId : null
    if (!refundRequestId) return json(req, { error: "refundRequestId is required." }, 400)

    const outcome = await processRefundRequest(db, tapSecretKey, refundRequestId)
    const status = outcome.status === "succeeded" ? 200 : outcome.status === "skipped" ? 409 : 502
    return json(req, outcome, status)
  } catch (error) {
    if (error instanceof MissingConfigError) return json(req, { error: error.message }, 503)
    console.error("[process-refund] failure", error)
    return json(req, { error: error instanceof Error ? error.message : "Unexpected refund error." }, 500)
  }
})
